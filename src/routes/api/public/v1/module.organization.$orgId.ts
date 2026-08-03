import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import {
  isUuid,
  jsonError,
  moduleAppBaseUrl,
  orgHomeDeepLink,
  withContract,
} from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/organization/$orgId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:verify");
        if (scopeErr) return scopeErr;

        const { orgId } = params;
        if (!isUuid(orgId)) {
          return jsonError(400, "invalid_org_id", "org_id must be a UUID");
        }

        // Contract rule: mismatch → 404 (not 403)
        if (orgId !== auth.client.organization_id) {
          return jsonError(404, "organization_not_found", "Organization not found");
        }

        const { data: org, error } = await supabaseAdmin
          .from("organizations")
          .select("id, name, created_at")
          .eq("id", orgId)
          .maybeSingle();

        if (error) return jsonError(500, "db_error", error.message);
        if (!org) return jsonError(404, "organization_not_found", "Organization not found");

        const base = moduleAppBaseUrl(request);
        return Response.json(
          withContract({
            verified: true,
            organization: { id: org.id, name: org.name },
            deep_links: { org_home: orgHomeDeepLink(base, org.id) },
          }),
        );
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
