begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

-- PIN-153: a hidden Cooking Hub card is gone from everything public, and only an admin (or a
-- server job) can hide or restore one.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000b01',
   'authenticated', 'authenticated', 'hub-reader@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000b02',
   'authenticated', 'authenticated', 'hub-admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-000000000b02';

insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source, tags)
values
  ('30000000-0000-4000-8000-000000000b01', 'web:https://example.com/good-soup',
   'https://example.com/good-soup', 'https://example.com/good-soup', 'web', 'Good Soup',
   '[{"name":"leek","quantity":2,"unit":""},{"name":"potato","quantity":3,"unit":""}]'::jsonb,
   '[{"step":1,"text":"Chop"},{"step":2,"text":"Simmer"}]'::jsonb, 2, 'full', 'web', array['soup-b01']),
  ('30000000-0000-4000-8000-000000000b02', 'web:https://example.com/planted',
   'https://example.com/planted', 'https://example.com/planted', 'web', 'Planted Spam',
   '[{"name":"spam","quantity":1,"unit":""},{"name":"more spam","quantity":2,"unit":""}]'::jsonb,
   '[{"step":1,"text":"Buy"},{"step":2,"text":"Now"}]'::jsonb, 2, 'full', 'web', array['spam-b02']);

create temporary table slugs as
select id, public_slug from public.recipe_cards
where id in ('30000000-0000-4000-8000-000000000b01', '30000000-0000-4000-8000-000000000b02');
grant select on slugs to anon, authenticated;

-- Who may hide ---------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.admin_set_recipe_card_hidden('30000000-0000-4000-8000-000000000b01') $$,
  '42501', null, 'visitors cannot hide a card'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000b01"}';
select throws_ok(
  $$ select public.admin_set_recipe_card_hidden('30000000-0000-4000-8000-000000000b01') $$,
  '42501', 'admin_only', 'signed-in users cannot hide a card'
);
select throws_ok(
  $$ select * from public.admin_hidden_recipe_cards() $$,
  '42501', 'admin_only', 'or list hidden cards'
);
-- No update policy on recipe_cards: a direct write matches no rows.
update public.recipe_cards set hidden_at = now() where id = '30000000-0000-4000-8000-000000000b01';
reset role;
select is(
  (select hidden_at from public.recipe_cards where id = '30000000-0000-4000-8000-000000000b01'),
  null, 'or write the column directly'
);

-- An admin hides a card by its page address.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000b02"}';
select is(
  public.admin_set_recipe_card_hidden(
    'https://pinch-app.io/r/' || (select public_slug from slugs where id = '30000000-0000-4000-8000-000000000b02') || '?utm=x',
    true, 'spam links'),
  '30000000-0000-4000-8000-000000000b02'::uuid,
  'an admin hides a card by its public address'
);
select is(
  (select array_agg(hidden_reason) from public.admin_hidden_recipe_cards()
   where id = '30000000-0000-4000-8000-000000000b02'),
  array['spam links'],
  'admins see the hidden card and why'
);
select throws_ok(
  $$ select public.admin_set_recipe_card_hidden('no-such-card-000000000000') $$,
  'P0002', 'card_not_found', 'an unknown card is an error, not a silent no-op'
);

-- What the public sees -----------------------------------------------------------
-- Admins read the Hub like everyone else: hidden means hidden.
select is(
  (select count(*)::int from public.recipe_cards where id = '30000000-0000-4000-8000-000000000b02'),
  0, 'the hidden card is gone from direct reads, for admins too'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select array_agg(title order by title) from public.recipe_cards
   where id in ('30000000-0000-4000-8000-000000000b01', '30000000-0000-4000-8000-000000000b02')),
  array['Good Soup'],
  'visitors (the public page and the sitemap) only read the visible card'
);
select is(
  (select count(*)::int from public.recipe_cards
   where public_slug = (select public_slug from slugs where id = '30000000-0000-4000-8000-000000000b02')),
  0, 'the hidden card''s page address finds nothing'
);
select is(
  (select array_agg(title order by title) from public.hub_cards(p_search => 'Planted')),
  null, 'the Hub list does not return it'
);
select ok(
  (select count(*) = 1 from public.hub_cards(p_search => 'Good Soup')),
  'the Hub list still returns the visible card'
);
select ok(
  not exists (select 1 from public.hub_popular_tags(null, 50) where tag = 'spam-b02'),
  'its tags are not counted'
);

-- The server (extract-recipe, service role) still sees hidden cards, so the link stays blocked.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(
  (select hidden_reason from public.recipe_cards where id = '30000000-0000-4000-8000-000000000b02'),
  'spam links', 'the service role reads hidden cards'
);
select lives_ok(
  $$ select public.admin_set_recipe_card_hidden('30000000-0000-4000-8000-000000000b01', true, 'moderation:spam') $$,
  'the service role can hide a card'
);

-- Restoring ------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000b02"}';
select is(
  public.admin_set_recipe_card_hidden('30000000-0000-4000-8000-000000000b01', false),
  '30000000-0000-4000-8000-000000000b01'::uuid,
  'an admin restores a card by id'
);
reset role;
select ok(
  (select hidden_at is null and hidden_reason is null from public.recipe_cards
   where id = '30000000-0000-4000-8000-000000000b01'),
  'a restored card has no hidden mark left'
);

-- From the SQL editor (no API token on the request).
select lives_ok(
  $$ select public.admin_set_recipe_card_hidden('30000000-0000-4000-8000-000000000b02', false) $$,
  'the SQL editor can restore a card'
);

select * from finish();
rollback;
