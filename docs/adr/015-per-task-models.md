# ADR 015: One model per AI task, all through OpenRouter

**Status:** Accepted
**Date:** 2026-10-15
**Deciders:** Yarden (product)
**Tickets:** PIN-28 (research), PIN-44 (eval), PIN-45 (this change), PIN-46 (Jev gate)

## Context

ADR 013 routed text and image calls through OpenRouter in two tiers (`fast`, `standard`) and kept video on Google's Gemini API directly. Both tiers defaulted to Gemini Flash models. The PIN-44 eval ran the shortlist on real Pinch inputs and found that no single tier fits every task: the text extract spent 7.8 s on Flash-Lite where GPT-6 Luna takes 0.7 s with better recall, handwritten recipe cards need Sonnet-class vision, Hebrew translation is best on GPT-6.1 Sol, and the food gate only needs a fast small vision model. Video stays best on Gemini 3.5 Flash, but it can be called through OpenRouter like everything else.

Two production facts shaped the design. OpenRouter rejects the whole request when any fallback slug is retired (this silently broke the fast tier for weeks). And OpenRouter only forwards video *URLs* to providers that fetch them; on Google AI Studio that means YouTube links only, so Instagram and TikTok clips have to be sent inline.

## Decision

- `generateLlmJson` picks its model from `TASK_MODELS`, keyed by the call's `kind` (`supabase/functions/_shared/llmClient.ts`). Each entry has a primary, an ordered fallback list sent as `models[]`, and a reasoning effort. `tier` is only a fallback for unknown kinds.

| `kind` | Primary | Fallback | Reasoning |
|---|---|---|---|
| `text`, `transform`, `substitution`, `fridge_match`, `remix_related` | `openai/gpt-6-luna` | `qwen/qwen3.8-flash` | none |
| `photo`, `repair`, `invent_photo` | `anthropic/claude-sonnet-5.5` | `openai/gpt-6.1-sol` | low |
| `translate`, `invent_text` | `openai/gpt-6.1-sol` | `openai/gpt-6-luna` | low |
| `content_gate` | `mistralai/mistral-small-2603` | `openai/gpt-5.4-nano` | none |
| `video`, `invent_video` | `google/gemini-3.5-flash` | `qwen/qwen3.8-omni-flash` | low |

- Per-task env overrides: `OPENROUTER_MODEL_<KIND>`, `OPENROUTER_FALLBACKS_<KIND>` (comma list or `none`), `OPENROUTER_REASONING_<KIND>`. The old `OPENROUTER_MODEL`, `OPENROUTER_FAST_MODEL`, `*_FALLBACKS`, `GEMINI_MODEL` and `GEMINI_FAST_MODEL` are no longer read.
- Every request sets `provider.require_parameters: true` so hosts that ignore `response_format` are skipped, and `provider.ignore: ['azure']` for `anthropic/*` models, whose Azure host cuts JSON off with a content filter.
- Sonnet 5.5 and GPT-6.1 Sol reject `reasoning: none`, so their tasks send `low`.
- A top-level JSON array is unwrapped to its first object when the schema asks for an object (Qwen wraps most video answers).
- **Video goes through OpenRouter.** `videoInput.ts` resolves the clip: YouTube URLs pass through as `video_url`; every other clip is downloaded in the function (20 MB cap, 25 s) and sent inline as a base64 `video_url`. Instagram's CDN serves the clip to a browser-style fetch, so the paid ScrapeCreators `download_media` copy is only fetched when the CDN refuses (it used to be fetched every time, about 10 extra credits per video rung). Clips that cannot be downloaded or are too large skip the video rung, as before.
- **Native Gemini is removed.** `geminiClient.ts` is deleted and `GEMINI_API_KEY` is no longer read.
- **Cost** is recorded from OpenRouter's `usage.cost` on every call (`GeminiUsageSnapshot.costUsd`). The rate table in `pricing.ts` is only a fallback and now has a row for every default slug.
- `llmClient_test.ts` has a live test that checks every default slug against `GET /api/v1/models`. Run it before deploying a model change.

## Consequences

- One secret for all AI: `OPENROUTER_API_KEY`. Fewer moving parts, one bill, one place to change models.
- Text extraction and the food gate get several seconds faster; translation quality in Hebrew improves; photo extraction gets more accurate at a higher per-call cost that the credit already covers.
- Video needs the function to download the clip. That adds a few seconds and memory per video rung, and clips over 20 MB have no video rung at all. Qwen as a fallback is slow (about a minute); the rung's 120 s budget covers the normal case.
- Sonnet 5.5 refuses some harmless captions outright. The fallback catches most of these; refusals are logged as `OpenRouter returned no content` with the finish reason.
- Rerun the eval (`eval/README.md`) when a default changes, and keep `eval/models.ts` in step with `TASK_MODELS`.
