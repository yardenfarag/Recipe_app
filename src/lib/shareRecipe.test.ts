import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Share: { share: vi.fn(), dismissedAction: 'dismissedAction' },
}));

import { shareRecipe } from '@/lib/shareRecipe';

describe('shareRecipe', () => {
  it('copies the Pinch share URL on web', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await shareRecipe({
      title: 'Pasta',
      url: 'https://example.com/Recipe_app/share.html?t=abc',
    });

    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(
      'https://example.com/Recipe_app/share.html?t=abc',
    );

    vi.unstubAllGlobals();
  });
});
