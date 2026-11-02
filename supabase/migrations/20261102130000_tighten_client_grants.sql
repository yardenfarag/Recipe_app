-- Remove grants clients never use (PIN-54). RLS already blocks each of these,
-- so nothing changes for the app; this keeps one policy mistake from becoming
-- a hole.

-- anon held INSERT/UPDATE on every profiles column, including is_admin and
-- token_balance. Profiles are created by handle_new_user / ensure_user_profile
-- and edited only by signed-in users (column grants from 0030).
revoke insert, update on public.profiles from anon;
revoke insert on public.profiles from authenticated;

-- With no session, ensure_user_profile accepted any p_user_id, which told an
-- anonymous caller whether that user exists. The app calls it signed in, and
-- Edge Functions call it as service_role.
revoke execute on function public.ensure_user_profile(uuid) from public, anon;

-- Trigger functions can't be called through /rpc, but there is no reason to
-- list them there. Triggers still fire: EXECUTE is checked only when a trigger
-- is created.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
  end loop;
end;
$$;

-- From the cost-guards-welcome-public-recipe branch, live in production but not
-- yet merged, hence the guard.
do $$
begin
  if to_regprocedure('public.recipe_card_public_slug(text, uuid)') is not null then
    alter function public.recipe_card_public_slug(text, uuid) set search_path = '';
  end if;
end;
$$;
