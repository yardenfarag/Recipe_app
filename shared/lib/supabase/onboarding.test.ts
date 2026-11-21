import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backfillAccountOnboarded, fetchOnboardingAccount, markAccountOnboarded } from './onboarding';

vi.mock('./client', () => ({ supabase: {} }));

function fakeClient() {
  return {
    auth: {
      getUser: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };
}

describe('account onboarding', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('records it with only its own key', async () => {
    await markAccountOnboarded(client as never, new Date('2026-11-21T12:00:00.000Z'));
    expect(client.auth.updateUser).toHaveBeenCalledWith({ data: { onboarded_at: '2026-11-21T12:00:00.000Z' } });
  });

  it('throws when the save fails', async () => {
    client.auth.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') });
    await expect(markAccountOnboarded(client as never)).rejects.toThrow('offline');
  });

  it("reads the server's copy of the account", async () => {
    const user = { id: 'u1', created_at: '2026-11-21T11:00:00.000Z', user_metadata: { onboarded_at: '2026-11-21T11:05:00.000Z' } };
    client.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(fetchOnboardingAccount(client as never)).resolves.toBe(user);
  });

  it('backfills once per account, and not when the account already has it', async () => {
    backfillAccountOnboarded({ id: 'done', user_metadata: { onboarded_at: '2026-01-01T00:00:00.000Z' } }, client as never);
    expect(client.auth.updateUser).not.toHaveBeenCalled();

    backfillAccountOnboarded({ id: 'u2', user_metadata: {} }, client as never);
    backfillAccountOnboarded({ id: 'u2', user_metadata: {} }, client as never);
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('tries again later when the backfill fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    client.auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') });
    backfillAccountOnboarded({ id: 'u3', user_metadata: {} }, client as never);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    backfillAccountOnboarded({ id: 'u3', user_metadata: {} }, client as never);
    expect(client.auth.updateUser).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
