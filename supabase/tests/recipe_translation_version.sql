begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- PIN-53: which translator made each cached translation.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000530',
   'authenticated', 'authenticated', 'translations-a@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000531',
   'authenticated', 'authenticated', 'translations-b@pinch.invalid', '', now(), '{}', '{}', now(), now());

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-000000000530', '10000000-0000-4000-8000-000000000530', 'Soup',
        '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]');

-- Schema

select has_column('public', 'recipe_translations', 'translation_version', 'translations have a version');
select col_type_is('public', 'recipe_translations', 'translation_version', 'integer', 'the version is an integer');
select col_is_null('public', 'recipe_translations', 'translation_version', 'the version is nullable (old app builds never send it)');
select col_hasnt_default('public', 'recipe_translations', 'translation_version', 'no default, so old rows read as unknown');

-- The owner writes rows with and without a version, as new and old app builds do.

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000530"}';

select lives_ok(
  $$ insert into public.recipe_translations (recipe_id, language_code, title, translation_version)
     values ('20000000-0000-4000-8000-000000000530', 'he', 'מרק', 2),
            ('20000000-0000-4000-8000-000000000530', 'ru', 'Суп', null) $$,
  'the owner saves a translation with a version, and one without'
);

select throws_ok(
  $$ update public.recipe_translations set translation_version = 0
     where recipe_id = '20000000-0000-4000-8000-000000000530' and language_code = 'he' $$,
  '23514',
  null,
  'a version below 1 is refused'
);

-- Another user can't touch the version (the existing owner policies cover the new column).

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000531"}';

update public.recipe_translations set translation_version = 99
where recipe_id = '20000000-0000-4000-8000-000000000530';

reset role;

select is(
  (select array_agg(translation_version order by language_code) from public.recipe_translations
   where recipe_id = '20000000-0000-4000-8000-000000000530'),
  array[2, null]::integer[],
  'another user''s update changes nothing'
);

select is(
  (select count(*)::int from public.recipe_translations
   where recipe_id = '20000000-0000-4000-8000-000000000530'
     and (translation_version is null or translation_version < 2)),
  1,
  'the stale-row filter the backfill uses finds the row without a version'
);

select * from finish();
rollback;
