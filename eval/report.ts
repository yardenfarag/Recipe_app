// Aggregates raw runs and judge verdicts into eval/results/summary.md.

import type { ImageCase } from './fetch.ts';
import { hasRecipeShape, matchPath, type MatchVerdict, type RankFile, rankPath } from './judge.ts';
import { type GateCase, gateCaseLabel, labelPath, type PostLabel } from './label.ts';
import { percentile, readJson, readJsonOr, RESULTS, ROOT, slug, writeJson } from './lib.ts';
import { MATCH_JUDGE, RANK_JUDGE, type Task, TASK_MODELS } from './models.ts';
import type { RunRecord } from './run.ts';

type Row = Record<string, string | number | null>;

async function records(task: Task, model: string): Promise<RunRecord[]> {
  const dir = `${RESULTS}raw/${task}/${slug(model)}`;
  const out: RunRecord[] = [];
  try {
    for await (const e of Deno.readDir(dir)) {
      if (e.name.endsWith('.json')) out.push(await readJson<RunRecord>(`${dir}/${e.name}`));
    }
  } catch {
    // task not run
  }
  return out.sort((a, b) => a.caseId.localeCompare(b.caseId));
}

const pct = (n: number, d: number) => (d === 0 ? null : `${Math.round((100 * n) / d)}%`);
const sec = (ms: number | null) => (ms == null ? null : `${(ms / 1000).toFixed(1)} s`);
const usd = (v: number) => (v < 0.001 ? `$${v.toFixed(5)}` : `$${v.toFixed(4)}`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v: number | null, digits = 2) => (v == null ? null : v.toFixed(digits));

function base(model: string, rs: RunRecord[], schemaOk: (r: RunRecord) => boolean): Row {
  const ok = rs.filter((r) => r.ok);
  const valid = ok.filter(schemaOk);
  const ms = ok.map((r) => r.ms);
  return {
    model,
    n: rs.length,
    'call errors': rs.length - ok.length,
    'schema ok': pct(valid.length, rs.length),
    p50: sec(percentile(ms, 50)),
    p95: sec(percentile(ms, 95)),
    '$/call': ok.length ? usd(avg(ok.map((r) => r.costUsd))!) : null,
  };
}

async function matchRows(task: 'text' | 'photo' | 'video', langFilter?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const model of TASK_MODELS[task]) {
    let rs = await records(task, model);
    if (langFilter) {
      const keep: RunRecord[] = [];
      for (const r of rs) {
        const label = await readJson<PostLabel>(labelPath(r.caseId));
        if (label.reference.source_language === langFilter) keep.push(r);
      }
      rs = keep;
    }
    let refTotal = 0, listed = 0, exact = 0, extras = 0, judged = 0;
    const steps: number[] = [];
    for (const r of rs) {
      const label = await readJson<PostLabel>(labelPath(r.caseId));
      refTotal += label.reference.ingredients.length;
      const v = await readJsonOr<MatchVerdict | null>(matchPath(task, model, r.caseId), null);
      if (!v) continue; // failed or unparseable output scores zero
      judged++;
      listed += v.ingredients.filter((i) => i.status !== 'missing').length;
      exact += v.ingredients.filter((i) => i.status === 'ok').length;
      extras += v.extra_ingredients.length;
      steps.push(v.steps_score);
    }
    rows.push({
      ...base(model, rs, (r) => hasRecipeShape(r.output)),
      'ingredient recall': pct(listed, refTotal),
      'amount accuracy': pct(exact, refTotal),
      'extra items/recipe': fmt(judged ? extras / judged : null, 1),
      'steps (1–5)': fmt(avg(steps), 1),
    });
  }
  return rows;
}

async function rankRows(task: 'translate' | 'invent', filter?: (caseId: string) => boolean): Promise<Row[]> {
  const ids = new Set<string>();
  for (const m of TASK_MODELS[task]) for (const r of await records(task, m)) ids.add(r.caseId);
  const stats = new Map<string, { acc: number[]; qual: number[]; rank: number[]; wins: number }>();
  for (const m of TASK_MODELS[task]) stats.set(m, { acc: [], qual: [], rank: [], wins: 0 });
  let ranked = 0;
  for (const id of ids) {
    if (filter && !filter(id)) continue;
    const file = await readJsonOr<RankFile | null>(rankPath(task, id), null);
    if (!file) continue;
    ranked++;
    for (const c of file.verdict.candidates) {
      const s = stats.get(file.letters[c.letter]);
      s?.acc.push(c.accuracy);
      s?.qual.push(c.quality);
    }
    file.verdict.ranking.forEach((letter, i) => {
      const s = stats.get(file.letters[letter]);
      s?.rank.push(i + 1);
      if (i === 0 && s) s.wins++;
    });
  }
  const rows: Row[] = [];
  for (const model of TASK_MODELS[task]) {
    const rs = (await records(task, model)).filter((r) => !filter || filter(r.caseId));
    const s = stats.get(model)!;
    rows.push({
      ...base(model, rs, (r) => hasRecipeShape(r.output)),
      'accuracy (1–5)': fmt(avg(s.acc), 2),
      'quality (1–5)': fmt(avg(s.qual), 2),
      'avg rank': fmt(avg(s.rank), 2),
      'ranked #1': pct(s.wins, ranked),
    });
  }
  return rows;
}

async function contentGateRows(): Promise<Row[]> {
  const images = await readJson<ImageCase[]>(`${ROOT}cases/images.json`);
  const truth = new Map(images.filter((i) => i.use === 'gate').map((i) => [i.id, i.food!]));
  const rows: Row[] = [];
  for (const model of TASK_MODELS.content_gate) {
    const rs = await records('content_gate', model);
    let correct = 0, falseReject = 0, falseAccept = 0;
    for (const r of rs) {
      const food = truth.get(r.caseId);
      const kind = (r.output as { kind?: string } | undefined)?.kind;
      if (!r.ok || !kind) continue;
      const accepted = kind !== 'unrelated';
      if (accepted === food) correct++;
      else if (food) falseReject++;
      else falseAccept++;
    }
    rows.push({
      ...base(model, rs, (r) => Boolean((r.output as { kind?: string })?.kind)),
      accuracy: pct(correct, rs.length),
      'food rejected': falseReject,
      'non-food let through': falseAccept,
    });
  }
  return rows;
}

async function extractGateRows(): Promise<Row[]> {
  const gates = await readJson<GateCase[]>(`${ROOT}cases/gate.json`);
  const labels = new Map<string, Awaited<ReturnType<typeof gateCaseLabel>>>();
  for (const g of gates) labels.set(g.id, await gateCaseLabel(g));
  const rows: Row[] = [];
  for (const model of TASK_MODELS.extract_gate) {
    const rs = await records('extract_gate', model);
    let correct = 0, heCorrect = 0, heTotal = 0, noRecipeOnRecipe = 0, skipTextOnFull = 0;
    for (const r of rs) {
      const label = labels.get(r.caseId)!;
      const route = (r.output as { route?: string } | undefined)?.route;
      const isRecipe = label.route === 'full_recipe_in_text' || label.route === 'partial';
      if (route === label.route) correct++;
      if (label.lang === 'he') {
        heTotal++;
        if (route === label.route) heCorrect++;
      }
      if (isRecipe && route === 'no_recipe') noRecipeOnRecipe++;
      if (label.route === 'full_recipe_in_text' && route === 'needs_video') skipTextOnFull++;
    }
    rows.push({
      ...base(model, rs, (r) => Boolean((r.output as { route?: string })?.route)),
      'route accuracy': pct(correct, rs.length),
      'Hebrew accuracy': pct(heCorrect, heTotal),
      'recipe → no_recipe': noRecipeOnRecipe,
      'full → needs_video': skipTextOnFull,
    });
  }
  return rows;
}

function table(rows: Row[]): string {
  if (rows.length === 0) return '_No results._\n';
  const cols = Object.keys(rows[0]);
  const lines = [
    `| ${cols.join(' | ')} |`,
    `| ${cols.map((c, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...rows.map((r) => `| ${cols.map((c) => (c === 'model' ? `\`${r[c]}\`` : r[c] ?? '—')).join(' | ')} |`),
  ];
  return `${lines.join('\n')}\n`;
}

export async function reportCommand() {
  const sections: [string, Row[]][] = [
    ['Text extract (20 posts)', await matchRows('text')],
    ['Text extract, Hebrew posts only', await matchRows('text', 'he')],
    ['Photo extract (10 cards, 3 handwritten)', await matchRows('photo')],
    ['Video extract, video only, no caption (15 Reels)', await matchRows('video')],
    ['Translate (15 recipes × he/ar/ru)', await rankRows('translate')],
    ['Translate, Hebrew only', await rankRows('translate', (id) => id.endsWith('--he'))],
    ['Invent (5 photos, 5 text)', await rankRows('invent')],
    ['Content gate (20 food, 10 not)', await contentGateRows()],
    ['Extract gate (30 posts, 10 Hebrew)', await extractGateRows()],
  ];
  let total = 0;
  for (const task of Object.keys(TASK_MODELS) as Task[]) {
    for (const m of TASK_MODELS[task]) for (const r of await records(task, m)) total += r.costUsd;
  }
  const md = [
    `# PIN-44 eval results`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`eval/cli.ts report\`. ` +
      `Ingredient matching by \`${MATCH_JUDGE}\`, blind ranking by \`${RANK_JUDGE}\`. ` +
      `Latency is model time per call; $/call is OpenRouter's reported cost (native Gemini estimated from tokens). ` +
      `Candidate spend for this run: ${usd(total)}.`,
    '',
    ...sections.flatMap(([title, rows]) => [`## ${title}`, '', table(rows)]),
  ].join('\n');
  await Deno.writeTextFile(`${RESULTS}summary.md`, md);
  await writeJson(`${RESULTS}summary.json`, Object.fromEntries(sections));
  console.log(md);
}
