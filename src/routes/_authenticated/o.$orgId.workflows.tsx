import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/o/$orgId/workflows")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/o/$orgId/evidence",
      params: { orgId: params.orgId },
      search: { mode: "register" },
    });
  },
  component: () => null,
});
