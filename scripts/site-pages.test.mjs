import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildLanding,
  fillSupabaseConfig,
  GUIDES_MARKER,
  loadGuides,
  markdownToHtml,
  parseGuide,
} from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'content');
const landingSource = readFileSync(join(root, 'landing/index.html'), 'utf8');

describe('parseGuide', () => {
  it('reads front matter and the Markdown body, with CRLF line endings too', () => {
    const { meta, markdown } = parseGuide(
      '---\r\ntitle: A: title\r\ndescription: D\r\norder: 2\r\n---\r\nBody',
      'x.md',
    );
    expect(meta).toEqual({ title: 'A: title', description: 'D', order: '2' });
    expect(markdown).toBe('Body');
  });

  it('rejects guides missing front matter or a required field', () => {
    expect(() => parseGuide('---\ntitle: T\norder: 1\n---\n', 'x.md')).toThrow(/description/);
    expect(() => parseGuide('no front matter', 'x.md')).toThrow(/front matter/);
  });
});

describe('markdownToHtml', () => {
  it('nests headings under the guide card and wraps tables', () => {
    const html = markdownToHtml('## Step\n\n### Question\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<h4>Step</h4>');
    expect(html).toContain('<h5>Question</h5>');
    expect(html).toContain('<div class="table-scroll"><table>');
  });
});

describe('landing page', () => {
  const guides = loadGuides(contentDir);
  const landing = buildLanding(landingSource, contentDir);

  it('renders every guide in order, with an anchor', () => {
    expect(guides.map((g) => Number(g.meta.order))).toEqual(
      [...guides.map((g) => Number(g.meta.order))].sort((a, b) => a - b),
    );
    for (const guide of guides) {
      expect(landing).toContain(`<details class="card guide reveal" id="${guide.slug}">`);
    }
    expect(landing).not.toContain(GUIDES_MARKER);
  });

  it('only links to anchors on the page, the app, legal pages, or other sites', () => {
    const ids = new Set([...landing.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
    for (const [, href] of landing.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith('#')) expect(ids, `missing anchor ${href}`).toContain(href.slice(1));
      else expect(href).toMatch(/^(https:|mailto:|\/app\/$|\/[a-z-]+\.(html|png|css)$)/);
    }
  });

  it('keeps the FAQ structured data in step with the visible questions', () => {
    const faq = [...landing.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(([, json]) => JSON.parse(json))
      .find((data) => data['@type'] === 'FAQPage');
    const visible = [...landing.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, q]) => q);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(visible);
  });

  it('fills in Supabase settings only when both are set', () => {
    expect(fillSupabaseConfig(landing, '', 'key')).toBe(landing);
    const filled = fillSupabaseConfig(landing, 'https://x.supabase.co/', 'key');
    expect(filled).toContain("var SUPABASE_URL = 'https://x.supabase.co';");
    expect(filled).toContain("var SUPABASE_KEY = 'key';");
  });
});
