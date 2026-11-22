// PIN-64 clarifying-questions eval (ADR 031 D6). For each candidate gate model, runs the production
// content gate with questions on over hand-labelled Commons photos, answers the questions the way the
// label says a user would, writes the recipe with the production invent model, and scores it in code.
//   npx -y deno run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/cli.ts fetch --clarify
//   npx -y deno run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/cli.ts clarify \
//     [--models=a,b@low] [--language=he] [--only=schnitzel] [--force]
// Writes eval/results/clarify[-<language>].md (in git) and every call under eval/results/raw/clarify/.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ClarifyingQuestion, Clarification } from '../supabase/functions/_shared/extraction/clarifyingQuestions.ts';
import {
  classifyContent,
  type DishClarification,
  shouldAskClarifyingQuestions,
} from '../supabase/functions/_shared/extraction/contentGate.ts';
import { setEvalHook } from '../supabase/functions/_shared/llm/llmClient.ts';
import { inventRecipeFromImage } from '../supabase/functions/_shared/recipes/inventRecipe.ts';
import { imagePath } from './fetch.ts';
import { exists, fileBase64, mimeForPath, percentile, pool, readJson, RESULTS, ROOT, slug, writeJson } from './lib.ts';
import { TASK_MODELS } from './models.ts';
import { parseModel } from './run.ts';

export type ClarifyCase = {
  id: string;
  group: 'unclear' | 'clear';
  title: string;
  dish: string;
  /** Words that pick the right chip, as a user who knows the dish would. */
  answer: string[];
  /** Words that, in the recipe's title or ingredients, show it is the right dish. */
  accept: string[];
  license?: string;
};

/** What the gate said about one photo. */
export type GateRow = {
  confidence: number | null;
  candidates: string[];
  questions: ClarifyingQuestion[];
  dishGuess: string;
  kind: string;
  ms: number;
  costUsd: number;
  error?: string;
};

/** One case for one gate model: the gate, and whether the recipe was right with and without answers. */
export type CaseResult = {
  testCase: ClarifyCase;
  gate: GateRow;
  answers: Clarification[];
  rightWithout: boolean;
  /** The recipe written with the answers; equals rightWithout when no chip matched (nothing to send). */
  rightWith: boolean;
};

export const THRESHOLDS = [0.5, 0.6, 0.7, 0.8] as const;
/** ADR 031 D6: clear photos may ask at most this often. */
export const MAX_CLEAR_ASK_RATE = 0.1;

// The gate shortlist, plus Luna and Qwen Flash (Yarden's picks: cheap, and they read images) and Sonnet as the bar.
const DEFAULT_MODELS = [
  ...TASK_MODELS.content_gate,
  'openai/gpt-6-luna',
  'qwen/qwen3.8-flash',
  'anthropic/claude-sonnet-5.5@low',
];

function includesAny(text: string, words: readonly string[]): boolean {
  const haystack = text.toLocaleLowerCase();
  return words.some((w) => haystack.includes(w.toLocaleLowerCase()));
}

/**
 * Answers each question with the first chip that matches the label. A question no chip matches is
 * skipped ("Just guess" for that one): typing the real dish into "Other" would flatter the feature.
 */
export function answersFor(testCase: ClarifyCase, questions: readonly ClarifyingQuestion[]): Clarification[] {
  const answers: Clarification[] = [];
  for (const q of questions) {
    const option = q.options.find((o) => includesAny(o, testCase.answer));
    if (option) answers.push({ question: q.question, answer: option, other: false });
  }
  return answers;
}

/** True when the recipe's title or an ingredient names the right dish. */
export function isRightDish(
  testCase: ClarifyCase,
  recipe: { title?: string; ingredients?: Array<{ name?: string }> } | null,
): boolean {
  if (!recipe) return false;
  const text = [recipe.title ?? '', ...(recipe.ingredients ?? []).map((i) => i.name ?? '')].join(' | ');
  return includesAny(text, testCase.accept);
}

function clarificationOf(gate: GateRow): DishClarification {
  return { confidence: gate.confidence, candidates: gate.candidates, questions: gate.questions };
}

/** Whether this case asks at `threshold`, and whether its recipe then comes out right. */
export function outcomeAt(result: CaseResult, threshold: number): { asked: boolean; right: boolean } {
  const asked = shouldAskClarifyingQuestions(clarificationOf(result.gate), threshold);
  return { asked, right: asked ? result.rightWith : result.rightWithout };
}

export type Summary = {
  unclear: number;
  clear: number;
  askedUnclear: number;
  askedClear: number;
  rightUnclear: number;
  rightClear: number;
  /** Asked cases where at least one chip matched the label (the question was about the right thing). */
  usefulQuestions: number;
  asked: number;
};

export function summarize(results: readonly CaseResult[], threshold: number): Summary {
  const s: Summary = {
    unclear: 0, clear: 0, askedUnclear: 0, askedClear: 0, rightUnclear: 0, rightClear: 0, usefulQuestions: 0, asked: 0,
  };
  for (const r of results) {
    const { asked, right } = outcomeAt(r, threshold);
    const unclear = r.testCase.group === 'unclear';
    if (unclear) s.unclear += 1;
    else s.clear += 1;
    if (asked) {
      s.asked += 1;
      if (r.answers.length > 0) s.usefulQuestions += 1;
      if (unclear) s.askedUnclear += 1;
      else s.askedClear += 1;
    }
    if (right && unclear) s.rightUnclear += 1;
    if (right && !unclear) s.rightClear += 1;
  }
  return s;
}

/** The threshold with the most right dishes while clear photos ask at most MAX_CLEAR_ASK_RATE; ties go lower (asks less). */
export function bestThreshold(results: readonly CaseResult[]): number | null {
  let best: { t: number; right: number } | null = null;
  for (const t of THRESHOLDS) {
    const s = summarize(results, t);
    if (s.clear > 0 && s.askedClear / s.clear > MAX_CLEAR_ASK_RATE) continue;
    const right = s.rightUnclear + s.rightClear;
    if (!best || right > best.right) best = { t, right };
  }
  return best?.t ?? null;
}

// --- running ---

type Store = { model: string; reasoning: string | null };
const scope = new AsyncLocalStorage<Store>();

function pct(n: number, d: number): string {
  return d === 0 ? '–' : `${Math.round((n / d) * 100)}%`;
}

async function cached<T>(path: string, force: boolean, make: () => Promise<T>): Promise<T> {
  if (!force && (await exists(path))) return await readJson<T>(path);
  const value = await make();
  await writeJson(path, value);
  return value;
}

type Photo = { base64: string; mimeType: string };

/** Commons PNGs are cached under a .jpg name, so the type is sniffed. */
async function loadPhoto(id: string): Promise<Photo> {
  return { base64: await fileBase64(imagePath(id)), mimeType: await mimeForPath(imagePath(id)) };
}

async function runGate(spec: string, language: string, photo: Photo): Promise<GateRow> {
  const { model, reasoning } = parseModel(spec);
  const started = Date.now();
  try {
    const result = await scope.run({ model, reasoning }, () =>
      classifyContent({ imageBase64: photo.base64, mimeType: photo.mimeType }, { clarify: { language } }));
    const c = result.clarification;
    return {
      confidence: c?.confidence ?? null,
      candidates: c?.candidates ?? [],
      questions: c?.questions ?? [],
      dishGuess: result.dishGuess,
      kind: result.kind,
      ms: Date.now() - started,
      costUsd: result.usage?.costUsd ?? 0,
    };
  } catch (err) {
    return {
      confidence: null, candidates: [], questions: [], dishGuess: '', kind: 'error', ms: Date.now() - started, costUsd: 0,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}

type InventRow = { title: string; ingredients: Array<{ name?: string }>; costUsd: number; error?: string };

async function runInvent(photo: Photo, language: string, answers: Clarification[]): Promise<InventRow> {
  try {
    // Production invent model: no eval model in scope.
    const { recipe, usage } = await inventRecipeFromImage({
      imageBase64: photo.base64,
      mimeType: photo.mimeType,
      language,
      clarifications: answers,
    });
    return { title: recipe.title, ingredients: recipe.ingredients.map((i) => ({ name: i.name })), costUsd: usage?.costUsd ?? 0 };
  } catch (err) {
    return { title: '', ingredients: [], costUsd: 0, error: err instanceof Error ? err.message.slice(0, 300) : String(err) };
  }
}

export async function clarifyCommand(args: string[]): Promise<void> {
  const flags = Object.fromEntries(args.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const language = /^[a-z]{2}$/.test(flags.language ?? '') ? flags.language : 'en';
  const models = flags.models ? flags.models.split(',') : DEFAULT_MODELS;
  const force = flags.force === 'true';
  const only = flags.only;

  setEvalHook({
    model: () => scope.getStore()?.model ?? null,
    reasoning: () => scope.getStore()?.reasoning ?? null,
  });

  const all = await readJson<ClarifyCase[]>(`${ROOT}cases/clarify.json`);
  const cases = all.filter((c) => !only || c.id.includes(only));
  const raw = `${RESULTS}raw/clarify/${language}/`;
  let inventCost = 0;

  // The recipe without answers doesn't depend on the gate model, so it is written once per photo.
  console.log(`recipes without answers: ${cases.length} photos`);
  const without = new Map<string, InventRow>();
  await pool(cases, 4, async (c) => {
    const photo = await loadPhoto(c.id);
    const row = await cached(`${raw}invent/${c.id}.without.json`, force, () => runInvent(photo, language, []));
    inventCost += row.costUsd;
    without.set(c.id, row);
  });

  const byModel = new Map<string, CaseResult[]>();
  for (const spec of models) {
    console.log(`gate ${spec}: ${cases.length} photos`);
    const results = await pool(cases, 4, async (c): Promise<CaseResult> => {
      const photo = await loadPhoto(c.id);
      const gate = await cached(`${raw}${slug(spec)}/${c.id}.gate.json`, force, () => runGate(spec, language, photo));
      const answers = answersFor(c, gate.questions);
      const rightWithout = isRightDish(c, without.get(c.id) ?? null);
      let rightWith = rightWithout;
      if (answers.length > 0) {
        const withRow = await cached(`${raw}${slug(spec)}/${c.id}.with.json`, force, () => runInvent(photo, language, answers));
        inventCost += withRow.costUsd;
        rightWith = isRightDish(c, withRow);
      }
      return { testCase: c, gate, answers, rightWithout, rightWith };
    });
    byModel.set(spec, results);
  }

  const lines = report(byModel, cases, language, inventCost);
  const out = `${RESULTS}clarify${language === 'en' ? '' : `-${language}`}.md`;
  await Deno.writeTextFile(out, lines.join('\n'));
  console.log(lines.slice(0, 20).join('\n'));
  console.log(`\nWrote ${out}`);
}

function report(byModel: Map<string, CaseResult[]>, cases: ClarifyCase[], language: string, inventCost: number): string[] {
  const unclear = cases.filter((c) => c.group === 'unclear').length;
  const anyResults = [...byModel.values()][0] ?? [];
  const baseline = anyResults.filter((r) => r.testCase.group === 'unclear' && r.rightWithout).length;
  const baselineClear = anyResults.filter((r) => r.testCase.group === 'clear' && r.rightWithout).length;
  const clear = cases.length - unclear;

  const lines = [
    `# Clarifying questions eval (PIN-64)`,
    '',
    `Run ${new Date().toISOString().slice(0, 16)}Z · language ${language} · ${unclear} unclear + ${clear} clear Commons photos (eval/cases/clarify.json) · recipes by the production invent model · recipe cost $${inventCost.toFixed(2)}`,
    '',
    `Rule (ADR 031 D6): clear photos ask at most ${MAX_CLEAR_ASK_RATE * 100}%; among thresholds that pass, the most right dishes wins.`,
    '',
    `**Without questions** (today): right dish on ${baseline}/${unclear} unclear (${pct(baseline, unclear)}) and ${baselineClear}/${clear} clear (${pct(baselineClear, clear)}).`,
    '',
    '## At the production threshold (0.7)',
    '',
    '| Gate model | Clear asked | Unclear asked | Right dish, unclear | Right dish, clear | Useful questions | Gate ms (median) | Gate $ per photo | Errors |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [spec, results] of byModel) {
    const s = summarize(results, 0.7);
    const ms = results.map((r) => r.gate.ms);
    const cost = results.reduce((sum, r) => sum + r.gate.costUsd, 0) / Math.max(1, results.length);
    const errors = results.filter((r) => r.gate.error).length;
    const clearFlag = s.askedClear / Math.max(1, s.clear) <= MAX_CLEAR_ASK_RATE ? '✅' : '❌';
    lines.push(
      `| ${spec} | ${s.askedClear}/${s.clear} ${clearFlag} | ${s.askedUnclear}/${s.unclear} | ${s.rightUnclear}/${s.unclear} (${pct(s.rightUnclear, s.unclear)}) | ${s.rightClear}/${s.clear} | ${s.usefulQuestions}/${s.asked} | ${percentile(ms, 50) ?? '–'} | ${cost.toFixed(5)} | ${errors} |`,
    );
  }

  lines.push('', '## Threshold sweep', '', '| Gate model | Threshold | Clear asked | Unclear asked | Right dish, unclear | Right dish, all |', '|---|---|---|---|---|---|');
  for (const [spec, results] of byModel) {
    const best = bestThreshold(results);
    for (const t of THRESHOLDS) {
      const s = summarize(results, t);
      lines.push(
        `| ${spec} | ${t}${t === best ? ' ⭐' : ''} | ${s.askedClear}/${s.clear} | ${s.askedUnclear}/${s.unclear} | ${s.rightUnclear}/${s.unclear} | ${s.rightUnclear + s.rightClear}/${s.unclear + s.clear} |`,
      );
    }
  }
  lines.push('', '⭐ = best threshold for that model under the rule above.');

  for (const [spec, results] of byModel) {
    lines.push('', `## Per photo: ${spec}`, '', '| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |', '|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      const q = r.gate.questions[0];
      const qa = q ? `${q.question} → ${r.answers[0]?.answer ?? '_no matching chip_'}` : '–';
      const conf = r.gate.error ? `error` : r.gate.confidence ?? '–';
      lines.push(
        `| ${r.testCase.id.replace('clarify-', '')} | ${r.testCase.dish} | ${conf} | ${r.gate.candidates.join(' · ') || '–'} | ${outcomeAt(r, 0.7).asked ? 'yes' : ''} | ${qa.replaceAll('|', '/')} | ${r.rightWithout ? '✅' : '❌'} | ${r.answers.length ? (r.rightWith ? '✅' : '❌') : ''} |`,
      );
    }
  }
  lines.push('');
  return lines;
}
