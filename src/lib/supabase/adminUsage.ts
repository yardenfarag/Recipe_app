import { parseLlmCalls, type AiCostRow } from '@/lib/aiCostSummary';
import { parseCreditHealth, type CreditHealth } from '@/lib/creditHealth';
import { supabase } from '@/lib/supabase/client';

export interface AiUsageEvent {
  id: string;
  user_id: string | null;
  guest_install_id: string | null;
  action: string;
  platform: string | null;
  status: string;
  extraction_source: string | null;
  model: string | null;
  prompt_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
  gemini_cost_usd: number;
  scrapecreators_credits: number;
  scrapecreators_cost_usd: number;
  total_cost_usd: number;
  tokens_charged: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface TokenLedgerRow {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export async function fetchAdminUsageEvents(limit = 100): Promise<AiUsageEvent[]> {
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select(
      'id, user_id, guest_install_id, action, platform, status, extraction_source, model, prompt_tokens, output_tokens, thinking_tokens, total_tokens, gemini_cost_usd, scrapecreators_credits, scrapecreators_cost_usd, total_cost_usd, tokens_charged, duration_ms, error_message, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AiUsageEvent[];
}

export async function fetchAdminProductEvents(since?: string, limit = 2000): Promise<
  {
    name: string;
    properties: Record<string, unknown>;
    created_at: string;
    user_id: string | null;
    guest_install_id: string | null;
    country: string | null;
  }[]
> {
  let query = supabase
    .from('product_events')
    .select('name, properties, created_at, user_id, guest_install_id, country')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) query = query.gte('created_at', since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    name: String(row.name),
    properties:
      row.properties && typeof row.properties === 'object' && !Array.isArray(row.properties)
        ? (row.properties as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    user_id: row.user_id ?? null,
    guest_install_id: row.guest_install_id ?? null,
    country: typeof row.country === 'string' ? row.country : null,
  }));
}

export async function fetchAdminFailures(since?: string, limit = 2000): Promise<
  {
    action: string;
    status: string;
    platform: string | null;
    extraction_source: string | null;
    error_message: string | null;
    total_cost_usd: number;
    created_at: string;
  }[]
> {
  let query = supabase
    .from('ai_usage_events')
    .select('action, status, platform, extraction_source, error_message, total_cost_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) query = query.gte('created_at', since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    action: String(row.action),
    status: String(row.status),
    platform: row.platform ?? null,
    extraction_source: row.extraction_source ?? null,
    error_message: row.error_message ?? null,
    total_cost_usd: Number(row.total_cost_usd) || 0,
    created_at: String(row.created_at),
  }));
}

export type AdminPurchase = {
  id: string;
  email: string | null;
  provider: string;
  productId: string;
  credits: number;
  createdAt: string;
};

export async function fetchAdminPurchases(since?: string, limit = 200): Promise<AdminPurchase[]> {
  let query = supabase
    .from('purchase_credit_grants')
    .select('id, provider, product_id, credits, created_at, profiles(email)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) query = query.gte('created_at', since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = row.profiles as { email?: string | null } | { email?: string | null }[] | null;
    const email = Array.isArray(profile) ? (profile[0]?.email ?? null) : (profile?.email ?? null);
    return {
      id: String(row.id),
      email,
      provider: String(row.provider),
      productId: String(row.product_id),
      credits: Number(row.credits) || 0,
      createdAt: String(row.created_at),
    };
  });
}

export async function fetchCreditHealth(): Promise<CreditHealth> {
  const { data, error } = await supabase.rpc('admin_credit_health');
  if (error) throw error;
  return parseCreditHealth(data);
}

export async function fetchAdminTokenLedger(limit = 100): Promise<TokenLedgerRow[]> {
  const { data, error } = await supabase
    .from('token_ledger')
    .select('id, user_id, delta, balance_after, reason, ref_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TokenLedgerRow[];
}

export function formatUsageAction(action: string): string {
  if (action === 'content_gate') return 'Food check';
  if (action === 'extract_gate') return 'Jev gate';
  if (action === 'invent') return 'Invent';
  if (action === 'extract') return 'Extract';
  if (action === 'remix') return 'Remix';
  return action;
}

const COST_PAGE_SIZE = 1000;
/** Hard cap so a busy month can't stall the admin screen. */
export const COST_ROW_CAP = 10_000;

/**
 * Every usage event since `sinceIso`, newest first, for the cost dashboard.
 * Pulls only the per-call breakdown out of `metadata`, not the whole blob.
 */
export async function fetchAdminCostRows(
  sinceIso: string,
): Promise<{ rows: AiCostRow[]; truncated: boolean }> {
  const rows: AiCostRow[] = [];
  for (let from = 0; from < COST_ROW_CAP; from += COST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ai_usage_events')
      .select(
        'action, status, model, prompt_tokens, output_tokens, thinking_tokens, gemini_cost_usd, scrapecreators_cost_usd, total_cost_usd, duration_ms, created_at, llm_calls:metadata->llm_calls',
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + COST_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const r of page as Record<string, unknown>[]) {
      rows.push({
        action: String(r.action),
        status: String(r.status),
        model: typeof r.model === 'string' ? r.model : null,
        prompt_tokens: Number(r.prompt_tokens) || 0,
        output_tokens: Number(r.output_tokens) || 0,
        thinking_tokens: Number(r.thinking_tokens) || 0,
        gemini_cost_usd: Number(r.gemini_cost_usd) || 0,
        scrapecreators_cost_usd: Number(r.scrapecreators_cost_usd) || 0,
        total_cost_usd: Number(r.total_cost_usd) || 0,
        duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
        llm_calls: parseLlmCalls(r.llm_calls),
        created_at: String(r.created_at),
      });
    }
    if (page.length < COST_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
