// npx deno test -A --no-lock supabase/functions/_shared/recipeEditPlan_test.ts
//
// Jev is faked at the fetch boundary, as in jev_test.ts. The fake answers every question it is
// sent: content questions pass, per-field questions say "no", the language is English, unless a
// test overrides an answer. Tests assert outcomes only: saved, blocked (with which reasons), or
// invalid, and which fields are recalculated.

import { assert, assertEquals } from 'jsr:@std/assert@1';

import { planRecipeEdit, type RecipeBeforeEdit, type RecipeEditPlanInput } from './recipeEditPlan.ts';
import {
  RECALC_FIELDS,
  type RecipeEditBlockReason as Reason,
  type RecipeEditContent,
  type RecipeEditLimitError,
} from './recipeEditTypes.ts';

type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities?: Record<string, number> };

type Question = { type: 'noul' | 'choice'; criteria: Record<string, string> };

/** Per-question override, by question key, or a function of every key the plan asked. */
type Overrides = Record<string, Answer> | ((key: string, q: Question) => Answer | undefined);

function defaultAnswer(key: string, q: Question): Answer {
  if (q.type === 'noul') return { type: 'noul', noul: key.startsWith('affects_') ? 0.05 : 0.98 };
  if ('none' in q.criteria) return { type: 'choice', choice: 'none', confidence: 0.97, probabilities: { none: 0.97 } };
  return { type: 'choice', choice: 'en', confidence: 0.9 };
}

function fakeJev(overrides: Overrides = {}): { calls: () => number; restore: () => void } {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body ?? '{}')) as { questions: Record<string, Question> };
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(body.questions)) {
      const override = typeof overrides === 'function' ? overrides(key, q) : overrides[key];
      answers[key] = override ?? defaultAnswer(key, q);
    }
    return Promise.resolve(
      Response.json({
        model: 'openai/gpt-6-luna-decisions',
        answers,
        usage: { input_tokens: 900, output_tokens: 0, cost: 0.00009 },
      }),
    );
  }) as typeof fetch;
  Deno.env.set('OPENROUTER_API_KEY', 'test');
  return { calls: () => calls, restore: () => (globalThis.fetch = original) };
}

function failingFetch(respond: (init?: RequestInit) => Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => respond(init)) as typeof fetch;
  Deno.env.set('OPENROUTER_API_KEY', 'test');
  return () => (globalThis.fetch = original);
}

async function withJev<T>(overrides: Overrides, fn: (calls: () => number) => Promise<T>): Promise<T> {
  const jev = fakeJev(overrides);
  try {
    return await fn(jev.calls);
  } finally {
    jev.restore();
  }
}

const noul = (value: number): Answer => ({ type: 'noul', noul: value });
const pick = (row: number, confidence = 0.95): Answer => ({
  type: 'choice',
  choice: `row_${row}`,
  confidence,
  probabilities: { [`row_${row}`]: confidence, none: 1 - confidence },
});

// --- Fixtures ---------------------------------------------------------------------------------

const before: RecipeBeforeEdit = {
  title: 'Carrot soup',
  servings: 4,
  ingredients: [
    { name: 'carrot', quantity: 1, unit: '', metric: { quantity: 60, unit: 'g' }, spoons: { quantity: 1, unit: '' } },
    { name: 'onion', quantity: 1, unit: '' },
    { name: 'vegetable stock', quantity: 1, unit: 'liter' },
  ],
  instructions: [
    { step: 1, text: 'Chop the carrot and onion.' },
    { step: 2, text: 'Simmer in the stock for 20 minutes.' },
    { step: 3, text: 'Blend until smooth.' },
  ],
  tags: ['soup', 'vegetarian'],
  cook_note: null,
};

function contentFrom(recipe: RecipeBeforeEdit): RecipeEditContent {
  return {
    title: recipe.title,
    photo: { action: 'keep' },
    servings: recipe.servings,
    ingredients: recipe.ingredients.map((item) => ({ ...item })),
    instructions: recipe.instructions.map((step) => ({ ...step })),
    estimated_time_minutes: 30,
    calories: 400,
    effort_level: 'Easy',
    cost_estimate: '$',
    tags: [...recipe.tags],
    appliances: null,
    cook_note: recipe.cook_note,
  };
}

/** An edit where nothing moved: every row comes from the same position. */
function edit(change: (c: RecipeEditContent) => void, extra: Partial<RecipeEditPlanInput> = {}): RecipeEditPlanInput {
  const after = contentFrom(before);
  change(after);
  return {
    before,
    after,
    lockedFields: [],
    stepSources: after.instructions.map((_, i) => (i < before.instructions.length ? i + 1 : null)),
    ingredientSources: after.ingredients.map((_, i) => (i < before.ingredients.length ? i : null)),
    appLanguage: 'en',
    ...extra,
  };
}

function written(extra: Partial<RecipeEditPlanInput> = {}): RecipeEditPlanInput {
  return { before: null, after: contentFrom(before), lockedFields: [], appLanguage: 'es', ...extra };
}

async function recalculated(input: RecipeEditPlanInput, overrides: Overrides = {}): Promise<string[]> {
  const plan = await withJev(overrides, () => planRecipeEdit(input));
  assertEquals(plan.outcome, 'save');
  return plan.outcome === 'save' ? plan.recalculate : [];
}

// --- Hard limits ------------------------------------------------------------------------------

Deno.test('each hard limit rejects the save before any Jev call', async () => {
  const emoji = (n: number) => '🥕'.repeat(n);
  const cases: Array<[string, (c: RecipeEditContent) => void, RecipeEditLimitError]> = [
    ['empty title', (c) => (c.title = '   '), { field: 'title', code: 'required' }],
    ['long title', (c) => (c.title = 'a'.repeat(121)), { field: 'title', code: 'too_long' }],
    ['title counted by code point', (c) => (c.title = emoji(121)), { field: 'title', code: 'too_long' }],
    ['no ingredients', (c) => (c.ingredients = []), { field: 'ingredients', code: 'required' }],
    ['61 ingredients', (c) => (c.ingredients = Array.from({ length: 61 }, () => ({ name: 'salt', quantity: 1, unit: 'g' }))), { field: 'ingredients', code: 'too_many' }],
    ['blank ingredient name', (c) => (c.ingredients[1].name = ' '), { field: 'ingredients', index: 1, code: 'required' }],
    ['long ingredient name', (c) => (c.ingredients[2].name = 'x'.repeat(101)), { field: 'ingredients', index: 2, code: 'too_long' }],
    ['negative quantity', (c) => (c.ingredients[0].quantity = -1), { field: 'ingredients', index: 0, code: 'out_of_range' }],
    ['huge quantity', (c) => (c.ingredients[0].quantity = 10_001), { field: 'ingredients', index: 0, code: 'out_of_range' }],
    ['non-number quantity', (c) => (c.ingredients[0].quantity = Number.NaN), { field: 'ingredients', index: 0, code: 'out_of_range' }],
    ['no steps', (c) => (c.instructions = []), { field: 'instructions', code: 'required' }],
    ['41 steps', (c) => (c.instructions = Array.from({ length: 41 }, (_, i) => ({ step: i + 1, text: 'Stir.' }))), { field: 'instructions', code: 'too_many' }],
    ['blank step', (c) => (c.instructions[2].text = ''), { field: 'instructions', index: 2, code: 'required' }],
    ['long step', (c) => (c.instructions[0].text = 'a'.repeat(801)), { field: 'instructions', index: 0, code: 'too_long' }],
    ['11 tags', (c) => (c.tags = Array.from({ length: 11 }, (_, i) => `tag${i}`)), { field: 'tags', code: 'too_many' }],
    ['long tag', (c) => (c.tags = ['soup', 't'.repeat(31)]), { field: 'tags', index: 1, code: 'too_long' }],
    ['0 servings', (c) => (c.servings = 0), { field: 'servings', code: 'out_of_range' }],
    ['101 servings', (c) => (c.servings = 101), { field: 'servings', code: 'out_of_range' }],
    ['fractional servings', (c) => (c.servings = 2.5), { field: 'servings', code: 'out_of_range' }],
    ['0 minutes', (c) => (c.estimated_time_minutes = 0), { field: 'estimated_time_minutes', code: 'out_of_range' }],
    ['2881 minutes', (c) => (c.estimated_time_minutes = 2_881), { field: 'estimated_time_minutes', code: 'out_of_range' }],
    ['negative calories', (c) => (c.calories = -5), { field: 'calories', code: 'out_of_range' }],
    ['10001 calories', (c) => (c.calories = 10_001), { field: 'calories', code: 'out_of_range' }],
    ['long cook note', (c) => (c.cook_note = 'n'.repeat(161)), { field: 'cook_note', code: 'too_long' }],
    ['oversized photo', (c) => (c.photo = { action: 'replace', base64: 'A'.repeat(2_000_001), mime_type: 'image/jpeg' }), { field: 'photo', code: 'too_long' }],
  ];
  for (const [name, change, expected] of cases) {
    for (const input of [edit(change), { ...written(), after: edit(change).after }]) {
      const plan = await withJev({}, async (calls) => {
        const result = await planRecipeEdit(input);
        assertEquals(calls(), 0, name);
        return result;
      });
      assertEquals(plan.outcome, 'invalid', name);
      if (plan.outcome === 'invalid') assertEquals(plan.errors, [expected], name);
    }
  }
});

Deno.test('values exactly at each limit are accepted', async () => {
  const input = edit((c) => {
    c.title = '🥕'.repeat(120);
    c.ingredients[0].name = 'x'.repeat(100);
    c.ingredients[0].quantity = 10_000;
    c.ingredients[1].quantity = 0;
    c.instructions[0].text = 'a'.repeat(800);
    c.tags = Array.from({ length: 10 }, (_, i) => `${'t'.repeat(28)}${i}`);
    c.servings = 100;
    c.estimated_time_minutes = 2_880;
    c.calories = 0;
    c.cook_note = 'n'.repeat(160);
  });
  const plan = await withJev({}, () => planRecipeEdit(input));
  assertEquals(plan.outcome, 'save');
  for (const nulls of [{ estimated_time_minutes: null, calories: null }]) {
    const p = await withJev({}, () => planRecipeEdit(edit((c) => Object.assign(c, nulls))));
    assertEquals(p.outcome, 'save');
  }
});

// --- Content check ----------------------------------------------------------------------------

Deno.test('a written recipe is blocked with a reason for each part that fails', async () => {
  const cases: Array<[Overrides, Reason]> = [
    [{ recipe_is_recipe: noul(0.05) }, { field: 'ingredients', code: 'not_recipe' }],
    [{ recipe_is_safe: noul(0.02) }, { field: 'ingredients', code: 'unsafe' }],
    [{ title_is_recipe: noul(0.1) }, { field: 'title', code: 'not_recipe' }],
    [{ title_is_clean: noul(0.01) }, { field: 'title', code: 'spam' }],
    [{ ingredients_not_recipe: pick(2) }, { field: 'ingredients', index: 1, code: 'not_recipe' }],
    [{ ingredients_unsafe: pick(3) }, { field: 'ingredients', index: 2, code: 'unsafe' }],
    [{ ingredients_spam: pick(1) }, { field: 'ingredients', index: 0, code: 'spam' }],
    [{ steps_not_recipe: pick(3) }, { field: 'instructions', index: 2, code: 'not_recipe' }],
    [{ steps_unsafe: pick(2) }, { field: 'instructions', index: 1, code: 'unsafe' }],
    [{ steps_spam: pick(1) }, { field: 'instructions', index: 0, code: 'spam' }],
    [{ tags_are_clean: noul(0.03) }, { field: 'tags', code: 'spam' }],
    [{ cook_note_is_clean: noul(0.03) }, { field: 'cook_note', code: 'spam' }],
  ];
  for (const [overrides, reason] of cases) {
    const input = written();
    input.after.cook_note = 'Visit my shop for more';
    const plan = await withJev(overrides, () => planRecipeEdit(input));
    assertEquals(plan, { ...plan, outcome: 'blocked' }, JSON.stringify(reason));
    if (plan.outcome === 'blocked') assertEquals(plan.reasons, [reason]);
  }
});

Deno.test('several failures are all reported', async () => {
  const plan = await withJev(
    { title_is_clean: noul(0.02), steps_spam: pick(2), ingredients_unsafe: pick(1) },
    () => planRecipeEdit(written()),
  );
  assertEquals(plan.outcome, 'blocked');
  if (plan.outcome === 'blocked') {
    assertEquals(plan.reasons, [
      { field: 'title', code: 'spam' },
      { field: 'ingredients', index: 0, code: 'unsafe' },
      { field: 'instructions', index: 1, code: 'spam' },
    ]);
  }
});

Deno.test('two bad rows that split the probability still block, at the likelier row', async () => {
  const split: Answer = {
    type: 'choice',
    choice: 'row_3',
    confidence: 0.5,
    probabilities: { row_3: 0.5, row_1: 0.42, none: 0.08 },
  };
  const plan = await withJev({ steps_spam: split }, () => planRecipeEdit(written()));
  assertEquals(plan.outcome === 'blocked' && plan.reasons, [{ field: 'instructions', index: 2, code: 'spam' }]);
});

Deno.test('a failure Jev is not sure about does not block', async () => {
  const plan = await withJev(
    { recipe_is_recipe: noul(0.2), title_is_clean: noul(0.3), steps_unsafe: pick(1, 0.8) },
    () => planRecipeEdit(written()),
  );
  assertEquals(plan.outcome, 'save');
});

Deno.test('an edit is blocked by the parts it changed', async () => {
  const cases: Array<[(c: RecipeEditContent) => void, Overrides, Reason]> = [
    [(c) => (c.title = 'Buy cheap pills at example.com'), { title_is_clean: noul(0.01) }, { field: 'title', code: 'spam' }],
    [(c) => (c.title = 'asdfgh'), { title_is_recipe: noul(0.05) }, { field: 'title', code: 'not_recipe' }],
    [(c) => (c.ingredients[1].name = 'bleach'), { ingredients_unsafe: pick(2) }, { field: 'ingredients', index: 1, code: 'unsafe' }],
    [(c) => c.ingredients.push({ name: 'my phone', quantity: 1, unit: '' }), { ingredients_not_recipe: pick(4) }, { field: 'ingredients', index: 3, code: 'not_recipe' }],
    [(c) => (c.instructions[1].text = 'Follow me on insta @soupking'), { steps_spam: pick(2) }, { field: 'instructions', index: 1, code: 'spam' }],
    [(c) => c.instructions.push({ step: 4, text: 'Microwave a sealed can.' }), { steps_unsafe: pick(4) }, { field: 'instructions', index: 3, code: 'unsafe' }],
    [(c) => (c.instructions[0].text = 'Call your mom.'), { steps_not_recipe: pick(1) }, { field: 'instructions', index: 0, code: 'not_recipe' }],
    [(c) => (c.tags = ['soup', 'xxx']), { tags_are_clean: noul(0.02) }, { field: 'tags', code: 'spam' }],
    [(c) => (c.cook_note = 'DM me for deals'), { cook_note_is_clean: noul(0.02) }, { field: 'cook_note', code: 'spam' }],
  ];
  for (const [change, overrides, reason] of cases) {
    const plan = await withJev(overrides, () => planRecipeEdit(edit(change)));
    assertEquals(plan.outcome === 'blocked' && plan.reasons, [reason], JSON.stringify(reason));
  }
});

Deno.test('unchanged parts of an edit never block it', async () => {
  // A Jev that fails everything it is asked: only the changed cook note can be the reason.
  const failEverything: Overrides = (_key, q) =>
    q.type === 'noul'
      ? noul(0.01)
      : 'none' in q.criteria
        ? { type: 'choice', choice: Object.keys(q.criteria).find((k) => k !== 'none')!, confidence: 0.99, probabilities: { none: 0.01 } }
        : undefined;
  const plan = await withJev(failEverything, () => planRecipeEdit(edit((c) => (c.cook_note = 'Add more pepper'))));
  assertEquals(plan.outcome === 'blocked' && plan.reasons, [{ field: 'cook_note', code: 'spam' }]);

  const qtyOnly = await withJev(failEverything, () => planRecipeEdit(edit((c) => (c.ingredients[0].quantity = 2))));
  assertEquals(qtyOnly.outcome === 'blocked' && qtyOnly.reasons, [
    { field: 'ingredients', index: 0, code: 'not_recipe' },
    { field: 'ingredients', index: 0, code: 'unsafe' },
    { field: 'ingredients', index: 0, code: 'spam' },
  ]);
});

// --- Jev failure ------------------------------------------------------------------------------

Deno.test('a Jev error lets the save through and recalculates what the edit might affect', async () => {
  for (const respond of [
    () => Promise.resolve(new Response('upstream down', { status: 502 })),
    () => Promise.reject(new TypeError('network down')),
    () => Promise.resolve(new Response('not json', { status: 200 })),
  ]) {
    const restore = failingFetch(respond);
    try {
      const plan = await planRecipeEdit(edit((c) => (c.ingredients[0].quantity = 2)));
      assertEquals(plan.outcome, 'save');
      if (plan.outcome === 'save') {
        assertEquals(plan.jevFailed, true);
        assertEquals(plan.recalculate, ['calories', 'cost_estimate', 'ingredient_amounts']);
      }
    } finally {
      restore();
    }
  }
});

Deno.test('a Jev timeout lets the save through', async () => {
  const restore = failingFetch(
    (init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
  );
  try {
    const plan = await planRecipeEdit({ ...written(), jevTimeoutMs: 20 });
    assertEquals(plan.outcome, 'save');
    if (plan.outcome === 'save') {
      assertEquals(plan.jevFailed, true);
      assertEquals(plan.recalculate, [...RECALC_FIELDS]);
    }
  } finally {
    restore();
  }
});

// --- Per-field thresholds ---------------------------------------------------------------------

Deno.test('a field is skipped only below 0.3', async () => {
  const input = () => edit((c) => (c.instructions[1].text = 'Simmer in the stock for 40 minutes.'));
  const cases: Array<[number, boolean]> = [
    [0, false],
    [0.29, false],
    [0.3, true],
    [0.5, true],
    [0.69, true],
    [0.7, true],
    [1, true],
  ];
  for (const [score, expected] of cases) {
    const fields = await recalculated(input(), { affects_estimated_time_minutes: noul(score) });
    assertEquals(fields.includes('estimated_time_minutes'), expected, `score ${score}`);
  }
});

Deno.test('a missing per-field answer counts as unsure and recalculates', async () => {
  const fields = await recalculated(
    edit((c) => (c.instructions[1].text = 'Simmer for 40 minutes.')),
    (key) => (key === 'affects_effort_level' ? ({ type: 'choice', choice: 'x', confidence: 1 } as Answer) : undefined),
  );
  assertEquals(fields, ['effort_level']);
});

// --- Locked fields ----------------------------------------------------------------------------

Deno.test('locked fields are never recalculated', async () => {
  const allYes: Overrides = (key) => (key.startsWith('affects_') ? noul(1) : undefined);
  const lockedFields = ['calories', 'appliances', 'tags'] as const;
  const bigEdit = (c: RecipeEditContent) => {
    c.title = 'Spicy carrot soup';
    c.ingredients[0].quantity = 3;
    c.instructions.push({ step: 4, text: 'Fry chilli in oil and stir in.' });
  };

  assertEquals(await recalculated(edit(bigEdit, { lockedFields: [...lockedFields] }), allYes), [
    'estimated_time_minutes',
    'effort_level',
    'cost_estimate',
    'ingredient_amounts',
  ]);
  assertEquals(await recalculated(written({ lockedFields: [...lockedFields] })), [
    'estimated_time_minutes',
    'effort_level',
    'cost_estimate',
    'ingredient_amounts',
  ]);

  const restore = failingFetch(() => Promise.resolve(new Response('down', { status: 503 })));
  try {
    const plan = await planRecipeEdit(edit(bigEdit, { lockedFields: [...lockedFields] }));
    assertEquals(plan.outcome === 'save' && plan.recalculate, [
      'estimated_time_minutes',
      'effort_level',
      'cost_estimate',
      'ingredient_amounts',
    ]);
  } finally {
    restore();
  }
});

// --- Written recipes --------------------------------------------------------------------------

Deno.test('a written recipe recalculates every field, whatever Jev would say about each', async () => {
  const allNo: Overrides = (key) => (key.startsWith('affects_') ? noul(0) : undefined);
  const plan = await withJev(allNo, () => planRecipeEdit(written()));
  assertEquals(plan.outcome, 'save');
  if (plan.outcome === 'save') {
    assertEquals(plan.recalculate, [...RECALC_FIELDS]);
    assertEquals(plan.amountRows, [0, 1, 2]);
    assertEquals(plan.jevFailed, false);
  }
});

// --- Appliances -------------------------------------------------------------------------------

Deno.test('appliances are recalculated when steps are added or deleted, even if Jev says no', async () => {
  const allNo: Overrides = (key) => (key.startsWith('affects_') ? noul(0) : undefined);
  const added = edit((c) => c.instructions.splice(1, 0, { step: 0, text: 'Roast the carrots first.' }), {
    stepSources: [1, null, 2, 3],
  });
  assert((await recalculated(added, allNo)).includes('appliances'));

  const deleted = edit((c) => c.instructions.pop(), { stepSources: [1, 2] });
  assert((await recalculated(deleted, allNo)).includes('appliances'));

  // Moving steps is not adding or deleting: Jev decides.
  const moved = edit((c) => c.instructions.reverse(), { stepSources: [3, 2, 1] });
  assertEquals(await recalculated(moved, allNo), []);
  assert((await recalculated(moved, { affects_appliances: noul(0.8) })).includes('appliances'));
});

Deno.test('an ingredient-only edit never touches appliances', async () => {
  const allYes: Overrides = (key) => (key.startsWith('affects_') ? noul(1) : undefined);
  const fields = await recalculated(
    edit((c) => c.ingredients.push({ name: 'cream', quantity: 100, unit: 'ml' }), { ingredientSources: [0, 1, 2, null] }),
    allYes,
  );
  assert(!fields.includes('appliances'));
  assert(fields.includes('calories'));
});

// --- Language ---------------------------------------------------------------------------------

Deno.test('a written recipe gets the language Jev detects, or the app language when unsure', async () => {
  const lang = (choice: string, confidence: number): Overrides => ({
    source_language: { type: 'choice', choice, confidence },
  });
  const cases: Array<[Overrides, string]> = [
    [lang('he', 0.93), 'he'],
    [lang('ru', 0.75), 'ru'],
    [lang('he', 0.6), 'es'],
    [lang('fr', 0.99), 'es'],
  ];
  for (const [overrides, expected] of cases) {
    const plan = await withJev(overrides, () => planRecipeEdit(written()));
    assertEquals(plan.outcome === 'save' && plan.sourceLanguage, expected);
  }

  const restore = failingFetch(() => Promise.resolve(new Response('down', { status: 500 })));
  try {
    const plan = await planRecipeEdit(written({ appLanguage: 'ar' }));
    assertEquals(plan.outcome === 'save' && plan.sourceLanguage, 'ar');
  } finally {
    restore();
  }
});

Deno.test('an edit keeps its language', async () => {
  const plan = await withJev({}, () => planRecipeEdit(edit((c) => (c.title = 'Carrot and ginger soup'))));
  assertEquals(plan.outcome === 'save' && plan.sourceLanguage, undefined);
});

// --- The 1 carrot → 2 case --------------------------------------------------------------------

Deno.test("1 carrot → 2 recalculates only calories and that row's amounts", async () => {
  // What Jev answers for this edit: calories and the row's amounts change; cost barely does.
  const plan = await withJev(
    { affects_calories: noul(0.96), affects_ingredient_amounts: noul(0.93), affects_cost_estimate: noul(0.12) },
    () => planRecipeEdit(edit((c) => (c.ingredients[0].quantity = 2))),
  );
  assertEquals(plan.outcome, 'save');
  if (plan.outcome === 'save') {
    assertEquals(plan.recalculate, ['calories', 'ingredient_amounts']);
    assertEquals(plan.amountRows, [0]);
  }
});

// --- No change --------------------------------------------------------------------------------

Deno.test('no change means no Jev call and nothing to recalculate', async () => {
  for (const input of [
    edit(() => {}),
    edit((c) => (c.photo = { action: 'remove' })),
    edit((c) => (c.title = '  Carrot soup ')),
    edit((c) => (c.calories = 520), { lockedFields: ['calories'] }),
  ]) {
    await withJev({}, async (calls) => {
      const plan = await planRecipeEdit(input);
      assertEquals(calls(), 0);
      assertEquals(plan.outcome === 'save' && plan.recalculate, []);
    });
  }
});

Deno.test('a cook-note-only edit is checked but recalculates nothing', async () => {
  await withJev((key) => (key.startsWith('affects_') ? noul(1) : undefined), async (calls) => {
    const plan = await planRecipeEdit(edit((c) => (c.cook_note = 'Less salt next time')));
    assertEquals(calls(), 1);
    assertEquals(plan.outcome === 'save' && plan.recalculate, []);
  });
});
