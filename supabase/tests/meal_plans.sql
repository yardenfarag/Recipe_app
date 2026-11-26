begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- PIN-77 (migration 20261127100000_meal_plans): each person's plan is their own and points only at their own
-- recipes; leftovers take their meal's recipe, can't come from leftovers or from a later day, and go with it.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ae001',
   'authenticated', 'authenticated', 'plan-a@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ae002',
   'authenticated', 'authenticated', 'plan-b@pinch.invalid', '', now(), '{}', '{}', now(), now());

insert into public.profiles (id, email)
select id, email from auth.users where id::text like '10000000-0000-4000-8000-0000000ae00%'
on conflict (id) do nothing;

insert into public.recipes (id, user_id, title, ingredients, instructions)
values
  ('20000000-0000-4000-8000-0000000ae001', '10000000-0000-4000-8000-0000000ae001', 'A curry',
   '[{"name":"lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]'),
  ('20000000-0000-4000-8000-0000000ae002', '10000000-0000-4000-8000-0000000ae001', 'A pasta',
   '[{"name":"pasta","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Boil"}]'),
  ('20000000-0000-4000-8000-0000000ae003', '10000000-0000-4000-8000-0000000ae002', 'B soup',
   '[{"name":"leeks","quantity":1,"unit":""}]', '[{"step":1,"text":"Simmer"}]');

-- Person A, signed in ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000ae001"}';

select lives_ok(
  $$ insert into public.meal_plan_entries (id, plan_date, meal, recipe_id, servings)
     values ('30000000-0000-4000-8000-0000000ae001', '2026-11-26', 'dinner', '20000000-0000-4000-8000-0000000ae001', 8) $$,
  'A plans one of their own recipes (user_id defaults to them)'
);

select throws_ok(
  $$ insert into public.meal_plan_entries (plan_date, meal, recipe_id)
     values ('2026-11-27', 'dinner', '20000000-0000-4000-8000-0000000ae003') $$,
  '42501', null,
  'A can''t plan someone else''s recipe'
);

select throws_ok(
  $$ insert into public.meal_plan_entries (plan_date, meal, recipe_id)
     values ('2026-11-26', 'dinner', '20000000-0000-4000-8000-0000000ae002') $$,
  '23505', null,
  'one recipe per day and meal'
);

-- A leftover lunch says it is the pasta, but takes the curry from the dinner it comes from.
insert into public.meal_plan_entries (id, plan_date, meal, recipe_id, leftover_of)
values ('30000000-0000-4000-8000-0000000ae002', '2026-11-27', 'lunch', '20000000-0000-4000-8000-0000000ae002',
        '30000000-0000-4000-8000-0000000ae001');

select is(
  (select recipe_id::text from public.meal_plan_entries where id = '30000000-0000-4000-8000-0000000ae002'),
  '20000000-0000-4000-8000-0000000ae001',
  'leftovers are the recipe of the meal that makes them'
);

select throws_ok(
  $$ insert into public.meal_plan_entries (plan_date, meal, recipe_id, leftover_of)
     values ('2026-11-28', 'lunch', '20000000-0000-4000-8000-0000000ae001', '30000000-0000-4000-8000-0000000ae002') $$,
  '23514', 'leftover_of_leftover',
  'no leftovers of leftovers'
);

select throws_ok(
  $$ insert into public.meal_plan_entries (plan_date, meal, recipe_id, leftover_of)
     values ('2026-11-25', 'lunch', '20000000-0000-4000-8000-0000000ae001', '30000000-0000-4000-8000-0000000ae001') $$,
  '23514', 'leftover_before_source',
  'no leftovers before the meal is cooked'
);

select lives_ok(
  $$ update public.profiles set meal_plan_prefs = '{"snacksPerDay":1,"meals":["dinner"]}'
     where id = '10000000-0000-4000-8000-0000000ae001' $$,
  'A saves what "Plan my week" remembers'
);

select throws_ok(
  $$ update public.profiles set meal_plan_prefs = '[1,2]' where id = '10000000-0000-4000-8000-0000000ae001' $$,
  '23514', null,
  'the choices are an object'
);

-- Person B, signed in ---------------------------------------------------------
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000ae002"}';

select is((select count(*)::int from public.meal_plan_entries), 0, 'B sees none of A''s plan');

select is(
  (select count(*)::int from public.meal_plan_entries where user_id = '10000000-0000-4000-8000-0000000ae001'),
  0,
  'B can''t read A''s rows by naming A'
);

delete from public.meal_plan_entries where id = '30000000-0000-4000-8000-0000000ae001';

-- Back to A: B's delete did nothing; A's delete takes the leftover with it ---------
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000ae001"}';

select is((select count(*)::int from public.meal_plan_entries), 2, 'B couldn''t delete A''s meal');

delete from public.meal_plan_entries where id = '30000000-0000-4000-8000-0000000ae001';

select is((select count(*)::int from public.meal_plan_entries), 0, 'removing a meal removes its leftovers');

-- Signed out --------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.meal_plan_entries $$, '42501', null, 'signed-out visitors can''t read plans');

select * from finish();
rollback;
