# ADR 031: The public pages stay where they are

**Status:** Accepted
**Date:** 2026-11-22
**Deciders:** Yarden (product)

## Context

After PIN-147, `pinch-app.io` is served by three things:

- GitHub Pages: the landing page, the guides, the legal pages, the sitemaps and `llms.txt`, in five languages (`landing/`, `content/guides/`, `scripts/build-web-site.mjs`).
- The share Worker (`workers/share-page/`): private share pages at `/s/*`, public Hub recipe pages at `/r/*`, the recipe sitemap, IndexNow, and the app-link files.
- The new web app (`web/`, ADR 026 and 027): everything under `/app`.

PIN-149 asked whether the first two should move into the Next.js app.

What moving would get us: one design and one recipe page, the web app's "Save, sign in, saved" flow on the page people land on from search, and less HTML written by hand.

What it would cost:

- **Search.** Google, Bing and AI assistants see only the address and the HTML. As long as the same addresses return the same content, recipe data (JSON-LD), meta tags and status codes (404, 503 with Retry-After, 301 to the canonical slug), nothing changes for them. Each of those is easy to break by accident. The biggest risk is the web app's default of rendering in the browser (ADR 026): most AI crawlers don't run JavaScript and would see an empty page.
- **Routing.** The web app is built with `basePath: '/app'`, and Next.js rewrites can't send an outside address like `/r/<slug>` to an internal page. The Worker would have to fetch the page from the web app's Worker, which means two Workers per request, and a bad web deploy would take the public pages down with it.
- **Work.** The first server-rendered page in `web/`, a rebuild of a static site that already serves crawlers well, and checks across five languages.

Traffic is about 140 web sessions a month, and the AI-discovery baseline (PIN-86) was taken in November 2026. A move now would muddy that measurement.

## Decision

- **Nothing moves.** The landing page, guides, legal pages, sitemaps and `llms.txt` stay on GitHub Pages. `/s/*`, `/r/*`, the recipe sitemap, IndexNow and the app-link files stay in the share Worker.
- **The Worker's pages take the web app's look (Night Market, PIN-160).** Share and Hub recipe pages, and their error pages, now look like the web app's recipe page:
  - colours from the default theme pack in `shared/constants/themes.ts`, following the visitor's light or dark setting;
  - tiles with a hairline border, fact tiles, numbered step cards, and the same breakpoints;
  - Inter and Space Grotesk, served from the site at `/fonts/` (`landing/fonts/`, SIL OFL), not from Google.

  The addresses, meta tags, JSON-LD, status codes and descriptions don't change.
- The Worker deploys again when `shared/constants/themes.ts` changes, so its colours follow the packs.

## When to look again

Reopen this if one of these becomes true:

- The public recipe page needs something only the web app has (scaling, unit switching, cook mode for guests), and copying it into the Worker is no longer small.
- Keeping two recipe pages in sync costs real time in practice.
- Traffic from search grows enough that a page shared with the web app is worth the risk.

If `/r/*` ever moves, it moves on its own, with: the Worker fetching from the web app and falling back to its own page on error; the page rendered on the server; a test that compares head, JSON-LD and status codes between the old and new page for a sample of slugs; and a Search Console and Rich Results check before and after.

## Considered options

- **Move everything into Next.js.** One codebase for the whole site. Rejected: a lot of work, the most risk to search, and nothing new for visitors.
- **Move only `/r/*` (and `/s/*`) after PIN-147.** The real gain is one recipe page. Rejected for now: the routing above, the coupling of the two Workers, and the risk to search outweigh it at today's traffic. The restyle gets most of the visible gain.
- **Leave the pages as they were.** No work, but the public recipe page kept the old landing-page look (night background, pink glass cards) while the app moved to Night Market.

## Consequences

### Positive

- Search sees the same pages at the same addresses, so there is nothing to lose there.
- Someone who finds a recipe on Google and then opens the web app sees one product.
- The public pages keep working whatever happens to the web app.

### Negative

- Two recipe pages exist: the Worker's (`workers/share-page/src/render.ts`) and the web app's (`web/components/recipe/`). A design change to one has to be copied to the other by hand.
- The Worker's page uses only the default theme pack. Someone who picked another pack in the web app sees Mist here.
