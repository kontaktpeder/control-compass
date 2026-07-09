import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Document Assignment = the relationship between a requirement (obligation)
 * and the document currently satisfying it. In v1 this lives on
 * `evidence_links` with `UNIQUE(obligation_id)`.
 *
 * Rules:
 *  - Only two statuses: `needs_review` | `verified`.
 *  - No row for an obligation = "no document".
 *  - AI may only fill suggestion fields + set `needs_review`.
 *  - Only a human Confirm may set `verified`.
 *  - Replace swaps `evidence_id`; assignment row itself never gets recreated.
 */

export const confirmAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      assignment_id: z.string().uuid(),
      document_type: z.string().min(1),
      purpose: z.string().min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("evidence_links")
      .update({
        document_type: data.document_type.trim(),
        purpose: data.purpose.trim(),
        status: "verified",
        verified_by: userId,
        verified_at: new Date().toISOString(),
      } as never)
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("evidence_links")
      .update({
        status: "needs_review",
        verified_by: null,
        verified_at: null,
      } as never)
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceAssignmentEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      assignment_id: z.string().uuid(),
      new_evidence_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("evidence_links")
      .update({
        evidence_id: data.new_evidence_id,
        status: "needs_review",
        verified_by: null,
        verified_at: null,
        // Wipe stale AI + confirmed values — classifyEvidence will refill AI.
        document_type: null,
        purpose: null,
        ai_document_type: null,
        ai_document_type_confidence: null,
        ai_purpose: null,
        ai_purpose_confidence: null,
        ai_summary: null,
        ai_reasoning_full: null,
      } as never)
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("evidence_links")
      .delete()
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
