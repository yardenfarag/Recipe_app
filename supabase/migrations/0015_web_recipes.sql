-- Web recipe URLs (paste / share from browser) + optional cook-along video.

alter table public.recipes
  drop constraint if exists recipes_platform_check;

alter table public.recipes
  add constraint recipes_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'web', 'unknown'));

alter table public.recipes
  drop constraint if exists recipes_extraction_source_check;

alter table public.recipes
  add constraint recipes_extraction_source_check
  check (
    extraction_source is null
    or extraction_source in ('description', 'comments', 'captions', 'video', 'web')
  );

alter table public.recipes
  add column if not exists source_video_url text;

comment on column public.recipes.source_video_url is
  'Optional playable video URL found on a web recipe page (e.g. YouTube embed) for cook-along.';
