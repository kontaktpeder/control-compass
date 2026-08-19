import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { classifyEvidence } from "@/lib/ai.functions";
import { replaceAssignmentEvidence } from "@/lib/document-assignment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, RefreshCw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";

type Props = {
  orgId: string;
  hintObligationId?: string;
  hintObligationIdRef?: React.RefObject<string | null | undefined>;
  context?: "workflow" | "library";
  mode?: "upload" | "replace";
  /** Required in replace mode — the assignment whose evidence_id we swap. */
  assignmentId?: string;
  assignmentIdRef?: React.RefObject<string | null | undefined>;
  /** Called after everything (upload + classify) succeeds. Use to open the review panel. */
  onAfterUpload?: (evidenceId: string) => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost" | "secondary";
  appearance?: "button" | "tile";
  label?: string;
  className?: string;
};

export type DocumentUploadHandle = {
  pick: () => void;
};

export const DocumentUpload = forwardRef<DocumentUploadHandle, Props>(function DocumentUpload(
  {
    orgId,
    hintObligationId,
    hintObligationIdRef,
    context = "library",
    mode = "upload",
    assignmentId,
    assignmentIdRef,
    onAfterUpload,
    size = "default",
    variant = "outline",
    appearance = "button",
    label,
    className,
  },
  ref,
) {
  const qc = useQueryClient();
  const { t } = useT();
  const classify = useServerFn(classifyEvidence);
  const replaceEv = useServerFn(replaceAssignmentEvidence);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useImperativeHandle(ref, () => ({
    pick: () => inputRef.current?.click(),
  }));

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
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

      const replaceId = assignmentIdRef?.current ?? assignmentId;
      const hintId = hintObligationIdRef?.current ?? hintObligationId ?? null;

      // Replace flow: swap evidence pointer on the existing assignment BEFORE
      // classify runs, so classify's AI update lands on the same assignment row.
      if (mode === "replace" && replaceId) {
        await replaceEv({
          data: { assignment_id: replaceId, new_evidence_id: row.id },
        });
      }

      toast.info(t("upload.understanding"));
      await classify({
        data: {
          evidence_id: row.id,
          hint_obligation_id: hintId,
          upload_context: context,
        },
      });

      toast.success(
        mode === "replace" ? t("upload.replaced") : t("upload.uploaded")
      );

      await qc.invalidateQueries();
      onAfterUpload?.(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,image/*"
      className="hidden"
      disabled={uploading}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        if (inputRef.current) inputRef.current.value = "";
      }}
    />
  );

  if (appearance === "tile") {
    return (
      <div className={cn("w-36", className)}>
        {fileInput}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[3/4] w-full items-center justify-center rounded-sm border border-border bg-white shadow-sm transition hover:border-primary/40 hover:shadow-md disabled:opacity-60"
        >
          <Plus className="h-12 w-12 text-primary" strokeWidth={1.5} />
        </button>
        <p className="mt-2 truncate text-sm">
          {uploading ? t("common.working") : label ?? t("library.uploadBlank")}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex", className)}>
      {fileInput}
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {mode === "replace" ? (
          <RefreshCw className="mr-2 h-4 w-4" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {uploading
          ? t("common.working")
          : label ?? (mode === "replace" ? t("upload.replaceCta") : t("library.uploadCta"))}
      </Button>
    </div>
  );
});

DocumentUpload.displayName = "DocumentUpload";
