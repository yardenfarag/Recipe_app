// PIN-181 pantry scan bake-off. Runs the production scan (supabase/functions/_shared/pantry/pantryScan.ts) on
// photos of fridges, freezers and cupboards, one model at a time, and scores it in code against hand labels.
//   node eval/pantryImages.mjs                      # once: resize the photos, make the blurred and dark ones
//   deno pantry --models=a,b [--size=large] [--lang=en] [--only=own] [--concurrency=3] [--force]
//   deno pantry --report                            # rescore what is on disk (after a label fix, costs nothing)
// (`deno` is the helper from eval/README.md.) Writes eval/results/pantry.md and one JSON per call under
// eval/results/raw/pantry/. The scorer has its own tests: eval/pantry_test.ts.

import { setEvalHook } from '../supabase/functions/_shared/llm/llmClient.ts';
import {
  type PantryPlace,
  type PantryScanItem,
  type PantryScanResult,
  type PhotoQuality,
  scanPantryPhoto,
} from '../supabase/functions/_shared/pantry/pantryScan.ts';
import { exists, fileBase64, percentile, pool, PRIVATE, readJson, RESULTS, ROOT, slug, writeJson } from './lib.ts';
import { PANTRY_MODELS } from './models.ts';

export type ExpectedItem = {
  /** Phrases that name this food. The model's English name must contain one as whole words. */
  any_of: string[];
  /** Only nameable by reading the label or knowing the product. */
  brand: boolean;
};

export type PantryCase = {
  id: string;
  file?: string;
  commons?: string;
  degrade?: { from: string; how: 'blur' | 'dark' };
  source: 'own' | 'web' | 'commons' | 'synthetic';
  market: string;
  place: PantryPlace;
  /** The labels cover the whole photo, so anything else the model lists is made up. */
  strict: boolean;
  quality: PhotoQuality[];
  expect: ExpectedItem[];
  also_ok: string[];
  never: string[];
};

export type ScoredItem = { name: string; confidence: 'high' | 'low' };

export type CaseScore = {
  matched: ScoredItem[];
  /** Expected entries nothing matched, as `a|b|c`. */
  missed: string[];
  brandExpected: number;
  brandMatched: number;
  /** In also_ok, or a second name for an entry that is already matched. */
  alsoOk: ScoredItem[];
  /** Matches nothing in the labels. Made up on a strict case; unchecked on the others. */
  unmatched: ScoredItem[];
  /** Medicine, pet products, cleaning products… that the model listed as food. */
  forbidden: string[];
  /** "Container, not sure what's in it" rows. Honest, so they count for nothing. */
  containers: number;
  quality: PhotoQuality | null;
  qualityOk: boolean;
};

const SINGULAR_EXCEPTIONS = new Set(['hummus', 'couscous', 'asparagus', 'molasses', 'swiss', 'citrus', 'bass']);

function singular(word: string): string {
  if (word.length <= 3 || SINGULAR_EXCEPTIONS.has(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

/** Lower case, no accents or punctuation, every word singular: "Za'atar", "zaatar" and "Tomatoes" line up. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

/** Whole-word phrase match on normalized text: "pea" is in "pea and carrot", not in "peanut". */
export function containsPhrase(name: string, phrase: string): boolean {
  const haystack = ` ${normalizeName(name)} `;
  const needle = normalizeName(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

function longestMatch(name: string, phrases: string[]): number {
  let best = 0;
  for (const phrase of phrases) {
    if (containsPhrase(name, phrase)) best = Math.max(best, normalizeName(phrase).length);
  }
  return best;
}

/**
 * Scores one answer against its labels. Pure, so it is unit-tested.
 * Items are matched on their English name, longest phrase first, so "brown sugar" takes the brown sugar entry
 * and leaves "sugar" for the white one.
 */
export function scoreCase(testCase: PantryCase, result: PantryScanResult | null): CaseScore {
  const score: CaseScore = {
    matched: [],
    missed: [],
    brandExpected: testCase.expect.filter((e) => e.brand).length,
    brandMatched: 0,
    alsoOk: [],
    unmatched: [],
    forbidden: [],
    containers: 0,
    quality: result?.quality ?? null,
    qualityOk: result !== null && testCase.quality.includes(result.quality),
  };
  const items: PantryScanItem[] = [];
  for (const item of result?.items ?? []) {
    if (testCase.never.some((phrase) => containsPhrase(item.nameEn, phrase))) score.forbidden.push(item.nameEn);
    else if (item.containerUnknown) score.containers += 1;
    else items.push(item);
  }

  const pairs: Array<{ item: number; entry: number; length: number }> = [];
  items.forEach((item, i) => {
    testCase.expect.forEach((entry, e) => {
      const length = longestMatch(item.nameEn, entry.any_of);
      if (length > 0) pairs.push({ item: i, entry: e, length });
    });
  });
  pairs.sort((a, b) => b.length - a.length);
  const itemTaken = new Set<number>();
  const entryTaken = new Set<number>();
  for (const pair of pairs) {
    if (itemTaken.has(pair.item) || entryTaken.has(pair.entry)) continue;
    itemTaken.add(pair.item);
    entryTaken.add(pair.entry);
    score.matched.push({ name: items[pair.item].nameEn, confidence: items[pair.item].confidence });
    if (testCase.expect[pair.entry].brand) score.brandMatched += 1;
  }

  items.forEach((item, i) => {
    if (itemTaken.has(i)) return;
    const scored = { name: item.nameEn, confidence: item.confidence };
    const repeat = pairs.some((pair) => pair.item === i);
    if (repeat || longestMatch(item.nameEn, testCase.also_ok) > 0) score.alsoOk.push(scored);
    else score.unmatched.push(scored);
  });
  testCase.expect.forEach((entry, e) => {
    if (!entryTaken.has(e)) score.missed.push(entry.any_of.join('|'));
  });
  return score;
}

export type Totals = {
  photos: number;
  /** Calls that failed or returned no usable answer. */
  errors: number;
  expected: number;
  matched: number;
  recall: number;
  brandExpected: number;
  brandMatched: number;
  brandRecall: number;
  /** Items on strict photos: everything the model listed there, bar containers. */
  strictListed: number;
  /** Strict photos only: items that are in none of the labels. */
  madeUp: number;
  /** Made-up items the model was sure of. These arrive ticked. */
  madeUpSure: number;
  precision: number;
  forbidden: number;
  /** Share of matched items the model was sure of. */
  sureWhenRight: number;
  verdictsRight: number;
  /** Items listed as "high" on the blurred and darkened photos. */
  sureOnUnreadable: number;
  /** Items on the other photos that match no label. Not counted as wrong; listed for a hand check. */
  unchecked: number;
};

export type ScoredCase = { testCase: PantryCase; score: CaseScore; failed: boolean };

export function totals(rows: ScoredCase[]): Totals {
  const t: Totals = {
    photos: rows.length,
    errors: 0,
    expected: 0,
    matched: 0,
    recall: 1,
    brandExpected: 0,
    brandMatched: 0,
    brandRecall: 1,
    strictListed: 0,
    madeUp: 0,
    madeUpSure: 0,
    precision: 1,
    forbidden: 0,
    sureWhenRight: 1,
    verdictsRight: 0,
    sureOnUnreadable: 0,
    unchecked: 0,
  };
  let sureMatched = 0;
  for (const { testCase, score, failed } of rows) {
    if (failed) t.errors += 1;
    t.expected += testCase.expect.length;
    t.matched += score.matched.length;
    t.brandExpected += score.brandExpected;
    t.brandMatched += score.brandMatched;
    t.forbidden += score.forbidden.length;
    sureMatched += score.matched.filter((m) => m.confidence === 'high').length;
    if (score.qualityOk) t.verdictsRight += 1;
    if (testCase.strict) {
      t.strictListed += score.matched.length + score.alsoOk.length + score.unmatched.length + score.forbidden.length;
      t.madeUp += score.unmatched.length;
      t.madeUpSure += score.unmatched.filter((m) => m.confidence === 'high').length;
    } else {
      t.unchecked += score.unmatched.length;
    }
    if (testCase.degrade) {
      t.sureOnUnreadable += [...score.matched, ...score.alsoOk, ...score.unmatched].filter((m) => m.confidence === 'high').length;
    }
  }
  t.recall = t.expected === 0 ? 1 : t.matched / t.expected;
  t.brandRecall = t.brandExpected === 0 ? 1 : t.brandMatched / t.brandExpected;
  // A forbidden item on a strict photo is a wrong item too.
  const strictWrong = t.madeUp + rows.filter((r) => r.testCase.strict).reduce((n, r) => n + r.score.forbidden.length, 0);
  t.precision = t.strictListed === 0 ? 1 : 1 - strictWrong / t.strictListed;
  t.sureWhenRight = t.matched === 0 ? 1 : sureMatched / t.matched;
  return t;
}

// ---------------------------------------------------------------------------------------------------------
// Running and reporting

type RawCall = {
  case: string;
  model: string;
  reasoning: string | null;
  size: string;
  lang: string;
  ms: number;
  costUsd: number;
  usedModel?: string;
  result?: PantryScanResult;
  error?: string;
};

const RAW = `${RESULTS}raw/pantry/`;
const rawPath = (set: string, model: string, caseId: string) => `${RAW}${set}/${slug(model)}/${caseId}.json`;
const imagePath = (caseId: string, size: string) => `${PRIVATE}pantry/prepared/${caseId}@${size}.jpg`;

class OutOfCredit extends Error {}

async function callOnce(testCase: PantryCase, size: string, lang: string) {
  const started = Date.now();
  const result = await scanPantryPhoto({
    imageBase64: await fileBase64(imagePath(testCase.id, size)),
    mimeType: 'image/jpeg',
    place: testCase.place,
    language: lang,
  });
  // Wall clock: llmClient's own durationMs stops at the response headers.
  return { result, ms: Date.now() - started };
}

async function runModel(spec: string, cases: PantryCase[], opts: { size: string; lang: string; concurrency: number; force: boolean }) {
  // `vendor/model@none` pins the reasoning effort; a bare slug runs at the task's own (TASK_MODELS.pantry_scan).
  const [model, reasoning] = spec.split('@');
  setEvalHook({ model: () => model, reasoning: () => reasoning ?? null });
  const set = `${opts.size}-${opts.lang}`;
  let stopped = false;
  await pool(cases, opts.concurrency, async (testCase) => {
    const path = rawPath(set, spec, testCase.id);
    if (stopped) return;
    if (!opts.force && (await exists(path))) {
      const saved = await readJson<RawCall>(path);
      if (saved.result) return;
    }
    const raw: RawCall = { case: testCase.id, model, reasoning: reasoning ?? null, size: opts.size, lang: opts.lang, ms: 0, costUsd: 0 };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const { result, ms } = await callOnce(testCase, opts.size, opts.lang);
        const { usage, ...answer } = result;
        Object.assign(raw, { ms, costUsd: usage?.costUsd ?? 0, usedModel: usage?.model, result: answer, error: undefined });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        raw.error = message.slice(0, 600);
        // Out of credit: production shares this balance, so stop everything.
        if (/status=402\b/.test(message)) {
          stopped = true;
          throw new OutOfCredit(message);
        }
        const retry = /status=(429|5\d\d)\b|timedOut=true|fetch failed|invalid JSON/i.test(message);
        if (!retry || attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
    await writeJson(path, raw);
    console.log(`${raw.result ? '✓' : '✗'} ${spec} ${testCase.id} ${raw.ms} ms ${raw.result ? `${raw.result.items.length} items` : raw.error}`);
  });
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const seconds = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

async function listDirs(path: string): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const entry of Deno.readDir(path)) if (entry.isDirectory) names.push(entry.name);
  } catch {
    // Nothing run yet.
  }
  return names.sort();
}

async function report(cases: PantryCase[]): Promise<void> {
  const lines: string[] = [
    '# Pantry scan bake-off (PIN-181)',
    '',
    `Scored ${new Date().toISOString().slice(0, 10)} from the calls under \`results/raw/pantry/\`. ${cases.length} photos: ${cases.filter((c) => c.source === 'own').length} from Yarden's kitchen, ${cases.filter((c) => c.source === 'web').length} from the web, ${cases.filter((c) => c.source === 'commons').length} from Wikimedia Commons, ${cases.filter((c) => c.source === 'synthetic').length} blurred or darkened copies.`,
    '',
    'How to read the columns:',
    '',
    '- **Made up**: items that are in none of the labels, on the photos whose labels cover everything. "sure" is how many of them the model marked as certain, which is how many would arrive ticked.',
    '- **Right items**: the share of everything it listed on those photos that is really there.',
    '- **Found**: the share of the clearly visible food it listed. **Label only**: the same for food that can only be named by reading the label or knowing the product.',
    '- **Not food**: medicine, pet products or cleaning products listed as food.',
    '- **Photo verdict**: right calls of ok / too dark / blurry / too far / not a kitchen.',
    '- **Sure on unreadable**: items marked certain on the blurred and the darkened photo.',
    '- **Unchecked**: items on the cluttered web photos that match no label. Not counted as wrong.',
    '',
  ];
  const sets = await listDirs(RAW);
  for (const set of sets) {
    const specs = await listDirs(`${RAW}${set}/`);
    // One directory per model (and reasoning effort); each is scored on its own.
    const loaded: Array<{ model: string; rows: ScoredCase[]; raws: RawCall[] }> = [];
    for (const dir of specs) {
      const rows: ScoredCase[] = [];
      const raws: RawCall[] = [];
      for (const testCase of cases) {
        const path = `${RAW}${set}/${dir}/${testCase.id}.json`;
        if (!(await exists(path))) continue;
        const raw = await readJson<RawCall>(path);
        raws.push(raw);
        rows.push({ testCase, score: scoreCase(testCase, raw.result ?? null), failed: !raw.result });
      }
      if (rows.length > 0) loaded.push({ model: raws[0].reasoning ? `${raws[0].model}@${raws[0].reasoning}` : raws[0].model, rows, raws });
    }
    if (loaded.length === 0) continue;
    const [size, lang] = set.split('-');
    lines.push(`## ${size} photos, names in ${lang}`, '');
    lines.push('| Model | Photos | Failed | Made up (sure) | Right items | Found | Label only | Not food | Photo verdict | Sure on unreadable | Unchecked | Typical / slow | Cost per photo |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const summary = loaded
      .map((entry) => {
        const ok = entry.raws.filter((r) => r.result);
        const ms = ok.map((r) => r.ms);
        const cost = ok.reduce((sum, r) => sum + r.costUsd, 0);
        return { ...entry, t: totals(entry.rows), p50: percentile(ms, 50), p95: percentile(ms, 95), costPer: ok.length ? cost / ok.length : 0, cost };
      })
      .sort((a, b) => b.t.precision - a.t.precision || b.t.recall - a.t.recall);
    for (const s of summary) {
      lines.push(
        `| ${s.model} | ${s.t.photos} | ${s.t.errors} | ${s.t.madeUp} (${s.t.madeUpSure}) | ${pct(s.t.precision)} | ${pct(s.t.recall)} (${s.t.matched}/${s.t.expected}) | ${pct(s.t.brandRecall)} (${s.t.brandMatched}/${s.t.brandExpected}) | ${s.t.forbidden} | ${s.t.verdictsRight}/${s.t.photos} | ${s.t.sureOnUnreadable} | ${s.t.unchecked} | ${seconds(s.p50)} / ${seconds(s.p95)} | $${s.costPer.toFixed(4)} |`,
      );
    }
    const spent = summary.reduce((sum, s) => sum + s.cost, 0);
    lines.push('', `Spent on this set: $${spent.toFixed(2)}.`, '');

    const markets = [...new Set(cases.map((c) => c.market))].sort();
    lines.push('Found, by where the kitchen is:', '', `| Model | ${markets.join(' | ')} |`, `|---|${markets.map(() => '---').join('|')}|`);
    for (const s of summary) {
      const cells = markets.map((market) => {
        const t = totals(s.rows.filter((r) => r.testCase.market === market));
        return t.expected === 0 ? '–' : `${pct(t.recall)} (${t.matched}/${t.expected})`;
      });
      lines.push(`| ${s.model} | ${cells.join(' | ')} |`);
    }
    lines.push('');

    for (const s of summary) {
      lines.push(`### ${s.model}`, '');
      lines.push('| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |', '|---|---|---|---|---|---|');
      for (const { testCase, score, failed } of s.rows) {
        const listed = score.matched.length + score.alsoOk.length + score.unmatched.length;
        const extra = score.unmatched.map((m) => `${m.name}${m.confidence === 'high' ? ' ✓' : ''}`).join(', ');
        lines.push(
          `| ${testCase.id}${testCase.strict ? '' : ' °'} | ${failed ? 'failed' : `${score.quality}${score.qualityOk ? '' : ' ✗'}`} | ${listed}${score.containers ? ` +${score.containers} tubs` : ''} | ${score.missed.map((m) => m.split('|')[0]).join(', ') || '–'} | ${extra || '–'} | ${score.forbidden.join(', ') || '–'} |`,
        );
      }
      lines.push('', '° labels cover only the clear items, so the extra names are unchecked, not wrong.', '');
    }

    if (lang !== 'en') {
      lines.push(`### Names in ${lang} on Yarden's photos`, '');
      for (const s of summary) {
        lines.push(`**${s.model}**`, '');
        for (const raw of s.raws.filter((r) => r.case.startsWith('own-') && r.result)) {
          lines.push(`- ${raw.case}: ${raw.result!.items.map((i) => `${i.name} (${i.nameEn})`).join(' · ') || '–'}`);
        }
        lines.push('');
      }
    }
  }
  await Deno.writeTextFile(`${RESULTS}pantry.md`, lines.join('\n'));
  console.log(lines.slice(0, 60).join('\n'));
  console.log(`\nWrote ${RESULTS}pantry.md`);
}

export async function pantryCommand(args: string[]): Promise<void> {
  const flags = Object.fromEntries(args.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const all = (await readJson<{ cases: PantryCase[] }>(`${ROOT}cases/pantry.json`)).cases;
  if (flags.report === 'true') return report(all);

  const only = flags.only as string | undefined;
  const cases = all.filter((c) => !only || c.id.includes(only) || c.source === only);
  const models = flags.models ? String(flags.models).split(',') : [...PANTRY_MODELS];
  const opts = {
    size: String(flags.size ?? 'large'),
    lang: String(flags.lang ?? 'en'),
    concurrency: Math.max(1, Number(flags.concurrency ?? 3)),
    force: flags.force === 'true',
  };
  for (const testCase of cases) {
    if (!(await exists(imagePath(testCase.id, opts.size)))) {
      throw new Error(`No prepared photo for ${testCase.id}. Run: node eval/pantryImages.mjs`);
    }
  }
  try {
    for (const model of models) await runModel(model, cases, opts);
  } catch (error) {
    if (!(error instanceof OutOfCredit)) throw error;
    console.error('Stopped: OpenRouter answered 402 (out of credit). Production uses the same balance.');
    Deno.exit(1);
  }
  await report(all);
}
