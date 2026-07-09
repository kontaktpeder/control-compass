import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentReviewPanel, type ReviewAssignment } from "@/components/document-review-panel";
import { toast } from "sonner";
import { FileText, ChevronRight, ExternalLink, ExternalLink as LinkIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/workflows")({
  component: RegisterCompanyPage,
});

type EvidenceLite = {
  id: string;
  file_name: string;
  file_path: string;
  document_type_candidates: Array<{ label: string; confidence: number }> | null;
  purpose_candidates: Array<{ label: string; confidence: number }> | null;
};

type Assignment = {
  id: string;
  obligation_id: string;
  evidence_id: string;
  status: "needs_review" | "verified" | "rejected";
  document_type: string | null;
  purpose: string | null;
  ai_document_type: string | null;
  ai_document_type_confidence: number | null;
  ai_purpose: string | null;
  ai_purpose_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning_full: string | null;
  evidence: EvidenceLite | null;
};

type ObligationRow = {
  id: string;
  title: string;
  why: string | null;
  evidence_requirements: string[] | null;
  responsible: string | null;
  is_required: boolean | null;
  source: { authority: string | null; reference: string | null; url: string | null } | null;
};

function toReview(a: Assignment, ob: { id: string; title: string }): ReviewAssignment | null {
  if (!a.evidence) return null;
  return {
    assignment_id: a.id,
    obligation_id: ob.id,
    obligation_title: ob.title,
    status: a.status === "rejected" ? "needs_review" : a.status,
    evidence_id: a.evidence.id,
    file_name: a.evidence.file_name,
    file_path: a.evidence.file_path,
    document_type: a.document_type,
    purpose: a.purpose,
    ai_document_type: a.ai_document_type,
    ai_document_type_confidence: a.ai_document_type_confidence,
    ai_purpose: a.ai_purpose,
    ai_purpose_confidence: a.ai_purpose_confidence,
    document_type_candidates: a.evidence.document_type_candidates,
    purpose_candidates: a.evidence.purpose_candidates,
    ai_summary: a.ai_summary,
    ai_reasoning: a.ai_reasoning_full,
  };
}

function lifecycleFor(a: Assignment | undefined): DocLifecycle {
  if (!a) return "no_document";
  return a.status === "verified" ? "on_file" : "needs_review";
}

function RegisterCompanyPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/workflows" });
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);

  const data = useQuery({
    queryKey: ["register-company", orgId],
    queryFn: async () => {
      const [obs, links] = await Promise.all([
        supabase
          .from("obligations")
          .select(
            "id, title, why, evidence_requirements, responsible, is_required, source:source_id(authority, reference, url)"
          )
          .eq("org_id", orgId)
          .order("is_required", { ascending: false })
          .order("title"),
        supabase
          .from("evidence_links")
          .select(
            "id, obligation_id, evidence_id, status, document_type, purpose, ai_document_type, ai_document_type_confidence, ai_purpose, ai_purpose_confidence, ai_summary, ai_reasoning_full, evidence:evidence_id(id, file_name, file_path, document_type_candidates, purpose_candidates)"
          )
          .eq("org_id", orgId),
      ]);

      const byOb = new Map<string, Assignment>();
      for (const l of (links.data ?? []) as unknown as Assignment[]) {
        if (l.obligation_id) byOb.set(l.obligation_id, l);
      }
      return { obs: (obs.data ?? []) as unknown as ObligationRow[], byOb };
    },
  });

  const obs = data.data?.obs ?? [];
  const byOb = data.data?.byOb ?? new Map<string, Assignment>();
  const required = obs.filter((o) => o.is_required !== false);
  const company = obs.filter((o) => o.is_required === false);
  const onFile = required.filter((o) => lifecycleFor(byOb.get(o.id)) === "on_file").length;
  const needsReview = obs.filter((o) => lifecycleFor(byOb.get(o.id)) === "needs_review").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Register Company</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every document folder your company needs to be in control. Upload a document, review the AI's
        suggestion, and confirm. A folder turns green once you've verified it.
      </p>

      <div className="mt-6 flex flex-wrap gap-6 text-sm">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{onFile}</span> / {required.length} required on file
        </span>
        {needsReview > 0 && (
          <span className="text-status-partial">
            <span className="font-medium">{needsReview}</span> awaiting your review
          </span>
        )}
      </div>

      <Section
        title="Required documents"
        subtitle="Legally required to incorporate and run the company."
        orgId={orgId}
        obligations={required}
        byOb={byOb}
        onReview={setReviewing}
      />
      <Section
        title="Company documents"
        subtitle="Recommended internal agreements. Not required by law, but good practice."
        orgId={orgId}
        obligations={company}
        byOb={byOb}
        onReview={setReviewing}
      />

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

function Section({
  title,
  subtitle,
  orgId,
  obligations,
  byOb,
  onReview,
}: {
  title: string;
  subtitle: string;
  orgId: string;
  obligations: ObligationRow[];
  byOb: Map<string, Assignment>;
  onReview: (a: ReviewAssignment) => void;
}) {
  if (obligations.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {obligations.map((o) => {
          const assignment = byOb.get(o.id);
          const lifecycle = lifecycleFor(assignment);
          const ev = assignment?.evidence ?? null;
          const displayType = assignment?.document_type ?? assignment?.ai_document_type ?? null;
          const openReview = () => {
            if (!assignment) return;
            const r = toReview(assignment, { id: o.id, title: o.title });
            if (r) onReview(r);
          };
          return (
            <li key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{o.title}</p>
                    <button
                      type="button"
                      onClick={() => lifecycle === "needs_review" && openReview()}
                      className={lifecycle === "needs_review" ? "cursor-pointer" : "cursor-default"}
                    >
                      <DocumentStatusPill state={lifecycle} />
                    </button>
                  </div>
                  {o.why && <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {o.responsible && (
                      <span>
                        <span className="font-medium text-foreground/70">Responsible:</span> {o.responsible}
                      </span>
                    )}
                    {o.source?.url && (
                      <a
                        href={o.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        <LinkIcon className="h-3 w-3" />
                        {o.source.authority ?? "Source"}
                      </a>
                    )}
                  </div>

                  {ev ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{ev.file_name}</span>
                      {displayType && <span className="text-muted-foreground/70">· {displayType}</span>}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs italic text-muted-foreground">No document yet.</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {lifecycle === "no_document" && (
                    <DocumentUpload
                      orgId={orgId}
                      hintObligationId={o.id}
                      context="workflow"
                      size="sm"
                      variant="default"
                      label="Upload"
                    />
                  )}
                  {lifecycle === "needs_review" && assignment && (
                    <Button size="sm" onClick={openReview}>
                      Review now
                    </Button>
                  )}
                  {lifecycle === "on_file" && ev && assignment && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from("evidence")
                            .createSignedUrl(ev.file_path, 60);
                          if (error || !data?.signedUrl) {
                            toast.error(error?.message ?? "Could not open file");
                            return;
                          }
                          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <ExternalLink className="mr-1 h-3 w-3" />
                        View
                      </Button>
                      <DocumentUpload
                        orgId={orgId}
                        hintObligationId={o.id}
                        context="workflow"
                        mode="replace"
                        assignmentId={assignment.id}
                        size="sm"
                        variant="ghost"
                        label="Replace"
                      />
                    </>
                  )}
                  <Link
                    to="/o/$orgId/obligations/$id"
                    params={{ orgId, id: o.id }}
                    className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Details <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
