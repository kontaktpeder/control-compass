import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentReviewPanel, type ReviewEvidence } from "@/components/document-review-panel";
import { toast } from "sonner";
import { FileText, Sparkles, Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: DocumentsPage,
});

type Candidate = { label: string; confidence: number };

type LinkRow = { id: string; obligation_id: string; title: string };

type EvidenceRow = {
  id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  primary_purpose: string | null;
  primary_purpose_confidence: number | null;
  purpose_candidates: Candidate[] | null;
  review_status: string | null;
  created_at: string;
  links: LinkRow[];
};

type Tab = "all" | "needs_review" | "linked" | "internal" | "unlinked";

const INTERNAL_TYPE_HINTS = [
  "founders agreement",
  "founder agreement",
  "shareholder agreement",
  "shareholders agreement",
  "nda",
  "non-disclosure",
  "founder decision",
  "internal",
];

function DocumentsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const [tab, setTab] = useState<Tab>("all");
  const [reviewing, setReviewing] = useState<ReviewEvidence | null>(null);

  const documents = useQuery({
    queryKey: ["documents", orgId],
    queryFn: async () => {
      const [ev, links, obs] = await Promise.all([
        supabase.from("evidence")
          .select("id, org_id, file_name, file_path, mime_type, size_bytes, ai_summary, ai_reasoning, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, primary_purpose_confidence, purpose_candidates, review_status, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase.from("evidence_links").select("id, evidence_id, obligation_id").eq("org_id", orgId),
        supabase.from("obligations").select("id, title, is_required").eq("org_id", orgId),
      ]);
      if (ev.error) throw new Error(ev.error.message);

      const obTitle = new Map<string, string>();
      const obRequired = new Map<string, boolean>();
      for (const o of obs.data ?? []) {
        obTitle.set(o.id, o.title);
        obRequired.set(o.id, (o as { is_required?: boolean }).is_required ?? true);
      }
      const linksByEv = new Map<string, LinkRow[]>();
      for (const l of links.data ?? []) {
        const arr = linksByEv.get(l.evidence_id) ?? [];
        arr.push({ id: l.id, obligation_id: l.obligation_id, title: obTitle.get(l.obligation_id) ?? "Unknown" });
        linksByEv.set(l.evidence_id, arr);
      }
      return (ev.data ?? []).map((row) => {
        const rowLinks = linksByEv.get(row.id) ?? [];
        const linksToRecommended = rowLinks.some((l) => obRequired.get(l.obligation_id) === false);
        const type = (row.primary_document_type ?? "").toLowerCase();
        const isInternal =
          linksToRecommended ||
          (rowLinks.length === 0 && INTERNAL_TYPE_HINTS.some((h) => type.includes(h)));
        return { ...row, links: rowLinks, isInternal };
      }) as unknown as Array<EvidenceRow & { isInternal: boolean }>;
    },
  });

  const { visible, counts } = useMemo(() => {
    const list = documents.data ?? [];
    const counts = {
      all:          list.length,
      needs_review: list.filter((d) => (d.review_status ?? "unknown") !== "confirmed").length,
      linked:       list.filter((d) => d.links.length > 0).length,
      internal:     list.filter((d) => d.isInternal).length,
      unlinked:     list.filter((d) => d.links.length === 0).length,
    };
    const visible = list.filter((d) => {
      if (tab === "needs_review") return (d.review_status ?? "unknown") !== "confirmed";
      if (tab === "linked") return d.links.length > 0;
      if (tab === "internal") return d.isInternal;
      if (tab === "unlinked") return d.links.length === 0;
      return true;
    });
    return { visible, counts };
  }, [documents.data, tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all",          label: `All · ${counts.all}` },
    { id: "needs_review", label: `Needs review · ${counts.needs_review}` },
    { id: "linked",       label: `Linked · ${counts.linked}` },
    { id: "internal",     label: `Internal · ${counts.internal}` },
    { id: "unlinked",     label: `Unlinked · ${counts.unlinked}` },
  ];

  const openReview = (e: EvidenceRow) => {
    setReviewing({
      id: e.id,
      org_id: e.org_id,
      file_name: e.file_name,
      file_path: e.file_path,
      primary_document_type: e.primary_document_type,
      primary_document_type_confidence: e.primary_document_type_confidence,
      document_type_candidates: e.document_type_candidates,
      primary_purpose: e.primary_purpose,
      primary_purpose_confidence: e.primary_purpose_confidence,
      purpose_candidates: e.purpose_candidates,
      review_status: e.review_status,
      ai_summary: e.ai_summary,
      ai_reasoning: e.ai_reasoning,
      links: e.links.map((l) => ({ obligation_id: l.obligation_id, title: l.title })),
    });
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Documents</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The library</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every document Control Core has understood. Upload from a workflow step to link automatically,
        or drop something here for the AI to identify and file.
      </p>

      <Card className="mt-8 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Upload to the library</CardTitle>
          <CardDescription>
            PDF or image. For anything that belongs to a specific step, upload from the Workflow view instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUpload orgId={orgId} context="library" label="Upload document" />
        </CardContent>
      </Card>

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {visible.length ? (
          <ul className="space-y-3">
            {visible.map((e) => {
              const lifecycle: DocLifecycle =
                e.review_status === "confirmed" ? "on_file" : "needs_review";
              const docConf = Math.round(((e.primary_document_type_confidence ?? 0)) * 100);

              return (
                <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.file_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.mime_type ?? "?"} · {formatBytes(e.size_bytes)} · {new Date(e.created_at).toLocaleString()}
                          </p>
                        </div>
                        <DocumentStatusPill state={lifecycle} />
                      </div>

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

                      {e.links.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">Linked to:</span>
                          {e.links.map((l) => (
                            <Link
                              key={l.id}
                              to="/o/$orgId/obligations/$id"
                              params={{ orgId, id: l.obligation_id }}
                              className="rounded-md bg-muted px-2 py-0.5 hover:bg-muted/70 hover:underline"
                            >
                              {l.title}
                            </Link>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {lifecycle === "needs_review" ? (
                          <Button size="sm" onClick={() => openReview(e)}>
                            Review now
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openFile(e.file_path)}>
                            <ExternalLink className="mr-1 h-3 w-3" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        )}
      </div>

      <DocumentReviewPanel
        open={!!reviewing}
        onOpenChange={(v) => !v && setReviewing(null)}
        evidence={reviewing}
      />
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

function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
