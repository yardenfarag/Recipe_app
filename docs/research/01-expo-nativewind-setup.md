# ChopChop MVP: Expo + NativeWind Setup Research

> **Sources:** Official Expo documentation ([docs.expo.dev](https://docs.expo.dev)) and NativeWind documentation ([nativewind.dev](https://www.nativewind.dev)) only. Researched July 2026.
>
> **Project context:** React Native Expo app with NativeWind, Supabase, Gemini AI. MVP target: run on a physical phone via **Expo Go**.

---

## 1. Latest Expo SDK & `create-expo-app` Defaults

### Latest SDK (July 2026)

| Expo SDK | React Native | React | Min Node.js |
|----------|--------------|-------|-------------|
| **57.0.0** (latest stable) | 0.86 | 19.2.3 | 22.13.x |
| 56.0.0 | 0.85 | 19.2.3 | 22.13.x |
| 55.0.0 | 0.83 | 19.2.0 | 20.19.x |

**Source:** [Expo SDK reference](https://docs.expo.dev/versions/latest/)

Expo releases SDK versions three times per year. Pre-release channels: `canary` and `beta`.

### `create-expo-app` defaults (critical for Expo Go)

```sh
npx create-expo-app@latest --template default@sdk-57
```

**During the SDK 57 transition period:**

- `create-expo-app@latest` **without** `--template` creates an **SDK 54** project.
- **If you plan to use Expo Go on a physical device, use an SDK 54 project.**
- Otherwise, use `--template default@sdk-57` for SDK 57.

**Sources:**
- [Create a project](https://docs.expo.dev/get-started/create-a-project/)
- [create-expo-app reference](https://docs.expo.dev/more/create-expo/)
- [Expo Router introduction](https://docs.expo.dev/router/introduction/)

### Default template contents

The `default` template is designed for multi-screen apps and includes:

| Feature | Included |
|---------|----------|
| Expo Router | Yes |
| TypeScript | Yes |
| Expo CLI | Yes |
| File-based routing | Yes |
| Example starter code | Yes |

Other templates: `blank`, `blank-typescript`, `tabs`, `bare-minimum`.

React Navigation alternative: `--example with-react-navigation`.

**Source:** [create-expo-app — Templates](https://docs.expo.dev/more/create-expo/)

### ChopChop MVP recommendation

For **Expo Go on a physical phone in July 2026**, start with the SDK 54 default (no template flag):

```sh
npx create-expo-app@latest chopchop
```

Expo Go on the App Store / Play Store supports **one SDK version at a time**. On iPhone, older Expo Go versions cannot be side-loaded ([development builds intro](https://docs.expo.dev/develop/development-builds/introduction/)). SDK 54 aligns with the store version during the transition.

---

## 2. NativeWind v4 Setup with Expo

NativeWind works with Expo and provides a streamlined path. Current docs (updated Feb 2026) describe the v4-style setup using `nativewind/preset`, `nativewind/metro`, and `nativewind/babel`.

**Source:** [NativeWind — Installation (Expo)](https://www.nativewind.dev/docs/getting-started/installation)

### Step 1 — Install dependencies

```sh
npm install nativewind react-native-reanimated react-native-safe-area-context
npm install --dev tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11 babel-preset-expo
```

Both `react-native-reanimated` and `react-native-safe-area-context` are **included in Expo Go** ([third-party libraries in Expo Go](https://docs.expo.dev/versions/latest/sdk/third-party-overview/), [reanimated](https://docs.expo.dev/versions/latest/sdk/reanimated/)).

Optional scaffold:

```sh
npx rn-new --nativewind
```

### Step 2 — Tailwind CSS

```sh
npx tailwindcss init
```

**`tailwind.config.js`** — for Expo Router default (`src/` layout):

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
```

**`global.css`:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3 — Babel

**`babel.config.js`:**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

> **Note:** Expo Router's manual install uses only `babel-preset-expo` ([Router installation](https://docs.expo.dev/router/installation/)). NativeWind adds the second preset and `jsxImportSource`. Reanimated's Babel plugin is auto-configured by `babel-preset-expo` when installed ([reanimated docs](https://docs.expo.dev/versions/latest/sdk/reanimated/)).

### Step 4 — Metro

**`metro.config.js`:**

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

### Step 5 — Import CSS

With **Expo Router**, import in the root layout (not a standalone `App.tsx`):

```tsx
// src/app/_layout.tsx
import "../../global.css";
```

Or use a [custom entry point](https://docs.expo.dev/router/installation/) that imports CSS before `expo-router/entry`.

### Step 6 — `app.json` web bundler

```json
{
  "expo": {
    "web": {
      "bundler": "metro"
    }
  }
}
```

Required for both NativeWind and Expo Router web support.

### Step 7 — TypeScript (optional)

**`nativewind-env.d.ts`:**

```ts
/// <reference types="nativewind/types" />
```

Do **not** name this file `nativewind.d.ts`, `app.d.ts`, or `react.d.ts`.

### Step 8 — Clear cache after config changes

```sh
npx expo start --clear
```

**Source:** [Expo Router installation](https://docs.expo.dev/router/installation/)

### Expo Go compatibility for NativeWind

| Component | Expo Go |
|-----------|---------|
| NativeWind (JS/CSS transform) | Works — no custom native module |
| `react-native-reanimated` | Included in Expo Go |
| `react-native-safe-area-context` | Included in Expo Go |
| Metro + `withNativeWind` | Works in dev with Expo Go |

NativeWind is compatible with Expo Go for MVP development, assuming SDK alignment with the installed Expo Go app.

---

## 3. Expo Router vs React Navigation

### What `create-expo-app` uses now

The **`default` template uses Expo Router** — file-based routing with TypeScript, Expo CLI, and example screens.

**Source:** [create-expo-app templates](https://docs.expo.dev/more/create-expo/)

### Relationship

| | Expo Router | React Navigation |
|---|-------------|------------------|
| Routing model | File-based (`src/app/`) | Code-defined navigators |
| Default in new projects | **Yes** | No (via `--example with-react-navigation`) |
| Built on | React Native Screens | Same underlying primitives |
| Deep linking | Automatic for all routes | Manual setup |
| Typed routes | Built-in (`experiments.typedRoutes`) | Separate tooling |
| Can use together | Expo Router *is* the recommended default | Still usable in any Expo project |

**Sources:**
- [Expo Router introduction](https://docs.expo.dev/router/introduction/)
- [Core concepts](https://docs.expo.dev/router/basics/core-concepts/)

Expo recommends Expo Router for new apps. React Navigation remains valid for existing apps or the `with-react-navigation` example.

### Default project entry

```json
{ "main": "expo-router/entry" }
```

Initial layout: `src/app/_layout.tsx`.

**Source:** [Expo Router manual installation](https://docs.expo.dev/router/installation/)

---

## 4. Expo Go Limitations vs Development Builds

Expo Go is a **fixed native binary** — only pre-bundled native libraries are available. JavaScript hot-reloads; native code does not.

**Source:** [Introduction to development builds](https://docs.expo.dev/develop/development-builds/introduction/)

### Requires a development build (not Expo Go)

| Feature | Why | Source |
|---------|-----|--------|
| **Custom native libraries** not in Expo Go | Native code not in Expo Go binary | [Dev builds intro](https://docs.expo.dev/develop/development-builds/introduction/) |
| **Custom URL scheme** (`scheme` in app config) | Build-time config; no effect in Expo Go | [SDK 54 app.json schema](https://docs.expo.dev/llms-sdk-v54.0.0.txt) — `scheme`: *"This is a build-time configuration, it has no effect in Expo Go."* |
| **Android App Links / iOS Universal Links** | Two-way domain association requires native entitlements | [Dev builds intro](https://docs.expo.dev/develop/development-builds/introduction/), [Linking overview](https://docs.expo.dev/linking/overview/) |
| **Share extensions / share intents (receiving shares)** | Config plugin adds native extension targets | [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/) |
| **iOS home screen widgets / Live Activities** | Native extension targets | [expo-widgets](https://docs.expo.dev/versions/latest/sdk/widgets/) |
| **Remote push notifications** | Push certs tied to your app identity | [Dev builds intro](https://docs.expo.dev/develop/development-builds/introduction/) |
| **App icon / splash screen testing** | Native assets immutable in Expo Go | [Dev builds intro](https://docs.expo.dev/develop/development-builds/introduction/) |
| **Bitcode, custom JS engine, blocked permissions** | Build-time native config | [SDK 54 app.json schema](https://docs.expo.dev/llms-sdk-v54.0.0.txt) |

### Share extensions & share intents (ChopChop-relevant)

**Outgoing share** (`Sharing.shareAsync`) — **works in Expo Go**.

**Receiving shares from other apps** — requires the `expo-sharing` config plugin, which:

- Adds an **iOS Share Extension** target (`ios.enabled: true`)
- Adds **Android intent-filters** for `ACTION_SEND` / `ACTION_SEND_MULTIPLE`
- Properties *"require building a new app binary to take effect"*

Handle incoming shares with:

- **Expo Router:** `src/app/+native-intent.ts` — redirect URLs with hostname `expo-sharing` to a handler route
- **`useIncomingShare()`** hook to read shared payloads

**Source:** [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)

> Share-to-app is **experimental**. On iOS the extension opens the main target (not officially supported by Apple long-term).

### Deep linking in Expo Go

| Link type | Expo Go support |
|-----------|-----------------|
| **`exp://` dev URLs** | Yes — default scheme; use `/--/` path prefix | [Linking into your app](https://docs.expo.dev/linking/into-your-app/) |
| **Custom scheme (`myapp://`)** | No — requires dev build | [Linking into your app](https://docs.expo.dev/linking/into-your-app/) |
| **Universal / App Links (`https://`)** | Limited — recommend dev builds | [Linking overview](https://docs.expo.dev/linking/overview/) |

Expo Go test URL example:

```sh
npx uri-scheme open exp://127.0.0.1:8081/--/somepath/into/app?hello=world --ios
```

### SDK version constraint (physical iPhone)

Expo Go supports **one SDK version** at a time. When a new SDK ships, store Expo Go updates to that version only. **iPhone cannot side-load older Expo Go.** Android/emulator can install compatible older builds.

**Source:** [Development builds introduction](https://docs.expo.dev/develop/development-builds/introduction/)

### Third-party libraries in Expo Go

Only a [curated list](https://docs.expo.dev/versions/latest/sdk/third-party-overview/) has native support built into Expo Go. Any other native library needs a development build.

---

## 5. Environment Variables

Expo CLI auto-loads `.env` files and inlines variables prefixed with **`EXPO_PUBLIC_`**.

**Source:** [Environment variables in Expo](https://docs.expo.dev/guides/environment-variables/)

### Setup

**`.env`:**

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_GEMINI_API_KEY=your-key
```

**Usage (static dot notation only):**

```tsx
const url = process.env.EXPO_PUBLIC_SUPABASE_URL; // ✓ inlined
// process.env['EXPO_PUBLIC_SUPABASE_URL']     // ✗ NOT inlined
// const { EXPO_PUBLIC_X } = process.env       // ✗ NOT inlined
```

### Rules

| Rule | Detail |
|------|--------|
| Prefix | Must be `EXPO_PUBLIC_` for client-side access |
| Security | **Never** put secrets in `EXPO_PUBLIC_` — visible in compiled bundle |
| Hot reload | Code changes pick up new values; full reload needed in Expo Go to see updates |
| `.env` resolution | Standard priority (`.env`, `.env.local`, etc.) |
| Git | Add `.env*.local` to `.gitignore` |
| Disable | `EXPO_NO_DOTENV=1` or `EXPO_NO_CLIENT_ENV_VARS=1` |

### ChopChop notes

- **Supabase anon key** in `EXPO_PUBLIC_` is acceptable (designed for client use; protect with RLS).
- **Gemini API key** in `EXPO_PUBLIC_` exposes the key to anyone who inspects the app bundle — acceptable for MVP/prototyping only; use a backend proxy for production.

### EAS

EAS Build and EAS Update also inline `EXPO_PUBLIC_` from uploaded `.env` files. Use `eas env:pull` for environment switching instead of overloading `NODE_ENV`.

---

## 6. Recommended Folder Structure (Expo Router)

Official guidance from the default template and Router core concepts:

```
project-root/
├── src/
│   ├── app/                    # Routes ONLY — each file = a screen/route
│   │   ├── _layout.tsx         # Root layout (fonts, providers, tabs)
│   │   ├── index.tsx           # Initial route (/)
│   │   ├── explore.tsx         # /explore
│   │   ├── +native-intent.ts   # Native deep link / share intent rewriting
│   │   └── (tabs)/             # Route group (parentheses = not in URL)
│   │       └── index.tsx
│   ├── components/             # Non-route UI (AppTabs, etc.)
│   ├── hooks/
│   └── constants/
├── assets/
├── global.css                  # NativeWind Tailwind directives
├── app.json
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── nativewind-env.d.ts
├── .env
└── package.json
```

### Rules ([Core concepts](https://docs.expo.dev/router/basics/core-concepts/))

1. **All screens live in `src/app/`** (or `app/` if not using `src`).
2. **Every page has a URL** — automatic deep linking.
3. **First `index.tsx` at `/` is the initial route** — no manual initial-route config.
4. **Root `_layout.tsx` replaces `App.tsx`** — fonts, theme providers, splash here.
5. **Non-route code stays outside `src/app/`** — components, hooks, utils in `src/components`, etc.
6. **Platform-specific files** use extensions (e.g. `app-tabs.native.tsx` vs `app-tabs.tsx`).
7. **Path aliases:** `@/*` → `./src/*` in `tsconfig.json`.

**Sources:**
- [Core concepts of file-based routing](https://docs.expo.dev/router/basics/core-concepts/)
- [Start developing — File structure](https://docs.expo.dev/get-started/start-developing/)
- [Expo Router installation](https://docs.expo.dev/router/installation/)

### Suggested ChopChop additions (convention, not official)

```
src/
├── lib/           # Supabase client, Gemini API helpers
├── services/      # Business logic
└── types/         # Shared TypeScript types
```

Keep these outside `src/app/` so Expo Router does not treat them as routes.

---

## ChopChop MVP Compatibility Matrix

| Capability | Expo Go MVP | Dev Build Later |
|------------|-------------|-----------------|
| Expo Router + tabs | ✅ | ✅ |
| NativeWind styling | ✅ | ✅ |
| Supabase (JS client) | ✅ | ✅ |
| Gemini via `EXPO_PUBLIC_` | ✅ (key exposed) | ✅ |
| `exp://` dev deep links | ✅ | ✅ |
| Custom scheme deep links | ❌ | ✅ |
| Universal / App Links | ❌ | ✅ |
| Receive recipe URL via Share Sheet | ❌ | ✅ (`expo-sharing` plugin) |
| iOS widgets | ❌ | ✅ (`expo-widgets`) |
| Remote push | ❌ | ✅ |

---

## Quick Start Commands (ChopChop)

```sh
# 1. Create project (SDK 54 for physical Expo Go, July 2026)
npx create-expo-app@latest chopchop

# 2. Add NativeWind
cd chopchop
npm install nativewind react-native-reanimated react-native-safe-area-context
npm install --dev tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11 babel-preset-expo
npx tailwindcss init

# 3. Configure babel.config.js, metro.config.js, tailwind.config.js, global.css
#    (see Section 2)

# 4. Add env vars
echo EXPO_PUBLIC_SUPABASE_URL=... >> .env
echo EXPO_PUBLIC_SUPABASE_ANON_KEY=... >> .env

# 5. Run on physical device
npx expo start
# Scan QR with Expo Go; use --tunnel if LAN fails
```

---

## Source Index

| Topic | URL |
|-------|-----|
| Expo SDK versions | https://docs.expo.dev/versions/latest/ |
| Create a project | https://docs.expo.dev/get-started/create-a-project/ |
| create-expo-app | https://docs.expo.dev/more/create-expo/ |
| Expo Router intro | https://docs.expo.dev/router/introduction/ |
| Router core concepts | https://docs.expo.dev/router/basics/core-concepts/ |
| Router installation | https://docs.expo.dev/router/installation/ |
| Start developing | https://docs.expo.dev/get-started/start-developing/ |
| Development builds | https://docs.expo.dev/develop/development-builds/introduction/ |
| Expo Go → dev build | https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build/ |
| Third-party libs in Expo Go | https://docs.expo.dev/versions/latest/sdk/third-party-overview/ |
| Linking overview | https://docs.expo.dev/linking/overview/ |
| Linking into your app | https://docs.expo.dev/linking/into-your-app/ |
| Android App Links | https://docs.expo.dev/linking/android-app-links/ |
| iOS Universal Links | https://docs.expo.dev/linking/ios-universal-links/ |
| +native-intent | https://docs.expo.dev/router/advanced/native-intent/ |
| expo-sharing | https://docs.expo.dev/versions/latest/sdk/sharing/ |
| expo-widgets | https://docs.expo.dev/versions/latest/sdk/widgets/ |
| Environment variables | https://docs.expo.dev/guides/environment-variables/ |
| react-native-reanimated | https://docs.expo.dev/versions/latest/sdk/reanimated/ |
| NativeWind installation | https://www.nativewind.dev/docs/getting-started/installation |
