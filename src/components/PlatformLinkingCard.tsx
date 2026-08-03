import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiKey } from "@/lib/api-keys.functions";

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy");
  }
}

export function PlatformLinkingCard({ orgId }: { orgId: string }) {
  const createKey = useServerFn(createApiKey);
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const appBase = typeof window !== "undefined" ? window.location.origin : "https://…";

  async function createPlatformVerifyKey() {
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
      toast.success("Platform verify key created");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Platform linking (Nexus)</CardTitle>
        <CardDescription>
          Paste these values in Nexus → Modules when connecting Control. Use a key with{" "}
          <code className="font-mono text-xs">platform:read</code> +{" "}
          <code className="font-mono text-xs">platform:verify</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Control org ID</Label>
          <div className="flex gap-2">
            <Input readOnly value={orgId} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(orgId, "Org ID")}
              aria-label="Copy org ID"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Base URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={appBase} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(appBase, "Base URL")}
              aria-label="Copy base URL"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void createPlatformVerifyKey()} disabled={busy}>
            <KeyRound className="mr-2 h-4 w-4" />
            {busy ? "Creating…" : "Create platform-verify key"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/o/$orgId/settings" params={{ orgId }}>
              API keys
            </Link>
          </Button>
        </div>

        {issuedToken && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Copy the key now — it is shown only once.
            </p>
            <div className="break-all font-mono text-xs">{issuedToken}</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(issuedToken, "API key")}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy key
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
