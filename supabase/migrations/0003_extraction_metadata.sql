-- Track where extraction succeeded and how calories were estimated.

alter table public.recipes
  add column extraction_source text
    check (extraction_source in ('description', 'comments', 'captions', 'video'));

alter table public.recipes
  add column calories_reasoning text;

comment on column public.recipes.extraction_source is
  'Content ladder rung that yielded the recipe: description, comments, captions, or video.';

comment on column public.recipes.calories_reasoning is
  'Gemini chain-of-thought for the calorie estimate (internal QA, not shown in MVP UI).';
