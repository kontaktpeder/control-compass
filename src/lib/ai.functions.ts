import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, requireLovableApiKey } from "./ai-gateway.server";

function tryParseJson(raw: string | undefined): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

const MODEL = "google/gemini-2.5-flash";

// Classification status vocabulary — a document always gets a meaningful role.
export const CLASSIFICATION_STATUSES = [
  "direct_evidence",           // Fully satisfies a statutory obligation
  "supporting_evidence",       // Helps prove an obligation but not sufficient alone
  "governance_documentation",  // Internal governance (founders' agreement, board policy)
  "operational_documentation", // Day-to-day operations (procedures, checklists)
  "historical_documentation",  // Stored for traceability
  "internal_knowledge",        // Useful org knowledge, no obligation link
  "needs_review",              // AI uncertain — user should confirm
  "no_match",                  // Understood, but no obligation exists for it yet
  "unknown",                   // Could not understand
] as const;

type ClassificationStatus = typeof CLASSIFICATION_STATUSES[number];

// --- classifyEvidence -------------------------------------------------------
// Pipeline stages (each independent — failure in one doesn't stop the rest):
//  1. Load file + obligations
//  2. Identify document type + purpose (+ alternatives)
//  3. Find related obligations
//  4. Persist stage results
//  5. Link evidence to obligations (if any)
export const classifyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evidence_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // --- Stage 1: load evidence + obligations ---
    const { data: ev, error } = await supabase
      .from("evidence")
      .select("id, org_id, file_path, file_name, mime_type")
      .eq("id", data.evidence_id)
      .single();
    if (error || !ev) throw new Error(error?.message ?? "Evidence not found");

    const { data: obligations } = await supabase
      .from("obligations")
      .select("id, title, why, evidence_requirements")
      .eq("org_id", ev.org_id);

    // Download file for analysis
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let fileBase64: string | null = null;
    try {
      const { data: file } = await supabaseAdmin.storage.from("evidence").download(ev.file_path);
      if (file) {
        const buf = Buffer.from(await file.arrayBuffer());
        if (buf.byteLength < 4_000_000) fileBase64 = buf.toString("base64");
      }
    } catch { /* fall through */ }

    const provider = createLovableAiGatewayProvider(requireLovableApiKey());
    const model = provider(MODEL);
    const isImage = (ev.mime_type ?? "").startsWith("image/");
    const isPdf = (ev.mime_type ?? "") === "application/pdf";

    const attach = <T,>(base: T[]): T[] => {
      const out = [...base] as any[];
      if (fileBase64 && isImage) {
        out.push({ type: "image", image: `data:${ev.mime_type};base64,${fileBase64}` });
      } else if (fileBase64 && isPdf) {
        out.push({
          type: "file", data: fileBase64,
          mediaType: "application/pdf", filename: ev.file_name,
        });
      }
      return out as T[];
    };

    // --- Stage 2: identify document type + purpose ---
    const identifySchema = z.object({
      document_type: z.string(),
      document_type_confidence: z.number(),
      purpose: z.string(),
      alternatives: z.array(z.object({
        document_type: z.string(),
        confidence: z.number(),
      })),
      summary: z.string(),
      reasoning: z.string(),
    });
    type Identify = z.infer<typeof identifySchema>;

    let identified: Identify = {
      document_type: "Unknown Document",
      document_type_confidence: 0,
      purpose: "Unknown",
      alternatives: [],
      summary: "AI could not read this document.",
      reasoning: "Identification stage did not run.",
    };

    try {
      const gen = await generateObject({
        model,
        schema: identifySchema,
        messages: [{
          role: "user",
          content: attach([{
            type: "text" as const,
            text: [
              "You are analysing an uploaded organizational document.",
              "First identify WHAT this document is (e.g. 'Founders' Agreement', 'Articles of Association',",
              "'Board Minutes', 'Employment Contract', 'Insurance Policy', 'HACCP Procedure',",
              "'Share Capital Confirmation', 'Supplier Contract', 'NDA', 'Invoice', 'Receipt', etc).",
              "Then identify WHY it exists — its purpose (e.g. 'Corporate Governance', 'Accounting',",
              "'Employment', 'Insurance', 'Food Safety', 'Privacy', 'Ownership', 'Board Governance',",
              "'Operational Documentation', 'Supplier Management', 'Customer Management', 'Investment').",
              "Do NOT try to match it to any legal obligation at this stage.",
              "Provide up to 3 plausible alternatives with confidences.",
              "Provide a one-sentence summary of the document contents.",
              "",
              `Filename: ${ev.file_name}`,
              `MIME: ${ev.mime_type ?? "unknown"}`,
            ].join("\n"),
          }]),
        }],
      });
      identified = gen.object;
    } catch (e) {
      const raw = NoObjectGeneratedError.isInstance(e) ? (e as { text?: string }).text : undefined;
      const parsed = tryParseJson(raw);
      if (parsed) {
        identified = {
          document_type: parsed.document_type ?? identified.document_type,
          document_type_confidence: typeof parsed.document_type_confidence === "number" ? parsed.document_type_confidence : 0,
          purpose: parsed.purpose ?? identified.purpose,
          alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
          summary: parsed.summary ?? identified.summary,
          reasoning: parsed.reasoning ?? (e instanceof Error ? e.message : "identification failed"),
        };
      } else {
        identified.reasoning = e instanceof Error ? e.message : "identification failed";
      }
    }
    identified.document_type_confidence = Math.max(0, Math.min(1, identified.document_type_confidence || 0));

    // --- Stage 3: find related obligations (independent — never blocks pipeline) ---
    const obligationsList = (obligations ?? [])
      .map((o) => `- ${o.id} :: ${o.title} — needs: ${(o.evidence_requirements ?? []).join(", ") || "n/a"}`)
      .join("\n");

    const matchSchema = z.object({
      supported_obligation_ids: z.array(z.string()),
      relationship: z.enum([
        "direct_evidence",
        "supporting_evidence",
        "governance_documentation",
        "operational_documentation",
        "historical_documentation",
        "internal_knowledge",
        "no_match",
        "needs_review",
      ]),
      reasoning: z.string(),
    });

    let matched: z.infer<typeof matchSchema> = {
      supported_obligation_ids: [],
      relationship: "needs_review",
      reasoning: "Matching stage did not run.",
    };

    if ((obligations ?? []).length > 0) {
      try {
        const gen = await generateObject({
          model,
          schema: matchSchema,
          prompt: [
            "A document has been identified as follows:",
            `Type: ${identified.document_type}`,
            `Purpose: ${identified.purpose}`,
            `Summary: ${identified.summary}`,
            "",
            "Given the organization's known obligations below, decide the relationship:",
            "- 'direct_evidence': this document clearly and sufficiently satisfies one or more obligations.",
            "- 'supporting_evidence': it strengthens an obligation but is not sufficient alone.",
            "- 'governance_documentation': internal governance value only (e.g. founders' agreement, board policy).",
            "- 'operational_documentation': supports day-to-day operations.",
            "- 'historical_documentation': stored for traceability.",
            "- 'internal_knowledge': valuable to the org, no obligation link.",
            "- 'no_match': understood, but does not relate to any listed obligation.",
            "- 'needs_review': you are not confident — human should confirm.",
            "",
            "Return supported_obligation_ids as the exact ids (may be empty).",
            "Never invent an id.",
            "",
            "Obligations:",
            obligationsList || "(none)",
          ].join("\n"),
        });
        matched = gen.object;
      } catch (e) {
        const raw = NoObjectGeneratedError.isInstance(e) ? (e as { text?: string }).text : undefined;
        const parsed = tryParseJson(raw);
        if (parsed) {
          matched = {
            supported_obligation_ids: Array.isArray(parsed.supported_obligation_ids)
              ? parsed.supported_obligation_ids.filter((x: unknown) => typeof x === "string") : [],
            relationship: (matchSchema.shape.relationship.options as readonly string[]).includes(parsed.relationship)
              ? parsed.relationship : "needs_review",
            reasoning: parsed.reasoning ?? (e instanceof Error ? e.message : "matching failed"),
          };
        } else {
          matched.reasoning = e instanceof Error ? e.message : "matching failed";
        }
      }
    } else {
      matched = {
        supported_obligation_ids: [],
        relationship: "internal_knowledge",
        reasoning: "No obligations defined for this organization yet.",
      };
    }

    const validIds = new Set((obligations ?? []).map((o) => o.id));
    const linkedIds = matched.supported_obligation_ids.filter((id) => validIds.has(id));

    // Derive final classification_status
    let classification_status: ClassificationStatus = matched.relationship;
    if (linkedIds.length === 0 && (classification_status === "direct_evidence" || classification_status === "supporting_evidence")) {
      // AI claimed a match but gave no valid ids — downgrade to needs_review.
      classification_status = "needs_review";
    }
    if (identified.document_type_confidence < 0.3 && classification_status !== "no_match") {
      classification_status = "needs_review";
    }

    // --- Stage 4: persist ---
    await supabase.from("evidence").update({
      ai_summary: identified.summary,
      ai_confidence: identified.document_type_confidence,
      // New knowledge-graph fields:
      document_type: identified.document_type,
      document_type_confidence: identified.document_type_confidence,
      purpose: identified.purpose,
      classification_status,
      ai_alternatives: identified.alternatives as unknown as any,
      ai_reasoning: `${identified.reasoning}\n\nRelationship: ${matched.reasoning}`,
    } as any).eq("id", ev.id);

    // --- Stage 5: link evidence (only if any valid obligation ids) ---
    if (linkedIds.length > 0) {
      const rows = linkedIds.map((obligation_id) => ({
        org_id: ev.org_id,
        evidence_id: ev.id,
        obligation_id,
        relevance: identified.document_type_confidence,
        ai_reasoning: matched.reasoning,
      }));
      await supabase.from("evidence_links").upsert(rows, {
        onConflict: "evidence_id,obligation_id",
      });
    }

    return {
      document_type: identified.document_type,
      document_type_confidence: identified.document_type_confidence,
      purpose: identified.purpose,
      alternatives: identified.alternatives,
      classification_status,
      summary: identified.summary,
      linked_obligation_ids: linkedIds,
    };
  });

// --- assessObligation -------------------------------------------------------

export const assessObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ obligation_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ob, error } = await supabase
      .from("obligations")
      .select("id, org_id, title, why, evidence_requirements")
      .eq("id", data.obligation_id)
      .single();
    if (error || !ob) throw new Error(error?.message ?? "Obligation not found");

    const { data: links } = await supabase
      .from("evidence_links")
      .select("evidence:evidence_id(id, file_name, mime_type, ai_summary)")
      .eq("obligation_id", ob.id);

    const evidenceLines =
      (links ?? [])
        .map((l) => {
          const e = l.evidence as unknown as {
            file_name: string;
            mime_type: string | null;
            ai_summary: string | null;
          } | null;
          if (!e) return null;
          return `- ${e.file_name} (${e.mime_type ?? "?"}): ${e.ai_summary ?? "no AI summary yet"}`;
        })
        .filter(Boolean)
        .join("\n") || "No evidence uploaded.";

    const provider = createLovableAiGatewayProvider(requireLovableApiKey());
    const model = provider(MODEL);

    const schema = z.object({
      status: z.enum(["satisfied", "partially_satisfied", "missing", "needs_review", "unknown"]),
      confidence: z.number(),
      reasoning: z.string(),
      missing_evidence: z.array(z.string()),
    });
    type Assessment = z.infer<typeof schema>;
    let assessment: Assessment;
    try {
      const gen = await generateObject({
        model,
        system:
          "You assess whether an organizational obligation is supported by the evidence uploaded. " +
          "Be honest and conservative. Never claim compliance. Only mark 'satisfied' if the required " +
          "evidence types are clearly present. Otherwise pick 'partially_satisfied', 'missing', " +
          "'needs_review', or 'unknown'. Provide short reasoning and a list of what's still missing.",
        prompt: [
          `Obligation: ${ob.title}`,
          `Why it exists: ${ob.why ?? "n/a"}`,
          `Required evidence: ${(ob.evidence_requirements ?? []).join("; ") || "n/a"}`,
          "",
          "Available evidence:",
          evidenceLines,
        ].join("\n"),
        schema,
      });
      assessment = gen.object;
    } catch (e) {
      const raw = NoObjectGeneratedError.isInstance(e) ? (e as { text?: string }).text : undefined;
      const parsed = tryParseJson(raw);
      const allowed = ["satisfied", "partially_satisfied", "missing", "needs_review", "unknown"] as const;
      assessment = {
        status: (allowed as readonly string[]).includes(parsed?.status)
          ? parsed.status
          : "needs_review",
        confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
        reasoning: parsed?.reasoning ?? (e instanceof Error ? e.message : "Assessment unavailable"),
        missing_evidence: Array.isArray(parsed?.missing_evidence)
          ? parsed.missing_evidence.filter((x: unknown) => typeof x === "string")
          : [],
      };
    }
    assessment.confidence = Math.max(0, Math.min(1, assessment.confidence));

    await supabase.from("assessments").insert({
      org_id: ob.org_id,
      obligation_id: ob.id,
      status: assessment.status,
      confidence: assessment.confidence,
      reasoning: assessment.reasoning,
      missing_evidence: assessment.missing_evidence,
    });

    return assessment;
  });

// --- generateTasks ----------------------------------------------------------

export const generateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: obligations } = await supabase
      .from("obligations")
      .select("id, title, evidence_requirements")
      .eq("org_id", data.org_id);

    const { data: assessments } = await supabase
      .from("assessments")
      .select("obligation_id, status, missing_evidence, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });

    const latestByOb = new Map<string, { status: string; missing_evidence: string[] | null }>();
    for (const a of assessments ?? []) {
      if (!latestByOb.has(a.obligation_id)) latestByOb.set(a.obligation_id, a);
    }

    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id, obligation_id, status")
      .eq("org_id", data.org_id)
      .eq("generated_by", "ai");
    const openByOb = new Map<string, string>();
    for (const t of existingTasks ?? []) {
      if (t.status === "open" && t.obligation_id) openByOb.set(t.obligation_id, t.id);
    }

    let created = 0;
    let closed = 0;

    for (const ob of obligations ?? []) {
      const latest = latestByOb.get(ob.id);
      const needsWork = !latest || latest.status !== "satisfied";
      const hasOpen = openByOb.has(ob.id);

      if (needsWork && !hasOpen) {
        const missing = latest?.missing_evidence?.length
          ? latest.missing_evidence.join("; ")
          : (ob.evidence_requirements ?? []).join("; ");
        await supabase.from("tasks").insert({
          org_id: data.org_id,
          obligation_id: ob.id,
          title: `Provide evidence: ${ob.title}`,
          description: missing || "Upload documentation that supports this obligation.",
          status: "open",
          generated_by: "ai",
        });
        created++;
      } else if (!needsWork && hasOpen) {
        const id = openByOb.get(ob.id)!;
        await supabase.from("tasks").update({ status: "done" }).eq("id", id);
        closed++;
      }
    }

    return { created, closed };
  });

// --- confirmDocumentType ----------------------------------------------------
// User confirms one of the AI's alternative document type suggestions.
export const confirmDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      evidence_id: z.string().uuid(),
      document_type: z.string().min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("evidence").update({
      document_type: data.document_type,
      document_type_confidence: 1,
      ai_alternatives: [] as unknown as any,
    } as any).eq("id", data.evidence_id);
    return { ok: true };
  });
