import { currentYearMonthUtc } from '@/lib/quotas';
import { supabase } from '@/lib/supabase/client';

export type AdminPerson = {
  id: string;
  email: string | null;
  purchasedCredits: number;
  isAdmin: boolean;
  plan: string;
  joinedAt: string;
  freeExtractsUsed: number;
};

export async function fetchAdminPeople(): Promise<AdminPerson[]> {
  const yearMonth = currentYearMonthUtc();
  const [profilesResult, usageResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, token_balance, is_admin, subscription_status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('extract_usage_monthly')
      .select('user_id, extract_count')
      .eq('year_month', yearMonth),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  const usedByUser = new Map<string, number>();
  if (!usageResult.error) {
    for (const row of usageResult.data ?? []) {
      usedByUser.set(row.user_id, Number(row.extract_count) || 0);
    }
  }

  return (profilesResult.data ?? []).map((row) => ({
    id: row.id,
    email: row.email ?? null,
    purchasedCredits: Number(row.token_balance) || 0,
    isAdmin: row.is_admin === true,
    plan: row.subscription_status ?? 'free',
    joinedAt: row.created_at,
    freeExtractsUsed: usedByUser.get(row.id) ?? 0,
  }));
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
  if (error) throw error;
}
