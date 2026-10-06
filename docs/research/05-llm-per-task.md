# Pinch: best LLM per AI task (PIN-28)

> Researched 6 October 2026. Model prices, context sizes, input types and structured-output support come from OpenRouter's live model API on that date. Speed figures come from Artificial Analysis, often measured at high reasoning effort, so treat them as rough. Production numbers come from `ai_usage_events` (20 Jul to 6 Oct 2026) and Edge Function logs. **No model in this doc has been tested on Pinch inputs yet.** The recommendations are a shortlist for the eval in the follow-up ticket, not final picks.

## Executive conclusion

1. **The OpenRouter fast tier has been failing on every call.** The fallback list `DEFAULT_FAST_FALLBACKS` includes `google/gemini-2.0-flash`, which OpenRouter no longer recognises. OpenRouter rejects the whole request with `400 "google/gemini-2.0-flash is not a valid model ID"` (seen in logs on 5 and 6 Oct). `generateLlmJson` then quietly falls back to native `gemini-3.1-flash-lite`. So every extract, translate, swap, remix, fridge-match and content-gate call since ADR 013 shipped has gone to native Gemini after a failed round trip. Only the `standard` tier (invent, photo) actually runs on OpenRouter. **Fix this first, separately from the model choice.**
2. **At current volume, cost doesn't matter.** Total model spend over the last 60 days was about **$0.30**. The cheapest and the priciest reasonable model for each task differ by less than 2¢ per call. Pick for quality and speed first, then cost.
3. **Replace Gemini with Qwen (decided).** Every text and image task has strong non-Google options. Video moves to `qwen/qwen3.8-omni-flash` through OpenRouter `video_url`, with Xiaomi MiMo as the fallback. After that, native Gemini and `GEMINI_API_KEY` can be removed.
4. **Switch to per-task model config.** The two global tiers (`fast` / `standard`) lump together jobs with very different needs: a 25-token yes/no gate, Hebrew translation, creative recipe invention. A map keyed by the existing `kind` values costs little to build and lets each task be tuned on its own.
5. **Use Jev for yes/no and pick-one decisions.** TypeSafe's Jev ($0.042 per 1M input, output free, text only) fits a new "is this worth extracting?" gate in front of the 19 s text extract, plus the remix relatedness check.

## What production actually does

From `ai_usage_events`, last 60 days, successful model calls:

| Task (`action` / source) | Calls | Avg in | p95 in | Avg out | p50 latency | p95 latency | Model actually used |
|---|---:|---:|---:|---:|---:|---:|---|
| content_gate | 48 | 1,345 | 1,902 | 25 | **8.4 s** | 18.4 s | native gemini-3.1-flash-lite |
| extract / comments | 42 | 1,397 | 1,924 | 991 | **19.4 s** | 29.5 s | native gemini-3.1-flash-lite |
| extract / web | 14 | 4,592 | 6,460 | 860 | 5.7 s | 11.2 s | native gemini-3.1-flash-lite |
| extract / video | 9 | 1,045 | 1,430 | 78 | 14.6 s | 26.8 s | native gemini-3.1-flash-lite |
| extract / photo | 2 | ~2,600 | — | ~80 | 5–8 s | — | Gemini 3.5 Flash / OR 2.5 Flash |
| invent | 19 | 1,000–2,700 | 2,752 | 1,000–2,000 | 14.1 s | 23.8 s | OR gemini-2.5-flash (+ native) |
| translate | 36 | 741 | 1,115 | 850 | 3.5 s | 7.7 s | native gemini-3.1-flash-lite |
| remix | 2 | 886 | — | 647 | 5.0 s | — | native gemini-3.1-flash-lite |
| substitution, fridge_match, repair | 0 logged | — | — | — | — | — | — |

What stands out:

- **Content gate is far too slow.** It takes 8.4 s at the median to return about 25 tokens, for a check that runs before the real work starts. A small non-reasoning model should answer in under 1.5 s.
- **Comments extraction is the slowest text job**, at a 19 s median for about 1k output tokens. That's roughly 50 tokens/s, which is slow for a "flash-lite" model.
- Fridge match, substitution and repair don't appear in the log, so there's no real token data for them yet. The estimates below assume they look like remix.
- **Ingredient amounts** (`ingredientAmounts.ts`) aren't a separate model call. That schema is part of the extract response, so it follows whatever model extraction uses.

## Candidate models (OpenRouter, 6 Oct 2026)

| Slug | $ in / out per 1M | Context | Input | Notes |
|---|---|---|---|---|
| `openai/gpt-6-luna` | 0.10 / 0.50 | 1.05M | text, image | OpenAI's cheap tier. 147 t/s (AA). Its latency at reasoning `none` hasn't been measured |
| `openai/gpt-5.4-nano` | 0.20 / 1.25 | 400K | text, image | |
| `openai/gpt-6.1-sol` | 2 / 10 | 1.05M | text, image | Mid tier |
| `anthropic/claude-sonnet-5.5` | 2 / 10 | 1M | text, image | Strongest mid-price writer. Bedrock endpoints lack structured outputs |
| `anthropic/claude-haiku-4.5` | 1 / 5 | 200K | text, image | The research agent reported an Anthropic support date of 15 Oct 2026 (**unverified**). Avoid as a default until confirmed |
| `mistralai/mistral-small-2603` | 0.15 / 0.60 | 262K | text, image | ~0.7 s latency, 178 t/s (AA "Mistral Small 4") |
| `deepseek/deepseek-v4.1-flash` | 0.029 / 1.32 | 1M | text, image | Fast. Several hosts lack structured outputs |
| `qwen/qwen3.8-omni-flash` | 0.15 / 0.47 | 1M | text, image, **audio, video** | Alibaba-hosted only. The leading non-Google video candidate |
| `moonshotai/kimi-k3` | 0.83 / 14 | 1M | text, image, video | Output tokens are expensive |
| `google/gemini-3.5-flash-lite` | 0.30 / 2.50 | 1M | everything | For comparison only |

Claude and GPT-6 don't take video input. Anthropic's docs say current models accept text and images only. Sources: OpenRouter `/api/v1/models`, [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models), [Anthropic models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [OpenRouter video input](https://openrouter.ai/docs/guides/overview/multimodal/videos).

## Recommendation per task

Cost per call uses the average production token counts above.

| Task (`kind`) | Primary | Fallback (different provider) | Est. $/call (primary) | Why |
|---|---|---|---:|---|
| Content gate (`content_gate`) | `mistralai/mistral-small-2603` | `openai/gpt-5.4-nano` | $0.0002 | Short vision yes/no task, so latency is all that matters. Mistral Small has the lowest measured latency among cheap vision models. Don't use reasoning models here |
| URL / text extract (`text`) | `openai/gpt-6-luna` | `mistralai/mistral-small-2603` | $0.0009 (web), $0.0006 (comments) | Reliable structured JSON at a tenth of current cost. Eval for fidelity on Hebrew and other non-English sources. If Luna drops quantities or steps, move up to `gpt-6.1-sol` (~$0.018) |
| Photo extract / repair (`photo`, `repair`) | `anthropic/claude-sonnet-5.5` | `openai/gpt-6.1-sol` | ~$0.006 | Reading handwritten and printed recipe cards is where cheap models fall down. Volume is low and the user spends a credit, so pay for accuracy |
| Invent (`invent_*`) | `anthropic/claude-sonnet-5.5` | `openai/gpt-6.1-sol` | ~$0.025 | Creative writing plus food sense is Sonnet's strength. About 4× the current cost, still well under the credit's value |
| Translate (`translate`) | `anthropic/claude-sonnet-5.5` | `openai/gpt-6-luna` | ~$0.010 | Translations are stored and reused, so each one is paid for once. Hebrew and Arabic culinary terms are where quality shows. Run Luna in the eval: if Hebrew reviewers can't tell them apart, use Luna and save 95% |
| Remix / substitution (`remix`, `substitution*`) | `openai/gpt-6-luna` | `mistralai/mistral-small-2603` | ~$0.0004 | Interactive, short and well structured. Speed matters most |
| Fridge match (`fridge_match`) | `openai/gpt-6-luna` | `mistralai/mistral-small-2603` | ~$0.0005 (est.) | Interactive vision task that's free under a daily cap, so keep it cheap |
| Video extract / invent (`video`) | `qwen/qwen3.8-omni-flash` | `xiaomi/mimo-v2.6-flash` | ~$0.01 | **Decision: replace Gemini with Qwen.** See below |
| Extract gate (new, `extract_gate`) | `typesafe/jev-1.13` | none (fail open → run text extract) | ~$0.00006 | See "Jev decision gates" |
| Remix relatedness (`remix_related`) | `typesafe/jev-1.13` | `openai/gpt-6-luna` | ~$0.00001 | A yes/no question about text, which is what Jev is built for |

Price check: GPT-6 Luna ($0.10 / $0.50) is the cheap OpenAI tier. There is no 6.1 Luna. `gpt-6.1-sol` costs $2 / $10, 20× more.

### Video: Qwen replaces Gemini (decided 6 Oct 2026)

Use **`qwen/qwen3.8-omni-flash`** ($0.15 / $0.47, 1M context, structured outputs) through OpenRouter's `video_url` content part. Pick Omni over `qwen3.8-flash`, which costs the same, because only Omni accepts **audio**. Recipe videos often say amounts out loud instead of showing them on screen.

- **Code fit:** Pinch already passes video as a plain URL (`gemini.ts` sends `fileData.fileUri: videoUrl`). In `partsToOpenRouterContent`, map `fileData` to `{ type: 'video_url', video_url: { url } }`, then remove the `hasFileUriPart` bypass in `generateLlmJson`. After that, `geminiClient.ts` and `GEMINI_API_KEY` can be deleted.
- **Single host:** Alibaba is Qwen's only OpenRouter host (99.0–99.4% uptime over the last 30 min on 6 Oct). Use `xiaomi/mimo-v2.6-flash` (video and audio, $0.14 / $0.28) as the non-Alibaba fallback.
- **Check first:** does the Alibaba endpoint accept `provider.data_collection: 'deny'`? Can it fetch TikTok/Instagram CDN URLs, which may need a referer, or does the video need to be sent as base64? And what's the size and duration limit (not documented)?
- **Fallback plan:** if neither Qwen nor MiMo passes the video eval, extract frames and send them with a `gpt-4o-mini-transcribe` transcript ($0.003/min) to any vision model. That needs ffmpeg outside Edge Functions.

### Jev decision gates

[Jev](https://openrouter.ai/docs/guides/community/jev) (`typesafe/jev-1.13`, alias `~typesafe/jev-latest`) is TypeSafe's "System One" model. It returns typed decisions, not text: a **Choice** (one option, with probabilities), a **Noul** (probability of yes) or a **Score**. Input costs **$0.042 per 1M tokens**, and output is free. It takes text only, with a 32K context. It's called through `POST /api/v1/systemone` or `/api/alpha/decisions`, not chat completions, so it needs its own small client.

Where it fits:

1. **Extract gate (new).** Before the text extract call (comments extract: 19 s median), ask Jev a Choice over the caption, comments and transcript: `full_recipe_in_text` → run text extract; `partial` → run text extract, then video; `needs_video` → **skip the text call** and go straight to video; `no_recipe` → **fail before charging a credit**. Use the Choice confidence: below a threshold, fall back to today's ladder. If Jev errors, also fall back to today's ladder.
2. **Remix relatedness** (`remixInstructionIsRelated`, `recipeVariant.ts`). This is already a yes/no over text, so swap it for a Noul.
3. **Content gate, text-only inputs.** When there's a caption or page text and no image, Jev can return `kind`. Image inputs and `dish_guess` (free text) still need a vision model.

Not a fit: anything that generates text (extract, translate, invent, swap) or reads images.

Unknowns: Hebrew handling, latency (OpenRouter shows none), the data retention policy, and how accurate the probabilities are. The eval should include 30 labelled captions (10 Hebrew).

## Implementation notes for the follow-up ticket

- **Per-task config.** Replace `tier` with a `TASK_MODELS: Record<kind, { model, fallbacks, reasoning }>` map in `llmClient.ts`, and allow one env override per task (`OPENROUTER_MODEL_<KIND>`). Keep `tier` only as a temporary alias while migrating.
- **Validate fallback slugs.** A retired slug in `models` fails the whole request, not just that one fallback. Add a unit test against a pinned slug list, or a startup check against `GET /api/v1/models`.
- **Structured outputs.** Set `provider.require_parameters: true` so OpenRouter skips hosts that ignore `response_format` (some DeepSeek, Kimi and GLM hosts, and Claude on Bedrock). Consider `strict: true` once schemas are cleaned up.
- **Reasoning.** `reasoning: { effort: 'none' }` isn't accepted the same way by every model. Check each primary model, and send `low` for invent and photo.
- **Remove native Gemini.** Delete the Gemini fallback in `generateLlmJson` and `geminiClient.ts` once Qwen video passes the eval. Two cross-provider OpenRouter fallbacks per task cover outages.
- **Cost tracking (`pricing.ts`).** The current rate table is wrong for OpenRouter. It prices `gpt-4.1-mini` at Flash-Lite rates ($0.05 / $0.20, but it's really $0.40 / $1.60), and any unknown slug with a `/` falls through to Gemini 3.5 Flash rates. Use the cost OpenRouter returns in `usage` instead of a hand-kept table. If that isn't available, add explicit rows for every slug above.

## Eval plan (follow-up ticket)

The deliverable called for a small eval set. It hasn't been built yet, because it needs real inputs and an OpenRouter key run outside production. Proposed set:

| Task | Inputs | Pass criteria |
|---|---|---|
| Text extract | 20 real URLs/captions (5 Hebrew, 5 comment-only) | Ingredient count and quantities match a hand-labelled answer. Valid JSON |
| Photo extract | 10 recipe-card photos (2 handwritten) | Same as text extract |
| Translate | 15 recipes × he/ar/ru | A Hebrew speaker blind-ranks the output. Units localized (`כוס`, `כף`) |
| Invent | 10 photo and text prompts | Blind preference, plus a check for a coherent method |
| Content gate | 30 images (20 food, 10 not) | Accuracy, p95 latency under 2 s |
| Video | 15 TikToks/Reels (5 with spoken amounts) | Ingredient recall, Qwen Omni and MiMo compared with today's Gemini output |
| Extract gate (Jev) | 30 labelled captions/comments (10 Hebrew) | Route accuracy; no `no_recipe` false positives on real recipes |

Compare 2 to 3 models per task and log JSON validity, p50/p95 latency and cost alongside quality.

## Unverified

- Latency for Luna, Mistral Small and Sonnet at reasoning `none` on short JSON calls. The AA figures were mostly measured at high reasoning.
- The reported 15 Oct 2026 support date for Claude Haiku 4.5.
- Non-Google video size limits on OpenRouter, and whether Qwen's endpoint honours `data_collection: deny`.
- No credible public Hebrew translation benchmark exists. Alconost's 2026 study grouped Hebrew with Arabic and Farsi and reported Gemini > Claude > GPT overall. Our own eval has to settle this.
