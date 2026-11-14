# ADR 021: Import recipes from Facebook reels and posts

**Status:** Accepted
**Date:** 2026-11-14
**Deciders:** Yarden (product)

## Context

In the week to 27 October 2026, 4 of 11 recipe imports failed, and all 4 were Facebook share links (PIN-66). Facebook had no handling: the link went down the generic web path, and Facebook answered the server fetch with a 400. One user retried at once, so people do share cooking reels from Facebook.

The research is in `docs/research/06-facebook-import.md`. In short: ScrapeCreators, which we already use for Instagram and TikTok, returns a public Facebook post or reel for 1 credit, with the caption, a transcript, and a video file we can download.

## Decision

- **Facebook is its own platform**, `facebook`, next to `instagram` and `tiktok`. It matches `facebook.com` and its subdomains (`m.`, `web.`) and `fb.watch`. `recipes.platform` accepts the new value (migration `20261114190000_facebook_platform`).
- **Fetch through ScrapeCreators.** `fetchFacebookMeta` calls `GET /v1/facebook/post` with `get_transcript=true`, and it fills the same `PlatformMeta` as the other platforms, so the content ladder (caption, comments, transcript, video) runs unchanged.
- **Comments in parallel, for videos.** A reel's comments need a second call (1 more credit). It runs alongside the post call, because creators often put the recipe in a comment and waiting for the post first would add about 6 seconds. A link that is clearly a post skips the call: posts carry their first comments inline.
- **Resolve share links ourselves first.** `/share/...` and `fb.watch` links only name their reel or post after a redirect. One unauthenticated request reads that redirect before anything else, so a link the user already saved is found before a scrape is paid for. If the redirect can't be read, the link goes to ScrapeCreators as it is, and the saved-recipe check runs again once the post has returned its id.
- **Identity.** The content id is the reel's video id, or the post id for photo and text posts. These are the numbers in the public URL. The saved URL is `https://www.facebook.com/reel/<id>` for video and the clean post URL otherwise, never the share link.
- **Video.** The file is on Facebook's CDN behind a signed link that expires, and ScrapeCreators has no hosted copy. The function downloads the smaller SD file straight away and sends it inline, like Instagram and TikTok. The thumbnail is copied to Storage for the same reason.
- **In the app.** A saved Facebook reel plays in the cook-along sheet through Facebook's embedded video player. A photo or text post has no video panel.
- **Not in the Hub yet.** Facebook recipes are not published to the Cooking Hub and get no Hub cache hit. Adding them means changing `recipe_cards_platform_check`, `recipe_card_canonical_key` and the Hub triggers and filters in SQL, which is its own piece of work.

## Considered options

- **Fix the 400 and keep the web path.** The public page only has the caption cut to about 200 characters and no video, so most recipes would still fail.
- **Say "Facebook isn't supported".** Honest and free, but the links are a third of recent failures and the fix costs about $0.004 an import.
- **Keep platform `web` and route Facebook hosts to ScrapeCreators inside it.** No migration and no app change, but `web` skips the video step and doesn't copy thumbnails, and Facebook imports would be invisible in the usage numbers.
- **Fetch comments only when the caption has no recipe.** Saves 1 credit on most reels, but the extract would wait for a second, slower call exactly when the post is already the hard case.
- **Meta's oEmbed API.** Official, but it returns embed HTML only: no caption, no video file.

## Consequences

### Positive

- The three production links that failed now import: two from the caption, and the reel also works from the video alone.
- A Facebook import costs 1 or 2 ScrapeCreators credits (about $0.002 to $0.004), the same as TikTok, with no paid video download.
- Sharing the same link twice returns the saved recipe and costs no credit.

### Negative / Trade-offs

- Only public posts work. Private groups, friends-only posts and anything behind the login return "This post isn't public".
- Meta's terms forbid automated collection, and ScrapeCreators promises no uptime for any endpoint. This is the same position as Instagram and TikTok, on one more platform.
- The migration has to be applied before the Edge Functions are deployed. Otherwise the app can't save a recipe with platform `facebook`.
- App versions older than this change import Facebook links correctly but show no video panel for them.
- The video download and the share-link redirect were checked from a development machine only. If Supabase's network is refused, the video step is skipped for Facebook (caption, comments and transcript still work) and share links are resolved by ScrapeCreators instead.
