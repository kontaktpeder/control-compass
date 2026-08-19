import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/components/locale-provider";
import { useLibraryLayout } from "@/hooks/use-library-layout";
import {
  LibraryBrowser,
  LibraryEmpty,
  LibraryPageShell,
  type LibraryEntry,
  type LibraryMenuAction,
} from "@/components/library-browser";

export const Route = createFileRoute("/_authenticated/o/$orgId/agreements/")({
  component: AgreementsPage,
});

type AgreementListRow = {
  id: string;
  title: string;
  body: string | null;
  updated_at: string;
};

function AgreementsPage() {
  const { orgId } = useParams({ from: "/_authenticated/o/$orgId/agreements/" });
  const navigate = useNavigate();
  const { t } = useT();
  const [layout, setLayout] = useLibraryLayout();

  const list = useQuery({
    queryKey: ["agreements", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("id, title, body, updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgreementListRow[];
    },
  });

  const items: LibraryEntry[] = useMemo(
    () =>
      (list.data ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        previewText: a.body,
      })),
    [list.data],
  );

  const open = (id: string) => {
    void navigate({ to: "/o/$orgId/agreements/$id", params: { orgId, id } });
  };

  const menuFor = (item: LibraryEntry): LibraryMenuAction[] => [
    { id: "open", label: t("common.view"), onSelect: () => open(item.id) },
  ];

  return (
    <LibraryPageShell>
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
        empty={<LibraryEmpty>{t("agreements.emptyTitle")}</LibraryEmpty>}
      />
      )}
    </LibraryPageShell>
  );
}
