-- Allow the creator to read the org row they just inserted (fixes INSERT ... RETURNING RLS failure before membership is added)
drop policy if exists "members read orgs" on public.organizations;
create policy "creator or member reads org" on public.organizations for select
  using (auth.uid() = created_by or public.is_member(id, auth.uid()));