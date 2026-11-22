-- Which translator made each cached translation (PIN-53).
--
-- translation_version is TRANSLATION_VERSION from supabase/functions/_shared/recipes/translateRecipe.ts at the time
-- the row was written. NULL means "before PIN-53": every row saved before this migration, and any row an app build
-- from before PIN-53 writes. The app treats a NULL or lower version as a cache miss and translates again on open;
-- the admin function backfill-translations redoes the backlog in batches (dry run first).
--
-- Add-only and safe for app builds already in the stores: the column is nullable with no default, and old builds
-- never send it. Row level security is unchanged (the owner's policies cover every column).

alter table public.recipe_translations add column if not exists translation_version integer;

alter table public.recipe_translations drop constraint if exists recipe_translations_version_range;
alter table public.recipe_translations add constraint recipe_translations_version_range check (
  translation_version is null or translation_version between 1 and 1000
) not valid;
alter table public.recipe_translations validate constraint recipe_translations_version_range;

comment on column public.recipe_translations.translation_version is
  'TRANSLATION_VERSION of the translator that wrote this row (PIN-53). NULL = before PIN-53; translated again on open.';
