// Renders the guides in content/guides/*.md into the landing page, in place of the
// <!-- GUIDES --> marker in landing/index.html. Each guide becomes a collapsible card
// at /#<file name>. Each file starts with a front matter block of `key: value` lines:
// title, description (shown on the closed card), and order.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Marked } from 'marked';

export const GUIDES_MARKER = '<!-- GUIDES -->';
const REQUIRED_FIELDS = ['title', 'description', 'order'];

// Guides sit under the page's h2 and the card's h3, so their ## becomes h4.
const marked = new Marked({
  walkTokens(token) {
    if (token.type === 'heading') token.depth = Math.min(6, token.depth + 2);
  },
});

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export function renderGuides(guides) {
  return guides
    .map(
      (guide) => `<details class="card guide reveal" id="${guide.slug}">
            <summary>
              <h3>${escapeHtml(guide.meta.title)}</h3>
              <p>${escapeHtml(guide.meta.description)}</p>
            </summary>
            <div class="prose">
${guide.html}
            </div>
          </details>`,
    )
    .join('\n          ');
}

export function buildLanding(landingHtml, contentDir) {
  if (!landingHtml.includes(GUIDES_MARKER)) {
    throw new Error(`landing/index.html is missing ${GUIDES_MARKER}`);
  }
  return landingHtml.replace(GUIDES_MARKER, renderGuides(loadGuides(contentDir)));
}

// The landing page's tracking and support form talk to Supabase with the public key.
// Left as placeholders, both are off and Support falls back to email.
export function fillSupabaseConfig(html, url, key) {
  const supabaseUrl = (url ?? '').replace(/\/$/, '');
  if (!supabaseUrl || !key) return html;
  return html.replace('__SUPABASE_URL__', supabaseUrl).replace('__SUPABASE_KEY__', key);
}
