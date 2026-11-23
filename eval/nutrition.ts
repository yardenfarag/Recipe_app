// PIN-80 nutrition eval. Runs the production recipe_estimates task (calories with protein, carbs and fat) on
// recipes with hand-worked references, and scores it in code; no judge model. Six Luna calls, well under a cent.
//   npx -y deno run -A --no-lock --env-file=.env eval/nutrition.ts [--model=slug] [--only=he]
// Writes eval/results/nutrition.md. The scorer has its own tests: eval/nutrition_test.ts.

import { setEvalHook } from '../supabase/functions/_shared/llm/llmClient.ts';
import { estimateRecipeFields } from '../supabase/functions/_shared/recipes/recipeEstimates.ts';
import type { RecipeNutrition } from '../supabase/functions/_shared/recipes/nutrition.ts';

export type PerServing = { calories: number } & RecipeNutrition;

export type NutritionCase = {
  id: string;
  lang: 'en' | 'he';
  title: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  per_serving: PerServing;
};

export const CALORIE_TOLERANCE = 0.25;
export const MACRO_TOLERANCE = 0.3;
/** Small amounts (2 g of protein in a cookie) are judged in grams, not percent. */
export const MACRO_SLACK_G = 6;

export type NutritionScore = {
  caloriesOk: boolean;
  /** null when the task returned no macros (dropped as inconsistent, or left out). */
  macrosOk: { protein_g: boolean; carbs_g: boolean; fat_g: boolean } | null;
  got: Partial<PerServing> | null;
};

/** Scores one answer (totals for all servings, as stored) against the per-serving reference. Pure. */
export function scoreNutrition(
  testCase: NutritionCase,
  answer: { calories: number | null; nutrition: RecipeNutrition | null } | undefined,
): NutritionScore {
  if (!answer || answer.calories === null) return { caloriesOk: false, macrosOk: null, got: null };
  const per = (total: number) => total / Math.max(1, testCase.servings);
  const ref = testCase.per_serving;
  const calories = per(answer.calories);
  const caloriesOk = Math.abs(calories - ref.calories) <= ref.calories * CALORIE_TOLERANCE;
  if (!answer.nutrition) return { caloriesOk, macrosOk: null, got: { calories: Math.round(calories) } };
  const near = (got: number, want: number) => Math.abs(got - want) <= Math.max(want * MACRO_TOLERANCE, MACRO_SLACK_G);
  const got = {
    calories: Math.round(calories),
    protein_g: Math.round(per(answer.nutrition.protein_g)),
    carbs_g: Math.round(per(answer.nutrition.carbs_g)),
    fat_g: Math.round(per(answer.nutrition.fat_g)),
  };
  return {
    caloriesOk,
    macrosOk: {
      protein_g: near(got.protein_g, ref.protein_g),
      carbs_g: near(got.carbs_g, ref.carbs_g),
      fat_g: near(got.fat_g, ref.fat_g),
    },
    got,
  };
}

async function main(args: string[]): Promise<void> {
  const flags = Object.fromEntries(args.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const only = flags.only as string | undefined;
  const model = flags.model as string | undefined;
  // `vendor/model@low` pins the reasoning effort, as in eval/models.ts.
  const [modelId, reasoning] = model?.split('@') ?? [];
  if (modelId) setEvalHook({ model: () => modelId, reasoning: () => reasoning ?? null });

  const file = JSON.parse(await Deno.readTextFile(new URL('./cases/nutrition.json', import.meta.url)));
  const cases = (file.cases as NutritionCase[]).filter((c) => !only || c.lang === only || c.id.includes(only));
  const rows: string[] = [];
  let cost = 0;
  let caloriesOk = 0;
  let macrosChecked = 0;
  let macrosOk = 0;
  let dropped = 0;

  for (const testCase of cases) {
    let score: NutritionScore;
    try {
      const { values, usage } = await estimateRecipeFields({
        title: testCase.title,
        servings: testCase.servings,
        ingredients: testCase.ingredients.map((name) => ({ name, quantity: 0, unit: '' })),
        instructions: testCase.steps.map((text, i) => ({ step: i + 1, text })),
        fields: ['calories'],
        amountRows: [],
      });
      cost += usage?.costUsd ?? 0;
      score = scoreNutrition(testCase, values.calories);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Out of credit: every later call would fail too.
      if (/status=402\b/.test(message)) {
        console.error('Stopped: OpenRouter answered 402 (out of credit).');
        break;
      }
      console.error(`${testCase.id}: ${message}`);
      score = { caloriesOk: false, macrosOk: null, got: null };
    }
    if (score.caloriesOk) caloriesOk += 1;
    if (score.macrosOk) {
      const oks = Object.values(score.macrosOk);
      macrosChecked += oks.length;
      macrosOk += oks.filter(Boolean).length;
    } else if (score.got) {
      dropped += 1;
    }
    const ref = testCase.per_serving;
    const got = score.got;
    const cell = (want: number, value: number | undefined, ok: boolean | undefined) =>
      value === undefined ? `${want} / –` : `${want} / ${value}${ok ? '' : ' ✗'}`;
    rows.push(
      `| ${testCase.id} | ${cell(ref.calories, got?.calories, score.caloriesOk)} | ${cell(ref.protein_g, got?.protein_g, score.macrosOk?.protein_g)} | ${cell(ref.carbs_g, got?.carbs_g, score.macrosOk?.carbs_g)} | ${cell(ref.fat_g, got?.fat_g, score.macrosOk?.fat_g)} |`,
    );
    console.log(rows.at(-1));
  }

  const report = [
    '# Nutrition eval (PIN-80)',
    '',
    `Model: ${model ?? 'production default (recipe_estimates)'} · ${new Date().toISOString().slice(0, 10)} · cost $${cost.toFixed(4)}`,
    '',
    `- Calories within ${CALORIE_TOLERANCE * 100}%: ${caloriesOk}/${cases.length}`,
    `- Macros within ${MACRO_TOLERANCE * 100}% or ${MACRO_SLACK_G} g: ${macrosOk}/${macrosChecked}`,
    `- Macros dropped (didn't fit the calories, or left out): ${dropped}`,
    '',
    'Per serving, reference / Pinch (✗ = outside tolerance):',
    '',
    '| Case | kcal | protein g | carbs g | fat g |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  await Deno.writeTextFile(new URL('./results/nutrition.md', import.meta.url), report);
  console.log(report);
}

if (import.meta.main) await main(Deno.args);
