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

export type HubPlatform = 'youtube' | 'instagram' | 'tiktok' | 'web';

export interface RecipeCard {
  id: string;
  canonical_key: string;
  canonical_url: string;
  original_url: string;
  platform: HubPlatform;
  title: string;
  image_url?: string | null;
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
  created_at: string;
  updated_at?: string;
}
