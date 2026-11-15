-- Branded emails from hello@pinch-app.io (PIN-108).
--   * email_sends records the emails that must go out only once (welcome, purchase receipts),
--     so a retried webhook or a second cron run never sends a duplicate.
--   * Every 5 minutes a cron job calls the welcome-emails Edge Function, which welcomes accounts
--     created in the last two days that haven't had one. Waiting a few minutes after signup lets
--     the app save the person's language first (user_metadata.locale), so the welcome is in it.

create extension if not exists pg_net;

create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('welcome', 'purchase')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 300),
  user_id uuid references auth.users (id) on delete cascade,
  resend_id text,
  sent_at timestamptz not null default now(),
  unique (kind, dedupe_key)
);

comment on table public.email_sends is
  'Emails sent at most once: welcome (dedupe_key = user id) and purchase receipts (provider/transaction). Service role only.';

create index if not exists email_sends_user_idx on public.email_sends (user_id);

-- Service role only: RLS on, no policies.
alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;

-- A random shared secret the cron job sends and the function checks. Lives only in Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'email_cron_secret',
      'Shared secret between the welcome email cron job and welcome-emails'
    );
  end if;
end;
$$;

create or replace function public.email_cron_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select decrypted_secret = p_secret
     from vault.decrypted_secrets
     where name = 'email_cron_secret'),
    false
  );
$$;

-- Accounts to welcome: created 3 minutes to 2 days ago, with an email, not welcomed yet.
-- The 2-day window keeps the first run from emailing everyone who signed up before this shipped.
create or replace function public.welcome_email_candidates(p_limit int default 50)
returns table (user_id uuid, email text, locale text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email::text, nullif(u.raw_user_meta_data ->> 'locale', '')
  from auth.users u
  where coalesce(u.email, '') <> ''
    and u.created_at < now() - interval '3 minutes'
    and u.created_at > now() - interval '2 days'
    and u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
    and not exists (
      select 1 from public.email_sends s
      where s.kind = 'welcome' and s.dedupe_key = u.id::text
    )
  order by u.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.email_cron_secret_matches(text) from public, anon, authenticated;
revoke all on function public.welcome_email_candidates(int) from public, anon, authenticated;
grant execute on function public.email_cron_secret_matches(text) to service_role;
grant execute on function public.welcome_email_candidates(int) to service_role;

-- The URL is production's. A local stack's job reaches production with the local secret,
-- which production rejects.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-welcome-emails') then
    perform cron.unschedule('pinch-welcome-emails');
  end if;
  perform cron.schedule(
    'pinch-welcome-emails',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := 'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/welcome-emails',
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
