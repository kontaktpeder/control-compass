import { useQuery } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { FileText, ExternalLink } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { isFoodSafetyObligationTitle, localizeObligation } from "@/lib/playbook-i18n";
import { legalBasisForObligation } from "@/lib/legal-sources";

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
}: {
  orgId: string;
  onReview: (a: ReviewAssignment) => void;
}) {
  const { t, locale } = useT();

  const data = useQuery({
    queryKey: ["register-company", orgId],
    queryFn: async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("kind")
        .eq("id", orgId)
        .maybeSingle();
      if (org?.kind === "operating" || org?.kind === "sole_prop") {
        await supabase.rpc("seed_food_safety_playbook", { _org: orgId });
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
      return { obs: (obs.data ?? []) as unknown as ObligationRow[], byOb };
    },
  });

  const byOb = data.data?.byOb ?? new Map<string, Assignment>();
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
  const requiredAndFood = [...required, ...food];
  const onFile = requiredAndFood.filter((o) => lifecycleFor(byOb.get(o.id)) === "on_file").length;
  const needsReview = obs.filter((o) => lifecycleFor(byOb.get(o.id)) === "needs_review").length;

  return (
    <div className="mb-8 rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{t("workflow.title")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("workflow.lede")}</p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span className="text-muted-foreground">
            {t("workflow.requiredOnFile", { onFile, total: requiredAndFood.length })}
          </span>
          {needsReview > 0 && (
            <span className="text-status-partial">
              {t("workflow.awaitingReview", { count: needsReview })}
            </span>
          )}
        </div>
      </div>

      <GuideSection
        title={t("workflow.requiredTitle")}
        subtitle={t("workflow.requiredSubtitle")}
        orgId={orgId}
        obligations={required}
        byOb={byOb}
        onReview={onReview}
      />
      <GuideSection
        title={t("workflow.companyTitle")}
        subtitle={t("workflow.companySubtitle")}
        orgId={orgId}
        obligations={company}
        byOb={byOb}
        onReview={onReview}
      />
      <GuideSection
        title={t("workflow.foodTitle")}
        subtitle={t("workflow.foodSubtitle")}
        orgId={orgId}
        obligations={food}
        byOb={byOb}
        onReview={onReview}
      />
    </div>
  );
}

function GuideSection({
  title,
  subtitle,
  orgId,
  obligations,
  byOb,
  onReview,
}: {
  title: string;
  subtitle: string;
  orgId: string;
  obligations: Array<
    ObligationRow & { legal: { citation: string; url: string } | null }
  >;
  byOb: Map<string, Assignment>;
  onReview: (a: ReviewAssignment) => void;
}) {
  const { t } = useT();
  if (obligations.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-1 text-xs text-muted-foreground">{subtitle}</p>
      <Accordion type="single" collapsible>
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
            <AccordionItem key={o.id} value={o.id} className="border-border">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-2 pr-3">
                  <span className="truncate text-sm font-medium">{o.title}</span>
                  <DocumentStatusPill state={lifecycle} />
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-1">
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
                    <div>
                      <p className="text-xs font-medium">{t("obligations.requiredEvidence")}</p>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {o.evidence_requirements.map((req) => (
                          <li key={req}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ev && (
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{ev.file_name}</span>
                    </p>
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
                      <>
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
                        <DocumentUpload
                          orgId={orgId}
                          hintObligationId={o.id}
                          context="workflow"
                          mode="replace"
                          assignmentId={assignment.id}
                          size="sm"
                          variant="ghost"
                          label={t("common.replace")}
                        />
                      </>
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
