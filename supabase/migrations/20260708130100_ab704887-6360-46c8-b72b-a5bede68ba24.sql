
revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_member(uuid, uuid) from public, anon;
revoke execute on function public.is_org_owner(uuid, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.seed_incorporate_playbook(uuid) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated;
grant execute on function public.is_member(uuid, uuid) to authenticated;
grant execute on function public.is_org_owner(uuid, uuid) to authenticated;
grant execute on function public.seed_incorporate_playbook(uuid) to authenticated;
