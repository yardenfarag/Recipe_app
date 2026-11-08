import { describe, expect, it } from 'vitest';

import {
  addAppliance,
  addIngredient,
  addStep,
  addTag,
  applianceStepNumbers,
  buildSaveRequest,
  canSave,
  createEditorState,
  errorsFromBlockReasons,
  errorsFromLimitErrors,
  hasChanges,
  isLocked,
  lockedFields,
  moveIngredient,
  moveStep,
  needsDiscardConfirm,
  parseQuantity,
  removeAppliance,
  removeIngredient,
  removeStep,
  removeTag,
  resetField,
  setApplianceRequired,
  setCalories,
  setCookNote,
  setCost,
  setEffort,
  setPhoto,
  setServings,
  setTime,
  setTitle,
  toggleApplianceStep,
  updateIngredient,
  updateStep,
  validate,
  withoutError,
  type RecipeEditorState,
} from './recipeEditor';
import type { RecipeEditContent, SaveRecipeEditRequest } from './supabase/saveRecipeEdit';
import type { Recipe } from '@/types/recipe';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    title: 'Tomato soup',
    original_url: 'https://www.youtube.com/watch?v=abc',
    platform: 'youtube',
    image_url: 'https://example.com/soup.jpg',
    servings: 4,
    ingredients: [
      { name: 'tomato', quantity: 6, unit: '', metric: { quantity: 600, unit: 'g' } },
      { name: 'olive oil', quantity: 2, unit: 'tbsp', spoons: { quantity: 2, unit: 'tbsp' } },
      { name: 'salt', quantity: 0, unit: '' },
    ],
    instructions: [
      { step: 1, text: 'Chop the tomatoes.', timestamp_seconds: 10 },
      { step: 2, text: 'Fry them in oil.', timestamp_seconds: 45 },
      { step: 3, text: 'Blend until smooth.', timestamp_seconds: 90 },
    ],
    calories: 220,
    estimated_time_minutes: 30,
    effort_level: 'Easy',
    cost_estimate: '$',
    tags: ['soup', 'vegan'],
    appliances: [
      { key: 'stovetop', required: true, steps: [2], origin: 'source' },
      { key: 'blender', required: true, steps: [3], origin: 'source' },
      { key: 'kitchen_scale', required: false, steps: [1, 3], origin: 'tip', benefit: 'more_precise' },
    ],
    extraction_status: 'full',
    extraction_source: 'video',
    ...overrides,
  };
}

function save(state: RecipeEditorState): Extract<SaveRecipeEditRequest, { mode: 'edit' | 'write' }> {
  const result = buildSaveRequest(state, 'en');
  if (!result.ok) throw new Error(`unexpected errors: ${JSON.stringify(result.errors)}`);
  if (result.request.mode === 'retry') throw new Error('unexpected retry');
  return result.request;
}

function content(state: RecipeEditorState): RecipeEditContent {
  return save(state).content;
}

function stepId(state: RecipeEditorState, text: string): string {
  const row = state.steps.find((s) => s.text === text);
  if (!row) throw new Error(`no step ${text}`);
  return row.id;
}

function writtenRecipe(): RecipeEditorState {
  let state = createEditorState();
  state = setTitle(state, 'Grandma’s pancakes');
  state = updateIngredient(state, state.ingredients[0].id, { name: 'flour', quantity: '200', unit: 'g' });
  state = updateStep(state, state.steps[0].id, 'Mix and fry.');
  return state;
}

describe('createEditorState', () => {
  it('starts an Edit from the saved recipe', () => {
    const state = createEditorState(recipe());
    expect(state.mode).toBe('edit');
    expect(state.title).toBe('Tomato soup');
    expect(state.servings).toBe('4');
    expect(state.ingredients.map((r) => [r.quantity, r.unit, r.name])).toEqual([
      ['6', '', 'tomato'],
      ['2', 'tbsp', 'olive oil'],
      ['', '', 'salt'],
    ]);
    expect(state.steps.map((s) => s.text)).toEqual([
      'Chop the tomatoes.',
      'Fry them in oil.',
      'Blend until smooth.',
    ]);
    expect(state.time).toBe('30');
    expect(state.calories).toBe('220');
    expect(state.written).toBe(false);
    expect(state.sourceUrl).toBe('https://www.youtube.com/watch?v=abc');
    expect(hasChanges(state)).toBe(false);
  });

  it('starts a Write empty, with one blank row in each list and nothing to save', () => {
    const state = createEditorState();
    expect(state.mode).toBe('write');
    expect(state.written).toBe(true);
    expect(state.ingredients).toHaveLength(1);
    expect(state.steps).toHaveLength(1);
    expect(state.appliances).toBeNull();
    expect(canSave(state)).toBe(false);
    expect(hasChanges(state)).toBe(false);
  });

  it('marks a saved written recipe as written', () => {
    const state = createEditorState(recipe({ extraction_source: 'manual', original_url: undefined }));
    expect(state.written).toBe(true);
    expect(state.sourceUrl).toBeNull();
  });

  it('keeps the fields that were already locked', () => {
    const state = createEditorState(recipe({ locked_fields: ['calories', 'tags'] }));
    expect(lockedFields(state)).toEqual(['calories', 'tags']);
    expect(hasChanges(state)).toBe(false);
  });
});

describe('stable row ids', () => {
  it('keeps each step id through edits, moves and other deletions', () => {
    let state = createEditorState(recipe());
    const ids = state.steps.map((s) => s.id);
    state = updateStep(state, ids[1], 'Fry them in a little oil.');
    state = moveStep(state, 0, 2);
    state = removeStep(state, ids[2]);
    expect(state.steps.map((s) => s.id)).toEqual([ids[1], ids[0]]);
    state = addStep(state);
    expect(new Set(state.steps.map((s) => s.id)).size).toBe(3);
    expect(ids).not.toContain(state.steps[2].id);
  });

  it('never reuses an id after a row is deleted', () => {
    let state = createEditorState(recipe());
    state = addIngredient(state);
    const added = state.ingredients[3].id;
    state = removeIngredient(state, added);
    state = addIngredient(state);
    expect(state.ingredients[3].id).not.toBe(added);
  });
});

describe('appliance step links', () => {
  it('follow steps when they move', () => {
    let state = createEditorState(recipe());
    // Blend first, then chop, then fry.
    state = moveStep(state, 2, 0);
    const out = content(state);
    expect(out.instructions.map((s) => [s.step, s.text])).toEqual([
      [1, 'Blend until smooth.'],
      [2, 'Chop the tomatoes.'],
      [3, 'Fry them in oil.'],
    ]);
    expect(out.appliances).toEqual([
      { key: 'stovetop', required: true, steps: [3], origin: 'source' },
      { key: 'blender', required: true, steps: [1], origin: 'source' },
      { key: 'kitchen_scale', required: false, steps: [1, 2], origin: 'tip', benefit: 'more_precise' },
    ]);
  });

  it('drop links to a deleted step and renumber the rest', () => {
    let state = createEditorState(recipe());
    state = removeStep(state, stepId(state, 'Chop the tomatoes.'));
    const out = content(state);
    expect(out.appliances).toEqual([
      { key: 'stovetop', required: true, steps: [1], origin: 'source' },
      { key: 'blender', required: true, steps: [2], origin: 'source' },
      { key: 'kitchen_scale', required: false, steps: [2], origin: 'tip', benefit: 'more_precise' },
    ]);
  });

  it('drop an appliance left with no steps', () => {
    let state = createEditorState(recipe());
    state = removeStep(state, stepId(state, 'Blend until smooth.'));
    expect(state.appliances?.map((a) => a.key)).toEqual(['stovetop', 'kitchen_scale']);
    expect(content(state).appliances?.map((a) => a.key)).toEqual(['stovetop', 'kitchen_scale']);
  });

  it('are remapped, not "set by hand", so appliances stay unlocked', () => {
    let state = createEditorState(recipe());
    state = moveStep(state, 2, 0);
    state = removeStep(state, stepId(state, 'Chop the tomatoes.'));
    expect(isLocked(state, 'appliances')).toBe(false);
  });

  it('show the positions the editor displays', () => {
    let state = createEditorState(recipe());
    state = moveStep(state, 0, 2);
    expect(applianceStepNumbers(state, 'kitchen_scale')).toEqual([2, 3]);
  });

  it('skip a blank step when renumbering', () => {
    let state = createEditorState(recipe());
    state = addStep(state);
    state = moveStep(state, 3, 0);
    const out = content(state);
    expect(out.instructions).toHaveLength(3);
    expect(out.appliances?.[0]).toMatchObject({ key: 'stovetop', steps: [2] });
  });

  it('send null for a recipe that was never analysed', () => {
    expect(content(createEditorState(recipe({ appliances: null }))).appliances).toBeNull();
  });
});

describe('editing appliances by hand', () => {
  it('adds a catalog appliance linked to every step and locks the field', () => {
    let state = createEditorState(recipe());
    state = addAppliance(state, 'oven', false);
    expect(isLocked(state, 'appliances')).toBe(true);
    expect(content(state).appliances).toContainEqual({
      key: 'oven',
      required: false,
      steps: [1, 2, 3],
      origin: 'source',
    });
  });

  it('adds to a recipe that had none analysed', () => {
    let state = writtenRecipe();
    state = addAppliance(state, 'wok');
    expect(content(state).appliances).toEqual([{ key: 'wok', required: true, steps: [1], origin: 'source' }]);
  });

  it('ignores an appliance that is already listed', () => {
    const state = createEditorState(recipe());
    expect(addAppliance(state, 'blender')).toBe(state);
  });

  it('turns a Pinch tip marked required into the user’s own', () => {
    let state = createEditorState(recipe());
    state = setApplianceRequired(state, 'kitchen_scale', true);
    expect(content(state).appliances).toContainEqual({
      key: 'kitchen_scale',
      required: true,
      steps: [1, 3],
      origin: 'source',
    });
  });

  it('links and unlinks steps but never the last one', () => {
    let state = createEditorState(recipe());
    const chop = stepId(state, 'Chop the tomatoes.');
    const blend = stepId(state, 'Blend until smooth.');
    state = toggleApplianceStep(state, 'blender', chop);
    expect(applianceStepNumbers(state, 'blender')).toEqual([1, 3]);
    state = toggleApplianceStep(state, 'blender', chop);
    state = toggleApplianceStep(state, 'blender', blend);
    expect(applianceStepNumbers(state, 'blender')).toEqual([3]);
  });

  it('removing all appliances saves an empty list', () => {
    let state = createEditorState(recipe());
    for (const key of ['stovetop', 'blender', 'kitchen_scale'] as const) state = removeAppliance(state, key);
    expect(content(state).appliances).toEqual([]);
    expect(isLocked(state, 'appliances')).toBe(true);
  });
});

describe('timestamps', () => {
  it('stay with their step through moves and deletions', () => {
    let state = createEditorState(recipe());
    state = moveStep(state, 0, 2);
    state = removeStep(state, stepId(state, 'Fry them in oil.'));
    state = updateStep(state, stepId(state, 'Chop the tomatoes.'), 'Chop the tomatoes finely.');
    expect(content(state).instructions).toEqual([
      { step: 1, text: 'Blend until smooth.', timestamp_seconds: 90 },
      { step: 2, text: 'Chop the tomatoes finely.', timestamp_seconds: 10 },
    ]);
  });

  it('are absent on a new step', () => {
    let state = createEditorState(recipe());
    state = addStep(state);
    state = updateStep(state, state.steps[3].id, 'Serve.');
    expect(content(state).instructions[3]).toEqual({ step: 4, text: 'Serve.' });
  });
});

describe('change tracking', () => {
  it('sees a typed change and forgets it when typed back', () => {
    let state = createEditorState(recipe());
    state = setTitle(state, 'Tomato soup!');
    expect(needsDiscardConfirm(state)).toBe(true);
    state = setTitle(state, 'Tomato soup');
    expect(needsDiscardConfirm(state)).toBe(false);
  });

  it('ignores blank rows that were added and left empty', () => {
    let state = createEditorState(recipe());
    state = addIngredient(addStep(state));
    expect(needsDiscardConfirm(state)).toBe(false);
  });

  it('sees a move, and forgets it when moved back', () => {
    let state = createEditorState(recipe());
    state = moveIngredient(state, 0, 2);
    expect(hasChanges(state)).toBe(true);
    state = moveIngredient(state, 2, 0);
    expect(hasChanges(state)).toBe(false);
  });

  it('sees a deleted row, a photo change and a cook note', () => {
    const base = createEditorState(recipe());
    expect(hasChanges(removeIngredient(base, base.ingredients[2].id))).toBe(true);
    expect(hasChanges(setPhoto(base, { kind: 'remove' }))).toBe(true);
    expect(hasChanges(setPhoto(base, { kind: 'replace', base64: 'AAAA', mimeType: 'image/jpeg' }))).toBe(true);
    expect(hasChanges(setCookNote(base, 'Less salt next time'))).toBe(true);
  });

  it('sees resetting a field that was locked when the editor opened', () => {
    const state = createEditorState(recipe({ locked_fields: ['calories'] }));
    expect(hasChanges(resetField(state, 'calories'))).toBe(true);
  });

  it('asks nothing of a Write until something is typed', () => {
    let state = createEditorState();
    expect(needsDiscardConfirm(state)).toBe(false);
    state = updateStep(state, state.steps[0].id, 'Boil water.');
    expect(needsDiscardConfirm(state)).toBe(true);
  });
});

describe('servings', () => {
  it('never change ingredient amounts', () => {
    let state = createEditorState(recipe());
    state = setServings(state, '8');
    const out = content(state);
    expect(out.servings).toBe(8);
    expect(out.ingredients.map((i) => i.quantity)).toEqual([6, 2, 0]);
  });
});

describe('ingredients in the request', () => {
  it('keep exact amounts and grams/spoons on untouched rows, and drop them on changed rows', () => {
    let state = createEditorState(
      recipe({ ingredients: [{ name: 'sugar', quantity: 1 / 3, unit: 'cup', metric: { quantity: 67, unit: 'g' } }, { name: 'egg', quantity: 2, unit: '', metric: { quantity: 100, unit: 'g' } }] }),
    );
    state = updateIngredient(state, state.ingredients[1].id, { quantity: '3' });
    expect(content(state).ingredients).toEqual([
      { name: 'sugar', quantity: 1 / 3, unit: 'cup', metric: { quantity: 67, unit: 'g' } },
      { name: 'egg', quantity: 3, unit: '' },
    ]);
  });

  it('read amounts as people type them, blank as 0', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('1 1/2')).toBe(1.5);
    expect(parseQuantity('1½')).toBe(1.5);
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('٣')).toBe(3);
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('a few')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
  });

  it('trims text and ignores fully blank rows', () => {
    let state = createEditorState();
    state = setTitle(state, '  Toast ');
    state = updateIngredient(state, state.ingredients[0].id, { name: ' bread ', quantity: '2', unit: ' slices ' });
    state = addIngredient(state);
    state = updateStep(state, state.steps[0].id, ' Toast it. ');
    const out = content(state);
    expect(out.title).toBe('Toast');
    expect(out.ingredients).toEqual([{ name: 'bread', quantity: 2, unit: 'slices' }]);
    expect(out.instructions).toEqual([{ step: 1, text: 'Toast it.' }]);
  });
});

describe('limits', () => {
  const long = (n: number) => 'x'.repeat(n);

  it('needs a title, an ingredient and a step before Save is enabled', () => {
    let state = createEditorState();
    expect(canSave(state)).toBe(false);
    state = setTitle(state, 'Toast');
    state = updateIngredient(state, state.ingredients[0].id, { name: 'bread' });
    expect(canSave(state)).toBe(false);
    state = updateStep(state, state.steps[0].id, 'Toast it.');
    expect(canSave(state)).toBe(true);
  });

  it('reports a missing title, ingredient and step', () => {
    const errors = validate(createEditorState());
    expect(errors.fields.title).toEqual({ key: 'recipeEditor.errors.required' });
    expect(errors.fields.ingredients).toEqual({ key: 'recipeEditor.errors.needIngredient' });
    expect(errors.fields.steps).toEqual({ key: 'recipeEditor.errors.needStep' });
  });

  it('reports each text limit on its field or row, counting emoji once', () => {
    let state = createEditorState(recipe());
    state = setTitle(state, long(121));
    state = updateIngredient(state, state.ingredients[0].id, { name: long(101) });
    state = updateStep(state, state.steps[1].id, long(801));
    state = setCookNote(state, long(161));
    const errors = validate(state);
    expect(errors.fields.title).toEqual({ key: 'recipeEditor.errors.tooLong', params: { max: 120 } });
    expect(errors.ingredientRows[state.ingredients[0].id]?.name).toEqual({
      key: 'recipeEditor.errors.tooLong',
      params: { max: 100 },
    });
    expect(errors.stepRows[state.steps[1].id]).toEqual({ key: 'recipeEditor.errors.tooLong', params: { max: 800 } });
    expect(errors.fields.cookNote).toEqual({ key: 'recipeEditor.errors.tooLong', params: { max: 160 } });

    expect(validate(setTitle(state, '🍅'.repeat(120))).fields.title).toBeUndefined();
  });

  it('reports a name missing from a row that has an amount', () => {
    let state = createEditorState(recipe());
    state = addIngredient(state);
    const id = state.ingredients[3].id;
    state = updateIngredient(state, id, { quantity: '2' });
    expect(validate(state).ingredientRows[id]?.name).toEqual({ key: 'recipeEditor.errors.required' });
  });

  it('reports amounts that are not numbers or out of range', () => {
    let state = createEditorState(recipe());
    const [a, b] = state.ingredients.map((r) => r.id);
    state = updateIngredient(state, a, { quantity: 'lots' });
    state = updateIngredient(state, b, { quantity: '10001' });
    const errors = validate(state);
    const outOfRange = { key: 'recipeEditor.errors.outOfRange', params: { min: 0, max: 10000 } };
    expect(errors.ingredientRows[a]?.quantity).toEqual(outOfRange);
    expect(errors.ingredientRows[b]?.quantity).toEqual(outOfRange);
  });

  it('reports too many ingredients, steps and tags', () => {
    let state = createEditorState(recipe({ tags: [] }));
    for (let i = 0; i < 58; i += 1) {
      state = addIngredient(state);
      state = updateIngredient(state, state.ingredients[state.ingredients.length - 1].id, { name: `item ${i}` });
    }
    for (let i = 0; i < 38; i += 1) {
      state = addStep(state);
      state = updateStep(state, state.steps[state.steps.length - 1].id, `step ${i}`);
    }
    for (let i = 0; i < 11; i += 1) state = addTag(state, `tag ${i}`);
    const errors = validate(state);
    expect(errors.fields.ingredients).toEqual({ key: 'recipeEditor.errors.tooMany', params: { max: 60 } });
    expect(errors.fields.steps).toEqual({ key: 'recipeEditor.errors.tooMany', params: { max: 40 } });
    expect(errors.fields.tags).toEqual({ key: 'recipeEditor.errors.tooMany', params: { max: 10 } });
    expect(validate(removeTag(state, 'tag 0')).fields.tags).toBeUndefined();
  });

  it('reports a tag over 30 characters', () => {
    const state = addTag(createEditorState(recipe()), long(31));
    expect(validate(state).fields.tags).toEqual({ key: 'recipeEditor.errors.tooLong', params: { max: 30 } });
  });

  it('reports servings, time and calories out of range', () => {
    let state = createEditorState(recipe());
    state = setServings(state, '0');
    state = setTime(state, '2881');
    state = setCalories(state, '-5');
    let errors = validate(state);
    expect(errors.fields.servings).toEqual({ key: 'recipeEditor.errors.outOfRange', params: { min: 1, max: 100 } });
    expect(errors.fields.time).toEqual({ key: 'recipeEditor.errors.outOfRange', params: { min: 1, max: 2880 } });
    expect(errors.fields.calories).toEqual({ key: 'recipeEditor.errors.outOfRange', params: { min: 0, max: 10000 } });

    state = setServings(setTime(setCalories(state, ''), ''), '');
    errors = validate(state);
    expect(errors.fields.servings).toEqual({ key: 'recipeEditor.errors.required' });
    expect(errors.fields.time).toBeUndefined();
    expect(errors.fields.calories).toBeUndefined();
  });

  it('stops the request while anything is over a limit', () => {
    const result = buildSaveRequest(setTitle(createEditorState(recipe()), long(121)), 'en');
    expect(result.ok).toBe(false);
  });
});

describe('locking AI-derived fields', () => {
  it('locks a field set by hand, and unlocks it when typed back', () => {
    let state = createEditorState(recipe());
    state = setCalories(state, '300');
    expect(lockedFields(state)).toEqual(['calories']);
    state = setCalories(state, '220');
    expect(lockedFields(state)).toEqual([]);
  });

  it('locks time, effort, cost and tags', () => {
    let state = createEditorState(recipe());
    state = setTime(state, '45');
    state = setEffort(state, 'Hard');
    state = setCost(state, '$$');
    state = addTag(state, 'Dinner');
    expect(lockedFields(state)).toEqual(['estimated_time_minutes', 'effort_level', 'cost_estimate', 'tags']);
    expect(content(state).tags).toEqual(['soup', 'vegan', 'dinner']);
  });

  it('does not lock anything for edits to ingredients, steps or servings', () => {
    let state = createEditorState(recipe());
    state = updateIngredient(state, state.ingredients[0].id, { quantity: '8' });
    state = updateStep(state, state.steps[0].id, 'Dice the tomatoes.');
    state = setServings(state, '6');
    expect(save(state).locked_fields).toEqual([]);
  });

  it('reset puts back Pinch’s value and unlocks the field', () => {
    let state = createEditorState(recipe());
    state = setCalories(state, '999');
    state = setEffort(state, 'Hard');
    state = resetField(state, 'calories');
    expect(state.calories).toBe('220');
    expect(lockedFields(state)).toEqual(['effort_level']);
    state = resetField(state, 'effort_level');
    expect(state.effort).toBe('Easy');
    expect(hasChanges(state)).toBe(false);
  });

  it('reset unlocks a field that was locked when the editor opened', () => {
    let state = createEditorState(recipe({ locked_fields: ['estimated_time_minutes'] }));
    state = resetField(state, 'estimated_time_minutes');
    expect(save(state).locked_fields).toEqual([]);
    state = setTime(state, '50');
    expect(save(state).locked_fields).toEqual(['estimated_time_minutes']);
  });

  it('reset appliances restores Pinch’s list on the steps as they are now', () => {
    let state = createEditorState(recipe());
    state = removeAppliance(state, 'blender');
    state = moveStep(state, 2, 0);
    state = resetField(state, 'appliances');
    expect(isLocked(state, 'appliances')).toBe(false);
    expect(content(state).appliances?.find((a) => a.key === 'blender')?.steps).toEqual([1]);
  });

  it('reset in a Write empties the field so Pinch calculates it', () => {
    let state = writtenRecipe();
    state = setCalories(state, '500');
    state = addTag(state, 'breakfast');
    state = resetField(resetField(state, 'calories'), 'tags');
    const request = save(state);
    expect(request.content.calories).toBeNull();
    expect(request.content.tags).toEqual([]);
    expect(request.locked_fields).toEqual([]);
  });
});

describe('buildSaveRequest', () => {
  it('builds an Edit with step and ingredient sources', () => {
    let state = createEditorState(recipe());
    state = moveStep(state, 2, 0); // blend, chop, fry
    state = removeStep(state, stepId(state, 'Chop the tomatoes.'));
    state = addStep(state);
    state = updateStep(state, state.steps[2].id, 'Season and serve.');
    state = removeIngredient(state, state.ingredients[0].id);
    state = addIngredient(state);
    state = updateIngredient(state, state.ingredients[2].id, { name: 'basil', quantity: '1', unit: 'handful' });
    state = moveIngredient(state, 2, 0);

    const request = save(state);
    expect(request.mode).toBe('edit');
    if (request.mode !== 'edit') return;
    expect(request.recipe_id).toBe('r1');
    expect(request.app_language).toBe('en');
    expect(request.step_sources).toEqual([3, 2, null]);
    expect(request.ingredient_sources).toEqual([null, 1, 2]);
    expect(request.content.instructions.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(request.content.ingredients.map((i) => i.name)).toEqual(['basil', 'olive oil', 'salt']);
    expect(request.content.photo).toEqual({ action: 'keep' });
    expect(request.content).toMatchObject({
      title: 'Tomato soup',
      servings: 4,
      estimated_time_minutes: 30,
      calories: 220,
      effort_level: 'Easy',
      cost_estimate: '$',
      tags: ['soup', 'vegan'],
      cook_note: null,
    });
  });

  it('always sends one source per sent row, skipping blank rows', () => {
    let state = createEditorState(recipe());
    state = addStep(addIngredient(addStep(state)));
    const request = save(state);
    if (request.mode !== 'edit') throw new Error('edit expected');
    expect(request.step_sources).toHaveLength(request.content.instructions.length);
    expect(request.ingredient_sources).toHaveLength(request.content.ingredients.length);
  });

  it('uses the saved `step` numbers as sources even when they are not 1..n', () => {
    let state = createEditorState(
      recipe({
        instructions: [
          { step: 2, text: 'A' },
          { step: 5, text: 'B' },
        ],
        appliances: [{ key: 'oven', required: true, steps: [5], origin: 'source' }],
      }),
    );
    state = moveStep(state, 1, 0);
    const request = save(state);
    if (request.mode !== 'edit') throw new Error('edit expected');
    expect(request.step_sources).toEqual([5, 2]);
    expect(request.content.appliances).toEqual([{ key: 'oven', required: true, steps: [1], origin: 'source' }]);
  });

  it('builds a Write with the user’s fields and no sources', () => {
    let state = writtenRecipe();
    state = setServings(state, '3');
    state = setTime(state, '20');
    state = setCookNote(state, ' Use buttermilk ');
    state = setPhoto(state, { kind: 'replace', base64: 'BASE64', mimeType: 'image/jpeg' });
    const result = buildSaveRequest(state, 'he');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual({
      mode: 'write',
      app_language: 'he',
      locked_fields: ['estimated_time_minutes'],
      content: {
        title: 'Grandma’s pancakes',
        photo: { action: 'replace', base64: 'BASE64', mime_type: 'image/jpeg' },
        servings: 3,
        ingredients: [{ name: 'flour', quantity: 200, unit: 'g' }],
        instructions: [{ step: 1, text: 'Mix and fry.' }],
        estimated_time_minutes: 20,
        calories: null,
        effort_level: null,
        cost_estimate: null,
        tags: [],
        appliances: null,
        cook_note: 'Use buttermilk',
      },
    });
  });

  it('sends a removed photo', () => {
    const state = setPhoto(createEditorState(recipe()), { kind: 'remove' });
    expect(content(state).photo).toEqual({ action: 'remove' });
  });
});

describe('server results', () => {
  it('places hard-limit errors on their rows and fields', () => {
    const state = createEditorState(recipe());
    const result = buildSaveRequest(state, 'en');
    if (!result.ok) throw new Error('ok expected');
    const errors = errorsFromLimitErrors(
      [
        { field: 'ingredients', index: 1, code: 'out_of_range' },
        { field: 'instructions', index: 2, code: 'too_long' },
        { field: 'servings', code: 'out_of_range' },
        { field: 'title', code: 'required' },
      ],
      result.rows,
    );
    expect(errors.ingredientRows[state.ingredients[1].id]?.quantity).toEqual({
      key: 'recipeEditor.errors.outOfRange',
      params: { min: 0, max: 10000 },
    });
    expect(errors.stepRows[state.steps[2].id]).toEqual({ key: 'recipeEditor.errors.tooLong', params: { max: 800 } });
    expect(errors.fields.servings).toEqual({ key: 'recipeEditor.errors.outOfRange', params: { min: 1, max: 100 } });
    expect(errors.fields.title).toEqual({ key: 'recipeEditor.errors.required' });
  });

  it('places content-check reasons next to rows, numbered as the editor shows them', () => {
    let state = createEditorState(recipe());
    // A blank row sits first in the editor, so sent index 0 is the editor's row 2.
    state = addStep(state);
    state = moveStep(state, 3, 0);
    const result = buildSaveRequest(state, 'en');
    if (!result.ok) throw new Error('ok expected');
    const errors = errorsFromBlockReasons(
      [
        { field: 'instructions', index: 0, code: 'unsafe' },
        { field: 'ingredients', index: 2, code: 'not_recipe' },
        { field: 'title', code: 'spam' },
        { field: 'cook_note', code: 'spam' },
        { field: 'tags', code: 'unsafe' },
        { field: 'servings', code: 'not_recipe' },
      ],
      result.rows,
      state,
    );
    expect(errors.stepRows[stepId(state, 'Chop the tomatoes.')]).toEqual({
      key: 'recipeEditor.blocked.unsafe.step',
      params: { n: 2 },
    });
    expect(errors.ingredientRows[state.ingredients[2].id]?.row).toEqual({
      key: 'recipeEditor.blocked.notRecipe.ingredient',
      params: { n: 3 },
    });
    expect(errors.fields.title).toEqual({ key: 'recipeEditor.blocked.spam.title' });
    expect(errors.fields.cookNote).toEqual({ key: 'recipeEditor.blocked.spam.cookNote' });
    // No unsafe.tags message exists, and servings has none: both fall back to the whole recipe.
    expect(errors.recipe).toEqual([
      { key: 'recipeEditor.blocked.unsafe.recipe' },
      { key: 'recipeEditor.blocked.notRecipe.recipe' },
    ]);
  });

  it('shows a whole-recipe reason (field "recipe") at the top', () => {
    const state = createEditorState(recipe());
    const result = buildSaveRequest(state, 'en');
    if (!result.ok) throw new Error('ok expected');
    const reasons = [{ field: 'recipe', code: 'not_recipe' }] as unknown as Parameters<typeof errorsFromBlockReasons>[0];
    expect(errorsFromBlockReasons(reasons, result.rows, state).recipe).toEqual([
      { key: 'recipeEditor.blocked.notRecipe.recipe' },
    ]);
  });

  it('clears an error once its place is edited', () => {
    const state = createEditorState(recipe());
    const result = buildSaveRequest(state, 'en');
    if (!result.ok) throw new Error('ok expected');
    let errors = errorsFromBlockReasons(
      [
        { field: 'title', code: 'spam' },
        { field: 'instructions', index: 0, code: 'spam' },
      ],
      result.rows,
      state,
    );
    errors = withoutError(errors, { field: 'title' });
    expect(errors.fields.title).toBeUndefined();
    errors = withoutError(errors, { stepRow: state.steps[0].id });
    expect(errors.stepRows).toEqual({});
  });
});
