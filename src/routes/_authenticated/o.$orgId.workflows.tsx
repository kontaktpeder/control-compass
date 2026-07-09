import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentReviewPanel, type ReviewEvidence } from "@/components/document-review-panel";
import { toast } from "sonner";
import { FileText, ChevronRight, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/workflows")({
  component: WorkflowsPage,
});

type EvidenceLite = {
  id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Array<{ label: string; confidence: number }> | null;
  primary_purpose: string | null;
  primary_purpose_confidence: number | null;
  purpose_candidates: Array<{ label: string; confidence: number }> | null;
  review_status: string | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
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

function WorkflowsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/workflows" });
  const [reviewing, setReviewing] = useState<ReviewEvidence | null>(null);

  const data = useQuery({
    queryKey: ["workflows", orgId],
    queryFn: async () => {
      const [pb, steps, obs, links] = await Promise.all([
        supabase.from("playbooks").select("id, name, slug").eq("org_id", orgId).eq("slug", "incorporate_company").maybeSingle(),
        supabase.from("playbook_steps").select("id, title, description, order_index").eq("org_id", orgId).order("order_index"),
        supabase.from("obligations").select("id, title, why, playbook_step_id, evidence_requirements, responsible, is_required").eq("org_id", orgId),
        supabase.from("evidence_links").select("obligation_id, evidence:evidence_id(id, org_id, file_name, file_path, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, primary_purpose_confidence, purpose_candidates, review_status, ai_summary, ai_reasoning)").eq("org_id", orgId),
      ]);

      const linkedByOb = new Map<string, EvidenceLite[]>();
      for (const l of links.data ?? []) {
        const e = l.evidence as unknown as EvidenceLite | null;
        if (!e || !l.obligation_id) continue;
        const arr = linkedByOb.get(l.obligation_id) ?? [];
        arr.push(e);
        linkedByOb.set(l.obligation_id, arr);
      }

      return {
        pb: pb.data,
        steps: steps.data ?? [],
        obs: (obs.data ?? []) as ObligationRow[],
        linkedByOb,
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
          const linkedByOb = data.data!.linkedByOb;
          const done = required.filter((o) => primaryLifecycle(linkedByOb.get(o.id) ?? []) === "on_file").length;

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
                    linkedByOb={linkedByOb}
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
                    linkedByOb={linkedByOb}
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
        onOpenChange={(v) => !v && setReviewing(null)}
        evidence={reviewing}
      />
    </div>
  );
}

function primaryLifecycle(evidence: EvidenceLite[]): DocLifecycle {
  if (evidence.length === 0) return "no_document";
  if (evidence.some((e) => e.review_status === "confirmed")) return "on_file";
  return "needs_review";
}

function ObligationSection({
  orgId,
  title,
  subtitle,
  obligations,
  linkedByOb,
  onReview,
  stepTitle,
}: {
  orgId: string;
  title: string;
  subtitle: string;
  obligations: ObligationRow[];
  linkedByOb: Map<string, EvidenceLite[]>;
  onReview: (ev: ReviewEvidence) => void;
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
          const evidence = linkedByOb.get(o.id) ?? [];
          const lifecycle = primaryLifecycle(evidence);
          const primary = evidence.find((e) => e.review_status === "confirmed") ?? evidence[0] ?? null;

          return (
            <li key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{o.title}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (lifecycle === "needs_review" && primary) {
                          onReview({ ...primary, links: [{ obligation_id: o.id, title: o.title }] });
                        }
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

                  {primary ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{primary.file_name}</span>
                      {primary.primary_document_type && (
                        <span className="text-muted-foreground/70">· {primary.primary_document_type}</span>
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
                  {lifecycle === "needs_review" && primary && (
                    <Button
                      size="sm"
                      onClick={() =>
                        onReview({ ...primary, links: [{ obligation_id: o.id, title: o.title }] })
                      }
                    >
                      Review now
                    </Button>
                  )}
                  {lifecycle === "on_file" && primary && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from("evidence")
                            .createSignedUrl(primary.file_path, 60);
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
