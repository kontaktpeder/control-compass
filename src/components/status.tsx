// Cool Slate design tokens for status-colored surfaces.
import { cn } from "@/lib/utils";

export type Status = "satisfied" | "partially_satisfied" | "missing" | "needs_review" | "unknown";

export const STATUS_LABEL: Record<Status, string> = {
  satisfied: "Satisfied",
  partially_satisfied: "Partial",
  missing: "Missing",
  needs_review: "Needs review",
  unknown: "Unknown",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
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
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-muted-foreground">confidence —</span>;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="text-xs text-muted-foreground">
      confidence <span className="font-medium text-foreground">{pct}%</span>
    </span>
  );
}

export type DocLifecycle = "no_document" | "needs_review" | "on_file";

export function DocumentStatusPill({ state, className }: { state: DocLifecycle; className?: string }) {
  const meta: Record<DocLifecycle, { label: string; tone: string; dot: string }> = {
    no_document:  { label: "No document",  tone: "bg-status-unknown-bg text-status-unknown",     dot: "bg-status-unknown" },
    needs_review: { label: "Needs review", tone: "bg-status-partial-bg text-status-partial",     dot: "bg-status-partial" },
    on_file:      { label: "On file",      tone: "bg-status-satisfied-bg text-status-satisfied", dot: "bg-status-satisfied" },
  };
  const m = meta[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.tone, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
