import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FunctionsHttpError } from '@supabase/supabase-js';

import {
  extractionOutcomeIsUncertain,
  extractRecipe,
  extractRecipeFromImage,
  extractRecipeFromPdf,
  NO_RESPONSE_CODE,
  pdfRequestKey,
  photoRequestKey,
} from './extractRecipe';
import { inventRecipe } from './inventRecipe';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

/** The web app's context: request ids, and no guest install id (the web has no guests). */
const keys: string[] = [];
const webContext = {
  getOrCreateRequestId: async (key: string) => {
    keys.push(key);
    return 'request-1';
  },
};

describe('import calls without a guest install id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keys.length = 0;
    mocks.invoke.mockResolvedValue({ data: { status: 'full', platform: 'web' }, error: null });
  });

  it('sends only the request id', async () => {
    await extractRecipe(webContext, 'https://example.com/soup');
    expect(mocks.invoke).toHaveBeenCalledWith('extract-recipe', {
      body: { url: 'https://example.com/soup', request_id: 'request-1' },
    });
  });

  it('keys a photo by its size and start, and a guess apart from a Snap', async () => {
    await extractRecipeFromImage(webContext, 'abc123', 'image/jpeg', { forceExtract: true });
    await inventRecipe(webContext, 'https://example.com/soup', 'he');
    expect(keys).toEqual([photoRequestKey('abc123'), 'invent:https://example.com/soup']);
    expect(mocks.invoke).toHaveBeenLastCalledWith('invent-recipe', {
      body: { url: 'https://example.com/soup', language: 'he', request_id: 'request-1' },
    });
  });

  it('sends a PDF as pdf_base64, keyed apart from a photo', async () => {
    await extractRecipeFromPdf(webContext, 'JVBERi0xLjcKcdf');
    expect(keys).toEqual([pdfRequestKey('JVBERi0xLjcKcdf')]);
    expect(mocks.invoke).toHaveBeenCalledWith('extract-recipe', {
      body: { pdf_base64: 'JVBERi0xLjcKcdf', request_id: 'request-1' },
    });
  });

  it('keys two PDFs of the same size apart, though every PDF starts the same', () => {
    const header = 'JVBERi0xLjcK'.padEnd(400, 'A');
    expect(pdfRequestKey(`${header}${'B'.repeat(200)}`)).not.toBe(pdfRequestKey(`${header}${'C'.repeat(200)}`));
    expect(pdfRequestKey(`${header}${'B'.repeat(200)}`)).toBe(pdfRequestKey(`${header}${'B'.repeat(200)}`));
  });

  it('without a JSON answer: no_response, an uncertain charge, friendly words and the same request id', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    const result = await extractRecipe(webContext, 'https://example.com/soup');
    expect(result).toMatchObject({
      status: 'failed',
      code: NO_RESPONSE_CODE,
      message: 'Could not reach the extraction service. Please try again.',
      request_id: 'request-1',
    });
    expect(extractionOutcomeIsUncertain(result.code)).toBe(true);
  });

  it('a 504 with an HTML page is no answer too', async () => {
    const error = new FunctionsHttpError(new Response('<html>Gateway Timeout</html>', { status: 504 }));
    mocks.invoke.mockResolvedValue({ data: null, error });
    await expect(inventRecipe(webContext, 'https://example.com/soup')).resolves.toMatchObject({
      code: NO_RESPONSE_CODE,
      message: 'Could not reach the invent service. Please try again.',
    });
  });

  it("keeps the server's own code and message from a JSON error, such as 402 out of credits", async () => {
    const error = new FunctionsHttpError(
      new Response(JSON.stringify({ status: 'failed', code: 'insufficient_credits', message: 'No credits', total_credits: 0 }), { status: 402 }),
    );
    mocks.invoke.mockResolvedValue({ data: null, error });
    await expect(extractRecipe(webContext, 'https://example.com/soup')).resolves.toMatchObject({
      code: 'insufficient_credits',
      message: 'No credits',
      total_credits: 0,
    });
  });

  it('a refunded timeout is not uncertain', () => {
    expect(extractionOutcomeIsUncertain('extraction_timeout')).toBe(false);
  });
});

describe('the same import started twice at once', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A server call that stays open until `finish` is called. */
  function openCall() {
    let finish!: (value: unknown) => void;
    mocks.invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    return { finish: () => finish({ data: { status: 'full', platform: 'web' }, error: null }) };
  }

  it('reaches the server once, and every caller gets the answer', async () => {
    const call = openCall();
    const first = extractRecipe(webContext, 'https://example.com/soup');
    const second = extractRecipe(webContext, 'https://example.com/soup');
    const third = extractRecipe(webContext, 'https://example.com/soup');
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    call.finish();
    const results = await Promise.all([first, second, third]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(3).fill({ status: 'full', platform: 'web', request_id: 'request-1' }));
  });

  it('once the first has answered, the next call is a new request', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'full', platform: 'web' }, error: null });
    await extractRecipe(webContext, 'https://example.com/soup');
    await extractRecipe(webContext, 'https://example.com/soup');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('a failed call does not block the retry', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('network down'));
    await expect(extractRecipe(webContext, 'https://example.com/soup')).rejects.toThrow('network down');
    mocks.invoke.mockResolvedValue({ data: { status: 'full', platform: 'web' }, error: null });
    await expect(extractRecipe(webContext, 'https://example.com/soup')).resolves.toMatchObject({ status: 'full' });
  });

  it('skipping the food check, or guessing, is a different import', async () => {
    const call = openCall();
    const snap = extractRecipe(webContext, 'https://example.com/soup');
    const forced = extractRecipe(webContext, 'https://example.com/soup', { forceExtract: true });
    const guess = inventRecipe(webContext, 'https://example.com/soup');
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3));
    call.finish();
    await Promise.all([snap, forced, guess]);
  });
});
