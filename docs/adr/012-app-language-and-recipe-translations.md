# ADR 012: App language + recipe translation cache

**Status:** Accepted  
**Date:** 2026-07-26  
**Deciders:** Yarden (product)

## Context

Users need the app and recipes in their language (English, Spanish, Hebrew, Russian, Arabic). Device locale should set a sensible default; Settings must allow overrides. Existing Gemini `translate-recipe` is free of extract quota and already supports these languages plus German/French for one-off recipe translation.

Previously, applying a translation could overwrite canonical `recipes` columns via `onContentChange`, destroying the source text.

## Decision

### Preference

- Local AsyncStorage key `pinch:appLanguage` (`en | es | he | ru | ar`)
- Default from `expo-localization` `getLocales()[0].languageCode`; unsupported → `en`
- Same preference drives UI catalogs (i18next) and automatic recipe display language
- German/French remain available only in the per-recipe translate modal (no UI catalogs)

### Canonical vs cache

- `recipes.title` / `ingredients` / `instructions` stay in the **source** language
- `recipes.source_language` records that language (default `en` for Gemini extract)
- `recipe_translations` stores overlays per `(recipe_id, language_code)` with RLS matching recipe ownership
- Guest recipes store overlays in an in-memory/AsyncStorage `translations` map
- Remix / swap / content edits update canonical fields and **invalidate** translation caches

### When we translate

1. **Eager:** after extract/preview display, and again at save if preferred ≠ source and no overlay yet
2. **Lazy:** on open of an existing recipe if cache miss
3. Soft-fail to source language with an alert; manual modal can retry
4. Translate remains free of product extract quota (`tokensCharged: 0`)

### RTL

- Recipe body RTL already follows active recipe language (`he` / `ar`)
- App chrome RTL via `I18nManager` when preferred language is `he` or `ar`; Settings prompts reload when crossing LTR/RTL boundary

## Consequences

### Positive

- Source recipes remain recoverable
- Reopening a recipe in the same language is free (cache hit)
- One Settings control for UI + recipes

### Negative / Trade-offs

- First open in a new language costs a Gemini call and a short wait
- Full native RTL may require app reload
- Library titles show translated title only after a cache exists for that language
