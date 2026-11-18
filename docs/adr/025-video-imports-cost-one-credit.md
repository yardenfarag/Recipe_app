# ADR 025: Video imports cost 1 credit, like every import

**Status:** Accepted
**Date:** 2026-11-18
**Deciders:** Yarden (PIN-69)
**Tickets:** PIN-69 (this decision), PIN-62 (metering), PIN-100 (video cap)
**Related:** ADR 012 (recipe credits), ADR 016 (10 free credits a month)

## Context

When an import can't find the recipe in the caption, comments or transcript, it falls back to sending the video to Gemini. `docs/research/04-token-economics.md` modelled a worst case of about $0.19 for that video step, which would lose money on a 1-credit import. ADR 016 left the question open until PIN-62 had measured it. The options were 1 credit flat, 2 credits for video imports, or a cap on video length.

PIN-62 started logging the extraction step, video length and whether the video file was downloaded for every import (`ai_usage_events.metadata`). The figures below are from production, 2026-11-05 to 2026-11-18, cache hits excluded:

| | Value |
|---|---|
| Successful imports | 33 (from 15 people), plus 4 failed |
| Imports that needed the video step | 10 (30%; the baseline before PIN-62 was about 15%) |
| Provider cost per video import | $0.034 on average, $0.046 at most |
| Provider cost per text import | $0.004 |
| Blended cost per import | $0.013 |
| Video file downloads (the expensive Instagram path) | 0 |
| Video length | 32 s median, 58 s p95, 103 s longest |

Instagram accounts for 9 of the 10 video imports.

What a credit earns: the cheapest credit is in the 100-credit pack ($7.99), which is $0.080 per credit, or about $0.056 after a 30% store fee. The 10-credit pack earns about $0.139 per credit after the fee.

## Decision

- **Every import costs 1 credit**, whichever step finds the recipe. No surcharge for video.
- Even the most expensive video import seen so far ($0.046) costs less than the cheapest credit earns ($0.056). The average video import keeps about 40% of that credit as margin, and the blended import keeps about 77%.
- A 2-credit video price was rejected. Users can't know before importing whether a link will need the video step, so the price would look random. It would also take app, copy and backend changes and undercut the "no subscription" pitch, for savings of about $0.03 per video import.
- **The video cap stays at 12 minutes** (`MAX_VIDEO_DURATION_SECONDS` in `supabase/functions/_shared/extraction/videoLimits.ts`). A 12-minute video could cost about $0.30, more than a credit earns, but recipe videos are short (p95 58 s), so the occasional loss is smaller than the cost of turning those imports away.
- No code change.

## Consequences

- Pricing stays simple: one import, one credit, in the app, the paywall and the site copy.
- Video imports now make up a bigger share of cost than ADR 016 assumed: blended cost rose from $0.0035 to $0.013. A user who spends all 10 free credits costs about $0.13 a month on average and $0.34–0.46 if every import uses the video step.
- The sample is small. Revisit this ADR from the admin AI cost dashboard ("Imports by extraction step", 30-day window) if any of these happen:
  - blended cost per import goes above $0.02 (ADR 016's trigger);
  - average cost per video import goes above $0.05, close to what the cheapest credit earns;
  - video file downloads start happening regularly;
  - p95 video length goes above 3 minutes. If so, lower the cap before changing the price.
