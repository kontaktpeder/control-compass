import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DocumentStatusPill, type DocLifecycle } from "@/components/status";
import { DocumentUpload } from "@/components/document-upload";
import type { ReviewAssignment } from "@/components/document-review-panel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { FileText, ExternalLink, MoreVertical } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { isFoodSafetyObligationTitle, localizeObligation } from "@/lib/playbook-i18n";
import { legalBasisForObligation } from "@/lib/legal-sources";
import { unlinkAssignment } from "@/lib/document-assignment.functions";

type EvidenceLite = {
  id: string;
  file_name: string;
  file_path: string;
  document_type_candidates: Array<{ label: string; confidence: number }> | null;
  purpose_candidates: Array<{ label: string; confidence: number }> | null;
};

type Assignment = {
  id: string;
  obligation_id: string;
  evidence_id: string;
  status: "needs_review" | "verified" | "rejected";
  document_type: string | null;
  purpose: string | null;
  ai_document_type: string | null;
  ai_document_type_confidence: number | null;
  ai_purpose: string | null;
  ai_purpose_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning_full: string | null;
  evidence: EvidenceLite | null;
};

type ObligationRow = {
  id: string;
  title: string;
  why: string | null;
  evidence_requirements: string[] | null;
  responsible: string | null;
  is_required: boolean | null;
  legal_citation: string | null;
  legal_url: string | null;
};

function toReview(a: Assignment, ob: { id: string; title: string }): ReviewAssignment | null {
  if (!a.evidence) return null;
  return {
    assignment_id: a.id,
    obligation_id: ob.id,
    obligation_title: ob.title,
    status: a.status === "rejected" ? "needs_review" : a.status,
    evidence_id: a.evidence.id,
    file_name: a.evidence.file_name,
    file_path: a.evidence.file_path,
    document_type: a.document_type,
    purpose: a.purpose,
    ai_document_type: a.ai_document_type,
    ai_document_type_confidence: a.ai_document_type_confidence,
    ai_purpose: a.ai_purpose,
    ai_purpose_confidence: a.ai_purpose_confidence,
    document_type_candidates: a.evidence.document_type_candidates,
    purpose_candidates: a.evidence.purpose_candidates,
    ai_summary: a.ai_summary,
    ai_reasoning: a.ai_reasoning_full,
  };
}

function lifecycleFor(a: Assignment | undefined): DocLifecycle {
  if (!a) return "no_document";
  return a.status === "verified" ? "on_file" : "needs_review";
}

export function RegisterCompanyGuide({
  orgId,
  onReview,
  topic,
}: {
  orgId: string;
  onReview: (a: ReviewAssignment) => void;
  topic: "register" | "food";
}) {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const unlink = useServerFn(unlinkAssignment);

  const unlinkFromRequirement = async (assignmentId: string) => {
    try {
      await unlink({ data: { assignment_id: assignmentId } });
      toast.success(t("workflow.unlinked"));
      await qc.invalidateQueries({ queryKey: ["register-company", orgId] });
      await qc.invalidateQueries({ queryKey: ["documents", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("workflow.unlinkFailed"));
    }
  };

  const data = useQuery({
    queryKey: ["register-company", orgId, topic],
    queryFn: async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("kind")
        .eq("id", orgId)
        .maybeSingle();
      if (topic === "food" && org?.kind && org.kind !== "holding") {
        const { error: seedErr } = await supabase.rpc("seed_food_safety_playbook", { _org: orgId });
        if (seedErr) throw new Error(seedErr.message);
      }

      const [obs, links] = await Promise.all([
        supabase
          .from("obligations")
          .select(
            "id, title, why, evidence_requirements, responsible, is_required, legal_citation, legal_url",
          )
          .eq("org_id", orgId)
          .order("is_required", { ascending: false })
          .order("title"),
        supabase
          .from("evidence_links")
          .select(
            "id, obligation_id, evidence_id, status, document_type, purpose, ai_document_type, ai_document_type_confidence, ai_purpose, ai_purpose_confidence, ai_summary, ai_reasoning_full, evidence:evidence_id(id, file_name, file_path, document_type_candidates, purpose_candidates)",
          )
          .eq("org_id", orgId),
      ]);

      const byOb = new Map<string, Assignment>();
      for (const l of (links.data ?? []) as unknown as Assignment[]) {
        if (l.obligation_id) byOb.set(l.obligation_id, l);
      }
      return { obs: (obs.data ?? []) as unknown as ObligationRow[], byOb, kind: org?.kind ?? null };
    },
  });

  const byOb = data.data?.byOb ?? new Map<string, Assignment>();
  const kind = data.data?.kind ?? null;
  const obs = (data.data?.obs ?? []).map((o) => ({
    ...localizeObligation(locale, o),
    englishTitle: o.title,
    legal: legalBasisForObligation(o.title, {
      legal_citation: o.legal_citation,
      legal_url: o.legal_url,
    }),
  }));
  const food = obs.filter((o) => isFoodSafetyObligationTitle(o.englishTitle));
  const corporate = obs.filter((o) => !isFoodSafetyObligationTitle(o.englishTitle));
  const required = corporate.filter((o) => o.is_required !== false);
  const company = corporate.filter((o) => o.is_required === false);
  const shown = topic === "food" ? food : [...required, ...company];
  const onFile = shown.filter((o) => lifecycleFor(byOb.get(o.id)) === "on_file").length;
  const needsReview = shown.filter((o) => lifecycleFor(byOb.get(o.id)) === "needs_review").length;

  const titlesByEvidence = new Map<string, string[]>();
  for (const o of obs) {
    const evId = byOb.get(o.id)?.evidence?.id;
    if (!evId) continue;
    const list = titlesByEvidence.get(evId) ?? [];
    list.push(o.title);
    titlesByEvidence.set(evId, list);
  }

  if (data.error) {
    return (
      <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-status-missing">{data.error.message}</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {topic === "food" ? t("workflow.foodTitle") : t("workflow.title")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {topic === "food" ? t("workflow.foodSubtitle") : t("workflow.lede")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("workflow.requiredOnFile", { onFile, total: shown.length })}
          {needsReview > 0 ? ` · ${t("workflow.awaitingReview", { count: needsReview })}` : ""}
        </p>
      </div>

      {topic === "register" && (
        <div className="space-y-5">
          <GuideGroup
            label={t("workflow.requiredTitle")}
            orgId={orgId}
            obligations={required}
            byOb={byOb}
            titlesByEvidence={titlesByEvidence}
            onReview={onReview}
            onUnlink={unlinkFromRequirement}
          />
          <GuideGroup
            label={t("workflow.companyTitle")}
            orgId={orgId}
            obligations={company}
            byOb={byOb}
            titlesByEvidence={titlesByEvidence}
            onReview={onReview}
            onUnlink={unlinkFromRequirement}
          />
        </div>
      )}
      {topic === "food" && kind === "holding" && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("workflow.foodHoldingHint")}
        </p>
      )}
      {topic === "food" && kind !== "holding" && food.length === 0 && !data.isLoading && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("workflow.foodEmpty")}
        </p>
      )}
      {topic === "food" && kind !== "holding" && food.length > 0 && (
        <GuideGroup
          orgId={orgId}
          obligations={food}
          byOb={byOb}
          titlesByEvidence={titlesByEvidence}
          onReview={onReview}
          onUnlink={unlinkFromRequirement}
        />
      )}
    </div>
  );
}

function GuideGroup({
  label,
  orgId,
  obligations,
  byOb,
  titlesByEvidence,
  onReview,
  onUnlink,
}: {
  label?: string;
  orgId: string;
  obligations: Array<
    ObligationRow & { legal: { citation: string; url: string } | null }
  >;
  byOb: Map<string, Assignment>;
  titlesByEvidence: Map<string, string[]>;
  onReview: (a: ReviewAssignment) => void;
  onUnlink: (assignmentId: string) => void;
}) {
  const { t } = useT();
  if (obligations.length === 0) return null;

  return (
    <div>
      {label && (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <Accordion type="single" collapsible className="overflow-hidden rounded-lg border border-border bg-card">
        {obligations.map((o) => {
          const assignment = byOb.get(o.id);
          const lifecycle = lifecycleFor(assignment);
          const ev = assignment?.evidence ?? null;
          const openReview = () => {
            if (!assignment) return;
            const r = toReview(assignment, { id: o.id, title: o.title });
            if (r) onReview(r);
          };
          return (
            <AccordionItem key={o.id} value={o.id} className="border-border px-3">
              <div className="flex items-center gap-2">
                <AccordionTrigger className="min-w-0 flex-1 py-2.5 hover:no-underline [&>svg]:hidden">
                  <span className="min-w-0 flex-1 truncate text-left text-sm">{o.title}</span>
                </AccordionTrigger>
                <DocumentStatusPill state={lifecycle} className="shrink-0" />
                {assignment ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 border border-border bg-background"
                        aria-label={t("library.more")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onUnlink(assignment.id)}
                      >
                        {t("workflow.unlink")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="h-8 w-8 shrink-0" aria-hidden />
                )}
              </div>
              <AccordionContent>
                <div className="space-y-3 pb-3">
                  {o.why && <p className="text-sm text-muted-foreground">{o.why}</p>}
                  {o.responsible && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">{t("workflow.responsible")}</span>{" "}
                      {o.responsible}
                    </p>
                  )}
                  {o.legal?.url && (
                    <a
                      href={o.legal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {o.legal.citation}
                    </a>
                  )}
                  {o.evidence_requirements && o.evidence_requirements.length > 0 && (
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                      {o.evidence_requirements.map((req) => (
                        <li key={req}>{req}</li>
                      ))}
                    </ul>
                  )}
                  {ev && (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{ev.file_name}</span>
                      </p>
                      {(titlesByEvidence.get(ev.id) ?? []).filter((title) => title !== o.title)
                        .length > 0 && (
                        <p className="text-xs text-status-partial">
                          {t("workflow.alsoLinked", {
                            titles: (titlesByEvidence.get(ev.id) ?? [])
                              .filter((title) => title !== o.title)
                              .join(", "),
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {lifecycle === "no_document" && (
                      <DocumentUpload
                        orgId={orgId}
                        hintObligationId={o.id}
                        context="workflow"
                        size="sm"
                        variant="default"
                        label={t("common.upload")}
                      />
                    )}
                    {lifecycle === "needs_review" && assignment && (
                      <Button size="sm" onClick={openReview}>
                        {t("workflow.reviewNow")}
                      </Button>
                    )}
                    {lifecycle === "on_file" && ev && assignment && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from("evidence")
                            .createSignedUrl(ev.file_path, 60);
                          if (error || !data?.signedUrl) {
                            toast.error(error?.message ?? t("workflow.openFailed"));
                            return;
                          }
                          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        {t("common.view")}
                      </Button>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
