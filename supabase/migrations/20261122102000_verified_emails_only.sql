-- Two places trusted an email address nobody had proved they own (PIN-153).

-- 1. Welcome emails went to every new account, confirmed or not. Signing up with a stranger's
--    address sent that stranger a welcome email, which hurts our sending reputation. Same query
--    as 20261115210000, plus the confirmation check. An account confirmed within the 2-day
--    window is still welcomed, on the first run after it confirms.
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
    and u.email_confirmed_at is not null
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

revoke all on function public.welcome_email_candidates(int) from public, anon, authenticated;
grant execute on function public.welcome_email_candidates(int) to service_role;

-- 2. Signed-in users could change profiles.email to any address, and support replies went to
--    it. No app version writes that column (handle_new_user and ensure_user_profile fill it),
--    so the grant goes. support-email now reads the address from auth.users.
revoke update (email) on public.profiles from authenticated;
