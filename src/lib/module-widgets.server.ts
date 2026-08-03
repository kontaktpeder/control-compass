import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WidgetResult = {
  id: string;
  value: number | string | null;
  display: string;
  deep_link: string;
};

export async function computeOpenTasks(orgId: string): Promise<WidgetResult> {
  const { count, error } = await supabaseAdmin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "open");
  if (error) throw error;
  const value = count ?? 0;
  return {
    id: "open_tasks",
    value,
    display: String(value),
    deep_link: "org_tasks",
  };
}

export async function computeOpenObligations(orgId: string): Promise<WidgetResult> {
  // Latest assessment per obligation via assessments join is heavy; count obligations
  // whose latest assessment is not satisfied, falling back to all obligations with no
  // satisfied assessment. Simple v1: obligations without a satisfied assessment.
  const { data: obligations, error: oErr } = await supabaseAdmin
    .from("obligations")
    .select("id")
    .eq("org_id", orgId);
  if (oErr) throw oErr;

  const ids = (obligations ?? []).map((o) => o.id);
  if (!ids.length) {
    return { id: "open_obligations", value: 0, display: "0", deep_link: "org_obligations" };
  }

  const { data: assessments, error: aErr } = await supabaseAdmin
    .from("assessments")
    .select("obligation_id, status, created_at")
    .eq("org_id", orgId)
    .in("obligation_id", ids)
    .order("created_at", { ascending: false });
  if (aErr) throw aErr;

  const latest = new Map<string, string>();
  for (const a of assessments ?? []) {
    if (!latest.has(a.obligation_id)) latest.set(a.obligation_id, a.status);
  }

  let open = 0;
  for (const id of ids) {
    const status = latest.get(id);
    if (status !== "satisfied") open += 1;
  }

  return {
    id: "open_obligations",
    value: open,
    display: String(open),
    deep_link: "org_obligations",
  };
}

export const WIDGET_COMPUTERS: Record<string, (orgId: string) => Promise<WidgetResult>> = {
  open_tasks: computeOpenTasks,
  open_obligations: computeOpenObligations,
};
