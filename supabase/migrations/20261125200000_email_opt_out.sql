-- PIN-189: one switch for every non-essential email, kept apart from reminder pushes.
--   * profiles.email_opt_out: no tips or reminders by email (welcome, nudges, any future lifecycle email).
--     Sign-in codes, password resets, email changes and receipts always go out.
--   * profiles.push_opt_out: no reminder pushes.
-- Both are set from Settings (mobile and web) and email_opt_out also from the unsubscribe link in every
-- non-essential email (the email-preferences function and the /app/unsubscribe page).
--
-- Expand only. profiles.nudges_opt_out, nudge_unsubscribe and nudge_unsubscribe_token stay until a later
-- migration drops them: the nudges function deployed before this one still calls them, and links in emails
-- already sent carry tokens from nudge_unsubscribe_token. email_unsubscribe_token signs the same way, so
-- those links keep working.

-- ── Columns ───────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists email_opt_out boolean not null default false,
  add column if not exists push_opt_out boolean not null default false;

comment on column public.profiles.email_opt_out is
  'True when the person turned off non-essential emails (tips, reminders, welcome). Account and purchase emails still go out.';
comment on column public.profiles.push_opt_out is
  'True when the person turned off reminder pushes.';
comment on column public.profiles.nudges_opt_out is
  'Deprecated (PIN-189): read email_opt_out and push_opt_out. Kept until the contract migration drops it.';

-- Whoever unsubscribed so far was told "Pinch won't send you reminders anymore", which covered pushes too.
update public.profiles
set email_opt_out = true, push_opt_out = true
where nudges_opt_out and not (email_opt_out and push_opt_out);

grant update (email_opt_out, push_opt_out) on public.profiles to authenticated;

-- ── Signed links ──────────────────────────────────────────────────────────
-- The same HMAC as nudge_unsubscribe_token (same Vault secret), so links already sent stay valid.
create or replace function public.email_unsubscribe_token(p_user_id uuid)
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

-- Turns non-essential email off (p_opt_out true) or back on, when the token matches. False for a wrong
-- token or an account that no longer exists.
create or replace function public.email_set_opt_out(p_user_id uuid, p_token text, p_opt_out boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_opt_out is null or coalesce(p_token, '') = ''
     or p_token is distinct from public.email_unsubscribe_token(p_user_id) then
    return false;
  end if;
  update public.profiles set email_opt_out = p_opt_out where id = p_user_id;
  return found;
end;
$$;

-- The nudges function deployed before this migration's functions still calls this. Until it's replaced,
-- an unsubscribe through it turns off both channels, as it promised.
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
  update public.profiles
  set nudges_opt_out = true, email_opt_out = true, push_opt_out = true
  where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.email_unsubscribe_token(uuid) from public, anon, authenticated;
revoke all on function public.email_set_opt_out(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.email_unsubscribe_token(uuid) to service_role;
grant execute on function public.email_set_opt_out(uuid, text, boolean) to service_role;

-- ── Nudges: each channel has its own switch ───────────────────────────────
-- As in 20261122191000_nudges, except that email_opt_out removes the email (email comes back null) and
-- push_opt_out removes the phones (push_tokens comes back empty). An account with both off isn't listed.
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
      case when u.email_confirmed_at is not null and not pr.email_opt_out then nullif(u.email::text, '') end as email,
      nullif(u.raw_user_meta_data ->> 'locale', '') as locale,
      pr.push_opt_out,
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
      and not (pr.email_opt_out and pr.push_opt_out)
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
    public.email_unsubscribe_token(d.id),
    case when d.push_opt_out then '{}'::text[] else
      coalesce((select array_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = d.id), '{}')
    end,
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
      not d.push_opt_out
      and exists (select 1 from public.push_tokens t where t.user_id = d.id)
      and not exists (select 1 from public.nudge_sends s where s.user_id = d.id and s.kind = p_kind and s.channel = 'push')
    )
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.nudge_candidates(text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.nudge_candidates(text, int, timestamptz) to service_role;

-- ── Welcome emails: skip anyone who opted out, and sign their link ────────
-- As in 20261122102000_verified_emails_only, plus the opt-out and the unsubscribe token. The return type
-- grows a column, so the function is dropped and made again.
drop function if exists public.welcome_email_candidates(int);
create function public.welcome_email_candidates(p_limit int default 50)
returns table (user_id uuid, email text, locale text, unsubscribe_token text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email::text, nullif(u.raw_user_meta_data ->> 'locale', ''), public.email_unsubscribe_token(u.id)
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where coalesce(u.email, '') <> ''
    and u.email_confirmed_at is not null
    and u.created_at < now() - interval '3 minutes'
    and u.created_at > now() - interval '2 days'
    and u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
    and not coalesce(pr.email_opt_out, false)
    and not exists (
      select 1 from public.email_sends s
      where s.kind = 'welcome' and s.dedupe_key = u.id::text
    )
  order by u.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.welcome_email_candidates(int) from public, anon, authenticated;
grant execute on function public.welcome_email_candidates(int) to service_role;
