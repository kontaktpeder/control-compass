import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentUpload } from "@/components/document-upload";
import { confirmEvidenceField } from "@/lib/ai.functions";
import { toast } from "sonner";
import { FileText, Sparkles, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: DocumentsPage,
});

type ReviewStatus = "confirmed" | "needs_review" | "unknown";
type Candidate = { label: string; confidence: number };

const REVIEW_META: Record<ReviewStatus, { label: string; tone: string }> = {
  confirmed:    { label: "Confirmed",    tone: "bg-status-satisfied-bg text-status-satisfied" },
  needs_review: { label: "Needs review", tone: "bg-status-partial-bg text-status-partial" },
  unknown:      { label: "Unknown",      tone: "bg-status-unknown-bg text-status-unknown" },
};

type LinkRow = { id: string; obligation_id: string; title: string };

type EvidenceRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_summary: string | null;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  primary_purpose: string | null;
  primary_purpose_confidence: number | null;
  purpose_candidates: Candidate[] | null;
  review_status: string | null;
  created_at: string;
  links: LinkRow[];
};

type Tab = "all" | "needs_review" | "linked" | "internal" | "unlinked";

const INTERNAL_TYPE_HINTS = [
  "founders agreement",
  "founder agreement",
  "shareholder agreement",
  "shareholders agreement",
  "nda",
  "non-disclosure",
  "founder decision",
  "internal",
];

function DocumentsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const qc = useQueryClient();
  const confirmField = useServerFn(confirmEvidenceField);
  const [openReview, setOpenReview] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>("all");

  const documents = useQuery({
    queryKey: ["documents", orgId],
    queryFn: async () => {
      const [ev, links, obs] = await Promise.all([
        supabase.from("evidence")
          .select("id, file_name, mime_type, size_bytes, ai_summary, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, primary_purpose_confidence, purpose_candidates, review_status, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase.from("evidence_links").select("id, evidence_id, obligation_id").eq("org_id", orgId),
        supabase.from("obligations").select("id, title, is_required").eq("org_id", orgId),
      ]);
      if (ev.error) throw new Error(ev.error.message);

      const obTitle = new Map<string, string>();
      const obRequired = new Map<string, boolean>();
      for (const o of obs.data ?? []) {
        obTitle.set(o.id, o.title);
        obRequired.set(o.id, (o as { is_required?: boolean }).is_required ?? true);
      }
      const linksByEv = new Map<string, LinkRow[]>();
      for (const l of links.data ?? []) {
        const arr = linksByEv.get(l.evidence_id) ?? [];
        arr.push({ id: l.id, obligation_id: l.obligation_id, title: obTitle.get(l.obligation_id) ?? "Unknown" });
        linksByEv.set(l.evidence_id, arr);
      }
      return (ev.data ?? []).map((row) => {
        const rowLinks = linksByEv.get(row.id) ?? [];
        const linksToRecommended = rowLinks.some((l) => obRequired.get(l.obligation_id) === false);
        const type = (row.primary_document_type ?? "").toLowerCase();
        const isInternal =
          linksToRecommended ||
          (rowLinks.length === 0 && INTERNAL_TYPE_HINTS.some((h) => type.includes(h)));
        return { ...row, links: rowLinks, isInternal };
      }) as unknown as Array<EvidenceRow & { isInternal: boolean }>;
    },
  });

  const confirmMut = useMutation({
    mutationFn: async (args: { evidence_id: string; field: "document_type" | "purpose"; value: string }) => {
      await confirmField({ data: args });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["documents", orgId] });
    },
  });

  const { visible, counts } = useMemo(() => {
    const list = documents.data ?? [];
    const counts = {
      all:          list.length,
      needs_review: list.filter((d) => (d.review_status ?? "unknown") !== "confirmed").length,
      linked:       list.filter((d) => d.links.length > 0).length,
      internal:     list.filter((d) => d.isInternal).length,
      unlinked:     list.filter((d) => d.links.length === 0).length,
    };
    const visible = list.filter((d) => {
      const review = (d.review_status as ReviewStatus) ?? "unknown";
      if (tab === "needs_review") return review !== "confirmed";
      if (tab === "linked") return d.links.length > 0;
      if (tab === "internal") return d.isInternal;
      if (tab === "unlinked") return d.links.length === 0;
      return true;
    });
    return { visible, counts };
  }, [documents.data, tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all",          label: `All · ${counts.all}` },
    { id: "needs_review", label: `Needs review · ${counts.needs_review}` },
    { id: "linked",       label: `Linked · ${counts.linked}` },
    { id: "internal",     label: `Internal · ${counts.internal}` },
    { id: "unlinked",     label: `Unlinked · ${counts.unlinked}` },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Documents</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The library</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every document Control Core has understood. Upload from a workflow step to link automatically,
        or drop something here for the AI to identify and file.
      </p>

      <Card className="mt-8 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Upload to the library</CardTitle>
          <CardDescription>
            PDF or image. For anything that belongs to a specific step, upload from the Workflow view instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUpload orgId={orgId} context="library" label="Upload document" />
        </CardContent>
      </Card>

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {visible.length ? (
          <ul className="space-y-3">
            {visible.map((e) => {
              const review = (e.review_status as ReviewStatus) ?? "unknown";
              const meta = REVIEW_META[review] ?? REVIEW_META.unknown;
              const docConf = Math.round(((e.primary_document_type_confidence ?? 0)) * 100);
              const purConf = Math.round(((e.primary_purpose_confidence ?? 0)) * 100);
              const docCandidates = (e.document_type_candidates ?? []).filter(c => c?.label);
              const purCandidates = (e.purpose_candidates ?? []).filter(c => c?.label);
              const isOpen = !!openReview[e.id];

              return (
                <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.file_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.mime_type ?? "?"} · {formatBytes(e.size_bytes)} · {new Date(e.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Document type" value={e.primary_document_type} />
                        <Field label="Purpose" value={e.primary_purpose} />
                        <Field
                          label="Confidence"
                          value={e.primary_document_type_confidence != null ? `${docConf}%` : null}
                        />
                      </div>

                      {e.ai_summary && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>{e.ai_summary}</span>
                        </p>
                      )}

                      {e.links.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">Linked to:</span>
                          {e.links.map((l) => (
                            <Link
                              key={l.id}
                              to="/o/$orgId/obligations/$id"
                              params={{ orgId, id: l.obligation_id }}
                              className="rounded-md bg-muted px-2 py-0.5 hover:bg-muted/70 hover:underline"
                            >
                              {l.title}
                            </Link>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {review !== "confirmed" && e.primary_document_type && (
                          <Button
                            size="sm"
                            disabled={confirmMut.isPending}
                            onClick={() => confirmMut.mutate({ evidence_id: e.id, field: "document_type", value: e.primary_document_type! })}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Confirm as {e.primary_document_type}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpenReview((s) => ({ ...s, [e.id]: !s[e.id] }))}
                        >
                          {isOpen ? "Hide" : "Review"} suggestions
                        </Button>
                      </div>

                      {isOpen && (
                        <div className="mt-3 space-y-4 rounded-md border border-border/70 bg-muted/30 p-3">
                          <CandidatePicker
                            title="Document type"
                            current={e.primary_document_type}
                            currentConfidence={docConf}
                            candidates={docCandidates}
                            disabled={confirmMut.isPending}
                            onPick={(value) => confirmMut.mutate({ evidence_id: e.id, field: "document_type", value })}
                          />
                          <CandidatePicker
                            title="Purpose"
                            current={e.primary_purpose}
                            currentConfidence={purConf}
                            candidates={purCandidates}
                            disabled={confirmMut.isPending}
                            onPick={(value) => confirmMut.mutate({ evidence_id: e.id, field: "purpose", value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function CandidatePicker({
  title,
  current,
  currentConfidence,
  candidates,
  disabled,
  onPick,
}: {
  title: string;
  current: string | null;
  currentConfidence: number;
  candidates: Candidate[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const shown: Array<Candidate & { isCurrent?: boolean }> = [];
  if (current) shown.push({ label: current, confidence: currentConfidence / 100, isCurrent: true });
  for (const c of candidates) {
    if (!current || c.label !== current) shown.push(c);
  }
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Pick the correct value or set a custom one.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {shown.slice(0, 4).map((c) => (
          <Button
            key={`${title}-${c.label}`}
            size="sm"
            variant={c.isCurrent ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onPick(c.label)}
          >
            {c.isCurrent && <Check className="mr-1 h-3 w-3" />}
            {c.label} · {Math.round((c.confidence ?? 0) * 100)}%
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const t = window.prompt(`Set ${title.toLowerCase()}:`, current ?? "");
            if (t && t.trim()) onPick(t.trim());
          }}
        >
          Set custom…
        </Button>
      </div>
    </div>
  );
}

function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
