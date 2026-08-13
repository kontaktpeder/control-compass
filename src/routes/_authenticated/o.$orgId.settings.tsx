import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { PlatformLinkingCard } from "@/components/PlatformLinkingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createApiKey, listApiClients, revokeApiClient } from "@/lib/api-keys.functions";
import { useT } from "@/components/locale-provider";
import { LanguageToggle } from "@/components/language-toggle";

export const Route = createFileRoute("/_authenticated/o/$orgId/settings")({
  component: OrgSettingsPage,
});

type ApiClientRow = {
  id: string;
  name: string;
  allowed_scopes: string[];
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

function OrgSettingsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/settings" });
  const { t } = useT();
  const queryClient = useQueryClient();
  const listClients = useServerFn(listApiClients);
  const createKey = useServerFn(createApiKey);
  const revokeClient = useServerFn(revokeApiClient);
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["api-clients", orgId],
    queryFn: async () =>
      (await listClients({ data: { organizationId: orgId } })) as ApiClientRow[],
  });

  async function onCreateKey() {
    setBusy(true);
    setIssuedToken(null);
    try {
      const res = await createKey({
        data: {
          organizationId: orgId,
          name: "platform-verify",
          scopes: ["platform:read", "platform:verify", "agreements:write", "agreements:read"],
        },
      });
      setIssuedToken(res.token);
      toast.success(t("settings.keyCreated"));
      await queryClient.invalidateQueries({ queryKey: ["api-clients", orgId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("settings.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(clientId: string) {
    if (!confirm(t("settings.revokeConfirm"))) {
      return;
    }
    try {
      await revokeClient({ data: { organizationId: orgId, clientId } });
      toast.success(t("settings.keyRevoked"));
      await queryClient.invalidateQueries({ queryKey: ["api-clients", orgId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("settings.revokeFailed"));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="eyebrow">{t("settings.eyebrow")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.lede")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.languageTitle")}</CardTitle>
          <CardDescription>{t("settings.languageHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageToggle />
        </CardContent>
      </Card>

      <PlatformLinkingCard orgId={orgId} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">{t("settings.apiKeys")}</CardTitle>
            <CardDescription>
              {t("settings.apiHint")}
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => void onCreateKey()} disabled={busy}>
            <KeyRound className="mr-2 h-4 w-4" />
            {busy ? t("common.creating") : t("settings.newKey")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {issuedToken && (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{t("settings.copyOnce")}</p>
              <div className="break-all font-mono text-xs">{issuedToken}</div>
            </div>
          )}

          {clients.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {clients.isError && (
            <p className="text-sm text-destructive">
              {clients.error instanceof Error ? clients.error.message : t("settings.loadFailed")}
            </p>
          )}

          <ul className="divide-y divide-border rounded-md border border-border">
            {(clients.data ?? []).length === 0 && !clients.isLoading && (
              <li className="px-3 py-4 text-sm text-muted-foreground">{t("settings.noKeys")}</li>
            )}
            {(clients.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.name}
                    {c.revoked_at && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t("settings.revoked")}
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {(c.allowed_scopes ?? []).join(", ")}
                  </p>
                </div>
                {!c.revoked_at && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void onRevoke(c.id)}
                    aria-label={t("settings.revoke")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
