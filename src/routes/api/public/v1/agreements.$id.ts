import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { getAgreement } from "@/lib/agreements.server";
import {
  isUuid,
  jsonError,
  moduleAppBaseUrl,
  withContract,
} from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/agreements/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const readErr = requireScope(auth.client, "agreements:read");
        const platformErr = requireScope(auth.client, "platform:read");
        if (readErr && platformErr) {
          return new Response("Forbidden", { status: 403 });
        }

        const { id } = params;
        if (!isUuid(id)) return jsonError(400, "invalid_id", "id must be a UUID");

        try {
          const agreement = await getAgreement(auth.client.organization_id, id);
          if (!agreement) {
            return jsonError(404, "not_found", "Agreement not found");
          }
          const base = moduleAppBaseUrl(request);
          return Response.json(
            withContract({
              agreement,
              deep_links: {
                agreement: `${base}/o/${agreement.org_id}/agreements/${agreement.id}`,
              },
            }),
          );
        } catch (e) {
          return jsonError(
            500,
            "db_error",
            e instanceof Error ? e.message : "Failed to load agreement",
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
