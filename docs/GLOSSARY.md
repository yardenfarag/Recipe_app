# ChopChop Glossary

Canonical language for the ChopChop recipe-snapping app. All specs, ADRs, and code comments should use these terms consistently.

## Core Concepts

**Snap**:
The act of sending a social-media video URL to ChopChop so the app can extract a structured recipe from it.
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
The ordered sources the Edge Function fetches before calling Gemini: video transcript → post description → top 10 comments.
_Avoid_: Scrape order, fetch pipeline

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
A Supabase serverless function that handles URL scraping and Gemini API calls. Keeps API keys off the client.
_Avoid_: Backend, server (use those in conversation; "Edge Function" in architecture docs)

**Development build**:
A custom native binary (via EAS Build or `expo run`) required for features like the native Share Sheet target. Cannot run in Expo Go.
_Avoid_: Custom build, dev client (dev client is the JS side; dev build is the native binary)

**Expo Go**:
The pre-built Expo sandbox app for rapid JS iteration. Sufficient for MVP screens, auth, and paste-URL flow.
_Avoid_: Expo app, simulator

**Guest save**:
A recipe saved locally on device without an account, counting toward the 3-recipe quota before sign-up is required.
_Avoid_: Anonymous recipe, temp save

**Save quota**:
The limit of 3 guest saves per device. Attempting a 4th save triggers the sign-up prompt.
_Avoid_: Free trial, usage limit

## Platforms

**Platform stage**:
A rollout phase for URL extraction support. Order: YouTube (2a) → Instagram (2b) → TikTok (2c).
_Avoid_: Phase, sprint

**Coming soon state**:
The UX shown when a user Snaps a URL from a platform not yet supported — clear message, no fake data.
_Avoid_: Error screen, unsupported error
