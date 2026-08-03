import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScopeSchema = z.enum([
  "obligations:read",
  "evidence:read",
  "tasks:read",
  "platform:read",
  "platform:verify",
]);

const CreateInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  scopes: z.array(ScopeSchema).min(1),
});

const RevokeInputSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
});

const ListInputSchema = z.object({
  organizationId: z.string().uuid(),
});

function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function assertOwner(
  supabase: { from: (table: string) => any },
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !membership || membership.role !== "owner") {
    throw new Error("You do not have permission for this organization.");
  }
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertOwner(supabase, userId, data.organizationId);

    const { data: client, error: cErr } = await supabaseAdmin
      .from("api_clients")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        allowed_scopes: data.scopes,
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr || !client) throw new Error(cErr?.message ?? "Failed to create client");

    const secret = randomToken(24);
    const prefix = secret.slice(0, 8);
    const token = `cc_live_${prefix}_${secret.slice(8)}`;
    const hash = await sha256Hex(token);

    const { error: kErr } = await supabaseAdmin.from("api_keys").insert({
      api_client_id: client.id,
      key_prefix: prefix,
      key_hash: hash,
    });
    if (kErr) throw new Error(kErr.message);

    return { token, prefix, clientId: client.id };
  });

export const listApiClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.organizationId);

    const { data: clients, error } = await supabase
      .from("api_clients")
      .select("id, name, allowed_scopes, created_at, revoked_at, last_used_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return clients ?? [];
  });

export const revokeApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabase, userId, data.organizationId);

    const now = new Date().toISOString();
    const { error: cErr } = await supabaseAdmin
      .from("api_clients")
      .update({ revoked_at: now })
      .eq("id", data.clientId)
      .eq("organization_id", data.organizationId);
    if (cErr) throw new Error(cErr.message);

    const { error: kErr } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: now })
      .eq("api_client_id", data.clientId);
    if (kErr) throw new Error(kErr.message);

    return { ok: true };
  });
