-- Email every support message to support@pinch-app.io. Both the website "Contact support" form
-- (submit_website_feedback) and the app's "Send feedback" save a row in public.feedback; a trigger
-- now also asks the support-email Edge Function to send it, with Reply-To set to the sender, so
-- answering is one click in the inbox. The row is saved even if the email can't be queued.

create extension if not exists pg_net;

alter table public.email_sends drop constraint if exists email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check check (kind in ('welcome', 'purchase', 'support'));

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'support_email_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'support_email_secret',
      'Shared secret between the feedback trigger and support-email'
    );
  end if;
end;
$$;

create or replace function public.support_email_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select decrypted_secret = p_secret
     from vault.decrypted_secrets
     where name = 'support_email_secret'),
    false
  );
$$;

revoke all on function public.support_email_secret_matches(text) from public, anon, authenticated;
grant execute on function public.support_email_secret_matches(text) to service_role;

-- Sends only the row id; the function reads the message itself, so a forged call can't inject one.
-- The URL is production's. A local stack's call reaches production with the local secret,
-- which production rejects.
create or replace function public.email_feedback_to_support()
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
    body := jsonb_build_object('feedback_id', new.id)
  );
  return new;
exception when others then
  raise warning 'support email not queued for feedback %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.email_feedback_to_support() from public, anon, authenticated;

drop trigger if exists feedback_email_support on public.feedback;
create trigger feedback_email_support
  after insert on public.feedback
  for each row execute function public.email_feedback_to_support();
