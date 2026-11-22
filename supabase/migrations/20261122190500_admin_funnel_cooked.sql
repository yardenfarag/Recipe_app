-- Cooking as the activation goal: the admin dashboard funnel gains "cooked", the new people who marked at
-- least one recipe cooked. Cooking is what keeps people saving recipes and coming back (Nov 2026 retention
-- review), so it sits between "Saved 3+" and "Bought credits".
--
-- The function is the one from 20261118120000_admin_dashboard_signup_source.sql with only that field added.

create or replace function public.admin_dashboard(
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
  v_admins uuid[];
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
  v_admins := array(select id from profiles where is_admin = true);
  v_excluded := case when coalesce(p_include_admins, false) then '{}'::uuid[] else v_admins end;

  with
  prices(product_id, usd) as (
    values ('pinch_credits_10', 1.99::numeric), ('pinch_credits_30', 4.99), ('pinch_credits_100', 7.99)
  ),
  -- Rows from people we count. Cost totals use ai_all so spend is never hidden.
  people as (
    select * from profiles p where not (p.id = any(v_excluded))
  ),
  ai_all as (
    select e.*, (e.created_at at time zone v_tz)::date as day
    from ai_usage_events e
    where e.created_at >= v_prev_since
  ),
  ai as (
    select * from ai_all e where not coalesce(e.user_id = any(v_excluded), false)
  ),
  ev as (
    select e.*, (e.created_at at time zone v_tz)::date as day
    from product_events e
    where e.created_at >= v_prev_since
      and not coalesce(e.user_id = any(v_excluded), false)
  ),
  rec as (
    select r.*, (r.created_at at time zone v_tz)::date as day
    from recipes r
    where not coalesce(r.user_id = any(v_excluded), false)
  ),
  grants as (
    select g.*, coalesce(pr.usd, 0) as usd, (g.created_at at time zone v_tz)::date as day
    from purchase_credit_grants g
    left join prices pr using (product_id)
    where g.revoked_at is null
      and not coalesce(g.user_id = any(v_excluded), false)
  ),
  windows(label, a, b) as (
    values ('current', v_since, now() + interval '1 minute'), ('previous', v_prev_since, v_since)
  ),
  kpis as (
    select jsonb_object_agg(w.label, jsonb_build_object(
      'new_users', (select count(*) from people p where p.created_at >= w.a and p.created_at < w.b),
      'active_users', (
        select count(distinct s.uid) from (
          select user_id as uid from ai where created_at >= w.a and created_at < w.b
          union all select user_id from ev where created_at >= w.a and created_at < w.b
          union all select user_id from rec where created_at >= w.a and created_at < w.b
        ) s where s.uid is not null
      ),
      'active_guests', (
        select count(distinct s.gid) from (
          select guest_install_id as gid from ai where user_id is null and created_at >= w.a and created_at < w.b
          union all select guest_install_id from ev where user_id is null and created_at >= w.a and created_at < w.b
        ) s where s.gid is not null
      ),
      'recipes_saved', (select count(*) from rec where created_at >= w.a and created_at < w.b),
      'extractions', (
        select count(*) from ai
        where action = 'extract' and status in ('full', 'partial', 'cached')
          and created_at >= w.a and created_at < w.b
      ),
      'extraction_failures', (
        select count(*) from ai
        where action = 'extract' and status in ('error', 'failed', 'metering_error')
          and created_at >= w.a and created_at < w.b
      ),
      'ai_cost_usd', (
        select coalesce(sum(total_cost_usd), 0) from ai_all where created_at >= w.a and created_at < w.b
      ),
      'ai_cost_admin_usd', (
        select coalesce(sum(total_cost_usd), 0) from ai_all
        where user_id = any(v_admins) and created_at >= w.a and created_at < w.b
      ),
      'ai_cost_guest_usd', (
        select coalesce(sum(total_cost_usd), 0) from ai_all
        where user_id is null and created_at >= w.a and created_at < w.b
      ),
      'purchases', (select count(*) from grants where created_at >= w.a and created_at < w.b),
      'credits_sold', (select coalesce(sum(credits), 0) from grants where created_at >= w.a and created_at < w.b),
      'revenue_usd', (select coalesce(sum(usd), 0) from grants where created_at >= w.a and created_at < w.b)
    )) as value
    from windows w
  ),
  days as (
    select d::date as day
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'signups', (select count(*) from people p where (p.created_at at time zone v_tz)::date = d.day),
      'recipes', (select count(*) from rec where rec.day = d.day),
      'extractions', (
        select count(*) from ai
        where ai.day = d.day and action = 'extract' and status in ('full', 'partial', 'cached')
      ),
      'failures', (
        select count(*) from ai
        where ai.day = d.day and action = 'extract' and status in ('error', 'failed', 'metering_error')
      ),
      'ai_cost_usd', (select coalesce(sum(total_cost_usd), 0) from ai_all where ai_all.day = d.day),
      'active_users', (
        select count(distinct s.uid) from (
          select user_id as uid from ai where ai.day = d.day
          union all select user_id from ev where ev.day = d.day
          union all select user_id from rec where rec.day = d.day
        ) s where s.uid is not null
      ),
      'revenue_usd', (select coalesce(sum(usd), 0) from grants where grants.day = d.day)
    ) order by d.day), '[]'::jsonb) as value
    from days d
  ),
  cost_by_action as (
    select coalesce(jsonb_agg(x order by (x->>'cost_usd')::numeric desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object(
        'action', action,
        'events', count(*),
        'failed', count(*) filter (where status in ('error', 'failed', 'metering_error')),
        'cost_usd', coalesce(sum(total_cost_usd), 0),
        'scrape_cost_usd', coalesce(sum(scrapecreators_cost_usd), 0)
      ) as x
      from ai_all
      where created_at >= v_since
      group by action
    ) t
  ),
  model_calls as (
    select
      coalesce(nullif(c->>'model', ''), e.model, 'unknown') as model,
      coalesce((c->>'cost_usd')::numeric, 0) as cost_usd,
      coalesce((c->>'prompt_tokens')::bigint, 0) + coalesce((c->>'output_tokens')::bigint, 0)
        + coalesce((c->>'thinking_tokens')::bigint, 0) as tokens
    from ai_all e
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(e.metadata->'llm_calls') = 'array' and jsonb_array_length(e.metadata->'llm_calls') > 0
          then e.metadata->'llm_calls'
        else jsonb_build_array(jsonb_build_object(
          'model', e.model,
          'cost_usd', e.gemini_cost_usd,
          'prompt_tokens', e.prompt_tokens,
          'output_tokens', e.output_tokens,
          'thinking_tokens', e.thinking_tokens
        ))
      end
    ) c
    where e.created_at >= v_since
  ),
  cost_by_model as (
    select coalesce(jsonb_agg(x order by (x->>'cost_usd')::numeric desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object('model', model, 'calls', count(*), 'cost_usd', sum(cost_usd), 'tokens', sum(tokens)) as x
      from model_calls
      group by model
      having sum(cost_usd) > 0 or model <> 'unknown'
    ) t
  ),
  scrape_cost as (
    select coalesce(sum(scrapecreators_cost_usd), 0) as value from ai_all where created_at >= v_since
  ),
  recipes_by_platform as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc), '[]'::jsonb) as value
    from (
      select coalesce(nullif(platform, ''), 'unknown') as label, count(*) as n
      from rec where created_at >= v_since group by 1
    ) t
  ),
  recipes_by_source as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc), '[]'::jsonb) as value
    from (
      select coalesce(nullif(extraction_source, ''), 'unknown') as label, count(*) as n
      from rec where created_at >= v_since group by 1
    ) t
  ),
  -- Mostly answered as a guest before sign-up, so it is counted, not tied to people.
  heard_about as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc), '[]'::jsonb) as value
    from (
      select coalesce(nullif(properties->>'source', ''), 'unknown') as label, count(*) as n
      from ev where name = 'heard_about' and created_at >= v_since group by 1
    ) t
  ),
  -- Website visits (home page and guides) by raw source: the utm_source tag if
  -- there is one, else the referring hostname. The app names and groups them.
  traffic as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'source', src,
      'visits', visits,
      'visitors', visitors,
      'clicked', clicked,
      'guide_visits', guide_visits
    ) order by visits desc), '[]'::jsonb) as value
    from (
      select
        v.src,
        count(*) as visits,
        count(distinct v.guest_install_id) as visitors,
        count(distinct v.guest_install_id) filter (
          where exists (
            select 1 from ev c
            where c.name = 'web_intro_clicked'
              and c.guest_install_id = v.guest_install_id
              and c.created_at >= v_since
          )
        ) as clicked,
        count(*) filter (where v.properties->>'page' = 'guide') as guide_visits
      from (
        select e.*, lower(coalesce(
          nullif(e.properties->>'utm_source', ''),
          nullif(e.properties->>'ref', ''),
          ''
        )) as src
        from ev e
        where e.name = 'web_intro_viewed' and e.created_at >= v_since
      ) v
      group by v.src
    ) t
  ),
  -- Website visitors in the window, each counted once whatever sent them.
  web_totals as (
    select jsonb_build_object(
      'visits', count(*),
      'visitors', count(distinct v.guest_install_id),
      'clicked', count(distinct v.guest_install_id) filter (
        where exists (
          select 1 from ev c
          where c.name = 'web_intro_clicked'
            and c.guest_install_id = v.guest_install_id
            and c.created_at >= v_since
        )
      )
    ) as value
    from ev v
    where v.name = 'web_intro_viewed' and v.created_at >= v_since
  ),
  cohort as (
    select p.id from people p where p.created_at >= v_since
  ),
  funnel as (
    select jsonb_build_object(
      'signed_up', (select count(*) from cohort),
      'extracted', (
        select count(*) from cohort c where exists (
          select 1 from ai_usage_events e
          where e.user_id = c.id and e.action = 'extract' and e.status in ('full', 'partial', 'cached')
        )
      ),
      'saved', (select count(*) from cohort c where exists (select 1 from recipes r where r.user_id = c.id)),
      'saved_3', (
        select count(*) from cohort c where (select count(*) from recipes r where r.user_id = c.id) >= 3
      ),
      'cooked', (
        select count(*) from cohort c where exists (
          select 1 from recipes r where r.user_id = c.id and r.last_cooked_at is not null
        )
      ),
      'purchased', (
        select count(*) from cohort c where exists (
          select 1 from purchase_credit_grants g where g.user_id = c.id and g.revoked_at is null
        )
      )
    ) as value
  ),
  -- Install ids tied to each account: product events that carry both (app
  -- builds from Nov 18, 2026), or an app session that started as a guest and
  -- signed in (interaction_events keep one session_id across sign-in).
  install_links as (
    select e.user_id, e.guest_install_id
    from product_events e
    where e.user_id is not null and e.guest_install_id is not null
    union
    select u.user_id, g.guest_install_id
    from interaction_events g
    join interaction_events u on u.session_id = g.session_id
    where g.user_id is null and g.guest_install_id is not null and u.user_id is not null
  ),
  -- Their onboarding answer, given as a guest on a linked install or while signed in.
  person_heard as (
    select distinct on (h.user_id) h.user_id, nullif(h.properties->>'source', '') as source
    from (
      select e.user_id, e.properties, e.created_at
      from product_events e
      where e.name = 'heard_about' and e.user_id is not null
      union all
      select l.user_id, e.properties, e.created_at
      from install_links l
      join product_events e on e.guest_install_id = l.guest_install_id
      where e.name = 'heard_about' and e.user_id is null
    ) h
    order by h.user_id, h.created_at desc
  ),
  -- The first website visit from a linked install.
  person_web as (
    select distinct on (l.user_id) l.user_id, lower(coalesce(
      nullif(e.properties->>'utm_source', ''),
      nullif(e.properties->>'ref', ''),
      ''
    )) as source
    from install_links l
    join product_events e on e.guest_install_id = l.guest_install_id
    where e.name = 'web_intro_viewed'
    order by l.user_id, e.created_at asc
  ),
  person_stats as (
    select
      p.id,
      p.email,
      p.created_at,
      p.is_admin,
      p.token_balance,
      coalesce(p.subscription_status, 'free') as plan,
      (select count(*) from recipes r where r.user_id = p.id) as recipes,
      (select count(*) from recipes r where r.user_id = p.id and r.created_at >= v_since) as window_recipes,
      (
        select count(*) from ai_usage_events e
        where e.user_id = p.id and e.action = 'extract' and e.status in ('full', 'partial', 'cached')
      ) as extractions,
      (
        select count(*) from ai_usage_events e
        where e.user_id = p.id and e.action = 'extract' and e.status in ('error', 'failed', 'metering_error')
      ) as failures,
      (select coalesce(sum(total_cost_usd), 0) from ai_usage_events e where e.user_id = p.id) as ai_cost_usd,
      (
        select coalesce(sum(total_cost_usd), 0) from ai_usage_events e
        where e.user_id = p.id and e.created_at >= v_since
      ) as window_ai_cost_usd,
      (
        select coalesce(sum(g.credits), 0) from purchase_credit_grants g
        where g.user_id = p.id and g.revoked_at is null
      ) as credits_bought,
      (
        select coalesce(sum(pr.usd), 0) from purchase_credit_grants g
        join prices pr using (product_id)
        where g.user_id = p.id and g.revoked_at is null
      ) as spent_usd,
      greatest(
        (select max(created_at) from ai_usage_events e where e.user_id = p.id),
        (select max(created_at) from product_events e where e.user_id = p.id),
        (select max(created_at) from recipes r where r.user_id = p.id)
      ) as last_active_at,
      (
        select e.country from product_events e
        where e.user_id = p.id and e.country is not null
        order by e.created_at desc limit 1
      ) as country,
      (
        select coalesce(e.properties->>'platform', e.properties->>'os') from product_events e
        where e.user_id = p.id and e.name = 'onboarding_completed'
        order by e.created_at desc limit 1
      ) as platform,
      (select h.source from person_heard h where h.user_id = p.id) as heard_about,
      (select w.source from person_web w where w.user_id = p.id) as web_source
    from people p
  ),
  people_list as (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb) as value
    from (select * from person_stats order by created_at desc limit 2000) s
  ),
  recent_recipes as (
    select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'platform', r.platform,
        'url', r.original_url,
        'image_url', r.image_url,
        'source', r.extraction_source,
        'status', r.extraction_status,
        'created_at', r.created_at,
        'user_id', r.user_id,
        'email', p.email
      ) as x
      from rec r
      left join profiles p on p.id = r.user_id
      where r.created_at >= v_since
      order by r.created_at desc
      limit 150
    ) t
  ),
  recent_failures as (
    select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object(
        'created_at', e.created_at,
        'action', e.action,
        'status', e.status,
        'platform', e.platform,
        'source', e.extraction_source,
        'message', left(e.error_message, 300),
        'user_id', e.user_id,
        'email', p.email,
        'guest', e.user_id is null
      ) as x
      from ai e
      left join profiles p on p.id = e.user_id
      where e.created_at >= v_since
        and (e.status in ('error', 'failed', 'metering_error', 'rejected') or e.error_message is not null)
      order by e.created_at desc
      limit 40
    ) t
  ),
  purchases as (
    select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object(
        'created_at', g.created_at,
        'user_id', g.user_id,
        'email', p.email,
        'product_id', g.product_id,
        'provider', g.provider,
        'credits', g.credits,
        'usd', g.usd
      ) as x
      from grants g
      left join profiles p on p.id = g.user_id
      where g.created_at >= v_since
      order by g.created_at desc
      limit 100
    ) t
  ),
  totals as (
    select jsonb_build_object(
      'users', (select count(*) from people),
      'recipes', (select count(*) from rec),
      'ai_cost_usd', (select coalesce(sum(total_cost_usd), 0) from ai_usage_events),
      'revenue_usd', (select coalesce(sum(usd), 0) from grants),
      'credits_sold', (select coalesce(sum(credits), 0) from grants),
      'paying_users', (select count(distinct user_id) from grants)
    ) as value
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'days', v_days, 'tz', v_tz, 'since', v_since, 'previous_since', v_prev_since,
      'include_admins', coalesce(p_include_admins, false), 'generated_at', now()
    ),
    'kpis', (select value from kpis),
    'totals', (select value from totals),
    'daily', (select value from daily),
    'cost_by_action', (select value from cost_by_action),
    'cost_by_model', (select value from cost_by_model),
    'scrape_cost_usd', (select value from scrape_cost),
    'recipes_by_platform', (select value from recipes_by_platform),
    'recipes_by_source', (select value from recipes_by_source),
    'heard_about', (select value from heard_about),
    'traffic', (select value from traffic),
    'web_totals', (select value from web_totals),
    'funnel', (select value from funnel),
    'people', (select value from people_list),
    'recent_recipes', (select value from recent_recipes),
    'recent_failures', (select value from recent_failures),
    'purchases', (select value from purchases)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard(integer, text, boolean) from public;
revoke all on function public.admin_dashboard(integer, text, boolean) from anon;
grant execute on function public.admin_dashboard(integer, text, boolean) to authenticated;
