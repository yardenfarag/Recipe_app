# ADR 014: Guess the recipe (invent) + food gate

**Status:** Accepted
**Date:** 2026-08-29
**Deciders:** Yarden (product)

## Context

Snap extracts a recipe that already exists in a photo or link. Users also snap plated food, drinks, and aesthetic posts with no written recipe. Extract prompts forbid invention, so those inputs fail. A separate invent path can guess a home-cook version, with a visible disclaimer. Non-food inputs must be rejected before we spend an extract credit or watch video.

## Decision

- Snap stays extract-only. **Guess the recipe** invents a recipe (`extraction_source: invented`).
- Both live on the Snap tab as two intents. Same inputs: camera, library, paste URL, share (YouTube / Instagram / TikTok / web, including video).
- A cheap **content gate** (`content_gate` daily cap) classifies `written_recipe` | `plated_dish` | `mixed` | `unrelated` **before** credit reserve and before the video rung.
  - `unrelated` → `not_food`, no credit
  - Snap + `plated_dish` → `looks_like_dish`, confirm, then `invent-recipe`
  - Snap + written/mixed → extract as today
  - Invent mode still runs the gate (a cat photo cannot invent)
- Successful invent costs **1 extract credit**, same reservation as Snap.
- User photos upload to `recipe-thumbnails` and become `image_url` for extract and invent.
- Origin stays visible: mode toggle, invent loading copy, preview/detail banner, library “Guessed” chip. Repair is extract-only.
- `invent-recipe` uses OpenRouter for text/image; video `fileUri` stays native Gemini (ADR 013).

## Consequences

- Cake photos can become recipes without pretending they were extracted.
- Classify spam is capped (generous daily limit); extract credits are not spent on selfies.
- Invented recipes are complete-looking but untrusted — copy must never reuse the partial-extract warning.
