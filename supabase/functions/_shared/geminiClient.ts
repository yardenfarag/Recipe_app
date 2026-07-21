/**
 * Shared Gemini generateContent helper.
 *
 * Tiering:
 * - `fast` → gemini-3.1-flash-lite (translate, swap, remix, text extract)
 * - `standard` → gemini-3.5-flash (video extract / hard multimodal)
 */

import { AppError, FetchError } from './errors.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

export type GeminiTier = 'fast' | 'standard';

export type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string } };

const DEFAULT_FAST_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash';

export function resolveGeminiModel(tier: GeminiTier = 'standard'): string {
  if (tier === 'fast') {
    return Deno.env.get('GEMINI_FAST_MODEL')?.trim() || DEFAULT_FAST_MODEL;
  }
  return Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_STANDARD_MODEL;
}

export interface GenerateGeminiJsonOptions {
  tier?: GeminiTier;
  /** Override resolved model (tests / special cases). */
  model?: string;
  systemPrompt: string;
  parts: GeminiPart[];
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
  maxOutputTokens: number;
  kind: string;
  /** Error context prefix, e.g. "translateRecipe.ts: translateRecipeWithGemini". */
  context: string;
}

export interface GenerateGeminiJsonResult<T> {
  data: T;
  usage: GeminiUsageSnapshot;
  model: string;
  durationMs: number;
}

export async function generateGeminiJson<T>(
  options: GenerateGeminiJsonOptions,
): Promise<GenerateGeminiJsonResult<T>> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new AppError(options.context, 'GEMINI_API_KEY is not configured');
  }

  const model = options.model ?? resolveGeminiModel(options.tier ?? 'standard');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: options.systemPrompt }] },
    contents: [{ role: 'user', parts: options.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: options.responseSchema,
      maxOutputTokens: options.maxOutputTokens,
      // Gemini 3.x defaults to medium thinking — too slow for Edge budgets.
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  };

  const hasFile = options.parts.some((p) => 'fileData' in p);
  console.log('[gemini] start', {
    model,
    tier: options.tier ?? 'standard',
    kind: options.kind,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens,
    hasFile,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[gemini] fetch failed', {
      model,
      kind: options.kind,
      ms: Date.now() - started,
      timedOut: isTimeout,
    });
    throw new FetchError(options.context, 'Gemini request failed', {
      timedOut: isTimeout,
      timeoutMs: options.timeoutMs,
      model,
      hasFile,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - started;
  console.log('[gemini] response', {
    model,
    kind: options.kind,
    ms: durationMs,
    status: res.status,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new FetchError(options.context, 'Gemini API returned an error', {
      status: res.status,
      body: errText.slice(0, 800),
      model,
    });
  }

  const payload = await res.json();
  const jsonText = extractJsonText(payload?.candidates?.[0]?.content?.parts);
  if (!jsonText) {
    console.error('[gemini] empty content', {
      model,
      kind: options.kind,
      finishReason: payload?.candidates?.[0]?.finishReason,
      blockReason: payload?.promptFeedback?.blockReason,
    });
    throw new AppError(options.context, 'Gemini returned no content');
  }

  const usageMeta = payload?.usageMetadata ?? {};
  const usage: GeminiUsageSnapshot = {
    model,
    kind: options.kind,
    promptTokenCount: Number(usageMeta.promptTokenCount ?? 0) || 0,
    candidatesTokenCount: Number(usageMeta.candidatesTokenCount ?? 0) || 0,
    thoughtsTokenCount: Number(usageMeta.thoughtsTokenCount ?? 0) || 0,
    totalTokenCount: Number(usageMeta.totalTokenCount ?? 0) || 0,
  };

  let data: T;
  try {
    data = JSON.parse(jsonText) as T;
  } catch {
    throw new AppError(options.context, 'Gemini returned invalid JSON');
  }

  return { data, usage, model, durationMs };
}

/** Prefer non-thought parts — Gemini may prepend thought / signature parts. */
export function extractJsonText(parts: unknown): string | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i] as { text?: string; thought?: boolean };
    if (part?.thought) continue;
    if (typeof part?.text === 'string' && part.text.trim()) return part.text;
  }
  return null;
}

/** Gemini occasionally emits U+0000 inside accented words under structured output. */
export function sanitizeGeminiText(value: string): string {
  return value.replace(/\u0000/g, '');
}
