/**
 * Aggregates `ai_usage_events` rows for the admin cost dashboard.
 *
 * Rows written since PIN-49 carry `metadata.llm_calls`: one entry per model
 * call, so an extract that ran a text call on one model and a video call on
 * another is split correctly. Older rows only have the row-level `model`,
 * token counts and `gemini_cost_usd` (the column name predates OpenRouter);
 * those count as one call on that model, with the action as the task kind.
 */

export interface LlmCallRecord {
  kind: string;
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cost_usd: number;
}

export interface AiCostRow {
  action: string;
  status: string;
  model: string | null;
  prompt_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  gemini_cost_usd: number;
  scrapecreators_cost_usd: number;
  total_cost_usd: number;
  duration_ms: number | null;
  llm_calls: LlmCallRecord[] | null;
  created_at: string;
  platform: string | null;
  /** The ladder step that produced the recipe: description, comments, captions, video, web, photo. */
  extraction_source: string | null;
  /** Logged since PIN-62; null on older rows. */
  video_downloaded: boolean | null;
  video_duration_seconds: number | null;
}

export interface ModelCostLine {
  model: string;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  avgCostUsd: number;
  /** Blended cost per 1M tokens (input + output + thinking). */
  usdPerMTokens: number;
  /** Share of all model cost in the window, 0..1. */
  costShare: number;
}

export interface TaskCostLine {
  kind: string;
  calls: number;
  /** Models used for this task, most calls first. */
  models: string[];
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
  avgCostUsd: number;
}

export interface ActionCostLine {
  action: string;
  events: number;
  failed: number;
  cached: number;
  modelCostUsd: number;
  scrapeCostUsd: number;
  totalCostUsd: number;
  avgCostUsd: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface AiCostSummary {
  events: number;
  llmCalls: number;
  modelCostUsd: number;
  scrapeCostUsd: number;
  totalCostUsd: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** Extracts and invents that returned a recipe (full or partial). */
  successfulRecipes: number;
  /** Total cost of the window divided by successful recipes; null when there are none. */
  costPerRecipeUsd: number | null;
  byModel: ModelCostLine[];
  byTask: TaskCostLine[];
  byAction: ActionCostLine[];
}

const FAILED = new Set(['failed', 'error']);
const RECIPE_ACTIONS = new Set(['extract', 'invent']);
const RECIPE_STATUSES = new Set(['full', 'partial']);

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Validates the JSON shape coming back from Postgres; drops malformed entries. */
export function parseLlmCalls(value: unknown): LlmCallRecord[] | null {
  if (!Array.isArray(value)) return null;
  const calls: LlmCallRecord[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.model !== 'string' || !e.model) continue;
    calls.push({
      kind: typeof e.kind === 'string' && e.kind ? e.kind : 'unknown',
      model: e.model,
      prompt_tokens: num(e.prompt_tokens),
      output_tokens: num(e.output_tokens),
      thinking_tokens: num(e.thinking_tokens),
      cost_usd: num(e.cost_usd),
    });
  }
  return calls;
}

/** The model calls a row stands for: its breakdown, or one legacy call, or none. */
export function callsForRow(row: AiCostRow): LlmCallRecord[] {
  if (row.llm_calls && row.llm_calls.length > 0) return row.llm_calls;
  const tokens = num(row.prompt_tokens) + num(row.output_tokens) + num(row.thinking_tokens);
  if (!row.model || (tokens === 0 && num(row.gemini_cost_usd) === 0)) return [];
  return [
    {
      kind: row.action,
      model: row.model,
      prompt_tokens: num(row.prompt_tokens),
      output_tokens: num(row.output_tokens),
      thinking_tokens: num(row.thinking_tokens),
      cost_usd: num(row.gemini_cost_usd),
    },
  ];
}

/** Nearest-rank percentile; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function summarizeAiCost(rows: AiCostRow[]): AiCostSummary {
  const models = new Map<string, Omit<ModelCostLine, 'avgCostUsd' | 'usdPerMTokens' | 'costShare'>>();
  const tasks = new Map<
    string,
    { calls: number; models: Map<string, number>; promptTokens: number; outputTokens: number; costUsd: number }
  >();
  const actions = new Map<
    string,
    { events: number; failed: number; cached: number; modelCostUsd: number; scrapeCostUsd: number; totalCostUsd: number; durations: number[] }
  >();

  let llmCalls = 0;
  let modelCostUsd = 0;
  let scrapeCostUsd = 0;
  let totalCostUsd = 0;
  let promptTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let successfulRecipes = 0;

  for (const row of rows) {
    const rowModelCost = num(row.gemini_cost_usd);
    const rowScrape = num(row.scrapecreators_cost_usd);
    const rowTotal = num(row.total_cost_usd);
    modelCostUsd += rowModelCost;
    scrapeCostUsd += rowScrape;
    totalCostUsd += rowTotal;
    if (RECIPE_ACTIONS.has(row.action) && RECIPE_STATUSES.has(row.status)) successfulRecipes += 1;

    const action = actions.get(row.action) ?? {
      events: 0,
      failed: 0,
      cached: 0,
      modelCostUsd: 0,
      scrapeCostUsd: 0,
      totalCostUsd: 0,
      durations: [],
    };
    action.events += 1;
    if (FAILED.has(row.status)) action.failed += 1;
    if (row.status === 'cached') action.cached += 1;
    action.modelCostUsd += rowModelCost;
    action.scrapeCostUsd += rowScrape;
    action.totalCostUsd += rowTotal;
    if (row.duration_ms != null && Number.isFinite(row.duration_ms)) action.durations.push(row.duration_ms);
    actions.set(row.action, action);

    for (const call of callsForRow(row)) {
      llmCalls += 1;
      promptTokens += call.prompt_tokens;
      outputTokens += call.output_tokens;
      thinkingTokens += call.thinking_tokens;

      const m = models.get(call.model) ?? {
        model: call.model,
        calls: 0,
        promptTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        costUsd: 0,
      };
      m.calls += 1;
      m.promptTokens += call.prompt_tokens;
      m.outputTokens += call.output_tokens;
      m.thinkingTokens += call.thinking_tokens;
      m.costUsd += call.cost_usd;
      models.set(call.model, m);

      const t = tasks.get(call.kind) ?? { calls: 0, models: new Map(), promptTokens: 0, outputTokens: 0, costUsd: 0 };
      t.calls += 1;
      t.models.set(call.model, (t.models.get(call.model) ?? 0) + 1);
      t.promptTokens += call.prompt_tokens;
      t.outputTokens += call.output_tokens + call.thinking_tokens;
      t.costUsd += call.cost_usd;
      tasks.set(call.kind, t);
    }
  }

  const modelCostTotal = [...models.values()].reduce((sum, m) => sum + m.costUsd, 0);
  const byModel: ModelCostLine[] = [...models.values()]
    .map((m) => {
      const tokens = m.promptTokens + m.outputTokens + m.thinkingTokens;
      return {
        ...m,
        avgCostUsd: m.calls > 0 ? m.costUsd / m.calls : 0,
        usdPerMTokens: tokens > 0 ? (m.costUsd / tokens) * 1_000_000 : 0,
        costShare: modelCostTotal > 0 ? m.costUsd / modelCostTotal : 0,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

  const byTask: TaskCostLine[] = [...tasks.entries()]
    .map(([kind, t]) => ({
      kind,
      calls: t.calls,
      models: [...t.models.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model),
      promptTokens: t.promptTokens,
      outputTokens: t.outputTokens,
      costUsd: t.costUsd,
      avgCostUsd: t.calls > 0 ? t.costUsd / t.calls : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

  const byAction: ActionCostLine[] = [...actions.entries()]
    .map(([name, a]) => ({
      action: name,
      events: a.events,
      failed: a.failed,
      cached: a.cached,
      modelCostUsd: a.modelCostUsd,
      scrapeCostUsd: a.scrapeCostUsd,
      totalCostUsd: a.totalCostUsd,
      avgCostUsd: a.events > 0 ? a.totalCostUsd / a.events : 0,
      p50Ms: percentile(a.durations, 50),
      p95Ms: percentile(a.durations, 95),
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd || b.events - a.events);

  return {
    events: rows.length,
    llmCalls,
    modelCostUsd,
    scrapeCostUsd,
    totalCostUsd,
    promptTokens,
    outputTokens,
    thinkingTokens,
    successfulRecipes,
    costPerRecipeUsd: successfulRecipes > 0 ? totalCostUsd / successfulRecipes : null,
    byModel,
    byTask,
    byAction,
  };
}

export interface ImportSourceLine {
  platform: string;
  source: string;
  imports: number;
  failed: number;
  costUsd: number;
  /** Cost of every attempt on this step divided by the recipes it produced. */
  costPerImportUsd: number | null;
  maxCostUsd: number;
}

export interface ImportSummary {
  /** Extracts that returned a recipe (full or partial), hub cache hits excluded. */
  imports: number;
  videoImports: number;
  /** Share of imports that needed the video step, 0..1; null when there are none. */
  videoShare: number | null;
  /** Imports that had to download the video file (the expensive Instagram path). */
  videoDownloads: number;
  /** All extract spend, failed attempts included, divided by imports. */
  blendedCostUsd: number | null;
  videoCostPerImportUsd: number | null;
  textCostPerImportUsd: number | null;
  videoDurationP50: number | null;
  videoDurationP95: number | null;
  bySource: ImportSourceLine[];
}

/**
 * PIN-62: how often an import falls back to the video step and what that does
 * to the cost per import. Cache hits are left out because they cost nothing.
 */
export function summarizeImports(rows: AiCostRow[]): ImportSummary {
  const sources = new Map<string, Omit<ImportSourceLine, 'costPerImportUsd'>>();
  let imports = 0;
  let videoImports = 0;
  let videoDownloads = 0;
  let totalCostUsd = 0;
  let videoCostUsd = 0;
  let textCostUsd = 0;
  const videoDurations: number[] = [];

  for (const row of rows) {
    if (row.action !== 'extract' || row.status === 'cached') continue;
    const cost = num(row.total_cost_usd);
    const ok = RECIPE_STATUSES.has(row.status);
    const isVideo = row.extraction_source === 'video';
    totalCostUsd += cost;
    if (isVideo) videoCostUsd += cost;
    else textCostUsd += cost;

    if (ok) {
      imports += 1;
      if (isVideo) {
        videoImports += 1;
        if (row.video_duration_seconds != null && Number.isFinite(row.video_duration_seconds)) {
          videoDurations.push(row.video_duration_seconds);
        }
      }
      if (row.video_downloaded) videoDownloads += 1;
    }

    const platform = row.platform ?? 'unknown';
    const source = row.extraction_source ?? 'none';
    const key = `${platform}:${source}`;
    const line = sources.get(key) ?? { platform, source, imports: 0, failed: 0, costUsd: 0, maxCostUsd: 0 };
    if (ok) line.imports += 1;
    else line.failed += 1;
    line.costUsd += cost;
    line.maxCostUsd = Math.max(line.maxCostUsd, cost);
    sources.set(key, line);
  }

  const textImports = imports - videoImports;
  return {
    imports,
    videoImports,
    videoShare: imports > 0 ? videoImports / imports : null,
    videoDownloads,
    blendedCostUsd: imports > 0 ? totalCostUsd / imports : null,
    videoCostPerImportUsd: videoImports > 0 ? videoCostUsd / videoImports : null,
    textCostPerImportUsd: textImports > 0 ? textCostUsd / textImports : null,
    videoDurationP50: percentile(videoDurations, 50),
    videoDurationP95: percentile(videoDurations, 95),
    bySource: [...sources.values()]
      .map((line) => ({ ...line, costPerImportUsd: line.imports > 0 ? line.costUsd / line.imports : null }))
      .sort((a, b) => b.costUsd - a.costUsd || b.imports - a.imports),
  };
}

/** `openai/gpt-6-luna` → `gpt-6-luna`; keeps unprefixed native names as they are. */
export function shortModelName(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

/** Compact token counts for tight table cells: 950, 12.3k, 4.1M. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Dollars with enough precision for sub-cent model calls. */
export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}
