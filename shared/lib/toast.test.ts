import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hideToast, showToast, subscribeToast, TOAST_DURATION_MS, type ToastMessage } from './toast';

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    hideToast();
    vi.useRealTimers();
  });

  it('shows a toast and hides it after a moment', () => {
    const seen: (ToastMessage | null)[] = [];
    const unsubscribe = subscribeToast((toast) => seen.push(toast));

    showToast('Link copied');
    expect(seen.at(-1)).toMatchObject({ text: 'Link copied', icon: 'success' });

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(seen.at(-1)).toBeNull();
    unsubscribe();
  });

  it('replaces the current toast and restarts the timer', () => {
    let latest: ToastMessage | null = null;
    const unsubscribe = subscribeToast((toast) => {
      latest = toast;
    });

    showToast('First');
    vi.advanceTimersByTime(TOAST_DURATION_MS - 100);
    showToast('Second', 'info');
    vi.advanceTimersByTime(200);
    expect(latest).toMatchObject({ text: 'Second', icon: 'info' });

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(latest).toBeNull();
    unsubscribe();
  });

  it('gives a new subscriber the toast already showing', () => {
    showToast('Saved');
    let latest: ToastMessage | null = null;
    const unsubscribe = subscribeToast((toast) => {
      latest = toast;
    });
    expect(latest).toMatchObject({ text: 'Saved' });
    unsubscribe();
  });
});
