import type { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import type { RecipeCard } from '@/types/recipeCard';
import type { Platform, Recipe } from '@/types/recipe';

export function recipeCardToExtracted(card: RecipeCard): ExtractedRecipe {
  return {
    title: card.title,
    original_url: card.original_url,
    platform: card.platform,
    image_url: card.image_url ?? undefined,
    source_video_url: card.source_video_url ?? undefined,
    ingredients: card.ingredients ?? [],
    instructions: card.instructions ?? [],
    servings: card.servings >= 1 ? card.servings : 1,
    calories: card.calories ?? undefined,
    estimated_time_minutes: card.estimated_time_minutes ?? undefined,
    cost_estimate: card.cost_estimate ?? undefined,
    effort_level: card.effort_level ?? undefined,
    extraction_status: card.extraction_status,
    extraction_source: card.extraction_source ?? undefined,
    tags: card.tags ?? [],
    source_language: card.source_language ?? 'en',
  };
}

export function recipeCardToListRecipe(card: RecipeCard): Recipe {
  return {
    id: card.id,
    title: card.title,
    original_url: card.original_url,
    platform: card.platform as Platform,
    image_url: card.image_url ?? undefined,
    source_video_url: card.source_video_url ?? undefined,
    ingredients: card.ingredients ?? [],
    instructions: card.instructions ?? [],
    servings: card.servings >= 1 ? card.servings : 1,
    calories: card.calories ?? undefined,
    estimated_time_minutes: card.estimated_time_minutes ?? undefined,
    cost_estimate: card.cost_estimate ?? undefined,
    effort_level: card.effort_level ?? undefined,
    extraction_status: card.extraction_status,
    extraction_source: card.extraction_source ?? undefined,
    tags: card.tags ?? [],
    source_language: card.source_language ?? 'en',
    created_at: card.created_at,
  };
}
