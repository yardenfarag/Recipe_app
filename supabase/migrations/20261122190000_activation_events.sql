-- Activation and the cooking habit: two new product events.
--   recipe_cooked        someone marked a recipe cooked (the cook-mode button or "I cooked this").
--   first_recipes_picked a new account saved its first recipes from the Hub picker after onboarding.
-- Expand only: the old names stay allowed.

alter table public.product_events
  drop constraint if exists product_events_name_check;

alter table public.product_events
  add constraint product_events_name_check
  check (
    name in (
      'recipe_extracted',
      'recipe_saved',
      'paywall_viewed',
      'onboarding_completed',
      'web_intro_viewed',
      'web_intro_clicked',
      'app_shared',
      'heard_about',
      'recipe_cooked',
      'first_recipes_picked'
    )
  ) not valid;

alter table public.product_events validate constraint product_events_name_check;
