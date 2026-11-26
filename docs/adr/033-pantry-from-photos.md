# ADR 033: A pantry filled from photos, and a phone camera for the web

**Status:** Accepted
**Date:** 2026-11-26
**Deciders:** Yarden (product)
**Related:** PIN-181, ADR 015 (per-task models), ADR 024 (backend conventions), ADR 026 (web app foundations); research in `docs/research/13-pantry-scan-model.md`

## Context

The shopping list, "what can I cook" and the meal planner (PIN-77) all need to know what's at home. Until now Pinch had a short typed list of staples (salt, oil) in the kitchen profile, and fridge match, which read one photo against the Library and forgot it. Fridge match ran on GPT-6 Luna, which in the pantry bake-off made up 8 items and found only 72% of the food in a photo.

## Decision

**Photos in, a checked list out.** The person photographs their fridge, freezer, cupboards and anything else (four places), as many photos as they like. Each photo is read on its own, in parallel, as soon as it's added, so the list fills while they take the next one. One review screen merges every photo: what the model wasn't sure of comes first and unticked, the rest by place and aisle, ticked; names can be changed, anything missed added. A line at the top says the list can be wrong. Saving writes the ticked items.

**The model:** GPT-6.2 Sol, fallback Sonnet 5.5, on 2048px photos (1280px found far less). One call per photo returns the items and a verdict on the photo itself (ok, too dark, blurry, too far, not a kitchen), so a bad photo gets a Retake without a second call. Medicine, pet products, cleaning products and non-food are never listed. A photo that isn't a kitchen returns nothing and gives its daily use back.

**Photos are not stored.** The image is read and dropped. Only the items are kept: on the scan (`pantry_scan_photos`) until the list is saved, so leaving and coming back resumes it (purged after 7 days), then as `pantry_items`. Yarden first wanted the photos kept and viewable, then decided they're redundant.

**Data.**
- `pantry_items`: the person's own rows under RLS, one per product and place (`name_key` is the English name when the scan gave one, so "חלב" and "milk" are the same row). `name` in the app language, `name_en` to match recipes in any language, `brand` as a note only, `place`, `aisle`, `source` (scan, manual, shopping_list), `last_seen_at` for "Scanned 3 days ago". At most 600 per person.
- Staples stay in `profiles.kitchen.pantryStaples` (older app builds read them there) and show on the Pantry page as "Always have".
- "Have it" only: no amounts and no expiry dates. Models can't judge "half a bottle", and a wrong amount is worse than none.

**Cost.** Free, with a daily cap of 25 photos per person (`pantry_scan` in `ai_usage_daily`), about $0.33 at most at $0.013 a photo.

**Keeping it true.** A rescan of a place lists saved items the photos didn't show and removes them only if ticked. Marking a recipe cooked offers to remove the pantry items it used (none ticked). Ticking an item off the shopping list offers to add it to the pantry. The shopping list unticks anything in the pantry, as it did for staples. Two weeks after the last scan, the nudges job sends one reminder by push and by email ("Quick pantry check?"), opening a new scan; each channel keeps its own opt-out. A scan resets it, so each stale spell gets one reminder, and pantries left for over 45 days get none.

**"What can I cook?" replaces fridge match.** It ranks the Library by how much of each recipe is in the pantry, fewest missing first, in code (`rankCookable` in `shared/lib/pantry.ts`): no photo, no model, instant, free. Matching is whole words on the item's name and its English name, and "brown sugar" covers "sugar" by its main word. The `match-fridge` function stays deployed for app builds already on phones and goes later.

**When.** New accounts are asked once, right after the first-run questions and before the first-recipes picker: scan now or later (it's in Settings → Pantry). On mobile it's an in-app sheet with a picture rather than the system alert, because the question needs a line on why.

**"Use your phone's camera" on the web.** The pantry scan, Snap and Guess the recipe show a QR code (computers only). It opens `/app/phone#<token>` in the phone's browser: no app, no sign-in.
- The token is 24 random bytes; only its sha256 is stored (`photo_handoffs`). It sits in the address fragment, which browsers never send to a server. The link lasts 15 minutes, works for one purpose, can add photos and nothing else, and reads nothing from the account. Closing the dialog closes it. At most 40 photos a link and 20 links an hour.
- Pantry photos are read on the server straight away as the account owner (counted against their cap) and land on the scan, so it works even if the laptop sleeps. The computer polls every 2 seconds.
- A Snap or Guess photo waits in the handoff row until the computer takes it (then it's deleted), and the purge drops any left after 15 minutes. The computer then carries on as if the file had been picked there.
- Polling, not Realtime: nothing else in the project uses Realtime, and a 2-second poll for a few minutes is cheap.

## Considered options

- **Keep the photos** (first plan): a private bucket, signed URLs, deletion on account removal. Dropped: nobody needs to see them again, and photos of homes often show faces, mail and medicine.
- **Open the app from the QR code** instead of a web page: needs a store build and the same account signed in on the phone. The web page works on any phone today.
- **Keep fridge match next to the pantry:** two photo features doing nearly the same thing, and fridge match's model was the weakest in the bake-off.
- **Rank "What can I cook?" with a model:** better on odd names, but slow and paid. PIN-119 can add retrieval later; code ranking is good enough for v1.
- **Move staples into `pantry_items`:** one list instead of two, but older app builds read the profile. Revisit with the contract migration.

## Consequences

- New Edge Functions `scan-pantry` and `photo-handoff`, migration `20261126120000_pantry`, a cron job purging scan scratch every 5 minutes, and a third kind in the existing nudges function (`pantry_rescan`, `pantry_rescan_candidates`).
- The rescan push reaches only phones that allowed reminders, and only once the store build with push is out.
- The privacy policy says pantry photos aren't stored and phone photos wait at most about 15 minutes.
- Mobile changes ship over the air (no new native module).
- The eval (`eval/pantry.ts`) stays in the repo to rerun when a candidate model changes.
