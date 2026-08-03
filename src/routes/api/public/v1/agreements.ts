import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { createAgreementDraft, type AgreementType } from "@/lib/agreements.server";
import type { Json } from "@/integrations/supabase/types";
import {
  jsonError,
  moduleAppBaseUrl,
  withContract,
} from "@/lib/module-contract.server";

const AGREEMENT_TYPES = new Set<AgreementType>([
  "shareholder",
  "nda",
  "employment",
  "contractor",
  "other",
]);

export const Route = createFileRoute("/api/public/v1/agreements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        // Domain write scope preferred; platform:read allowed so existing Nexus
        // verify keys can hand off without immediate re-key (org-scoped).
        const writeErr = requireScope(auth.client, "agreements:write");
        const platformErr = requireScope(auth.client, "platform:read");
        if (writeErr && platformErr) {
          return Response.json(
            {
              contract_version: "1.0",
              error: {
                code: "forbidden",
                message: "Requires agreements:write or platform:read",
              },
            },
            { status: 403 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "invalid_json", "Request body must be JSON");
        }

        const b = body as Record<string, unknown>;
        const title = typeof b.title === "string" ? b.title.trim() : "";
        const text = typeof b.body === "string" ? b.body : "";
        if (!title || title.length > 300) {
          return jsonError(400, "invalid_title", "title is required (max 300)");
        }
        if (!text.trim() || text.length > 200_000) {
          return jsonError(400, "invalid_body", "body is required (max 200000)");
        }

        const rawType = typeof b.agreement_type === "string" ? b.agreement_type : "other";
        const agreementType = AGREEMENT_TYPES.has(rawType as AgreementType)
          ? (rawType as AgreementType)
          : "other";

        const counterparty =
          typeof b.counterparty_name === "string" ? b.counterparty_name.trim().slice(0, 200) : null;
        const source =
          typeof b.source === "string" && b.source.trim()
            ? b.source.trim().slice(0, 80)
            : "nexus_fortell";
        const sourceRef =
          typeof b.source_ref === "string" ? b.source_ref.trim().slice(0, 200) : null;
        const metadata: Json =
          b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata)
            ? (b.metadata as Json)
            : {};

        try {
          const agreement = await createAgreementDraft({
            orgId: auth.client.organization_id,
            title,
            body: text,
            agreementType,
            counterpartyName: counterparty,
            source,
            sourceRef,
            metadata: {
              ...(typeof metadata === "object" && metadata && !Array.isArray(metadata)
                ? metadata
                : {}),
              handed_off_by_api_client: auth.client.id,
            },
            createdBy: auth.client.created_by,
          });

          const base = moduleAppBaseUrl(request);
          return Response.json(
            withContract({
              agreement: {
                id: agreement.id,
                title: agreement.title,
                status: agreement.status,
                agreement_type: agreement.agreement_type,
                counterparty_name: agreement.counterparty_name,
                version: agreement.version,
                source: agreement.source,
                created_at: agreement.created_at,
              },
              deep_links: {
                agreement: `${base}/o/${agreement.org_id}/agreements/${agreement.id}`,
                org_agreements: `${base}/o/${agreement.org_id}/agreements`,
              },
            }),
            { status: 201 },
          );
        } catch (e) {
          return jsonError(
            500,
            "create_failed",
            e instanceof Error ? e.message : "Failed to create agreement",
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
