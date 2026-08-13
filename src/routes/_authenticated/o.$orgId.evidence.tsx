import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentReviewPanel, type ReviewAssignment } from "@/components/document-review-panel";
import { DocumentMetaSheet } from "@/components/document-meta-sheet";
import { toast } from "sonner";
import { FileText, Sparkles, Link2, ExternalLink, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_CATEGORIES,
  categoryLabel,
  isOverdue,
  type DocumentCategory,
  type LibraryItem,
} from "@/lib/library";

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  component: DocumentsPage,
});

type Candidate = { label: string; confidence: number };

type AssignmentRow = {
  id: string;
  evidence_id: string;
  obligation_id: string;
  status: "needs_review" | "verified";
  document_type: string | null;
  purpose: string | null;
  ai_document_type: string | null;
  ai_document_type_confidence: number | null;
  ai_purpose: string | null;
  ai_purpose_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning_full: string | null;
};

type CategoryTab = "all" | "uncategorized" | DocumentCategory;
type ChipFilter = "mine" | "needs_review" | "overdue" | "linked";

function DocumentsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const [tab, setTab] = useState<CategoryTab>("all");
  const [chips, setChips] = useState<ChipFilter[]>([]);
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["documents", orgId],
    queryFn: async (): Promise<LibraryItem[]> => {
      const [ev, links, obs, mems] = await Promise.all([
        supabase
          .from("evidence")
          .select(
            "id, org_id, file_name, file_path, mime_type, size_bytes, ai_summary, primary_document_type, primary_document_type_confidence, document_type_candidates, primary_purpose, purpose_candidates, created_at, category, ai_category, ai_category_confidence, responsible_user_id, review_due_at",
          )
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase
          .from("evidence_links")
          .select(
            "id, evidence_id, obligation_id, status, document_type, purpose, ai_document_type, ai_document_type_confidence, ai_purpose, ai_purpose_confidence, ai_summary, ai_reasoning_full",
          )
          .eq("org_id", orgId),
        supabase.from("obligations").select("id, title").eq("org_id", orgId),
        supabase.from("memberships").select("user_id").eq("org_id", orgId),
      ]);
      if (ev.error) throw new Error(ev.error.message);

      const memberIds = (mems.data ?? []).map((m) => m.user_id);
      const { data: profiles } = memberIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
        : { data: [] as Array<{ id: string; full_name: string | null }> };
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Unnamed"]));

      const obById = new Map((obs.data ?? []).map((o) => [o.id, { id: o.id, title: o.title }]));
      const assignmentByEv = new Map<string, AssignmentRow>();
      for (const l of (links.data ?? []) as unknown as AssignmentRow[]) {
        if (!assignmentByEv.has(l.evidence_id)) assignmentByEv.set(l.evidence_id, l);
      }

      return (ev.data ?? []).map((row) => {
        const assignment = assignmentByEv.get(row.id) ?? null;
        const obligation = assignment ? obById.get(assignment.obligation_id) ?? null : null;
        return {
          id: row.id,
          kind: "file" as const,
          title: row.file_name,
          category: row.category,
          aiCategory: row.ai_category,
          aiCategoryConfidence: row.ai_category_confidence,
          ownerUserId: row.responsible_user_id,
          ownerName: row.responsible_user_id ? nameById.get(row.responsible_user_id) ?? null : null,
          summary: row.ai_summary,
          updatedAt: row.created_at,
          reviewDueAt: row.review_due_at,
          filePath: row.file_path,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          documentType: assignment?.document_type ?? assignment?.ai_document_type ?? row.primary_document_type,
          purpose: assignment?.purpose ?? assignment?.ai_purpose ?? row.primary_purpose,
          typeConfidence: assignment?.ai_document_type_confidence ?? row.primary_document_type_confidence,
          documentTypeCandidates: (row.document_type_candidates as Candidate[] | null) ?? null,
          purposeCandidates: (row.purpose_candidates as Candidate[] | null) ?? null,
          obligation,
          assignment: assignment
            ? {
                id: assignment.id,
                status: assignment.status,
                document_type: assignment.document_type,
                purpose: assignment.purpose,
                ai_document_type: assignment.ai_document_type,
                ai_document_type_confidence: assignment.ai_document_type_confidence,
                ai_purpose: assignment.ai_purpose,
                ai_purpose_confidence: assignment.ai_purpose_confidence,
                ai_summary: assignment.ai_summary,
                ai_reasoning_full: assignment.ai_reasoning_full,
              }
            : null,
        };
      });
    },
  });

  const me = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const { visible, tabCounts, chipCounts } = useMemo(() => {
    const list = documents.data ?? [];
    const tabCounts = {
      all: list.length,
      uncategorized: list.filter((d) => !d.category).length,
      operations: list.filter((d) => d.category === "operations").length,
      finance: list.filter((d) => d.category === "finance").length,
      contracts: list.filter((d) => d.category === "contracts").length,
      hr: list.filter((d) => d.category === "hr").length,
      reference: list.filter((d) => d.category === "reference").length,
    };
    const chipCounts = {
      mine: list.filter((d) => d.ownerUserId && d.ownerUserId === me.data).length,
      needs_review: list.filter((d) => d.assignment?.status === "needs_review").length,
      overdue: list.filter((d) => isOverdue(d.reviewDueAt)).length,
      linked: list.filter((d) => !!d.obligation).length,
    };
    const visible = list.filter((d) => {
      if (tab === "uncategorized" && d.category) return false;
      if (tab !== "all" && tab !== "uncategorized" && d.category !== tab) return false;
      if (chips.includes("mine") && d.ownerUserId !== me.data) return false;
      if (chips.includes("needs_review") && d.assignment?.status !== "needs_review") return false;
      if (chips.includes("overdue") && !isOverdue(d.reviewDueAt)) return false;
      if (chips.includes("linked") && !d.obligation) return false;
      return true;
    });
    return { visible, tabCounts, chipCounts };
  }, [documents.data, tab, chips, me.data]);

  const tabs: Array<{ id: CategoryTab; label: string }> = [
    { id: "all", label: `All · ${tabCounts.all}` },
    ...DOCUMENT_CATEGORIES.map((c) => ({
      id: c.id as CategoryTab,
      label: `${c.label} · ${tabCounts[c.id]}`,
    })),
    { id: "uncategorized", label: `Uncategorized · ${tabCounts.uncategorized}` },
  ];

  const chipDefs: Array<{ id: ChipFilter; label: string }> = [
    { id: "mine", label: `Mine · ${chipCounts.mine}` },
    { id: "needs_review", label: `Needs review · ${chipCounts.needs_review}` },
    { id: "overdue", label: `Overdue · ${chipCounts.overdue}` },
    { id: "linked", label: `Linked to a requirement · ${chipCounts.linked}` },
  ];

  const toggleChip = (id: ChipFilter) => {
    setChips((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const openReview = (d: LibraryItem) => {
    if (!d.assignment || !d.obligation) return;
    const a = d.assignment;
    setReviewing({
      assignment_id: a.id,
      obligation_id: d.obligation.id,
      obligation_title: d.obligation.title,
      status: a.status,
      evidence_id: d.id,
      file_name: d.title,
      file_path: d.filePath ?? "",
      document_type: a.document_type,
      purpose: a.purpose,
      ai_document_type: a.ai_document_type,
      ai_document_type_confidence: a.ai_document_type_confidence,
      ai_purpose: a.ai_purpose,
      ai_purpose_confidence: a.ai_purpose_confidence,
      document_type_candidates: d.documentTypeCandidates,
      purpose_candidates: d.purposeCandidates,
      ai_summary: a.ai_summary ?? d.summary,
      ai_reasoning: a.ai_reasoning_full,
    });
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">Documents</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The library</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every file has a category and an owner. Linking to a compliance requirement is optional.
      </p>

      <Card className="mt-8 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Upload to the library</CardTitle>
          <CardDescription>
            PDF or image. AI suggests a category — you can override it after upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUpload
            orgId={orgId}
            context="library"
            label="Upload document"
            onAfterUpload={(id) => setEditingId(id)}
          />
        </CardContent>
      </Card>

      <div className="mt-10">
        <div className="mb-3 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {chipDefs.map((c) => {
            const on = chips.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChip(c.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {visible.length ? (
          <ul className="space-y-3">
            {visible.map((d) => {
              const overdue = isOverdue(d.reviewDueAt);
              return (
                <li key={d.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {d.ownerName ?? "Unassigned"} · {new Date(d.updatedAt).toLocaleString()}
                            {d.mimeType ? ` · ${d.mimeType}` : ""}
                            {d.sizeBytes != null ? ` · ${formatBytes(d.sizeBytes)}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                            {categoryLabel(d.category)}
                          </span>
                          {overdue && (
                            <span className="rounded-full bg-status-missing-bg px-2 py-0.5 text-xs font-medium text-status-missing">
                              Overdue
                            </span>
                          )}
                          {d.assignment?.status === "needs_review" && (
                            <span className="rounded-full bg-status-partial-bg px-2 py-0.5 text-xs font-medium text-status-partial">
                              Needs review
                            </span>
                          )}
                        </div>
                      </div>

                      {d.summary && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>{d.summary}</span>
                        </p>
                      )}

                      {d.obligation && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">Requirement:</span>
                          <Link
                            to="/o/$orgId/obligations/$id"
                            params={{ orgId, id: d.obligation.id }}
                            className="rounded-md bg-muted px-2 py-0.5 hover:bg-muted/70 hover:underline"
                          >
                            {d.obligation.title}
                          </Link>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {d.assignment?.status === "needs_review" && (
                          <Button size="sm" onClick={() => openReview(d)}>
                            Review assignment
                          </Button>
                        )}
                        {d.filePath && (
                          <Button size="sm" variant="outline" onClick={() => openFile(d.filePath!)}>
                            <ExternalLink className="mr-1 h-3 w-3" />
                            View
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(d.id)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      </div>
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

      <DocumentReviewPanel
        open={!!reviewing}
        onOpenChange={(v) => {
          if (!v) setReviewing(null);
        }}
        assignment={reviewing}
      />
      <DocumentMetaSheet
        open={!!editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null);
        }}
        orgId={orgId}
        evidenceId={editingId}
      />
    </div>
  );
}

function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
