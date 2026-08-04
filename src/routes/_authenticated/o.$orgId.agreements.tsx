import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout so /agreements and /agreements/$id both render (child needs Outlet). */
export const Route = createFileRoute("/_authenticated/o/$orgId/agreements")({
  component: AgreementsLayout,
});

function AgreementsLayout() {
  return <Outlet />;
}
