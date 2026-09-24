-- Replaces the profiles admin policy if it was created as a self-query.
-- That form loops inside row-level security and fails every admin read,
-- including the AI cost log.

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "Admins read all profiles" on public.profiles;

create policy "Admins read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_current_user_admin());

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id is null then
    raise exception 'user_not_found';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

drop policy if exists "Admins read purchase grants" on public.purchase_credit_grants;

create policy "Admins read purchase grants"
  on public.purchase_credit_grants
  for select
  to authenticated
  using (public.is_current_user_admin());
