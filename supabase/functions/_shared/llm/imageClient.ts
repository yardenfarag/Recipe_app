/**
 * Image generation through OpenRouter's image API (POST /api/v1/images). Separate from
 * llmClient.ts, which only speaks chat completions with JSON answers.
 *
 * The model list follows ADR 015's per-task pattern: a primary and fallbacks, each overridable
 * with OPENROUTER_MODEL_<KIND> / OPENROUTER_FALLBACKS_<KIND>. OpenRouter's image API has no
 * `models[]` fallback, so the fallbacks are tried here, one after another.
 */

import { resolveOpenRouterApiKey } from './llmClient.ts';

const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images';

export type ImageTaskKind = 'recipe_image';

export interface ImageModelConfig {
  model: string;
  /** Request fields this model accepts (they differ per model; an unknown one can 400). */
  params: Record<string, unknown>;
}

/**
 * Picks from the 2026-11-22 bake-off (6 models x 2 styles x 7 recipes): Qwen's illustrations were
 * the ones we liked, and accurate on non-English titles. Seedream was the most consistent runner-up.
 * Qwen only returns PNG; recipeImage.ts turns it into a JPEG.
 */
export const IMAGE_TASK_MODELS: Record<ImageTaskKind, ImageModelConfig[]> = {
  recipe_image: [
    { model: 'qwen/qwen-image-2.1-turbo', params: { resolution: '1K' } },
    { model: 'bytedance-seed/seedream-5-0-flash', params: { resolution: '1K', output_format: 'jpeg' } },
  ],
};

export interface GeneratedImage {
  bytes: Uint8Array;
  /** As the provider reported it, e.g. image/png. */
  mediaType: string;
  model: string;
  /** OpenRouter's usage.cost, USD. */
  costUsd: number | null;
  durationMs: number;
}

export type GenerateImageResult =
  | { ok: true; image: GeneratedImage; attempts: ImageAttempt[] }
  | { ok: false; error: string; attempts: ImageAttempt[] };

export interface ImageAttempt {
  model: string;
  status: number | 'timeout' | 'network';
  ms: number;
  error?: string;
}

export interface GenerateImageOptions {
  kind: ImageTaskKind;
  prompt: string;
  aspectRatio?: string;
  /** Per attempt. */
  timeoutMs?: number;
  /** Tests pass their own. */
  fetchImpl?: typeof fetch;
  /** Tests pass their own model list. */
  models?: ImageModelConfig[];
}

/** The model list for a kind, after env overrides. */
export function resolveImageModels(kind: ImageTaskKind): ImageModelConfig[] {
  const defaults = IMAGE_TASK_MODELS[kind];
  const envKey = kind.toUpperCase();
  const primary = Deno.env.get(`OPENROUTER_MODEL_${envKey}`)?.trim();
  const fallbacks = Deno.env.get(`OPENROUTER_FALLBACKS_${envKey}`)?.trim();
  const byModel = (model: string): ImageModelConfig =>
    defaults.find((entry) => entry.model === model) ?? { model, params: {} };

  const list = primary ? [byModel(primary)] : [defaults[0]];
  if (fallbacks === 'none') return list;
  const rest = fallbacks
    ? fallbacks.split(',').map((slug) => slug.trim()).filter(Boolean).map(byModel)
    : defaults.slice(1);
  return [...list, ...rest.filter((entry) => entry.model !== list[0].model)];
}

/** Makes one picture, trying each model in turn. Never throws. */
export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY is not configured', attempts: [] };

  const doFetch = options.fetchImpl ?? fetch;
  const models = options.models ?? resolveImageModels(options.kind);
  const timeoutMs = options.timeoutMs ?? 45_000;
  const attempts: ImageAttempt[] = [];

  for (const { model, params } of models) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(OPENROUTER_IMAGES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pinch-app.io',
          'X-Title': 'Pinch',
        },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          n: 1,
          aspect_ratio: options.aspectRatio ?? '4:3',
          ...params,
        }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null) as ImagesResponse | null;
      const ms = Date.now() - started;
      if (!res.ok) {
        const error = body?.error?.message?.slice(0, 300) ?? `HTTP ${res.status}`;
        attempts.push({ model, status: res.status, ms, error });
        console.warn('[imageClient] attempt failed', { kind: options.kind, model, status: res.status, ms, error });
        // Out of credit: every model would fail the same way.
        if (res.status === 402) break;
        continue;
      }
      const item = body?.data?.[0];
      const bytes = item?.b64_json ? decodeBase64(item.b64_json) : null;
      if (!bytes?.length) {
        attempts.push({ model, status: res.status, ms, error: 'no image in the response' });
        continue;
      }
      attempts.push({ model, status: res.status, ms });
      return {
        ok: true,
        attempts,
        image: {
          bytes,
          mediaType: item?.media_type?.toLowerCase() ?? sniffMediaType(bytes),
          model,
          costUsd: typeof body?.usage?.cost === 'number' ? body.usage.cost : null,
          durationMs: ms,
        },
      };
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      attempts.push({ model, status: timedOut ? 'timeout' : 'network', ms: Date.now() - started });
      console.warn('[imageClient] attempt failed', { kind: options.kind, model, timedOut });
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: attempts.at(-1)?.error ?? 'every model failed', attempts };
}

interface ImagesResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number | null };
  error?: { message?: string };
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** When the provider leaves media_type out. */
export function sniffMediaType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return 'application/octet-stream';
}
