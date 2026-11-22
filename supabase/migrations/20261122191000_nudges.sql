-- Nudges for new accounts: two reminders, each by push (when the phone allowed it) and email.
--   * day1: a day after sign-up, only if the account has no saved recipe yet. Opens Snap.
--   * day3: three days after sign-up, only if it has saved recipes and cooked none. Opens one.
-- Every 15 minutes a cron job calls the nudges Edge Function, which sends each nudge at most once
-- per account and channel (public.nudge_sends). Accounts created before 2026-11-23 are never
-- nudged, so shipping this doesn't email everyone who signed up earlier.
-- profiles.nudges_opt_out turns both channels off; every nudge email carries a one-click
-- unsubscribe link signed with a Vault secret (nudge_unsubscribe_secret).

-- ── Opt-out ───────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists nudges_opt_out boolean not null default false;

comment on column public.profiles.nudges_opt_out is
  'True when the person turned off reminder pushes and emails (unsubscribe link, or a future setting).';

-- The app may offer a switch for it later.
grant update (nudges_opt_out) on public.profiles to authenticated;

-- ── Push tokens ───────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  token text primary key
    check (char_length(token) <= 200 and token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is
  'Expo push tokens, one per installed phone, owned by the account last signed in on it. Written through register_push_token / unregister_push_token; read by the nudges function.';

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- RPCs only: a phone that changes accounts must move its token, which RLS on the old owner's
-- row wouldn't allow.
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_user, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
revoke all on function public.unregister_push_token(text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ── What was sent ─────────────────────────────────────────────────────────
create table if not exists public.nudge_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('day1', 'day3')),
  channel text not null check (channel in ('push', 'email')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, channel)
);

comment on table public.nudge_sends is
  'Nudges sent, at most one per account, nudge and channel. Service role only.';

alter table public.nudge_sends enable row level security;
revoke all on public.nudge_sends from anon, authenticated;

-- ── Unsubscribe signing ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nudge_unsubscribe_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'nudge_unsubscribe_secret',
      'Signs the unsubscribe links in nudge emails'
    );
  end if;
end;
$$;

create or replace function public.nudge_unsubscribe_token(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.hmac(p_user_id::text, s.decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets s
  where s.name = 'nudge_unsubscribe_secret';
$$;

-- Turns nudges off when the token matches. Returns false for a wrong token.
create or replace function public.nudge_unsubscribe(p_user_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or coalesce(p_token, '') = ''
     or p_token is distinct from public.nudge_unsubscribe_token(p_user_id) then
    return false;
  end if;
  update public.profiles set nudges_opt_out = true where id = p_user_id;
  return true;
end;
$$;

-- ── Who to nudge ──────────────────────────────────────────────────────────
-- Accounts whose nudge is due (sign-up 24h/72h ago, within a one-day window so a late run
-- doesn't send stale reminders), that still fit it and still miss at least one channel.
-- p_now is for tests.
create or replace function public.nudge_candidates(
  p_kind text,
  p_limit int default 50,
  p_now timestamptz default now()
)
returns table (
  user_id uuid,
  email text,
  locale text,
  recipe_id uuid,
  recipe_title text,
  unsubscribe_token text,
  push_tokens text[],
  email_sent boolean,
  push_sent boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with params as (
    select case p_kind when 'day1' then interval '24 hours' when 'day3' then interval '72 hours' end as age
  ),
  due as (
    select
      u.id,
      case when u.email_confirmed_at is not null then nullif(u.email::text, '') end as email,
      nullif(u.raw_user_meta_data ->> 'locale', '') as locale,
      u.created_at
    from auth.users u
    join public.profiles pr on pr.id = u.id
    cross join params
    where params.age is not null
      and u.created_at >= timestamptz '2026-11-23 00:00:00+00'
      and u.created_at <= p_now - params.age
      and u.created_at > p_now - params.age - interval '24 hours'
      and u.deleted_at is null
      and coalesce(u.is_anonymous, false) = false
      and pr.nudges_opt_out = false
      and case p_kind
        when 'day1' then not exists (select 1 from public.recipes r where r.user_id = u.id)
        else exists (select 1 from public.recipes r where r.user_id = u.id)
          and not exists (select 1 from public.recipes r where r.user_id = u.id and r.last_cooked_at is not null)
      end
  )
  select
    d.id,
    d.email,
    d.locale,
    pick.id,
    pick.title,
    public.nudge_unsubscribe_token(d.id),
    coalesce((select array_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = d.id), '{}'),
    exists (select 1 from public.nudge_sends s where s.user_id = d.id and s.kind = p_kind and s.channel = 'email'),
    exists (select 1 from public.nudge_sends s where s.user_id = d.id and s.kind = p_kind and s.channel = 'push')
  from due d
  left join lateral (
    select r.id, r.title
    from public.recipes r
    where p_kind = 'day3' and r.user_id = d.id
    order by r.created_at desc
    limit 1
  ) pick on true
  where (
      d.email is not null
      and not exists (select 1 from public.nudge_sends s where s.user_id = d.id and s.kind = p_kind and s.channel = 'email')
    )
    or (
      exists (select 1 from public.push_tokens t where t.user_id = d.id)
      and not exists (select 1 from public.nudge_sends s where s.user_id = d.id and s.kind = p_kind and s.channel = 'push')
    )
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.nudge_unsubscribe_token(uuid) from public, anon, authenticated;
revoke all on function public.nudge_unsubscribe(uuid, text) from public, anon, authenticated;
revoke all on function public.nudge_candidates(text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.nudge_unsubscribe_token(uuid) to service_role;
grant execute on function public.nudge_unsubscribe(uuid, text) to service_role;
grant execute on function public.nudge_candidates(text, int, timestamptz) to service_role;

-- ── Schedule ──────────────────────────────────────────────────────────────
-- Same secret as the welcome emails. The URL is production's; a local stack's job reaches
-- production with the local secret, which production rejects.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-nudges') then
    perform cron.unschedule('pinch-nudges');
  end if;
  perform cron.schedule(
    'pinch-nudges',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/nudges',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-email-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$schedule$;
