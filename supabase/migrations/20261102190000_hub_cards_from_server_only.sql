-- The public Hub only shows what our own extraction produced (PIN-67).
--
-- Saving a recipe used to publish a Hub card from the saved row itself. The app
-- inserts recipes straight through the REST API, so any signed-in user could
-- insert a crafted row and claim a popular URL's card with spam text or a
-- tracking image, or fill in a missing image or appliances on someone else's card.
--
-- extract-recipe already publishes each successful extraction with the service
-- role (publishRecipeCard), which is now the only writer of card content. A save
-- only counts towards an existing card's save_count.
--
-- Matches production's current definition (recipe_appliances, cost-guards) for
-- every early return, so only the publishing part changes.

create or replace function public.bump_recipe_card_on_recipe_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  card_key text;
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

  card_key := public.recipe_card_canonical_key(new.platform, new.original_url);
  if card_key is not null then
    update public.recipe_cards
    set save_count = save_count + 1
    where canonical_key = card_key;
  end if;

  return new;
end;
$fn$;

revoke all on function public.bump_recipe_card_on_recipe_insert() from public, anon, authenticated;
