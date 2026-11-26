begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- PIN-77 (migration 20261127130000_recipe_translations_on_save): an extraction's translations reach the cook's
-- copy whichever comes first, a Hub card's translations come along when the card has the same text, and nothing
-- the recipe already has is replaced.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ae001',
   'authenticated', 'authenticated', 'translations-a@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ae002',
   'authenticated', 'authenticated', 'translations-b@pinch.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email) values
  ('10000000-0000-4000-8000-0000000ae001', 'translations-a@pinch.invalid'),
  ('10000000-0000-4000-8000-0000000ae002', 'translations-b@pinch.invalid')
on conflict (id) do nothing;

-- The content key ---------------------------------------------------------------
select is(
  public.recipe_content_key('Lentil Soup ', '[{"name":"Lentils","quantity":1,"unit":"Cup"},{"name":" "}]',
                            '[{"step":1,"text":"Simmer "}]'),
  public.recipe_content_key('lentil soup', '[{"name":"lentils ","quantity":1,"unit":"cup"}]',
                            '[{"step":1,"text":"simmer"}]'),
  'the key ignores case, spaces and unnamed lines'
);
select isnt(
  public.recipe_content_key('Lentil soup', '[{"name":"lentils","quantity":2,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]'),
  public.recipe_content_key('Lentil soup', '[{"name":"lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]'),
  'other amounts are another text'
);
select ok(
  public.recipe_content_key('', '[{"name":"lentils"}]', '[]') is null
  and public.recipe_content_key('Soup', '[]', '[]') is null,
  'no title, or nothing but a title: nothing to match on'
);

-- 1. The translations arrive first; the save picks them up. ------------------------
select is(
  public.remember_recipe_translations(
    '10000000-0000-4000-8000-0000000ae001', 'Lentil soup',
    '[{"name":"lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]',
    '{"he":{"title":"מרק עדשים","ingredients":[{"name":"עדשים","quantity":1,"unit":"כוס"}],"instructions":[{"step":1,"text":"מבשלים"}],"translation_version":2},
      "ru":{"title":"Чечевичный суп","ingredients":[{"name":"чечевицы","quantity":1,"unit":"стакан"}],"instructions":[{"step":1,"text":"Варите"}],"translation_version":2},
      "de":{"title":"Linsensuppe","ingredients":[],"instructions":[],"translation_version":2},
      "es":{"title":" ","ingredients":[],"instructions":[],"translation_version":2},
      "ar":{"title":"شوربة عدس","ingredients":[],"instructions":[],"translation_version":0}}'),
  0, 'nothing saved yet: the translations wait'
);
select is(
  (select array_agg(language_code order by language_code) from public.recipe_translations_pending
   where user_id = '10000000-0000-4000-8000-0000000ae001'),
  array['he', 'ru'], 'only complete translations into app languages wait'
);

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ae001', '10000000-0000-4000-8000-0000000ae001', 'Lentil Soup',
        '[{"name":"Lentils ","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"simmer"}]');
select is(
  (select array_agg(language_code || ':' || title || ':' || translation_version order by language_code)
   from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae001'),
  array['he:מרק עדשים:2', 'ru:Чечевичный суп:2'], 'the save takes the waiting translations'
);

-- Another cook's save of the same text takes nothing.
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ae002', '10000000-0000-4000-8000-0000000ae002', 'Lentil soup',
        '[{"name":"lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]');
select is((select count(*)::int from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae002'),
          0, 'translations wait for their own cook only');

-- 2. The recipe is saved first; the translations fill it when they arrive. ---------
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ae003', '10000000-0000-4000-8000-0000000ae001', 'Pancakes',
        '[{"name":"flour","quantity":200,"unit":"g"},{"name":"milk","quantity":1,"unit":"cup"}]',
        '[{"step":1,"text":"Whisk"},{"step":2,"text":"Fry"}]');
select is((select count(*)::int from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae003'),
          0, 'saved before the translations');
select is(
  public.remember_recipe_translations(
    '10000000-0000-4000-8000-0000000ae001', 'Pancakes',
    '[{"name":"flour","quantity":200,"unit":"g"},{"name":"milk","quantity":1,"unit":"cup"}]',
    '[{"step":1,"text":"Whisk"},{"step":2,"text":"Fry"}]',
    '{"he":{"title":"פנקייק","ingredients":[],"instructions":[],"translation_version":2},
      "es":{"title":"Tortitas","ingredients":[],"instructions":[],"translation_version":2}}'),
  2, 'the late translations fill the saved copy'
);

-- 3. Another text is another recipe: not filled. -----------------------------------
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ae004', '10000000-0000-4000-8000-0000000ae001', 'Pancakes',
        '[{"name":"flour","quantity":200,"unit":"g"},{"name":"milk","quantity":1,"unit":"cup"}]',
        '[{"step":1,"text":"Whisk"},{"step":2,"text":"Bake"}]');
select is((select count(*)::int from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae004'),
          0, 'a different step text takes no translation');
select is(
  public.remember_recipe_translations(
    '10000000-0000-4000-8000-0000000ae001', 'Pancakes',
    '[{"name":"flour","quantity":250,"unit":"g"},{"name":"milk","quantity":1,"unit":"cup"}]',
    '[{"step":1,"text":"Whisk"},{"step":2,"text":"Fry"}]',
    '{"ru":{"title":"Блины","ingredients":[],"instructions":[],"translation_version":2}}'),
  0, 'other amounts fill no saved copy'
);

-- 4. An existing translation is never replaced. -------------------------------------
insert into public.recipe_translations (recipe_id, language_code, title, translation_version)
values ('20000000-0000-4000-8000-0000000ae003', 'ar', 'فطائر التطبيق', 2);
select is(
  public.remember_recipe_translations(
    '10000000-0000-4000-8000-0000000ae001', 'Pancakes',
    '[{"name":"flour","quantity":200,"unit":"g"},{"name":"milk","quantity":1,"unit":"cup"}]',
    '[{"step":1,"text":"Whisk"},{"step":2,"text":"Fry"}]',
    '{"ar":{"title":"فطائر الخادم","ingredients":[],"instructions":[],"translation_version":2},
      "he":{"title":"פנקייק אחר","ingredients":[],"instructions":[],"translation_version":2},
      "ru":{"title":"Блины","ingredients":[],"instructions":[],"translation_version":2}}'),
  1, 'only the missing language is added'
);
select is(
  (select array_agg(language_code || ':' || title order by language_code)
   from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae003'),
  array['ar:فطائر التطبيق', 'es:Tortitas', 'he:פנקייק', 'ru:Блины'], 'the app''s and the earlier translations stay'
);

-- Translations older than a day are not picked up.
update public.recipe_translations_pending set created_at = now() - interval '2 days'
where user_id = '10000000-0000-4000-8000-0000000ae001';
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ae005', '10000000-0000-4000-8000-0000000ae001', 'Lentil soup',
        '[{"name":"lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]');
select is((select count(*)::int from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae005'),
          0, 'translations kept more than a day are not used');

-- 5. Hub cards ------------------------------------------------------------------------
insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title, ingredients, instructions)
values
  ('30000000-0000-4000-8000-0000000ae001', public.recipe_card_canonical_key('web', 'https://e2e-translations.example/dal'),
   'https://e2e-translations.example/dal', 'https://e2e-translations.example/dal', 'web', 'Dal',
   '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]'),
  ('30000000-0000-4000-8000-0000000ae002', public.recipe_card_canonical_key('web', 'https://e2e-translations.example/stew'),
   'https://e2e-translations.example/stew', 'https://e2e-translations.example/stew', 'web', 'Stew',
   '[{"name":"beef","quantity":1,"unit":"lb"}]', '[{"step":1,"text":"Braise"}]');
insert into public.recipe_card_translations (card_id, language_code, title, ingredients, instructions, translation_version)
values
  ('30000000-0000-4000-8000-0000000ae001', 'he', 'דאל', '[{"name":"עדשים אדומות","quantity":1,"unit":"כוס"}]', '[{"step":1,"text":"מבשלים"}]', 2),
  ('30000000-0000-4000-8000-0000000ae001', 'es', 'Dal', '[{"name":"lentejas rojas","quantity":1,"unit":"taza"}]', '[{"step":1,"text":"Cocina"}]', 2),
  ('30000000-0000-4000-8000-0000000ae002', 'he', 'תבשיל', '[]', '[]', 2);

-- Saved from the Hub, as the cook (claim_recipe_card): the card's translations come along.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000ae002"}';
select lives_ok($$ select public.claim_recipe_card('30000000-0000-4000-8000-0000000ae001') $$,
                'a cook saves a Hub card');
select is(
  (select array_agg(t.language_code || ':' || t.title order by t.language_code)
   from public.recipe_translations t join public.recipes r on r.id = t.recipe_id
   where r.user_id = '10000000-0000-4000-8000-0000000ae002' and r.title = 'Dal'),
  array['es:Dal', 'he:דאל'], 'a recipe saved from the Hub takes the card''s translations'
);
reset role;

-- An extraction from the same page with other text (the page changed) takes none of the card's.
insert into public.recipes (id, user_id, title, ingredients, instructions, platform, original_url)
values ('20000000-0000-4000-8000-0000000ae006', '10000000-0000-4000-8000-0000000ae001', 'Stew',
        '[{"name":"beef","quantity":2,"unit":"lb"}]', '[{"step":1,"text":"Braise"}]', 'web', 'https://e2e-translations.example/stew');
select is((select count(*)::int from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae006'),
          0, 'a card with other text gives no translation');

-- The waiting translations win; the card fills the languages still missing.
select public.remember_recipe_translations(
  '10000000-0000-4000-8000-0000000ae001', 'Dal', '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]',
  '{"he":{"title":"דאל של הבשלן","ingredients":[],"instructions":[],"translation_version":2}}');
insert into public.recipes (id, user_id, title, ingredients, instructions, platform, original_url)
values ('20000000-0000-4000-8000-0000000ae007', '10000000-0000-4000-8000-0000000ae001', 'Dal',
        '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]', 'web', 'https://e2e-translations.example/dal');
select is(
  (select array_agg(language_code || ':' || title order by language_code)
   from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae007'),
  array['es:Dal', 'he:דאל של הבשלן'], 'the extraction''s own translation first, then the card''s'
);

-- The backfill's copy from cards: only what is missing, and it says what it copied.
delete from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae007' and language_code = 'es';
select is(
  (select array_agg(c.language_code) from public.copy_card_translations_to_recipes(
     array['20000000-0000-4000-8000-0000000ae007', '20000000-0000-4000-8000-0000000ae006']::uuid[]) c),
  array['es'], 'copy_card_translations_to_recipes fills only the gaps of matching recipes'
);

-- A card whose text changes loses its translations.
update public.recipe_cards set ingredients = '[{"name":"beef","quantity":2,"unit":"lb"}]'
where id = '30000000-0000-4000-8000-0000000ae002';
select is((select count(*)::int from public.recipe_card_translations where card_id = '30000000-0000-4000-8000-0000000ae002'),
          0, 'new card text drops the old translations');
update public.recipe_cards set save_count = save_count + 1 where id = '30000000-0000-4000-8000-0000000ae001';
select is((select count(*)::int from public.recipe_card_translations where card_id = '30000000-0000-4000-8000-0000000ae001'),
          2, 'other card changes keep them');

-- 6. The cook still writes their own recipes (the triggers run for them). ------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000ae001"}';
select lives_ok(
  $$
    insert into public.recipes (id, user_id, title, ingredients, instructions, platform, original_url)
    values ('20000000-0000-4000-8000-0000000ae008', '10000000-0000-4000-8000-0000000ae001', 'Dal',
            '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]', 'web',
            'https://e2e-translations.example/my-dal');
    update public.recipes set title = 'My dal', ingredients = '[{"name":"lentils","quantity":2,"unit":"cup"}]'
    where id = '20000000-0000-4000-8000-0000000ae008';
    delete from public.recipe_translations where recipe_id = '20000000-0000-4000-8000-0000000ae008';
    insert into public.recipe_translations (recipe_id, language_code, title, translation_version)
    values ('20000000-0000-4000-8000-0000000ae008', 'he', 'הדאל שלי', 2);
  $$,
  'a signed-in cook inserts, edits and translates their own recipe'
);
select throws_ok($$ select count(*) from public.recipe_translations_pending $$, '42501', null,
                 'cooks cannot read the waiting translations');
reset role;

-- 7. Only the server hands over translations. ------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.remember_recipe_translations(uuid, text, jsonb, jsonb, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.remember_recipe_translations(uuid, text, jsonb, jsonb, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.remember_recipe_translations(uuid, text, jsonb, jsonb, jsonb)', 'execute'),
  'only the server calls remember_recipe_translations'
);
select ok(
  not has_function_privilege('authenticated', 'public.copy_card_translations_to_recipes(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.copy_card_translations_to_recipes(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.recipe_content_key(text, jsonb, jsonb)', 'execute'),
  'nor copy_card_translations_to_recipes or the key'
);

select * from finish();
rollback;
