# ADR 029: Import recipes from Pinterest pins

**Status:** Accepted
**Date:** 2026-11-22
**Deciders:** Yarden (product)
**Tickets:** PIN-70
**Related:** ADR 021 (Facebook imports), ADR 025 (every import costs 1 credit), ADR 019 (partial imports are free)

## Context

Pinterest links went down the generic web path. A pin page is about 1.4 MB, and everything useful in it sits after the first 1.2 MB. The web reader keeps only the first 600,000 characters, so the model got Pinterest's CSS and the import failed.

The research is in `docs/research/10-pinterest-import.md`. In short: a public pin page answers a plain server request with no sign-in. It names the pin's outbound link, and for video pins a 720p MP4 and a captions file. Most recipe pins link to the recipe's own site, which the web reader already reads well. Pinterest's oEmbed has none of this, and API v5 only returns pins the signed-in account owns.

## Decision

- **Pinterest is its own platform**, `pinterest`. It matches `pinterest.com` with any subdomain, Pinterest's country domains (`pinterest.co.uk`, `pinterest.de`, `pinterest.com.au`, …) and `pin.it`. `recipes.platform` accepts the new value (migration `20261122160000_pinterest_platform`).
- **Short links are resolved first, for free.** `pin.it` takes two redirects to reach `/pin/<id>/sent/?invite_code=…&sender=…`. Only Pinterest's own hosts are requested. The query, which names the person who shared the pin, is dropped. The pin id then drives the saved-recipe check before anything else runs.
- **We read the pin page ourselves** (`sources/pinterest.ts`), with a 3 MB cap. The public markup (JSON-LD and meta tags) comes first. Pinterest's internal Relay data supplies the creator's own caption, which the public markup often replaces with an SEO summary, and backs up everything else.
- **A pin that links out hands off to the web reader.** The linked page is read by `fetchWebRecipeMeta`, Firecrawl fallback included, and the ladder runs as `web` (`PlatformMeta.readAs`). If that page can't be read, the pin itself is read instead.
- **A pin with no usable link is read as a post.** Its caption, the ingredient list of a rich recipe pin, its captions file and its MP4 go through the usual ladder, video step included. The MP4 isn't signed and doesn't expire.
- **Identity.** The content id is the pin id. The saved URL is `https://www.pinterest.com/pin/<id>/`, which links the recipe back to its pin, also when the recipe came from the linked site.
- **Credits.** One credit per successful import, as ADR 025 says for every import. Failed and partial imports are free. No ScrapeCreators credit is spent.
- **Not in the Hub.** Pinterest recipes are not published to the Cooking Hub and get no Hub cache hit. `recipe_cards_platform_check` is unchanged. Pinterest's developer guidelines ask apps not to "create new content from Pins that can be distributed", and a Hub card would be exactly that.
- **In the app.** Recipes show "Pinterest" as their source. There is no video panel for pins yet. A pin's linked site that embeds a YouTube video keeps that video, as a web recipe does.
- **Not followed in v1:** pins that link to YouTube, Instagram, TikTok or Facebook are read as pins. Image pins with no link are not sent to the photo reader.

## Considered options

- **Keep the web path and raise its cap.** It would find the pin's meta tags, but the pin page has no recipe steps, and video pins would skip the video step.
- **Pinterest API v5.** Official, but it can't read pins owned by other accounts, and production access needs an app review.
- **Pinterest's widget endpoint** (`widgets.pinterest.com/v3/pidgets/pins/info/`). Lighter and cleaner, but undocumented, and its `robots.txt` disallows every client. Kept as a fallback idea only.
- **ScrapeCreators `/v1/pinterest/pin`.** Works, but costs 1 credit per import for data the page gives us for free. It is the fallback if Pinterest starts refusing Supabase's servers.

## Consequences

### Positive

- Recipe-site pins import as well as the site itself does.
- Video idea pins with the recipe in the caption, or spoken in the video, import through the usual ladder.
- Sharing the same pin twice returns the saved recipe and costs nothing.

### Negative / Trade-offs

- Pinterest's terms and `robots.txt` don't permit automated reading. That is the same position as Instagram, TikTok and Facebook, on one more platform.
- The creator's caption comes from Pinterest's internal page data, which can change without notice. The link, the video and the captions come from the public markup and survive such a change. The `[pinterest] fetchMeta done` log line records where the caption came from.
- Only the 720p MP4 is offered, so a video pin longer than about 90 s is over the 20 MB inline cap and skips the video step.
- The migration has to be applied before the Edge Functions are deployed, or the app can't save a recipe with platform `pinterest`. The deploy workflow runs migrations first.
- App builds from before this change detect pins as web links. They still send them, and get back `platform: 'pinterest'`, which they label "Video".
