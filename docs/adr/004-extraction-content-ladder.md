# ADR 004: Extraction Content Ladder & Failure UX

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

Recipe data on social media is spread across video audio, post description, and comments (often someone asking "recipe?" and the creator replying). A video-only approach misses most TikTok/IG recipes. Comments can number in the millions — fetching all is impossible.

## Decision

### Content ladder (fetch order)

The Edge Function gathers content in this priority, sending **all available sources together** to Gemini in one prompt:

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | **Video** | Transcript / captions / audio-to-text where available |
| 2 | **Description** | Post caption, pinned comment, YouTube description box |
| 3 | **Top comments** | **Max 10**, sorted by likes/relevance — never fetch all comments |

Gemini receives the combined context and extracts the best recipe it can. The system prompt instructs it to prefer video + description, use comments only to fill gaps.

### Failure UX (when no complete recipe found)

After extraction, classify the result:

| Outcome | Condition | UX |
|---------|-----------|-----|
| **Full recipe** | Title + ingredients + steps present | Show RecipeDetail normally |
| **Partial result** | Some fields extracted (e.g. title + ingredients, no steps) | Show what we have + banner: *"Couldn't find full instructions — here's what we found."* User can still save if they want |
| **Hard stop** | Nothing useful extracted | Error: *"Couldn't find a recipe in this video. Try a different link."* — no save offered |

No manual paste fallback in MVP (may revisit in Phase 3).

## Consequences

### Positive

- Matches how recipes actually live on social media
- Comment cap keeps Edge Function fast and cheap
- Partial results still deliver value (ingredients list alone is useful)

### Negative / Trade-offs

- Edge Function needs platform-specific fetchers for description + top comments
- Partial results may feel incomplete without edit capability (editing is out of scope for MVP)
- "Top 10 comments" algorithm varies by platform API availability

## Implementation Notes

```ts
interface RawContent {
  video_transcript?: string;
  description?: string;
  top_comments: string[]; // max 10
  source_url: string;
  platform: 'youtube' | 'instagram' | 'tiktok';
}

interface ExtractionResult {
  status: 'full' | 'partial' | 'failed';
  recipe?: Recipe;
  missing_fields?: string[]; // e.g. ['instructions']
}
```

Gemini system prompt addition:
> Use video transcript first, then description, then top comments only to fill gaps. If instructions are missing, return partial data rather than inventing steps.
