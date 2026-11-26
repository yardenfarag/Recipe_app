import { HttpError } from './httpError.ts';
import type { Db } from './supabaseAdmin.ts';

export type DailyAiAction =
  | 'substitution'
  | 'translation'
  | 'fridge_match'
  | 'content_gate'
  | 'remix'
  | 'extract_attempt'
  /** Background recalculation after a hand edit or written recipe (PIN-79). */
  | 'recipe_edit'
  /** One photo of a pantry scan (PIN-181). */
  | 'pantry_scan';

export function currentUtcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Admins have no daily caps (they seed the Hub and test at volume). Their use is still counted,
 * so the RPC gets the largest int instead of skipping it. Credits still apply.
 */
export const ADMIN_DAILY_LIMIT = 2_147_483_647;

async function isAdminUser(admin: Db, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (error) {
    // Fail closed: a lookup error keeps the normal limit.
    console.error('[dailyAiUsage] admin lookup', error);
    return false;
  }
  return data?.is_admin === true;
}

export async function reserveDailyAiUsage(
  admin: Db,
  userId: string,
  action: DailyAiAction,
  limit: number,
  usageDate = currentUtcDate(),
): Promise<'ok' | 'limited' | 'error'> {
  const effectiveLimit = (await isAdminUser(admin, userId)) ? ADMIN_DAILY_LIMIT : limit;
  const { data, error } = await admin.rpc('reserve_daily_ai_usage', {
    p_user_id: userId,
    p_action: action,
    p_usage_date: usageDate,
    p_limit: effectiveLimit,
  });
  if (error) {
    console.error('[dailyAiUsage] reserve_daily_ai_usage', error);
    return 'error';
  }
  return Number(data) < 0 ? 'limited' : 'ok';
}

export async function refundDailyAiUsage(
  admin: Db,
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

/** The bodies translate-recipe, suggest-substitution and match-fridge already send. */
const DAILY_LIMIT = new HttpError(429, 'daily_limit', 'daily_limit');
const METERING_ERROR = new HttpError(500, 'metering_error', 'metering_error');

export interface DailyAiUsageOptions {
  usageDate?: string;
  /** Thrown when the cap is reached. Default: 429 `{ status: 'failed', code: 'daily_limit', message: 'daily_limit' }`. */
  limited?: HttpError;
  /** Thrown when the counter can't be reached. Default: 500 `{ ..., code: 'metering_error', message: 'metering_error' }`. */
  meteringError?: HttpError;
  /** Runs before `limited` is thrown, e.g. to log the refused call. */
  onLimited?: () => Promise<unknown>;
}

/**
 * Reserves one of today's `limit` uses of `action`, runs `work`, and gives the use back if `work` throws (an
 * `HttpError` included). Handlers write no refund code (ADR 024 §3). The refund finishes before the error goes on.
 */
export async function withDailyAiUsage<T>(
  admin: Db,
  userId: string,
  action: DailyAiAction,
  limit: number,
  work: () => Promise<T>,
  options: DailyAiUsageOptions = {},
): Promise<T> {
  const usageDate = options.usageDate ?? currentUtcDate();
  const reserved = await reserveDailyAiUsage(admin, userId, action, limit, usageDate);
  if (reserved === 'limited') {
    await options.onLimited?.();
    throw options.limited ?? DAILY_LIMIT;
  }
  if (reserved === 'error') throw options.meteringError ?? METERING_ERROR;
  try {
    return await work();
  } catch (err) {
    await refundDailyAiUsage(admin, userId, action, usageDate);
    throw err;
  }
}

export async function reserveGuestDailyAiUsage(
  admin: Db,
  installId: string,
  action: DailyAiAction,
  limit: number,
  usageDate = currentUtcDate(),
): Promise<'ok' | 'limited' | 'error'> {
  const { data, error } = await admin.rpc('reserve_guest_daily_ai_usage', {
    p_install_id: installId,
    p_action: action,
    p_usage_date: usageDate,
    p_limit: limit,
  });
  if (error) {
    console.error('[dailyAiUsage] reserve_guest_daily_ai_usage', error);
    return 'error';
  }
  return Number(data) < 0 ? 'limited' : 'ok';
}

export async function refundGuestDailyAiUsage(
  admin: Db,
  installId: string,
  action: DailyAiAction,
  usageDate: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('refund_guest_daily_ai_usage', {
    p_install_id: installId,
    p_action: action,
    p_usage_date: usageDate,
  });
  if (error) console.error('[dailyAiUsage] refund_guest_daily_ai_usage', error);
  return !error && data === true;
}
