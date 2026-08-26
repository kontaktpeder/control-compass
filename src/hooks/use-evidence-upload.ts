import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { classifyEvidence } from "@/lib/ai.functions";
import { replaceAssignmentEvidence } from "@/lib/document-assignment.functions";
import { localizeObligationTitle } from "@/lib/playbook-i18n";
import { useT } from "@/components/locale-provider";
import { toast } from "sonner";

export type UploadEvidenceOptions = {
  context?: "workflow" | "library";
  hintObligationId?: string | null;
  mode?: "upload" | "replace";
  assignmentId?: string | null;
};

/** Upload one file, classify it on its own, and return the new evidence id. */
export function useEvidenceUpload(orgId: string) {
  const qc = useQueryClient();
  const { t, locale } = useT();
  const classify = useServerFn(classifyEvidence);
  const replaceEv = useServerFn(replaceAssignmentEvidence);

  const uploadOne = async (file: File, options: UploadEvidenceOptions = {}): Promise<string> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Not signed in");

    const path = `${orgId}/${crypto.randomUUID()}-${file.name}`;
    const up = await supabase.storage.from("evidence").upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (up.error) throw new Error(up.error.message);

    const { data: row, error: insErr } = await supabase
      .from("evidence")
      .insert({
        org_id: orgId,
        uploaded_by: userData.user.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    const replaceId = options.assignmentId ?? null;
    const hintId = options.hintObligationId ?? null;

    if (options.mode === "replace" && replaceId) {
      await replaceEv({
        data: { assignment_id: replaceId, new_evidence_id: row.id },
      });
    }

    toast.info(t("upload.understanding"));
    const classified = (await classify({
      data: {
        evidence_id: row.id,
        hint_obligation_id: hintId,
        upload_context: options.context ?? "library",
      },
    })) as { linked_titles?: string[] } | undefined;

    const titles = (classified?.linked_titles ?? []).map((title) =>
      localizeObligationTitle(locale, title),
    );
    toast.success(
      titles.length ? t("upload.linkedTo", { titles: titles.join(", ") }) : t("upload.savedInAll"),
    );

    await qc.invalidateQueries();
    return row.id;
  };

  return { uploadOne };
}
