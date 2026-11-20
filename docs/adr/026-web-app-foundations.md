# ADR 026: Foundations of the new web app

**Status:** Accepted
**Date:** 2026-11-20
**Deciders:** Yarden (product)

## Context

The signed-in web app at `pinch-app.io/app` is the Expo app running in a browser. It works, but it looks and behaves like a stretched phone app, and every web fix risks the mobile build. We are rebuilding it as a Next.js app in a new `web/` folder, screen by screen, and switching `/app` over once it covers everything (project "New web frontend (Next.js)", PIN-52).

Every screen depends on a few choices: styling, components, data, rendering, translations, URLs, tests and screen sizes. This ADR settles them once (PIN-126). Where it is hosted is a separate decision (PIN-125).

## Decision

- **Sign-in is required.** The new web app has no guest mode. A signed-out visitor goes to sign-in, then back to the page they asked for. *Reason:* the data layer needs only one path (the account), and nothing is stored in the browser except the session and preferences.
- **Styling: Tailwind v4 in `web/`, with the brand colours and all seven theme packs as CSS variables.** The variables are generated from `src/constants/themes.ts` and `src/constants/brandColors.js`, so a colour changes in one place. *Reason:* the theme packs are plain data, so all seven cost about the same as only light and dark.
- **Components: shadcn/ui on Radix primitives**, copied into `web/` and styled with Tailwind. *Reason:* correct keyboard, focus and screen-reader behaviour for dialogs, menus and sheets, a built-in right-to-left setting, and the code is ours to change.
- **Data: TanStack Query over supabase-js, in the browser.** Supabase calls come from the shared code (PIN-128), not from screens. *Reason:* caching, loading and retry states come for free, and it is the same choice the Architecture project plans for mobile (S3, PIN-40). This decides it for both apps.
- **Rendering: signed-in screens render in the browser.** Pages are an App Router shell with client components. The session lives in the browser, as it does today. There is no server-side auth. *Reason:* nothing behind sign-in needs SEO, and server sessions mean cookies, middleware and a second way to read the user.
- **Translations: the existing five locale files, through i18next.** They move into the shared code (PIN-128), so both apps read the same files. Hebrew and Arabic set `dir="rtl"` on `<html>`. Layout uses Tailwind's start/end utilities, never left/right. *Reason:* one set of strings, and right-to-left mostly comes free.
- **URLs: `basePath: '/app'` and today's paths.** `/app/recipe/<id>`, `/app/hub/<id>`, `/app/settings/...`, `/app/s/<token>`, `/app/auth-callback` and `/app/reset-password` keep working. *Reason:* old links, bookmarks and sign-in return addresses survive the switch.
- **Tests: Vitest and Testing Library for units. Playwright for three flows: sign in, save a recipe, open a recipe.** Playwright runs in CI against local Supabase. *Reason:* there is no staging, and browser tests must not write to production.
- **Screen sizes: phone, tablet and desktop from the start, mobile-first.** Desktop uses the layouts agreed on the parked PIN-109 branch: side navigation, ingredients and steps side by side on the recipe page, grids of 3 to 5 columns.

## Left out of the first version

- Guest mode.
- Server rendering and server-side auth.
- Offline use and a service worker.
- Push notifications.
- The public pages (landing page, guides, `/s/*`, `/r/*`). Whether they move is PIN-149.

## Considered options

- **Keep guest mode.** About 46% of web sessions in the last 30 days had no account, so some people who try it today without signing up may not stay. It would need a guest library in the browser and a merge into the account on sign-up. Rejected for simplicity; it can be added later if sign-ups suffer.
- **Only light and dark at first.** Slightly less to test, but the theme packs are data and the CSS variables are generated, so the saving is small.
- **Write our own dialogs and menus.** Full control, but focus traps, keyboard handling and screen readers are easy to get wrong.
- **A heavier component library (MUI, Mantine).** Complete, but its own styling system would fight Tailwind and the theme packs.
- **Server components that fetch data with a cookie session (`@supabase/ssr`).** Faster first paint, but more moving parts and no SEO gain behind sign-in.
- **SWR or plain hooks instead of TanStack Query.** Lighter, but mobile is already headed to TanStack Query, and two data libraries would mean two sets of habits.

## Consequences

### Positive

- A new screen is only its own content: shell, theme, language, direction and data access are settled.
- Because nothing renders on the server, the hosting choice in PIN-125 stays open, including a static export.
- Mobile and web share strings, logic and the data library.

### Negative

- First paint shows a loading state before data arrives, on every signed-in page.
- Signed-out web visitors can no longer try an import before making an account.
- Moving the locale files and Supabase calls into shared code (PIN-128) has to happen before most screens can start.
