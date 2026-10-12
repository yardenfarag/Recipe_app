-- One welcome email per new account. Existing profiles are marked sent so
-- they are not mailed when this ships. Monthly free credits stay a computed
-- allowance (15 per UTC month), not a stored grant.

alter table public.profiles
  add column if not exists welcome_email_claimed_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.profiles.welcome_email_claimed_at is
  'When a welcome-email send was claimed. A stale claim can be retried. Null means no send is in flight.';

comment on column public.profiles.welcome_email_sent_at is
  'When the signup welcome email was accepted by the mail provider. Null means not sent yet.';

update public.profiles
set welcome_email_sent_at = coalesce(welcome_email_sent_at, now())
where welcome_email_sent_at is null;

create or replace function public.claim_welcome_email(p_user_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles%rowtype;
  destination text;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  select * into profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'missing_profile');
  end if;

  if profile.welcome_email_sent_at is not null then
    return jsonb_build_object('claimed', false, 'reason', 'already_sent');
  end if;

  if profile.welcome_email_claimed_at is not null
     and profile.welcome_email_claimed_at > now() - interval '15 minutes' then
    return jsonb_build_object('claimed', false, 'reason', 'in_progress');
  end if;

  destination := nullif(trim(coalesce(profile.email, '')), '');
  if destination is null then
    destination := nullif(trim(coalesce(p_email, '')), '');
  end if;
  if destination is null or position('@' in destination) = 0 then
    return jsonb_build_object('claimed', false, 'reason', 'no_email');
  end if;

  update public.profiles
  set
    welcome_email_claimed_at = now(),
    email = coalesce(nullif(trim(email), ''), destination)
  where id = p_user_id;

  return jsonb_build_object('claimed', true, 'email', destination);
end;
$$;

create or replace function public.complete_welcome_email(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  update public.profiles
  set welcome_email_sent_at = now()
  where id = p_user_id
    and welcome_email_sent_at is null;
end;
$$;

create or replace function public.release_welcome_email(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  update public.profiles
  set welcome_email_claimed_at = null
  where id = p_user_id
    and welcome_email_sent_at is null;
end;
$$;

revoke all on function public.claim_welcome_email(uuid, text) from public;
revoke all on function public.complete_welcome_email(uuid) from public;
revoke all on function public.release_welcome_email(uuid) from public;
revoke all on function public.claim_welcome_email(uuid, text) from anon, authenticated;
revoke all on function public.complete_welcome_email(uuid) from anon, authenticated;
revoke all on function public.release_welcome_email(uuid) from anon, authenticated;
grant execute on function public.claim_welcome_email(uuid, text) to service_role;
grant execute on function public.complete_welcome_email(uuid) to service_role;
grant execute on function public.release_welcome_email(uuid) to service_role;
