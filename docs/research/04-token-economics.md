# Pinch token economics

> Researched 20 July 2026. External sources are limited to official Google Gemini and ScrapeCreators documentation. The 15% and 30% store-fee cases are scenario inputs supplied for this analysis, not claims about Pinch's eligibility.

## Executive conclusion

The proposed **10-token extraction price is healthy for text-first successes but does not reliably cover video fallbacks**. At the proposed pack prices, an extraction produces **$0.091–$0.169 after a 15%/30% store fee**. The modeled provider cost is about **$0.0075 cheap**, **$0.0209 typical**, and **$0.186 stress-case Instagram video fallback**. Thus cheap/typical contribution margins remain roughly **77%–96%**, while the stress case loses **$0.017–$0.096 per extraction** before Supabase, storage, support, taxes, refunds, or observability.

The launch decision should therefore be: keep 10 tokens only if Pinch (1) meters actual Gemini `usageMetadata`, ScrapeCreators credits, platform, video duration, and ladder rung; (2) caps video duration/output; (3) rate-limits free substitutions; and (4) validates that video fallback is rare enough for blended economics. The 150-token signup grant and recurring 50-token grant are affordable on text-heavy traffic, but expensive and abuse-prone if users disproportionately trigger video fallback.

## What the repository actually calls

- Extraction, remix, and substitution default to `gemini-3.5-flash`, overridable globally with `GEMINI_MODEL`. They call `POST /v1beta/models/{model}:generateContent`, request structured JSON, and set thinking to `minimal` (`supabase/functions/_shared/gemini.ts`, `recipeVariant.ts`, `substitution.ts`). Google documents `gemini-3.5-flash` as a stable multimodal model with structured output and thinking support: [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash).
- The extraction ladder is **one combined text request** containing every available description, comment, and caption—not separate description/comment/caption model calls. Only when that result is unusable or times out does it make a second request (`supabase/functions/_shared/gemini.ts`).
- **YouTube:** optional YouTube Data API metadata plus a public caption fetch; no ScrapeCreators request. `fetchYouTubeMeta` does not return `videoUrl`, so the nominal video rung currently repeats a text-only Gemini request. A cached recipe for a signed-in user returns before provider calls (`supabase/functions/_shared/youtube.ts`, `extract-recipe/index.ts`).
- **Instagram:** `GET /v1/instagram/post` for metadata. If Gemini needs video and the returned URL is an Instagram CDN URL, Pinch calls the same endpoint again with `download_media=true`, then sends the hosted video URL to Gemini (`supabase/functions/_shared/instagram.ts`). ScrapeCreators documents that endpoint and says media download costs 10 credits when media is found and 1 otherwise: [Instagram Post/Reel Info](https://docs.scrapecreators.com/v1/instagram/post/).
- **TikTok:** in parallel, `GET /v2/tiktok/video?get_transcript=true&trim=true` and `GET /v1/tiktok/video/comments?trim=true`; the returned direct video URL is the Gemini fallback (`supabase/functions/_shared/tiktok.ts`). Official endpoint references: [Video Info](https://docs.scrapecreators.com/v2/tiktok/video/) and [Comments](https://docs.scrapecreators.com/v1/tiktok/video/comments/).
- **Remix:** one text-only Gemini call containing the complete recipe. **Substitution:** one smaller text-only Gemini call per ingredient request. Neither has caching or a repository-side quota (`recipeVariant.ts`, `substitution.ts`).

This matters because `docs/WORKFLOWS.md` describes “description → comments → captions → video” as if each were a rung. The implementation combines all text into one billable Gemini call.

## Unit costs and assumptions

Google's paid Gemini 3.5 Flash rate is **$1.50 per 1M input tokens** and **$9.00 per 1M output tokens, including thinking tokens**: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). Google estimates video at about **300 input tokens/second at default media resolution** or 100/second at low resolution; Pinch does not set media resolution, so this analysis uses 300/second: [video token calculation](https://ai.google.dev/gemini-api/docs/video-understanding#technical-details-about-videos).

ScrapeCreators says most endpoints use **one request = one credit** and lists 25,000 credits for $47 (**$0.00188/credit**) or 500,000 for $497 (**$0.000994/credit**): [official pricing](https://scrapecreators.com/). Calculations use the more conservative $47 pack. Base endpoint pages do not publish a credit charge for Pinch's exact `get_transcript=true` combination, so one credit per ordinary request is an assumption; `download_media=true` uses its documented 10-credit charge.

Modeled token envelopes—not measurements:

| Case | Gemini work | ScrapeCreators work | Provider cost |
|---|---:|---:|---:|
| Cheap text success | 2,000 input + 500 output | YouTube: none | **$0.00750** |
| Typical text success | 6,000 input + 900 output | TikTok: 2 ordinary requests | **$0.02086** |
| Instagram stress fallback | failed text: 15,000 input + 2,000 output; then 180-second video + 15,000 text input + 2,000 output | up to 3 URL-variant metadata requests + 10-credit media download | **$0.18644** |

Formulas:

- Cheap: `2,000 × $1.50/M + 500 × $9/M = $0.00750`.
- Typical: `6,000 × $1.50/M + 900 × $9/M + 2 × $0.00188 = $0.02086`.
- Stress: first Gemini `$0.04050`; fallback input `(180 × 300) + 15,000 = 69,000`, so fallback Gemini `$0.12150`; ScrapeCreators `13 × $0.00188 = $0.02444`; total `$0.18644`.

The stress case is **not a hard maximum**. Pinch imposes no video-duration or `maxOutputTokens` cap. Gemini 3.5 Flash allows 1,048,576 input and 65,536 output tokens ([model limits](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash)); at posted rates, that theoretical single-call envelope is about **$2.16**. The structured recipe schema should keep real output far below that, but only production usage records can establish a defensible tail.

## Pack economics for a 10-token extraction

Net revenue means pack revenue after the modeled store fee, allocated pro rata to tokens. Contribution excludes all costs except Gemini and ScrapeCreators.

| Pack | Gross / extraction | Net revenue | Cheap margin | Typical margin | Stress margin |
|---|---:|---:|---:|---:|---:|
| 100 / $1.99 | $0.1990 | $0.1692 / $0.1393 | 95.6% / 94.6% | 87.7% / 85.0% | **−10.2% / −33.8%** |
| 300 / $4.99 | $0.1663 | $0.1414 / $0.1164 | 94.7% / 93.6% | 85.2% / 82.1% | **−31.9% / −60.1%** |
| 1,000 / $12.99 | $0.1299 | $0.1104 / $0.0909 | 93.2% / 91.8% | 81.1% / 77.1% | **−68.9% / −105.0%** |

Each slash shows **15% / 30%** store-fee scenarios.

The 1,000-token pack sets the economic floor. After a 30% fee, each product token yields **$0.009093**, so 10 tokens cover only $0.09093 of provider cost. A $0.186 stress extraction needs about **21 product tokens merely to cover providers**, before any other cost or margin.

## Other token actions and grants

### Remix: 5 tokens

Illustrative typical remix usage of 2,000 input and 800 output tokens costs **$0.01020**. Five product tokens yield $0.0455–$0.0846 net across the pack/fee combinations, leaving approximately **78%–88% provider contribution margin**. This looks adequately priced, subject to measuring full-recipe prompt and output sizes.

### Substitutions: free

An illustrative 500-input/150-output substitution costs about **$0.00210**. The unit cost is small, but free and uncapped means contribution margin is undefined and abuse has no product-token brake. Add per-user/device daily limits, caching by recipe/ingredient, and telemetry before launch.

### Free allocations

| Allocation | Product capacity | Cheap liability | Typical liability | Stress liability |
|---|---:|---:|---:|---:|
| Guest: 5 URL extractions | 5 extractions | $0.038 | $0.104 | $0.932 |
| Signup: 150 tokens | 15 extractions or 30 remixes | $0.113 | $0.313 | $2.797 |
| Monthly loyalty: 50 tokens | 5 extractions or 10 remixes | $0.038 | $0.104 | $0.932/month |

The guest “3 saves” limit does not itself reduce extraction provider cost; extraction occurs before save. The signup grant is 1.5× the smallest paid pack, so account/device abuse controls matter. Define whether loyalty tokens expire, whether paid or granted tokens are spent first, and whether a cached extraction costs tokens. Economically, cached results should be free or near-free because the signed-in cache path makes no provider call.

## Missing data required before final pricing

1. Gemini `usageMetadata` per call: prompt, output, thinking, and total tokens. Pinch currently logs latency and JSON length, not billable token counts.
2. Platform mix; text-success, timeout, and video-fallback rates; video-duration distribution; and success/failure/refund policy.
3. Actual ScrapeCreators credits debited for each endpoint, failed request, Instagram URL retry, and TikTok `get_transcript=true`. Official docs do not fully specify these combinations.
4. Cache-hit and duplicate-extraction rates, especially because guest requests do not use the server-side signed-in dedupe path.
5. Remixes and substitutions per active user, repeated taps/retries, free-grant redemption, conversion, churn, and fraud.
6. Store mix and realized net proceeds after taxes, regional pricing, refunds, chargebacks, and any fee treatment.
7. Supabase Edge Function, database, bandwidth, thumbnail storage/egress, monitoring, and support costs.

## Recommendation

Ship the token labels only with cost controls and event-level metering. Retain **10 tokens for a normal extraction** while validating the blended ladder rate, but cap video length, set a conservative output limit, and consider charging an additional fallback amount only after telling the user. Keep **5 tokens for remix** provisionally. Keep substitutions free only behind quotas/cache. Re-evaluate after at least several hundred representative extractions; the key acceptance criterion is the p95 provider cost and video-fallback share, not the average text-call estimate.
