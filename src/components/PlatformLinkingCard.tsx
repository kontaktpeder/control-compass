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
import { useT } from "@/components/locale-provider";

async function copyText(value: string, label: string, copied: string, failed: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(copied);
  } catch {
    toast.error(failed);
  }
}

export function PlatformLinkingCard({ orgId }: { orgId: string }) {
  const { t } = useT();
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
          scopes: ["platform:read", "platform:verify", "agreements:write", "agreements:read"],
        },
      });
      setIssuedToken(res.token);
      toast.success(t("platform.keyCreated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("settings.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("platform.title")}</CardTitle>
        <CardDescription>
          {t("platform.hint")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("platform.orgId")}</Label>
          <div className="flex gap-2">
            <Input readOnly value={orgId} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(orgId, "Org ID", t("common.copied", { label: "Org ID" }), t("common.copyFailed"))}
              aria-label="Copy org ID"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("platform.baseUrl")}</Label>
          <div className="flex gap-2">
            <Input readOnly value={appBase} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(appBase, "Base URL", t("common.copied", { label: t("platform.baseUrl") }), t("common.copyFailed"))}
              aria-label="Copy base URL"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void createPlatformVerifyKey()} disabled={busy}>
            <KeyRound className="mr-2 h-4 w-4" />
            {busy ? t("common.creating") : t("platform.createKey")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/o/$orgId/settings" params={{ orgId }}>
              {t("settings.apiKeys")}
            </Link>
          </Button>
        </div>

        {issuedToken && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              {t("platform.copyOnce")}
            </p>
            <div className="break-all font-mono text-xs">{issuedToken}</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(issuedToken, "API key", t("common.copied", { label: "API key" }), t("common.copyFailed"))}
            >
              <Copy className="mr-2 h-4 w-4" /> {t("platform.copyKey")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
