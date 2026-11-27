# Translation quality eval (PIN-53)

Run 2026-11-26T20:48Z · translate model: `openai/gpt-6.2-sol` · served: openai/gpt-6.2-sol · 1 run(s) × 25 cases · translate cost $0.1282 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2489 · median 5704 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 25 | 0 | 100% | 96% | 4.60 | 1.80 | 96% |
| he | 10 | 0 | 100% | 90% | 4.70 | 1.30 | 100% |
| ar | 4 | 0 | 100% | 100% | 4.50 | 3.00 | 100% |
| ru | 4 | 0 | 100% | 100% | 4.50 | 1.75 | 75% |
| es | 3 | 0 | 100% | 100% | 4.33 | 3.67 | 100% |
| en | 4 | 0 | 100% | 100% | 4.75 | 0.50 | 100% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 0 / 53 |
| `expect:ing` | 1 / 43 |
| `expect:line` | 0 / 1 |
| `expect:steps` | 0 / 8 |
| `expect:title` | 0 / 1 |
| `forbid:all` | 0 / 3 |
| `forbid:amount` | 0 / 6 |
| `forbid:ing` | 0 / 3 |
| `forbid:steps` | 0 / 4 |
| `forbid:title` | 0 / 1 |
| `ru_capitalized` | 0 / 23 |
| `unit_in_name` | 0 / 133 |
| `untranslated` | 0 / 292 |
| `voice_mixed` | 0 / 10 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| grammar | 0 | 23 | he, ar, ru, es |
| meaning | 1 | 3 | he, ar, ru |
| ingredient_term | 0 | 6 | he, ar, es |
| cooking_verb | 0 | 3 | he, ar |
| unit | 0 | 3 | ar, ru, en |
| style_consistency | 0 | 2 | ar, en |

## Stability across runs

n/a (single run)

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 5/5, 0 errors | – |
| he-unit-is-noun | – | 5/5, 0 errors | – |
| he-from-fr | – | 4/5, 2 errors | – |
| he-from-tr | expect:ing@ing:6 (גבינת קשאר מגוררת ≠ קשקבל / צהובה) | 4/5, 2 errors | – |
| he-from-de | – | 5/5, 1 errors | – |
| he-glossary-baking | – | 5/5, 2 errors | – |
| he-cooking-verbs | – | 5/5, 1 errors | – |
| he-mixed-source | – | 5/5, 0 errors | – |
| he-taste-phrases | – | 4/5, 5 errors | – |
| he-from-es | – | 5/5, 0 errors | – |
| ar-fractions-temp | – | 4/5, 3 errors | – |
| ar-glossary | – | 4/5, 4 errors | – |
| ar-from-he | – | 5/5, 2 errors | – |
| ar-brands | – | 5/5, 3 errors | – |
| ru-genitive | – | 5/5, 0 errors | – |
| ru-imperial-temp | – | 4/5, 1 errors | – |
| ru-appliances | – | 5/5, 0 errors | – |
| ru-from-he | – | 4/5, 2 errors | meaning: масла |
| es-fractions-temp | – | 4/5, 7 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | 4/5, 4 errors | – |
| en-from-he-units | – | 5/5, 0 errors | – |
| en-from-he-terms | – | 5/5, 0 errors | – |
| en-from-fr | – | 4/5, 2 errors | – |
| en-from-tr | – | 5/5, 0 errors | – |
