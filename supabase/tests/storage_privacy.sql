begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000041',
    'authenticated', 'authenticated', 'storage-owner@pinch.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000042',
    'authenticated', 'authenticated', 'storage-other@pinch.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into storage.objects (bucket_id, name, owner)
values
  ('recipe-thumbnails', 'photo/test-private-snap.jpg', null),
  ('avatars', '10000000-0000-4000-8000-000000000041-1.jpg',
   '10000000-0000-4000-8000-000000000041');

-- Anonymous visitor, holding only the anon key.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-thumbnails'),
  0,
  'anon cannot list recipe thumbnails, including user photos'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  0,
  'anon cannot list avatars'
);

-- A different signed-in user.
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000042"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-thumbnails'),
  0,
  'signed-in users cannot list recipe thumbnails'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  0,
  'signed-in users cannot list other users'' avatars'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '10000000-0000-4000-8000-000000000041-2.jpg',
            '10000000-0000-4000-8000-000000000042')
  $$,
  '42501',
  null,
  'users cannot upload avatars under another user''s id'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '10000000-0000-4000-8000-000000000042-1.jpg',
            '10000000-0000-4000-8000-000000000042')
  $$,
  'users can upload avatars under their own id'
);

-- The avatar's owner.
set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000041"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  1,
  'users can still see their own avatar objects (needed for upsert)'
);

reset role;

select ok(
  (select file_size_limit is not null and not ('image/svg+xml' = any(allowed_mime_types))
   from storage.buckets where id = 'avatars'),
  'avatars caps file size and refuses SVG'
);

select ok(
  (select file_size_limit is not null and not ('image/svg+xml' = any(allowed_mime_types))
   from storage.buckets where id = 'recipe-thumbnails'),
  'recipe thumbnails caps file size and refuses SVG'
);

select * from finish();
rollback;
