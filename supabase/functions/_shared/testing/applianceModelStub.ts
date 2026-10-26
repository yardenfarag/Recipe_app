/**
 * Test-only helpers for the appliances task: a fetch stub that answers OpenRouter calls in order, so a
 * test can script "the list call says X, then the tip check says Y". Not imported by any function.
 */

export type ModelStub = { calls: Record<string, unknown>[] };

/** A successful OpenRouter chat completion whose content is `data` (JSON-encoded unless a string). */
export function completion(data: unknown): Response {
  return Response.json({
    model: 'openai/gpt-6-luna',
    choices: [{ message: { content: typeof data === 'string' ? data : JSON.stringify(data) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020, cost: 0.00015 },
  });
}

export function failure(status: number): Response {
  return new Response('upstream error', { status });
}

/**
 * Runs `fn` with fetch answering each call with the next response in `responses`.
 * A call beyond the script fails the test loudly instead of hanging.
 */
export async function withModel(
  responses: Response[],
  fn: (stub: ModelStub) => Promise<void>,
): Promise<void> {
  const previousKey = Deno.env.get('OPENROUTER_API_KEY');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected model call #${calls.length}`);
    return Promise.resolve(next);
  }) as typeof fetch;
  try {
    await fn({ calls });
  } finally {
    globalThis.fetch = original;
    if (previousKey === undefined) Deno.env.delete('OPENROUTER_API_KEY');
    else Deno.env.set('OPENROUTER_API_KEY', previousKey);
  }
}

export const STEAK = {
  title: 'Pan-seared steak',
  ingredients: [
    { name: 'ribeye steak', quantity: 1, unit: '' },
    { name: 'butter', quantity: 2, unit: 'tbsp' },
  ],
  instructions: [
    { step: 1, text: 'Season the steak generously.' },
    { step: 2, text: 'Sear in a hot pan for 3 minutes per side until medium-rare.' },
    { step: 3, text: 'Rest for 5 minutes and slice.' },
  ],
};
