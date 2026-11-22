-- Pinterest as an import source (PIN-70, ADR 029).
--
-- extract-recipe now returns platform 'pinterest' for Pinterest pins and pin.it links, and the app
-- saves that value on the recipe. Add-only: every value allowed before is still allowed. Apply this
-- before deploying the Edge Functions, or those saves fail the check (the deploy workflow runs
-- migrations first).
--
-- recipe_cards_platform_check is left alone on purpose: Pinterest recipes are not published to the
-- Hub, and the Hub triggers already skip any platform outside their own list.

alter table public.recipes
  drop constraint if exists recipes_platform_check;

alter table public.recipes
  add constraint recipes_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'pinterest', 'web', 'photo', 'unknown'));
