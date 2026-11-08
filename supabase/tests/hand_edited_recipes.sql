begin;

create extension if not exists pgtap with schema extensions;
select plan(56);

-- PIN-79 (ADR 018): hand-edited and written recipes. The CHECK constraints are the backstop for
-- writes that skip the save-recipe-edit Edge Function, so every case runs as a signed-in user.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000791',
   'authenticated', 'authenticated', 'recipe-editor@pinch.invalid', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000792',
   'authenticated', 'authenticated', 'other-cook@pinch.invalid', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The Hub card a snapped recipe below was saved from.
insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source)
values ('30000000-0000-4000-8000-000000000791', 'web:https://example.com/carrot-soup',
        'https://example.com/carrot-soup', 'https://example.com/carrot-soup', 'web', 'Carrot Soup',
        '[{"name":"carrot","quantity":1,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Simmer"}]'::jsonb, 2, 'full', 'web');

-- The other cook's recipe, for the isolation tests.
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-000000000792', '10000000-0000-4000-8000-000000000792', 'Their Stew',
        '[{"name":"beef","quantity":500,"unit":"g"}]'::jsonb, '[{"step":1,"text":"Brown"}]'::jsonb);

select has_column('public', 'recipes', 'locked_fields', 'recipes have a locked_fields column');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000791"}';

-- Written recipes ------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.recipes (id, user_id, title, original_url, platform, ingredients, instructions,
                                extraction_status, extraction_source)
    values ('20000000-0000-4000-8000-000000000791', '10000000-0000-4000-8000-000000000791',
            'Grandma''s Carrot Cake', null, 'unknown',
            '[{"name":"carrot","quantity":3,"unit":""}]', '[{"step":1,"text":"Grate the carrots"}]',
            'full', 'manual')$$,
  'a written recipe (manual source, no URL) can be saved'
);

select is(
  (select locked_fields from public.recipes where id = '20000000-0000-4000-8000-000000000791'),
  '{}'::text[],
  'a recipe starts with no locked fields'
);

-- Locked fields --------------------------------------------------------------------------------

select lives_ok(
  $$update public.recipes
    set locked_fields = '{calories,estimated_time_minutes,effort_level,cost_estimate,tags,appliances}'
    where id = '20000000-0000-4000-8000-000000000791'$$,
  'every AI-derived field can be locked'
);

select throws_ok(
  $$update public.recipes set locked_fields = '{title}' where id = '20000000-0000-4000-8000-000000000791'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_locked_fields_known"',
  'a field that is not AI-derived cannot be locked'
);

-- Title ----------------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', repeat('t', 120),
            '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]')$$,
  'a 120-character title is accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', repeat('t', 121),
            '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_title_len"',
  'a 121-character title is rejected'
);

-- Ingredients ----------------------------------------------------------------------------------

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status)
    values ('10000000-0000-4000-8000-000000000791', 'No ingredients', '[]', '[{"step":1,"text":"Boil"}]', 'full')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'a full recipe needs at least one ingredient'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status)
    values ('10000000-0000-4000-8000-000000000791', 'Steps only', '[]', '[{"step":1,"text":"Boil"}]', 'partial')$$,
  'a partial recipe may have no ingredients'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Sixty',
           (select jsonb_agg(jsonb_build_object('name', 'item ' || n, 'quantity', 1, 'unit', ''))
            from generate_series(1, 60) as n),
           '[{"step":1,"text":"Mix"}]'$$,
  '60 ingredients are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Sixty-one',
           (select jsonb_agg(jsonb_build_object('name', 'item ' || n, 'quantity', 1, 'unit', ''))
            from generate_series(1, 61) as n),
           '[{"step":1,"text":"Mix"}]'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  '61 ingredients are rejected'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Long name',
           jsonb_build_array(jsonb_build_object('name', repeat('n', 100), 'quantity', 1, 'unit', '')),
           '[{"step":1,"text":"Mix"}]'$$,
  'a 100-character ingredient name is accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Too long name',
           jsonb_build_array(jsonb_build_object('name', repeat('n', 101), 'quantity', 1, 'unit', '')),
           '[{"step":1,"text":"Mix"}]'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'a 101-character ingredient name is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'No name', '[{"quantity":1,"unit":""}]', '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'an ingredient without a name is rejected'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Edge quantities',
            '[{"name":"salt","quantity":0,"unit":""},{"name":"flour","quantity":10000,"unit":"g"}]',
            '[{"step":1,"text":"Mix"}]')$$,
  'quantities of 0 and 10,000 are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Too much', '[{"name":"flour","quantity":10000.5,"unit":"g"}]',
            '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'a quantity over 10,000 is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Negative', '[{"name":"flour","quantity":-1,"unit":"g"}]',
            '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'a negative quantity is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Text quantity', '[{"name":"flour","quantity":"abc","unit":"g"}]',
            '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'a non-numeric quantity fails the check rather than raising a cast error'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'String item', '["2 carrots"]', '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'an ingredient that is not an object is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Object list', '{"name":"carrot"}', '[{"step":1,"text":"Mix"}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_ingredients_limits"',
  'ingredients that are not a list are rejected'
);

-- Steps ----------------------------------------------------------------------------------------

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status)
    values ('10000000-0000-4000-8000-000000000791', 'No steps', '[{"name":"egg","quantity":1,"unit":""}]', '[]', 'full')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_instructions_limits"',
  'a full recipe needs at least one step'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status)
    values ('10000000-0000-4000-8000-000000000791', 'Ingredients only',
            '[{"name":"egg","quantity":1,"unit":""}]', '[]', 'partial')$$,
  'a partial recipe may have no steps (the incomplete banner case)'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Forty steps', '[{"name":"egg","quantity":1,"unit":""}]',
           (select jsonb_agg(jsonb_build_object('step', n, 'text', 'Step ' || n)) from generate_series(1, 40) as n)$$,
  '40 steps are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Forty-one steps', '[{"name":"egg","quantity":1,"unit":""}]',
           (select jsonb_agg(jsonb_build_object('step', n, 'text', 'Step ' || n)) from generate_series(1, 41) as n)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_instructions_limits"',
  '41 steps are rejected'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Long step', '[{"name":"egg","quantity":1,"unit":""}]',
           jsonb_build_array(jsonb_build_object('step', 1, 'text', repeat('s', 800), 'timestamp_seconds', 42))$$,
  'an 800-character step with a video timestamp is accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    select '10000000-0000-4000-8000-000000000791', 'Too long step', '[{"name":"egg","quantity":1,"unit":""}]',
           jsonb_build_array(jsonb_build_object('step', 1, 'text', repeat('s', 801)))$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_instructions_limits"',
  'an 801-character step is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000791', 'Textless step', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1}]')$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_instructions_limits"',
  'a step without text is rejected'
);

-- Tags -----------------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, tags)
    select '10000000-0000-4000-8000-000000000791', 'Ten tags', '[{"name":"egg","quantity":1,"unit":""}]',
           '[{"step":1,"text":"Boil"}]',
           (select array_agg(lpad(n::text, 30, 't')) from generate_series(1, 10) as n)$$,
  '10 tags of 30 characters are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, tags)
    select '10000000-0000-4000-8000-000000000791', 'Eleven tags', '[{"name":"egg","quantity":1,"unit":""}]',
           '[{"step":1,"text":"Boil"}]',
           (select array_agg('tag ' || n) from generate_series(1, 11) as n)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_tags_limits"',
  '11 tags are rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, tags)
    values ('10000000-0000-4000-8000-000000000791', 'Long tag', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', array['dinner', repeat('t', 31)])$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_tags_limits"',
  'a 31-character tag is rejected'
);

-- Numbers --------------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, servings, estimated_time_minutes, calories)
    values ('10000000-0000-4000-8000-000000000791', 'Upper bounds', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 100, 2880, 10000)$$,
  '100 servings, 2,880 minutes and 10,000 calories are accepted'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, servings, estimated_time_minutes, calories)
    values ('10000000-0000-4000-8000-000000000791', 'Lower bounds', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 1, 1, 0)$$,
  '1 serving, 1 minute and 0 calories are accepted'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, estimated_time_minutes, calories)
    values ('10000000-0000-4000-8000-000000000791', 'Unknown estimates', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', null, null)$$,
  'unknown cooking time and calories are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, servings)
    values ('10000000-0000-4000-8000-000000000791', 'No servings', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 0)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_servings_range"',
  '0 servings are rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, servings)
    values ('10000000-0000-4000-8000-000000000791', 'Banquet', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 101)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_servings_range"',
  '101 servings are rejected'
);

-- Old guest recipes and backups can carry an out-of-range estimate, and store builds insert them
-- as they are. The save goes through with the estimate stored as unknown.
insert into public.recipes (id, user_id, title, ingredients, instructions, estimated_time_minutes, calories)
values
  ('20000000-0000-4000-8000-000000000795', '10000000-0000-4000-8000-000000000791', 'Instant',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 0, -1),
  ('20000000-0000-4000-8000-000000000796', '10000000-0000-4000-8000-000000000791', 'Three days',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 2881, 10001);

select is(
  (select estimated_time_minutes from public.recipes where id = '20000000-0000-4000-8000-000000000795'),
  null,
  'a cooking time of 0 minutes is saved as unknown'
);

select is(
  (select estimated_time_minutes from public.recipes where id = '20000000-0000-4000-8000-000000000796'),
  null,
  'a cooking time over 2,880 minutes is saved as unknown'
);

select is(
  (select calories from public.recipes where id = '20000000-0000-4000-8000-000000000795'),
  null,
  'negative calories are saved as unknown'
);

select is(
  (select calories from public.recipes where id = '20000000-0000-4000-8000-000000000796'),
  null,
  'more than 10,000 calories are saved as unknown'
);

update public.recipes set estimated_time_minutes = 0, calories = 450
where id = '20000000-0000-4000-8000-000000000796';

select is(
  (select row(estimated_time_minutes, calories)::text from public.recipes
   where id = '20000000-0000-4000-8000-000000000796'),
  '(,450)',
  'an update clears only the out-of-range estimate'
);

-- The CHECKs still back the trigger: with triggers off, the same values are rejected.
reset role;
set local session_replication_role = replica;

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, estimated_time_minutes)
    values ('10000000-0000-4000-8000-000000000791', 'Unguarded time', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 0)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_time_range"',
  'the time CHECK rejects 0 minutes when the trigger does not run'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, calories)
    values ('10000000-0000-4000-8000-000000000791', 'Unguarded calories', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 10001)$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_calories_range"',
  'the calories CHECK rejects more than 10,000 when the trigger does not run'
);

set local session_replication_role = origin;
set local role authenticated;

select throws_ok(
  $$update public.recipes set cook_note = repeat('n', 161) where id = '20000000-0000-4000-8000-000000000791'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_cook_note_len"',
  'the cook note keeps its 160-character limit'
);

-- Limits apply to edits, not only inserts.
select throws_ok(
  $$update public.recipes
    set instructions = (select jsonb_agg(jsonb_build_object('step', n, 'text', 'Step ' || n)) from generate_series(1, 41) as n)
    where id = '20000000-0000-4000-8000-000000000791'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_instructions_limits"',
  'an edit is held to the same limits as a new recipe'
);

-- Hub cards ------------------------------------------------------------------------------------

reset role;
create temp table hub_save_total as select coalesce(sum(save_count), 0)::int as total from public.recipe_cards;
set local role authenticated;

delete from public.recipes where id = '20000000-0000-4000-8000-000000000791';
insert into public.recipes (id, user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source)
values ('20000000-0000-4000-8000-000000000793', '10000000-0000-4000-8000-000000000791', 'Family Bread',
        null, 'unknown', '[{"name":"flour","quantity":500,"unit":"g"}]', '[{"step":1,"text":"Knead"}]',
        'full', 'manual');

reset role;
select is(
  (select coalesce(sum(save_count), 0)::int from public.recipe_cards),
  (select total from hub_save_total),
  'saving and deleting written recipes never changes Hub save counts'
);
set local role authenticated;

-- A recipe saved from the Carrot Soup card, then edited by hand.
insert into public.recipes (id, user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source)
values ('20000000-0000-4000-8000-000000000794', '10000000-0000-4000-8000-000000000791', 'Carrot Soup',
        'https://example.com/carrot-soup', 'web', '[{"name":"carrot","quantity":1,"unit":""}]',
        '[{"step":1,"text":"Simmer"}]', 'full', 'web');

update public.recipes
set title = 'My Carrot Soup',
    ingredients = '[{"name":"carrot","quantity":2,"unit":""},{"name":"ginger","quantity":1,"unit":"tsp"}]',
    instructions = '[{"step":1,"text":"Simmer for 20 minutes"},{"step":2,"text":"Blend"}]',
    calories = 300,
    locked_fields = '{calories}'
where id = '20000000-0000-4000-8000-000000000794';

reset role;

select is(
  (select title from public.recipe_cards where id = '30000000-0000-4000-8000-000000000791'),
  'Carrot Soup',
  'editing a recipe does not change its Hub card title'
);

select is(
  (select ingredients from public.recipe_cards where id = '30000000-0000-4000-8000-000000000791'),
  '[{"name":"carrot","quantity":1,"unit":""}]'::jsonb,
  'editing a recipe does not change its Hub card ingredients'
);

select is(
  (select save_count from public.recipe_cards where id = '30000000-0000-4000-8000-000000000791'),
  1,
  'an edited recipe still counts as one save on its Hub card'
);

select is(
  (select original_url from public.recipes where id = '20000000-0000-4000-8000-000000000794'),
  'https://example.com/carrot-soup',
  'an edited recipe keeps its source URL'
);

-- Row isolation --------------------------------------------------------------------------------

set local role authenticated;

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000792', 'Planted', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]')$$,
  '42501', null,
  'a user cannot write a recipe into someone else''s library'
);

update public.recipes set title = 'Vandalised' where id = '20000000-0000-4000-8000-000000000792';

select throws_ok(
  $$update public.recipes set user_id = '10000000-0000-4000-8000-000000000792'
    where id = '20000000-0000-4000-8000-000000000794'$$,
  '42501', null,
  'a user cannot move their recipe into someone else''s library'
);

reset role;

select is(
  (select title from public.recipes where id = '20000000-0000-4000-8000-000000000792'),
  'Their Stew',
  'a user cannot edit someone else''s recipe'
);

-- Recalculation cap ----------------------------------------------------------------------------

select is(
  (select max(public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000791', 'recipe_edit', current_date, 40))
   from generate_series(1, 40)),
  40,
  '40 recipe-edit recalculations can be reserved in a day'
);

select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000791', 'recipe_edit', current_date, 40),
  -1,
  'the 41st recipe-edit recalculation of the day is refused'
);

select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000791', 'remix', current_date, 40),
  1,
  'the recipe-edit cap is separate from the remix cap'
);

select ok(
  not has_function_privilege('anon', 'public.recipe_ingredients_within_limits(jsonb, boolean)', 'execute'),
  'guests cannot call the limit helpers'
);

select * from finish();
rollback;
