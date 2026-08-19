import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, LayoutGrid, List, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
import type { LibraryLayout } from "@/hooks/use-library-layout";

export type LibraryEntry = {
  id: string;
  title: string;
  previewText?: string | null;
  mimeType?: string | null;
  filePath?: string | null;
};

export type LibraryMenuAction = {
  id: string;
  label: string;
  onSelect: () => void;
};

type Props = {
  items: LibraryEntry[];
  layout: LibraryLayout;
  onLayoutChange: (layout: LibraryLayout) => void;
  onOpen: (item: LibraryEntry) => void;
  menuFor: (item: LibraryEntry) => LibraryMenuAction[];
  toolbarStart?: ReactNode;
  empty: ReactNode;
  heading: string;
};

export function LibraryBrowser({
  items,
  layout,
  onLayoutChange,
  onOpen,
  menuFor,
  toolbarStart,
  empty,
  heading,
}: Props) {
  const { t } = useT();
  const previewUrls = usePreviewUrls(items);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{heading}</h2>
        {toolbarStart}
        <div className="flex items-center rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="icon"
            variant={layout === "grid" ? "secondary" : "ghost"}
            className="h-8 w-8"
            aria-label={t("library.layoutGrid")}
            onClick={() => onLayoutChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={layout === "list" ? "secondary" : "ghost"}
            className="h-8 w-8"
            aria-label={t("library.layoutList")}
            onClick={() => onLayoutChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        empty
      ) : layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <LibraryCard
                item={item}
                previewUrl={item.filePath ? previewUrls[item.filePath] : undefined}
                menu={menuFor(item)}
                onOpen={() => onOpen(item)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <LibraryRow item={item} menu={menuFor(item)} onOpen={() => onOpen(item)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LibraryCard({
  item,
  previewUrl,
  menu,
  onOpen,
}: {
  item: LibraryEntry;
  previewUrl?: string;
  menu: LibraryMenuAction[];
  onOpen: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-sm border border-border bg-white shadow-sm transition hover:border-primary/40 hover:shadow-md"
      >
        <div className="aspect-[3/4] overflow-hidden bg-muted/40">
          <PreviewSurface item={item} url={previewUrl} />
        </div>
      </button>
      <div className="mt-2 flex items-center gap-1.5">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm">{item.title}</p>
        <ItemMenu actions={menu} />
      </div>
    </div>
  );
}

function LibraryRow({
  item,
  menu,
  onOpen,
}: {
  item: LibraryEntry;
  menu: LibraryMenuAction[];
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm">{item.title}</span>
      </button>
      <ItemMenu actions={menu} />
    </div>
  );
}

function ItemMenu({ actions }: { actions: LibraryMenuAction[] }) {
  const { t } = useT();
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label={t("library.more")}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={a.onSelect}>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PreviewSurface({ item, url }: { item: LibraryEntry; url?: string }) {
  const isImage = !!item.mimeType?.startsWith("image/");
  const isPdf = item.mimeType === "application/pdf";

  if (isImage && url) {
    return <img src={url} alt="" className="h-full w-full object-cover object-top" />;
  }

  if (isPdf && url) {
    return (
      <iframe
        title={item.title}
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
        className="pointer-events-none h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-white"
      />
    );
  }

  return (
    <div className="h-full bg-white px-3 py-3 text-left">
      <p className="line-clamp-4 text-[11px] font-semibold leading-snug text-foreground/80">{item.title}</p>
      {item.previewText ? (
        <p className="mt-2 line-clamp-[12] whitespace-pre-wrap text-[9px] leading-relaxed text-muted-foreground">
          {item.previewText}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="h-1.5 w-11/12 rounded-full bg-muted" />
          <div className="h-1.5 w-4/5 rounded-full bg-muted" />
          <div className="h-1.5 w-10/12 rounded-full bg-muted" />
        </div>
      )}
    </div>
  );
}

function usePreviewUrls(items: LibraryEntry[]) {
  const paths = useMemo(
    () =>
      items
        .filter((i) => i.filePath && (i.mimeType?.startsWith("image/") || i.mimeType === "application/pdf"))
        .map((i) => i.filePath!)
        .sort(),
    [items],
  );
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!paths.length) {
      setUrls({});
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("evidence")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
        }
        setUrls(next);
      });
    return () => {
      cancelled = true;
    };
    // paths is derived from items; key captures membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

export function LibraryEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function LibraryPageShell({ children, mutedTop }: { children: ReactNode; mutedTop?: ReactNode }) {
  return (
    <div>
      {mutedTop && <div className="border-b border-border bg-muted/40">{mutedTop}</div>}
      <div className={cn("mx-auto max-w-6xl px-6", mutedTop ? "py-8" : "py-10")}>{children}</div>
    </div>
  );
}
