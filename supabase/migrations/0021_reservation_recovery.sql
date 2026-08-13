-- Recover failed extraction compensation without risking duplicate refunds.
-- Compensation requests remain recorded after success for auditability; pending
-- work is identified by status <> 'refunded'.

alter table public.credit_reservations
  add column if not exists compensation_requested_at timestamptz,
  add column if not exists compensation_reason text,
  add column if not exists compensation_last_error text,
  add column if not exists compensation_attempts int not null default 0
    check (compensation_attempts >= 0);

alter table public.guest_extraction_reservations
  add column if not exists compensation_requested_at timestamptz,
  add column if not exists compensation_reason text,
  add column if not exists compensation_last_error text,
  add column if not exists compensation_attempts int not null default 0
    check (compensation_attempts >= 0);

create index if not exists credit_reservations_compensation_pending_idx
  on public.credit_reservations (compensation_requested_at)
  where compensation_requested_at is not null and status <> 'refunded';

create index if not exists guest_extraction_compensation_pending_idx
  on public.guest_extraction_reservations (compensation_requested_at)
  where compensation_requested_at is not null and status <> 'refunded';

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
    and status in ('reserved', 'finalized');
  return found;
end;
$$;

create or replace function public.mark_guest_extraction_compensation_pending(
  p_install_id text,
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
  update public.guest_extraction_reservations
  set compensation_requested_at = coalesce(compensation_requested_at, now()),
      compensation_reason = coalesce(nullif(trim(p_reason), ''), 'extraction_failed'),
      compensation_last_error = left(nullif(p_error, ''), 500),
      compensation_attempts = compensation_attempts + 1
  where id = p_reservation_id
    and install_id = trim(p_install_id)
    and status in ('reserved', 'finalized');
  return found;
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
  refunded boolean;
begin
  for reservation in
    select id, user_id, status, compensation_reason
    from public.credit_reservations
    where status <> 'refunded'
      and (
        (status = 'reserved' and created_at < p_before)
        or compensation_requested_at is not null
      )
    order by coalesce(compensation_requested_at, created_at)
    for update skip locked
  loop
    if reservation.status = 'finalized' then
      refunded := public.refund_recipe_credit_after_finalize_failure(
        reservation.user_id,
        reservation.id
      );
    else
      refunded := public.refund_recipe_credit(
        reservation.user_id,
        reservation.id,
        coalesce(reservation.compensation_reason, 'stale_reservation')
      );
    end if;
    if refunded then refunded_count := refunded_count + 1; end if;
  end loop;
  return refunded_count;
end;
$$;

create or replace function public.refund_stale_guest_extractions(
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
  refunded boolean;
begin
  for reservation in
    select id, install_id, status, compensation_reason
    from public.guest_extraction_reservations
    where status <> 'refunded'
      and (
        (status = 'reserved' and created_at < p_before)
        or compensation_requested_at is not null
      )
    order by coalesce(compensation_requested_at, created_at)
    for update skip locked
  loop
    refunded := public.refund_guest_extraction(
      reservation.install_id,
      reservation.id,
      case
        when reservation.status = 'finalized' then 'finalize_failed'
        else coalesce(reservation.compensation_reason, 'stale_reservation')
      end
    );
    if refunded then refunded_count := refunded_count + 1; end if;
  end loop;
  return refunded_count;
end;
$$;

create or replace function public.refund_stale_extraction_reservations(
  p_before timestamptz default (now() - interval '30 minutes')
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  signed_in_count int;
  guest_count int;
begin
  signed_in_count := public.refund_stale_recipe_credits(p_before);
  guest_count := public.refund_stale_guest_extractions(p_before);
  return jsonb_build_object(
    'signed_in_refunded', signed_in_count,
    'guest_refunded', guest_count
  );
end;
$$;

revoke all on function public.mark_recipe_credit_compensation_pending(uuid, uuid, text, text) from public;
revoke all on function public.mark_guest_extraction_compensation_pending(text, uuid, text, text) from public;
revoke all on function public.refund_stale_guest_extractions(timestamptz) from public;
revoke all on function public.refund_stale_extraction_reservations(timestamptz) from public;

grant execute on function public.mark_recipe_credit_compensation_pending(uuid, uuid, text, text) to service_role;
grant execute on function public.mark_guest_extraction_compensation_pending(text, uuid, text, text) to service_role;
grant execute on function public.refund_stale_guest_extractions(timestamptz) to service_role;
grant execute on function public.refund_stale_extraction_reservations(timestamptz) to service_role;

-- Hosted projects with pg_cron installed run recovery every 10 minutes. Local
-- and restricted environments safely skip scheduling; operators can invoke:
--   select public.refund_stale_extraction_reservations();
do $schedule$
declare
  job_exists boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute
      'select exists (select 1 from cron.job where jobname = $1)'
      into job_exists
      using 'pinch-refund-stale-extractions';
    if not job_exists then
      execute $sql$
        select cron.schedule(
          'pinch-refund-stale-extractions',
          '*/10 * * * *',
          'select public.refund_stale_extraction_reservations();'
        )
      $sql$;
    end if;
  end if;
end;
$schedule$;
