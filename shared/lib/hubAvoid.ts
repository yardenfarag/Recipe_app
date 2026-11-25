/**
 * The Hub, sorted for the cook (PIN-180): what the Hub query needs from the avoid list, and the flag a Hub card shows.
 *
 * Each Hub card lists the allergens and one-tap dislikes it contains (`recipe_cards.contains`, checked by the server
 * when the card is published). The query puts cards with the cook's allergies last and the ones with foods they
 * don't like lower. Foods the cook typed in have no key, so the query looks for the words in the ingredient names.
 *
 * The flag on a card joins the server's list with the on-device matcher the recipe screen uses, so a card never
 * looks clear in the Hub and then shows a warning when it opens. Like the rest of the avoid list, it never calls a
 * recipe safe: no flag means only that nothing was found.
 */
import type { TFunction } from 'i18next';

import {
  ALLERGEN_KEYS,
  DISLIKE_SUGGESTION_KEYS,
  allergenFor,
  dislikeSuggestionFor,
  findAvoidMatches,
  normalizeFoodText,
  type AllergenKey,
  type AvoidList,
  type DislikeSuggestionKey,
} from './avoidList';
import type { RecipeCard } from '../types/recipeCard';

/** The Hub query's view of the avoid list. */
export type HubAvoid = {
  allergens: AllergenKey[];
  dislikes: DislikeSuggestionKey[];
  /** Typed allergies with no key, lower case. */
  allergyWords: string[];
  /** Typed dislikes with no key, lower case. */
  dislikeWords: string[];
};

export const EMPTY_HUB_AVOID: HubAvoid = { allergens: [], dislikes: [], allergyWords: [], dislikeWords: [] };

/** The keys a card can list in `contains`, in the server's order (supabase/.../recipeDiets.ts HUB_CONTAINS_KEYS). */
export const HUB_CONTAINS_KEYS: readonly string[] = [...ALLERGEN_KEYS, ...DISLIKE_SUGGESTION_KEYS];

function word(item: string): string {
  return item.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function hubAvoidOf(list: AvoidList): HubAvoid {
  const allergens = new Set<AllergenKey>(list.allergies);
  const allergyWords: string[] = [];
  for (const item of list.otherAllergies) {
    const key = allergenFor(item);
    if (key) allergens.add(key);
    else if (word(item)) allergyWords.push(word(item));
  }
  const dislikes = new Set<DislikeSuggestionKey>();
  const dislikeWords: string[] = [];
  for (const item of list.dislikes) {
    const key = dislikeSuggestionFor(item);
    if (key) dislikes.add(key);
    else if (word(item)) dislikeWords.push(word(item));
  }
  return {
    allergens: ALLERGEN_KEYS.filter((key) => allergens.has(key)),
    dislikes: DISLIKE_SUGGESTION_KEYS.filter((key) => dislikes.has(key)),
    allergyWords: [...new Set(allergyWords)],
    dislikeWords: [...new Set(dislikeWords)],
  };
}

export function hubAvoidIsEmpty(avoid: HubAvoid): boolean {
  return (
    avoid.allergens.length === 0 &&
    avoid.dislikes.length === 0 &&
    avoid.allergyWords.length === 0 &&
    avoid.dislikeWords.length === 0
  );
}

/** A stable text for the avoid list, so a list reloads only when it really changed. */
export function hubAvoidKey(avoid: HubAvoid): string {
  return JSON.stringify([avoid.allergens, avoid.dislikes, avoid.allergyWords, avoid.dislikeWords]);
}

/** The avoid list back from hubAvoidKey's text. */
export function hubAvoidFromKey(key: string): HubAvoid {
  const [allergens, dislikes, allergyWords, dislikeWords] = JSON.parse(key) as [
    HubAvoid['allergens'],
    HubAvoid['dislikes'],
    string[],
    string[],
  ];
  return { allergens, dislikes, allergyWords, dislikeWords };
}

/** One food on a card's flag: a key from the fixed lists, or what the cook typed. */
type FlagItem = { key: AllergenKey | DislikeSuggestionKey; typed?: undefined } | { key?: undefined; typed: string };

export type HubCardFlag = { kind: 'allergy' | 'dislike'; items: FlagItem[] };

function addItem(items: FlagItem[], item: FlagItem) {
  const same = (other: FlagItem) =>
    item.key ? other.key === item.key : other.typed != null && normalizeFoodText(other.typed) === normalizeFoodText(item.typed);
  if (!items.some(same)) items.push(item);
}

/**
 * What a Hub card has from the cook's avoid list: its allergies when it has any, else its dislikes, else null. The
 * server's `contains` and the on-device matcher both count.
 */
export function hubCardFlag(card: Pick<RecipeCard, 'ingredients' | 'contains'>, list: AvoidList): HubCardFlag | null {
  const avoid = hubAvoidOf(list);
  if (hubAvoidIsEmpty(avoid)) return null;
  const contains = new Set(card.contains ?? []);
  const names = card.ingredients.map((ingredient) => ingredient.name ?? '').filter(Boolean);
  const matches = findAvoidMatches(names, list);

  const allergies: FlagItem[] = [];
  for (const key of avoid.allergens) if (contains.has(key)) addItem(allergies, { key });
  for (const hit of matches.allergies) {
    const key = hit.allergen ?? allergenFor(hit.item);
    addItem(allergies, key ? { key } : { typed: hit.item });
  }
  if (allergies.length > 0) return { kind: 'allergy', items: allergies };

  const dislikes: FlagItem[] = [];
  for (const key of avoid.dislikes) if (contains.has(key)) addItem(dislikes, { key });
  for (const hit of matches.dislikes) {
    const key = dislikeSuggestionFor(hit.item);
    addItem(dislikes, key ? { key } : { typed: hit.item });
  }
  return dislikes.length > 0 ? { kind: 'dislike', items: dislikes } : null;
}

/** The flag's foods in the app language: "Peanuts, Milk". */
export function hubCardFlagText(flag: HubCardFlag, t: TFunction): string {
  return flag.items
    .map((item) => {
      if (item.typed != null) return item.typed;
      return (ALLERGEN_KEYS as readonly string[]).includes(item.key)
        ? t(`avoid.allergens.${item.key}`)
        : t(`avoid.suggestions.${item.key}`);
    })
    .join(', ');
}

/** The same flag for a screen reader: "Has ingredients from your allergies: Peanuts". */
export function hubCardFlagLabel(flag: HubCardFlag, t: TFunction): string {
  const title = flag.kind === 'allergy' ? t('avoid.bannerAllergyTitle') : t('avoid.bannerDislikeTitle');
  return `${title}: ${hubCardFlagText(flag, t)}`;
}
