/**
 * repair-recipe's request and recipe handling: reading the partial recipe the app sends, the source text that helps
 * fill it, and the repaired recipe the preview returns (sealed until the credit is committed).
 */
import type { RecipeClassifyStatus } from './classifyRecipe.ts';
import type { PlatformMeta } from './platformMeta.ts';
import type { Platform } from './platform.ts';
import type { PageReadEvent } from './pageReader.ts';
import type { LlmRecipe } from './recipeExtraction.ts';
import { fetchFacebookMeta } from './sources/facebook.ts';
import { fetchInstagramMeta } from './sources/instagram.ts';
import { fetchPinterestMeta } from './sources/pinterest.ts';
import { fetchTikTokMeta } from './sources/tiktok.ts';
import { fetchYouTubeMeta } from './sources/youtube.ts';
import { fetchWebRecipeMeta } from './webRecipe.ts';
import type { RecipeAppliance } from '../recipes/enrich/appliances.ts';
import { normalizeStoredCalories } from '../recipes/calories.ts';
import { parseIngredientAmount } from '../recipes/ingredientAmounts.ts';
import { normalizeStoredNutrition } from '../recipes/nutrition.ts';
import { fitRecipeToLimits } from '../recipes/recipeLimits.ts';
import { normalizeRecipeTags } from '../recipes/tags.ts';

export const MAX_REPAIR_BODY_BYTES = 96_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;

interface RepairIngredient {
  name?: string;
  quantity?: number;
  unit?: string;
  metric?: { quantity?: number; unit?: string };
  spoons?: { quantity?: number; unit?: string };
}

export interface RepairRequestBody {
  action?: string;
  reservation_id?: string;
  /** The `sealed_recipe` from generate, handed back on commit. */
  sealed_recipe?: string;
  original_url?: string;
  guest_install_id?: string;
  guestInstallId?: string;
  request_id?: string;
  requestId?: string;
  recipe?: {
    title?: string;
    servings?: number;
    ingredients?: RepairIngredient[];
    instructions?: { step?: number; text?: string; timestamp_seconds?: number }[];
    calories?: number;
    estimated_time_minutes?: number;
    cost_estimate?: string;
    effort_level?: string;
    tags?: string[];
    source_language?: string;
  };
}

/** The partial recipe from the request, or null when it is missing or over the limits. */
export function toLlmRecipe(raw: RepairRequestBody['recipe']): LlmRecipe | null {
  if (!raw?.title?.trim()) return null;
  if (raw.title.trim().length > MAX_TITLE_CHARS) return null;
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length > MAX_INGREDIENTS) return null;
  if (!Array.isArray(raw.instructions) || raw.instructions.length > MAX_INSTRUCTIONS) return null;

  const ingredients = raw.ingredients
    .filter((item) => typeof item?.name === 'string' && item.name.trim())
    .map((item) => ({
      name: item.name!.trim(),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0,
      unit: typeof item.unit === 'string' ? item.unit.trim() : '',
      metric: parseIngredientAmount(item.metric),
      spoons: parseIngredientAmount(item.spoons),
    }));
  const instructions = raw.instructions
    .filter((step) => typeof step?.text === 'string' && step.text.trim())
    .map((step, index) => ({
      step: typeof step.step === 'number' && Number.isInteger(step.step) ? step.step : index + 1,
      text: step.text!.trim(),
      timestamp_seconds: step.timestamp_seconds,
    }));

  const servings =
    typeof raw.servings === 'number' && Number.isInteger(raw.servings) && raw.servings > 0
      ? raw.servings
      : 1;

  return {
    found_recipe: true,
    source_language: typeof raw.source_language === 'string' ? raw.source_language : 'en',
    title: raw.title.trim(),
    servings,
    ingredients,
    instructions,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    estimated_time_minutes:
      typeof raw.estimated_time_minutes === 'number' ? raw.estimated_time_minutes : undefined,
    cost_estimate:
      raw.cost_estimate === '$' || raw.cost_estimate === '$$' || raw.cost_estimate === '$$$'
        ? raw.cost_estimate
        : undefined,
    effort_level:
      raw.effort_level === 'Easy' || raw.effort_level === 'Medium' || raw.effort_level === 'Hard'
        ? raw.effort_level
        : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

/** The source's description, captions and top comments, as text for the repair prompt. */
export function buildExtraText(meta: PlatformMeta): string {
  const parts: string[] = [];
  if (meta.description?.trim()) parts.push(meta.description.trim());
  if (meta.captions?.trim()) parts.push(meta.captions.trim());
  for (const comment of meta.topComments.slice(0, 12)) {
    parts.push(
      comment.isCreator ? `(from the video's creator) ${comment.text}` : comment.text,
    );
  }
  return parts.join('\n\n');
}

export async function fetchPlatformMeta(
  platform: Platform,
  url: string,
  contentId: string | null,
  onPageRead?: (event: PageReadEvent) => Promise<void>,
): Promise<PlatformMeta> {
  switch (platform) {
    case 'youtube':
      return contentId ? await fetchYouTubeMeta(contentId) : { topComments: [] };
    case 'instagram':
      return await fetchInstagramMeta(url);
    case 'tiktok':
      return await fetchTikTokMeta(url);
    case 'facebook':
      return await fetchFacebookMeta(url);
    case 'pinterest':
      return await fetchPinterestMeta(url, { onPageRead });
    case 'web':
      return await fetchWebRecipeMeta(url, { onPageRead });
    default:
      return { topComments: [] };
  }
}

/** The repaired recipe as the app stores it: the repair's fields, falling back to the draft's, within the limits. */
export function repairedRecipe(
  current: LlmRecipe,
  after: LlmRecipe,
  classified: { status: RecipeClassifyStatus; missingFields: string[] },
  appliances: RecipeAppliance[] | null,
) {
  return fitRecipeToLimits({
    title: after.title,
    source_language: normalizeLanguageCode(after.source_language),
    ingredients: after.ingredients,
    instructions: after.instructions,
    servings: after.servings > 0 ? after.servings : current.servings || 1,
    calories: normalizeStoredCalories(
      after.calories ?? null,
      after.servings > 0 ? after.servings : current.servings || 1,
    ),
    nutrition: normalizeStoredNutrition(after, after.servings > 0 ? after.servings : current.servings || 1),
    estimated_time_minutes: after.estimated_time_minutes ?? current.estimated_time_minutes ?? null,
    cost_estimate: after.cost_estimate ?? current.cost_estimate ?? null,
    effort_level: after.effort_level ?? current.effort_level ?? null,
    extraction_status: classified.status,
    calories_reasoning: after.calories_reasoning?.trim() || null,
    time_reasoning: after.time_reasoning?.trim() || null,
    tags: normalizeRecipeTags(after.tags?.length ? after.tags : current.tags),
    missing_fields: classified.missingFields,
    appliances,
  });
}

function normalizeLanguageCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : 'en';
}
