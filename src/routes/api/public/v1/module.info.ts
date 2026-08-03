import { createFileRoute } from "@tanstack/react-router";
import {
  controlModuleInfo,
  controlModuleDeepLinks,
  controlModuleWidgets,
  moduleAppBaseUrl,
  withContract,
} from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = moduleAppBaseUrl(request);
        return Response.json(
          withContract({
            module_slug: controlModuleInfo.module_slug,
            module_name: controlModuleInfo.module_name,
            module_version: controlModuleInfo.module_version,
            app_version: controlModuleInfo.module_version,
            app_base_url: base,
            base_url: base,
            capabilities: controlModuleInfo.capabilities,
            endpoints: {
              health: `${base}/api/public/v1/module/health`,
              info: `${base}/api/public/v1/module/info`,
              organization: `${base}/api/public/v1/module/organization`,
              organization_verify: `${base}/api/public/v1/module/organization/{org_id}`,
              widgets: `${base}/api/public/v1/module/widgets`,
            },
            scopes: {
              organization: ["platform:read"],
              organization_verify: ["platform:verify"],
              widgets: ["platform:read"],
            },
            deep_links: controlModuleDeepLinks,
            widgets: controlModuleWidgets,
            theme: {
              supports_workspace_theme: false,
              notes: "Control Core uses its own slate theme.",
            },
          }),
        );
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
