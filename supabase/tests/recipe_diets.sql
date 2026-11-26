begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- PIN-77 (migration 20261127120000_recipe_diets): a Library recipe's checked diets go stale, and back to null,
-- when its ingredients change; other edits and the backfill's own write keep them.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ad001',
        'authenticated', 'authenticated', 'diets-a@pinch.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email) values ('10000000-0000-4000-8000-0000000ad001', 'diets-a@pinch.invalid')
on conflict (id) do nothing;

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ad001', '10000000-0000-4000-8000-0000000ad001', 'Dal',
        '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]');

-- The backfill writes the answer.
update public.recipes set diets = array['vegetarian', 'vegan'] where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          array['vegetarian', 'vegan'], 'the backfill''s answer is kept');

update public.recipes set title = 'Red lentil dal' where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          array['vegetarian', 'vegan'], 'renaming keeps it');

update public.recipes set ingredients = '[{"name":"red lentils","quantity":1,"unit":"cup"},{"name":"bacon","quantity":2,"unit":"slices"}]'
where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          null::text[], 'new ingredients make it stale: not checked again yet');

select throws_ok(
  $$ update public.recipes set diets = array['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q']
     where id = '20000000-0000-4000-8000-0000000ad001' $$,
  '23514', null, 'at most 16 diets'
);

select * from finish();
rollback;
