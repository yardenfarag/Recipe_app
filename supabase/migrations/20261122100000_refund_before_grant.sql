-- A refund that arrives before its purchase must not leave the credits behind (PIN-153).
--
-- Payment webhooks aren't ordered. When "refunded" was delivered before "paid",
-- revoke_purchased_credits found no grant and did nothing, and the later grant then credited an
-- order whose money had already gone back. Now the refund leaves a marker, and
-- grant_purchased_credits refuses a purchase that has one.

create table if not exists public.purchase_refund_markers (
  provider text not null,
  transaction_id text not null,
  event_id text,
  created_at timestamptz not null default now(),
  primary key (provider, transaction_id)
);

comment on table public.purchase_refund_markers is
  'Refunds that arrived before their purchase was granted. grant_purchased_credits refuses these transactions. Service role only.';

-- Service role only: RLS on, no policies, and none of the default API grants.
alter table public.purchase_refund_markers enable row level security;
revoke all on public.purchase_refund_markers from public, anon, authenticated;

-- Same body as 20261115200000, plus the lock and the marker.
-- Returns the new balance, or null when no grant matches the transaction.
create or replace function public.revoke_purchased_credits(
  p_provider text,
  p_transaction_id text,
  p_event_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row public.purchase_credit_grants%rowtype;
  current_balance int;
  removed int;
  new_balance int;
begin
  if nullif(trim(p_provider), '') is null then raise exception 'invalid_provider'; end if;
  if nullif(trim(p_transaction_id), '') is null then raise exception 'invalid_transaction_id'; end if;
  if nullif(trim(p_event_id), '') is null then raise exception 'invalid_event_id'; end if;

  -- One purchase at a time, so a grant and a refund delivered together can't miss each other.
  perform pg_advisory_xact_lock(hashtextextended(trim(p_provider) || ':' || trim(p_transaction_id), 0));

  select * into grant_row
  from public.purchase_credit_grants
  where provider = trim(p_provider) and transaction_id = trim(p_transaction_id)
  for update;
  if not found then
    insert into public.purchase_refund_markers (provider, transaction_id, event_id)
    values (trim(p_provider), trim(p_transaction_id), trim(p_event_id))
    on conflict do nothing;
    return null;
  end if;

  select token_balance into current_balance
  from public.profiles
  where id = grant_row.user_id
  for update;
  if current_balance is null then raise exception 'profile_not_found'; end if;

  if grant_row.revoked_at is not null then return current_balance; end if;

  removed := least(grant_row.credits, greatest(current_balance, 0));
  new_balance := current_balance - removed;

  update public.profiles set token_balance = new_balance where id = grant_row.user_id;

  update public.purchase_credit_grants
  set revoked_at = now(), revoked_credits = removed, revoke_event_id = trim(p_event_id)
  where id = grant_row.id;

  insert into public.token_ledger (user_id, delta, balance_after, reason, ref_id, metadata)
  values (
    grant_row.user_id,
    -removed,
    new_balance,
    'recipe_credit_purchase_refund',
    grant_row.id::text,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', grant_row.provider,
      'product_id', grant_row.product_id,
      'transaction_id', grant_row.transaction_id,
      'pack_credits', grant_row.credits
    )
  );

  return new_balance;
end;
$$;

-- Same body as 0018, plus the lock and the marker check. A refunded purchase raises
-- 'purchase_refunded', which the webhooks record and accept (a retry can't change it).
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

  perform pg_advisory_xact_lock(hashtextextended(trim(p_provider) || ':' || trim(p_transaction_id), 0));

  if exists (
    select 1 from public.purchase_refund_markers
    where provider = trim(p_provider) and transaction_id = trim(p_transaction_id)
  ) then
    raise exception 'purchase_refunded';
  end if;

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

-- Both stay service role only (the webhooks). `create or replace` keeps the existing grants;
-- stated again so this file is correct on its own.
revoke all on function public.revoke_purchased_credits(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.revoke_purchased_credits(text, text, text, jsonb) to service_role;
grant execute on function public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb) to service_role;
