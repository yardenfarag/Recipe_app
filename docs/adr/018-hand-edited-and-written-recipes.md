# ADR 018: Hand-edited and written recipes

**Status:** Accepted
**Date:** 2026-11-08
**Deciders:** Yarden (product)

## Context

Until now a recipe could only change through AI remix. PIN-79 adds **Edit recipe** (change any field of a saved recipe by hand) and **Write a recipe** (type one in from scratch). Both are free and never spend recipe credits. A recipe carries AI-derived fields (calories, time, effort level, cost estimate, tags, appliances, metric/spoons amounts). Hand edits can make them stale, and a written recipe has none of them. Users must never be left without the information they need to cook.

## Decision

- **Edits stay private.** A saved recipe is already the user's own copy of its Hub card, and since PIN-67 only our extraction writes card content. A hand edit never touches the card. The recipe keeps its source URL, still counts as one save on the card, and still blocks a second copy of that URL. A written recipe has no URL (`extraction_source = 'manual'`, `platform = 'unknown'`), so it never reaches the Hub.
- **Jev decides what to recalculate, per field.** On Save, an Edge Function sends one Jev call with a yes/no question for each AI-derived field the edit might affect. Only "yes" fields are recalculated, in the background after the content is saved. If Jev fails or isn't sure (0.3–0.7), we recalculate. A written recipe skips the questions and gets everything calculated. Recalculation is free to the user and capped at 40 a day per user. Past the cap, saving still works and recalculation waits until the next day.
- **Fields the user sets by hand are locked.** Pinch never overwrites a value the user typed until they choose "reset to Pinch's estimate". Locked fields are left out of the Jev questions.
- **Appliances are never hidden by an edit.** The editor tracks steps by a stable id, so reordering or deleting steps remaps appliance step links exactly, with no AI. If steps were deleted or added, appliances are recalculated, and the remapped list stays visible until the new one arrives.
- **Jev checks what users write.** The same Jev call asks whether the content is a real, cookable recipe, whether it is edible and safe, and whether it is free of spam, links and offensive content. It checks the whole of a written recipe, and only the changed parts of an edit. A "no" blocks Save with a reason. A failed Jev call lets the save through, with hard length and range limits (enforced by database `CHECK` constraints) as the backstop.

## Considered options

- **Recalculate everything after every edit**: simple, but it wastes model calls on small changes (1 carrot → 2 only changes calories).
- **Clear AI fields on edit**: free, but it leaves people without the information they need to cook.
- **Overwrite or ask about hand-set values**: overwriting what a user typed feels broken, and asking every time is noisy.
- **Lock recipe content columns to Edge Functions only**: closes the REST bypass, but it means moving remix, kitchen auto-apply and restore to the server. It's deferred, because a bypass only reaches the user's own library and the links they share. A background check from a database trigger (`pg_net`) is the cheaper follow-up if share links are ever abused.

## Consequences

- Writes that go through REST directly skip the Jev check. Only the `CHECK` constraints apply to them.
- A hand edit clears the kitchen auto-apply snapshot (`kitchen_original`), as remix already does. Stored translations are cleared on any content change and rebuild when someone opens the recipe in another language.
- The new fields (which fields were set by hand, `manual` source) must survive backup export and restore (PIN-75).
