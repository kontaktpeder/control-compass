import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/o/$orgId/agreements/$id")({
  component: AgreementDetailPage,
});

function AgreementDetailPage() {
  const { orgId, id } = useParams({ from: "/_authenticated/o/$orgId/agreements/$id" });

  const { t } = useT();
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
      if (!data) throw new Error(t("agreements.notFound"));
      return data;
    },
  });

  const a = agreement.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/o/$orgId/agreements" params={{ orgId }}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("agreements.all")}
        </Link>
      </Button>

      {agreement.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {agreement.isError && (
        <p className="text-sm text-destructive">
          {agreement.error instanceof Error ? agreement.error.message : t("common.failedLoad")}
        </p>
      )}

      {a && (
        <>
          <div>
            <p className="eyebrow capitalize">
              {t(`agreements.status.${a.status}` as MessageKey)} · v{a.version} · {t(`agreements.type.${a.agreement_type}` as MessageKey)}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.counterparty_name ? t("agreements.counterparty", { name: a.counterparty_name }) : t("agreements.noCounterparty")}
              {a.source === "nexus_fortell" ? ` · ${t("agreements.handoff")}` : ""}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("agreements.draftBody")}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {a.body}
            </pre>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("agreements.footer")}
          </p>
        </>
      )}
    </div>
  );
}
