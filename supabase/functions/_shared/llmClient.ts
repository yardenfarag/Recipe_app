/**
 * One door to every LLM call: OpenRouter chat completions with a JSON schema.
 *
 * Each task `kind` has its own primary model, fallback list and reasoning
 * effort (TASK_MODELS). OpenRouter runs the fallbacks server-side via
 * `models[]`. Video goes through OpenRouter too, as a YouTube URL or a
 * base64 clip (ADR 015). There is no direct Gemini path any more.
 */

import { AppError, FetchError } from './errors.ts';
import { parseLlmJsonText } from './llmJson.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type LlmPart =
  | { text: string }
  /** A URL the provider fetches itself. Only YouTube URLs work on OpenRouter. */
  | { fileData: { fileUri: string } }
  /** Inline image or video (mimeType video/* becomes a video_url data URL). */
  | { imageBase64: string; mimeType?: string };

/** @deprecated Name kept for import stability; same shape as LlmPart. */
export type GeminiPart = LlmPart;

export type ReasoningEffort = 'none' | 'low' | 'medium';

/** Every `kind` that calls generateLlmJson. Keep in sync with TASK_MODELS. */
export type LlmTaskKind =
  | 'text'
  | 'video'
  | 'photo'
  | 'repair'
  | 'invent_text'
  | 'invent_photo'
  | 'invent_video'
  | 'translate'
  | 'transform'
  | 'substitution'
  | 'fridge_match'
  | 'content_gate'
  | 'remix_related'
  | 'appliances';

export interface TaskModelConfig {
  model: string;
  /** Tried by OpenRouter, in order, when `model` fails. Every slug must be live. */
  fallbacks: string[];
  /** Sonnet 5.5 and GPT-6.1 Sol reject `none` ("Reasoning is mandatory"). */
  reasoning: ReasoningEffort;
}

const LUNA = 'openai/gpt-6-luna';
const SOL = 'openai/gpt-6.1-sol';
const SONNET = 'anthropic/claude-sonnet-5.5';
const QWEN_FLASH = 'qwen/qwen3.8-flash';
const QWEN_OMNI = 'qwen/qwen3.8-omni-flash';
const MISTRAL_SMALL = 'mistralai/mistral-small-2603';
const NANO = 'openai/gpt-5.4-nano';
const GEMINI_FLASH = 'google/gemini-3.5-flash';

/**
 * Picks from the PIN-44 eval (docs/research/05-llm-per-task.md, "Final model
 * per task"). Remix, substitution, fridge match and repair were not in the
 * eval; they follow the closest tested task.
 */
export const TASK_MODELS: Record<LlmTaskKind, TaskModelConfig> = {
  text: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  transform: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  substitution: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  fridge_match: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  remix_related: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  // Classification over the final recipe text (ADR 017). Not in the PIN-44 eval; follows text.
  appliances: { model: LUNA, fallbacks: [QWEN_FLASH], reasoning: 'none' },
  photo: { model: SONNET, fallbacks: [SOL], reasoning: 'low' },
  repair: { model: SONNET, fallbacks: [SOL], reasoning: 'low' },
  invent_photo: { model: SONNET, fallbacks: [SOL], reasoning: 'low' },
  translate: { model: SOL, fallbacks: [LUNA], reasoning: 'low' },
  invent_text: { model: SOL, fallbacks: [LUNA], reasoning: 'low' },
  content_gate: { model: MISTRAL_SMALL, fallbacks: [NANO], reasoning: 'none' },
  video: { model: GEMINI_FLASH, fallbacks: [QWEN_OMNI], reasoning: 'low' },
  invent_video: { model: GEMINI_FLASH, fallbacks: [QWEN_OMNI], reasoning: 'low' },
};

/** Models that must not reach a given OpenRouter provider. */
const PROVIDER_IGNORE: Array<{ test: (model: string) => boolean; ignore: string[] }> = [
  // Azure's content filter cuts Sonnet 5.5 off mid-JSON (finish_reason content_filter, 12 Oct 2026).
  { test: (m) => m.startsWith('anthropic/'), ignore: ['azure'] },
];

export interface GenerateLlmJsonOptions {
  /** Picks the row in TASK_MODELS. Unknown kinds fall back via `tier`. */
  kind: string;
  /** @deprecated Only used when `kind` is not in TASK_MODELS: fast → text, standard → photo. */
  tier?: 'fast' | 'standard';
  /** Pin a model for this one call (tests / special cases). Fallbacks still apply. */
  model?: string;
  systemPrompt: string;
  parts: LlmPart[];
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Error context prefix, e.g. "translateRecipe.ts: translateRecipeWithGemini". */
  context: string;
}

/** @deprecated Name kept for import stability. */
export type GenerateGeminiJsonOptions = GenerateLlmJsonOptions;

export interface GenerateLlmJsonResult<T> {
  data: T;
  usage: GeminiUsageSnapshot;
  model: string;
  durationMs: number;
  /** USD cost reported by OpenRouter (`usage.cost`). */
  costUsd?: number;
}

/** @deprecated Name kept for import stability. */
export type GenerateGeminiJsonResult<T> = GenerateLlmJsonResult<T>;

/**
 * Eval-only (eval/run.ts): pin each call to one model with no fallbacks, so a
 * result belongs to exactly that model. Never set in Edge Functions.
 */
export type LlmEvalHook = {
  model: () => string | null;
  /** Overrides the task's reasoning effort. */
  reasoning?: () => string | null;
  /** Extra OpenRouter provider slugs to skip (`provider.ignore`). */
  ignoreProviders?: () => string[] | null;
  onResult?: (result: GenerateLlmJsonResult<unknown>) => void;
};

let evalHook: LlmEvalHook | null = null;

export function setEvalHook(hook: LlmEvalHook | null): void {
  evalHook = hook;
}

function evalModel(): string | null {
  return evalHook?.model() ?? null;
}

export function resolveOpenRouterApiKey(): string | undefined {
  const key =
    Deno.env.get('OPENROUTER_API_KEY')?.trim() ||
    Deno.env.get('OPEN_ROUTER_API_KEY')?.trim();
  return key || undefined;
}

function isTaskKind(kind: string): kind is LlmTaskKind {
  return Object.prototype.hasOwnProperty.call(TASK_MODELS, kind);
}

function envKeyFor(kind: string): string {
  return kind.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function splitModels(raw: string | undefined): string[] | null {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : null;
}

/**
 * Model config for a task, after env overrides:
 * `OPENROUTER_MODEL_<KIND>` (primary), `OPENROUTER_FALLBACKS_<KIND>` (comma
 * list, `none` to disable) and `OPENROUTER_REASONING_<KIND>`.
 */
export function resolveTaskModel(kind: string, tier?: 'fast' | 'standard'): TaskModelConfig {
  let base: TaskModelConfig;
  if (isTaskKind(kind)) {
    base = TASK_MODELS[kind];
  } else {
    console.warn('[llm] unknown kind, using tier default', { kind, tier: tier ?? 'standard' });
    base = tier === 'fast' ? TASK_MODELS.text : TASK_MODELS.photo;
  }
  const suffix = envKeyFor(kind);
  const model = Deno.env.get(`OPENROUTER_MODEL_${suffix}`)?.trim() || base.model;
  const rawFallbacks = Deno.env.get(`OPENROUTER_FALLBACKS_${suffix}`)?.trim();
  const fallbacks =
    rawFallbacks?.toLowerCase() === 'none'
      ? []
      : (splitModels(rawFallbacks) ?? base.fallbacks).filter((m) => m !== model);
  const rawReasoning = Deno.env.get(`OPENROUTER_REASONING_${suffix}`)?.trim().toLowerCase();
  const reasoning: ReasoningEffort =
    rawReasoning === 'none' || rawReasoning === 'low' || rawReasoning === 'medium'
      ? rawReasoning
      : base.reasoning;
  return { model, fallbacks, reasoning };
}

/** Every slug the defaults can send to OpenRouter. The live-slug test checks these. */
export function defaultModelSlugs(): string[] {
  const slugs = new Set<string>();
  for (const config of Object.values(TASK_MODELS)) {
    slugs.add(config.model);
    config.fallbacks.forEach((m) => slugs.add(m));
  }
  return [...slugs].sort();
}

function providerIgnoreFor(models: string[]): string[] {
  const ignore = new Set<string>();
  for (const model of models) {
    for (const rule of PROVIDER_IGNORE) {
      if (rule.test(model)) rule.ignore.forEach((p) => ignore.add(p));
    }
  }
  evalHook?.ignoreProviders?.()?.forEach((p) => ignore.add(p));
  return [...ignore];
}

function schemaName(kind: string): string {
  const cleaned = kind.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || 'result';
}

export function partsToOpenRouterContent(
  parts: LlmPart[],
): string | Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if ('text' in part) {
      content.push({ type: 'text', text: part.text });
    } else if ('imageBase64' in part) {
      const mime = part.mimeType?.trim() || 'image/jpeg';
      const url = `data:${mime};base64,${part.imageBase64}`;
      content.push(
        mime.startsWith('video/')
          ? { type: 'video_url', video_url: { url } }
          : { type: 'image_url', image_url: { url } },
      );
    } else if ('fileData' in part) {
      content.push({ type: 'video_url', video_url: { url: part.fileData.fileUri } });
    }
  }
  if (content.length === 1 && content[0].type === 'text') {
    return String(content[0].text);
  }
  return content;
}

/**
 * Qwen wraps the object in a one-element array on most video answers. When
 * the schema asks for an object, take the first object inside the array.
 */
export function unwrapTopLevelArray<T>(data: unknown, schema: Record<string, unknown>): T {
  if (Array.isArray(data) && schema.type === 'object') {
    const first = data.find((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (first) return first as T;
  }
  return data as T;
}

function contentToText(rawContent: unknown): string {
  if (typeof rawContent === 'string') return parseLlmJsonText(rawContent);
  if (Array.isArray(rawContent)) {
    return parseLlmJsonText(
      rawContent
        .map((part) =>
          part && typeof part === 'object' && 'text' in part
            ? String((part as { text?: string }).text ?? '')
            : '',
        )
        .join(''),
    );
  }
  return '';
}

export async function generateOpenRouterJson<T>(
  options: GenerateLlmJsonOptions,
  apiKey: string,
): Promise<GenerateLlmJsonResult<T>> {
  const task = resolveTaskModel(options.kind, options.tier);
  const pinned = evalModel();
  const model = pinned ?? options.model ?? task.model;
  const fallbacks = pinned ? [] : task.fallbacks.filter((m) => m !== model);
  const reasoning = evalHook?.reasoning?.() ?? task.reasoning;
  const ignore = providerIgnoreFor([model, ...fallbacks]);
  const userContent = partsToOpenRouterContent(options.parts);

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: options.maxOutputTokens,
    reasoning: { effort: reasoning },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName(options.kind),
        strict: false,
        schema: options.responseSchema,
      },
    },
    provider: {
      allow_fallbacks: true,
      data_collection: 'deny',
      // Skip hosts that would silently ignore response_format.
      require_parameters: true,
      ...(ignore.length > 0 ? { ignore } : {}),
    },
  };
  if (fallbacks.length > 0) {
    body.models = fallbacks;
  }

  const hasImage = options.parts.some(
    (p) => 'imageBase64' in p && !(p.mimeType ?? '').startsWith('video/'),
  );
  const hasVideo = options.parts.some(
    (p) => 'fileData' in p || ('imageBase64' in p && (p.mimeType ?? '').startsWith('video/')),
  );
  console.log('[openrouter] start', {
    model,
    fallbacks,
    reasoning,
    ignore,
    kind: options.kind,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens,
    hasImage,
    hasVideo,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pinch-app.io',
        'X-Title': 'Pinch',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[openrouter] fetch failed', {
      model,
      kind: options.kind,
      ms: Date.now() - started,
      timedOut: isTimeout,
    });
    throw new FetchError(options.context, 'OpenRouter request failed', {
      timedOut: isTimeout,
      timeoutMs: options.timeoutMs,
      model,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - started;
  console.log('[openrouter] response', {
    model,
    kind: options.kind,
    ms: durationMs,
    status: res.status,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new FetchError(options.context, 'OpenRouter API returned an error', {
      status: res.status,
      body: errText.slice(0, 800),
      model,
    });
  }

  const payload = (await res.json()) as {
    model?: string;
    provider?: string;
    choices?: { message?: { content?: unknown }; finish_reason?: string; native_finish_reason?: string }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const usedModel = typeof payload.model === 'string' && payload.model.trim()
    ? payload.model.trim()
    : model;
  const choice = payload.choices?.[0];
  const jsonText = contentToText(choice?.message?.content);

  if (!jsonText) {
    // A refusal or content filter shows up here, not as an HTTP error.
    console.error('[openrouter] empty content', {
      model: usedModel,
      provider: payload.provider,
      kind: options.kind,
      finishReason: choice?.finish_reason,
      nativeFinishReason: choice?.native_finish_reason,
    });
    throw new AppError(options.context, 'OpenRouter returned no content', {
      model: usedModel,
      finishReason: choice?.finish_reason ?? 'unknown',
    });
  }

  let data: T;
  try {
    data = unwrapTopLevelArray<T>(JSON.parse(jsonText), options.responseSchema);
  } catch {
    console.error('[openrouter] invalid JSON', {
      model: usedModel,
      kind: options.kind,
      finishReason: choice?.finish_reason,
      head: jsonText.slice(0, 120),
    });
    throw new AppError(options.context, 'OpenRouter returned invalid JSON', { model: usedModel });
  }

  const promptTokenCount = Number(payload.usage?.prompt_tokens ?? 0) || 0;
  const candidatesTokenCount = Number(payload.usage?.completion_tokens ?? 0) || 0;
  const thoughtsTokenCount =
    Number(payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0) || 0;
  const costUsd = Number(payload.usage?.cost);
  const usage: GeminiUsageSnapshot = {
    model: usedModel,
    kind: options.kind,
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount,
    totalTokenCount:
      Number(payload.usage?.total_tokens ?? 0) ||
      promptTokenCount + candidatesTokenCount,
    ...(Number.isFinite(costUsd) ? { costUsd } : {}),
  };

  return {
    data,
    usage,
    model: usedModel,
    durationMs,
    ...(Number.isFinite(costUsd) ? { costUsd } : {}),
  };
}

/** Calls OpenRouter with the task's model and fallbacks. */
export async function generateLlmJson<T>(
  options: GenerateLlmJsonOptions,
): Promise<GenerateLlmJsonResult<T>> {
  const openRouterKey = resolveOpenRouterApiKey();
  if (!openRouterKey) {
    throw new AppError(options.context, 'OPENROUTER_API_KEY is not configured');
  }
  const result = await generateOpenRouterJson<T>(options, openRouterKey);
  evalHook?.onResult?.(result);
  return result;
}

/** Models occasionally emit U+0000 inside accented words under structured output. */
export function sanitizeGeminiText(value: string): string {
  return value.replace(/\u0000/g, '');
}
