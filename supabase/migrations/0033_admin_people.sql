-- Admins can list every profile and delete an account from the app.
-- The is_admin check reads the caller's own row, which the existing
-- "Users read own profile" policy already allows.

create policy "Admins read all profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
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
