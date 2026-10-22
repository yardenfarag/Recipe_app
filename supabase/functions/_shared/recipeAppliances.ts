/**
 * The `appliances` task (ADR 017 decision 6): one small model call over the finished recipe that
 * lists the kitchen appliances it uses. It runs after extract, invent, repair and remix, and in the
 * admin backfill.
 *
 * It never throws. Any failure (no API key, timeout, bad JSON, nothing valid) gives
 * `appliances: null`, which the app treats as "not analysed", so a Snap never fails because of it.
 */

import {
  ALTERNATIVE_KEYS,
  APPLIANCE_KEYS,
  BENEFIT_KEYS,
  type RecipeAppliance,
  resolveApplianceKey,
  sanitizeRecipeAppliances,
} from './appliances.ts';
import { generateLlmJson } from './llmClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

/** The parts of a recipe this task reads. Amounts are left out on purpose: they don't change the answer. */
export type AppliancesRecipeInput = {
  title?: unknown;
  ingredients?: unknown;
  instructions?: unknown;
};

export type DeriveAppliancesResult = {
  appliances: RecipeAppliance[] | null;
  /** Equipment the model named that has no catalog key, for growing the catalog (logged in metadata). */
  unmatched: string[];
  usage: GeminiUsageSnapshot | null;
  error?: string;
};

const MAX_TITLE = 200;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT_NAME = 80;
const MAX_STEPS = 40;
const MAX_STEP_TEXT = 600;
const MAX_UNMATCHED = 10;

/** ADR 017 decision 5: Pinch tips stay off until product decides. Set APPLIANCE_TIPS_ENABLED=true to test. */
export function applianceTipsEnabled(): boolean {
  return Deno.env.get('APPLIANCE_TIPS_ENABLED')?.trim().toLowerCase() === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Numbered steps as the model will see them. The step numbers here are the only ones an appliance
 * may cite, so the same list is used to build the prompt and to sanitize the answer.
 */
export function numberedSteps(instructions: unknown): Array<{ step: number; text: string }> {
  if (!Array.isArray(instructions)) return [];
  const steps: Array<{ step: number; text: string }> = [];
  const seen = new Set<number>();
  instructions.slice(0, MAX_STEPS).forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const text = clean(raw.text, MAX_STEP_TEXT);
    if (!text) return;
    const declared = raw.step;
    const step = Number.isInteger(declared) && (declared as number) > 0 ? (declared as number) : index + 1;
    if (seen.has(step)) return;
    seen.add(step);
    steps.push({ step, text });
  });
  return steps;
}

export function buildAppliancesUserText(recipe: AppliancesRecipeInput): string {
  const title = clean(recipe.title, MAX_TITLE);
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
        .slice(0, MAX_INGREDIENTS)
        .map((raw) => (isRecord(raw) ? clean(raw.name, MAX_INGREDIENT_NAME) : ''))
        .filter(Boolean)
    : [];
  const steps = numberedSteps(recipe.instructions);
  return [
    `Title: ${title || '(untitled)'}`,
    `Ingredients:\n${ingredients.map((name) => `- ${name}`).join('\n') || '(none listed)'}`,
    `Steps:\n${steps.map((s) => `${s.step}. ${s.text}`).join('\n')}`,
  ].join('\n\n');
}

export function buildAppliancesSystemPrompt(tipsEnabled: boolean): string {
  const tips = tipsEnabled
    ? `
You may also add up to 2 Pinch tips: origin "tip", required false, only from mortar_and_pestle,
kitchen_thermometer, kitchen_scale, zester, cast_iron_pan, with a benefit and the step where it helps.
Only add a tip when it clearly improves the result (e.g. a thermometer for a roast). Everything else is origin "source".`
    : `
Every item has origin "source".`;

  return `You list the kitchen appliances and tools a recipe uses, using only the keys in the schema.

Read only the recipe given. Every item cites the step numbers whose text names the appliance or clearly implies it:
- bake, roast, or an oven temperature → oven
- simmer, boil, sauté, pan-fry → stovetop
- "blend until smooth" → blender, with alternative immersion_blender, unless the step names one
- pressure cook → pressure_cooker; slow cook → slow_cooker; air fry → air_fryer; deep fry → deep_fryer
- whip to stiff peaks, cream butter and sugar → stand_mixer or hand_mixer, optional, alternative by_hand
- grind or pound spices → mortar_and_pestle or spice_grinder
- cook to an internal temperature → kitchen_thermometer, optional, alternative cut_to_check

required true: a step cannot be done at home without it.
required false: it helps but there is a workaround. Give the benefit it brings and, when one exists, the alternative (by_hand, pre_ground, cut_to_check, or another key).
When a step offers two ("bake, or air fry"), list the first and put the second in alternative.

Never list: knives, plain pots and pans, bowls, cutting boards, spoons, whisks, baking sheets or other basics (cast_iron_pan, dutch_oven and wok only when a step names them); equipment mentioned only in the title or ingredients; anything you would have to guess. If unsure, leave it out.
If nothing qualifies, return an empty appliances list.
unlisted: real equipment the steps need that has no key (e.g. "pasta machine"), in the recipe's wording. Leave it empty otherwise.${tips}
Return ONLY data matching the schema.`;
}

export function buildAppliancesSchema(tipsEnabled: boolean): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      appliances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: APPLIANCE_KEYS },
            required: { type: 'boolean' },
            benefit: { type: 'string', enum: BENEFIT_KEYS },
            alternative: { type: 'string', enum: [...APPLIANCE_KEYS, ...ALTERNATIVE_KEYS] },
            steps: { type: 'array', items: { type: 'integer' } },
            origin: { type: 'string', enum: tipsEnabled ? ['source', 'tip'] : ['source'] },
          },
          required: ['key', 'required', 'steps', 'origin'],
        },
      },
      unlisted: { type: 'array', items: { type: 'string' } },
    },
    required: ['appliances', 'unlisted'],
  };
}

/** Names with no catalog key, cleaned for logging. Names that do resolve are dropped: the model should have used the key. */
export function unmatchedApplianceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .map((name) => clean(name, 60))
    .filter((name) => name && resolveApplianceKey(name) === null);
  return [...new Set(names.map((name) => name.toLowerCase()))].slice(0, MAX_UNMATCHED);
}

export async function deriveRecipeAppliances(
  recipe: AppliancesRecipeInput,
  options: { tipsEnabled?: boolean; timeoutMs?: number } = {},
): Promise<DeriveAppliancesResult> {
  const steps = numberedSteps(recipe.instructions);
  // Nothing to ground appliances in (e.g. a partial recipe with no steps): skip the call.
  if (steps.length === 0) return { appliances: null, unmatched: [], usage: null };

  const tipsEnabled = options.tipsEnabled ?? applianceTipsEnabled();
  try {
    const { data, usage } = await generateLlmJson<{ appliances?: unknown; unlisted?: unknown }>({
      kind: 'appliances',
      systemPrompt: buildAppliancesSystemPrompt(tipsEnabled),
      parts: [{ text: buildAppliancesUserText(recipe) }],
      responseSchema: buildAppliancesSchema(tipsEnabled),
      timeoutMs: options.timeoutMs ?? 15_000,
      maxOutputTokens: 800,
      context: 'recipeAppliances.ts: deriveRecipeAppliances',
    });
    return {
      appliances: sanitizeRecipeAppliances(
        isRecord(data) ? data.appliances : undefined,
        steps.map((s) => s.step),
        { allowTips: tipsEnabled },
      ),
      unmatched: isRecord(data) ? unmatchedApplianceNames(data.unlisted) : [],
      usage,
    };
  } catch (error) {
    console.warn('[appliances] derive failed; saving as not analysed', error);
    return {
      appliances: null,
      unmatched: [],
      usage: null,
      error: error instanceof Error ? error.message.slice(0, 200) : 'appliances_failed',
    };
  }
}
