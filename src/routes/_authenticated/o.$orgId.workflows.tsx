import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/status";
import { DocumentUpload } from "@/components/document-upload";
import { FileText, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/workflows")({
  component: WorkflowsPage,
});

type EvidenceLite = {
  id: string;
  file_name: string;
  primary_document_type: string | null;
  review_status: string | null;
};

function WorkflowsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/workflows" });

  const data = useQuery({
    queryKey: ["workflows", orgId],
    queryFn: async () => {
      const [pb, steps, obs, assess, links] = await Promise.all([
        supabase.from("playbooks").select("id, name, slug").eq("org_id", orgId).eq("slug", "incorporate_company").maybeSingle(),
        supabase.from("playbook_steps").select("id, title, description, order_index").eq("org_id", orgId).order("order_index"),
        supabase.from("obligations").select("id, title, why, playbook_step_id, evidence_requirements, responsible").eq("org_id", orgId),
        supabase.from("assessments").select("obligation_id, status, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("evidence_links").select("obligation_id, evidence:evidence_id(id, file_name, primary_document_type, review_status)").eq("org_id", orgId),
      ]);
      const latest = new Map<string, Status>();
      for (const a of assess.data ?? []) if (!latest.has(a.obligation_id)) latest.set(a.obligation_id, a.status as Status);

      const linkedByOb = new Map<string, EvidenceLite[]>();
      for (const l of links.data ?? []) {
        const e = l.evidence as unknown as EvidenceLite | null;
        if (!e || !l.obligation_id) continue;
        const arr = linkedByOb.get(l.obligation_id) ?? [];
        arr.push(e);
        linkedByOb.set(l.obligation_id, arr);
      }

      return { pb: pb.data, steps: steps.data ?? [], obs: obs.data ?? [], latest, linkedByOb };
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Workflow</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.data?.pb?.name ?? "Incorporate a Company"}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        A guided sequence. Each requirement traces back to the law or governance decision it comes from —
        upload the real document straight into the step it belongs to.
      </p>

      <div className="mt-10 space-y-6">
        {(data.data?.steps ?? []).map((step) => {
          const stepObs = (data.data?.obs ?? []).filter((o) => o.playbook_step_id === step.id);
          const done = stepObs.filter((o) => data.data?.latest.get(o.id) === "satisfied").length;
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
                    {done} / {stepObs.length} satisfied
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-border">
                  {stepObs.map((o) => {
                    const status = data.data?.latest.get(o.id) ?? "unknown";
                    const evidence = data.data?.linkedByOb.get(o.id) ?? [];
                    return (
                      <li key={o.id} className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{o.title}</p>
                              <StatusPill status={status} />
                            </div>
                            {o.why && (
                              <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>
                            )}
                            {o.responsible && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/70">Responsible:</span> {o.responsible}
                              </p>
                            )}

                            {evidence.length > 0 ? (
                              <ul className="mt-3 space-y-1">
                                {evidence.map((e) => (
                                  <li key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <FileText className="h-3.5 w-3.5 text-primary" />
                                    <span className="truncate">{e.file_name}</span>
                                    {e.primary_document_type && (
                                      <span className="text-muted-foreground/70">· {e.primary_document_type}</span>
                                    )}
                                    {e.review_status === "needs_review" && (
                                      <span className="rounded-full bg-status-partial-bg px-1.5 py-0.5 text-[10px] font-medium text-status-partial">
                                        review
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-3 text-xs italic text-muted-foreground">No document linked yet.</p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <DocumentUpload
                              orgId={orgId}
                              hintObligationId={o.id}
                              context="workflow"
                              size="sm"
                              label="Upload"
                            />
                            <Link
                              to="/o/$orgId/obligations/$id"
                              params={{ orgId, id: o.id }}
                              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              Details <ChevronRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
