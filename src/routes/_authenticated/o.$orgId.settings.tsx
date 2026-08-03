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
          scopes: ["platform:read", "platform:verify"],
        },
      });
      setIssuedToken(res.token);
      toast.success("API key created");
      await queryClient.invalidateQueries({ queryKey: ["api-clients", orgId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(clientId: string) {
    if (!confirm("Revoke this API key? Nexus will stop connecting until you create a new one.")) {
      return;
    }
    try {
      await revokeClient({ data: { organizationId: orgId, clientId } });
      toast.success("Key revoked");
      await queryClient.invalidateQueries({ queryKey: ["api-clients", orgId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not revoke key");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="eyebrow">Organization</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Control to Nexus and manage API keys.
        </p>
      </div>

      <PlatformLinkingCard orgId={orgId} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">API keys</CardTitle>
            <CardDescription>
              Keys use the <code className="font-mono text-xs">cc_live_</code> prefix. Raw tokens
              are shown only when created.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => void onCreateKey()} disabled={busy}>
            <KeyRound className="mr-2 h-4 w-4" />
            {busy ? "Creating…" : "New platform key"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {issuedToken && (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Copy now — shown once.</p>
              <div className="break-all font-mono text-xs">{issuedToken}</div>
            </div>
          )}

          {clients.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {clients.isError && (
            <p className="text-sm text-destructive">
              {clients.error instanceof Error ? clients.error.message : "Failed to load keys"}
            </p>
          )}

          <ul className="divide-y divide-border rounded-md border border-border">
            {(clients.data ?? []).length === 0 && !clients.isLoading && (
              <li className="px-3 py-4 text-sm text-muted-foreground">No API keys yet.</li>
            )}
            {(clients.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.name}
                    {c.revoked_at && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (revoked)
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
                    aria-label="Revoke key"
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
