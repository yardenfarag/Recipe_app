# Translation quality eval (PIN-53)

Run 2026-11-26T20:45Z · translate model: `anthropic/claude-haiku-5.5` · served: anthropic/claude-haiku-5.5 · 1 run(s) × 25 cases · translate cost $0.0138 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2795 · median 3240 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 25 | 0 | 99% | 84% | 4.00 | 5.60 | 44% |
| he | 10 | 0 | 99% | 80% | 3.70 | 5.50 | 50% |
| ar | 4 | 0 | 98% | 75% | 3.75 | 7.25 | 25% |
| ru | 4 | 0 | 99% | 75% | 4.00 | 8.25 | 0% |
| es | 3 | 0 | 100% | 100% | 4.33 | 5.67 | 67% |
| en | 4 | 0 | 100% | 100% | 4.75 | 1.50 | 75% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 0 / 53 |
| `expect:ing` | 1 / 43 |
| `expect:line` | 1 / 1 |
| `expect:steps` | 0 / 8 |
| `expect:title` | 1 / 1 |
| `forbid:all` | 0 / 3 |
| `forbid:amount` | 0 / 6 |
| `forbid:ing` | 0 / 3 |
| `forbid:steps` | 0 / 4 |
| `forbid:title` | 0 / 1 |
| `ru_capitalized` | 0 / 23 |
| `unit_in_name` | 1 / 132 |
| `untranslated` | 2 / 292 |
| `voice_mixed` | 0 / 10 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| grammar | 4 | 29 | he, ar, ru, es, en |
| cooking_verb | 5 | 16 | he, ar, ru, es |
| meaning | 5 | 5 | he, ar, ru, en |
| ingredient_term | 1 | 6 | he, es |
| untranslated | 1 | 0 | ar |
| style_consistency | 0 | 3 | he |
| unit | 0 | 1 | ru |

## Stability across runs

n/a (single run)

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | – | 4/5, 3 errors | – |
| he-unit-is-noun | – | 4/5, 2 errors | grammar: מסוחט |
| he-from-fr | – | 3/5, 5 errors | cooking_verb: מפשירים |
| he-from-tr | – | 4/5, 2 errors | – |
| he-from-de | – | 3/5, 5 errors | meaning: טרטיות |
| he-glossary-baking | expect:ing@ing:7 (שוקולד מריר צ׳יפס ≠ שוקולד צ'יפס / שוקולד ציפס / שבבי שוקולד) | 4/5, 6 errors | – |
| he-cooking-verbs | unit_in_name@line:4 (2 שיני שיני שום כתושות); expect:line@line:4 (2 שיני שיני שום כתושות ≠ 2 שיני שום) | 3/5, 4 errors | cooking_verb: מזכירים את המחבת עם היין |
| he-mixed-source | – | 4/5, 3 errors | grammar: וטוגנים |
| he-taste-phrases | – | 4/5, 2 errors | – |
| he-from-es | – | 4/5, 3 errors | – |
| ar-fractions-temp | – | 4/5, 2 errors | – |
| ar-glossary | – | 4/5, 1 errors | meaning: طبق عميق |
| ar-from-he | untranslated@title (akshouka); expect:title@title (شakshouka ≠ شكشوكة / شكشوك) | 3/5, 4 errors | untranslated: شakshouka |
| ar-brands | – | 4/5, 6 errors | grammar: لوح ألواح; cooking_verb: انثر |
| ru-genitive | – | 4/5, 3 errors | cooking_verb: влейте молоко, затем муку |
| ru-imperial-temp | – | 4/5, 4 errors | grammar: 1 коржа; meaning: без выпечки |
| ru-appliances | untranslated@step:1 (op) | 4/5, 3 errors | cooking_verb: Растopите |
| ru-from-he | – | 4/5, 3 errors | meaning: масла |
| es-fractions-temp | – | 4/5, 8 errors | – |
| es-dialect | – | 5/5, 0 errors | – |
| es-from-he | – | 4/5, 5 errors | ingredient_term: 2 tazas concentrado de tomate |
| en-from-he-units | – | 5/5, 0 errors | – |
| en-from-he-terms | – | 5/5, 0 errors | – |
| en-from-fr | – | 4/5, 2 errors | meaning: ½ lime juice |
| en-from-tr | – | 5/5, 0 errors | – |
