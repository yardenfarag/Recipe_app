begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- PIN-80: protein, carbs and fat next to calories.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000800',
        'authenticated', 'authenticated', 'nutrition@pinch.invalid', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Schema

select has_column('public', 'recipes', 'nutrition', 'recipes have a nutrition column');
select has_column('public', 'recipe_cards', 'nutrition', 'hub cards have a nutrition column');
select col_is_null('public', 'recipes', 'nutrition', 'recipes.nutrition is nullable (old app builds never send it)');

-- Shape

select ok(public.recipe_nutrition_valid('{"protein_g":30,"carbs_g":40,"fat_g":18}'), 'three gram amounts are valid');
select ok(
  not public.recipe_nutrition_valid('{"protein_g":30,"carbs_g":40}')
  and not public.recipe_nutrition_valid('{"protein_g":30,"carbs_g":40,"fat_g":18,"sugar_g":5}')
  and not public.recipe_nutrition_valid('{"protein_g":"abc","carbs_g":40,"fat_g":18}')
  and not public.recipe_nutrition_valid('{"protein_g":-1,"carbs_g":40,"fat_g":18}')
  and not public.recipe_nutrition_valid('{"protein_g":2501,"carbs_g":40,"fat_g":18}')
  and not public.recipe_nutrition_valid('[30,40,18]'),
  'a missing or unknown key, a string, a negative, more than 2,500 g and a list are not'
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000800"}';

insert into public.recipes (id, user_id, title, ingredients, instructions, servings, calories, nutrition)
values
  ('20000000-0000-4000-8000-000000000801', '10000000-0000-4000-8000-000000000800', 'Chicken rice',
   '[{"name":"chicken","quantity":500,"unit":"g"}]', '[{"step":1,"text":"Cook"}]', 4, 2000,
   '{"protein_g":160,"carbs_g":200,"fat_g":60}'),
  ('20000000-0000-4000-8000-000000000802', '10000000-0000-4000-8000-000000000800', 'Crafted',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 1, 80,
   '{"protein_g":"lots","carbs_g":0,"fat_g":5}'),
  ('20000000-0000-4000-8000-000000000803', '10000000-0000-4000-8000-000000000800', 'No calories',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 1, null,
   '{"protein_g":6,"carbs_g":0,"fat_g":5}');

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  '{"protein_g":160,"carbs_g":200,"fat_g":60}'::jsonb,
  'a recipe keeps its nutrition'
);

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000802'),
  null,
  'an out-of-shape nutrition is saved as unknown instead of failing the save'
);

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000803'),
  null,
  'no calories means no macros'
);

-- An app build already in the stores remixes by writing new calories only.
update public.recipes set calories = 1600, title = 'Chicken rice, lighter'
where id = '20000000-0000-4000-8000-000000000801';

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  null,
  'calories that change without nutrition clear it'
);

update public.recipes set calories = 1800, nutrition = '{"protein_g":150,"carbs_g":180,"fat_g":50}'
where id = '20000000-0000-4000-8000-000000000801';

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  '{"protein_g":150,"carbs_g":180,"fat_g":50}'::jsonb,
  'calories and nutrition written together are kept'
);

update public.recipes set nutrition = '{"protein_g":140,"carbs_g":190,"fat_g":52}'
where id = '20000000-0000-4000-8000-000000000801';

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  '{"protein_g":140,"carbs_g":190,"fat_g":52}'::jsonb,
  'nutrition written alone (the backfill) is kept'
);

update public.recipes set title = 'Chicken rice', calories = 1800
where id = '20000000-0000-4000-8000-000000000801';

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  '{"protein_g":140,"carbs_g":190,"fat_g":52}'::jsonb,
  'writing the same calories again keeps nutrition'
);

update public.recipes set calories = null
where id = '20000000-0000-4000-8000-000000000801';

select is(
  (select nutrition from public.recipes where id = '20000000-0000-4000-8000-000000000801'),
  null,
  'clearing calories clears nutrition'
);

reset role;

select throws_ok(
  $$insert into public.recipe_cards (canonical_key, canonical_url, original_url, platform, title,
                                     ingredients, instructions, servings, extraction_status, nutrition)
    values ('web:https://example.com/bad-nutrition', 'https://example.com/bad-nutrition',
            'https://example.com/bad-nutrition', 'web', 'Bad', '[]', '[]', 1, 'full', '{"protein_g":1}')$$,
  '23514', null,
  'hub cards reject an out-of-shape nutrition'
);

select throws_ok(
  $$alter table public.recipes disable trigger recipes_clear_out_of_range_estimates;
    insert into public.recipes (user_id, title, ingredients, instructions, calories, nutrition)
    values ('10000000-0000-4000-8000-000000000800', 'Unguarded', '[{"name":"egg","quantity":1,"unit":""}]',
            '[{"step":1,"text":"Boil"}]', 80, '{"protein_g":1,"carbs_g":1}')$$,
  '23514', null,
  'the nutrition CHECK rejects a bad shape when the trigger does not run'
);

alter table public.recipes enable trigger recipes_clear_out_of_range_estimates;

-- Claiming a Hub card

insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, calories, extraction_status,
                                 extraction_source, nutrition)
values ('30000000-0000-4000-8000-000000000801', 'web:https://example.com/protein-bowl',
        'https://example.com/protein-bowl', 'https://example.com/protein-bowl', 'web', 'Protein Bowl',
        '[{"name":"tofu","quantity":400,"unit":"g"},{"name":"rice","quantity":200,"unit":"g"}]'::jsonb,
        '[{"step":1,"text":"Press"},{"step":2,"text":"Fry"}]'::jsonb, 2, 1200, 'full', 'web',
        '{"protein_g":70,"carbs_g":150,"fat_g":30}'::jsonb);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000800","role":"authenticated"}',
  true
);

create temp table claimed_bowl as
select public.claim_recipe_card('30000000-0000-4000-8000-000000000801') as id;

select is(
  (select nutrition from public.recipes where id = (select id from claimed_bowl)),
  '{"protein_g":70,"carbs_g":150,"fat_g":30}'::jsonb,
  'claiming a hub card copies its nutrition into the library'
);

select ok(
  has_function_privilege('authenticated', 'public.claim_recipe_card(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.recipe_nutrition_valid(jsonb)', 'execute'),
  'signed-in users can still claim hub cards, and guests cannot call the shape check'
);

select * from finish();
rollback;
