-- Web credit packs are sold through Paddle (supabase/functions/paddle-webhook). When Paddle
-- approves a refund or a chargeback, the pack's credits are taken back.
--
-- At most the credits the user still has are removed, so the balance never goes negative:
-- credits already spent stay spent. A grant is revoked once; a repeated delivery is a no-op.

alter table public.purchase_credit_grants
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_credits int check (revoked_credits is null or revoked_credits >= 0),
  add column if not exists revoke_event_id text;

comment on column public.purchase_credit_grants.revoked_at is
  'When a refund or chargeback took this pack back (revoke_purchased_credits).';
comment on column public.purchase_credit_grants.revoked_credits is
  'Credits actually removed: the pack size, or less when some were already spent.';

-- Returns the new balance, or null when no grant matches the transaction (for example a
-- refund of a purchase made before the webhook existed).
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

  select * into grant_row
  from public.purchase_credit_grants
  where provider = trim(p_provider) and transaction_id = trim(p_transaction_id)
  for update;
  if not found then return null; end if;

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

-- Service role only (the webhook). Supabase grants anon/authenticated EXECUTE directly, so
-- revoking from public alone would leave them able to call it.
revoke all on function public.revoke_purchased_credits(text, text, text, jsonb) from public;
revoke all on function public.revoke_purchased_credits(text, text, text, jsonb) from anon, authenticated;
grant execute on function public.revoke_purchased_credits(text, text, text, jsonb) to service_role;
