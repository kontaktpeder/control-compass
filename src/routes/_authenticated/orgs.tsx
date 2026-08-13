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
import { useT } from "@/components/locale-provider";
import { LanguageToggle } from "@/components/language-toggle";
import type { MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/orgs")({
  component: OrgsPage,
});

function OrgsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useT();
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
      toast.success(t("orgs.created"));
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
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="eyebrow">{t("orgs.eyebrow")}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("orgs.title")}</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              {t("orgs.lede")}
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> {t("orgs.new")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("orgs.createTitle")}</DialogTitle>
                <DialogDescription>
                  {t("orgs.createHint")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="name">{t("orgs.legalName")}</Label>
                  <Input id="name" placeholder="e.g. Gold of Sicily AS" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="num">{t("orgs.orgNumber")}</Label>
                  <Input id="num" placeholder="e.g. 923 456 789" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("orgs.entityType")}</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holding">{t("orgs.kind.holding")}</SelectItem>
                      <SelectItem value="operating">{t("orgs.kind.operating")}</SelectItem>
                      <SelectItem value="sole_prop">{t("orgs.kind.sole_prop")}</SelectItem>
                      <SelectItem value="other">{t("orgs.kind.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={!name || createMut.isPending}
                >
                  {createMut.isPending ? t("common.creating") : t("orgs.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {orgs.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
                          {t(`orgs.kind.${o.kind}` as MessageKey)}
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
              <p className="eyebrow">{t("orgs.emptyEyebrow")}</p>
              <p className="mt-2 text-muted-foreground">
                {t("orgs.emptyBody")}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
