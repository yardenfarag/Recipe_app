# PIN-64: Ask a few questions before guessing a recipe

**Ticket:** [PIN-64](https://linear.app/pinch-recipe/issue/PIN-64/ask-up-to-3-quick-questions-before-guessing-a-recipe-when-the-dish-is)
**Started:** 2026-11-22
**Who decides:** Harel, reviewed by Yarden
**Status:** All decisions made (2026-11-22). Written up as [ADR 031](../adr/031-ask-before-guessing.md). This file keeps the reasons.

This file is the plain-English record of what we decided and why. If you forget how the questions work or why we chose something, start here.

---

## The goal

When Snap is in Guess mode and the photo could be more than one dish (a fish fillet that looks like chicken), Pinch asks the user up to 3 short questions before it writes the recipe. Clear photos still get a recipe with no questions. Asking never costs a credit.

---

## How it works today (before this ticket)

| Step | Where | What happens |
|---|---|---|
| 1. Content gate | `runContentGate` in `supabase/functions/_shared/extraction/contentGate.ts`, called from `invent-recipe/index.ts` | One model call returns `kind` (`plated_dish`, `written_recipe`, `mixed`, `unrelated`) and one `dish_guess`. Free, with its own daily limit. |
| 2. Reject non-food | `invent-recipe/index.ts` | `unrelated` returns `not_food` with no charge. |
| 3. Reserve a credit | `reserveSignedInExtract` / `reserveGuestExtraction` | The credit is held. |
| 4. Write the recipe | `_shared/recipes/inventRecipe.ts` | The recipe is written from the single `dish_guess`. |
| 5. Finalize or refund | `finalize…` / `compensate…` | Charged on success, refunded on failure. |

The gate (step 1) runs before the credit is reserved (step 3). That makes the gate the natural place to ask: nothing is held yet, so a user who walks away halfway costs nothing and needs no refund.

---

## Decisions made

### D1. When to ask: low confidence *and* candidates that would make different recipes

The gate returns, besides `dish_guess`:

- a **confidence** for the dish (the model's own rating), and
- its **top 2–3 candidate dishes**.

We ask only when **both** hold: the confidence is below a threshold, **and** the candidates would lead to clearly different recipes (different protein, cooking method, sweet vs savoury, cuisine). The chip options for the questions come from the candidates.

**Why both signals:**

- Models rate themselves too high, so confidence alone is noisy.
- Candidates alone would ask about look-alikes that make the same recipe anyway.
- Requiring both keeps questions rare, which is the ticket's main worry ("most guesses should ask none").
- It's still one gate call, so no extra cost or latency for clear photos.

**Follow-on:** when the client sends the answers back, the second `invent-recipe` call skips the gate (the existing `alreadyGated` path) and passes the answers as hard facts. Otherwise the gate's daily limit would be used twice for one recipe.

The threshold value is still open (see below).

### D2. v1 asks only for photos, not links

Only Guess requests with a photo (`platform === 'photo'`) can ask questions. Links (YouTube, Instagram, TikTok, Pinterest…) keep today's behaviour.

**Why:**

- The fish-vs-chicken problem lives in photos, where the model has only pixels to go on. Links usually come with a title, caption or comments that name the dish.
- Some links never reach the gate (thin social posts via `shouldSkipThinSocialGate`, and `already_gated` fallbacks from `src/app/(tabs)/add.tsx`), so there would be no candidates to build questions from without adding a gate run.
- It matches the ticket's eval (~20 ambiguous photos) and keeps the change small.

**Revisit when:** the logs show wrong guesses on videos.

### D3. One question per screen

Each step shows one question with its chips, an "Other" free-text option and "Just guess", with progress ("1 of 2") at the top. Tapping a chip moves straight on. "Just guess" is visible on every step; it skips the rest and keeps the answers already given.

**Why:** most cases ask 1–2 questions, so this is 1–2 taps. One row of chips fits a phone in LTR and RTL, and it's what the ticket describes.

**Where it's built (assumed, to confirm with Yarden):** Guess from a photo exists in both the phone app (`src/app/(tabs)/add.tsx`, which also runs as the old Expo web app) and the new web app (`web/components/snap/`). The question types, sanitizer and answer request go in `shared/`, and each app gets its own sheet.

### D4. When the answer and the photo disagree, the user wins

Answers go into the recipe prompt as hard facts that override what the model sees in the photo. The user is looking at the real dish; the model was the one that was unsure.

Guards, on the free-text "Other" answer only:

- At most about 60 characters, placed in the prompt as quoted user data, never as instructions (prompt injection).
- No extra model call to check it is food. The recipe prompt already has to produce food, and a recipe made this way costs the normal one credit.

Chip answers come from the model's own candidates, so they are always food and need no guard.

### D5. The app sends everything again; the server stores nothing in between

1. First call: the photo, as today. If the gate decides to ask (D1), `invent-recipe` returns `needs_clarification` with 1–3 questions. No credit is held.
2. Second call: the same photo, the same `request_id`, `already_gated: true`, and `clarifications: [{ question, answer }]` (at most 3). It runs the normal reserve → write → finalize or refund flow.

The server treats everything in `clarifications` as untrusted user data: question about 80 characters and answer about 60 at most, no more than 3 pairs, quoted in the prompt as data. A sanitizer in `shared/` drops invalid items instead of throwing.

**Why:**

- No new table, migration or cleanup of abandoned rows. Production is the only database.
- Works the same for guests and signed-in users.
- Walking away halfway leaves nothing behind and costs nothing.
- Reusing the `request_id` (built from the photo by `inventPhotoRequestKey`) keeps one photo = one credit.

**Trade-off we accept:** the app could send made-up question text. It only steers the user's own recipe, and the caps and quoting stop it from steering the model.

### D6. The threshold comes from an eval, and we log enough to tune it

- **Eval:** `eval/clarify.ts`, scored in code like `eval/appliances.ts` (no judge model). Cases in `eval/cases/clarify.json`: about 20 ambiguous photos and about 20 clear ones, each hand-labelled with the real dish.
- **What it measures:** how often clear photos ask (target 10% or less), how often ambiguous photos ask, and how often the right dish comes out without questions vs with questions answered from the label.
- **The threshold:** start at "ask when confidence < 0.7". Run 0.5 / 0.6 / 0.7 / 0.8 and keep the value with the most right dishes while clear photos ask 10% of the time or less. It is a constant in `contentGate.ts`, so changing it is a PR.
- **Logging (`ai_usage_events` metadata):** the gate logs `confidence`, `candidates`, `asked` and `question_count`. The second call logs `answered_count`, `skipped` and `used_other`.

**Why:** the ticket's main risk is annoying people with questions, so "clear photos ask 10% of the time or less" is the rule that breaks ties. Logging lets us retune from real use.

---

## Still open

- Yarden to confirm both apps (`src/` and `web/`) are in scope for v1 (D3).
- How the answers travel back to the server.
