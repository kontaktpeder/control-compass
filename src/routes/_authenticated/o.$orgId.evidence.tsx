import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyEvidence, generateTasks, confirmDocumentType } from "@/lib/ai.functions";
import { toast } from "sonner";
import { Upload, FileText, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: EvidencePage,
});

type ClassificationStatus =
  | "direct_evidence"
  | "supporting_evidence"
  | "governance_documentation"
  | "operational_documentation"
  | "historical_documentation"
  | "internal_knowledge"
  | "needs_review"
  | "no_match"
  | "unknown";

const STATUS_META: Record<ClassificationStatus, { label: string; tone: string; explain: string }> = {
  direct_evidence:            { label: "Direct legal evidence", tone: "bg-status-satisfied-bg text-status-satisfied", explain: "Satisfies a statutory obligation." },
  supporting_evidence:        { label: "Supporting evidence",  tone: "bg-status-partial-bg text-status-partial",     explain: "Strengthens an obligation but not sufficient alone." },
  governance_documentation:   { label: "Governance document",  tone: "bg-status-partial-bg text-status-partial",     explain: "Documents how the organization is governed." },
  operational_documentation:  { label: "Operational document", tone: "bg-status-partial-bg text-status-partial",     explain: "Supports day-to-day operations." },
  historical_documentation:   { label: "Historical record",    tone: "bg-status-unknown-bg text-status-unknown",     explain: "Stored for traceability." },
  internal_knowledge:         { label: "Internal knowledge",   tone: "bg-status-unknown-bg text-status-unknown",     explain: "Valuable to the organization; no obligation link." },
  needs_review:               { label: "Needs review",         tone: "bg-status-partial-bg text-status-partial",     explain: "AI is uncertain — confirm below." },
  no_match:                   { label: "No matching obligation", tone: "bg-status-unknown-bg text-status-unknown",  explain: "Understood, but not tied to any known obligation." },
  unknown:                    { label: "Unknown",              tone: "bg-status-unknown-bg text-status-unknown",     explain: "Could not understand this document." },
};

type EvidenceRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_summary: string | null;
  ai_confidence: number | null;
  document_type: string | null;
  document_type_confidence: number | null;
  purpose: string | null;
  classification_status: string | null;
  ai_alternatives: Array<{ document_type: string; confidence: number }> | null;
  ai_reasoning: string | null;
  created_at: string;
};

function EvidencePage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const qc = useQueryClient();
  const classify = useServerFn(classifyEvidence);
  const regen = useServerFn(generateTasks);
  const confirmType = useServerFn(confirmDocumentType);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const evidence = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select("id, file_name, mime_type, size_bytes, ai_summary, ai_confidence, document_type, document_type_confidence, purpose, classification_status, ai_alternatives, ai_reasoning, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EvidenceRow[];
    },
  });

  const confirmMut = useMutation({
    mutationFn: async (args: { evidence_id: string; document_type: string }) => {
      await confirmType({ data: args });
    },
    onSuccess: () => {
      toast.success("Document type confirmed");
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
      const meta = STATUS_META[(result.classification_status as ClassificationStatus) ?? "unknown"];
      toast.success(`${result.document_type} — ${meta.label}`);

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
              const status = (e.classification_status as ClassificationStatus) ?? "unknown";
              const meta = STATUS_META[status] ?? STATUS_META.unknown;
              const typeConf = Math.round(((e.document_type_confidence ?? 0)) * 100);
              const alts = (e.ai_alternatives ?? []).filter(a => a.document_type && a.document_type !== e.document_type);
              // Always give the user a clear way to review/confirm, not only when AI flagged uncertainty.
              const showAlts = alts.length > 0 || status === "needs_review" || status === "unknown";
              return (
                <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-medium">{e.file_name}</p>
                        <span className="text-xs text-muted-foreground">
                          {e.mime_type ?? "?"} · {formatBytes(e.size_bytes)} · {new Date(e.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Document identity */}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Document type</p>
                          <p className="mt-0.5 text-sm font-medium">
                            {e.document_type ?? "Not identified"}
                            {e.document_type_confidence != null && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {typeConf}% confidence
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Purpose</p>
                          <p className="mt-0.5 text-sm font-medium">{e.purpose ?? "—"}</p>
                        </div>
                      </div>

                      {/* Relationship / classification status */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{meta.explain}</span>
                      </div>

                      {e.ai_summary && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>{e.ai_summary}</span>
                        </p>
                      )}

                      {/* AI review — always visible so the user has a clear way to confirm/correct */}
                      {showAlts && (
                        <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3">
                          <p className="text-xs font-medium text-foreground">
                            Review this document
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Confirm the AI's guess, pick an alternative, or set your own.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {e.document_type && !e.document_type.startsWith("[") && (
                              <Button
                                size="sm"
                                disabled={confirmMut.isPending}
                                onClick={() => confirmMut.mutate({ evidence_id: e.id, document_type: e.document_type! })}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                Confirm: {e.document_type} ({typeConf}%)
                              </Button>
                            )}
                            {alts.slice(0, 3).map((a) => (
                              <Button
                                key={a.document_type}
                                size="sm"
                                variant="outline"
                                disabled={confirmMut.isPending}
                                onClick={() => confirmMut.mutate({ evidence_id: e.id, document_type: a.document_type })}
                              >
                                {a.document_type} ({Math.round((a.confidence ?? 0) * 100)}%)
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={confirmMut.isPending}
                              onClick={() => {
                                const t = window.prompt("What type of document is this?", e.document_type ?? "");
                                if (t && t.trim()) confirmMut.mutate({ evidence_id: e.id, document_type: t.trim() });
                              }}
                            >
                              Set custom type…
                            </Button>
                          </div>
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

function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
