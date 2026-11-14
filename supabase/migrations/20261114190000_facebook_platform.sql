-- Facebook as an import source (PIN-66, ADR 021).
--
-- extract-recipe now returns platform 'facebook' for Facebook reels and posts, and the app saves
-- that value on the recipe. Apply this before deploying the Edge Functions, or those saves fail
-- the check.
--
-- recipe_cards_platform_check is left alone on purpose: Facebook recipes are not published to
-- the Hub yet, and the Hub triggers already skip any platform outside their own list.

alter table public.recipes
  drop constraint if exists recipes_platform_check;

alter table public.recipes
  add constraint recipes_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web', 'photo', 'unknown'));
