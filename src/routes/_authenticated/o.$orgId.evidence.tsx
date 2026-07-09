import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentReviewPanel, type ReviewAssignment } from "@/components/document-review-panel";
import { toast } from "sonner";
import { FileText, Sparkles, Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: DocumentsPage,
});

type Candidate = { label: string; confidence: number };

type AssignmentRow = {
  id: string;
  evidence_id: string;
  obligation_id: string;
  status: "needs_review" | "verified";
  document_type: string | null;
  purpose: string | null;
  ai_document_type: string | null;
  ai_document_type_confidence: number | null;
  ai_purpose: string | null;
  ai_purpose_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning_full: string | null;
};

type EvidenceRow = {
  id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_summary: string | null;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  primary_purpose: string | null;
  purpose_candidates: Candidate[] | null;
  created_at: string;
};

type DocView = EvidenceRow & {
  assignment: AssignmentRow | null;
  obligation: { id: string; title: string; is_required: boolean } | null;
  isInternal: boolean;
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
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);

  const documents = useQuery({
    queryKey: ["documents", orgId],
    queryFn: async () => {
      const [ev, links, obs] = await Promise.all([
        supabase.from("evidence")
          .select("id, org_id, file_name, file_path, mime_type, size_bytes, ai_summary, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, purpose_candidates, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase.from("evidence_links")
          .select("id, evidence_id, obligation_id, status, document_type, purpose, ai_document_type, ai_document_type_confidence, ai_purpose, ai_purpose_confidence, ai_summary, ai_reasoning_full")
          .eq("org_id", orgId),
        supabase.from("obligations").select("id, title, is_required").eq("org_id", orgId),
      ]);
      if (ev.error) throw new Error(ev.error.message);

      const obById = new Map<string, { id: string; title: string; is_required: boolean }>();
      for (const o of obs.data ?? []) {
        obById.set(o.id, {
          id: o.id,
          title: o.title,
          is_required: (o as { is_required?: boolean }).is_required ?? true,
        });
      }
      const assignmentByEv = new Map<string, AssignmentRow>();
      for (const l of (links.data ?? []) as unknown as AssignmentRow[]) {
        // v1: at most one assignment per evidence created through the upload flow.
        if (!assignmentByEv.has(l.evidence_id)) assignmentByEv.set(l.evidence_id, l);
      }

      return (ev.data ?? []).map((row) => {
        const assignment = assignmentByEv.get(row.id) ?? null;
        const obligation = assignment ? obById.get(assignment.obligation_id) ?? null : null;
        const type = (row.primary_document_type ?? "").toLowerCase();
        const isInternal =
          (obligation && !obligation.is_required) ||
          (!assignment && INTERNAL_TYPE_HINTS.some((h) => type.includes(h)));
        return { ...row, assignment, obligation, isInternal: Boolean(isInternal) } as DocView;
      });
    },
  });

  const { visible, counts } = useMemo(() => {
    const list = documents.data ?? [];
    const counts = {
      all:          list.length,
      needs_review: list.filter((d) => d.assignment?.status === "needs_review").length,
      linked:       list.filter((d) => !!d.assignment).length,
      internal:     list.filter((d) => d.isInternal).length,
      unlinked:     list.filter((d) => !d.assignment).length,
    };
    const visible = list.filter((d) => {
      if (tab === "needs_review") return d.assignment?.status === "needs_review";
      if (tab === "linked") return !!d.assignment;
      if (tab === "internal") return d.isInternal;
      if (tab === "unlinked") return !d.assignment;
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

  const openReview = (d: DocView) => {
    if (!d.assignment || !d.obligation) return;
    const a = d.assignment;
    setReviewing({
      assignment_id: a.id,
      obligation_id: d.obligation.id,
      obligation_title: d.obligation.title,
      status: a.status,
      evidence_id: d.id,
      file_name: d.file_name,
      file_path: d.file_path,
      document_type: a.document_type,
      purpose: a.purpose,
      ai_document_type: a.ai_document_type,
      ai_document_type_confidence: a.ai_document_type_confidence,
      ai_purpose: a.ai_purpose,
      ai_purpose_confidence: a.ai_purpose_confidence,
      document_type_candidates: d.document_type_candidates,
      purpose_candidates: d.purpose_candidates,
      ai_summary: a.ai_summary ?? d.ai_summary,
      ai_reasoning: a.ai_reasoning_full,
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
            {visible.map((d) => {
              const a = d.assignment;
              const lifecycle: DocLifecycle = !a
                ? "no_document"
                : a.status === "verified"
                ? "on_file"
                : "needs_review";
              const displayType = a?.document_type ?? a?.ai_document_type ?? d.primary_document_type;
              const displayPurpose = a?.purpose ?? a?.ai_purpose ?? d.primary_purpose;
              const conf =
                a?.ai_document_type_confidence ?? d.primary_document_type_confidence ?? null;

              return (
                <li key={d.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.file_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {d.mime_type ?? "?"} · {formatBytes(d.size_bytes)} ·{" "}
                            {new Date(d.created_at).toLocaleString()}
                          </p>
                        </div>
                        {a ? (
                          <DocumentStatusPill state={lifecycle} />
                        ) : (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            Unlinked
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Document type" value={displayType} />
                        <Field label="Purpose" value={displayPurpose} />
                        <Field
                          label="Confidence"
                          value={conf != null ? `${Math.round(conf * 100)}%` : null}
                        />
                      </div>

                      {d.ai_summary && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>{d.ai_summary}</span>
                        </p>
                      )}

                      {d.obligation && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">Linked to:</span>
                          <Link
                            to="/o/$orgId/obligations/$id"
                            params={{ orgId, id: d.obligation.id }}
                            className="rounded-md bg-muted px-2 py-0.5 hover:bg-muted/70 hover:underline"
                          >
                            {d.obligation.title}
                          </Link>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {a && lifecycle === "needs_review" ? (
                          <Button size="sm" onClick={() => openReview(d)}>
                            Review now
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openFile(d.file_path)}>
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
        onOpenChange={(v) => {
          if (!v) setReviewing(null);
        }}
        assignment={reviewing}
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
