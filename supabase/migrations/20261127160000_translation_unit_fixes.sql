-- PIN-77: repairs two unit mistakes in translations already saved (the code that made them is fixed alongside):
--   * A name that starts with its own unit: unit שיני + name "שיני שום כתושות" read "2 שיני שיני שום כתושות".
--     The unit is dropped from the name: "2 שיני שום כתושות".
--   * Russian пачка (a pack) was read as the US stick, both ways: "1/3 пачки макарон" became "1/3 stick pasta", and a
--     stick (cinnamon, butter) became пачка. Now a pack is a package and a Russian stick is палочка.
-- Data only, in recipe_card_translations and recipe_translations; rows that need nothing are left alone.

create function pg_temp.fixed_translated_ingredient(p_ing jsonb, p_source_unit text, p_language text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_unit text := coalesce(p_ing->>'unit', '');
  v_name text := coalesce(p_ing->>'name', '');
  v_source text := lower(btrim(coalesce(p_source_unit, '')));
  v_trimmed text;
  v_rest text;
begin
  if jsonb_typeof(p_ing) <> 'object' then
    return p_ing;
  end if;

  if p_language = 'ru' and v_source in ('stick', 'sticks') then
    v_unit := case v_unit when 'пачка' then 'палочка' when 'пачки' then 'палочки' when 'пачек' then 'палочек' else v_unit end;
  elsif p_language <> 'ru' and v_source in ('пачка', 'пачки', 'пачек') then
    v_unit := case v_unit
      when 'stick' then 'package' when 'sticks' then 'packages'
      when 'מקל' then 'אריזה' when 'מקלות' then 'אריזות'
      when 'barra' then 'paquete' when 'barras' then 'paquetes'
      when 'عصا' then 'عبوة' when 'عصي' then 'عبوات'
      else v_unit end;
  end if;

  v_trimmed := btrim(v_unit);
  if v_trimmed <> '' and left(lower(v_name), length(v_trimmed) + 1) = lower(v_trimmed) || ' ' then
    v_rest := btrim(substr(v_name, length(v_trimmed) + 2));
    if v_rest <> '' then
      v_name := v_rest;
    end if;
  end if;

  if v_unit = coalesce(p_ing->>'unit', '') and v_name = coalesce(p_ing->>'name', '') then
    return p_ing;
  end if;
  return p_ing || jsonb_build_object('unit', v_unit, 'name', v_name);
end;
$$;

with fixed as (
  select t.card_id, t.language_code,
    jsonb_agg(pg_temp.fixed_translated_ingredient(e.ing, c.ingredients -> (e.ord::int - 1) ->> 'unit', t.language_code)
      order by e.ord) as ingredients
  from public.recipe_card_translations t
  join public.recipe_cards c on c.id = t.card_id
  cross join lateral jsonb_array_elements(t.ingredients) with ordinality as e(ing, ord)
  where jsonb_typeof(t.ingredients) = 'array'
  group by t.card_id, t.language_code
)
update public.recipe_card_translations t
set ingredients = fixed.ingredients
from fixed
where t.card_id = fixed.card_id
  and t.language_code = fixed.language_code
  and t.ingredients is distinct from fixed.ingredients;

with fixed as (
  select t.recipe_id, t.language_code,
    jsonb_agg(pg_temp.fixed_translated_ingredient(e.ing, r.ingredients -> (e.ord::int - 1) ->> 'unit', t.language_code)
      order by e.ord) as ingredients
  from public.recipe_translations t
  join public.recipes r on r.id = t.recipe_id
  cross join lateral jsonb_array_elements(t.ingredients) with ordinality as e(ing, ord)
  where jsonb_typeof(t.ingredients) = 'array'
  group by t.recipe_id, t.language_code
)
update public.recipe_translations t
set ingredients = fixed.ingredients
from fixed
where t.recipe_id = fixed.recipe_id
  and t.language_code = fixed.language_code
  and t.ingredients is distinct from fixed.ingredients;
