import { describe, expect, it } from 'vitest';

import { unwrapInstagramMedia } from '@/lib/instagramMedia';

describe('unwrapInstagramMedia', () => {
  it('unwraps ScrapeCreators data.xdt_shortcode_media payload', () => {
    const media = unwrapInstagramMedia({
      data: {
        xdt_shortcode_media: {
          shortcode: 'DZ7cxYuJRlP',
          owner: { username: 'chef' },
          edge_media_to_caption: {
            edges: [{ node: { text: 'Recipe caption' } }],
          },
          video_url: 'https://cdn.example/video.mp4',
          display_url: 'https://cdn.example/thumb.jpg',
        },
      },
      status: 'ok',
    });

    expect(media?.shortcode).toBe('DZ7cxYuJRlP');
    expect((media?.owner as { username?: string })?.username).toBe('chef');
  });

  it('accepts trimmed responses with media fields directly under data', () => {
    const media = unwrapInstagramMedia({
      data: {
        shortcode: 'ABC123',
        caption: 'Trimmed caption',
        video_url: 'https://cdn.example/video.mp4',
      },
    });

    expect(media?.shortcode).toBe('ABC123');
    expect(media?.caption).toBe('Trimmed caption');
  });

  it('returns null for empty wrapper objects', () => {
    expect(unwrapInstagramMedia({ data: {}, status: 'ok' })).toBeNull();
  });
});
