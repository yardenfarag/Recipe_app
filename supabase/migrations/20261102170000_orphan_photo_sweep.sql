-- Delete Snap photos nothing uses anymore (PIN-54). Deleting a recipe left its
-- photo public in recipe-thumbnails forever. Storage files can only be removed
-- through the Storage API, so a daily cron job calls the sweep-orphan-photos
-- Edge Function, which asks orphan_photo_paths() what to delete.

create extension if not exists pg_net;

-- A random shared secret the cron job sends and the function checks. It lives
-- only in Vault, so there is nothing to configure by hand.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'photo_sweep_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'photo_sweep_secret',
      'Shared secret between the photo sweep cron job and sweep-orphan-photos'
    );
  end if;
end;
$$;

create or replace function public.photo_sweep_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select decrypted_secret = p_secret
     from vault.decrypted_secrets
     where name = 'photo_sweep_secret'),
    false
  );
$$;

-- photo/ objects older than a day (so an extraction the user hasn't saved yet
-- keeps its photo) that no recipe or share snapshot points at. Claimed shares
-- copy the URL into the claimer's recipe, so they count as references too.
create or replace function public.orphan_photo_paths(p_limit int default 500)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with referenced as (
    select substring(image_url from '/recipe-thumbnails/(photo/[^?]+)') as name
    from public.recipes
    where image_url like '%/recipe-thumbnails/photo/%'
    union
    select substring(snapshot->>'image_url' from '/recipe-thumbnails/(photo/[^?]+)')
    from public.recipe_shares
    where snapshot->>'image_url' like '%/recipe-thumbnails/photo/%'
  )
  select o.name
  from storage.objects o
  where o.bucket_id = 'recipe-thumbnails'
    and o.name like 'photo/%'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from referenced r where r.name = o.name)
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.photo_sweep_secret_matches(text) from public, anon, authenticated;
revoke all on function public.orphan_photo_paths(int) from public, anon, authenticated;
grant execute on function public.photo_sweep_secret_matches(text) to service_role;
grant execute on function public.orphan_photo_paths(int) to service_role;

-- The URL is production's. A local stack's job reaches production with the
-- local secret, which production rejects.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-sweep-orphan-photos') then
    perform cron.unschedule('pinch-sweep-orphan-photos');
  end if;
  perform cron.schedule(
    'pinch-sweep-orphan-photos',
    '41 3 * * *',
    $job$
      select net.http_post(
        url := 'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/sweep-orphan-photos',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sweep-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'photo_sweep_secret')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$schedule$;
