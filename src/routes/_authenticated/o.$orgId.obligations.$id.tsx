import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill, ConfidenceBadge, type Status } from "@/components/status";
import { assessObligation } from "@/lib/ai.functions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgId/obligations/$id")({
  component: ObligationDetail,
});

function ObligationDetail() {
  const { orgId, id } = useParams({ from: "/_authenticated/o/$orgId/obligations/$id" });
  const qc = useQueryClient();
  const assess = useServerFn(assessObligation);

  const data = useQuery({
    queryKey: ["obligation", id],
    queryFn: async () => {
      const [ob, links, latestAssess, sources, frameworks] = await Promise.all([
        supabase.from("obligations").select("*").eq("id", id).single(),
        supabase.from("evidence_links").select("id, ai_reasoning, evidence:evidence_id(id, file_name, mime_type, ai_summary, ai_confidence, created_at)").eq("obligation_id", id),
        supabase.from("assessments").select("*").eq("obligation_id", id).order("created_at", { ascending: false }),
        supabase.from("sources").select("*").eq("org_id", orgId),
        supabase.from("frameworks").select("*").eq("org_id", orgId),
      ]);
      if (ob.error) throw new Error(ob.error.message);
      const src = ob.data.source_id ? (sources.data ?? []).find((s) => s.id === ob.data.source_id) : null;
      const fw = ob.data.framework_id ? (frameworks.data ?? []).find((f) => f.id === ob.data.framework_id) : null;
      return { ob: ob.data, links: links.data ?? [], assessments: latestAssess.data ?? [], src, fw };
    },
  });

  const assessMut = useMutation({
    mutationFn: () => assess({ data: { obligation_id: id } }),
    onSuccess: async () => {
      toast.success("Assessment updated");
      await qc.invalidateQueries({ queryKey: ["obligation", id] });
      await qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ob = data.data?.ob;
  const latest = data.data?.assessments[0];
  const status = (latest?.status as Status) ?? "unknown";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/o/$orgId/obligations" params={{ orgId }} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> All obligations
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="eyebrow">{data.data?.fw?.name ?? "Obligation"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{ob?.title}</h1>
          {data.data?.src && (
            <p className="mt-2 text-sm text-muted-foreground">
              Source: {data.data.src.authority}{data.data.src.reference ? ` · ${data.data.src.reference}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <StatusPill status={status} className="text-sm" />
          <div className="mt-2"><ConfidenceBadge value={latest?.confidence} /></div>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Why this obligation exists</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{ob?.why ?? "—"}</p>
          {ob?.evidence_requirements && ob.evidence_requirements.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Required evidence</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {ob.evidence_requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Assessment</CardTitle>
              <CardDescription>AI's honest read of the evidence available. Confidence is not compliance.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => assessMut.mutate()} disabled={assessMut.isPending}>
              <Sparkles className="mr-2 h-4 w-4" />
              {assessMut.isPending ? "Assessing…" : "Re-assess"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {latest ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{latest.reasoning}</p>
              {latest.missing_evidence && latest.missing_evidence.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Still missing</p>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    {latest.missing_evidence.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Last run: {new Date(latest.created_at).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No assessment yet. Upload evidence or click <em>Re-assess</em>.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Linked evidence</CardTitle>
          <CardDescription>Documents the AI has connected to this obligation.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.data?.links.length ? (
            <ul className="divide-y divide-border">
              {data.data.links.map((l) => {
                const e = l.evidence as unknown as { id: string; file_name: string; ai_summary: string | null; ai_confidence: number | null } | null;
                if (!e) return null;
                return (
                  <li key={l.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{e.file_name}</span>
                      </div>
                      {e.ai_summary && <p className="mt-1 text-muted-foreground">{e.ai_summary}</p>}
                    </div>
                    <ConfidenceBadge value={e.ai_confidence} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No evidence linked yet. <Link to="/o/$orgId/evidence" params={{ orgId }} className="text-primary hover:underline">Upload one →</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
