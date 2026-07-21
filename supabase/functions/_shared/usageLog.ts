import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  estimateScrapeCreatorsCostUsd,
  sumGeminiUsages,
  type GeminiUsageSnapshot,
} from './pricing.ts';

export interface UsageEventInput {
  userId?: string | null;
  guestInstallId?: string | null;
  action: 'extract' | 'remix' | 'substitution' | 'translate';
  platform?: string | null;
  status: string;
  extractionSource?: string | null;
  usages?: GeminiUsageSnapshot[];
  scrapecreatorsCredits?: number;
  tokensCharged?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logUsageEvent(
  admin: SupabaseClient | null,
  input: UsageEventInput,
): Promise<string | null> {
  if (!admin) return null;

  const summed = sumGeminiUsages(input.usages ?? []);
  const scrapecreatorsCredits = input.scrapecreatorsCredits ?? 0;
  const scrapecreatorsCostUsd = estimateScrapeCreatorsCostUsd(scrapecreatorsCredits);
  const totalCostUsd = summed.geminiCostUsd + scrapecreatorsCostUsd;

  const row = {
    user_id: input.userId ?? null,
    guest_install_id: input.guestInstallId ?? null,
    action: input.action,
    platform: input.platform ?? null,
    status: input.status,
    extraction_source: input.extractionSource ?? null,
    model: summed.model,
    prompt_tokens: summed.promptTokens,
    output_tokens: summed.outputTokens,
    thinking_tokens: summed.thinkingTokens,
    total_tokens: summed.totalTokens,
    gemini_cost_usd: roundUsd(summed.geminiCostUsd),
    scrapecreators_credits: scrapecreatorsCredits,
    scrapecreators_cost_usd: roundUsd(scrapecreatorsCostUsd),
    total_cost_usd: roundUsd(totalCostUsd),
    tokens_charged: input.tokensCharged ?? 0,
    duration_ms: input.durationMs ?? null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await admin.from('ai_usage_events').insert(row).select('id').maybeSingle();
  if (error) {
    console.error('[usageLog] insert failed', error);
    return null;
  }
  return data?.id ?? null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
