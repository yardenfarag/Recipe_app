# Pantry scan: which model reads a fridge photo (PIN-181)

**Date:** 2026-11-26
**Decision:** GPT-6.2 Sol (`openai/gpt-6.2-sol`, reasoning low), with Claude Sonnet 5.5 as the fallback, on 2048px photos. `TASK_MODELS.pantry_scan` in `supabase/functions/_shared/llm/llmClient.ts`.
**Full tables, per photo:** `eval/results/pantry.md`. **How to rerun:** `eval/README.md` → Pantry scan.

## What was tested

The production scan (`_shared/pantry/pantryScan.ts`, the same prompt and parser the app uses) on 30 photos, one model at a time with no fallbacks:

- 8 from Yarden's kitchen: Hebrew labels with Russian condensed milk and Spanish paprika among them, plain tubs of flour and rice, a pet salmon oil, straws and toothpicks next to the coffee, a spray can next to the avocados, and a dog bed as the "not a kitchen" photo. Labels drafted by Claude from the photos and checked by Yarden.
- 12 from the web: crowded US pantries, a dark kitchen, a messy counter with little to list, shelves with cleaning products.
- 8 from Wikimedia Commons (licensed; downloaded by title, not in git): a home freezer with ice packs, an Indian spice box with no labels, a fridge with Persian labels, a fridge at night, a US fridge door full of branded sauces, a German cellar of home-made jars, a readable spice shelf, and a second "not a kitchen" photo.
- 2 made from Yarden's photos: a blurred spice cupboard and a darkened fridge, so "retake" has a known right answer.

Scored in code against hand labels (no judge model), in this order: made-up items, found items, items only nameable from the label, non-food listed as food, the photo verdict, and "sure" on unreadable photos. Made-up items count only on the 13 photos whose labels cover the whole frame; elsewhere unmatched names are listed for a hand check.

## Results (2048px, English names)

| Model | Made up (would arrive ticked) | Found | Only from the label | Israeli kitchen | Photo verdict | Typical / slow | Per photo |
|---|---|---|---|---|---|---|---|
| **GPT-6.2 Sol** | **1 (0)** | 94% | **96%** | **38/38** | 24/30 → 30/30* | 7.0 / 17.4 s | $0.013 |
| Claude Opus 5.5 | 2 (0) | **98%** | 97% | 38/38 | 30/30 | 7.3 / 16.7 s | $0.029 |
| Gemini 4 Hydrogen | 1 (1) | 91% | 92% | 35/38 | 26/30 | 8.9 / 18.0 s | $0.013 |
| GPT-6.1 Terra | 2 (0) | 92% | 94% | 38/38 | 23/30 | 8.6 / 17.9 s | $0.006 |
| Claude Sonnet 5.5 | 3 (1) | 94% | 92% | 35/38 | 28/30 | **4.9** / 11.8 s | $0.015 |
| Gemini 4 Carbon | 4 (1) | 95% | 95% | 38/38 | 25/30 | 11.8 / 26.3 s | $0.012 |
| Qwen 4 Max | 4 (0) | 80% | 75% | | 29/30 | 21.4 / 35.8 s | $0.010 |
| Muse Ember | 3 (1) | 62% | 55% | | 26/30 | 4.3 / 6.5 s | $0.001 |
| Gemini 3.5 Flash | 7 (5) | 90% | 87% | | 30/30 | 3.8 / 8.5 s | $0.009 |
| GPT-6 Luna (fridge match until now) | 8 (5) | 72% | 67% | | 29/30 | 6.0 / 7.9 s | $0.001 |
| Claude Haiku 5.5 | 15 (3) | 80% | 74% | | 30/30 | 3.3 / 8.8 s | $0.001 |
| Inkling 2 Small | 3 (0) | 77% | 69% | | 30/30 | 5.7 / 14.2 s | $0.002 |

\* Sol called 9 of 12 crowded web pantries "too far", which would ask people to retake good photos. The prompt now says a crowded shelf isn't "too far" and to say "ok" when unsure; the rerun (Hebrew names) got 30/30.

No model listed any of the non-food items (medicine, pet products, cleaning products, straws, ice packs) as food, and every model called the dog bed "not a kitchen".

## Second stage

- **Hebrew names (Sol, Sonnet, Terra):** same accuracy as English (Sol 93% found, 1 made up, unsure). Names read naturally ("שקדי מרק", "חלב נטול לקטוז 2%", "פפריקה מתוקה").
- **1280px photos (what Snap sends):** every model found less: Sol 94% → 85%, Sonnet 94% → 82%, Terra 92% → 79%, and Sol made up 4 instead of 1. Small print on shelves needs the bigger photo, so the apps send 2048px (about 0.4–1 MB) for pantry scans only.

## Why Sol

- The fewest made-up items, and the one it made up (bread, on a spice cupboard) came back unsure, so it arrives unticked. People skim this list, so this matters most.
- The best on items only the packaging names, and every item in the Israeli kitchen: Yachin, Beit Hashita, Sugat, Tnuva, Ta'am Vareach, soup croutons that two other models called popcorn.
- Opus finds 4 points more but costs 2.3 times as much per photo, for a task with 4–10 photos per person.
- Sonnet as the fallback: as good on what it finds, the fastest of the strong models, and another vendor, so one outage doesn't take both down.

Brands are sometimes wrong (Sol named the same tahini two different brands on two photos). The app shows a brand only as a muted note next to the plain name.

## Cost and limit

About $0.013 a photo; a 10-photo setup is about $0.13. The daily cap is 25 photos per person (`PANTRY_SCAN_DAILY_LIMIT`), about $0.33 at most. A photo that isn't a kitchen gives its use back. The whole bake-off cost about $6.

## Caveats

- 30 photos, labels by one person; a few US web photos are low resolution, which favours models that say "too far".
- Latency is wall clock from a laptop in Israel, not from the Edge Function.
- Re-run with `deno pantry` when a candidate model changes (it skips calls already on disk).
