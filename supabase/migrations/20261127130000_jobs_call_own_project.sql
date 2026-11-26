-- Scheduled jobs and support-email triggers call the Edge Functions of the database they run in,
-- not production's (PIN-185).
--
-- Until now production's address was written into the jobs, so every local stack called production
-- every few minutes with its own secret and filled production's logs with 401s. The address now lives
-- in Vault as 'project_url' (for example https://<ref>.supabase.co). Production sets it once by hand;
-- a local stack leaves it unset, so its jobs and triggers call nothing.

-- Posts to one of this project's Edge Functions with a Vault secret in a header.
-- Returns the pg_net request id, or null when project_url or the secret is not set.
create or replace function public.call_edge_function(
  p_function text,
  p_secret_header text,
  p_secret_name text,
  p_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  secret text;
begin
  select rtrim(decrypted_secret, '/') into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = p_secret_name;
  if coalesce(base, '') = '' or secret is null then
    return null;
  end if;
  return net.http_post(
    url := base || '/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', p_secret_header, secret),
    body := coalesce(p_body, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.call_edge_function(text, text, text, jsonb) from public, anon, authenticated;

-- ── Scheduled jobs (same names and schedules as before) ─────────────────────
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-sweep-orphan-photos') then
    perform cron.unschedule('pinch-sweep-orphan-photos');
  end if;
  perform cron.schedule(
    'pinch-sweep-orphan-photos',
    '41 3 * * *',
    $job$ select public.call_edge_function('sweep-orphan-photos', 'x-sweep-secret', 'photo_sweep_secret'); $job$
  );

  if exists (select 1 from cron.job where jobname = 'pinch-welcome-emails') then
    perform cron.unschedule('pinch-welcome-emails');
  end if;
  perform cron.schedule(
    'pinch-welcome-emails',
    '*/5 * * * *',
    $job$ select public.call_edge_function('welcome-emails', 'x-email-cron-secret', 'email_cron_secret'); $job$
  );

  if exists (select 1 from cron.job where jobname = 'pinch-nudges') then
    perform cron.unschedule('pinch-nudges');
  end if;
  perform cron.schedule(
    'pinch-nudges',
    '*/15 * * * *',
    $job$ select public.call_edge_function('nudges', 'x-email-cron-secret', 'email_cron_secret'); $job$
  );

  if exists (select 1 from cron.job where jobname = 'pinch-household-activity') then
    perform cron.unschedule('pinch-household-activity');
  end if;
  perform cron.schedule(
    'pinch-household-activity',
    '* * * * *',
    $job$
      select public.call_edge_function('household-activity', 'x-email-cron-secret', 'email_cron_secret')
      where public.household_activity_pending();
    $job$
  );
end;
$schedule$;

-- ── Support emails (feedback and "Report an issue" tickets) ────────────────
-- Sends only the row id; the function reads the row itself, so a forged call can't inject one.
create or replace function public.email_feedback_to_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_edge_function(
    'support-email', 'x-support-email-secret', 'support_email_secret', jsonb_build_object('feedback_id', new.id)
  );
  return new;
exception when others then
  raise warning 'support email not queued for feedback %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.email_ticket_to_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_edge_function(
    'support-email', 'x-support-email-secret', 'support_email_secret', jsonb_build_object('ticket_id', new.id)
  );
  return new;
exception when others then
  raise warning 'support email not queued for ticket %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.email_feedback_to_support() from public, anon, authenticated;
revoke all on function public.email_ticket_to_support() from public, anon, authenticated;
