-- Write down the table grants the API roles rely on (PIN-35). Production got
-- them from Supabase's old project defaults, which newer images no longer
-- apply, so a database built only from these migrations (CI, a new project, a
-- branch) refused every app query with "permission denied". RLS is what limits
-- rows; these grants only let the roles reach the tables. Matches production
-- exactly, so this changes nothing there.

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;

-- profiles keeps its narrower grants: 0030 allows signed-in users to update only
-- some columns, and 20261102130000 removed anon writes and signed-in inserts.
revoke insert, update on public.profiles from anon, authenticated;
grant update (email, avatar_url, token_pack_notify_at, kitchen, contribute_to_hub)
  on public.profiles to authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;
