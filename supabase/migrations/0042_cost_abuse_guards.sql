-- Play Store cost guards.
-- 1. Replaying an extract request id must not run the model again.
-- 2. Remix and Snap/invent attempts get a per-user daily ceiling.

alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_action_check;

alter table public.ai_usage_daily
  add constraint ai_usage_daily_action_check
  check (action in (
    'substitution',
    'translation',
    'fridge_match',
    'content_gate',
    'remix',
    'extract_attempt'
  ));

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
  if p_action not in (
    'substitution',
    'translation',
    'fridge_match',
    'content_gate',
    'remix',
    'extract_attempt'
  ) then
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
      'fresh', false,
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
      'fresh', false,
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
    'fresh', true,
    'free_remaining', greatest(0, p_free_limit - free_used),
    'purchased_remaining', paid_balance
  );
end;
$$;
