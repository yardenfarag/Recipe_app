# ADR 032: Import recipes from a WhatsApp chat

**Status:** Accepted
**Date:** 2026-11-23
**Deciders:** Yarden (product)
**Related:** ADR 025 (every import costs 1 credit), ADR 019 (partial imports are free), ADR 010 (native share extension), ADR 018 (written recipes)

## Context

Families and friends swap recipes in WhatsApp groups: links to TikTok, Instagram and YouTube, recipes typed out as messages, and photos of handwritten cards or cookbook pages. Years of them pile up between birthday wishes, and nothing in WhatsApp makes them findable. Pinch could only take one link, photo or PDF at a time.

Cooking Together offers a bulk WhatsApp import: you export the chat, upload it, pick the recipes from a preview, and it imports them. Their privacy policy says the whole chat export is read on their servers and deleted afterwards.

## Decision

- **Input is WhatsApp's own export.** In WhatsApp, Export Chat makes a `.txt`, or a `.zip` holding `_chat.txt` and the media when "Attach Media" is chosen. Pinch takes either. There is no WhatsApp bot and no WhatsApp API: those need Meta's Business API, approval and per-message fees.
- **The chat is read on the device, never uploaded.** `shared/lib/whatsappImport/` parses the export in the browser or the app (both the iOS and Android formats and their locale date formats), unzips only the chat text, and unzips each photo when it's needed. Only the recipes the cook ticks are sent to `extract-recipe`, each as an ordinary link, photo or text import. Messages, names and other media never reach Pinch's servers. This is the main way we differ from Cooking Together.
- **What it looks for:** links on the six platforms we import, long messages shaped like a recipe, and photos (from a `.zip`) with their captions. Strong matches are ticked; weak ones (a photo with no caption) are listed but not ticked. Links already in the Library, and anything imported from the chat before, are marked and not charged.
- **Written recipes are a new `extract-recipe` input,** `text`. It goes through the same credit reservation, food check and text ladder as a PDF with a text layer. The recipe has no source URL. No AI-drawn cover, since that would cost more than the credit earns.
- **Credits:** 1 credit per recipe saved, as ADR 025 says for every import. No bulk discount. The review screen shows the total next to the balance. The batch runs 2 imports at a time and stops starting new ones when credits run out, leaving the rest on the list.
- **Where:** the web app (`/app/add/whatsapp`) and the mobile app (a screen opened from the Add tab, and from the share sheet when a WhatsApp export is shared into Pinch). Sharing a `.zip` into the Android app needs the new intent filter, so that part ships with the next native build.
- **Signed in only.** Guests can't save recipes, and a batch is pointless without saving.
- **The import runs on the device.** Closing the page or the app stops it; what's done is saved, and the rest is marked as imported only once it is.

## Considered options

- **Upload the export and process it on the server** (Cooking Together's way). It could keep running after the cook leaves, and it would let a model judge each message. Rejected for v1: it sends a family's whole private chat to us and to an AI provider to find a handful of recipes, and it needs storage, a job queue and a deletion policy.
- **A WhatsApp bot in the group.** Rejected: Business API approval, per-conversation fees, and every group member would have to accept a bot reading the chat.
- **A bulk price** (for example, half a credit each for 20+). Rejected: it's a pricing change, and ADR 025's margin analysis assumes 1 credit per import.

## Consequences

- No new storage, tables or background jobs. The only backend change is the `text` input.
- Recipe detection runs on rules, not a model, so it misses some written recipes and lists some non-recipes. The cook's review step catches both, and the food check refunds anything that isn't a recipe.
- A large export with media can be hundreds of MB. Pinch reads up to 250 MB; past that, the cook exports again without media.
- A long batch needs the page or the app to stay open. If people ask to leave it running, move the queue to the server (only the ticked items, not the chat).
