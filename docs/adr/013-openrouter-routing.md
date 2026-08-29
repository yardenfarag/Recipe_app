# ADR 013: OpenRouter routing + photo Snap

**Status:** Accepted
**Date:** 2026-08-29
**Deciders:** Yarden (product)

## Context

Pinch called Google Gemini directly for every AI job. Video extract needs Gemini `fileData.fileUri`. Text jobs (swap, remix, translate, text extract) and vision (photos) do not. A single-provider outage takes down Snap. Video fallback is the expensive path; cheap text should not use the video model.

## Decision

- Edge Functions call `generateLlmJson` ([`llmClient.ts`](../../supabase/functions/_shared/llmClient.ts)).
- **Text and image** jobs use OpenRouter when `OPENROUTER_API_KEY` or `OPEN_ROUTER_API_KEY` is set, with model fallbacks and `data_collection: deny`. Failures fall back to native Gemini.
- **Video `fileUri`** stays on native Gemini `generateContent`.
- Extract ladder: a **partial** text result (title + ingredients or steps, not both) still tries the video rung before returning. One user-facing credit.
- Photo Snap sends `{ image_base64 }` to `extract-recipe`, `platform: photo`, same credit rules as a URL extract. No ScrapeCreators.
- Substitution logs `ai_usage_events` like extract/remix/translate.
- **Repair** (`repair-recipe`) is a second extract credit only when a partial recipe upgrades (full, or missing ingredients/steps filled).
- **Fridge match** (`match-fridge`) is free with a daily cap (`fridge_match` on `ai_usage_daily` / `guest_ai_usage_daily`).
- Kitchen auto-apply calls `transform-recipe` with `kitchen_auto_apply: true` and does **not** increment remix usage.

## Consequences

- Snap keeps working if Google rate-limits text calls.
- Provider cost for swap/translate/remix drops when routed to Flash-Lite-class OpenRouter models.
- Photo capture expands Snap beyond social URLs.
- Two secrets must stay server-side (`GEMINI_API_KEY` for video, OpenRouter for the rest).
- OpenRouter JSON schema is non-strict so existing Gemini schemas keep working.
