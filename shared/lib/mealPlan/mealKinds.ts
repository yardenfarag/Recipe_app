/**
 * Which meals a recipe suits, read from its tags (PIN-77). Tags are free lower-case labels, mostly English, so
 * this looks for known words in them. A recipe with no meal word is treated as a main dish (lunch or dinner).
 */
import type { MealKind } from '../../types/mealPlan';

const BREAKFAST = [
  'breakfast', 'brunch', 'pancake', 'pancakes', 'waffle', 'waffles', 'porridge', 'oatmeal', 'overnight oats',
  'french toast', 'granola', 'omelet', 'omelette', 'frittata', 'shakshuka', 'smoothie bowl',
];
const SNACK = [
  'snack', 'snacks', 'appetizer', 'appetizers', 'dip', 'energy balls', 'protein balls', 'bites', 'bars', 'crackers',
  'smoothie', 'drink', 'hummus', 'muffins', 'muffin', 'trail mix',
];
const LUNCH = ['lunch', 'salad', 'soup', 'sandwich', 'wrap', 'wraps', 'bowl', 'toast', 'burger'];
const DINNER = [
  'dinner', 'main', 'main course', 'main-course', 'mains', 'supper', 'pasta', 'curry', 'stew', 'casserole', 'roast',
  'pizza', 'tacos', 'chili', 'risotto', 'stir fry', 'stir-fry', 'one-pot', 'one-pan',
];
const DESSERT = ['dessert', 'desserts', 'cake', 'cookies', 'cookie', 'sweets', 'brownies', 'pie', 'cheesecake'];

/** Make-ahead snacks: one batch covers the next days. */
const BATCHES = ['bars', 'bites', 'energy balls', 'protein balls', 'crackers', 'granola', 'muffins', 'muffin', 'cookies'];

/** Dish types that shouldn't fall on the same meal two days running. */
const DISH_TYPES = ['pasta', 'soup', 'salad', 'curry', 'stew', 'tacos', 'pizza', 'risotto', 'chili', 'eggs', 'pancakes'];

function has(tags: Set<string>, words: string[]): boolean {
  return words.some((word) => tags.has(word));
}

export type MealFit = {
  /** Meals the recipe suits. Never empty. */
  kinds: MealKind[];
  /** A sweet dish: allowed as a snack, after the savoury ones. Never a main meal. */
  dessert: boolean;
  /** A make-ahead snack that lasts a few days. */
  batch: boolean;
  /** The first dish-type tag, to keep two days running from being the same kind of dish. */
  dishType: string | null;
};

export function mealFit(tags: readonly string[] | null | undefined): MealFit {
  const set = new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const kinds = new Set<MealKind>();
  const dessert = has(set, DESSERT);
  if (has(set, BREAKFAST)) kinds.add('breakfast');
  if (has(set, SNACK) || dessert) kinds.add('snack');
  if (has(set, LUNCH)) kinds.add('lunch');
  if (has(set, DINNER)) kinds.add('dinner');
  // A plain dessert isn't a meal, even when it is also tagged "breakfast" (Nutella French toast).
  if (dessert && !has(set, LUNCH) && !has(set, DINNER)) {
    kinds.delete('lunch');
    kinds.delete('dinner');
  }
  if (kinds.size === 0) {
    kinds.add('lunch');
    kinds.add('dinner');
  }
  return {
    kinds: [...kinds],
    dessert,
    batch: has(set, BATCHES),
    dishType: DISH_TYPES.find((type) => set.has(type)) ?? null,
  };
}
