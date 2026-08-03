import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiClient = {
  id: string;
  organization_id: string;
  allowed_scopes: string[];
  name: string;
  created_by: string | null;
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticateApiKey(
  request: Request,
): Promise<{ client: ApiClient } | { error: Response }> {
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };

  const hash = await sha256Hex(token);
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select(
      "id, revoked_at, api_clients(id, organization_id, allowed_scopes, name, revoked_at, created_by)",
    )
    .eq("key_hash", hash)
    .maybeSingle();

  const client = (key as any)?.api_clients as
    | (ApiClient & { revoked_at?: string | null })
    | null
    | undefined;
  if (error || !key || (key as any).revoked_at || !client || client.revoked_at) {
    return { error: new Response("Invalid API key", { status: 401 }) };
  }

  await supabaseAdmin
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id);

  return {
    client: {
      id: client.id,
      organization_id: client.organization_id,
      allowed_scopes: client.allowed_scopes ?? [],
      name: client.name ?? "external",
      created_by: client.created_by ?? null,
    },
  };
}

export function requireScope(client: ApiClient, scope: string): Response | null {
  if (!client.allowed_scopes.includes(scope)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
