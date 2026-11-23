# Pinch: importing recipes from Facebook links (PIN-66)

> Researched 14 November 2026, for the developer building PIN-66. You do not need to have read the ScrapeCreators docs.
>
> **Sources:** ScrapeCreators' own docs, OpenAPI spec, pricing page, terms and changelog; Meta's own docs and terms; and unauthenticated `curl` probes of the three failing production links, run on 14 Nov 2026 from a residential connection. Sections 1 to 5 were written without calling the ScrapeCreators API, so each claim there is marked **[probed]**, **[docs]** or **[unconfirmed]**. Section 6 has the live calls that came afterwards and settles most of the unconfirmed items.

## Short answers

1. **Does ScrapeCreators cover Facebook posts and reels? Yes.** `GET /v1/facebook/post?url=…` returns the caption, SD and HD video URLs, thumbnail, duration, author and ids for one public post or reel, for **1 credit**. Comments are a separate call, `GET /v1/facebook/post/comments` (1 credit). A transcript comes either from `get_transcript=true` on the post call (no extra charge for videos up to 120 s) or from `GET /v1/facebook/post/transcript` (1 credit). There is **no `download_media`, `trim` or `region` option** for Facebook. The docs only show a `/reel/<id>` URL as input. They do not say whether `share/…` or `fb.watch` links are accepted. **[docs]**
2. **Do share links need resolving, and can we do it without signing in? They can be resolved without signing in.** All three production links answered `302` with a `Location` header holding the real URL and a numeric id. No cookie or login was needed. The catch: a request with a browser User-Agent and no other browser headers got `400`, which matches the error production sees today. **[probed]** Whether ScrapeCreators needs the resolved URL is **[unconfirmed]**, so resolve first: it is free, it matches the documented input shape, and it gives us a content id before we spend a credit.
3. **Can the reel ladder work like Instagram? Mostly.** Caption: yes. Comments: yes, one extra call. Transcript: yes, cheaper than on Instagram. Video: the URLs are signed Facebook CDN links on `fbcdn.net` that expire. There is no ScrapeCreators-hosted copy to fall back on. The function must download the clip straight away and send it inline, which is what `videoInput.ts` already does for Instagram and TikTok. Whether `fbcdn.net` serves video to a Supabase Edge Function is **[unconfirmed]**.
4. **Legal and reliability.** ScrapeCreators says it only retrieves public data, puts compliance with Facebook's terms on us, and promises no uptime. Meta's terms forbid automated collection without permission. ScrapeCreators enforces no rate limit and suggests staying under 500 concurrent requests. **[docs]**

---

## 1. The ScrapeCreators Facebook endpoints

Base URL `https://api.scrapecreators.com`, header `x-api-key`, same as Instagram and TikTok. The machine-readable spec is at <https://docs.scrapecreators.com/openapi.json>. Each endpoint page also has a Markdown version: add `.md` to its URL.

The endpoints that matter for a single shared link ([endpoint index](https://docs.scrapecreators.com/llms.txt)):

| Endpoint | What it does | Cost |
|---|---|---|
| `GET /v1/facebook/post` | One public post or reel by URL | 1 credit |
| `GET /v1/facebook/post/comments` | Comments, paged by cursor | 1 credit per request |
| `GET /v1/facebook/post/transcript` | Transcript text only | 1 credit if a transcript comes back, 0 if not |
| `GET /v1/facebook/post/comment/replies` | Replies to one comment | 1 credit per request |

Others exist (`/v1/facebook/profile`, `/profile/reels`, `/profile/posts`, `/profile/photos`, `/group`, `/group/posts`, `/search/videos`, plus Marketplace, Events and Ad Library). We do not need them. Before October 2025 there were separate "FB posts" and "FB reels" endpoints. `/v1/facebook/post` replaced both ([changelog](https://scrapecreators.com/changelog), 15 Oct 2025).

### 1.1 `GET /v1/facebook/post`

Source: <https://docs.scrapecreators.com/v1/facebook/post> ([Markdown](https://docs.scrapecreators.com/v1/facebook/post.md)).

Query parameters. This is the full list in the spec:

| Parameter | Required | Meaning |
|---|---|---|
| `url` | yes | "The URL of the post to get". The only example is `https://www.facebook.com/reel/1535656380759655`. |
| `get_transcript` | no | `true` adds a transcript. Native captions are used when the video has them. Otherwise the video is transcribed by AI, but only if it is 120 s or shorter. No extra charge. |
| `allow_long_transcription` | no | Paid opt-in for AI transcripts of videos over 120 s. Costs 10 credits per started minute, **and applies that price to short videos too**. Leave it off. |
| `cache_max_age` | no | `1d`, `3d`, `7d`, `14d` or `30d`. If ScrapeCreators holds a copy that fresh, it returns it for 0 credits with `"cached": true` and `"cached_at"`. See [Caching](https://docs.scrapecreators.com/caching). |

Things to know:

- **`get_comments` is named in the endpoint description but is not in the parameter list.** The description says "Optionally fetches comments and transcript via get_comments and get_transcript parameters". The spec, the docs page and the product page list only the four parameters above. Treat `get_comments` as **[unconfirmed]** and use the comments endpoint.
- **No `download_media`.** In the whole spec only `/v2/tiktok/video`, `/v1/instagram/post` and `/v1/truthsocial/post` have it. **[docs]**
- **No `trim` and no `region`** on the Facebook post endpoint. **[docs]**
- **Transcript calls are slow.** The docs say: "These routes remain synchronous. Allow at least 30 seconds on your client." `scrapeCreatorsGet` times out at 15 s (`REQUEST_TIMEOUT_MS` in `supabase/functions/_shared/extraction/sources/scrapecreators.ts`).

Response. This is the docs example with the long CDN query strings cut (`…`). Field names are exact.

```json
{
  "success": true,
  "credits_remaining": 48026,
  "credits_charged": 1,
  "post_id": "25118307061088489",
  "shared_post_id": null,
  "shared_post_url": null,
  "is_paid_partnership": null,
  "like_count": 2095,
  "comment_count": 48,
  "share_count": 133,
  "view_count": 133000,
  "description": "Air Fryer Chocolate Cake \n\n100% f*cks, super simple … (full caption, with ingredients and method)",
  "creation_time": "2025-09-18T06:30:18.000Z",
  "feedback_id": "ZmVlZGJhY2s6MjUxMDIxMDY3OTkzNzUxODI=",
  "url": "https://www.facebook.com/reel/1535656380759655",
  "image_url": null,
  "video": {
    "id": "1535656380759655",
    "sd_url": "https://video-fml1-1.xx.fbcdn.net/o1/v/t2/f2/m69/AQPm….mp4?…&oe=68D239F0&bitrate=313736&tag=progressive_h264-basic-gen2_360p",
    "hd_url": "https://video-fml1-1.xx.fbcdn.net/o1/v/t2/f2/m69/AQPv….mp4?…&oe=68D25899&bitrate=1088662&tag=progressive_h264-basic-gen2_720p",
    "height": 1920,
    "width": 1080,
    "length_in_second": 23.36,
    "thumbnail": "https://scontent-fml1-1.xx.fbcdn.net/v/t51.82787-10/549761436_…_n.jpg?…&oe=68D25528",
    "captions_url": "https://scontent-fml1-1.xx.fbcdn.net/v/t39.2093-6/548496336_…_n.srt?…&oe=68D23D9F"
  },
  "author": {
    "id": "100000076236457",
    "name": "Matt West",
    "handle": "matt.west.184",
    "is_verified": true,
    "url": "https://www.facebook.com/matt.west.184",
    "image": "https://scontent-fml1-1.xx.fbcdn.net/v/t39.30808-1/485744182_…_n.jpg?…"
  },
  "music": {
    "id": "1506592770696336",
    "type": "CUSTOM_AUDIO",
    "track_title": "Matt West · Original audio",
    "music_album_art": "https://scontent-fml1-1.xx.fbcdn.net/…"
  }
}
```

How the fields map to `PlatformMeta`:

| `PlatformMeta` | Facebook field | Notes |
|---|---|---|
| `description` | `description` | Full caption text. |
| `thumbnailUrl` | `video.thumbnail`, else `image_url` | An `fbcdn.net` URL that expires. Copy it at import time. |
| `videoUrl` | `video.sd_url` (or `video.hd_url`) | An `fbcdn.net` URL that expires. See section 3. |
| `durationSeconds` | `video.length_in_second` | Seconds, as a decimal. Note the singular `second`. |
| `contentId` | `video.id`, else `post_id` | See section 2.4. |
| `captions` | transcript | Field name on this endpoint is **[unconfirmed]**. See 1.3. |
| `topComments` | not in this response | Separate call. See 1.2. |

Two ids come back and they differ. In the example `video.id` (`1535656380759655`) is the number in the `/reel/<id>` URL, and `post_id` (`25118307061088489`) is a different number for the same content. `feedback_id` is a third value, used only to speed up the comments call.

`shared_post_id` and `shared_post_url` are set when the post is a re-share of someone else's post. The original is not fetched for you: "Call /v1/facebook/post with shared_post_url separately to retrieve the original's available media." A re-share with an empty caption would need that second call (1 more credit).

The docs give only this one example, a reel. The shape for a photo post, a multi-photo post or a text-only post is **[unconfirmed]**. Presumably `image_url` is set and `video` is missing or null.

### 1.2 `GET /v1/facebook/post/comments`

Source: <https://docs.scrapecreators.com/v1/facebook/post/comments>. 1 credit per request.

| Parameter | Required | Meaning |
|---|---|---|
| `url` | one of the two | Post or reel URL. |
| `feedback_id` | one of the two | The `feedback_id` from the post response. "Using feedback_id (instead of url) will *really* speed up the request." With `url`, ScrapeCreators first fetches the post to find the id ([changelog](https://scrapecreators.com/changelog), 3 Feb 2026). |
| `sort` | no | `most_relevant` (default) or `all`. The default "can filter comments". |
| `cursor` | no | Next page. |

Response fields, from the docs example:

```json
{
  "success": true,
  "credits_remaining": 49999299370,
  "credits_charged": 1,
  "comments": [
    {
      "id": "Y29tbWVudDoxMjA2OTAzNjAxNDgzOTYwXzc3OTIzNDI4MTE0NjkzNQ==",
      "text": "Do 1/2 mini Oreos and 1/2 peanut butter ritz Bitz, otherwise the same recipe. It’s the BEST",
      "created_at": "2025-09-01T01:10:40.000Z",
      "reply_count": 1,
      "reaction_count": 95,
      "reactions": { "like": 79, "love": 4, "haha": 1, "wow": 11, "…": 0 },
      "author": { "id": "pfbid02SdzVLP…", "name": "Robin Bergsagel", "gender": "FEMALE", "short_name": "Robin" }
    }
  ],
  "cursor": "MToxNzc2NDYxMjMwOgF......",
  "has_next_page": true
}
```

The description also lists `author.profile_picture` and an `attachments` array per comment.

**Spotting the creator's own comment is not straightforward.** There is no "is author" flag. Comment `author.id` is usually an opaque `pfbid…` string and only sometimes a plain number, while the post's `author.id` is a plain number. So an id match will often miss. Comparing `author.name` to the post's `author.name` is the likely fallback. How well that works is **[unconfirmed]**.

How many comments one page returns is not stated. **[unconfirmed]**

### 1.3 `GET /v1/facebook/post/transcript`

Source: <https://docs.scrapecreators.com/v1/facebook/post/transcript>. Parameters: `url` (required), `allow_long_transcription`, `cache_max_age`.

```json
{ "success": true, "credits_remaining": 49999939403, "transcript": "We're fishing\nbite x2\nBest bait\non this pole\n…" }
```

- The transcript is **plain text with line breaks**, not WebVTT like TikTok's. `webVttToPlainText` will pass it through, but it drops any line that is only digits.
- Pricing: native captions or an AI transcript of a video up to 120 s cost 1 credit. No transcript costs 0. Over 120 s there is no AI transcript unless `allow_long_transcription=true`, which costs `10 * ceil(seconds / 60)` credits. A 177 s video would cost 30. Even then, "successful transcription of long videos is not guaranteed".
- The 120 s limit is on AI transcription only: "If a video is longer than 2 minutes and requires AI to generate the transcript, we will not return a transcript. This does NOT affect endpoints that return existing transcripts" ([changelog](https://scrapecreators.com/changelog), 24 Feb 2026). The post response also exposes native captions directly as `video.captions_url`, an `.srt` file on `fbcdn.net`.
- **You do not need this endpoint if you pass `get_transcript=true` on the post call.** That includes the same short-video transcript in the 1 credit the post call already costs: "Default short AI (up to 120 seconds, inclusive) is included in the existing base endpoint price, with no extra AI fee." The name of the transcript field in the post response is not shown in the docs. It is very likely `transcript`, but that is **[unconfirmed]**.

### 1.4 Credits and price

- Post: "1 credit per request" (docs page). Comments: "1 credit per request". Transcript: as above.
- A cache hit costs 0 credits. Every response has `credits_charged` ([Caching](https://docs.scrapecreators.com/caching)).
- Credit packs ([pricing](https://scrapecreators.com/#pricing)): 100 free; $47 for 25,000 ($1.88 per 1,000); $497 for 500,000 ($0.99 per 1,000). "1 credit === 1 request (for most endpoints)". Purchased credits do not expire.
- For comparison, `download_media=true` on Instagram costs 10 credits when media is found (spec, `/v1/instagram/post`). Facebook has no such cost because it has no such option.

### 1.5 Errors

The API uses these HTTP codes ([Introduction](https://docs.scrapecreators.com/introduction)): 400 bad parameters, 401 bad key, 402 out of credits, 403 "The public source blocks this resource", 404 "We could not find the requested resource", 500 try again.

The Facebook pages show tabs for 200, 404, 403 and 500, but the error bodies are not in the spec or in the page's static HTML. So the exact JSON for a private, deleted or login-only Facebook post is **[unconfirmed]**. `mapScraperHttpError` already turns a 404, or a message containing "private" or "not found", into "This post is not publicly accessible".

---

## 2. Facebook URL shapes and share links

Everything in this section is **[probed]** unless marked. The probes used `curl -I` and `curl -sL -o /dev/null -w '%{url_effective} %{http_code}'`, with no cookies.

### 2.1 The three production links

| Link | Resolves to | Kind |
|---|---|---|
| `https://www.facebook.com/share/r/1HYN8d6iBk/` | `https://www.facebook.com/reel/774239929117468/` | reel |
| `https://www.facebook.com/share/1CdgCUGMYG/` | `https://www.facebook.com/100063940989830/posts/1582534293887922/` | post (its `og:type` is `video.other`) |
| `https://www.facebook.com/share/r/1A1xoSSih7/?mibextid=wwXIfr` | `https://www.facebook.com/reel/1773253387059978/` | reel |

Each `Location` header also carries tracking parameters, for example:

```
HTTP/1.1 302 Found
Location: https://www.facebook.com/reel/774239929117468/?rdid=nkwPocNUdriagk5L&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F1HYN8d6iBk%2F
```

`rdid` changes on every request. The iOS link also adds `fs=e&s=TIeQ9V&mibextid=wwXIfr`. Strip the whole query string.

### 2.2 What each User-Agent got

Same result for all three links:

| Request | Result |
|---|---|
| `curl` default User-Agent, HEAD or GET | `302` to the real URL. Following it gives `200`. |
| `facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)` | `302` to the real URL. Following it gives `200`. |
| A generic bot User-Agent, and `Deno/2.1.4` (first link only) | `302` to the real URL. |
| Chrome User-Agent and nothing else, HEAD or GET | **`400 Bad Request`**, a 1.5 KB "Error" page, no redirect. |
| Chrome User-Agent plus `Accept`, `Accept-Language`, `Sec-Fetch-Dest/Mode/Site/User` and `Upgrade-Insecure-Requests` (first link only) | `302` to the real URL. |
| Empty User-Agent (first link only) | `302` to `https://www.facebook.com/unsupportedbrowser`. |

So the `400` in production is Facebook rejecting a request that claims to be Chrome but does not send Chrome's other headers. `fetchHtml` in `supabase/functions/_shared/extraction/webRecipe.ts` sends a browser User-Agent with only `Accept` and `Accept-Language`. I did not isolate which missing header triggers the `400`. That exact header set was not tested on its own.

**No login was needed to resolve any of the three links.** None of the final pages was a login wall.

Caveats:

- The probes ran from a home connection. A Supabase Edge Function calls from a datacenter address, and Facebook may treat that differently. **[unconfirmed]**
- A share code that does not exist returns `200`, not `404`. The body is a "log in or sign up to view" page with no redirect. So treat "no `3xx`" as "could not resolve", whatever the status code.
- `facebookexternalhit` is the name of Meta's own link-preview crawler ([Meta web crawlers](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers)). It worked, but we should not pretend to be it in production. A plain runtime User-Agent worked just as well.

### 2.3 What is on the public page

Following the redirect with the default User-Agent returns a 400 to 500 KB page with Open Graph tags:

- `og:description` holds the caption, **cut at roughly 200 characters and ending in `...`**. Not enough for a recipe.
- `og:image` is an `fbcdn.net` thumbnail. It returned `200 image/jpeg` to a plain `curl` with no Referer.
- `og:title` for reels starts with view and reaction counts in the visitor's language (the probe got Hebrew). Do not parse it.
- `og:url` and the canonical link use a slug form: `/<page>/videos/<caption-slug>/<id>/` and `/<page>/posts/<caption-slug>/<id>/`.
- **No video file URL anywhere in the HTML.**

With the `facebookexternalhit` User-Agent the reel page's `<title>` held the whole caption, hashtags and author name included (577 characters). That is one observation, not a contract.

Conclusion: the generic web path cannot do this job, even with the `400` fixed. It would get a truncated caption and no video.

### 2.4 URL shapes and where the id is

| Shape | Probe result (default User-Agent) | Stable numeric id |
|---|---|---|
| `www.facebook.com/reel/<id>` | `200`, with or without trailing slash | yes, the video id |
| `www.facebook.com/watch/?v=<id>` and `/watch?v=<id>` | `302` to `/<owner_id>/videos/<id>/` | yes, `v` |
| `www.facebook.com/video.php?v=<id>` | `200` | yes, `v` |
| `www.facebook.com/<page>/videos/<id>/` | `200` | yes, last path part |
| `www.facebook.com/<page>/videos/<slug>/<id>/` | seen as `og:url` | yes, last path part |
| `www.facebook.com/<page_or_id>/posts/<id>/` | `200` | yes, the post id |
| `www.facebook.com/<page>/posts/<slug>/<id>/` | seen as `og:url` | yes, last path part |
| `www.facebook.com/permalink.php?story_fbid=<id>&id=<owner_id>` | `200` | yes, `story_fbid` |
| `www.facebook.com/story.php?story_fbid=<id>&id=<owner_id>` | `200` | yes, `story_fbid` |
| `www.facebook.com/share/r/<code>/`, `/share/v/<code>/`, `/share/p/<code>/`, `/share/<code>/` | `302` to one of the shapes above | **no**, the code is opaque |
| `facebook.com/…` (no `www`) | `301` to `www.facebook.com/…` | as the target |
| `web.facebook.com/reel/<id>/` | `302` to `www.facebook.com/reel/<id>/?_rdc=1&_rdr` | as the target |
| `m.facebook.com/share/r/<code>/` | `302` to `m.facebook.com/reel/<id>/?…` | yes, in the `Location` |
| `m.facebook.com/reel/<id>/` and `m.facebook.com/story.php?…` | `302` to `m.facebook.com/login/?next=…` | yes, but the page is a **login wall** |
| `fb.watch/` (bare) | `302` to `www.facebook.com/watch/` | n/a |

Notes:

- **The letter in a share link does not matter for resolving.** I swapped it on the real codes: `/share/v/1HYN8d6iBk/` and `/share/1HYN8d6iBk/` both redirect to the same reel as `/share/r/1HYN8d6iBk/`, and `/share/p/1CdgCUGMYG/` redirects to the same post as `/share/1CdgCUGMYG/`. Detect `/share/` followed by anything.
- **`m.facebook.com` sends content pages to a login screen.** Rewrite the host to `www.facebook.com` before fetching, and before handing a URL to ScrapeCreators.
- **One piece of content can have two ids.** A reel has a video id (in its URL) and a separate post id. The same may hold for a `/posts/<id>` post that contains a video. Dedup by video id will not match a `/posts/<id>` link to the same content. That is an acceptable miss.
- Not probed, because I had no real example: a real `fb.watch/<code>` link; `/groups/<group_id>/permalink/<post_id>/` (seen only as an example in the ScrapeCreators group docs); post URLs whose id is an opaque `pfbid…` string instead of a number; `/photo` and `/photo.php?fbid=` links; `mbasic.facebook.com`; `l.facebook.com` redirect wrappers. All **[unconfirmed]**.
- Tracking parameters seen: `rdid`, `share_url`, `mibextid`, `fs`, `s`, `_rdc`, `_rdr`. Keep only `v`, `story_fbid` and `id`.

### 2.5 Which of these does ScrapeCreators accept?

**[unconfirmed]** for everything except `https://www.facebook.com/reel/<id>`, which is the documented example. The docs and the spec contain no mention of `share/`, `fb.watch`, `m.facebook.com`, `story.php` or `watch/?v=`. The changelog says the transcript endpoint takes "a post or reel url". One live call per shape would settle it (1 credit each).

---

## 3. Reels: caption, comments, transcript, video

**Caption.** `description` is the full caption. The docs example is a complete recipe with ingredients and method. **[docs]**

**Comments.** One more call (section 1.2). Unlike Instagram they do not come inside the post response.

**Transcript.** Add `get_transcript=true` to the post call. It is free for videos up to 120 s, which covers most reels. Longer videos get a transcript only if Facebook has native captions for them. This rung does not exist for Instagram today (`captions: undefined` in `instagram.ts`), so Facebook can try text one step further before paying for video.

**Video.**

- `video.sd_url` and `video.hd_url` are on `video-*.xx.fbcdn.net`. That is Facebook's CDN, not a ScrapeCreators host. **[docs]**
- **They expire.** Each URL carries an `oe=` value that reads as a hex Unix time. In the docs example it decodes to 23 Sept 2025, five days after the post was made. A fresh thumbnail from my probe had an `oe` five days ahead. I requested the docs' example `sd_url` and got `403 Forbidden` with the body `URL signature expired`. **[probed]** Reading `oe` as the expiry is my inference. Meta does not document it. ScrapeCreators only says "media URLs can expire".
- **There is no hosted copy.** No `download_media` for Facebook, so `resolveInstagramVideoForModel` has no Facebook twin. If the CDN refuses the download, the video rung is skipped.
- **How the video reaches the model today.** The brief for this ticket said the video URL is handed to Gemini. That changed in ADR 015. `resolveVideoPart` in `videoInput.ts` now downloads every non-YouTube clip inside the function (20 MB cap, 25 s timeout) and sends it inline as base64. Facebook fits that path as it is. `isInstagramCdnUrl` already matches `fbcdn.net`, but the paid hosted fallback behind it only runs for `platform === 'instagram'`.
- **Will `fbcdn.net` serve the clip to our function?** A fresh `fbcdn.net` image URL returned `200` to a bare `curl`. I could not test a fresh video URL without calling ScrapeCreators. Whether the signed video URL works from a different address than the one that scraped it is **[unconfirmed]**. This is the main risk in the ticket.
- **Use `sd_url` first.** In the docs example SD is 360p at about 0.31 Mbit/s and HD is 720p at about 1.09 Mbit/s (the `bitrate=` value in each URL). Against the 20 MB inline cap that is roughly 8 minutes of SD or 2.5 minutes of HD. One example, so treat it as a rough guide.
- **Do not turn on `cache_max_age` when you need the video.** A cached response would hold the old signed URLs. Whether the cache re-signs them is **[unconfirmed]**.

Meta's own API is not an alternative. The oEmbed endpoints (`/oembed_post`, `/oembed_video`) no longer need a token since 15 June 2026 and allow 1,000 requests an hour, but they return only embed `html`, `width`, `height` and provider fields. No caption, no video file. `author_name` and `thumbnail_url` were removed in November 2025. ([oEmbed Video reference](https://developers.facebook.com/docs/graph-api/reference/oembed-video/), [oEmbed Post reference](https://developers.facebook.com/docs/graph-api/reference/oembed-post/))

---

## 4. Legal, reliability and rate limits

What ScrapeCreators says ([Terms](https://scrapecreators.com/terms), effective 6 Nov 2026):

- It "provides API tools that retrieve publicly available information from third-party websites" and is "not affiliated with any third-party platforms".
- "You are solely responsible for ensuring your use of the Service complies with the terms, policies, and laws applicable to the websites you access. We are not responsible for violations of third-party terms."
- "External websites frequently change or block automated access. Therefore: Endpoints may stop working at any time… We do not guarantee uptime or continuity". The docs home page advertises "99.9% uptime". The terms are the binding text.
- "We may store API response data, request metadata, usage logs". So the links our users import, and the scraped responses, are kept by the vendor. Team owners can opt out of the response cache on the API Keys page ([Caching](https://docs.scrapecreators.com/caching)).
- Banned uses include "Surveillance of individuals without lawful basis", "Violating privacy or data protection laws" and "Infringing intellectual property rights".

Public content only:

- The post endpoint is for "a single **public** Facebook post or reel". Group posts are for "a **public** Facebook group". Profile posts are those "visible without login". **[docs]**
- Nothing says friends-only posts, private groups or login-only content can be fetched. Assume they fail. The exact error is **[unconfirmed]** (section 1.5).
- The Facebook product page says: "Is the Facebook API official? No, ScrapeCreators provides an unofficial Facebook API" ([Facebook API](https://scrapecreators.com/facebook-api)).

What Meta says ([Terms of Service](https://www.facebook.com/legal/terms), section 3.2, item 3, effective 1 Jan 2025): "You may not access or collect data from our Products using automated means (without our prior permission)". The clause goes on to cover data you have no permission to access. (I read this page through a fetch tool that returned only the first half of the clause word for word. Check the full text on the page before quoting it elsewhere.) Importing through a scraper sits against that clause. So does our own share-link resolve, though it only reads a redirect. That is the same position Pinch already holds for Instagram and TikTok. The mitigations in `03-gemini-url-extraction.md` section 4 still apply: only fetch links the user shared, keep the original URL for credit, store recipe text and not the video.

Rate limits: "Scrape Creators does not enforce API rate limits. For now, we recommend keeping usage below 500 concurrent requests" ([Introduction](https://docs.scrapecreators.com/introduction), [No rate limits](https://scrapecreators.com/no-rate-limits)). The `429` branch in `scrapeCreatorsGet` should stay, but is not expected to fire.

Reliability signals: the [changelog](https://scrapecreators.com/changelog) shows the Facebook endpoints changing often (five Facebook entries between 20 Oct and 6 Nov 2026). The Introduction says status codes, fields and credit behaviour are "part of the API contract" and that breaking changes need a new version and notice.

---

## 5. What this means for the build

**Platform detection.** Add `facebook`. Match hosts `facebook.com`, `www.facebook.com`, `m.facebook.com`, `web.facebook.com` and `fb.watch`. The first four are probed. Real `fb.watch/<code>` links are not.

**Step 1: resolve and normalise the link, at no cost.**

1. Rewrite `m.` and `web.` to `www.facebook.com`.
2. If the path starts with `/share/`, or the host is `fb.watch`, make one request with `redirect: 'manual'` and read `Location`. Do **not** send a browser User-Agent on its own. The runtime default worked in the probe. `safeFetch` follows redirects by itself and returns the final response, so either call `fetch` directly after `assertPublicHttpUrl`, or read `response.url`.
3. No `3xx`, or a `Location` that is not one of the content shapes (for example `/login/`), means the link could not be resolved. Fall back to passing the original link to ScrapeCreators and let it decide.
4. Drop the query string, keeping only `v`, `story_fbid` and `id`.

**Step 2: content id for dedup.**

- From the URL, before spending a credit: the number in `/reel/<id>`, `?v=<id>`, the last numeric path part of `/videos/…` or `/posts/…`, or `story_fbid`.
- From the response, after the call: `video.id` when there is a video, else `post_id`. For a reel `video.id` equals the URL id (docs example).
- Canonical URL to store: `https://www.facebook.com/reel/<video.id>` for video, `https://www.facebook.com/<author.id>/posts/<post_id>` for posts. Both shapes returned `200` in the probe. `recipeUrlsMatch` in `platform.ts` needs a Facebook branch that pulls the id out of these.

**Step 3: fetch.**

- Call `GET /v1/facebook/post` with `url=<resolved URL>` and `get_transcript=true`. 1 credit. Give this call a timeout of 30 s or more.
- Comments: `GET /v1/facebook/post/comments` with `feedback_id` from the post response (fast, but must run after the post call) or with `url` (can run in parallel, slower). 1 credit. To save credits, call it only when the caption has no recipe.
- If `description` is empty and `shared_post_url` is set, the recipe is probably in the original post. A second post call costs 1 more credit.

**Step 4: video.** Pass `video.sd_url` to `resolveVideoPart` straight away. Add `https://www.facebook.com/` to `refererFor` to be safe. There is no hosted fallback, so a refused download skips the video rung. Never store `sd_url`, `hd_url` or `thumbnail`. Copy the thumbnail the way `persistThumbnail.ts` does for Instagram.

**Expected cost per import.**

| Path | Calls | Credits | At $1.88 per 1,000 |
|---|---|---|---|
| Caption or transcript has the recipe | post | 1 | $0.0019 |
| Needs comments | post + comments | 2 | $0.0038 |
| Re-share, original fetched too | post + post + comments | 3 | $0.0056 |
| Falls to video | same calls as above | no extra credits | model cost only |

That matches TikTok (2 calls) and is cheaper than an Instagram import that has to pay 10 credits for `download_media`.

**Check these with one live call each before relying on them** (about 5 credits in total):

1. Does `/v1/facebook/post` accept a raw `share/r/…` link? If yes, step 1 becomes an optimisation and not a requirement.
2. The name of the transcript field when `get_transcript=true`.
3. The response shape for a photo or text post. Use `https://www.facebook.com/100063940989830/posts/1582534293887922/`, the second production link.
4. Does a fresh `video.sd_url` download from a deployed Edge Function?
5. The error status and body for a private or deleted post.

---

## 6. Checked with live calls (14 November 2026)

After the desk research, the open questions were tested against the ScrapeCreators API and the three production links, from a development machine. About 8 credits were spent. This section overrides anything marked **[unconfirmed]** above.

| Question | Answer |
|---|---|
| Does `/v1/facebook/post` accept a raw share link? | **Yes.** `https://www.facebook.com/share/r/1HYN8d6iBk/` returned `200` with `url` set to `https://www.facebook.com/reel/774239929117468`. The comments endpoint accepts share links too. Resolving the link ourselves is an optimisation, not a requirement. |
| Transcript field name | **`transcript`**, a top-level string of plain text. It came back for a 21 s reel with no native captions (`video.captions_url` was `null`). |
| Timing | The post call with `get_transcript=true` took 7 to 10 s. The comments call took about 6.5 s. Run them in parallel. |
| Shape of a photo post | Same top-level fields as a reel, plus `comments` (the first 10, inline), `images`, `videos` and `link_attachment`. `video` is present with every field `null`. `image_url` is the photo. `url` is the post URL with `rdid` and `share_url` tracking parameters. `post_id` equals the id in `/posts/<id>`. |
| Reel ids | `video.id` equals the id in `/reel/<id>`. `post_id` is a different number. Confirmed on a second reel. |
| Inline comments | A reel response has no `comments`. A photo post has them, each with `id`, `author`, `text` (can be `null` for a sticker), `reaction_count`, `reactions`. |
| Creator comments | Comment `author.id` is usually a `pfbid…` string, sometimes numeric. The post `author.id` is numeric. Match on `author.name` as well. |
| Missing or private post | HTTP **404**, `"error": "not_found"`, `"credits_charged": 0`, and a message that the post "either doesn't exist, or is behind the login". `mapScraperHttpError` already turns a 404 into "This post is not publicly accessible". |
| Does `video.sd_url` download? | **Yes from a development machine**: `200`, `video/mp4`, 0.9 MB for a 21 s reel (the HD file was 3 MB). The thumbnail also returned `200`. From a deployed Edge Function it is still **[unconfirmed]**. |
| Share-link resolution from Deno | All three links returned `302` to Deno's default `fetch` with `redirect: 'manual'`. A made-up `fb.watch` code redirected to `https://www.facebook.com/watch/`, which names no post. From a datacenter address it is still **[unconfirmed]**. |
| Whole import | Running the production fetcher and extraction ladder locally on the links gave a full recipe from text (20 ingredients, 4 steps, about $0.001 of model cost) and, with the text withheld, a full recipe from the downloaded video (about $0.013). |

Still open: the download and the redirect from Supabase's network, `fb.watch` links with a real code, group posts, and multi-photo posts.
