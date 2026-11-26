/**
 * PIN-181: the pantry's logic, for both apps. Merging the photos of a scan into one list to review, comparing a
 * rescan with what was saved, and ranking saved recipes by how much of them is already at home ("What can I
 * cook?"). No network, no platform code.
 */
import {
  PANTRY_AISLES,
  PANTRY_PLACES,
  type PantryAisle,
  type PantryItem,
  type PantryPlace,
  type ReviewItem,
  type ScanPhoto,
} from '../types/pantry';
import type { Recipe } from '../types/recipe';

/** The same key the database uses for "one row per product and place" (pantry_items.name_key). */
export function pantryNameKey(name: string, nameEn = ''): string {
  const base = nameEn.trim() || name;
  return base.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Merges the photos of one scan: one row per product and place, sure if any photo was sure of it. */
export function mergeScanPhotos(photos: ScanPhoto[]): ReviewItem[] {
  const rows = new Map<string, ReviewItem>();
  const ordered = [...photos].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const photo of ordered) {
    if (photo.quality === 'not_kitchen') continue;
    photo.items.forEach((item, index) => {
      // Unknown containers stay separate: two mystery tubs are two things to name.
      const nameKey = item.container_unknown
        ? `container:${photo.id ?? photo.created_at}:${index}`
        : pantryNameKey(item.name, item.name_en);
      if (!nameKey) return;
      const key = `${photo.place}|${nameKey}`;
      const existing = rows.get(key);
      if (existing) {
        if (item.confidence === 'high' && !item.container_unknown) existing.sure = true;
        if (!existing.brand && item.brand) existing.brand = item.brand;
        return;
      }
      rows.set(key, {
        key,
        name: item.name,
        nameEn: item.name_en,
        brand: item.brand,
        place: photo.place,
        aisle: (PANTRY_AISLES as readonly string[]).includes(item.aisle) ? item.aisle : 'other',
        sure: item.confidence === 'high' && !item.container_unknown,
        containerUnknown: item.container_unknown,
      });
    });
  }
  return [...rows.values()];
}

export type ReviewGroup = { place: PantryPlace; aisles: { aisle: PantryAisle; items: ReviewItem[] }[] };

/** Review order: places in a fixed order, then aisles in shopping order, then names. */
export function groupByPlaceAndAisle(items: ReviewItem[], locale?: string): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  for (const place of PANTRY_PLACES) {
    const inPlace = items.filter((item) => item.place === place);
    if (inPlace.length === 0) continue;
    const aisles = PANTRY_AISLES.map((aisle) => ({
      aisle,
      items: inPlace
        .filter((item) => item.aisle === aisle)
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    })).filter((group) => group.items.length > 0);
    groups.push({ place, aisles });
  }
  return groups;
}

/**
 * Saved items in the places this scan covered that no photo showed. A rescan never deletes on its own: the
 * review screen asks about these, and they stay unless the person ticks them off.
 */
export function notSeenInScan(saved: PantryItem[], reviewed: ReviewItem[], scannedPlaces: PantryPlace[]): PantryItem[] {
  const seen = new Set(reviewed.map((item) => `${item.place}|${pantryNameKey(item.name, item.nameEn)}`));
  const places = new Set(scannedPlaces);
  return saved.filter(
    (item) => places.has(item.place) && item.source === 'scan' && !seen.has(`${item.place}|${pantryNameKey(item.name, item.nameEn)}`),
  );
}

/** Whole days since an ISO date, never negative. */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / 86_400_000));
}

/** After this many days the apps suggest scanning again. */
export const PANTRY_STALE_DAYS = 14;

/** The most recent scan of each place, from the items' last_seen_at. */
export function lastScannedByPlace(items: PantryItem[]): Partial<Record<PantryPlace, string>> {
  const out: Partial<Record<PantryPlace, string>> = {};
  for (const item of items) {
    if (item.source !== 'scan') continue;
    const current = out[item.place];
    if (!current || item.lastSeenAt > current) out[item.place] = item.lastSeenAt;
  }
  return out;
}

// ── Matching food names ──────────────────────────────────────────────────────

const LATIN_WORD = /^[a-z]+$/;
const NO_PLURAL = new Set(['hummus', 'couscous', 'asparagus', 'molasses', 'swiss', 'citrus', 'grass', 'glass', 'bass']);

function singular(word: string): string {
  if (!LATIN_WORD.test(word) || word.length <= 3 || NO_PLURAL.has(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Lower case, accents and punctuation gone, plurals singular (English only): words to compare. */
export function foodWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

function containsRun(haystack: string[], needle: string[]): boolean {
  return needle.length > 0 && runStart(haystack, needle) >= 0;
}

const RTL_SCRIPT = /[֐-ۿ]/;

/** After a food in English, these make it a different product: chicken → chicken stock, lemon → lemon juice. */
const PRODUCT_OF = new Set([
  'stock', 'broth', 'bouillon', 'cube', 'juice', 'zest', 'powder', 'paste', 'puree', 'sauce', 'ketchup', 'extract',
  'essence', 'syrup', 'vinegar', 'oil', 'flour', 'jam', 'jelly', 'marmalade', 'concentrate', 'flake', 'seasoning',
  'liqueur', 'cordial', 'soup', 'chip', 'crisp',
]);

/** Before a food in English, these make it a different product: butter → peanut butter, milk → coconut milk. */
const OTHER_KIND = new Set([
  'peanut', 'almond', 'cashew', 'hazelnut', 'pistachio', 'coconut', 'oat', 'soy', 'soya', 'rice', 'cocoa', 'apple',
  'nut', 'vegan', 'plant', 'condensed', 'evaporated', 'powdered',
]);

/**
 * True when what's at home covers the ingredient.
 * - The ingredient is a form of what's at home: "milk" covers "whole milk", "garlic" covers "garlic cloves". But not
 *   another product made from it or named after it: "chicken" doesn't cover "chicken stock", "butter" doesn't cover
 *   "peanut butter". In Hebrew and Arabic the main word comes first, so what's at home must start the ingredient
 *   ("שום" covers "שום כתוש", "עוף" doesn't cover "ציר עוף").
 * - What's at home is a kind of the ingredient: "brown sugar" covers "sugar", because sugar is what brown sugar is
 *   (the main word: last in English, first in Hebrew and Arabic). "pepper sauce" doesn't cover "pepper".
 */
export function homeCovers(home: string[], ingredient: string[]): boolean {
  if (home.length === 0 || ingredient.length === 0) return false;
  const rtl = RTL_SCRIPT.test(home.join('') + ingredient.join(''));
  if (containsRun(ingredient, home)) {
    const start = runStart(ingredient, home);
    const before = ingredient.slice(0, start);
    const after = ingredient.slice(start + home.length);
    if (rtl) return before.length === 0;
    return !after.some((word) => PRODUCT_OF.has(word)) && !before.some((word) => OTHER_KIND.has(word) && !home.includes(word));
  }
  if (!containsRun(home, ingredient)) return false;
  return rtl ? home[0] === ingredient[0] : home[home.length - 1] === ingredient[ingredient.length - 1];
}

/** Where `needle` first appears as a run of words in `haystack`, or -1. */
function runStart(haystack: string[], needle: string[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Never worth listing as missing. */
const ASSUMED = ['water', 'salt', 'ice', 'מים', 'מלח', 'ماء', 'ملح', 'вода', 'соль', 'agua', 'sal'];

export type CookableRecipe = {
  recipe: Recipe;
  /** Ingredients counted (without water and salt). */
  total: number;
  have: number;
  /** Ingredient names as the recipe writes them. */
  missing: string[];
};

/**
 * Saved recipes ranked by how much of them is already at home: fewest missing first, then the largest share at
 * home. Recipes missing more than `maxMissing` ingredients, or with less than half at home, are left out.
 */
export function rankCookable(
  recipes: Recipe[],
  homeNames: string[],
  options: { maxMissing?: number; limit?: number } = {},
): CookableRecipe[] {
  const maxMissing = options.maxMissing ?? 4;
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  const assumed = ASSUMED.map(foodWords);
  const ranked: CookableRecipe[] = [];
  for (const recipe of recipes) {
    const ingredients = (recipe.ingredients ?? []).map((ing) => ing.name).filter((name) => name?.trim());
    let have = 0;
    let total = 0;
    const missing: string[] = [];
    for (const name of ingredients) {
      const words = foodWords(name);
      if (words.length === 0) continue;
      if (assumed.some((a) => a.join(' ') === words.join(' '))) continue;
      total += 1;
      if (home.some((h) => homeCovers(h, words))) have += 1;
      else missing.push(name);
    }
    if (total === 0 || missing.length > maxMissing || have * 2 < total) continue;
    ranked.push({ recipe, total, have, missing });
  }
  ranked.sort(
    (a, b) =>
      a.missing.length - b.missing.length ||
      b.have / b.total - a.have / a.total ||
      b.have - a.have ||
      a.recipe.title.localeCompare(b.recipe.title),
  );
  return ranked.slice(0, options.limit ?? 30);
}

/** Every name a pantry answers to: the name in the app language and the English one from the scan. */
export function pantryHomeNames(items: PantryItem[], staples: string[] = []): string[] {
  const names = new Set<string>();
  for (const item of items) {
    names.add(item.name);
    if (item.nameEn) names.add(item.nameEn);
  }
  for (const staple of staples) names.add(staple);
  return [...names].filter((name) => name.trim());
}

/** Pantry items a cooked recipe probably used, to offer removing them. */
export function pantryItemsUsedBy(recipe: Pick<Recipe, 'ingredients'>, items: PantryItem[]): PantryItem[] {
  const ingredients = (recipe.ingredients ?? []).map((ing) => foodWords(ing.name)).filter((w) => w.length > 0);
  return items.filter((item) => {
    const names = [item.name, item.nameEn].filter(Boolean).map(foodWords);
    return ingredients.some((ingredient) => names.some((home) => homeCovers(home, ingredient)));
  });
}

/** Where a bought shopping-list item most likely goes. */
export function placeForAisle(aisle: PantryAisle): PantryPlace {
  if (aisle === 'frozen') return 'freezer';
  if (aisle === 'dairy' || aisle === 'meat' || aisle === 'seafood') return 'fridge';
  if (aisle === 'produce') return 'other';
  return 'cupboard';
}
