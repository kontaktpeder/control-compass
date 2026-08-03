import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/o/$orgId/agreements/$id")({
  component: AgreementDetailPage,
});

function AgreementDetailPage() {
  const { orgId, id } = useParams({ from: "/_authenticated/o/$orgId/agreements/$id" });

  const agreement = useQuery({
    queryKey: ["agreement", orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          "id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
        )
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Agreement not found");
      return data;
    },
  });

  const a = agreement.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/o/$orgId/agreements" params={{ orgId }}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All agreements
        </Link>
      </Button>

      {agreement.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {agreement.isError && (
        <p className="text-sm text-destructive">
          {agreement.error instanceof Error ? agreement.error.message : "Failed to load"}
        </p>
      )}

      {a && (
        <>
          <div>
            <p className="eyebrow capitalize">
              {a.status} · v{a.version} · {a.agreement_type}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.counterparty_name ? `Counterparty: ${a.counterparty_name}` : "No counterparty set"}
              {a.source === "nexus_fortell" ? " · Handed off from Fortell" : ""}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Draft body
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {a.body}
            </pre>
          </div>

          <p className="text-xs text-muted-foreground">
            Signing, versioning and archive stay in Control. Process controls beyond draft
            come next.
          </p>
        </>
      )}
    </div>
  );
}
