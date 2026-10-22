# Pinch Glossary

Canonical language for the Pinch recipe-snapping app. All specs, ADRs, and code comments should use these terms consistently.

## Core Concepts

**Snap**:
The act of sending a social-media video URL to Pinch so the app can extract a structured recipe from it.
_Avoid_: Scan, import, capture

**Fork it!**:
The primary action button on the Add Recipe screen that kicks off URL processing and AI extraction.
_Avoid_: Extract, Process, Go

**Recipe Library**:
The user's personal gallery of saved, AI-extracted recipes stored in Supabase.
_Avoid_: Cookbook, Collection, Feed

**Extraction**:
The AI pipeline that converts raw social-media content (description, transcript, comments) into a structured recipe JSON object.
_Avoid_: Parsing, scraping (use "scraping" only for the server-side content-fetch step)

**Content ladder**:
The order the Edge Function tries sources in: all text first (description, top comments, captions) in one model call, then the video only if the text gave a partial recipe.
_Avoid_: Scrape order, fetch pipeline

**Appliance**:
A piece of kitchen equipment a recipe uses (oven, blender, stand mixer…), from a fixed list of keys. Each one on a recipe is marked **required** (no workaround) or **optional** (helps, but there's a workaround). A recipe's appliance list is either "not analysed" (older recipes; nothing shown) or a list, which may be empty. See ADR 017.
_Avoid_: Tools, gadgets, equipment (in code)

**Partial result**:
An extraction outcome where some recipe fields are present (e.g. ingredients but no steps). Shown with an incomplete banner; still saveable.
_Avoid_: Incomplete recipe, half extraction

## Recipe Data

**Ingredient**:
A single recipe component with a name, quantity, and unit. Stored as JSONB in Supabase.
_Avoid_: Item, component

**Serving scale**:
Client-side logic that recalculates ingredient quantities when the user changes the number of servings. Not an AI concern.
_Avoid_: Portion resize, multiplier

**Substitution**:
An AI-suggested alternative ingredient when the user doesn't have the original. Triggered on demand per ingredient via a full-screen modal.
_Avoid_: Swap, replacement (acceptable in UI copy, not in code identifiers)

**Substitution modal**:
The full-screen view showing 2–3 AI alternatives with quantities and a "why this works" note. Opened from the Swap button on an ingredient row.
_Avoid_: Swap sheet, replace dialog

**Effort level**:
One of `Easy`, `Medium`, or `Hard` — an AI-estimated cooking difficulty rating.
_Avoid_: Difficulty, complexity

**Cost estimate**:
A 1–3 tier rating stored as `$`, `$$`, or `$$$` in the database. Display is localized by device region (e.g. `₪₪` for Israeli users). Not a precise dollar amount.
_Avoid_: Price, budget

## Technical

**Edge Function**:
A Supabase serverless function that handles URL scraping and AI model calls (through OpenRouter, one model per task; ADR 015). Keeps API keys off the client.
_Avoid_: Backend, server (use those in conversation; "Edge Function" in architecture docs)

**Development build**:
A custom native binary (via EAS Build or `expo run`) required for features like the native Share Sheet target. Cannot run in Expo Go.
_Avoid_: Custom build, dev client (dev client is the JS side; dev build is the native binary)

**Expo Go**:
The pre-built Expo sandbox app for rapid JS iteration. Sufficient for MVP screens, auth, and paste-URL flow.
_Avoid_: Expo app, simulator

**Guest extract**:
An extraction run without an account (up to 3 per install). Guests cannot save; sign-up is required to keep recipes.
_Avoid_: Anonymous recipe, temp save

**Extract quota**:
Signed-in users get 10 free extracts per UTC calendar month, then spend purchased recipe credits (Pinch Plus is retired). Guests can't extract.
_Avoid_: Free trial, save quota

## Platforms

**Platform stage**:
A rollout phase for URL extraction support. Order: YouTube (2a) → Instagram (2b) → TikTok (2c).
_Avoid_: Phase, sprint

**Coming soon state**:
The UX shown when a user Snaps a URL from a platform not yet supported — clear message, no fake data.
_Avoid_: Error screen, unsupported error

**Task model**:
The AI model a task `kind` runs on, set in `TASK_MODELS` (`supabase/functions/_shared/llmClient.ts`) with a fallback and a reasoning effort. Override one task with the `OPENROUTER_MODEL_<KIND>` secret (ADR 015).
_Avoid_: Tier (the old fast/standard split)
