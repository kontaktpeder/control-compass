import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCUMENT_CATEGORY_IDS, type DocumentCategory } from "@/lib/library";
import { sanitizeDisplayName } from "@/lib/file-name";

export const updateDocumentMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        evidence_id: z.string().uuid(),
        file_name: z.string().min(1).max(255).optional(),
        category: z.enum(DOCUMENT_CATEGORY_IDS).nullable().optional(),
        responsible_user_id: z.string().uuid().nullable().optional(),
        review_due_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const patch: {
      file_name?: string;
      category?: DocumentCategory | null;
      responsible_user_id?: string | null;
      review_due_at?: string | null;
    } = {};
    if (data.file_name !== undefined) patch.file_name = sanitizeDisplayName(data.file_name);
    if (data.category !== undefined) patch.category = data.category;
    if (data.responsible_user_id !== undefined) {
      patch.responsible_user_id = data.responsible_user_id;
    }
    if (data.review_due_at !== undefined) patch.review_due_at = data.review_due_at;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("evidence")
      .update(patch)
      .eq("id", data.evidence_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
