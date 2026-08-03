// Control Core — Platform Module Contract v1
// Spec: platform-nexus/docs/MODULE_CONTRACT.v1.md

export const MODULE_CONTRACT_VERSION = "1.0" as const;

export const controlModuleInfo = {
  module_slug: "control",
  module_name: "Control Core",
  module_version: "0.1.0",
  contract_version: MODULE_CONTRACT_VERSION,
  capabilities: [
    "platform.health",
    "platform.organization.read",
    "platform.organization.verify",
    "control.obligations",
    "control.evidence",
    "control.tasks",
    "control.playbooks",
  ],
} as const;

export const controlModuleDeepLinks = {
  org_home: "/o/{org_id}",
  org_workflows: "/o/{org_id}/workflows",
  org_evidence: "/o/{org_id}/evidence",
  org_tasks: "/o/{org_id}/tasks",
  org_obligations: "/o/{org_id}/obligations",
} as const;

export const controlModuleWidgets = [
  {
    id: "open_tasks",
    title: "Open tasks",
    description: "Tasks still open for this organization.",
    deep_link: "org_tasks",
    capabilities_required: ["control.tasks"],
    placeholder: false,
  },
  {
    id: "open_obligations",
    title: "Open obligations",
    description: "Obligations not yet satisfied.",
    deep_link: "org_obligations",
    capabilities_required: ["control.obligations"],
    placeholder: false,
  },
] as const;

export function moduleAppBaseUrl(request: Request): string {
  const envUrl = process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { contract_version: MODULE_CONTRACT_VERSION, error: { code, message } },
    { status },
  );
}

export function withContract<T extends Record<string, unknown>>(body: T) {
  return { contract_version: MODULE_CONTRACT_VERSION, ...body };
}

export function orgHomeDeepLink(baseUrl: string, orgId: string): string {
  return `${baseUrl}/o/${orgId}`;
}
