# Pinch Hands-Free Cook Mode Research (PIN-81)

> **Sources:** the Expo docs at `docs.expo.dev/versions/v57.0.0/`, the `expo-speech-recognition` README, releases and issues on GitHub, the npm registry, Apple's and Google's developer docs, MDN and its browser-compat data, and the browsers' release notes. Every page was read on **2026-11-22**. Package facts (versions, dates, stars, open issues) come from `npm view` and the GitHub API on the same day.
>
> **Project context:** the repo is on **Expo SDK 54** (`expo@54.0.36`, `react-native@0.81.5`, `expo-router ~6.0.24`), not SDK 57. `AGENTS.md` points at the v57 docs, so this note reads those, and says where the SDK 54 version differs. There is no `expo-updates`, so every native change ships with a new store build. `app.json` has no `newArchEnabled`, so the New Architecture is on. Android release builds are minified (`enableMinifyInReleaseBuilds: true`). The app has five UI languages (en, he, ar, es, ru). Recipes can be in seven (`shared/lib/recipeLanguages.ts` adds de and fr).
>
> **Why this note exists:** PIN-81. Cook mode should read the current step aloud and move by voice ("next", "back", "repeat"), so people with messy hands don't touch the screen. Related: PIN-27 (speaker mode, planning only) and PIN-136 (cook mode on the web app).

---

## Summary

- **Read aloud (phase 1): build it now.** Mobile uses `expo-speech`. Web uses the browser's `speechSynthesis`. Both are free, need no permission and no server. The web part can be fully tested on this PC. The mobile part needs a new native build, and one check on a real iPhone (the silent switch).
- **Voice commands (phase 2): use `expo-speech-recognition` (jamsch).** It is the only maintained Expo module that wraps the phone's own recognizer on both platforms, with an on-device switch, continuous listening, and an Expo config plugin. The other options are archived, lack Hebrew, or are far heavier.
- **Phase 2 needs Yarden first.** The repo is on SDK 54, so we would get the old `sdk-54` build of the module (3.1.3, April 2026). It misses later fixes, including one for Android **minified release builds**, which we use. Phase 2 also needs physical devices: on-device models for Hebrew and Arabic, echo from the speaker, kitchen noise and battery can't be checked in a simulator.
- **Web voice commands:** on-device only in desktop Chrome and Edge (139+) and desktop Firefox (160+). Safari and Chrome on Android would send audio to a server. Suggest: offer it only where it runs on the device.

---

## What cook mode does today

**Mobile** (`src/components/CookMode.tsx`, opened from `src/components/RecipeView.tsx`):
- A full-screen `Modal`. One step at a time in large type. Tap the step or Next to go on, swipe to go back.
- `useKeepAwake()` keeps the screen on.
- Times in a step become one timer chip (`parseStepTimers` from `@shared/lib/stepTimers`). The timer resets when the step changes. When it ends there is **no sound**: it only calls `announce()` (`src/lib/a11y.ts`) for screen readers.
- `announce()` also reads the new step for screen readers after Next or Back.
- It gets `textDirection` but not the recipe's language. `RecipeView` already works out `contentLanguage` (line ~306), so it only needs passing down.
- The header has an empty `h-12 w-12` spacer on the end side. A speaker button fits there.

**Web** (`web/components/cook/CookMode.tsx`, opened from `web/components/recipe/RecipeView.tsx`):
- A Radix dialog, full screen. Progress dots, big Back and Next, arrow keys, Space, Page Up/Down (clickers), swipe (`web/lib/cook/cookModeKeys.ts`).
- Screen Wake Lock (`web/lib/cook/useWakeLock.ts`) and full screen (`useFullscreen.ts`).
- Several timers that keep running across steps (`useCookTimers.ts`). A finished timer plays a Web Audio chime (`web/lib/cook/chime.ts`) and is read out by an `aria-live` region.
- It already receives `contentLanguage` and `direction`.
- The header end slot holds the full-screen button. A speaker button goes next to it.

**Strings** live in `shared/i18n/locales/{en,he,ar,es,ru}.ts`. Shared cook strings are under `recipe.cookMode*`, web-only ones under `web.cook.*`.

**Preferences on the device** use the same key on both apps: AsyncStorage on mobile (`src/hooks/useLibraryLayout.ts`), `localStorage` on web (`web/lib/library/useLibraryLayout.ts`). A read-aloud switch can follow that pattern (`pinch:cookReadAloud`).

---

## Reading aloud

### Mobile: `expo-speech`

The v57 docs list `Speech.speak(text, options)`, `Speech.stop()`, `Speech.pause()` and `Speech.resume()` (not on Android), `Speech.isSpeakingAsync()`, `Speech.getAvailableVoicesAsync()` and `Speech.maxSpeechInputLength`. Options include `language` (BCP 47), `voice`, `pitch`, `rate`, `volume`, `onStart`, `onDone`, `onStopped`, `onError`, `onBoundary`, and iOS-only `useApplicationAudioSession`. A `Voice` has `identifier`, `language`, `name` and `quality` (`Default` or `Enhanced`). There is no config plugin and no permission. ([expo-speech, v57](https://docs.expo.dev/versions/v57.0.0/sdk/speech/))

Points that matter for us:
- **iOS silent switch.** On a real iPhone "won't produce sound if the device is in silent mode." ([expo-speech, v57](https://docs.expo.dev/versions/v57.0.0/sdk/speech/)) Many people cook with the switch on. `useApplicationAudioSession: false` makes the system create its own audio session that "handles interruptions and mixing or ducking with other audio". The docs don't say whether that plays through silent mode. **Needs a device test.**
- **Version.** On SDK 54 `npx expo install expo-speech` gives `~14.0.8` (from `node_modules/expo/bundledNativeModules.json`). The v57 package is `57.0.3`. The API in the v57 docs matches what we need. The SDK 54 docs page now redirects to the latest version, so I could not read it.
- **Native code.** `expo-speech` is a native module. It is not in our current binary, so it needs a new dev build and ships with the next store build (no OTA here).
- **Voices.** Each platform has its own voices. Hebrew, Arabic and Russian voices exist on iOS and in Google's Android TTS, but a given phone may not have them installed. We must pick a voice with `getAvailableVoicesAsync()` and fall back when none matches. On Android, Java's `Locale` has long reported Hebrew as the old code `iw`, so match both `he` and `iw`.

### Web: `speechSynthesis`

- Supported in every current browser: Chrome 33+, Edge 14+, Firefox 49+ (62+ on Android), Safari 7+ ([MDN browser-compat data, SpeechSynthesis](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesis.json)).
- Chrome fills the voice list late. You have to wait for `voiceschanged` ([MDN, Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)).
- **Long text cuts off in Chrome** with Google's network voices after about 15 seconds, with no `end` event ([Chromium issue 679437](https://bugs.chromium.org/p/chromium/issues/detail?id=679437); discussion in [phetsims/utterance-queue#60](https://github.com/phetsims/utterance-queue/issues/60)). Fix: speak a step sentence by sentence.
- **Privacy.** A voice with `localService: false` (Chrome's "Google …" voices) sends the text to a server. It is only recipe text, but prefer `localService: true` voices when one exists for the language.
- Like the chime, speech should start from a tap. Turning the speaker on is that tap.

---

## Voice commands: the options

| | `expo-speech-recognition` (jamsch) | `@react-native-voice/voice` | `react-native-vosk` | Picovoice Porcupine / Rhino | `whisper.rn` | `react-native-executorch` |
|---|---|---|---|---|---|---|
| What it is | Expo module over Apple's `SFSpeechRecognizer` and Android's `SpeechRecognizer` | Old RN wrapper of the same OS recognizers | Offline Kaldi models in the app | Wake word / speech-to-intent engines | whisper.cpp on the device | Software Mansion's on-device AI models |
| Works with our SDK 54 | Yes, via `expo-speech-recognition@sdk-54` (3.1.3). Newer majors match SDK 56/57/58 | Unclear. No Expo plugin, no New-Arch work since 2022 | Not checked | Needs RN ≥ 0.73 (OK) | Not checked | **No**: needs `react-native >= 0.83` (we have 0.81.5) |
| On-device | iOS: `requiresOnDeviceRecognition`. Android: `requiresOnDeviceRecognition` or `com.google.android.as`, model download | Depends on the OS default | Always | Always | Always | Always |
| Continuous listening | `continuous: true`. Android 13+ only | Restart loop | Yes | Yes (wake word) | No. Records chunks, you add voice detection | Depends on model |
| Command words | Free text, bias with `contextualStrings` | Free text | Can limit to a word list | Built for it | Free text | Free text |
| en / he / ar / es / ru | Whatever the OS has. iOS on-device dictation lists all five ([Apple](https://www.apple.com/ios/feature-availability/)); Android depends on the phone | Same as OS | **No Hebrew.** Arabic only as a 318 MB model ([Vosk models](https://alphacephei.com/vosk/models)) | **No Hebrew, Arabic or Russian** ([Porcupine docs](https://picovoice.ai/docs/porcupine/)) | All five | Varies |
| Cost / size | Free, no models in the app | Free | 40–318 MB per language | Needs an AccessKey; commercial licence | 75 MB+ model per download; heavy CPU | Large models |
| Maintenance | 700 stars, 54 open issues+PRs, last release 58.0.1 on 2026-10-29, MIT | **Archived.** Last release 3.2.4 on 2022-05-11 | 100 stars, last release 2.2.0 on 2026-11-09 | Active | Active (0.7.4) | Active |
| Verdict | **Recommended** | Rejected | Rejected (Hebrew) | Rejected (languages, licence) | Fallback only | Later, after an SDK upgrade |

Sources for the table: [expo-speech-recognition README](https://github.com/jamsch/expo-speech-recognition), [its releases](https://github.com/jamsch/expo-speech-recognition/releases), [react-native-voice/voice](https://github.com/react-native-voice/voice), [react-native-vosk](https://github.com/riderodd/react-native-vosk), npm registry entries for each package.

Writing our own Expo module over the same OS APIs (or Apple's newer `SpeechAnalyzer`, [Apple docs](https://developer.apple.com/documentation/speech/speechanalyzer)) is possible, but `expo-speech-recognition` already does the work, so I don't recommend it.

### `expo-speech-recognition` in detail

From the [README](https://github.com/jamsch/expo-speech-recognition):

- **Config plugin** `"expo-speech-recognition"` with `microphonePermission`, `speechRecognitionPermission` and `androidSpeechServicePackages`. It adds package visibility for Google's speech app to the Android manifest. It needs a dev build; it does not run in Expo Go.
- **Install per SDK:** `npm install expo-speech-recognition@sdk-54` for SDK 54, `@^57.0.0` for SDK 57. The maintainer says to use the matching tag: someone on SDK 54 with 57.1.0 got an iOS crash on any screen that imported the module ([issue #185](https://github.com/jamsch/expo-speech-recognition/issues/185)).
- **`start()` options** we'd use: `lang`, `interimResults`, `continuous`, `requiresOnDeviceRecognition`, `contextualStrings`, `iosTaskHint` (`"confirmation"` helps short words), `iosVoiceProcessingEnabled`, `androidIntentOptions`, `androidRecognitionServicePackage`.
- **Events:** `start`, `end` (always last), `result`, `nomatch`, `error`, `speechstart`, `volumechange`.
- **On-device checks:** `supportsOnDeviceRecognition()`, `getSupportedLocales()` (not on Android 12 and below), `androidTriggerOfflineModelDownload({ locale })`. On Android 13+ often no on-device locale is installed yet, so the app must offer the download.
- **Permissions:** `requestMicrophonePermissionsAsync()` for the mic only (enough for on-device), `requestSpeechRecognizerPermissionsAsync()` (iOS) for network recognition.
- **Continuous on Android:** "Not supported on Android 12 and below." On Android 13+ `continuous` also avoids the start/stop beep. On iOS 17 and earlier, recognition stops after about 3 seconds of silence.
- **Short words:** the README says single words can be slow to appear. It suggests `iosTaskHint: "confirmation"`, `EXTRA_LANGUAGE_MODEL: "web_search"` on Android, and on-device recognition.

Known problems that matter to us:
- **Android minified release builds failed** to start recognition before 56.0.4 ([PR #174](https://github.com/jamsch/expo-speech-recognition/issues/174)). We minify. The `sdk-54` build (3.1.3) is older than that fix, and the fix uses newer Expo Modules tooling. Plan a keep rule in `extraProguardRules` and test a `preview` (release) APK on a phone.
- **iOS silently falls back to Apple's servers** when `requiresOnDeviceRecognition` is set but the language has no on-device model ([issue #169](https://github.com/jamsch/expo-speech-recognition/issues/169), open; this is also Apple's documented behaviour, [Apple docs](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)). We must check `supportsOnDeviceRecognition()` for the locale ourselves before starting.
- **iOS 26.4 simulator:** "Recognizer is unavailable" ([issue #145](https://github.com/jamsch/expo-speech-recognition/issues/145), open). The maintainer says older simulators work. So the simulator is not a reliable test.
- **Continuous on iOS stops after a few minutes** with the network recognizer; the maintainer suggests on-device ([issue #81](https://github.com/jamsch/expo-speech-recognition/issues/81)). Apple documents a one-minute limit and daily limits for the network service ([SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer)). We restart on `end` anyway.
- **Android `stop()` in continuous mode** can end with `ERROR_CLIENT` instead of a final result ([#165](https://github.com/jamsch/expo-speech-recognition/issues/165), [#158](https://github.com/jamsch/expo-speech-recognition/issues/158)). Harmless for commands: we act on interim results and ignore that error.
- **Audio session:** the module sets iOS to `playAndRecord`, `defaultToSpeaker`, `allowBluetooth`, mode `measurement`, and warns that apps playing audio may hit issues. It offers `setCategoryIOS()` and the `iosCategory` start option.

---

## Listening while the app talks

**Echo.** The phone speaker sits next to the mic. If the app reads "…then go back to the pan" while listening, it may hear its own "back" and skip a step.
- iOS: `iosVoiceProcessingEnabled` turns on Apple's echo cancelling, "to prevent microphone feedback from speakers". It may switch the session to `voiceChat` and lower the speaker volume. iOS only. ([README](https://github.com/jamsch/expo-speech-recognition); request in [issue #80](https://github.com/jamsch/expo-speech-recognition/issues/80))
- Android: the module has no echo option.

**Plan: take turns ("half duplex").** Stop listening when speech starts (`Speech.speak` → `onStart`), start again on `onDone` / `onStopped`. Do the same around a timer chime on web. Also ignore a result that arrives within ~300 ms of the app's own speech ending. The cost: you can't say "next" over the app's voice; you wait for the step to finish, or tap. This works the same on both platforms and needs no echo cancelling. Try `iosVoiceProcessingEnabled` on a device later, as an extra.

**Screen staying awake.** Recognition only runs while the app is in front. Cook mode already keeps the screen on (`useKeepAwake`, Wake Lock on web), so listening isn't cut by the screen locking. Stop listening when the app goes to the background (`AppState`) or the tab is hidden (`visibilitychange`), and when cook mode closes.

**Timers.** Mobile timers make no sound today. With read-aloud on, speak "Timer's up" when one ends (and stop listening for that moment). On web the chime plays, then the spoken line, then listening resumes.

**Battery.** Google says Android's `SpeechRecognizer` "is not intended to be used for continuous recognition, which would consume a significant amount of battery and bandwidth" ([Android docs](https://developer.android.com/reference/android/speech/SpeechRecognizer)). Apple says recognition "places a relatively high burden on battery life" ([SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer)). On-device removes the network part but not the mic and the model. Limits:
- Listen only while cook mode is open and in front.
- Turn listening off after 10 minutes with no command, with a "Tap to keep listening" note.
- Never listen by default; it's a switch.
A 30-minute battery test on a real phone is part of phase 2.

**Screen readers.** With VoiceOver or TalkBack on, the existing `announce()` and the web `aria-live` region already read each step. If read-aloud also speaks, people hear it twice. Skip `announce()` for steps while read-aloud is on (mobile). On web, keep the live region but leave read-aloud off by default.

---

## Web: the Web Speech API

| | Chrome desktop | Edge desktop | Chrome Android | Safari (macOS, iOS) | Firefox desktop | Firefox Android |
|---|---|---|---|---|---|---|
| `speechSynthesis` (read aloud) | Yes | Yes | Yes | Yes | Yes | Yes |
| `SpeechRecognition` | 139+ (prefixed since 33) | Same as Chrome | Same as Chrome | `webkitSpeechRecognition`, 14.1+ | **160+** | No |
| On-device (`processLocally`) | **Yes, 139+** | **Yes, 139+** | **No** | No | **Yes, only on-device** | No |
| `continuous` | Yes | Yes | "can be set, but has no effect" | 17+ | Yes | No |

Sources: [MDN browser-compat data for SpeechRecognition](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json), [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [New in Chrome 139](https://developer.chrome.com/blog/new-in-chrome-139), [Chrome intent to ship (Android and ChromeOS not supported)](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM), [Firefox 160 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/160), [WebKit, Safari 14.1](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/).

Where the audio goes:
- **Default (Chrome, Edge):** MDN: "On some browsers, speech recognition uses a server-based recognition engine by default. Your audio is sent to a web service." ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition))
- **On-device:** set `recognition.processLocally = true`. Check with `SpeechRecognition.available({ langs, processLocally: true })`, which returns `available`, `downloadable`, `downloading` or `unavailable`. Install with `SpeechRecognition.install(...)`, a one-time language pack. If the pack is missing, `start()` fails with `service-not-allowed`. ([MDN guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API))
- **Firefox 160:** "on-device real-time speech-to-text conversion in 40 languages. Recognition is not supported on Android, and neither is remote (cloud) recognition." ([Firefox 160](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/160)) It does not say which 40.
- **Safari:** "powered by the same speech engine as Siri", needs Siri turned on. It doesn't say whether audio leaves the device. ([WebKit](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/))
- **Brave** reported `available()` saying `downloading` forever ([brave-browser#55414](https://github.com/brave/brave-browser/issues/55414)). We must handle a download that never finishes.

**Suggestion:** offer voice commands on web only when `available({ processLocally: true })` is `available` (or after a successful `install()`). That means laptops on the counter with Chrome, Edge or Firefox. Hide the mic button elsewhere. The privacy promise ("listening stays on this device") is then the same as on mobile.

---

## Privacy text

- **App Store.** Apple: "Data that is processed only on device is not 'collected' and does not need to be disclosed." "Audio Data" is "The user's voice or sound recordings." ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)) On-device only → no new label. If we ever allow Apple's server recognizer, Apple's own docs say audio goes to Apple's servers ([Asking permission](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)); then we'd review the label.
- **Info.plist.** Apple requires `NSSpeechRecognitionUsageDescription` "regardless of whether you set `requiresOnDeviceRecognition`", or the app crashes on the authorization call ([Asking permission](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)). Plus `NSMicrophoneUsageDescription`. The plugin writes both from its options. Apple's example strings fit us: "Lets you mark an item as finished by saying Done."
- **Google Play.** "Collect" means "transmitting data from your app off a user's device". Data "only processed locally on the user's device and not sent off device" need not be disclosed. "Voice or sound recordings" is the data type if it ever leaves. ([Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)) On-device only → no change. `RECORD_AUDIO` is added by the plugin.
- **Our privacy policy** (`src/lib/legalDocs.ts` and the site's legal pages) should still say in one line that cook mode can use the microphone, that listening happens on the phone, and that nothing is recorded or sent.
- **Permission prompts are English only.** `app.json` has no `locales`, so the camera and photo prompts are English too. Not new, but Hebrew users will see an English mic prompt.

Suggested strings:
- Microphone: "Pinch listens for “next”, “back” and “repeat” while you cook, so you don't have to touch the screen. Listening stays on your phone."
- Speech recognition: "Pinch turns what you say in cook mode into “next”, “back” and “repeat”. It works on your phone and nothing is recorded."

---

## Implementation plan

### Phase 1: read aloud (build now)

**UI**
- A speaker toggle in the cook-mode header, at the end side: `volume-high-outline` / `volume-mute-outline` (Ionicons) on mobile, `Volume2` / `VolumeX` (lucide) on web, `aria-pressed` / `accessibilityState.selected`.
- Turning it on reads the current step at once. Each Next or Back stops the old speech and reads the new step. The "That's it" screen reads its line.
- Tapping the speaker while it reads stops it (and leaves it on for the next step). A long press, or a "Read again" item, repeats. Web also gets the `R` key for repeat.
- The choice is remembered on the device (`pinch:cookReadAloud`), off by default.
- If there's no voice for the recipe's language, the button is disabled with a tooltip/note: "No Hebrew voice on this device". Never read Hebrew text with an English voice.
- On iOS, the first time, a one-line note: "Can't hear it? Turn off silent mode." (Unless the device test shows `useApplicationAudioSession: false` gets around it.)

**Language and voice**
- Speak in the **recipe text's language** (`contentLanguage`, which follows a translation the user picked), not the app language. Fall back to the app language when the recipe has none.
- Map codes to BCP 47: en → `en-US`, he → `he-IL`, ar → `ar` (no country, let the OS choose), es → `es-ES`, ru → `ru-RU`, de → `de-DE`, fr → `fr-FR`.
- Pick a voice: same language (treat `iw` as `he`), prefer `Enhanced` quality on mobile and `localService` on web, then the platform default.
- Read the step label too ("Step 2 of 6.") in the **app** language only when it matches the recipe language; otherwise read only the step text, so one voice reads it all.

**Files**

Shared (pure, tested, no platform code, per `shared/README.md`):
- `shared/lib/readAloud.ts` (new): `speechLanguageTag(code)`, `pickVoice(voices, code)` over a small `{ id, language, quality?, local? }` shape, `splitForSpeech(text)` (sentences, max ~200 characters, for Chrome's cut-off and Android's input limit).
- `shared/lib/readAloud.test.ts` (new).

Mobile:
- `package.json`: `npx expo install expo-speech` (→ `~14.0.8` on SDK 54).
- `src/lib/speech.ts` (new): thin wrapper over `expo-speech` (`speakStep`, `stopSpeaking`, `listVoices`), so tests can mock one module.
- `src/hooks/useReadAloudPreference.ts` (new): AsyncStorage, like `useLibraryLayout`.
- `src/components/CookMode.tsx`: new `contentLanguage` prop, the toggle in the header spacer, speak on index change, stop on close and unmount, speak "Timer's up", skip `announce()` for steps while reading aloud.
- `src/components/RecipeView.tsx`: pass `contentLanguage`.
- Tests: a `CookMode` test with `expo-speech` mocked (`vitest-native`).

Web:
- `web/lib/cook/useReadAloud.ts` (new): `speechSynthesis` wrapper. Waits for `voiceschanged`, `cancel()` before each step, queues sentences, stops on close, `pagehide` and `visibilitychange`.
- `web/lib/cook/useReadAloudPreference.ts` (new): `localStorage`, same key as mobile.
- `web/components/cook/CookMode.tsx`: the `IconButton` toggle in the header, `R` to repeat, speak the timer-done line after the chime.
- `web/lib/cook/cookModeKeys.ts` (+ test): add `"repeat"` for `R`.
- Tests: `useReadAloud.test.ts` with a fake `speechSynthesis`; extend `CookMode.test.tsx`; extend `web/e2e/cook.spec.ts` with an `addInitScript` stub that records what was spoken; screenshots in all combos.

Strings, in all five `shared/i18n/locales/*.ts` files (the locale test enforces it):
- `recipe.cookModeReadAloud`: "Read steps aloud"
- `recipe.cookModeStopReading`: "Stop reading"
- `recipe.cookModeReadAgain`: "Read again"
- `recipe.cookModeNoVoice`: "No {{language}} voice on this device"
- `recipe.cookModeSilentHint`: "Can't hear it? Turn off silent mode."
- `web.cook.repeatKeyHint`: "R reads the step again" (or fold into `keysHint`)

**What can be checked without a phone**
- Everything on web: unit tests, Playwright with a stubbed `speechSynthesis`, screenshots, and listening in real Chrome and Edge on this Windows PC (Hebrew needs a Hebrew voice installed in Windows).
- Mobile: unit tests, typecheck, `npx expo export -p android` and `-p ios`.
- Mobile with an Android emulator and a dev build: the voice plays if the emulator image has Google TTS.

**What needs a phone**
- iOS silent switch and `useApplicationAudioSession`.
- Which Hebrew, Arabic and Russian voices real phones have, and how they sound.
- All of this needs a new dev build (EAS) and, to ship, a store build.

### Phase 2: voice commands (after Yarden's decisions and a device test)

**Native setup**
- Install the version matching our SDK: `npm install expo-speech-recognition@sdk-54` today (3.1.3), or `@^57` / `@^58` after an SDK upgrade. Never mix (issue #185).
- `app.json` plugins:
  ```json
  ["expo-speech-recognition", {
    "microphonePermission": "Pinch listens for “next”, “back” and “repeat” while you cook…",
    "speechRecognitionPermission": "Pinch turns what you say in cook mode into “next”, “back” and “repeat”…"
  }]
  ```
  Add `androidSpeechServicePackages` only if testing shows we need the on-device service listed.
- Android minify: add a keep rule for the module's package to `extraProguardRules` in `expo-build-properties` (exact package name from the installed module), because 3.1.3 predates the R8 fix.
- New dev build for both platforms, then a `preview` (release, minified) APK and a TestFlight build to test on phones.
- Check without a phone: `npx expo config --type introspect` shows the Info.plist keys and `RECORD_AUDIO`; the two `expo export` runs pass.

**Command matching (shared, pure, tested)**
- `shared/lib/voiceCommands.ts` (new): `matchVoiceCommand(transcript, language) → "next" | "back" | "repeat" | "stop" | null`. Lower-case, strip punctuation, Hebrew niqqud and Arabic tashkeel, look at the last one or two words, so "okay, next" works and a long sentence doesn't.
- Word lists (to check with native speakers):
  - en: next, back / previous, repeat / again, stop
  - he: הבא / הלאה, אחורה / הקודם, שוב / עוד פעם, עצור / די. **Not "חזור"**: it means both "go back" and "repeat".
  - ar: التالي, السابق / رجوع, كرر / مرة أخرى, توقف
  - es: siguiente, atrás / anterior, repite / otra vez, para
  - ru: дальше / следующий, назад, повтори / ещё раз, стоп
- Pass the same words as `contextualStrings`.

**Mobile hook and UI**
- `src/hooks/useVoiceCommands.ts` (new):
  1. On first use, a short sheet: what it does, "listening stays on your phone", Turn on.
  2. Check `supportsOnDeviceRecognition()` and the locale in `getSupportedLocales()`. On Android, offer `androidTriggerOfflineModelDownload`. If on-device isn't possible, explain and don't start (unless Yarden allows the network recognizer).
  3. `requestMicrophonePermissionsAsync()`.
  4. `start({ lang, continuous: true, interimResults: true, requiresOnDeviceRecognition: true, contextualStrings, iosTaskHint: "confirmation" })`.
  5. Act on the first matching interim result, then ignore results for ~1 s (no double steps).
  6. Restart on `end`. Stop while the app speaks, restart on `onDone`. Stop on close, background, and after 10 idle minutes.
- Android 12 and below: no `continuous`. Either turn the feature off there (`Platform.Version < 33`) or restart after every result and live with the beep (open question).
- `src/components/CookMode.tsx`: a mic toggle next to the speaker, a small "Listening…" pill with a level from `volumechange`, a hint line "Say “next”, “back” or “repeat”", and error notes.
- Strings: the sheet, the hint, the pill, the errors ("Voice commands need a language download", "Microphone is off in Settings", "Voice commands don't work in {{language}} on this phone").

**Web**
- `web/lib/cook/useVoiceCommands.ts`: `SpeechRecognition` with `processLocally = true`, `available()` / `install()`, the same shared matcher, the same turn-taking with `speechSynthesis` and the chime.
- Show the mic button only when on-device is available.

**What can be checked without a phone**
- The matcher (unit tests in all five languages).
- The hook's state machine with the module mocked (start, restart on end, pause during speech, idle stop).
- The config (`expo config --type introspect`), the exports, typecheck.
- Web in desktop Chrome or Edge on this PC: real on-device recognition with the PC's mic.

**What needs a phone (iPhone and Android, ideally both older and newer OS versions)**
- On-device availability for he, ar, es, ru, en on each phone, and the Android model download flow.
- That a release (minified) Android build starts recognition.
- Echo: does the phone hear its own voice or the chime; does turn-taking work; does `iosVoiceProcessingEnabled` help.
- Kitchen noise: extractor fan, running tap, a sizzling pan, music.
- Battery over a 30-minute cook with the screen on.
- Short words in each language, and Hebrew and Arabic accuracy.
- The iOS simulator is not enough (issue #145).

---

## Risks

1. **SDK mismatch.** We're on SDK 54; the module's fixes since April 2026 are only in the 56+ builds. The worst one for us is the Android release-build failure. Mitigation: keep rule plus a release APK test, or upgrade the SDK first.
2. **Silent network fallback on iOS** (#169) breaks the privacy promise. Mitigation: check `supportsOnDeviceRecognition()` per locale ourselves before every start.
3. **Hebrew and Arabic on Android.** Whether Google's on-device recognizer has them varies by phone and Android version. We can only find out on devices. The feature may be English-and-Spanish-only on some phones.
4. **Self-triggering** from the app's own voice. Mitigation: turn-taking and a short ignore window.
5. **Battery and heat** on a long cook. Mitigation: listen only when switched on, idle stop.
6. **iOS silent switch** makes read-aloud seem broken. Mitigation: device test, then a hint.
7. **Chrome cuts long speech** (~15 s). Mitigation: speak by sentence.
8. **Double speech** with VoiceOver/TalkBack. Mitigation: skip `announce()` while reading aloud.
9. **Wrong command words**, like Hebrew "חזור". Mitigation: native-speaker review of the lists.
10. **Store review.** A new mic permission draws attention. Mitigation: clear strings, ask only when the user turns voice on.

---

## Open questions for Yarden

1. **SDK.** We're on SDK 54, and `AGENTS.md` says 57. Upgrade Expo before phase 2, or ship voice commands with the older `sdk-54` build of the module?
2. **Command language.** Listen in the app language, in the recipe's language, or both? (Someone reading an English recipe in a Hebrew app probably says "הבא".)
3. **No on-device model.** When a phone can't recognise a language on the device, hide voice commands, or allow Apple's / Google's servers with a clear note?
4. **Android 12 and below.** Turn voice commands off there, or allow a restart loop with a beep after every word?
5. **Web.** Voice commands only where they run on the device (desktop Chrome, Edge, Firefox), or also Safari and Chrome on Android, which may use a server?
6. **Read aloud defaults.** Off by default and remembered per device, as proposed? Do you want a speed control?
7. **Devices.** Which iPhone and Android phones (and OS versions) can we test on, and can a Hebrew and an Arabic speaker try it?
8. **Ship order.** Ship phase 1 in the next store build on its own (it needs a new build anyway), or wait and ship both together?
9. **Expo web app (`/app`).** It's being replaced, so I'd leave it out. OK?

---

## Sources

Expo
- [expo-speech, SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/speech/)
- `node_modules/expo/bundledNativeModules.json` in this repo (SDK 54 versions: `expo-speech ~14.0.8`)

Speech recognition modules
- [expo-speech-recognition README](https://github.com/jamsch/expo-speech-recognition) and [releases](https://github.com/jamsch/expo-speech-recognition/releases)
- Issues: [#80 echo](https://github.com/jamsch/expo-speech-recognition/issues/80), [#81 iOS continuous stops](https://github.com/jamsch/expo-speech-recognition/issues/81), [#145 iOS 26.4 simulator](https://github.com/jamsch/expo-speech-recognition/issues/145), [#158](https://github.com/jamsch/expo-speech-recognition/issues/158) and [#165 Android stop](https://github.com/jamsch/expo-speech-recognition/issues/165), [#169 silent network fallback](https://github.com/jamsch/expo-speech-recognition/issues/169), [#174 minified release builds](https://github.com/jamsch/expo-speech-recognition/issues/174), [#185 SDK 54 crash with 57.x](https://github.com/jamsch/expo-speech-recognition/issues/185)
- [@react-native-voice/voice (archived)](https://github.com/react-native-voice/voice)
- [react-native-vosk](https://github.com/riderodd/react-native-vosk), [Vosk models](https://alphacephei.com/vosk/models)
- [Picovoice Porcupine docs](https://picovoice.ai/docs/porcupine/)
- npm registry: `expo-speech`, `expo-speech-recognition`, `@react-native-voice/voice`, `react-native-vosk`, `@picovoice/porcupine-react-native`, `whisper.rn`, `react-native-executorch`

Apple
- [SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer)
- [requiresOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)
- [Asking permission to use speech recognition](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)
- [SpeechAnalyzer](https://developer.apple.com/documentation/speech/speechanalyzer)
- [iOS feature availability (on-device dictation languages)](https://www.apple.com/ios/feature-availability/)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)

Google
- [Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)

Web
- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- MDN browser-compat data: [SpeechRecognition](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json), [SpeechSynthesis](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesis.json)
- [New in Chrome 139](https://developer.chrome.com/blog/new-in-chrome-139), [Intent to Ship: On-device Web Speech API](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM)
- [Firefox 160 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/160)
- [WebKit: Safari 14.1 features](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/)
- [Chromium issue 679437 (long speech cut off)](https://bugs.chromium.org/p/chromium/issues/detail?id=679437), [phetsims/utterance-queue#60](https://github.com/phetsims/utterance-queue/issues/60)
- [brave-browser#55414](https://github.com/brave/brave-browser/issues/55414)
