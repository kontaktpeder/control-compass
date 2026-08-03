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

export async function listAgreements(orgId: string): Promise<AgreementRow[]> {
  const { data, error } = await supabaseAdmin
    .from("agreements")
    .select(
      "id, org_id, title, body, status, agreement_type, counterparty_name, version, source, source_ref, metadata, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AgreementRow[]) ?? [];
}
