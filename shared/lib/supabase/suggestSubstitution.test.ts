import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FunctionsHttpError } from '@supabase/supabase-js';

import { rewriteInstructionsForSubstitution, suggestSubstitution } from './suggestSubstitution';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const butter = { name: 'butter', quantity: 50, unit: 'g' };

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

describe('suggest-substitution failures keep the server code (PIN-158)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes on the code and message of a refused request', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: httpError(429, { status: 'failed', code: 'daily_limit', message: 'daily_limit' }),
    });
    await expect(suggestSubstitution(butter, 'Cake', [])).resolves.toEqual({
      status: 'failed',
      code: 'daily_limit',
      message: 'daily_limit',
    });
  });

  it('reads a legacy { error } body as the message', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(400, { error: 'Missing "recipe_title" in request body' }) });
    await expect(suggestSubstitution(butter, '', [])).resolves.toEqual({
      status: 'failed',
      message: 'Missing "recipe_title" in request body',
    });
  });

  it('falls back to its own words when the body is not JSON', async () => {
    const error = new FunctionsHttpError(new Response('<html>Gateway Timeout</html>', { status: 504 }));
    mocks.invoke.mockResolvedValue({ data: null, error });
    await expect(suggestSubstitution(butter, 'Cake', [])).resolves.toEqual({
      status: 'failed',
      message: 'Could not reach the substitution service. Please try again.',
    });
  });

  it('keeps a code sent with a 200 answer', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'failed', code: 'no_substitute', message: 'none' }, error: null });
    await expect(suggestSubstitution(butter, 'Cake', [])).resolves.toMatchObject({ code: 'no_substitute' });
  });

  it('does the same for rewriting the steps', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: httpError(500, { status: 'failed', code: 'rewrite_failed', message: 'Something went wrong' }),
    });
    await expect(
      rewriteInstructionsForSubstitution(butter, { name: 'oil', quantity: 40, unit: 'ml' }, [{ step: 1, text: 'Melt butter' }], 'Cake'),
    ).resolves.toEqual({ status: 'failed', code: 'rewrite_failed', message: 'Something went wrong' });
  });
});
