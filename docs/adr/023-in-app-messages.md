# ADR 023: In-app messages: popups, announcements and update prompts

**Status:** Accepted
**Date:** 2026-11-16
**Deciders:** Ben (PIN-106)

## Context

Admins had no way to talk to users inside the app. A new feature, a broken release or "please update" meant a store release or an email. PIN-106 asks for popups to chosen users, announcements to everyone and update prompts, all sent from the admin area with no app release. Each message has to be customisable, written in the app's five languages, and shown with the platform's own components where the platform has one. The website build is a full target, not a fallback.

## Decision

**Two tables, no direct access.** `in_app_messages` holds the message and `in_app_message_receipts` holds one row per user and message. Both have row level security on and every grant revoked, so the app and the admin screen only use `security definer` functions (the `interaction_events` pattern).

- `get_in_app_messages(platform, app_version, language)`: signed-in callers only. Returns the live messages that target the caller, plus the caller's own receipts. Plan (`free` or `pro`) is worked out on the server from `profiles.subscription_status`. Messages that can never show again for this user are dropped so the 50-row cap cannot fill with old ones.
- `record_in_app_message_event(message, 'seen' | 'dismissed' | 'clicked', button)`: touches only the caller's own receipt.
- `admin_list_in_app_messages`, `admin_save_in_app_message`, `admin_set_in_app_message_status`, `admin_delete_in_app_message`: check `is_current_user_admin()`. The list carries the counts (seen, dismissed, clicked).
- Nobody sees a message before signing in. The app fetches after sign-in, when it returns to the foreground (on web: when the tab becomes visible; a refresh within 30 s of the last is skipped) and when the language changes. It clears what it holds on sign-out.

**What a message has.** A way of showing (`presentation`: `alert`, `sheet`, `banner`, `fullscreen`), a tone (info, success, warning, critical), an icon (an Ionicons name), an image, and text per language (`en` required; `he`, `ar`, `es`, `ru` optional; a missing language shows English). Up to two buttons, each with a label per language and an action: dismiss, a web address, an app route or the store page. An optional link under the text. Dismissible or not, required or not, how often (once, every launch, every N days, until dismissed), a maximum number of shows, start and end time, priority, which screens it may show on, a delay, and a position for banners. Stored status is `draft`, `live` or `stopped`; `scheduled` and `ended` are worked out from the times.

**Targeting** is by user ID, plan, platform (`ios`, `android`, `web`), language and app version (`minAppVersion` inclusive, `maxAppVersion` exclusive, compared part by part on the server; an unreadable version never matches a bound). Empty means everyone. "Update the app" is `maxAppVersion = X`.

**Required.** A required message is always shown full screen, has no close control, ignores frequency, max shows and dismissal, always has a store button (the app adds "Update" if the admin gave none), and keeps coming back until targeting stops matching, which is what happens when the user updates. The admin screen only allows `required` with `fullscreen` and switches to it when `required` is turned on.

**Receipts.** `seen` counts up; `dismissed` and `clicked` keep the latest time, and `clicked` also keeps which button. Receipts are erased with the account (`on delete cascade`). Direction follows the language the message is shown in, not the app language: Hebrew content is laid out right to left, and the English fallback left to right, even for a Hebrew user.

**Images** go into the existing `recipe-thumbnails` bucket under `in-app-messages/`, with a storage policy that lets only admins write there. No new bucket. The account-deletion sweeps only touch `avatars/<user id>-*` and `photo/…`, so they leave this folder alone. Deleting a message leaves its image in storage.

**Admin screen** (`/admin/messages`, Settings → Admin → Messages): list with filters and counts, a composer with every option, a preview per language, presets (announcement, update prompt, required update, popup to one user), schedule, stop, duplicate, delete, and "Send to me only". English only, like the other admin pages; only the screen title and the Settings row go through i18n.

### The native component per way of showing

The research note (`docs/research/07-in-app-messages-native-components.md`) is the source; nothing was run on a device.

| Way of showing | iOS | Android | Web |
|---|---|---|---|
| `alert` | `Alert.alert` (`UIAlertController`) | `Alert.alert` (`AlertDialog`) | Centred card in the `ConfirmDialog` style (`Alert.alert` does nothing on web) |
| `sheet` | `SheetModal` (React Native `Modal`, `pageSheet`) | `SheetModal` (a `Dialog`; no native bottom sheet without a new module) | `SheetModal`'s centred card |
| `banner` | Custom strip (no native one exists) | Custom strip | Custom strip in the content column beside `WebSidebar` |
| `fullscreen` | `Modal`, `fullScreen` (not swipe-dismissible by default) | `Modal` with `onRequestClose` ignoring back | Full-viewport overlay on the React Native Web `Modal` |
| Link, web address | `expo-web-browser` (`SFSafariViewController`) | `expo-web-browser` (Chrome Custom Tabs) | New tab |
| Link, app route | `expo-router` | `expo-router` | `expo-router` |
| Store button | `openAppStore()` | `openAppStore()` | New tab with `storeUrlFor('web', userAgent)` |

Two corrections to the first plan, both from the research: `sheet` uses `SheetModal` and not an `expo-router` form sheet (a form sheet is a route, and on Android it cannot be made non-dismissible), and the system alert is only used when it can be right.

**The system alert is used only when it fits:** iOS or Android, no image, at most two buttons (counting the link, and the Close button described next), and the device's layout direction equals the message language's direction. The OS draws it in the device's language and direction, so for a Hebrew message on an English phone the app shows the custom card instead, and an alert with an image is shown as a card (the image is shown, not dropped). On web it is always the card.

**A dismissible alert always has a button that closes it.** iOS closes a system alert only through one of its buttons (a tap outside does nothing), so when a message is dismissible and none of its buttons is a `dismiss` action, a cancel-style button with the close label is added, on the system alert and on the card alike. Using it records `dismissed`. It takes one of the two places: a message whose buttons and link, plus Close, need three is shown as the card.

**`seen` is recorded when the message is on screen.** The presenter tells the controller: from the `Modal`'s `onShow` for the card, the sheet (`SheetModal` passes `onShow` through to its `Modal`) and the full-screen page, from the call to `Alert.alert` for the system alert, and from the banner being drawn (and only while a tabs route is current, not while a screen pushed over the tabs hides it). On iOS a `Modal` is not presented while another modal is presented from the same view controller, and React Native does not try again, so if `onShow` has not fired after 1.5 seconds the `Modal` is remounted, and again every 1.5 seconds, until it shows or the message is no longer the active one. Nothing is shown while the current route is `auth`, `welcome`, `onboarding`, `reset-password` or `auth-callback`, so a message chosen right at sign-in appears once the user lands in the app. A banner is not chosen while a screen is pushed over the tabs. None of this closes anything, so a required message stays inescapable.

**Web.** `window.open` is blocked after an `await`, so links and the store button start straight from the tap handler. The store button opens a new tab (`Linking.openURL` on web would navigate the app's own tab away). `BackHandler` is guarded on web. Escape closes dismissible modals and a banner with focus; a required message ignores Escape and keeps focus inside. Links accept `https` only, and routes accept a single leading slash only.

### The new web app (PIN-143, 2026-11-21)

The Next.js app in `web/` shows messages with the same rules: the controller, the view model and the tab-as-launch storage moved to `shared/lib/` (`inAppMessagesController.ts`, `inAppMessageView.ts`, `inAppMessageLaunch.ts`), and the mobile app imports them from there.

- **Targeting.** It asks for platform `web`, so a message aimed at `web` reaches the Expo web app and the new one alike. Its app version is the mobile version plus `-next` (`1.0.10-next`, ADR 020). Version bounds ignore the suffix, so it compares as the Expo web build from the same commit. Nothing new on the server.
- **Ways of showing**, all from the UI kit's Radix dialogs: `alert` is a centred card, `sheet` the kit's sheet (from the bottom on phones, from the end side on wider screens), `fullscreen` a page over everything, `banner` a strip at the top or bottom of the content column in the app shell. A banner may show on any signed-in page, not only the main tabs (the controller's `canShowBanner`). Icons are the admin's Ionicons name mapped to its lucide match, else the tone's icon.
- **Links are real links.** A web address opens in a new tab from an `<a target="_blank">`, an app route is a Next link (mobile `(group)` segments dropped), and the store button opens the App Store, or Google Play on Android, in a new tab from the click.
- **Seen** is recorded when the dialog or the banner has mounted, once per showing (the controller ignores repeats). Escape, the backdrop and the close control dismiss a dismissible message; a required one has none of them and keeps focus inside. The admin-only hide control ("hide until this tab is closed") shows only for `profiles.is_admin`.
- **Preview.** `InAppMessagePreview` draws a message from the same parts, inline and `inert`, for the admin composer.

## Considered options

- **Push notifications.** Out of scope (ticket line 13).
- **A message table readable by RLS.** Targeting by plan and version, receipts and the "never show again" rules are easier to keep right in one function than in policies, and a function does not leak other messages' targeting.
- **Per-install receipts for guests.** The app has no guests; every function requires a signed-in caller and receipts are keyed by `user_id` alone.
- **A new bucket for message images.** Not needed; one folder and one policy in an existing bucket.
- **`expo-router` `formSheet` for `sheet`.** See the corrections above.
- **Native update flow** (Google Play in-app updates, the in-app App Store sheet). Both need a new native module (`expo-in-app-updates` needs SDK 56 or later). The store button covers the ticket; this is a follow-up.

## Consequences

- **Deploy by hand.** Apply `supabase/migrations/20261116120000_in_app_messages.sql` (SQL Editor, or `npx supabase db push`). There is no Edge Function and no new secret. The app and the admin screen need the migration, so apply it before releasing a build with this feature; an app without it just never gets a message (a failed fetch is silent).
- **No new native module and no new dependency**, so the feature reaches users with the next store build (iOS, Android) and the next web deploy.
- **The preset "Update prompt" targets `ios` and `android`, not `web`**, because the website is always the latest version. An admin can add `web`.
- **An admin can lock themself out of one device.** A required message that targets the admin's own device (for example "Send to me only" on a required message, or a version bound above the installed one) covers the admin screen and cannot be closed there. Stop it from the web or another device. "Send to me only" asks for confirmation first for a required message. To make that less painful, a required message shows an extra control, labelled "Admin only: hide until the app restarts", only when the signed-in user is an admin (`profiles.is_admin`). It hides the message for the rest of that launch on that device and records nothing, not even `dismissed`; the message comes back on the next launch while it is live and matches. A person who is not an admin sees no change.
- **A system alert already on screen stays there after an admin stops the message.** Code cannot take back an `Alert.alert`, so a user who left the app with the alert open sees it again on return. The next fetch removes the message from the app, but the alert stays until the user taps one of its buttons. Its link or store button still works.
- **A local database over `http://` cannot hold an uploaded image address**, because the image address must be `https://`. Hosted storage is `https`, so this only matters in local testing.
- **Keyboard focus.** A modal takes focus when it opens, so a keyboard focus ring shows on its first control on web.

## Follow-up: checks on a device

Nothing below was run; the app was only run on web. On an iOS and an Android build:

1. `alert`: the system alert shows for an English message on an English device, and the custom card shows for a Hebrew message on an English device. On Android, the back button and a tap outside do nothing unless the alert is dismissible.
2. `sheet`: the page sheet opens on iOS and is not swipe-dismissible; on Android the dialog closes with the close button and back.
3. `fullscreen` and required: no swipe or back dismisses a required message on either platform; the store button opens the right store; the message is gone after the app is updated.
4. `banner`: top and bottom positions clear the status bar, the notch and the tab bar; a bottom banner sits above the tab bar.
5. Hebrew and Arabic: right-to-left layout in the sheet, banner and full screen, with an English-language device and a Hebrew-language device.
6. A link opens in the in-app browser (Safari view, Chrome Custom Tab); an app route navigates; the store button goes to the App Store or Google Play.
7. Returning to the foreground fetches (stop a message in the admin screen, background the app, return).
8. Screen reader: VoiceOver and TalkBack read the title first and reach the buttons; the close control has a name.
9. `alert` with one button that opens a page or the store (no `dismiss` button), on an iPhone: the system alert shows that button and Close, and Close closes it and counts as dismissed in the admin screen. With a button and a link, the card shows with a Close button. (Blocking review finding; to be confirmed on a real iPhone.)
10. A message appearing while another modal is open, on an iPhone: sign in on the `auth` screen with a message waiting, and return to the app while one of the app's own sheets (feedback, add to collection) is open, with a newly live message. The message must appear (after the auth screen has gone, or after up to a few seconds of retries) and be counted as seen only then. A required message must not be skipped. (Blocking review finding; to be confirmed on a real iPhone.)
11. A required message on an admin's own device: the admin-only hide control shows for an admin and not for anyone else, and hides the message until the app is restarted.
