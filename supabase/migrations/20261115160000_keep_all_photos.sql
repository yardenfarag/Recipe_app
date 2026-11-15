-- Keep every Snap and Guess photo (reverses the PIN-54 sweep). Photos no recipe
-- uses, from failed or unsaved extractions and from deleted recipes, now stay in
-- recipe-thumbnails. Only delete-account removes a user's photo/<user id>/ files.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-sweep-orphan-photos') then
    perform cron.unschedule('pinch-sweep-orphan-photos');
  end if;
end;
$$;

drop function if exists public.orphan_photo_paths(int);
drop function if exists public.photo_sweep_secret_matches(text);

delete from vault.secrets where name = 'photo_sweep_secret';
