-- "Share Pinch" in Settings: whether the share sheet was used, copied, or closed.

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
      'app_shared'
    )
  );
