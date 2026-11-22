# Releasing Pinch

**Audience:** Yarden, Harel, and agents working for them.
**Why it works this way:** [ADR 030](adr/030-release-flow.md). The full reasoning, in plain English: [`grilling/PIN-51-release-flow.md`](grilling/PIN-51-release-flow.md).

Nobody builds, submits or publishes from their own computer. Everything below is a button in GitHub Actions or a git tag. An agent can start the same workflows with `gh workflow run`.

| What | How it reaches users |
|---|---|
| Website, old web app, new web app | Merge to `master` |
| Backend (migrations, Edge Functions) | Merge to `master`. Test first: `supabase/README.md` → "Testing backend changes" |
| New web app, for trying a PR | A preview link appears on the PR by itself |
| Phone app, small JavaScript fix | [Publish an update](#publish-an-update-to-phones) |
| Phone app, new version | [Make a store release](#make-a-store-release) |

---

## Try a web change before it merges

Every PR that changes `web/` or `shared/` gets a comment, **Web app preview**, with a link like `https://pr-123-pinch-web.<account>.workers.dev/app`. It updates on every push to the PR.

- It uses the real production database. What you do there is real.
- Buying credits is off.
- Signing in with Google or Apple works only if the preview address is on Supabase's redirect list (done once by `scripts/release-setup-wizard.sh`).

---

## Publish an update to phones

For typos, translations, crash fixes and small UI changes: JavaScript only. Anything native needs a [store release](#make-a-store-release): a new library, a permission, the share extension, the icon, an Expo SDK upgrade.

1. Merge the fix to `master`, as usual. Phones don't get anything yet.
2. Try it on your own phone with the development build (`npx expo start`).
3. GitHub → **Actions** → **Publish update** → **Run workflow**.
   - **Use workflow from:** `master` (or a `hotfix/…` branch, see below).
   - **What changed:** a few words, for example "Fix Hebrew typo on the shopping list".
   - **Percentage of users:** empty for everyone. A number like `20` for a riskier change.

   Or ask the agent: `gh workflow run publish-update.yml --ref master -f message="Fix Hebrew typo on the shopping list"`.
4. Phones download it in the background and switch to it the next time the app opens. The update shows on [expo.dev → Updates](https://expo.dev/accounts/yardenfa/projects/pinch/updates).

The workflow stops with **"No ios/android store build matches this code"** when `master` has native changes or a version bump that isn't in a store build yet. An update would then reach nobody. Either make a store release, or publish from a hotfix branch:

```bash
git fetch --tags
git switch -c hotfix/1.0.11 v1.0.11   # the version people have
# make the fix, commit, push the branch
```

Run **Publish update** from `hotfix/1.0.11`, then merge the same fix into `master` too.

A percentage rollout stays at that percentage until you change it: `eas update:edit --rollout-percentage 100` (ask the agent), or publish the next update, which ends it.

### Undo a bad update

GitHub → **Actions** → **Roll back update** → **Run workflow**. Choose what to go back to:

| Choose | When | Also fill in |
|---|---|---|
| `store-version` | Go back to the code that came with the store version. Always safe. | **app_version**, for example `1.0.11` |
| `earlier-update` | Send a known-good earlier update again | **update_group**: the group ID from expo.dev → Updates |
| `stop-rollout` | An update is still going to a percentage of users. Everyone goes back to the update before it. | **update_group**, if more than one rollout is running |

Phones get it the next time the app opens.

---

## Make a store release

### 1. Version PR

On a branch from `master`:

```bash
npm run release:bump 1.0.12
```

This sets the version in `app.json`, `package.json` and `package-lock.json`, and creates `docs/releases/1.0.12.md`. Fill in **What's New** for every language: English, Hebrew, Arabic, Spanish, Russian. An agent can draft it from the PRs merged since the last tag (`git log v1.0.11..master`).

- Lead with what people get: saving money, saving time, easier to use. Not technical features.
- One line per change, as a plain fact with numbers and names: "Pinch now imports recipes from Pinterest". Not "improvements" or "bug fixes". AI assistants read these and repeat them.
- At most 500 characters per language (Google Play's limit).

Open the PR, get it reviewed, merge it.

### 2. Tag

```bash
git switch master && git pull
git tag v1.0.12
git push origin v1.0.12
```

Or GitHub → **Releases** → **Draft a new release** → new tag `v1.0.12` on `master` → **Publish release**.

The tag starts **Release (iOS and Android)** (`release.yml`). It stops without building unless:

- the tag matches the version in all three files,
- `docs/releases/1.0.12.md` is filled in for every language,
- the tagged commit is on `master`,
- the usual checks pass.

Then it builds both apps on EAS and sends iOS to **TestFlight** and Android to **Play Console → Internal testing**. It also creates the GitHub Release with the notes. Watch it in Actions, or at [expo.dev → Builds](https://expo.dev/accounts/yardenfa/projects/pinch/builds).

### 3. Check on a phone

Install the build from TestFlight and from the Play internal testing link, on one iPhone and one Android phone. Check:

1. Sign-in works.
2. Importing a TikTok link works.
3. A saved recipe opens.
4. Sharing into Pinch from another app works.
5. Switching the app to Hebrew works (right-to-left layout).

About 10 minutes. These break most often after native changes.

### 4. Promote to users

**iOS**, in [App Store Connect](https://appstoreconnect.apple.com/apps/6796310453/distribution):

1. Open the version (create it with **+** if it isn't there; the number must match, for example 1.0.12).
2. Under **Build**, choose the build from TestFlight.
3. Paste **What's New** for each language from `docs/releases/1.0.12.md`.
4. Under **App Store Version Release**, choose automatic release, and turn on **Phased Release for Automatic Updates** (7 days).
5. **Add for Review** → **Submit to App Review**.

**Android**, in [Play Console](https://play.google.com/console) → Pinch:

1. **Test and release** → **Production** → **Create new release**.
2. **Add from library**, and pick the build that's on internal testing.
3. Paste **Release notes** for each language from `docs/releases/1.0.12.md`.
4. Set the **rollout percentage** to 20%. **Next** → **Save and publish**.
5. After 2 days with no new crashes (Play Console → **Android vitals**), open the release and **Update rollout** to 100%.

Both rollouts can be paused if something is wrong. A JavaScript problem can also be fixed or rolled back with an update while the rollout is paused.

---

## Old app versions

The backend changes on every merge, but phones change only when we release or publish. A phone can stay on an old version for months.

- Backend changes must keep working for every app version people still use. Migrations are expand-then-contract. Edge Functions add fields, they don't rename or remove them (ADR 024).
- To retire a version: Settings → Admin → Messages, target users below the version you want (`maxAppVersion`), and add a button that opens the store (ADR 023).

---

## Where secrets and settings live

There's one environment: production.

| What | Where | Used by |
|---|---|---|
| `EXPO_TOKEN` | GitHub → Settings → Secrets → Actions | Every EAS workflow (builds, updates, rollbacks) |
| `EXPO_PUBLIC_*` for the phone app | [expo.dev → Environment variables](https://expo.dev/accounts/yardenfa/projects/pinch/environment-variables), **production** | Store builds and updates (`--environment production`). Not `.env`. |
| iOS certificates, profiles, App Store Connect API key | expo.dev → Credentials → iOS | Store builds, TestFlight submission |
| Google Play service account key | expo.dev → Credentials → Android → `com.pinch.myapp` → Service credentials | Play submission. Set up by `scripts/release-setup-wizard.sh` |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` | GitHub secrets | Website and both web apps, including previews (as `NEXT_PUBLIC_*`) |
| `WEB_APP_CREDIT_PURCHASES_ENABLED`, `EXPO_PUBLIC_*` variables | GitHub → Settings → Variables | Web builds |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets | New web app, previews, share worker |
| `SUPABASE_ACCESS_TOKEN` | GitHub secrets | `deploy-backend.yml` |
| AI keys, Polar, Resend and other server secrets | Supabase → Edge Functions → Secrets | Edge Functions only |
| Allowed sign-in redirect addresses | Supabase → Authentication → URL Configuration | Web app sign-in and password reset, including previews |

Yarden owns the Apple, Google Play, Expo, Cloudflare and Supabase accounts and their billing. Harel has release access to all of them.

---

## One-time setup

`bash scripts/release-setup-wizard.sh` walks through what only a person can do: the Google Play service account for Android submission, and the sign-in redirect for web previews. Run it once. Run it again only if the key or the Cloudflare account changes.
