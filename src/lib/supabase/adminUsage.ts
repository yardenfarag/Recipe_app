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

export async function fetchAdminTokenLedger(limit = 100): Promise<TokenLedgerRow[]> {
  const { data, error } = await supabase
    .from('token_ledger')
    .select('id, user_id, delta, balance_after, reason, ref_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TokenLedgerRow[];
}

export function summarizeUsage(events: AiUsageEvent[]) {
  const totals = {
    events: events.length,
    geminiCostUsd: 0,
    scrapecreatorsCostUsd: 0,
    totalCostUsd: 0,
    tokensCharged: 0,
    promptTokens: 0,
    outputTokens: 0,
    extracts: 0,
    remixes: 0,
    cached: 0,
    failed: 0,
  };

  for (const event of events) {
    totals.geminiCostUsd += Number(event.gemini_cost_usd) || 0;
    totals.scrapecreatorsCostUsd += Number(event.scrapecreators_cost_usd) || 0;
    totals.totalCostUsd += Number(event.total_cost_usd) || 0;
    totals.tokensCharged += event.tokens_charged || 0;
    totals.promptTokens += event.prompt_tokens || 0;
    totals.outputTokens += event.output_tokens || 0;
    if (event.action === 'extract') totals.extracts += 1;
    if (event.action === 'remix') totals.remixes += 1;
    if (event.status === 'cached') totals.cached += 1;
    if (event.status === 'failed' || event.status === 'error') totals.failed += 1;
  }

  return totals;
}
