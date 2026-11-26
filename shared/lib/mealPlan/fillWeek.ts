/**
 * Filling the week (PIN-77): picks a recipe for each empty meal, in code, without a model.
 *
 * - Allergies are a hard filter, and so are the foods skipped this week. A recipe known not to fit a strict diet
 *   (vegetarian, vegan, pescatarian, halal, kosher, gluten-free, dairy-free) is left out; one that misses a looser
 *   diet (low-carb, keto…) only ranks lower. A recipe whose diets aren't checked yet (recipes.diets null) isn't
 *   marked down.
 * - Library recipes come before Hub ones. Hub recipes are used only when the caller allows them (see
 *   libraryOnlyStatus).
 * - What's at home counts, and so do ingredients that another meal of the week already uses.
 * - No recipe twice in a week, nothing cooked in the last two weeks if it can be helped, and not the same kind of
 *   dish at the same meal two days running.
 * - Quick meals on weekdays, longer ones at the weekend.
 * - A dinner can cover the next day's lunch (every other day), and a make-ahead snack covers the next two days.
 * - The order among close candidates comes from `seed`, so "reshuffle" gives a different but sensible week.
 *
 * Each filled meal carries one reason to show the cook ("Uses your spinach").
 */
import { findAvoidMatches, type AllergenKey, type AvoidList } from '../avoidList';
import { foodWords, homeCovers } from '../pantry';
import type { MealKind, PlanAdjust, PlanMeal } from '../../types/mealPlan';
import { PLAN_MEALS } from '../../types/mealPlan';
import type { CostEstimate, EffortLevel, Recipe, RecipeNutrition } from '../../types/recipe';
import { parseRecipeNutrition, recipeNutritionOf } from '../recipeNutrition';
import type { RecipeCard } from '../../types/recipeCard';
import { mealFit, type MealFit } from './mealKinds';
import { addDays, dayOfWeek } from './week';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Diets a recipe either fits or doesn't: one that is known not to fit is never suggested. */
const STRICT_DIETS = new Set(['vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher', 'gluten_free', 'dairy_free']);

/** Too common to be a reason ("Uses your salt") or a link between two meals. */
const BASICS = new Set(
  [
    'water', 'salt', 'ice', 'oil', 'olive oil', 'vegetable oil', 'pepper', 'black pepper', 'sugar', 'flour', 'butter',
    'garlic', 'onion', 'garlic clove', 'baking powder', 'baking soda', 'vinegar',
  ].map((name) => foodWords(name).join(' ')),
);

/** A recipe the planner can use: one from the cook's Library, or a Hub card. */
export type PlanCandidate = {
  id: string;
  source: 'library' | 'hub';
  title: string;
  ingredients: string[];
  tags: string[];
  minutes: number | null;
  effort: EffortLevel | null;
  cost: CostEstimate | null;
  /** Grams per serving, when estimated. */
  proteinPerServing: number | null;
  /** Kitchen-profile diets it fits as written. null = not checked yet. */
  diets: string[] | null;
  /** Hub cards: allergen and dislike keys found when the card was published. */
  contains: string[] | null;
  lastCookedAt: string | null;
  createdAt: string | null;
  favorite: boolean;
};

function proteinPerServing(nutrition: RecipeNutrition | null, servings: number): number | null {
  return nutrition ? nutrition.protein_g / servings : null;
}

export function candidateFromRecipe(recipe: Recipe): PlanCandidate {
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return {
    id: recipe.id,
    source: 'library',
    title: recipe.title,
    ingredients: (recipe.ingredients ?? []).map((ing) => ing.name).filter((name) => name?.trim()),
    tags: recipe.tags ?? [],
    minutes: recipe.estimated_time_minutes ?? null,
    effort: recipe.effort_level ?? null,
    cost: recipe.cost_estimate ?? null,
    proteinPerServing: proteinPerServing(recipeNutritionOf(recipe), servings),
    diets: recipe.diets ?? null,
    contains: null,
    lastCookedAt: recipe.last_cooked_at ?? null,
    createdAt: recipe.created_at ?? null,
    favorite: !!recipe.is_favorite,
  };
}

export function candidateFromCard(card: RecipeCard): PlanCandidate {
  const servings = card.servings > 0 ? card.servings : 1;
  return {
    id: card.id,
    source: 'hub',
    title: card.title,
    ingredients: (card.ingredients ?? []).map((ing) => ing.name).filter((name) => name?.trim()),
    tags: card.tags ?? [],
    minutes: card.estimated_time_minutes ?? null,
    effort: card.effort_level ?? null,
    cost: card.cost_estimate ?? null,
    proteinPerServing: card.calories != null ? proteinPerServing(parseRecipeNutrition(card.nutrition), servings) : null,
    diets: card.diets ?? null,
    contains: card.contains ?? null,
    lastCookedAt: null,
    createdAt: card.created_at ?? null,
    favorite: false,
  };
}

export function mealKindOf(meal: PlanMeal): MealKind {
  return meal === 'snack_am' || meal === 'snack_pm' ? 'snack' : meal;
}

/** Why a meal was picked, for the line on its tile. `params` fill the translated text. */
export type PlanReason =
  | { key: 'haveEverything' }
  | { key: 'usesPantry'; item: string }
  | { key: 'sharesWith'; item: string; date: string }
  | { key: 'quick'; minutes: number }
  | { key: 'weekendLonger' }
  | { key: 'newFromHub' }
  | { key: 'notCookedFor'; weeks: number }
  | { key: 'fitsDiet'; diet: string }
  | { key: 'secondTime' }
  | { key: 'leftovers'; date: string }
  | { key: 'batch'; date: string }
  | { key: 'pick' };

/** A meal already in the plan, kept as it is: locked, or outside the meals being filled. */
export type PlannedMeal = {
  date: string;
  meal: PlanMeal;
  candidateId: string;
  /** Leftovers or a snack batch from another meal. */
  leftover?: boolean;
};

export type FilledMeal = {
  date: string;
  meal: PlanMeal;
  candidateId: string;
  /** Leftovers or a batch: the meal that makes them (planned or filled). */
  leftoverOf: { date: string; meal: PlanMeal } | null;
  reason: PlanReason;
};

export type FillInput = {
  /** The empty meals to fill. */
  slots: { date: string; meal: PlanMeal }[];
  /** Meals already in the plan that stay. */
  planned: PlannedMeal[];
  candidates: PlanCandidate[];
  avoid: AvoidList;
  /** The cook's kitchen-profile diets. */
  diets: string[];
  /** Names of what's at home (pantryHomeNames). */
  homeNames: string[];
  now: Date;
  /** Weekend days (Date.getDay() numbers), from weekendFor(locale). */
  weekend: number[];
  /** Hub recipes may fill any meal. */
  useHub: boolean;
  /** Hub recipes may fill these kinds of meal even when useHub is off (the Library has too few). */
  hubFor?: MealKind[];
  /** A dinner covers the next day's lunch. */
  leftovers: boolean;
  adjust?: PlanAdjust;
  seed: string;
};

export type FillResult = {
  filled: FilledMeal[];
  /** Meals nothing could fill. */
  empty: { date: string; meal: PlanMeal }[];
};

/** A number from text, the same every time (FNV-1a). */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function daysAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? (now.getTime() - time) / DAY_MS : null;
}

type Prepared = {
  candidate: PlanCandidate;
  fit: MealFit;
  /** Ingredient words, without water, salt and other basics. */
  words: { name: string; key: string; words: string[] }[];
  blocked: boolean;
  dislikeHits: number;
  /** Looser diets it is known to miss. */
  softMisses: number;
  /** Fits every one of the cook's diets, as far as is known. */
  dietFits: boolean;
  have: number;
  total: number;
  /** A covered ingredient worth naming. */
  pantryItem: string | null;
};

function prepare(input: FillInput): Map<string, Prepared> {
  const home = input.homeNames.map(foodWords).filter((words) => words.length > 0);
  const allergyList: AvoidList = { allergies: input.avoid.allergies, otherAllergies: input.avoid.otherAllergies, dislikes: [] };
  const dislikeList: AvoidList = { allergies: [], otherAllergies: [], dislikes: input.avoid.dislikes };
  const skip = (input.adjust?.skipFoods ?? []).filter((food) => food.trim());
  const skipList: AvoidList = { allergies: [], otherAllergies: skip, dislikes: [] };
  const allergenKeys = new Set<string>(input.avoid.allergies as AllergenKey[]);
  const prepared = new Map<string, Prepared>();

  for (const candidate of input.candidates) {
    const names = candidate.ingredients;
    const allergyHit =
      findAvoidMatches(names, allergyList).allergies.length > 0 ||
      (candidate.contains ?? []).some((key) => allergenKeys.has(key));
    const skipHit = skip.length > 0 && findAvoidMatches(names, skipList).allergies.length > 0;
    let strictMiss = false;
    let softMisses = 0;
    if (candidate.diets) {
      for (const diet of input.diets) {
        if (candidate.diets.includes(diet)) continue;
        if (STRICT_DIETS.has(diet)) strictMiss = true;
        else softMisses += 1;
      }
    }
    const words = names
      .map((name) => {
        const list = foodWords(name);
        return { name, key: list.join(' '), words: list };
      })
      .filter((entry) => entry.words.length > 0 && !BASICS.has(entry.key));
    let have = 0;
    let pantryItem: string | null = null;
    for (const entry of words) {
      if (home.some((h) => homeCovers(h, entry.words))) {
        have += 1;
        pantryItem ??= entry.name;
      }
    }
    prepared.set(candidate.id, {
      candidate,
      fit: mealFit(candidate.tags),
      words,
      blocked: allergyHit || skipHit || strictMiss,
      dislikeHits: input.avoid.dislikes.length > 0 ? findAvoidMatches(names, dislikeList).dislikes.length : 0,
      softMisses,
      dietFits: candidate.diets != null && input.diets.length > 0 && !strictMiss && softMisses === 0,
      have,
      total: words.length,
      pantryItem,
    });
  }
  return prepared;
}

function slotKey(date: string, meal: PlanMeal): string {
  return `${date}|${meal}`;
}

type WeekMeal = { date: string; meal: PlanMeal; candidateId: string; leftover: boolean };

function shuffleNudge(seed: string, date: string, meal: PlanMeal, id: string): number {
  return (hash(`${seed}|${date}|${meal}|${id}`) % 1000) / 1000;
}

export function fillWeek(input: FillInput): FillResult {
  const prepared = prepare(input);
  const week = new Map<string, WeekMeal>();
  for (const meal of input.planned) {
    week.set(slotKey(meal.date, meal.meal), { ...meal, leftover: !!meal.leftover });
  }
  const order = (meal: PlanMeal) => PLAN_MEALS.indexOf(meal);
  const slots = [...input.slots].sort((a, b) => a.date.localeCompare(b.date) || order(a.meal) - order(b.meal));
  const filled: FilledMeal[] = [];
  const empty: FillResult['empty'] = [];
  const adjust = input.adjust ?? {};
  const hubFor = new Set(input.hubFor ?? []);

  /** Times each recipe is cooked this week (leftovers don't count), and on which days. */
  const uses = () => {
    const days = new Map<string, string[]>();
    for (const meal of week.values()) {
      if (meal.leftover) continue;
      days.set(meal.candidateId, [...(days.get(meal.candidateId) ?? []), meal.date]);
    }
    return days;
  };

  for (const slot of slots) {
    const kind = mealKindOf(slot.meal);

    // Leftovers: yesterday's dinner covers today's lunch, every other day.
    if (kind === 'lunch' && input.leftovers) {
      const yesterday = addDays(slot.date, -1);
      const dinner = week.get(slotKey(yesterday, 'dinner'));
      const lunchBefore = week.get(slotKey(yesterday, 'lunch'));
      if (dinner && !dinner.leftover && !lunchBefore?.leftover && week.get(slotKey(slot.date, 'dinner'))?.candidateId !== dinner.candidateId) {
        week.set(slotKey(slot.date, slot.meal), { ...slot, candidateId: dinner.candidateId, leftover: true });
        filled.push({
          ...slot,
          candidateId: dinner.candidateId,
          leftoverOf: { date: yesterday, meal: 'dinner' },
          reason: { key: 'leftovers', date: yesterday },
        });
        continue;
      }
    }

    // A make-ahead snack covers the same snack the next two days.
    if (kind === 'snack') {
      const batch = batchSource(week, prepared, slot.date, slot.meal);
      if (batch) {
        week.set(slotKey(slot.date, slot.meal), { ...slot, candidateId: batch.candidateId, leftover: true });
        filled.push({ ...slot, candidateId: batch.candidateId, leftoverOf: { date: batch.date, meal: slot.meal }, reason: { key: 'batch', date: batch.date } });
        continue;
      }
    }

    const choice = pick(slot, kind, input, prepared, week, uses(), hubFor, adjust);
    if (!choice) {
      empty.push(slot);
      continue;
    }
    week.set(slotKey(slot.date, slot.meal), { ...slot, candidateId: choice.id, leftover: false });
    filled.push({ ...slot, candidateId: choice.id, leftoverOf: null, reason: choice.reason });
  }
  return { filled, empty };
}

/** The batch this snack can come from: the same snack slot one or two days back, a make-ahead recipe, and not used up. */
function batchSource(
  week: Map<string, WeekMeal>,
  prepared: Map<string, Prepared>,
  date: string,
  meal: PlanMeal,
): { date: string; candidateId: string } | null {
  const yesterday = week.get(slotKey(addDays(date, -1), meal));
  if (!yesterday) return null;
  const sourceDate = yesterday.leftover ? addDays(date, -2) : addDays(date, -1);
  const source = week.get(slotKey(sourceDate, meal));
  if (!source || source.leftover || source.candidateId !== yesterday.candidateId) return null;
  if (!prepared.get(source.candidateId)?.fit.batch) return null;
  return { date: sourceDate, candidateId: source.candidateId };
}

function pick(
  slot: { date: string; meal: PlanMeal },
  kind: MealKind,
  input: FillInput,
  prepared: Map<string, Prepared>,
  week: Map<string, WeekMeal>,
  usesByRecipe: Map<string, string[]>,
  hubFor: Set<MealKind>,
  adjust: PlanAdjust,
): { id: string; reason: PlanReason } | null {
  const weekday = !input.weekend.includes(dayOfWeek(slot.date));
  const sameDay = new Set(
    [...week.values()].filter((meal) => meal.date === slot.date).map((meal) => meal.candidateId),
  );
  const yesterdaySame = week.get(slotKey(addDays(slot.date, -1), slot.meal));
  const yesterdayDish = yesterdaySame ? prepared.get(yesterdaySame.candidateId)?.fit.dishType ?? null : null;

  // Ingredients other meals of the week use (each with the first day it's used), to link meals.
  const weekWords = new Map<string, { name: string; date: string }>();
  for (const meal of [...week.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (meal.leftover) continue;
    for (const entry of prepared.get(meal.candidateId)?.words ?? []) {
      if (!weekWords.has(entry.key)) weekWords.set(entry.key, { name: entry.name, date: meal.date });
    }
  }

  type Scored = { id: string; score: number; reason: PlanReason };
  const score = (entry: Prepared, repeat: boolean): Scored | null => {
    const { candidate, fit } = entry;
    if (entry.blocked) return null;
    if (candidate.source === 'hub' && !input.useHub && !hubFor.has(kind)) return null;
    if (sameDay.has(candidate.id)) return null;

    let value = 0;
    if (fit.kinds.includes(kind)) value += 0;
    else if ((kind === 'lunch' && fit.kinds.includes('dinner')) || (kind === 'dinner' && fit.kinds.includes('lunch'))) {
      value -= 3;
    } else return null;
    if (kind !== 'snack' && fit.dessert) value -= 3;
    if (kind === 'snack' && fit.dessert) value -= 2;

    const used = usesByRecipe.get(candidate.id) ?? [];
    if (repeat) {
      // Second time this week: snacks freely, meals only from the Library, never two days running.
      const near = used.some((day) => Math.abs(Date.parse(day) - Date.parse(slot.date)) <= DAY_MS);
      if (used.length === 0 || near) return null;
      if (kind !== 'snack' && (candidate.source !== 'library' || used.length >= 2)) return null;
      if (kind === 'snack' && used.length >= 3) return null;
      value -= 4;
    } else if (used.length > 0) return null;

    value += candidate.source === 'library' ? 2 : 0;
    if (candidate.favorite) value += 1;
    if (adjust.fewerNew) value += candidate.source === 'library' ? 2 : -3;
    value -= entry.softMisses * 3;
    value -= entry.dislikeHits * 4;
    if (entry.dietFits) value += 1;

    const share = entry.total > 0 ? entry.have / entry.total : 0;
    value += share * (adjust.useUpFridge ? 9 : 6);

    let shared: { name: string; date: string } | null = null;
    let sharedCount = 0;
    for (const word of entry.words) {
      const other = weekWords.get(word.key);
      if (other && other.date !== slot.date) {
        sharedCount += 1;
        shared ??= other;
      }
    }
    value += Math.min(sharedCount, 3);

    const cooked = daysAgo(candidate.lastCookedAt, input.now);
    if (cooked != null && cooked < 14) value -= 6;
    else if (cooked != null && cooked < 30) value -= 2;

    if (fit.dishType && fit.dishType === yesterdayDish) value -= 3;

    const minutes = candidate.minutes;
    if (minutes != null) {
      if (kind === 'breakfast') {
        if (weekday && minutes > 20) value -= 2;
      } else if (kind !== 'snack') {
        if (weekday && minutes <= 35) value += 1.5;
        if (weekday && minutes > 60) value -= 3;
        if (!weekday && minutes >= 45) value += 1;
      }
      if (adjust.quickWeeknights && weekday && kind !== 'snack' && minutes > 30) value -= 10;
    } else if (adjust.quickWeeknights && weekday) {
      value -= 1;
    }
    if (adjust.cheaper) value += candidate.cost === '$' ? 2 : candidate.cost === '$$$' ? -4 : 0;
    if (adjust.moreProtein) {
      const high = (candidate.proteinPerServing ?? 0) >= 25 || (candidate.diets ?? []).includes('high_protein');
      if (high) value += 3;
    }

    value += shuffleNudge(input.seed, slot.date, slot.meal, candidate.id) * 1.5;

    return { id: candidate.id, score: value, reason: repeat ? { key: 'secondTime' } : reasonFor(entry, kind, weekday, shared, cooked, input.diets) };
  };

  const best = (repeat: boolean): Scored | null => {
    let top: Scored | null = null;
    for (const entry of prepared.values()) {
      const scored = score(entry, repeat);
      if (scored && (!top || scored.score > top.score)) top = scored;
    }
    return top;
  };
  const fresh = best(false);
  if (fresh) return fresh;
  // Hub recipes never run out, so a second time this week only happens when the Library is on its own (or for snacks).
  return best(true);
}

function reasonFor(
  entry: Prepared,
  kind: MealKind,
  weekday: boolean,
  shared: { name: string; date: string } | null,
  cookedDaysAgo: number | null,
  diets: string[],
): PlanReason {
  const { candidate } = entry;
  if (entry.total > 0 && entry.have === entry.total) return { key: 'haveEverything' };
  if (shared) return { key: 'sharesWith', item: shared.name, date: shared.date };
  if (entry.pantryItem && entry.have * 2 >= entry.total) return { key: 'usesPantry', item: entry.pantryItem };
  const minutes = candidate.minutes;
  if (!weekday && kind !== 'snack' && minutes != null && minutes >= 45) return { key: 'weekendLonger' };
  if (weekday && minutes != null && minutes <= 30) return { key: 'quick', minutes };
  if (candidate.source === 'hub') return { key: 'newFromHub' };
  if (cookedDaysAgo != null && cookedDaysAgo >= 28) return { key: 'notCookedFor', weeks: Math.floor(cookedDaysAgo / 7) };
  if (entry.dietFits && diets.length > 0) return { key: 'fitsDiet', diet: diets[0] };
  return { key: 'pick' };
}

/** How many meals each cooking covers: the cooked meal plus its leftovers or batch. */
export function portionsByMeal(meals: { date: string; meal: PlanMeal; leftoverOf: { date: string; meal: PlanMeal } | null }[]): Map<string, number> {
  const portions = new Map<string, number>();
  for (const meal of meals) {
    if (meal.leftoverOf) continue;
    portions.set(slotKey(meal.date, meal.meal), 1);
  }
  for (const meal of meals) {
    if (!meal.leftoverOf) continue;
    const key = slotKey(meal.leftoverOf.date, meal.leftoverOf.meal);
    portions.set(key, (portions.get(key) ?? 1) + 1);
  }
  return portions;
}

// ── Can the Library carry a plan on its own? ──────────────────────────────

/** Library recipes that fit the cook before planning from the Library alone is offered. */
export const LIBRARY_ONLY_MIN = 14;
/** Fewer fitting Library recipes than this for a meal, and that meal still takes Hub recipes. */
export const LIBRARY_MEAL_MIN = 4;

export type LibraryOnlyStatus = {
  /** Library recipes that fit the cook's allergies and diets. */
  fitting: number;
  /** The Hub switch may be turned off. */
  allowed: boolean;
  /** Chosen meals the Library can't cover alone: Hub recipes still fill these. */
  thinMeals: MealKind[];
};

export function libraryOnlyStatus(
  library: PlanCandidate[],
  avoid: AvoidList,
  diets: string[],
  meals: MealKind[],
): LibraryOnlyStatus {
  const prepared = prepare({
    slots: [],
    planned: [],
    candidates: library,
    avoid,
    diets,
    homeNames: [],
    now: new Date(0),
    weekend: [],
    useHub: false,
    leftovers: false,
    seed: '',
  });
  const fitting = [...prepared.values()].filter((entry) => !entry.blocked);
  const countFor = (kind: MealKind) =>
    fitting.filter((entry) => {
      const kinds = entry.fit.kinds;
      if (kinds.includes(kind)) return !(kind !== 'snack' && entry.fit.dessert);
      return (kind === 'lunch' && kinds.includes('dinner')) || (kind === 'dinner' && kinds.includes('lunch'));
    }).length;
  return {
    fitting: fitting.length,
    allowed: fitting.length >= LIBRARY_ONLY_MIN,
    thinMeals: [...new Set(meals)].filter((kind) => countFor(kind) < LIBRARY_MEAL_MIN),
  };
}
