-- Cooking Hub: anonymous public cards for successful URL extracts.
-- Private library rows stay private. Hub cards have no contributor identity.

alter table public.profiles
  add column if not exists contribute_to_hub boolean not null default true;

comment on column public.profiles.contribute_to_hub is
  'When true, successful public-link extracts may be upserted into recipe_cards.';

revoke update on public.profiles from authenticated;
grant update (
  email,
  avatar_url,
  token_pack_notify_at,
  kitchen,
  contribute_to_hub
) on public.profiles to authenticated;

create table if not exists public.recipe_cards (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  canonical_url text not null,
  original_url text not null,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'web')),
  title text not null,
  image_url text,
  source_video_url text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  servings int not null default 1 check (servings >= 1),
  calories int,
  estimated_time_minutes int,
  cost_estimate text check (cost_estimate in ('$', '$$', '$$$')),
  effort_level text check (effort_level in ('Easy', 'Medium', 'Hard')),
  extraction_status text not null default 'full' check (extraction_status in ('full', 'partial')),
  extraction_source text,
  tags text[] not null default '{}',
  source_language text,
  save_count int not null default 0 check (save_count >= 0),
  extract_hit_count int not null default 0 check (extract_hit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recipe_cards_canonical_key_unique
  on public.recipe_cards (canonical_key);

create index if not exists recipe_cards_platform_idx
  on public.recipe_cards (platform);

create index if not exists recipe_cards_tags_gin_idx
  on public.recipe_cards using gin (tags);

create index if not exists recipe_cards_popularity_idx
  on public.recipe_cards (save_count desc, created_at desc);

create index if not exists recipe_cards_original_url_idx
  on public.recipe_cards (original_url);

comment on table public.recipe_cards is
  'Anonymous Cooking Hub catalog. One card per public source URL.';

alter table public.recipe_cards enable row level security;

drop policy if exists "Anyone can read cooking hub cards" on public.recipe_cards;
create policy "Anyone can read cooking hub cards"
  on public.recipe_cards for select
  using (true);

create or replace function public.touch_recipe_card_hit(p_card_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recipe_cards
  set extract_hit_count = extract_hit_count + 1
  where id = p_card_id;
$$;

revoke all on function public.touch_recipe_card_hit(uuid) from public;
grant execute on function public.touch_recipe_card_hit(uuid) to service_role;

create or replace function public.bump_recipe_card_on_recipe_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.original_url is null then
    return new;
  end if;
  if new.platform is null or new.platform not in ('youtube', 'instagram', 'tiktok', 'web') then
    return new;
  end if;
  if new.extraction_source is not distinct from 'invented' then
    return new;
  end if;
  if new.extraction_source is not distinct from 'photo' then
    return new;
  end if;

  update public.recipe_cards
  set save_count = save_count + 1
  where original_url = new.original_url
     or canonical_url = new.original_url;

  return new;
end;
$$;

drop trigger if exists recipes_bump_recipe_card_save_count on public.recipes;
create trigger recipes_bump_recipe_card_save_count
  after insert on public.recipes
  for each row execute procedure public.bump_recipe_card_on_recipe_insert();

create or replace function public.claim_recipe_card(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  card public.recipe_cards%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_user_profile(uid);

  select * into card
  from public.recipe_cards
  where id = p_card_id;

  if not found then
    raise exception 'card_not_found';
  end if;

  select r.id into existing_id
  from public.recipes r
  where r.user_id = uid
    and r.original_url = card.original_url
    and r.extraction_source is distinct from 'invented'
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.recipes (
    user_id,
    title,
    original_url,
    platform,
    image_url,
    source_video_url,
    ingredients,
    instructions,
    servings,
    calories,
    estimated_time_minutes,
    cost_estimate,
    effort_level,
    extraction_status,
    extraction_source,
    tags,
    source_language,
    is_favorite,
    migrated_from_guest
  )
  values (
    uid,
    card.title,
    card.original_url,
    card.platform,
    card.image_url,
    card.source_video_url,
    card.ingredients,
    card.instructions,
    card.servings,
    card.calories,
    card.estimated_time_minutes,
    card.cost_estimate,
    card.effort_level,
    card.extraction_status,
    card.extraction_source,
    card.tags,
    coalesce(card.source_language, 'en'),
    false,
    false
  )
  returning id into new_id;

  return new_id;
end;
$$;

comment on function public.claim_recipe_card(uuid) is
  'Copies a Cooking Hub card into the signed-in user library. Idempotent per source URL.';

revoke all on function public.claim_recipe_card(uuid) from public;
grant execute on function public.claim_recipe_card(uuid) to authenticated;
