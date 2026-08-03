import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { withContract } from "@/lib/module-contract.server";
import { WIDGET_COMPUTERS, type WidgetResult } from "@/lib/module-widgets.server";

export const Route = createFileRoute("/api/public/v1/module/widgets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:read");
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const idsParam = url.searchParams.get("ids");
        const requested = idsParam
          ? idsParam
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : Object.keys(WIDGET_COMPUTERS);

        const orgId = auth.client.organization_id;
        const widgets: WidgetResult[] = [];
        const errors: Record<string, string> = {};

        for (const id of requested) {
          const fn = WIDGET_COMPUTERS[id];
          if (!fn) {
            errors[id] = "unknown_widget";
            continue;
          }
          try {
            widgets.push(await fn(orgId));
          } catch (e) {
            errors[id] = e instanceof Error ? e.message : "compute_error";
          }
        }

        return Response.json(
          withContract({
            widgets,
            ...(Object.keys(errors).length ? { errors } : {}),
          }),
        );
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
