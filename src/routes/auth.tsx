import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/orgs" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/orgs" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

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
    else toast.success("Account created. You're signed in.");
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed. " + (result.error.message ?? ""));
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
            <p className="eyebrow">Governance · Obligations · Evidence</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Are we in control?
            </h1>
            <p className="text-muted-foreground">
              Control Core connects the laws, contracts and decisions your organization is
              bound by with the evidence that proves you've handled them. No compliance
              theater — just an honest picture of what's known, what's missing, and why.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4 text-sm">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">Obligations</p>
                <p className="text-muted-foreground">Every duty explains where it comes from.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">Evidence</p>
                <p className="text-muted-foreground">Every document proves a specific obligation.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">Assessment</p>
                <p className="text-muted-foreground">AI states its reasoning and confidence.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="eyebrow mb-2">Tasks</p>
                <p className="text-muted-foreground">Only what's missing, nothing invented.</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">© Control Core</p>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in to your workspace or create a new one.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="mt-4 space-y-4">
                  <form onSubmit={handleSignIn} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>Sign in</Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup" className="mt-4 space-y-4">
                  <form onSubmit={handleSignUp} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="name">Full name</Label>
                      <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="email2">Email</Label>
                      <Input id="email2" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password2">Password</Label>
                      <Input id="password2" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>Create account</Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button variant="outline" className="mt-4 w-full" onClick={handleGoogle}>
                  Continue with Google
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
