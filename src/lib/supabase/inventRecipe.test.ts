import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inventRecipe, inventRecipeFromImage } from './inventRecipe';

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  getInstallId: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/extractionRequestId', () => ({
  getOrCreateExtractionRequestId: mocks.getRequestId,
}));
vi.mock('@/lib/installId', () => ({ getInstallId: mocks.getInstallId }));
vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

describe('inventRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue('request-1');
    mocks.getInstallId.mockResolvedValue('install-1');
  });

  it('invokes invent-recipe with url and language', async () => {
    mocks.invoke.mockResolvedValue({
      data: { status: 'full', platform: 'web', recipe: { title: 'Cake' } },
      error: null,
    });

    await inventRecipe('https://example.com/cake', 'he');

    expect(mocks.invoke).toHaveBeenCalledWith('invent-recipe', {
      body: {
        url: 'https://example.com/cake',
        language: 'he',
        guest_install_id: 'install-1',
        request_id: 'request-1',
      },
    });
  });

  it('invokes invent-recipe with a photo payload', async () => {
    mocks.invoke.mockResolvedValue({
      data: { status: 'full', platform: 'photo' },
      error: null,
    });

    await inventRecipeFromImage('abc123', 'image/jpeg', 'en');

    expect(mocks.invoke).toHaveBeenCalledWith('invent-recipe', {
      body: {
        image_base64: 'abc123',
        image_mime: 'image/jpeg',
        language: 'en',
        guest_install_id: 'install-1',
        request_id: 'request-1',
      },
    });
  });
});
