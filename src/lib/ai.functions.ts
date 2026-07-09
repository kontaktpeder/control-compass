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

// Classification status vocabulary
export const CLASSIFICATION_STATUSES = [
  "direct_evidence",
  "supporting_evidence",
  "governance_documentation",
  "operational_documentation",
  "historical_documentation",
  "internal_knowledge",
  "needs_review",
  "no_match",
  "unknown",
] as const;

type ClassificationStatus = typeof CLASSIFICATION_STATUSES[number];

// --- classifyEvidence -------------------------------------------------------
export const classifyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      evidence_id: z.string().uuid(),
      // Optional hint: which obligation the user was working on when uploading.
      hint_obligation_id: z.string().uuid().nullish(),
      // Where the upload originated. Workflow uploads always link to the hint.
      upload_context: z.enum(["workflow", "library"]).optional().default("library"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

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

    // --- Stage 2: identify document type + purpose (with candidates) ---
    const candidate = z.object({
      label: z.string(),
      confidence: z.number(),
    });
    const identifySchema = z.object({
      document_type_candidates: z.array(candidate),
      purpose_candidates: z.array(candidate),
      summary: z.string(),
      reasoning: z.string(),
    });
    type Identify = z.infer<typeof identifySchema>;

    let identified: Identify = {
      document_type_candidates: [],
      purpose_candidates: [],
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
              "",
              "ALWAYS respond in English. Every `label` and the summary MUST be written in English,",
              "even when the source document is in another language (e.g. Norwegian \"Vedtekter\" →",
              "label \"Articles of Association\"). Do not return labels in the source language.",
              "",
              "Return 1-3 candidate document types, each as { label, confidence }.",
              "Each `label` MUST be a short human-readable English string, e.g. \"Founders' Agreement\",",
              "\"Articles of Association\", \"Board Minutes\", \"Employment Contract\",",
              "\"Insurance Policy\", \"Share Capital Confirmation\", \"HACCP Procedure\",",
              "\"NDA\", \"Invoice\", \"Receipt\". NEVER put JSON, arrays, or objects inside `label`.",
              "Order candidates from highest to lowest confidence (0-1).",
              "",
              "Also return 1-3 purpose candidates the same way: { label, confidence }.",
              "Each purpose label is a short human-readable English phrase, e.g. \"Corporate Governance\",",
              "\"Ownership\", \"Accounting\", \"Employment\", \"Insurance\", \"Food Safety\",",
              "\"Privacy\", \"Board Governance\", \"Operational Documentation\",",
              "\"Supplier Management\", \"Customer Management\", \"Investment\".",
              "",
              "Do NOT try to match against legal obligations at this stage.",
              "Also return a one-sentence plain-language English summary of the document contents.",
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
          document_type_candidates: Array.isArray(parsed.document_type_candidates) ? parsed.document_type_candidates : [],
          purpose_candidates: Array.isArray(parsed.purpose_candidates) ? parsed.purpose_candidates : [],
          summary: parsed.summary ?? identified.summary,
          reasoning: parsed.reasoning ?? (e instanceof Error ? e.message : "identification failed"),
        };
      } else {
        identified.reasoning = e instanceof Error ? e.message : "identification failed";
      }
    }

    // Sanitize candidates — filter garbage, clamp confidence, sort desc.
    const cleanCandidates = (arr: unknown): Array<{ label: string; confidence: number }> => {
      if (!Array.isArray(arr)) return [];
      const out: Array<{ label: string; confidence: number }> = [];
      for (const c of arr) {
        if (!c || typeof c !== "object") continue;
        const anyC = c as Record<string, unknown>;
        const label = typeof anyC.label === "string" ? anyC.label
          : typeof anyC.document_type === "string" ? anyC.document_type
          : typeof anyC.purpose === "string" ? anyC.purpose
          : typeof anyC.type === "string" ? anyC.type
          : null;
        if (!label || label.trim().startsWith("[") || label.trim().startsWith("{")) continue;
        const conf = typeof anyC.confidence === "number" ? anyC.confidence : 0;
        out.push({ label: label.trim(), confidence: Math.max(0, Math.min(1, conf)) });
      }
      return out.sort((a, b) => b.confidence - a.confidence);
    };

    const docCandidates = cleanCandidates(identified.document_type_candidates);
    const purposeCandidates = cleanCandidates(identified.purpose_candidates);

    const primaryDoc = docCandidates[0] ?? null;
    const primaryPurpose = purposeCandidates[0] ?? null;

    // --- Stage 3: find related obligations ---
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

    if ((obligations ?? []).length > 0 && primaryDoc) {
      try {
        const gen = await generateObject({
          model,
          schema: matchSchema,
          prompt: [
            "A document has been identified as follows:",
            `Type: ${primaryDoc.label}`,
            `Purpose: ${primaryPurpose?.label ?? "unknown"}`,
            `Summary: ${identified.summary}`,
            "",
            "Given the organization's known obligations below, decide the relationship:",
            "- direct_evidence: clearly and sufficiently satisfies one or more obligations.",
            "- supporting_evidence: strengthens an obligation but not sufficient alone.",
            "- governance_documentation: internal governance value only.",
            "- operational_documentation: supports day-to-day operations.",
            "- historical_documentation: stored for traceability.",
            "- internal_knowledge: valuable to the org, no obligation link.",
            "- no_match: understood, but does not relate to any listed obligation.",
            "- needs_review: not confident — human should confirm.",
            "",
            "Return supported_obligation_ids as exact ids (may be empty). Never invent an id.",
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
    } else if (!primaryDoc) {
      matched.relationship = "needs_review";
      matched.reasoning = "Document type could not be identified.";
    } else {
      matched = {
        supported_obligation_ids: [],
        relationship: "internal_knowledge",
        reasoning: "No obligations defined for this organization yet.",
      };
    }

    const validIds = new Set((obligations ?? []).map((o) => o.id));
    const linkedIds = matched.supported_obligation_ids.filter((id) => validIds.has(id));

    // Classification status (used for the relationship badge on the card)
    let classification_status: ClassificationStatus = matched.relationship;
    if (linkedIds.length === 0 && (classification_status === "direct_evidence" || classification_status === "supporting_evidence")) {
      classification_status = "needs_review";
    }
    if ((primaryDoc?.confidence ?? 0) < 0.3 && classification_status !== "no_match") {
      classification_status = "needs_review";
    }

    // Review status: needs_review unless AI is very confident on both dimensions.
    const highConfidence =
      (primaryDoc?.confidence ?? 0) >= 0.85 &&
      (primaryPurpose?.confidence ?? 0) >= 0.7;
    const review_status: "confirmed" | "needs_review" | "unknown" = !primaryDoc
      ? "unknown"
      : highConfidence
        ? "confirmed"
        : "needs_review";

    // --- Stage 4: persist AI metadata on evidence (candidates only, no product status) ---
    await supabase.from("evidence").update({
      ai_summary: identified.summary,
      ai_confidence: primaryDoc?.confidence ?? 0,
      primary_document_type: primaryDoc?.label ?? null,
      primary_document_type_confidence: primaryDoc?.confidence ?? null,
      document_type_candidates: docCandidates as unknown as any,
      primary_purpose: primaryPurpose?.label ?? null,
      primary_purpose_confidence: primaryPurpose?.confidence ?? null,
      purpose_candidates: purposeCandidates as unknown as any,
      // Legacy columns kept in sync but no longer read by UI.
      document_type: primaryDoc?.label ?? null,
      document_type_confidence: primaryDoc?.confidence ?? null,
      purpose: primaryPurpose?.label ?? null,
      classification_status,
      ai_alternatives: docCandidates as unknown as any,
      ai_reasoning: `${identified.reasoning}\n\nRelationship: ${matched.reasoning}`,
    } as any).eq("id", ev.id);

    // --- Stage 5: assignment updates ---------------------------------------
    // Rules:
    //  - Workflow uploads with a hint: always own the hinted obligation's
    //    assignment (create or replace the pointer + AI fields).
    //  - Library / AI-matched obligations: only CREATE assignments where the
    //    obligation has no assignment yet. Never silently replace another
    //    document a human already put on that obligation.
    //  - AI never sets status = verified.
    const hintOb =
      data.upload_context === "workflow" &&
      data.hint_obligation_id &&
      validIds.has(data.hint_obligation_id)
        ? data.hint_obligation_id
        : null;

    const candidateObs = new Set<string>(linkedIds);
    if (hintOb) candidateObs.add(hintOb);
    const candidateArr = Array.from(candidateObs);

    // Which of these obligations already have an assignment?
    const { data: existingLinks } = candidateArr.length
      ? await supabase
          .from("evidence_links")
          .select("id, obligation_id, evidence_id")
          .in("obligation_id", candidateArr)
      : { data: [] as Array<{ id: string; obligation_id: string; evidence_id: string }> };

    const existingByOb = new Map<string, { id: string; evidence_id: string }>();
    for (const l of existingLinks ?? []) {
      existingByOb.set(l.obligation_id, { id: l.id, evidence_id: l.evidence_id });
    }

    const aiPatch = {
      ai_document_type: primaryDoc?.label ?? null,
      ai_document_type_confidence: primaryDoc?.confidence ?? null,
      ai_purpose: primaryPurpose?.label ?? null,
      ai_purpose_confidence: primaryPurpose?.confidence ?? null,
      ai_summary: identified.summary,
      ai_reasoning_full: matched.reasoning,
      relevance: primaryDoc?.confidence ?? 0,
      ai_reasoning: matched.reasoning,
    };

    const linkedArray: string[] = [];

    for (const obId of candidateArr) {
      const existing = existingByOb.get(obId);
      const isHint = obId === hintOb;

      if (existing) {
        if (existing.evidence_id === ev.id) {
          // Same evidence already assigned — refresh AI fields, keep status.
          await supabase
            .from("evidence_links")
            .update(aiPatch as never)
            .eq("id", existing.id);
          linkedArray.push(obId);
        } else if (isHint) {
          // Workflow-driven replace: swap evidence + reset to needs_review.
          await supabase
            .from("evidence_links")
            .update({
              ...aiPatch,
              evidence_id: ev.id,
              status: "needs_review",
              verified_by: null,
              verified_at: null,
              document_type: null,
              purpose: null,
            } as never)
            .eq("id", existing.id);
          linkedArray.push(obId);
        }
        // Else: obligation already has a different document from another
        // upload — do NOT overwrite it silently. Skip.
      } else {
        const { error: insErr } = await supabase.from("evidence_links").insert({
          org_id: ev.org_id,
          evidence_id: ev.id,
          obligation_id: obId,
          status: "needs_review",
          ...aiPatch,
        } as never);
        if (!insErr) linkedArray.push(obId);
      }
    }

    return {
      primary_document_type: primaryDoc?.label ?? null,
      primary_document_type_confidence: primaryDoc?.confidence ?? null,
      primary_purpose: primaryPurpose?.label ?? null,
      primary_purpose_confidence: primaryPurpose?.confidence ?? null,
      document_type_candidates: docCandidates,
      purpose_candidates: purposeCandidates,
      classification_status,
      summary: identified.summary,
      linked_obligation_ids: linkedArray,
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

// --- confirmEvidenceField ---------------------------------------------------
// User confirms the primary document type OR the primary purpose (from a
// candidate suggestion or a free-text value). Sets review_status accordingly.
export const confirmEvidenceField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      evidence_id: z.string().uuid(),
      field: z.enum(["document_type", "purpose"]),
      value: z.string().min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const value = data.value.trim();

    const patch: Record<string, unknown> =
      data.field === "document_type"
        ? {
            primary_document_type: value,
            primary_document_type_confidence: 1,
            document_type: value,
            document_type_confidence: 1,
          }
        : {
            primary_purpose: value,
            primary_purpose_confidence: 1,
            purpose: value,
          };

    // Read current state to decide whether both dimensions are now confirmed.
    const { data: current } = await supabase
      .from("evidence")
      .select("primary_document_type, primary_document_type_confidence, primary_purpose, primary_purpose_confidence, review_status")
      .eq("id", data.evidence_id)
      .single();

    const cur = (current ?? {}) as any;
    const finalDoc = data.field === "document_type" ? value : cur.primary_document_type;
    const finalPurpose = data.field === "purpose" ? value : cur.primary_purpose;
    if (finalDoc && finalPurpose) {
      patch.review_status = "confirmed";
    }

    await supabase.from("evidence").update(patch as any).eq("id", data.evidence_id);
    return { ok: true };
  });

// Back-compat alias — old imports of confirmDocumentType still work.
export const confirmDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ evidence_id: z.string().uuid(), document_type: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("evidence").update({
      primary_document_type: data.document_type,
      primary_document_type_confidence: 1,
      document_type: data.document_type,
      document_type_confidence: 1,
      review_status: "confirmed",
    } as any).eq("id", data.evidence_id);
    return { ok: true };
  });

// --- confirmDocument --------------------------------------------------------
// One-shot confirmation: set primary document_type + purpose + review_status.
export const confirmDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      evidence_id: z.string().uuid(),
      document_type: z.string().min(1).nullish(),
      purpose: z.string().min(1).nullish(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { review_status: "confirmed" };
    if (data.document_type) {
      const v = data.document_type.trim();
      patch.primary_document_type = v;
      patch.primary_document_type_confidence = 1;
      patch.document_type = v;
      patch.document_type_confidence = 1;
    }
    if (data.purpose) {
      const v = data.purpose.trim();
      patch.primary_purpose = v;
      patch.primary_purpose_confidence = 1;
      patch.purpose = v;
    }
    await supabase.from("evidence").update(patch as any).eq("id", data.evidence_id);
    return { ok: true };
  });

// --- rejectDocument ---------------------------------------------------------
// User rejects the AI classification: reset review_status; optionally unlink.
export const rejectDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      evidence_id: z.string().uuid(),
      unlink: z.boolean().optional().default(false),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("evidence").update({
      review_status: "unknown",
    } as any).eq("id", data.evidence_id);
    if (data.unlink) {
      await supabase.from("evidence_links").delete().eq("evidence_id", data.evidence_id);
    }
    return { ok: true };
  });

