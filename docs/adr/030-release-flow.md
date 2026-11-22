# ADR 030: How we release web, iOS and Android

**Status:** Accepted
**Date:** 2026-11-22
**Deciders:** Yarden (product)

## Context

Before this ADR, merging to `master` deployed the website, both web apps and the backend. The phone apps were released by hand: someone edited the version in three files, started an EAS build from GitHub, and uploaded the Android build to Play Console from their own computer, because there was no Play service account on EAS. Every phone fix, even a typo, needed a store build, a store review and an update from each user. There was no way to try a web change before it merged.

There are two developers (Yarden and Harel) and one Supabase project (production), with no staging (a cost decision). About 54 people used the mobile app in the week before this decision. We pay for Expo, and even its cheapest paid plan covers over-the-air updates for 3,000 monthly users.

The grilling session that made these decisions, with every reason in plain English, is `docs/grilling/PIN-51-release-flow.md` (PIN-51). The step-by-step how-to is `docs/RELEASING.md`.

## Decision

| What | When it reaches users |
|---|---|
| Website, old web app, new web app | Every merge to `master` (unchanged) |
| Backend (migrations, Edge Functions) | Every merge to `master` (unchanged, ADR 024, PIN-36) |
| New web app, for trying a PR | A preview link on every PR that changes `web/` or `shared/`. Not users. |
| Phone app, JavaScript-only change | When someone runs **Publish update** in GitHub Actions |
| Phone app, new version | When someone pushes a release tag, and then promotes the build in the stores |

- **Web previews.** `web-preview.yml` uploads a version of the `pinch-web` Worker with the alias `pr-<number>`, without deploying it, and links it on the PR. Previews use production data. Buying credits is off on them (ADR 027).
- **Over-the-air updates with EAS Update.** `expo-updates` with `runtimeVersion: { policy: "fingerprint" }`. Expo gives every build a fingerprint of its native code and app version, and only sends an update to builds with the same fingerprint. Build profiles map to channels of the same name (`production`, `preview`, `development`). Phones download an update in the background and switch to it the next time the app opens, with no prompt. Analytics events record the running update in `properties.update_id`.
- **Updates are published by hand, never on merge.** `publish-update.yml` takes a message and an optional percentage of users. It runs the checks, refuses if no finished store build has the code's fingerprint (it would reach nobody), and publishes to both platforms. `rollback-update.yml` goes back to a store version's own code, republishes an earlier update, or stops a rollout.
- **When an update and when a store build.** Typos, translations, crash fixes and small UI changes go out as updates. Native changes (a library, a permission, the share extension, the icon, an Expo SDK upgrade) and big features that deserve a "What's New" go out as store builds.
- **A store release starts with a git tag.** `npm run release:bump <version>` sets the version in `app.json`, `package.json` and `package-lock.json` and creates `docs/releases/<version>.md`, the What's New in English, Hebrew, Arabic, Spanish and Russian. That goes in a normal PR. After it merges, pushing the tag `v<version>` starts `release.yml`. It refuses unless the tag matches the version files, the notes are filled in (500 characters at most per language, Google Play's limit), and the commit is on `master`. Then it runs the checks, builds both apps on EAS, submits iOS to TestFlight and Android to Play internal testing, and creates the GitHub Release with the notes.
- **Android submits from CI** through a Google Play service account whose key is stored on EAS (`scripts/release-setup-wizard.sh`).
- **People promote, after a phone check.** Someone installs the tester build on an iPhone and an Android phone and runs the checklist in `docs/RELEASING.md`. Then: iOS with phased release (7 days), Android at 20% for 2 days, then 100%.
- **The manual build workflows** (`eas-build-ios.yml`, `eas-build-android.yml`) stay for one-off test builds and never submit.
- **Hotfixes when `master` has unreleased native changes.** Branch `hotfix/<version>` from the release tag, fix there, publish the update from that branch, and merge the same fix into `master`.
- **Old app versions keep working.** The backend deploys on every merge, but a phone can stay on its store version's code. Backend changes stay compatible with every version in use (expand-then-contract migrations, ADR 024's response-shape rule). To retire a version, send an in-app message to users below it (`maxAppVersion`) with a button to the store. There's no forced-update screen.
- Yarden and Harel can both release. Yarden owns the store accounts, Expo and billing.

## Considered options

- **No over-the-air updates.** Simplest, but every typo waits for review and for each user to update. Rejected.
- **`appVersion` as the runtime version.** Simpler to read, but a native change without a version bump would send JavaScript to a binary it doesn't fit and crash the app. The fingerprint can't be forgotten. Rejected.
- **Publish an update on every merge,** like web. Fastest, but every merge would reach phones without anyone trying it on a phone. Rejected by Yarden: we choose when phones change.
- **Every merge to a `preview` channel, then promote.** Safer, but needs a Preview app kept current on our phones and an extra build per release. Rejected for now. Test with the development build before publishing.
- **A manually started release workflow with a version field** instead of a tag. Works, but the tag also records exactly which commit went to the stores. Rejected.
- **Fully automatic promotion to production.** Rejected: a person checks every build on a phone, and the rollouts can be paused.

## Consequences

### Positive

- Nobody builds, submits or publishes from a laptop. Both developers ship by pressing buttons in GitHub, and an agent can start the same workflows with `gh workflow run`.
- A JavaScript fix reaches phones the same day, and a bad one can be undone in a minute.
- Every store version has its notes in the repo, in five languages, and a tag on the exact commit.
- Every web PR gets a link to try the change.

### Negative

- Updates only work from the first store build that includes `expo-updates` (1.0.11). Older builds still need a store release.
- A bad update reaches everyone quickly. A rollback reaches them just as quickly, and `--rollout-percentage` exists for risky changes.
- The fingerprint includes the app version, so after the version PR merges, `master` can't publish updates until that version's store build exists. JavaScript fixes for the version on phones go out from `hotfix/<version>`.
- Web previews run on production data, and anyone with the link can use them (ADR 027).
- Each release waits in GitHub Actions while EAS builds both apps.
