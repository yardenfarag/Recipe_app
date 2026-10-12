// PIN-28 shortlist under test. The last model per task is what production runs
// today (`native:` = direct Gemini API, as in the Edge Functions).

export const TASK_MODELS = {
  text: ['openai/gpt-6-luna', 'mistralai/mistral-small-2603', 'qwen/qwen3.8-flash', 'native:gemini-3.1-flash-lite'],
  photo: ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol', 'openai/gpt-6-luna', 'google/gemini-2.5-flash'],
  translate: ['anthropic/claude-sonnet-5.5@low', 'openai/gpt-6.1-sol@low', 'openai/gpt-6-luna', 'native:gemini-3.1-flash-lite'],
  invent: ['anthropic/claude-sonnet-5.5@low', 'openai/gpt-6.1-sol@low', 'openai/gpt-6-luna', 'google/gemini-2.5-flash'],
  content_gate: ['mistralai/mistral-small-2603', 'openai/gpt-5.4-nano', 'native:gemini-3.1-flash-lite'],
  // Native Gemini hit the local key's quota mid-run (6 Oct); same model through OpenRouter.
  video: ['qwen/qwen3.8-omni-flash', 'xiaomi/mimo-v2.6-flash', 'google/gemini-3.5-flash'],
  // `jev:` goes through the Decisions API; the chat model is a baseline.
  extract_gate: ['jev:typesafe/jev-1.13', 'openai/gpt-6-luna'],
} as const;

export type Task = keyof typeof TASK_MODELS;

/** Ranks translate/invent outputs. Google, so it has no stake in the Anthropic/OpenAI candidates. */
export const RANK_JUDGE = 'google/gemini-3.1-pro-preview';
/** Matches extracted ingredients against the reference. Not a candidate in any extraction task. */
export const MATCH_JUDGE = 'anthropic/claude-opus-5.5';
