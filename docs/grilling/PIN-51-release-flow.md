# PIN-51: How we release Pinch (web, iOS, Android)

**Ticket:** [PIN-51](https://linear.app/pinch-recipe/issue/PIN-51/deployment-flow-for-web-ios-and-android)
**Started:** 2026-11-22
**Who decides:** Yarden
**Status:** All decisions made (2026-11-22). Written up as [ADR 030](../adr/030-release-flow.md) and the how-to [`docs/RELEASING.md`](../RELEASING.md). This file keeps the reasons.

This file is the plain-English record of what we decided and why. If you forget how releases work or why we chose something, start here.

---

## The goal

Anyone on the team (Yarden or Harel) can ship a release by following written steps. Nobody builds or deploys from their own laptop. GitHub Actions and Expo's servers do the work.

---

## How it works today (before this ticket)

| Part | How it gets to users today | Problem |
|---|---|---|
| Website and old web app (pinch-app.io, pinch-app.io/app) | Every merge to `master` deploys it to GitHub Pages | None. It works. |
| New web app (next.pinch-app.io/app) | Every merge to `master` that touches `web/` or `shared/` deploys it to Cloudflare | No way to try a change before it merges |
| Backend (database, Edge Functions) | Every merge to `master` deploys it (PIN-36) | None. Out of scope here. |
| iOS app | Someone presses "Run workflow" in GitHub. Expo builds it. It goes to TestFlight. | Starting it is a manual step that's easy to forget |
| Android app | Someone presses "Run workflow" in GitHub. Expo builds it. **Yarden downloads the file and uploads it to Play Console by hand.** | Not automatic. Only works if Yarden is at a computer |
| Version number | Someone edits `app.json`, `package.json` and `package-lock.json` by hand | Easy to miss a file |
| What's New text | Typed into the store consoles at release time | Not written down anywhere |
| Small fixes on phones | Every fix, even a typo, needs a new store build, a store review and for the user to update | Slow (a day or more on iOS) |

There is one Supabase project, production. There is no staging, and we are not adding one (cost).

---

## Decisions made

### D1. Web: merging still deploys, and every PR gets a preview link

Merging to `master` keeps deploying the website and both web apps, as it does now.

New: every pull request that changes `web/` or `shared/` gets its own preview copy of the new web app, on a `workers.dev` address. A bot comment on the PR has the link. (ADR 027 already decided this. This ticket builds it.)

- Previews use the real (production) database, because there is no other one. Treat them as live.
- Buying credits is switched off on previews, so nobody can pay through one.
- Someone has to add the preview addresses to the allowed sign-in redirect list in the Supabase dashboard by hand. Otherwise sign-in on a preview fails.

The old Expo web app at `/app` gets no new work. It is replaced when PIN-147 switches `/app` to the new app.

### D3. A store release starts with a git tag

The flow for iOS and Android:

1. **Version PR.** A normal pull request bumps the version (for example to `1.0.11`) in `app.json`, `package.json` and `package-lock.json`, and adds the release notes file (D7). It gets reviewed and merged like any PR.
2. **Tag.** After it merges, someone tags that commit `v1.0.11` and pushes the tag (or creates a GitHub Release named `v1.0.11`, which makes the tag).
3. **CI does the rest.** The tag starts a GitHub workflow. It runs the usual checks, builds iOS and Android on Expo's servers, and sends iOS to TestFlight and Android to the Play Console "internal testing" track.

Nobody runs `eas build` or `eas submit` on their own computer.

Why a tag: it marks exactly which code went to the stores, so later we can see what shipped in each version. It is a step you do on purpose, so a normal merge never starts a store release by accident.

### D4. Android uploads itself, like iOS

We create a Google Play "service account" (a robot user for Play Console), give it permission to upload Pinch releases, and store its key on Expo. Then CI can send Android builds to Play Console without anyone uploading a file.

Only a person can do this, in Google Cloud and Play Console. `bash scripts/release-setup-wizard.sh` walks through it step by step.

### D5. Real users get a release only after a person approves it

CI stops at the tester tracks (TestFlight, Play internal testing). Then:

1. Someone installs the build on a real phone and checks it works (the checklist will be in `docs/RELEASING.md`).
2. They promote it by hand:
   - **iOS:** submit for App Store review, with **phased release** on. Apple then rolls it out over 7 days, and we can pause it.
   - **Android:** promote to production with a **staged rollout** (a percentage of users first, then everyone). We can pause or stop it.

Why: a bad build reaches only some users at first, and we can stop it before it reaches everyone.

### D6. Both Yarden and Harel can release

This is already true. Both have access to the Expo project, App Store Connect and Play Console. Yarden owns the accounts and billing.

### D7. Release notes live in the repo

The version PR adds `docs/releases/<version>.md` (for example `docs/releases/1.0.11.md`). It holds:

- The "What's New" text for the stores, in all five app languages (English, Hebrew, Arabic, Spanish, Russian). The agent drafts it from the merged PRs, and a person edits it.
- The GitHub Release for the tag links to it.

The text leads with what users get (saving money, saving time, easier to use), not with technical features.

For now someone pastes the text into App Store Connect and Play Console by hand. Sending it to the stores automatically can come later.

There is no separate CHANGELOG file. The release notes files are the changelog.

### D8. What "done" means for this ticket

- An ADR: `docs/adr/030-release-flow.md`.
- A how-to: `docs/RELEASING.md`, linked from the developer guide ("cookie tour"). It also lists where every secret and setting lives (GitHub secrets, Expo environment variables, Supabase).
- The CI work (tag workflow, Android auto-upload, web PR previews, and over-the-air updates if D2 is yes).
- Proof that it works: version **1.0.11** goes through the new flow on both stores, plus one PR preview of the web app (and one over-the-air update if D2 is yes).

1.0.11 is a good first test. Its App Store listing is already waiting in App Store Connect for a build.

---

### D9. The tag workflow checks before it builds

When a tag like `v1.0.11` is pushed, the workflow stops without building unless all of these hold:

- The tag matches the version in `app.json` and `package.json`.
- The tagged commit is on `master`.
- `docs/releases/1.0.11.md` exists, and What's New is filled in for every language, at most 500 characters each (Google Play's limit). This was added while building, since an empty file would pass a check for "exists".
- The usual quality checks (tests, typecheck, lint) pass.

Why: each check catches a mistake that would otherwise waste a build or ship the wrong code.

### D10. A script does the version bump

`npm run release:bump 1.0.11` updates the version in `app.json`, `package.json` and `package-lock.json`, and creates `docs/releases/1.0.11.md` with an empty section for each language. The agent fills in the text, a person edits it, and it all goes in the version PR (D3).

Why: a missed file is the usual mistake when bumping by hand.

### D11. Check on a phone, then roll out slowly

Before promoting a build to real users, install it from TestFlight and Play internal testing on one iPhone and one Android phone, and check that:

1. Sign-in works.
2. Importing a TikTok link works.
3. A saved recipe opens.
4. Sharing into Pinch from another app works.
5. Switching the app to Hebrew works (right-to-left layout).

It takes about 10 minutes. These are the things that break most often after native changes.

Then:
- **iOS:** Apple's phased release over 7 days.
- **Android:** staged rollout to 20% of users for 2 days, then everyone if there are no new crashes.

### D2. Over-the-air updates: yes

**Decision:** yes. We add over-the-air updates (Expo's "EAS Update") in the 1.0.11 build, with the fingerprint check. From then on, a JavaScript-only fix can reach phones the same day without a store release.

The explanation below is kept so we remember how it works.

**What it is, in plain words.** The phone app has two layers:

**What it is, in plain words.** The phone app has two layers:

- **The native shell.** This is what Apple and Google review: the app icon, the share extension, access to the camera and photos, the native libraries. Changing it always needs a new store build.
- **The JavaScript.** This is almost everything we change week to week: screens, text, translations, buttons, logic.

Over-the-air updates let us send **new JavaScript only** straight to phones that already have the app, without the stores. When the app opens, it checks Expo's servers for new JavaScript and downloads it in the background. The next time the user opens the app, they get the new version. No store review, and the user doesn't have to tap "update".

**Example.** We find a typo in the Hebrew text, or a bug that crashes the shopping list. Today the fix needs a store build, iOS review (usually about a day), and then each user has to update. With over-the-air updates, the fix reaches everyone within a few app launches, usually the same day.

**What it can't do.** Anything native still needs a store build: a new native library, a new permission, a change to the share extension, a new app icon, Expo SDK upgrades.

**The risk, and how it's handled.** If we sent JavaScript that needs a native piece the installed app doesn't have, the app would crash. To prevent that, Expo labels each store build with a "fingerprint" of its native parts and only sends an update to builds with a matching fingerprint. Nobody has to remember to bump anything.

**Cost.** Nothing extra. We already pay for Expo. Even the cheapest paid plan (Starter, $19 a month) includes updates for 3,000 monthly users, and in the past week about 54 people used the mobile app (34 iOS, 20 Android; logging started on Nov 14).

**Other downsides.**
- One more moving part to learn.
- A bad update reaches everyone fast. You can undo it in a minute by republishing the previous version, which also reaches everyone fast.
- It only works from the first store build that includes it. If we add it now, 1.0.11 is that build, and the first over-the-air update can go to 1.0.11.

**Apple and Google allow it** for bug fixes and improvements, as long as the update doesn't change what the app is for.

**Note:** "updating Expo" in the sense of upgrading the Expo SDK version is a native change. That always needs a store build. Over-the-air updates are only for our own JavaScript.

### D12. The "build by hand" buttons stay, but never reach the stores

`eas-build-ios.yml` and `eas-build-android.yml` stay for one-off test builds. They build, but they never send anything to the stores. The only way into the stores is a release tag (D3).

### D13. When to send an update, and when to make a store build

| Change | How it ships |
|---|---|
| Typo, translation, crash fix, small UI tweak, small improvement | Over-the-air update |
| New native library, new permission, share-extension change, icon, Expo SDK upgrade | Store build (new version) |
| Big new feature that should get a "What's New" in the stores | Store build (new version) |

If someone tries to send native changes as an update, the fingerprint check stops it from reaching builds it doesn't fit.

### D14. Merging deploys web. Phones get updates only when someone presses a button.

- **Merging to `master`** deploys the web (website, old web app, new web app) as it does today. It does **not** send anything to phones.
- **To send an update to phones,** a person presses the **"Publish update"** button in GitHub Actions and types a short message. Or they ask the agent, which starts the same GitHub workflow with a command (`gh workflow run ...`). Either way, CI publishes the update, not anyone's laptop.
- There is no separate "preview" channel or Preview app. Before pressing the button, test the change on your own phone with the development build, as we do today.

Why: we choose when phones change, and every update is something a person decided to send.

### D15. A "Roll back update" button

If an update turns out bad, a **"Roll back update"** button in GitHub Actions sends users back to the previous update, or to the code built into their store version. Phones get it the next time the app opens. The steps go in `docs/RELEASING.md`.

### D16. Phones apply updates the next time the app opens

This is Expo's default. The app downloads the update in the background and switches to it the next time the user opens the app. There's no pop-up, and nothing changes while someone is cooking. If we ever need an urgent fix to apply at once, a "restart now" prompt can be added later.

### D17. Analytics records which update a phone runs

Every analytics event records the update the phone is running, next to the store version (`app_version`), in the event's `properties`. Then a crash or a complaint can be traced to an exact update. No database change is needed.

### D18. Merging still deploys the backend

"Merging deploys web only" means "not phones". The database and Edge Functions still deploy on merge through `deploy-backend.yml`, as before.

So, in one table:

| What | When it reaches users |
|---|---|
| Website, old web app, new web app | Every merge to `master` |
| Backend (database, Edge Functions) | Every merge to `master` |
| New web app, for trying a PR | Preview link on every PR (not users) |
| Phone app, small JS change | When someone presses "Publish update" |
| Phone app, new version | When someone pushes a release tag, and then promotes it in the stores |

### D19. What the "Publish update" button does

You press it in GitHub Actions (or ask the agent to start it). You choose:

- **Branch:** `master` by default.
- **Message:** a short note, for example "Fix Hebrew typo on shopping list".
- **Percentage of users** (optional): leave it empty to send to everyone. Use a lower number for a riskier change.

Then CI:

1. Runs the quality checks.
2. Checks that the code's fingerprint matches a store build people have. If it doesn't, it stops with an error, because the update would reach nobody.
3. Publishes to both iOS and Android.

### D20. When `master` has native changes that aren't released yet

Sometimes `master` has a native change (for example a new library) waiting for the next store release. A JavaScript fix from `master` can't go out as an update then, because the fingerprint no longer matches what's on phones. The button refuses it (D19).

In that case:

1. Create a branch from the release tag, for example `hotfix/1.0.11` from `v1.0.11`.
2. Make the fix there.
3. Press "Publish update" with that branch.
4. Merge the same fix into `master` too, so the next release has it.

### D21. Old app versions must keep working

The backend changes on every merge, but phones change only when we publish or release. So an old app version keeps talking to the newest backend.

- **Rule:** backend changes must keep working for every app version people still use. Migrations are already expand-then-contract. Edge Functions add new fields instead of renaming or removing old ones. This rule goes in `docs/RELEASING.md` and in ADR 024's checklist.
- **When an old version has to go:** send an in-app message to users below that version (`maxAppVersion`), with an "Update" button that opens the store. The app can already do this, so we don't build a forced-update screen.

---

## Not decided, on purpose

- **How often we release.** When enough is ready, as now. No fixed schedule.
- **Sending store text automatically.** What's New is pasted by hand for now (D7).
- **Testing a PR on a phone through updates.** Not for now. Use the development build (D14).

---

## Facts we checked

- **Expo plan:** Yarden pays for Expo (said 2026-11-22). Per expo.dev/pricing (read 2026-11-22), even the cheapest paid plan (Starter, $19 a month) has a high-priority build queue, $45 of build credit a month (about $1 per Android build and $2 per iOS build after that) and updates for 3,000 monthly users. Submitting to the stores is included on every plan.
- **Mobile users:** about 54 distinct people on iOS and Android in the past week (the `interaction_events` table, 2026-11-22).
- **Current setup:** `eas.json` (version numbers stored on Expo, build numbers go up automatically) and `.github/workflows/` (`eas-build-ios.yml`, `eas-build-android.yml`, `deploy-web.yml`, `deploy-web-app.yml`).
