import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createOrganization, listOrganizations } from "@/lib/orgs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Plus, LogOut, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orgs")({
  component: OrgsPage,
});

function OrgsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listOrganizations);
  const create = useServerFn(createOrganization);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [kind, setKind] = useState<"holding" | "operating" | "sole_prop" | "other">("operating");

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => list() });
  const createMut = useMutation({
    mutationFn: async () =>
      create({ data: { name, org_number: orgNumber || null, kind } }),
    onSuccess: async (res) => {
      toast.success("Organization created. Seeding your first playbook…");
      await qc.invalidateQueries({ queryKey: ["orgs"] });
      setOpen(false);
      setName(""); setOrgNumber(""); setKind("operating");
      navigate({ to: "/o/$orgId", params: { orgId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Control Core
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="eyebrow">Organizations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your workspaces</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Each organization is a legal entity with its own frameworks, obligations, evidence,
              and playbooks.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New organization</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create organization</DialogTitle>
                <DialogDescription>
                  A new organization is seeded with the <em>Incorporate a Company</em> playbook.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="name">Legal name</Label>
                  <Input id="name" placeholder="e.g. Gold of Sicily AS" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="num">Org number (optional)</Label>
                  <Input id="num" placeholder="e.g. 923 456 789" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Entity type</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holding">Holding company</SelectItem>
                      <SelectItem value="operating">Operating company</SelectItem>
                      <SelectItem value="sole_prop">Sole proprietorship (ENK)</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={!name || createMut.isPending}
                >
                  {createMut.isPending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {orgs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orgs.data && orgs.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {orgs.data.map((o) => (
              <Link key={o.id} to="/o/$orgId" params={{ orgId: o.id }}>
                <Card className="transition hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{o.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {o.kind === "holding" && "Holding company"}
                          {o.kind === "operating" && "Operating company"}
                          {o.kind === "sole_prop" && "Sole proprietorship"}
                          {o.kind === "other" && "Other"}
                          {o.org_number ? ` · ${o.org_number}` : ""}
                        </CardDescription>
                      </div>
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="eyebrow">No organizations yet</p>
              <p className="mt-2 text-muted-foreground">
                Create your first organization to begin.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
