import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProfile, profileQuota, type Profile } from '@/lib/supabase/profile';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();
  const rpc = vi.fn();
  eq.mockImplementation(() => ({ eq, maybeSingle }));
  select.mockImplementation(() => ({ eq }));
  from.mockImplementation(() => ({ select }));
  return { maybeSingle, eq, select, from, rpc };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'test@pinch.invalid',
    avatar_url: null,
    token_balance: 0,
    is_admin: false,
    token_pack_notify_at: null,
    subscription_status: 'free',
    subscription_expires_at: null,
    free_extracts_used: 0,
    monthly_extracts_used: 0,
    contribute_to_hub: true,
    ...overrides,
  };
}

describe('profile recipe credits', () => {
  it('combines monthly free and purchased credits', () => {
    expect(
      profileQuota(profile({ monthly_extracts_used: 5, token_balance: 7 })),
    ).toMatchObject({
      freeExtractsRemaining: 10,
      purchasedCredits: 7,
      totalCredits: 17,
      extractsRemaining: 17,
      subscriptionActive: false,
    });
  });

  it('gives a new signed-in account the full monthly allowance', () => {
    expect(profileQuota(profile())).toMatchObject({
      freeExtractsRemaining: 15,
      purchasedCredits: 0,
      totalCredits: 15,
      extractsRemaining: 15,
    });
  });

  it('falls back to purchased credits after the monthly allowance', () => {
    expect(
      profileQuota(profile({ monthly_extracts_used: 15, token_balance: 3 })),
    ).toMatchObject({
      freeExtractsRemaining: 0,
      purchasedCredits: 3,
      totalCredits: 3,
    });
  });

  it('ignores retired Plus state', () => {
    expect(
      profileQuota(
        profile({
          subscription_status: 'active',
          monthly_extracts_used: 2,
          token_balance: 1,
        }),
      ),
    ).toMatchObject({
      subscriptionStatus: 'free',
      subscriptionActive: false,
      freeExtractsRemaining: 13,
      totalCredits: 14,
    });
  });
});

describe('fetchProfile', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const profileRow = {
    id: userId,
    email: 'test@pinch.invalid',
    avatar_url: null,
    token_balance: 0,
    is_admin: false,
    token_pack_notify_at: null,
    subscription_status: 'free',
    subscription_expires_at: null,
    free_extracts_used: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eq.mockImplementation(() => ({ eq: mocks.eq, maybeSingle: mocks.maybeSingle }));
    mocks.select.mockImplementation(() => ({ eq: mocks.eq }));
    mocks.from.mockImplementation(() => ({ select: mocks.select }));
  });

  it('treats a missing monthly usage row as the full 15-credit allowance', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: profileRow, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(fetchProfile(userId)).resolves.toMatchObject({
      monthly_extracts_used: 0,
      token_balance: 0,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('creates a missing profile so new accounts receive monthly credits', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: profileRow, error: null });
    mocks.rpc.mockResolvedValue({ data: userId, error: null });

    await expect(fetchProfile(userId)).resolves.toMatchObject({
      id: userId,
      monthly_extracts_used: 0,
      token_balance: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('ensure_user_profile', {
      p_user_id: userId,
    });
  });
});
