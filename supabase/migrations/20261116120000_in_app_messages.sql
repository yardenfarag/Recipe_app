-- In-app messages (PIN-106): popups, announcements and update prompts that an
-- admin writes, schedules and stops without an app release.
--
-- Two tables, both closed to the API roles. Signed-in users reach messages
-- only through get_in_app_messages and record_in_app_message_event, which take
-- the user from the JWT. Admins reach everything through the admin_* functions
-- below, which check profiles.is_admin. Nobody who is signed out sees a
-- message (the app fetches after sign-in), so there is no install id anywhere.
--
-- Content per language and targeting are checked jsonb. Keys inside them use
-- the camelCase names of src/lib/inAppMessages.ts, so the app reads them as is.

-- Validation helpers ----------------------------------------------------------
-- Used by the table's check constraints and by nothing else. They are
-- immutable and touch no table.

-- null, or one button action: dismiss, store, link (https address) or route
-- (app path starting with a single slash).
create or replace function public.in_app_message_action_valid(a jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select a is null or coalesce(
    jsonb_typeof(a) = 'object'
    and case a->>'type'
      when 'dismiss' then (a - 'type') = '{}'::jsonb
      when 'store' then (a - 'type') = '{}'::jsonb
      when 'link' then (a - 'type' - 'url') = '{}'::jsonb
        and jsonb_typeof(a->'url') = 'string'
        and (a->>'url') ~ '^https://[^[:space:]]+$'
        and char_length(a->>'url') <= 2000
      when 'route' then (a - 'type' - 'href') = '{}'::jsonb
        and jsonb_typeof(a->'href') = 'string'
        and (a->>'href') ~ '^/([^/[:space:]][^[:space:]]{0,198})?$'
      else false
    end,
    false
  );
$$;

-- A JSON array of at most p_max strings that all match p_pattern.
create or replace function public.in_app_message_string_array_valid(
  a jsonb,
  p_max int,
  p_pattern text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(a) = 'array' then
      jsonb_array_length(a) <= p_max
      and not exists (
        select 1 from jsonb_array_elements(a) as e
        where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ p_pattern
      )
    else false
  end;
$$;

-- {"en": {"title": ..., "body": ..., "primaryLabel"?: ...}, "he": {...}}.
-- English is required; every language needs a title and a body (may be empty).
create or replace function public.in_app_message_content_valid(c jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(c) = 'object'
    and (c ? 'en')
    and (select count(*) from jsonb_object_keys(c)) <= 12
    and not exists (
      select 1 from jsonb_each(c) as e(lang, val)
      where e.lang !~ '^[a-z]{2,3}$'
        or jsonb_typeof(e.val) <> 'object'
        or (e.val - 'title' - 'body' - 'primaryLabel' - 'secondaryLabel' - 'linkLabel') <> '{}'::jsonb
        or jsonb_typeof(e.val->'title') is distinct from 'string'
        or char_length(btrim(e.val->>'title')) not between 1 and 120
        or jsonb_typeof(e.val->'body') is distinct from 'string'
        or char_length(e.val->>'body') > 1500
        or (e.val ? 'primaryLabel' and (
              jsonb_typeof(e.val->'primaryLabel') is distinct from 'string'
              or char_length(btrim(e.val->>'primaryLabel')) not between 1 and 40))
        or (e.val ? 'secondaryLabel' and (
              jsonb_typeof(e.val->'secondaryLabel') is distinct from 'string'
              or char_length(btrim(e.val->>'secondaryLabel')) not between 1 and 40))
        or (e.val ? 'linkLabel' and (
              jsonb_typeof(e.val->'linkLabel') is distinct from 'string'
              or char_length(btrim(e.val->>'linkLabel')) not between 1 and 40))
    ),
    false
  );
$$;

-- {"type": "once" | "every_launch" | "until_dismissed"} or
-- {"type": "every_n_days", "days": 1..365}.
create or replace function public.in_app_message_frequency_valid(f jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(f) = 'object'
    and case f->>'type'
      when 'once' then (f - 'type') = '{}'::jsonb
      when 'every_launch' then (f - 'type') = '{}'::jsonb
      when 'until_dismissed' then (f - 'type') = '{}'::jsonb
      when 'every_n_days' then (f - 'type' - 'days') = '{}'::jsonb
        and jsonb_typeof(f->'days') = 'number'
        and case
          when (f->>'days') ~ '^[0-9]{1,3}$' then (f->>'days')::int between 1 and 365
          else false
        end
      else false
    end,
    false
  );
$$;

-- Every key optional; an empty or missing list means "no restriction".
create or replace function public.in_app_message_targeting_valid(t jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(t) = 'object'
    and (t - 'userIds' - 'plans' - 'platforms' - 'languages' - 'minAppVersion' - 'maxAppVersion') = '{}'::jsonb
    and (not (t ? 'userIds') or public.in_app_message_string_array_valid(
          t->'userIds', 500,
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    and (not (t ? 'plans') or public.in_app_message_string_array_valid(t->'plans', 2, '^(free|pro)$'))
    and (not (t ? 'platforms') or public.in_app_message_string_array_valid(t->'platforms', 3, '^(ios|android|web)$'))
    and (not (t ? 'languages') or public.in_app_message_string_array_valid(t->'languages', 12, '^[a-z]{2,3}$'))
    and (not (t ? 'minAppVersion') or (
          jsonb_typeof(t->'minAppVersion') = 'string'
          and (t->>'minAppVersion') ~ '^[0-9]{1,5}(\.[0-9]{1,5}){0,3}$'))
    and (not (t ? 'maxAppVersion') or (
          jsonb_typeof(t->'maxAppVersion') = 'string'
          and (t->>'maxAppVersion') ~ '^[0-9]{1,5}(\.[0-9]{1,5}){0,3}$')),
    false
  );
$$;

-- App versions ------------------------------------------------------------------
-- "1.0.9", "1.0.10" and "1.0.9-dev" (the app adds -dev in development builds,
-- and a suffix after - or + is ignored). Missing parts count as 0, so "2" = "2.0.0".
-- Returns null for a version it can't read; targeting treats that as "doesn't match".

create or replace function public.app_version_parts(v text)
returns int[]
language sql
immutable
set search_path = public
as $$
  select case
    when split_part(split_part(btrim(coalesce(v, '')), '-', 1), '+', 1) ~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,3}$'
    then string_to_array(split_part(split_part(btrim(v), '-', 1), '+', 1), '.')::int[]
  end;
$$;

-- -1, 0 or 1; null when either version can't be read.
create or replace function public.compare_app_versions(a text, b text)
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  pa int[] := public.app_version_parts(a);
  pb int[] := public.app_version_parts(b);
  i int;
  x int;
  y int;
begin
  if pa is null or pb is null then
    return null;
  end if;
  for i in 1 .. greatest(cardinality(pa), cardinality(pb)) loop
    x := coalesce(pa[i], 0);
    y := coalesce(pb[i], 0);
    if x <> y then
      return case when x < y then -1 else 1 end;
    end if;
  end loop;
  return 0;
end;
$$;

-- Tables ------------------------------------------------------------------------

create table public.in_app_messages (
  id uuid primary key default gen_random_uuid(),
  -- The admin's own label. Users never see it.
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Stored status. "scheduled" and "ended" are not stored: a live message with
  -- a start in the future reads as scheduled, one past its end as ended.
  status text not null default 'draft' check (status in ('draft', 'live', 'stopped')),
  presentation text not null check (presentation in ('alert', 'sheet', 'banner', 'fullscreen')),
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'critical')),
  icon text check (icon is null or icon ~ '^[A-Za-z0-9_-]{1,40}$'),
  image_url text check (
    image_url is null or (image_url ~ '^https://[^[:space:]]+$' and char_length(image_url) <= 2000)
  ),
  content jsonb not null check (public.in_app_message_content_valid(content)),
  primary_action jsonb check (public.in_app_message_action_valid(primary_action)),
  secondary_action jsonb check (public.in_app_message_action_valid(secondary_action)),
  link_url text check (
    link_url is null or (link_url ~ '^https://[^[:space:]]+$' and char_length(link_url) <= 2000)
  ),
  dismissible boolean not null default true,
  -- A required message can't be dismissed and keeps coming back until the
  -- targeting stops matching (for example after the user updates the app).
  required boolean not null default false,
  frequency jsonb not null default '{"type": "once"}'::jsonb
    check (public.in_app_message_frequency_valid(frequency)),
  max_shows int check (max_shows is null or max_shows between 1 and 1000),
  -- Higher shows first when several messages are active.
  priority int not null default 0 check (priority between -1000 and 1000),
  -- Route patterns such as "/(tabs)/hub". Empty means any screen.
  screens text[] not null default '{}'
    check (
      array_position(screens, null) is null
      and public.in_app_message_string_array_valid(
        to_jsonb(screens), 20, '^[A-Za-z0-9_.:/()\[\]*-]{1,120}$'
      )
    ),
  banner_position text check (banner_position is null or banner_position in ('top', 'bottom')),
  delay_seconds int check (delay_seconds is null or delay_seconds between 0 and 3600),
  starts_at timestamptz,
  ends_at timestamptz,
  targeting jsonb not null default '{}'::jsonb
    check (public.in_app_message_targeting_valid(targeting)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint in_app_messages_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

comment on table public.in_app_messages is
  'Popups, announcements and update prompts shown inside the app. Admin-written; users read only the ones that target them, through get_in_app_messages.';

create index in_app_messages_live_idx
  on public.in_app_messages (priority desc, created_at)
  where status = 'live';

-- One row per message and user. Erased with the account (the cascade from
-- profiles, which cascades from auth.users).
create table public.in_app_message_receipts (
  message_id uuid not null references public.in_app_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1 check (seen_count >= 0),
  dismissed_at timestamptz,
  clicked_at timestamptz,
  -- Which button was tapped last: the first, the second or the link.
  clicked_button text check (clicked_button is null or clicked_button in ('primary', 'secondary', 'link')),
  primary key (message_id, user_id)
);

comment on table public.in_app_message_receipts is
  'When a user saw, dismissed and tapped a button on a message. Counts for admins; the app reads its own rows through get_in_app_messages.';

create index in_app_message_receipts_user_idx
  on public.in_app_message_receipts (user_id);

alter table public.in_app_messages enable row level security;
alter table public.in_app_message_receipts enable row level security;
-- No policies and no table grants: users go through get_in_app_messages and
-- record_in_app_message_event, admins through the admin_* functions.
revoke all on public.in_app_messages from public, anon, authenticated;
revoke all on public.in_app_message_receipts from public, anon, authenticated;

-- Does this message's targeting match this caller? The caller's plan, platform,
-- language and version come from get_in_app_messages. An empty list, or a
-- missing key, restricts nothing; a version bound never matches an unreadable
-- app version.
create or replace function public.in_app_message_targets(
  t jsonb,
  p_user uuid,
  p_plan text,
  p_platform text,
  p_language text,
  p_version text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (coalesce(jsonb_array_length(t->'userIds'), 0) = 0 or (t->'userIds') ? p_user::text)
    and (coalesce(jsonb_array_length(t->'plans'), 0) = 0 or (t->'plans') ? p_plan)
    and (coalesce(jsonb_array_length(t->'platforms'), 0) = 0 or (t->'platforms') ? p_platform)
    and (coalesce(jsonb_array_length(t->'languages'), 0) = 0 or (t->'languages') ? p_language)
    and (t->>'minAppVersion' is null
         or coalesce(public.compare_app_versions(p_version, t->>'minAppVersion') >= 0, false))
    and (t->>'maxAppVersion' is null
         or coalesce(public.compare_app_versions(p_version, t->>'maxAppVersion') < 0, false));
$$;

revoke all on function public.in_app_message_action_valid(jsonb) from public, anon, authenticated;
revoke all on function public.in_app_message_string_array_valid(jsonb, int, text) from public, anon, authenticated;
revoke all on function public.in_app_message_content_valid(jsonb) from public, anon, authenticated;
revoke all on function public.in_app_message_frequency_valid(jsonb) from public, anon, authenticated;
revoke all on function public.in_app_message_targeting_valid(jsonb) from public, anon, authenticated;
revoke all on function public.app_version_parts(text) from public, anon, authenticated;
revoke all on function public.compare_app_versions(text, text) from public, anon, authenticated;
revoke all on function public.in_app_message_targets(jsonb, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.in_app_message_action_valid(jsonb) to service_role;
grant execute on function public.in_app_message_string_array_valid(jsonb, int, text) to service_role;
grant execute on function public.in_app_message_content_valid(jsonb) to service_role;
grant execute on function public.in_app_message_frequency_valid(jsonb) to service_role;
grant execute on function public.in_app_message_targeting_valid(jsonb) to service_role;
grant execute on function public.app_version_parts(text) to service_role;
grant execute on function public.compare_app_versions(text, text) to service_role;
grant execute on function public.in_app_message_targets(jsonb, uuid, text, text, text, text) to service_role;

-- Read path (signed-in users) -------------------------------------------------------

-- The live messages that target the caller, with the caller's own receipt
-- beside each one (the receipt columns are null/0 when they haven't seen it).
-- Frequency rules are applied in the app (src/lib/inAppMessages.ts); here only
-- the cases that can never show again are left out, so the 50-row cap can't be
-- filled by old messages: a "once" message already seen, an "until dismissed"
-- one already dismissed, one that reached max_shows. A required message is
-- never left out.
-- The plan is worked out here, never taken from the app: "pro" when
-- subscription_status is active and not expired, otherwise "free".
create or replace function public.get_in_app_messages(
  p_platform text,
  p_app_version text,
  p_language text
)
returns table (
  id uuid,
  presentation text,
  tone text,
  icon text,
  image_url text,
  content jsonb,
  primary_action jsonb,
  secondary_action jsonb,
  link_url text,
  dismissible boolean,
  required boolean,
  frequency jsonb,
  max_shows int,
  priority int,
  screens text[],
  banner_position text,
  delay_seconds int,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  seen_count int,
  dismissed_at timestamptz,
  clicked_at timestamptz,
  clicked_button text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_language text;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  select case
           when p.subscription_status = 'active'
             and (p.subscription_expires_at is null or p.subscription_expires_at > now())
           then 'pro'
           else 'free'
         end
  into v_plan
  from public.profiles p
  where p.id = v_user;
  v_plan := coalesce(v_plan, 'free');

  -- "he-IL" and "he_IL" are Hebrew; "iw" is the old code for it.
  v_language := lower(split_part(replace(btrim(coalesce(p_language, 'en')), '_', '-'), '-', 1));
  if v_language = 'iw' then
    v_language := 'he';
  end if;

  return query
  select
    m.id, m.presentation, m.tone, m.icon, m.image_url, m.content,
    m.primary_action, m.secondary_action, m.link_url, m.dismissible, m.required,
    m.frequency, m.max_shows, m.priority, m.screens, m.banner_position, m.delay_seconds,
    r.first_seen_at, r.last_seen_at, coalesce(r.seen_count, 0), r.dismissed_at,
    r.clicked_at, r.clicked_button
  from public.in_app_messages m
  left join public.in_app_message_receipts r
    on r.message_id = m.id and r.user_id = v_user
  where m.status = 'live'
    and (m.starts_at is null or m.starts_at <= now())
    and (m.ends_at is null or m.ends_at > now())
    and public.in_app_message_targets(
      m.targeting, v_user, v_plan, p_platform, v_language, left(p_app_version, 24)
    )
    and (
      m.required
      or r.message_id is null
      or not (
        m.frequency->>'type' = 'once'
        or (m.frequency->>'type' = 'until_dismissed' and r.dismissed_at is not null)
        or (m.max_shows is not null and r.seen_count >= m.max_shows)
      )
    )
  order by m.priority desc, m.created_at, m.id
  limit 50;
end;
$$;

-- Records that the caller saw, dismissed or tapped a button on a message.
-- Seen adds one to seen_count; dismissed and clicked keep the latest time
-- (and, for clicked, the button). A first event of any kind creates the row, and
-- counts as a first sighting. Drafts are not recordable, so a guessed id does nothing.
create or replace function public.record_in_app_message_event(
  p_message_id uuid,
  p_event text,
  p_button text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_event is null or p_event not in ('seen', 'dismissed', 'clicked') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if p_event = 'clicked' and (p_button is null or p_button not in ('primary', 'secondary', 'link')) then
    raise exception 'invalid_button' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.in_app_messages m
    where m.id = p_message_id and m.status <> 'draft'
  ) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;

  if p_event = 'seen' then
    insert into public.in_app_message_receipts as r (message_id, user_id)
    values (p_message_id, v_user)
    on conflict (message_id, user_id) do update
      set last_seen_at = now(), seen_count = r.seen_count + 1;
  elsif p_event = 'dismissed' then
    insert into public.in_app_message_receipts as r (message_id, user_id, dismissed_at)
    values (p_message_id, v_user, now())
    on conflict (message_id, user_id) do update
      set dismissed_at = now();
  else
    insert into public.in_app_message_receipts as r (message_id, user_id, clicked_at, clicked_button)
    values (p_message_id, v_user, now(), p_button)
    on conflict (message_id, user_id) do update
      set clicked_at = now(), clicked_button = p_button;
  end if;
end;
$$;

revoke all on function public.get_in_app_messages(text, text, text) from public, anon, authenticated;
revoke all on function public.record_in_app_message_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_in_app_messages(text, text, text) to authenticated;
grant execute on function public.record_in_app_message_event(uuid, text, text) to authenticated;

-- Admin path -------------------------------------------------------------------------

-- Every message (or one, with p_id), newest first, with how many users saw it,
-- dismissed it and tapped a button. status is what an admin reads: a live
-- message that hasn't started is "scheduled", one past its end is "ended".
create or replace function public.admin_list_in_app_messages(p_id uuid default null)
returns table (
  id uuid,
  name text,
  status text,
  presentation text,
  tone text,
  icon text,
  image_url text,
  content jsonb,
  primary_action jsonb,
  secondary_action jsonb,
  link_url text,
  dismissible boolean,
  required boolean,
  frequency jsonb,
  max_shows int,
  priority int,
  screens text[],
  banner_position text,
  delay_seconds int,
  starts_at timestamptz,
  ends_at timestamptz,
  targeting jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  seen_count int,
  dismissed_count int,
  clicked_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  return query
  select
    m.id, m.name,
    case
      when m.status = 'live' and m.starts_at is not null and m.starts_at > now() then 'scheduled'
      when m.status = 'live' and m.ends_at is not null and m.ends_at <= now() then 'ended'
      else m.status
    end,
    m.presentation, m.tone, m.icon, m.image_url, m.content,
    m.primary_action, m.secondary_action, m.link_url, m.dismissible, m.required,
    m.frequency, m.max_shows, m.priority, m.screens, m.banner_position, m.delay_seconds,
    m.starts_at, m.ends_at, m.targeting, m.created_at, m.updated_at,
    c.seen, c.dismissed, c.clicked
  from public.in_app_messages m
  cross join lateral (
    select
      count(*)::int as seen,
      (count(*) filter (where r.dismissed_at is not null))::int as dismissed,
      (count(*) filter (where r.clicked_at is not null))::int as clicked
    from public.in_app_message_receipts r
    where r.message_id = m.id
  ) c
  where p_id is null or m.id = p_id
  order by m.created_at desc, m.id;
end;
$$;

-- Creates a message (no "id" in the payload; it starts as a draft) or updates
-- one (with "id"; its status is kept). Keys are the camelCase names of
-- AdminMessage in src/lib/inAppMessages.ts. Returns the id. Bad values fail
-- the table's check constraints (23514) or the casts here (22xxx).
create or replace function public.admin_save_in_app_message(p_message jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_screens text[];
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_message is null or jsonb_typeof(p_message) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p_message->'screens') = 'array' then
    select coalesce(array_agg(s), '{}') into v_screens
    from jsonb_array_elements_text(p_message->'screens') as s;
  else
    v_screens := '{}';
  end if;

  if nullif(p_message->>'id', '') is null then
    insert into public.in_app_messages (
      name, presentation, tone, icon, image_url, content,
      primary_action, secondary_action, link_url, dismissible, required,
      frequency, max_shows, priority, screens, banner_position, delay_seconds,
      starts_at, ends_at, targeting, created_by
    )
    values (
      p_message->>'name',
      p_message->>'presentation',
      coalesce(p_message->>'tone', 'info'),
      nullif(p_message->>'icon', ''),
      nullif(p_message->>'imageUrl', ''),
      p_message->'content',
      nullif(p_message->'primaryAction', 'null'::jsonb),
      nullif(p_message->'secondaryAction', 'null'::jsonb),
      nullif(p_message#>>'{link,url}', ''),
      coalesce((p_message->>'dismissible')::boolean, true),
      coalesce((p_message->>'required')::boolean, false),
      coalesce(nullif(p_message->'frequency', 'null'::jsonb), '{"type": "once"}'::jsonb),
      (p_message->>'maxShows')::int,
      coalesce((p_message->>'priority')::int, 0),
      v_screens,
      nullif(p_message->>'bannerPosition', ''),
      (p_message->>'delaySeconds')::int,
      (p_message->>'startsAt')::timestamptz,
      (p_message->>'endsAt')::timestamptz,
      coalesce(nullif(p_message->'targeting', 'null'::jsonb), '{}'::jsonb),
      v_actor
    )
    returning in_app_messages.id into v_id;
  else
    update public.in_app_messages m
    set name = p_message->>'name',
        presentation = p_message->>'presentation',
        tone = coalesce(p_message->>'tone', 'info'),
        icon = nullif(p_message->>'icon', ''),
        image_url = nullif(p_message->>'imageUrl', ''),
        content = p_message->'content',
        primary_action = nullif(p_message->'primaryAction', 'null'::jsonb),
        secondary_action = nullif(p_message->'secondaryAction', 'null'::jsonb),
        link_url = nullif(p_message#>>'{link,url}', ''),
        dismissible = coalesce((p_message->>'dismissible')::boolean, true),
        required = coalesce((p_message->>'required')::boolean, false),
        frequency = coalesce(nullif(p_message->'frequency', 'null'::jsonb), '{"type": "once"}'::jsonb),
        max_shows = (p_message->>'maxShows')::int,
        priority = coalesce((p_message->>'priority')::int, 0),
        screens = v_screens,
        banner_position = nullif(p_message->>'bannerPosition', ''),
        delay_seconds = (p_message->>'delaySeconds')::int,
        starts_at = (p_message->>'startsAt')::timestamptz,
        ends_at = (p_message->>'endsAt')::timestamptz,
        targeting = coalesce(nullif(p_message->'targeting', 'null'::jsonb), '{}'::jsonb),
        updated_at = now()
    where m.id = (p_message->>'id')::uuid
    returning m.id into v_id;

    if v_id is null then
      raise exception 'message_not_found' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- 'live' (or 'scheduled', the same thing: it shows from starts_at), 'stopped'
-- (it disappears at the user's next fetch) or 'draft'. 'ended' is not settable.
create or replace function public.admin_set_in_app_message_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := case when p_status = 'scheduled' then 'live' else p_status end;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if v_status is null or v_status not in ('draft', 'live', 'stopped') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.in_app_messages m
  set status = v_status, updated_at = now()
  where m.id = p_id;
  if not found then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Deletes the message and, by cascade, its receipts (and so its counts).
-- An uploaded image stays in storage.
create or replace function public.admin_delete_in_app_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  delete from public.in_app_messages m where m.id = p_id;
  if not found then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_list_in_app_messages(uuid) from public, anon, authenticated;
revoke all on function public.admin_save_in_app_message(jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_in_app_message_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_delete_in_app_message(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_in_app_messages(uuid) to authenticated;
grant execute on function public.admin_save_in_app_message(jsonb) to authenticated;
grant execute on function public.admin_set_in_app_message_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_in_app_message(uuid) to authenticated;

-- Message images ---------------------------------------------------------------------
-- No new bucket: the admin uploads into the existing public recipe-thumbnails
-- bucket, under in-app-messages/. Only admins may add or remove files there.
-- Everything else in that bucket stays closed to the API roles (see
-- 20261102120000_lock_down_storage_listing.sql). No select policy is added, so
-- the folder can't be listed; the app reads images by their public URL. Uploads
-- use fresh file names, so they never need select to replace a file.
-- delete-account and the orphan photo sweep only touch photo/ and avatars, so
-- they never remove this folder.

drop policy if exists "Admins upload in-app message images" on storage.objects;
create policy "Admins upload in-app message images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-thumbnails'
    and starts_with(name, 'in-app-messages/')
    and public.is_current_user_admin()
  );

drop policy if exists "Admins delete in-app message images" on storage.objects;
create policy "Admins delete in-app message images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-thumbnails'
    and starts_with(name, 'in-app-messages/')
    and public.is_current_user_admin()
  );
