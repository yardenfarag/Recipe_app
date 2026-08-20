export type EffortLevel = 'Easy' | 'Medium' | 'Hard';
export type CostEstimate = '$' | '$$' | '$$$';
export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'web' | 'unknown';
export type ExtractionStatus = 'full' | 'partial';
/** Which content-ladder rung yielded the recipe (ADR 004). */
export type ExtractionSource = 'description' | 'comments' | 'captions' | 'video' | 'web';

/** One measured amount, used for grams/spoons toggle values. */
export interface IngredientAmount {
  quantity: number;
  unit: string;
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  /** Weight (g/kg) for solids or volume (ml/liter) for liquids — set at extraction. */
  metric?: IngredientAmount;
  /** Cups / tablespoons / teaspoons (or a count) — set at extraction. */
  spoons?: IngredientAmount;
}

export interface Instruction {
  step: number;
  text: string;
  /** Seconds into the source video where this step begins (video extraction). */
  timestamp_seconds?: number;
}

/** Cached translation of recipe text fields (not servings/calories). */
export interface RecipeTranslationContent {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

/** Mirrors the `recipes` table (supabase/migrations/0001_init.sql + later). */
export interface Recipe {
  id: string;
  user_id?: string; // absent for guest (local-only) recipes — ADR 002
  title: string;
  original_url?: string;
  platform?: Platform;
  image_url?: string;
  /**
   * Optional playable video for cook-along when `platform` is `web`
   * (e.g. a YouTube embed found on the recipe page).
   */
  source_video_url?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  calories?: number;
  estimated_time_minutes?: number;
  cost_estimate?: CostEstimate;
  effort_level?: EffortLevel;
  extraction_status: ExtractionStatus;
  extraction_source?: ExtractionSource;
  /** Gemini reasoning for the calorie estimate — stored for QA, not shown in MVP UI. */
  calories_reasoning?: string;
  /** Gemini reasoning for the time estimate — stored for QA, not shown in MVP UI. */
  time_reasoning?: string;
  /** Short lowercase labels (cuisine, meal, dish type, etc.) for browsing / trends. */
  tags?: string[];
  missing_fields?: string[];
  migrated_from_guest?: boolean;
  /** Quick-access pin in the library Favorites section. */
  is_favorite?: boolean;
  created_at?: string;
  /** Language of canonical title/ingredients/instructions (ADR 012). */
  source_language?: string;
  /**
   * Guest / client cache of translations keyed by language code.
   * Cloud recipes use `recipe_translations`; this field is hydrated for list titles.
   */
  translations?: Record<string, RecipeTranslationContent>;
  /** Client-only: preferred-language title for library rows. */
  display_title?: string;
}
