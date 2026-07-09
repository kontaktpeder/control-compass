import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { classifyEvidence } from "@/lib/ai.functions";
import { replaceAssignmentEvidence } from "@/lib/document-assignment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  hintObligationId?: string;
  context?: "workflow" | "library";
  mode?: "upload" | "replace";
  /** Required in replace mode — the assignment whose evidence_id we swap. */
  assignmentId?: string;
  /** Called after everything (upload + classify) succeeds. Use to open the review panel. */
  onAfterUpload?: (evidenceId: string) => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
};

export function DocumentUpload({
  orgId,
  hintObligationId,
  context = "library",
  mode = "upload",
  assignmentId,
  onAfterUpload,
  size = "default",
  variant = "outline",
  label,
  className,
}: Props) {
  const qc = useQueryClient();
  const classify = useServerFn(classifyEvidence);
  const replaceEv = useServerFn(replaceAssignmentEvidence);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

      // Replace flow: swap evidence pointer on the existing assignment BEFORE
      // classify runs, so classify's AI update lands on the same assignment row.
      if (mode === "replace" && assignmentId) {
        await replaceEv({
          data: { assignment_id: assignmentId, new_evidence_id: row.id },
        });
      }

      toast.info("Understanding document…");
      await classify({
        data: {
          evidence_id: row.id,
          hint_obligation_id: hintObligationId ?? null,
          upload_context: context,
        },
      });

      toast.success(
        mode === "replace" ? "Document replaced — review the new one" : "Document uploaded"
      );

      await qc.invalidateQueries();
      onAfterUpload?.(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("inline-flex", className)}>
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
          ? "Working…"
          : label ?? (mode === "replace" ? "Replace document" : "Upload document")}
      </Button>
    </div>
  );
}
