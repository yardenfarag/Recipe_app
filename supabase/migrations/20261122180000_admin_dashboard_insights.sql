-- PIN-49: the numbers behind the web admin dashboard's hints ("what to look at
-- next") that admin_dashboard does not already return:
--   extract_by_platform  extraction attempts, recipes, failures, video share,
--                        cost and p95 time per platform
--   gate                 Jev extract-gate decisions and what happened to the
--                        extracts they routed (a "full recipe in text" call
--                        that still needed the video or failed is a miss)
--   translations         translation calls, failures, cost, people, languages
--   latency              p50 / p95 time per AI feature
-- A separate function, so admin_dashboard stays as it is. Same rules: admins
-- only, the same day window in the caller's timezone, and admin accounts left
-- out unless asked for. Each block has the previous window too, for trends.

create or replace function public.admin_dashboard_insights(
  p_days integer default 30,
  p_tz text default 'UTC',
  p_include_admins boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_tz text := coalesce(nullif(trim(p_tz), ''), 'UTC');
  v_today date;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_excluded uuid[];
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_since := (v_today - (v_days - 1))::timestamp at time zone v_tz;
  v_prev_since := (v_today - (2 * v_days - 1))::timestamp at time zone v_tz;
  v_excluded := case
    when coalesce(p_include_admins, false) then '{}'::uuid[]
    else array(select id from profiles where is_admin = true)
  end;

  with
  ai as (
    select e.*, case when e.created_at >= v_since then 'current' else 'previous' end as win
    from ai_usage_events e
    where e.created_at >= v_prev_since
      and not coalesce(e.user_id = any(v_excluded), false)
  ),
  -- Cache hits cost nothing and say nothing about the extractor, so they are left out.
  extracts as (
    select a.*,
      a.status in ('full', 'partial') as ok,
      a.status in ('error', 'failed', 'metering_error') as bad
    from ai a
    where a.action = 'extract' and a.status <> 'cached'
  ),
  wins(win) as (values ('current'), ('previous')),
  extract_by_platform as (
    select jsonb_object_agg(w.win, coalesce((
      select jsonb_agg(x order by (x->>'attempts')::int desc, x->>'platform')
      from (
        select jsonb_build_object(
          'platform', coalesce(nullif(e.platform, ''), 'unknown'),
          'attempts', count(*) filter (where e.ok or e.bad),
          'recipes', count(*) filter (where e.ok),
          'failed', count(*) filter (where e.bad),
          'video', count(*) filter (where e.ok and e.extraction_source = 'video'),
          'cost_usd', coalesce(sum(e.total_cost_usd), 0),
          'p95_ms', percentile_disc(0.95) within group (order by e.duration_ms)
        ) as x
        from extracts e
        where e.win = w.win
        group by coalesce(nullif(e.platform, ''), 'unknown')
      ) t
    ), '[]'::jsonb)) as value
    from wins w
  ),
  gate_rows as (
    select * from ai where action = 'extract_gate'
  ),
  routed as (
    select e.*, e.metadata->>'extract_route' as route
    from extracts e
    where e.metadata->>'extract_route' is not null
  ),
  gate as (
    select jsonb_object_agg(w.win, jsonb_build_object(
      'decisions', (select count(*) from gate_rows g where g.win = w.win),
      'confident', (select count(*) from gate_rows g
                    where g.win = w.win and g.status not in ('low_confidence', 'error')),
      'low_confidence', (select count(*) from gate_rows g where g.win = w.win and g.status = 'low_confidence'),
      'errors', (select count(*) from gate_rows g where g.win = w.win and g.status = 'error'),
      'cost_usd', (select coalesce(sum(g.total_cost_usd), 0) from gate_rows g where g.win = w.win),
      'routes', coalesce((
        select jsonb_agg(x order by (x->>'extracts')::int desc, x->>'route')
        from (
          select jsonb_build_object(
            'route', r.route,
            'extracts', count(*),
            'recipes', count(*) filter (where r.ok),
            'video', count(*) filter (where r.ok and r.extraction_source = 'video'),
            'failed', count(*) filter (where r.bad),
            'blocked', count(*) filter (where r.error_message = 'extract_gate: no_recipe')
          ) as x
          from routed r
          where r.win = w.win
          group by r.route
        ) t
      ), '[]'::jsonb)
    )) as value
    from wins w
  ),
  tr as (
    select * from ai where action = 'translate'
  ),
  translations as (
    select jsonb_object_agg(w.win, jsonb_build_object(
      'calls', (select count(*) from tr where tr.win = w.win),
      'ok', (select count(*) from tr where tr.win = w.win and tr.status = 'ok'),
      'failed', (select count(*) from tr where tr.win = w.win and tr.status in ('error', 'failed', 'metering_error')),
      'cost_usd', (select coalesce(sum(tr.total_cost_usd), 0) from tr where tr.win = w.win),
      'people', (select count(distinct coalesce(tr.user_id::text, tr.guest_install_id)) from tr where tr.win = w.win),
      'languages', coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label)
        from (
          select coalesce(nullif(tr.metadata->>'targetLanguage', ''), 'unknown') as label, count(*) as n
          from tr where tr.win = w.win group by 1
        ) t
      ), '[]'::jsonb)
    )) as value
    from wins w
  ),
  latency as (
    select coalesce(jsonb_agg(x order by (x->>'p95_ms')::numeric desc nulls last), '[]'::jsonb) as value
    from (
      select jsonb_build_object(
        'action', a.action,
        'calls', count(*),
        'p50_ms', percentile_disc(0.5) within group (order by a.duration_ms),
        'p95_ms', percentile_disc(0.95) within group (order by a.duration_ms)
      ) as x
      from ai a
      where a.win = 'current' and a.duration_ms is not null and a.status <> 'cached'
      group by a.action
    ) t
  )
  select jsonb_build_object(
    'range', jsonb_build_object('days', v_days, 'tz', v_tz, 'since', v_since, 'previous_since', v_prev_since),
    'extract_by_platform', (select value from extract_by_platform),
    'gate', (select value from gate),
    'translations', (select value from translations),
    'latency', (select value from latency)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_insights(integer, text, boolean) from public;
revoke all on function public.admin_dashboard_insights(integer, text, boolean) from anon;
grant execute on function public.admin_dashboard_insights(integer, text, boolean) to authenticated;
