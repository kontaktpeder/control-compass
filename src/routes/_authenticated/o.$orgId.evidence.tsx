import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyEvidence, generateTasks } from "@/lib/ai.functions";
import { toast } from "sonner";
import { Upload, FileText, Sparkles } from "lucide-react";
import { ConfidenceBadge } from "@/components/status";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: EvidencePage,
});

function EvidencePage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const qc = useQueryClient();
  const classify = useServerFn(classifyEvidence);
  const regen = useServerFn(generateTasks);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const evidence = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select("id, file_name, mime_type, size_bytes, ai_summary, ai_confidence, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const handleUpload = async (file: File) => {
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

      toast.info("Classifying document…");
      const result = await classify({ data: { evidence_id: row.id } });
      toast.success(`Linked to ${result.linked_obligation_ids.length} obligation(s). Regenerating tasks…`);

      // Re-assess linked obligations then regen tasks
      const { assessObligation } = await import("@/lib/ai.functions");
      const assessFn = assessObligation;
      await Promise.all(result.linked_obligation_ids.map((obId) => assessFn({ data: { obligation_id: obId } })));

      await regen({ data: { org_id: orgId } });
      await qc.invalidateQueries();
      toast.success("Assessment and tasks updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Evidence</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">What proves it's done</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Upload the real documents — Articles of Association, bank confirmations, board minutes — and Control Core will connect them to the obligations they support.
      </p>

      <Card className="mt-8 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Upload evidence</CardTitle>
          <CardDescription>PDF or image. Max ~4 MB is analysed by AI in full.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                if (fileInput.current) fileInput.current.value = "";
              }}
              disabled={uploading}
            />
            <Button variant="outline" disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" /> {uploading ? "Working…" : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Uploaded documents</h2>
        {evidence.data?.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {evidence.data.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-1 items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e.file_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.mime_type ?? "?"} · {formatBytes(e.size_bytes)} · {new Date(e.created_at).toLocaleString()}
                      </p>
                      {e.ai_summary && (
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 text-primary" />
                          <span>{e.ai_summary}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <ConfidenceBadge value={e.ai_confidence} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No evidence uploaded yet.
          </p>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
