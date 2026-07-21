-- Token pack notify interest (alpha waitlist until IAP).
alter table public.profiles
  add column if not exists token_pack_notify_at timestamptz null;

comment on column public.profiles.token_pack_notify_at is
  'When the user opted in to be notified about token packs. Null = not opted in.';

-- Allow signed-in users to set notify interest (set-once from client).
grant update (email, avatar_url, token_pack_notify_at) on public.profiles to authenticated;
