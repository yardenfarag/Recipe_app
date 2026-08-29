-- Kitchen profile JSONB, fridge-match daily caps (signed-in + guest).

alter table public.profiles
  add column if not exists kitchen jsonb not null default '{}'::jsonb;

comment on column public.profiles.kitchen is
  'User kitchen preferences: diets, defaultServings, alwaysSwap, autoApplyOnExtract.';

alter table public.profiles
  drop constraint if exists profiles_kitchen_size;
alter table public.profiles
  add constraint profiles_kitchen_size
  check (octet_length(kitchen::text) <= 8192);

revoke update on public.profiles from authenticated;
grant update (email, avatar_url, token_pack_notify_at, kitchen) on public.profiles to authenticated;

alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_action_check;

alter table public.ai_usage_daily
  add constraint ai_usage_daily_action_check
  check (action in ('substitution', 'translation', 'fridge_match'));

create table if not exists public.guest_ai_usage_daily (
  install_id text not null,
  action text not null check (action in ('fridge_match')),
  usage_date date not null,
  usage_count int not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (install_id, action, usage_date)
);

alter table public.guest_ai_usage_daily enable row level security;

create or replace function public.reserve_daily_ai_usage(
  p_user_id uuid,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_action not in ('substitution', 'translation', 'fridge_match') then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.ai_usage_daily (user_id, action, usage_date, usage_count, updated_at)
  values (p_user_id, p_action, p_usage_date, 1, now())
  on conflict (user_id, action, usage_date) do update
    set usage_count = public.ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

create or replace function public.reserve_guest_daily_ai_usage(
  p_install_id text,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_install_id text := trim(p_install_id);
  new_count int;
begin
  if p_install_id is null or length(normalized_install_id) < 8 then
    raise exception 'invalid_install_id';
  end if;
  if p_action not in ('fridge_match') then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;

  insert into public.guest_ai_usage_daily (
    install_id, action, usage_date, usage_count, updated_at
  )
  values (normalized_install_id, p_action, p_usage_date, 1, now())
  on conflict (install_id, action, usage_date) do update
    set usage_count = public.guest_ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.guest_ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

create or replace function public.refund_guest_daily_ai_usage(
  p_install_id text,
  p_action text,
  p_usage_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_ai_usage_daily
  set usage_count = greatest(0, usage_count - 1), updated_at = now()
  where install_id = trim(p_install_id)
    and action = p_action
    and usage_date = p_usage_date
    and usage_count > 0;
  return found;
end;
$$;

revoke all on function public.reserve_guest_daily_ai_usage(text, text, date, int) from public;
revoke all on function public.refund_guest_daily_ai_usage(text, text, date) from public;
grant execute on function public.reserve_guest_daily_ai_usage(text, text, date, int) to service_role;
grant execute on function public.refund_guest_daily_ai_usage(text, text, date) to service_role;
