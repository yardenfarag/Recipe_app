# Translation quality eval (PIN-53)

Run 2026-11-22T05:04Z · translate model: production default (`TASK_MODELS.translate`) · served: openai/gpt-6.1-sol · 2 run(s) × 25 cases · translate cost $0.2673 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.1093 · median 4140 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 50 | 0 | 100% | 96% | 4.67 | 1.42 | 83% |
| he | 20 | 0 | 100% | 100% | 4.75 | 1.25 | 75% |
| ar | 8 | 0 | 100% | 100% | 4.00 | 2.50 | 100% |
| ru | 8 | 0 | 100% | 100% | 5.00 | 0.50 | 100% |
| es | 6 | 0 | 100% | 100% | 5.00 | 0.00 | 100% |
| en | 8 | 0 | 99% | 75% | 4.50 | 3.00 | 50% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 2 / 106 |
| `expect:ing` | 0 / 86 |
| `expect:line` | 0 / 2 |
| `expect:steps` | 0 / 16 |
| `expect:title` | 0 / 2 |
| `forbid:all` | 0 / 6 |
| `forbid:amount` | 0 / 12 |
| `forbid:ing` | 0 / 6 |
| `forbid:steps` | 0 / 8 |
| `forbid:title` | 0 / 2 |
| `ru_capitalized` | 0 / 46 |
| `unit_in_name` | 0 / 264 |
| `untranslated` | 0 / 584 |
| `voice_mixed` | 0 / 20 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| cooking_verb | 1 | 1 | he, ar |
| grammar | 0 | 5 | ar, en |
| meaning | 1 | 0 | en |
| unit | 0 | 1 | ru |

## Stability across runs

Same title in 20/25 recipes · same ingredient name in 164/169 lines (97%) · same Hebrew step voice in 10/10 Hebrew recipes.

| Case | Title | Ingredient names identical | Hebrew voice per run |
|---|---|---|---|
| he-fractions-temp | עוגת לימון בחושה בזיגוג לימון ⟷ עוגת לימון בציפוי זיגוג לימון | 7/7 | present / present |
| he-unit-is-noun | כרוב צלוי בטחינה ⟷ כרוב צלוי עם טחינה | 7/7 | present / present |
| he-from-fr | same | 6/7 | present / present |
| he-glossary-baking | same | 7/8 | present / present |
| he-taste-phrases | כדורי סופגניות בציפוי סוכר ⟷ כדורי סופגנייה בציפוי סוכר | 7/7 | present / present |
| ar-glossary | دجاج مقلي بتتبيلة اللبن الرائب ⟷ دجاج مقلي باللبن الرائب | 7/7 | – |
| ar-brands | كاسات تشيز كيك كيندر بوينو ⟷ أكواب تشيز كيك كيندر بوينو | 6/6 | – |
| ru-imperial-temp | same | 5/6 | – |
| es-from-he | same | 5/6 | – |
| en-from-fr | same | 7/8 | – |

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 5/5, 0 errors | – |
| he-unit-is-noun | – | 5/5, 0 errors | – |
| he-from-fr | – | – | – |
| he-from-tr | – | 5/5, 0 errors | – |
| he-from-de | – | – | – |
| he-glossary-baking | – | – | – |
| he-cooking-verbs | – | 4/5, 1 errors | cooking_verb: מסירים את הצריבה מהתחתית בעזרת היין |
| he-mixed-source | – | – | – |
| he-taste-phrases | – | – | – |
| he-from-es | – | – | – |
| ar-fractions-temp | – | 4/5, 1 errors | – |
| ar-glossary | – | – | – |
| ar-from-he | – | 4/5, 4 errors | – |
| ar-brands | – | – | – |
| ru-genitive | – | 5/5, 0 errors | – |
| ru-imperial-temp | – | 5/5, 1 errors | – |
| ru-appliances | – | – | – |
| ru-from-he | – | – | – |
| es-fractions-temp | – | 5/5, 0 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | – | – |
| en-from-he-units | – | 5/5, 0 errors | – |
| en-from-he-terms | – | – | – |
| en-from-fr | – | 4/5, 2 errors | meaning: ½ lime juice |
| en-from-tr | expect:amount@amount:6 (1 package ≠ packet / sachet / pack / envelope) | – | – |
