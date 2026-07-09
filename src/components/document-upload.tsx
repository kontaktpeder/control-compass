import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { classifyEvidence, assessObligation, generateTasks } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  /** When set, the upload originates from a workflow requirement and auto-links. */
  hintObligationId?: string;
  context?: "workflow" | "library";
  /** "upload" = default; "replace" = swap the existing on-file document. */
  mode?: "upload" | "replace";
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
};


/**
 * Shared upload button. Handles storage upload, evidence row insert,
 * AI classification (with optional obligation hint), and cache invalidation.
 */
export function DocumentUpload({
  orgId,
  hintObligationId,
  context = "library",
  size = "default",
  variant = "outline",
  label,
  className,
}: Props) {
  const qc = useQueryClient();
  const classify = useServerFn(classifyEvidence);
  const assess = useServerFn(assessObligation);
  const regen = useServerFn(generateTasks);
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

      toast.info("Understanding document…");
      const result = await classify({
        data: {
          evidence_id: row.id,
          hint_obligation_id: hintObligationId ?? null,
          upload_context: context,
        },
      });

      const identified = result.primary_document_type ?? "Unknown document";
      if (context === "workflow" && hintObligationId) {
        toast.success(`Linked as ${identified}`);
      } else {
        toast.success(`Identified: ${identified}`);
      }

      if (result.linked_obligation_ids.length > 0) {
        await Promise.all(
          result.linked_obligation_ids.map((obId) =>
            assess({ data: { obligation_id: obId } })
          )
        );
        await regen({ data: { org_id: orgId } });
      }
      await qc.invalidateQueries();
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
        <Upload className="mr-2 h-4 w-4" />
        {uploading ? "Working…" : label ?? "Upload document"}
      </Button>
    </div>
  );
}
