/**
 * The first-recipes picker after onboarding: popular Hub recipes that fit what the cook told us (diets first, nothing
 * on their allergy or dislike list), to save at least one. Many new accounts never had a link at hand and left with
 * an empty Library (Nov 2026); this gets a recipe into it on day one, with no AI call and no credit. Both apps show it
 * (src/app/first-recipes.tsx, web/components/onboarding/FirstRecipesPicker.tsx).
 */
import { findAvoidMatches, type AvoidList } from './avoidList';
import type { KitchenProfile } from './kitchenProfile';
import { supabase } from './supabase/client';
import { claimHubCard, fetchHubCards } from './supabase/cookingHub';
import type { RecipeCard } from '../types/recipeCard';

/** How many recipes the picker offers. */
export const FIRST_RECIPES_SHOWN = 12;
/** How many it asks for before the Library opens. */
export const FIRST_RECIPES_MIN = 1;
/** How many Hub cards it reads to choose from (allergies can rule out many). */
const CANDIDATES = 60;

function avoidListOf(kitchen: KitchenProfile): AvoidList {
  return { allergies: kitchen.allergies, otherAllergies: kitchen.otherAllergies, dislikes: kitchen.dislikes };
}

function dietMatches(card: RecipeCard, diets: readonly string[]): number {
  if (diets.length === 0 || !card.diets) return 0;
  return card.diets.filter((diet) => diets.includes(diet)).length;
}

/**
 * Picks the cards to offer from Hub cards in popularity order. A card with anything on the avoid list is never
 * offered. With diets, cards that fit all of them come first, then cards that fit some; cards that fit none fill in
 * only when there aren't enough. Each group keeps the Hub's order. Cards without a picture go last.
 */
export function chooseFirstRecipes(
  cards: readonly RecipeCard[],
  kitchen: KitchenProfile,
  count = FIRST_RECIPES_SHOWN,
): RecipeCard[] {
  const avoid = avoidListOf(kitchen);
  const safe = cards.filter((card) => {
    const names = card.ingredients.map((ingredient) => ingredient.name ?? '').filter(Boolean);
    const matches = findAvoidMatches(names, avoid);
    return matches.allergies.length === 0 && matches.dislikes.length === 0;
  });

  const diets = kitchen.diets;
  const rank = (card: RecipeCard): number => {
    const fit = dietMatches(card, diets);
    const dietRank = diets.length === 0 ? 0 : fit === diets.length ? 0 : fit > 0 ? 1 : 2;
    return dietRank * 2 + (card.image_url ? 0 : 1);
  };
  return safe
    .map((card, index) => ({ card, index, rank: rank(card) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, count)
    .map(({ card }) => card);
}

/** True when the card fits every one of the cook's diets, to label it in the picker. */
export function fitsAllDiets(card: RecipeCard, kitchen: KitchenProfile): boolean {
  return kitchen.diets.length > 0 && dietMatches(card, kitchen.diets) === kitchen.diets.length;
}

/** True when the signed-in cook has no saved recipes: only then is the picker shown. */
export async function libraryIsEmpty(): Promise<boolean> {
  const { count, error } = await supabase.from('recipes').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

/** Reads popular Hub cards (the cook's diets first, as the Hub orders them) and picks the ones to offer. */
export async function fetchFirstRecipeChoices(kitchen: KitchenProfile): Promise<RecipeCard[]> {
  const { cards } = await fetchHubCards({
    sort: 'popular',
    diets: kitchen.diets,
    limit: CANDIDATES,
    includeCount: false,
  });
  return chooseFirstRecipes(cards, kitchen);
}

/**
 * Saves the picked cards to the Library. One that fails doesn't stop the rest; the count saved comes back (0 means
 * none went in, and the picker says so).
 */
export async function saveFirstRecipes(cardIds: readonly string[]): Promise<{ saved: number; failed: number }> {
  const results = await Promise.allSettled(cardIds.map((id) => claimHubCard(id)));
  const saved = results.filter((result) => result.status === 'fulfilled').length;
  return { saved, failed: results.length - saved };
}
