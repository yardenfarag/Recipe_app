import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hideToast,
  showToast,
  subscribeToast,
  TOAST_ERROR_MIN_DURATION_MS,
  TOAST_MAX_DURATION_MS,
  TOAST_MIN_DURATION_MS,
  toastDurationMs,
  type ToastMessage,
} from './toast';

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

    vi.advanceTimersByTime(TOAST_MIN_DURATION_MS - 1);
    expect(seen.at(-1)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(seen.at(-1)).toBeNull();
    unsubscribe();
  });

  it('replaces the current toast and restarts the timer', () => {
    let latest: ToastMessage | null = null;
    const unsubscribe = subscribeToast((toast) => {
      latest = toast;
    });

    showToast('First');
    vi.advanceTimersByTime(TOAST_MIN_DURATION_MS - 100);
    showToast('Second', 'info');
    vi.advanceTimersByTime(200);
    expect(latest).toMatchObject({ text: 'Second', icon: 'info' });

    vi.advanceTimersByTime(TOAST_MIN_DURATION_MS);
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

  it('keeps a failure up longer than a confirmation', () => {
    let latest: ToastMessage | null = null;
    const unsubscribe = subscribeToast((toast) => {
      latest = toast;
    });

    showToast("Couldn't save. Try again.", 'error');
    expect(latest).toMatchObject({ icon: 'error', durationMs: TOAST_ERROR_MIN_DURATION_MS });
    vi.advanceTimersByTime(TOAST_MIN_DURATION_MS);
    expect(latest).not.toBeNull();
    vi.advanceTimersByTime(TOAST_ERROR_MIN_DURATION_MS - TOAST_MIN_DURATION_MS);
    expect(latest).toBeNull();
    unsubscribe();
  });
});

describe('toastDurationMs', () => {
  it('gives short text the minimum', () => {
    expect(toastDurationMs('Copied')).toBe(TOAST_MIN_DURATION_MS);
    expect(toastDurationMs('Copied', 'info')).toBe(TOAST_MIN_DURATION_MS);
  });

  it('gives failures at least the error minimum', () => {
    expect(toastDurationMs('Oops', 'error')).toBe(TOAST_ERROR_MIN_DURATION_MS);
  });

  it('grows with the length of the text', () => {
    const medium = 'a'.repeat(80);
    expect(toastDurationMs(medium)).toBeGreaterThan(TOAST_MIN_DURATION_MS);
    expect(toastDurationMs(medium)).toBeLessThan(TOAST_MAX_DURATION_MS);
    expect(toastDurationMs('a'.repeat(100))).toBeGreaterThan(toastDurationMs(medium));
  });

  it('never stays up longer than the cap', () => {
    expect(toastDurationMs('a'.repeat(1000))).toBe(TOAST_MAX_DURATION_MS);
    expect(toastDurationMs('a'.repeat(1000), 'error')).toBe(TOAST_MAX_DURATION_MS);
  });
});
