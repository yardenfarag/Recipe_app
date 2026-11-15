-- Email "Report an issue" tickets to support@pinch-app.io too, the same way feedback is
-- (20261115230000_support_emails): a trigger hands the row id to the support-email function.
-- Tickets also keep the app version and device they came from, like feedback does.

alter table public.support_tickets
  add column if not exists app_version text,
  add column if not exists build_number text,
  add column if not exists platform text check (platform is null or platform in ('ios', 'android', 'web')),
  add column if not exists os_version text,
  add column if not exists device_model text,
  add column if not exists locale text;

create or replace function public.email_ticket_to_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'support_email_secret';
  if secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/support-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-support-email-secret', secret),
    body := jsonb_build_object('ticket_id', new.id)
  );
  return new;
exception when others then
  raise warning 'support email not queued for ticket %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.email_ticket_to_support() from public, anon, authenticated;

drop trigger if exists support_ticket_email_support on public.support_tickets;
create trigger support_ticket_email_support
  after insert on public.support_tickets
  for each row execute function public.email_ticket_to_support();
