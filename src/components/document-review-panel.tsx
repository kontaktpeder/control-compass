import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmDocument, rejectDocument, assessObligation, generateTasks } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Check, X, Sparkles, FileText, ExternalLink, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type Candidate = { label: string; confidence: number };

export type ReviewEvidence = {
  id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  primary_document_type: string | null;
  primary_document_type_confidence: number | null;
  document_type_candidates: Candidate[] | null;
  primary_purpose: string | null;
  primary_purpose_confidence: number | null;
  purpose_candidates: Candidate[] | null;
  review_status: string | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
  links?: Array<{ obligation_id: string; title: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: ReviewEvidence | null;
};

export function DocumentReviewPanel({ open, onOpenChange, evidence }: Props) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmDocument);
  const rejectFn = useServerFn(rejectDocument);
  const assessFn = useServerFn(assessObligation);
  const regenFn = useServerFn(generateTasks);

  const [editing, setEditing] = useState(false);
  const [docType, setDocType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (evidence) {
      setDocType(evidence.primary_document_type ?? "");
      setPurpose(evidence.primary_purpose ?? "");
      setEditing(false);
    }
  }, [evidence?.id]);

  if (!evidence) return null;

  const docConf = Math.round((evidence.primary_document_type_confidence ?? 0) * 100);
  const purConf = Math.round((evidence.primary_purpose_confidence ?? 0) * 100);
  const docCandidates = (evidence.document_type_candidates ?? []).filter((c) => c?.label);
  const purCandidates = (evidence.purpose_candidates ?? []).filter((c) => c?.label);

  const runAfterChange = async () => {
    if (evidence.links?.length) {
      await Promise.all(evidence.links.map((l) => assessFn({ data: { obligation_id: l.obligation_id } })));
      await regenFn({ data: { org_id: evidence.org_id } });
    }
    await qc.invalidateQueries();
  };

  const handleConfirm = async (type: string, purposeValue: string) => {
    setBusy(true);
    try {
      await confirmFn({ data: { evidence_id: evidence.id, document_type: type, purpose: purposeValue } });
      toast.success("Confirmed");
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
      await rejectFn({ data: { evidence_id: evidence.id, unlink: false } });
      toast.info("Marked as unknown — the AI classification was rejected");
      await runAfterChange();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(evidence.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const canOneClickConfirm =
    !editing && !!evidence.primary_document_type && !!evidence.primary_purpose;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p className="eyebrow">Review document</p>
          <SheetTitle className="mt-1 text-xl">Confirm what this document is</SheetTitle>
          <SheetDescription>
            The AI suggested a classification. Confirm, edit, or reject it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <button
            onClick={openFile}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3 text-left transition hover:bg-muted/50"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{evidence.file_name}</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>

          {!editing ? (
            <div className="space-y-4">
              <ReviewField
                label="Document type"
                value={evidence.primary_document_type}
                confidence={docConf}
              />
              <ReviewField
                label="Purpose"
                value={evidence.primary_purpose}
                confidence={purConf}
              />
              {evidence.links && evidence.links.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked to</p>
                  <ul className="mt-1 space-y-0.5">
                    {evidence.links.map((l) => (
                      <li key={l.obligation_id} className="text-sm">{l.title}</li>
                    ))}
                  </ul>
                </div>
              )}
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

          {(evidence.ai_summary || evidence.ai_reasoning) && (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                AI reasoning
              </p>
              {evidence.ai_summary && (
                <p className="mt-2 text-sm text-muted-foreground">{evidence.ai_summary}</p>
              )}
              {evidence.ai_reasoning && (
                <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground/80">
                  {evidence.ai_reasoning}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!editing ? (
              <>
                <Button
                  disabled={busy || !canOneClickConfirm}
                  onClick={() => handleConfirm(evidence.primary_document_type!, evidence.primary_purpose!)}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirm
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit classification
                </Button>
                <Button variant="ghost" disabled={busy} onClick={handleReject} className="text-muted-foreground">
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              </>
            ) : (
              <>
                <Button
                  disabled={busy || !docType.trim() || !purpose.trim()}
                  onClick={() => handleConfirm(docType.trim(), purpose.trim())}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Save & confirm
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
  confidence: number;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className="text-sm font-medium">{value?.trim() ? value : "—"}</p>
        {value && (
          <span className="text-xs text-muted-foreground">{confidence}%</span>
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
