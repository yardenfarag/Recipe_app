# ADR 031: Ask a few questions before guessing a recipe from a photo

**Status:** Proposed
**Date:** 2026-11-22
**Deciders:** Harel (proposed), Yarden (product)

## Context

In Guess mode (`invent-recipe`), the content gate names one dish (`dish_guess`) and `inventRecipe.ts` writes a recipe from it. When a photo is ambiguous, the model commits to the wrong dish (a fish fillet read as chicken), and the user pays a credit for a confident, wrong recipe.

The gate runs before the credit is reserved, so asking at that point costs nothing and needs no refund if the user walks away.

The grilling session, with every reason in plain English, is `docs/grilling/PIN-64-ask-before-guessing.md` (PIN-64).

## Decision

- **When to ask.** The gate also returns a `confidence` and its top 2–3 candidate dishes. `invent-recipe` asks only when the confidence is below a threshold **and** the candidates would make clearly different recipes (protein, cooking method, sweet vs savoury, cuisine). At most 3 questions; chips come from the candidates, plus "Other" (free text) and "Just guess".
- **Photos only in v1.** Only `platform === 'photo'` can ask. Links keep today's behaviour.
- **One question per screen**, with progress ("1 of 2") and "Just guess" on every step. "Just guess" skips the rest and keeps the answers already given; skipping everything gives today's result.
- **The user wins.** Answers are hard facts in the recipe prompt and override the photo.
- **Only apps that ask for it.** The server returns `needs_clarification` only when the request carries `can_clarify: true`. Phones already in the field know only `full | partial | failed | coming_soon`, and merging deploys the backend at once, so without the flag they would break on the first unclear photo. Without it, the server guesses as today.
- **Stateless round trip.** The first call returns `needs_clarification` with the questions and `dish_guess`, and holds no credit. The second call sends the same photo, the same `request_id`, `already_gated: true`, the first call's `dish_guess` (for the response, so the app's banner keeps it) and `clarifications: [{ question, answer }]`, then runs the normal reserve → finalize or refund flow. `request_id` is used only to reserve the credit in `invent-recipe`, so reusing it is safe, and one photo is one credit.
- **Where the answers go.** The photo recipe writer (`inventRecipeFromImage` in `_shared/recipes/inventRecipe.ts`) identifies the dish from the photo itself and never receives the gate's guess. The answers go into its prompt. With no answers, its prompt is exactly today's.
- **The gate stays the same for everyone else.** `extract-recipe` and `eval/run.ts` also call the content gate. `confidence` and `candidates` are optional, and only Guess with a photo reads them. The gate prompt changes, so the existing gate-route eval is rerun to show `kind` routing didn't move.
- **Untrusted answers.** The server caps `clarifications` (3 pairs, question about 80 and answer about 60 characters), drops invalid items instead of throwing, and quotes them in the prompt as data, never as instructions. The sanitizer lives in `shared/` so both apps and the server agree.
- **Threshold from an eval.** `eval/clarify.ts` with about 20 ambiguous and 20 clear labelled photos. Start at confidence < 0.7, try 0.5–0.8, and keep the value with the most right dishes while clear photos ask 10% of the time or less. The threshold is a constant in `contentGate.ts`.
- **Logging.** `ai_usage_events` metadata records `confidence`, `candidates`, `asked`, `question_count` on the gate, and `answered_count`, `skipped`, `used_other` on the second call.

## Consequences

- No migration and no new table. Old app builds never send `can_clarify`, so they never see `needs_clarification` and keep working.
- The backend can merge first: no app sends `can_clarify` until its question sheet ships.
- The gate prompt and schema change, so this needs an eval run before merge and a redeploy of every function that imports `contentGate.ts` (merging deploys them all).
- The app could send made-up question text. It only steers the user's own recipe, and the caps and quoting stop it from steering the model.
- Both apps need a question sheet: the phone app (`src/`, also the old Expo web app) and the new web app (`web/`). Shared logic goes in `shared/`.

## Still to settle

- Yarden to confirm both apps are in scope for v1.
- The eval photos: about 20 truly ambiguous dish photos with a known real dish, and about 20 clear ones.
