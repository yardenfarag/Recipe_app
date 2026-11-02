-- Stop anyone from listing the storage buckets (PIN-54).
-- Both buckets are public, so files are served by URL without any SELECT
-- policy. The SELECT policies from 0002 and 0006 only added the list API, which
-- let anyone with the anon key list recipe-thumbnails/photo/ and download every
-- user's Snap photos, and list avatars to collect every user id. The app only
-- builds public URLs from known paths, and delete-account lists with the
-- service role, so nothing needs these policies.

drop policy if exists "Public read recipe thumbnails" on storage.objects;
drop policy if exists "Avatar images are publicly accessible" on storage.objects;

-- Avatar uploads use upsert, which needs SELECT on the caller's own objects.
create policy "Users can read their own avatar objects"
  on storage.objects for select
  using (bucket_id = 'avatars' and (select auth.uid()) = owner);

-- Avatars live at `<user id>-<timestamp>.<ext>` (src/lib/supabase/profile.ts),
-- and delete-account removes `<user id>-*`. Hold writes to that prefix so one
-- user can't plant files under another user's id.
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid()) = owner
    and starts_with(name, (select auth.uid())::text || '-')
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (select auth.uid()) = owner)
  with check (
    bucket_id = 'avatars'
    and (select auth.uid()) = owner
    and starts_with(name, (select auth.uid())::text || '-')
  );

-- Public buckets shouldn't host arbitrary files. SVG is left out because it can
-- carry script. Uploads that fail these limits only lose the hero image.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'avatars';

update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'
    ]
where id = 'recipe-thumbnails';
