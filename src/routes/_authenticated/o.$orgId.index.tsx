import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/o/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/o/$orgId/workflows", params: { orgId: params.orgId } });
  },
  component: () => null,
});
