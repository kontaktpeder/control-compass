import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/o/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/o/$orgId/evidence",
      params: { orgId: params.orgId },
      search: { mode: "register" },
    });
  },
  component: () => null,
});
