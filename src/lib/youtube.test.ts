import { describe, expect, it } from 'vitest';

import { extractYouTubeId, needsThumbnailBackfill, recipeUrlsMatch } from '@/lib/youtube';

describe('extractYouTubeId', () => {
  it('parses watch URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses shorts URLs', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses youtu.be URLs', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('needsThumbnailBackfill', () => {
  it('flags legacy hqdefault URLs', () => {
    expect(
      needsThumbnailBackfill('https://i.ytimg.com/vi/abc123/hqdefault.jpg'),
    ).toBe(true);
  });

  it('skips modern mqdefault URLs', () => {
    expect(
      needsThumbnailBackfill('https://i.ytimg.com/vi/abc123/mqdefault.jpg'),
    ).toBe(false);
  });

  it('skips maxres URLs', () => {
    expect(
      needsThumbnailBackfill('https://i.ytimg.com/vi/abc123/maxresdefault.jpg'),
    ).toBe(false);
  });

  it('flags missing image URLs', () => {
    expect(needsThumbnailBackfill(undefined)).toBe(true);
  });
});

describe('recipeUrlsMatch', () => {
  it('matches different YouTube URL formats for the same video', () => {
    expect(
      recipeUrlsMatch(
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ),
    ).toBe(true);
  });

  it('does not match different videos', () => {
    expect(
      recipeUrlsMatch(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=abc12345678',
      ),
    ).toBe(false);
  });
});
