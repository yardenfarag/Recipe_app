# ChopChop Grilling Session

**Mode:** Human-in-the-loop, one question at a time  
**Goal:** Lock Phase 2–3 product and technical decisions before building  
**Started:** 2026-07-16

---

## Destination

A shippable MVP where a user pastes a social URL → gets a structured recipe → saves it to their library → scales servings and requests substitutions.

---

## Decision Queue

| # | Question | Status |
|---|----------|--------|
| 1 | Entry flow: paste-URL first, Share Sheet in Phase 3? | ✅ Assumed yes (Phase 1 built this way) |
| 2 | Auth gate: sign up before first Snap, or extract first? | ✅ D2 — 3 free saves, then sign up |
| 3 | Platform priority: which URL sources work in Phase 2? | ✅ D3 — YouTube → IG → TikTok (staged) |
| 4 | Extraction failure: what fallback does the user get? | ✅ D4 — content ladder + partial/hard stop |
| 5 | Substitution UX: how does "Swap" present results? | ✅ D5 — full-screen modal |
| 6 | Recipe library layout: grid cards or list rows? | ✅ D6 — list rows |
| 7 | Social auth in Phase 2 or defer to Phase 3? | ✅ D7 — email + Apple + Google |
| 8 | Cost estimate locale: USD dollar signs or user region? | ✅ D8 — localized by device region |

---

## Grilling complete ✅

All 8 decisions locked. See `docs/adr/` for full records.

---

## Phase 2 Build Progress

| Step | What | Status |
|------|------|--------|
| 2a | Supabase schema + RLS | ✅ Done — migration applied |
| 2b | Edge Function: YouTube extraction + Gemini | ✅ Done — awaiting deploy (`supabase functions deploy extract-recipe`) |
| 2c | Wire AddRecipe → Edge Fn → Preview screen | ✅ Done |
| 2d | Guest save quota (AsyncStorage, 3-recipe limit) | ✅ Done |
| 2e | Auth (Email + Apple + Google) + guest migration | ✅ Done — needs dashboard provider config (see below) |
| 2f | Library list rows + localized cost display | ✅ Done (bundled into 2d) |
| 2g | Substitution full-screen modal + Edge Function | ✅ Done — deployed |

### Step 2e — required dashboard config

- **Email:** For fast Expo Go testing, disable **Confirm email** in
  Supabase → Authentication → Providers → Email (otherwise sign-up needs an
  email-link confirmation, which deep-links poorly in Expo Go).
- **Apple:** Enable the **Apple** provider in Supabase → Authentication →
  Providers. Works in Expo Go on iOS; full native config lands with the dev
  build (Phase 3).
- **Google:** Enable the **Google** provider (needs a Google Cloud OAuth
  client) and add the redirect URL to Supabase → Authentication → URL
  Configuration. Reliable deep-linking with the `chopchop://` scheme requires
  a **dev build** — in Expo Go the `exp://` proxy is flaky (ADR 007).

**Note on 2c:** The Save button on `recipe/preview.tsx` currently checks for an
existing Supabase session and saves directly if signed in, or shows a
placeholder alert if not. The real guest-quota + sign-up flow from ADR 002
replaces that placeholder in Step 2d/2e.

---

## Decisions So Far

### D1 — Paste URL first, Share Sheet later

**Answer:** Paste URL in Expo Go for Phase 1–2; native Share Sheet deferred to Phase 3 (dev build).  
**Rationale:** User confirmed plan is solid; Phase 1 skeleton already implements this flow.  
**Doc:** ADR 001

### D2 — Guest save quota (3 free, then sign up)

**Answer:** Hybrid. Users can Snap and save up to 3 recipes locally without an account. Saving a 4th triggers sign-up. Guest recipes migrate to Supabase on registration.  
**Rationale:** Low friction to prove value; natural conversion gate.  
**Doc:** ADR 002

### D3 — Staged platform rollout (YouTube → Instagram → TikTok)

**Answer:** All three platforms are in scope from day one, but extraction ships in stages: YouTube first (prove the pipeline), then Instagram, then TikTok. Unsupported platforms show a "coming soon" message — never silent failure.  
**Rationale:** Matches long-term vision while de-risking the hardest scrapes.  
**Doc:** ADR 003

### D4 — Extraction content ladder & failure UX

**Answer:** Fetch content in order: video transcript → description → top 10 comments (by likes, never all). Send combined context to Gemini. On failure: show partial result if anything useful was extracted; hard stop only if nothing found. No manual paste fallback in MVP.  
**Rationale:** Recipes live across multiple sources on social media; comment cap keeps costs bounded.  
**Doc:** ADR 004

### D5 — Substitution via full-screen modal

**Answer:** Tapping Swap opens a full-screen modal with 2–3 AI alternatives, each showing name, quantity, and a "why this works" note. User picks one to replace the ingredient.  
**Rationale:** Room for trust-building context; matches smart insights vision.  
**Doc:** ADR 005

### D6 — Library as list rows

**Answer:** Single-column list: thumbnail left, title + metadata (time · effort · cost) right. Tap to open RecipeDetail.  
**Rationale:** Scannable as the collection grows; simpler to build.  
**Doc:** ADR 006

### D7 — All three auth providers in Phase 2

**Answer:** Email/password + Apple Sign-In + Google at the sign-up gate. Google uses browser OAuth in Expo Go; native SDK in Phase 3 dev build.  
**Rationale:** Maximum conversion options when guest quota is exhausted.  
**Doc:** ADR 007

### D8 — Localized cost display

**Answer:** Store tier as `$`/`$$`/`$$$` in DB; display using device locale (₪, €, $, or text labels as fallback).  
**Rationale:** Cost should feel relevant to the user's region, not assume USD.  
**Doc:** ADR 008

---

---

## Phase 3 Decision Queue

| # | Question | Status |
|---|----------|--------|
| 9 | Dev build tooling: EAS cloud vs. local Android/Xcode? | ✅ D9 — EAS Build (cloud) for both platforms |
| 10 | Share extension scope: full native now, or defer/clipboard fallback? | ✅ D10 — full native, Android first then iOS |
| 11 | Dev build distribution to phone (internal link vs USB)? | ⬜ Deferred — decide when first build is ready |

### D9 — EAS Build for dev builds (both platforms)

**Answer:** Use EAS Build's cloud service for both Android and iOS dev builds. No local Android Studio/Xcode toolchain required on Windows; occasional Mac access is a fallback for native debugging only.
**Rationale:** Developer is Windows-primary with occasional Mac access; EAS avoids blocking on that.
**Doc:** ADR 009

### D10 — Full native share extension, Android first

**Answer:** Build the real OS-level Share Sheet integration (not a clipboard workaround) using `expo-share-intent`. Android ships first (no paid account needed), iOS follows once the Apple Developer account is confirmed active.
**Rationale:** This is the headline feature from the original product vision — worth the native-build overhead.
**Doc:** ADR 010

### D11 — Dev build distribution (TBD)

**Answer:** Not yet decided — revisit once the first Android dev build finishes on EAS.

---

## Phase 3 Build Progress

| Step | What | Status |
|------|------|--------|
| 3a | Install `eas-cli`, `eas login`, `eas build:configure`, add `development` profile to `eas.json` | ✅ Done |
| 3b | Install `expo-share-intent`, add config plugin to `app.json` | ✅ Done |
| 3c | Kick off first Android dev build on EAS, install on phone | 🔵 **Next** |
| 3d | Wire share-intent listener → auto-route into existing extract flow | ✅ Done (bundled into 3b) |
| 3e | Confirm Apple Developer account status, then iOS dev build | ⬜ |
| 3f | iOS Share Extension end-to-end test | ⬜ |
| 3g | Native Google Sign-In (replace browser OAuth) — stretch goal | ⬜ |

---

## Not Yet Specified

- Offline access to saved recipes
- Recipe sharing between users
- Meal planning / grocery lists
- Nutritional breakdown beyond total calories
- Video re-play inside the app

## Out of Scope (for now)

- Web app version
- Recipe editing (manual override of AI output)
- Community ratings / comments
