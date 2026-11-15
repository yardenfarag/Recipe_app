import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildGuidePage,
  buildLanding,
  buildSitemap,
  fillSupabaseConfig,
  GUIDE_LINKS_MARKER,
  GUIDES_MARKER,
  loadGuides,
  markdownToHtml,
  parseGuide,
} from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'content');
const landingSource = readFileSync(join(root, 'landing/index.html'), 'utf8');
const guideTemplate = readFileSync(join(root, 'landing/guide.html'), 'utf8');
const sitemapSource = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');

// Links a built page may use: same-page anchors, the home page and its sections, guide pages,
// the app, legal pages and site files, or other sites.
const LOCAL_LINK = /^(\/|\/#[a-z-]+|\/app\/|\/guides\/[a-z0-9-]+\/|\/[a-z-]+\.(html|png|css|json))$/;

describe('parseGuide', () => {
  it('reads front matter and the Markdown body, with CRLF line endings too', () => {
    const { meta, markdown } = parseGuide(
      '---\r\ntitle: A: title\r\ndescription: D\r\norder: 2\r\nupdated: 2026-11-15\r\n---\r\nBody',
      'x.md',
    );
    expect(meta).toEqual({
      title: 'A: title',
      description: 'D',
      order: '2',
      updated: '2026-11-15',
    });
    expect(markdown).toBe('Body');
  });

  it('rejects guides missing front matter, a required field, or a real updated date', () => {
    expect(() => parseGuide('---\ntitle: T\norder: 1\nupdated: 2026-11-15\n---\n', 'x.md')).toThrow(
      /description/,
    );
    expect(() => parseGuide('---\ntitle: T\ndescription: D\norder: 1\n---\n', 'x.md')).toThrow(/updated/);
    expect(() =>
      parseGuide('---\ntitle: T\ndescription: D\norder: 1\nupdated: Nov 15\n---\n', 'x.md'),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => parseGuide('no front matter', 'x.md')).toThrow(/front matter/);
  });
});

describe('markdownToHtml', () => {
  it('keeps headings under the page h1 and wraps tables', () => {
    const html = markdownToHtml('## Step\n\n### Question\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<h2>Step</h2>');
    expect(html).toContain('<h3>Question</h3>');
    expect(html).toContain('<div class="table-scroll"><table>');
  });
});

describe('guide pages', () => {
  const guides = loadGuides(contentDir);

  it('builds every guide into a page with its own title, description and canonical URL', () => {
    for (const guide of guides) {
      const page = buildGuidePage(guideTemplate, guide, guides);
      const url = `https://pinch-app.io/guides/${guide.slug}/`;
      expect(page).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(page).toContain(`<link rel="canonical" href="${url}" />`);
      expect(page).toContain(`<meta property="og:url" content="${url}" />`);
      expect(page).toMatch(/<title>[^<]+ \| Pinch: Recipe Library<\/title>/);
      expect(page.match(/<h1>/g)).toHaveLength(1);
      expect(page).toContain(`<time datetime="${guide.meta.updated}">`);
    }
  });

  it('describes each guide as an Article from Pinch, dated by its updated field', () => {
    for (const guide of guides) {
      const page = buildGuidePage(guideTemplate, guide, guides);
      const [, json] = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(JSON.parse(json)).toMatchObject({
        '@type': 'Article',
        headline: guide.meta.title,
        description: guide.meta.description,
        url: `https://pinch-app.io/guides/${guide.slug}/`,
        dateModified: guide.meta.updated,
        publisher: {
          '@id': 'https://pinch-app.io/#organization',
          name: 'Pinch: Recipe Library',
        },
      });
    }
  });

  it('links to the other guides, to pages that exist, and never back to itself', () => {
    const slugs = new Set(guides.map((g) => g.slug));
    for (const guide of guides) {
      const page = buildGuidePage(guideTemplate, guide, guides);
      const ids = new Set([...page.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
      for (const [, href] of page.matchAll(/href="([^"]+)"/g)) {
        if (href.startsWith('#')) expect(ids, `missing anchor ${href}`).toContain(href.slice(1));
        else if (!/^(https:|mailto:)/.test(href)) expect(href).toMatch(LOCAL_LINK);
        const linked = /^\/guides\/([a-z0-9-]+)\/$/.exec(href)?.[1];
        if (linked) expect(slugs, `no guide ${href}`).toContain(linked);
      }
      const more = page.slice(page.indexOf('class="more-guides"'));
      expect(more).not.toContain(`/guides/${guide.slug}/`);
      for (const other of guides.filter((g) => g !== guide)) {
        expect(more).toContain(`href="/guides/${other.slug}/"`);
      }
    }
  });

  it('fails loudly on a template missing a placeholder, and keeps $ in a guide as written', () => {
    const [guide] = guides;
    expect(() => buildGuidePage(guideTemplate.replace('{{BODY}}', ''), guide, guides)).toThrow(/BODY/);
    const priced = { ...guide, html: '<p>10 credits for $1.99 or $& more</p>' };
    expect(buildGuidePage(guideTemplate, priced, guides)).toContain('<p>10 credits for $1.99 or $& more</p>');
  });
});

describe('sitemap', () => {
  it('lists every guide page with its updated date, after the static pages', () => {
    const guides = loadGuides(contentDir);
    const sitemap = buildSitemap(sitemapSource, guides);
    expect(sitemap).toContain('<loc>https://pinch-app.io/</loc>');
    for (const guide of guides) {
      expect(sitemap).toContain(
        `<loc>https://pinch-app.io/guides/${guide.slug}/</loc>\n    <lastmod>${guide.meta.updated}</lastmod>`,
      );
    }
    expect(sitemap.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

describe('landing page', () => {
  const guides = loadGuides(contentDir);
  const landing = buildLanding(landingSource, contentDir);

  it('shows a card per guide in order, linking to its page and keeping the old anchor', () => {
    expect(guides.map((g) => Number(g.meta.order))).toEqual(
      [...guides.map((g) => Number(g.meta.order))].sort((a, b) => a - b),
    );
    for (const guide of guides) {
      expect(landing).toContain(
        `<a class="card guide reveal" id="${guide.slug}" href="/guides/${guide.slug}/">`,
      );
      expect(landing).toContain(`<a href="/guides/${guide.slug}/">`);
    }
    expect(landing).not.toContain(GUIDES_MARKER);
    expect(landing).not.toContain(GUIDE_LINKS_MARKER);
  });

  it('only links to anchors on the page, guide pages, the app, legal pages, or other sites', () => {
    const ids = new Set([...landing.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
    for (const [, href] of landing.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith('#')) expect(ids, `missing anchor ${href}`).toContain(href.slice(1));
      else if (!/^(https:|mailto:)/.test(href)) expect(href).toMatch(LOCAL_LINK);
    }
  });

  const structuredData = [
    ...landing.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map(([, json]) => JSON.parse(json));
  const graph = structuredData.flatMap((data) => data['@graph'] ?? [data]);
  const byType = (type) => graph.filter((node) => node['@type'] === type);
  const appStoreUrl = landing.match(/class="btn btn-store btn-apple"[\s\S]*?href="([^"]+)"/)[1];
  const playStoreUrl = landing.match(/class="btn btn-store btn-play"[\s\S]*?href="([^"]+)"/)[1];

  it('describes the iPhone and Android apps with a free offer and their store listings', () => {
    const [organization] = byType('Organization');
    const [app, androidApp] = byType('MobileApplication');
    expect(androidApp).toMatchObject({
      operatingSystem: 'Android',
      installUrl: playStoreUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': organization['@id'] },
    });
    expect(playStoreUrl).toBe('https://play.google.com/store/apps/details?id=com.pinch.myapp');
    expect(organization.sameAs).toEqual(expect.arrayContaining([appStoreUrl, playStoreUrl]));
    expect(app).toMatchObject({
      name: 'Pinch: Recipe Library',
      alternateName: expect.arrayContaining(['Pinch']),
      operatingSystem: 'iOS',
      applicationCategory: 'LifestyleApplication',
      applicationSubCategory: 'Food & Drink',
      installUrl: appStoreUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': organization['@id'] },
    });
    expect(app.sameAs).toContain(appStoreUrl);
    expect(byType('WebApplication')[0]).toMatchObject({
      url: 'https://pinch-app.io/app/',
      publisher: { '@id': organization['@id'] },
    });
  });

  it('names Pinch by its store name, apart from other apps called Pinch, with a logo the build copies', () => {
    const [organization] = byType('Organization');
    expect(organization).toMatchObject({
      name: 'Pinch: Recipe Library',
      alternateName: expect.arrayContaining(['Pinch']),
      url: 'https://pinch-app.io/',
    });
    expect(organization.disambiguatingDescription).toContain('pinch-app.io');
    const build = readFileSync(join(root, 'scripts/build-web-site.mjs'), 'utf8');
    const logo = organization.logo.match(/^https:\/\/pinch-app\.io\/([^/]+)$/)[1];
    expect(build).toContain(`copy('landing/${logo}');`);
  });

  it('keeps the FAQ structured data in step with the visible questions', () => {
    const [faq] = byType('FAQPage');
    const visible = [...landing.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, q]) => q);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(visible);
  });

  it('points the share image and manifest icons at files the build copies', () => {
    const build = readFileSync(join(root, 'scripts/build-web-site.mjs'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(root, 'landing/manifest.json'), 'utf8'));
    const ogImage = landing.match(/property="og:image" content="https:\/\/pinch-app\.io\/([^"]+)"/)[1];
    for (const file of [ogImage, 'manifest.json', ...manifest.icons.map((icon) => icon.src.slice(1))]) {
      expect(build).toContain(`copy('landing/${file}');`);
    }
  });

  it('fills in Supabase settings only when both are set', () => {
    expect(fillSupabaseConfig(landing, '', 'key')).toBe(landing);
    const filled = fillSupabaseConfig(landing, 'https://x.supabase.co/', 'key');
    expect(filled).toContain("var SUPABASE_URL = 'https://x.supabase.co';");
    expect(filled).toContain("var SUPABASE_KEY = 'key';");
    const padded = fillSupabaseConfig(landing, 'https://x.supabase.co\n', ' key\r\n');
    expect(padded).toContain("var SUPABASE_URL = 'https://x.supabase.co';");
    expect(padded).toContain("var SUPABASE_KEY = 'key';");
  });
});
