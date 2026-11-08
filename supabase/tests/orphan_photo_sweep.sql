begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000081',
  'authenticated', 'authenticated', 'sweep@pinch.invalid', '',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into storage.objects (bucket_id, name, created_at)
values
  ('recipe-thumbnails', 'photo/sweep-orphan.jpg', now() - interval '3 days'),
  ('recipe-thumbnails', 'photo/u/sweep-used.jpg', now() - interval '3 days'),
  ('recipe-thumbnails', 'photo/sweep-shared.jpg', now() - interval '3 days'),
  ('recipe-thumbnails', 'photo/sweep-fresh.jpg', now()),
  ('recipe-thumbnails', 'instagram/sweep-social.jpg', now() - interval '3 days');

insert into public.recipes (user_id, title, original_url, platform, image_url, ingredients, instructions)
values ('10000000-0000-4000-8000-000000000081', 'Used photo', null, 'photo',
        'https://x.supabase.co/storage/v1/object/public/recipe-thumbnails/photo/u/sweep-used.jpg',
        '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]');

insert into public.recipe_shares (token, created_by, snapshot)
values ('sweep-test-token', '10000000-0000-4000-8000-000000000081',
        '{"image_url":"https://x.supabase.co/storage/v1/object/public/recipe-thumbnails/photo/sweep-shared.jpg"}');

select ok(
  'photo/sweep-orphan.jpg' in (select public.orphan_photo_paths(1000)),
  'an old photo nothing references is swept'
);
select ok(
  'photo/u/sweep-used.jpg' not in (select public.orphan_photo_paths(1000)),
  'a photo a recipe uses is kept'
);
select ok(
  'photo/sweep-shared.jpg' not in (select public.orphan_photo_paths(1000)),
  'a photo a share snapshot uses is kept'
);
select ok(
  'photo/sweep-fresh.jpg' not in (select public.orphan_photo_paths(1000)),
  'a photo younger than a day is kept (extraction not saved yet)'
);
select ok(
  'instagram/sweep-social.jpg' not in (select public.orphan_photo_paths(1000)),
  'social thumbnails are never swept'
);

select ok(
  not has_function_privilege('authenticated', 'public.orphan_photo_paths(int)', 'execute')
  and not has_function_privilege('anon', 'public.photo_sweep_secret_matches(text)', 'execute'),
  'clients cannot call the sweep functions'
);

select ok(
  public.photo_sweep_secret_matches(
    (select decrypted_secret from vault.decrypted_secrets where name = 'photo_sweep_secret')
  ) and not public.photo_sweep_secret_matches('wrong'),
  'the sweep secret matches only itself'
);

select * from finish();
rollback;
