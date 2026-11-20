// Builds the pages of pinch-app.io, once per language:
//   /                   the landing page, from landing/index.html
//   /guides/<name>/     a page per guide in content/guides/*.md, from landing/guide.html
//   /<lang>/…           the same pages in each other language (see SITE_LANGUAGES)
// so search engines and AI assistants can cite each one in the reader's language.
//
// Text comes from two places:
//   landing/strings/<lang>.json   every string in the two templates ({{t:key}}, or {{h:key}} for
//                                 the one string that carries HTML). English is en.json.
//   content/guides/<lang>/*.md    a guide's translation, under the same file name as the English.
// A language is live once it has a strings file. A string or a guide that has no translation
// falls back to English: the string is shown in English, and links go to the English guide.
//
// Each guide starts with a front matter block of `key: value` lines: title, description (the card
// text and meta description), order, and updated (YYYY-MM-DD). A translation leaves out order and
// adds sourceUpdated: the English guide's `updated` date it was translated from.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Marked } from 'marked';

export const SITE_URL = 'https://pinch-app.io';
export const DEFAULT_LANGUAGE = 'en';
// The app's languages (shared/lib/appLanguages.ts), in the same order.
export const SITE_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr', dateLocale: 'en-US' },
  { code: 'es', label: 'Español', dir: 'ltr', dateLocale: 'es' },
  { code: 'he', label: 'עברית', dir: 'rtl', dateLocale: 'he' },
  { code: 'ru', label: 'Русский', dir: 'ltr', dateLocale: 'ru' },
  // Western digits, like the rest of the Arabic copy.
  { code: 'ar', label: 'العربية', dir: 'rtl', dateLocale: 'ar-u-nu-latn' },
];
export const GUIDES_MARKER = '<!-- GUIDES -->';
export const GUIDE_LINKS_MARKER = '<!-- GUIDE LINKS -->';
// What the language menu and banner remember, so a visitor who chose is not asked again.
export const LANGUAGE_CHOICE_KEY = 'pinch:site-language';

const REQUIRED_FIELDS = ['title', 'description', 'order', 'updated'];
const TRANSLATION_FIELDS = ['title', 'description', 'updated', 'sourceUpdated'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LANDING_PLACEHOLDERS = [
  'LANG',
  'DIR',
  'URL',
  'ALTERNATES',
  'STRUCTURED_DATA',
  'LANG_BANNER',
  'LANG_MENU',
  'FAQ',
  'SUPPORT_TEXT',
];
const GUIDE_PLACEHOLDERS = [
  'LANG',
  'DIR',
  'TITLE',
  'DESCRIPTION',
  'URL',
  'ALTERNATES',
  'UPDATED',
  'UPDATED_LINE',
  'STRUCTURED_DATA',
  'LANG_BANNER',
  'LANG_MENU',
  'HOME',
  'BODY',
  'MORE_GUIDES',
  'SUPPORT_TEXT',
];
// Section subtitles a language may leave out ("") when no line reads well in it: the paragraph
// is dropped, rather than shown in English.
export const OPTIONAL_STRINGS = ['features.sub', 'how.sub', 'compare.sub', 'guides.sub'];
// Everything the support form (landing/support.js) shows, in the page's language.
const SUPPORT_TEXT_KEYS = [
  'title',
  'intro',
  'name',
  'email',
  'subject',
  'message',
  'cancel',
  'send',
  'required',
  'badEmail',
  'sending',
  'thanks',
  'failed',
];

const marked = new Marked();

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// JSON for an inline <script>: `</` would end the script tag early.
function scriptJson(data, indent) {
  return JSON.stringify(data, null, indent).replace(/<\//g, '<\\/');
}

function language(code) {
  const found = SITE_LANGUAGES.find((lang) => lang.code === code);
  if (!found) throw new Error(`"${code}" is not a site language`);
  return found;
}

export function homePath(lang = DEFAULT_LANGUAGE) {
  return lang === DEFAULT_LANGUAGE ? '/' : `/${lang}/`;
}

export function guidePath(slug, lang = DEFAULT_LANGUAGE) {
  return `${homePath(lang)}guides/${slug}/`;
}

export function parseGuide(source, file, requiredFields = REQUIRED_FIELDS) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`${file}: bad front matter line "${line}"`);
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  for (const field of requiredFields) {
    if (!meta[field]) throw new Error(`${file}: front matter needs "${field}"`);
  }
  for (const field of ['updated', 'sourceUpdated']) {
    if (meta[field] && !DATE.test(meta[field])) {
      throw new Error(`${file}: "${field}" must be a YYYY-MM-DD date`);
    }
  }
  return { meta, markdown: match[2] };
}

export function markdownToHtml(markdown) {
  // Wide tables scroll sideways on phones instead of squeezing the page.
  return marked
    .parse(markdown, { async: false })
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

function readGuides(dir, lang, requiredFields) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = join(dir, name);
      const { meta, markdown } = parseGuide(readFileSync(file, 'utf8'), file, requiredFields);
      return { slug: name.slice(0, -3), lang, meta, html: markdownToHtml(markdown) };
    });
}

// The guides in one language, in the English guides' order. A translation is only a guide when
// the English guide of the same name exists.
export function loadGuides(contentDir, lang = DEFAULT_LANGUAGE) {
  const english = readGuides(join(contentDir, 'guides'), DEFAULT_LANGUAGE, REQUIRED_FIELDS).sort(
    (a, b) => Number(a.meta.order) - Number(b.meta.order),
  );
  if (lang === DEFAULT_LANGUAGE) return english;
  const dir = join(contentDir, 'guides', language(lang).code);
  if (!existsSync(dir)) return [];
  const translations = new Map(readGuides(dir, lang, TRANSLATION_FIELDS).map((guide) => [guide.slug, guide]));
  for (const slug of translations.keys()) {
    if (!english.some((guide) => guide.slug === slug)) {
      throw new Error(`${join(dir, `${slug}.md`)}: no English guide named "${slug}"`);
    }
  }
  return english
    .filter((guide) => translations.has(guide.slug))
    .map((guide) => {
      const translation = translations.get(guide.slug);
      return { ...translation, meta: { ...translation.meta, order: guide.meta.order } };
    });
}

// Everything the pages are built from: the live languages, their strings and their guides.
export function loadSite(root) {
  const stringsFile = (code) => join(root, 'landing', 'strings', `${code}.json`);
  if (!existsSync(stringsFile(DEFAULT_LANGUAGE))) throw new Error('landing/strings/en.json is missing');
  const languages = SITE_LANGUAGES.filter((lang) => existsSync(stringsFile(lang.code)));
  const strings = {};
  const guides = {};
  for (const { code } of languages) {
    strings[code] = JSON.parse(readFileSync(stringsFile(code), 'utf8'));
    guides[code] = loadGuides(join(root, 'content'), code);
  }
  return { languages, strings, guides };
}

function lookup(strings, key) {
  return key.split('.').reduce((value, part) => (value == null ? undefined : value[part]), strings);
}

// A string in `lang`, or in English when the translation is missing.
function translator(site, lang) {
  return (key) => {
    const value = lookup(site.strings[lang], key) ?? lookup(site.strings[DEFAULT_LANGUAGE], key);
    if (value === undefined) throw new Error(`landing/strings/en.json has no "${key}"`);
    return value;
  };
}

function findGuide(site, slug, lang) {
  return site.guides[lang]?.find((guide) => guide.slug === slug);
}

// The guide as `lang` readers get it: the translation, or the English guide when there is none.
function guideFor(site, slug, lang) {
  return findGuide(site, slug, lang) ?? findGuide(site, slug, DEFAULT_LANGUAGE);
}

// Every language a page exists in, English first. `page` is { lang } for a landing page or
// { lang, slug } for a guide.
function versions(site, page) {
  return site.languages
    .filter((lang) => !page.slug || findGuide(site, page.slug, lang.code))
    .map((lang) => ({
      ...lang,
      path: page.slug ? guidePath(page.slug, lang.code) : homePath(lang.code),
    }));
}

function renderAlternates(site, page) {
  const all = versions(site, page);
  if (all.length < 2) return '';
  return [...all.map((v) => [v.code, v.path]), ['x-default', all[0].path]]
    .map(([code, path]) => `<link rel="alternate" hreflang="${code}" href="${SITE_URL}${path}" />`)
    .join('\n    ');
}

// Real links, so it works without JavaScript and crawlers can follow it to every language.
// A page with no translation in a language links to that language's home page.
function renderLanguageMenu(site, page) {
  if (site.languages.length < 2) return '';
  const t = translator(site, page.lang);
  const paths = new Map(versions(site, page).map((v) => [v.code, v.path]));
  const links = site.languages
    .map((lang) => {
      const current = lang.code === page.lang ? ' aria-current="true"' : '';
      const href = paths.get(lang.code) ?? homePath(lang.code);
      return `<a href="${href}" lang="${lang.code}" hreflang="${lang.code}" data-lang="${lang.code}"${current}>${escapeHtml(lang.label)}</a>`;
    })
    .join('\n          ');
  return `<details class="lang-menu">
        <summary aria-label="${escapeHtml(t('lang.menuLabel'))}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 3.75 5.5 3.75 9S14.5 18.5 12 21c-2.5-2.5-3.75-5.5-3.75-9S9.5 5.5 12 3z" />
          </svg>
          <span lang="${page.lang}">${escapeHtml(language(page.lang).label)}</span>
        </summary>
        <div class="lang-list">
          ${links}
        </div>
      </details>`;
}

// A slim bar above the page that offers it in the visitor's browser language. Nobody is
// redirected. It starts hidden and its script runs before the page below it paints, so it never
// shifts the layout, and crawlers and visitors without JavaScript never see it. Each offer is
// written in its own language, so every page carries all of them.
function renderLanguageBanner(site, page) {
  if (site.languages.length < 2) return '';
  const offers = {};
  for (const version of versions(site, page)) {
    if (version.code === page.lang) continue;
    const t = translator(site, version.code);
    offers[version.code] = {
      href: version.path,
      dir: version.dir,
      text: t('lang.banner'),
      close: t('lang.dismiss'),
    };
  }
  return `<div class="lang-banner" id="lang-banner" hidden>
      <a id="lang-banner-link" href="${homePath(page.lang)}"></a>
      <button type="button" id="lang-banner-close">×</button>
    </div>
    <script>
      (function () {
        var KEY = '${LANGUAGE_CHOICE_KEY}';
        var PAGE = '${page.lang}';
        var OFFERS = ${scriptJson(offers)};
        function remember(value) {
          try {
            localStorage.setItem(KEY, value);
          } catch (e) {}
        }
        // A pick in the language menu (or the banner) is remembered, and the menu closes on a click outside it.
        document.addEventListener('click', function (event) {
          var link = event.target.closest && event.target.closest('[data-lang]');
          if (link) remember(link.getAttribute('data-lang'));
          var menu = document.querySelector('.lang-menu');
          if (menu && menu.open && !menu.contains(event.target)) menu.open = false;
        });
        try {
          if (localStorage.getItem(KEY)) return;
        } catch (e) {}
        // The visitor's languages in their order of preference: the first one we have wins,
        // and when that is this page's language there is nothing to offer.
        var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
        for (var i = 0; i < wanted.length; i++) {
          var code = String(wanted[i]).toLowerCase().split('-')[0];
          if (code === 'iw') code = 'he';
          if (code === PAGE) return;
          if (!OFFERS[code]) continue;
          var banner = document.getElementById('lang-banner');
          var link = document.getElementById('lang-banner-link');
          var close = document.getElementById('lang-banner-close');
          banner.dir = OFFERS[code].dir;
          link.href = OFFERS[code].href;
          link.lang = code;
          link.setAttribute('data-lang', code);
          link.textContent = OFFERS[code].text;
          close.setAttribute('aria-label', OFFERS[code].close);
          close.addEventListener('click', function () {
            banner.hidden = true;
            remember('dismissed');
          });
          banner.hidden = false;
          return;
        }
      })();
    </script>`;
}

// A card (or a footer link) per guide, in the page's language where the guide is translated.
function guideLinks(site, lang, slugs) {
  return slugs.map((slug) => {
    const guide = guideFor(site, slug, lang);
    // An untranslated guide is marked as English for screen readers and crawlers.
    const foreign = guide.lang === lang ? '' : ` lang="${guide.lang}" hreflang="${guide.lang}"`;
    return { guide, href: guidePath(slug, guide.lang), foreign };
  });
}

function allSlugs(site) {
  return site.guides[DEFAULT_LANGUAGE].map((guide) => guide.slug);
}

// The id keeps old links like /#save-tiktok-recipes working: the page script follows them here.
function renderGuides(site, lang) {
  return guideLinks(site, lang, allSlugs(site))
    .map(
      ({ guide, href, foreign }) => `<a class="card guide reveal" id="${guide.slug}" href="${href}"${foreign}>
            <h3>${escapeHtml(guide.meta.title)}</h3>
            <p>${escapeHtml(guide.meta.description)}</p>
          </a>`,
    )
    .join('\n          ');
}

function renderGuideLinks(site, lang, slugs = allSlugs(site)) {
  return guideLinks(site, lang, slugs)
    .map(({ guide, href, foreign }) => `<a href="${href}"${foreign}>${escapeHtml(guide.meta.title)}</a>`)
    .join('\n          ');
}

// FAQ answers are plain text with Markdown links: [text](/path).
const ANSWER_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function answerHtml(text) {
  return escapeHtml(text).replace(ANSWER_LINK, '<a href="$2">$1</a>');
}

function answerText(text) {
  return text.replace(ANSWER_LINK, '$1');
}

function renderFaq(items) {
  return items
    .map(({ q, a, more }, index) => {
      const answer = more ? `${a} ${more}` : a;
      return `<details class="card reveal"${index === 0 ? ' open' : ''}>
            <summary>${escapeHtml(q)}</summary>
            <p>${answerHtml(answer)}</p>
          </details>`;
    })
    .join('\n          ');
}

const APP_STORE_URL = 'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pinch.myapp';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const STORE_NAME = 'Pinch: Recipe Library';

// The landing page's structured data: who Pinch is, the three apps, and the FAQ.
function landingStructuredData(site, lang) {
  const t = translator(site, lang);
  const named = { name: STORE_NAME, alternateName: ['Pinch', 'Pinch Recipe Library'] };
  const appLanguages = SITE_LANGUAGES.map(({ code }) => code);
  const free = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };
  const publisher = { '@id': ORGANIZATION_ID };
  const mobileApp = (id, operatingSystem, storeUrl) => ({
    '@type': 'MobileApplication',
    '@id': `${SITE_URL}/#${id}`,
    ...named,
    url: `${SITE_URL}/`,
    description: t('meta.appDescription'),
    operatingSystem,
    applicationCategory: 'LifestyleApplication',
    applicationSubCategory: 'Food & Drink',
    image: `${SITE_URL}/icon-512.png`,
    installUrl: storeUrl,
    sameAs: [storeUrl],
    inLanguage: appLanguages,
    offers: free,
    publisher,
  });
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        ...named,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon-512.png`,
        disambiguatingDescription: t('meta.disambiguation'),
        sameAs: [APP_STORE_URL, PLAY_STORE_URL],
      },
      mobileApp('ios-app', 'iOS', APP_STORE_URL),
      mobileApp('android-app', 'Android', PLAY_STORE_URL),
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#web-app`,
        ...named,
        url: `${SITE_URL}/app/`,
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        applicationCategory: 'LifestyleApplication',
        offers: free,
        publisher,
      },
    ],
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: t('faq.items').map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: answerText(a) },
    })),
  };
  return [graph, faq]
    .map((data) => `<script type="application/ld+json">\n${scriptJson(data, 2)}\n    </script>`)
    .join('\n    ');
}

function guideStructuredData(guide, url) {
  return scriptJson(
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.meta.title,
      description: guide.meta.description,
      url,
      mainEntityOfPage: url,
      image: `${SITE_URL}/og-image.jpg`,
      dateModified: guide.meta.updated,
      inLanguage: guide.lang,
      author: { '@id': ORGANIZATION_ID },
      publisher: {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: STORE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon-512.png`,
      },
    },
    2,
  );
}

function formatDate(isoDate, lang) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(language(lang).dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// "Updated {date}", with the date as a <time> wherever the language puts it.
function updatedLine(t, guide) {
  const time = `<time datetime="${guide.meta.updated}">${escapeHtml(formatDate(guide.meta.updated, guide.lang))}</time>`;
  return escapeHtml(t('guides.updated')).replace('{date}', time);
}

// Fills a template: {{t:key}} is a string as text, {{h:key}} a string that carries its own HTML,
// and {{NAME}} a value built here. Function replacers, so `$` in a guide is never read as a
// replacement pattern.
function fill(templateHtml, file, placeholders, values, t) {
  for (const name of placeholders) {
    if (!templateHtml.includes(`{{${name}}}`)) throw new Error(`${file} is missing {{${name}}}`);
  }
  return templateHtml
    .replace(/\r?\n[ \t]*<p[^>]*>\{\{t:([\w.]+)\}\}<\/p>/g, (line, key) =>
      OPTIONAL_STRINGS.includes(key) && t(key) === '' ? '' : line,
    )
    .replace(/\{\{(t|h):([\w.]+)\}\}/g, (_, mode, key) => (mode === 't' ? escapeHtml(t(key)) : t(key)))
    .replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, name) => values[name] ?? placeholder);
}

function supportText(t) {
  return scriptJson(Object.fromEntries(SUPPORT_TEXT_KEYS.map((key) => [key, t(`support.${key}`)])));
}

export function buildLanding(landingHtml, site, lang = DEFAULT_LANGUAGE) {
  for (const marker of [GUIDES_MARKER, GUIDE_LINKS_MARKER]) {
    if (!landingHtml.includes(marker)) throw new Error(`landing/index.html is missing ${marker}`);
  }
  const t = translator(site, lang);
  const page = { lang };
  const values = {
    LANG: lang,
    DIR: language(lang).dir,
    URL: `${SITE_URL}${homePath(lang)}`,
    ALTERNATES: renderAlternates(site, page),
    STRUCTURED_DATA: landingStructuredData(site, lang),
    LANG_BANNER: renderLanguageBanner(site, page),
    LANG_MENU: renderLanguageMenu(site, page),
    FAQ: renderFaq(t('faq.items')),
    SUPPORT_TEXT: supportText(t),
  };
  return fill(landingHtml, 'landing/index.html', LANDING_PLACEHOLDERS, values, t)
    .replace(GUIDES_MARKER, () => renderGuides(site, lang))
    .replace(GUIDE_LINKS_MARKER, () => renderGuideLinks(site, lang));
}

// Links between guides stay in the reader's language where the other guide is translated.
function localizeGuideLinks(html, site, lang) {
  if (lang === DEFAULT_LANGUAGE) return html;
  return html.replace(/href="\/guides\/([a-z0-9-]+)\/"/g, (link, slug) =>
    findGuide(site, slug, lang) ? `href="${guidePath(slug, lang)}"` : link,
  );
}

export function buildGuidePage(templateHtml, site, guide) {
  const { lang, slug } = guide;
  const t = translator(site, lang);
  const page = { lang, slug };
  const url = `${SITE_URL}${guidePath(slug, lang)}`;
  const others = allSlugs(site).filter((other) => other !== slug);
  const values = {
    LANG: lang,
    DIR: language(lang).dir,
    TITLE: escapeHtml(guide.meta.title),
    DESCRIPTION: escapeHtml(guide.meta.description),
    URL: url,
    ALTERNATES: renderAlternates(site, page),
    UPDATED: guide.meta.updated,
    UPDATED_LINE: updatedLine(t, guide),
    STRUCTURED_DATA: guideStructuredData(guide, url),
    LANG_BANNER: renderLanguageBanner(site, page),
    LANG_MENU: renderLanguageMenu(site, page),
    HOME: homePath(lang),
    BODY: localizeGuideLinks(guide.html, site, lang),
    MORE_GUIDES: renderGuideLinks(site, lang, others),
    SUPPORT_TEXT: supportText(t),
  };
  return fill(templateHtml, 'landing/guide.html', GUIDE_PLACEHOLDERS, values, t);
}

// Every page of the site as { path, html }: a landing page per live language, and a page per
// guide in each language it is written in.
export function buildSitePages(site, { landingHtml, guideHtml }) {
  const pages = [];
  for (const { code } of site.languages) {
    pages.push({ path: homePath(code), html: buildLanding(landingHtml, site, code) });
    for (const guide of site.guides[code]) {
      pages.push({ path: guidePath(guide.slug, code), html: buildGuidePage(guideHtml, site, guide) });
    }
  }
  return pages;
}

function sitemapUrl(site, page, lastmod) {
  const all = versions(site, page);
  const path = all.find((v) => v.code === page.lang).path;
  const alternates =
    all.length < 2
      ? ''
      : [...all.map((v) => [v.code, v.path]), ['x-default', all[0].path]]
          .map(
            ([code, href]) =>
              `    <xhtml:link rel="alternate" hreflang="${code}" href="${SITE_URL}${href}" />\n`,
          )
          .join('');
  return `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
${alternates}  </url>
`;
}

// Adds the landing page in every language and a <url> per guide per language to
// public/sitemap.xml. Each one lists its other language versions.
export function buildSitemap(sitemapXml, site) {
  const home = /  <url>\s*<loc>https:\/\/pinch-app\.io\/<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>\r?\n/;
  const match = home.exec(sitemapXml);
  if (!match) throw new Error('public/sitemap.xml is missing the home page <url> with a lastmod');
  if (!sitemapXml.includes('</urlset>')) throw new Error('public/sitemap.xml is missing </urlset>');
  const homes = site.languages.map(({ code }) => sitemapUrl(site, { lang: code }, match[1])).join('');
  const guides = site.languages
    .flatMap(({ code }) =>
      site.guides[code].map((guide) => sitemapUrl(site, { lang: code, slug: guide.slug }, guide.meta.updated)),
    )
    .join('');
  const xhtml = site.languages.length < 2 ? '' : 'xmlns:xhtml="http://www.w3.org/1999/xhtml" ';
  return sitemapXml
    .replace('<urlset ', `<urlset ${xhtml}`)
    .replace(home, () => homes)
    .replace('</urlset>', () => `${guides}</urlset>`);
}

// /llms.txt for AI assistants, from landing/llms.txt: {{GUIDES}} becomes a link per English guide
// with its description, and {{LANGUAGES}} a link to the home page in each other language.
export function buildLlmsTxt(template, site) {
  for (const marker of ['{{GUIDES}}', '{{LANGUAGES}}']) {
    if (!template.includes(marker)) throw new Error(`landing/llms.txt is missing ${marker}`);
  }
  const guides = site.guides[DEFAULT_LANGUAGE]
    .map((guide) => `- [${guide.meta.title}](${SITE_URL}${guidePath(guide.slug)}): ${guide.meta.description}`)
    .join('\n');
  const languages = site.languages
    .filter(({ code }) => code !== DEFAULT_LANGUAGE)
    .map(({ code, label }) => `- [${label}](${SITE_URL}${homePath(code)})`)
    .join('\n');
  return template.replace('{{GUIDES}}', () => guides).replace('{{LANGUAGES}}', () => languages);
}

// The landing page's tracking and the support form (landing/support.js) talk to Supabase with
// the public key. Left as placeholders, tracking is off and the form says it couldn't send.
export function fillSupabaseConfig(html, url, key) {
  // Trimmed: a secret saved with a trailing newline breaks the JS string and blanks the page.
  const supabaseUrl = (url ?? '').trim().replace(/\/$/, '');
  const supabaseKey = (key ?? '').trim();
  if (!supabaseUrl || !supabaseKey) return html;
  return html.replace('__SUPABASE_URL__', supabaseUrl).replace('__SUPABASE_KEY__', supabaseKey);
}
