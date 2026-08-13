-- Billing safety: atomic guest reservations, bounded authenticated AI helpers,
-- and refundable daily reservations.

create table if not exists public.guest_extraction_reservations (
  id uuid primary key default gen_random_uuid(),
  install_id text not null,
  idempotency_key text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'finalized', 'refunded')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  unique (install_id, idempotency_key)
);

create index if not exists guest_extraction_reservations_stale_idx
  on public.guest_extraction_reservations (created_at)
  where status = 'reserved';

alter table public.guest_extraction_reservations enable row level security;
-- No client policies: Edge Functions use the service role.

create table if not exists public.ai_usage_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('substitution', 'translation')),
  usage_date date not null,
  usage_count int not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, usage_date)
);

alter table public.ai_usage_daily enable row level security;

create policy "Users read own daily AI usage"
  on public.ai_usage_daily for select
  using (auth.uid() = user_id);

create or replace function public.reserve_guest_extraction_v2(
  p_install_id text,
  p_idempotency_key text,
  p_limit int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_install_id text := trim(p_install_id);
  normalized_key text := trim(p_idempotency_key);
  current_count int;
  reservation public.guest_extraction_reservations%rowtype;
begin
  if p_install_id is null or length(normalized_install_id) < 8 then
    raise exception 'invalid_install_id';
  end if;
  if p_idempotency_key is null or length(normalized_key) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_limit';
  end if;

  insert into public.guest_usage (install_id, extract_count, updated_at)
  values (normalized_install_id, 0, now())
  on conflict (install_id) do nothing;

  select extract_count into current_count
  from public.guest_usage
  where install_id = normalized_install_id
  for update;

  select * into reservation
  from public.guest_extraction_reservations
  where install_id = normalized_install_id
    and idempotency_key = normalized_key;

  if found and reservation.status in ('reserved', 'finalized') then
    return jsonb_build_object(
      'reservation_id', reservation.id,
      'status', reservation.status,
      'count', current_count,
      'remaining', greatest(0, p_limit - current_count)
    );
  end if;

  if current_count >= p_limit then
    return jsonb_build_object('code', 'guest_limit', 'count', current_count, 'remaining', 0);
  end if;

  update public.guest_usage
  set extract_count = extract_count + 1, updated_at = now()
  where install_id = normalized_install_id
  returning extract_count into current_count;

  if reservation.id is null then
    insert into public.guest_extraction_reservations (install_id, idempotency_key)
    values (normalized_install_id, normalized_key)
    returning * into reservation;
  else
    update public.guest_extraction_reservations
    set status = 'reserved',
        created_at = now(),
        finalized_at = null,
        refunded_at = null,
        refund_reason = null
    where id = reservation.id
    returning * into reservation;
  end if;

  return jsonb_build_object(
    'reservation_id', reservation.id,
    'status', reservation.status,
    'count', current_count,
    'remaining', greatest(0, p_limit - current_count)
  );
end;
$$;

create or replace function public.finalize_guest_extraction(
  p_install_id text,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_extraction_reservations
  set status = 'finalized', finalized_at = now()
  where id = p_reservation_id
    and install_id = trim(p_install_id)
    and status = 'reserved';

  if found then return true; end if;

  return exists (
    select 1 from public.guest_extraction_reservations
    where id = p_reservation_id
      and install_id = trim(p_install_id)
      and status = 'finalized'
  );
end;
$$;

create or replace function public.refund_guest_extraction(
  p_install_id text,
  p_reservation_id uuid,
  p_reason text default 'extraction_failed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.guest_extraction_reservations%rowtype;
begin
  select * into reservation
  from public.guest_extraction_reservations
  where id = p_reservation_id and install_id = trim(p_install_id)
  for update;

  if not found or reservation.status = 'refunded' then
    return true;
  end if;
  if reservation.status <> 'reserved'
     and not (reservation.status = 'finalized' and p_reason = 'finalize_failed') then
    return false;
  end if;

  update public.guest_usage
  set extract_count = greatest(0, extract_count - 1), updated_at = now()
  where install_id = reservation.install_id;

  update public.guest_extraction_reservations
  set status = 'refunded',
      refunded_at = now(),
      refund_reason = coalesce(nullif(trim(p_reason), ''), 'extraction_failed')
  where id = reservation.id;

  return true;
end;
$$;

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
  if p_action not in ('substitution', 'translation') then
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

create or replace function public.refund_daily_ai_usage(
  p_user_id uuid,
  p_action text,
  p_usage_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_usage_daily
  set usage_count = greatest(0, usage_count - 1), updated_at = now()
  where user_id = p_user_id
    and action = p_action
    and usage_date = p_usage_date
    and usage_count > 0;
  return found;
end;
$$;

create or replace function public.refund_daily_remix(
  p_user_id uuid,
  p_usage_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.remix_usage_daily
  set remix_count = greatest(0, remix_count - 1), updated_at = now()
  where user_id = p_user_id
    and usage_date = p_usage_date
    and remix_count > 0;
  return found;
end;
$$;

create or replace function public.reopen_refunded_recipe_credit(
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

  select token_balance into paid_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then raise exception 'profile_not_found'; end if;

  select * into reservation
  from public.credit_reservations
  where user_id = p_user_id
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if not found or reservation.status <> 'refunded' then
    return public.reserve_recipe_credit(
      p_user_id, p_year_month, p_idempotency_key, p_free_limit
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

  update public.credit_reservations
  set year_month = p_year_month,
      source = chosen_source,
      status = 'reserved',
      created_at = now(),
      finalized_at = null,
      refunded_at = null
  where id = reservation.id
  returning * into reservation;

  if chosen_source = 'purchased' then
    insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
    values (
      p_user_id,
      -1,
      paid_balance,
      'recipe_credit_reserved',
      reservation.id::text,
      jsonb_build_object(
        'idempotency_key', trim(p_idempotency_key),
        'reopened', true
      )
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

create or replace function public.refund_recipe_credit_after_finalize_failure(
  p_user_id uuid,
  p_reservation_id uuid
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
  if reservation.status not in ('reserved', 'finalized') then
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
      jsonb_build_object('reason', 'finalize_failed')
    );
  end if;

  update public.credit_reservations
  set status = 'refunded', refunded_at = now()
  where id = reservation.id;
  return true;
end;
$$;

revoke all on function public.reserve_guest_extraction_v2(text, text, int) from public;
revoke all on function public.finalize_guest_extraction(text, uuid) from public;
revoke all on function public.refund_guest_extraction(text, uuid, text) from public;
revoke all on function public.reserve_daily_ai_usage(uuid, text, date, int) from public;
revoke all on function public.refund_daily_ai_usage(uuid, text, date) from public;
revoke all on function public.refund_daily_remix(uuid, date) from public;
revoke all on function public.reopen_refunded_recipe_credit(uuid, text, text, int) from public;
revoke all on function public.refund_recipe_credit_after_finalize_failure(uuid, uuid) from public;

grant execute on function public.reserve_guest_extraction_v2(text, text, int) to service_role;
grant execute on function public.finalize_guest_extraction(text, uuid) to service_role;
grant execute on function public.refund_guest_extraction(text, uuid, text) to service_role;
grant execute on function public.reserve_daily_ai_usage(uuid, text, date, int) to service_role;
grant execute on function public.refund_daily_ai_usage(uuid, text, date) to service_role;
grant execute on function public.refund_daily_remix(uuid, date) to service_role;
grant execute on function public.reopen_refunded_recipe_credit(uuid, text, text, int) to service_role;
grant execute on function public.refund_recipe_credit_after_finalize_failure(uuid, uuid) to service_role;
