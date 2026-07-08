import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/o/$orgId/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/tasks" });
  const qc = useQueryClient();

  const tasks = useQuery({
    queryKey: ["tasks", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, status, obligation_id, generated_by, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "open" | "done" | "dismissed" }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks", orgId] });
      await qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (tasks.data ?? []).filter((t) => t.status === "open");
  const done = (tasks.data ?? []).filter((t) => t.status !== "open");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Tasks</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">What to do next</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Tasks are generated from obligations that aren't yet satisfied. Complete an obligation and its task closes itself.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Open ({open.length})</h2>
        {open.length ? (
          <ul className="space-y-2">
            {open.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.title}</p>
                      {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                      {t.obligation_id && (
                        <Link
                          to="/o/$orgId/obligations/$id"
                          params={{ orgId, id: t.obligation_id }}
                          className="mt-2 inline-block text-xs text-primary hover:underline"
                        >
                          View obligation
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: t.id, status: "done" })}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Done
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: t.id, status: "dismissed" })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No open tasks.
          </p>
        )}
      </section>

      {done.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-muted-foreground">Closed</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {done.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                <span className="line-through">{t.title}</span>
                <span className="text-xs">{t.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
