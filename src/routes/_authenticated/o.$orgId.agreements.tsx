import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/o/$orgId/agreements")({
  component: AgreementsPage,
});

type AgreementListRow = {
  id: string;
  title: string;
  status: string;
  agreement_type: string;
  counterparty_name: string | null;
  version: number;
  source: string;
  updated_at: string;
};

function AgreementsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/agreements" });

  const list = useQuery({
    queryKey: ["agreements", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          "id, title, status, agreement_type, counterparty_name, version, source, updated_at",
        )
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgreementListRow[];
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="eyebrow">Control</p>
        <h1 className="text-2xl font-semibold tracking-tight">Agreements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control owns drafts, signing, versions and archive. Fortell can hand off
          drafts from Nexus — it is not the contract system.
        </p>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isError && (
        <p className="text-sm text-destructive">
          {list.error instanceof Error ? list.error.message : "Failed to load"}
        </p>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {(list.data ?? []).length === 0 && !list.isLoading && (
          <li className="flex items-start gap-3 px-4 py-8 text-sm text-muted-foreground">
            <FileSignature className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-foreground">No agreements yet</p>
              <p className="mt-1">
                Ask Fortell in Nexus to prepare a contract draft, then confirm the
                handoff — it lands here as <code className="text-xs">draft</code>.
              </p>
            </div>
          </li>
        )}
        {(list.data ?? []).map((a) => (
          <li key={a.id}>
            <Link
              to="/o/$orgId/agreements/$id"
              params={{ orgId, id: a.id }}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.agreement_type}
                  {a.counterparty_name ? ` · ${a.counterparty_name}` : ""}
                  {a.source === "nexus_fortell" ? " · from Fortell" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium capitalize">{a.status}</p>
                <p className="text-[11px] text-muted-foreground">v{a.version}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
