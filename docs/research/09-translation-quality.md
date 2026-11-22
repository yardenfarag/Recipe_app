# Recipe translation quality (PIN-53)

> **Sources:** production data (read-only SQL on `recipe_translations`, `recipes` and `ai_usage_events`, 22 Nov 2026), the PIN-44 judge verdicts in `eval/results/judge/translate/`, a new eval run on 22 Nov 2026 (`eval/results/translate.md`), the code in `supabase/functions/_shared/recipes/` and `shared/lib/`, and the papers and guides listed under [Sources](#sources). Every web page was read on 22 Nov 2026.
>
> **Project context:** recipes are translated by the `translate-recipe` Edge Function (`translateRecipeWithGemini` in `supabase/functions/_shared/recipes/translateRecipe.ts`). The model is `openai/gpt-6.1-sol` at low reasoning, with `openai/gpt-6-luna` as fallback (`TASK_MODELS.translate` in `llmClient.ts`, picked in [05-llm-per-task.md](05-llm-per-task.md)). Translations are cached per recipe and language in `recipe_translations` ([ADR 012](../adr/012-app-language-and-recipe-translations.md)). The app localizes units again when it reads a translation (`shared/lib/ensureRecipeTranslation.ts`) and formats amounts with `shared/lib/formatQuantity.ts`.
>
> **Privacy:** user recipes are private. This note quotes only the short phrases that show a failure. It has no user ids, names or whole recipes. The eval cases are recipes written for the eval.

---

## Summary

> **Update (22 Nov 2026):** the fixes below are built; see [After the fixes](#after-the-fixes-pin-53-22-nov-2026) for what changed and the before and after numbers. Item 3 changed with Yarden's decision: the prompt keeps numbers and units as written, and a per-person Metric or US setting converts them on screen.

Most translation failures are **not the model's fault**. They come from our own code around the model, and from two rules in the prompt.

1. **The biggest bug is in our unit code.** When the model correctly returns an empty unit for a countable item ("1 lemon"), `translateRecipe.ts` puts the source unit back. So English users see `1 קישוא Zucchini` and `2 יחידות eggs`, and Hebrew users see `1 adet ביצה` and `1 green cabbage כרוב ירוק`. **13 of the 37** cached translations into English or Spanish show a Hebrew unit word. In the eval, this causes **19 of the 31** major errors the judge found.
2. **Fractions get the plural unit.** The app shows `½ כפיות`, `½ cups`, `½ tazas` and `½ أكواب` instead of `½ כפית`, `½ cup`, `½ taza` and `½ كوب`. Russian gets `5 стакана` instead of `5 стаканов`. This is display code in `shared/lib/culinaryUnits.ts`. It touches **65 lines in 32 of 72** cached translations.
3. **The prompt forbids converting units, so °F and inches stay.** A Hebrew, Russian, Arabic or Spanish cook gets `350°F` and `9x5 אינץ'`. This happened in all 8 eval answers whose source gave only °F.
4. **Style isn't specified, so it drifts.** Hebrew steps are imperative (`חממו`) in about two thirds of recipes and present plural (`מחממים`) in the rest. Two of ten Hebrew eval recipes switched style between two runs of the same input. Russian ingredient names stay in the nominative (`200 г мука`) and get capital letters.
5. **Old caches never improve.** 51 of 72 cached translations (71%) were made by Gemini 3.1 Flash Lite before 15 Oct 2026. They are still served, because nothing on the row says which model or prompt made them.

**Baseline (current prompt and model, 25 cases × 2 runs):** 89% of code checks pass, but only 16% of answers pass every check. The judge gives **3.48 / 5** for "reads like a native cook wrote it". Only **32%** of recipes have no major error. Russian is weakest (3.25), Spanish best (3.67).

**Recommendation:** fix the unit fallback and the plural rules first. They are small code changes, need no new model, and remove most major errors. Then change the prompt (temperature conversion, one style per language, full translation), add a small ingredient glossary, and version the cache so old translations are redone. Keep GPT-6.1 Sol for now and rerun the eval after the fixes. The full list is under [Recommended fixes](#recommended-fixes-in-priority-order).

---

## After the fixes (PIN-53, 22 Nov 2026)

> **Status:** built on the batch branch, not merged. Yarden decided: Hebrew steps in the present plural, Spanish from Spain, and conversion as a **per-person display setting** rather than inside the translation. Model unchanged (GPT-6.1 Sol).

### What shipped

| Fix | Where |
|---|---|
| The model's empty unit is kept; the source unit is never put back | `supabase/functions/_shared/recipes/translateRecipe.ts` (`resolveTranslatedUnit`) |
| Plural rules per language (singular below 1; Russian one/few/many and genitive after fractions; Arabic singular after 1, 2 and 11+; Hebrew `שיני` for cloves), source-language count words (`יחידה`, `adet`, `Stück`, `шт.`…) and phrases (`to taste`, `for frying`, `bunch`, `handful`) | `shared/lib/culinaryUnits.ts` and the identical block in `supabase/functions/_shared/recipes/culinaryUnits.ts` |
| Prompt: translate every word, keep every number and unit **as written** (the app converts), unit rules, one style per language, natural titles, one example per language | `translateRecipe.ts` (`SYSTEM_PROMPT`, `STYLE_NOTES`, `EXAMPLES`) |
| Ingredient glossary, injected only for terms in the recipe | `supabase/functions/_shared/recipes/translationGlossary.ts` |
| Same-language skip: a recipe already in the target language is handed back without a model call or quota | `translateRecipe.ts` (`recipeAlreadyInLanguage`), `translate-recipe/index.ts` |
| Source-language detection: Turkish markers; a Hebrew, Arabic or Russian label on text without that script isn't trusted | `shared/lib/recipeSourceLanguage.ts` |
| Cache version: `recipe_translations.translation_version` (add-only migration `20261122150000_recipe_translation_version.sql`); the function returns `translation_version: 2`; the app saves it and treats a lower or missing one as a miss, keeping the old text if re-translating fails | `shared/lib/translationVersion.ts`, `ensureRecipeTranslation.ts`, `supabase/recipeTranslations.ts` |
| Redo of old caches: admin Edge Function `backfill-translations` with `dry_run` (stale rows by language and an estimated cost), batches of up to 10, a cursor, and a stop on the first 402 | `supabase/functions/backfill-translations/`, `_shared/recipes/enrich/translationBackfill.ts` |
| **Metric or US setting** (below) | `shared/lib/unitSystem.ts`, `convertStepUnits.ts`, `displayStepText.ts`, both apps |

### The Metric or US setting

- One preference, **Metric (°C, g, cm)** or **US (°F, oz, in)**, stored with the PIN-154 preferences in `user_metadata.prefs.units` (no migration), with a device copy under `pinch:unitSystem` on both apps. The account's pick wins and is copied to the device; a pick is saved on both.
- Until the cook picks, it follows the app language: **US for English, Metric for Hebrew, Arabic, Spanish and Russian**.
- Offered in Settings → Recipe preferences on both apps, next to spoons or grams, and in onboarding: on mobile under the spoons-or-grams question; on the web (which had no measurement question) as a "How do you measure?" box under the first question, holding both choices.
- Converted at **display time**, deterministically, in `shared/`:
  - Spoons mode weights: Metric readers get grams (`150 g` stays, `4 oz` becomes `113 g`); US readers get ounces as before. Grams mode is unchanged.
  - Steps (`convertStepUnits`): °F ↔ °C (oven heat to the nearest 10 °C or the usual 25 °F dial, lower heat to the degree), ranges, written pairs collapsed to the reader's side ("350°F (180°C)" → "180°C"), "F" without the degree sign from 100 up, bare "degrees" read as Celsius in Hebrew, Arabic, Russian and Spanish text and as Fahrenheit in English only from 260 up, and inches ↔ cm including pan dimensions. Hebrew, Arabic, Russian and Spanish spellings, Arabic-Indic digits and right-to-left marks are covered by `shared/lib/convertStepUnits.test.ts`.
  - The translation prompt no longer converts anything, so a translation saved once per language serves every reader, and untranslated recipes convert too.

### Before and after

Same 25 cases, 2 runs each, production model. "Before" is the baseline above; "after" is `eval/results/translate-production-after.md`. Both render what the recipe screen shows in each language's default unit setting.

| Measure | Before | After |
|---|---|---|
| Code checks passed | 89% | **100%** (2 of 1,108 failed) |
| Answers with no failed check | 16% | **96%** |
| Untranslated words | 34 of 584 | **0** |
| Rendered amount wrong (plurals, units) | 46 of 106 | **2** |
| °F kept in steps | 10 of 16 step checks failed | **0** |
| Russian capitals | 12 of 46 | **0** |
| Same Hebrew step style across runs | 8 of 10 | **10 of 10** (all present plural) |
| Same ingredient names across runs | 96% | 97% |
| Translation cost per recipe | $0.0044 | $0.0053 (longer prompt) |
| Median time per recipe | 3.8 s | 4.1 s |

The judge ran on 12 of the 25 cases after the fixes (2–4 per language, to stay within the $0.40 budget). On those same 12:

| Judge, same 12 cases | Before | After |
|---|---|---|
| Native score (1–5) | 3.17 | **4.67** |
| MQM penalty per recipe | 11.25 | **1.42** |
| Recipes with no major error | 2 of 12 | **10 of 12** |
| Major / minor errors | 19 / 40 | **2 / 7** |

By language (score, MQM): Hebrew 3.25 → 4.75 (11.5 → 1.25), Arabic 3.00 → 4.00 (14.0 → 2.5), Russian 3.00 → 5.00 (12.0 → 0.5), Spanish 3.50 → 5.00 (7.0 → 0.0), English 3.00 → 4.50 (11.5 → 3.0).

**Read with care.** The same person wrote the fixes and the hand labels, so the code checks were bound to improve; the judge is the more independent number, and it ran on 12 cases, so a single case moves a language's average. Two majors remain:

- `he-cooking-verbs`: the glossary's Hebrew for "deglaze" read badly. The entry was removed after this run (not re-measured).
- `en-from-fr`: `0.5 citron vert │ jus de citron vert` became "½ lime juice"; the judge wants "juice of ½ lime". A unit that names a fruit whose juice is the ingredient still trips the model.

Smaller ones left: Arabic count nouns after a number (`1 بصل` for `1 بصلة`), a pan size inside an ingredient name isn't converted (`9 дюймов` in "9-inch pie crust": only steps convert), and a Turkish `paket` saved before the table change reads "package" (now `packet`).

---

## Where translations come from

| What | Where |
|---|---|
| Edge Function | `supabase/functions/translate-recipe/index.ts`: validates the body, meters 10 per user per day, calls the task |
| Task | `supabase/functions/_shared/recipes/translateRecipe.ts`: system prompt, JSON schema, unit post-processing, rebuilds quantities from the source |
| Identity check | `supabase/functions/_shared/recipes/translationIntegrity.ts`: same count, order and quantities |
| Unit words | `supabase/functions/_shared/recipes/culinaryUnits.ts` (server) and `shared/lib/culinaryUnits.ts` (app), the same table |
| Cache | `recipe_translations` (`recipe_id`, `language_code`, `title`, `ingredients`, `instructions`, `created_at`), written by the app through `shared/lib/supabase/recipeTranslations.ts` |
| Read path | `shared/lib/ensureRecipeTranslation.ts`: picks the source language (`recipeSourceLanguage.ts`), uses the cache or calls the function, localizes units again |

**Production volume.** `ai_usage_events` has 129 translate calls since July. 72 translations are cached: 35 into Hebrew, 34 into English, 3 into Spanish. None are cached in Russian or Arabic (one Arabic call in November was not saved, likely a guest or preview). By their stored label, sources are English (39), Hebrew (18), French (6), Turkish (2), Spanish (2), German, Dutch and Italian (1 each), and 2 unlabelled. Several "English" ones are not (F28). Since GPT-6.1 Sol took over on 15 Oct there were 27 calls, no errors, 5–12 s per call on average depending on the language, and $0.22 in total.

---

## The failures, labelled

I read every cached translation next to its source, and the 45 PIN-44 judge notes for Sol on Hebrew, Arabic and Russian. Each row below is one failure pattern, with a short example. "Sol" means it still happens on the current model. "Old" means it came from the Gemini Flash Lite era and is still in the cache.

| # | Pair | Class | Example (source → shown to the user) | Model |
|---|---|---|---|---|
| F1 | he → en | Source unit kept | `1 קישוא │ קישוא` → `1 קישוא Zucchini` | Sol |
| F2 | he → en | Source unit kept | `3 ביצים L │ ביצים L` → `3 ביצים L Large eggs` | Sol |
| F3 | he → en | Source unit kept | `1 יחידה │ ביצה` → `1 יחידה egg` (10 recipes) | Old |
| F4 | fr → en | Source unit kept | `6 saucisses │ saucisses fumées` → `6 saucisses smoked sausages` | Sol |
| F5 | fr → en | Awkward unit | `15 cl environ` → `15 centiliters, approximately`; `1 jus` → `1 fruit's worth of juice` | Sol |
| F6 | en → he | Source unit kept | `1 green cabbage │ green cabbage` → `1 green cabbage כרוב ירוק` | Sol |
| F7 | en → he | Source unit kept | `1 lemon`, `3 eggs` stay in English next to Hebrew names | Old + Sol |
| F8 | tr → he | Source unit kept | `1 adet │ büyük boy patates` → `1 adet תפוח אדמה גדול` | Sol |
| F9 | tr, de, fr → he | Foreign unit not in the unit table | `0.5 çay kaşığı`, `1 Päckchen`, `2 c.c` stay as written (9 recipes) | Old |
| F10 | uk → he | Foreign unit not in the unit table | `1 шт. ביצה` | Old |
| F11 | en → he | English unit phrase left | `to taste`, `for frying`, `handful`, `shot` shown in English (10 lines) | Old |
| F12 | en, de → he | Unit repeated in the name | `1 pack │ חבילת קינדר בואנו`, `1 Packung │ חבילת בצק עלים`, `to taste │ … לפי הטעם` | Old |
| F13 | en → he | Fraction gets plural unit | `½ כפיות`, `¾ כוסות` (32 lines, 15 recipes) | display |
| F14 | he → en | Fraction gets plural unit | `½ cups milk` (22 lines, 14 recipes) | display |
| F15 | en → es | Fraction gets plural unit | `½ tazas`, `½ cdtas` (11 lines, all 3 recipes) | display |
| F16 | en → he | Half-translated title | `… מילקה (Milka Chocolate Pancakes)` | Old |
| F17 | de → he | Source kept in parentheses | `עוגיות חמאה (Butterkekse)` | Old |
| F18 | en → he | Wrong product | `golden caster sugar` → `סוכר חום בהיר` (light brown sugar) | Old |
| F19 | en → he | Literal ingredient name | `brown onion` → `בצל חום`; Israeli cooks say `בצל` or `בצל יבש` | Old |
| F20 | he → en | Literal ingredient name | `גבינה לבנה` → `white cheese`; English cooks know quark or fromage blanc | Old |
| F21 | en → he | Word order | `white chocolate chips` → `שוקולד לבן צ'יפס` | Old |
| F22 | en → he | Gender agreement | `grated parmesan` → `פרמזן מגורדת` (פרמזן is masculine) | Old |
| F23 | en → he | Literal title | `Whole Lemon Cake` → `עוגת לימון שלמה` ("an uncut lemon cake"); `Easy … Crackers` → `… בקלות` ("easily") | Old |
| F24 | en, es, tr → he | Step style differs by recipe | 23 recipes imperative, 10 present plural, 2 mix (`יש לחמם` then `חממו`) | Old + Sol |
| F25 | en → es | Two dialects in one recipe | Spain's `contramuslos` and `varillas` next to Rioplatense `jamoncitos`; other recipes use Latin American `tazón` and `polvo para hornear`, or Spain's `nata` | Sol |
| F26 | he → en | Capitalization differs by recipe | `Salmon fillet`, `Large eggs` in one recipe; lower case in others | Sol |
| F27 | all | Stale cache | 51 of 72 rows made by Flash Lite before 15 Oct, still served; one row's amounts no longer match its source | Old |
| F28 | all | Wrong source language | 11 recipes say `en` but are Hebrew, Turkish, German, French or Ukrainian; 3 say `he` but are English, so "translating" them to English returns the same text | extract |
| F29 | en → ru | Nominative after amounts | `1 стакан коричневый сахар` instead of `коричневого сахара` (PIN-44 judge: 11 of 15 Sol answers) | Sol |
| F30 | en → he, ar, ru, es | °F and inches kept | `350°F`, `9x5 אינץ'`, `425°F` (eval: 8 of 8 answers whose source had only °F) | Sol |

Two smaller patterns I saw but did not count as separate rows: Arabic `0.5 أكواب` and `2 ملاعق` where cooks write `نصف كوب` and `ملعقتان` (PIN-44 judge: 5 of 15), and Hebrew `4 שיניים שום` where the construct form `שיני שום` is right (PIN-44 judge: 2 of 15; eval: every clove line).

### Counts by class and language

Counts are cached recipes with the problem, out of the cached translations into that language. Russian and Arabic have no cached rows, so their numbers come from the PIN-44 judge notes (15 recipes each) or the new eval.

| Class | → Hebrew (35) | → English (34) | → Spanish (3) | → Russian | → Arabic | Cause |
|---|---|---|---|---|---|---|
| Source or foreign unit shown | 11 | 20 | 0 | eval: 1 of 4 | eval: 1 of 4 | code: unit fallback, unit table |
| Fraction gets plural unit | 15 | 14 | 3 | `5 стакана`; fractions OK | PIN-44: 5 of 15 | display code |
| English unit phrase left (`to taste`) | 5 | – | – | – | – | unit table |
| Unit repeated in the name | 4 | 2 | 0 | – | – | prompt |
| Half-translated title or name | 2 | 0 | 0 | eval: 1 hybrid word | – | prompt |
| Wrong or literal ingredient term | 3 | 1 | 1 | PIN-44: about 3 of 15 | PIN-44: about 4 of 15 | prompt, no glossary |
| Literal title | 4 | 1 | 0 | PIN-44: 1 | – | prompt |
| Grammar (agreement, case, order) | 2 | 0 | 0 | PIN-44: 11 of 15 | PIN-44: 3 of 15 | prompt |
| Style drift (voice, dialect, capitals) | 12 (minority voice) | 1 | 1 (and the variant differs across all 3) | PIN-44: 4 of 15 capitalized | – | prompt |
| °F / inches kept | eval: 2 of 2 | – | eval: 2 of 2 | eval: 2 of 2 | eval: 2 of 2 | prompt rule |
| Stale cache | 29 | 21 | 1 | – | – | cache design |
| Wrong source language | 11 recipes across the cache | | | | | extraction, detection |

---

## Why each class happens

### 1. Source unit kept (F1–F8): a fallback bug

The prompt says: for countable items, "set unit to an empty string". The model does that. I logged the model's raw JSON for one eval case: all four count units (`green cabbage`, `lemon`, `eggs`, `pieces`) came back as `""`.

Then `translateRecipe.ts` undoes it in two places:

```ts
const rawUnit = sanitizeGeminiText(translated?.unit ?? sourceUnit);   // line 160
...
return gemini || source;   // resolveTranslatedUnit, line 215
```

When the source unit isn't in our unit table and the model's unit is empty, the function returns the source unit. That is how `קישוא`, `adet`, `saucisses` and `green cabbage` reach users. In the eval this one bug produced all 34 failed "untranslated" checks (of 584) and 19 of the 31 major judge errors.

### 2. Foreign units and phrases (F9–F11): the unit table only knows English

`UNIT_MAP` is keyed by English units. It can read back the units it produces (`כף`, `EL`, `ст. л.`), but it doesn't know source-language count words such as `יחידה`, `יח'`, `adet`, `Stück` or `шт.`, nor phrases such as `to taste`, `for frying` or `handful`. Unknown units pass through unchanged, on the server and again in the app. `displayIngredientAmount` shows `to taste` as is, so an old Hebrew cache shows English.

A smaller slip: `כפית` maps back to `teaspoon` (the last entry wins) instead of `tsp`, so Hebrew to Russian gives the long `½ чайные ложки` instead of `½ ч. л.`.

### 3. Fraction plurals (F13–F15, part of F29): one rule for every language

`localizeCulinaryUnit` uses the singular only when the quantity is exactly 1. Everything else, including ½, gets the plural. That is wrong for every language we ship:

- **Hebrew, English, Spanish, Arabic:** a fraction below 1 reads as "half a cup", so the unit is singular: `½ כוס`, `½ cup`, `½ taza`, `½ كوب`.
- **Russian** has three forms after numbers: `1 стакан`, `2–4 стакана`, `5+ стаканов`. Fractions take the genitive singular: `½ стакана`. Our table has two forms, so `5 стакана` is wrong. CLDR, the Unicode plural data behind `Intl.PluralRules`, gives Russian the categories one, few, many and other ([CLDR plural rules](https://www.unicode.org/cldr/charts/46.1/supplemental/language_plural_rules.html)).
- **Arabic** has six categories, with a dual for 2 (`ملعقتان`, `كوبان`) ([CLDR](https://www.unicode.org/cldr/charts/46.1/supplemental/language_plural_rules.html)).
- **Hebrew** also needs the construct form when the unit is followed by the ingredient: `2 שיני שום`, not `2 שיניים שום`.

This is display code, so it also fixes the 51 old cached rows on read.

### 4. °F and inches kept (F30): the prompt forbids converting

The prompt says: "Keep quantities exactly unchanged. Do not convert measurement systems." That's right for the ingredient list, because the code rebuilds amounts from the source anyway. But it also stops the model from writing `180°C` in a step. Israel, Russia, the Arab world and Spain all bake in Celsius.

### 5. Style drift (F24–F26, F29): the prompt names no style

The prompt says "culinary translator" and nothing about house style. So the model picks per call:

- **Hebrew voice.** Hebrew recipes use the impersonal present plural (`מחממים את התנור`) or, less often, the plural imperative (`חממו`). A Hebrew grammar guide says recipes "almost never" use the imperative, calls the present plural "the safer default for Israeli online food writing", and notes that "each writer picks one and keeps it for the whole recipe" ([elon.io](https://elon.io/grammar/hebrew/texts/recipe)). Unbabel's Hebrew style guide also lists the impersonal form for instructions ([Unbabel](https://help.unbabel.com/hc/en-us/articles/4413927494167-Language-Guidelines-Hebrew)). These are guides, not corpus studies. The cache today is about two thirds imperative.
- **Russian case.** Russian puts the noun in the genitive after a number or measure: `200 г муки`, `двести граммов сахара` ([Mango Languages](https://mangolanguages.com/resources/learn/grammar/russian/when-to-use-the-genitive-case-with-quantity-words-and-numbers-in-russian-), [Cornell](https://russian.cornell.edu/grammar/html/le71_78_a.htm)). The app shows `amount + name`, so a name in the nominative (`мука`) reads as broken. The model translates the name on its own and doesn't know it will follow an amount.
- **Spanish dialect and English capitals** are the same problem: no rule, so each call picks.

### 6. Wrong or literal terms (F18–F23): no glossary, no context

The model sees `golden caster sugar` with no hint that Israeli shops sell `סוכר דק`. Product names that differ by country (`גבינה לבנה`, `שמנת מתוקה`, `סילאן`, `קמח תופח`, `аэрогриль`, `мультиварка`) are where LLM translation is weakest. Research on dictionary hints in the prompt (DiPMT) found that giving the model a few candidate translations for rare or domain words improves out-of-domain translation ([Ghazvininejad et al. 2023](https://arxiv.org/abs/2302.07856)). WMT 2023 terminology systems that gave an LLM the required terms reached about 80% term recall ([Bogoychev & Chen 2023](https://aclanthology.org/2023.wmt-1.80)). Literal titles have the same cause: the prompt says nothing about titles reading like a real recipe name.

### 7. Stale cache (F27): no version on the row

ADR 012 invalidates a translation when the recipe text changes. Nothing invalidates it when **we** improve translation. The row has no model or prompt version. So 51 rows from Flash Lite, which the PIN-44 eval scored 3.73 for Hebrew quality against Sol's 4.60, will be served forever. The cache is also where "stable when re-translated" really comes from: a cached recipe never changes. Instability only shows when a new translation is made, and the eval measures that (below).

### 8. Wrong source language (F28): detection trusts the label

`resolveRecipeSourceLanguage` overrides the stored label only for Hebrew, Arabic or Cyrillic script, or for two Spanish, French or German markers when the label is `en`. A Turkish recipe labelled `en` stays `en`. An English recipe labelled `he` stays `he`, so the app asks for an English "translation" of English text and pays for it. Mixed recipes (English title, German ingredients) get no translation at all for English readers.

### Side finding: ounces for metric cooks

Not a translation bug, but it shows up as "wrong units" for the same users. The app's default measurement mode ("Spoons", `original`) converts grams to ounces or pounds when the recipe has no spoons amount (`convertToSpoons` in `shared/lib/convertMeasurement.ts`). 186 of the 353 gram lines in production have no spoons amount. A Hebrew or Russian reader in the default mode sees `5¼ אונקיות` for 150 g. The eval leaves this out: it renders the recipe as written.

---

## The eval (`eval/translate.ts`)

### Cases

`eval/cases/translate.json` has **25 recipes written for the eval**, one or more failure classes each: 10 into Hebrew, 4 into Arabic, 4 into Russian, 3 into Spanish, 4 into English. Sources are English, Hebrew, French, Turkish, German, Spanish and a mixed Ukrainian-English recipe. They reproduce every class above except the cache and detection classes, which live outside the translate call.

### How it scores

Each answer is rendered the way the recipe screen shows it: units localized on read (`localizeIngredientUnits`) and amounts formatted by `formatQuantity`. Then:

1. **Code checks, every case.** Words in a script the target doesn't use (Latin words in Hebrew, Arabic or Russian unless the case allows a brand; Hebrew, Arabic or Cyrillic in English or Spanish). The unit word repeated inside the name. Russian names starting with a capital. Hebrew steps that mix imperative and present plural.
2. **Code checks, hand-labelled per case.** For example: amount 3 must read `½ כפית`; the steps must contain `180`; ingredient 2 must not be `סוכר חום`; ingredient 1 in Russian must be `муки`. A term must not be the start of a longer word, so `¾ כוס` doesn't pass on `¾ כוסות`.
3. **A native-speaker judge**, in the style of GEMBA-MQM ([Kocmi & Federmann 2023](https://aclanthology.org/2023.wmt-1.64)): it lists each error with a category and a severity, and gives a 1–5 "reads like a native cook" score. The MQM penalty is 1 point per minor and 5 per major error. The judge is Gemini 3.1 Pro, as in PIN-44, so it has no stake in the OpenAI candidate. It judges run 1 only. The GEMBA-MQM authors warn that a black-box judge can't prove small gains, so treat the code checks as the gate and the judge as direction.
4. **Stability:** each case runs twice. The report counts identical titles, identical ingredient names and the same Hebrew voice across runs.

### Run it

```bash
npx -y deno@2 run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/translate.ts --runs=2
npx -y deno@2 test -A --no-lock --unstable-sloppy-imports eval/translate_test.ts   # scorer tests, no model calls
```

`--only=he` or `--only=<id part>` runs a subset, `--model=<slug>` pins another model, `--no-judge` skips the judge, `--tag=<name>` keeps a variant's files apart. Answers on disk are reused; `--force` redoes them. `--unstable-sloppy-imports` is needed because `shared/` uses extension-less imports. A full baseline costs about $0.50 ($0.22 translation, $0.28–0.32 judge).

### Baseline, 22 Nov 2026

Production config (`openai/gpt-6.1-sol`, low reasoning), current prompt, 25 cases × 2 runs. Full table: `eval/results/translate.md`.

| Set | Answers | Checks passed | Answers with no failed check | Judge score (1–5) | MQM penalty | Recipes with no major error |
|---|---|---|---|---|---|---|
| **All** | 50 | **89%** | **16%** | **3.48** | **8.84** | **32%** |
| Hebrew | 20 | 91% | 30% | 3.60 | 8.60 | 40% |
| Arabic | 8 | 89% | 25% | 3.50 | 9.75 | 25% |
| Russian | 8 | 82% | 0% | 3.25 | 10.00 | 25% |
| Spanish | 6 | 90% | 0% | 3.67 | 6.33 | 33% |
| English | 8 | 91% | 0% | 3.25 | 9.25 | 25% |

**Failed checks by kind:** rendered amount wrong 46 of 106 (mostly fraction plurals), steps 10 of 16 (°F kept), ingredient terms 13 of 86, untranslated words 34 of 584, Russian capitals 12 of 46, unit repeated in name 2 of 306, Hebrew mixed voice inside one recipe 0 of 20.

**Judge errors by category (25 recipes):** untranslated 19 major, 1 minor; grammar 4 major, 40 minor; unit 7 major, 9 minor; ingredient term 8 minor; style 4 minor; cooking verb 3 minor; meaning 1 major, 1 minor.

**Stability:** same title in 20 of 25 recipes, same ingredient name in 163 of 169 lines (96%), same Hebrew voice in 8 of 10 Hebrew recipes. The changes are small (`בראוניז` ⟷ `בראוני`, `תפוח אדמה` ⟷ `תפוחי אדמה`), except voice, which flips the whole recipe.

**Speed and cost:** median 3.8 s per recipe, $0.0044 per call.

What the baseline says: GPT-6.1 Sol translates the words well. The judge found only 8 minor ingredient-term errors and almost no meaning errors. The major errors come from units (our code) and °F (our prompt). Grammar is mostly minor, and mostly Russian case and Hebrew/Arabic agreement after amounts.

---

## Research: how to fix each class

| Class | Fix | Evidence |
|---|---|---|
| Source unit kept | Trust the model's empty unit. Never fall back to a source unit written in another script. | The model's raw answer already has `""` (eval log). |
| Foreign units, phrases | Add source-language count words to the count list. Add `to taste`, `for frying`, `for serving`, `handful` to the unit table in all five languages. | 9 Hebrew and 20 English cached recipes affected. |
| Plurals | Plural rules per language: fraction → singular (ru: genitive singular); ru one/few/many; ar dual; he construct form for cloves. | [CLDR plural rules](https://www.unicode.org/cldr/charts/46.1/supplemental/language_plural_rules.html), [CLDR spec](https://cldr.unicode.org/index/cldr-spec/plural-rules). A small table beats `Intl.PluralRules` here, because Hermes support for it on Android must be checked and recipes need a fraction rule CLDR doesn't have. |
| °F and inches | Let the model write °C and cm in step text for non-English targets. Keep the ingredient amounts locked, as now. | Eval: 8 of 8 °F-only answers kept °F. |
| Style drift | One short style block per target language in the prompt: Hebrew present plural, Russian genitive and lower case, Arabic singular after fractions, one Spanish variant, English sentence case. Add one good example per language. | [elon.io](https://elon.io/grammar/hebrew/texts/recipe), [Unbabel](https://help.unbabel.com/hc/en-us/articles/4413927494167-Language-Guidelines-Hebrew), [Mango](https://mangolanguages.com/resources/learn/grammar/russian/when-to-use-the-genitive-case-with-quantity-words-and-numbers-in-russian-). Vilar et al. found the **quality** of few-shot examples matters more than how closely they match the input ([ACL 2023](https://aclanthology.org/2023.acl-long.859)), so one hand-checked example per language is enough. |
| Literal terms and titles | A small glossary of ingredient terms per language, injected only for the terms found in the recipe. A prompt line on titles. | [DiPMT](https://arxiv.org/abs/2302.07856), [WMT 2023 terminology](https://aclanthology.org/2023.wmt-1.80) (LLM given terms reaches ~80% term recall). |
| Re-translation drift | Caching already makes a recipe stable. Make new translations converge with the style block and glossary. OpenAI's `seed` gives only "mostly" consistent output, so don't rely on it ([OpenAI cookbook](https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter)). | Eval: 96% of names already identical across runs. |
| Stale cache | Store a translation version on each row; treat older versions as a cache miss. | 51 of 72 rows predate Sol. |
| Wrong source language | Detect Turkish and mixed recipes; skip the call when source and target match. | 14 mislabelled recipes. |
| A different model? | Not needed now. Sol already won PIN-44 (Hebrew 5.0 / 4.6, all three languages 4.93 / 4.42), and in this eval the model-side errors are mostly minor. Recheck Russian after the prompt fix; if it stays below 4, test Sonnet 5.5 and Gemini 3.5 Flash on Russian only with `--model`. | [05-llm-per-task.md](05-llm-per-task.md); baseline above. |
| Caching per language | Already per language (ADR 012). Nothing to add beyond the version. | – |

---

## Recommended fixes, in priority order

Each step should be measured with `eval/translate.ts` before and after.

1. **Stop putting source units back.** In `supabase/functions/_shared/recipes/translateRecipe.ts`, use the model's unit as given (`translated.unit ?? ''`), and in `resolveTranslatedUnit` never return a source unit the target can't read (different script, or a count word). Tighten the prompt rule: return `""` only for count placeholders or a unit that repeats the ingredient; otherwise translate the unit word. Add unit tests for `קישוא`, `adet`, `saucisses`, `green cabbage`. *Expected:* about 19 of 31 major errors gone; "untranslated" checks near 100%.
2. **Fix plural and phrase rules for display.** In `shared/lib/culinaryUnits.ts` and the server copy `supabase/functions/_shared/recipes/culinaryUnits.ts`: singular below 1; Russian one/few/many forms; Arabic dual; Hebrew `שיני` for cloves; `כפית` → `tsp`; count words (`יחידה`, `יחידות`, `יח'`, `adet`, `Stück`, `шт.`, `pcs`) in the count list; `to taste`, `for frying`, `for serving`, `handful` localized. Extend `TASTE_UNITS` in `shared/lib/displayIngredientAmount.ts`. Remember `npx expo export -p android` and `-p ios`, and the `web/` checks, because `shared/` changes affect both apps. *Expected:* rendered-amount checks from 57% to about 95%; old caches improve on read with no new model calls.
3. **Change the prompt.** In `translateRecipe.ts`: allow °C and cm in step text for non-English targets; one style block per language (see the table above); "every word in the target language except brand names, never keep the source in parentheses"; "the name follows the amount and unit, so inflect it (Russian genitive) and don't repeat the unit"; "a title reads like a real recipe name, not a word-for-word copy". Add one hand-checked example recipe per language. Keep the schema; it already locks order and amounts. *Expected:* temperature checks 100%; Russian case and capitals fixed; Hebrew voice stable across runs.
4. **Add a glossary.** New `supabase/functions/_shared/recipes/translationGlossary.ts`, about 50 entries to start (Israeli dairy and baking names, Russian appliance names, Spanish dairy and leavening). Inject only the entries whose source term appears in the recipe, so the prompt stays short. The eval's hand labels are a ready test list.
5. **Version the cache.** Expand-then-contract migration: add a nullable `translation_version` to `recipe_translations`. Have `translate-recipe` return the current version, have `shared/lib/supabase/recipeTranslations.ts` store it, and have `shared/lib/ensureRecipeTranslation.ts` treat a lower or missing version as a miss. Re-translating the 51 old rows on next open costs about $0.30 in total. Run `npm run db:types` after the migration.
6. **Fix source-language detection.** In `shared/lib/recipeSourceLanguage.ts`, add Turkish markers and don't trust `he` when the text has no Hebrew letters. In `translate-recipe`, when the text is already in the target language, return it without a model call.
7. **Decide on ounces for metric languages** (`shared/lib/convertMeasurement.ts`), a product choice, below.
8. **Rerun the eval and then decide on the model.** Register `translate` in `eval/cli.ts` and document it in `eval/README.md` when shipping (this phase didn't touch existing eval files).

---

## Decisions for Yarden

> **Decided 22 Nov 2026:** 1 present plural; 2 Spain; 3 and 4 yes, as a per-person Metric or US setting converted on screen (not in the prompt); 5 yes, through `backfill-translations` after the merge; 6 no switch.

1. **Hebrew step voice.** Present plural (`מחממים`, `מערבבים`) or plural imperative (`חממו`, `ערבבו`)? I recommend present plural: the guides call it the norm, and the PIN-44 judge preferred it. Today's cache is mostly imperative.
2. **Spanish variant.** Spain (`nata`, `levadura química`, `bol`) or neutral Latin American (`crema`, `polvo para hornear`, `tazón`)? There are only 3 Spanish translations so far, so either is cheap to pick now.
3. **°F → °C in step text.** This changes today's rule "do not convert measurement systems" for the steps only. Ingredient amounts stay as written. I recommend allowing it for every target except English.
4. **Ounces in the default Spoons mode** for Hebrew, Russian, Arabic and Spanish readers. Should Spoons mode keep grams for these languages instead of converting to `אונקיות`?
5. **Re-translate old caches** once the version column exists: about $0.30 of model calls, spread over the next opens.
6. **Model.** No switch now. Revisit only if Russian stays below 4 after fixes 1–3.

---

## Cost of this research

Step 4 (the fixes): $0.27 for 50 translations and $0.11 for 12 judge calls, about **$0.38**. No balance errors.

Steps 1–3:

About **$0.83** of OpenRouter calls, checked against the balance before and after ($49.54 → $48.71): one baseline of 50 translations ($0.22), two judge passes ($0.32 and $0.28, the first discarded because it rendered amounts in ounces), and two single-case checks. No call returned a balance error.

## Could not verify

- **Russian and Arabic in production.** No Russian or Arabic translations are cached, so those rows rely on the PIN-44 judge and the new eval.
- **The eval's Arabic and Russian labels** were written by me, not by a native speaker. The Hebrew labels match the PIN-44 judge's notes but deserve a check by Yarden or Harel.
- **How common each Hebrew voice is** across Israeli recipe sites. The sources are style guides, not corpus counts.
- **Hermes support for `Intl.PluralRules`** on Android. The recommendation avoids depending on it.

## Sources

- Kocmi, T. and Federmann, C. (2023). *GEMBA-MQM: Detecting Translation Quality Error Spans with GPT-4.* WMT 2023. <https://aclanthology.org/2023.wmt-1.64>
- Ghazvininejad, M., Gonen, H. and Zettlemoyer, L. (2023). *Dictionary-based Phrase-level Prompting of Large Language Models for Machine Translation.* <https://arxiv.org/abs/2302.07856>
- Bogoychev, N. and Chen, P. (2023). *Terminology-Aware Translation with Constrained Decoding and Large Language Model Prompting.* WMT 2023. <https://aclanthology.org/2023.wmt-1.80>
- Vilar, D. et al. (2023). *Prompting PaLM for Translation: Assessing Strategies and Performance.* ACL 2023. <https://aclanthology.org/2023.acl-long.859>
- Unicode CLDR. *Language Plural Rules* (v46.1). <https://www.unicode.org/cldr/charts/46.1/supplemental/language_plural_rules.html>; *Plural Rules* spec: <https://cldr.unicode.org/index/cldr-spec/plural-rules>
- elon.io. *Hebrew recipe texts.* <https://elon.io/grammar/hebrew/texts/recipe>; *Over-using the classical imperative.* <https://elon.io/grammar/hebrew/errors/imperative-overuse>
- Unbabel. *Language Guidelines: Hebrew.* <https://help.unbabel.com/hc/en-us/articles/4413927494167-Language-Guidelines-Hebrew>
- Mango Languages. *When to use the genitive case with quantity words and numbers in Russian.* <https://mangolanguages.com/resources/learn/grammar/russian/when-to-use-the-genitive-case-with-quantity-words-and-numbers-in-russian->
- Cornell University. *Russian grammar: quantity words.* <https://russian.cornell.edu/grammar/html/le71_78_a.htm>
- OpenAI Cookbook. *How to make your completions outputs consistent with the new seed parameter.* <https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter>
- Internal: [ADR 012](../adr/012-app-language-and-recipe-translations.md), [05-llm-per-task.md](05-llm-per-task.md), `eval/results/judge/translate/` (PIN-44), `eval/results/translate.md` (this baseline).
