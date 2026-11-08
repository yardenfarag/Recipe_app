/**
 * Form state for Edit recipe and Write a recipe (PIN-79, ADR 018). Pure: no React, no I/O.
 *
 * Rows (ingredients, steps) carry stable ids, so moving or deleting a step remaps appliance step
 * links exactly, and each step keeps its video timestamp. Every function returns a new state.
 * Messages are i18n keys in the `recipeEditor` namespace, so the screen only translates them.
 */
import {
  type AlternativeKey,
  type ApplianceKey,
  type ApplianceOrigin,
  type BenefitKey,
  recipeAppliancesOf,
} from '@/lib/appliances';
import { charCount, RECIPE_LIMITS } from '@/lib/recipeLimits';
import type {
  RecipeEditBlockReason,
  RecipeEditContent,
  RecipeEditField,
  RecipeEditLimitError,
  SaveRecipeEditRequest,
} from '@/lib/supabase/saveRecipeEdit';
import {
  type CostEstimate,
  type EffortLevel,
  type Ingredient,
  LOCKABLE_FIELDS,
  type LockedField,
  type Recipe,
} from '@/types/recipe';

export type EditorMode = 'edit' | 'write';

export interface IngredientRow {
  id: string;
  name: string;
  /** As typed: "1.5", "1/2", "1 ½". Blank = 0 ("to taste"). */
  quantity: string;
  unit: string;
  /** Index in the saved recipe's ingredients, or null for a new row. */
  source: number | null;
}

export interface StepRow {
  id: string;
  text: string;
  /** The `step` number this step had in the saved recipe, or null for a new step. */
  source: number | null;
  /** Seconds into the source video; follows the step wherever it moves. */
  timestampSeconds?: number;
}

export interface ApplianceRow {
  key: ApplianceKey;
  required: boolean;
  benefit?: BenefitKey;
  alternative?: ApplianceKey | AlternativeKey;
  origin: ApplianceOrigin;
  /** Step row ids, not numbers, so the links follow the steps. */
  stepIds: string[];
}

export type EditorPhoto =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; base64: string; mimeType: string };

/** The AI-derived values as they were when the editor opened, for change tracking and reset. */
interface Baseline {
  values: Record<LockedField, unknown>;
  locked: LockedField[];
  ingredients: Ingredient[];
  snapshot: string;
}

export interface RecipeEditorState {
  mode: EditorMode;
  recipeId: string | null;
  title: string;
  photo: EditorPhoto;
  /** The saved photo (Edit), shown while `photo` is keep. */
  imageUrl: string | null;
  servings: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
  time: string;
  calories: string;
  effort: EffortLevel | null;
  cost: CostEstimate | null;
  tags: string[];
  /** null = not analysed (show nothing). */
  appliances: ApplianceRow[] | null;
  cookNote: string;
  /** Written recipe, or a saved one with extraction_source 'manual'. */
  written: boolean;
  sourceUrl: string | null;
  /** Fields the user chose "reset to Pinch's estimate" on. */
  resetFields: LockedField[];
  baseline: Baseline;
  nextId: number;
}

/** A message for the screen: an i18n key and its interpolation values. */
export interface EditorMessage {
  key: string;
  params?: Record<string, number>;
}

export interface IngredientRowErrors {
  name?: EditorMessage;
  quantity?: EditorMessage;
  /** Blocked by the content check: shown under the whole row. */
  row?: EditorMessage;
}

export type EditorFieldKey =
  | 'title'
  | 'photo'
  | 'servings'
  | 'time'
  | 'calories'
  | 'tags'
  | 'cookNote'
  | 'ingredients'
  | 'steps';

export interface EditorErrors {
  fields: Partial<Record<EditorFieldKey, EditorMessage>>;
  ingredientRows: Record<string, IngredientRowErrors>;
  stepRows: Record<string, EditorMessage>;
  /** Content-check reasons about the recipe as a whole. */
  recipe: EditorMessage[];
}

/** Which sent row each index in the request refers to, to place server errors next to rows. */
export interface RowMap {
  ingredientIds: string[];
  stepIds: string[];
}

export type BuildResult =
  | { ok: true; request: SaveRecipeEditRequest; rows: RowMap }
  | { ok: false; errors: EditorErrors };

const KEY = 'recipeEditor';
const L = RECIPE_LIMITS;

// ---------------------------------------------------------------------------------------------
// Numbers

const DIGIT_MAP: Record<string, string> = {};
'٠١٢٣٤٥٦٧٨٩'.split('').forEach((d, i) => (DIGIT_MAP[d] = String(i)));
'۰۱۲۳۴۵۶۷۸۹'.split('').forEach((d, i) => (DIGIT_MAP[d] = String(i)));

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

function normalizeNumberText(text: string): string {
  return text
    .trim()
    .replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/[٫,]/g, '.')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (f) => ` ${UNICODE_FRACTIONS[f]}`)
    .replace(/⁄/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an amount as people type it: "2", "1.5", "1,5", "1/2", "1 1/2", "1½", Arabic-Indic digits.
 * Blank is 0. Returns null when it isn't a number.
 */
export function parseQuantity(text: string): number | null {
  const value = normalizeNumberText(text);
  if (!value) return 0;
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(value)) return Number(value);
  const fraction = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(value);
  if (fraction) {
    const whole = fraction[1] ? Number(fraction[1]) : 0;
    const denominator = Number(fraction[3]);
    if (denominator === 0) return null;
    return whole + Number(fraction[2]) / denominator;
  }
  return null;
}

/** A whole number (decimals round), null for blank, NaN when it isn't a number. */
function parseWhole(text: string): number | null {
  const value = normalizeNumberText(text);
  if (!value) return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return Number.NaN;
  return Math.round(Number(value));
}

function quantityText(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '';
  return String(Number(quantity.toFixed(3)));
}

function numberText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value);
}

// ---------------------------------------------------------------------------------------------
// Creating

function stepNumberOf(step: { step?: unknown }, index: number): number {
  return Number.isInteger(step.step) && (step.step as number) > 0 ? (step.step as number) : index + 1;
}

/** Normalizes a typed tag like the library does: lowercase, single spaces, no leading #. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
}

/** Editor state for a saved recipe (Edit), or an empty one (Write) when no recipe is given. */
export function createEditorState(recipe?: Recipe | null): RecipeEditorState {
  let nextId = 1;
  const id = (prefix: string) => `${prefix}${nextId++}`;

  if (!recipe) {
    const state: RecipeEditorState = {
      mode: 'write',
      recipeId: null,
      title: '',
      photo: { kind: 'keep' },
      imageUrl: null,
      servings: '2',
      ingredients: [{ id: id('i'), name: '', quantity: '', unit: '', source: null }],
      steps: [{ id: id('s'), text: '', source: null }],
      time: '',
      calories: '',
      effort: null,
      cost: null,
      tags: [],
      appliances: null,
      cookNote: '',
      written: true,
      sourceUrl: null,
      resetFields: [],
      baseline: { values: {} as Record<LockedField, unknown>, locked: [], ingredients: [], snapshot: '' },
      nextId,
    };
    return withBaseline(state, []);
  }

  const ingredients: IngredientRow[] = (recipe.ingredients ?? []).map((item, index) => ({
    id: id('i'),
    name: item.name ?? '',
    quantity: quantityText(item.quantity),
    unit: item.unit ?? '',
    source: index,
  }));

  const steps: StepRow[] = (recipe.instructions ?? []).map((item, index) => {
    const row: StepRow = { id: id('s'), text: item.text ?? '', source: stepNumberOf(item, index) };
    if (typeof item.timestamp_seconds === 'number') row.timestampSeconds = item.timestamp_seconds;
    return row;
  });

  const idByStepNumber = new Map<number, string>();
  for (const row of steps) {
    if (row.source != null && !idByStepNumber.has(row.source)) idByStepNumber.set(row.source, row.id);
  }
  const cleaned = recipeAppliancesOf(recipe);
  const appliances: ApplianceRow[] | null = cleaned
    ? cleaned.map((item) => {
        const row: ApplianceRow = {
          key: item.key,
          required: item.required,
          origin: item.origin,
          stepIds: item.steps.flatMap((n) => {
            const stepId = idByStepNumber.get(n);
            return stepId ? [stepId] : [];
          }),
        };
        if (item.benefit) row.benefit = item.benefit;
        if (item.alternative) row.alternative = item.alternative;
        return row;
      })
    : null;

  const state: RecipeEditorState = {
    mode: 'edit',
    recipeId: recipe.id,
    title: recipe.title ?? '',
    photo: { kind: 'keep' },
    imageUrl: recipe.image_url ?? null,
    servings: numberText(recipe.servings),
    ingredients,
    steps,
    time: numberText(recipe.estimated_time_minutes),
    calories: numberText(recipe.calories),
    effort: recipe.effort_level ?? null,
    cost: recipe.cost_estimate ?? null,
    tags: [...(recipe.tags ?? [])],
    appliances,
    cookNote: recipe.cook_note ?? '',
    written: recipe.extraction_source === 'manual',
    sourceUrl: recipe.original_url ?? null,
    resetFields: [],
    baseline: { values: {} as Record<LockedField, unknown>, locked: [], ingredients: [], snapshot: '' },
    nextId,
  };
  const locked = (recipe.locked_fields ?? []).filter((f): f is LockedField =>
    (LOCKABLE_FIELDS as readonly string[]).includes(f),
  );
  return withBaseline({ ...state }, locked, recipe.ingredients ?? []);
}

function withBaseline(
  state: RecipeEditorState,
  locked: LockedField[],
  ingredients: Ingredient[] = [],
): RecipeEditorState {
  const values = {} as Record<LockedField, unknown>;
  for (const field of LOCKABLE_FIELDS) values[field] = clone(fieldValue(state, field));
  const next: RecipeEditorState = {
    ...state,
    baseline: { values, locked, ingredients, snapshot: '' },
  };
  next.baseline.snapshot = snapshot(next);
  return next;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

// ---------------------------------------------------------------------------------------------
// Locking

function fieldValue(state: RecipeEditorState, field: LockedField): unknown {
  switch (field) {
    case 'calories':
      return state.calories;
    case 'estimated_time_minutes':
      return state.time;
    case 'effort_level':
      return state.effort;
    case 'cost_estimate':
      return state.cost;
    case 'tags':
      return state.tags;
    case 'appliances':
      return state.appliances;
  }
}

/** Appliance links compared on the steps that still exist, so deleting a step isn't "set by hand". */
function comparableAppliances(rows: ApplianceRow[] | null, stepIds: Set<string>): unknown {
  if (rows === null) return null;
  return rows
    .map((row) => ({ ...row, stepIds: row.stepIds.filter((id) => stepIds.has(id)) }))
    .filter((row) => row.stepIds.length > 0)
    .map((row) => ({ ...row, stepIds: [...row.stepIds].sort() }));
}

function fieldChanged(state: RecipeEditorState, field: LockedField): boolean {
  const before = state.baseline.values[field];
  const now = fieldValue(state, field);
  if (field === 'appliances') {
    const ids = new Set(state.steps.map((s) => s.id));
    return (
      JSON.stringify(comparableAppliances(before as ApplianceRow[] | null, ids)) !==
      JSON.stringify(comparableAppliances(now as ApplianceRow[] | null, ids))
    );
  }
  if (typeof now === 'string' && typeof before === 'string') return now.trim() !== before.trim();
  return JSON.stringify(now) !== JSON.stringify(before);
}

/**
 * Fields the user set by hand. A field is locked when it was locked when the editor opened (and
 * not reset since), or when its value differs from what Pinch had. Changing it back unlocks it.
 */
export function lockedFields(state: RecipeEditorState): LockedField[] {
  return LOCKABLE_FIELDS.filter(
    (field) =>
      (state.baseline.locked.includes(field) && !state.resetFields.includes(field)) ||
      fieldChanged(state, field),
  );
}

export function isLocked(state: RecipeEditorState, field: LockedField): boolean {
  return lockedFields(state).includes(field);
}

/**
 * "Reset to Pinch's estimate": puts the value back to what Pinch had and unlocks the field, so the
 * server recalculates it. Reset appliances keep following the steps as they are now.
 */
export function resetField(state: RecipeEditorState, field: LockedField): RecipeEditorState {
  const value = clone(state.baseline.values[field]);
  const resetFields = state.resetFields.includes(field)
    ? state.resetFields
    : [...state.resetFields, field];
  const next = { ...state, resetFields };
  switch (field) {
    case 'calories':
      return { ...next, calories: value as string };
    case 'estimated_time_minutes':
      return { ...next, time: value as string };
    case 'effort_level':
      return { ...next, effort: value as EffortLevel | null };
    case 'cost_estimate':
      return { ...next, cost: value as CostEstimate | null };
    case 'tags':
      return { ...next, tags: value as string[] };
    case 'appliances': {
      const ids = new Set(state.steps.map((s) => s.id));
      const rows = value as ApplianceRow[] | null;
      return {
        ...next,
        appliances: rows
          ? rows
              .map((row) => ({ ...row, stepIds: row.stepIds.filter((id) => ids.has(id)) }))
              .filter((row) => row.stepIds.length > 0)
          : null,
      };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Basics

export function setTitle(state: RecipeEditorState, title: string): RecipeEditorState {
  return { ...state, title };
}

/** Servings only. Ingredient amounts never change with it. */
export function setServings(state: RecipeEditorState, servings: string): RecipeEditorState {
  return { ...state, servings };
}

export function setPhoto(state: RecipeEditorState, photo: EditorPhoto): RecipeEditorState {
  return { ...state, photo };
}

/** True when the editor shows a photo: the saved one, or one just picked. */
export function hasPhoto(state: RecipeEditorState): boolean {
  if (state.photo.kind === 'replace') return true;
  return state.photo.kind === 'keep' && Boolean(state.imageUrl);
}

export function setCookNote(state: RecipeEditorState, cookNote: string): RecipeEditorState {
  return { ...state, cookNote };
}

// ---------------------------------------------------------------------------------------------
// Details (AI-derived, lockable)

export function setTime(state: RecipeEditorState, time: string): RecipeEditorState {
  return { ...state, time };
}

export function setCalories(state: RecipeEditorState, calories: string): RecipeEditorState {
  return { ...state, calories };
}

export function setEffort(state: RecipeEditorState, effort: EffortLevel | null): RecipeEditorState {
  return { ...state, effort };
}

export function setCost(state: RecipeEditorState, cost: CostEstimate | null): RecipeEditorState {
  return { ...state, cost };
}

/** Adds a normalized tag; blank or duplicate tags are ignored. Limits are reported by validate. */
export function addTag(state: RecipeEditorState, raw: string): RecipeEditorState {
  const tag = normalizeTag(raw);
  if (!tag || state.tags.includes(tag)) return state;
  return { ...state, tags: [...state.tags, tag] };
}

export function removeTag(state: RecipeEditorState, tag: string): RecipeEditorState {
  return { ...state, tags: state.tags.filter((t) => t !== tag) };
}

// ---------------------------------------------------------------------------------------------
// Rows

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export function addIngredient(state: RecipeEditorState): RecipeEditorState {
  const row: IngredientRow = { id: `i${state.nextId}`, name: '', quantity: '', unit: '', source: null };
  return { ...state, ingredients: [...state.ingredients, row], nextId: state.nextId + 1 };
}

export function updateIngredient(
  state: RecipeEditorState,
  id: string,
  patch: Partial<Pick<IngredientRow, 'name' | 'quantity' | 'unit'>>,
): RecipeEditorState {
  return {
    ...state,
    ingredients: state.ingredients.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  };
}

export function removeIngredient(state: RecipeEditorState, id: string): RecipeEditorState {
  return { ...state, ingredients: state.ingredients.filter((row) => row.id !== id) };
}

export function moveIngredient(state: RecipeEditorState, from: number, to: number): RecipeEditorState {
  return { ...state, ingredients: moveItem(state.ingredients, from, to) };
}

export function addStep(state: RecipeEditorState): RecipeEditorState {
  const row: StepRow = { id: `s${state.nextId}`, text: '', source: null };
  return { ...state, steps: [...state.steps, row], nextId: state.nextId + 1 };
}

export function updateStep(state: RecipeEditorState, id: string, text: string): RecipeEditorState {
  return { ...state, steps: state.steps.map((row) => (row.id === id ? { ...row, text } : row)) };
}

/** Deletes a step. Appliance links to it are dropped, and an appliance left with none is dropped. */
export function removeStep(state: RecipeEditorState, id: string): RecipeEditorState {
  const appliances = state.appliances
    ? state.appliances
        .map((row) => ({ ...row, stepIds: row.stepIds.filter((stepId) => stepId !== id) }))
        .filter((row) => row.stepIds.length > 0)
    : null;
  return { ...state, steps: state.steps.filter((row) => row.id !== id), appliances };
}

/** Moves a step; its appliance links and video timestamp go with it. */
export function moveStep(state: RecipeEditorState, from: number, to: number): RecipeEditorState {
  return { ...state, steps: moveItem(state.steps, from, to) };
}

// ---------------------------------------------------------------------------------------------
// Appliances

/** Adds an appliance from the catalog, linked to every current step. No-op if already listed. */
export function addAppliance(
  state: RecipeEditorState,
  key: ApplianceKey,
  required = true,
): RecipeEditorState {
  const rows = state.appliances ?? [];
  if (rows.some((row) => row.key === key) || state.steps.length === 0) return state;
  const row: ApplianceRow = { key, required, origin: 'source', stepIds: state.steps.map((s) => s.id) };
  return { ...state, appliances: [...rows, row] };
}

export function removeAppliance(state: RecipeEditorState, key: ApplianceKey): RecipeEditorState {
  if (!state.appliances) return state;
  return { ...state, appliances: state.appliances.filter((row) => row.key !== key) };
}

/** Marks an appliance required or optional. A Pinch tip marked required becomes the user's own. */
export function setApplianceRequired(
  state: RecipeEditorState,
  key: ApplianceKey,
  required: boolean,
): RecipeEditorState {
  if (!state.appliances) return state;
  return {
    ...state,
    appliances: state.appliances.map((row) => {
      if (row.key !== key || row.required === required) return row;
      const next: ApplianceRow = { ...row, required };
      if (required) {
        next.origin = 'source';
        delete next.benefit;
      }
      return next;
    }),
  };
}

/** Links or unlinks a step. The last link can't be removed: delete the appliance instead. */
export function toggleApplianceStep(
  state: RecipeEditorState,
  key: ApplianceKey,
  stepId: string,
): RecipeEditorState {
  if (!state.appliances) return state;
  return {
    ...state,
    appliances: state.appliances.map((row) => {
      if (row.key !== key) return row;
      const linked = row.stepIds.includes(stepId);
      if (linked && row.stepIds.length === 1) return row;
      return {
        ...row,
        stepIds: linked ? row.stepIds.filter((id) => id !== stepId) : [...row.stepIds, stepId],
      };
    }),
  };
}

/** The 1-based step positions an appliance is linked to, as the editor shows them now. */
export function applianceStepNumbers(state: RecipeEditorState, key: ApplianceKey): number[] {
  const row = state.appliances?.find((a) => a.key === key);
  if (!row) return [];
  return state.steps
    .map((step, index) => (row.stepIds.includes(step.id) ? index + 1 : 0))
    .filter((n) => n > 0);
}

// ---------------------------------------------------------------------------------------------
// Change tracking

function isBlankIngredient(row: IngredientRow): boolean {
  return !row.name.trim() && !row.quantity.trim() && !row.unit.trim();
}

function isBlankStep(row: StepRow): boolean {
  return !row.text.trim();
}

function snapshot(state: RecipeEditorState): string {
  const steps = state.steps.filter((row) => !isBlankStep(row));
  const position = new Map(steps.map((row, index) => [row.id, index + 1]));
  return JSON.stringify({
    title: state.title.trim(),
    servings: state.servings.trim(),
    ingredients: state.ingredients
      .filter((row) => !isBlankIngredient(row))
      .map((row) => [row.name.trim(), row.quantity.trim(), row.unit.trim()]),
    steps: steps.map((row) => row.text.trim()),
    time: state.time.trim(),
    calories: state.calories.trim(),
    effort: state.effort,
    cost: state.cost,
    tags: state.tags,
    appliances:
      state.appliances?.map((row) => ({
        key: row.key,
        required: row.required,
        origin: row.origin,
        steps: row.stepIds.map((id) => position.get(id) ?? 0).filter((n) => n > 0).sort((a, b) => a - b),
      })) ?? null,
    cookNote: state.cookNote.trim(),
  });
}

/** True when saving would change something. Blank rows added and left empty don't count. */
export function hasChanges(state: RecipeEditorState): boolean {
  if (state.photo.kind !== 'keep') return true;
  if (snapshot(state) !== state.baseline.snapshot) return true;
  const locked = lockedFields(state);
  return (
    locked.length !== state.baseline.locked.length ||
    locked.some((field) => !state.baseline.locked.includes(field))
  );
}

/** Cancel, swipe back and Android back ask before leaving only when there are changes. */
export function needsDiscardConfirm(state: RecipeEditorState): boolean {
  return hasChanges(state);
}

// ---------------------------------------------------------------------------------------------
// Validation

function emptyErrors(): EditorErrors {
  return { fields: {}, ingredientRows: {}, stepRows: {}, recipe: [] };
}

export function hasErrors(errors: EditorErrors): boolean {
  return (
    Object.keys(errors.fields).length > 0 ||
    Object.keys(errors.ingredientRows).length > 0 ||
    Object.keys(errors.stepRows).length > 0 ||
    errors.recipe.length > 0
  );
}

const msg = {
  required: (): EditorMessage => ({ key: `${KEY}.errors.required` }),
  tooLong: (max: number): EditorMessage => ({ key: `${KEY}.errors.tooLong`, params: { max } }),
  tooMany: (max: number): EditorMessage => ({ key: `${KEY}.errors.tooMany`, params: { max } }),
  outOfRange: (min: number, max: number): EditorMessage => ({
    key: `${KEY}.errors.outOfRange`,
    params: { min, max },
  }),
  needIngredient: (): EditorMessage => ({ key: `${KEY}.errors.needIngredient` }),
  needStep: (): EditorMessage => ({ key: `${KEY}.errors.needStep` }),
};

/** Save is enabled once there's a title, at least one ingredient and at least one step. */
export function canSave(state: RecipeEditorState): boolean {
  return (
    state.title.trim().length > 0 &&
    state.ingredients.some((row) => row.name.trim().length > 0) &&
    state.steps.some((row) => row.text.trim().length > 0)
  );
}

/** Checks the same hard limits as the database. Fully blank rows are ignored (not saved). */
export function validate(state: RecipeEditorState): EditorErrors {
  const errors = emptyErrors();
  const { fields } = errors;

  const title = state.title.trim();
  if (!title) fields.title = msg.required();
  else if (charCount(title) > L.titleChars) fields.title = msg.tooLong(L.titleChars);

  const servings = parseWhole(state.servings);
  if (servings === null) fields.servings = msg.required();
  else if (!(servings >= L.servingsMin && servings <= L.servingsMax)) {
    fields.servings = msg.outOfRange(L.servingsMin, L.servingsMax);
  }

  const ingredients = state.ingredients.filter((row) => !isBlankIngredient(row));
  if (ingredients.length === 0) fields.ingredients = msg.needIngredient();
  else if (ingredients.length > L.ingredients) fields.ingredients = msg.tooMany(L.ingredients);
  for (const row of ingredients) {
    const rowErrors: IngredientRowErrors = {};
    const name = row.name.trim();
    if (!name) rowErrors.name = msg.required();
    else if (charCount(name) > L.ingredientNameChars) rowErrors.name = msg.tooLong(L.ingredientNameChars);
    const quantity = parseQuantity(row.quantity);
    if (quantity === null || quantity < 0 || quantity > L.quantityMax) {
      rowErrors.quantity = msg.outOfRange(0, L.quantityMax);
    }
    if (rowErrors.name || rowErrors.quantity) errors.ingredientRows[row.id] = rowErrors;
  }

  const steps = state.steps.filter((row) => !isBlankStep(row));
  if (steps.length === 0) fields.steps = msg.needStep();
  else if (steps.length > L.steps) fields.steps = msg.tooMany(L.steps);
  for (const row of steps) {
    if (charCount(row.text.trim()) > L.stepChars) errors.stepRows[row.id] = msg.tooLong(L.stepChars);
  }

  const time = parseWhole(state.time);
  if (time !== null && !(time >= L.timeMinutesMin && time <= L.timeMinutesMax)) {
    fields.time = msg.outOfRange(L.timeMinutesMin, L.timeMinutesMax);
  }

  const calories = parseWhole(state.calories);
  if (calories !== null && !(calories >= 0 && calories <= L.caloriesMax)) {
    fields.calories = msg.outOfRange(0, L.caloriesMax);
  }

  if (state.tags.length > L.tags) fields.tags = msg.tooMany(L.tags);
  else if (state.tags.some((tag) => charCount(tag) > L.tagChars)) fields.tags = msg.tooLong(L.tagChars);

  if (charCount(state.cookNote.trim()) > L.cookNoteChars) fields.cookNote = msg.tooLong(L.cookNoteChars);

  return errors;
}

// ---------------------------------------------------------------------------------------------
// Save request

function sameIngredient(row: IngredientRow, original: Ingredient | undefined): boolean {
  return (
    original !== undefined &&
    row.name.trim() === (original.name ?? '').trim() &&
    row.unit.trim() === (original.unit ?? '').trim() &&
    row.quantity.trim() === quantityText(original.quantity)
  );
}

/**
 * Builds the save-recipe-edit request, or returns the errors that stop it. Steps are renumbered
 * 1..n in display order with their timestamps; appliance links are remapped to those numbers.
 */
export function buildSaveRequest(state: RecipeEditorState, appLanguage: string): BuildResult {
  const errors = validate(state);
  if (hasErrors(errors)) return { ok: false, errors };

  const ingredientRows = state.ingredients.filter((row) => !isBlankIngredient(row));
  const stepRows = state.steps.filter((row) => !isBlankStep(row));

  const ingredients: Ingredient[] = ingredientRows.map((row) => {
    const original = row.source != null ? state.baseline.ingredients[row.source] : undefined;
    // An untouched row keeps its exact amount and its grams/spoons; a changed one is recalculated.
    if (original && sameIngredient(row, original)) return { ...original, name: row.name.trim(), unit: row.unit.trim() };
    return { name: row.name.trim(), quantity: parseQuantity(row.quantity) ?? 0, unit: row.unit.trim() };
  });

  const instructions = stepRows.map((row, index) => {
    const step: { step: number; text: string; timestamp_seconds?: number } = {
      step: index + 1,
      text: row.text.trim(),
    };
    if (row.timestampSeconds !== undefined) step.timestamp_seconds = row.timestampSeconds;
    return step;
  });

  const numberById = new Map(stepRows.map((row, index) => [row.id, index + 1]));
  let appliances: RecipeEditContent['appliances'] = null;
  if (state.appliances) {
    const kept = state.appliances.flatMap((row) => {
      const steps = [...new Set(row.stepIds.map((id) => numberById.get(id)).filter((n): n is number => n !== undefined))].sort(
        (a, b) => a - b,
      );
      if (steps.length === 0) return [];
      const item: NonNullable<RecipeEditContent['appliances']>[number] = {
        key: row.key,
        required: row.required,
        steps,
        origin: row.origin,
      };
      if (row.benefit && !row.required) item.benefit = row.benefit;
      if (row.alternative) item.alternative = row.alternative;
      return [item];
    });
    // Something was listed but no link survived: unknown, not "needs nothing" (like the sanitizer).
    appliances = state.appliances.length > 0 && kept.length === 0 ? null : kept;
  }

  const photo: RecipeEditContent['photo'] =
    state.photo.kind === 'replace'
      ? { action: 'replace', base64: state.photo.base64, mime_type: state.photo.mimeType }
      : { action: state.photo.kind };

  const cookNote = state.cookNote.trim();
  const content: RecipeEditContent = {
    title: state.title.trim(),
    photo,
    servings: parseWhole(state.servings) as number,
    ingredients,
    instructions,
    estimated_time_minutes: parseWhole(state.time),
    calories: parseWhole(state.calories),
    effort_level: state.effort,
    cost_estimate: state.cost,
    tags: [...state.tags],
    appliances,
    cook_note: cookNote || null,
  };

  const rows: RowMap = {
    ingredientIds: ingredientRows.map((row) => row.id),
    stepIds: stepRows.map((row) => row.id),
  };
  const locked_fields = lockedFields(state);

  if (state.mode === 'edit' && state.recipeId) {
    return {
      ok: true,
      rows,
      request: {
        mode: 'edit',
        recipe_id: state.recipeId,
        content,
        locked_fields,
        step_sources: stepRows.map((row) => row.source),
        ingredient_sources: ingredientRows.map((row) => row.source),
        app_language: appLanguage,
      },
    };
  }
  return {
    ok: true,
    rows,
    request: { mode: 'write', content, locked_fields, app_language: appLanguage },
  };
}

// ---------------------------------------------------------------------------------------------
// Server results

const FIELD_KEYS: Partial<Record<RecipeEditField, EditorFieldKey>> = {
  title: 'title',
  photo: 'photo',
  servings: 'servings',
  estimated_time_minutes: 'time',
  calories: 'calories',
  tags: 'tags',
  cook_note: 'cookNote',
  ingredients: 'ingredients',
  instructions: 'steps',
};

function limitMessage(error: RecipeEditLimitError): EditorMessage {
  const { field, code } = error;
  if (code === 'required') {
    if (field === 'ingredients' && error.index === undefined) return msg.needIngredient();
    if (field === 'instructions' && error.index === undefined) return msg.needStep();
    return msg.required();
  }
  if (code === 'too_many') {
    if (field === 'ingredients') return msg.tooMany(L.ingredients);
    if (field === 'instructions') return msg.tooMany(L.steps);
    return msg.tooMany(L.tags);
  }
  if (code === 'too_long') {
    const max =
      field === 'title'
        ? L.titleChars
        : field === 'ingredients'
          ? L.ingredientNameChars
          : field === 'instructions'
            ? L.stepChars
            : field === 'tags'
              ? L.tagChars
              : L.cookNoteChars;
    return msg.tooLong(max);
  }
  switch (field) {
    case 'servings':
      return msg.outOfRange(L.servingsMin, L.servingsMax);
    case 'estimated_time_minutes':
      return msg.outOfRange(L.timeMinutesMin, L.timeMinutesMax);
    case 'calories':
      return msg.outOfRange(0, L.caloriesMax);
    default:
      return msg.outOfRange(0, L.quantityMax);
  }
}

/** Places the server's hard-limit errors (status 'invalid') next to their fields and rows. */
export function errorsFromLimitErrors(list: RecipeEditLimitError[], rows: RowMap): EditorErrors {
  const errors = emptyErrors();
  for (const error of list) {
    const message = limitMessage(error);
    if (error.field === 'ingredients' && error.index !== undefined) {
      const id = rows.ingredientIds[error.index];
      if (id) {
        const target = error.code === 'out_of_range' ? 'quantity' : 'name';
        errors.ingredientRows[id] = { ...errors.ingredientRows[id], [target]: message };
        continue;
      }
    }
    if (error.field === 'instructions' && error.index !== undefined) {
      const id = rows.stepIds[error.index];
      if (id) {
        errors.stepRows[id] = message;
        continue;
      }
    }
    const key = FIELD_KEYS[error.field];
    if (key && !errors.fields[key]) errors.fields[key] = message;
  }
  return errors;
}

const BLOCK_CODES = { not_recipe: 'notRecipe', unsafe: 'unsafe', spam: 'spam' } as const;

/** The keys each code has in recipeEditor.blocked; anything else falls back to `.recipe`. */
const BLOCK_TARGETS: Record<keyof typeof BLOCK_CODES, readonly string[]> = {
  not_recipe: ['recipe', 'title', 'ingredient', 'step'],
  unsafe: ['recipe', 'ingredient', 'step'],
  spam: ['recipe', 'title', 'ingredient', 'step', 'tags', 'cookNote'],
};

/**
 * Turns content-check reasons (status 'blocked') into messages next to their fields and rows.
 * `{{n}}` is the row's 1-based position in the editor. The user's text stays in the form.
 */
export function errorsFromBlockReasons(
  reasons: RecipeEditBlockReason[],
  rows: RowMap,
  state: RecipeEditorState,
): EditorErrors {
  const errors = emptyErrors();
  for (const reason of reasons) {
    const code = BLOCK_CODES[reason.code];
    if (!code) continue;
    const allowed = BLOCK_TARGETS[reason.code];
    const recipeMessage: EditorMessage = { key: `${KEY}.blocked.${code}.recipe` };

    if (reason.field === 'ingredients' && reason.index !== undefined && allowed.includes('ingredient')) {
      const id = rows.ingredientIds[reason.index];
      const position = state.ingredients.findIndex((row) => row.id === id);
      if (id && position >= 0) {
        errors.ingredientRows[id] = {
          ...errors.ingredientRows[id],
          row: { key: `${KEY}.blocked.${code}.ingredient`, params: { n: position + 1 } },
        };
        continue;
      }
    }
    if (reason.field === 'instructions' && reason.index !== undefined && allowed.includes('step')) {
      const id = rows.stepIds[reason.index];
      const position = state.steps.findIndex((row) => row.id === id);
      if (id && position >= 0) {
        errors.stepRows[id] = { key: `${KEY}.blocked.${code}.step`, params: { n: position + 1 } };
        continue;
      }
    }
    const target = reason.field === 'cook_note' ? 'cookNote' : reason.field;
    if ((target === 'title' || target === 'tags' || target === 'cookNote') && allowed.includes(target)) {
      errors.fields[target] = { key: `${KEY}.blocked.${code}.${target}` };
      continue;
    }
    if (!errors.recipe.some((m) => m.key === recipeMessage.key)) errors.recipe.push(recipeMessage);
  }
  return errors;
}

/** What a server error is attached to, to clear it once the user edits that place. */
export type ErrorTarget =
  | { field: EditorFieldKey }
  | { ingredientRow: string }
  | { stepRow: string };

export function withoutError(errors: EditorErrors, target: ErrorTarget): EditorErrors {
  if ('field' in target) {
    if (!errors.fields[target.field]) return errors;
    const fields = { ...errors.fields };
    delete fields[target.field];
    return { ...errors, fields };
  }
  if ('ingredientRow' in target) {
    if (!errors.ingredientRows[target.ingredientRow]) return errors;
    const ingredientRows = { ...errors.ingredientRows };
    delete ingredientRows[target.ingredientRow];
    return { ...errors, ingredientRows };
  }
  if (!errors.stepRows[target.stepRow]) return errors;
  const stepRows = { ...errors.stepRows };
  delete stepRows[target.stepRow];
  return { ...errors, stepRows };
}

export function noErrors(): EditorErrors {
  return emptyErrors();
}
