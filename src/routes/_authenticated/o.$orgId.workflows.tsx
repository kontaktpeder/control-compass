import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentReviewPanel, type ReviewAssignment } from "@/components/document-review-panel";
import { toast } from "sonner";
import { FileText, ChevronRight, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/workflows")({
  component: WorkflowsPage,
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
  status: "needs_review" | "verified";
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
  playbook_step_id: string | null;
  evidence_requirements: string[] | null;
  responsible: string | null;
  is_required: boolean | null;
};

function toReview(a: Assignment, ob: { id: string; title: string }): ReviewAssignment | null {
  if (!a.evidence) return null;
  return {
    assignment_id: a.id,
    obligation_id: ob.id,
    obligation_title: ob.title,
    status: a.status,
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

function WorkflowsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/workflows" });
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);

  const data = useQuery({
    queryKey: ["workflows", orgId],
    queryFn: async () => {
      const [pb, steps, obs, links] = await Promise.all([
        supabase.from("playbooks").select("id, name, slug").eq("org_id", orgId).eq("slug", "incorporate_company").maybeSingle(),
        supabase.from("playbook_steps").select("id, title, description, order_index").eq("org_id", orgId).order("order_index"),
        supabase.from("obligations").select("id, title, why, playbook_step_id, evidence_requirements, responsible, is_required").eq("org_id", orgId),
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

      return {
        pb: pb.data,
        steps: steps.data ?? [],
        obs: (obs.data ?? []) as ObligationRow[],
        byOb,
      };
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Workflow</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.data?.pb?.name ?? "Incorporate a Company"}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        A guided sequence. Upload a document, review the AI's suggestion, and confirm. A requirement
        turns green once you've verified the document is what the AI thinks it is.
      </p>

      <div className="mt-10 space-y-6">
        {(data.data?.steps ?? []).map((step) => {
          const stepObs = (data.data?.obs ?? []).filter((o) => o.playbook_step_id === step.id);
          const required = stepObs.filter((o) => o.is_required !== false);
          const company = stepObs.filter((o) => o.is_required === false);
          const byOb = data.data!.byOb;
          const done = required.filter((o) => lifecycleFor(byOb.get(o.id)) === "on_file").length;

          return (
            <Card key={step.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Step {step.order_index}</p>
                    <CardTitle className="mt-1 text-lg">{step.title}</CardTitle>
                    <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {done} / {required.length} on file
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-6">
                {required.length > 0 && (
                  <ObligationSection
                    orgId={orgId}
                    title="Required documents"
                    subtitle="Legally required for this step."
                    obligations={required}
                    byOb={byOb}
                    onReview={setReviewing}
                    stepTitle={step.title}
                  />
                )}
                {company.length > 0 && (
                  <ObligationSection
                    orgId={orgId}
                    title="Company documents"
                    subtitle="Recommended internal agreements. Not required by law, but good practice."
                    obligations={company}
                    byOb={byOb}
                    onReview={setReviewing}
                    stepTitle={step.title}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
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

function ObligationSection({
  orgId,
  title,
  subtitle,
  obligations,
  byOb,
  onReview,
  stepTitle,
}: {
  orgId: string;
  title: string;
  subtitle: string;
  obligations: ObligationRow[];
  byOb: Map<string, Assignment>;
  onReview: (a: ReviewAssignment) => void;
  stepTitle: string;
}) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border/70">
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
                      onClick={() => {
                        if (lifecycle === "needs_review") openReview();
                      }}
                      className={lifecycle === "needs_review" ? "cursor-pointer" : "cursor-default"}
                    >
                      <DocumentStatusPill state={lifecycle} />
                    </button>
                  </div>
                  {o.why && <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>}
                  {o.responsible && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">Responsible:</span> {o.responsible}
                    </p>
                  )}

                  {ev ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{ev.file_name}</span>
                      {displayType && (
                        <span className="text-muted-foreground/70">· {displayType}</span>
                      )}
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
                    title={`Requirement of ${stepTitle}`}
                  >
                    Details <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
