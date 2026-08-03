import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export type AgreementType =
  | "shareholder"
  | "nda"
  | "employment"
  | "contractor"
  | "other";

export type AgreementStatus = "draft" | "review" | "signing" | "signed" | "archived";

export type AgreementRow = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  status: AgreementStatus;
  agreement_type: AgreementType;
  counterparty_name: string | null;
  version: number;
  source: string;
  source_ref: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export async function createAgreementDraft(input: {
  orgId: string;
  title: string;
  body: string;
  agreementType?: AgreementType;
  counterpartyName?: string | null;
  source?: string;
  sourceRef?: string | null;
  metadata?: Json;
  createdBy?: string | null;
}): Promise<AgreementRow> {
  const { data, error } = await supabaseAdmin
    .from("agreements")
    .insert({
      org_id: input.orgId,
      title: input.title,
      body: input.body,
      status: "draft",
      agreement_type: input.agreementType ?? "other",
      counterparty_name: input.counterpartyName ?? null,
      source: input.source ?? "manual",
      source_ref: input.sourceRef ?? null,
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
      version: 1,
    })
    .select(
      "id, org_id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
    )
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create agreement");
  return data as AgreementRow;
}

export async function getAgreement(orgId: string, id: string): Promise<AgreementRow | null> {
  const { data, error } = await supabaseAdmin
    .from("agreements")
    .select(
      "id, org_id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AgreementRow | null) ?? null;
}

export async function listAgreements(
  orgId: string,
  opts?: { q?: string | null; status?: AgreementStatus | null; limit?: number },
): Promise<AgreementRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  let query = supabaseAdmin
    .from("agreements")
    .select(
      "id, org_id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (opts?.status) {
    query = query.eq("status", opts.status);
  }

  const q = opts?.q?.trim().toLowerCase();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data as AgreementRow[]) ?? [];
  if (!q) return rows;
  return rows.filter((a) => {
    const title = a.title.toLowerCase();
    const cp = (a.counterparty_name ?? "").toLowerCase();
    return title.includes(q) || cp.includes(q);
  });
}

/** Update an existing draft only. Signing/archive stay in Control UI. */
export async function updateAgreementDraft(input: {
  orgId: string;
  id: string;
  title?: string;
  body?: string;
  agreementType?: AgreementType;
  counterpartyName?: string | null;
  sourceRef?: string | null;
  metadata?: Json;
}): Promise<AgreementRow> {
  const existing = await getAgreement(input.orgId, input.id);
  if (!existing) throw new Error("Agreement not found");
  if (existing.status !== "draft") {
    throw new Error("Only draft agreements can be updated via API");
  }

  const prevMeta =
    existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nextMeta =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;

  const { data, error } = await supabaseAdmin
    .from("agreements")
    .update({
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
      ...(typeof input.title === "string" ? { title: input.title } : {}),
      ...(typeof input.body === "string" ? { body: input.body } : {}),
      ...(input.agreementType ? { agreement_type: input.agreementType } : {}),
      ...(input.counterpartyName !== undefined
        ? { counterparty_name: input.counterpartyName }
        : {}),
      ...(input.sourceRef !== undefined ? { source_ref: input.sourceRef } : {}),
      ...(nextMeta ? { metadata: { ...prevMeta, ...nextMeta } as Json } : {}),
    })
    .eq("org_id", input.orgId)
    .eq("id", input.id)
    .eq("status", "draft")
    .select(
      "id, org_id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
    )
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update agreement");
  return data as AgreementRow;
}
