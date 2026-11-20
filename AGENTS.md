# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Backend changes (migrations, Edge Functions)

Production is the only Supabase project; there is no staging (a cost decision, so don't propose one). Merging to `master` deploys migrations and every function through `.github/workflows/deploy-backend.yml`.

- Deploy only by merging. Hand the user a PR instead of running `supabase db push`, `supabase functions deploy`, MCP `apply_migration` or migration SQL against production.
- Before merging, test with one of the paths in `supabase/README.md` → "Testing backend changes": local Supabase (the default), a `-preview` function for changes that need real data, or provider sandboxes for webhooks. Tell the user which one you used.
- Write migrations expand-then-contract, with a timestamp newer than every existing one. After any migration change, run `npm run db:types` (local Supabase started) and commit the regenerated `database.types.ts`; CI fails otherwise.
- Before writing or changing an Edge Function or a `_shared` module, read `docs/adr/024-backend-conventions.md`. It covers where files go, the handler wrapper, error shapes and data access.

# New web app (`web/`)

The Next.js app in `web/` replaces the Expo web app screen by screen. Decisions are in `docs/adr/026-web-app-foundations.md` and `docs/adr/027-web-app-hosting.md`.

- It is a separate npm project. Run its commands from `web/`: `npm ci`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run preview`.
- Next.js here is newer than your training data. Read `web/AGENTS.md` and the guides in `web/node_modules/next/dist/docs/` before writing code.
- Cache Components stay off: OpenNext does not fully support them on Cloudflare yet.
- Don't copy code from `src/` into `web/`. Code both apps need goes in `shared/` (next section).
- The lockfile in `web/` is `npm-shrinkwrap.json`. Never add a `package-lock.json` there: the Cloudflare build breaks (`shared/README.md` says why).
- A change that touches `metro.config.js` or the root configs must still pass `npx expo export -p android` and `-p ios`.

# Shared code (`shared/`)

`shared/` holds what the mobile app and the web app both use: recipe logic, the Supabase calls, types, the language files, the theme packs. Read `shared/README.md` before adding or moving a file there.

- Import it as `@shared/…` from `src/` and `web/`. Inside `shared/`, use relative imports.
- No `react-native`, `expo-*`, `next`, `react`, `@/…`, `process.env` or `__DEV__` in `shared/`. Root `npm run lint` fails on them. Take platform things as parameters.
- Only the packages in `shared/packages.json` may be imported there. Both apps must install each one at the same version.
- A change in `shared/` affects both apps. Run the root checks and the `web/` checks, and the Android and iOS exports.

# Onboarding

**Cookie tour**: `docs/onboarding/index.html` is the developer guide (architecture, AI model per task, local setup, workflow). When asked for the "cookie tour", open it in the user's browser (`open` on macOS, `start` on Windows, `xdg-open` on Linux) and offer to walk through it.
