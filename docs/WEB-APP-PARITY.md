# New web app vs Expo web app: parity checklist (PIN-146)

Every screen and action of the Expo web app (`src/app/`, as it behaves in a browser), and what the new web app (`web/`) does instead. The goal: switching `pinch-app.io/app` to the new app (PIN-147) takes nothing away from anyone.

**How to read it.** Each row has a status:

- ✅ **Matched**: works the same.
- 🔄 **Changed on purpose**: works differently, decided in a screen ticket or by the web design.
- ➖ **Dropped on purpose**: not on the new app, and that's intended.
- ⚠️ **Gap**: was missing or worse. Every gap found is fixed; see the table below.

Rows marked *(proposed)* are a judgement Yarden confirms or changes; then every row is decided.

Two facts make many rows look better on the new app than they really were on the old one:

- **Expo web has no guests.** `useOnboardingGate` sends signed-out visitors to onboarding or sign-in, so the guest code in `src/` never runs in a browser. The new app also needs an account (except a Hub recipe or a shared link, which guests can read).
- **Most Expo error and success popups never show in a browser.** react-native-web's `Alert.alert` is an empty function. Favorite failed, save failed, "added to list", translate failed, repair failed and the rest are silent on Expo web; the new app shows them as toasts or inline messages.

Native-only features (Apple sign-in, push reminders, store review prompt, share extension, in-app purchases, camera sheet, haptics) are not part of the Expo web app and are left out.

## Gaps found, and what was done

All thirteen gaps were fixed on the PIN-146 branch (Yarden, 2026-11-22: "fix everything"). The six differences under "Accept" are proposed as they are.

| # | Gap | Fix |
|---|---|---|
| G1 | `/app/favorites` returned "not found". Expo redirects it to the Library with favorites on. | Permanent redirect to `/?favorites=1` (`web/next.config.ts`). |
| G2 | `/app/legal/privacy`, `/terms` and the two deletion guides returned "not found". | Permanent redirects to the static pages on `pinch-app.io` (`web/next.config.ts`). |
| G3 | A partially imported recipe couldn't be finished by hand. Expo offers "Fill it in myself", which opens the editor with the draft (`/recipe/edit?from=import`). | Snap keeps the partial recipe and its banner offers "Fill it in myself". The editor opens it as "Finish the recipe", says what's missing, starts on the empty row, and keeps the source link when saved (`web/lib/editor/importDraft.ts`). |
| G4 | No recipe backup: download the library as a file, and restore one. Expo Settings → Your recipes has both (PIN-75). | New Settings page "Your recipes" (`/settings/recipes`) with the cookbook, Download and Restore. The backup code moved from `src/lib` to `shared/lib`, so both apps use one copy and the same file format. |
| G5 | Sign-in, welcome, onboarding, reset-password and the Hub/shared pages had no error screen. | `web/app/error.tsx` for every page outside the signed-in shell, and `web/app/global-error.tsx` for a crash in the root layout. |
| G6 | Swap: at the daily limit the dialog said "couldn't find a swap" and offered Try again. | Says it's today's limit, in the shared words, with no Try again. |
| G7 | After a hand edit, Appliances didn't show "Updating…". | Shows it, as the other fields do. |
| G8 | Settings had no Cookbook row. | On the new "Your recipes" page (G4). |
| G9 | Hub recipe and shared recipe pages had no Share button. | Share passes on the source link, as on mobile (the reader has no saved copy to make a Pinch link from). |
| G10 | No app version anywhere. | `v1.x.y-next` at the foot of Settings. |
| G11 | The confirm-your-email screen lacked the instructions and "Use a different email". | Both added; "Use a different email" goes back to the form with the address kept. |
| G12 | Library filters had no "Clear" for tags. | Added beside the Tags heading. |
| G13 | The empty Library didn't offer "Write a recipe". | A fourth way in the "Save your first recipe" guide. |

### Accept *(proposed)*

| # | Difference | Why it's fine |
|---|---|---|
| A1 | The import preview can't be changed before saving (servings, remix, swap, translate). | Imports save straight away and open the recipe page, which has every action. The preview only shows when the save fails. |
| A2 | First-run coach marks over the tab bar (narrow Expo web) aren't ported. | Replaced by the welcome page, onboarding and "Save your first recipe" (PIN-140). |
| A3 | No "Sync purchases" button on the credits sheet. | It did nothing on Expo web. |
| A4 | Shopping list headers don't stick while scrolling. | Groups are tiles in a readable column; long lists are rare. |
| A5 | A guest pressing Add on a Hub recipe goes to sign-in, not sign-up. | The guest bar has both buttons. |
| A6 | Library doesn't reload when the browser tab regains focus. | Moving between pages reloads it; the list syncs on the next visit. |

## Library (`/`)

Expo: `src/app/(tabs)/index.tsx`, `RecipeLibraryToolbar`, `RecipeListRow`, `RecipeActionsMenu`, `useRecipes`. PIN-131, PIN-161.

| Item | Status | Note |
|---|---|---|
| Cards in a grid, or a list; choice remembered | 🔄 | Same storage key. Default is grid on every width (Expo: list on phones). Segmented control instead of the flip button. |
| Loads 40 at a time while scrolling | ✅ | |
| Titles in the app language when a translation exists | ✅ | |
| First load | 🔄 | Skeleton cards instead of a spinner. |
| Failed to load / refresh failed with Retry | ✅ | |
| Search | 🔄 | Part of the Snap bar: text searches, a link or photo starts an import. "/" and Ctrl/⌘K jump to it. |
| Favorites, Cook tonight (45 min, up to Medium effort) | ✅ | Same limits, from shared code. |
| Filter panel: sort, tags, Clear tags | 🔄 | Count badge instead of a dot; radio chips. Clear tags added (G12). |
| Collections: choose, create, rename, delete | 🔄 | Always visible; the menu is on the selected collection and adds "Make cookbook". |
| Fridge match (photo, results, daily limit, errors) | ✅ | Adds an "unreadable photo" message. |
| Card: photo, title, time, effort, cost, cooked date, needed appliance | 🔄 | Adds a source chip (TikTok, Website, Photo). Real links: middle-click opens a new tab. |
| Card heart (favorite) | ✅ | A failure shows a toast (silent on Expo web). |
| Card menu: add to collection, edit, rename, delete | ✅ | Dropdown; Escape closes it. No long-press (touch only). |
| `?tag=`, `?collection=`, `?favorites=1` links | ✅ | All filters are kept in the address now. |
| `/favorites` | ✅ | Redirects to `?favorites=1` (G1). |
| "Saved" banner after saving (`?saved=1`) | ✅ | |
| No results / no favorites / nothing for tonight, with Clear filters | ✅ | |
| Empty library | 🔄 | "Save your first recipe" guide: link, photo, Hub, or write one (G13). |
| "Cook one tonight?" card (hides for 3 days) | 🔄 | Replaced by the always-on Tonight's pick tile (PIN-161). |
| Cookbook button | 🔄 | In the chip row. |
| New: tonight's pick, list tile, cooked this week, quick filters, credits pill | 🔄 | Web only. |

## Snap (`/add`) and the import preview

Expo: `src/app/(tabs)/add.tsx`, `src/app/recipe/preview.tsx`, `SnapExtractingView`. PIN-133, PIN-164.

| Item | Status | Note |
|---|---|---|
| Snap / Guess the recipe switch, titles, disclaimer | ✅ | |
| Paste a link, Enter imports; invalid link message | ✅ | Error shows on the field. |
| Import from a photo | ✅ | Also drag and drop, and paste, anywhere on the page. |
| Import from a PDF | 🔄 | Web only (Expo hid it on web). |
| Credits line | 🔄 | Balance card with Buy; no free/purchased split. |
| Progress ring, status lines, time left | ✅ | Shows the link, photo or PDF being read. |
| Error messages (too long, timed out, not food, not found, daily limit…) | ✅ | Same words (shared). Banners can be dismissed. |
| "Ways on" after a failed link: Try again, use a screenshot, Guess | 🔄 | Only for errors where they can help. |
| Out of credits | 🔄 | Opens a Buy dialog when web sales are on; otherwise "get the app". Expo web only linked to the stores. |
| Guess offer (dish guess, Not now, Extract anyway) | ✅ | |
| Already saved: opens the saved recipe | ✅ | Also warns while typing a link that's already saved. |
| Partial import: "Fill it in myself" | ✅ | G3. |
| Kitchen fix applied on import; notice when it fails | 🔄 | Toast after saving. |
| Saved straight away, recipe opens with "Saved to your Library" and Remove | ✅ | |
| "Write a recipe" card | ✅ | |
| "Share to Pinch from other apps" card | ➖ | About the phone's share menu (PIN-133). |
| Preview: Save, back, no-draft state, survives a reload | ✅ | No-draft goes back to Snap. Adds Discard. |
| Preview: change it before saving | ➖ *(proposed)* | A1. |

## Recipe page (`/recipe/<id>`)

Expo: `src/app/recipe/[id].tsx`, `RecipeView` and its modals. PIN-132, PIN-135, PIN-136, PIN-162.

| Item | Status | Note |
|---|---|---|
| Title, photo, facts (calories, time, cost), macros | 🔄 | Fact tiles and a photo hero. Effort moved to the tags row. Macros hidden for hand-set calories, as before. |
| Tags and collections, linking to the filtered Library | ✅ | |
| Back | 🔄 | Always "Back to Library" (Expo: browser back). |
| Favorite | ✅ | |
| Share | 🔄 | Uses the browser's share sheet where there is one, else copies the link. |
| Edit, tags, add to collection, note, repair, revert, show original, delete | 🔄 | In the "…" menu. Delete is new on this page. |
| Servings stepper | 🔄 | Remembered per recipe; capped at 99. |
| Spoons / grams | ✅ | |
| Ingredients with allergy and dislike flags | ✅ | Adds "I have this" ticks. |
| Swap (per ingredient) | ✅ | Adds Try again; the daily limit says so (G6). |
| Remix, with your own words; Revert | ✅ | Ctrl/⌘+Enter sends. |
| Make it without these (allergies, dislikes, missing appliances) | ✅ | Also a "Fix for my kitchen" tile. |
| Translate; auto-translate to the app language; Show original | 🔄 | A button shows busy instead of a "Translating…" banner. |
| Repair a partial import (1 credit only if kept) | 🔄 | A dialog with stages instead of `window.confirm`. |
| Notices: invented, partial, translated, adapted, allergies | ✅ | |
| Appliances: needed, better with, tip, steps that use it, missing warning | ✅ | |
| I cooked this, with a note | ✅ | The note dialog waits for the save. |
| Add to the shopping list | 🔄 | Pre-selects only what isn't ticked as "have". |
| "Updating…" while Pinch recalculates after an edit | ✅ | Appliances too (G7). |
| Cook along with the video; tap a step's time to jump | 🔄 | Side column on desktop, resizable panel on phones (PIN-136). |
| Cook mode: big steps, next/back, arrow keys, read aloud, timers, screen stays on, "I cooked this" at the end | 🔄 | Swipe instead of tap-to-advance; resumes where you left off; several timers at once. |
| Not found / failed to load | ✅ | Adds a link back to the Library. |
| `?justSaved=1` strip with Remove | ✅ | Remove goes to Snap. |

## Recipe editor (`/recipe/edit`)

Expo: `src/app/recipe/edit.tsx`, `src/components/recipeEditor/`. PIN-137.

| Item | Status | Note |
|---|---|---|
| Write a new recipe; edit one (`?id=`) | ✅ | `/recipe/<id>/edit` also works. |
| Finish a partial import (`?from=import`) | ✅ | G3. |
| Title, photo, servings, source | 🔄 | Photo by drag and paste too; servings −/+. |
| Ingredients and steps: add, remove, reorder | 🔄 | Drag handle plus keyboard (Alt+↑/↓). Enter adds a row. |
| Time, calories, effort, cost, tags, appliances, cook note, with "Set by you · Reset" | ✅ | |
| Errors from the server mapped to rows | ✅ | |
| Cancel and leaving ask before throwing changes away | ✅ | Closing the tab asks too. |
| Save | 🔄 | Sticky bar, always enabled, Ctrl/⌘+S; a toast instead of a held banner. |

## Shopping list (`/list`)

Expo: `src/app/(tabs)/list.tsx`, `useShoppingList`. PIN-134.

| Item | Status | Note |
|---|---|---|
| Grouped by aisle, count per group, Checked at the end | ✅ | Headers don't stick (A4). |
| Check off, edit, remove | 🔄 | Edit in the row; Undo after remove. Keyboard: arrows, E, Delete. |
| Have at home | ✅ | Adds Undo. |
| Add by hand, duplicate warning, Combine | ✅ | Form always open. |
| Add from recipes | 🔄 | Two steps: pick recipes, then tick ingredients. Staples start unticked instead of being skipped silently. |
| Clear checked, clear list, with confirmation | 🔄 | In the "…" menu. |
| Empty, failed to load, refresh failed | ✅ | The empty state opens "From recipes". |

## Hub (`/hub`, `/hub/<id>`)

Expo: `src/app/(tabs)/hub.tsx`, `src/app/hub/[id].tsx`. PIN-138.

| Item | Status | Note |
|---|---|---|
| Search, source, sort, tags, grid or list | 🔄 | Source and sort always visible; filters kept in the address; "/" jumps to search. |
| Recipes that fit your diet first | ✅ | |
| Loading more while scrolling; failed to load; no matches; empty Hub | ✅ | Adds Clear filters. |
| Hub recipe: read-only recipe, Add to library (free), Open in library | ✅ | |
| Hub recipe as a guest: read, Add → sign in → added | 🔄 | Sign-in instead of sign-up (A5). |
| Hub recipe: Share | ✅ | The source link (G9). |
| Hub recipe: Add to shopping list | ➖ *(proposed)* | Add it to the library first (free); then the recipe page has it. Signed-out guests have no list. |

## Shared recipe links (`/s/<token>`)

Expo: `src/app/s/[token].tsx`. PIN-145.

| Item | Status | Note |
|---|---|---|
| Read the shared recipe; Save to my library | ✅ | |
| As a guest: Save → sign up → saved | ✅ | |
| Already in my library: Open in library | 🔄 | Web only. |
| Link no longer works | ✅ | Revoked and unknown links both say "not found". A server error says "couldn't load" with Retry. |
| Change the recipe before saving (translate, remix, swap) | ➖ | Read-only until saved (PIN-145). |
| Share / Add to list | ✅ / ➖ *(proposed)* | Share: the source link (G9). Add to list: after saving, as on the Hub. |

## Cookbook (`/cookbook`)

Expo: `src/app/cookbook.tsx`. PIN-142.

| Item | Status | Note |
|---|---|---|
| Pick recipes by hand or by collection, search, select all | ✅ | |
| Order the book | 🔄 | Drag, arrows, remove per row. |
| Title | ✅ | Live cover preview. |
| Make the PDF | 🔄 | Built on the server and downloaded (Expo: the browser's print dialog). Print is offered too. |
| Paper size, photos on/off | 🔄 | New choices. |
| Progress, failed, "busy" | ✅ | |
| Open from the Library, from a collection | ✅ | |
| Open from Settings | ✅ | Settings → Your recipes (G8). |
| Free | ✅ | Free on both; the web limits books per account per minute. |

## Settings

Expo: `src/app/(tabs)/settings.tsx`, `src/app/settings/*`. PIN-139, PIN-154.

| Item | Status | Note |
|---|---|---|
| Account: photo, email, sign out | 🔄 | Own page (`/settings/account`); sign out also in the account menu. |
| Delete account | 🔄 | Type your email to confirm. |
| Credits: balance, free credits, packs, Polar checkout, coming back from checkout, sales switch | 🔄 | Packs on the page; free credits left and reset date; both store links when sales are off. |
| Appearance: light/dark/auto, theme pack | ✅ | Also in the account menu. Saved on the account. |
| Language, right to left | ✅ | Also in the account menu. |
| Recipe preferences: spoons/grams, metric/US, diets, allergies and dislikes, appliances, default servings, always swap, pantry staples, Hub sharing, auto-apply | ✅ | |
| Help: report an issue, send feedback, email support, about Pinch | 🔄 | One page with the forms in it. |
| Legal: privacy, terms, deletion guides | 🔄 | Static pages in a new tab. Old in-app addresses redirect there (G2). |
| Share Pinch | ✅ | |
| Your recipes: download and restore a backup | ✅ | `/settings/recipes`; the same file as mobile (G4). |
| Cookbook row | ✅ | On "Your recipes" (G8). |
| Admin links | 🔄 | One "Admin" link; the admin pages list the rest. |
| App version | ✅ | G10. |

## Signing in and first visit

Expo: `src/app/auth.tsx`, `auth-callback.tsx`, `reset-password.tsx`, `welcome.tsx`, `onboarding.tsx`. PIN-129, PIN-140, PIN-157.

| Item | Status | Note |
|---|---|---|
| Sign in and sign up with a password | ✅ | Strength is a text hint, no bars. |
| Email a code | 🔄 | A pasted code signs in on its own. |
| Continue with Google | ✅ | |
| Forgot password, reset | ✅ | |
| Confirm your email screen | ✅ | G11. |
| Signed-out visitors go to sign-in, then back | ✅ | `?next=` instead of `returnTo`. |
| Privacy and Terms on the sign-in page | ✅ | |
| Welcome page | 🔄 | A real page now (Expo web forwarded to the landing page). |
| Onboarding: diets, allergies and dislikes, how you heard, language | 🔄 | After the account, not before. Theme step left to Settings. |
| Not asked again after finishing elsewhere | ✅ | Read from the account. Finishing on the phone counts once the next mobile release writes it there (PIN-157). |
| Error screen on these pages | ✅ | G5. |

## Across the app

| Item | Status | Note |
|---|---|---|
| Navigation: Library, Hub, Snap, List, Settings | ✅ | Side rail on desktop, bottom bar with a raised Snap on phones. |
| Themes, dark mode, seven packs | ✅ | Painted before the page shows (no flash). |
| Five languages, Hebrew and Arabic right to left | ✅ | |
| In-app messages: banner, alert, sheet, full screen | ✅ | Banners show on every signed-in page. |
| Activity log, product events, visitor id across sign-in | ✅ | Version ends in "-next" (PIN-143). |
| Toasts | ✅ | |
| Admin: dashboard, insights, people, usage, activity, messages, grant credits | ✅ | "Not found" for non-admins (PIN-144). |

## Checks run

On the PIN-146 branch, 2026-11-22. Browser tests run against local Supabase only, never production.

| Check | How | Result |
|---|---|---|
| Browser tests, Chromium | `npm run test:e2e` in `web/` | All pass. The first run also failed tests that #104 had left expecting the import preview (auto-save now skips it); they are updated. CI runs the whole suite on the PR. |
| Every page fits the window: phone (360 px), tablet and desktop, in all five languages; Hebrew and Arabic right to left | `e2e/layout.spec.ts` (new): 20 pages each, signed in and out | Found two pages that ran off a phone in Spanish and Russian: the guest bar on Hub and shared links, and the recipe editor. Both fixed; all 15 combinations pass. |
| Keyboard only: sign in, import a recipe, open it, add it to the list | `e2e/keyboard.spec.ts` (new): Tab, typing and Enter only | Passes. |
| The fixes above | `e2e/parity.spec.ts` (new), `snap.spec.ts` (partial import, failed save, Remove), unit tests | Pass. While testing, "Add to collection" turned out to save without a collection that was still being created when Save was pressed; Save now waits. |
| Download size, first visit | Production, signed out, Chrome | Expo web: 928 KB of JavaScript in 10 requests before anything shows. New app: 393 KB in 40 smaller requests, with the page itself rendered on the server. |
| Speed: first load and moving between screens | Production signed out; local signed in with 300 recipes | Measured after the PR opened, on an idle machine; see the PR. |
| Firefox and WebKit (Safari's engine) | — | Not run here. Covered by Yarden's checks on a real iPhone and Android phone (below). |

### Left for Yarden

- A run through this list with your own account and library, on the phone and the laptop.
- Safari on an iPhone and Chrome on Android. WebKit on Windows is close to Safari, not the same.
- A week of real cooking on the new app without going back.
