-- Stable public URL slug for each Cooking Hub card.
-- Set once on insert. Title edits do not change the slug.

create or replace function public.recipe_card_public_slug(p_title text, p_id uuid)
returns text
language sql
immutable
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

alter table public.recipe_cards
  add column if not exists public_slug text;

update public.recipe_cards
set public_slug = public.recipe_card_public_slug(title, id)
where public_slug is null or btrim(public_slug) = '';

alter table public.recipe_cards
  alter column public_slug set not null;

create unique index if not exists recipe_cards_public_slug_unique
  on public.recipe_cards (public_slug);

comment on column public.recipe_cards.public_slug is
  'Immutable public path segment. Latin title plus an id suffix, or the suffix alone.';

drop trigger if exists recipe_cards_set_public_slug on public.recipe_cards;
create trigger recipe_cards_set_public_slug
  before insert on public.recipe_cards
  for each row execute procedure public.set_recipe_card_public_slug();
