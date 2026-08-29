-- Auth schema upgrades can drop the on_auth_user_created trigger, so a signup
-- can succeed without a profiles row. The app then treats that as 0 credits.
-- Recreate the trigger, backfill missing profiles, and let the app/edge
-- functions repair a missing row. Monthly free credits stay a computed
-- allowance (15 minus extract_usage_monthly for the UTC month).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    token_balance,
    subscription_status,
    free_extracts_used
  )
  values (
    new.id,
    new.email,
    0,
    'free',
    0
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.ensure_user_profile(p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  ensured_id uuid;
begin
  target_id := coalesce(p_user_id, auth.uid());
  if target_id is null then
    raise exception 'not_authenticated';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from target_id then
    raise exception 'forbidden';
  end if;

  insert into public.profiles (
    id,
    email,
    token_balance,
    subscription_status,
    free_extracts_used
  )
  select
    target_id,
    u.email,
    0,
    'free',
    0
  from auth.users u
  where u.id = target_id
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email)
  returning id into ensured_id;

  if ensured_id is null then
    raise exception 'user_not_found';
  end if;

  return ensured_id;
end;
$$;

comment on function public.ensure_user_profile(uuid) is
  'Creates the signed-in user profile if signup never did. Monthly free credits are 15 per UTC month, not a stored grant.';

revoke all on function public.ensure_user_profile(uuid) from public;
grant execute on function public.ensure_user_profile(uuid) to authenticated, service_role;

insert into public.profiles (id, email, token_balance, subscription_status, free_extracts_used)
select
  u.id,
  u.email,
  0,
  'free',
  0
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
