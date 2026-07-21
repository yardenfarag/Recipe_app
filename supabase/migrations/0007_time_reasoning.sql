-- Track Gemini chain-of-thought for the total-time estimate.

alter table public.recipes
  add column time_reasoning text;

comment on column public.recipes.time_reasoning is
  'Gemini chain-of-thought for the time estimate (internal QA, not shown in MVP UI).';
