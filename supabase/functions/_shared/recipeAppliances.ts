/**
 * The `appliances` task (ADR 017 decisions 5–6): a small model call over the finished recipe that
 * lists the kitchen appliances it uses, plus a yes/no check of any Pinch tips it proposes. It runs
 * after extract, invent, repair and remix, and in the admin backfill.
 *
 * It never throws. Any failure (no API key, timeout, bad JSON, nothing valid) gives
 * `appliances: null`, which the app treats as "not analysed", so a Snap never fails because of it.
 * A failed tip check only drops the tips.
 */

import {
  ALTERNATIVE_KEYS,
  APPLIANCE_KEYS,
  type ApplianceKey,
  BENEFIT_KEYS,
  numberedSteps,
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
  /** One entry per model call made (the list call, plus the tip check when there were tips). */
  usages: GeminiUsageSnapshot[];
  tipsProposed: number;
  tipsKept: number;
  error?: string;
};

/** Tools a Pinch tip may suggest: ones that improve the result but are never needed (ADR 017). */
export const TIP_KEYS = [
  'mortar_and_pestle',
  'kitchen_thermometer',
  'kitchen_scale',
  'zester',
  'cast_iron_pan',
] as const satisfies readonly ApplianceKey[];

const TIP_KEY_SET = new Set<string>(TIP_KEYS);
const MAX_TITLE = 200;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT_NAME = 80;
const MAX_UNMATCHED = 10;

/** ADR 017 decision 5: tips are on. APPLIANCE_TIPS_ENABLED=false turns them off without a deploy. */
export function applianceTipsEnabled(): boolean {
  return Deno.env.get('APPLIANCE_TIPS_ENABLED')?.trim().toLowerCase() !== 'false';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
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
You may also add up to 2 Pinch tips: tools the recipe does not mention that clearly improve the result.
A tip has origin "tip", required false, a benefit, and the step it helps. Only use ${TIP_KEYS.join(', ')}.
Suggest a tip whenever one clearly applies, for example kitchen_thermometer (benefit juicier_meat) for meat or fish cooked to a doneness such as medium-rare, and kitchen_scale (benefit more_precise) for baking by weight.
Never suggest a tip that changes the ingredients or the steps. Everything the recipe itself uses has origin "source".`
    : `
Every item has origin "source".`;

  return `You list the kitchen appliances and tools a recipe uses, using only the keys in the schema.
The recipe may be in any language (for example Hebrew or English). Read it in its own language; answer only with keys.

Read only the recipe given. Every item cites the step numbers whose text names the appliance or clearly implies it:
- bake, roast, or an oven temperature → oven
- simmer, boil, sauté, sear, fry or cook in a pan or pot → stovetop
- sauté or brown inside a pressure cooker, slow cooker or air fryer → only that appliance, not stovetop
- "blend until smooth" → blender, with alternative immersion_blender, unless the step names one
- pressure cook → pressure_cooker; slow cook → slow_cooker; air fry → air_fryer; deep fry → deep_fryer
- whip to stiff peaks, cream butter and sugar → one of stand_mixer or hand_mixer (never both), optional, alternative by_hand
- grind or pound spices → mortar_and_pestle or spice_grinder, optional, benefit richer_flavor, alternative pre_ground
- cook to an internal temperature → kitchen_thermometer, optional, alternative cut_to_check

Every item MUST include all four of: key, required (true or false), steps, origin. Never leave out required.
required true: a step cannot be done at home without it.
required false: it helps but there is a workaround. Give the benefit it brings and, when one exists, the alternative (by_hand, pre_ground, cut_to_check, or another key).
When a step offers two ("bake, or air fry"), list the first and put the second in alternative.

Never list: knives, plain pots and pans, bowls, cutting boards, spoons, whisks, baking sheets or other basics (cast_iron_pan, dutch_oven and wok only when a step names them); equipment mentioned only in the title or ingredients; equipment a step names only to say it is not used or as an aside ("everyone uses an air fryer, but I bake it" → oven only); anything you would have to guess. If unsure, leave it out.
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
            key: { type: 'string', enum: APPLIANCE_KEYS, description: 'Catalog key of the appliance.' },
            // strict: false lets a model skip fields, and Luna skipped `required` until it was described (live check, 2026-10-23).
            required: {
              type: 'boolean',
              description: 'Always present. true = a step cannot be done at home without it; false = it helps but has a workaround.',
            },
            benefit: { type: 'string', enum: BENEFIT_KEYS, description: 'Only when required is false: why it is worth using.' },
            alternative: {
              type: 'string',
              enum: [...APPLIANCE_KEYS, ...ALTERNATIVE_KEYS],
              description: 'Optional workaround or second appliance the step offers.',
            },
            steps: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the steps that use it.' },
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

export const TIP_CHECK_SYSTEM_PROMPT = `You check suggested kitchen tools for one recipe.
The recipe may be in any language. For each suggestion, answer fits true only if using that tool in the cited step clearly improves this recipe's result and is practical for a home cook.
Answer fits false if the step would not benefit, if the tool does not suit this dish (for example a stand mixer for no-knead bread), or if you are unsure.
Return ONLY data matching the schema.`;

export function buildTipCheckUserText(recipe: AppliancesRecipeInput, tips: RecipeAppliance[]): string {
  const suggestions = tips
    .map((tip) => `- ${tip.key} (step ${tip.steps.join(', ')})${tip.benefit ? `: ${tip.benefit}` : ''}`)
    .join('\n');
  return `${buildAppliancesUserText(recipe)}\n\nSuggestions:\n${suggestions}`;
}

export const TIP_CHECK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: TIP_KEYS },
          fits: { type: 'boolean' },
        },
        required: ['key', 'fits'],
      },
    },
  },
  required: ['checks'],
};

/** Keys the check answered `fits: true` for. Anything missing, repeated as false, or malformed is a no. */
export function confirmedTipKeys(data: unknown): Set<string> {
  const confirmed = new Set<string>();
  const rejected = new Set<string>();
  if (!isRecord(data) || !Array.isArray(data.checks)) return confirmed;
  for (const check of data.checks) {
    if (!isRecord(check) || typeof check.key !== 'string') continue;
    if (check.fits === true) confirmed.add(check.key);
    else rejected.add(check.key);
  }
  for (const key of rejected) confirmed.delete(key);
  return confirmed;
}

/**
 * The model's appliance list. Luna occasionally nests it one level too deep,
 * {"appliances": {"appliances": [...]}} (eval, 2026-10-23), so unwrap that once.
 */
export function appliancesList(data: unknown): unknown {
  if (!isRecord(data)) return undefined;
  const list = data.appliances;
  if (isRecord(list) && Array.isArray(list.appliances)) return list.appliances;
  return list;
}

/** Names with no catalog key, cleaned for logging. Names that do resolve are dropped: the model should have used the key. */
export function unmatchedApplianceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .map((name) => clean(name, 60))
    .filter((name) => name && resolveApplianceKey(name) === null);
  return [...new Set(names.map((name) => name.toLowerCase()))].slice(0, MAX_UNMATCHED);
}

/**
 * What every Edge Function calls. Runs the task, adds its usages to the caller's `usages` so the cost
 * lands in the caller's ai_usage_events row, and returns fields for that row's metadata.
 */
export async function appliancesForRecipe(
  recipe: AppliancesRecipeInput,
  usages: GeminiUsageSnapshot[],
): Promise<{ appliances: RecipeAppliance[] | null; metadata: Record<string, unknown> }> {
  const result = await deriveRecipeAppliances(recipe);
  usages.push(...result.usages);
  const metadata: Record<string, unknown> = { appliances_count: result.appliances?.length ?? null };
  if (result.tipsProposed > 0) {
    metadata.appliance_tips_proposed = result.tipsProposed;
    metadata.appliance_tips_kept = result.tipsKept;
  }
  if (result.unmatched.length > 0) metadata.unmatched_appliances = result.unmatched;
  if (result.error) metadata.appliances_error = result.error;
  return { appliances: result.appliances, metadata };
}

/** True when two instruction lists read differently, so a remix needs its appliances re-derived. */
export function stepsChanged(before: unknown, after: unknown): boolean {
  const text = (list: unknown) => numberedSteps(list).map((s) => s.text.toLowerCase()).join('\n');
  return text(before) !== text(after);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.slice(0, 200) : fallback;
}

export async function deriveRecipeAppliances(
  recipe: AppliancesRecipeInput,
  options: { tipsEnabled?: boolean; timeoutMs?: number } = {},
): Promise<DeriveAppliancesResult> {
  const empty = { unmatched: [], usages: [], tipsProposed: 0, tipsKept: 0 };
  const steps = numberedSteps(recipe.instructions);
  // Nothing to ground appliances in (e.g. a partial recipe with no steps): skip the call.
  if (steps.length === 0) return { appliances: null, ...empty };

  const tipsEnabled = options.tipsEnabled ?? applianceTipsEnabled();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const usages: GeminiUsageSnapshot[] = [];

  let listed: RecipeAppliance[] | null;
  let unmatched: string[];
  try {
    const { data, usage } = await generateLlmJson<{ appliances?: unknown; unlisted?: unknown }>({
      kind: 'appliances',
      systemPrompt: buildAppliancesSystemPrompt(tipsEnabled),
      parts: [{ text: buildAppliancesUserText(recipe) }],
      responseSchema: buildAppliancesSchema(tipsEnabled),
      timeoutMs,
      maxOutputTokens: 800,
      context: 'recipeAppliances.ts: deriveRecipeAppliances',
    });
    usages.push(usage);
    listed = sanitizeRecipeAppliances(
      appliancesList(data),
      steps.map((s) => s.step),
      { allowTips: tipsEnabled },
    );
    unmatched = isRecord(data) ? unmatchedApplianceNames(data.unlisted) : [];
  } catch (error) {
    console.warn('[appliances] derive failed; saving as not analysed', error);
    return { appliances: null, ...empty, error: errorText(error, 'appliances_failed') };
  }

  // Tips may only be benefit tools; anything else the model labelled a tip is dropped.
  const proposedTips = (listed ?? []).filter((item) => item.origin === 'tip' && TIP_KEY_SET.has(item.key));
  const sourceItems = (listed ?? []).filter((item) => item.origin === 'source');
  if (listed === null || proposedTips.length === 0) {
    const appliances = listed === null ? null : sourceItems;
    return { appliances, unmatched, usages, tipsProposed: 0, tipsKept: 0 };
  }

  // Yarden's guardrail: the same model confirms each tip fits this recipe and step. No = dropped.
  let confirmed = new Set<string>();
  let tipError: string | undefined;
  try {
    const { data, usage } = await generateLlmJson<unknown>({
      kind: 'appliances',
      systemPrompt: TIP_CHECK_SYSTEM_PROMPT,
      parts: [{ text: buildTipCheckUserText(recipe, proposedTips) }],
      responseSchema: TIP_CHECK_SCHEMA,
      timeoutMs,
      maxOutputTokens: 200,
      context: 'recipeAppliances.ts: checkApplianceTips',
    });
    usages.push(usage);
    confirmed = confirmedTipKeys(data);
  } catch (error) {
    console.warn('[appliances] tip check failed; dropping tips', error);
    tipError = `tip_check: ${errorText(error, 'failed')}`;
  }

  const keptTips = proposedTips.filter((tip) => confirmed.has(tip.key));
  // Filter in place so the sanitizer's order (required first, then by step) is kept.
  const appliances = (listed ?? []).filter(
    (item) => item.origin === 'source' || keptTips.includes(item),
  );
  return {
    appliances,
    unmatched,
    usages,
    tipsProposed: proposedTips.length,
    tipsKept: keptTips.length,
    ...(tipError ? { error: tipError } : {}),
  };
}
