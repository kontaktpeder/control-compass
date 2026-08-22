import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck,
  FileText,
  Building2,
  LogOut,
  Settings,
  FileSignature,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/components/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/o/$orgId")({
  component: OrgShell,
});

function OrgShell() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId" });
  const navigate = useNavigate();
  const { t } = useT();

  const org = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, kind, org_number")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const navItems: Array<{
    to: "/o/$orgId/evidence" | "/o/$orgId/agreements" | "/o/$orgId/settings";
    labelKey: MessageKey;
    icon: typeof FileText;
    search?: { mode?: "register" | "food" };
  }> = [
    { to: "/o/$orgId/evidence", labelKey: "nav.documents", icon: FileText, search: {} },
    { to: "/o/$orgId/agreements", labelKey: "nav.agreements", icon: FileSignature },
    { to: "/o/$orgId/settings", labelKey: "nav.settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
          <div className="border-b border-sidebar-border p-4">
            <Link to="/orgs" className="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Control Core
            </Link>
          </div>
          <div className="border-b border-sidebar-border p-4">
            <p className="eyebrow">{t("common.organization")}</p>
            <div className="mt-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{org.data?.name ?? "…"}</p>
                {org.data?.kind && (
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`orgs.kind.${org.data.kind}` as MessageKey)}
                  </p>
                )}
                <Link to="/orgs" className="text-xs text-muted-foreground hover:underline">{t("common.switch")}</Link>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                params={{ orgId }}
                search={item.search}
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition hover:bg-sidebar-accent/60"
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3 space-y-2">
            <LanguageToggle className="w-full justify-center" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
            </Button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <Link to="/orgs" className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="truncate">{org.data?.name ?? "Control"}</span>
            </Link>
            <nav className="ml-auto flex max-w-[60%] gap-1 overflow-x-auto text-xs">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  params={{ orgId }}
                  search={item.search}
                  activeProps={{ className: "bg-muted font-medium text-foreground" }}
                  className="shrink-0 rounded-md px-2 py-1.5 text-muted-foreground"
                >
                  {t(item.labelKey)}
                </Link>
              ))}
            </nav>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
