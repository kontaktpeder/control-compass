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
