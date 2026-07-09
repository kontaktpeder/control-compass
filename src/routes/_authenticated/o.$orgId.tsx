import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, LayoutDashboard, FileText, Workflow, CheckSquare, Building2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/o/$orgId")({
  component: OrgShell,
});

function OrgShell() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId" });
  const navigate = useNavigate();

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

  const navItems: Array<{ to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }> = [
    { to: "/o/$orgId", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/o/$orgId/workflows", label: "Workflows", icon: Workflow },
    { to: "/o/$orgId/evidence", label: "Documents", icon: FileText },
    { to: "/o/$orgId/tasks", label: "Tasks", icon: CheckSquare },
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
            <p className="eyebrow">Organization</p>
            <div className="mt-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{org.data?.name ?? "…"}</p>
                <Link to="/orgs" className="text-xs text-muted-foreground hover:underline">Switch</Link>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                params={{ orgId }}
                activeOptions={{ exact: !!item.end }}
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition hover:bg-sidebar-accent/60"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
