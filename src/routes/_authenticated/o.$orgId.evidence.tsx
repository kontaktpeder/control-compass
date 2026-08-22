import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { classifyEvidence } from "@/lib/ai.functions";
import { unlinkAssignment } from "@/lib/document-assignment.functions";
import { DocumentUpload } from "@/components/document-upload";
import { DocumentReviewPanel, type ReviewAssignment } from "@/components/document-review-panel";
import { DocumentMetaSheet } from "@/components/document-meta-sheet";
import { RegisterCompanyGuide } from "@/components/register-company";
import {
  LibraryBrowser,
  LibraryEmpty,
  LibraryPageShell,
  useSelectedIds,
  type LibraryEntry,
  type LibraryMenuAction,
} from "@/components/library-browser";
import { useLibraryLayout } from "@/hooks/use-library-layout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useT } from "@/components/locale-provider";
import { localizeObligationTitle } from "@/lib/playbook-i18n";
import { isDocumentCategory, type LibraryItem } from "@/lib/library";

const documentsSearch = z.object({
  mode: z.enum(["register", "food"]).optional(),
});

export const Route = createFileRoute("/_authenticated/o/$orgId/evidence")({
  validateSearch: documentsSearch.parse,
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

function DocumentsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/evidence" });
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, locale } = useT();
  const [layout, setLayout] = useLibraryLayout();
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const { selectedIds, toggle, clear } = useSelectedIds();
  const classify = useServerFn(classifyEvidence);
  const unlinkFn = useServerFn(unlinkAssignment);

  const setMode = (next: "register" | "food" | undefined) => {
    void navigate({
      to: "/o/$orgId/evidence",
      params: { orgId },
      search: next ? { mode: next } : {},
    });
  };

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
      const nameById = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Unnamed"]),
      );

      const obById = new Map((obs.data ?? []).map((o) => [o.id, { id: o.id, title: o.title }]));
      const assignmentByEv = new Map<string, AssignmentRow>();
      for (const l of (links.data ?? []) as unknown as AssignmentRow[]) {
        if (!assignmentByEv.has(l.evidence_id)) assignmentByEv.set(l.evidence_id, l);
      }

      return (ev.data ?? []).map((row) => {
        const assignment = assignmentByEv.get(row.id) ?? null;
        const obligation = assignment ? (obById.get(assignment.obligation_id) ?? null) : null;
        return {
          id: row.id,
          kind: "file" as const,
          title: row.file_name,
          category: isDocumentCategory(row.category) ? row.category : null,
          aiCategory: isDocumentCategory(row.ai_category) ? row.ai_category : null,
          aiCategoryConfidence: row.ai_category_confidence,
          ownerUserId: row.responsible_user_id,
          ownerName: row.responsible_user_id
            ? (nameById.get(row.responsible_user_id) ?? null)
            : null,
          summary: row.ai_summary,
          updatedAt: row.created_at,
          reviewDueAt: row.review_due_at,
          filePath: row.file_path,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          documentType:
            assignment?.document_type ?? assignment?.ai_document_type ?? row.primary_document_type,
          purpose: assignment?.purpose ?? assignment?.ai_purpose ?? row.primary_purpose,
          typeConfidence:
            assignment?.ai_document_type_confidence ?? row.primary_document_type_confidence,
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

  const items: LibraryEntry[] = useMemo(
    () =>
      (documents.data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        previewText: d.summary,
        mimeType: d.mimeType,
        filePath: d.filePath,
      })),
    [documents.data],
  );

  const byId = useMemo(
    () => new Map((documents.data ?? []).map((d) => [d.id, d])),
    [documents.data],
  );

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? t("library.openFailed"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const openReview = (d: LibraryItem) => {
    if (!d.assignment || !d.obligation) return;
    const a = d.assignment;
    setReviewing({
      assignment_id: a.id,
      obligation_id: d.obligation.id,
      obligation_title: localizeObligationTitle(locale, d.obligation.title),
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

  const interpretWithAi = async (d: LibraryItem) => {
    toast.info(t("upload.understanding"));
    try {
      await classify({
        data: {
          evidence_id: d.id,
          hint_obligation_id: d.obligation?.id ?? null,
          upload_context: "library",
          force_ai: true,
        },
      });
      toast.success(t("library.interpreted"));
      await qc.invalidateQueries({ queryKey: ["documents", orgId] });
      await qc.invalidateQueries({ queryKey: ["register-company", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteIds = async (ids: string[]) => {
    const rows = ids.map((id) => byId.get(id)).filter((d): d is LibraryItem => !!d);
    const paths = rows.map((r) => r.filePath).filter((p): p is string => !!p);
    if (paths.length) {
      const { error } = await supabase.storage.from("evidence").remove(paths);
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase.from("evidence").delete().in("id", ids);
    if (error) throw new Error(error.message);
    toast.success(t("library.deleted"));
    clear();
    await qc.invalidateQueries({ queryKey: ["documents", orgId] });
    await qc.invalidateQueries({ queryKey: ["register-company", orgId] });
  };

  const menuFor = (entry: LibraryEntry): LibraryMenuAction[] => {
    const d = byId.get(entry.id);
    if (!d) return [];
    const actions: LibraryMenuAction[] = [];
    if (d.filePath) {
      actions.push({ id: "open", label: t("common.view"), onSelect: () => openFile(d.filePath!) });
    }
    if (d.assignment?.status === "needs_review") {
      actions.push({
        id: "review",
        label: t("library.reviewAssignment"),
        onSelect: () => openReview(d),
      });
    }
    actions.push({ id: "edit", label: t("common.edit"), onSelect: () => setEditingId(d.id) });
    actions.push({
      id: "interpret",
      label: t("library.interpretAi"),
      onSelect: () => interpretWithAi(d),
    });
    if (d.assignment) {
      actions.push({
        id: "unlink",
        label: t("library.unlink"),
        onSelect: () => {
          void (async () => {
            try {
              await unlinkFn({ data: { assignment_id: d.assignment!.id } });
              toast.success(t("workflow.unlinked"));
              await qc.invalidateQueries({ queryKey: ["documents", orgId] });
              await qc.invalidateQueries({ queryKey: ["register-company", orgId] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : t("workflow.unlinkFailed"));
            }
          })();
        },
      });
    }
    actions.push({
      id: "delete",
      label: t("common.delete"),
      destructive: true,
      onSelect: () => setPendingDelete([d.id]),
    });
    return actions;
  };

  const selectedCount = selectedIds.size;

  return (
    <LibraryPageShell
      mutedTop={
        mode ? undefined : (
        <div className="mx-auto max-w-6xl px-6 py-6">
          <p className="mb-3 text-sm text-muted-foreground">{t("library.startNew")}</p>
          <DocumentUpload orgId={orgId} context="library" appearance="tile" />
        </div>
        )
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={!mode ? "secondary" : "outline"}
          onClick={() => setMode(undefined)}
        >
          {t("library.filterAll")}
        </Button>
        <Button
          size="sm"
          variant={mode === "register" ? "secondary" : "outline"}
          onClick={() => setMode("register")}
        >
          {t("library.registerMode")}
        </Button>
        <Button
          size="sm"
          variant={mode === "food" ? "secondary" : "outline"}
          onClick={() => setMode("food")}
        >
          {t("library.foodMode")}
        </Button>
      </div>

      {mode && <RegisterCompanyGuide orgId={orgId} topic={mode} onReview={setReviewing} />}

      {!mode && (documents.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <LibraryBrowser
          items={items}
          layout={layout}
          onLayoutChange={setLayout}
          heading={t("library.recent")}
          onOpen={(item) => {
            const d = byId.get(item.id);
            if (d?.filePath) void openFile(d.filePath);
          }}
          menuFor={menuFor}
          selectedIds={selectedIds}
          onToggleSelect={toggle}
          toolbarStart={
            selectedCount > 0 ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setPendingDelete([...selectedIds])}
              >
                {t("common.delete")} · {selectedCount}
              </Button>
            ) : undefined
          }
          empty={<LibraryEmpty>{t("library.empty")}</LibraryEmpty>}
        />
      ))}

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
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("library.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.deleteConfirm", { count: pendingDelete?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!pendingDelete?.length) return;
                try {
                  await deleteIds(pendingDelete);
                  setPendingDelete(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t("library.deleteFailed"));
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LibraryPageShell>
  );
}
