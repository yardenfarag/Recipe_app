-- A request from the app could queue a refund for a credit that had already paid for a recipe:
-- repair-recipe's `abort` passed any reservation id to mark_recipe_credit_compensation_pending,
-- which accepted `finalized` rows, and the cleanup job then refunded them.
--
-- From now on the general function only queues an unspent (`reserved`) credit. A spent credit
-- can only be queued through the after-finalize-failure function, which Edge Functions call when
-- they themselves saw finalize fail, never on a reservation id the app chose.

create or replace function public.mark_recipe_credit_compensation_after_finalize_failure(
  p_user_id uuid,
  p_reservation_id uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_reservations
  set compensation_requested_at = coalesce(compensation_requested_at, now()),
      compensation_reason = 'finalize_failed',
      compensation_last_error = left(nullif(p_error, ''), 500),
      compensation_attempts = compensation_attempts + 1
  where id = p_reservation_id
    and user_id = p_user_id
    and status in ('reserved', 'finalized');
  return found;
end;
$$;

create or replace function public.mark_recipe_credit_compensation_pending(
  p_user_id uuid,
  p_reservation_id uuid,
  p_reason text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_reservations
  set compensation_requested_at = coalesce(compensation_requested_at, now()),
      compensation_reason = coalesce(nullif(trim(p_reason), ''), 'extraction_failed'),
      compensation_last_error = left(nullif(p_error, ''), 500),
      compensation_attempts = compensation_attempts + 1
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.mark_recipe_credit_compensation_after_finalize_failure(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_recipe_credit_compensation_after_finalize_failure(uuid, uuid, text)
  to service_role;

-- create or replace keeps existing grants; restate them so this file stands on its own.
revoke all on function public.mark_recipe_credit_compensation_pending(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_recipe_credit_compensation_pending(uuid, uuid, text, text)
  to service_role;
