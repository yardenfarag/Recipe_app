// Shortlist per task. The first entries in each list are what production runs today
// (TASK_MODELS in supabase/functions/_shared/llm/llmClient.ts: primary, then fallback);
// the rest are the 2026-11-23 bake-off candidates. A bare slug runs at the production
// task's reasoning effort; `model@low` pins it (Muse Ember refuses `none`, so it runs @low on
// text tasks). The PIN-44 (12 Oct) rows are in git history; findings: results/bakeoff-2026-11-23.md.

export const TASK_MODELS = {
  text: [
    'openai/gpt-6-luna',
    'qwen/qwen3.8-flash',
    'anthropic/claude-haiku-5.5',
    'meta/muse-ember@low',
    'tencent/hy4-flash',
    'deepseek/deepseek-v4.1-flash-1017',
  ],
  photo: [
    'anthropic/claude-sonnet-5.5',
    'openai/gpt-6.1-sol',
    'anthropic/claude-haiku-5.5',
    'openai/gpt-6.1-terra',
    'google/gemini-4-hydrogen',
  ],
  translate: [
    'openai/gpt-6.1-sol@low',
    'openai/gpt-6-luna',
    'openai/gpt-6.2-sol@low',
    'openai/gpt-6.1-terra@low',
    'google/gemini-4-hydrogen@low',
    'anthropic/claude-haiku-5.5@low',
  ],
  invent: [
    'anthropic/claude-sonnet-5.5@low',
    'openai/gpt-6.1-sol@low',
    'openai/gpt-6.2-sol@low',
    'openai/gpt-6.1-terra@low',
    'google/gemini-4-hydrogen@low',
    'anthropic/claude-haiku-5.5@low',
  ],
  content_gate: [
    'mistralai/mistral-small-2603',
    'openai/gpt-5.4-nano',
    'anthropic/claude-haiku-5.5',
    'tencent/hy4-flash',
    'thinkingmachines/inkling-2-mini',
    'meta/muse-ember@low',
  ],
  video: [
    'google/gemini-3.5-flash',
    'qwen/qwen3.8-omni-flash',
    'google/gemini-4-hydrogen',
    'meta/muse-ember',
    'minimax/minimax-m3.1-flash',
    'nvidia/nemotron-3.5-super-vl',
    'qwen/qwen4-max',
  ],
  // `jev:` goes through the Decisions API; the chat model is a baseline. Not rerun on 2026-11-23.
  extract_gate: ['jev:typesafe/jev-1.13', 'jev:typesafe/jev-1.14', 'jev:openai/gpt-6-luna-decisions', 'openai/gpt-6-luna'],
} as const;

export type Task = keyof typeof TASK_MODELS;

/**
 * Rank translate/invent outputs blind. Two judges from different vendors, so no candidate is
 * graded only by its own vendor (Gemini 4 Hydrogen and Haiku 5.5 are candidates; the OpenAI
 * candidates have no judge of their own). The report shows each judge's ranks side by side.
 */
export const RANK_JUDGES = ['google/gemini-3.1-pro-preview', 'anthropic/claude-opus-5.5'] as const;
/** Matches extracted ingredients against the reference. Not a candidate in any extraction task. */
export const MATCH_JUDGE = 'anthropic/claude-opus-5.5';
