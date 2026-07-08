import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/status";

export const Route = createFileRoute("/_authenticated/o/$orgId/playbook")({
  component: PlaybookPage,
});

function PlaybookPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/playbook" });

  const data = useQuery({
    queryKey: ["playbook", orgId],
    queryFn: async () => {
      const [pb, steps, obs, assess] = await Promise.all([
        supabase.from("playbooks").select("id, name, slug").eq("org_id", orgId).eq("slug", "incorporate_company").maybeSingle(),
        supabase.from("playbook_steps").select("id, title, description, order_index").eq("org_id", orgId).order("order_index"),
        supabase.from("obligations").select("id, title, playbook_step_id").eq("org_id", orgId),
        supabase.from("assessments").select("obligation_id, status, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
      ]);
      const latest = new Map<string, Status>();
      for (const a of assess.data ?? []) if (!latest.has(a.obligation_id)) latest.set(a.obligation_id, a.status as Status);
      return { pb: pb.data, steps: steps.data ?? [], obs: obs.data ?? [], latest };
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Playbook</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.data?.pb?.name ?? "Incorporate a Company"}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        A guided sequence that traces every obligation back to the law or governance decision it comes from.
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
              <CardContent>
                <ul className="divide-y divide-border">
                  {stepObs.map((o) => (
                    <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                      <Link to="/o/$orgId/obligations/$id" params={{ orgId, id: o.id }} className="hover:underline">
                        {o.title}
                      </Link>
                      <StatusPill status={data.data?.latest.get(o.id) ?? "unknown"} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
