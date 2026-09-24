/**
 * OpenRouter (text / vision) with Gemini fallback.
 *
 * Video `fileData.fileUri` stays on native Gemini — OpenRouter does not
 * replace that path (ADR 013).
 */

import { AppError, FetchError } from './errors.ts';
import {
  generateGeminiJson,
  type GenerateGeminiJsonOptions,
  type GenerateGeminiJsonResult,
  type GeminiPart,
} from './geminiClient.ts';
import { parseLlmJsonText } from './llmJson.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_FAST_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_STANDARD_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_FAST_FALLBACKS = 'google/gemini-2.0-flash,openai/gpt-4.1-mini';
const DEFAULT_STANDARD_FALLBACKS =
  'google/gemini-2.5-flash,anthropic/claude-sonnet-4';

export function resolveOpenRouterApiKey(): string | undefined {
  const key =
    Deno.env.get('OPENROUTER_API_KEY')?.trim() ||
    Deno.env.get('OPEN_ROUTER_API_KEY')?.trim();
  return key || undefined;
}

export function resolveOpenRouterModel(
  tier: GenerateGeminiJsonOptions['tier'] = 'standard',
): string {
  if (tier === 'fast') {
    return Deno.env.get('OPENROUTER_FAST_MODEL')?.trim() || DEFAULT_FAST_MODEL;
  }
  return Deno.env.get('OPENROUTER_MODEL')?.trim() || DEFAULT_STANDARD_MODEL;
}

function resolveFallbacks(tier: GenerateGeminiJsonOptions['tier'] = 'standard'): string[] {
  const raw =
    tier === 'fast'
      ? Deno.env.get('OPENROUTER_FAST_FALLBACKS')?.trim() || DEFAULT_FAST_FALLBACKS
      : Deno.env.get('OPENROUTER_FALLBACKS')?.trim() || DEFAULT_STANDARD_FALLBACKS;
  const primary = resolveOpenRouterModel(tier);
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== primary);
}

function hasFileUriPart(parts: GeminiPart[]): boolean {
  return parts.some((p) => 'fileData' in p);
}

function schemaName(kind: string): string {
  const cleaned = kind.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || 'result';
}

function partsToOpenRouterContent(
  parts: GeminiPart[],
): string | Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if ('text' in part) {
      content.push({ type: 'text', text: part.text });
    } else if ('imageBase64' in part) {
      const mime = part.mimeType?.trim() || 'image/jpeg';
      content.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${part.imageBase64}` },
      });
    }
  }
  if (content.length === 1 && content[0].type === 'text') {
    return String(content[0].text);
  }
  return content;
}

export async function generateOpenRouterJson<T>(
  options: GenerateGeminiJsonOptions,
  apiKey: string,
): Promise<GenerateGeminiJsonResult<T>> {
  const model = options.model ?? resolveOpenRouterModel(options.tier ?? 'standard');
  const fallbacks = resolveFallbacks(options.tier ?? 'standard');
  const userContent = partsToOpenRouterContent(options.parts);

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: options.maxOutputTokens,
    // Gemini defaults to thinking, which adds seconds before any JSON comes back.
    reasoning: { effort: options.tier === 'standard' ? 'low' : 'none' },
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
    },
  };
  if (fallbacks.length > 0) {
    body.models = fallbacks;
  }

  const hasImage = options.parts.some((p) => 'imageBase64' in p);
  console.log('[openrouter] start', {
    model,
    fallbacks,
    kind: options.kind,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens,
    hasImage,
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
        'HTTP-Referer': 'https://yardenfarag.github.io/Recipe_app',
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
    choices?: { message?: { content?: unknown } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const usedModel = typeof payload.model === 'string' && payload.model.trim()
    ? payload.model.trim()
    : model;
  const rawContent = payload.choices?.[0]?.message?.content;
  const jsonText =
    typeof rawContent === 'string'
      ? parseLlmJsonText(rawContent)
      : Array.isArray(rawContent)
        ? parseLlmJsonText(
            rawContent
              .map((part) =>
                part && typeof part === 'object' && 'text' in part
                  ? String((part as { text?: string }).text ?? '')
                  : '',
              )
              .join(''),
          )
        : '';

  if (!jsonText) {
    throw new AppError(options.context, 'OpenRouter returned no content');
  }

  let data: T;
  try {
    data = JSON.parse(jsonText) as T;
  } catch {
    throw new AppError(options.context, 'OpenRouter returned invalid JSON');
  }

  const promptTokenCount = Number(payload.usage?.prompt_tokens ?? 0) || 0;
  const candidatesTokenCount = Number(payload.usage?.completion_tokens ?? 0) || 0;
  const thoughtsTokenCount =
    Number(payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0) || 0;
  const usage: GeminiUsageSnapshot = {
    model: usedModel,
    kind: options.kind,
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount,
    totalTokenCount:
      Number(payload.usage?.total_tokens ?? 0) ||
      promptTokenCount + candidatesTokenCount,
  };

  return { data, usage, model: usedModel, durationMs };
}

/**
 * Text and image jobs prefer OpenRouter when a key is set. Video file URIs
 * always use native Gemini. OpenRouter failures fall back to Gemini.
 */
export async function generateLlmJson<T>(
  options: GenerateGeminiJsonOptions,
): Promise<GenerateGeminiJsonResult<T>> {
  const openRouterKey = resolveOpenRouterApiKey();
  if (openRouterKey && !hasFileUriPart(options.parts)) {
    try {
      return await generateOpenRouterJson<T>(options, openRouterKey);
    } catch (err) {
      const geminiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
      if (!geminiKey) throw err;
      console.error('[llm] OpenRouter failed, falling back to Gemini', {
        kind: options.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return generateGeminiJson<T>(options);
}
