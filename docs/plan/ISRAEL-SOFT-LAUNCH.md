# Israel-first soft launch (PIN-61)

**Last updated:** 2026-11-19
**Source:** `docs/research/05-market-research.md`, recommendation 2: "own RTL/multilingual".

No recipe-saver competitor we found supports Hebrew, Arabic or right-to-left layouts. Israel is a small market, but nobody else is competing for it. The goal is to become the top Hebrew result for "save recipes from video" quickly, and to collect ratings and reviews that also help the global ranking.

## What's ready

| Piece | Where |
|---|---|
| Hebrew and Arabic listing copy (name, subtitle, keywords, promo text, description) | `legal/STORE_LISTINGS_HE_AR.txt` |
| Spanish (Latin America) and Russian listing copy, the ticket's second step | `legal/STORE_LISTINGS_ES_RU.txt` |
| A test that keeps the copy within store limits | `scripts/store-listings.test.mjs` |
| Screenshots with translated overlays (RTL for Hebrew and Arabic) | `assets/store/appstore/{he,ar,es,ru}/`, rendered with `assets/store/appstore/src/render.sh he\|ar\|es\|ru` |
| A step-by-step wizard that pastes it all into both consoles | `scripts/store-listing-wizard.sh he\|ar\|es\|ru` |
| In-app review prompt after a cook | `src/lib/reviewPrompt.ts`. Asks from the 2nd recipe someone marks as cooked, at most every 120 days and 3 times in total. The OS still decides whether the sheet appears. Logged as the `review_prompt.requested` interaction. |

`expo-store-review` is a native module, so the review prompt ships with the next store build, not before.

## Plan

### Week 0: ship the listings

1. Read the Hebrew copy yourself. The Arabic, Spanish and Russian were checked by agent reviews (no native readers available).
2. Run `scripts/store-listing-wizard.sh he`, then `ar`.
3. Submit the next iOS and Android build, which includes the review prompt. On iOS the localized name, subtitle and keywords go live with that version.
4. Write down the baseline (see "Tracking" below) on the day the listings go live.

### Weeks 1–4: build reviews in Israel

- **Hebrew social posts from Pinch's own accounts.** Two or three a week. Short screen recordings of saving a well-known Israeli dish from a video (shakshuka, sabich, a holiday dish when one is near), with the shopping list and Hebrew cook mode. Post in Hebrew, lead with "בלי מנוי" (no subscription) and "עובד בעברית" (works in Hebrew), and link the store listings.
- **Local food creators (your call).** The ticket suggests working with a few Israeli food creators. This only fits if it doesn't involve cold outreach, e.g. a creator who already uses Pinch, or a paid collaboration through a platform where they list their rates. Skip it otherwise; the posts and the review prompt don't depend on it.
- **Reply to every Hebrew review** in Hebrew, within a couple of days, in both consoles.

### Week 4: check and decide

Carry on into Arabic markets (GCC first, then Arabic speakers in Israel) if, after four weeks:

- Israel has at least **20 new ratings** across both stores, averaging **4.5 or more**, and
- product-page conversion in Israel (App Store) is at least as good as in the US.

If ratings are coming in but conversion is low, try different screenshots before anything else. If neither is moving, the market is too small to matter, and the Spanish and Russian listings (ready in `legal/STORE_LISTINGS_ES_RU.txt`) are a better next bet. They can also go live alongside Hebrew: they cost one wizard run each and don't depend on the Israel results.

## Tracking installs and ratings per locale

Both stores report by **country**, not by app language, so treat Israel as the Hebrew proxy and Saudi Arabia/UAE as the Arabic one.

| Number | Where |
|---|---|
| App Store impressions, product page views, downloads, conversion by country | App Store Connect → Analytics → Acquisition, filter Territory = Israel |
| App Store ratings and reviews by country | App Store Connect → Pinch → Ratings and Reviews, pick the country |
| Play installs by country and by language | Play Console → Statistics, add the Country and Language dimensions |
| Play store listing conversion by country | Play Console → Grow users → Store performance → Store listing conversion analysis |
| Play ratings by language and country | Play Console → Ratings, break down by Language and by Country |
| Review prompts shown | Admin dashboard → Activity, interaction `review_prompt.requested` |
| Signups by country | Admin dashboard (`product_events.country`) |

Record the baseline and the week-4 numbers as a comment on PIN-61.
