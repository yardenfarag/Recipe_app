# shared/

Code that the mobile app (`src/`) and the new web app (`web/`) both use. It exists once, here.

## What goes here

- Recipe logic: scaling, unit conversion, formatting, tags, quotas, in-app message rules (`lib/`).
- The Supabase calls, one file per topic (`lib/supabase/`).
- Types (`types/`), the five language files (`i18n/locales/`), the theme packs and brand colours (`constants/`).

Tests sit next to the file they test. The root `npm test` runs them.

## What stays out

Anything that needs one platform stays in that app:

- Device storage, share intent, store purchases, the image picker, PDF export, navigation: `src/`.
- Next.js and browser-only code: `web/`.

When a module needs something from the platform, take it as a parameter. The Supabase client is the example: shared code cannot know where a session is stored, so each app passes its storage in.

## The rules (lint enforces them)

`npm run lint` at the repo root fails when a file in `shared/`:

- imports anything except its own files (relative paths) and the packages listed in `packages.json`. So no `react-native`, `expo-*`, `next`, `react`, and no `@/…`;
- reads `process.env`. The mobile app's variables are `EXPO_PUBLIC_*` and the web app's are `NEXT_PUBLIC_*`, so a shared file that reads one would be `undefined` in the other app;
- uses `__DEV__`, which exists only in the mobile app.

Also keep `window` and `document` behind a `typeof window !== 'undefined'` check. The lint rule does not catch those.

## Using it

Both apps import with the `@shared/` alias:

```ts
import { freeExtractsRemaining } from '@shared/lib/quotas';
import type { Recipe } from '@shared/types/recipe';
```

Inside `shared/`, use relative imports.

### The Supabase client

`lib/supabase/client.ts` exports `supabase`, and every shared module uses it. Each app creates the client once at startup with `initSupabaseClient({ url, key, storage })`:

- Mobile: `src/lib/supabase/client.ts` passes device storage. The root layout imports it first.
- Web: passes browser storage (arrives with sign-in, PIN-129).

Using `supabase` before the app has called `initSupabaseClient` throws.

## Adding a package

Shared code may only import packages that **both** apps install, at the same version.

1. Add the name to `shared/packages.json`.
2. Install the same version in the repo root and in `web/`.
3. Add a line for it to `paths` in `web/tsconfig.json`, next to the others.

`web/shared-setup.test.ts` fails until all three are done.

## Moving a module here

1. Check it imports no platform package, directly or through its imports.
2. `git mv` it and its test, so history survives.
3. Change its imports of other shared files to relative paths, and its importers to `@shared/…`.
4. Run the checks: root `npm test`, `npm run typecheck`, `npm run lint`, then `npx expo export -p android` and `-p ios`.

## How web/ reaches this folder

`shared/` sits outside `web/`, and the two apps have separate `node_modules`. Three settings make that work. Change them together or not at all:

- `web/next.config.ts` sets the build root to the repo root and points each package in `packages.json` at `web/node_modules`. Without that, a shared file's packages would be looked up in the mobile app's `node_modules`, which CI does not install for the web job.
- `web/tsconfig.json` and `web/vitest.config.mts` do the same for type-checking and tests.
- `shared/tsconfig.json` exists for tools that read the nearest tsconfig to a file. Without it they find the repo root's, which extends Expo's and cannot load where only `web/` is installed (the CI web job).
- `web/` keeps its lockfile as **`npm-shrinkwrap.json`**, not `package-lock.json`. npm treats the two the same. OpenNext (the Cloudflare build) takes the nearest folder with a `package-lock.json` as the project root; with one in `web/` it cannot follow imports into `shared/` and the Worker build fails. Don't rename it back.

We chose this over npm workspaces because workspaces would merge both apps into one install, and change how the mobile app's dependencies are laid out for every EAS build.
