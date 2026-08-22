import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function DocumentPreview({
  filePath,
  mimeType,
  title,
  className,
}: {
  filePath: string;
  mimeType?: string | null;
  title?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    supabase.storage
      .from("evidence")
      .createSignedUrl(filePath, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const isImage = !!mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-muted/30", className)}>
      {isImage && url ? (
        <img src={url} alt="" className="max-h-80 w-full object-contain object-top bg-white" />
      ) : isPdf && url ? (
        <iframe
          title={title ?? "Preview"}
          src={`${url}#toolbar=0&navpanes=0`}
          className="h-80 w-full border-0 bg-white"
        />
      ) : (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          {title ?? "—"}
        </div>
      )}
    </div>
  );
}
