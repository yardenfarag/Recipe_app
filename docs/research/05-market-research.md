# Pinch market research

> Researched 20 October 2026 by web search. Most competitor facts come from vendor sites, app-store listings, and competitor-written roundups, which are biased. Treat prices as "check the store before quoting". Market-size figures are paid analyst-report summaries, and their methodologies were not checked.

**Topic:** Turning social-video and web recipes into structured, cookable recipes
**Product:** Pinch (iOS, Android, web at pinch-app.io)
**Target market:** English-first, plus Spanish, Hebrew, Arabic and Russian (the app's locales)

## Executive summary

The "save a recipe from a TikTok/Reel" niche is real and crowded. At least six funded or well-made apps (ReciMe, Pluck, Honeydew, Flavorish, FoodiePrep, Nutrola) already sell the same core promise, so extraction by itself does not set Pinch apart. Pinch has two real advantages. It charges per use rather than by subscription, which almost no one else offers. And it fully supports right-to-left languages (Hebrew, Arabic), which no competitor appears to. Its free tier is a weakness today: 3 extractions a month (`FREE_MONTHLY_EXTRACT_LIMIT`), tied with Pluck for the smallest in the niche. The no-subscription pitch only lands if the free tier grows to roughly 10–15 (also proposed in PIN-56). The biggest risks are the platforms themselves: Instagram/TikTok access through ScrapeCreators is a single point of failure, and a stress-case video fallback loses money on every extraction (see `04-token-economics.md`). Recommended focus: market Pinch as **"the recipe saver without a subscription"** and lead with RTL/multilingual markets, where the subscription incumbents are weakest.

## Market overview

| Metric | Value | Source |
| --- | --- | --- |
| Recipe-app market size, 2025 | ~$6.1–6.4B | Straits Research; Spherical Insights |
| Forecast | ~$15–16B by 2034–35 | same |
| Growth rate | ~9.6–12.3% CAGR | Straits (10.5%), Spherical (9.6%), TechNavio (12.3%) |
| Largest region | North America, 36.4% share (2025) | Straits Research |
| Social discovery | 83% of US adults view food/recipe content on social media (2022) | Instacart/Harris Poll |
| Gen Z behaviour | 56% of Gen Z and 29% of millennials use TikTok for recipe discovery | Home Run Inn survey via The Spoon |
| TikTok as search | 22% of US consumers looked for recipes when using TikTok as a search engine (Feb 2026) | Adobe via Statista |

**Industry context.** The broad "recipe apps" category (Tasty, Allrecipes, Kitchen Stories, Yummly-style content apps) is a single-digit-billion market growing about 10% a year. Pinch does not compete for that whole pie. It competes in the **recipe-saver/organizer** sub-segment, which analysts do not size separately. That sub-segment changed in 2024–26: discovery moved to short video, and cheap multimodal LLMs made "watch the video and write it down" cheap enough to sell. Older organizers (Paprika, Mela) parse web pages with schema.org data. The new wave (ReciMe, Pluck, Flavorish, Honeydew) competes on social-video extraction.

**Bottom-up SAM (rough, assumption-driven).** Take ~800k users for ReciMe (the best-documented player, 2024) and assume the top 5–6 social savers reach a few million users combined. At typical 2–5% paid conversion and about $40–60 a year, the segment's current revenue is probably **tens of millions of dollars a year**, not billions. That is enough for a profitable indie app but small for VC scale. Treat this as an order-of-magnitude estimate, not data.

## Target audience

**Primary segment: "social savers"**
- Demographics: 18–40, mostly women, mobile-first, US/UK/AU first. Gen Z skews to TikTok, millennials to Instagram/YouTube.
- Psychographics: they cook at home a few times a week, treat recipes as content they collect, and are frustrated by "scrubbing" a 60-second Reel at the stove.
- Key needs: (1) one-tap capture from the share sheet, (2) accurate quantities when the creator only *says* them, (3) a shopping list, (4) not losing recipes buried in Instagram "Saved".
- Buying behaviour: they install free and hit the paywall within a week. The most common complaint in reviews is restrictive free tiers (ReciMe's 5 imports, Pluck's 3/month). They are subscription-fatigued, and many churn rather than pay $40–60 a year for an occasional-use tool.

**Secondary segments**
- **Multilingual/RTL home cooks** (Israel, Arab markets, Spanish-speaking LatAm, Russian-speaking diaspora). These cooks are underserved by English-first competitors, and Pinch already ships he/ar/es/ru.
- **Organizer power users** migrating from Paprika/Mela who want social import on Android and web too. Mela is Apple-only.
- **Desktop/web planners** who plan meals on a laptop. Pinch has a full web app, which most social savers lack.

## Competitive landscape

| Competitor | Position | Price (approx., 2026) | Strengths | Weaknesses |
| --- | --- | --- | --- | --- |
| **ReciMe** | Category leader for social savers | Free (≈5 smart imports); Premium ~$59.99/yr (some regions $39.99) | ~800k users (2024), $1.5M seed, strong US brand, meal planner | Hard paywall, upfront card for trial, price increases, frequent free-tier complaints |
| **Pluck** | Aggressive challenger | Free 3 extractions/mo, 10 recipes; Light $2.99/mo, Plus $6.99, Pro $11.99, $499.99 lifetime | True video understanding (audio + on-screen text), iOS + Android, heavy SEO content | Tiny free tier, confusing tier ladder |
| **Honeydew** | Challenger, meal-planner angle | Free tier; Plus ~$6.99/mo or $39.99/yr | AI planner + grocery list, social import, SEO comparison pages | Social/photo import paywalled |
| **Flavorish** | Niche AI-video specialist | Free (unlimited web, 5 social/5 photo/5 text); Premium $4.99/mo or $49.99/yr | Unlimited free web imports, focused product | Small brand, subscription-only |
| **FoodiePrep / Nutrola** | Niche (pantry / nutrition) | Freemium | Pantry matching, nutrition data | Self-promotional content, unclear traction |
| **Paprika 3** | Incumbent organizer | One-time ~$4.99 mobile (~$29.99 desktop) | 4.9★ from 50k+ US reviews, one-time purchase, trusted | No AI video extraction, dated UX, paid per platform |
| **Mela** | Premium Apple organizer | One-time/paid | Beautiful, iCloud sync | Apple-only, no social-video AI |
| **Samsung Food (Whisk)** | Big-tech adjacent | Free + paid tier | Huge recipe database, distribution via Samsung devices | No confirmed social-video extraction, generic |
| **Social Spork, Recaipy, RecipeAI** | Web converters | Free/cheap | Zero-install | No library, shopping list, or cook mode |
| **Pinch** | New entrant | 5 free extractions/month (raised from 3 on 2026-10-20); credit packs 10/$1.99, 30/$4.99, 100/$12.99 (live on iOS, Android pending) | **No subscription**, full web app + mobile, RTL + 5 languages, remix/substitutions, cook-along video, cached recipes free | Free tier (3/month) as stingy as Pluck's, no brand or reviews yet, purchases not live, web can't sell credits (no Stripe in the account's country), costly on Instagram video fallback |

**Competitive insights**
1. **Everyone has converged on the same feature set:** link/share-sheet import, AI extraction, library, grocery list, meal planner. Extraction quality is table stakes and hard to show in marketing.
2. **Pricing is almost all subscription,** at $40–60 a year or $3–12 a month. Pinch's credits are a real structural difference: at $0.13–0.20 per recipe, a casual user who saves 3 recipes a month pays nothing (inside the free 3). A user saving 10 a month pays ~$15–24 a year, well under ReciMe. A heavy user saving 30 a month pays ~$47–72 a year, about ReciMe's price.
3. **Competitors win on SEO,** not product. Pluck and Honeydew publish many "X vs Y" and "best recipe app 2026" pages, which make up most of the search results for this space. Pinch's landing page has three how-to guides but no competitor comparison pages.
4. **Free-tier stinginess is the top user pain point** that shows up across reviews. Pinch's current 3/month doesn't exploit this. Raising it to 10–15 would.
5. **No competitor shows meaningful RTL or Hebrew/Arabic support.** That is uncontested ground.

## Market opportunities

| Opportunity | Market size | Competition | Feasibility | Priority |
| --- | --- | --- | --- | --- |
| "No subscription" positioning (credits + a bigger free tier) | High | Low (nobody else) | High (credits built; free limit is a constant) | 1 |
| Hebrew/Arabic/RTL-first markets (Israel, GCC) | Medium | Very low | High (locales exist) | 2 |
| SEO comparison and "how to save a TikTok recipe" content | High | High | High (static landing already exists) | 3 |
| Web-first meal planning (desktop) | Medium | Low–medium | Medium | 4 |
| Creator partnerships (creators share a Pinch link for their recipe) | Medium | Low | Medium (`/s/` share links exist) | 5 |

1. **"Save recipes without a subscription."** This is the clearest hook in a subscription-fatigued category. Put it on the landing page headline and the store listing. Compare explicitly against ReciMe's 5 imports and Pluck's 3/month, which needs Pinch's free tier raised above 3 first.
2. **Own RTL/multilingual.** Run App Store Optimization (ASO) in Hebrew and Arabic, list in Israeli and GCC stores, and do localized creator outreach. Small markets, but Pinch can be #1 there quickly and collect reviews that lift global ranking.
3. **Content/SEO engine.** Pluck and Honeydew show that this niche is acquired through search. Three how-to guides already exist (`content/guides/`). Add competitor comparison pages ("ReciMe alternative without subscription", "Paprika alternative for Android", "Pluck vs Pinch").
4. **Creator loop.** Shared Pinch recipe pages (`/s/…`) credit the creator and could become a growth channel if creators link to them.

**Recommended focus:** #1 + #3 together. Positioning gives the SEO pages something worth saying, and both use assets that already exist.

## Risks and challenges

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Instagram/TikTok blocks access, or ScrapeCreators breaks/changes pricing | High | Medium | Abstract the provider; keep the text-first path (captions/description) working; add a manual paste/screenshot import fallback |
| Meta/TikTok terms-of-service exposure from downloading video (Meta has sued scrapers; it lost on public data vs Bright Data, 2024, but won injunctions elsewhere) | High | Low–medium | Use a third-party API rather than scraping directly, process transiently, store no media, credit and link the creator |
| Stress-case video fallback costs more than a credit earns | Medium | Medium | Meter it and cap video duration (already flagged in `04-token-economics.md`); consider 2 credits for video extractions |
| Platforms ship native "save as recipe" (Instagram/YouTube with Gemini/Meta AI) | High | Medium (2–3 yrs) | Differentiate on the library, shopping, cook mode, multilingual — the parts that aren't extraction |
| Competitors copy pay-as-you-go or widen free tiers (Pluck already has a $2.99 Light tier) | Medium | Medium | Move fast on positioning and reviews; brand advantage is temporary |
| Web users can't buy credits (no Stripe) | Medium | High (current) | Route web buyers to the apps (already planned); look into Paddle/Lemon Squeezy as merchant of record |
| Low awareness / no reviews at launch | High | High | In-app review prompt after the 3rd successful cook; launch in RTL markets first |

## Data sources

- [Straits Research — Recipe Apps Market](https://straitsresearch.com/de/report/recipe-apps-market)
- [Spherical Insights — Global Recipe Apps Market 2026–2035](https://www.sphericalinsights.com/blogs/top-25-companies-in-global-recipe-apps-market-worldwide-2025-market-research-report-2026-2035)
- [TechNavio via GII — Global Recipe Apps Market](https://giikorea.co.kr/report/infi2109599-global-recipe-apps-market.html)
- [The Spoon — Gen Z TikTok / millennials YouTube for cooking videos](https://thespoon.tech/when-it-to-cooking-videos-gen-zers-love-tiktok-millennials-embrace-youtube/)
- [Statista — content US consumers looked for on TikTok as a search engine](https://www.statista.com/statistics/1659993/content-us-consumers-looked-for-when-using-tiktok-as-search-engine)
- [Food & Drink Technology — consumers buying food via social media](https://www.foodanddrinktechnology.com/news/58635/one-third-of-consumers-purchase-food-directly-through-social-media/)
- [ReciMe on the App Store](https://apps.apple.com/us/app/recime-recipes-meal-planner/id1593779280)
- [RecipeOne — Is ReciMe free? (2026 pricing)](https://www.recipeone.app/blog/is-recime-app-free)
- [Yumishare — ReciMe cost in 2026](https://yumishare.com/blog/recime-app-cost-in-2026-is-the-premium-subscription-worth-your-money/)
- [SmartCompany — ReciMe 20k → 400k users](https://www.smartcompany.com.au/startupsmart/recime-sizzles-jumping-20000-400000-users-in-2023/)
- [Dealroom — ReciMe raises $1.5M](https://app.dealroom.co/news/feed/recime-raises-1-5m-for-us-expansion)
- [Pluck on Google Play](https://play.google.com/store/apps/details?id=com.pluckrecipes.app&hl=en_US) · [Pluck vs Honeydew](https://pluckrecipes.com/honeydew-alternative/) · [Pluck: recipe apps compared](https://pluckrecipes.com/blog/best-recipe-apps-compared/)
- [Honeydew — best recipe apps 2026](https://honeydewcook.com/guides/best-recipe-apps)
- [Preplo — 13 best recipe apps 2026](https://preplo.app/best-recipe-app-2026)
- [FoodiePrep — best apps to save recipes from TikTok & Instagram](https://www.foodieprep.ai/blog/best-apps-for-saving-recipes-from-social-media)
- [Nutrola — apps that extract recipes from video URLs](https://nutrola.app/en/blog/best-apps-that-extract-recipes-from-video-urls-2026)
- [RecipeSage — alternatives (Paprika/Mela pricing claims)](https://recipesage.com/alternatives/)
- [App Pricing Lab — Paprika 3](https://apppricinglab.com/app/apple/1303222868)
- [Engadget — Samsung Food launch](https://www.engadget.com/samsung-debuts-its-own-ai-powered-smart-recipe-app-104521190.html)
- [TechCrunch — court rules for Bright Data vs Meta](https://techcrunch.com/2024/01/24/court-rules-in-favor-of-a-web-scraper-bright-data-which-meta-had-used-and-then-sued)
- [TechCrunch — Meta settles scraping suit (BrandTotal)](https://techcrunch.com/2022/10/03/meta-settles-lawsuit-for-significant-sum-against-businesses-scraping-facebook-and-instagram-data/amp)

## Recommended next steps

- [x] Free tier raised from 3 to 5 a month (PIN-58, 2026-10-20). Still to do: rewrite the landing hero and store subtitle around "no subscription".
- [ ] Ship credit purchases (finish `docs/RECIPE_CREDITS_ROLLOUT.md`, which still says 15 free) so the positioning is true on day one.
- [ ] Add 3 competitor comparison pages to the site (ReciMe alternative, Paprika for Android, Pluck vs Pinch).
- [ ] Localize store listings in Hebrew and Arabic; plan an Israel-first soft launch to build reviews.
- [ ] Meter video-fallback frequency for 2–4 weeks and decide whether video extractions cost 2 credits.
- [ ] Hands-on test ReciMe, Pluck and Flavorish on the same 20 Reels/TikToks to benchmark extraction accuracy. This is the one claim competitors can't easily verify about each other.
