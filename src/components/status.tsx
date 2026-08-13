// Cool Slate design tokens for status-colored surfaces.
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export type Status = "satisfied" | "partially_satisfied" | "missing" | "needs_review" | "unknown";

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const { t } = useT();
  const tone: Record<Status, string> = {
    satisfied: "bg-status-satisfied-bg text-status-satisfied",
    partially_satisfied: "bg-status-partial-bg text-status-partial",
    missing: "bg-status-missing-bg text-status-missing",
    needs_review: "bg-status-partial-bg text-status-partial",
    unknown: "bg-status-unknown-bg text-status-unknown",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      tone[status],
      className,
    )}>
      {t(`status.${status}` as MessageKey)}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  const { t } = useT();
  if (value == null) return <span className="text-xs text-muted-foreground">{t("confidence.label")} —</span>;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="text-xs text-muted-foreground">
      {t("confidence.label")} <span className="font-medium text-foreground">{pct}%</span>
    </span>
  );
}

export type DocLifecycle = "no_document" | "needs_review" | "on_file";

export function DocumentStatusPill({ state, className }: { state: DocLifecycle; className?: string }) {
  const { t } = useT();
  const meta: Record<DocLifecycle, { key: MessageKey; tone: string; dot: string }> = {
    no_document:  { key: "doc.no_document",  tone: "bg-status-unknown-bg text-status-unknown",     dot: "bg-status-unknown" },
    needs_review: { key: "doc.needs_review", tone: "bg-status-partial-bg text-status-partial",     dot: "bg-status-partial" },
    on_file:      { key: "doc.on_file",      tone: "bg-status-satisfied-bg text-status-satisfied", dot: "bg-status-satisfied" },
  };
  const m = meta[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.tone, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {t(m.key)}
    </span>
  );
}
