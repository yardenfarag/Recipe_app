-- Photo Snap: recipes extracted from a camera / library image (no source URL).

alter table public.recipes
  drop constraint if exists recipes_platform_check;

alter table public.recipes
  add constraint recipes_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'web', 'photo', 'unknown'));

alter table public.recipes
  drop constraint if exists recipes_extraction_source_check;

alter table public.recipes
  add constraint recipes_extraction_source_check
  check (
    extraction_source is null
    or extraction_source in ('description', 'comments', 'captions', 'video', 'web', 'photo')
  );
