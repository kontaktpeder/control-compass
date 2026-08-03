import { createFileRoute } from "@tanstack/react-router";
import { controlModuleInfo, withContract } from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          withContract({
            status: "ok",
            module_slug: controlModuleInfo.module_slug,
            module_name: controlModuleInfo.module_name,
            module_version: controlModuleInfo.module_version,
            app_version: controlModuleInfo.module_version,
            time: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          }),
        ),
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
