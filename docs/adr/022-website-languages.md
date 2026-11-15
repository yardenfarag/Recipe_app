# ADR 022: The website in the app's languages

**Status:** Accepted
**Date:** 2026-11-15
**Deciders:** Yarden (product)

## Context

The app speaks English, Spanish, Hebrew, Russian and Arabic. The website (the landing page and the guides) only spoke English, so nobody searching in the other four languages could find it or read it (PIN-104).

The site is static HTML on GitHub Pages. There is no server, so nothing can read `Accept-Language` or redirect on the way in.

## Decision

- **One copy of the site per app language.** English stays at `/` and `/guides/<name>/`. Each other language lives under its code: `/es/`, `/he/`, `/ru/`, `/ar/`, with guides at `/<lang>/guides/<name>/`. Guide names in the URL stay in English.
- **The site's languages are the app's languages**, no more. `SITE_LANGUAGES` in `scripts/site-pages.mjs` mirrors `src/lib/appLanguages.ts`, and a test fails if they drift. A language is live once `landing/strings/<lang>.json` exists.
- **Text lives in two places.** Every string of the two templates is a key in `landing/strings/<lang>.json` (`{{t:key}}` in `landing/index.html` and `landing/guide.html`). A guide's translation is `content/guides/<lang>/<name>.md`, under the English file name.
- **English is the fallback.** A missing string is shown in English. A guide with no translation builds no page in that language, and links to it go to the English guide.
- **Nobody is redirected.** A visitor always gets the page they asked for. When the browser's language is one we have and the page is in another, a slim banner above the page offers that version, written in the visitor's language. It is hidden in the HTML and shown by an inline script before the page paints, so it does not shift the layout and crawlers never see it. Dismissing it, or picking a language, is remembered in `localStorage` (`pinch:site-language`) and the banner stays away.
- **A language menu on every page**, made of real links inside a `<details>`, so it works without JavaScript and crawlers can follow it to every version.
- **Every page lists its other versions** with `hreflang` (English as `x-default`), and so does `sitemap.xml`. Each page declares its own language and direction in `<html lang dir>`, its canonical URL, its Open Graph tags and its structured data.
- **Hebrew and Arabic pages are right to left.** `landing/site.css` uses logical properties, and the few arrows flip under `[dir="rtl"]`.
- **Translations are committed files.** Nothing calls a model at build time or at runtime. They were written by a top-tier model (Claude) against the app's own strings, so feature names match the app, and every file was then judged against the English by a second model and corrected.
- **Translations must not go stale without anyone noticing.** A translated guide records the English guide's date it was translated from (`sourceUpdated`). A test fails when the English `updated` moves past it, and another when a strings file stops matching `en.json` key for key.
- **"Pinch" and "Pinch: Recipe Library" stay in English** everywhere, and so do the images (the app screenshot and the share image).
- **The legal pages stay in English.**

## Considered options

- **Redirect a first-time visitor to their browser's language.** It is what the visitor probably wants, but Google advises against automatic language redirects, and a visitor who followed a link to the English page would land somewhere else. The banner gets the same result with one click and no surprise.
- **One page that swaps its text with JavaScript.** One URL per page is simpler, but search engines and AI assistants would only ever see English, which is the problem this solves.
- **A full hand-edited copy of the HTML per language.** No template work, but five copies of a 700-line page drift apart at the first edit.
- **Translate with the app's translation model (`openai/gpt-6.1-sol`).** It is tuned for cost and speed on recipes. This is about 7,000 words per language, translated once, so cost does not matter. In a blind comparison of one Hebrew guide, the Sol version had several grammar errors and the Claude version had none.
- **Translated guide names in the URL.** A little better for search in each language, but every cross-link and `hreflang` pair would need a lookup table. Not worth it yet.
- **More languages than the app has.** More reach, but the site would promise a language the app cannot speak.

## Consequences

### Positive

- 45 pages instead of 9: the landing page and all 8 guides in five languages, each one findable and citable in its own language.
- Adding a language is two steps: a strings file and a folder of guides. The build, the menu, the banner, `hreflang` and the sitemap pick it up.

### Negative

- A change to an English guide now means retranslating it four times, and the test will insist.
- Other apps' button names (TikTok, Instagram, YouTube) in the translated guides were written from memory of those apps, not checked on a phone in each language.
- A native speaker has not read the Spanish, Russian or Arabic.
- Where the app's own strings are odd, the site repeats them so the two match. The Arabic app uses dialect for some buttons, and "Recipe preferences" is named after how recipes are shown in all four languages.
