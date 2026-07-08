import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, requireLovableApiKey } from "./ai-gateway.server";


const CLASSIFY_MODEL = "google/gemini-2.5-flash";
const ASSESS_MODEL = "google/gemini-2.5-flash";

// --- classifyEvidence -------------------------------------------------------

export const classifyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evidence_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: ev, error } = await supabase
      .from("evidence")
      .select("id, org_id, file_path, file_name, mime_type")
      .eq("id", data.evidence_id)
      .single();
    if (error || !ev) throw new Error(error?.message ?? "Evidence not found");

    const { data: obligations, error: oErr } = await supabase
      .from("obligations")
      .select("id, title, why, evidence_requirements, playbook_step_id")
      .eq("org_id", ev.org_id);
    if (oErr) throw new Error(oErr.message);

    // Try to download the file for vision analysis. Fall back to filename-only.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let fileBase64: string | null = null;
    try {
      const { data: file } = await supabaseAdmin.storage.from("evidence").download(ev.file_path);
      if (file) {
        const buf = Buffer.from(await file.arrayBuffer());
        // Cap for classifier at ~4 MB
        if (buf.byteLength < 4_000_000) fileBase64 = buf.toString("base64");
      }
    } catch {
      fileBase64 = null;
    }

    const provider = createLovableAiGatewayProvider(requireLovableApiKey());
    const model = provider(CLASSIFY_MODEL);

    const obligationsList = (obligations ?? [])
      .map((o) => `- ${o.id} :: ${o.title} — needs: ${(o.evidence_requirements ?? []).join(", ") || "n/a"}`)
      .join("\n");

    const promptText = [
      "You classify uploaded evidence for an organizational control system.",
      "Given the document below and a list of obligations this organization has,",
      "identify which obligations this document actually supports as evidence.",
      "Be conservative: only include obligations the document clearly relates to.",
      "",
      `Document filename: ${ev.file_name}`,
      `MIME type: ${ev.mime_type ?? "unknown"}`,
      "",
      "Available obligations (id :: title — required evidence):",
      obligationsList,
    ].join("\n");

    const isImage = (ev.mime_type ?? "").startsWith("image/");
    const isPdf = (ev.mime_type ?? "") === "application/pdf";

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string; mediaType?: string }
      | { type: "file"; data: string; mediaType: string; filename?: string }
    > = [{ type: "text", text: promptText }];

    if (fileBase64 && isImage) {
      userContent.push({ type: "image", image: `data:${ev.mime_type};base64,${fileBase64}` });
    } else if (fileBase64 && isPdf) {
      userContent.push({
        type: "file",
        data: fileBase64,
        mediaType: "application/pdf",
        filename: ev.file_name,
      });
    }

    const schema = z.object({
      summary: z.string(),
      suggested_obligation_ids: z.array(z.string()),
      reasoning: z.string(),
      confidence: z.number(),
    });
    type ClassifyResult = z.infer<typeof schema>;
    let result: ClassifyResult;
    try {
      const gen = await generateObject({
        model,
        messages: [{ role: "user", content: userContent }],
        schema,
      });
      result = gen.object;
    } catch (e) {
      const raw = NoObjectGeneratedError.isInstance(e) ? (e as { text?: string }).text : undefined;
      const parsed = tryParseJson(raw);
      result = {
        summary: parsed?.summary ?? "AI could not classify this document automatically.",
        suggested_obligation_ids: Array.isArray(parsed?.suggested_obligation_ids)
          ? parsed.suggested_obligation_ids.filter((x: unknown) => typeof x === "string")
          : [],
        reasoning: parsed?.reasoning ?? (e instanceof Error ? e.message : "Unknown error"),
        confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
      };
    }
    result.confidence = Math.max(0, Math.min(1, result.confidence));


    // Persist summary + suggested links
    await supabase
      .from("evidence")
      .update({ ai_summary: result.summary, ai_confidence: result.confidence })
      .eq("id", ev.id);

    const validIds = new Set((obligations ?? []).map((o) => o.id));
    const linkRows = result.suggested_obligation_ids
      .filter((id: string) => validIds.has(id))
      .map((obligation_id: string) => ({
        org_id: ev.org_id,
        evidence_id: ev.id,
        obligation_id,
        relevance: result.confidence,
        ai_reasoning: result.reasoning,
      }));

    if (linkRows.length > 0) {
      await supabase.from("evidence_links").upsert(linkRows, {
        onConflict: "evidence_id,obligation_id",
      });
    }

    return {
      summary: result.summary,
      confidence: result.confidence,
      linked_obligation_ids: linkRows.map((r: { obligation_id: string }) => r.obligation_id),
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
    const model = provider(ASSESS_MODEL);

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

    // Fetch all obligations + latest assessment
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

    // Existing open AI-generated tasks
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

// --- runFullPipeline (upload → classify → assess touched → regen tasks) -----

export const runEvidencePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evidence_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ev } = await supabase
      .from("evidence")
      .select("id, org_id")
      .eq("id", data.evidence_id)
      .single();
    if (!ev) throw new Error("Evidence not found");
    return { org_id: ev.org_id };
  });
