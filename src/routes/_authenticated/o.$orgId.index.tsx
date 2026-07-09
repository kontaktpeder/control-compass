import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill, ConfidenceBadge, type Status } from "@/components/status";
import { generateTasks } from "@/lib/ai.functions";
import { toast } from "sonner";
import { RefreshCcw, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/")({
  component: Dashboard,
});

type ObligationRow = {
  id: string;
  title: string;
  playbook_step_id: string | null;
  is_required: boolean;
  latest?: { status: Status; confidence: number | null } | null;
};

function Dashboard() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/" });
  const qc = useQueryClient();
  const regen = useServerFn(generateTasks);

  const dashboard = useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: async () => {
      const [obs, assess, tasks, steps] = await Promise.all([
        supabase.from("obligations").select("id, title, playbook_step_id, is_required").eq("org_id", orgId),
        supabase.from("assessments").select("obligation_id, status, confidence, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("tasks").select("id, title, status, obligation_id").eq("org_id", orgId).eq("status", "open"),
        supabase.from("playbook_steps").select("id, title, order_index").eq("org_id", orgId).order("order_index"),
      ]);
      if (obs.error) throw new Error(obs.error.message);
      const latestByOb = new Map<string, { status: Status; confidence: number | null }>();
      for (const a of assess.data ?? []) if (!latestByOb.has(a.obligation_id)) latestByOb.set(a.obligation_id, { status: a.status as Status, confidence: a.confidence });
      const obligations: ObligationRow[] = (obs.data ?? []).map((o) => ({
        ...o,
        is_required: (o as { is_required?: boolean }).is_required ?? true,
        latest: latestByOb.get(o.id) ?? null,
      }));
      return { obligations, tasks: tasks.data ?? [], steps: steps.data ?? [] };
    },
  });

  const regenMut = useMutation({
    mutationFn: () => regen({ data: { org_id: orgId } }),
    onSuccess: async (r) => {
      toast.success(`Tasks refreshed: ${r.created} new · ${r.closed} closed`);
      await qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Compliance metrics only count required documents. Recommended internal
  // documents show separately and never count as "missing".
  const allObs = dashboard.data?.obligations ?? [];
  const obs = allObs.filter((o) => o.is_required);
  const recommended = allObs.filter((o) => !o.is_required);
  const total = obs.length;
  const bucket = (s: Status | undefined) => obs.filter((o) => (o.latest?.status ?? "unknown") === s).length;
  const satisfied = bucket("satisfied");
  const partial = bucket("partially_satisfied");
  const missing = bucket("missing");
  const unknown = obs.filter((o) => !o.latest).length;
  const recommendedOnFile = recommended.filter((o) => o.latest?.status === "satisfied").length;
  const avgConfidence = (() => {
    const withConf = obs.map((o) => o.latest?.confidence ?? null).filter((c): c is number => c != null);
    if (!withConf.length) return null;
    return withConf.reduce((a, b) => a + b, 0) / withConf.length;
  })();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Are we in control?</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            An honest picture of what's known, what's satisfied, and what's still missing.
            Nothing is assumed compliant.
          </p>
        </div>
        <Button variant="outline" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh tasks
        </Button>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Known" value={total} />
        <Metric label="Satisfied" value={satisfied} tone="satisfied" />
        <Metric label="Partial" value={partial} tone="partial" />
        <Metric label="Missing" value={missing} tone="missing" />
        <Metric label="Unknown" value={unknown} tone="unknown" />
      </section>

      <section className="mb-10">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Control confidence</CardTitle>
                <CardDescription>Average of the AI's confidence across assessed obligations. Higher is not the same as compliant.</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold">
                  {avgConfidence == null ? "—" : `${Math.round(avgConfidence * 100)}%`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {avgConfidence == null ? "no assessments yet" : `across ${obs.filter(o => o.latest?.confidence != null).length} obligations`}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open tasks</h2>
          <Link to="/o/$orgId/tasks" params={{ orgId }} className="text-sm text-primary hover:underline">
            All tasks <ArrowRight className="inline h-3 w-3" />
          </Link>
        </div>
        {dashboard.data?.tasks.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {dashboard.data.tasks.slice(0, 6).map((t) => (
              <li key={t.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span>{t.title}</span>
                  {t.obligation_id ? (
                    <Link to="/o/$orgId/obligations/$id" params={{ orgId, id: t.obligation_id }} className="text-xs text-primary hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No open tasks. Upload evidence and let Control Core suggest the next steps.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Obligations by step</h2>
        <div className="space-y-4">
          {(dashboard.data?.steps ?? []).map((step) => {
            const stepObs = obs.filter((o) => o.playbook_step_id === step.id);
            return (
              <Card key={step.id}>
                <CardHeader>
                  <CardTitle className="text-base">Step {step.order_index}. {step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {stepObs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No obligations.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {stepObs.map((o) => (
                        <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                          <Link to="/o/$orgId/obligations/$id" params={{ orgId, id: o.id }} className="hover:underline">
                            {o.title}
                          </Link>
                          <div className="flex items-center gap-3">
                            <ConfidenceBadge value={o.latest?.confidence} />
                            <StatusPill status={o.latest?.status ?? "unknown"} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "satisfied" | "partial" | "missing" | "unknown" }) {
  const toneCls =
    tone === "satisfied" ? "text-status-satisfied" :
    tone === "partial" ? "text-status-partial" :
    tone === "missing" ? "text-status-missing" :
    tone === "unknown" ? "text-status-unknown" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}
