-- Phase B: token balances, ledger, guest quotas, AI usage / cost logging

-- ============================================================
-- 1. profiles.token_balance + admin flag
-- ============================================================

alter table public.profiles
  add column if not exists token_balance int not null default 0,
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.token_balance is
  'Product tokens available to spend (extract=10, remix=5).';
comment on column public.profiles.is_admin is
  'Owner-only flag for reading usage/cost tables in the app.';

-- ============================================================
-- 2. token_ledger
-- ============================================================

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  balance_after int not null,
  reason text not null,
  ref_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists token_ledger_user_id_created_at_idx
  on public.token_ledger (user_id, created_at desc);

alter table public.token_ledger enable row level security;

create policy "Users read own token ledger"
  on public.token_ledger for select
  using (auth.uid() = user_id);

create policy "Admins read all token ledger"
  on public.token_ledger for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ============================================================
-- 3. ai_usage_events (cost + operational logging)
-- ============================================================

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guest_install_id text,
  action text not null,
  platform text,
  status text not null,
  extraction_source text,
  model text,
  prompt_tokens int not null default 0,
  output_tokens int not null default 0,
  thinking_tokens int not null default 0,
  total_tokens int not null default 0,
  gemini_cost_usd numeric(12, 6) not null default 0,
  scrapecreators_credits int not null default 0,
  scrapecreators_cost_usd numeric(12, 6) not null default 0,
  total_cost_usd numeric(12, 6) not null default 0,
  tokens_charged int not null default 0,
  duration_ms int,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_created_at_idx
  on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events (user_id, created_at desc);
create index if not exists ai_usage_events_action_status_idx
  on public.ai_usage_events (action, status);

alter table public.ai_usage_events enable row level security;

-- Only admins can read usage/cost rows from the client.
create policy "Admins read ai usage events"
  on public.ai_usage_events for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ============================================================
-- 4. guest_usage (server-side guest extract quota)
-- ============================================================

create table if not exists public.guest_usage (
  install_id text primary key,
  extract_count int not null default 0 check (extract_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guest_usage enable row level security;
-- No client policies: Edge Functions use the service role.

-- ============================================================
-- 5. Token RPCs (security definer; called by Edge with service role)
-- ============================================================

create or replace function public.spend_tokens(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance int;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  if p_amount = 0 then
    select token_balance into new_balance
    from public.profiles
    where id = p_user_id
    for update;
    if new_balance is null then
      raise exception 'profile_not_found';
    end if;
    return new_balance;
  end if;

  update public.profiles
  set token_balance = token_balance - p_amount
  where id = p_user_id
    and token_balance >= p_amount
  returning token_balance into new_balance;

  if new_balance is null then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
  values (p_user_id, -p_amount, new_balance, p_reason, p_ref_id, coalesce(p_metadata, '{}'::jsonb));

  return new_balance;
end;
$$;

create or replace function public.grant_tokens(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  update public.profiles
  set token_balance = token_balance + p_amount
  where id = p_user_id
  returning token_balance into new_balance;

  if new_balance is null then
    raise exception 'profile_not_found';
  end if;

  insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
  values (p_user_id, p_amount, new_balance, p_reason, p_ref_id, coalesce(p_metadata, '{}'::jsonb));

  return new_balance;
end;
$$;

create or replace function public.reserve_guest_extraction(
  p_install_id text,
  p_limit int default 5
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_install_id is null or length(trim(p_install_id)) < 8 then
    raise exception 'invalid_install_id';
  end if;

  insert into public.guest_usage (install_id, extract_count, updated_at)
  values (trim(p_install_id), 1, now())
  on conflict (install_id) do update
    set extract_count = public.guest_usage.extract_count + 1,
        updated_at = now()
    where public.guest_usage.extract_count < p_limit
  returning extract_count into new_count;

  if new_count is null then
    return -1; -- over limit
  end if;

  return new_count;
end;
$$;

revoke all on function public.spend_tokens(uuid, int, text, text, jsonb) from public;
revoke all on function public.grant_tokens(uuid, int, text, text, jsonb) from public;
revoke all on function public.reserve_guest_extraction(text, int) from public;
grant execute on function public.spend_tokens(uuid, int, text, text, jsonb) to service_role;
grant execute on function public.grant_tokens(uuid, int, text, text, jsonb) to service_role;
grant execute on function public.reserve_guest_extraction(text, int) to service_role;

-- ============================================================
-- 6. Signup grant: 150 tokens
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_bonus int := 150;
begin
  insert into public.profiles (id, email, token_balance)
  values (new.id, new.email, signup_bonus);

  insert into public.token_ledger (user_id, delta, balance_after, reason, metadata)
  values (
    new.id,
    signup_bonus,
    signup_bonus,
    'signup_bonus',
    jsonb_build_object('source', 'handle_new_user')
  );

  return new;
end;
$$;

-- One-time backfill for existing accounts that never received a signup grant.
with eligible as (
  select p.id
  from public.profiles p
  where not exists (
    select 1
    from public.token_ledger tl
    where tl.user_id = p.id
      and tl.reason in ('signup_bonus', 'signup_bonus_backfill')
  )
)
update public.profiles p
set token_balance = greatest(p.token_balance, 150)
from eligible e
where p.id = e.id;

insert into public.token_ledger (user_id, delta, balance_after, reason, metadata)
select
  p.id,
  150,
  p.token_balance,
  'signup_bonus_backfill',
  jsonb_build_object('source', '0009_tokens_and_usage')
from public.profiles p
where not exists (
  select 1
  from public.token_ledger tl
  where tl.user_id = p.id
    and tl.reason in ('signup_bonus', 'signup_bonus_backfill')
);

-- Users must not self-edit balances or admin flags from the client.
revoke update on public.profiles from authenticated;
grant update (email, avatar_url) on public.profiles to authenticated;

-- ============================================================
-- Owner bootstrap (run once after you know your auth user id):
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- ============================================================
