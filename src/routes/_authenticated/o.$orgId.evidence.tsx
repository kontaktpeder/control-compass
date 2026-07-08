import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyEvidence, generateTasks, confirmEvidenceField } from "@/lib/ai.functions";
import { toast } from "sonner";
import { Upload, FileText, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: EvidencePage,
});

type ReviewStatus = "confirmed" | "needs_review" | "unknown";
type Candidate = { label: string; confidence: number };

const REVIEW_META: Record<ReviewStatus, { label: string; tone: string }> = {
  confirmed:    { label: "Confirmed",    tone: "bg-status-satisfied-bg text-status-satisfied" },
  needs_review: { label: "Needs review", tone: "bg-status-partial-bg text-status-partial" },
  unknown:      { label: "Unknown",      tone: "bg-status-unknown-bg text-status-unknown" },
};

type EvidenceRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_summary: string | null;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  primary_purpose: string | null;
  primary_purpose_confidence: number | null;
  purpose_candidates: Candidate[] | null;
  review_status: string | null;
  created_at: string;
};

function EvidencePage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const qc = useQueryClient();
  const classify = useServerFn(classifyEvidence);
  const regen = useServerFn(generateTasks);
  const confirmField = useServerFn(confirmEvidenceField);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [openReview, setOpenReview] = useState<Record<string, boolean>>({});

  const evidence = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select("id, file_name, mime_type, size_bytes, ai_summary, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, primary_purpose_confidence, purpose_candidates, review_status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EvidenceRow[];
    },
  });

  const confirmMut = useMutation({
    mutationFn: async (args: { evidence_id: string; field: "document_type" | "purpose"; value: string }) => {
      await confirmField({ data: args });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["evidence", orgId] });
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

      toast.info("Understanding document…");
      const result = await classify({ data: { evidence_id: row.id } });
      const label = result.primary_document_type ?? "Unknown document";
      toast.success(`Identified: ${label}`);

      if (result.linked_obligation_ids.length > 0) {
        const { assessObligation } = await import("@/lib/ai.functions");
        await Promise.all(
          result.linked_obligation_ids.map((obId) => assessObligation({ data: { obligation_id: obId } }))
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Evidence</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">What proves it's done</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Upload the real documents — Articles of Association, bank confirmations, board minutes, agreements — and Control Core will identify them, understand their purpose, and connect them to the obligations they support.
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
          <ul className="space-y-3">
            {evidence.data.map((e) => {
              const review = (e.review_status as ReviewStatus) ?? "unknown";
              const meta = REVIEW_META[review] ?? REVIEW_META.unknown;
              const docConf = Math.round(((e.primary_document_type_confidence ?? 0)) * 100);
              const purConf = Math.round(((e.primary_purpose_confidence ?? 0)) * 100);
              const docCandidates = (e.document_type_candidates ?? []).filter(c => c?.label);
              const purCandidates = (e.purpose_candidates ?? []).filter(c => c?.label);
              const isOpen = !!openReview[e.id];

              return (
                <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      {/* Header: filename + status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.file_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.mime_type ?? "?"} · {formatBytes(e.size_bytes)} · {new Date(e.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
                          {meta.label}
                        </span>
                      </div>

                      {/* Clean primary fields */}
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Document type" value={e.primary_document_type} />
                        <Field label="Purpose" value={e.primary_purpose} />
                        <Field
                          label="Confidence"
                          value={e.primary_document_type_confidence != null ? `${docConf}%` : null}
                        />
                      </div>

                      {e.ai_summary && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>{e.ai_summary}</span>
                        </p>
                      )}

                      {/* Review action */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {review !== "confirmed" && e.primary_document_type && (
                          <Button
                            size="sm"
                            disabled={confirmMut.isPending}
                            onClick={() => confirmMut.mutate({ evidence_id: e.id, field: "document_type", value: e.primary_document_type! })}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Confirm as {e.primary_document_type}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpenReview((s) => ({ ...s, [e.id]: !s[e.id] }))}
                        >
                          {isOpen ? "Hide" : "Review"} suggestions
                        </Button>
                      </div>

                      {/* Review panel — only place candidates are ever shown */}
                      {isOpen && (
                        <div className="mt-3 space-y-4 rounded-md border border-border/70 bg-muted/30 p-3">
                          <CandidatePicker
                            title="Document type"
                            current={e.primary_document_type}
                            currentConfidence={docConf}
                            candidates={docCandidates}
                            disabled={confirmMut.isPending}
                            onPick={(value) => confirmMut.mutate({ evidence_id: e.id, field: "document_type", value })}
                          />
                          <CandidatePicker
                            title="Purpose"
                            current={e.primary_purpose}
                            currentConfidence={purConf}
                            candidates={purCandidates}
                            disabled={confirmMut.isPending}
                            onPick={(value) => confirmMut.mutate({ evidence_id: e.id, field: "purpose", value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function CandidatePicker({
  title,
  current,
  currentConfidence,
  candidates,
  disabled,
  onPick,
}: {
  title: string;
  current: string | null;
  currentConfidence: number;
  candidates: Candidate[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  // Show current on top, then any other candidates
  const shown: Array<Candidate & { isCurrent?: boolean }> = [];
  if (current) shown.push({ label: current, confidence: currentConfidence / 100, isCurrent: true });
  for (const c of candidates) {
    if (!current || c.label !== current) shown.push(c);
  }
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Pick the correct value or set a custom one.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {shown.slice(0, 4).map((c) => (
          <Button
            key={`${title}-${c.label}`}
            size="sm"
            variant={c.isCurrent ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onPick(c.label)}
          >
            {c.isCurrent && <Check className="mr-1 h-3 w-3" />}
            {c.label} · {Math.round((c.confidence ?? 0) * 100)}%
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const t = window.prompt(`Set ${title.toLowerCase()}:`, current ?? "");
            if (t && t.trim()) onPick(t.trim());
          }}
        >
          Set custom…
        </Button>
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
