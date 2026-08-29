import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Share: { share: vi.fn(), dismissedAction: 'dismissedAction' },
}));

import { recipeSourceShareUrl, shareRecipe } from '@/lib/shareRecipe';

describe('recipeSourceShareUrl', () => {
  it('returns a trimmed source URL', () => {
    expect(recipeSourceShareUrl(' https://youtu.be/abc ')).toBe('https://youtu.be/abc');
  });

  it('returns null when there is nothing to share', () => {
    expect(recipeSourceShareUrl(undefined)).toBeNull();
    expect(recipeSourceShareUrl('')).toBeNull();
    expect(recipeSourceShareUrl('   ')).toBeNull();
  });
});

describe('shareRecipe', () => {
  it('copies the source URL on web', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await shareRecipe({
      title: 'Pasta',
      url: 'https://youtu.be/abc',
    });

    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://youtu.be/abc');

    vi.unstubAllGlobals();
  });
});
