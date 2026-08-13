import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DailyAiAction = 'substitution' | 'translation';

export function currentUtcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function reserveDailyAiUsage(
  admin: SupabaseClient,
  userId: string,
  action: DailyAiAction,
  limit: number,
  usageDate = currentUtcDate(),
): Promise<'ok' | 'limited' | 'error'> {
  const { data, error } = await admin.rpc('reserve_daily_ai_usage', {
    p_user_id: userId,
    p_action: action,
    p_usage_date: usageDate,
    p_limit: limit,
  });
  if (error) {
    console.error('[dailyAiUsage] reserve_daily_ai_usage', error);
    return 'error';
  }
  return Number(data) < 0 ? 'limited' : 'ok';
}

export async function refundDailyAiUsage(
  admin: SupabaseClient,
  userId: string,
  action: DailyAiAction,
  usageDate: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('refund_daily_ai_usage', {
    p_user_id: userId,
    p_action: action,
    p_usage_date: usageDate,
  });
  if (error) console.error('[dailyAiUsage] refund_daily_ai_usage', error);
  return !error && data === true;
}
