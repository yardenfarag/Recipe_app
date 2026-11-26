# Translation quality eval (PIN-53)

Run 2026-11-26T20:45Z · translate model: `qwen/qwen4-max` · served: qwen/qwen4-max · 1 run(s) × 25 cases · translate cost $0.1092 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2530 · median 8199 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 25 | 0 | 100% | 96% | 4.40 | 2.56 | 88% |
| he | 10 | 0 | 99% | 90% | 4.50 | 2.60 | 80% |
| ar | 4 | 0 | 100% | 100% | 4.00 | 4.25 | 75% |
| ru | 4 | 0 | 100% | 100% | 4.25 | 1.25 | 100% |
| es | 3 | 0 | 100% | 100% | 4.33 | 4.00 | 100% |
| en | 4 | 0 | 100% | 100% | 4.75 | 1.00 | 100% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 0 / 53 |
| `expect:ing` | 0 / 43 |
| `expect:line` | 1 / 1 |
| `expect:steps` | 0 / 8 |
| `expect:title` | 0 / 1 |
| `forbid:all` | 0 / 3 |
| `forbid:amount` | 0 / 6 |
| `forbid:ing` | 0 / 3 |
| `forbid:steps` | 0 / 4 |
| `forbid:title` | 0 / 1 |
| `ru_capitalized` | 0 / 23 |
| `unit_in_name` | 1 / 133 |
| `untranslated` | 0 / 292 |
| `voice_mixed` | 0 / 10 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| grammar | 2 | 30 | he, ar, ru, es, en |
| ingredient_term | 2 | 1 | he, ru |
| cooking_verb | 0 | 5 | he, ar, ru |
| unit | 0 | 3 | he, ar, ru |
| style_consistency | 0 | 3 | he, ar, en |
| meaning | 0 | 2 | ar, ru |

## Stability across runs

n/a (single run)

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 5/5, 0 errors | – |
| he-unit-is-noun | – | 4/5, 1 errors | – |
| he-from-fr | – | 4/5, 3 errors | ingredient_term: מל; ingredient_term: והמל |
| he-from-tr | – | 5/5, 0 errors | – |
| he-from-de | – | 5/5, 1 errors | – |
| he-glossary-baking | – | 5/5, 1 errors | – |
| he-cooking-verbs | unit_in_name@line:4 (2 שיני שיני שום כתושות); expect:line@line:4 (2 שיני שיני שום כתושות ≠ 2 שיני שום) | 4/5, 3 errors | grammar: שיני שיני |
| he-mixed-source | – | 4/5, 1 errors | – |
| he-taste-phrases | – | 4/5, 4 errors | – |
| he-from-es | – | 5/5, 0 errors | – |
| ar-fractions-temp | – | 4/5, 1 errors | – |
| ar-glossary | – | 4/5, 4 errors | grammar: عنه |
| ar-from-he | – | 4/5, 4 errors | – |
| ar-brands | – | 4/5, 4 errors | – |
| ru-genitive | – | 5/5, 0 errors | – |
| ru-imperial-temp | – | 4/5, 1 errors | – |
| ru-appliances | – | 4/5, 2 errors | – |
| ru-from-he | – | 4/5, 2 errors | – |
| es-fractions-temp | – | 4/5, 7 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | 4/5, 5 errors | – |
| en-from-he-units | – | 5/5, 0 errors | – |
| en-from-he-terms | – | 5/5, 2 errors | – |
| en-from-fr | – | 4/5, 2 errors | – |
| en-from-tr | – | 5/5, 0 errors | – |
