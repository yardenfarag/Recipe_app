# Translation quality eval (PIN-53)

Run 2026-11-26T20:47Z · translate model: `openai/gpt-6-luna` · served: openai/gpt-6-luna · 1 run(s) × 25 cases · translate cost $0.0068 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2536 · median 3394 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 25 | 0 | 99% | 92% | 4.20 | 2.44 | 92% |
| he | 10 | 0 | 99% | 80% | 4.20 | 2.50 | 90% |
| ar | 4 | 0 | 100% | 100% | 4.00 | 3.00 | 100% |
| ru | 4 | 0 | 100% | 100% | 3.75 | 3.25 | 75% |
| es | 3 | 0 | 100% | 100% | 4.67 | 2.33 | 100% |
| en | 4 | 0 | 100% | 100% | 4.50 | 1.00 | 100% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 0 / 53 |
| `expect:ing` | 1 / 43 |
| `expect:line` | 1 / 1 |
| `expect:steps` | 0 / 8 |
| `expect:title` | 0 / 1 |
| `forbid:all` | 0 / 3 |
| `forbid:amount` | 0 / 6 |
| `forbid:ing` | 0 / 3 |
| `forbid:steps` | 0 / 4 |
| `forbid:title` | 0 / 1 |
| `ru_capitalized` | 0 / 23 |
| `unit_in_name` | 1 / 132 |
| `untranslated` | 0 / 292 |
| `voice_mixed` | 0 / 10 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| grammar | 2 | 28 | he, ar, ru, es, en |
| ingredient_term | 0 | 10 | he, ar |
| meaning | 0 | 5 | he, ar, ru, en |
| cooking_verb | 0 | 3 | he, ar |
| unit | 0 | 2 | ru, en |
| style_consistency | 0 | 2 | ru, en |
| untranslated | 0 | 1 | ar |

## Stability across runs

n/a (single run)

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 5/5, 0 errors | – |
| he-unit-is-noun | – | 4/5, 1 errors | – |
| he-from-fr | – | 4/5, 3 errors | – |
| he-from-tr | expect:ing@ing:6 (גבינת קשאר מגוררת ≠ קשקבל / צהובה) | 4/5, 3 errors | – |
| he-from-de | – | 5/5, 1 errors | – |
| he-glossary-baking | – | 4/5, 3 errors | – |
| he-cooking-verbs | unit_in_name@line:4 (2 שיני שיני שום כתושות); expect:line@line:4 (2 שיני שיני שום כתושות ≠ 2 שיני שום) | 4/5, 2 errors | grammar: 2 שיני שיני שום כתושות |
| he-mixed-source | – | 4/5, 3 errors | – |
| he-taste-phrases | – | 4/5, 4 errors | – |
| he-from-es | – | 4/5, 1 errors | – |
| ar-fractions-temp | – | 4/5, 3 errors | – |
| ar-glossary | – | 4/5, 3 errors | – |
| ar-from-he | – | 4/5, 3 errors | – |
| ar-brands | – | 4/5, 3 errors | – |
| ru-genitive | – | 4/5, 1 errors | – |
| ru-imperial-temp | – | 4/5, 2 errors | grammar: 1 непечёной основы |
| ru-appliances | – | 4/5, 1 errors | – |
| ru-from-he | – | 3/5, 5 errors | – |
| es-fractions-temp | – | 4/5, 7 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | 5/5, 0 errors | – |
| en-from-he-units | – | 4/5, 1 errors | – |
| en-from-he-terms | – | 5/5, 0 errors | – |
| en-from-fr | – | 4/5, 3 errors | – |
| en-from-tr | – | 5/5, 0 errors | – |
