-- Account deletion and share links leave personal data behind (PIN-54).

-- Deleting the auth user cascades through profiles, but these tables only set
-- user_id to null (or have no foreign key), so emails, messages, device
-- details and install ids outlived the account. delete-account calls this just
-- before deleting the auth user. Cost rows in ai_usage_events are kept for
-- totals, without the user, install id, URLs or error text.
create or replace function public.erase_user_personal_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  install_ids text[];
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  -- Install ids this user signed in on, so their guest-era rows go too.
  select coalesce(array_agg(distinct id), '{}') into install_ids
  from (
    select guest_install_id as id from public.product_events
    where user_id = p_user_id and guest_install_id is not null
    union
    select guest_install_id from public.ai_usage_events
    where user_id = p_user_id and guest_install_id is not null
  ) ids;

  delete from public.support_tickets where user_id = p_user_id;
  delete from public.feedback where user_id = p_user_id;
  delete from public.product_events
  where user_id = p_user_id or guest_install_id = any(install_ids);
  delete from public.purchase_webhook_failures where app_user_id = p_user_id::text;

  update public.ai_usage_events
  set user_id = null,
      guest_install_id = null,
      metadata = '{}'::jsonb,
      error_message = null
  where user_id = p_user_id or guest_install_id = any(install_ids);

  -- guest_usage and the other guest_* counters stay: they hold only an install
  -- id, and wiping them would hand the device fresh free quota.
end;
$$;

revoke all on function public.erase_user_personal_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_personal_data(uuid) to service_role;

-- Deleting a recipe set recipe_shares.source_recipe_id to null but left the
-- snapshot (and any Snap photo) public forever. Revoke its links first.
create or replace function public.revoke_shares_on_recipe_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recipe_shares
  set revoked_at = now()
  where source_recipe_id = old.id
    and revoked_at is null;
  return old;
end;
$$;

revoke all on function public.revoke_shares_on_recipe_delete() from public, anon, authenticated;

drop trigger if exists revoke_shares_on_recipe_delete on public.recipes;
create trigger revoke_shares_on_recipe_delete
  before delete on public.recipes
  for each row execute function public.revoke_shares_on_recipe_delete();
