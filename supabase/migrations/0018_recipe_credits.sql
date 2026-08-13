-- Recipe credits: 15 free extractions per UTC month plus non-expiring paid credits.
-- One successful, uncached extraction costs one credit. Free credits are spent first.

comment on column public.profiles.token_balance is
  'Non-expiring purchased recipe credits. One credit funds one successful uncached extraction.';
comment on table public.extract_usage_monthly is
  'Per-user free recipe-credit usage keyed by UTC YYYY-MM (15 credits per month).';
comment on column public.ai_usage_events.tokens_charged is
  'Recipe credits charged for this event (legacy column name).';

-- Convert legacy product tokens (10 per extraction) into one-credit-per-recipe balances.
with legacy as (
  select id, token_balance as old_balance, floor(token_balance / 10.0)::int as new_balance
  from public.profiles
  where token_balance <> floor(token_balance / 10.0)::int
),
converted as (
  update public.profiles p
  set token_balance = legacy.new_balance
  from legacy
  where p.id = legacy.id
  returning p.id, legacy.old_balance, legacy.new_balance
)
insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
select
  id,
  new_balance - old_balance,
  new_balance,
  'legacy_credit_conversion',
  'migration_0018',
  jsonb_build_object('old_tokens', old_balance, 'conversion_rate', 10)
from converted;

-- Pinch Plus is retired. Existing accounts move to the same monthly free allowance.
update public.profiles
set subscription_status = 'free',
    subscription_expires_at = null
where subscription_status <> 'free'
   or subscription_expires_at is not null;

revoke execute on function public.activate_subscription(uuid) from authenticated;
revoke execute on function public.cancel_subscription(uuid) from authenticated;

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  year_month text not null,
  source text not null check (source in ('monthly_free', 'purchased')),
  amount int not null default 1 check (amount = 1),
  status text not null default 'reserved'
    check (status in ('reserved', 'finalized', 'refunded')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  refunded_at timestamptz,
  unique (user_id, idempotency_key),
  constraint credit_reservations_year_month_check
    check (year_month ~ '^\d{4}-\d{2}$')
);

create index if not exists credit_reservations_user_created_idx
  on public.credit_reservations (user_id, created_at desc);
create index if not exists credit_reservations_stale_idx
  on public.credit_reservations (created_at)
  where status = 'reserved';

alter table public.credit_reservations enable row level security;

create policy "Users read own credit reservations"
  on public.credit_reservations for select
  using (auth.uid() = user_id);

create table if not exists public.purchase_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  event_id text not null,
  transaction_id text not null,
  product_id text not null,
  credits int not null check (credits > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id),
  unique (provider, transaction_id)
);

create index if not exists purchase_credit_grants_user_created_idx
  on public.purchase_credit_grants (user_id, created_at desc);

alter table public.purchase_credit_grants enable row level security;

create policy "Users read own purchase grants"
  on public.purchase_credit_grants for select
  using (auth.uid() = user_id);

create table if not exists public.remix_usage_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  remix_count int not null default 0 check (remix_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.remix_usage_daily enable row level security;

create policy "Users read own daily remix usage"
  on public.remix_usage_daily for select
  using (auth.uid() = user_id);

create or replace function public.reserve_daily_remix(
  p_user_id uuid,
  p_usage_date date,
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
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.remix_usage_daily (user_id, usage_date, remix_count, updated_at)
  values (p_user_id, p_usage_date, 1, now())
  on conflict (user_id, usage_date) do update
    set remix_count = public.remix_usage_daily.remix_count + 1,
        updated_at = now()
    where public.remix_usage_daily.remix_count < p_limit
  returning remix_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

create or replace function public.reserve_recipe_credit(
  p_user_id uuid,
  p_year_month text,
  p_idempotency_key text,
  p_free_limit int default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  paid_balance int;
  free_used int;
  reservation public.credit_reservations%rowtype;
  chosen_source text;
begin
  if p_year_month is null or p_year_month !~ '^\d{4}-\d{2}$' then
    raise exception 'invalid_year_month';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_free_limit is null or p_free_limit < 1 then
    raise exception 'invalid_limit';
  end if;

  select * into reservation
  from public.credit_reservations
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    select token_balance into paid_balance from public.profiles where id = p_user_id;
    select coalesce(extract_count, 0) into free_used
    from public.extract_usage_monthly
    where user_id = p_user_id and year_month = p_year_month;
    return jsonb_build_object(
      'reservation_id', reservation.id,
      'source', reservation.source,
      'status', reservation.status,
      'free_remaining', greatest(0, p_free_limit - coalesce(free_used, 0)),
      'purchased_remaining', coalesce(paid_balance, 0)
    );
  end if;

  select token_balance into paid_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  -- A concurrent request with the same key may have inserted while we waited
  -- for the profile lock. Return that reservation instead of charging twice.
  select * into reservation
  from public.credit_reservations
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select coalesce(extract_count, 0) into free_used
    from public.extract_usage_monthly
    where user_id = p_user_id and year_month = p_year_month;
    return jsonb_build_object(
      'reservation_id', reservation.id,
      'source', reservation.source,
      'status', reservation.status,
      'free_remaining', greatest(0, p_free_limit - coalesce(free_used, 0)),
      'purchased_remaining', paid_balance
    );
  end if;

  select coalesce(extract_count, 0) into free_used
  from public.extract_usage_monthly
  where user_id = p_user_id and year_month = p_year_month;
  free_used := coalesce(free_used, 0);

  if free_used < p_free_limit then
    insert into public.extract_usage_monthly (user_id, year_month, extract_count, updated_at)
    values (p_user_id, p_year_month, 1, now())
    on conflict (user_id, year_month) do update
      set extract_count = public.extract_usage_monthly.extract_count + 1,
          updated_at = now();
    free_used := free_used + 1;
    chosen_source := 'monthly_free';
  elsif paid_balance > 0 then
    update public.profiles
    set token_balance = token_balance - 1
    where id = p_user_id
    returning token_balance into paid_balance;
    chosen_source := 'purchased';
  else
    return jsonb_build_object(
      'code', 'insufficient_credits',
      'free_remaining', 0,
      'purchased_remaining', 0
    );
  end if;

  insert into public.credit_reservations (
    user_id, idempotency_key, year_month, source
  )
  values (p_user_id, trim(p_idempotency_key), p_year_month, chosen_source)
  returning * into reservation;

  if chosen_source = 'purchased' then
    insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
    values (
      p_user_id,
      -1,
      paid_balance,
      'recipe_credit_reserved',
      reservation.id::text,
      jsonb_build_object('idempotency_key', trim(p_idempotency_key))
    );
  end if;

  return jsonb_build_object(
    'reservation_id', reservation.id,
    'source', chosen_source,
    'status', 'reserved',
    'free_remaining', greatest(0, p_free_limit - free_used),
    'purchased_remaining', paid_balance
  );
end;
$$;

create or replace function public.finalize_recipe_credit(
  p_user_id uuid,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_reservations
  set status = 'finalized', finalized_at = now()
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';

  if found then return true; end if;

  return exists (
    select 1 from public.credit_reservations
    where id = p_reservation_id
      and user_id = p_user_id
      and status = 'finalized'
  );
end;
$$;

create or replace function public.refund_recipe_credit(
  p_user_id uuid,
  p_reservation_id uuid,
  p_reason text default 'extraction_failed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.credit_reservations%rowtype;
  new_balance int;
begin
  select * into reservation
  from public.credit_reservations
  where id = p_reservation_id and user_id = p_user_id
  for update;

  if not found or reservation.status = 'refunded' then
    return true;
  end if;
  if reservation.status <> 'reserved' then
    return false;
  end if;

  if reservation.source = 'monthly_free' then
    update public.extract_usage_monthly
    set extract_count = greatest(0, extract_count - 1), updated_at = now()
    where user_id = reservation.user_id
      and year_month = reservation.year_month;
  else
    update public.profiles
    set token_balance = token_balance + 1
    where id = reservation.user_id
    returning token_balance into new_balance;

    insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
    values (
      reservation.user_id,
      1,
      new_balance,
      'recipe_credit_refunded',
      reservation.id::text,
      jsonb_build_object('reason', coalesce(p_reason, 'extraction_failed'))
    );
  end if;

  update public.credit_reservations
  set status = 'refunded', refunded_at = now()
  where id = reservation.id;
  return true;
end;
$$;

create or replace function public.grant_purchased_credits(
  p_user_id uuid,
  p_amount int,
  p_provider text,
  p_event_id text,
  p_transaction_id text,
  p_product_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_id uuid;
  new_balance int;
begin
  if p_amount is null or p_amount < 1 then raise exception 'invalid_amount'; end if;
  if nullif(trim(p_provider), '') is null then raise exception 'invalid_provider'; end if;
  if nullif(trim(p_event_id), '') is null then raise exception 'invalid_event_id'; end if;
  if nullif(trim(p_transaction_id), '') is null then raise exception 'invalid_transaction_id'; end if;
  if nullif(trim(p_product_id), '') is null then raise exception 'invalid_product_id'; end if;

  insert into public.purchase_credit_grants (
    user_id, provider, event_id, transaction_id, product_id, credits, metadata
  )
  values (
    p_user_id, trim(p_provider), trim(p_event_id), trim(p_transaction_id),
    trim(p_product_id), p_amount, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into grant_id;

  if grant_id is null then
    select token_balance into new_balance from public.profiles where id = p_user_id;
    if new_balance is null then raise exception 'profile_not_found'; end if;
    return new_balance;
  end if;

  update public.profiles
  set token_balance = token_balance + p_amount
  where id = p_user_id
  returning token_balance into new_balance;
  if new_balance is null then raise exception 'profile_not_found'; end if;

  insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
  values (
    p_user_id,
    p_amount,
    new_balance,
    'recipe_credit_purchase',
    grant_id::text,
    jsonb_build_object(
      'provider', trim(p_provider),
      'product_id', trim(p_product_id),
      'transaction_id', trim(p_transaction_id)
    )
  );

  return new_balance;
end;
$$;

create or replace function public.admin_grant_recipe_credits(
  p_user_id uuid,
  p_amount int,
  p_reason text default 'support_adjustment'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance int;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;

  update public.profiles
  set token_balance = token_balance + p_amount
  where id = p_user_id
    and token_balance + p_amount >= 0
  returning token_balance into new_balance;
  if new_balance is null then raise exception 'invalid_balance_or_profile'; end if;

  insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
  values (
    p_user_id,
    p_amount,
    new_balance,
    'admin_credit_adjustment',
    auth.uid()::text,
    jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'support_adjustment'))
  );
  return new_balance;
end;
$$;

create or replace function public.refund_stale_recipe_credits(
  p_before timestamptz default (now() - interval '30 minutes')
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation record;
  refunded_count int := 0;
begin
  for reservation in
    select id, user_id
    from public.credit_reservations
    where status = 'reserved' and created_at < p_before
    order by created_at
    for update skip locked
  loop
    if public.refund_recipe_credit(
      reservation.user_id,
      reservation.id,
      'stale_reservation'
    ) then
      refunded_count := refunded_count + 1;
    end if;
  end loop;
  return refunded_count;
end;
$$;

revoke all on function public.reserve_recipe_credit(uuid, text, text, int) from public;
revoke all on function public.finalize_recipe_credit(uuid, uuid) from public;
revoke all on function public.refund_recipe_credit(uuid, uuid, text) from public;
revoke all on function public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb) from public;
revoke all on function public.reserve_daily_remix(uuid, date, int) from public;
revoke all on function public.admin_grant_recipe_credits(uuid, int, text) from public;
revoke all on function public.refund_stale_recipe_credits(timestamptz) from public;

grant execute on function public.reserve_recipe_credit(uuid, text, text, int) to service_role;
grant execute on function public.finalize_recipe_credit(uuid, uuid) to service_role;
grant execute on function public.refund_recipe_credit(uuid, uuid, text) to service_role;
grant execute on function public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb) to service_role;
grant execute on function public.reserve_daily_remix(uuid, date, int) to service_role;
grant execute on function public.admin_grant_recipe_credits(uuid, int, text) to authenticated, service_role;
grant execute on function public.refund_stale_recipe_credits(timestamptz) to service_role;
