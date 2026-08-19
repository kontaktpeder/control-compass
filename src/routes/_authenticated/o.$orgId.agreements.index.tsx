import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/components/locale-provider";
import { useLibraryLayout } from "@/hooks/use-library-layout";
import { AgreementUpload } from "@/components/agreement-upload";
import {
  LibraryBrowser,
  LibraryEmpty,
  LibraryPageShell,
  useSelectedIds,
  type LibraryEntry,
  type LibraryMenuAction,
} from "@/components/library-browser";
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
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/o/$orgId/agreements/")({
  component: AgreementsPage,
});

type AgreementListRow = {
  id: string;
  title: string;
  body: string | null;
  metadata: Json;
  updated_at: string;
};

function fileMeta(metadata: Json): { filePath: string | null; mimeType: string | null } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { filePath: null, mimeType: null };
  }
  const filePath = typeof metadata.file_path === "string" ? metadata.file_path : null;
  const mimeType = typeof metadata.mime_type === "string" ? metadata.mime_type : null;
  return { filePath, mimeType };
}

function AgreementsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/agreements/" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useT();
  const [layout, setLayout] = useLibraryLayout();
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const { selectedIds, toggle, clear } = useSelectedIds();

  const list = useQuery({
    queryKey: ["agreements", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("id, title, body, metadata, updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgreementListRow[];
    },
  });

  const byId = useMemo(() => new Map((list.data ?? []).map((a) => [a.id, a])), [list.data]);

  const items: LibraryEntry[] = useMemo(
    () =>
      (list.data ?? []).map((a) => {
        const file = fileMeta(a.metadata);
        return {
          id: a.id,
          title: a.title,
          previewText: a.body,
          filePath: file.filePath,
          mimeType: file.mimeType,
        };
      }),
    [list.data],
  );

  const open = (id: string) => {
    void navigate({ to: "/o/$orgId/agreements/$id", params: { orgId, id } });
  };

  const deleteIds = async (ids: string[]) => {
    const paths = ids
      .map((id) => fileMeta(byId.get(id)?.metadata ?? null).filePath)
      .filter((p): p is string => !!p);
    if (paths.length) {
      const { error } = await supabase.storage.from("evidence").remove(paths);
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase.from("agreements").delete().in("id", ids);
    if (error) throw new Error(error.message);
    toast.success(t("agreements.deleted"));
    clear();
    await qc.invalidateQueries({ queryKey: ["agreements", orgId] });
  };

  const menuFor = (item: LibraryEntry): LibraryMenuAction[] => [
    { id: "open", label: t("common.view"), onSelect: () => open(item.id) },
    {
      id: "delete",
      label: t("common.delete"),
      destructive: true,
      onSelect: () => setPendingDelete([item.id]),
    },
  ];

  const selectedCount = selectedIds.size;

  return (
    <LibraryPageShell
      mutedTop={
        <div className="mx-auto max-w-6xl px-6 py-6">
          <p className="mb-3 text-sm text-muted-foreground">{t("agreements.startNew")}</p>
          <AgreementUpload orgId={orgId} />
        </div>
      }
    >
      {list.isError && (
        <p className="mb-4 text-sm text-destructive">
          {list.error instanceof Error ? list.error.message : t("common.failedLoad")}
        </p>
      )}
      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <LibraryBrowser
          items={items}
          layout={layout}
          onLayoutChange={setLayout}
          heading={t("agreements.recent")}
          onOpen={(item) => open(item.id)}
          menuFor={menuFor}
          selectedIds={selectedIds}
          onToggleSelect={toggle}
          toolbarStart={
            selectedCount > 0 ? (
              <Button size="sm" variant="destructive" onClick={() => setPendingDelete([...selectedIds])}>
                {t("common.delete")} · {selectedCount}
              </Button>
            ) : null
          }
          empty={<LibraryEmpty>{t("agreements.emptyTitle")}</LibraryEmpty>}
        />
      )}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agreements.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("agreements.deleteConfirm", { count: pendingDelete?.length ?? 0 })}
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
                  toast.error(err instanceof Error ? err.message : t("agreements.deleteFailed"));
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
