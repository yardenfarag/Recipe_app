-- PIN-181: the pantry. People photograph their fridge, freezer and cupboards, check the list Pinch reads from
-- the photos, and keep it in the app. The photos themselves are never stored (ADR 033).
--   * pantry_items: what the person has at home, one row per product and place. Their own rows, under RLS.
--   * pantry_scan_photos: what one photo of a scan held, until the scan is saved. Written only by the
--     scan-pantry and photo-handoff functions; the person reads and clears their own.
--   * photo_handoffs: a QR link that lets a phone take photos for a web session. Only the photo-handoff
--     function reads or writes it. A Snap or Guess photo waits here until the computer takes it, and is
--     deleted then, or by the purge below within 20 minutes.
--   * 'pantry_scan' joins the daily AI caps (one use per photo).
--   * 'pantry_rescan' joins the nudges: a reminder by push and email two weeks after the last scan.
--
-- Expand only. Pantry staples stay in profiles.kitchen; the apps show them with the pantry.

-- ── Pantry items ───────────────────────────────────────────────────────────
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- In the app language at the time it was added.
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Plain English name from a scan, used to match recipes in any language. Empty for items typed by hand.
  name_en text not null default '' check (char_length(name_en) <= 60),
  brand text not null default '' check (char_length(brand) <= 40),
  place text not null check (place in ('fridge', 'freezer', 'cupboard', 'other')),
  aisle text not null default 'other'
    check (aisle in ('produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'frozen', 'spices', 'other')),
  source text not null default 'manual' check (source in ('scan', 'manual', 'shopping_list')),
  -- One row per product and place: the English name when there is one, else the name, lower case.
  name_key text generated always as (
    lower(regexp_replace(btrim(coalesce(nullif(btrim(name_en), ''), name)), '\s+', ' ', 'g'))
  ) stored,
  added_at timestamptz not null default now(),
  -- Last time a scan or the person confirmed it. Shown as "scanned 3 days ago".
  last_seen_at timestamptz not null default now(),
  unique (user_id, place, name_key)
);

comment on table public.pantry_items is
  'PIN-181: food the person has at home, by place. Filled from photo scans, the shopping list or by hand.';

create index pantry_items_user_idx on public.pantry_items (user_id, place);

alter table public.pantry_items enable row level security;

create policy "Users read own pantry"
  on public.pantry_items for select
  using ((select auth.uid()) = user_id);
create policy "Users add to own pantry"
  on public.pantry_items for insert
  with check ((select auth.uid()) = user_id);
create policy "Users change own pantry"
  on public.pantry_items for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users remove from own pantry"
  on public.pantry_items for delete
  using ((select auth.uid()) = user_id);

revoke all on public.pantry_items from anon;
grant select, insert, update, delete on public.pantry_items to authenticated;

-- A pantry is a few hundred rows at most; this stops a runaway client, not a person.
create or replace function public.pantry_items_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.pantry_items where user_id = new.user_id) >= 600 then
    raise exception 'pantry_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.pantry_items_within_limit() from public, anon, authenticated;

create trigger pantry_items_within_limit
  before insert on public.pantry_items
  for each row execute function public.pantry_items_within_limit();

-- ── Scan photos ────────────────────────────────────────────────────────────
create table public.pantry_scan_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Chosen by the app when the scan starts; groups the photos until the list is saved.
  scan_id uuid not null,
  place text not null check (place in ('fridge', 'freezer', 'cupboard', 'other')),
  quality text not null check (quality in ('ok', 'too_dark', 'blurry', 'too_far', 'not_kitchen')),
  -- [{ name, name_en, brand, aisle, confidence, container_unknown }], as scan-pantry returns them.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  truncated boolean not null default false,
  from_phone boolean not null default false,
  -- sha256 of the photo's bytes, so the same photo sent twice (from the phone and the computer, say) is read
  -- once. The photo itself is not kept.
  photo_hash text check (photo_hash is null or photo_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create unique index pantry_scan_photos_same_photo_idx
  on public.pantry_scan_photos (user_id, scan_id, photo_hash)
  where photo_hash is not null;

comment on table public.pantry_scan_photos is
  'PIN-181: the items read from one photo of an unsaved scan. No image is stored. Purged after 7 days.';

create index pantry_scan_photos_scan_idx on public.pantry_scan_photos (user_id, scan_id, created_at);

alter table public.pantry_scan_photos enable row level security;

create policy "Users read own scan photos"
  on public.pantry_scan_photos for select
  using ((select auth.uid()) = user_id);
create policy "Users remove own scan photos"
  on public.pantry_scan_photos for delete
  using ((select auth.uid()) = user_id);

-- Rows come only from the functions (service role), so a client can't plant items it didn't scan.
revoke all on public.pantry_scan_photos from anon, authenticated;
grant select, delete on public.pantry_scan_photos to authenticated;

-- ── Phone handoffs ─────────────────────────────────────────────────────────
create table public.photo_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- sha256 of the token in the QR link, hex. The token itself is never stored.
  token_hash text not null unique,
  purpose text not null check (purpose in ('pantry', 'snap', 'guess')),
  scan_id uuid,
  -- The place picked on the computer; the phone can change it per photo.
  place text check (place is null or place in ('fridge', 'freezer', 'cupboard', 'other')),
  language text not null default 'en' check (char_length(language) between 2 and 8),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  connected_at timestamptz,
  closed_at timestamptz,
  -- Snap and Guess: the one photo waiting for the computer.
  photo bytea,
  photo_mime text check (photo_mime is null or photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_at timestamptz,
  check ((purpose = 'pantry') = (scan_id is not null)),
  check (photo is null or purpose <> 'pantry'),
  check (photo is null or octet_length(photo) <= 3 * 1024 * 1024)
);

comment on table public.photo_handoffs is
  'PIN-181: QR links that let a phone take photos for a web session. Read and written only by the photo-handoff function.';

create index photo_handoffs_user_idx on public.photo_handoffs (user_id, created_at desc);

alter table public.photo_handoffs enable row level security;
-- No policies: clients never touch this table.
revoke all on public.photo_handoffs from anon, authenticated;

-- ── Daily cap ──────────────────────────────────────────────────────────────
alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_action_check;

alter table public.ai_usage_daily
  add constraint ai_usage_daily_action_check
  check (action in (
    'substitution', 'translation', 'fridge_match', 'content_gate', 'remix', 'extract_attempt',
    'recipe_edit', 'pantry_scan'
  ));

-- Same body as 20261108130000 plus 'pantry_scan'. CREATE OR REPLACE keeps the grants.
create or replace function public.reserve_daily_ai_usage(
  p_user_id uuid,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_action not in (
    'substitution',
    'translation',
    'fridge_match',
    'content_gate',
    'remix',
    'extract_attempt',
    'recipe_edit',
    'pantry_scan'
  ) then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.ai_usage_daily (user_id, action, usage_date, usage_count, updated_at)
  values (p_user_id, p_action, p_usage_date, 1, now())
  on conflict (user_id, action, usage_date) do update
    set usage_count = public.ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

-- ── Rescan reminder ────────────────────────────────────────────────────────
-- A pantry is out of date the day you cook. Two weeks after the last scan, the nudges function (every 15
-- minutes, migration 20261122191000_nudges) reminds the person once, by push and by email, each with its
-- own opt-out. Scanning again starts the clock over, so the next stale spell gets its own reminder.
alter table public.nudge_sends drop constraint if exists nudge_sends_kind_check;
alter table public.nudge_sends
  add constraint nudge_sends_kind_check check (kind in ('day1', 'day3', 'pantry_rescan'));

-- Accounts whose last scan is 14 to 45 days old (past that they've stopped using the pantry, and a
-- reminder is noise), with the same columns as nudge_candidates so the function treats them alike (no
-- recipe: the reminder opens the scan). p_now is for tests.
create or replace function public.pantry_rescan_candidates(
  p_limit int default 50,
  p_now timestamptz default now()
)
returns table (
  user_id uuid,
  email text,
  locale text,
  recipe_id uuid,
  recipe_title text,
  unsubscribe_token text,
  push_tokens text[],
  email_sent boolean,
  push_sent boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with scanned as (
    select p.user_id, max(p.last_seen_at) as last_scan
    from public.pantry_items p
    where p.source = 'scan'
    group by p.user_id
  ),
  due as (
    select
      u.id,
      case when u.email_confirmed_at is not null and not pr.email_opt_out then nullif(u.email::text, '') end as email,
      nullif(u.raw_user_meta_data ->> 'locale', '') as locale,
      pr.push_opt_out,
      s.last_scan
    from scanned s
    join auth.users u on u.id = s.user_id
    join public.profiles pr on pr.id = u.id
    where s.last_scan <= p_now - interval '14 days'
      and s.last_scan > p_now - interval '45 days'
      and u.deleted_at is null
      and coalesce(u.is_anonymous, false) = false
      and not (pr.email_opt_out and pr.push_opt_out)
  )
  select
    d.id,
    d.email,
    d.locale,
    null::uuid,
    null::text,
    public.email_unsubscribe_token(d.id),
    case when d.push_opt_out then '{}'::text[] else
      coalesce((select array_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = d.id), '{}')
    end,
    exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'email'),
    exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'push')
  from due d
  where (
      d.email is not null
      and not exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'email')
    )
    or (
      not d.push_opt_out
      and exists (select 1 from public.push_tokens t where t.user_id = d.id)
      and not exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'push')
    )
  order by d.last_scan
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.pantry_rescan_candidates(int, timestamptz) from public, anon, authenticated;
grant execute on function public.pantry_rescan_candidates(int, timestamptz) to service_role;

-- A scan (new items, or items seen again) clears the reminder already sent, so the next stale spell
-- gets one too. Runs as the owner: clients can't touch nudge_sends.
create or replace function public.pantry_scan_resets_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.nudge_sends where user_id = new.user_id and kind = 'pantry_rescan';
  return null;
end;
$$;

revoke all on function public.pantry_scan_resets_reminder() from public, anon, authenticated;

create trigger pantry_scan_resets_reminder
  after insert or update of last_seen_at on public.pantry_items
  for each row
  when (new.source = 'scan')
  execute function public.pantry_scan_resets_reminder();

-- ── Purge ──────────────────────────────────────────────────────────────────
-- Phone photos never wait longer than 15 minutes (the job runs every 5), handoffs go a day after they
-- expire, and an abandoned scan's lists go after a week.
create or replace function public.purge_pantry_scratch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.photo_handoffs
  set photo = null, photo_mime = null
  where photo is not null and photo_at < now() - interval '15 minutes';

  delete from public.photo_handoffs where expires_at < now() - interval '1 day';
  delete from public.pantry_scan_photos where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.purge_pantry_scratch() from public, anon, authenticated;
grant execute on function public.purge_pantry_scratch() to service_role;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-purge-pantry-scratch') then
    perform cron.unschedule('pinch-purge-pantry-scratch');
  end if;
  perform cron.schedule(
    'pinch-purge-pantry-scratch',
    '*/5 * * * *',
    'select public.purge_pantry_scratch();'
  );
end;
$schedule$;
