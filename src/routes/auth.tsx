import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { LanguageToggle } from "@/components/language-toggle";

function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  if (v.startsWith("/auth")) return null;
  return v;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({
    returnTo: z.string().optional(),
  }).parse,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const dest = safeReturnTo(search.returnTo);
    // Deep links from Nexus (e.g. /o/.../agreements/:id) must survive login.
    if (dest && typeof window !== "undefined") {
      window.location.replace(dest);
      return;
    }
    throw redirect({ to: "/orgs" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { returnTo } = Route.useSearch();
  const dest = safeReturnTo(returnTo);
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        if (dest) {
          window.location.assign(dest);
          return;
        }
        void navigate({ to: "/orgs" });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, dest]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(t("auth.accountCreated"));
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(t("auth.googleFailed") + " " + (result.error.message ?? ""));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
          <Link to="/auth" className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Control Core
          </Link>
          <div className="max-w-md space-y-6">
            <p className="eyebrow">{t("auth.eyebrow")}</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              {t("auth.headline")}
            </h1>
            <p className="text-muted-foreground">
              {t("auth.lede")}
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4 text-sm">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">{t("obligations.eyebrow")}</p>
                <p className="text-muted-foreground">{t("auth.card.obligations")}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">{t("library.eyebrow")}</p>
                <p className="text-muted-foreground">{t("auth.card.evidence")}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">{t("obligations.assessment")}</p>
                <p className="text-muted-foreground">{t("auth.card.assessment")}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">{t("tasks.eyebrow")}</p>
                <p className="text-muted-foreground">{t("auth.card.tasks")}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">© Control Core</p>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md space-y-3">
            <div className="flex justify-end">
              <LanguageToggle />
            </div>
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t("auth.welcome")}</CardTitle>
              <CardDescription>{t("auth.welcomeHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                  <TabsTrigger value="signup">{t("auth.createAccount")}</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="mt-4 space-y-4">
                  <form onSubmit={handleSignIn} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="email">{t("auth.email")}</Label>
                      <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password">{t("auth.password")}</Label>
                      <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>{t("auth.signIn")}</Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup" className="mt-4 space-y-4">
                  <form onSubmit={handleSignUp} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="name">{t("auth.fullName")}</Label>
                      <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="email2">{t("auth.email")}</Label>
                      <Input id="email2" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password2">{t("auth.password")}</Label>
                      <Input id="password2" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>{t("auth.createAccount")}</Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">{t("common.or")}</span>
                  </div>
                </div>
                <Button variant="outline" className="mt-4 w-full" onClick={handleGoogle}>
                  {t("auth.google")}
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
