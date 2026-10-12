// Shared helpers for the PIN-44 LLM eval. Run everything through eval/cli.ts.

export const ROOT = new URL('.', import.meta.url).pathname;
export const PRIVATE = `${ROOT}private/`;
export const RESULTS = `${ROOT}results/`;

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(path)) as T;
}

export async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return fallback;
    throw err;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function fileBase64(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  let binary = '';
  // Chunked so 30 MB videos don't overflow the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Sniffs the real type: Commons PNGs are cached under a .jpg name. */
export async function mimeForPath(path: string): Promise<string> {
  if (path.endsWith('.mp4')) return 'video/mp4';
  const head = (await Deno.readFile(path)).subarray(0, 12);
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head[8] === 0x57 && head[9] === 0x45) return 'image/webp';
  return 'image/jpeg';
}

export async function dataUrl(path: string): Promise<string> {
  return `data:${await mimeForPath(path)};base64,${await fileBase64(path)}`;
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function slug(model: string): string {
  return model.replace(/[^a-zA-Z0-9.-]+/g, '_');
}

function openRouterKey(): string {
  const key = Deno.env.get('OPENROUTER_API_KEY')?.trim() || Deno.env.get('OPEN_ROUTER_API_KEY')?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY is not set (eval reads the repo .env)');
  return key;
}

const OR_HEADERS = () => ({
  Authorization: `Bearer ${openRouterKey()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://pinch-app.io',
  'X-Title': 'Pinch eval',
});

export type ChatContent = string | Record<string, unknown>[];

/** Direct OpenRouter JSON call for references and judging (not the code under test). */
export async function chatJson<T>(opts: {
  model: string;
  system: string;
  content: ChatContent;
  schema: Record<string, unknown>;
  name: string;
  reasoning?: 'none' | 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<{ data: T; costUsd: number; ms: number }> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: OR_HEADERS(),
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.content },
        ],
        max_tokens: opts.maxTokens ?? 8000,
        reasoning: { effort: opts.reasoning ?? 'medium' },
        response_format: {
          type: 'json_schema',
          json_schema: { name: opts.name, strict: false, schema: opts.schema },
        },
        provider: { require_parameters: true, data_collection: 'deny' },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
    }
    const payload = JSON.parse(text);
    const raw = String(payload.choices?.[0]?.message?.content ?? '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      return {
        data: JSON.parse(raw) as T,
        costUsd: Number(payload.usage?.cost ?? 0),
        ms: Date.now() - started,
      };
    } catch (err) {
      if (attempt < 3) continue;
      throw new Error(`${opts.model} returned invalid JSON: ${raw.slice(0, 200)} (${err})`);
    }
  }
}

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria: { true: string; false: string } };

/** TypeSafe Jev through OpenRouter's Decisions API. */
export async function jevDecide(opts: {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
}): Promise<{ answers: Record<string, any>; costUsd: number; ms: number; model: string }> {
  const started = Date.now();
  const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: OR_HEADERS(),
    body: JSON.stringify({ model: opts.model, state: opts.state, questions: opts.questions }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jev ${res.status}: ${text.slice(0, 400)}`);
  const payload = JSON.parse(text);
  return {
    answers: payload.answers ?? {},
    costUsd: Number(payload.usage?.cost ?? 0),
    ms: Date.now() - started,
    model: String(payload.model ?? opts.model),
  };
}
