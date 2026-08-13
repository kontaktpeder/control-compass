import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { updateDocumentMeta } from "@/lib/library.functions";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { useT } from "@/components/locale-provider";
import type { MessageKey } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  evidenceId: string | null;
};

const NONE = "__none__";

export function DocumentMetaSheet({ open, onOpenChange, orgId, evidenceId }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(updateDocumentMeta);
  const [category, setCategory] = useState<string>(NONE);
  const [ownerId, setOwnerId] = useState<string>(NONE);
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  const doc = useQuery({
    queryKey: ["document-meta", evidenceId],
    enabled: open && !!evidenceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select(
          "id, file_name, category, ai_category, ai_category_confidence, responsible_user_id, review_due_at, ai_summary",
        )
        .eq("id", evidenceId!)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const members = useQuery({
    queryKey: ["org-members", orgId],
    enabled: open,
    queryFn: async () => {
      const { data: mems, error: mErr } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("org_id", orgId);
      if (mErr) throw new Error(mErr.message);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as Array<{ id: string; name: string }>;
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw new Error(pErr.message);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || t("common.unnamed")]));
      return ids.map((id) => ({ id, name: nameById.get(id) ?? t("common.unnamed") }));
    },
  });

  useEffect(() => {
    if (!doc.data) return;
    setCategory(doc.data.category ?? NONE);
    setOwnerId(doc.data.responsible_user_id ?? NONE);
    setReviewDueAt(doc.data.review_due_at ?? "");
  }, [doc.data?.id, doc.data?.category, doc.data?.responsible_user_id, doc.data?.review_due_at]);

  const handleSave = async () => {
    if (!evidenceId) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          evidence_id: evidenceId,
          category: category === NONE ? null : (category as DocumentCategory),
          responsible_user_id: ownerId === NONE ? null : ownerId,
          review_due_at: reviewDueAt.trim() ? reviewDueAt : null,
        },
      });
      toast.success(t("meta.saved"));
      await qc.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const aiCat = doc.data?.ai_category ?? null;
  const aiConf = Math.round((doc.data?.ai_category_confidence ?? 0) * 100);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p className="eyebrow">{t("meta.eyebrow")}</p>
          <SheetTitle className="mt-1 text-xl">{t("meta.title")}</SheetTitle>
          <SheetDescription>
            {t("meta.hint")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <p className="truncate text-sm font-medium">{doc.data?.file_name ?? "…"}</p>

          {doc.data?.ai_summary && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <span>{doc.data.ai_summary}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label>{t("meta.category")}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder={t("category.uncategorized")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("category.uncategorized")}</SelectItem>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {t(`category.${c.id}` as MessageKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {aiCat && (
              <p className="text-xs text-muted-foreground">
                {t("meta.aiSuggested", {
                  label: t(`category.${aiCat}` as MessageKey),
                  confidence: aiConf ? ` · ${aiConf}%` : "",
                })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("meta.owner")}</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.unassigned")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("common.unassigned")}</SelectItem>
                {(members.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-due">{t("meta.reviewBy")}</Label>
            <Input
              id="review-due"
              type="date"
              value={reviewDueAt}
              onChange={(e) => setReviewDueAt(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button disabled={busy || doc.isLoading} onClick={handleSave}>
              {t("common.save")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
