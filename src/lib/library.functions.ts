import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCUMENT_CATEGORY_IDS } from "@/lib/library";

export const updateDocumentMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        evidence_id: z.string().uuid(),
        category: z.enum(DOCUMENT_CATEGORY_IDS).nullable(),
        responsible_user_id: z.string().uuid().nullable(),
        review_due_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("evidence")
      .update({
        category: data.category,
        responsible_user_id: data.responsible_user_id,
        review_due_at: data.review_due_at,
      })
      .eq("id", data.evidence_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
