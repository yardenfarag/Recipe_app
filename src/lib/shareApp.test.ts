import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Share: { share: vi.fn(), dismissedAction: 'dismissedAction' },
}));

vi.mock('@/lib/legal', () => ({ LEGAL_BASE_URL: 'https://pinch-app.io' }));

import { appShareMessage, appShareUrl, shareApp } from '@/lib/shareApp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appShareUrl', () => {
  it('links to the landing page with UTM tags for the sharing platform', () => {
    const url = new URL(appShareUrl('ios'));
    expect(url.origin + url.pathname).toBe('https://pinch-app.io/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'pinch_app',
      utm_medium: 'share',
      utm_campaign: 'share_pinch',
      utm_content: 'ios',
    });
  });
});

describe('appShareMessage', () => {
  it('puts the link on its own line', () => {
    expect(appShareMessage(' Try Pinch: ', 'https://pinch-app.io/')).toBe(
      'Try Pinch:\nhttps://pinch-app.io/',
    );
  });

  it('falls back to the link alone', () => {
    expect(appShareMessage('  ', 'https://pinch-app.io/')).toBe('https://pinch-app.io/');
  });
});

describe('shareApp on web', () => {
  it('uses the browser share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });

    await expect(shareApp({ title: 'Pinch', message: 'Try it:' })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Pinch',
      text: 'Try it:',
      url: appShareUrl('web'),
    });
  });

  it('reports a closed share sheet as dismissed', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort) });

    await expect(shareApp({ title: 'Pinch', message: 'Try it:' })).resolves.toBe('dismissed');
  });

  it('copies the message and link without a share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(shareApp({ title: 'Pinch', message: 'Try it:' })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`Try it:\n${appShareUrl('web')}`);
  });
});
