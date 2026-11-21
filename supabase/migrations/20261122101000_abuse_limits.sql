-- Limits on the three places anyone can write without paying (PIN-153):
--   * the website support form shared one limit between all visitors, so a busy day (or one
--     person) locked everybody out;
--   * support tickets and feedback had no per-user limit, and each one sends an email, so a loop
--     could use up the email quota that sign-in codes need;
--   * log_interaction_events was capped per session id, which the caller picks.
-- The caller's address is the one thing a visitor can't pick, so limits for visitors count per
-- address. Only a keyed hash of it is stored, for one day.

-- Rate counter ---------------------------------------------------------------

create table if not exists public.request_rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  units int not null default 1 check (units > 0),
  created_at timestamptz not null default now()
);

comment on table public.request_rate_events is
  'Recent requests per limit bucket and caller key (a hashed address), for take_rate_limit. Rows are deleted after a day. Service role only.';

create index if not exists request_rate_events_lookup_idx
  on public.request_rate_events (bucket, key, created_at desc);
create index if not exists request_rate_events_created_at_idx
  on public.request_rate_events (created_at);

alter table public.request_rate_events enable row level security;
revoke all on public.request_rate_events from public, anon, authenticated;

-- A random key for hashing addresses. It lives only in Vault, so the stored hashes can't be
-- turned back into addresses by trying every one.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rate_limit_pepper') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'rate_limit_pepper',
      'Key for hashing caller addresses in request_rate_events'
    );
  end if;
end;
$$;

-- The caller's address as a keyed hash, or null outside an API request (SQL editor, cron,
-- service jobs). Cloudflare's header can't be set by the caller; x-forwarded-for is the fallback.
create or replace function public.request_ip_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  headers json;
  ip text;
  pepper text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if headers is null then return null; end if;

  ip := nullif(trim(coalesce(
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)
  )), '');
  if ip is null then return null; end if;

  select decrypted_secret into pepper from vault.decrypted_secrets where name = 'rate_limit_pepper';
  return encode(sha256(convert_to(coalesce(pepper, '') || '|' || lower(ip), 'utf8')), 'hex');
end;
$$;

-- Counts p_units against the bucket's limit for this key. False when it would pass p_max within
-- p_window; nothing is recorded then. A null key (no address known) is never limited.
create or replace function public.take_rate_limit(
  p_bucket text,
  p_key text,
  p_window interval,
  p_max int,
  p_units int default 1
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units int := greatest(coalesce(p_units, 1), 1);
  v_used int;
begin
  if p_key is null then return true; end if;

  select coalesce(sum(units), 0) into v_used
  from public.request_rate_events
  where bucket = p_bucket and key = p_key and created_at > now() - p_window;
  if v_used + v_units > p_max then return false; end if;

  insert into public.request_rate_events (bucket, key, units) values (p_bucket, p_key, v_units);
  return true;
end;
$$;

-- Internal: called only from the functions below, which run as their owner.
revoke all on function public.request_ip_key() from public, anon, authenticated;
revoke all on function public.take_rate_limit(text, text, interval, int, int) from public, anon, authenticated;
grant execute on function public.request_ip_key() to service_role;
grant execute on function public.take_rate_limit(text, text, interval, int, int) to service_role;

-- Website support form ---------------------------------------------------------
-- Was: 30 messages an hour for all visitors together. Now 5 an hour per address and per reply
-- email, with a high overall cap that only a flood from many addresses can reach.

create or replace function public.submit_website_feedback(
  p_message text,
  p_email text default null,
  p_locale text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  message text := trim(coalesce(p_message, ''));
  email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if char_length(message) < 2 or char_length(message) > 4000 then
    raise exception 'invalid_message';
  end if;
  if email is not null
    and (char_length(email) > 254 or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;

  if not public.take_rate_limit('website_feedback', public.request_ip_key(), interval '1 hour', 5) then
    raise exception 'rate_limited';
  end if;
  if email is not null and (
    select count(*) from public.feedback
    where source = 'website' and contact_email = email and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;
  -- Every message is emailed to support, so this also protects the email quota.
  if (
    select count(*) from public.feedback
    where source = 'website' and created_at > now() - interval '1 hour'
  ) >= 100 then
    raise exception 'rate_limited';
  end if;

  insert into public.feedback (message, contact_email, platform, locale, source)
  values (message, email, 'web', left(nullif(trim(coalesce(p_locale, '')), ''), 35), 'website');
end;
$$;

revoke all on function public.submit_website_feedback(text, text, text) from public;
grant execute on function public.submit_website_feedback(text, text, text) to anon, authenticated;

-- Support tickets and app feedback --------------------------------------------
-- Signed-in users insert these rows directly (row level security), so the limit is a trigger:
-- 5 an hour per user in each table, and a length check on tickets (feedback already has one).
-- Rows without a user (the website form, service jobs) are not counted here.

create or replace function public.limit_support_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(coalesce(new.message, '')) > 4000 then
    raise exception 'invalid_message';
  end if;
  if new.email is not null and char_length(new.email) > 254 then
    raise exception 'invalid_email';
  end if;
  if new.user_id is not null and (
    select count(*) from public.support_tickets
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;

create or replace function public.limit_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and (
    select count(*) from public.feedback
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;

revoke all on function public.limit_support_tickets() from public, anon, authenticated;
revoke all on function public.limit_feedback() from public, anon, authenticated;

drop trigger if exists support_tickets_limit on public.support_tickets;
create trigger support_tickets_limit
  before insert on public.support_tickets
  for each row execute function public.limit_support_tickets();

drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit
  before insert on public.feedback
  for each row execute function public.limit_feedback();

-- Interaction events ---------------------------------------------------------------
-- The 600-per-session cap stays, but a session id costs nothing to make up. Added: 1,500 events
-- per 10 minutes per signed-in user and per install id, and 3,000 per address for visitors.
-- Over a cap the batch is dropped silently, as before.

create index if not exists interaction_events_install_created_idx
  on public.interaction_events (guest_install_id, created_at desc)
  where guest_install_id is not null;

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
  v_batch int;
  v_recent int;
begin
  if p_session_id is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  v_batch := jsonb_array_length(p_events);
  if v_batch = 0 then
    return;
  end if;
  if v_batch > 50 then
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

  if v_user is not null then
    select count(*) into v_recent
    from public.interaction_events
    where user_id = v_user
      and created_at > now() - interval '10 minutes';
    if v_recent >= 1500 then
      return;
    end if;
  else
    select count(*) into v_recent
    from public.interaction_events
    where guest_install_id = v_install
      and created_at > now() - interval '10 minutes';
    if v_recent >= 1500 then
      return;
    end if;
    if not public.take_rate_limit(
      'interaction_events', public.request_ip_key(), interval '10 minutes', 3000, v_batch
    ) then
      return;
    end if;
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

comment on table public.interaction_events is
  'Screen views, taps and auth events, sent in batches by the app. Admin-only. An account''s rows are kept until it is deleted; rows of visitors who never signed in for 90 days.';

-- Retention --------------------------------------------------------------------
-- Same as 20261102160000, plus: interaction events of visitors who never signed in after 90
-- days (an account's rows, and the visitor rows of its sessions, still go only with the
-- account), and rate counter rows after a day.

create or replace function public.purge_expired_personal_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.product_events where created_at < now() - interval '13 months';

  update public.ai_usage_events
  set guest_install_id = null, metadata = '{}'::jsonb, error_message = null
  where created_at < now() - interval '90 days'
    and (guest_install_id is not null or metadata <> '{}'::jsonb or error_message is not null);

  delete from public.purchase_webhook_failures where created_at < now() - interval '90 days';

  -- Visitors who never signed in. A visitor's rows from a session that later signed in belong
  -- to that account's history and stay with it.
  delete from public.interaction_events e
  where e.user_id is null
    and e.created_at < now() - interval '90 days'
    and not exists (
      select 1 from public.interaction_events u
      where u.session_id = e.session_id and u.user_id is not null
    );

  delete from public.request_rate_events where created_at < now() - interval '1 day';
end;
$$;

revoke all on function public.purge_expired_personal_data() from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data() to service_role;
