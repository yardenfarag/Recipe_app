// PIN-26 appliances eval (ADR 017 decision 7). Runs the production appliances task on hand-labelled
// Hebrew and English recipes and scores it in code; no judge model.
//   npx -y deno run -A --no-lock --env-file=.env eval/cli.ts appliances [--runs=2] [--model=slug] [--only=he]
// Writes eval/results/appliances.md (in git) and one JSON per call under eval/results/raw/appliances/.

import type { RecipeAppliance } from '../supabase/functions/_shared/appliances.ts';
import { setEvalHook } from '../supabase/functions/_shared/llmClient.ts';
import { deriveRecipeAppliances } from '../supabase/functions/_shared/recipeAppliances.ts';

export type ExpectedAppliance = { any_of: string[]; required: boolean | 'either' };

export type ApplianceCase = {
  id: string;
  lang: 'en' | 'he';
  title: string;
  ingredients: string[];
  steps: string[];
  expect: ExpectedAppliance[];
  also_ok: string[];
  tips_ok: string[];
};

export type CaseScore = {
  /** Source items that match an expected entry. */
  truePositives: number;
  /** Source items that match nothing expected and are not in also_ok. */
  falsePositives: string[];
  /** Expected entries no item matched. */
  missed: string[];
  /** Matched entries whose required/optional reading was checkable (not "either"). */
  requiredChecked: number;
  requiredCorrect: number;
  tipsKept: string[];
  /** Kept tips not in tips_ok: Yarden's target is zero. */
  tipsThatDontFit: string[];
  /** The task returned null ("not analysed"). */
  notAnalysed: boolean;
};

/** Scores one answer against its labels. Pure, so it is unit-tested in appliances_test.ts. */
export function scoreCase(testCase: ApplianceCase, appliances: RecipeAppliance[] | null): CaseScore {
  const score: CaseScore = {
    truePositives: 0,
    falsePositives: [],
    missed: [],
    requiredChecked: 0,
    requiredCorrect: 0,
    tipsKept: [],
    tipsThatDontFit: [],
    notAnalysed: appliances === null,
  };
  const items = appliances ?? [];
  const matched = new Set<number>();

  for (const item of items) {
    if (item.origin === 'tip') {
      score.tipsKept.push(item.key);
      if (!testCase.tips_ok.includes(item.key)) score.tipsThatDontFit.push(item.key);
      continue;
    }
    const index = testCase.expect.findIndex((e, i) => !matched.has(i) && e.any_of.includes(item.key));
    if (index === -1) {
      if (!testCase.also_ok.includes(item.key)) score.falsePositives.push(item.key);
      continue;
    }
    matched.add(index);
    score.truePositives += 1;
    const expected = testCase.expect[index].required;
    if (expected !== 'either') {
      score.requiredChecked += 1;
      if (item.required === expected) score.requiredCorrect += 1;
    }
  }
  testCase.expect.forEach((e, i) => {
    if (!matched.has(i)) score.missed.push(e.any_of.join('|'));
  });
  return score;
}

export type Totals = {
  cases: number;
  precision: number;
  recall: number;
  requiredAccuracy: number;
  tipsKept: number;
  tipsThatDontFit: number;
  notAnalysed: number;
};

export function totals(scores: Array<{ testCase: ApplianceCase; score: CaseScore }>): Totals {
  let tp = 0;
  let fp = 0;
  let expected = 0;
  let reqChecked = 0;
  let reqCorrect = 0;
  let tips = 0;
  let badTips = 0;
  let notAnalysed = 0;
  for (const { testCase, score } of scores) {
    tp += score.truePositives;
    fp += score.falsePositives.length;
    expected += testCase.expect.length;
    reqChecked += score.requiredChecked;
    reqCorrect += score.requiredCorrect;
    tips += score.tipsKept.length;
    badTips += score.tipsThatDontFit.length;
    if (score.notAnalysed) notAnalysed += 1;
  }
  return {
    cases: scores.length,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: expected === 0 ? 1 : tp / expected,
    requiredAccuracy: reqChecked === 0 ? 1 : reqCorrect / reqChecked,
    tipsKept: tips,
    tipsThatDontFit: badTips,
    notAnalysed,
  };
}

export const TARGETS = { precision: 0.95, recall: 0.85, requiredAccuracy: 0.9, tipsThatDontFit: 0 };

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function flag(ok: boolean): string {
  return ok ? '✅' : '❌';
}

function toRecipe(testCase: ApplianceCase) {
  return {
    title: testCase.title,
    ingredients: testCase.ingredients.map((name) => ({ name })),
    instructions: testCase.steps.map((text, i) => ({ step: i + 1, text })),
  };
}

function describe(items: RecipeAppliance[] | null): string {
  if (items === null) return '_not analysed_';
  if (items.length === 0) return '_none_';
  return items
    .map((a) => `${a.origin === 'tip' ? '💡' : ''}${a.key}${a.required ? '' : '?'}@${a.steps.join(',')}`)
    .join(' ');
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function appliancesCommand(args: string[]): Promise<void> {
  const flags = Object.fromEntries(args.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const runs = Math.max(1, Number(flags.runs ?? 1));
  const only = flags.only as string | undefined;
  const model = flags.model as string | undefined;
  if (model) setEvalHook({ model: () => model });

  const file = JSON.parse(await Deno.readTextFile(new URL('./cases/appliances.json', import.meta.url)));
  const cases = (file.cases as ApplianceCase[]).filter((c) => !only || c.lang === only || c.id.includes(only));
  const rawDir = new URL('./results/raw/appliances/', import.meta.url);
  await Deno.mkdir(rawDir, { recursive: true });

  const perRun: Array<Array<{ testCase: ApplianceCase; score: CaseScore; appliances: RecipeAppliance[] | null; ms: number; cost: number }>> = [];
  for (let run = 1; run <= runs; run += 1) {
    console.log(`run ${run}/${runs}: ${cases.length} cases`);
    perRun.push(
      await mapLimit(cases, 4, async (testCase) => {
        const started = Date.now();
        const result = await deriveRecipeAppliances(toRecipe(testCase), { tipsEnabled: true });
        const ms = Date.now() - started;
        const cost = result.usages.reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
        await Deno.writeTextFile(
          new URL(`${testCase.id}.run${run}.json`, rawDir),
          JSON.stringify({ testCase: testCase.id, model: model ?? 'production default', result, ms, cost }, null, 2),
        );
        return { testCase, score: scoreCase(testCase, result.appliances), appliances: result.appliances, ms, cost };
      }),
    );
  }

  const all = perRun.flat();
  const t = totals(all);
  const byLang = (lang: string) => totals(all.filter((r) => r.testCase.lang === lang));
  const cost = all.reduce((sum, r) => sum + r.cost, 0);
  const ms = all.map((r) => r.ms).sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)] ?? 0;
  const unstable = cases.filter((c) => {
    const answers = perRun.map((r) => describe(r.find((x) => x.testCase.id === c.id)?.appliances ?? null));
    return new Set(answers).size > 1;
  });

  const row = (name: string, x: Totals) =>
    `| ${name} | ${x.cases} | ${pct(x.precision)} ${flag(x.precision >= TARGETS.precision)} | ${pct(x.recall)} ${flag(x.recall >= TARGETS.recall)} | ${pct(x.requiredAccuracy)} ${flag(x.requiredAccuracy >= TARGETS.requiredAccuracy)} | ${x.tipsKept} | ${x.tipsThatDontFit} ${flag(x.tipsThatDontFit === 0)} | ${x.notAnalysed} |`;

  const lines = [
    '# Appliances eval (PIN-26)',
    '',
    `Run ${new Date().toISOString().slice(0, 16)}Z · model: ${model ?? 'production default (TASK_MODELS.appliances)'} · ${runs} run(s) × ${cases.length} cases · tips on · total cost $${cost.toFixed(4)} · median ${median} ms per recipe (incl. tip check)`,
    '',
    `Targets (ADR 017): precision ≥ ${pct(TARGETS.precision)}, recall ≥ ${pct(TARGETS.recall)}, required/optional ≥ ${pct(TARGETS.requiredAccuracy)}, tips that don't fit = 0.`,
    '',
    '| Set | Answers | Precision | Recall | Required/optional | Tips kept | Tips that don\'t fit | Not analysed |',
    '|---|---|---|---|---|---|---|---|',
    row('All', t),
    row('English', byLang('en')),
    row('Hebrew', byLang('he')),
    '',
    `Unstable across runs: ${runs > 1 ? (unstable.length ? unstable.map((c) => c.id).join(', ') : 'none') : 'n/a (single run)'}`,
    '',
    '## Per case (last run)',
    '',
    'Key: `key@steps`, `?` = optional, 💡 = Pinch tip.',
    '',
    '| Case | Answer | Missed | Wrong extras | Tips that don\'t fit |',
    '|---|---|---|---|---|',
    ...perRun[perRun.length - 1].map(
      (r) =>
        `| ${r.testCase.id} | ${describe(r.appliances)} | ${r.score.missed.join(', ') || '–'} | ${r.score.falsePositives.join(', ') || '–'} | ${r.score.tipsThatDontFit.join(', ') || '–'} |`,
    ),
    '',
  ];
  const out = new URL('./results/appliances.md', import.meta.url);
  await Deno.writeTextFile(out, lines.join('\n'));
  console.log(lines.slice(0, 12).join('\n'));
  console.log(`\nWrote ${out.pathname}`);
}
