export type EffortLevel = 'Easy' | 'Medium' | 'Hard';
export type CostEstimate = '$' | '$$' | '$$$';
export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'unknown';
export type ExtractionStatus = 'full' | 'partial';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Instruction {
  step: number;
  text: string;
}

/** Mirrors the `recipes` table (supabase/migrations/0001_init.sql). */
export interface Recipe {
  id: string;
  user_id?: string; // absent for guest (local-only) recipes — ADR 002
  title: string;
  original_url?: string;
  platform?: Platform;
  image_url?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  calories?: number;
  estimated_time_minutes?: number;
  cost_estimate?: CostEstimate;
  effort_level?: EffortLevel;
  extraction_status: ExtractionStatus;
  missing_fields?: string[];
  migrated_from_guest?: boolean;
  created_at?: string;
}
