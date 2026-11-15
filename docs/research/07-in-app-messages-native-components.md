# Pinch In-App Messages: Native Components Research

> **Sources:** the installed packages in `node_modules` (read directly), Expo's markdown docs at `docs.expo.dev` and the `expo/expo` repository at tag `sdk-54`, the `expo-in-app-updates` and `sp-react-native-in-app-updates` READMEs, the npm registry, and Google's and Apple's developer docs. Researched 2026-11-15.
>
> **Project context:** Pinch is on Expo SDK `54.0.38` (`expo@54.0.38`), React Native `0.81.5`, `expo-router ~6.0.24`, `react-native-screens 4.16.0`, `@react-navigation/native-stack 7.21.0`, `react-native-web 0.21.4`, `expo-web-browser 15.0.11`. `app.json` has no `newArchEnabled` key, so the New Architecture is on (SDK 54 default; SDK 55 removed the key). The repo has no `ios/` or `android/` folder (Expo prebuild), and uses `expo-dev-client` and EAS builds. Web is a full target (decision 13).
>
> **Why this note exists:** spec lines 16 and 23. The app Builder needs to know which native component to use for each way of showing an in-app message (`alert`, `sheet`, `banner`, `fullscreen`).

---

## Summary table

| Way of showing (`presentation`) | iOS component | Android component | Web fallback | Needs new build? |
|---|---|---|---|---|
| `alert` | `Alert.alert` → `UIAlertController` | `Alert.alert` → Android `AlertDialog` (max 3 buttons) | Custom centred card. `Alert.alert` is an empty function on web | No |
| `sheet` | RN `Modal` with `presentationStyle="pageSheet"` (`UIModalPresentationPageSheet`), as in the existing `SheetModal` | RN `Modal` (an Android `Dialog`). No native bottom sheet without a new module, so use the existing `SheetModal` look | `SheetModal` web branch: centred card on a dimmed backdrop | No |
| `banner` | None exists. Custom strip | None reachable. Custom strip | Custom strip inside the web layout beside `WebSidebar` | No |
| `fullscreen` | RN `Modal` with `presentationStyle="fullScreen"`; swipe-down is already blocked by default | RN `Modal` (full-window `Dialog`) with `onRequestClose` ignoring back | Custom full-viewport overlay on RN-web `Modal` | No |
| Link button, web address | `WebBrowser.openBrowserAsync` → `SFSafariViewController` | `WebBrowser.openBrowserAsync` → Chrome Custom Tabs | `window.open` in a new tab | No (already installed and in `app.json` plugins) |
| Link button, app route | `expo-router` | `expo-router` | `expo-router` | No |
| Link button, store page | `openAppStore()` in `src/lib/appStore.ts` | same | same, via `storeUrlFor('web', userAgent)` | No |
| Native update flow (Play in-app update, App Store sheet) | `SKStoreProductViewController` via a third-party module | Play Core in-app update via a third-party module | None | **Yes** (follow-up) |

---

## Q1. `alert`: what does `Alert.alert` give, and what do we use on web?

**Answer.** `Alert.alert(title, message, buttons, options)` is implemented in `react-native/Libraries/Alert/Alert.js`. The two platforms differ:

- **iOS.** It routes through `Alert.prompt` into `RCTAlertManager`, which presents a `UIAlertController`. Every button in the array is passed on, so there is no code limit on button count (iOS lays out three or more vertically). Button `style` can be `default`, `cancel` or `destructive`, and `isPreferred` marks the bold button. `options.cancelable` and `options.onDismiss` are marked `@platform android` and do nothing here. An iOS alert is dismissed only by a button.
- **Android.** It calls `NativeDialogManagerAndroid.showAlert`, an Android `AlertDialog`. The code does `buttons.slice(0, 3)`, then pops them into positive, negative and neutral slots: **at most three buttons**, extras are dropped. The comment in the source says so: "At most three buttons (neutral, negative, positive). Ignore rest." Button `style` is ignored. `cancelable` defaults to `false`; a tap outside or the back button closes it only when `options.cancelable` is `true`, and then `options.onDismiss` fires.
- **No image, no icon, no tone colour.** The API takes plain text only, so an `alert` cannot show the image or icon fields.
- **Web.** In `react-native-web 0.21.4` the whole class is `class Alert { static alert() {} }`, an empty function. `Alert.alert` silently does nothing on web, so web needs its own component.

For the project: the repo already has `src/components/ConfirmDialog.tsx`, whose comment says "Cross-platform confirm dialog — replaces Alert.alert / window.confirm". It is an RN `Modal` card (transparent, fade) with a title, message and up to three stacked buttons, RTL-aware, and takes a `trackId`. The team has already chosen not to use bare `Alert.alert` for in-app prompts, probably because `Alert` buttons cannot go through the `Pressable` tap-log wrapper (spec line 20) and `Alert` cannot be styled or localised past the button text.

**Recommendation.** Use `Alert.alert` for `alert` on iOS and Android, with two buttons maximum (decision 3 says two; Android can take three, iOS more), and a custom card on web, built on the `ConfirmDialog` pattern (`Modal` plus RTL). Three caveats the Builder must handle, because they cannot be done with `Alert.alert`:

1. **Tap logging (spec line 20).** `Alert.alert` buttons do not go through `@/components/ui/Pressable`, so taps on them reach the app only via the `onPress` callbacks. Log inside the callback with a fixed id (`in_app_message.alert.primary` and the like), never the message text.
2. **RTL and tone.** The OS decides the layout direction and has no tone colour, so Hebrew and Arabic text will follow the device language, not the app language chosen in Settings. If that matters for acceptance criterion E, route `alert` through the custom card on every platform instead and say so in the ADR.
3. **`required` and `alert`.** An Android alert can be made non-cancelable (the default), and an iOS alert only ever closes by a button, so a one-button alert is effectively required. Decision 3 reserves `required` for `fullscreen`; the Builder should keep that rule on the server side and not rely on this.

**Sources.**
- `node_modules/react-native/Libraries/Alert/Alert.js` (lines 38–46 types, 66–140 Android, 144–200 iOS)
- `node_modules/react-native-web/dist/exports/Alert/index.js` (empty `alert()`)
- `src/components/ConfirmDialog.tsx`
- https://reactnative.dev/docs/alert

---

## Q2. `sheet`: best native sheet without a new native module

**Answer.** Four candidates were checked.

**(a) RN `Modal` with `presentationStyle="pageSheet"`** (what `SheetModal` already does). On iOS it is `UIModalPresentationPageSheet`, a real UIKit sheet. `presentationStyle` is in `ModalPropsIOS`, so Android ignores it and shows a normal `Dialog` window. In RN 0.81.5 on iOS, **swipe-down dismissal is off by default**: both the Fabric view (`RCTModalHostViewComponentView.mm`: `_viewController.modalInPresentation = YES` on creation) and the old view (`RCTModalHostView.m`: `modalInPresentation = YES`) start non-dismissible, and `allowSwipeDismissal` turns it on (`modalInPresentation = !allowSwipeDismissal`). `onRequestClose` is documented as firing for "the hardware back button on Android, dismisses the sheet using a gesture on iOS (when `allowSwipeDismissal` is set to true)". So:
  - dismissible sheet: pass `allowSwipeDismissal` and an `onRequestClose` that closes it;
  - non-dismissible sheet: omit `allowSwipeDismissal`, and make `onRequestClose` a no-op (Android back).
  
  On web, `react-native-web` `Modal` renders `role="dialog"` with `aria-modal`, wraps content in a focus trap (`ModalFocusTrap`), and closes on the Escape key by calling `onRequestClose`.

**(b) expo-router `presentation: 'formSheet'` with `sheetAllowedDetents`.** This is a native sheet but it is a **route**, not an overlay: a message would have to push a screen onto the stack (`src/app/_layout.tsx` already registers modal screens such as `auth`). That is awkward for a popup that must appear over whatever screen the user is on, and it needs a route file per sheet. Behaviour by platform:
  - iOS: `UIModalPresentationFormSheet`; detents work; `gestureEnabled: false` blocks the swipe (typed `@platform ios`: "Only supported on iOS").
  - Android: `react-native-screens 4.16.0` implements `formSheet` as a Material `BottomSheetBehavior` (`android/.../bottomsheet/SheetDelegate.kt`); detents are limited to three. In the same source, `configureBottomSheetBehaviour` hard-codes `isHideable = true` and `isDraggable = true`, and `gestureEnabled` is typed iOS-only. **An Android form sheet cannot be made non-dismissible** by any prop in the installed version; it can only be re-opened or intercepted with `usePreventRemove` (already used in `src/app/recipe/edit.tsx`).
  - The docs disagree with each other. The SDK 54 expo-router page (`docs/pages/router/advanced/modals.mdx`, tag `sdk-54`) says form sheet "On Android, fallbacks to `modal`", and `@react-navigation/native-stack 7.21.0` `types.tsx` says the same ("will fall back to 'modal' on Android") while also documenting "Android is limited to three" detents. The current expo-router page says "On Android, form sheets use the platform's bottom sheet behavior" and "Native stack headers … are not supported inside form sheet screens". The installed `react-native-screens` source supports the bottom sheet, so the docs for SDK 54 are likely out of date, but no device test was done (see Caveats).

**(c) `@expo/ui`.** It is **not installed** (`node_modules/@expo` contains only `vector-icons`; not in `package.json`). In SDK 54 it is `@expo/ui 0.2.0-beta.9` (`packages/expo-ui/package.json`, tag `sdk-54`), and its SDK 54 docs page says "This library is currently in alpha and will frequently experience breaking changes. It is not available in the Expo Go app – use development builds". The SDK 54 `swift-ui` folder has `BottomSheet`, but the SDK 54 `jetpack-compose` folder has only `AlertDialog, Button, Chip, ContextMenu, DatePicker, Picker, Progress, Shape, Slider, Switch, TextInput`: **no bottom sheet and no snackbar on Android in SDK 54**. It has no web build (platforms: android, ios, tvos). Adding it is a new native module, so a new store build. In SDK 57 the library is much larger: `ModalBottomSheet` for Compose has a documented "Non-dismissible sheet" example (`shouldDismissOnBackPress: false`, `shouldDismissOnClickOutside: false`, gestures can be turned off) and `Snackbar` exists (Android only), and the page lists "Included in Expo Go". That would make a native Android sheet possible after an upgrade, not now.

**(d) A third-party bottom-sheet library** (for example `@gorhom/bottom-sheet`) is JS-drawn, not native, and would be a new dependency; ruled out.

**Recommendation.** Use **(a)** for `sheet`: RN `Modal` with `presentationStyle="pageSheet"`, i.e. extend or reuse the existing `SheetModal`. It is the native UIKit sheet on iOS, needs no build, can be made non-dismissible exactly (omit `allowSwipeDismissal`, ignore `onRequestClose`), and has a designed web version already. On Android there is no native bottom sheet available without a new module, so the existing `SheetModal` look (a full-window `Dialog` with a slide animation) is the answer, and the ADR should record "native on iOS, standard `Dialog` on Android, because `@expo/ui` has no bottom sheet in SDK 54". Do not use `formSheet` for messages: it is a route, it cannot be locked on Android, and its Android docs are inconsistent. Revisit `@expo/ui` `ModalBottomSheet` when the project moves to SDK 57.

**Sources.**
- `node_modules/react-native/Libraries/Modal/Modal.d.ts` (lines 37–42, 56–64, 93–97) and `Modal.js` (lines 200–210)
- `node_modules/react-native/React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm` (lines 129, 278–280) and `React/Views/RCTModalHostView.m` (lines 38, 54–58)
- `node_modules/react-native-web/dist/exports/Modal/ModalContent.js` (Escape key, `aria-modal`, `role="dialog"`)
- `node_modules/react-native-screens/src/types.tsx` (lines 163, 300–345, 436–445) and `android/src/main/java/com/swmansion/rnscreens/bottomsheet/SheetDelegate.kt` (lines 116–119)
- `node_modules/@react-navigation/native-stack/src/types.tsx` (lines 609–615, 672–701)
- https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/router/advanced/modals.mdx (line 209)
- https://docs.expo.dev/router/advanced/modals.md ("Form sheet presentation")
- https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/ui.mdx
- https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo-ui/package.json
- https://api.github.com/repos/expo/expo/contents/packages/expo-ui/src/jetpack-compose?ref=sdk-54
- https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/bottomsheet.md ("Non-dismissible sheet")
- `src/components/SheetModal.tsx`, `src/app/_layout.tsx`, `src/app/recipe/edit.tsx:250`

---

## Q3. `banner`: is there a native in-app banner?

**Answer.**
- **iOS.** UIKit and SwiftUI have no in-app banner component. The only system "banner" is a notification banner, which belongs to push or local notifications (out of scope, spec line 13; `expo-notifications` is not installed). Nothing in the Expo SDK 54 `@expo/ui` SwiftUI folder (listed above) is a banner either.
- **Android.** The Material `Snackbar` exists natively, but is **not reachable** from this project's stack: React Native core only has `ToastAndroid` (a transient toast, no buttons, no tap handling), and `@expo/ui` has a Compose `Snackbar` only in SDK 57 (platforms: android; `expo-go`), not in SDK 54 (no `Snackbar` in the SDK 54 `jetpack-compose` folder). A snackbar is also a transient bottom message, which is the wrong shape for a persistent "please update" strip.
- **Web.** Neither applies.

**Recommendation.** `banner` is custom on all three platforms, as `decisions.md` item 3 already says. Build it as a strip at the top of the tabs on iOS and Android, and inside the web layout beside `WebSidebar` on web (spec line 24). No native component exists to prefer, so acceptance criterion H is met by the note saying so.

**Sources.**
- https://api.github.com/repos/expo/expo/contents/packages/expo-ui/src/swift-ui?ref=sdk-54 and `.../jetpack-compose?ref=sdk-54` (component lists)
- https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/snackbar.md (platforms: `android`, `expo-go`)
- `package.json` (no `expo-notifications`)
- https://reactnative.dev/docs/toastandroid

---

## Q4. `fullscreen` and required messages: blocking back and swipe-to-dismiss

**Answer.** Use RN `Modal` with `presentationStyle="fullScreen"` (iOS) and handle the two dismiss paths separately:

- **Android hardware back (and the back gesture).** For a `Modal`, `onRequestClose` is required on iOS and Android and is called when the user taps the hardware back button. Pass an `onRequestClose` that does nothing for a required message; the dialog stays. The repo has a precedent in `src/components/onboarding/FirstRunWalkthrough.tsx` (lines 64–71): `BackHandler.addEventListener('hardwareBackPress', () => { …; return true; })`. `app.json` has `"predictiveBackGestureEnabled": false`, so the classic back path applies.
- **iOS swipe-down.** Not needed for `fullScreen` (a full-screen modal has no swipe-down), and for `pageSheet` it is already off by default because `modalInPresentation` starts `YES` (see Q2). Do not pass `allowSwipeDismissal` for required messages.
- **Web.** `react-native-web`'s `Modal` calls `onRequestClose` on the Escape key, so a no-op `onRequestClose` also blocks Escape. `BackHandler` on web is a stub that logs `console.error('BackHandler is not supported on web and should not be used.')`; guard any `BackHandler` call with `Platform.OS !== 'web'`. The browser's own back button cannot be blocked by `Modal`; since the message is an overlay and not a route, going back does not close it, which is the wanted result.
- **expo-router `formSheet` / `usePreventRemove`** would also work on iOS but, as shown in Q2, an Android form sheet stays draggable. This is a second reason to keep messages as overlays and not routes.

**Recommendation.** One `MessageModal` built on RN `Modal`, with `onRequestClose={dismissible ? close : noop}`, `allowSwipeDismissal={dismissible}` (iOS), and no close button when `dismissible` is false. Required messages must show the store button (acceptance criterion D), so the server should reject `required` without a store-button action. If the Builder prefers the `BackHandler` approach for consistency with `FirstRunWalkthrough`, register it only while the message is on screen and only off web.

**Sources.**
- `node_modules/react-native/Libraries/Modal/Modal.d.ts` (line 38–42: `onRequestClose` "is required on iOS and Android")
- `node_modules/react-native/React/Views/RCTModalHostView.m` (line 84: `onRequestClose` only fires for swipe when `_allowSwipeDismissal`)
- `node_modules/react-native-web/dist/exports/Modal/ModalContent.js` (Escape) and `.../BackHandler/index.js`
- `src/components/onboarding/FirstRunWalkthrough.tsx:64`; `app.json` (`predictiveBackGestureEnabled`)
- https://reactnative.dev/docs/modal

---

## Q5. Links: `expo-web-browser` `openBrowserAsync`

**Answer.** Installed `expo-web-browser 15.0.11` (same major as SDK 54). Its docs: on Android it uses Chrome Custom Tabs; on iOS `SFSafariViewController` (or `ASWebAuthenticationSession` for `openAuthSessionAsync`, which we do not need). `openBrowserAsync(url, options)` options in `WebBrowser.types.d.ts`:

- iOS: `controlsColor`, `dismissButtonStyle` (`done`/`close`/`cancel`), `readerMode`, `presentationStyle` (default `OverFullScreen`), `toolbarColor`, `enableBarCollapsing`.
- Android: `toolbarColor`, `secondaryToolbarColor`, `showTitle`, `enableDefaultShareMenuItem`, `browserPackage`, `showInRecents` (default `false`), `createTask` (default `true`), `enableBarCollapsing`.
- Web: `windowName`, `windowFeatures`; it calls `window.open`.

Return value: iOS resolves when the browser is dismissed or opened; Android `openBrowserAsync` does not wait until closed, so the library waits on `AppState` (source comment: "openBrowserAsync on Android doesn't wait until closed, so we need to polyfill it with AppState").

**Web trap.** The docs list `ERR_WEB_BROWSER_BLOCKED`: "The popup window was blocked by the browser or failed to open. This can happen in mobile browsers when the `window.open()` method was invoked too long after a user input was fired." So on web the call must happen straight from the tap handler, with no awaited network call before it (for example, do not `await` the "tapped" receipt write before opening). Fire the receipt write without awaiting, or after the open call.

The plugin is already set up in `app.json` (`expo-web-browser` with `experimentalLauncherActivity: false`), and the repo uses it in `src/components/external-link.tsx` and `CookAlongVideoModal.tsx`. `Linking.openURL` is what `openAppStore()` uses for the store.

**Recommendation.** Web address → `WebBrowser.openBrowserAsync(url)`, with `toolbarColor`/`controlsColor` from the theme if wanted. Only allow `https:` (and `http:` if the admin screen insists) in the admin input; reject `javascript:` and similar on both the server and the app. App route → `router.push` after checking the string starts with `/`. Store → `openAppStore()`. No new build.

**Sources.**
- `node_modules/expo-web-browser/build/WebBrowser.types.d.ts`, `WebBrowser.js` (lines 117–122, 268–300), `ExpoWebBrowser.web.js`
- https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/webbrowser.mdx (intro, `ERR_WEB_BROWSER_BLOCKED`)
- https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser.md
- `app.json` plugins; `src/lib/appStore.ts`

---

## Q6. Update prompts: Play in-app updates and the App Store sheet

**Answer.**

**What the platforms offer.**
- **Google Play in-app updates** is a Play Core feature that "prompts active users to update your app". It supports flexible (background download) and immediate (full-screen, required restart) flows; Android 5.0 (API 21) or higher; mobile, tablet and ChromeOS only; "not compatible with apps that use APK expansion files (.obb files)". It works only for builds installed from Google Play.
- **Apple** has no in-app update mechanism. The closest thing is `SKStoreProductViewController` ("A view controller that provides a page where customers can purchase media from the App Store"), which shows the store page as a sheet inside the app. Apple lists it for iOS 6.0 and later.

**Libraries.** None is part of Expo or installed.

| Library | Version, date | Fits Expo SDK 54 / RN 0.81? | Native module? |
|---|---|---|---|
| `expo-in-app-updates` | `0.13.0`, 2026-10-20 | **No.** README compatibility table: `0.13.x` = SDK 58+, RN 0.88+; `0.12.x` = SDK 56, RN 0.85. Nothing listed for SDK 54 | Yes (Expo module, Kotlin + Swift) |
| `sp-react-native-in-app-updates` | `2.0.0`, 2026-07-10 | Peer `react-native >=0.71.0`; README says it supports old and New Architecture and Expo dev builds, "does not work in Expo Go". Needs `react-native-device-info` (replaced by a Metro alias in Expo, per the README) | Yes (Play Core on Android; iOS uses the iTunes Search API and an alert, with no extra native dependency) |
| `react-native-in-app-update` | `1.0.1`, 2022-05-14 | Unmaintained | Yes |

Both candidate libraries contain native code, so adding either one changes the native binary: **a new store build** (spec constraint: "no new native module unless the research job shows it is needed and the manager approves it"). The iOS half of `sp-react-native-in-app-updates` is only an alert plus a link to the store, which `openAppStore()` already does. `expo-in-app-updates` presents `SKStoreProductViewController` on iOS, but it needs SDK 56+ (and 0.13.x needs the New Architecture and iOS 16.4+).

**Is it needed?** The ticket requirement is "a message can carry a button to the App Store or Play Store, and can be marked required for old versions". `openAppStore()` plus `storeUrlFor` already deliver that on all three platforms. The native flows only change how the update happens (inside the app instead of leaving it); they add no targeting or messaging ability. Also, Play's flow only works for Play-installed builds, which makes it hard to test (no local verification).

**Recommendation.** **Do not build the native update flow now; list it as a follow-up** (decision 11). The store button via `src/lib/appStore.ts` covers the ticket. When the project reaches SDK 56 or later, reconsider `expo-in-app-updates` (it covers both the Play overlay and the App Store sheet in one module) and record the new build as a manager decision then. Do not add `sp-react-native-in-app-updates` for SDK 54: it needs a `react-native-device-info` alias and gives only the Android half.

**Sources.**
- https://developer.android.com/guide/playcore/in-app-updates (support, flows, `.obb` note)
- https://developer.apple.com/tutorials/data/documentation/storekit/skstoreproductviewcontroller.json (JSON of https://developer.apple.com/documentation/storekit/skstoreproductviewcontroller)
- https://raw.githubusercontent.com/SohelIslamImran/expo-in-app-updates/main/README.md (Compatibility table) and `.../CHANGELOG.md`
- https://raw.githubusercontent.com/SudoPlz/sp-react-native-in-app-updates/master/README.md
- npm registry: `npm view expo-in-app-updates`, `sp-react-native-in-app-updates`, `react-native-in-app-update` (versions and dates above)

---

## Q7. What changes between Expo SDK 54 and the v57 docs?

**Answer.** `AGENTS.md` points at the v57 docs; the project is on SDK 54. Note that `docs.expo.dev/versions/v54.0.0/...` currently serves current-version pages (the `.md` copy says "Reference (v58.0.0)"), so the SDK 54 text above comes from the `expo/expo` repo at tag `sdk-54`.

- **`expo-web-browser`.** Compared the SDK 54 page (from the repo, tag `sdk-54`) against the v57 page: no change to the API or behaviour described. v57 only adds `expo-go` to the platforms list and a modification date.
- **`expo-store-review`.** Not used by this feature; the SDK 54 and v57 pages are identical.
- **New Architecture.** SDK 54 is "the final release to include Legacy Architecture support"; SDK 55 removed `newArchEnabled` from `app.json`. Not a problem here (it is already on), but any library to add later must support it, as `expo-in-app-updates 0.13.x` requires.
- **`@expo/ui`.** The biggest difference. SDK 54: `0.2.0-beta.9`, "alpha", not in Expo Go, SwiftUI `BottomSheet`, Compose `AlertDialog`, but no Compose bottom sheet or snackbar. v57: the page lists Compose `AlertDialog`, `ModalBottomSheet` (with a non-dismissible example), `Snackbar`, and SwiftUI `Alert`, `BottomSheet`, `ConfirmationDialog`; "Included in Expo Go". A v57 upgrade would make a fully native `sheet` and `alert` on Android possible, but it would still be a new native dependency and has no web build (a "Universal" set exists in the current docs, which we did not evaluate).
- **expo-router `formSheet`.** The SDK 54 page says Android falls back to `modal`; the current page documents the Android bottom sheet, three detents at most, and no native header inside the sheet. The installed `react-native-screens 4.16.0` has the Android sheet.
- **`react-native-screens` / Alert / Modal.** Not versioned by Expo's docs; their behaviour is fixed by the installed React Native 0.81.5 and `react-native-screens 4.16.0`, read from source above. The v57 stack (RN 0.86 per `docs/research/01-expo-nativewind-setup.md`) was not read.

**Recommendation.** Write the code against SDK 54 and the installed sources. Nothing in this note's recommendations (`Alert`, `Modal`, `expo-web-browser`, existing `SheetModal`) changes on the upgrade path except the optional `@expo/ui` route.

**Sources.**
- https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser.md and https://docs.expo.dev/versions/v57.0.0/sdk/storereview.md, diffed against the repo copies at tag `sdk-54`
- https://expo.dev/changelog/sdk-54 and https://expo.dev/changelog/sdk-55 ("Dropped support for the Legacy Architecture")
- https://docs.expo.dev/versions/v57.0.0/sdk/ui.md and `.../ui/jetpack-compose/{bottomsheet,snackbar}.md`, `.../ui/swift-ui/bottomsheet.md`
- https://docs.expo.dev/router/advanced/modals.md
- `docs/research/01-expo-nativewind-setup.md` (SDK table)

---

## What the Builder should use

- `alert`: `Alert.alert` on iOS and Android, custom `ConfirmDialog`-style card on web. Log taps inside the callbacks.
- `sheet`: RN `Modal` `pageSheet` (extend `SheetModal`); `allowSwipeDismissal` only when dismissible; web branch is the existing centred card.
- `banner`: custom everywhere.
- `fullscreen`: RN `Modal` `fullScreen` with no-op `onRequestClose` when required; web overlay with focus trap from RN-web `Modal`.
- Links: `expo-web-browser`, `expo-router`, `openAppStore()`. Open the browser straight from the tap handler on web.
- No new dependency and no new native module.

## Caveats

- **Nothing was run on a device or emulator.** All platform behaviour is from source and docs. In particular the Android `Alert` and `Modal` back-button behaviour, and the iOS `modalInPresentation` default, should be checked once on a real build.
- **Android `formSheet` in SDK 54 is documented two ways** (fallback to `modal` in the SDK 54 router page and in the `native-stack` types; bottom sheet in `react-native-screens` source and the current router docs). We recommend not using it, so this does not block anything.
- **`docs.expo.dev/versions/v54.0.0/` is not a faithful archive**: it serves current pages. SDK 54 facts here come from the `sdk-54` tag of the `expo/expo` repository.
- **Not read:** the "Universal" `@expo/ui` components in the current docs (a possible web-capable path after an upgrade), and the React Native 0.86 sources behind SDK 57.
- **`Alert.alert` button count.** iOS accepts more than three buttons in code; we did not find a documented limit and did not test the layout. The decision (two buttons) keeps us well inside both platforms.
- **The `Alert` vs custom-card choice for `alert`** (Q1, point 2) depends on whether the owner accepts OS-language button layout on RTL; the manager may want to ask.
- Apple's page was read through its documentation JSON (abstract and platform versions only); its prose was not available.
