/** recipe-share's copy of a recipe (the `snapshot` column of recipe_shares), and what is made from it. */
import { toJson } from '../core/supabaseAdmin.ts';
import { recipeAppliancesOf } from './enrich/appliances.ts';
import { fitNutrition } from './recipeLimits.ts';

const TOKEN_BYTES = 18;

export interface RecipeSnapshot {
  title: string;
  original_url?: string | null;
  platform?: string | null;
  image_url?: string | null;
  source_video_url?: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories?: number | null;
  /** PIN-80. Absent in shares created before it, which show no macros. */
  nutrition?: unknown;
  estimated_time_minutes?: number | null;
  cost_estimate?: string | null;
  effort_level?: string | null;
  extraction_status: string;
  extraction_source?: string | null;
  tags?: string[] | null;
  missing_fields?: string[] | null;
  source_language?: string | null;
  calories_reasoning?: string | null;
  time_reasoning?: string | null;
  /** ADR 017. Absent in shares created before PIN-26, which read as "not analysed". */
  appliances?: unknown;
}

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function snapshotFromRecipe(row: Record<string, unknown>): RecipeSnapshot {
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) throw new Error('Recipe is missing a title');

  return {
    title,
    original_url: typeof row.original_url === 'string' ? row.original_url : null,
    platform: typeof row.platform === 'string' ? row.platform : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    source_video_url: typeof row.source_video_url === 'string' ? row.source_video_url : null,
    ingredients: row.ingredients ?? [],
    instructions: row.instructions ?? [],
    servings: typeof row.servings === 'number' && row.servings >= 1 ? row.servings : 1,
    calories: typeof row.calories === 'number' ? row.calories : null,
    nutrition: typeof row.calories === 'number' ? fitNutrition(row.nutrition) : null,
    estimated_time_minutes:
      typeof row.estimated_time_minutes === 'number' ? row.estimated_time_minutes : null,
    cost_estimate: typeof row.cost_estimate === 'string' ? row.cost_estimate : null,
    effort_level: typeof row.effort_level === 'string' ? row.effort_level : null,
    extraction_status:
      typeof row.extraction_status === 'string' ? row.extraction_status : 'full',
    extraction_source: typeof row.extraction_source === 'string' ? row.extraction_source : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : null,
    missing_fields: Array.isArray(row.missing_fields) ? (row.missing_fields as string[]) : null,
    source_language: typeof row.source_language === 'string' ? row.source_language : 'en',
    calories_reasoning: typeof row.calories_reasoning === 'string' ? row.calories_reasoning : null,
    time_reasoning: typeof row.time_reasoning === 'string' ? row.time_reasoning : null,
    appliances: recipeAppliancesOf(row),
  };
}

/** What a viewer of the link gets: empty fields are left out. */
export function publicSnapshot(snapshot: RecipeSnapshot) {
  return {
    title: snapshot.title,
    original_url: snapshot.original_url ?? undefined,
    platform: snapshot.platform ?? undefined,
    image_url: snapshot.image_url ?? undefined,
    source_video_url: snapshot.source_video_url ?? undefined,
    ingredients: snapshot.ingredients,
    instructions: snapshot.instructions,
    servings: snapshot.servings,
    calories: snapshot.calories ?? undefined,
    nutrition: toJson(snapshotNutrition(snapshot)),
    estimated_time_minutes: snapshot.estimated_time_minutes ?? undefined,
    cost_estimate: snapshot.cost_estimate ?? undefined,
    effort_level: snapshot.effort_level ?? undefined,
    extraction_status: snapshot.extraction_status,
    extraction_source: snapshot.extraction_source ?? undefined,
    tags: snapshot.tags ?? undefined,
    missing_fields: snapshot.missing_fields ?? undefined,
    source_language: snapshot.source_language ?? undefined,
    appliances: toJson(snapshotAppliances(snapshot)),
  };
}

/** Stored JSON too: macros only next to calories, in the stored shape. */
function snapshotNutrition(snapshot: RecipeSnapshot) {
  return typeof snapshot.calories === 'number' ? fitNutrition(snapshot.nutrition) : null;
}

/** Snapshots are stored JSON, so clean the list again on the way out. */
function snapshotAppliances(snapshot: RecipeSnapshot) {
  return recipeAppliancesOf(snapshot);
}

/** The recipes row a claim inserts: the claimer's own copy. */
export function insertRowFromSnapshot(userId: string, snapshot: RecipeSnapshot) {
  return {
    user_id: userId,
    title: snapshot.title,
    original_url: snapshot.original_url ?? null,
    platform: snapshot.platform ?? null,
    image_url: snapshot.image_url ?? null,
    source_video_url: snapshot.source_video_url ?? null,
    ingredients: toJson(snapshot.ingredients ?? []),
    instructions: toJson(snapshot.instructions ?? []),
    servings: snapshot.servings,
    calories: snapshot.calories ?? null,
    nutrition: toJson(snapshotNutrition(snapshot)),
    estimated_time_minutes: snapshot.estimated_time_minutes ?? null,
    cost_estimate: snapshot.cost_estimate ?? null,
    effort_level: snapshot.effort_level ?? null,
    extraction_status: snapshot.extraction_status || 'full',
    extraction_source: snapshot.extraction_source ?? null,
    tags: snapshot.tags ?? [],
    missing_fields: snapshot.missing_fields ?? null,
    source_language: snapshot.source_language ?? 'en',
    calories_reasoning: snapshot.calories_reasoning ?? null,
    time_reasoning: snapshot.time_reasoning ?? null,
    appliances: toJson(snapshotAppliances(snapshot)),
    is_favorite: false,
    migrated_from_guest: false,
  };
}
