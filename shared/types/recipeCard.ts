import type { RecipeAppliance } from '../lib/appliances';
import type {
  CostEstimate,
  EffortLevel,
  ExtractionSource,
  ExtractionStatus,
  Ingredient,
  Instruction,
  RecipeNutrition,
} from './recipe';

export type HubPlatform = 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'web';

export interface RecipeCard {
  id: string;
  canonical_key: string;
  canonical_url: string;
  original_url: string;
  platform: HubPlatform;
  title: string;
  image_url?: string | null;
  /** image_url is a picture Pinch drew, not a photo of the dish. */
  image_generated?: boolean | null;
  source_video_url?: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  calories?: number | null;
  /** PIN-80. null or absent = not estimated. */
  nutrition?: RecipeNutrition | null;
  estimated_time_minutes?: number | null;
  cost_estimate?: CostEstimate | null;
  effort_level?: EffortLevel | null;
  extraction_status: ExtractionStatus;
  extraction_source?: ExtractionSource | null;
  tags: string[];
  source_language?: string | null;
  /** ADR 017. null or absent = not analysed. */
  appliances?: RecipeAppliance[] | null;
  save_count: number;
  extract_hit_count: number;
  /** Kitchen-profile diets the card fits as written (PIN-83). null = not checked yet. */
  diets?: string[] | null;
  /** Allergen and one-tap dislike keys the card has as written (PIN-180). null = not checked yet. */
  contains?: string[] | null;
  created_at: string;
  updated_at?: string;
}
