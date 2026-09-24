import type {
  CostEstimate,
  EffortLevel,
  ExtractionSource,
  ExtractionStatus,
  Ingredient,
  Instruction,
} from '@/types/recipe';

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
  estimated_time_minutes?: number | null;
  cost_estimate?: CostEstimate | null;
  effort_level?: EffortLevel | null;
  extraction_status: ExtractionStatus;
  extraction_source?: ExtractionSource | null;
  tags: string[];
  source_language?: string | null;
  save_count: number;
  extract_hit_count: number;
  created_at: string;
  updated_at?: string;
}
