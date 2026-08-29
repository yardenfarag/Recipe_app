-- One extracted recipe and one invented recipe may share a source URL.
-- Duplicate extracts (or duplicate invents) of the same URL stay blocked.

drop index if exists public.recipes_user_original_url_unique;

create unique index recipes_user_original_url_origin_unique
  on public.recipes (
    user_id,
    original_url,
    (extraction_source is not distinct from 'invented')
  )
  where original_url is not null;

comment on index public.recipes_user_original_url_origin_unique is
  'One extracted and one invented recipe per source URL per user.';
