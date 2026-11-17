import { describe, expect, it } from 'vitest';

import { changedUrls, INDEXNOW_KEY, sitemapEntries, submissionBody } from './indexnow.mjs';

const sitemap = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(([loc, lastmod]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`)
    .join('')}</urlset>\n`;

describe('IndexNow', () => {
  it('reads loc and lastmod from each url', () => {
    const entries = sitemapEntries(sitemap([['https://pinch-app.io/', '2026-11-15']]));
    expect([...entries]).toEqual([['https://pinch-app.io/', '2026-11-15']]);
  });

  it('lists new pages and pages with a new lastmod, not unchanged ones', () => {
    const live = sitemap([
      ['https://pinch-app.io/', '2026-11-15'],
      ['https://pinch-app.io/guides/a/', '2026-10-01'],
      ['https://pinch-app.io/guides/gone/', '2026-10-01'],
    ]);
    const next = sitemap([
      ['https://pinch-app.io/', '2026-11-15'],
      ['https://pinch-app.io/guides/a/', '2026-11-17'],
      ['https://pinch-app.io/guides/b/', '2026-11-17'],
    ]);
    expect(changedUrls(live, next)).toEqual(['https://pinch-app.io/guides/a/', 'https://pinch-app.io/guides/b/']);
  });

  it('treats every page as new when there is no live sitemap', () => {
    expect(changedUrls('', sitemap([['https://pinch-app.io/', '2026-11-15']]))).toEqual(['https://pinch-app.io/']);
  });

  it('points the key location at the key file the build publishes', () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(submissionBody(['https://pinch-app.io/'])).toEqual({
      host: 'pinch-app.io',
      key: INDEXNOW_KEY,
      keyLocation: `https://pinch-app.io/${INDEXNOW_KEY}.txt`,
      urlList: ['https://pinch-app.io/'],
    });
  });
});
