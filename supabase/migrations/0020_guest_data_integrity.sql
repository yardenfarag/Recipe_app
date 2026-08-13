-- Atomically append a guest shopping list without replacing existing cloud rows.

create or replace function public.migrate_guest_shopping_list(p_user_id uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not match migration owner.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Shopping list payload must be an array.';
  end if;

  insert into public.shopping_list_items (
    user_id,
    name,
    quantity,
    unit,
    checked,
    source_recipe_ids,
    created_at,
    updated_at
  )
  select
    p_user_id,
    item.name,
    item.quantity,
    item.unit,
    coalesce(item.checked, false),
    item.source_recipe_ids,
    coalesce(item.created_at, now()),
    coalesce(item.updated_at, now())
  from jsonb_to_recordset(p_items) as item(
    name text,
    quantity numeric,
    unit text,
    checked boolean,
    source_recipe_ids text[],
    created_at timestamptz,
    updated_at timestamptz
  )
  where char_length(trim(item.name)) > 0;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.migrate_guest_shopping_list(uuid, jsonb) from public;
grant execute on function public.migrate_guest_shopping_list(uuid, jsonb) to authenticated;
