import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { confirmAssignment, unlinkAssignment } from "@/lib/document-assignment.functions";
import { updateDocumentMeta } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Check, X, Sparkles, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
import { DocumentPreview } from "@/components/document-preview";

export type Candidate = { label: string; confidence: number };

/** Confirm type, filename, and optional requirement link after upload or from the checklist. */
export type ReviewAssignment = {
  assignment_id: string | null;
  obligation_id: string | null;
  obligation_title: string | null;
  status: "needs_review" | "verified" | null;
  evidence_id: string;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  suggested_file_name?: string | null;
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
  const { t } = useT();
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmAssignment);
  const unlinkFn = useServerFn(unlinkAssignment);
  const saveMeta = useServerFn(updateDocumentMeta);

  const [editing, setEditing] = useState(false);
  const [docType, setDocType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (assignment) {
      setDocType(assignment.document_type ?? assignment.ai_document_type ?? "");
      setPurpose(assignment.purpose ?? assignment.ai_purpose ?? "");
      const suggested = assignment.suggested_file_name?.trim();
      setFileName(suggested || assignment.file_name);
      setEditing(false);
    }
  }, [
    assignment?.evidence_id,
    assignment?.assignment_id,
    assignment?.file_name,
    assignment?.suggested_file_name,
  ]);

  if (!assignment) return null;

  const docConf = Math.round((assignment.ai_document_type_confidence ?? 0) * 100);
  const purConf = Math.round((assignment.ai_purpose_confidence ?? 0) * 100);
  const docCandidates = (assignment.document_type_candidates ?? []).filter((c) => c?.label);
  const purCandidates = (assignment.purpose_candidates ?? []).filter((c) => c?.label);

  const suggestedDoc = assignment.document_type ?? assignment.ai_document_type;
  const suggestedPurpose = assignment.purpose ?? assignment.ai_purpose;
  const suggestedName = assignment.suggested_file_name?.trim() || null;
  const linked = !!assignment.assignment_id;

  const runAfterChange = async () => {
    await qc.invalidateQueries();
  };

  const saveNameIfChanged = async () => {
    const next = fileName.trim();
    if (!next || next === assignment.file_name) return;
    await saveMeta({ data: { evidence_id: assignment.evidence_id, file_name: next } });
  };

  const handleConfirm = async (type: string, purposeValue: string) => {
    setBusy(true);
    try {
      await saveNameIfChanged();
      if (assignment.assignment_id) {
        await confirmFn({
          data: {
            assignment_id: assignment.assignment_id,
            document_type: type,
            purpose: purposeValue,
          },
        });
        toast.success(t("review.verified"));
      } else {
        toast.success(t("meta.saved"));
      }
      await runAfterChange();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!assignment.assignment_id) return;
    setBusy(true);
    try {
      await unlinkFn({ data: { assignment_id: assignment.assignment_id } });
      toast.success(t("workflow.unlinked"));
      await runAfterChange();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("workflow.unlinkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const canOneClickConfirm =
    !editing &&
    (!linked || (!!suggestedDoc && !!suggestedPurpose));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p className="eyebrow">{t("review.eyebrow")}</p>
          <SheetTitle className="mt-1 text-xl">{t("review.title")}</SheetTitle>
          <SheetDescription>
            {linked && assignment.obligation_title
              ? t("review.assignedTo", { title: assignment.obligation_title })
              : t("review.unassigned")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {assignment.file_path && (
            <DocumentPreview
              filePath={assignment.file_path}
              mimeType={assignment.mime_type}
              title={assignment.file_name}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="review-filename">{t("review.fileName")}</Label>
            <Input
              id="review-filename"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            {suggestedName && suggestedName !== fileName && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setFileName(suggestedName)}
              >
                {t("meta.useSuggested")}: {suggestedName}
              </button>
            )}
          </div>

          {!editing ? (
            <div className="space-y-4">
              <ReviewField
                label={t("review.documentType")}
                value={suggestedDoc}
                confidence={assignment.document_type ? null : docConf}
              />
              <ReviewField
                label={t("review.purpose")}
                value={suggestedPurpose}
                confidence={assignment.purpose ? null : purConf}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <EditCandidate
                title={t("review.documentType")}
                value={docType}
                candidates={docCandidates}
                onChange={setDocType}
              />
              <EditCandidate
                title={t("review.purpose")}
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
                {t("review.aiReasoning")}
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
                  onClick={() =>
                    handleConfirm(suggestedDoc ?? "Document", suggestedPurpose ?? "Operational Documentation")
                  }
                >
                  <Check className="mr-1 h-4 w-4" />
                  {linked ? t("review.confirm") : t("common.save")}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-4 w-4" />
                  {t("common.edit")}
                </Button>
                {linked && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={handleUnlink}
                    className="text-muted-foreground"
                  >
                    <X className="mr-1 h-4 w-4" />
                    {t("review.unlink")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  disabled={busy || (linked && (!docType.trim() || !purpose.trim()))}
                  onClick={() =>
                    handleConfirm(
                      docType.trim() || "Document",
                      purpose.trim() || "Operational Documentation",
                    )
                  }
                >
                  <Check className="mr-1 h-4 w-4" />
                  {linked ? t("review.saveVerify") : t("common.save")}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  {t("common.cancel")}
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
                value === c.label && "border-primary bg-primary/10 text-foreground",
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
