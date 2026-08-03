import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateApiKey,
  requireScope,
  type ApiClient,
} from "@/lib/api-auth.server";
import {
  getAgreement,
  updateAgreementDraft,
  type AgreementType,
} from "@/lib/agreements.server";
import type { Json } from "@/integrations/supabase/types";
import {
  isUuid,
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

function requireAgreementsReadOrPlatformRead(client: ApiClient): Response | null {
  const readErr = requireScope(client, "agreements:read");
  const platformErr = requireScope(client, "platform:read");
  if (readErr && platformErr) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

function requireAgreementsWriteOrPlatformRead(client: ApiClient): Response | null {
  const writeErr = requireScope(client, "agreements:write");
  const platformErr = requireScope(client, "platform:read");
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
  return null;
}

export const Route = createFileRoute("/api/public/v1/agreements/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const denied = requireAgreementsReadOrPlatformRead(auth.client);
        if (denied) return denied;

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
      PATCH: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const denied = requireAgreementsWriteOrPlatformRead(auth.client);
        if (denied) return denied;

        const { id } = params;
        if (!isUuid(id)) return jsonError(400, "invalid_id", "id must be a UUID");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "invalid_json", "Request body must be JSON");
        }

        const b = body as Record<string, unknown>;
        const hasTitle = typeof b.title === "string";
        const hasBody = typeof b.body === "string";
        const hasType = typeof b.agreement_type === "string";
        const hasCounterparty =
          b.counterparty_name === null || typeof b.counterparty_name === "string";
        const hasSourceRef =
          b.source_ref === null || typeof b.source_ref === "string";
        const hasMetadata =
          b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata);

        if (!hasTitle && !hasBody && !hasType && !hasCounterparty && !hasSourceRef && !hasMetadata) {
          return jsonError(
            400,
            "empty_patch",
            "Provide at least one of: title, body, agreement_type, counterparty_name, source_ref, metadata",
          );
        }

        if (hasTitle) {
          const title = (b.title as string).trim();
          if (!title || title.length > 300) {
            return jsonError(400, "invalid_title", "title must be 1–300 chars");
          }
        }
        if (hasBody) {
          const text = b.body as string;
          if (!text.trim() || text.length > 200_000) {
            return jsonError(400, "invalid_body", "body must be 1–200000 chars");
          }
        }

        const agreementType =
          hasType && AGREEMENT_TYPES.has(b.agreement_type as AgreementType)
            ? (b.agreement_type as AgreementType)
            : undefined;

        try {
          const agreement = await updateAgreementDraft({
            orgId: auth.client.organization_id,
            id,
            title: hasTitle ? (b.title as string).trim() : undefined,
            body: hasBody ? (b.body as string) : undefined,
            agreementType,
            counterpartyName: hasCounterparty
              ? typeof b.counterparty_name === "string"
                ? b.counterparty_name.trim().slice(0, 200)
                : null
              : undefined,
            sourceRef: hasSourceRef
              ? typeof b.source_ref === "string"
                ? b.source_ref.trim().slice(0, 200)
                : null
              : undefined,
            metadata: hasMetadata
              ? ({
                  ...(b.metadata as Record<string, unknown>),
                  last_patched_by_api_client: auth.client.id,
                } as Json)
              : undefined,
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
                updated_at: agreement.updated_at,
              },
              deep_links: {
                agreement: `${base}/o/${agreement.org_id}/agreements/${agreement.id}`,
              },
            }),
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to update agreement";
          if (msg === "Agreement not found") {
            return jsonError(404, "not_found", msg);
          }
          if (msg.includes("Only draft")) {
            return jsonError(409, "not_draft", msg);
          }
          return jsonError(500, "update_failed", msg);
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
