// LLM-judge scoring. Extraction tasks are matched item by item against the
// reference; translate and invent outputs are ranked blind against each other.

import { imagePath, postPath, type PostSnapshot } from './fetch.ts';
import { labelPath, type PostLabel, postText } from './label.ts';
import { chatJson, dataUrl, exists, pool, readJson, readJsonOr, RESULTS, ROOT, slug, writeJson } from './lib.ts';
import { MATCH_JUDGE, RANK_JUDGE, type Task, TASK_MODELS } from './models.ts';
import { rawPath, type RunRecord } from './run.ts';

export type MatchVerdict = {
  ingredients: { ref_index: number; status: 'ok' | 'wrong_quantity' | 'missing' }[];
  extra_ingredients: string[];
  steps_score: number;
  note: string;
};

export type RankVerdict = {
  candidates: { letter: string; accuracy: number; quality: number; issues: string }[];
  ranking: string[];
};

export type RankFile = { caseId: string; judge: string; letters: Record<string, string>; verdict: RankVerdict };

export const matchPath = (task: string, model: string, caseId: string) =>
  `${RESULTS}judge/${task}/${slug(model)}/${caseId}.json`;
export const rankPath = (task: string, caseId: string) => `${RESULTS}judge/${task}/${caseId}.rank.json`;

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref_index: { type: 'integer' },
          status: { type: 'string', enum: ['ok', 'wrong_quantity', 'missing'] },
        },
        required: ['ref_index', 'status'],
      },
    },
    extra_ingredients: { type: 'array', items: { type: 'string' } },
    steps_score: { type: 'integer', minimum: 1, maximum: 5 },
    note: { type: 'string' },
  },
  required: ['ingredients', 'extra_ingredients', 'steps_score', 'note'],
};

const MATCH_SYSTEM = `You grade a recipe extraction against an answer key.

For EVERY reference ingredient (by ref_index) decide:
- ok: the candidate lists it with the same amount. Names may differ in wording or language; match on meaning. Amounts match after unit conversion within ~5% (1 cup = 240 ml, 1 tbsp = 15 ml). A reference amount of 0 means "unstated": any candidate amount of 0/blank is ok, and an invented amount is wrong_quantity.
- wrong_quantity: listed, but the amount is wrong, missing, or invented.
- missing: not listed (merged into another line counts as listed).
extra_ingredients: candidate items that are not in the reference at all (hallucinated or split duplicates).
steps_score 1–5: how well the candidate's method covers the reference steps (5 = every step, correct order, nothing invented; 1 = missing or wrong). If the reference has no steps, 5 when the candidate also has none or only trivially restates, lower when it invents a method.
note: one short sentence on the main error, or "".`;

const RANK_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          letter: { type: 'string' },
          accuracy: { type: 'integer', minimum: 1, maximum: 5 },
          quality: { type: 'integer', minimum: 1, maximum: 5 },
          issues: { type: 'string' },
        },
        required: ['letter', 'accuracy', 'quality', 'issues'],
      },
    },
    ranking: { type: 'array', items: { type: 'string' }, description: 'Letters, best first.' },
  },
  required: ['candidates', 'ranking'],
};

const TRANSLATE_SYSTEM = `You are a professional culinary translator and native speaker of the target language. Grade anonymous translations of the same recipe.

- accuracy 1–5: meaning preserved; nothing dropped, added, or mistranslated (ingredients, amounts, times, temperatures).
- quality 1–5: reads like a recipe written by a native cook: natural phrasing, correct culinary terms, idiomatic unit words (Hebrew כוס/כף/כפית, Arabic كوب/ملعقة, Russian стакан/ст. л./ч. л.), correct gender/number agreement, no English left over except brand names.
- issues: the most important problems, briefly.
- ranking: all letters, best first. Ties are not allowed.`;

const INVENT_SYSTEM = `You are a senior recipe developer. Each anonymous candidate invented a home-cook recipe for the same prompt. Grade them.

- accuracy 1–5: is it the dish shown/described? Right language as requested?
- quality 1–5: would it work? Coherent method that uses every listed ingredient, sensible amounts and times, clear steps, nothing missing (oven temperature, pan size when needed).
- issues: the most important problems, briefly.
- ranking: all letters, best first. Ties are not allowed.`;

function recipeView(output: any) {
  return {
    title: output?.title ?? '',
    ingredients: (output?.ingredients ?? []).map((i: any) =>
      `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.replace(/\s+/g, ' ').trim()
    ),
    instructions: (output?.instructions ?? []).map((s: any) => (typeof s === 'string' ? s : s?.text ?? '')),
  };
}

/**
 * Qwen sometimes answers `[recipe]` instead of `recipe`; the production
 * normalizer then spreads it into `{ "0": recipe, ... }`. Score the recipe
 * anyway (the strict schema rate in the report still counts it as a miss).
 */
export function unwrapRecipe(output: any): any {
  if (output && typeof output === 'object' && hasRecipeShape(output['0'])) return output['0'];
  return output;
}

export function hasRecipeShape(output: any): boolean {
  return Boolean(
    output && typeof output === 'object' && !Array.isArray(output) &&
      Array.isArray(output.ingredients) && Array.isArray(output.instructions) &&
      typeof output.title === 'string',
  );
}

async function caseIds(task: Task, model: string): Promise<string[]> {
  const dir = `${RESULTS}raw/${task}/${slug(model)}`;
  const ids: string[] = [];
  try {
    for await (const e of Deno.readDir(dir)) if (e.name.endsWith('.json')) ids.push(e.name.slice(0, -5));
  } catch {
    // no results yet
  }
  return ids.sort();
}

async function judgeMatch(task: Task, model: string, caseId: string, force: boolean) {
  const out = matchPath(task, model, caseId);
  if (!force && (await exists(out))) return;
  const record = await readJson<RunRecord>(rawPath(task, model, caseId));
  const output = unwrapRecipe(record.output);
  if (!record.ok || !hasRecipeShape(output)) return; // scored as a failure in the report
  const label = await readJson<PostLabel>(labelPath(caseId));
  const ref = label.reference;
  const content = JSON.stringify(
    {
      reference: {
        title: ref.title,
        ingredients: ref.ingredients.map((i, ref_index) => ({ ref_index, ...i })),
        instructions: ref.instructions,
      },
      candidate: recipeView(output),
    },
    null,
    1,
  );
  const { data } = await chatJson<MatchVerdict>({
    model: MATCH_JUDGE,
    system: MATCH_SYSTEM,
    content,
    schema: MATCH_SCHEMA,
    name: 'match',
    reasoning: 'low',
  });
  await writeJson(out, data);
}

/** Deterministic shuffle so a rerun shows the judge the same order. */
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function rankPrompt(task: 'translate' | 'invent', caseId: string): Promise<Record<string, unknown>[]> {
  if (task === 'translate') {
    const sep = caseId.lastIndexOf('--'); // shortcodes can end in '-'
    const postId = caseId.slice(0, sep);
    const lang = caseId.slice(sep + 2);
    const { reference } = await readJson<PostLabel>(labelPath(postId));
    return [{
      type: 'text',
      text: `Target language: ${lang}\n\nSOURCE RECIPE (English):\n${JSON.stringify(recipeView({
        ...reference,
        instructions: reference.instructions,
      }), null, 1)}`,
    }];
  }
  const cases = await readJson<{ id: string; image?: string; post?: string; text?: string; language: string }[]>(
    `${ROOT}cases/invent.json`,
  );
  const c = cases.find((x) => x.id === caseId)!;
  const parts: Record<string, unknown>[] = [];
  if (c.image) parts.push({ type: 'image_url', image_url: { url: await dataUrl(imagePath(c.image)) } });
  const promptText = c.post ? postText(await readJson<PostSnapshot>(postPath(c.post))) : c.text ?? '(photo only)';
  parts.push({ type: 'text', text: `Requested language: ${c.language}\n\nPROMPT:\n${promptText}` });
  return parts;
}

async function judgeRank(task: 'translate' | 'invent', caseId: string, force: boolean) {
  const out = rankPath(task, caseId);
  if (!force && (await exists(out))) return;
  const entries: { model: string; output: unknown }[] = [];
  for (const model of TASK_MODELS[task]) {
    const record = await readJsonOr<RunRecord | null>(rawPath(task, model, caseId), null);
    const output = unwrapRecipe(record?.output);
    if (record?.ok && hasRecipeShape(output)) entries.push({ model, output });
  }
  if (entries.length < 2) return;
  const order = shuffled(entries, caseId);
  const letters: Record<string, string> = {};
  const blocks = order.map((e, i) => {
    const letter = String.fromCharCode(65 + i);
    letters[letter] = e.model;
    return `CANDIDATE ${letter}:\n${JSON.stringify(recipeView(e.output), null, 1)}`;
  });
  const content = [...(await rankPrompt(task, caseId)), { type: 'text', text: blocks.join('\n\n') }];
  const { data } = await chatJson<RankVerdict>({
    model: RANK_JUDGE,
    system: task === 'translate' ? TRANSLATE_SYSTEM : INVENT_SYSTEM,
    content,
    schema: RANK_SCHEMA,
    name: 'rank',
    reasoning: 'medium',
  });
  await writeJson(out, { caseId, judge: RANK_JUDGE, letters, verdict: data } satisfies RankFile);
}

export async function judgeCommand(args: string[]) {
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const tasks = (flag('task')?.split(',') ?? ['text', 'photo', 'video', 'translate', 'invent']) as Task[];
  const force = args.includes('--force');
  const safe = <T>(label: string, fn: () => Promise<T>) =>
    fn().catch((err) => console.error(`✗ ${label}: ${err instanceof Error ? err.message : err}`));

  for (const task of tasks) {
    if (task === 'translate' || task === 'invent') {
      const ids = new Set<string>();
      for (const m of TASK_MODELS[task]) for (const id of await caseIds(task, m)) ids.add(id);
      await pool([...ids], 6, (id) => safe(`${task} ${id}`, () => judgeRank(task, id, force)));
      console.log(`[${task}] ranked ${ids.size} cases`);
    } else if (task === 'text' || task === 'photo' || task === 'video') {
      const jobs: { model: string; id: string }[] = [];
      for (const model of TASK_MODELS[task]) for (const id of await caseIds(task, model)) jobs.push({ model, id });
      await pool(jobs, 8, ({ model, id }) => safe(`${task} ${model} ${id}`, () => judgeMatch(task, model, id, force)));
      console.log(`[${task}] matched ${jobs.length} outputs`);
    }
  }
}
