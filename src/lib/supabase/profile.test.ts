import { describe, expect, it, vi } from 'vitest';

import { profileQuota, type Profile } from '@/lib/supabase/profile';

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }));

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
