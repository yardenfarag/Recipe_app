import { afterEach, describe, expect, it, vi } from 'vitest';

import { appShareMessage, appShareUrl, shareAppInBrowser } from './shareApp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appShareUrl', () => {
  it('links to the landing page with UTM tags for the sharing platform', () => {
    const url = new URL(appShareUrl('https://pinch-app.io/', 'web'));
    expect(url.origin + url.pathname).toBe('https://pinch-app.io/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'pinch_app',
      utm_medium: 'share',
      utm_campaign: 'share_pinch',
      utm_content: 'web',
    });
  });
});

describe('shareAppInBrowser', () => {
  const url = 'https://pinch-app.io/?utm_source=pinch_app';

  it('uses the browser share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(shareAppInBrowser({ title: 'Pinch', message: ' Try it: ', url })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Pinch', text: 'Try it:', url });
  });

  it('reports a closed share sheet as dismissed', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort) });
    await expect(shareAppInBrowser({ title: 'Pinch', message: 'Try it:', url })).resolves.toBe('dismissed');
  });

  it('copies the message and link without a share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareAppInBrowser({ title: 'Pinch', message: 'Try it:', url })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(appShareMessage('Try it:', url));
  });
});
