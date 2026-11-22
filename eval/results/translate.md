# Translation quality eval (PIN-53)

Run 2026-11-22T03:56Z · translate model: production default (`TASK_MODELS.translate`) · served: openai/gpt-6.1-sol · 2 run(s) × 25 cases · translate cost $0.2203 · judge (google/gemini-3.1-pro-preview, run 1 only) $0.2788 · median 3796 ms per recipe

Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).

| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|---|
| All | 50 | 0 | 89% | 16% | 3.48 | 8.84 | 32% |
| he | 20 | 0 | 91% | 30% | 3.60 | 8.60 | 40% |
| ar | 8 | 0 | 89% | 25% | 3.50 | 9.75 | 25% |
| ru | 8 | 0 | 82% | 0% | 3.25 | 10.00 | 25% |
| es | 6 | 0 | 90% | 0% | 3.67 | 6.33 | 33% |
| en | 8 | 0 | 91% | 0% | 3.25 | 9.25 | 25% |

## Failed checks by kind (all runs)

| Check | Failed / total |
|---|---|
| `expect:amount` | 46 / 106 |
| `expect:ing` | 13 / 86 |
| `expect:line` | 2 / 2 |
| `expect:steps` | 10 / 16 |
| `expect:title` | 0 / 2 |
| `forbid:all` | 4 / 6 |
| `forbid:amount` | 2 / 12 |
| `forbid:ing` | 0 / 6 |
| `forbid:steps` | 6 / 8 |
| `forbid:title` | 0 / 2 |
| `ru_capitalized` | 12 / 46 |
| `unit_in_name` | 2 / 306 |
| `untranslated` | 34 / 584 |
| `voice_mixed` | 0 / 20 |

## Judge errors by category (run 1)

| Category | Major | Minor | Languages |
|---|---|---|---|
| untranslated | 19 | 1 | he, ar, ru, es, en |
| grammar | 4 | 40 | he, ar, ru, es, en |
| unit | 7 | 9 | he, ar, ru, es, en |
| ingredient_term | 0 | 8 | he, ar, es |
| meaning | 1 | 1 | he, ru |
| style_consistency | 0 | 4 | he, ar, en |
| cooking_verb | 0 | 3 | he, ar |

## Stability across runs

Same title in 20/25 recipes · same ingredient name in 163/169 lines (96%) · same Hebrew step voice in 8/10 Hebrew recipes.

| Case | Title | Ingredient names identical | Hebrew voice per run |
|---|---|---|---|
| he-fractions-temp | עוגת לימון בזיגוג לימוני ⟷ עוגת לימון בזיגוג לימון בתבנית אינגליש קייק | 7/7 | imperative / imperative |
| he-from-fr | בראוניז אקספרס ⟷ בראוני אקספרס | 7/7 | imperative / present |
| he-from-tr | ביצים עם תפוח אדמה במחבת ⟷ ביצים עם תפוחי אדמה במחבת | 5/6 | imperative / imperative |
| he-glossary-baking | same | 7/8 | present / imperative |
| he-cooking-verbs | same | 6/7 | imperative / imperative |
| he-from-es | same | 5/6 | present / present |
| ar-glossary | دجاج مقلي بمخيض اللبن ⟷ دجاج مقلي باللبن الرائب | 6/7 | – |
| ru-genitive | Тонкие блинчики на большую компанию ⟷ Блины на большую компанию | 5/6 | – |

## Per case (run 1)

| Case | Failed checks | Judge | Major errors |
|---|---|---|---|
| he-fractions-temp | expect:amount@amount:2 (¾ כוסות ≠ ¾ כוס); expect:amount@amount:3 (½ כפיות ≠ ½ כפית); expect:amount@amount:4 (¼ כפיות ≠ ¼ כפית); expect:steps@steps (חממו את התנור ל-350°F ושמנו תבנית אינגליש קייק בגודל 9x5 אינץ'. טרפו את הביצים והסוכר עד לקבלת תערובת בהירה, ולאחר מכן קפלו פנימה את הקמח והמלח. ערבבו פנימה את השמנת, הווניל ומיץ הלימון, צקו את הבלילה לתבנית ואפו במשך 45 דקות. הניחו לעוגה להתקרר במשך 10 דקות, ולאחר מכן זלפו עליה את זיגוג הלימון. ≠ 180 / 175 / 177); forbid:steps@steps (°F) | 3/5, 6 errors | unit: 350°F; unit: 9x5 אינץ' |
| he-unit-is-noun | untranslated@line:1 (green cabbage); untranslated@line:2 (lemon); untranslated@line:3 (eggs); expect:amount@amount:6 (⅓ כוסות ≠ ⅓ כוס) | 3/5, 5 errors | untranslated: 1 green cabbage; untranslated: 1 lemon; untranslated: 2 eggs |
| he-from-fr | – | 4/5, 2 errors | – |
| he-from-tr | untranslated@line:1 (adet); untranslated@line:4 (adet); expect:amount@amount:2 (½ כפיות ≠ ½ כפית) | 3/5, 3 errors | untranslated: 1 adet תפוח אדמה גדול; untranslated: 2 adet ביצים |
| he-from-de | untranslated@line:2 (Stück) | 4/5, 1 errors | untranslated: 8 Stück אצבעות שוקולד קינדר |
| he-glossary-baking | expect:amount@amount:8 (½ כפיות ≠ ½ כפית) | 4/5, 4 errors | – |
| he-cooking-verbs | expect:line@line:4 (2 שיניים שום קצוץ דק ≠ 2 שיני שום); expect:amount@amount:5 (½ כוסות ≠ ½ כוס); expect:amount@amount:6 (¾ כוסות ≠ ¾ כוס) | 4/5, 4 errors | – |
| he-mixed-source | untranslated@line:2 (шт); untranslated@line:6 (шт); expect:amount@amount:4 (½ כפיות ≠ ½ כפית) | 3/5, 3 errors | untranslated: 1 шт.; untranslated: 1 шт. |
| he-taste-phrases | – | 3/5, 5 errors | grammar: 1 לטיגון שמן ניטרלי; grammar: 1 לציפוי סוכר לבן; meaning: 1 גרידת לימון |
| he-from-es | – | 5/5, 1 errors | – |
| ar-fractions-temp | expect:amount@amount:1 (½ أكواب ≠ ½ كوب); expect:amount@amount:2 (¾ أكواب ≠ ¾ كوب); expect:amount@amount:3 (¼ ملاعق صغيرة ≠ ¼ ملعقة صغيرة); expect:steps@steps (سخّن الفرن إلى 350 درجة فهرنهايت، وبطّن قالب خبز مستطيل بورق الزبدة. اخلط الزبدة والسكر والموز والحليب. أضف الدقيق وبيكربونات الصوديوم والملح، وقلّب برفق بطريقة الطي حتى تتجانس المكونات فقط. اخبز لمدة 55–60 دقيقة، حتى يخرج عود خشبي نظيفًا عند غرسه في الخبز. ≠ 180 / 175 / 177); forbid:steps@steps (فهرنهايت) | 3/5, 7 errors | unit: 350 درجة فهرنهايت |
| ar-glossary | expect:amount@amount:4 (½ أكواب ≠ ½ كوب) | 4/5, 4 errors | grammar: ½ أكواب |
| ar-from-he | untranslated@line:1 (יחידה); untranslated@line:2 (יחידות); untranslated@line:7 (ביצים); expect:amount@amount:6 (½ ملاعق صغيرة ≠ ½ ملعقة صغيرة) | 3/5, 5 errors | untranslated: 1 יחידה بصل مفروم; untranslated: 2 יחידות فلفل أحمر; untranslated: 4 ביצים بيض |
| ar-brands | – | 4/5, 3 errors | – |
| ru-genitive | expect:ing@ing:1 (мука ≠ муки); expect:amount@amount:2 (5 стакана ≠ 5 стаканов); expect:ing@ing:2 (молоко ≠ молока); expect:ing@ing:4 (сахар ≠ сахара); expect:ing@ing:6 (сливочное масло, растопленное ≠ масла) | 3/5, 5 errors | grammar: стакана молоко |
| ru-imperial-temp | expect:steps@steps (Разогрейте духовку до 425°F. Взбейте венчиком тыквенное пюре, сахар, корицу, яйца и концентрированное молоко без сахара до однородности. Вылейте начинку в основу для пирога и выпекайте 15 минут, затем уменьшите температуру до 350°F и выпекайте ещё 40 минут. Остужайте на решётке в течение 2 часов. ≠ 220 / 218); expect:steps@steps (Разогрейте духовку до 425°F. Взбейте венчиком тыквенное пюре, сахар, корицу, яйца и концентрированное молоко без сахара до однородности. Вылейте начинку в основу для пирога и выпекайте 15 минут, затем уменьшите температуру до 350°F и выпекайте ещё 40 минут. Остужайте на решётке в течение 2 часов. ≠ 180 / 175 / 177); forbid:steps@steps (°F) | 3/5, 7 errors | unit: 425°F; unit: 350°F |
| ru-appliances | expect:ing@ing:1 (тёмный шоколад ≠ шоколада); expect:ing@ing:4 (сахар ≠ сахара) | 4/5, 4 errors | – |
| ru-from-he | untranslated@line:1 (קישואים); untranslated@line:2 (ביצה); ru_capitalized@ing:1 (Кабачки); ru_capitalized@ing:2 (Яйцо); ru_capitalized@ing:3 (Мука); ru_capitalized@ing:4 (Соль); ru_capitalized@ing:5 (Чёрный перец); ru_capitalized@ing:6 (Масло); expect:amount@amount:4 (½ чайные ложки ≠ ½ ч. л.) | 3/5, 4 errors | untranslated: קישואים Кабачки; untranslated: ביצה Яйцо |
| es-fractions-temp | expect:amount@amount:1 (½ tazas ≠ ½ taza); expect:amount@amount:2 (½ cdtas ≠ ½ cdta / ½ cucharadita); expect:amount@amount:5 (¾ tazas ≠ ¾ taza); expect:amount@amount:7 (⅓ tazas ≠ ⅓ taza); expect:steps@steps (Precalienta el horno a 400 °F y coloca cápsulas de papel en un molde para 12 muffins. Mezcla la harina, el azúcar, el polvo de hornear y la sal con un batidor de varillas. Incorpora la leche, el aceite y el huevo; luego añade los arándanos con movimientos envolventes suaves. Hornea durante 20–25 minutos. ≠ 200 / 205 / 204) | 3/5, 8 errors | unit: 400 °F |
| es-dialect | expect:amount@amount:7 (½ cdtas ≠ ½ cdta / ½ cucharadita) | 4/5, 2 errors | – |
| es-from-he | untranslated@line:2 (יחידה) | 4/5, 1 errors | untranslated: 1 יחידה Cebolla rallada |
| en-from-he-units | untranslated@line:1 (ביצים); expect:amount@amount:4 (½ cups ≠ ½ cup); forbid:amount@amount:4 (½ cups) | 3/5, 3 errors | untranslated: ביצים L Large eggs; unit: 180 degrees |
| en-from-he-terms | untranslated@line:2 (יחידות); untranslated@line:6 (יחידות); expect:amount@amount:3 (½ cups ≠ ½ cup) | 3/5, 4 errors | untranslated: 2 יחידות eggs; untranslated: 4 יחידות petit beurre biscuits |
| en-from-fr | unit_in_name@line:8 (½ lime lime juice); forbid:all@all (saucisses, oignons) | 3/5, 4 errors | untranslated: saucisses smoked sausages; untranslated: oignons yellow onions |
| en-from-tr | forbid:all@all (adet, ½ cups) | 4/5, 2 errors | – |
