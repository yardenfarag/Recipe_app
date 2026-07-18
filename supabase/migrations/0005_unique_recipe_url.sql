-- Prevent duplicate saves of the same source URL per user (guest migration safety net).

create unique index recipes_user_original_url_unique
  on public.recipes (user_id, original_url)
  where original_url is not null;

comment on index recipes_user_original_url_unique is
  'One saved recipe per source URL per user — avoids duplicate inserts on guest migration retry.';
