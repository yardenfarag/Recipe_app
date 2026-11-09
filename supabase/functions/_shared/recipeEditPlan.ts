/**
 * What a hand edit or a written recipe does on Save (PIN-79, ADR 018): reject it on a hard limit,
 * block it on the content check, or save it and name the AI-derived fields to recalculate.
 *
 * Order:
 *   1. Hard limits (RECIPE_LIMITS), no AI. Any failure returns `invalid`.
 *   2. Diff against the recipe before the edit. Nothing changed means nothing to check or
 *      recalculate, and no Jev call.
 *   3. One Jev call (jevDecide) holding every question: the content check over the changed parts
 *      (the whole recipe when written), one yes/no per AI-derived field the edit might affect,
 *      and for a written recipe the source language.
 *   4. Decide. A confident content failure blocks. A Jev error or timeout saves on the hard
 *      limits alone (`jevFailed`) and recalculates every candidate field.
 *
 * Thresholds:
 *   - Content check: block only when Jev is at least CONTENT_BLOCK_CONFIDENCE (0.85) sure the
 *     content fails. Blocking someone's own recipe is worse than letting a borderline one through,
 *     and the database CHECKs stay as the backstop.
 *   - Per-field: recalculate at a yes-score of RECALC_SKIP_BELOW (0.3) or more. 0.3–0.7 is
 *     "unsure", which recalculates too (ADR 018). A missing answer counts as unsure.
 *   - Language: Jev's choice is used at LANGUAGE_MIN_CONFIDENCE (0.75) or more, the same floor as
 *     the extract gate; otherwise the app language.
 *
 * Candidate fields. A field is only asked about when the edit could plausibly change it at all
 * (ADR 018: "a yes/no question for each AI-derived field the edit might affect"), so changing an
 * ingredient's amount never asks about appliances or tags:
 *   calories          ingredients added, removed or renamed; an amount or unit; servings; steps
 *   estimated_time    steps (text, added, deleted, moved); ingredients added/removed/renamed; servings
 *   effort_level      steps; ingredients added/removed/renamed
 *   cost_estimate     ingredients added/removed/renamed; an amount or unit; servings
 *   tags              title; ingredients added/removed/renamed; steps
 *   appliances        steps. Always recalculated, without asking, when steps were added or deleted.
 *   ingredient_amounts  changed or new ingredient rows (name, amount or unit)
 * Locked fields are never candidates. A written recipe recalculates every unlocked field.
 */

import { jevDecide, type JevChoiceAnswer, type JevQuestion, type JevResult } from './jev.ts';
import {
  APP_LANGUAGE_CODES,
  type Ingredient,
  type Instruction,
  type LockedField,
  RECALC_FIELDS,
  type RecalcField,
  type RecipeEditBlockReason,
  type RecipeEditContent,
  type RecipeEditField,
  type RecipeEditLimitError,
} from './recipeEditTypes.ts';
import { RECIPE_LIMITS } from './recipeLimits.ts';

export const CONTENT_BLOCK_CONFIDENCE = 0.85;
export const RECALC_SKIP_BELOW = 0.3;
/** At or above this a field is a clear "yes". Between this and RECALC_SKIP_BELOW is "unsure". */
export const RECALC_SURE = 0.7;
export const LANGUAGE_MIN_CONFIDENCE = 0.75;
/** Base64 characters, the same cap as Snap and invent photos. */
export const MAX_PHOTO_BASE64_CHARS = 2_000_000;

/** The parts of the stored recipe the plan compares against. */
export interface RecipeBeforeEdit {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: string[];
  cook_note: string | null;
}

export interface RecipeEditPlanInput {
  /** null for a written recipe. */
  before: RecipeBeforeEdit | null;
  after: RecipeEditContent;
  lockedFields: readonly LockedField[];
  /** Edits only: per step in `after`, its `step` number before the edit, or null when new. */
  stepSources?: readonly (number | null)[];
  /** Edits only: per ingredient in `after`, its index before the edit, or null when new. */
  ingredientSources?: readonly (number | null)[];
  appLanguage: string;
  /** Overrides jevDecide's default timeout. */
  jevTimeoutMs?: number;
}

export interface JevUsage {
  model: string;
  costUsd: number;
  inputTokens: number;
  ms: number;
}

export type RecipeEditPlan =
  | { outcome: 'invalid'; errors: RecipeEditLimitError[] }
  | { outcome: 'blocked'; reasons: RecipeEditBlockReason[]; jev: JevUsage }
  | {
      outcome: 'save';
      /** In RECALC_FIELDS order. */
      recalculate: RecalcField[];
      /** 0-based rows of `after.ingredients` whose metric/spoons amounts are stale. */
      amountRows: number[];
      /** Written recipes only. */
      sourceLanguage?: string;
      jevFailed: boolean;
      jevError?: string;
      /** null when no Jev call was made. */
      jev: JevUsage | null;
      /** Jev's yes-score per field asked about, for the usage log. */
      scores: Partial<Record<RecalcField, number>>;
    };

// --- Hard limits ------------------------------------------------------------------------------

/** Characters as Postgres char_length counts them: code points, so an emoji is one. */
export function charCount(value: string): number {
  return Array.from(value).length;
}

function inRange(value: number, min: number, max: number, integer: boolean): boolean {
  return Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
}

/** Every hard-limit failure in `content`, in field order. Empty means it fits. */
export function checkRecipeLimits(content: RecipeEditContent): RecipeEditLimitError[] {
  const L = RECIPE_LIMITS;
  const errors: RecipeEditLimitError[] = [];
  const text = (field: RecipeEditField, value: string, max: number, index?: number, required = true) => {
    const n = charCount(value.trim());
    const at = index === undefined ? {} : { index };
    if (required && n === 0) errors.push({ field, ...at, code: 'required' });
    else if (n > max) errors.push({ field, ...at, code: 'too_long' });
  };

  text('title', content.title, L.titleChars);

  if (content.photo.action === 'replace') {
    if (!content.photo.base64.trim()) errors.push({ field: 'photo', code: 'required' });
    else if (content.photo.base64.length > MAX_PHOTO_BASE64_CHARS) errors.push({ field: 'photo', code: 'too_long' });
  }

  if (!inRange(content.servings, L.servingsMin, L.servingsMax, true)) {
    errors.push({ field: 'servings', code: 'out_of_range' });
  }

  if (content.ingredients.length === 0) errors.push({ field: 'ingredients', code: 'required' });
  else if (content.ingredients.length > L.ingredients) errors.push({ field: 'ingredients', code: 'too_many' });
  content.ingredients.forEach((item, index) => {
    text('ingredients', item.name, L.ingredientNameChars, index);
    if (!inRange(item.quantity, 0, L.quantityMax, false)) {
      errors.push({ field: 'ingredients', index, code: 'out_of_range' });
    }
  });

  if (content.instructions.length === 0) errors.push({ field: 'instructions', code: 'required' });
  else if (content.instructions.length > L.steps) errors.push({ field: 'instructions', code: 'too_many' });
  content.instructions.forEach((step, index) => text('instructions', step.text, L.stepChars, index));

  const time = content.estimated_time_minutes;
  if (time !== null && !inRange(time, L.timeMinutesMin, L.timeMinutesMax, true)) {
    errors.push({ field: 'estimated_time_minutes', code: 'out_of_range' });
  }
  const calories = content.calories;
  if (calories !== null && !inRange(calories, 0, L.caloriesMax, true)) {
    errors.push({ field: 'calories', code: 'out_of_range' });
  }

  // Blank tags are dropped on save, so they're not an error.
  const tags = content.tags.filter((tag) => tag.trim());
  if (tags.length > L.tags) errors.push({ field: 'tags', code: 'too_many' });
  content.tags.forEach((tag, index) => {
    if (tag.trim()) text('tags', tag, L.tagChars, index, false);
  });

  if (content.cook_note !== null) text('cook_note', content.cook_note, L.cookNoteChars, undefined, false);

  return errors;
}

// --- Diff -------------------------------------------------------------------------------------

export interface RecipeEditDiff {
  titleChanged: boolean;
  servingsChanged: boolean;
  /** 0-based rows in `after`: new, or name / amount / unit changed. */
  changedIngredientRows: number[];
  /** Any ingredient added, removed, or renamed. */
  ingredientSetChanged: boolean;
  /** An existing ingredient's amount or unit changed. */
  amountChanged: boolean;
  /** 0-based steps in `after`: new, or text changed. */
  changedStepRows: number[];
  stepsAdded: boolean;
  stepsDeleted: boolean;
  stepsMoved: boolean;
  tagsChanged: boolean;
  cookNoteChanged: boolean;
  /** Plain-language list of the changes, for Jev. */
  lines: string[];
}

const same = (a: string, b: string) => a.trim() === b.trim();

function ingredientLine(item: Ingredient): string {
  const amount = item.quantity > 0 ? `${item.quantity} ${item.unit.trim()}`.trim() : item.unit.trim();
  return amount ? `${amount} ${item.name.trim()}` : item.name.trim();
}

function cleanTagList(tags: readonly string[]): string[] {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

export function diffRecipeEdit(
  before: RecipeBeforeEdit,
  after: RecipeEditContent,
  stepSources: readonly (number | null)[],
  ingredientSources: readonly (number | null)[],
): RecipeEditDiff {
  const lines: string[] = [];
  const titleChanged = !same(before.title, after.title);
  if (titleChanged) lines.push(`Title: "${before.title.trim()}" -> "${after.title.trim()}"`);
  const servingsChanged = before.servings !== after.servings;
  if (servingsChanged) lines.push(`Servings: ${before.servings} -> ${after.servings}`);

  const changedIngredientRows: number[] = [];
  let ingredientSetChanged = false;
  let amountChanged = false;
  const usedIngredients = new Set<number>();
  after.ingredients.forEach((item, index) => {
    const src = ingredientSources[index];
    const old = src !== null && src !== undefined && !usedIngredients.has(src) ? before.ingredients[src] : undefined;
    if (!old) {
      changedIngredientRows.push(index);
      ingredientSetChanged = true;
      lines.push(`New ingredient ${index + 1}: ${ingredientLine(item)}`);
      return;
    }
    usedIngredients.add(src as number);
    const renamed = !same(old.name, item.name);
    const reAmounted = old.quantity !== item.quantity || !same(old.unit, item.unit);
    if (renamed) ingredientSetChanged = true;
    if (reAmounted) amountChanged = true;
    if (renamed || reAmounted) {
      changedIngredientRows.push(index);
      lines.push(`Ingredient ${index + 1}: "${ingredientLine(old)}" -> "${ingredientLine(item)}"`);
    }
  });
  before.ingredients.forEach((item, index) => {
    if (usedIngredients.has(index)) return;
    ingredientSetChanged = true;
    lines.push(`Removed ingredient: ${ingredientLine(item)}`);
  });

  const beforeSteps = new Map(before.instructions.map((step) => [step.step, step]));
  const changedStepRows: number[] = [];
  const usedSteps = new Set<number>();
  let stepsAdded = false;
  let stepsMoved = false;
  let lastSource = -Infinity;
  after.instructions.forEach((step, index) => {
    const src = stepSources[index];
    const old = src !== null && src !== undefined && !usedSteps.has(src) ? beforeSteps.get(src) : undefined;
    if (!old) {
      stepsAdded = true;
      changedStepRows.push(index);
      lines.push(`New step ${index + 1}: ${step.text.trim()}`);
      return;
    }
    usedSteps.add(old.step);
    if (old.step < lastSource) stepsMoved = true;
    lastSource = old.step;
    if (!same(old.text, step.text)) {
      changedStepRows.push(index);
      lines.push(`Step ${index + 1}: "${old.text.trim()}" -> "${step.text.trim()}"`);
    }
  });
  const deleted = before.instructions.filter((step) => !usedSteps.has(step.step));
  for (const step of deleted) lines.push(`Removed step: ${step.text.trim()}`);
  if (stepsMoved) lines.push('Steps were reordered.');

  const tagsChanged = cleanTagList(before.tags).join('\n') !== cleanTagList(after.tags).join('\n');
  if (tagsChanged) lines.push(`Tags: ${cleanTagList(after.tags).join(', ')}`);
  const cookNoteChanged = !same(before.cook_note ?? '', after.cook_note ?? '');
  if (cookNoteChanged) lines.push(`Cook note: ${(after.cook_note ?? '').trim()}`);

  return {
    titleChanged,
    servingsChanged,
    changedIngredientRows,
    ingredientSetChanged,
    amountChanged,
    changedStepRows,
    stepsAdded,
    stepsDeleted: deleted.length > 0,
    stepsMoved,
    tagsChanged,
    cookNoteChanged,
    lines,
  };
}

/** The fields an edit could change at all (see the header). Locked fields are left out later. */
function candidateFields(diff: RecipeEditDiff): Set<RecalcField> {
  const steps = diff.changedStepRows.length > 0 || diff.stepsAdded || diff.stepsDeleted || diff.stepsMoved;
  const stepText = diff.changedStepRows.length > 0 || diff.stepsAdded || diff.stepsDeleted;
  const set = diff.ingredientSetChanged;
  const out = new Set<RecalcField>();
  if (set || diff.amountChanged || diff.servingsChanged || stepText) out.add('calories');
  if (steps || set || diff.servingsChanged) out.add('estimated_time_minutes');
  if (steps || set) out.add('effort_level');
  if (set || diff.amountChanged || diff.servingsChanged) out.add('cost_estimate');
  if (diff.titleChanged || set || steps) out.add('tags');
  if (steps) out.add('appliances');
  if (diff.changedIngredientRows.length > 0) out.add('ingredient_amounts');
  return out;
}

// --- Jev questions ----------------------------------------------------------------------------

type ContentItems = {
  wholeRecipe: boolean;
  title: boolean;
  ingredientRows: number[];
  stepRows: number[];
  tags: boolean;
  cookNote: boolean;
};

const CONTENT_INSTRUCTIONS =
  'A home cook typed or edited this recipe by hand in a recipe app. Judge only the parts named in the question. Personal touches, family names, slang, typos, and any language are fine. Be lenient: answer against the content only when it clearly fails.';

const FIELD_QUESTIONS: Record<RecalcField, { instructions: string; yes: string; no: string }> = {
  calories: {
    instructions: "Could these changes change the recipe's total calories?",
    yes: 'Yes: what or how much is eaten changes: an ingredient added, removed, swapped or re-measured, a different number of servings, or a step that adds fat, sugar or frying.',
    no: 'No: only wording, spelling, order, or details that do not change what is eaten or how much.',
  },
  estimated_time_minutes: {
    instructions: 'Could these changes change how long the recipe takes from start to ready, including oven time and waits?',
    yes: 'Yes: a step, cooking time, resting or chilling time, method, or batch size changes.',
    no: 'No: only wording, spelling, or ingredients that take no extra time.',
  },
  effort_level: {
    instructions: 'Could these changes change how hard the recipe is to make (Easy, Medium, Hard)?',
    yes: 'Yes: steps or techniques are added, removed or made harder or simpler.',
    no: 'No: only wording, spelling, amounts, or swaps that need the same skill.',
  },
  cost_estimate: {
    instructions: 'Could these changes change how much the ingredients cost overall?',
    yes: 'Yes: an ingredient is added, removed, swapped, or used in a much larger or smaller amount.',
    no: 'No: only wording, spelling, steps, or a negligible amount.',
  },
  tags: {
    instructions: "Could these changes change the recipe's labels: cuisine, meal, dish type, cooking method, or diet traits such as vegetarian?",
    yes: 'Yes: the dish, its main ingredient, its cooking method, or a diet trait changes.',
    no: 'No: only wording, spelling, amounts, or minor ingredients.',
  },
  appliances: {
    instructions: 'Could these changes change which kitchen appliances or tools the recipe needs (oven, blender, mixer, pan, and so on)?',
    yes: 'Yes: a step now uses, or no longer uses, an appliance or tool, or the cooking method changes.',
    no: 'No: only wording, spelling, ingredients, or amounts.',
  },
  ingredient_amounts: {
    instructions: 'Could these changes change the gram/ml or cup/spoon equivalents of the changed ingredients?',
    yes: 'Yes: an amount, a unit, or the ingredient itself changed.',
    no: 'No: only a spelling fix or a clarification of the same ingredient in the same amount.',
  },
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  en: 'English',
  es: 'Spanish',
  he: 'Hebrew',
  ru: 'Russian',
};

function recipeText(recipe: RecipeEditContent): string {
  const parts = [
    `Title: ${recipe.title.trim()}`,
    `Servings: ${recipe.servings}`,
    'Ingredients:',
    ...recipe.ingredients.map((item, i) => `${i + 1}. ${ingredientLine(item)}`),
    'Steps:',
    ...recipe.instructions.map((step, i) => `${i + 1}. ${step.text.trim()}`),
  ];
  const tags = cleanTagList(recipe.tags);
  if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
  if (recipe.cook_note?.trim()) parts.push(`Cook note: ${recipe.cook_note.trim()}`);
  return parts.join('\n');
}

function noul(instructions: string, yes: string, no: string): JevQuestion {
  return { type: 'noul', instructions, criteria: { true: yes, false: no } };
}

/** One pick-one question per row group and failure: "none", or the row that fails. */
function rowChoice(
  instructions: string,
  none: string,
  label: 'Ingredient' | 'Step',
  rows: number[],
  lineOf: (row: number) => string,
): JevQuestion {
  const criteria: Record<string, string> = { none };
  for (const row of rows) criteria[`row_${row + 1}`] = `${label} ${row + 1}: ${lineOf(row)}`;
  return { type: 'choice', instructions: `${CONTENT_INSTRUCTIONS} ${instructions}`, criteria };
}

function contentQuestions(after: RecipeEditContent, items: ContentItems): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  const ing = (row: number) => ingredientLine(after.ingredients[row]);
  const step = (row: number) => after.instructions[row].text.trim();
  const spamYes = 'Clean: no links, web addresses, phone numbers, ads or promotions, and nothing offensive, hateful or sexual.';
  const spamNo = 'Contains a link or web address, an ad or promotion, contact details, or offensive, hateful or sexual content.';

  if (items.wholeRecipe) {
    q.recipe_is_recipe = noul(
      `${CONTENT_INSTRUCTIONS} Is the whole recipe a real recipe someone could cook or prepare?`,
      'A real food or drink recipe: the ingredients and steps go together and can be followed, even if short or informal.',
      'Not a recipe: random text, a test, a story, a joke, a list of non-food things, or ingredients and steps that cannot be cooked.',
    );
    q.recipe_is_safe = noul(
      `${CONTENT_INSTRUCTIONS} Is the result edible and safe to make and eat as written?`,
      'Safe: normal food, even if unusual, spicy, raw like sushi or tartare, or alcoholic.',
      'Unsafe: it uses something poisonous or not food (bleach, soap, detergent pods, poisonous plants), or a step could seriously hurt someone.',
    );
  }
  if (items.title) {
    q.title_is_recipe = noul(
      `${CONTENT_INSTRUCTIONS} Is the title a name for a dish, drink or recipe?`,
      "A dish, drink or recipe name, including personal ones like \"Grandma's Sunday stew\" or \"Mom's favourite\".",
      'Clearly not a recipe name: random characters, a message about something else, or a request.',
    );
    q.title_is_clean = noul(`${CONTENT_INSTRUCTIONS} Is the title clean?`, spamYes, spamNo);
  }
  if (items.ingredientRows.length) {
    const rows = items.ingredientRows;
    q.ingredients_not_recipe = rowChoice(
      'Which of these ingredients is clearly not something you can cook or prepare food with?',
      'All of them are food, drink, seasoning, or ordinary cooking items like water, foil or skewers.',
      'Ingredient',
      rows,
      ing,
    );
    q.ingredients_unsafe = rowChoice(
      'Which of these ingredients is unsafe to eat?',
      'None: all are safe to eat when cooked normally.',
      'Ingredient',
      rows,
      ing,
    );
    q.ingredients_spam = rowChoice(
      'Which of these ingredients contains a link, an ad, contact details, or offensive, hateful or sexual content?',
      'None: all are clean.',
      'Ingredient',
      rows,
      ing,
    );
  }
  if (items.stepRows.length) {
    const rows = items.stepRows;
    q.steps_not_recipe = rowChoice(
      'Which of these steps is clearly not a cooking or preparation step?',
      'All of them are cooking, preparation or serving steps, including tips and asides.',
      'Step',
      rows,
      step,
    );
    q.steps_unsafe = rowChoice(
      'Which of these steps is unsafe to follow?',
      'None: all are safe kitchen practice.',
      'Step',
      rows,
      step,
    );
    q.steps_spam = rowChoice(
      'Which of these steps contains a link, an ad, contact details, or offensive, hateful or sexual content?',
      'None: all are clean.',
      'Step',
      rows,
      step,
    );
  }
  if (items.tags) q.tags_are_clean = noul(`${CONTENT_INSTRUCTIONS} Are the tags clean?`, spamYes, spamNo);
  if (items.cookNote) q.cook_note_is_clean = noul(`${CONTENT_INSTRUCTIONS} Is the cook note clean?`, spamYes, spamNo);
  return q;
}

const FIELD_KEY = (field: RecalcField) => `affects_${field}`;

// --- Reading answers --------------------------------------------------------------------------

function noulOf(result: JevResult, key: string): number | null {
  const answer = result.answers[key];
  return answer?.type === 'noul' && Number.isFinite(answer.noul) ? Math.min(Math.max(answer.noul, 0), 1) : null;
}

function choiceOf(result: JevResult, key: string): JevChoiceAnswer | null {
  const answer = result.answers[key];
  return answer?.type === 'choice' && typeof answer.choice === 'string' ? answer : null;
}

/** Fails when Jev is sure (P(yes) at most 1 - CONTENT_BLOCK_CONFIDENCE) that the content does not pass. */
function noulFails(result: JevResult, key: string): boolean {
  const pass = noulOf(result, key);
  return pass !== null && 1 - pass >= CONTENT_BLOCK_CONFIDENCE;
}

/**
 * The failing row of a row choice, or null. Uses P(not none), so two bad rows that split the
 * probability still block, pointing at the likelier one.
 */
function failingRow(result: JevResult, key: string): number | null {
  const answer = choiceOf(result, key);
  if (!answer) return null;
  const probs = answer.probabilities ?? {};
  const confidence = Number(answer.confidence ?? 0);
  const pNone = typeof probs.none === 'number'
    ? probs.none
    : answer.choice === 'none' ? confidence : 1 - confidence;
  if (1 - pNone < CONTENT_BLOCK_CONFIDENCE) return null;
  let best = answer.choice !== 'none' ? answer.choice : null;
  for (const [option, p] of Object.entries(probs)) {
    if (option === 'none') continue;
    if (!best || p > (probs[best] ?? 0)) best = option;
  }
  const match = best?.match(/^row_(\d+)$/);
  return match ? Number(match[1]) - 1 : null;
}

function blockReasons(result: JevResult, items: ContentItems): RecipeEditBlockReason[] {
  const reasons: RecipeEditBlockReason[] = [];
  // A whole-recipe reason has no index (see RecipeEditBlockReason).
  if (items.wholeRecipe && noulFails(result, 'recipe_is_recipe')) reasons.push({ field: 'recipe', code: 'not_recipe' });
  if (items.wholeRecipe && noulFails(result, 'recipe_is_safe')) reasons.push({ field: 'recipe', code: 'unsafe' });
  if (items.title && noulFails(result, 'title_is_recipe')) reasons.push({ field: 'title', code: 'not_recipe' });
  if (items.title && noulFails(result, 'title_is_clean')) reasons.push({ field: 'title', code: 'spam' });
  const rows: Array<[string, 'ingredients' | 'instructions', RecipeEditBlockReason['code'], number[]]> = [
    ['ingredients_not_recipe', 'ingredients', 'not_recipe', items.ingredientRows],
    ['ingredients_unsafe', 'ingredients', 'unsafe', items.ingredientRows],
    ['ingredients_spam', 'ingredients', 'spam', items.ingredientRows],
    ['steps_not_recipe', 'instructions', 'not_recipe', items.stepRows],
    ['steps_unsafe', 'instructions', 'unsafe', items.stepRows],
    ['steps_spam', 'instructions', 'spam', items.stepRows],
  ];
  for (const [key, field, code, allowed] of rows) {
    const row = allowed.length ? failingRow(result, key) : null;
    if (row !== null && allowed.includes(row)) reasons.push({ field, index: row, code });
  }
  if (items.tags && noulFails(result, 'tags_are_clean')) reasons.push({ field: 'tags', code: 'spam' });
  if (items.cookNote && noulFails(result, 'cook_note_is_clean')) reasons.push({ field: 'cook_note', code: 'spam' });
  return reasons;
}

function detectLanguage(result: JevResult | null, fallback: string): string {
  const answer = result ? choiceOf(result, 'source_language') : null;
  if (
    answer &&
    (APP_LANGUAGE_CODES as readonly string[]).includes(answer.choice) &&
    Number(answer.confidence ?? 0) >= LANGUAGE_MIN_CONFIDENCE
  ) {
    return answer.choice;
  }
  return fallback;
}

function ordered(fields: Iterable<RecalcField>): RecalcField[] {
  const set = new Set(fields);
  return RECALC_FIELDS.filter((field) => set.has(field));
}

// --- Plan -------------------------------------------------------------------------------------

export async function planRecipeEdit(input: RecipeEditPlanInput): Promise<RecipeEditPlan> {
  const errors = checkRecipeLimits(input.after);
  if (errors.length) return { outcome: 'invalid', errors };

  const after = input.after;
  const locked = new Set<string>(input.lockedFields);
  const written = input.before === null;

  let items: ContentItems;
  let candidates: Set<RecalcField>;
  let forced = new Set<RecalcField>();
  let amountRows: number[];
  let lines: string[] = [];

  if (input.before === null) {
    items = {
      wholeRecipe: true,
      title: true,
      ingredientRows: after.ingredients.map((_, i) => i),
      stepRows: after.instructions.map((_, i) => i),
      tags: cleanTagList(after.tags).length > 0,
      cookNote: Boolean(after.cook_note?.trim()),
    };
    // A written recipe has no estimates yet: every unlocked field, no per-field questions.
    candidates = new Set();
    forced = new Set(RECALC_FIELDS);
    amountRows = after.ingredients.map((_, i) => i);
  } else {
    const diff = diffRecipeEdit(
      input.before,
      after,
      input.stepSources ?? after.instructions.map((s) => s.step),
      input.ingredientSources ?? after.ingredients.map((_, i) => i),
    );
    lines = diff.lines;
    items = {
      wholeRecipe: false,
      title: diff.titleChanged,
      ingredientRows: diff.changedIngredientRows,
      stepRows: diff.changedStepRows,
      tags: diff.tagsChanged && cleanTagList(after.tags).length > 0,
      cookNote: diff.cookNoteChanged && Boolean(after.cook_note?.trim()),
    };
    candidates = candidateFields(diff);
    if (diff.stepsAdded || diff.stepsDeleted) {
      candidates.delete('appliances');
      forced.add('appliances');
    }
    amountRows = diff.changedIngredientRows;
  }

  for (const field of locked) {
    candidates.delete(field as RecalcField);
    forced.delete(field as RecalcField);
  }
  if (forced.has('ingredient_amounts') && amountRows.length === 0) forced.delete('ingredient_amounts');

  const questions: Record<string, JevQuestion> = contentQuestions(after, items);
  for (const field of candidates) {
    const f = FIELD_QUESTIONS[field];
    questions[FIELD_KEY(field)] = noul(f.instructions, f.yes, f.no);
  }
  if (written) {
    const criteria: Record<string, string> = {};
    for (const code of APP_LANGUAGE_CODES) criteria[code] = `The recipe is written in ${LANGUAGE_NAMES[code]}.`;
    questions.source_language = {
      type: 'choice',
      instructions: 'Which language is the title, ingredients and steps of this recipe written in?',
      criteria,
    };
  }

  const finish = (recalc: Iterable<RecalcField>, extra: Partial<Extract<RecipeEditPlan, { outcome: 'save' }>>) => {
    const recalculate = ordered(recalc);
    return {
      outcome: 'save' as const,
      recalculate,
      amountRows: recalculate.includes('ingredient_amounts') ? amountRows : [],
      jevFailed: false,
      jev: null,
      scores: {},
      ...extra,
    };
  };

  // Nothing changed that Jev could judge: no call.
  if (Object.keys(questions).length === 0) return finish(forced, {});

  const state: Record<string, unknown> = { recipe: recipeText(after) };
  if (!written) state.changes = lines.join('\n');

  let result: JevResult;
  try {
    result = await jevDecide({ state, questions, timeoutMs: input.jevTimeoutMs });
  } catch (err) {
    // Fail open: the hard limits already passed, and the CHECKs are the backstop (ADR 018).
    return finish([...forced, ...candidates], {
      jevFailed: true,
      jevError: err instanceof Error ? err.message.slice(0, 300) : String(err),
      ...(written ? { sourceLanguage: detectLanguage(null, input.appLanguage) } : {}),
    });
  }
  const jev: JevUsage = {
    model: result.model,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    ms: result.ms,
  };

  const reasons = blockReasons(result, items);
  if (reasons.length) return { outcome: 'blocked', reasons, jev };

  const scores: Partial<Record<RecalcField, number>> = {};
  const recalc = new Set(forced);
  for (const field of candidates) {
    const score = noulOf(result, FIELD_KEY(field));
    if (score !== null) scores[field] = score;
    if (score === null || score >= RECALC_SKIP_BELOW) recalc.add(field);
  }

  return finish(recalc, {
    jev,
    scores,
    ...(written ? { sourceLanguage: detectLanguage(result, input.appLanguage) } : {}),
  });
}

// --- Storing ----------------------------------------------------------------------------------

/**
 * The user's content as stored: text trimmed, steps renumbered, blank tags dropped, tags
 * lowercased and deduped like model tags, an empty cook note as null. Use after a `save` plan.
 */
export function storedEditContent(content: RecipeEditContent) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of content.tags) {
    const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return {
    title: content.title.trim(),
    servings: content.servings,
    ingredients: content.ingredients.map((item) => ({ ...item, name: item.name.trim(), unit: item.unit.trim() })),
    instructions: content.instructions.map((step, index) => ({ ...step, step: index + 1, text: step.text.trim() })),
    estimated_time_minutes: content.estimated_time_minutes,
    calories: content.calories,
    effort_level: content.effort_level,
    cost_estimate: content.cost_estimate,
    tags,
    cook_note: content.cook_note?.trim() || null,
  };
}
