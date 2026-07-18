-- Public bucket for rehosted Instagram/TikTok thumbnails (CDN URLs expire / block hotlinking).
insert into storage.buckets (id, name, public)
values ('recipe-thumbnails', 'recipe-thumbnails', true)
on conflict (id) do nothing;

create policy "Public read recipe thumbnails"
  on storage.objects for select
  using (bucket_id = 'recipe-thumbnails');

-- Writes happen via the service role in Edge Functions (bypasses RLS).
