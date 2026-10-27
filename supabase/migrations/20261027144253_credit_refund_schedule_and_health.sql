-- Schedule stale-reservation refunds and give admins a credit health report.
-- 0021 only scheduled the refund job when pg_cron was already installed. It
-- wasn't, so nothing refunded credits held by extractions that crashed.

create extension if not exists pg_cron;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-refund-stale-extractions') then
    perform cron.unschedule('pinch-refund-stale-extractions');
  end if;
  perform cron.schedule(
    'pinch-refund-stale-extractions',
    '*/10 * * * *',
    'select public.refund_stale_extraction_reservations();'
  );
end;
$schedule$;

-- RevenueCat retries failed deliveries, but the reasons only reached function
-- logs. The webhook records each failure here so the admin report can count them.
create table if not exists public.purchase_webhook_failures (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  event_id text,
  transaction_id text,
  product_id text,
  app_user_id text,
  store text,
  environment text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists purchase_webhook_failures_created_idx
  on public.purchase_webhook_failures (created_at desc);

alter table public.purchase_webhook_failures enable row level security;

create policy "Admins read purchase webhook failures"
  on public.purchase_webhook_failures
  for select
  to authenticated
  using (public.is_current_user_admin());

create or replace function public.admin_credit_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  stale_before timestamptz := now() - interval '30 minutes';
  purchases jsonb;
  reservations jsonb;
  webhook jsonb;
  refund_job jsonb;
  extraction jsonb;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'last_24h', count(*) filter (where created_at > now() - interval '24 hours'),
    'last_7d', count(*) filter (where created_at > now() - interval '7 days'),
    'credits_7d', coalesce(sum(credits) filter (where created_at > now() - interval '7 days'), 0),
    'last_at', max(created_at),
    'by_store_7d', coalesce((
      select jsonb_agg(jsonb_build_object('store', s.store, 'environment', s.environment, 'count', s.n)
                       order by s.n desc)
      from (
        select metadata->>'store' as store, metadata->>'environment' as environment, count(*) as n
        from public.purchase_credit_grants
        where created_at > now() - interval '7 days'
        group by 1, 2
      ) s
    ), '[]'::jsonb)
  ) into purchases
  from public.purchase_credit_grants;

  select jsonb_build_object(
    'stuck', count(*) filter (where status = 'reserved' and created_at < stale_before),
    'pending_compensation',
      count(*) filter (where compensation_requested_at is not null and status <> 'refunded'),
    'refunded_24h', count(*) filter (where refunded_at > now() - interval '24 hours')
  ) into reservations
  from public.credit_reservations;

  -- A failure is resolved once a later delivery granted the same transaction.
  select jsonb_build_object(
    'failures_24h', count(*) filter (where f.created_at > now() - interval '24 hours'),
    'failures_7d', count(*),
    'unresolved_7d', count(*) filter (where not exists (
      select 1 from public.purchase_credit_grants g
      where g.transaction_id = f.transaction_id
    )),
    'last_failure_at', max(f.created_at),
    'last_failure_reason', (array_agg(f.reason order by f.created_at desc))[1]
  ) into webhook
  from public.purchase_webhook_failures f
  where f.created_at > now() - interval '7 days';

  select jsonb_build_object(
    'scheduled', exists (
      select 1 from cron.job where jobname = 'pinch-refund-stale-extractions' and active
    ),
    'last_run_at', max(d.end_time),
    'last_status', (array_agg(d.status order by d.start_time desc))[1],
    'failed_runs_24h', count(*) filter (
      where d.status = 'failed' and d.start_time > now() - interval '24 hours'
    )
  ) into refund_job
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.jobname = 'pinch-refund-stale-extractions'
    and d.start_time > now() - interval '7 days';

  select jsonb_build_object(
    'count_7d', count(*),
    'failed_7d', count(*) filter (where status in ('error', 'failed')),
    'video_7d', count(*) filter (where extraction_source = 'video'),
    'p95_cost_usd_7d', coalesce(
      percentile_cont(0.95) within group (order by total_cost_usd), 0
    )
  ) into extraction
  from public.ai_usage_events
  where action = 'extract'
    and status <> 'cached'
    and created_at > now() - interval '7 days';

  return jsonb_build_object(
    'generated_at', now(),
    'purchases', purchases,
    'reservations', reservations,
    'webhook', webhook,
    'refund_job', refund_job,
    'extraction', extraction
  );
end;
$$;

-- Supabase grants new functions to anon directly; revoking from public is not enough (0043).
revoke all on function public.admin_credit_health() from public, anon;
grant execute on function public.admin_credit_health() to authenticated;
