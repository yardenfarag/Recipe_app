// Builds the guides in content/guides/*.md into pages of their own at /guides/<file name>/,
// from the landing/guide.html template, so search engines and AI assistants can cite each one.
// The landing page gets a card per guide in place of <!-- GUIDES --> and a footer link in place
// of <!-- GUIDE LINKS -->, and the sitemap gets a URL per guide.
// Each file starts with a front matter block of `key: value` lines:
// title, description (the card text and meta description), order, and updated (YYYY-MM-DD).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Marked } from 'marked';

export const SITE_URL = 'https://pinch-app.io';
export const GUIDES_MARKER = '<!-- GUIDES -->';
export const GUIDE_LINKS_MARKER = '<!-- GUIDE LINKS -->';
const REQUIRED_FIELDS = ['title', 'description', 'order', 'updated'];
const GUIDE_PLACEHOLDERS = [
  '{{TITLE}}',
  '{{DESCRIPTION}}',
  '{{URL}}',
  '{{UPDATED}}',
  '{{UPDATED_LABEL}}',
  '{{STRUCTURED_DATA}}',
  '{{BODY}}',
  '{{MORE_GUIDES}}',
];

const marked = new Marked();

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function guidePath(slug) {
  return `/guides/${slug}/`;
}

export function parseGuide(source, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`${file}: bad front matter line "${line}"`);
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field]) throw new Error(`${file}: front matter needs "${field}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) {
    throw new Error(`${file}: "updated" must be a YYYY-MM-DD date`);
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

export function loadGuides(contentDir) {
  const dir = join(contentDir, 'guides');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = join(dir, name);
      const { meta, markdown } = parseGuide(readFileSync(file, 'utf8'), file);
      return { slug: name.slice(0, -3), meta, html: markdownToHtml(markdown) };
    })
    .sort((a, b) => Number(a.meta.order) - Number(b.meta.order));
}

// The id keeps old links like /#save-tiktok-recipes working: the page script follows them here.
export function renderGuides(guides) {
  return guides
    .map(
      (guide) => `<a class="card guide reveal" id="${guide.slug}" href="${guidePath(guide.slug)}">
            <h3>${escapeHtml(guide.meta.title)}</h3>
            <p>${escapeHtml(guide.meta.description)}</p>
          </a>`,
    )
    .join('\n          ');
}

export function renderGuideLinks(guides) {
  return guides
    .map((guide) => `<a href="${guidePath(guide.slug)}">${escapeHtml(guide.meta.title)}</a>`)
    .join('\n          ');
}

export function buildLanding(landingHtml, contentDir) {
  for (const marker of [GUIDES_MARKER, GUIDE_LINKS_MARKER]) {
    if (!landingHtml.includes(marker)) throw new Error(`landing/index.html is missing ${marker}`);
  }
  const guides = loadGuides(contentDir);
  return landingHtml
    .replace(GUIDES_MARKER, renderGuides(guides))
    .replace(GUIDE_LINKS_MARKER, renderGuideLinks(guides));
}

function guideStructuredData(guide, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.meta.title,
    description: guide.meta.description,
    url,
    mainEntityOfPage: url,
    image: `${SITE_URL}/og-image.jpg`,
    dateModified: guide.meta.updated,
    inLanguage: 'en',
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Pinch: Recipe Library',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon-512.png`,
    },
  };
  // `</` would end the script tag early if a title ever contained it.
  return JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildGuidePage(templateHtml, guide, guides) {
  for (const placeholder of GUIDE_PLACEHOLDERS) {
    if (!templateHtml.includes(placeholder)) {
      throw new Error(`landing/guide.html is missing ${placeholder}`);
    }
  }
  const url = `${SITE_URL}${guidePath(guide.slug)}`;
  const others = guides.filter((other) => other.slug !== guide.slug);
  const values = {
    '{{TITLE}}': escapeHtml(guide.meta.title),
    '{{DESCRIPTION}}': escapeHtml(guide.meta.description),
    '{{URL}}': url,
    '{{UPDATED}}': guide.meta.updated,
    '{{UPDATED_LABEL}}': formatDate(guide.meta.updated),
    '{{STRUCTURED_DATA}}': guideStructuredData(guide, url),
    '{{BODY}}': guide.html,
    '{{MORE_GUIDES}}': renderGuideLinks(others),
  };
  // A function replacer, so `$` in a guide is never read as a replacement pattern.
  return templateHtml.replace(/\{\{[A-Z_]+\}\}/g, (placeholder) => values[placeholder] ?? placeholder);
}

// Adds a <url> per guide to public/sitemap.xml.
export function buildSitemap(sitemapXml, guides) {
  if (!sitemapXml.includes('</urlset>')) throw new Error('public/sitemap.xml is missing </urlset>');
  const entries = guides
    .map(
      (guide) => `  <url>
    <loc>${SITE_URL}${guidePath(guide.slug)}</loc>
    <lastmod>${guide.meta.updated}</lastmod>
  </url>
`,
    )
    .join('');
  return sitemapXml.replace('</urlset>', `${entries}</urlset>`);
}

// The landing page's tracking and support form talk to Supabase with the public key.
// Left as placeholders, both are off and Support falls back to email.
export function fillSupabaseConfig(html, url, key) {
  // Trimmed: a secret saved with a trailing newline breaks the JS string and blanks the page.
  const supabaseUrl = (url ?? '').trim().replace(/\/$/, '');
  const supabaseKey = (key ?? '').trim();
  if (!supabaseUrl || !supabaseKey) return html;
  return html.replace('__SUPABASE_URL__', supabaseUrl).replace('__SUPABASE_KEY__', supabaseKey);
}
