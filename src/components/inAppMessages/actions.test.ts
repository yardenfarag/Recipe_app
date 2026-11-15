import { describe, expect, it, vi } from 'vitest';

import { openAppStore } from '@/lib/appStore';

import { isSafeRoute, isSafeWebUrl, openStorePage, runButtonAction, type ActionDeps } from './actions';

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: vi.fn() }));
vi.mock('@/lib/appStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appStore')>()),
  openAppStore: vi.fn(),
}));


function deps(): ActionDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openBrowser: (url) => {
      calls.push(`browser:${url}`);
      return Promise.resolve();
    },
    navigate: (href) => {
      calls.push(`route:${href}`);
    },
    openStore: () => {
      calls.push('store');
      return Promise.resolve();
    },
  };
}

describe('runButtonAction', () => {
  it('opens a web address in the in-app browser, straight away', () => {
    const d = deps();
    expect(runButtonAction({ type: 'link', url: 'https://example.com/a?b=1' }, d)).toBe(true);
    expect(d.calls).toEqual(['browser:https://example.com/a?b=1']);
  });

  it('navigates to an app route', () => {
    const d = deps();
    expect(runButtonAction({ type: 'route', href: '/hub' }, d)).toBe(true);
    expect(d.calls).toEqual(['route:/hub']);
  });

  it('opens the store page', () => {
    const d = deps();
    expect(runButtonAction({ type: 'store' }, d)).toBe(true);
    expect(d.calls).toEqual(['store']);
  });

  it('does nothing for dismiss', () => {
    const d = deps();
    expect(runButtonAction({ type: 'dismiss' }, d)).toBe(false);
    expect(d.calls).toEqual([]);
  });

  it('refuses addresses and routes that are not safe', () => {
    const d = deps();
    expect(runButtonAction({ type: 'link', url: 'javascript:alert(1)' }, d)).toBe(false);
    expect(runButtonAction({ type: 'link', url: 'http://example.com' }, d)).toBe(false);
    expect(runButtonAction({ type: 'route', href: '//evil.example' }, d)).toBe(false);
    expect(runButtonAction({ type: 'route', href: 'hub' }, d)).toBe(false);
    expect(d.calls).toEqual([]);
  });

  it('does not throw when the browser rejects', async () => {
    const d = deps();
    d.openBrowser = () => Promise.reject(new Error('blocked'));
    expect(() => runButtonAction({ type: 'link', url: 'https://example.com' }, d)).not.toThrow();
    await Promise.resolve();
  });
});

describe('guards', () => {
  it('accepts only https web addresses', () => {
    expect(isSafeWebUrl('https://example.com')).toBe(true);
    expect(isSafeWebUrl('http://example.com')).toBe(false);
    expect(isSafeWebUrl('https://')).toBe(false);
    expect(isSafeWebUrl('https://a b')).toBe(false);
  });

  it('accepts only single-slash app paths', () => {
    expect(isSafeRoute('/')).toBe(true);
    expect(isSafeRoute('/recipe/123')).toBe(true);
    expect(isSafeRoute('//x')).toBe(false);
    expect(isSafeRoute('x')).toBe(false);
  });
});

describe('openStorePage', () => {
  it('opens the store page that fits the browser in a new tab on web, without leaving the app', () => {
    const opened: string[] = [];
    openStorePage('web', (url) => opened.push(url), 'Mozilla/5.0 (X11; Linux x86_64)');
    openStorePage('web', (url) => opened.push(url), 'Mozilla/5.0 (Linux; Android 14)');
    expect(opened).toEqual([
      'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453',
      'https://play.google.com/store/apps/details?id=com.pinch.myapp',
    ]);
    expect(openAppStore).not.toHaveBeenCalled();
  });

  it('uses the store link on iOS and Android', () => {
    const opened: string[] = [];
    openStorePage('ios', (url) => opened.push(url));
    expect(opened).toEqual([]);
    expect(openAppStore).toHaveBeenCalledTimes(1);
  });
});
