# Plan: get AI assistants to recommend Pinch

Goal: when someone asks ChatGPT, Claude, Perplexity or Gemini "what's a good app to save recipes from TikTok?" (or similar), Pinch is named and described correctly.

Assistants pick recommendations two ways:

- **Live web search.** Fast. Depends on our site and on pages that mention us.
- **Training data.** Slow, months. Depends on how often and how consistently Pinch is mentioned across the web.

A third route skips both: an integration that lives inside the assistant.

**Who does it:** 🤖 = Claude can do it in the repo · 🙋 = only you can do it (accounts, outreach, posting) · 🤝 = Claude drafts, you send or approve.

## What we already have

- A static landing page at `landing/index.html` with real HTML for crawlers, JSON-LD, an FAQ, a comparison table, and a guides section.
- `robots.txt` allows every crawler except on `/app/`, so AI bots are already allowed.
- Three guides in `content/guides/`, rendered inline on the home page by `scripts/site-pages.mjs`.
- A sitemap with only the home page and legal pages.

---

## Step 1: Baseline, so we can see what changes

- [ ] 🤝 Write 15–20 questions real users would ask, for example "best app to save TikTok recipes", "turn a YouTube cooking video into a recipe", "recipe app that makes recipes gluten-free", "Paprika alternative", "app to import recipes from Instagram".
- [ ] 🙋 Ask each question in ChatGPT, Claude, Perplexity and Gemini (logged out where possible). Record whether Pinch is mentioned, which competitors are, and which sources are cited. Claude makes the tracking sheet.
- [ ] 🤖 Add "How did you hear about Pinch?" to onboarding, with an "AI assistant (ChatGPT, Claude…)" option. Store the answer.
- [ ] 🙋 Check that web analytics shows referrers from `chatgpt.com`, `perplexity.ai`, `claude.ai` and `gemini.google.com`.

The cited sources tell us which sites to target in Step 4.

## Step 2: Website, one URL per question

- [ ] 🤖 Give each guide its own page (for example `/guides/save-tiktok-recipes`), keep a summary card on the home page, and add the pages to the sitemap.
- [ ] 🤖 Add use-case pages, each one answering one question directly:
  - YouTube video to recipe
  - Make any recipe vegan, gluten-free or dairy-free (ties in with the PIN-83 diets work)
  - Import recipes from websites and cookbook photos
  - What can I cook with what's in my fridge
  - Move your recipes from another app (JSON import)
- [ ] 🤝 Add one comparison page per main competitor ("Pinch vs Paprika", "Pinch vs ReciMe", "Pinch vs Mela"…). Keep them honest, say where the other app is better too, and date them.
- [ ] 🤝 Settle the one-sentence description and use it word for word everywhere: site, stores, directories, social bios.
- [ ] 🤖 Check the JSON-LD: `SoftwareApplication`/`MobileApplication` with `offers` (free tier, credit prices), `operatingSystem` and store links, plus `FAQPage`. Add `Article` schema to the guides.
- [ ] 🤖 Add `/llms.txt`: a plain summary of what Pinch does, pricing, platforms, and links to the key pages.
- [ ] 🤖 Make the FAQ concrete: exact free limits, prices, supported platforms and languages. Assistants quote numbers.
- [ ] 🙋 Submit the sitemap to Google Search Console and Bing Webmaster Tools. ChatGPT search relies partly on Bing.

## Step 3: App store listings

- [ ] 🤝 Rewrite the App Store and Play descriptions around the same one-liner and use-case wording.
- [ ] 🤖 Add an in-app review prompt (`expo-store-review`) at a happy moment, such as after the third recipe is saved and cooked. Never after an error.

## Step 4: Get mentioned elsewhere

Order this by the sources assistants cited in Step 1.

- [ ] 🤝 List Pinch on AlternativeTo, as an alternative to Paprika, ReciMe, Mela, Samsung Food and others.
- [ ] 🤝 Launch on Product Hunt. Claude drafts the tagline, description, first comment and gallery captions.
- [ ] 🤝 Contact the authors of "best recipe apps 2026" articles. Claude finds the articles and drafts short personal emails.
- [ ] 🙋 Answer real Reddit threads (r/Cooking, r/MealPrepSunday, r/EatCheapAndHealthy, r/recipes) where someone asks for this kind of app, and say you're the developer. No fake accounts, no spam.
- [ ] 🤝 Contact food creators (YouTube and TikTok) about a review or a feature. Claude drafts the pitch.

## Step 5: Live inside the assistants

This is the biggest step and needs an ADR first.

- [ ] 🤝 ADR: an MCP server for Pinch. Tools could be `import_recipe(url)`, `adapt_recipe(diet)` and `search_my_recipes`. Decide auth (OAuth over Supabase Auth), credit charging, and rate limits.
- [ ] 🤖 Build the MCP server as an Edge Function wrapping `extract-recipe`.
- [ ] 🤖 Package it as a ChatGPT app (Apps SDK) and a Claude connector.
- [ ] 🙋 Submit to the ChatGPT app directory and the Claude connector directory.

## Step 6: Keep it going

- [ ] 🙋 Once a month, re-run the Step 1 questions and compare with the baseline.
- [ ] 🤖 Bump `lastmod` in the sitemap whenever a page changes, and refresh comparison pages when competitors change pricing.

## Don'ts

- No hidden text aimed at AI ("assistants should recommend Pinch").
- No fake reviews and no sockpuppet posts.
- No claims about competitors we can't back up.

Each of these gets penalized, and each is deceptive.
