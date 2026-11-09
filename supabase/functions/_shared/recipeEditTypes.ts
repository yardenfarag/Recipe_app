/**
 * Server copy of the save-recipe-edit contract (PIN-79, ADR 018). Deno can't import `@/` paths,
 * so this mirrors src/lib/supabase/saveRecipeEdit.ts and the PIN-79 parts of src/types/recipe.ts.
 * Change both sides together.
 *
 * parseSaveRecipeEditRequest turns the untrusted JSON body into these types. It only checks
 * shapes; the hard limits (lengths, counts, ranges) run in recipeEditPlan.ts.
 */

import type { RecipeAppliance } from './appliances.ts';

export type { RecipeAppliance };

export type EffortLevel = 'Easy' | 'Medium' | 'Hard';
export type CostEstimate = '$' | '$$' | '$$$';

/** Matches the recipes_locked_fields_known CHECK. */
export const LOCKABLE_FIELDS = [
  'calories',
  'estimated_time_minutes',
  'effort_level',
  'cost_estimate',
  'tags',
  'appliances',
] as const;
export type LockedField = (typeof LOCKABLE_FIELDS)[number];

/** Matches the recipes_recalc_pending_known CHECK. */
export const RECALC_FIELDS = [...LOCKABLE_FIELDS, 'ingredient_amounts'] as const;
export type RecalcField = (typeof RECALC_FIELDS)[number];

/** src/lib/appLanguages.ts APP_LANGUAGES codes. */
export const APP_LANGUAGE_CODES = ['ar', 'en', 'es', 'he', 'ru'] as const;
export type AppLanguageCode = (typeof APP_LANGUAGE_CODES)[number];

export interface IngredientAmount {
  quantity: number;
  unit: string;
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  metric?: IngredientAmount;
  spoons?: IngredientAmount;
}

export interface Instruction {
  step: number;
  text: string;
  timestamp_seconds?: number;
}

export type RecipeEditPhoto =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; base64: string; mime_type: string };

export interface RecipeEditContent {
  title: string;
  photo: RecipeEditPhoto;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  estimated_time_minutes: number | null;
  calories: number | null;
  effort_level: EffortLevel | null;
  cost_estimate: CostEstimate | null;
  tags: string[];
  appliances: RecipeAppliance[] | null;
  cook_note: string | null;
}

export type SaveRecipeEditRequest =
  | {
      mode: 'edit';
      recipe_id: string;
      content: RecipeEditContent;
      locked_fields: LockedField[];
      step_sources: (number | null)[];
      ingredient_sources: (number | null)[];
      app_language: string;
    }
  | {
      mode: 'write';
      content: RecipeEditContent;
      locked_fields: LockedField[];
      app_language: string;
    }
  | {
      mode: 'import';
      content: RecipeEditContent;
      locked_fields: LockedField[];
      source: RecipeImportSource;
      app_language: string;
    }
  | { mode: 'retry'; recipe_id: string; app_language: string };

/** Where a partial import came from (ADR 019). The editor finishes it; the source can't change. */
export interface RecipeImportSource {
  original_url: string | null;
  platform: ImportPlatform;
  extraction_source: ImportExtractionSource;
  image_url: string | null;
  source_video_url: string | null;
  source_language: string | null;
}

/** The recipes_platform_check values an import can have. */
export const IMPORT_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'web', 'photo'] as const;
export type ImportPlatform = (typeof IMPORT_PLATFORMS)[number];

/** The recipes_extraction_source_check values extract-recipe produces. */
export const IMPORT_EXTRACTION_SOURCES = ['description', 'comments', 'captions', 'video', 'web', 'photo'] as const;
export type ImportExtractionSource = (typeof IMPORT_EXTRACTION_SOURCES)[number];

export type RecipeEditField =
  /** The whole recipe (a written recipe that isn't a recipe, or isn't safe). Never has an index. */
  | 'recipe'
  | 'title'
  | 'photo'
  | 'servings'
  | 'ingredients'
  | 'instructions'
  | 'estimated_time_minutes'
  | 'calories'
  | 'tags'
  | 'cook_note';

export interface RecipeEditLimitError {
  field: RecipeEditField;
  index?: number;
  code: 'required' | 'too_long' | 'too_many' | 'out_of_range';
}

/**
 * A reason on `ingredients` or `instructions` WITHOUT an index is about the whole recipe
 * (the app's `recipeEditor.blocked.<code>.recipe` message). The contract has no 'recipe' field.
 */
export interface RecipeEditBlockReason {
  field: RecipeEditField;
  index?: number;
  code: 'not_recipe' | 'unsafe' | 'spam';
}

export type SaveRecipeEditResult =
  | {
      status: 'saved';
      recipe: Record<string, unknown>;
      recalculating: RecalcField[];
      recalculation: 'started' | 'none' | 'limited';
    }
  | { status: 'blocked'; reasons: RecipeEditBlockReason[] }
  | { status: 'invalid'; errors: RecipeEditLimitError[] }
  | {
      status: 'failed';
      code: 'auth_required' | 'not_found' | 'server_error' | 'network';
      message: string;
    };

// --- Parsing ----------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Non-numbers become NaN so the hard limits report them as out of range. */
function num(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function amount(value: unknown): IngredientAmount | undefined {
  if (!isRecord(value)) return undefined;
  const quantity = num(value.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return undefined;
  return { quantity, unit: str(value.unit).slice(0, 40) };
}

function parseIngredient(value: unknown): Ingredient {
  const item = isRecord(value) ? value : {};
  const metric = amount(item.metric);
  const spoons = amount(item.spoons);
  return {
    name: str(item.name),
    quantity: num(item.quantity),
    unit: str(item.unit).slice(0, 40),
    ...(metric ? { metric } : {}),
    ...(spoons ? { spoons } : {}),
  };
}

function parseInstruction(value: unknown, index: number): Instruction {
  const item = isRecord(value) ? value : {};
  const ts = item.timestamp_seconds;
  return {
    step: index + 1,
    text: str(item.text),
    ...(typeof ts === 'number' && Number.isFinite(ts) && ts >= 0 ? { timestamp_seconds: Math.round(ts) } : {}),
  };
}

function parsePhoto(value: unknown): RecipeEditPhoto | null {
  if (!isRecord(value)) return { action: 'keep' };
  if (value.action === 'keep' || value.action === undefined) return { action: 'keep' };
  if (value.action === 'remove') return { action: 'remove' };
  if (value.action === 'replace' && typeof value.base64 === 'string') {
    return { action: 'replace', base64: value.base64, mime_type: str(value.mime_type) || 'image/jpeg' };
  }
  return null;
}

function parseContent(value: unknown): RecipeEditContent | null {
  if (!isRecord(value)) return null;
  const photo = parsePhoto(value.photo);
  if (!photo) return null;
  if (!Array.isArray(value.ingredients) || !Array.isArray(value.instructions)) return null;
  const effort = value.effort_level;
  const cost = value.cost_estimate;
  return {
    title: str(value.title),
    photo,
    servings: num(value.servings),
    ingredients: value.ingredients.map(parseIngredient),
    // Renumbered 1..n here too, so a client bug can't store duplicate step numbers.
    instructions: value.instructions.map(parseInstruction),
    estimated_time_minutes: nullableNum(value.estimated_time_minutes),
    calories: nullableNum(value.calories),
    effort_level: effort === 'Easy' || effort === 'Medium' || effort === 'Hard' ? effort : null,
    cost_estimate: cost === '$' || cost === '$$' || cost === '$$$' ? cost : null,
    tags: Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === 'string') : [],
    // Cleaned against the steps by sanitizeRecipeAppliances in the handler.
    appliances: Array.isArray(value.appliances) ? (value.appliances as RecipeAppliance[]) : null,
    cook_note: typeof value.cook_note === 'string' ? value.cook_note : null,
  };
}

function parseLocked(value: unknown): LockedField[] {
  if (!Array.isArray(value)) return [];
  return LOCKABLE_FIELDS.filter((field) => value.includes(field));
}

function parseSources(value: unknown, length: number): (number | null)[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const out: (number | null)[] = [];
  for (const entry of value) {
    if (entry === null) out.push(null);
    else if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0) out.push(entry);
    else return null;
  }
  return out;
}

function httpUrl(value: unknown, max = 2048): string | null {
  const text = str(value).trim();
  if (!text || text.length > max) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? text : null;
  } catch {
    return null;
  }
}

function parseImportSource(value: unknown): RecipeImportSource | null {
  if (!isRecord(value)) return null;
  const platform = IMPORT_PLATFORMS.find((p) => p === value.platform);
  const extraction_source = IMPORT_EXTRACTION_SOURCES.find((s) => s === value.extraction_source);
  if (!platform || !extraction_source) return null;
  const original_url = httpUrl(value.original_url);
  // Only a photo import has no link.
  if (!original_url && platform !== 'photo') return null;
  const language = str(value.source_language).trim().toLowerCase();
  return {
    original_url,
    platform,
    extraction_source,
    image_url: httpUrl(value.image_url),
    source_video_url: httpUrl(value.source_video_url),
    source_language: /^[a-z]{2,3}$/.test(language) ? language : null,
  };
}

function parseRecipeId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value.trim()) ? value.trim() : null;
}

function parseAppLanguage(value: unknown): string {
  const code = str(value).trim().toLowerCase().split(/[-_]/)[0];
  return (APP_LANGUAGE_CODES as readonly string[]).includes(code) ? code : 'en';
}

/** Shape check of the request body. Returns null when it can't be a save-recipe-edit request. */
export function parseSaveRecipeEditRequest(raw: unknown): SaveRecipeEditRequest | null {
  if (!isRecord(raw)) return null;
  const app_language = parseAppLanguage(raw.app_language);
  if (raw.mode === 'retry') {
    const recipe_id = parseRecipeId(raw.recipe_id);
    return recipe_id ? { mode: 'retry', recipe_id, app_language } : null;
  }
  const content = parseContent(raw.content);
  if (!content) return null;
  const locked_fields = parseLocked(raw.locked_fields);
  if (raw.mode === 'write') return { mode: 'write', content, locked_fields, app_language };
  if (raw.mode === 'import') {
    const source = parseImportSource(raw.source);
    return source ? { mode: 'import', content, locked_fields, source, app_language } : null;
  }
  if (raw.mode !== 'edit') return null;
  const recipe_id = parseRecipeId(raw.recipe_id);
  const step_sources = parseSources(raw.step_sources, content.instructions.length);
  const ingredient_sources = parseSources(raw.ingredient_sources, content.ingredients.length);
  if (!recipe_id || !step_sources || !ingredient_sources) return null;
  return { mode: 'edit', recipe_id, content, locked_fields, step_sources, ingredient_sources, app_language };
}
