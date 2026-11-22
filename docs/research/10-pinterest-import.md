# Pinch: importing recipes from Pinterest links (PIN-70)

> Researched 22 November 2026, for the developer building PIN-70. You do not need to have read Pinterest's docs.
>
> **Sources:** Pinterest's Terms of Service, Developer Guidelines, `robots.txt`, API v5 spec and oEmbed endpoint; the ScrapeCreators docs; the Pinch code on `origin/master` (`7e50d93`); and unauthenticated `curl` probes of real public pins, run on 22 Nov 2026 from a residential connection (a development machine, not Supabase). No AI, ScrapeCreators or Firecrawl calls were made. Claims are marked **[probed]**, **[docs]**, **[code]** or **[unconfirmed]**.
>
> **Ticket premise, corrected:** the ticket says `LIVE_PLATFORMS` lists only youtube, instagram, tiktok and web. Since PIN-66 it also lists `facebook` (`supabase/functions/_shared/extraction/platform.ts`). Pinterest is still missing, so a pin link is detected as `web`. **[code]**

## Short answers

1. **What happens to a pin link today? It fails.** It goes to the generic web reader. A pin page is about 1.35 to 1.5 MB, and everything useful in it (meta tags, JSON-LD, the pin data) sits after the first 1.2 MB. `fetchHtml` keeps only the first 600,000 characters (`MAX_HTML_CHARS` in `webRecipe.ts`), so the model gets Pinterest's inline CSS and nothing else. **[probed + code]** (I measured the offsets. I did not run the function.)
2. **Can a server read a pin without signing in? Yes, from a home connection.** All nine pins I fetched returned `200` and the full page, with the Pinch web reader's own User-Agent, a bare `Deno/2.1.4` User-Agent, an empty one and a Chrome one. Twelve requests in a row were not throttled. **[probed]** Whether Pinterest answers Supabase's datacenter addresses the same way is **[unconfirmed]**. It is the first thing to test (section 8).
3. **Where is the outbound link?** In the page, three times: the `og:see_also` and `pinterestapp:source` meta tags, and the `link` field of the pin data. All four recipe-site pins I tested link to a page that our web reader already reads, with a full `Recipe` JSON-LD block. **[probed]**
4. **Video and idea pins?** A video pin without a link carries a `VideoObject` JSON-LD block with a 720p MP4 on `v1.pinimg.com`, a WebVTT caption file and the duration. The MP4 is not signed and is cached for a year, unlike Facebook's. The creator's own caption (often the ingredient list) is only in the pin data, not in the meta tags. **[probed]**
5. **Short links.** `pin.it/<code>` answers `308` to `api.pinterest.com/url_shortener/<code>/redirect/`, which answers `302` to `https://www.pinterest.<tld>/pin/<id>/sent/?invite_code=…&sender=<user id>&sfo=1`. No sign-in needed. An unknown code ends on the Pinterest home page. **[probed]**
6. **oEmbed and the official API do not help.** oEmbed returns a title, author, thumbnail and embed iframe, but no link, caption or video. API v5's Get Pin only returns pins owned by the signed-in account, needs OAuth, and production use needs Pinterest's app review. **[probed + docs]**
7. **Terms.** Pinterest's terms and developer guidelines forbid automated access and scraping without permission, and `robots.txt` disallows every bot that is not on its allowlist. That is the same position Pinch already holds for Instagram, TikTok and Facebook. Following the outbound link is the lighter case: the recipe then comes from the publisher's site, and Pinterest only supplies the link (section 5).

**Recommendation:** add `pinterest` as its own platform. Read the pin page ourselves (free, one request). If the pin links to a recipe site, hand that URL to the existing web reader, Firecrawl fallback included. If there is no usable link, or the site gives no recipe, read the pin itself through the normal social ladder: caption, captions file, then video. One credit per import, as ADR 025 says. Keep Pinterest recipes out of the Hub for now. Details in sections 6 and 7.

---

## 1. Pin URL shapes

Everything here is **[probed]** unless marked.

| Shape | What happens | Pin id |
|---|---|---|
| `https://www.pinterest.com/pin/<id>/` | `200`, full page | the number |
| `https://www.pinterest.com/pin/<slug>--<id>/` | `200`. Pinterest's own `og:url` often uses this form. | last number after `--` |
| `https://www.pinterest.com/pin/<id>/sent/?invite_code=…&sender=…&sfo=1` | `200`. This is where every `pin.it` link lands. | the number |
| `https://pinterest.com/pin/<id>/` | `301` to `www.` | the number |
| `uk.`, `in.`, `br.` `.pinterest.com/pin/<id>/` | `200` directly | the number |
| `www.pinterest.co.uk`, `.de`, `.ru`, `.com.au` `/pin/<id>/` | one redirect to `uk.`, `de.`, `ru.`, `au.pinterest.com` | the number |
| `https://pin.it/<code>` | `308` to `api.pinterest.com/url_shortener/<code>/redirect/`, then `302` to the `/sent/` shape above. One of six real codes went to `www.pinterest.ru`. | after two hops |
| `https://pin.it/<unknown code>` | `308`, then `302` to `https://www.pinterest.com` | none |
| `https://www.pinterest.com/pin/<id that does not exist>/` | **`200`**, a full-size page with no pin in it | none (treat as not found) |

Notes:

- The six `pin.it` codes came from public GitHub issues and were not recipes. I found no public `pin.it` recipe link to test. The redirect shape does not depend on the content, so this should hold. **[probed, with that caveat]**
- `sender` in the `/sent/` URL is the sharer's Pinterest user id. Strip the whole query string before saving or logging.
- A pin can name a different "canonical" pin. Two of my pins had an `og:url` with another id (`452611831329512780` → `368310075792074664`, `302022718787303654` → `92886811062293470`). Use the id from the user's link. Two links to the same recipe can then save twice. That is an acceptable miss, as it was for Facebook.
- `pin.it` can also point at boards and profiles. Those land on `/<user>/<board>/`, which has no pin id. Answer "share the pin itself".
- Regional hosts seen: `www.`, `uk.`, `de.`, `ru.`, `au.`, `in.`, `br.` on `pinterest.com`, and the ccTLDs `pinterest.co.uk`, `.de`, `.ru`, `.com.au`. Pinterest runs more ccTLDs than these. Match the pattern, not a list (section 7.2).

---

## 2. The pins I tested

All fetched on 22 Nov 2026 with the headers `fetchHtml` sends today (`PinchBot/1.0` User-Agent, `Accept: text/html…`, `Accept-Language: en-US`). Every pin page returned `200` in 0.6 to 2.9 s. **[probed]**

| Pin | Kind | Outbound link | What the pin page has | Result if we follow the link |
|---|---|---|---|---|
| [`452611831329517145`](https://www.pinterest.com/pin/452611831329517145/) Pinch of Yum, tortellini soup | image pin, rich recipe pin | `pinchofyum.com/tortellini-soup?tp_image_id=57973` | `Recipe` JSON-LD with 17 ingredients, times and servings, **no steps** | `200`, 446 KB, `Recipe` JSON-LD with `recipeInstructions` |
| [`554857616617775476`](https://www.pinterest.com/pin/554857616617775476/) Tasty, Mongolian beef noodles | image pin | `www.tasty.co/recipe/mongolian-beef-noodle-stir-fry` | `SocialMediaPosting` JSON-LD, 500-character description | `200` (after a redirect to `tasty.co`), `Recipe` JSON-LD with steps |
| [`255016397645909261`](https://www.pinterest.com/pin/255016397645909261/) Food Network, coquito magic cake | rich recipe pin | `foodnetwork.com/recipes/…/coquito-magic-cake-25414453` | `Recipe` JSON-LD, ingredients only | `200`, `Recipe` JSON-LD with steps |
| [`302022718787303654`](https://www.pinterest.com/pin/302022718787303654/) The Feedfeed, garlic herb turkey | idea pin (story pin format, one image page) | `thefeedfeed.com/lisathompson/garlic-and-herb-turkey` | `Recipe` JSON-LD, empty creator description | `200`, 94 KB, `Recipe` JSON-LD with steps |
| [`521713938098528836`](https://www.pinterest.com/pin/521713938098528836/) Fitwaffle, one-pot Toblerone cheesecake | **video idea pin, no link** | none ("Uploaded by user") | `VideoObject` JSON-LD: 720p MP4 (7.08 MB, 32 s), English VTT captions with the spoken method, `PT32S`. The creator's description, with the full ingredient list, is only in the pin data. | n/a: read the pin |
| [`521713938101399821`](https://www.pinterest.com/pin/521713938101399821/) Fitwaffle, Halloween banana pops | video idea pin, no link, 12 s | none | `VideoObject` JSON-LD with 720p MP4 and HLS. The method is in the description. | n/a: read the pin |
| [`452611831329512780`](https://www.pinterest.com/pin/452611831329512780/) Pinch of Yum, air fryer chicken | image pin, **no link** | none | A teaser ("Grab the full recipe…"). No recipe on the pin. | n/a. Should end as a free "no recipe found". |
| [`38351034332743863`](https://www.pinterest.com/pin/38351034332743863/) a Bon Appétit board pin | video pin that is a YouTube Short | `m.youtube.com/shorts/lhMWnR9maV0` | `is_video` true, but no Pinterest video file (seen in the widget data, section 3.4; page not fetched) | Not a recipe (a dog video). Shows the "link to another platform" case. |
| [`129197083054763279`](https://www.pinterest.com/pin/129197083054763279/) | kitchen-decor pin, no link | none | Not food. Should be stopped by the content gate. | n/a |

What this says:

- **Recipe-site pins are the common case.** Of 50 recent pins each from Pinch of Yum, Tasty, Food Network, The Feedfeed, Allrecipes, Budget Bytes, Gimme Some Oven and others, nearly all had an outbound link to a recipe page. Fitwaffle was the exception: about half its pins are linkless video idea pins with the recipe in the caption. **[probed]** (From Pinterest's widget feed, `widgets.pinterest.com/v3/pidgets/users/<user>/pins/`, used only to find pin ids.)
- **The pin alone is not enough for a link pin.** Rich recipe pins carry ingredients but `recipeInstructions` is missing from the JSON-LD, and the `steps` and `instructions` lists in the pin's recipe data are empty. **[probed]** The full recipe is on the site.
- **The site pages all worked with today's web reader settings.** None returned 403, so the Firecrawl fallback was not needed for these four. **[probed]**

---

## 3. What each source returns

### 3.1 The pin page HTML

One `GET` of the pin URL. 1.25 to 1.5 MB. Pinterest serves the same data to every User-Agent I tried, though the page layout varied between requests. **[probed]**

| Data | Where in the page | Notes |
|---|---|---|
| Outbound link | `<meta property="og:see_also">`, `<meta property="pinterestapp:source">`, and `link` in the pin data | Absent on linkless pins. Can carry tracking parameters (`utm_*`, `tp_image_id`). |
| Title | `og:title`, JSON-LD `name`/`headline`, pin data `title` | `og:title` adds keyword lists after ` \| ` ("Recipe \| One pot desserts, …") or says "Pin on Soup Recipes". Prefer the pin data or JSON-LD. |
| Description | pin data `closeupUnifiedDescription` (or `description`); JSON-LD `articleBody`; `og:description` | **The meta and JSON-LD descriptions are often Pinterest's own SEO rewrite**, not the creator's text. On the Toblerone pin they read "Indulge in this decadent Toblerone cheesecake…", while the pin data had the creator's 704 characters with every ingredient. Link pins often get the boilerplate "This Pin was discovered by X. Discover (and save!) your own Pins on Pinterest." |
| Ingredients (rich recipe pins) | JSON-LD `Recipe.recipeIngredient` | No steps. |
| Video file | JSON-LD `VideoObject.contentUrl` (`https://v1.pinimg.com/videos/mc/720p/….mp4`); also in the pin data `storyPinData.pages[].blocks[].videoDataV2` | Only the 720p MP4 and an HLS `.m3u8` are offered. HLS has 240p to 720p variants, but our video step needs one file. |
| Captions | JSON-LD `VideoObject.caption.contentUrl` (`.vtt`); pin data `captionsUrls` | Plain WebVTT. 1.1 KB for 32 s. `webVttToPlainText` in `scrapecreators.ts` already handles it. |
| Duration | JSON-LD `VideoObject.duration` (ISO 8601, `PT32S`); pin data `duration` (milliseconds) | `parseDurationSeconds` does not parse ISO 8601. Add a small parser or use the milliseconds with `parseDurationMilliseconds`. |
| Thumbnail | `og:image` (736 px), `VideoObject.thumbnailUrl` | `i.pinimg.com`, `200` with no Referer. |
| Pin data | `<script data-relay-completed-request="true">window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("<query>", { "data": { "v3GetPinQueryv2": { "data": { "entityId": "<pin id>", … } } } })</script>` | Pinterest's internal Relay cache, camelCase keys. Several such scripts per page, each with part of the pin. Merge the ones whose `entityId` is the pin id. Internal format: it can change without notice. |

The MP4 answered a plain `curl` with `200 video/mp4`, `Content-Length: 7077209`, `Cache-Control: max-age=31535772`. No signature, no expiry, no Referer needed. **[probed]**

Size against our caps: 7.08 MB for 32 s is about 1.75 Mbit/s. The 20 MB inline cap (`MAX_INLINE_VIDEO_BYTES` in `videoInput.ts`) then fits about 90 s of a Pinterest video. Longer clips are skipped as `too_large`, and the caption and captions rungs still run. ADR 025 measured a p95 recipe video of 58 s. **[probed + code]**

### 3.2 oEmbed

`GET https://www.pinterest.com/oembed.json?url=<pin URL>`. Pinterest is a registered provider ([oembed.com providers list](https://oembed.com/providers.json)). **[probed]**

```json
{ "version": "1.0", "type": "rich", "provider_name": "Pinterest", "width": 450, "height": 899,
  "title": "ONE POT TOBLERONE CHEESECAKE", "author_name": "Fitwaffle",
  "author_url": "https://www.pinterest.com/fitwaffle/",
  "html": "<iframe src=\"https://assets.pinterest.com/ext/embed.html?id=521713938098528836&src=oembed\" …></iframe>",
  "thumbnail_url": "https://i.pinimg.com/236x/a9/a2/0e/a9a20ea25f72326ad2b727864ef0fc3a.jpg" }
```

No outbound link, no description, no video. A missing pin answers `400` with `{"error":"Url was not found: …"}`. Useful only if we later want Pinterest's own embedded player in the cook-along sheet (open question 4).

### 3.3 Pinterest API v5

`GET /v5/pins/{pin_id}` "Get a Pin owned by the "operation user_account" - or on a group board that has been shared with this account." It needs OAuth with `boards:read` and `pins:read` ([API spec v5.32.0](https://github.com/pinterest/api-description/blob/main/v5/openapi.json), [docs](https://developers.pinterest.com/docs/api/v5/pins-get/)). **[docs]**

So it cannot read a pin that a Pinch user found on someone else's board, which is every pin we would import. On top of that, a new app starts on Trial access, and production use needs Standard access ([access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/)). Developers report the Standard review needs a screen recording and can take weeks ([forum thread, secondhand](https://community.pinterest.biz/t/upgrade-to-standard-access-pending-26-days-what-is-the-current-review-time/50445)). Not an option.

### 3.4 Pinterest's widget endpoint (not recommended, noted for completeness)

`GET https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=<id>[,<id>…]` is what Pinterest's own embed widgets call from the browser. It is not in Pinterest's developer docs. It returned 16 KB of JSON in 0.4 s, with `link`, the creator's `description`, `story_pin_data` holding `V_720P` MP4 and `captions_urls`, and `rich_metadata.recipe` with parsed ingredients and empty `steps`. A missing pin answers `{"data":[{"id":"…","error":"Not found"}]}`. **[probed]**

It is lighter and cleaner than the page. But it is an undocumented internal API, and `widgets.pinterest.com/robots.txt` is `Disallow: /` for everyone. Calling it from a server is more plainly "data extraction" than reading the public page a link preview reads. Keep it as a last resort if the page's format changes.

### 3.5 ScrapeCreators

`GET /v1/pinterest/pin?url=<pin URL>`, 1 credit, returns title, description, `link`, images and a `videos` field (null in the docs example) ([docs](https://docs.scrapecreators.com/v1/pinterest/pin)). **[docs]** Whether it returns idea-pin video and captions is **[unconfirmed]**. We already hold the key. It is the fallback if Pinterest refuses Supabase's addresses (section 8).

---

## 4. How PIN-66 did Facebook, and what Pinterest reuses

From `docs/research/06-facebook-import.md`, ADR 021 and commit `956e621`. **[code]**

| Facebook (PIN-66) | Pinterest |
|---|---|
| New platform value, migration `20261114190000_facebook_platform` widening `recipes_platform_check` | Same: one migration adding `'pinterest'`. Leave `recipe_cards_platform_check` alone. |
| `resolveFacebookShareLink` reads one redirect before the saved-recipe check, so a repeat link costs nothing | Same idea for `pin.it`, two hops. |
| `fetchFacebookMeta` fills `PlatformMeta` from ScrapeCreators | `fetchPinterestMeta` fills `PlatformMeta` from the pin page, or from the web reader when the link is followed. No ScrapeCreators call by default. |
| Second saved-recipe check when the fetch names the post (`meta.contentId !== contentId`) | Already generic in `extract-recipe/index.ts`. Nothing to add. |
| SD video downloaded at once because the link expires | Pinterest MP4s don't expire. The same `resolveVideoPart` download path works. |
| Thumbnail copied to Storage | Same (`persistSocialThumbnail`, add `'pinterest'`). |
| Not in the Hub | Same, at first (open question 2). |
| Cook-along plays the reel through Facebook's embed | Not in v1 (open question 4). |
| Platform added to every `Platform` switch: `invent-recipe`, `repair-recipe`, `recipeLookup`, `pricing`, `contentGate`, `fetchErrorMessage`, `recipeEditTypes`, both apps, the share Worker, `eval/fetch.ts` | Same list. Section 7.1 has it file by file. |

One difference matters: Facebook always produced its own content. A Pinterest pin usually points somewhere else, so most Pinterest imports are really web imports with a Pinterest front door. The plan below hands those to the web reader and keeps the platform `pinterest` only for the label, the saved URL and the usage numbers.

---

## 5. Pinterest's terms

**Terms of Service** ([policy.pinterest.com/en/terms-of-service](https://policy.pinterest.com/en/terms-of-service), effective 12 Nov 2026), section 2(a): you agree "not to scrape, collect, search, copy or otherwise access data or content from Pinterest in unauthorized ways, such as by using automated means (without our express prior permission)". (Read through a fetch tool that paraphrases around quotes. Check the wording on the page before quoting it anywhere public.) **[docs]**

**Developer Guidelines** ([policy.pinterest.com/en/developer-guidelines](https://policy.pinterest.com/en/developer-guidelines), no date shown). **[docs]**

- Under "What not to do": "Using any automated means or form of scraping or data extraction to access information from Pinterest", unless Pinterest expressly permits it.
- Also forbidden: "Using any Pinterest Materials to train, fine-tune, or otherwise improve or develop any artificial intelligence".
- "The basics": don't store information accessed through Pinterest Materials, including the API, apart from your own campaign analytics. Call again each time instead.
- "Publishing content": "Link Pins back to their source on Pinterest", make clear it comes from Pinterest, and "Not create new content from Pins that can be distributed on your app or service."

**`robots.txt`** ([www.pinterest.com/robots.txt](https://www.pinterest.com/robots.txt)): a long list of named crawlers (search engines, link-preview bots like Discordbot) gets path rules, then `User-agent: *` / `Disallow: /`. `widgets.pinterest.com` and `api.pinterest.com` are `Disallow: /` for everyone. The file's first line points to an allowlist form: [help.pinterest.com/bot-submission-form](https://help.pinterest.com/bot-submission-form). `robots.txt` is aimed at crawlers. One fetch of a link a user shared is closer to a link preview, but we are not on the list. **[probed]**

What this means for Pinch:

- **Reading a pin server-side is not permitted by the letter of the terms.** This is the same position as Instagram, TikTok and Facebook today (`03-gemini-url-extraction.md` section 4, ADR 021). The same mitigations apply: fetch only the link the user shared, one page read per import, no crawling of boards or search, no login, and keep the original pin URL as the source.
- **Following the outbound link is the lighter case.** Pinterest then supplies one thing, the destination URL, which its own "Visit site" button shows to anyone. The recipe text comes from the publisher's site, exactly as if the user had pasted that link.
- **Reading a linkless video pin is the heavier case.** The caption, captions and video are Pinterest-hosted user content. A saved recipe in the user's own library is a private copy for that user. Publishing it to the public Hub would be "new content from Pins … distributed on your app", which the guidelines name. So: **no Hub for Pinterest** until Yarden decides otherwise.
- **Storage.** We store the extracted recipe and a thumbnail copy, never the video. The "don't store" rule is written for API data. We do not use the API. Note it as a residual risk, like the others.
- **AI training.** Pinch does not train models on imports. Nothing to change.
- **Not a blocker.** Nothing here is stricter than what Pinch already accepts for Meta and TikTok. Submitting the allowlist form would put us on record and could be refused (open question 6).

---

## 6. Recommendation

1. **Platform `pinterest`.** Detect `pinterest.com` with any subdomain, Pinterest's country domains, and `pin.it`. Add it to `LIVE_PLATFORMS`, the `Platform` types and the database check.
2. **Resolve `pin.it` first, for free.** Two manual redirect hops, no body download, 5 s timeout. Then take the pin id and run the saved-recipe check before any other work, as Facebook does.
3. **Read the pin page ourselves.** One `GET`, read up to 3 MB (the data is at the end of a ~1.4 MB page), 10 s timeout. Parse it into one `PinterestPin` object, from the most stable source first: JSON-LD and meta tags for the link, video, captions, duration and thumbnail; the Relay pin data for the creator's description and as a backup for everything else.
4. **Link pin: hand off to the web reader.** If the pin has an outbound `http(s)` link that is not Pinterest itself, call `fetchWebRecipeMeta(link, { onPageRead })`. That brings the JSON-LD parsing, the Google Docs rewrite and the Firecrawl fallback for 403s with it. The ladder then runs as `web`: no Jev gate, no video step, `extraction_source: 'web'`.
5. **Pin without a link, or the site failed: read the pin itself.** If there is no link, or the web reader throws, or the page gives an empty description, build `PlatformMeta` from the pin: title, creator description, the JSON-LD ingredient list when the pin has one, the captions file text, the MP4 URL and the duration. The ladder then runs as a social post: Jev, caption, captions, then video. A site that blocked us still gives a partial import from the pin's ingredients, which ADR 019 makes free.
6. **Pins that link to YouTube, Instagram, TikTok or Facebook.** In v1, don't follow them: read the pin itself. Handing off to those readers costs ScrapeCreators credits and changes whose content id is used for dedup. Rare on recipe pins in my sample (0 of the recipe pins). Open question 5.
7. **Credits (ADR 025).** One credit per successful import, whichever step found the recipe. Failed and partial imports are free, as today. `estimateScrapeCredits('pinterest')` is 0. A Firecrawl read is already logged as its own `page_read` row.
8. **Saved recipe.** `platform: 'pinterest'`, `original_url: https://www.pinterest.com/pin/<id>/`, which links the recipe back to its pin as the guidelines ask. The thumbnail is copied to Storage. For a followed link, prefer the site's recipe image over the tall pin graphic.
9. **Hub.** Not published, and no Hub cache lookup, like Facebook. `isHubPlatform` already returns false for an unknown platform, so this needs no code.

Expected cost per import:

| Path | Requests | Third-party cost | Model cost (ADR 025 averages) |
|---|---|---|---|
| Pin links to a site that answers | `pin.it` hops (if any) + pin page + site page | $0 | text, about $0.004 |
| Site refuses us (403) | + one Firecrawl read | $0.005 | text, about $0.004 |
| Video pin, recipe in caption or captions | pin page + `.vtt` | $0 | text, about $0.004 |
| Video pin, needs the video | + 2 to 20 MB MP4 download | $0 | video, about $0.034 |
| Pinterest refuses Supabase (fallback) | ScrapeCreators `/v1/pinterest/pin` | 1 credit, about $0.002 | as above |

---

## 7. Implementation plan

### 7.1 Files to change

**Backend** (read `docs/adr/024-backend-conventions.md` first; this follows its layout):

| File | Change |
|---|---|
| `supabase/migrations/<timestamp>_pinterest_platform.sql` (new) | Drop and re-add `recipes_platform_check` with `'pinterest'` added. Expand only. Copy `20261114190000_facebook_platform.sql`. The timestamp must be newer than every existing migration (newest today is `20261122103000_hide_hub_cards.sql`; check again at build time, other branches are adding migrations). Then `npm run db:types` with local Supabase started, and commit `database.types.ts`. |
| `_shared/extraction/platform.ts` | `'pinterest'` in `Platform` and `LIVE_PLATFORMS`. `detectPlatform` branch before the `web` fallback. New `extractPinterestId`, `isPinterestShortLink`, `canonicalPinterestUrl`. A Pinterest branch in `recipeUrlsMatch` that compares pin ids. |
| `_shared/extraction/sources/pinterest.ts` (new) | `resolvePinterestShortLink`, `fetchPinterestMeta`, and the pure parser `parsePinterestPage(html, pinId)`. Section 7.3. |
| `_shared/extraction/sources/pinterest_test.ts` (new) | Section 7.6. |
| `_shared/extraction/platformMeta.ts` | Add `readAs?: 'web'`: set when the meta came from the outbound page, so the handler runs the ladder as `web`. |
| `extract-recipe/index.ts` | Resolve `pin.it` next to `resolveFacebookShareLink`. A `platform === 'pinterest' && !contentId` answer ("That doesn't look like a Pinterest pin. Open the pin and share it.", code `invalid_url`). `fetchPlatformMeta` case. A `ladderPlatform = meta?.readAs ?? platform`, used for `ladderInput.platform`, the `videoUrl`/`durationSeconds` web exclusions, `tooLongNoText` and `sourceVideoUrl`. `canonicalOriginalUrl` and `resolveThumbnail` cases. The failure copy: "Couldn't find a recipe in this pin. Try a different link." The `coming_soon`/`unknown` message lists Pinterest. |
| `invent-recipe/index.ts`, `repair-recipe/index.ts` | Each has its own `fetchPlatformMeta` switch, and invent its own share-link resolve and `canonicalOriginalUrl`. Add the same cases. |
| `_shared/core/recipeLookup.ts` | `extractVideoIdForPlatform` case. |
| `_shared/extraction/persistThumbnail.ts` | Add `'pinterest'` to the platform union. No Referer needed. |
| `_shared/extraction/contentGate.ts` | Add `'pinterest'` to `shouldSkipThinSocialGate`. No Referer. |
| `_shared/extraction/fetchErrorMessage.ts` | `sourceName('pinterest')` is `'Pinterest'` (today anything unknown becomes "Instagram"). Treat errors from `pinterest.ts` like ScrapeCreators ones, so a timeout says "Pinterest took too long to respond". |
| `_shared/llm/pricing.ts` | `estimateScrapeCredits('pinterest')` returns 0. The ScrapeCreators fallback, if built, reports its credit through `meta.scrapeCredits`. |
| `_shared/recipes/recipeEditTypes.ts` | Add `'pinterest'` to `IMPORT_PLATFORMS`. |
| `eval/fetch.ts` | `case 'pinterest'`, so the eval harness can fetch pins without a model call. |
| `docs/adr/029-pinterest-imports.md` (new) | Record the decision, in the shape of ADR 021. Check the number is still free at build time. |

**Apps** (`shared/`, `src/`, `web/`, the share Worker):

| File | Change |
|---|---|
| `shared/types/recipe.ts`, `shared/lib/supabase/extractRecipe.ts` | `'pinterest'` in the platform unions. TypeScript then points at every `Record<Platform, …>` that needs an entry. |
| `shared/lib/platformUrls.ts` | Pinterest hosts and `pin\.it` in `SOCIAL_DOMAIN_PATTERN` (scheme-less pasted links), `detectPlatform`, `extractPinterestId`, `recipeUrlsMatch`, `extractContentId`. |
| `shared/lib/recipeVideo.ts` | `PLATFORM_LABEL.pinterest = 'Pinterest'`. `getRecipeVideoInfo` returns `mode: 'none'` for Pinterest, except when `source_video_url` holds a YouTube or social embed from a followed site, which it should treat as `web` does. |
| `shared/lib/snapProgress.ts` | `SnapTimingKind` `'pinterest'`. No data yet. Use web plus a little: `{ usual: 11, slow: 20 }`. Video pins are slower but rarer. |
| `shared/lib/cookbook/cookbookDocument.ts`, `src/app/cookbook.tsx` | `pinterest: t('cookbook.platformPinterest')`. |
| `shared/lib/adminDashboard.ts`, `shared/lib/adminDashboardView.ts` | Source label `Pinterest` (match `/pinterest\|^pin\.it/`). |
| `src/components/RecipeVideoPanel.tsx` | Icon map entry `pinterest: 'logo-pinterest'` (Ionicons has it). |
| `src/components/CookAlongVideoModal.tsx`, `web/lib/cook/cookAlongVideo.ts` | Nothing to play in v1. Check that `'pinterest'` falls through to "no video". |
| `src/lib/guestRecipes.ts` | Add `'pinterest'` to the accepted platform list. |
| `workers/share-page/src/render.ts` | Label `pinterest: 'Pinterest'`. |
| `shared/i18n/locales/{en,he,ar,es,ru}.ts` | New key `cookbook.platformPinterest` ("Pinterest" in all five; it is a brand name). Add Pinterest to the link list in `invalidUrl` and any other string that lists the supported platforms (grep for "Facebook, or"). The locale test fails if one file is missed. |
| `README.md`, `app.json` store description | Optional copy update, as PIN-66 did for README. |

No new error codes. The apps translate by `code`, and every Pinterest failure maps to an existing one (`post_private`, `source_timeout`, `invalid_url`, `no_recipe`, `site_blocked`, and so on).

### 7.2 Detection

Server (`platform.ts`) and app (`platformUrls.ts`) must agree:

```ts
// pinterest.com and any subdomain (www., uk., de., in., …), Pinterest's country domains
// (pinterest.co.uk, pinterest.de, pinterest.com.au, …) and the pin.it short link.
const PINTEREST_HOST = /^(?:[a-z0-9-]+\.)?pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
if (PINTEREST_HOST.test(host) || host === 'pin.it') return 'pinterest';

/** The numeric pin id from /pin/<id>/, /pin/<slug>--<id>/ and /pin/<id>/sent/. */
export function extractPinterestId(url: string): string | null {
  const match = new URL(url).pathname.match(/^\/pin\/(?:[^/]*--)?(\d{5,25})(?:\/|$)/);
  return match?.[1] ?? null;
}

export const canonicalPinterestUrl = (pinId: string) => `https://www.pinterest.com/pin/${pinId}/`;
```

Test the negatives too: `notpinterest.com`, `pinterest.com.evil.example`, `pinterest-recipes.com` must stay `web`. (`host` already has `www.` stripped in both detectors.)

### 7.3 `sources/pinterest.ts`

```ts
/** Follows pin.it (308 → api.pinterest.com/url_shortener → 302 → /pin/<id>/sent/…) to the pin. Never throws. */
export async function resolvePinterestShortLink(url: string, fetchImpl: FetchLike = fetch): Promise<string>;

/** Everything we use from a pin page. Pure, so it can be tested on saved HTML. */
export interface PinterestPin {
  pinId: string;
  title?: string;
  description?: string;        // the creator's text, boilerplate removed
  ingredients: string[];       // JSON-LD Recipe.recipeIngredient on rich recipe pins
  link?: string;               // outbound http(s) link, not on Pinterest
  imageUrl?: string;
  videoUrl?: string;           // a single MP4, never .m3u8
  captionsUrl?: string;        // .vtt
  durationSeconds?: number;
}
export function parsePinterestPage(html: string, pinId: string): PinterestPin | null; // null = no pin on the page

/** The content ladder's input for one pin. Follows the outbound link when there is one. */
export async function fetchPinterestMeta(url: string, options: WebFetchOptions = {}): Promise<PlatformMeta>;
```

`resolvePinterestShortLink`: only for `pin.it` and `/url_shortener/` URLs. Up to three hops with `redirect: 'manual'`, 5 s in all. Accept the target only if `detectPlatform(target) === 'pinterest'` and `extractPinterestId(target)` is set. Otherwise return the input, and the handler answers `invalid_url`. Return `canonicalPinterestUrl(id)`, which drops the `invite_code` and `sender` parameters. Same "never throws" contract as `resolveFacebookShareLink`. Call `assertPublicHttpUrl` on each hop, as `safeFetch` does.

Fetching the page: use `safeFetch` and `readBodyCapped` from `core/safeFetch.ts` with a 3 MB cap and a 10 s timeout, and the same honest `PinchBot/1.0` User-Agent and `Accept`/`Accept-Language` headers as `fetchHtml`. Do **not** reuse `fetchHtml`: it cuts the text at 600,000 characters, before any of the pin data. A non-2xx status throws `FetchError('pinterest.ts: …', …)` with the status. Also log the page size, so a page that outgrows the cap shows up.

`parsePinterestPage`, field by field. Take the first one present:

| Field | Order |
|---|---|
| exists | a Relay pin with `entityId === pinId`, or `og:type` `pinterestapp:pin` with an `og:image`. Neither: return null, and the caller throws "Pinterest pin not found" (maps to `post_private`). A missing pin still answers `200` (section 1). |
| `link` | Relay `link` → `pinterestapp:source` → `og:see_also`. Keep it only if `http(s)` and the host is not Pinterest or `pin.it`. |
| `description` | Relay `closeupUnifiedDescription` → Relay `description` → JSON-LD `articleBody` or `VideoObject.description` → `og:description`. Drop "This Pin was discovered by …" boilerplate and a leading "Nov 14, 2026 — " date. Decode HTML entities. |
| `title` | Relay `title` → JSON-LD `name`/`headline` → `og:title` cut at the first ` \| `. |
| `ingredients` | JSON-LD `@type: Recipe` → `recipeIngredient`. |
| `videoUrl` | JSON-LD `VideoObject.contentUrl` ending `.mp4` → Relay story-pin video block (`videoList720P` or `videoList.v720P`) → Relay `videos.videoList` 720P. Never an `.m3u8`. |
| `captionsUrl` | JSON-LD `VideoObject.caption.contentUrl` → Relay `captionsUrls` (prefer an `en*` key, else the first). |
| `durationSeconds` | JSON-LD `duration` (`PT#M#S`) → Relay `duration` in ms. |
| `imageUrl` | `og:image` → `VideoObject.thumbnailUrl`. |

Reading the Relay data: match each `<script data-relay-completed-request="true" …>` body, cut it from the first `{` after `__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("…",` to the last `}` before `)`, `JSON.parse` it in a `try`, and walk `data.*.data` for objects whose `entityId` is the pin id. Merge their fields, first non-empty value wins. Any parse failure just means the JSON-LD and meta fallbacks are used.

`fetchPinterestMeta`:

1. `pinId = extractPinterestId(url)`; fetch and parse the page.
2. If `pin.link`: `try { web = await fetchWebRecipeMeta(pin.link, options) } catch { log; web = null }`. If `web?.description` is set, return `{ ...web, readAs: 'web', contentId: pinId, canonicalUrl: canonicalPinterestUrl(pinId), thumbnailUrl: web.thumbnailUrl ?? pin.imageUrl, title: web.title ?? pin.title }`.
3. Otherwise build the pin's own meta. `description` joins the title, the creator's text and, when present, "Ingredients:" with the JSON-LD list. `captions` is the `.vtt` fetched with `safeFetch` (200 KB cap, 5 s, failure ignored) through `webVttToPlainText`. Also `videoUrl`, `durationSeconds`, `thumbnailUrl: pin.imageUrl`, `contentId: pinId`, `canonicalUrl`, `topComments: []`. Pin comments are not worth a second request.
4. If the pin has no title, description, captions or video, throw "Pinterest pin not found".

Logging: one `[pinterest] fetchMeta done` line, as `facebook.ts` does, with `pinBytes`, `hasLink`, `linkHost`, `followed` (true or false and why), `descriptionSource` (`relay`, `jsonld` or `og`), `hasCaptions`, `hasVideoUrl`, `durationSeconds`. `descriptionSource` drifting from `relay` is the early warning that Pinterest changed its internal format.

### 7.4 The hand-off in `extract-recipe/index.ts`

```ts
if (platform === 'pinterest') url = await resolvePinterestShortLink(url);  // next to the Facebook resolve
const contentId = …extractVideoIdForPlatform(url, platform);               // gains a 'pinterest' case
if (platform === 'pinterest' && !contentId) return failed('invalid_url', "That doesn't look like a Pinterest pin…");

// after fetchPlatformMeta:
const ladderPlatform: Platform = meta?.readAs === 'web' ? 'web' : platform;
// ladderInput.platform = ladderPlatform; the `platform === 'web'` checks for videoUrl, durationSeconds,
// tooLongNoText and sourceVideoUrl use ladderPlatform. Everything saved, logged and returned keeps `platform`.
```

`gemini.ts`, `jev.ts` and `contentGate.ts` need no change: they already treat `web` as a page and everything else as a post. The Jev gate is skipped for followed links (`shouldRunExtractGate` returns false for `web`) and runs for pin-native posts. The credit scope `${platform}|${meta.contentId}` is `pinterest|<pin id>`.

Invent ("Guess the recipe") and repair take the same `fetchPlatformMeta` path. Make the `readAs` hand-off work there too, or at least don't break them: their `platform === 'web'` checks should also use `meta.readAs`.

### 7.5 Video pins

Reuse the video path as it is. `meta.videoUrl` is the `v1.pinimg.com` MP4. `resolveVideoPart` downloads it (not YouTube, so not a URL part) and sends it inline. `refererFor('pinterest')` stays undefined: no Referer is needed. The 12-minute cap and the 20 MB inline cap apply. A clip over about 90 s is skipped as `too_large`. The captions rung usually has the method by then, since Pinterest auto-captions video pins. No `usedInstagramVideoDownload`, and no paid hosted copy.

### 7.6 Tests

Deno, next to the modules (`deno test` via `npx`, from PowerShell at `C:\dev-projects\pinch` per the local notes):

- `platform_test.ts`: detection of every host in section 1 and of `pin.it`. Lookalike hosts stay `web`. `extractPinterestId` on the plain, slug, `/sent/` and regional shapes, and null for boards and profiles. `canonicalPinterestUrl`. `recipeUrlsMatch` across shapes of one pin and between two different pins.
- `pinterest_test.ts`, with small hand-made HTML fixtures that copy the real structure (the meta tags, the JSON-LD blocks, one Relay script). Don't commit the 1.4 MB pages.
  - rich recipe pin with a link: `link`, `ingredients`, title from Relay, no video;
  - video idea pin without a link: MP4 from `VideoObject`, captions URL, `PT32S` → 32, creator description from Relay rather than the SEO text in `og:description`;
  - the same video pin with no Relay script: falls back to JSON-LD and meta;
  - a page with no pin (the `200` "not found" page): `parsePinterestPage` returns null;
  - links that must be ignored: `https://www.pinterest.com/…`, `https://pin.it/…`, `javascript:…`;
  - boilerplate removal;
  - `resolvePinterestShortLink` with a fake `fetch`: 308 → 302 → `/pin/<id>/sent/?…` gives the clean URL; an unknown code (302 to the home page) gives the input back; a thrown error gives the input back; a board target gives the input back;
  - `fetchPinterestMeta` with injected fetches: a link that works gives `readAs: 'web'` and the pin's `contentId`; a link that throws 403 with no page reader falls back to the pin's own text; a pin with neither throws "not found".
- `fetchErrorMessage_test.ts`: Pinterest timeout copy names Pinterest.
- App side (`vitest`): `shared/lib/platformUrls.test.ts` (detection, pasted text such as "Check out this Pin on Pinterest https://pin.it/AbC123"), `shared/lib/recipeVideo.test.ts` (Pinterest label, no video), `snapProgress` timing kind, `web/lib/cook/cookAlongVideo.test.ts` returns null for Pinterest. The locale test covers the five files.
- pgTAP: none needed. The migration changes a check constraint, not RLS or grants. Run `supabase test db` anyway after `db reset`.

### 7.7 Testing before merging

1. **Unit tests**: root and `web/` checks, Deno tests, then `npx expo export -p android` and `-p ios` (the change touches `shared/`).
2. **Local Supabase** (the default in `supabase/README.md`): `npx supabase start`, `db reset`, `test db`, `npm run db:types`, then `functions serve --env-file supabase/.env.local`. Import every pin in section 2, plus one `pin.it` link made by sharing a recipe pin from the Pinterest app. Expected: the four link pins give `full` with `extraction_source: 'web'`; the Toblerone pin gives `full` from captions or description; the banana pin gives a recipe or a free partial; the air fryer teaser gives a free `no_recipe`; the decor pin gives `not_food`; a board link gives `invalid_url`; sharing a pin twice returns `cached`. AI calls are real here, so check the OpenRouter balance first (about 10 imports, under $0.10).
3. **`extract-recipe-preview` with the seed account.** This is the only step that tells us whether Pinterest answers Supabase's network, which local testing can't. `gh workflow run deploy-function-preview.yml --ref <branch> -f function=extract-recipe`, then sign in with `SEED_EMAIL` and `SEED_PASSWORD` from `.env` and run three pins through it: one link pin, the Toblerone video pin, one `pin.it` link. Check the function logs for `[pinterest] fetchMeta done` and `[video] download ok`. The migration has not reached production at this point, so the import works but saving the recipe fails the check constraint. Test the extract response only, not Save. Delete the preview afterwards.
4. **If Pinterest refuses Supabase** (403, a login wall, or a page with no pin data from the preview but not locally): add the fallback before merging. On a refused page read, call ScrapeCreators `GET /v1/pinterest/pin?url=<canonical pin URL>` (1 credit), map `link`, `title`, `description` and any video to `PinterestPin`, and set `meta.scrapeCredits = 1`. One live call settles which fields it returns for a video pin. Ask Yarden first: it is a new paid call (open question 7).

Tell Yarden which of these were run, as `AGENTS.md` asks.

---

## 8. Risks

1. **Supabase's addresses may be refused.** Every probe ran from a home connection. Pinterest has not blocked any client I tried, but datacenter traffic is often treated differently. Step 3 of 7.7 settles it. The fallback is section 3.5.
2. **The creator's description lives in Pinterest's internal Relay data.** It can change without notice. Link, video, captions and duration come from the JSON-LD first, so the link and video paths survive such a change. Only the caption text would drop back to Pinterest's SEO summary. The `descriptionSource` log line shows when that happens.
3. **Page size.** The data sits after 1.2 MB of a 1.25 to 1.5 MB page. A 3 MB cap leaves room. If Pinterest's page grows past it, the parse finds nothing and the import fails. The logged `pinBytes` shows the trend.
4. **Terms.** Server-side reading is not permitted by Pinterest's terms, developer guidelines or `robots.txt` (section 5). Pinterest could block us, or ask us to stop. That is the same exposure as the three other social platforms. Keeping Pinterest-native recipes out of the Hub keeps us clear of the "new content from Pins … distributed" clause.
5. **Video length.** Only a 720p MP4 is offered, about 1.75 Mbit/s. Clips over about 90 s exceed the 20 MB inline cap and skip the video step. HLS would allow 240p, but it needs segment joining. Not worth it until the numbers show long video pins.
6. **Outbound links are user-supplied.** Some go to affiliate, shop or spam pages. `safeFetch` already blocks private addresses and long redirect chains. A non-recipe page ends in the pin fallback, then in a free `no_recipe`.
7. **Duplicates.** A pin can name another canonical pin, and many pins link to one recipe. Dedup by the pin id in the link only. A user who saves the same site recipe through a pin and directly gets two recipes.
8. **Old app builds.** Their `detectPlatform` returns `web` for Pinterest links, so they still send them, and they get `platform: 'pinterest'` back. They show the fallback label ("Video" in `recipeVideo.ts`). The migration must be applied before the functions deploy, which the deploy workflow's order already ensures.
9. **Merge conflicts.** The five locale files and `extract-recipe/index.ts` are being changed on other branches right now (the worktree has uncommitted locale edits). Rebase onto `origin/master` before the PR.

---

## 9. Open questions for Yarden

Each has a default, so the build can go ahead without an answer.

1. **Saved source URL for a followed link.** The pin (`pinterest.com/pin/<id>/`, the default: it shows "Pinterest", links back to the pin, and the pin links to the site) or the recipe site itself?
2. **Hub.** Keep Pinterest recipes out (default), or publish followed-link recipes as `web` cards keyed on the site URL? The second needs the SQL changes ADR 021 lists for Facebook.
3. **Image pins with no link.** Many are a recipe card picture. Send the pin image to the photo reader (`extractRecipeFromImage`, one more model call)? Default: no in v1. Such pins end as a free `no_recipe`.
4. **Cook-along video for video pins.** Pinterest's official embed (`assets.pinterest.com/ext/embed.html?id=<id>`, from oEmbed) could play it in the cook-along sheet. Default: no video panel in v1.
5. **Pins that link to YouTube, Instagram, TikTok or Facebook.** Hand off to that platform's reader, at its usual ScrapeCreators cost? Default: no, read the pin itself.
6. **Pinterest's bot allowlist form.** Submit our fetcher, putting Pinch on record? Default: don't, same as the other platforms.
7. **ScrapeCreators fallback.** If the preview shows Pinterest refusing Supabase, is 1 credit per Pinterest import acceptable? Default: yes, built only if the preview needs it.
