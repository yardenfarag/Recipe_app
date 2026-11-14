-- Every screen view, button tap, login and signup, for admins only.
--
-- The app queues events in memory and sends them in batches through
-- log_interaction_events, so a tap never waits on the network. Nobody can
-- read this table except admins, through the admin_* functions below.
-- Rows are kept until the account is deleted, then erased with it.

create table public.interaction_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  guest_install_id text,
  session_id uuid not null,
  kind text not null check (kind in ('screen', 'tap', 'auth')),
  -- A route pattern ("/recipe/[id]"), a tap id ("recipe.save") or an auth
  -- event ("auth.login", "auth.signup", "auth.signin_failed"). Never free
  -- text: no titles, emails or anything the person typed.
  name text not null check (name ~ '^[A-Za-z0-9_.:/()\[\]-]{1,120}$'),
  screen text check (screen is null or screen ~ '^[A-Za-z0-9_.:/()\[\]-]{1,120}$'),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 512
  ),
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or length(app_version) <= 24),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint interaction_events_actor_check check (
    user_id is not null or guest_install_id is not null
  ),
  constraint interaction_events_install_id_length check (
    guest_install_id is null or length(guest_install_id) between 8 and 80
  )
);

comment on table public.interaction_events is
  'Screen views, taps and auth events, sent in batches by the app. Admin-only. Kept until the account is deleted.';

create index interaction_events_created_at_idx
  on public.interaction_events (created_at desc);
create index interaction_events_session_idx
  on public.interaction_events (session_id, occurred_at);
create index interaction_events_user_idx
  on public.interaction_events (user_id, created_at desc)
  where user_id is not null;
create index interaction_events_install_idx
  on public.interaction_events (guest_install_id)
  where guest_install_id is not null;

alter table public.interaction_events enable row level security;
-- No policies and no table grants: writes go through log_interaction_events,
-- reads through the admin functions.
revoke all on public.interaction_events from public, anon, authenticated;

-- Write path ---------------------------------------------------------------

-- Inserts up to 50 events. The user comes from the JWT, never from the
-- payload. A session that sends more than 600 events in 10 minutes is dropped
-- silently, so a runaway client or a script can't flood the table.
create or replace function public.log_interaction_events(
  p_session_id uuid,
  p_guest_install_id text,
  p_platform text,
  p_app_version text,
  p_events jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_install text := case when v_user is null then p_guest_install_id else null end;
  v_recent int;
begin
  if p_session_id is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) = 0 then
    return;
  end if;
  if jsonb_array_length(p_events) > 50 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;
  if v_user is null and v_install is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;

  select count(*) into v_recent
  from public.interaction_events
  where session_id = p_session_id
    and created_at > now() - interval '10 minutes';
  if v_recent >= 600 then
    return;
  end if;

  insert into public.interaction_events (
    user_id, guest_install_id, session_id, kind, name, screen, properties,
    platform, app_version, occurred_at
  )
  select
    v_user,
    v_install,
    p_session_id,
    e->>'kind',
    e->>'name',
    nullif(e->>'screen', ''),
    case when jsonb_typeof(e->'properties') = 'object' then e->'properties' else '{}'::jsonb end,
    p_platform,
    nullif(p_app_version, ''),
    -- Trust the device clock only within a day of the server's.
    case
      when (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T'
        and (e->>'at')::timestamptz between now() - interval '1 day' and now() + interval '5 minutes'
      then (e->>'at')::timestamptz
      else now()
    end
  from jsonb_array_elements(p_events) as e;
end;
$$;

revoke all on function public.log_interaction_events(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_interaction_events(uuid, text, text, text, jsonb)
  to anon, authenticated;

-- Admin read path ----------------------------------------------------------

-- Recent sessions, newest first, optionally for one person (email or id).
create or replace function public.admin_interaction_sessions(
  p_since timestamptz,
  p_search text default null,
  p_limit int default 100
)
returns table (
  session_id uuid,
  user_id uuid,
  email text,
  guest_install_id text,
  platform text,
  app_version text,
  started_at timestamptz,
  last_at timestamptz,
  screen_count int,
  tap_count int,
  auth_events text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_needle text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  return query
  select
    e.session_id,
    (array_agg(e.user_id) filter (where e.user_id is not null))[1],
    (array_agg(p.email) filter (where p.email is not null))[1],
    (array_agg(e.guest_install_id) filter (where e.guest_install_id is not null))[1],
    min(e.platform),
    max(e.app_version),
    min(e.occurred_at),
    max(e.occurred_at),
    (count(*) filter (where e.kind = 'screen'))::int,
    (count(*) filter (where e.kind = 'tap'))::int,
    array_agg(distinct e.name) filter (where e.kind = 'auth')
  from public.interaction_events e
  left join public.profiles p on p.id = e.user_id
  where e.created_at >= p_since
    and (
      v_needle is null
      or lower(p.email) like '%' || v_needle || '%'
      or e.user_id::text = v_needle
      or lower(e.guest_install_id) = v_needle
    )
  group by e.session_id
  order by max(e.occurred_at) desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Every event in one session, in order.
create or replace function public.admin_interaction_session_events(p_session_id uuid)
returns table (
  id bigint,
  kind text,
  name text,
  screen text,
  properties jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  return query
  select e.id, e.kind, e.name, e.screen, e.properties, e.occurred_at
  from public.interaction_events e
  where e.session_id = p_session_id
  order by e.occurred_at, e.id
  limit 2000;
end;
$$;

-- Most-used screens and taps in a window.
create or replace function public.admin_interaction_top(
  p_since timestamptz,
  p_limit int default 30
)
returns table (
  kind text,
  name text,
  event_count int,
  people int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  return query
  select
    e.kind,
    e.name,
    count(*)::int,
    count(distinct coalesce(e.user_id::text, e.guest_install_id))::int
  from public.interaction_events e
  where e.created_at >= p_since
  group by e.kind, e.name
  order by count(*) desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
end;
$$;

revoke all on function public.admin_interaction_sessions(timestamptz, text, int) from public, anon, authenticated;
revoke all on function public.admin_interaction_session_events(uuid) from public, anon, authenticated;
revoke all on function public.admin_interaction_top(timestamptz, int) from public, anon, authenticated;
grant execute on function public.admin_interaction_sessions(timestamptz, text, int) to authenticated;
grant execute on function public.admin_interaction_session_events(uuid) to authenticated;
grant execute on function public.admin_interaction_top(timestamptz, int) to authenticated;

-- Account deletion -------------------------------------------------------
-- No timed purge for now: rows are kept until the account is deleted
-- (purge_expired_personal_data is unchanged). Body matches prod as of
-- 2026-11-14, plus the interaction_events lines.

create or replace function public.erase_user_personal_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  install_ids text[];
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  -- Install ids this user signed in on, so their guest-era rows go too.
  select coalesce(array_agg(distinct id), '{}') into install_ids
  from (
    select guest_install_id as id from public.product_events
    where user_id = p_user_id and guest_install_id is not null
    union
    select guest_install_id from public.ai_usage_events
    where user_id = p_user_id and guest_install_id is not null
  ) ids;

  delete from public.support_tickets where user_id = p_user_id;
  delete from public.feedback where user_id = p_user_id;
  delete from public.product_events
  where user_id = p_user_id or guest_install_id = any(install_ids);
  -- Signed-in rows carry no install id, so match guest rows by the sessions
  -- this user also had.
  delete from public.interaction_events
  where user_id = p_user_id
     or guest_install_id = any(install_ids)
     or session_id in (
       select distinct session_id from public.interaction_events where user_id = p_user_id
     );
  delete from public.purchase_webhook_failures where app_user_id = p_user_id::text;

  update public.ai_usage_events
  set user_id = null,
      guest_install_id = null,
      metadata = '{}'::jsonb,
      error_message = null
  where user_id = p_user_id or guest_install_id = any(install_ids);

  -- guest_usage and the other guest_* counters stay: they hold only an install
  -- id, and wiping them would hand the device fresh free quota.
end;
$$;

revoke all on function public.erase_user_personal_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_personal_data(uuid) to service_role;
