import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendWelcomeEmailIfNeeded, welcomeEmailShouldCache } from '@/lib/supabase/welcomeEmail';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

describe('welcome email client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getItem.mockResolvedValue(null);
    mocks.setItem.mockResolvedValue(undefined);
  });

  it('caches a finished send and an account that was already mailed', () => {
    expect(welcomeEmailShouldCache('sent')).toBe(true);
    expect(welcomeEmailShouldCache('already_sent')).toBe(true);
    expect(welcomeEmailShouldCache('retry')).toBe(false);
    expect(welcomeEmailShouldCache('skipped')).toBe(false);
  });

  it('does not call the function again after a successful send was remembered', async () => {
    mocks.getItem.mockResolvedValue('done');

    await sendWelcomeEmailIfNeeded('user-1');

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('remembers a sent welcome email', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'sent' }, error: null });

    await sendWelcomeEmailIfNeeded('user-1');

    expect(mocks.invoke).toHaveBeenCalledWith('welcome-email', { body: {} });
    expect(mocks.setItem).toHaveBeenCalledWith('pinch:welcomeEmail:user-1', 'done');
  });

  it('leaves a failed send uncached so the next open can retry', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'welcome email unavailable' },
    });

    await sendWelcomeEmailIfNeeded('user-1');

    expect(mocks.setItem).not.toHaveBeenCalled();
  });
});
