-- Support form on pinch-app.io. Visitors aren't signed in, so they can't insert into
-- feedback directly; submit_website_feedback validates the message and inserts it,
-- with an optional email so we can reply.

alter table public.feedback
  add column contact_email text
    check (
      contact_email is null
      or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    ),
  add column source text not null default 'app' check (source in ('app', 'website'));

comment on column public.feedback.contact_email is
  'Reply-to address typed into the website support form. App feedback uses the profile email.';
comment on column public.feedback.source is
  'app: Settings → Send feedback. website: the support form on pinch-app.io.';

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
  -- The form is public, so cap how fast it can fill the table.
  if (
    select count(*) from public.feedback
    where source = 'website' and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'rate_limited';
  end if;

  insert into public.feedback (message, contact_email, platform, locale, source)
  values (message, email, 'web', left(nullif(trim(coalesce(p_locale, '')), ''), 35), 'website');
end;
$$;

revoke all on function public.submit_website_feedback(text, text, text) from public;
grant execute on function public.submit_website_feedback(text, text, text) to anon, authenticated;
