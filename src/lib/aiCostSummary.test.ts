import { describe, expect, it } from 'vitest';

import {
  callsForRow,
  formatTokens,
  formatUsd,
  parseLlmCalls,
  percentile,
  shortModelName,
  summarizeAiCost,
  summarizeImports,
  type AiCostRow,
} from '@/lib/aiCostSummary';

function row(overrides: Partial<AiCostRow> = {}): AiCostRow {
  return {
    action: 'extract',
    status: 'full',
    model: null,
    prompt_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    gemini_cost_usd: 0,
    scrapecreators_cost_usd: 0,
    total_cost_usd: 0,
    duration_ms: null,
    llm_calls: null,
    created_at: '2026-10-15T12:00:00Z',
    platform: null,
    extraction_source: null,
    video_downloaded: null,
    video_duration_seconds: null,
    ...overrides,
  };
}

describe('callsForRow', () => {
  it('uses the per-call breakdown when present', () => {
    const calls = callsForRow(
      row({
        model: 'google/gemini-3.5-flash',
        llm_calls: [
          { kind: 'text', model: 'openai/gpt-6-luna', prompt_tokens: 1000, output_tokens: 500, thinking_tokens: 0, cost_usd: 0.0004 },
          { kind: 'video', model: 'google/gemini-3.5-flash', prompt_tokens: 9000, output_tokens: 800, thinking_tokens: 100, cost_usd: 0.02 },
        ],
      }),
    );
    expect(calls.map((c) => c.model)).toEqual(['openai/gpt-6-luna', 'google/gemini-3.5-flash']);
  });

  it('treats a legacy row as one call on its model, keyed by action', () => {
    expect(
      callsForRow(row({ action: 'translate', model: 'gemini-3.1-flash-lite', prompt_tokens: 700, output_tokens: 800, gemini_cost_usd: 0.0019 })),
    ).toEqual([
      { kind: 'translate', model: 'gemini-3.1-flash-lite', prompt_tokens: 700, output_tokens: 800, thinking_tokens: 0, cost_usd: 0.0019 },
    ]);
  });

  it('counts no call for a cached or model-less row', () => {
    expect(callsForRow(row({ status: 'cached' }))).toEqual([]);
    expect(callsForRow(row({ model: 'x', prompt_tokens: 0, output_tokens: 0, gemini_cost_usd: 0 }))).toEqual([]);
  });
});

describe('parseLlmCalls', () => {
  it('keeps valid entries and drops malformed ones', () => {
    expect(parseLlmCalls(null)).toBeNull();
    expect(
      parseLlmCalls([
        { kind: 'photo', model: 'anthropic/claude-sonnet-5.5', prompt_tokens: '2600', output_tokens: 80, cost_usd: 0.02 },
        { kind: 'photo' },
        'nope',
      ]),
    ).toEqual([
      { kind: 'photo', model: 'anthropic/claude-sonnet-5.5', prompt_tokens: 2600, output_tokens: 80, thinking_tokens: 0, cost_usd: 0.02 },
    ]);
  });
});

describe('summarizeAiCost', () => {
  const rows: AiCostRow[] = [
    row({
      action: 'extract',
      status: 'full',
      gemini_cost_usd: 0.0204,
      scrapecreators_cost_usd: 0.002,
      total_cost_usd: 0.0224,
      duration_ms: 9000,
      llm_calls: [
        { kind: 'text', model: 'openai/gpt-6-luna', prompt_tokens: 1000, output_tokens: 500, thinking_tokens: 0, cost_usd: 0.0004 },
        { kind: 'video', model: 'google/gemini-3.5-flash', prompt_tokens: 9000, output_tokens: 800, thinking_tokens: 200, cost_usd: 0.02 },
      ],
    }),
    row({
      action: 'extract',
      status: 'failed',
      gemini_cost_usd: 0.0003,
      total_cost_usd: 0.0003,
      duration_ms: 3000,
      llm_calls: [{ kind: 'text', model: 'openai/gpt-6-luna', prompt_tokens: 900, output_tokens: 100, thinking_tokens: 0, cost_usd: 0.0003 }],
    }),
    row({ action: 'extract', status: 'cached', duration_ms: 200 }),
    row({
      action: 'translate',
      status: 'ok',
      model: 'gemini-3.1-flash-lite',
      prompt_tokens: 700,
      output_tokens: 800,
      gemini_cost_usd: 0.0019,
      total_cost_usd: 0.0019,
      duration_ms: 3500,
    }),
  ];
  const s = summarizeAiCost(rows);

  it('totals cost, tokens and calls', () => {
    expect(s.events).toBe(4);
    expect(s.llmCalls).toBe(4);
    expect(s.modelCostUsd).toBeCloseTo(0.0226, 6);
    expect(s.scrapeCostUsd).toBeCloseTo(0.002, 6);
    expect(s.totalCostUsd).toBeCloseTo(0.0246, 6);
    expect(s.promptTokens).toBe(11600);
    expect(s.outputTokens).toBe(2200);
    expect(s.thinkingTokens).toBe(200);
  });

  it('counts successful recipes and cost per recipe', () => {
    expect(s.successfulRecipes).toBe(1);
    expect(s.costPerRecipeUsd).toBeCloseTo(0.0246, 6);
  });

  it('splits cost by model, sorted by cost, with share and blended rate', () => {
    expect(s.byModel.map((m) => m.model)).toEqual(['google/gemini-3.5-flash', 'gemini-3.1-flash-lite', 'openai/gpt-6-luna']);
    const luna = s.byModel.find((m) => m.model === 'openai/gpt-6-luna')!;
    expect(luna.calls).toBe(2);
    expect(luna.costUsd).toBeCloseTo(0.0007, 6);
    expect(luna.avgCostUsd).toBeCloseTo(0.00035, 6);
    expect(luna.usdPerMTokens).toBeCloseTo((0.0007 / 2500) * 1_000_000, 4);
    const shares = s.byModel.reduce((sum, m) => sum + m.costShare, 0);
    expect(shares).toBeCloseTo(1, 6);
  });

  it('groups by task kind and lists the models used', () => {
    const text = s.byTask.find((t) => t.kind === 'text')!;
    expect(text.calls).toBe(2);
    expect(text.models).toEqual(['openai/gpt-6-luna']);
    expect(s.byTask.find((t) => t.kind === 'translate')?.models).toEqual(['gemini-3.1-flash-lite']);
  });

  it('reports per-action failures, cache hits and latency percentiles', () => {
    const extract = s.byAction.find((a) => a.action === 'extract')!;
    expect(extract.events).toBe(3);
    expect(extract.failed).toBe(1);
    expect(extract.cached).toBe(1);
    expect(extract.p50Ms).toBe(3000);
    expect(extract.p95Ms).toBe(9000);
  });

  it('handles an empty window', () => {
    const empty = summarizeAiCost([]);
    expect(empty.costPerRecipeUsd).toBeNull();
    expect(empty.byModel).toEqual([]);
  });
});

describe('summarizeImports', () => {
  const ig = { action: 'extract', platform: 'instagram' } as const;
  const s = summarizeImports([
    row({ ...ig, extraction_source: 'comments', total_cost_usd: 0.004 }),
    row({ ...ig, extraction_source: 'comments', total_cost_usd: 0.002 }),
    row({ ...ig, extraction_source: 'description', status: 'partial', total_cost_usd: 0.003 }),
    row({ ...ig, extraction_source: 'video', total_cost_usd: 0.03, video_duration_seconds: 40, video_downloaded: false }),
    row({ ...ig, extraction_source: 'video', total_cost_usd: 0.09, video_duration_seconds: 120, video_downloaded: true }),
    row({ ...ig, extraction_source: 'video', status: 'failed', total_cost_usd: 0.01 }),
    row({ ...ig, extraction_source: null, status: 'cached', total_cost_usd: 0 }),
    row({ action: 'invent', status: 'full', total_cost_usd: 1 }),
  ]);

  it('counts the video fallback rate over successful imports only', () => {
    expect(s.imports).toBe(5);
    expect(s.videoImports).toBe(2);
    expect(s.videoShare).toBeCloseTo(0.4);
    expect(s.videoDownloads).toBe(1);
  });

  it('charges failed attempts to the cost per import', () => {
    expect(s.blendedCostUsd).toBeCloseTo(0.139 / 5);
    expect(s.videoCostPerImportUsd).toBeCloseTo(0.13 / 2);
    expect(s.textCostPerImportUsd).toBeCloseTo(0.009 / 3);
  });

  it('reports video length and a line per platform and step', () => {
    expect(s.videoDurationP50).toBe(40);
    expect(s.videoDurationP95).toBe(120);
    const video = s.bySource.find((l) => l.source === 'video')!;
    expect(video).toMatchObject({ platform: 'instagram', imports: 2, failed: 1, maxCostUsd: 0.09 });
    expect(video.costPerImportUsd).toBeCloseTo(0.065);
    expect(s.bySource.some((l) => l.source === 'none')).toBe(false);
  });

  it('handles a window without imports', () => {
    const empty = summarizeImports([row({ action: 'remix' })]);
    expect(empty).toMatchObject({ imports: 0, videoShare: null, blendedCostUsd: null, bySource: [] });
  });
});

describe('formatting helpers', () => {
  it('formats percentiles, models, tokens and dollars', () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBeNull();
    expect(shortModelName('openai/gpt-6-luna')).toBe('gpt-6-luna');
    expect(shortModelName('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(45_600)).toBe('46k');
    expect(formatTokens(4_100_000)).toBe('4.1M');
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.00035)).toBe('$0.00035');
    expect(formatUsd(0.0246)).toBe('$0.025');
    expect(formatUsd(3.5)).toBe('$3.50');
  });
});
