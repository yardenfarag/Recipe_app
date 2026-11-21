import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractRecipe, extractionOutcomeIsUncertain } from './extractRecipe';

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  clearRequestId: vi.fn(),
  getInstallId: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/extractionRequestId', () => ({
  getOrCreateExtractionRequestId: mocks.getRequestId,
  clearExtractionRequestId: mocks.clearRequestId,
}));
vi.mock('@/lib/installId', () => ({ getInstallId: mocks.getInstallId }));
// The call lives in shared/lib/supabase/extractRecipe.ts, which uses the shared client.
vi.mock('@shared/lib/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

describe('extractRecipe request recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue('request-1');
    mocks.getInstallId.mockResolvedValue('install-1');
  });

  it('returns but does not acknowledge the request id after HTTP success', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        status: 'full',
        platform: 'web',
        recipe: {
          title: 'Soup',
          ingredients: [],
          instructions: [],
          servings: 2,
          extraction_status: 'full',
        },
      },
      error: null,
    });

    await expect(extractRecipe('https://example.com/soup')).resolves.toMatchObject({
      status: 'full',
      request_id: 'request-1',
    });
    expect(mocks.clearRequestId).not.toHaveBeenCalled();
  });

  it('keeps the request id after HTTP and transport failures', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', name: 'FunctionsHttpError' },
    });

    await expect(extractRecipe('https://example.com/soup')).resolves.toMatchObject({
      status: 'failed',
      code: 'no_response',
      request_id: 'request-1',
    });
    expect(mocks.clearRequestId).not.toHaveBeenCalled();
  });

  it('marks a failure with no answer from the function (504, network) as uncertain', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error('Failed to send a request to the Edge Function'),
    });

    const result = await extractRecipe('https://example.com/soup');

    expect(result).toMatchObject({ status: 'failed', code: 'no_response', request_id: 'request-1' });
    expect(extractionOutcomeIsUncertain(result.code)).toBe(true);
  });

  it('treats compensation and metering failures as uncertain charges', () => {
    expect(extractionOutcomeIsUncertain('compensation_pending')).toBe(true);
    expect(extractionOutcomeIsUncertain('metering_error')).toBe(true);
    expect(extractionOutcomeIsUncertain('no_response')).toBe(true);
    expect(extractionOutcomeIsUncertain('guest_limit')).toBe(false);
    expect(extractionOutcomeIsUncertain('gate_unavailable')).toBe(false);
    // A timeout was refunded, so a retry is new.
    expect(extractionOutcomeIsUncertain('extraction_timeout')).toBe(false);
  });

  it('reuses the durable id in the function request body', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: null });

    await extractRecipe('https://example.com/soup');

    expect(mocks.invoke).toHaveBeenCalledWith('extract-recipe', {
      body: {
        url: 'https://example.com/soup',
        guest_install_id: 'install-1',
        request_id: 'request-1',
      },
    });
  });
});
