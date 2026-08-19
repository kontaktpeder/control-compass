import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";

type Props = {
  orgId: string;
  className?: string;
};

export function AgreementUpload({ orgId, className }: Props) {
  const qc = useQueryClient();
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const path = `${orgId}/agreements/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage.from("evidence").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (up.error) throw new Error(up.error.message);

      const isText =
        file.type.startsWith("text/") ||
        /\.(txt|md|rtf)$/i.test(file.name);
      const body = isText ? await file.text() : t("agreements.uploadedFile");
      const title = file.name.replace(/\.[^.]+$/, "") || file.name;

      const { error } = await supabase.from("agreements").insert({
        org_id: orgId,
        title,
        body: body.trim() || t("agreements.uploadedFile"),
        status: "draft",
        agreement_type: "other",
        source: "upload",
        created_by: userData.user.id,
        metadata: {
          file_path: path,
          mime_type: file.type || null,
          file_name: file.name,
        },
      });
      if (error) throw new Error(error.message);

      toast.success(t("agreements.uploaded"));
      await qc.invalidateQueries({ queryKey: ["agreements", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("w-36", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,text/plain,.txt,.md,.doc,.docx"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[3/4] w-full items-center justify-center rounded-sm border border-border bg-white shadow-sm transition hover:border-primary/40 hover:shadow-md disabled:opacity-60"
      >
        <Plus className="h-12 w-12 text-primary" strokeWidth={1.5} />
      </button>
      <p className="mt-2 truncate text-sm">
        {uploading ? t("common.working") : t("agreements.uploadBlank")}
      </p>
    </div>
  );
}
