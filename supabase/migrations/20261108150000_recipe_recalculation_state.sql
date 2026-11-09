-- Background recalculation state for hand-edited and written recipes (PIN-79, ADR 018).
--
-- save-recipe-edit saves the content at once, then recalculates the AI-derived fields the edit
-- affects. recalc_pending lists the fields still being recalculated: the detail screen shows
-- "Updating…" on them, and each is removed as its new value is written. A field left here after
-- a failure (or past the daily cap) is retried the next time the recipe is opened.
--
-- Safe for app builds already in the stores: both columns have defaults or are nullable, and
-- old builds never read or write them.

alter table public.recipes
  add column if not exists recalc_pending text[] not null default '{}',
  add column if not exists recalc_started_at timestamptz;

comment on column public.recipes.recalc_pending is
  'Fields save-recipe-edit is recalculating (ADR 018). Removed as each is written; left on failure for a retry.';
comment on column public.recipes.recalc_started_at is
  'When the current recalculation started. With recalc_pending, tells "Updating…" from a stalled run.';

alter table public.recipes drop constraint if exists recipes_recalc_pending_known;
alter table public.recipes add constraint recipes_recalc_pending_known check (
  recalc_pending <@ array[
    'calories', 'estimated_time_minutes', 'effort_level', 'cost_estimate', 'tags', 'appliances',
    'ingredient_amounts'
  ]::text[]
);
