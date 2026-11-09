begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- PIN-79 (ADR 018): background recalculation state on a recipe.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000797',
        'authenticated', 'authenticated', 'recalc@pinch.invalid', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000797"}';

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-000000000797', '10000000-0000-4000-8000-000000000797', 'Stew',
        '[{"name":"beef","quantity":500,"unit":"g"}]', '[{"step":1,"text":"Brown"}]');

select is(
  (select row(recalc_pending, recalc_started_at)::text from public.recipes
   where id = '20000000-0000-4000-8000-000000000797'),
  '({},)',
  'a recipe starts with nothing to recalculate'
);

select lives_ok(
  $$update public.recipes
    set recalc_pending = '{calories,estimated_time_minutes,effort_level,cost_estimate,tags,appliances,ingredient_amounts}',
        recalc_started_at = now()
    where id = '20000000-0000-4000-8000-000000000797'$$,
  'every recalculable field can be pending'
);

select throws_ok(
  $$update public.recipes set recalc_pending = '{title}' where id = '20000000-0000-4000-8000-000000000797'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_recalc_pending_known"',
  'a field that is never recalculated cannot be pending'
);

select col_not_null('public', 'recipes', 'recalc_pending', 'recalc_pending is never null');

select col_is_null('public', 'recipes', 'recalc_started_at', 'recalc_started_at is nullable (old app builds never send it)');

select * from finish();
rollback;
