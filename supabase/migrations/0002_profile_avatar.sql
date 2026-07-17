-- Profile avatars
-- Run this in the Supabase SQL Editor (or via `supabase db push` once the CLI is linked)

alter table public.profiles add column avatar_url text;

-- ============================================================
-- Storage bucket for avatar images (public read, owner-only write)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (select auth.uid()) = owner);

create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (select auth.uid()) = owner);

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (select auth.uid()) = owner);
