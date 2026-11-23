# Switching pinch-app.io/app between the web apps (PIN-147)

**Audience:** Yarden, Harel, and agents working for them.

Since PIN-147, `pinch-app.io/app` is the new web app (`web/`, the `pinch-web` Worker). For two weeks after the switch, the Expo web app can come back within minutes. After that, PIN-148 removes it.

## How it's wired

| Address | Served by | Set in |
|---|---|---|
| `/app`, `/app/*` | `pinch-web` Worker (new web app) | `web/wrangler.jsonc` → `routes` |
| `next.pinch-app.io/app` | the same Worker, a second address until PIN-148 | `web/wrangler.jsonc` |
| `/s/*`, `/r/*`, `/sitemap-recipes.xml`, app-link files | `pinch-share-page` Worker | `workers/share-page/wrangler.toml` |
| Everything else: `/`, languages, guides, legal pages, `404.html` | GitHub Pages | `scripts/build-web-site.mjs` |

A Worker route wins over GitHub Pages. GitHub Pages still builds the Expo web app into `/app`. Nobody reaches it while the routes exist, and it answers again as soon as they're removed. That copy is the way back.

`404.html` on Pages is still the Expo app shell. Its first script sends old root links (`/auth-callback`, `/reset-password`, `/legal.html`) on to `/app/…` before anything else loads, so they reach the new app. PIN-148 replaces it with a small forwarding page.

People stay signed in across the switch, both ways. Both apps keep the Supabase session in `localStorage` under supabase-js's default key, and they're on the same site.

`node scripts/check-web-routing.mjs` checks every kind of address. Use `--expect expo` after switching back. The deploy workflow runs it after every deploy, and expects whichever app `web/wrangler.jsonc` routes to.

## Switching over

Run `bash scripts/web-app-switch-wizard.sh` from the repo root at a quiet hour. It merges the PR, checks the routing, two browsers, sign-in, an import and a test purchase, practises switching back once, and posts the "new look" message.

## Switching back

Use this when the new app is broken for people and a fix will take longer than a few minutes.

1. **Remove the routes.** In the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/workers/services/view/pinch-web/production/settings), go to Workers & Pages → `pinch-web` → Settings → Domains & Routes. Remove `pinch-app.io/app/*` and `pinch-app.io/app`. Leave `next.pinch-app.io`, so the new app stays reachable for fixing. This takes effect within a minute.
2. **Check:** `node scripts/check-web-routing.mjs --expect expo`.
3. **Keep it that way.** Any merge that touches `web/` or `shared/` redeploys the Worker and puts the routes back. Open a PR that removes the two `pinch-app.io/app` routes from `web/wrangler.jsonc`, and merge it before anything else in `web/` or `shared/`. Its deploy then checks that `/app` is the Expo app.
4. **Turn off the "new look" message** in Admin → Messages.

Purchases keep working: both apps read the same `EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED` switch, and Polar trusts both addresses.

**To switch forward again**, revert the PR from step 3. If the routes were removed only in the dashboard, run the deploy again instead: `gh workflow run deploy-web-app.yml --ref master`. Either way, the deploy's check confirms `/app` is the new app.

## Record

| When | What | Result |
|---|---|---|
| | Switched over | |
| | Switch-back drill (wizard stages 8–9) | |
