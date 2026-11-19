-- Stable public URL slug for each Hub card, for pinch-app.io/r/<public_slug> (PIN-124).
--
-- Production already has all of this: it came from the unmerged cost-guards branch
-- (0044_recipe_card_public_slug.sql) and was applied by hand. This migration brings the repo,
-- local Supabase and the generated types in line. Every statement is idempotent and matches
-- production, except the column default '' below, which is the only change there.
--
-- The slug is the Latin title plus the first 12 hex digits of the card id, or the digits alone
-- for titles with no Latin letters. It is set once on insert; title changes never move it. The
-- share-page Worker finds a card from the digits, so a wrong title part still resolves.

create or replace function public.recipe_card_public_slug(p_title text, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when base = '' then suffix
    else base || '-' || suffix
  end
  from (
    select
      left(replace(p_id::text, '-', ''), 12) as suffix,
      trim(both '-' from left(
        trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')),
        48
      )) as base
  ) parts;
$$;

create or replace function public.set_recipe_card_public_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  if new.public_slug is null or btrim(new.public_slug) = '' then
    new.public_slug := public.recipe_card_public_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

-- Expand: add and fill the column before anything relies on it.
alter table public.recipe_cards
  add column if not exists public_slug text;

update public.recipe_cards
set public_slug = public.recipe_card_public_slug(title, id)
where public_slug is null or btrim(public_slug) = '';

alter table public.recipe_cards
  alter column public_slug set not null;

-- The trigger replaces an empty slug, so inserts never need to pass one. The default makes
-- that visible to the generated types (Insert.public_slug optional). New on production.
alter table public.recipe_cards
  alter column public_slug set default '';

create unique index if not exists recipe_cards_public_slug_unique
  on public.recipe_cards (public_slug);

comment on column public.recipe_cards.public_slug is
  'Immutable public path segment. Latin title plus an id suffix, or the suffix alone.';

drop trigger if exists recipe_cards_set_public_slug on public.recipe_cards;
create trigger recipe_cards_set_public_slug
  before insert on public.recipe_cards
  for each row execute procedure public.set_recipe_card_public_slug();

-- Trigger functions are never called directly.
revoke all on function public.set_recipe_card_public_slug() from public, anon, authenticated;
