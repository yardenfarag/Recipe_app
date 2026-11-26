# Translation quality eval (PIN-53)

Run 2026-11-26T20:45Z · translate model: `openai/gpt-6-luna` · served: openai/gpt-6-luna · 1 run(s) × 25 cases · translate cost $0.0086 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2513 · median 3552 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 25 | 0 | 99% | 80% | 4.32 | 2.84 | 80% |
| he | 10 | 0 | 97% | 50% | 4.30 | 3.20 | 70% |
| ar | 4 | 0 | 100% | 100% | 4.00 | 3.75 | 100% |
| ru | 4 | 0 | 100% | 100% | 4.25 | 4.00 | 50% |
| es | 3 | 0 | 100% | 100% | 4.33 | 2.33 | 100% |
| en | 4 | 0 | 100% | 100% | 4.75 | 0.25 | 100% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 0 / 53 |
| `expect:ing` | 2 / 43 |
| `expect:line` | 1 / 1 |
| `expect:steps` | 0 / 8 |
| `expect:title` | 0 / 1 |
| `forbid:all` | 0 / 3 |
| `forbid:amount` | 0 / 6 |
| `forbid:ing` | 0 / 3 |
| `forbid:steps` | 0 / 4 |
| `forbid:title` | 0 / 1 |
| `ru_capitalized` | 0 / 23 |
| `unit_in_name` | 3 / 132 |
| `untranslated` | 0 / 292 |
| `voice_mixed` | 0 / 10 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| grammar | 3 | 22 | he, ar, ru, es, en |
| meaning | 2 | 5 | he, ar, ru |
| ingredient_term | 1 | 6 | he, ar, es |
| cooking_verb | 0 | 4 | ar, es |
| unit | 0 | 2 | he, ru |
| other | 0 | 1 | ar |
| untranslated | 0 | 1 | ar |

## Stability across runs

n/a (single run)

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 5/5, 0 errors | – |
| he-unit-is-noun | – | 5/5, 0 errors | – |
| he-from-fr | unit_in_name@line:7 (לפי הטעם אגוזי לוז קצוצים לפי הטעם) | 4/5, 2 errors | grammar: לפי הטעם אגוזי לוז קצוצים לפי הטעם |
| he-from-tr | expect:ing@ing:6 (גבינת קשאר מגוררת ≠ קשקבל / צהובה) | 4/5, 2 errors | – |
| he-from-de | unit_in_name@line:6 (לפי הטעם אבקת סוכר לפי הטעם) | 4/5, 1 errors | – |
| he-glossary-baking | expect:ing@ing:7 (שוקולד מריר קצוץ ≠ שוקולד צ'יפס / שוקולד ציפס / שבבי שוקולד) | 4/5, 3 errors | ingredient_term: שוקולד מריר קצוץ |
| he-cooking-verbs | unit_in_name@line:4 (2 שיני שיני שום כתושות); expect:line@line:4 (2 שיני שיני שום כתושות ≠ 2 שיני שום) | 5/5, 1 errors | – |
| he-mixed-source | – | 4/5, 3 errors | – |
| he-taste-phrases | – | 3/5, 4 errors | grammar: 1 לטיגון שמן ניטרלי; grammar: 1 לציפוי סוכר |
| he-from-es | – | 5/5, 0 errors | – |
| ar-fractions-temp | – | 4/5, 3 errors | – |
| ar-glossary | – | 4/5, 3 errors | – |
| ar-from-he | – | 4/5, 4 errors | – |
| ar-brands | – | 4/5, 5 errors | – |
| ru-genitive | – | 5/5, 0 errors | – |
| ru-imperial-temp | – | 4/5, 2 errors | meaning: 1 9-дюймовой основы для пирога без выпечки |
| ru-appliances | – | 4/5, 2 errors | meaning: а середина не останется жидкой |
| ru-from-he | – | 4/5, 4 errors | – |
| es-fractions-temp | – | 4/5, 6 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | 4/5, 1 errors | – |
| en-from-he-units | – | 5/5, 0 errors | – |
| en-from-he-terms | – | 5/5, 0 errors | – |
| en-from-fr | – | 4/5, 1 errors | – |
| en-from-tr | – | 5/5, 0 errors | – |
