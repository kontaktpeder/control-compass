import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout so /obligations and /obligations/$id both render (child needs Outlet). */
export const Route = createFileRoute("/_authenticated/o/$orgId/obligations")({
  component: ObligationsLayout,
});

function ObligationsLayout() {
  return <Outlet />;
}
