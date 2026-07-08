// Server functions for organizations. Client-safe to import.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateOrgInput = z.object({
  name: z.string().min(1).max(200),
  org_number: z.string().max(50).optional().nullable(),
  kind: z.enum(["holding", "operating", "sole_prop", "other"]).default("operating"),
});

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: org, error } = await supabase
      .from("organizations")
      .insert({
        name: data.name,
        org_number: data.org_number ?? null,
        kind: data.kind,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);





    const { error: memErr } = await supabase.from("memberships").insert({
      org_id: org.id,
      user_id: userId,
      role: "owner",
    });
    if (memErr) throw new Error(memErr.message);

    const { error: seedErr } = await supabase.rpc("seed_incorporate_playbook", { _org: org.id });
    if (seedErr) throw new Error(seedErr.message);

    return { id: org.id };
  });

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, kind, org_number, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
