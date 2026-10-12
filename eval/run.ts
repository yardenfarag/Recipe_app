// Calls the production task functions with one pinned model per call and
// stores every output under eval/results/raw/<task>/<model>/<case>.json.

import { AsyncLocalStorage } from 'node:async_hooks';

import { classifyContent } from '../supabase/functions/_shared/contentGate.ts';
import {
  beginTextExtraction,
  extractRecipeFromImage,
  normalizeGeminiRecipe,
  RECIPE_SCHEMA,
  VIDEO_SYSTEM_PROMPT,
  type GeminiRecipe,
} from '../supabase/functions/_shared/gemini.ts';
import type { GenerateGeminiJsonResult } from '../supabase/functions/_shared/geminiClient.ts';
import { EXTRACT_ROUTE_INSTRUCTIONS } from '../supabase/functions/_shared/jev.ts';
import { inventRecipeFromImage, inventRecipeWithLadder } from '../supabase/functions/_shared/inventRecipe.ts';
import { generateLlmJson, setEvalHook } from '../supabase/functions/_shared/llmClient.ts';
import { estimateGeminiCostUsd } from '../supabase/functions/_shared/pricing.ts';
import {
  translateRecipeWithGemini,
  type TranslateLanguageCode,
} from '../supabase/functions/_shared/translateRecipe.ts';
import { type ImageCase, imagePath, type PostCase, postPath, type PostSnapshot, videoPath } from './fetch.ts';
import {
  type GateCase,
  gateCaseLabel,
  labelPath,
  type PostLabel,
  postInput,
  ROUTES,
} from './label.ts';
import { chatJson, exists, fileBase64, jevDecide, mimeForPath, pool, readJson, RESULTS, ROOT, slug, writeJson } from './lib.ts';
import { type Task, TASK_MODELS } from './models.ts';

export type RunRecord = {
  task: Task;
  model: string;
  caseId: string;
  ok: boolean;
  error?: string;
  ms: number;
  costUsd: number;
  promptTokens: number;
  outputTokens: number;
  output?: unknown;
  /** Set when transient errors (429/5xx/timeouts) forced a retry. */
  attempts?: number;
  /** Model OpenRouter actually served (dated snapshot). */
  servedModel?: string;
};

export const rawPath = (task: string, model: string, caseId: string) =>
  `${RESULTS}raw/${task}/${slug(model)}/${caseId}.json`;

type CallStore = { model: string; reasoning: string | null; results: GenerateGeminiJsonResult<unknown>[] };
const calls = new AsyncLocalStorage<CallStore>();
setEvalHook({
  model: () => calls.getStore()?.model ?? null,
  reasoning: () => calls.getStore()?.reasoning ?? null,
  // Azure's content filter truncates Sonnet 5.5 mid-JSON (finish_reason content_filter, 12 Oct).
  ignoreProviders: () => (calls.getStore()?.model.startsWith('anthropic/') ? ['azure'] : null),
  onResult: (result) => calls.getStore()?.results.push(result),
});

const log = console.log.bind(console);

/** `vendor/model@low` pins a reasoning effort. */
export function parseModel(spec: string): { model: string; reasoning: string | null } {
  const [model, reasoning] = spec.split('@');
  return { model, reasoning: reasoning ?? null };
}

const TRANSIENT = /status=(429|5\d\d)|timedOut=true/;

type Case = { id: string; run: () => Promise<unknown> };

const TRANSLATE_TARGETS: TranslateLanguageCode[] = ['he', 'ar', 'ru'];

async function image(id: string) {
  const path = imagePath(id);
  return { imageBase64: await fileBase64(path), mimeType: await mimeForPath(path) };
}

async function posts(task: string): Promise<PostCase[]> {
  return (await readJson<PostCase[]>(`${ROOT}cases/posts.json`)).filter((p) => p.tasks?.includes(task));
}

async function buildCases(task: Task, model: string): Promise<Case[]> {
  switch (task) {
    case 'text':
      return (await posts('text')).map((p) => ({
        id: p.id,
        run: async () => {
          const snap = await readJson<PostSnapshot>(postPath(p.id));
          const pending = beginTextExtraction(postInput(snap));
          if (!pending) throw new Error('post has no text');
          const res = await pending;
          if (!res.ok) throw res.error;
          return res.result.recipe;
        },
      }));
    case 'photo':
      return (await readJson<ImageCase[]>(`${ROOT}cases/images.json`))
        .filter((i) => i.use === 'photo')
        .map((i) => ({
          id: i.id,
          run: async () => (await extractRecipeFromImage(await image(i.id))).recipe,
        }));
    case 'translate': {
      const out: Case[] = [];
      for (const p of await posts('translate')) {
        for (const lang of TRANSLATE_TARGETS) {
          out.push({
            id: `${p.id}--${lang}`,
            run: async () => {
              const { reference } = await readJson<PostLabel>(labelPath(p.id));
              const { usage: _usage, ...translated } = await translateRecipeWithGemini({
                targetLanguage: lang,
                title: reference.title,
                ingredients: reference.ingredients,
                instructions: reference.instructions.map((text, i) => ({ step: i + 1, text })),
              });
              return translated;
            },
          });
        }
      }
      return out;
    }
    case 'invent': {
      const cases = await readJson<
        { id: string; image?: string; post?: string; text?: string; language: string }[]
      >(`${ROOT}cases/invent.json`);
      return cases.map((c) => ({
        id: c.id,
        run: async () => {
          if (c.image) {
            return (await inventRecipeFromImage({ ...(await image(c.image)), language: c.language })).recipe;
          }
          const snap = c.post ? await readJson<PostSnapshot>(postPath(c.post)) : null;
          // platform 'web' keeps the ladder on its text-only rung.
          const res = await inventRecipeWithLadder(
            {
              platform: 'web',
              sourceUrl: snap?.url ?? '',
              description: snap?.meta.description ?? c.text,
              captions: snap?.meta.captions,
              topComments: snap?.meta.topComments ?? [],
            },
            c.language,
          );
          return res.recipe;
        },
      }));
    }
    case 'content_gate':
      return (await readJson<ImageCase[]>(`${ROOT}cases/images.json`))
        .filter((i) => i.use === 'gate')
        .map((i) => ({
          id: i.id,
          run: async () => {
            const { kind, dishGuess } = await classifyContent(await image(i.id));
            return { kind, dishGuess };
          },
        }));
    case 'video':
      return (await posts('video')).map((p) => ({
        id: p.id,
        run: async () => {
          // Video only, no caption or comments: this measures what the model gets from the clip.
          const { data } = await generateLlmJson<GeminiRecipe>({
            tier: 'standard',
            systemPrompt: VIDEO_SYSTEM_PROMPT,
            parts: [
              { imageBase64: await fileBase64(videoPath(p.id)), mimeType: 'video/mp4' },
              { text: 'Extract the recipe from this video. There is no text context.' },
            ],
            responseSchema: RECIPE_SCHEMA,
            timeoutMs: 180_000,
            maxOutputTokens: 6_144,
            kind: 'video',
            context: 'eval: video',
          });
          return normalizeGeminiRecipe(data);
        },
      }));
    case 'extract_gate': {
      const gates = await readJson<GateCase[]>(`${ROOT}cases/gate.json`);
      return gates.map((g) => ({
        id: g.id,
        run: async () => {
          const label = await gateCaseLabel(g);
          const { model: id } = parseModel(model);
          return id.startsWith('jev:') ? jevRoute(id, label.text) : chatRoute(id, label.text);
        },
      }));
    }
  }
}

const ROUTE_INSTRUCTIONS = EXTRACT_ROUTE_INSTRUCTIONS;

// Jev and chat results don't pass through generateLlmJson, so they report cost themselves.
type DirectResult = { output: unknown; ms: number; costUsd: number; servedModel: string };

async function jevRoute(model: string, text: string): Promise<DirectResult> {
  const res = await jevDecide({
    model: model.slice('jev:'.length),
    state: { post_text: text },
    questions: { route: { type: 'choice', instructions: ROUTE_INSTRUCTIONS, criteria: { ...ROUTES } } },
  });
  const route = res.answers.route ?? {};
  return {
    output: { route: route.choice, confidence: route.confidence, probabilities: route.probabilities },
    ms: res.ms,
    costUsd: res.costUsd,
    servedModel: res.model,
  };
}

async function chatRoute(model: string, text: string): Promise<DirectResult> {
  const res = await chatJson<{ route: string }>({
    model,
    system: `${ROUTE_INSTRUCTIONS}\n\nroute:\n${Object.entries(ROUTES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    content: text,
    schema: {
      type: 'object',
      properties: { route: { type: 'string', enum: Object.keys(ROUTES) } },
      required: ['route'],
    },
    name: 'route',
    reasoning: 'none',
    maxTokens: 64,
  });
  return { output: res.data, ms: res.ms, costUsd: res.costUsd, servedModel: model };
}

function isDirect(value: unknown): value is DirectResult {
  return Boolean(value && typeof value === 'object' && 'servedModel' in value && 'costUsd' in value);
}

async function runOne(task: Task, model: string, c: Case): Promise<RunRecord> {
  let store: CallStore;
  let started: number;
  let output: unknown;
  let error: string | undefined;
  let attempts = 0;
  do {
    attempts++;
    if (attempts > 1) await new Promise((r) => setTimeout(r, 5000 * attempts));
    store = { ...parseModel(model), results: [] };
    started = Date.now();
    output = undefined;
    error = undefined;
    try {
      output = await calls.run(store, c.run);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } while (error && TRANSIENT.test(error) && attempts < 5);
  const record: RunRecord = {
    task,
    model,
    caseId: c.id,
    ok: !error,
    ...(error ? { error } : {}),
    ms: Date.now() - started,
    costUsd: 0,
    promptTokens: 0,
    outputTokens: 0,
    ...(attempts > 1 ? { attempts } : {}),
  };
  if (isDirect(output)) {
    Object.assign(record, { output: output.output, ms: output.ms, costUsd: output.costUsd, servedModel: output.servedModel });
    return record;
  }
  record.output = output;
  if (store.results.length > 0) {
    // Model time only: the wall clock above also covers reading cached inputs.
    record.ms = store.results.reduce((sum, r) => sum + r.durationMs, 0);
    record.servedModel = store.results.at(-1)!.model;
  }
  for (const r of store.results) {
    record.promptTokens += r.usage.promptTokenCount;
    record.outputTokens += r.usage.candidatesTokenCount + r.usage.thoughtsTokenCount;
    record.costUsd += r.costUsd ?? estimateGeminiCostUsd(r.usage);
  }
  return record;
}

export async function runCommand(args: string[]) {
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const tasks = (flag('task')?.split(',') ?? Object.keys(TASK_MODELS)) as Task[];
  const onlyModels = flag('models')?.split(',');
  const limit = Number(flag('limit') ?? Infinity);
  const concurrency = Number(flag('concurrency') ?? 6);
  const force = args.includes('--force');
  // Production code logs every call; keep the eval output readable.
  console.log = () => {};
  console.error = () => {};

  for (const task of tasks) {
    const models = TASK_MODELS[task].filter((m) => !onlyModels || onlyModels.includes(m));
    const jobs: { model: string; c: Case }[] = [];
    for (const model of models) {
      for (const c of (await buildCases(task, model)).slice(0, limit)) {
        if (!force && (await exists(rawPath(task, model, c.id)))) continue;
        jobs.push({ model, c });
      }
    }
    log(`[${task}] ${jobs.length} calls across ${models.length} models`);
    await pool(jobs, concurrency, async ({ model, c }) => {
      const record = await runOne(task, model, c);
      await writeJson(rawPath(task, model, c.id), record);
      const status = record.ok ? '✓' : `✗ ${record.error?.slice(0, 160)}`;
      log(`  ${model} ${c.id} ${(record.ms / 1000).toFixed(1)}s $${record.costUsd.toFixed(5)} ${status}`);
    });
  }
}
