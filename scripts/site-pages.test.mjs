import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildGuidePage,
  buildLanding,
  buildSitemap,
  buildSitePages,
  escapeHtml,
  fillSupabaseConfig,
  GUIDE_LINKS_MARKER,
  GUIDES_MARKER,
  guidePath,
  homePath,
  LANGUAGE_CHOICE_KEY,
  loadGuides,
  loadSite,
  markdownToHtml,
  parseGuide,
  SITE_LANGUAGES,
} from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'content');
const landingSource = readFileSync(join(root, 'landing/index.html'), 'utf8');
const guideTemplate = readFileSync(join(root, 'landing/guide.html'), 'utf8');
const sitemapSource = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
const site = loadSite(root);
const templates = { landingHtml: landingSource, guideHtml: guideTemplate };
const translated = site.languages.filter((lang) => lang.code !== 'en');

// Links a built page may use: same-page anchors, a home page and its sections, guide pages (in
// any language), the app, legal pages and site files, or other sites.
const LOCAL_LINK =
  /^(\/((es|he|ru|ar)\/)?(#[a-z-]+)?|\/app\/|\/((es|he|ru|ar)\/)?guides\/[a-z0-9-]+\/|\/[a-z-]+\.(html|png|css|json))$/;

// A copy of the site where `lang` has no translation of the guide `slug`.
function withoutGuide(lang, slug) {
  return { ...site, guides: { ...site.guides, [lang]: site.guides[lang].filter((g) => g.slug !== slug) } };
}

function alternates(html) {
  return Object.fromEntries(
    [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map(([, code, href]) => [
      code,
      href,
    ]),
  );
}

// Every key path in a strings file, with arrays by index: the shape a translation must match.
function keyPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

function stringAt(strings, path) {
  return path.split('.').reduce((value, part) => value[part], strings);
}

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
      const page = buildGuidePage(guideTemplate, site, guide);
      const url = `https://pinch-app.io/guides/${guide.slug}/`;
      expect(page).not.toMatch(/\{\{[^}]*\}\}/);
      expect(page).toContain(`<link rel="canonical" href="${url}" />`);
      expect(page).toContain(`<meta property="og:url" content="${url}" />`);
      expect(page).toMatch(/<title>[^<]+ \| Pinch: Recipe Library<\/title>/);
      expect(page.match(/<h1>/g)).toHaveLength(1);
      expect(page).toContain(`<time datetime="${guide.meta.updated}">`);
    }
  });

  it('describes each guide as an Article from Pinch, dated by its updated field', () => {
    for (const guide of guides) {
      const page = buildGuidePage(guideTemplate, site, guide);
      const [, json] = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(JSON.parse(json)).toMatchObject({
        '@type': 'Article',
        headline: guide.meta.title,
        description: guide.meta.description,
        url: `https://pinch-app.io/guides/${guide.slug}/`,
        dateModified: guide.meta.updated,
        inLanguage: 'en',
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
      const page = buildGuidePage(guideTemplate, site, guide);
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
    expect(() => buildGuidePage(guideTemplate.replace('{{BODY}}', ''), site, guide)).toThrow(/BODY/);
    const priced = { ...guide, html: '<p>10 credits for $1.99 or $& more</p>' };
    expect(buildGuidePage(guideTemplate, site, priced)).toContain('<p>10 credits for $1.99 or $& more</p>');
  });
});

describe('sitemap', () => {
  const sitemap = buildSitemap(sitemapSource, site);

  it('lists every guide page with its updated date, after the static pages', () => {
    expect(sitemap).toContain('<loc>https://pinch-app.io/</loc>');
    for (const guide of loadGuides(contentDir)) {
      expect(sitemap).toContain(
        `<loc>https://pinch-app.io/guides/${guide.slug}/</loc>\n    <lastmod>${guide.meta.updated}</lastmod>`,
      );
    }
    expect(sitemap.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('lists every page in every language once, each with its other language versions', () => {
    const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, url]) => url);
    const locs = urls.map((url) => url.match(/<loc>([^<]+)<\/loc>/)[1]);
    expect(new Set(locs).size).toBe(locs.length);
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    for (const page of buildSitePages(site, templates)) {
      const url = urls.find((entry) => entry.includes(`<loc>https://pinch-app.io${page.path}</loc>`));
      expect(url, `sitemap is missing ${page.path}`).toBeDefined();
      for (const [code, href] of Object.entries(alternates(page.html))) {
        expect(url).toContain(`<xhtml:link rel="alternate" hreflang="${code}" href="${href}" />`);
      }
    }
  });
});

describe('landing page', () => {
  const guides = loadGuides(contentDir);
  const landing = buildLanding(landingSource, site);

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
    expect(landing).not.toMatch(/\{\{[^}]*\}\}/);
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

  it('keeps the FAQ structured data in step with the visible questions, in every language', () => {
    for (const { code } of site.languages) {
      const page = buildLanding(landingSource, site, code);
      const faq = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(([, json]) => JSON.parse(json))
        .find((data) => data['@type'] === 'FAQPage');
      const visible = [...page.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, q]) => q);
      expect(visible).toHaveLength(site.strings.en.faq.items.length);
      expect(faq.mainEntity.map((q) => escapeHtml(q.name))).toEqual(visible);
      expect(faq.inLanguage).toBe(code);
      // Links in an answer are links on the page and plain text in the structured data.
      expect(JSON.stringify(faq)).not.toMatch(/\]\(/);
      expect(page).toContain('<a href="/privacy.html">');
    }
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

describe('languages', () => {
  const pages = buildSitePages(site, templates);
  const pageAt = (path) => pages.find((page) => page.path === path);

  it('speaks the same languages as the app, and every one of them is live', () => {
    const app = readFileSync(join(root, 'src/lib/appLanguages.ts'), 'utf8');
    const appLanguages = [...app.matchAll(/\{ code: '([a-z]+)', label: '[^']+', nativeLabel: '([^']+)' \}/g)];
    expect(SITE_LANGUAGES.map((lang) => [lang.code, lang.label])).toEqual(
      appLanguages.map(([, code, nativeLabel]) => [code, nativeLabel]),
    );
    const rtl = app.match(/isRtlAppLanguage[\s\S]*?return ([^;]+);/)[1];
    for (const lang of SITE_LANGUAGES) {
      expect(lang.dir, lang.code).toBe(rtl.includes(`'${lang.code}'`) ? 'rtl' : 'ltr');
    }
    expect(site.languages.map((lang) => lang.code)).toEqual(SITE_LANGUAGES.map((lang) => lang.code));
  });

  it('builds the landing page and each translated guide under /<lang>/, in its language and direction', () => {
    expect(pageAt('/')).toBeDefined();
    for (const lang of site.languages) {
      const expected = [homePath(lang.code), ...site.guides[lang.code].map((g) => guidePath(g.slug, lang.code))];
      for (const path of expected) {
        const { html } = pageAt(path);
        const url = `https://pinch-app.io${path}`;
        expect(html).toContain(`<html lang="${lang.code}" dir="${lang.dir}">`);
        expect(html).toContain(`<link rel="canonical" href="${url}" />`);
        expect(html).toContain(`<meta property="og:url" content="${url}" />`);
        expect(html, path).not.toMatch(/\{\{[^}]*\}\}/);
        expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      }
    }
    expect(pages).toHaveLength(site.languages.reduce((count, lang) => count + 1 + site.guides[lang.code].length, 0));
  });

  it('lists the other language versions of every page with hreflang, both ways, English as the default', () => {
    for (const page of pages) {
      const links = alternates(page.html);
      const { 'x-default': fallback, ...versions } = links;
      expect(Object.keys(versions).length, page.path).toBeGreaterThan(1);
      expect(Object.values(versions)).toContain(`https://pinch-app.io${page.path}`);
      expect(fallback).toBe(versions.en);
      for (const href of Object.values(versions)) {
        const other = pageAt(href.replace('https://pinch-app.io', ''));
        expect(other, `${page.path} lists ${href}, which is not built`).toBeDefined();
        expect(alternates(other.html)).toEqual(links);
      }
    }
  });

  it('has a language menu of real links to the same page in each language', () => {
    for (const page of pages) {
      const menu = page.html.match(/<details class="lang-menu">[\s\S]*?<\/details>/)[0];
      const links = [...menu.matchAll(/<a href="([^"]+)" lang="([a-z]+)" hreflang="\2" data-lang="\2"( aria-current="true")?>/g)];
      expect(links.map(([, , code]) => code)).toEqual(site.languages.map((lang) => lang.code));
      const versions = alternates(page.html);
      for (const [, href, code, current] of links) {
        // A page with no translation in a language links to that language's home page.
        expect(`https://pinch-app.io${href}`).toBe(versions[code] ?? `https://pinch-app.io${homePath(code)}`);
        expect(Boolean(current)).toBe(href === page.path);
      }
    }
  });

  it('offers the page in the visitor’s language with a hidden banner, and never redirects', () => {
    for (const page of pages) {
      expect(page.html).toContain('<div class="lang-banner" id="lang-banner" hidden>');
      const script = page.html.match(/<div class="lang-banner"[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
      expect(script).not.toMatch(/location\.(replace|assign|href)|http-equiv/);
      expect(script).toContain(`var KEY = '${LANGUAGE_CHOICE_KEY}';`);
      const offers = JSON.parse(script.match(/var OFFERS = (\{.*\});/)[1]);
      const { 'x-default': _, ...versions } = alternates(page.html);
      const pageLang = page.html.match(/<html lang="([a-z]+)"/)[1];
      expect(Object.keys(offers).sort()).toEqual(
        Object.keys(versions)
          .filter((code) => code !== pageLang)
          .sort(),
      );
      for (const [code, offer] of Object.entries(offers)) {
        expect(`https://pinch-app.io${offer.href}`).toBe(versions[code]);
        expect(offer.text).toBe(site.strings[code].lang.banner);
        expect(offer.dir).toBe(SITE_LANGUAGES.find((lang) => lang.code === code).dir);
      }
    }
    expect(new Set(site.languages.map((lang) => site.strings[lang.code].lang.banner)).size).toBe(
      site.languages.length,
    );
  });

  it('keeps links inside a translated guide in that language', () => {
    for (const { code } of translated) {
      for (const guide of site.guides[code]) {
        const { html } = pageAt(guidePath(guide.slug, code));
        const body = html.slice(html.indexOf('class="prose"'));
        for (const [, slug] of body.matchAll(/href="\/guides\/([a-z0-9-]+)\/"/g)) {
          expect(site.guides[code].map((g) => g.slug), `${code}/${guide.slug} links to English ${slug}`).not.toContain(slug);
        }
        expect(html).toContain(`<a class="home-link" href="/${code}/"`);
        expect(html).toContain(`href="/${code}/#guides"`);
      }
    }
  });

  it('falls back to English for a guide with no translation: no page, and links go to the English guide', () => {
    const [{ code }] = translated;
    const [missing, other] = site.guides[code];
    const partial = withoutGuide(code, missing.slug);
    const paths = buildSitePages(partial, templates).map((page) => page.path);
    expect(paths).not.toContain(guidePath(missing.slug, code));
    expect(paths).toContain(guidePath(missing.slug));

    const landing = buildLanding(landingSource, partial, code);
    const english = site.guides.en.find((g) => g.slug === missing.slug);
    expect(landing).toContain(
      `<a class="card guide reveal" id="${missing.slug}" href="/guides/${missing.slug}/" lang="en" hreflang="en">`,
    );
    expect(landing).toContain(`<h3>${escapeHtml(english.meta.title)}</h3>`);
    expect(landing).toContain(`<a class="card guide reveal" id="${other.slug}" href="/${code}/guides/${other.slug}/">`);

    // The English guide no longer lists that language, and its menu sends it to the home page.
    const englishPage = buildGuidePage(guideTemplate, partial, english);
    expect(alternates(englishPage)).not.toHaveProperty(code);
    expect(englishPage).toContain(`<a href="/${code}/" lang="${code}"`);
    expect(buildSitemap(sitemapSource, partial)).not.toContain(`https://pinch-app.io${guidePath(missing.slug, code)}`);
  });

  it('falls back to English for a string with no translation', () => {
    const [{ code }] = translated;
    const { title: _, ...cta } = site.strings[code].cta;
    const partial = { ...site, strings: { ...site.strings, [code]: { ...site.strings[code], cta } } };
    expect(buildLanding(landingSource, partial, code)).toContain(escapeHtml(site.strings.en.cta.title));
  });

  it('rejects a translation of a guide that does not exist in English', () => {
    expect(() => loadGuides(contentDir, 'xx')).toThrow(/not a site language/);
  });
});

describe('translations', () => {
  const english = site.strings.en;
  const englishPaths = keyPaths(english);
  const links = (text) => [...text.matchAll(/\]\(([^)]+)\)/g)].map(([, href]) => href);

  it.each(translated.map((lang) => lang.code))('%s strings match the English file key for key', (code) => {
    const strings = site.strings[code];
    expect(keyPaths(strings)).toEqual(englishPaths);
    for (const path of englishPaths) {
      const source = stringAt(english, path);
      const value = stringAt(strings, path);
      expect(value.trim(), path).not.toBe('');
      // Plain text everywhere but the hero title, which keeps its one highlighted <span>.
      if (path === 'hero.title') expect(value).toMatch(/^[^<>]*<span>[^<>]+<\/span>[^<>]*$/);
      else expect(value, path).not.toMatch(/[<>]|&[a-z]+;|&#/);
      expect(links(value), path).toEqual(links(source));
      expect(value.includes('{date}'), path).toBe(source.includes('{date}'));
    }
    expect(strings.meta.title.startsWith('Pinch: Recipe Library | ')).toBe(true);
    expect(strings.support.failed).toContain(english.support.failed.match(/\S+@\S+\.[a-z]+/)[0]);
  });

  it.each(translated.map((lang) => lang.code))('%s has every guide, translated from the current English', (code) => {
    expect(site.guides[code].map((g) => g.slug)).toEqual(site.guides.en.map((g) => g.slug));
    for (const guide of site.guides[code]) {
      const source = site.guides.en.find((g) => g.slug === guide.slug);
      // Fails when the English guide changes: retranslate, then set sourceUpdated to its new date.
      expect(guide.meta.sourceUpdated, `${code}/${guide.slug} was translated from an older English guide`).toBe(
        source.meta.updated,
      );
      expect(guide.meta.updated >= source.meta.updated).toBe(true);
      expect(guide.meta.title).not.toBe(source.meta.title);
      // Same shape as the English: headings, lists, tables and links.
      for (const tag of ['<h2', '<h3', '<li', '<tr', '<a ']) {
        expect(guide.html.split(tag).length, `${code}/${guide.slug} ${tag}`).toBe(source.html.split(tag).length);
      }
      const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
      expect(hrefs(guide.html)).toEqual(hrefs(source.html));
    }
  });
});
