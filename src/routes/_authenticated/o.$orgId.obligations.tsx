import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusPill, type Status } from "@/components/status";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/o/$orgId/obligations")({
  component: ObligationsList,
});

function ObligationsList() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/obligations" });
  const [q, setQ] = useState("");

  const data = useQuery({
    queryKey: ["obligations", orgId],
    queryFn: async () => {
      const [obs, fw, assess] = await Promise.all([
        supabase.from("obligations").select("id, title, why, framework_id").eq("org_id", orgId).order("title"),
        supabase.from("frameworks").select("id, name").eq("org_id", orgId),
        supabase.from("assessments").select("obligation_id, status, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
      ]);
      const fwName = new Map((fw.data ?? []).map((f) => [f.id, f.name]));
      const latest = new Map<string, Status>();
      for (const a of assess.data ?? []) if (!latest.has(a.obligation_id)) latest.set(a.obligation_id, a.status as Status);
      return (obs.data ?? []).map((o) => ({ ...o, fw: fwName.get(o.framework_id ?? "") ?? "—", status: latest.get(o.id) ?? "unknown" as Status }));
    },
  });

  const items = (data.data ?? []).filter((o) =>
    !q || o.title.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="eyebrow">Obligations</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Every duty, every source</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every obligation explains where it comes from and what evidence it needs.
      </p>

      <div className="mt-6 mb-4 max-w-sm">
        <Input placeholder="Search obligations…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Obligation</th>
              <th className="px-4 py-3 font-medium">Framework</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link to="/o/$orgId/obligations/$id" params={{ orgId, id: o.id }} className="font-medium hover:underline">
                    {o.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.fw}</td>
                <td className="px-4 py-3"><StatusPill status={o.status} /></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">No obligations.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
