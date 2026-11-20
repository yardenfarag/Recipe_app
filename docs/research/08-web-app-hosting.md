# Pinch Web App Hosting Research (PIN-125)

> **Sources:** the hosts' own pricing pages, docs and terms (Cloudflare, OpenNext, Vercel, GitHub), the Next.js docs and the Supabase docs. Every page below was read on **2026-11-20**. One Cloudflare blog post is cited for Cloudflare's own product status, and is marked as a blog post.
>
> **Project context:** the site at `pinch-app.io` is built by `scripts/build-web-site.mjs` and deployed to GitHub Pages by `.github/workflows/deploy-web.yml`. It holds the hand-built landing page at `/`, guides, legal pages, the Expo web export at `/app`, and a `404.html` that is the app shell and forwards old root links (`/s/…`, `/auth-callback…`) to `/app/…`. The Cloudflare Worker `pinch-share-page` (`workers/share-page/wrangler.toml`) sits on zone routes for `/s/*`, `/r/*`, `/sitemap-recipes.xml`, `/.well-known/*` and `/apple-app-site-association`, with a daily cron. DNS for `pinch-app.io` is on Cloudflare and proxied. Traffic is about 140 web sessions and ~370 page views in Nov 2026 so far. There is one Supabase project (production) and no staging.
>
> **Why this note exists:** PIN-125. The new signed-in web app is a Next.js app in `web/`. It will replace the Expo web app at `/app`. We need to pick a host and decide how it sits next to the current site.

---

## Summary

Host the new app on **Cloudflare Workers (Workers Paid plan, $5/month)** with the OpenNext adapter (`@opennextjs/cloudflare`). Build it at `next.pinch-app.io` (a Workers Custom Domain) while we work, then move it to `pinch-app.io/app` with `basePath: '/app'` and two zone routes. GitHub Pages keeps `/` and the guides, and the existing share Worker keeps `/s/*` and `/r/*`.

Monthly cost: **$5** (Workers Paid minimum). Our traffic, even at 100×, stays far inside what $5 includes. If the Cloudflare account is already on Workers Paid for the share Worker, the added cost is **$0**.

---

## Comparison table

| | Cloudflare Workers + OpenNext | Vercel | Static export on GitHub Pages |
|---|---|---|---|
| Monthly cost at our traffic | $5 (Paid). Free would cost $0 but its 10 ms CPU cap is tight for SSR | $20 per developer seat on Pro (Hobby not allowed, see below). Two developers = $40 | $0 |
| Free plan allows a commercial product? | No commercial-use clause found in the pages read (see "Could not verify") | **No.** Hobby is "personal or non-commercial use" only | **Doubtful.** Pages is not for running "your online business" |
| SSR / middleware / ISR | Yes / Yes (Node middleware: experimental) / Yes | Yes / Yes / Yes (native platform) | No / No / No |
| Per-PR preview URLs | Yes (Worker Previews, Workers Builds posts the URL on the PR) | Yes (every push and PR) | No |
| Fits next to the existing Worker and Cloudflare DNS | **Best.** Same account, same zone, routes and Custom Domains are native | Poor. Vercel does not recommend a proxy in front of it, and `/app` on the same host needs one | Fits, but it is the current setup with its limits |

---

## Q1. Host options: cost, free-plan limits, commercial use

### (a) Cloudflare Workers with `@opennextjs/cloudflare`

**Cost.**
- Workers Free: no fee, "100,000 per day" requests, "10 milliseconds of CPU time per invocation". ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), read 2026-11-20)
- Workers Paid: "minimum charge of $5 USD per month for an account". It includes "10 million included per month" requests and "30 million CPU milliseconds included per month". Overage is "+$0.30 per additional million" requests and "+$0.02 per additional million CPU milliseconds". ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/))
- "Requests to static assets are free and unlimited." ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/))
- Workers Builds (Cloudflare's CI): 3,000 build minutes a month on Free, 6,000 on Paid, 20-minute build timeout. ([Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/))

At 370 page views a month, or 37,000 at 100×, we use well under 1% of the Paid allowance. **$5/month.**

**Why Paid, not Free.** The Free CPU cap is 10 ms per request; Paid allows up to 5 minutes (default 30 s). ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) Server rendering a React page can pass 10 ms. On Free we would see random failures. $5 removes that risk. The Paid plan is per account, so if the account already pays for Workers, the new app adds nothing.

**Commercial use.** I found no clause in the Workers pricing or limits pages that limits the Free plan to non-commercial use. I did not read Cloudflare's full self-serve terms. See "Could not verify".

**Is Cloudflare Pages still the path for Next.js?** No. Cloudflare's Pages Next.js guide says "Cloudflare recommends vinext on Workers for full-stack Next.js applications" and keeps Pages only for a static export. ([Pages: Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/)) The page does not use the word "deprecated", but full-stack Next.js on Pages is no longer the recommended path. The Workers guide lists Pages only for the case where "Your application is a static export and you specifically want to deploy it to Cloudflare Pages." ([Workers: Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/))

**New since we last looked: vinext.** Cloudflare now says "Cloudflare recommends vinext as the default way to run Next.js applications on Cloudflare Workers", and its docs say "vinext is in beta." ([Workers: Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)) vinext is a Vite plugin that reimplements the Next.js API; it does not run the real Next.js build. Cloudflare's own blog announced "Vinext 1.0" as production-ready on 2026-09-28, with test compatibility above 99% "excluding cache components". ([Cloudflare blog, vinext 1.0](https://blog.cloudflare.com/vinext-nextjs-on-vite) — a blog post, cited only for Cloudflare's own product status) Cloudflare's OpenNext page is not marked deprecated. It says "Cloudflare recommends vinext instead of OpenNext for new Next.js applications" and "Migrate to vinext when compatibility allows." ([Workers: OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/))

I still recommend OpenNext for us (see Recommendation): it builds with real `next build`, so what runs in `next dev` is what ships. vinext is an open question.

### (b) Vercel

**Cost.**
- Hobby: "Hobby is free". Pro: "$20/mo." A Pro developer seat is "$20 / month"; viewer seats are unlimited. Hobby has 1 developer seat. ([Vercel pricing](https://vercel.com/pricing))
- Hobby includes 1,000,000 function invocations, 100 GB Fast Data Transfer, 1,000,000 CDN requests, 4 CPU-hours of Active CPU, and 5,000 image transformations a month. Hobby has no "Team collaboration features" and 100 deployments per day. ([Vercel Hobby plan](https://vercel.com/docs/plans/hobby))
- On Hobby, "if you exceed your usage limits … you will have to wait until 30 days have passed". ([Vercel Hobby plan](https://vercel.com/docs/plans/hobby))

**Commercial use.** Vercel's terms say: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." ([Vercel Terms of Service](https://vercel.com/legal/terms), Hobby Plan section) Pinch sells credit packs, so Hobby is not allowed. The Fair Use Guidelines page has "Examples of fair use" and "Never fair use" headings, but their body did not load in my fetch, so I could not quote Vercel's own definition of commercial usage. ([Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines))

So Vercel means **Pro: $20/month for one developer, $40/month with Harel** as a second developer seat.

### (c) Next.js static export (`output: 'export'`) on GitHub Pages

**Cost.** $0.

**Limits.** "Published GitHub Pages sites may be no larger than 1 GB." Soft bandwidth limit of "100 GB per month". The 10-builds-per-hour soft limit "does not apply if you build and publish your site with a custom GitHub Actions workflow" (we do). ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits))

**Commercial use.** The same page says "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business". It goes on to name e-commerce sites, sites "primarily directed at" facilitating commercial transactions, and commercial software as a service (SaaS). It also says Pages sites "shouldn't be used for sensitive transactions like sending passwords or credit card numbers." ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits))

Pinch's card details go to Polar's hosted checkout, not to our page. But a signed-in app that sells credit packs is close to "commercial software as a service". **This also applies to the Expo app at `/app` today.** Moving the signed-in app off Pages removes that risk. The landing page and guides are a much smaller concern.

---

## Q2. Next.js feature support per host

**Cloudflare Workers + OpenNext.**
- Versions: "All minor and patch versions of Next.js 16 and the latest minor of Next.js 15 are supported." "Next.js 14 is no longer supported." ([OpenNext Cloudflare](https://opennext.js.org/cloudflare))
- Supported: SSR, middleware, ISR, image optimization (through Cloudflare Images), PPR. ([OpenNext Cloudflare](https://opennext.js.org/cloudflare)) Cloudflare's page adds App Router, Pages Router, Route Handlers, React Server Components, SSG, Server Actions, response streaming and `next/after`. ([Workers: OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/))
- Not supported or partial:
  - Node.js middleware (Next.js 15.2+): OpenNext lists "experimental support since `@opennextjs/cloudflare` 1.20.3" ([OpenNext Cloudflare](https://opennext.js.org/cloudflare)); Cloudflare's page still says "Node.js middleware introduced in Next.js 15.2 is not yet supported." ([Workers: OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)) Treat it as not ready. Plain (edge) middleware is fine.
  - The app "should use the Node.js runtime"; the Edge runtime "does not support all Next.js features." ([OpenNext Cloudflare](https://opennext.js.org/cloudflare))
  - **"Windows full support is not guaranteed."** ([OpenNext Cloudflare](https://opennext.js.org/cloudflare)) We develop on Windows. `next dev` is unaffected; the OpenNext build and preview should run in CI (Linux) or WSL.
  - Size: OpenNext says "3 MiB on the Workers Free plan, and 10 MiB on the Workers Paid plan." ([OpenNext Cloudflare](https://opennext.js.org/cloudflare)) Cloudflare's current limits page says 64 MiB uncompressed on both plans and "There is no compressed size limit." ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) The two disagree; Cloudflare's page is the authority for its own limits.
  - Image optimization is not free: it uses Cloudflare Images. I did not check Images pricing. We can skip `next/image` optimization at first (recipe images already come from Supabase Storage).

**Vercel.** Vercel is Next.js's own platform, so SSR, middleware, ISR and image optimization all work. Hobby includes 5,000 image transformations a month. ([Vercel Hobby plan](https://vercel.com/docs/plans/hobby)) I did not find a gap that matters to us.

**Static export.** See Q3. No SSR, no middleware, no ISR, no default image optimization.

---

## Q3. What a static export gives up

The Next.js docs list these as **not supported** with `output: 'export'` ([Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)):

- Dynamic Routes with `dynamicParams: true`, and Dynamic Routes without `generateStaticParams()`
- Route Handlers that rely on the Request
- Cookies
- Rewrites, Redirects, Headers (in `next.config`)
- Proxy (the file formerly called middleware)
- Incremental Static Regeneration
- Image Optimization with the default loader
- Draft Mode, Server Actions, Intercepting Routes

Server Components still run, but only at build time. "If you need to read dynamic values from the incoming request, you cannot use a static export." ([Next.js static exports](https://nextjs.org/docs/app/guides/static-exports))

What this means for Pinch:
- **No server-side auth.** No cookie-based Supabase session, no protected route checked on the server. Everything stays client-side, like the Expo web app today.
- **No dynamic recipe URLs** without listing every id at build time. A user's recipe at `/app/recipe/<id>` would need a client-side fallback through `404.html`, the same trick the current build uses.
- **It could never take over `/r/*`.** Public Hub recipe pages are rendered per request by the share Worker (for crawlers and for new recipes). A static export can't render a recipe that was published after the build, and has no ISR to refresh it.
- **No server code for later work**, for example a server-side Polar call or a webhook endpoint. Those would stay in Supabase Edge Functions.

---

## Q4. Address while we build

Use a subdomain until the switch. `next.pinch-app.io` is clear and short. `beta.pinch-app.io` suggests a user-facing beta, which this is not at first.

What each host needs on our Cloudflare-managed zone:

- **Cloudflare Workers:** add a **Custom Domain** to the Worker. "Cloudflare will create DNS records and issue necessary certificates on your behalf." Custom Domains connect a Worker to "a domain or subdomain", for example `shop.example.com`. A Custom Domain takes a whole hostname, not a path. ([Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)) One line in `wrangler.toml`, no manual DNS.
- **Vercel:** add the domain in Vercel and create the `CNAME` that Vercel shows in Settings > Domains. ([Vercel troubleshooting domains](https://vercel.com/docs/domains/troubleshooting)) Vercel says: "**We do not recommend** placing a reverse proxy server in front of your Vercel project". ([Vercel reverse proxy](https://vercel.com/docs/security/reverse-proxy)) So the record should be **DNS only** (grey cloud) in Cloudflare. If it is proxied, SSL must be **Full (strict)** to avoid redirect loops. ([Vercel reverse proxy](https://vercel.com/docs/security/reverse-proxy))
- **GitHub Pages:** a Pages site has one custom domain (apex and/or `www`). Project sites under an account inherit the account's custom domain as a path, for example `www.octocat.com/octo-project`, unless the repo sets its own. ([GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)) This repo's Pages site already owns `pinch-app.io`, so a separate subdomain would need a second repo or a second host.

---

## Q5. Routing on pinch-app.io after the switch

**Can a Worker take `pinch-app.io/app*` while GitHub Pages keeps `/`?** Yes. This is exactly how `/s/*` and `/r/*` work today: the share Worker takes those routes, and everything else goes through to GitHub Pages. Routes need a proxied DNS record ([Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)); ours already is.

**Route matching rules** ([Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)):
- "When more than one route pattern could match a request URL, the most specific route pattern wins."
- A path ending in `*` "matches all suffixes of that path". The docs' example: `example.com/path*` matches `/path`, `/path2` and `/path/readme.txt`.
- So `pinch-app.io/app*` would also match `/apple-app-site-association`. The share Worker's exact route for that file is more specific and should win, but there is no reason to depend on it. **Use two routes instead: `pinch-app.io/app` and `pinch-app.io/app/*`.**
- Limit: 1,000 routes per zone. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))

**`basePath: '/app'`.** Next.js serves everything under `/app`, including `/app/_next/…`. `next/link` adds the prefix itself; `next/image` `src` needs it written in. The value "must be set at build time and cannot be changed without re-building". ([Next.js basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)) While the app lives at `next.pinch-app.io`, we can build it with `basePath: '/app'` from day one and reach it at `next.pinch-app.io/app`. Then the switch is only a route change, with no rebuild and no path surprises.

**Who serves what after the switch:**

| Path | Served by | Change from today |
|---|---|---|
| `/` , `/<lang>/…`, `/guides/*`, legal pages, `sitemap.xml`, `llms.txt`, `robots.txt` | GitHub Pages | None |
| `/app`, `/app/*` | New Next.js Worker (routes `pinch-app.io/app` and `pinch-app.io/app/*`) | Was Expo export on Pages |
| `/s/*`, `/r/*`, `/sitemap-recipes.xml` | Share Worker | None |
| `/.well-known/*`, `/apple-app-site-association` | Share Worker | None |
| Old root links (`/auth-callback…` etc.) | GitHub Pages `404.html` forwards to `/app/…` | `404.html` stops being the Expo shell; it keeps only the forwarding script |

`build-web-site.mjs` would stop running `expo export` and stop copying the app shell into `404.html`. `/r/*` can later move into the Next.js app if we want, because the new app runs on the same Worker platform with SSR and ISR; it would just be a route change.

---

## Q6. Previews

**Cloudflare Workers.**
- Worker **Previews** give "each branch an isolated, production-like environment under the same Worker", created with `npx wrangler preview` (Wrangler 4.135.0+). URL: `<preview-name>-<worker-name>.<subdomain>.workers.dev`. Free allows 100 Previews per Worker, Paid 500. ([Worker Previews](https://developers.cloudflare.com/workers/previews/))
- Workers Builds can "create Previews automatically and post their URLs to pull requests". Previews can be served on "workers.dev, a custom domain, or both", and can be protected with Cloudflare Access. ([Changelog, 2026-09-22](https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/))
- Each Preview has its own vars (`previews.vars` in Wrangler config) and secrets (`wrangler preview secret put`). "Previews do not inherit production settings." ([Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/))
- Old Previews are deleted only when the limit is reached, or by `wrangler preview delete`. ([Worker Previews](https://developers.cloudflare.com/workers/previews/))
- Note: the share Worker has `workers_dev = false`. The new Worker needs `workers.dev` on (or a preview custom domain) for Previews to have a URL.

**Vercel.** A preview deployment is created on every push to a non-production branch and every PR. ([Vercel environments](https://vercel.com/docs/deployments/environments)) URLs are `<project-name>-<unique-hash>-<scope-slug>.vercel.app` per commit and `<project-name>-git-<branch-name>-<scope-slug>.vercel.app` per branch. ([Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls)) New projects protect previews with Vercel Authentication by default. ([Vercel environments](https://vercel.com/docs/deployments/environments))

**GitHub Pages.** One site per repo. I found no per-PR preview in the Pages docs I read.

**Supabase auth and previews.** Previews talk to production Supabase, so they see real users and real data.
- Supabase only redirects to URLs on the Redirect URLs allow list. Wildcards are allowed: `*` "matches any sequence of non-separator characters", `**` "matches any sequence of characters". Supabase's own example for Vercel previews is `https://*-<team-or-account-slug>.vercel.app/**`. Supabase also says: "we recommend setting the exact redirect URL path for your site URL in production." ([Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))
- In this repo the allow list lives only in the Supabase dashboard. `supabase/config.toml` has `[auth.email]` settings but no `site_url` or `additional_redirect_urls`. `src/lib/authRedirect.ts` notes that a URL off the list falls back to the Site URL (`pinch://`), "a blank page in a browser". Google sign-in and password reset pass `redirectTo` (`src/lib/supabase/auth.ts`). Email sign-in uses 6-digit codes, which don't need a redirect.
- For Cloudflare previews we would add `https://*-<worker-name>.<subdomain>.workers.dev/**`. The `<subdomain>` is our account's own workers.dev subdomain, so only our account can deploy a host that matches.
- **Risks.**
  1. Preview code runs with real sessions. A bug in a PR can write to real users' data, under RLS as that user.
  2. A wide wildcard (e.g. `https://*.workers.dev/**`) would let any workers.dev site receive our users' OAuth tokens. Keep the pattern tied to our worker name and subdomain.
  3. **Real money.** A preview with credit packs on would start real Polar checkouts. Build previews with purchases off.
  4. A preview on a custom domain under `pinch-app.io` shares the parent domain with production. Keep previews on `workers.dev` unless we need cookies to behave like production.

---

## Q7. Secrets and settings

What the web app needs is small, and all of it is public:

| Setting | Today (Expo web) | New app |
|---|---|---|
| Supabase URL | GitHub Actions secret `EXPO_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| Supabase publishable (anon) key | GitHub Actions secret `EXPO_PUBLIC_SUPABASE_KEY` | `NEXT_PUBLIC_SUPABASE_KEY` |
| Web credit packs on/off | GitHub Actions variable `EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED` | `NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED` (`false` in previews) |
| Polar access token, webhook secret | Supabase function secrets `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` (`supabase/config.toml` comments, `polar-checkout`) | Unchanged. Never in the web app |
| Polar product ids | Looked up by `polar-checkout` from product metadata `pack_id` | Unchanged |

`NEXT_PUBLIC_*` values are inlined "at build time" and are then "frozen with the value evaluated at build time". Other variables are server-only and can be read at runtime during dynamic rendering. ([Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)) So the Supabase URL and key must be present **when `next build` runs**, wherever that is.

- **Cloudflare (build in GitHub Actions, as the share Worker does today):** keep the existing GitHub Actions secrets and pass them as `NEXT_PUBLIC_*` env to the build step. Server-only runtime values go in Wrangler `[vars]` or `wrangler secret put` (the share Worker already does this with `SUPABASE_KEY`). If we use Workers Builds instead, OpenNext says to define "Build variables and secrets" so the build can inline `NEXT_PUBLIC_...`, and to set runtime variables in the dashboard with `--keep-vars` on deploy. ([OpenNext env vars](https://opennext.js.org/cloudflare/howtos/env-vars)) Preview values go in `previews.vars` and `wrangler preview secret put`. ([Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/))
- **Vercel:** environment variables in the Vercel dashboard, scoped to Production, Preview or a branch. "Preview deployments use the variables you scope to the **Preview** environment." ([Vercel environments](https://vercel.com/docs/deployments/environments)) Vercel builds the app, so the values live in Vercel, not in GitHub.
- **GitHub Pages:** same as today, GitHub Actions secrets and variables passed to the build.

**Polar return URL needs a backend change on any host.** `checkoutReturnUrl` in `supabase/functions/_shared/billing/polarPurchase.ts` only trusts `https://pinch-app.io`, `https://www.pinch-app.io` and `http://localhost`. From `next.pinch-app.io` or a preview, the buyer would come back to the default URL (the old app) instead. Adding `next.pinch-app.io` is a `_shared` change: read `docs/adr/024-backend-conventions.md` and ship it as a PR.

---

## Recommendation

**Host:** Cloudflare Workers, Workers Paid plan, Next.js 16 with `@opennextjs/cloudflare`. One new Worker (for example `pinch-web`) with its config in `web/wrangler.jsonc`.

**Monthly cost:** **$5** (Workers Paid minimum), or **$0 extra** if the account already has Workers Paid. Our traffic at 100× is under 1% of what's included. Image optimization through Cloudflare Images would cost extra; leave it off at first.

Why this one:
- Same account, same zone and same deploy pattern (`wrangler-action` in GitHub Actions) as the share Worker.
- Full Next.js: SSR, middleware, ISR. The new app can later take over `/r/*`.
- Per-PR Previews with their own vars and secrets.
- No commercial-use question, unlike Vercel Hobby and GitHub Pages.
- Vercel Pro would work but costs $20–$40/month and doesn't want Cloudflare's proxy in front, which makes `/app` on the same host awkward.

**Dev address:** `next.pinch-app.io`, a Workers Custom Domain. Build with `basePath: '/app'` from day one, so the app is at `next.pinch-app.io/app`.

**After the switch:**

| Path | Served by |
|---|---|
| `/`, languages, guides, legal, sitemaps, `llms.txt` | GitHub Pages |
| `/app`, `/app/*` | `pinch-web` Worker (two routes, not `/app*`) |
| `/s/*`, `/r/*`, `/sitemap-recipes.xml`, `/.well-known/*`, `/apple-app-site-association` | `pinch-share-page` Worker |
| Old root links | `404.html` on Pages, forwarding script only |

**Previews:** Worker Previews on `workers.dev`, one per PR, created from GitHub Actions with `wrangler preview` (Linux runner, which also avoids OpenNext's Windows gap). Preview builds set `NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED=false`. Add one Supabase redirect URL tied to our worker name and workers.dev subdomain. Protect previews with Cloudflare Access if we want them private.

**Secrets:** reuse the GitHub Actions secrets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY`, passed to `next build` as `NEXT_PUBLIC_*`. Polar secrets stay in Supabase. Add `next.pinch-app.io` to `checkoutReturnUrl` in a backend PR.

### Open questions for Yarden

> **Decided 2026-11-20 in `docs/adr/027-web-app-hosting.md`:** Workers Paid, OpenNext, and public previews (no Cloudflare Access).

1. **Is the Cloudflare account already on Workers Paid?** If yes, this costs nothing more. If no, it's $5/month.
2. **OpenNext or vinext?** Cloudflare now points new apps at vinext (beta in the docs, "1.0" on its blog). I chose OpenNext because it ships the real Next.js build. Worth a one-hour `npx vinext check` once `web/` has a few pages.
3. **Public previews or behind Cloudflare Access?** Previews use production data, so Access is the safer default. It adds a login step for Harel and for agents testing previews.

---

## Could not verify

- **Cloudflare Workers Free and commercial use.** No clause either way in the pricing and limits pages. I did not read Cloudflare's self-serve subscription agreement.
- **Vercel's own definition of "commercial usage".** The Fair Use Guidelines page's "Examples" sections did not render in my fetch. The Terms of Service clause ("personal or non-commercial use") was verified.
- **Preview hostnames on a custom domain** (e.g. wildcard certificates for `<preview>.next.pinch-app.io`): the Previews configuration page points to another page I did not read. The recommendation uses `workers.dev`, which does not need this.
- **Cloudflare Images pricing** for `next/image`: not read.
- **Worker bundle size:** OpenNext's 3/10 MiB figures disagree with Cloudflare's 64 MiB uncompressed limit. Not tested with a real build.
- **GitHub Pages per-PR previews:** I found none, but I did not search all of GitHub's docs.
