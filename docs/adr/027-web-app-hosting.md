# ADR 027: Hosting the new web app

**Status:** Accepted
**Date:** 2026-11-20
**Deciders:** Yarden (product)

## Context

The new signed-in web app is a Next.js app in `web/` (ADR 026). It needs a host, and it has to sit next to the current site. Today GitHub Pages serves the landing page, guides, legal pages and the Expo web app at `/app`. The Cloudflare Worker `pinch-share-page` serves `/s/*`, `/r/*` and a few verification files. DNS for `pinch-app.io` is on Cloudflare.

Traffic is small: about 140 web sessions and 370 page views in November 2026 so far. There is one Supabase project (production) and no staging.

The facts and sources are in `docs/research/08-web-app-hosting.md` (PIN-125).

## Decision

- **Host: Cloudflare Workers on the Workers Paid plan, with the OpenNext adapter (`@opennextjs/cloudflare`).** One new Worker, `pinch-web`, configured in `web/wrangler.jsonc` and deployed from GitHub Actions like the share Worker. *Reason:* same account, zone and deploy pattern we already run. Full Next.js support keeps the option of server-rendering the public recipe pages later (PIN-149). No commercial-use question.
- **Cost: $5 a month** (the Workers Paid minimum, or nothing extra if the account already has it). At 100 times today's traffic we would still use under 1% of what the plan includes. `next/image` optimization through Cloudflare Images stays off for now.
- **OpenNext, not vinext.** *Reason:* OpenNext runs the real `next build`, so what works in `next dev` is what ships, and the Next.js docs apply as written. vinext is Cloudflare's suggested path for new apps but is still marked beta in its docs. We can revisit with `npx vinext check` once `web/` has a few screens.
- **Address while we build: `next.pinch-app.io`**, as a Workers Custom Domain. The app is built with `basePath: '/app'` from day one, so it lives at `next.pinch-app.io/app` and the switch is only a route change.
- **Routing after the switch (PIN-147):**

  | Path | Served by |
  |---|---|
  | `/`, language versions, guides, legal pages, sitemaps, `llms.txt` | GitHub Pages |
  | `/app` and `/app/*` | `pinch-web` Worker |
  | `/s/*`, `/r/*`, `/sitemap-recipes.xml`, `/.well-known/*`, `/apple-app-site-association` | `pinch-share-page` Worker |
  | Old root links (`/s/...`, `/auth-callback...` before `/app` existed) | `404.html` on Pages, forwarding only |

  The routes are exactly `pinch-app.io/app` and `pinch-app.io/app/*`. Never `pinch-app.io/app*`, which would also catch `/apple-app-site-association`.
- **Previews: one public Worker Preview per PR on `workers.dev`,** built on a Linux runner in GitHub Actions. Previews are not behind Cloudflare Access. Preview builds set `NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED=false`, so no one can buy credits from a preview. Supabase gets one redirect-URL wildcard limited to our worker's preview hostnames.
- **Secrets and settings:** the public Supabase URL and key come from the existing GitHub Actions secrets, passed to `next build` as `NEXT_PUBLIC_*`. The Polar secrets stay in Supabase, where the checkout Edge Function uses them. The Cloudflare API token is the one the share Worker already uses.

## Required follow-ups

- **Backend:** `checkoutReturnUrl` in `supabase/functions/_shared/billing/polarPurchase.ts` only trusts `pinch-app.io`, `www.pinch-app.io` and localhost. Add `next.pinch-app.io` in a backend PR before credits are tested on the new app (PIN-141).
- **Supabase dashboard (by hand):** add `https://next.pinch-app.io/app/**` and the preview wildcard to the auth redirect URLs. `supabase/config.toml` does not hold the production list.
- **Cloudflare:** check whether the account already has Workers Paid. If not, subscribe before the first deploy.

## Considered options

- **Cloudflare Workers Free.** $0, and since signed-in screens render in the browser (ADR 026) the 10 ms CPU cap might hold. Rejected because a server-rendered page can pass 10 ms and fail at random, and $5 removes the question.
- **Vercel.** The native Next.js host with the best previews. The Hobby plan is for "personal or non-commercial use" only, so we would need Pro at $20 per developer ($40 a month for two). Vercel also advises against a proxy in front of it, which makes serving `/app` on the same domain as GitHub Pages awkward.
- **Static export on GitHub Pages.** $0 and no new moving parts. It has no server rendering, middleware or ISR, so the new app could never take over `/r/*`. GitHub's terms also say Pages is not for running an online business, which already applies to today's `/app`.
- **vinext on Workers.** Cloudflare's suggested default, with faster builds. Not chosen while its docs mark it beta and it reimplements Next.js rather than running it.
- **Previews behind Cloudflare Access.** Safer, since previews use production data. Rejected to keep previews easy to open for Harel and for agents testing changes. Preview URLs are hard to guess, and purchases are off.

## Consequences

### Positive

- The new app, the share Worker and DNS live in one Cloudflare account, with one way to deploy.
- `/app` moves off GitHub Pages, so the signed-in product no longer depends on a host whose terms don't fit it.
- Every PR gets a link to try the change.

### Negative

- A preview is a real app on production data. Anyone with the link can sign in and change their own account through it.
- OpenNext on Windows is not guaranteed. Local `next dev` works, but the Cloudflare build runs in CI on Linux.
- Two hosts and two Workers serve one domain, so a routing mistake can hide a page. PIN-147 must test every old address after the switch.
