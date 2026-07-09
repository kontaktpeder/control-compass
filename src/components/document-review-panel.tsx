import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmAssignment, rejectAssignment } from "@/lib/document-assignment.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Check, X, Sparkles, FileText, ExternalLink, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type Candidate = { label: string; confidence: number };

/** What the review panel needs to operate. Sourced from an assignment row +
 *  its evidence + candidate hints from the evidence AI pass. */
export type ReviewAssignment = {
  assignment_id: string;
  obligation_id: string;
  obligation_title: string;
  status: "needs_review" | "verified";
  // Evidence file
  evidence_id: string;
  file_name: string;
  file_path: string;
  // Values (confirmed > AI suggestion)
  document_type: string | null;
  purpose: string | null;
  ai_document_type: string | null;
  ai_document_type_confidence: number | null;
  ai_purpose: string | null;
  ai_purpose_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  purpose_candidates: Candidate[] | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: ReviewAssignment | null;
};

export function DocumentReviewPanel({ open, onOpenChange, assignment }: Props) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmAssignment);
  const rejectFn = useServerFn(rejectAssignment);

  const [editing, setEditing] = useState(false);
  const [docType, setDocType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (assignment) {
      setDocType(assignment.document_type ?? assignment.ai_document_type ?? "");
      setPurpose(assignment.purpose ?? assignment.ai_purpose ?? "");
      setEditing(false);
    }
  }, [assignment?.assignment_id]);

  if (!assignment) return null;

  const docConf = Math.round((assignment.ai_document_type_confidence ?? 0) * 100);
  const purConf = Math.round((assignment.ai_purpose_confidence ?? 0) * 100);
  const docCandidates = (assignment.document_type_candidates ?? []).filter((c) => c?.label);
  const purCandidates = (assignment.purpose_candidates ?? []).filter((c) => c?.label);

  const suggestedDoc = assignment.document_type ?? assignment.ai_document_type;
  const suggestedPurpose = assignment.purpose ?? assignment.ai_purpose;

  const runAfterChange = async () => {
    await qc.invalidateQueries();
  };

  const handleConfirm = async (type: string, purposeValue: string) => {
    setBusy(true);
    try {
      await confirmFn({
        data: {
          assignment_id: assignment.assignment_id,
          document_type: type,
          purpose: purposeValue,
        },
      });
      toast.success("Verified");
      await runAfterChange();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectFn({ data: { assignment_id: assignment.assignment_id } });
      toast.info("Reset to needs review");
      await runAfterChange();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    const { data, error } = await supabase.storage
      .from("evidence")
      .createSignedUrl(assignment.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const canOneClickConfirm = !editing && !!suggestedDoc && !!suggestedPurpose;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p className="eyebrow">Review document</p>
          <SheetTitle className="mt-1 text-xl">
            Confirm what this document is
          </SheetTitle>
          <SheetDescription>
            Assigned to <span className="font-medium text-foreground">{assignment.obligation_title}</span>.
            Confirm the AI's suggestion, edit it, or reject it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <button
            onClick={openFile}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3 text-left transition hover:bg-muted/50"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{assignment.file_name}</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>

          {!editing ? (
            <div className="space-y-4">
              <ReviewField
                label="Document type"
                value={suggestedDoc}
                confidence={assignment.document_type ? null : docConf}
              />
              <ReviewField
                label="Purpose"
                value={suggestedPurpose}
                confidence={assignment.purpose ? null : purConf}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <EditCandidate
                title="Document type"
                value={docType}
                candidates={docCandidates}
                onChange={setDocType}
              />
              <EditCandidate
                title="Purpose"
                value={purpose}
                candidates={purCandidates}
                onChange={setPurpose}
              />
            </div>
          )}

          {(assignment.ai_summary || assignment.ai_reasoning) && (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                AI reasoning
              </p>
              {assignment.ai_summary && (
                <p className="mt-2 text-sm text-muted-foreground">{assignment.ai_summary}</p>
              )}
              {assignment.ai_reasoning && (
                <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground/80">
                  {assignment.ai_reasoning}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!editing ? (
              <>
                <Button
                  disabled={busy || !canOneClickConfirm}
                  onClick={() => handleConfirm(suggestedDoc!, suggestedPurpose!)}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirm & verify
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                {assignment.status === "verified" ? null : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={handleReject}
                    className="text-muted-foreground"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject suggestion
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  disabled={busy || !docType.trim() || !purpose.trim()}
                  onClick={() => handleConfirm(docType.trim(), purpose.trim())}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Save & verify
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewField({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string | null;
  confidence: number | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className="text-sm font-medium">{value?.trim() ? value : "—"}</p>
        {value && confidence != null && (
          <span className="text-xs text-muted-foreground">AI {confidence}%</span>
        )}
      </div>
    </div>
  );
}

function EditCandidate({
  title,
  value,
  candidates,
  onChange,
}: {
  title: string;
  value: string;
  candidates: Candidate[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      {candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidates.slice(0, 4).map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange(c.label)}
              className={cn(
                "rounded-full border border-border px-2 py-0.5 text-xs transition hover:bg-muted",
                value === c.label && "border-primary bg-primary/10 text-foreground"
              )}
            >
              {c.label} · {Math.round(c.confidence * 100)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
