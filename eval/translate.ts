// PIN-53 translation-quality eval. Runs the production translate task (translateRecipeWithLlm)
// on the hand-written cases in cases/translate.json, renders each answer the way the recipe screen
// shows it (shared/lib unit localization + formatQuantity), checks it in code, and has a
// native-speaker judge mark errors MQM-style (minor = 1 point, major = 5).
// See docs/research/09-translation-quality.md.
//
//   npx -y deno@2 run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/cli.ts translate \
//     [--runs=2] [--only=he|<id part>] [--model=slug] [--no-judge] [--judge-model=slug] [--judge-ids=a,b] [--force] [--tag=name]
//
// --unstable-sloppy-imports is needed because shared/ uses extension-less imports (Metro/Next style).
// Without --model the production TASK_MODELS.translate row runs, fallbacks included.
// Writes eval/results/translate.md (in git), judge verdicts under eval/results/judge/translate-quality/
// (in git) and one JSON per call under eval/results/raw/translate-quality/ (not in git).
// Calls already on disk are reused; --force redoes them. --tag keeps a variant's files apart.

import { AsyncLocalStorage } from 'node:async_hooks';

import { localizeIngredientUnits } from '../shared/lib/culinaryUnits.ts';
import { convertStepUnits } from '../shared/lib/convertStepUnits.ts';
import { formatQuantity } from '../shared/lib/formatQuantity.ts';
import { defaultUnitSystem } from '../shared/lib/unitSystem.ts';
import { type GenerateLlmJsonResult, setEvalHook } from '../supabase/functions/_shared/llm/llmClient.ts';
import {
  translateRecipeWithLlm,
  type TranslateLanguageCode,
} from '../supabase/functions/_shared/recipes/translateRecipe.ts';
import { chatJson, exists, pool, readJson, RESULTS, ROOT, slug, writeJson } from './lib.ts';

export type Lang = 'he' | 'ar' | 'ru' | 'es' | 'en';
type Where = string; // title | ing:N | amount:N | line:N | steps | all

export type TranslateCase = {
  id: string;
  target: Lang;
  source_lang: string;
  classes: string[];
  allow_latin?: string[];
  recipe: { title: string; ingredients: [number, string, string][]; steps: string[] };
  expect?: { at: Where; any_of: string[] }[];
  forbid?: { at: Where; terms: string[] }[];
  forbid_re?: { at: Where; patterns: string[] }[];
};

export type Rendered = {
  title: string;
  ingredients: { name: string; unit: string; amount: string; line: string }[];
  steps: string[];
};

export type CheckResult = { check: string; where: string; ok: boolean; detail?: string };

const LANGUAGE_NAMES: Record<Lang, string> = {
  he: 'Hebrew (Israel)',
  ar: 'Arabic (Modern Standard, as used in Levantine and Gulf recipe sites)',
  ru: 'Russian',
  es: 'Spanish',
  en: 'English',
};

const DEFAULT_JUDGE = 'google/gemini-3.1-pro-preview';

// ---------------------------------------------------------------- rendering

type TranslatedOutput = {
  title: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
};

const TASTE_UNIT = /^(to taste|al gusto|au goût|לפי הטעם|по вкусу|حسب الذوق)$/i;

/**
 * What the recipe screen shows for the recipe as written: units localized on read (as
 * ensureRecipeTranslation does), amounts formatted by formatQuantity, unknown amounts blank, taste
 * words shown alone (as displayIngredientAmount does), and steps with temperatures and sizes in the language's
 * default unit system (convertStepUnits, PIN-53). The Spoons/Grams toggle is left out on purpose: its conversions
 * are display features, not translation.
 */
export function render(output: TranslatedOutput, language: Lang): Rendered {
  const ingredients = localizeIngredientUnits(output.ingredients, language).map((ing) => {
    const unit = ing.unit.trim();
    const amount = TASTE_UNIT.test(unit)
      ? unit
      : Number.isFinite(ing.quantity) && ing.quantity > 0
        ? formatQuantity(ing.quantity, unit, language).trim()
        : '';
    const name = ing.name.trim();
    return { name, unit: ing.unit.trim(), amount, line: amount ? `${amount} ${name}` : name };
  });
  // Steps as a reader with the language's default unit setting sees them (PIN-53): °F → °C, inches → cm for
  // Hebrew, Arabic, Russian and Spanish; English keeps US units.
  const units = defaultUnitSystem(language);
  return {
    title: output.title.trim(),
    ingredients,
    steps: output.instructions.map((s) => convertStepUnits(s.text.trim(), units, language)),
  };
}

// ---------------------------------------------------------------- matching

/** Lower case, one geresh/gershayim/hyphen form, no niqqud or Arabic tashkeel, plain spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[׳`´’‘]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/[־‐-―]/g, '-')
    .replace(/[\s   ]+/g, ' ');
}

/**
 * True when `term` appears in `text` and isn't the start of a longer word ("¾ כוס" must not match
 * "¾ כוסות"). The left side is open on purpose: Hebrew and Arabic glue prefixes on (ה־, ال).
 * A trailing `*` makes the term a prefix ("кабачк*").
 */
export function containsTerm(text: string, term: string): boolean {
  const t = normalize(text);
  const prefix = term.endsWith('*');
  const needle = normalize(prefix ? term.slice(0, -1) : term);
  for (let at = t.indexOf(needle); at !== -1; at = t.indexOf(needle, at + 1)) {
    if (prefix || !/\p{L}/u.test(t[at + needle.length] ?? '')) return true;
  }
  return false;
}

function field(r: Rendered, at: Where): string {
  if (at === 'title') return r.title;
  if (at === 'steps') return r.steps.join('\n');
  if (at === 'all') return [r.title, ...r.ingredients.map((i) => i.line), ...r.steps].join('\n');
  const [kind, n] = at.split(':');
  const ing = r.ingredients[Number(n) - 1];
  if (!ing) return '';
  if (kind === 'ing') return ing.name;
  if (kind === 'amount') return ing.amount;
  if (kind === 'line') return ing.line;
  throw new Error(`Unknown check location "${at}"`);
}

const LATIN_WORD = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſƀ-ɏ]{2,}/gu;
const SCRIPTS = {
  hebrew: /[֐-׿]+/gu,
  arabic: /[؀-ۿ]+/gu,
  cyrillic: /[Ѐ-ӿ]+/gu,
};

/** Words in a script the target language doesn't use (Latin only counts for he/ar/ru). */
export function foreignWords(text: string, target: Lang, allowLatin: string[] = []): string[] {
  let rest = text;
  for (const word of allowLatin) rest = rest.replace(new RegExp(word, 'giu'), ' ');
  const found: string[] = [];
  const add = (re: RegExp) => found.push(...(rest.match(re) ?? []));
  if (target !== 'he') add(SCRIPTS.hebrew);
  if (target !== 'ar') add(SCRIPTS.arabic);
  if (target !== 'ru') add(SCRIPTS.cyrillic);
  if (target === 'he' || target === 'ar' || target === 'ru') add(LATIN_WORD);
  return found;
}

/** Hebrew recipe voice of a step, from its first word: present plural (מחממים), imperative (חממו) or יש + infinitive. */
export function hebrewVoice(step: string): 'present' | 'imperative' | 'impersonal' | null {
  const first = step.trim().split(/\s+/)[0]?.replace(/[^א-ת]/g, '') ?? '';
  if (first === 'יש') return 'impersonal';
  if (first.length >= 4 && /ים$/.test(first)) return 'present';
  if (first.length >= 3 && /ו$/.test(first)) return 'imperative';
  return null;
}

export function dominantVoice(steps: string[]): string {
  const counts = new Map<string, number>();
  for (const s of steps) {
    const v = hebrewVoice(s);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
}

/** The unit word (or its Hebrew construct form) repeated inside the name: "1 חבילה | חבילת בצק", "לפי הטעם" twice. */
export function unitRepeatedInName(unit: string, name: string): boolean {
  const u = normalize(unit).trim();
  if (u.length < 3) return false;
  const n = normalize(name);
  const forms = [u];
  if (/ה$/.test(u)) forms.push(`${u.slice(0, -1)}ת`);
  return forms.some((f) => n.includes(f));
}

/** Checks that hold for every case. */
export function genericChecks(testCase: TranslateCase, r: Rendered): CheckResult[] {
  const out: CheckResult[] = [];
  const allow = testCase.allow_latin ?? [];
  const parts: [string, string][] = [
    ['title', r.title],
    ...r.ingredients.map((i, n): [string, string] => [`line:${n + 1}`, i.line]),
    ...r.steps.map((s, n): [string, string] => [`step:${n + 1}`, s]),
  ];
  for (const [where, text] of parts) {
    const words = foreignWords(text, testCase.target, allow);
    out.push({ check: 'untranslated', where, ok: words.length === 0, detail: words.slice(0, 4).join(' ') || undefined });
  }
  r.ingredients.forEach((i, n) => {
    if (!i.unit) return;
    const repeated = unitRepeatedInName(i.unit, i.name);
    out.push({ check: 'unit_in_name', where: `line:${n + 1}`, ok: !repeated, detail: repeated ? i.line : undefined });
  });
  if (testCase.target === 'ru') {
    r.ingredients.forEach((i, n) => {
      const capital = /^[А-ЯЁ]/u.test(i.name) && !allow.some((a) => i.name.startsWith(a));
      out.push({ check: 'ru_capitalized', where: `ing:${n + 1}`, ok: !capital, detail: capital ? i.name : undefined });
    });
  }
  if (testCase.target === 'he') {
    const voices = new Set(r.steps.map(hebrewVoice).filter(Boolean));
    out.push({
      check: 'voice_mixed',
      where: 'steps',
      ok: voices.size <= 1,
      detail: voices.size > 1 ? [...voices].join('+') : undefined,
    });
  }
  return out;
}

/** The hand labels in cases/translate.json. */
export function labelledChecks(testCase: TranslateCase, r: Rendered): CheckResult[] {
  const out: CheckResult[] = [];
  for (const e of testCase.expect ?? []) {
    const text = field(r, e.at);
    const ok = e.any_of.some((term) => containsTerm(text, term));
    out.push({ check: `expect:${e.at.split(':')[0]}`, where: e.at, ok, detail: ok ? undefined : `${field(r, e.at)} ≠ ${e.any_of.join(' / ')}` });
  }
  for (const f of testCase.forbid ?? []) {
    const text = field(r, f.at);
    const hits = f.terms.filter((term) => containsTerm(text, term));
    out.push({ check: `forbid:${f.at.split(':')[0]}`, where: f.at, ok: hits.length === 0, detail: hits.join(', ') || undefined });
  }
  for (const f of testCase.forbid_re ?? []) {
    const text = field(r, f.at);
    const hits = f.patterns.filter((p) => new RegExp(p, 'u').test(text));
    out.push({ check: `forbid:${f.at.split(':')[0]}`, where: f.at, ok: hits.length === 0, detail: hits.join(', ') || undefined });
  }
  return out;
}

// ---------------------------------------------------------------- judge

const JUDGE_CATEGORIES = [
  'untranslated',
  'unit',
  'ingredient_term',
  'cooking_verb',
  'grammar',
  'style_consistency',
  'meaning',
  'number_format',
  'other',
] as const;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    native_score: {
      type: 'integer',
      description: '1–5. 5 = reads as if a native cook wrote it in this language; 1 = unusable.',
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          where: { type: 'string', description: 'title, ingredient N, or step N' },
          category: { type: 'string', enum: [...JUDGE_CATEGORIES] },
          severity: { type: 'string', enum: ['minor', 'major'] },
          excerpt: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['where', 'category', 'severity', 'excerpt', 'fix'],
      },
    },
  },
  required: ['native_score', 'errors'],
};

export type JudgeVerdict = {
  native_score: number;
  errors: { where: string; category: string; severity: 'minor' | 'major'; excerpt: string; fix: string }[];
};

function judgeSystem(target: Lang): string {
  return `You are a cookbook editor and a native speaker of ${LANGUAGE_NAMES[target]}. You review a machine translation of a recipe exactly as an app user will see it: amounts and units are already formatted for display.

List every real error (MQM style). For each: where it is, a category, a severity, the exact excerpt, and the fix.
- major: a cook would be misled or stopped (wrong ingredient or amount, wrong temperature, dropped step), or a line reads as broken or half untranslated.
- minor: understandable but not how a native cook writes it (unnatural word, wrong agreement or plural, inconsistent style, literal phrasing).
Categories:
- untranslated: source-language words left in (brand names are fine).
- unit: wrong, untranslated or ungrammatical unit word, wrong singular/plural after an amount, a unit the target cook doesn't use without a conversion (°F, inches).
- ingredient_term: the ingredient name isn't what cooks in this language call it, or names a different product.
- cooking_verb: the verb for a cooking action is wrong or unidiomatic.
- grammar: agreement, case, gender, word order.
- style_consistency: the recipe mixes styles (for example imperative and impersonal steps, two dialects, the same ingredient named two ways).
- meaning: added, dropped or changed information.
- number_format: decimals or numbers written in a way cooks in this language don't (0.5 for a half).
Don't flag things that are fine. Don't flag the source's own mistakes. native_score: 1–5, where 5 means it reads like it was written in this language by a cook.`;
}

function sourceView(c: TranslateCase): string {
  return [
    `Title: ${c.recipe.title}`,
    'Ingredients:',
    ...c.recipe.ingredients.map(([q, u, n], i) => `${i + 1}. ${q} ${u} | ${n}`.replace(/\s+/g, ' ')),
    'Steps:',
    ...c.recipe.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}

function targetView(r: Rendered): string {
  return [
    `Title: ${r.title}`,
    'Ingredients:',
    ...r.ingredients.map((i, n) => `${n + 1}. ${i.line}`),
    'Steps:',
    ...r.steps.map((s, n) => `${n + 1}. ${s}`),
  ].join('\n');
}

export function mqmPenalty(v: JudgeVerdict): number {
  return v.errors.reduce((sum, e) => sum + (e.severity === 'major' ? 5 : 1), 0);
}

// ---------------------------------------------------------------- run

type RawRecord = {
  caseId: string;
  run: number;
  model: string;
  ok: boolean;
  error?: string;
  ms: number;
  costUsd: number;
  servedModels: string[];
  output?: TranslatedOutput;
  /** The model's own JSON before translateRecipe.ts rebuilds units and amounts (for diagnosis). */
  modelData?: unknown[];
};

type Scored = {
  testCase: TranslateCase;
  run: number;
  record: RawRecord;
  rendered: Rendered | null;
  checks: CheckResult[];
};

const calls = new AsyncLocalStorage<GenerateLlmJsonResult<unknown>[]>();

function isBalanceError(message: string): boolean {
  return /\b402\b|requires at least \$?1/i.test(message);
}

let stopAll = false;

async function translateOnce(c: TranslateCase, run: number, modelLabel: string, rawPath: string, force: boolean): Promise<RawRecord> {
  if (!force && (await exists(rawPath))) return await readJson<RawRecord>(rawPath);
  if (stopAll) throw new Error('stopped: OpenRouter balance error earlier in this run');
  const results: GenerateLlmJsonResult<unknown>[] = [];
  const started = Date.now();
  let record: RawRecord;
  try {
    const translated = await calls.run(results, () =>
      translateRecipeWithLlm({
        targetLanguage: c.target as TranslateLanguageCode,
        title: c.recipe.title,
        ingredients: c.recipe.ingredients.map(([quantity, unit, name]) => ({ name, quantity, unit })),
        instructions: c.recipe.steps.map((text, i) => ({ step: i + 1, text })),
      })
    );
    const { usage: _usage, ...output } = translated;
    record = {
      caseId: c.id,
      run,
      model: modelLabel,
      ok: true,
      ms: Date.now() - started,
      costUsd: results.reduce((s, r) => s + (r.costUsd ?? 0), 0),
      servedModels: results.map((r) => r.model),
      output: output as TranslatedOutput,
      modelData: results.map((r) => r.data),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isBalanceError(message)) {
      stopAll = true;
      console.error(`\n!!! OpenRouter balance error, stopping all runs: ${message.slice(0, 200)}`);
    }
    record = {
      caseId: c.id,
      run,
      model: modelLabel,
      ok: false,
      error: message.slice(0, 500),
      ms: Date.now() - started,
      costUsd: results.reduce((s, r) => s + (r.costUsd ?? 0), 0),
      servedModels: results.map((r) => r.model),
    };
  }
  await writeJson(rawPath, record);
  return record;
}

function pct(n: number, d: number): string {
  return d === 0 ? '–' : `${((n / d) * 100).toFixed(0)}%`;
}

function avg(values: number[]): string {
  return values.length === 0 ? '–' : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

export async function translateCommand(args: string[]): Promise<void> {
  const flags = Object.fromEntries(args.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const runs = Math.max(1, Number(flags.runs ?? 2));
  const only = flags.only as string | undefined;
  const pinned = flags.model as string | undefined;
  const judgeModel = (flags['judge-model'] as string | undefined) ?? DEFAULT_JUDGE;
  const judge = flags['no-judge'] !== 'true';
  const force = flags.force === 'true';
  const tag = (flags.tag as string | undefined) ?? '';
  // Only these cases get a new judge call (to stay in budget); verdicts already on disk are read for every case.
  const judgeIds = (flags['judge-ids'] as string | undefined)?.split(',').filter(Boolean) ?? null;
  const modelLabel = pinned ?? 'production';
  const variant = slug(`${modelLabel}${tag ? `-${tag}` : ''}`);

  setEvalHook({
    model: () => pinned ?? null,
    onResult: (result) => calls.getStore()?.push(result),
  });

  const file = await readJson<{ cases: TranslateCase[] }>(`${ROOT}cases/translate.json`);
  const cases = file.cases.filter((c) => !only || c.target === only || c.id.includes(only));
  const rawDir = `${RESULTS}raw/translate-quality/${variant}/`;
  const judgeDir = `${RESULTS}judge/translate-quality/${variant}/`;

  const jobs = cases.flatMap((c) => Array.from({ length: runs }, (_, i) => ({ c, run: i + 1 })));
  console.log(`${cases.length} cases × ${runs} runs on ${modelLabel}`);
  const scored: Scored[] = await pool(jobs, 4, async ({ c, run }) => {
    const record = await translateOnce(c, run, modelLabel, `${rawDir}${c.id}.run${run}.json`, force);
    const rendered = record.ok && record.output ? render(record.output, c.target) : null;
    const checks = rendered ? [...genericChecks(c, rendered), ...labelledChecks(c, rendered)] : [];
    console.log(`${record.ok ? '✓' : '✗'} ${c.id} run${run} ${record.ms} ms $${record.costUsd.toFixed(4)}${record.ok ? ` ${checks.filter((x) => !x.ok).length} failed checks` : ` ${record.error}`}`);
    return { testCase: c, run, record, rendered, checks };
  });

  const verdicts = new Map<string, JudgeVerdict>();
  let judgeCost = 0;
  if (judge && !stopAll) {
    const firstRuns = scored.filter((s) => s.run === 1 && s.rendered);
    await pool(firstRuns, 4, async (s) => {
      const path = `${judgeDir}${s.testCase.id}.json`;
      if (!force && (await exists(path))) {
        verdicts.set(s.testCase.id, (await readJson<{ verdict: JudgeVerdict }>(path)).verdict);
        return;
      }
      if (stopAll) return;
      if (judgeIds && !judgeIds.includes(s.testCase.id)) return;
      try {
        const { data, costUsd } = await chatJson<JudgeVerdict>({
          model: judgeModel,
          system: judgeSystem(s.testCase.target),
          content: `Target language: ${LANGUAGE_NAMES[s.testCase.target]}\n\nSOURCE (${s.testCase.source_lang}):\n${sourceView(s.testCase)}\n\nTRANSLATION AS SHOWN IN THE APP:\n${targetView(s.rendered!)}`,
          schema: JUDGE_SCHEMA,
          name: 'translation_review',
          reasoning: 'low',
          maxTokens: 6000,
        });
        judgeCost += costUsd;
        verdicts.set(s.testCase.id, data);
        await writeJson(path, { caseId: s.testCase.id, judge: judgeModel, translation: targetView(s.rendered!), verdict: data, costUsd });
        console.log(`judged ${s.testCase.id}: ${data.native_score}/5, ${data.errors.length} errors`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isBalanceError(message)) stopAll = true;
        console.error(`✗ judge ${s.testCase.id}: ${message.slice(0, 200)}`);
      }
    });
  }

  await writeReport({ scored, verdicts, runs, modelLabel, variant, judgeModel: judge ? judgeModel : null, judgeCost, cases });
  if (stopAll) {
    console.error('Stopped early because OpenRouter reported a balance problem. Production AI uses the same balance.');
    Deno.exit(2);
  }
}

async function writeReport(opts: {
  scored: Scored[];
  verdicts: Map<string, JudgeVerdict>;
  runs: number;
  modelLabel: string;
  variant: string;
  judgeModel: string | null;
  judgeCost: number;
  cases: TranslateCase[];
}): Promise<void> {
  const { scored, verdicts, runs, cases } = opts;
  const langs: Lang[] = ['he', 'ar', 'ru', 'es', 'en'];
  const translateCost = scored.reduce((s, x) => s + x.record.costUsd, 0);
  const ms = scored.filter((s) => s.record.ok).map((s) => s.record.ms).sort((a, b) => a - b);
  const served = [...new Set(scored.flatMap((s) => s.record.servedModels))].join(', ') || '–';

  const row = (label: string, set: Scored[]) => {
    const okSet = set.filter((s) => s.rendered);
    const checks = okSet.flatMap((s) => s.checks);
    const clean = okSet.filter((s) => s.checks.every((c) => c.ok)).length;
    const firstIds = new Set(set.filter((s) => s.run === 1).map((s) => s.testCase.id));
    const v = [...firstIds].map((id) => verdicts.get(id)).filter((x): x is JudgeVerdict => Boolean(x));
    const noMajor = v.filter((x) => x.errors.every((e) => e.severity !== 'major')).length;
    return `| ${label} | ${set.length} | ${set.length - okSet.length} | ${pct(checks.filter((c) => c.ok).length, checks.length)} | ${pct(clean, okSet.length)} | ${avg(v.map((x) => x.native_score))} | ${avg(v.map(mqmPenalty))} | ${pct(noMajor, v.length)} |`;
  };

  // Failed checks by kind.
  const failedBy = new Map<string, number>();
  const totalBy = new Map<string, number>();
  for (const s of scored) {
    for (const c of s.checks) {
      totalBy.set(c.check, (totalBy.get(c.check) ?? 0) + 1);
      if (!c.ok) failedBy.set(c.check, (failedBy.get(c.check) ?? 0) + 1);
    }
  }
  const checkRows = [...totalBy.keys()].sort().map((k) => `| \`${k}\` | ${failedBy.get(k) ?? 0} / ${totalBy.get(k)} |`);

  // Judge errors by category.
  const cat = new Map<string, { minor: number; major: number; langs: Set<string> }>();
  for (const c of cases) {
    const v = verdicts.get(c.id);
    for (const e of v?.errors ?? []) {
      const entry = cat.get(e.category) ?? { minor: 0, major: 0, langs: new Set() };
      entry[e.severity === 'major' ? 'major' : 'minor'] += 1;
      entry.langs.add(c.target);
      cat.set(e.category, entry);
    }
  }
  const catRows = [...cat.entries()]
    .sort((a, b) => b[1].major * 5 + b[1].minor - (a[1].major * 5 + a[1].minor))
    .map(([k, e]) => `| ${k} | ${e.major} | ${e.minor} | ${[...e.langs].join(', ')} |`);

  // Stability across runs.
  const stabilityRows: string[] = [];
  let titleSame = 0;
  let namePairs = 0;
  let nameSame = 0;
  let voiceCases = 0;
  let voiceSame = 0;
  if (runs > 1) {
    for (const c of cases) {
      const outs = scored.filter((s) => s.testCase.id === c.id && s.rendered).map((s) => s.rendered!);
      if (outs.length < 2) continue;
      const tSame = new Set(outs.map((o) => o.title)).size === 1;
      if (tSame) titleSame += 1;
      let same = 0;
      outs[0].ingredients.forEach((_, i) => {
        namePairs += 1;
        if (new Set(outs.map((o) => o.ingredients[i]?.name)).size === 1) {
          nameSame += 1;
          same += 1;
        }
      });
      let voices = '';
      if (c.target === 'he') {
        voiceCases += 1;
        const vs = outs.map((o) => dominantVoice(o.steps));
        if (new Set(vs).size === 1) voiceSame += 1;
        voices = vs.join(' / ');
      }
      if (!tSame || same < outs[0].ingredients.length || (voices && new Set(voices.split(' / ')).size > 1)) {
        stabilityRows.push(`| ${c.id} | ${tSame ? 'same' : outs.map((o) => o.title).join(' ⟷ ')} | ${same}/${outs[0].ingredients.length} | ${voices || '–'} |`);
      }
    }
  }
  const comparable = cases.filter((c) => scored.filter((s) => s.testCase.id === c.id && s.rendered).length > 1).length;

  const lines = [
    '# Translation quality eval (PIN-53)',
    '',
    `Run ${new Date().toISOString().slice(0, 16)}Z · translate model: ${opts.modelLabel === 'production' ? 'production default (`TASK_MODELS.translate`)' : `\`${opts.modelLabel}\``} · served: ${served} · ${runs} run(s) × ${cases.length} cases · translate cost $${translateCost.toFixed(4)} · judge (${opts.judgeModel ?? 'off'}, run 1 only) $${opts.judgeCost.toFixed(4)} · median ${ms[Math.floor(ms.length / 2)] ?? 0} ms per recipe`,
    '',
    'Checks run on what the recipe screen shows for the recipe as written (`shared/lib/culinaryUnits.ts` + `formatQuantity`, no Spoons/Grams conversion). Hand labels are in `eval/cases/translate.json`. MQM penalty: 1 per minor error, 5 per major, per recipe (lower is better).',
    '',
    '| Set | Answers | Call errors | Checks passed | Answers with no failed check | Judge native score (1–5) | MQM penalty | Recipes with no major error |',
    '|---|---|---|---|---|---|---|---|',
    row('All', scored),
    ...langs.filter((l) => cases.some((c) => c.target === l)).map((l) => row(l, scored.filter((s) => s.testCase.target === l))),
    '',
    '## Failed checks by kind (all runs)',
    '',
    '| Check | Failed / total |',
    '|---|---|',
    ...checkRows,
    '',
    '## Judge errors by category (run 1)',
    '',
    '| Category | Major | Minor | Languages |',
    '|---|---|---|---|',
    ...(catRows.length ? catRows : ['| – | – | – | – |']),
    '',
    '## Stability across runs',
    '',
    runs > 1
      ? `Same title in ${titleSame}/${comparable} recipes · same ingredient name in ${nameSame}/${namePairs} lines (${pct(nameSame, namePairs)}) · same Hebrew step voice in ${voiceSame}/${voiceCases} Hebrew recipes.`
      : 'n/a (single run)',
    '',
    ...(stabilityRows.length
      ? ['| Case | Title | Ingredient names identical | Hebrew voice per run |', '|---|---|---|---|', ...stabilityRows, '']
      : []),
    '## Per case (run 1)',
    '',
    '| Case | Failed checks | Judge | Major errors |',
    '|---|---|---|---|',
    ...cases.map((c) => {
      const s = scored.find((x) => x.testCase.id === c.id && x.run === 1);
      if (!s?.rendered) return `| ${c.id} | call failed: ${(s?.record.error ?? '').slice(0, 80).replace(/\|/g, '/')} | – | – |`;
      const failed = s.checks.filter((x) => !x.ok).map((x) => `${x.check}@${x.where}${x.detail ? ` (${x.detail})` : ''}`);
      const v = verdicts.get(c.id);
      const majors = v?.errors.filter((e) => e.severity === 'major').map((e) => `${e.category}: ${e.excerpt}`) ?? [];
      const cell = (items: string[]) => (items.length ? items.join('; ').replace(/\|/g, '/').replace(/\n/g, ' ') : '–');
      return `| ${c.id} | ${cell(failed)} | ${v ? `${v.native_score}/5, ${v.errors.length} errors` : '–'} | ${cell(majors)} |`;
    }),
    '',
  ];
  const out = `${RESULTS}translate${opts.variant === 'production' ? '' : `-${opts.variant}`}.md`;
  await Deno.writeTextFile(out, lines.join('\n'));
  console.log(lines.slice(0, 16).join('\n'));
  console.log(`\nWrote ${out}`);
}

if (import.meta.main) {
  await translateCommand(Deno.args);
}
