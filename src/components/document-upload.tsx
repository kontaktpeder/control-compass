import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useEvidenceUpload } from "@/hooks/use-evidence-upload";
import { EVIDENCE_FILE_ACCEPT } from "@/lib/evidence-files";
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
  const { t } = useT();
  const { uploadOne } = useEvidenceUpload(orgId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useImperativeHandle(ref, () => ({
    pick: () => inputRef.current?.click(),
  }));

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const id = await uploadOne(file, {
        context,
        hintObligationId: hintObligationIdRef?.current ?? hintObligationId ?? null,
        mode,
        assignmentId: assignmentIdRef?.current ?? assignmentId ?? null,
      });
      onAfterUpload?.(id);
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
      accept={EVIDENCE_FILE_ACCEPT}
      className="hidden"
      disabled={uploading}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handleFile(f);
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
          {uploading ? t("common.working") : (label ?? t("library.uploadBlank"))}
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
          : (label ?? (mode === "replace" ? t("upload.replaceCta") : t("library.uploadCta")))}
      </Button>
    </div>
  );
});

DocumentUpload.displayName = "DocumentUpload";
