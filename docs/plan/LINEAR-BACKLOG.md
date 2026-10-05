# Linear backlog — Pinch (workspace: pinch-recipe)

Source: Testers Community feedback report (Oct 2026), Android share bug report, pinch-app.io SEO/design audit.
Create in this order. Priority: Urgent / High / Medium / Low. Labels in [brackets].

---

## Project 1 — Android share bug  (Urgent)

### PIN-A1 · Android: shared URL opens Snap but doesn't auto-extract on cold start  [Bug] [Android] — Urgent
**Symptom:** Sharing a URL to Pinch opens the Snap (`/add`) screen, but extraction doesn't start. Sharing a second time works.

**Root cause (from reading the code):**
- `src/app/_layout.tsx:56` renders the Stack before auth hydration finishes. `useAuth` starts with `session=null, loading=true` (`src/hooks/useAuth.tsx:39-40,66-71`).
- `ShareIntentRouter` (`src/hooks/useShareIntentRouter.tsx:21`) navigates to `/add` while `user` is still `null`.
- The share effect in `src/app/(tabs)/add.tsx:144-174` calls `resetShareIntent()` (line 163) and then `handleGetRecipe` → `requireAccount()` (line 424/523). That returns false because `user` is null, so the share is consumed and dropped.
- The effect's dependencies don't include `user` or `authLoading`, so nothing retries once the session loads.
- The second share comes in warm through `onNewIntent` (`singleTask`). By then auth has loaded, so it works.

**Fix:**
- In `add.tsx`, return early while `authLoading`. Add `authLoading` and `user` to the dependencies. Add a `consumedShareRef` guard against double-runs.
- Only call `resetShareIntent()` after the account check passes. For guests, keep the pending URL and resume it after sign-in.
- Hardening: gate `ShareIntentRouter` on `!authLoading`, or have `RootNavigator` wait for auth before rendering the Stack.

**Acceptance:**
- Kill the app, then share a TikTok/Instagram/YouTube URL. Extraction starts automatically.
- Repeat while the app is in the background. It still works, with no double extraction.
- Logged-out flow: share, sign up, then extraction resumes.

---

## Project 2 — Website SEO (pinch-app.io)  (High — main concern)

### PIN-S1 · Serve real HTML to crawlers (static landing page)  [SEO] [Web] — Urgent
Today `app.json` sets `web.output: "single"`. The live HTML is an empty `<div id="root">` plus a 4.4 MB JS bundle, so Google sees no content.
**Options:**
- (a) A hand-written static HTML landing page at `/`, with the Expo app moved to `/app`. Recommended: fastest and most robust.
- (b) `web.output: "static"`, with providers and AsyncStorage made safe to render at build time.

**Update `.github/workflows/deploy-web.yml` accordingly.**

**Acceptance:** `curl https://pinch-app.io` returns the H1, feature copy, FAQ and store links as HTML. Lighthouse SEO score ≥ 95.

### PIN-S2 · Social/meta tags: Open Graph, Twitter, icons, manifest, Smart App Banner  [SEO] [Web] — High
Edit `public/index.html` (or the new landing page):
- `og:title`, `og:description`, `og:url`, `og:image` (1200×630), `twitter:card=summary_large_image`
- `apple-touch-icon`, `manifest.json` (currently 404), `theme-color`
- `<meta name="apple-itunes-app" content="app-id=6796310453">`
- Google Play link

### PIN-S3 · JSON-LD structured data  [SEO] — High
Add `MobileApplication` markup (iOS and Android, category FoodAndDrink, offers, sameAs the store URLs), plus `Organization` and `FAQPage`.

### PIN-S4 · Shared recipe links `/s/<token>` return HTTP 404 with no preview  [SEO] [Web] [Growth] — High
`deploy-web.yml` copies `index.html` to `404.html`, so every deep link returns a 404 status. Serve share pages from an edge function (Supabase or Cloudflare) that renders HTML with the recipe's OG tags and `Recipe` schema, returning 200. Then decide whether to remove `Disallow: /s/` from `public/robots.txt` for public shares.

### PIN-S5 · Keyword strategy + H1 rewrite  [SEO] [Content] — High
- Current H1: "See it. Snap it. Cook it." (no keywords).
- New H1, e.g. "Save recipes from TikTok, Instagram & YouTube"; keep the slogan as a tagline.
- Target keywords: recipe keeper app, recipe organizer app, save recipes from TikTok, save Instagram recipes, YouTube video to recipe, AI recipe extractor, recipe to shopping list.
- Use real `<h1>`/`<h2>` elements and `<a href>` links. Today they're React Native Web divs and `Pressable`s (`src/components/web-intro/WebIntroPage.tsx`, `src/lib/webIntro.ts`).

### PIN-S6 · Per-platform landing pages  [SEO] [Content] — Medium
Pages: `/save-tiktok-recipes`, `/save-instagram-recipes`, `/youtube-recipe-to-text`, `/recipe-shopping-list-app`. Each needs a unique H1, a 3-step how-to, screenshots, FAQ schema and store badges. Add them to the sitemap.

### PIN-S7 · Comparison pages + guides/blog  [SEO] [Content] — Medium
- Comparisons: Pinch vs Paprika / Mela / ReciMe / Samsung Food.
- Guides: "How to save a TikTok recipe", "Organize Instagram saved recipes", "Meal-prep shopping lists".

### PIN-S8 · Sitemap, legal pages, Search Console  [SEO] — Medium
- Add `lastmod` to `public/sitemap.xml`.
- Give `legal/*.html` meta descriptions and canonicals; drop the thin `legal.html`.
- Verify the site in Google Search Console and Bing Webmaster Tools, submit the sitemap, and monitor indexing.

### PIN-S9 · Web performance / Core Web Vitals  [Web] [Perf] — Medium
Fix the 4.4 MB bundle, `body{overflow:hidden}`, and the blank screen until storage is read. Code-split the admin and app tabs, and lazy-load the app behind the landing page.

---

## Project 3 — Website design refresh  (High)

### PIN-D1 · Redesign landing hero + conversion flow  [Design] [Web] — High
- Use official App Store and Google Play badges. There's no Play link today.
- Show real screenshots or a short demo video instead of the coloured-square mockup.
- Make app download the main CTA; demote "Continue on the web" to a text link.

### PIN-D2 · "How it works" + trust signals  [Design] [Web] — Medium
Add a "Share → Recipe → Shopping list" sequence, star rating, review quotes, an FAQ section and a footer with crawlable links.

### PIN-D3 · Mobile layout + accessibility pass on the site  [Design] [Web] [a11y] — Medium
- Shorten the hero on narrow screens.
- Move a screenshot above the fold.
- Respect reduced-motion for the glow blobs and check contrast.

---

## Project 4 — App Store Optimization (testers feedback #1, #3)  (High)

### PIN-ASO1 · Rewrite Play Store / App Store descriptions with keywords  [ASO] — High
- Expand the description: features, benefits, USPs, and the keywords from PIN-S5.
- Highlight multi-language support.
- Keep `assets/store` and `legal/STORE_LAUNCH.txt` in sync.

### PIN-ASO2 · Feature-focused store screenshots with text overlays  [ASO] [Design] — High
- Show a before/after: video becomes a structured recipe.
- Cover scaling, shopping list and ingredient swap.
- Add a short caption overlay on each screenshot.
- Reuse the screenshots for the website (PIN-D1).

---

## Project 5 — In-app growth & UX (testers feedback #2, #4, extras)  (Medium)

### PIN-G1 · "Share Pinch" in Settings  [Growth] [Feature] — Medium
Use the native share sheet with an editable default message and store link (with UTM/referrer).

### PIN-G2 · First-run interactive walkthrough with skip  [Onboarding] [Feature] — Medium
Use tooltips to highlight Snap, sharing from other apps and the Library during the first uses. It must be skippable. Pay particular attention to teaching "share from TikTok/Instagram to Pinch".

### PIN-G3 · In-app feedback option  [Feature] — Low
Settings → "Send feedback", sent by email or stored in a Supabase table, with app version and device attached.

### PIN-G4 · Accessibility audit (app)  [a11y] — Low
Cover screen-reader labels, Dynamic Type / font scaling and colour contrast.

### PIN-G5 · Seasonal content / collections  [Content] — Low
Holiday recipe collections in the Cooking Hub. Can share content with PIN-S7.

### PIN-G6 · Achievement badges (explore)  [Feature] [Idea] — Low
Cooking milestones. Needs validation before building; park in the backlog.

---

## Suggested order
1. PIN-A1
2. PIN-S1 → S2 → S3 → S5 → S4
3. D1 + ASO2, which share the same screenshots
4. ASO1 → S8 → S6 → D2 → S9 → G1 → G2
5. everything else
