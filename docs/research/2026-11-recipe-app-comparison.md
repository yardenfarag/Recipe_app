# Recipe apps that save social video recipes: facts as of 2026-11-15

Source for the "best apps to save recipes" guides in `content/guides/` (PIN-87). Every competitor fact comes from the app's own website, help centre, or US App Store listing on 2026-11-15. Google Play listings didn't load, so Android-only details aren't covered. "Not stated" means the official sources don't say. Re-check this before updating a guide, and bump the guide's `updated:` date.

## Summary

| App | Platforms | TikTok / Instagram / YouTube | How it reads a video (official wording) | Free tier | Paid (USD) | Subscription |
|---|---|---|---|---|---|---|
| **Pinch** | iPhone, Android, web | Yes / Yes / Yes (incl. Shorts) | TikTok, Instagram, Facebook: the whole video (sound and picture) plus caption, creator comments and the platform transcript, for videos up to 3 min. YouTube: description, comments and YouTube captions only (the video isn't sent). | 10 credits a month | 10 credits $1.99, 30 $4.99, 100 $7.99; credits never expire | No |
| Deglaze | iPhone, iPad, Android, web | Yes / Yes / Yes (incl. Shorts) | Caption, transcribed audio, on-screen text, and scenes "frame by frame"; on-screen text and scenes up to 10 min | "limited number of imports per week" ("currently 5 per week", Feb 2026 blog) | $49.99/yr | Yes |
| ReciMe | iPhone, Android, web | Yes / Yes / Yes (Shorts not stated) | Caption first, then the video's audio, then the original recipe website | 5 imports every 7 days | $39.99/yr (monthly not stated) | Yes, 7-day trial |
| Pluck | iPhone, Android (no web) | Yes / Yes / Yes (incl. Shorts) | Frames, audio transcription, on-screen text, caption | 3 extractions a month, 10 saved recipes | Light $2.99/mo or $23.99/yr; Plus $6.99/mo or $52.99/yr; Pro $11.99/mo, $107.99/yr or $499.99 lifetime | Yes, lifetime on Pro |
| Honeydew | iPhone, Android (web "in development") | Yes / Yes / Yes (incl. Shorts) | "spoken directions, on-screen text, and captions" | "a limited number of recipe saves" (number not published; the homepage implies social import needs Plus) | $6.99/mo or $39.99/yr | Yes, no one-time option |
| Flavorish | iPhone, Android, web | Yes / Yes / Yes | Best with "the full recipe in the description"; otherwise "does its best to fill in the blanks" from dish name and hashtags | 5 social, 5 image, 5 text imports (period not stated); website imports unlimited | $4.99/mo or $49.99/yr | Yes |
| CookBook | iPhone, Android, web | Yes / Yes / Yes | Caption or first comment, then any linked website | 20 recipes, 20 smart imports | $6.99/mo or $39.99/yr | Yes |
| Pestle | iPhone, iPad, Mac (no Android) | Yes / Yes / Yes | Not stated ("processing … on your device") | Keep 15 recipes | $2.99/mo, $24.99/yr, lifetime $39.99 or $49.99 | Yes, plus lifetime |
| Samsung Food | iPhone, Android, web | Not stated in the sources we could read | Not stated | Not comparable | Food+ $6.99/mo or $59.99/yr | Yes |

Samsung Food's own site blocked our checks (HTTP 403), so it's left out of the video guides.

## Pinch, from the code (2026-11-15)

- Video input: `supabase/functions/_shared/videoInput.ts` (whole file inline, 20 MB cap), `videoLimits.ts` (180 s), `gemini.ts` (text first, then video; partial text still tries video).
- YouTube: `youtube.ts` sets no `videoUrl`, so only description, comments and captions are used.
- Transcripts: TikTok and Facebook through ScrapeCreators; Instagram has none.
- No recipe found refunds the credit; partial imports are never charged (ADR 019).
- Pricing: `_shared/pricing.ts` (`FREE_MONTHLY_EXTRACT_LIMIT = 10`, one credit per import), `src/lib/purchases.ts` (packs).
- Not supported: Pinterest, PDF import.

## Sources

**Deglaze**
- https://www.deglaze.app/how-to/save-recipes-from-tiktok
- https://www.deglaze.app/how-to/save-recipes-from-instagram
- https://www.deglaze.app/blog/deglaze-vs-recime
- https://apps.apple.com/us/app/deglaze-cooking-simplified/id6443578246

**ReciMe**
- https://recime.app/help/en/articles/11661452-import-from-tiktok
- https://recime.app/help/en/articles/11659005-import-from-instagram
- https://recime.app/help/en/articles/11659058-import-from-youtube
- https://recime.app/help/en/articles/14999602-how-your-5-free-weekly-imports-work
- https://recime.app/help/en/articles/11630592-how-much-does-the-recime-subscription-cost

**Pluck**
- https://pluckrecipes.com/ (including the pricing section)
- https://pluckrecipes.com/save-recipes-from-tiktok/
- https://pluckrecipes.com/save-recipes-from-instagram/
- https://pluckrecipes.com/save-recipes-from-youtube/
- https://apps.apple.com/us/app/pluck-ai-video-recipe-saver/id6760918488

**Honeydew**
- https://honeydewcook.com/support/en/first-steps-ios/save-from-tiktok
- https://honeydewcook.com/support/en/first-steps-ios/save-from-youtube
- https://honeydewcook.com/support/en/plans-and-payments/how-much-does-honeydew-cost
- https://honeydewcook.com/support/en/discover-honeydew/free-vs-paid

**Flavorish**
- https://flavorish.ai/ (including the pricing section)
- https://www.flavorish.ai/blog/help-center-feature-related
- https://apps.apple.com/us/app/flavorish-save-any-recipe/id6478546136

**CookBook**
- https://cookbookmanager.com/pricing
- https://help.cookbookmanager.com/en/article/how-to-import-recipes-from-tiktok-qo7w9f/
- https://help.cookbookmanager.com/en/article/how-to-import-recipes-from-youtube-1xx4cuc/

**Pestle**
- https://pestlechef.app/
- https://pestlechef.app/pro
- https://apps.apple.com/app/apple-store/id1574776971

## Couldn't verify

- **ReciMe:** monthly price; YouTube Shorts.
- **Flavorish:** whether the "5" limits are a total, monthly or weekly; how audio is used.
- **Honeydew:** the free save limit, and whether free users can import from social media.
- **Deglaze:** the current free number on live pages (only the Feb 2026 blog says 5 a week).
- **Pestle:** how video import works; which lifetime price is current.
- **All apps:** Android-specific details.
