-- Recipes whose text is clearly in another language than `source_language` says get the right label (PIN-187).
--
-- On mobile, a swap or remix made on a translation saved the translated text as the recipe's own without changing
-- `source_language`; older extractions mislabelled a few too (PIN-53). The app now saves the language with the
-- text, so this is a one-time cleanup. Checked against production on 2026-11-24: 16 of about 208 recipes.
--
-- The test is the one translate-recipe uses to tell that a recipe is already in a language (`recipeAlreadyInLanguage`
-- in supabase/functions/_shared/recipes/translateRecipe.ts), so a label is only changed when the text is clear:
--   * Hebrew, Arabic or Russian: nine letters in ten are in that script.
--   * English, Spanish, German or French: no letter of those scripts, at least four of the language's common
--     cooking words, and three times as many as any of the other three languages has.
-- Anything else (short recipes, mixed languages, languages not listed) keeps its label.
--
-- Data only: no column or function changes. Old app builds read the label the same way.

with recipe_text as (
  select
    r.id,
    coalesce(nullif(split_part(split_part(lower(trim(r.source_language)), '-', 1), '_', 1), ''), 'en') as label,
    lower(
      coalesce(r.title, '') || ' ' ||
      coalesce((
        select string_agg(coalesce(i ->> 'unit', '') || ' ' || coalesce(i ->> 'name', ''), ' ')
        from jsonb_array_elements(case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end) as i
      ), '') || ' ' ||
      coalesce((
        select string_agg(coalesce(s ->> 'text', ''), ' ')
        from jsonb_array_elements(case when jsonb_typeof(r.instructions) = 'array' then r.instructions else '[]'::jsonb end) as s
      ), '')
    ) as txt
  from public.recipes r
),
counted as (
  select
    id,
    label,
    length(regexp_replace(txt, '[^[:alpha:]]', '', 'g')) as letters,
    length(regexp_replace(txt, '[^֐-׿]', '', 'g')) as he,
    length(regexp_replace(txt, '[^؀-ۿ]', '', 'g')) as ar,
    length(regexp_replace(txt, '[^Ѐ-ӿ]', '', 'g')) as ru,
    regexp_count(txt, '\m(the|and|with|until|minutes|add|mix|bake|into|cup|cups|tablespoons?|teaspoons?|preheat|stir|heat)\M') as en,
    regexp_count(txt, '\m(el|la|los|las|con|hasta|minutos|añade|añadir|mezcla|hornea|taza|cucharada|cucharadita|precalienta)\M') as es,
    regexp_count(txt, '\m(und|mit|bis|minuten|den|die|das|backen|hinzufügen|esslöffel|teelöffel)\M') as de,
    regexp_count(txt, '\m(et|avec|jusqu|ajoutez|mélangez|cuillère|four|faites)\M') as fr
  from recipe_text
),
detected as (
  select
    id,
    label,
    case
      when letters < 20 then null
      when he::numeric / letters >= 0.9 then 'he'
      when ar::numeric / letters >= 0.9 then 'ar'
      when ru::numeric / letters >= 0.9 then 'ru'
      when he + ar + ru > 0 then null
      when en >= 4 and en >= 3 * greatest(es, de, fr) then 'en'
      when es >= 4 and es >= 3 * greatest(en, de, fr) then 'es'
      when de >= 4 and de >= 3 * greatest(en, es, fr) then 'de'
      when fr >= 4 and fr >= 3 * greatest(en, es, de) then 'fr'
      else null
    end as language
  from counted
)
update public.recipes r
set source_language = d.language
from detected d
where d.id = r.id
  and d.language is not null
  and d.language <> d.label;
