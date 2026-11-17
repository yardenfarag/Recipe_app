// Tells Bing (and the other IndexNow search engines) which pinch-app.io pages changed, so they
// re-crawl them within hours instead of weeks. ChatGPT search leans on Bing's index.
//
// A page counts as changed when its <lastmod> in the new sitemap differs from the live one, or it
// is new. So bump lastmod when a page's content changes (guides: `updated` in the front matter;
// the home page and legal pages: public/sitemap.xml).
//
// The deploy workflow runs it twice:
//   node scripts/indexnow.mjs changed dist/sitemap.xml   before the deploy: prints the changed URLs
//   node scripts/indexnow.mjs submit <url> <url> …        after the deploy: sends them
//
// The key is public by design. The build publishes it at /<key>.txt to prove we own the site.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const INDEXNOW_KEY = '5db7262217236666588254ac2a0331e7';
const HOST = 'pinch-app.io';
const LIVE_SITEMAP = `https://${HOST}/sitemap.xml`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// loc → lastmod for every <url> in a sitemap.
export function sitemapEntries(xml) {
  const entries = new Map();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1].trim();
    if (loc) entries.set(loc, /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1].trim() ?? '');
  }
  return entries;
}

// The URLs in newXml that are new or have a different lastmod than in liveXml.
export function changedUrls(liveXml, newXml) {
  const live = sitemapEntries(liveXml);
  return [...sitemapEntries(newXml)].filter(([loc, lastmod]) => live.get(loc) !== lastmod).map(([loc]) => loc);
}

export function submissionBody(urls) {
  return {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

async function changed(sitemapPath) {
  const response = await fetch(LIVE_SITEMAP);
  // No live sitemap yet: every page is new.
  const liveXml = response.ok ? await response.text() : '';
  const urls = changedUrls(liveXml, readFileSync(sitemapPath, 'utf8'));
  console.log(urls.join(' '));
}

async function submit(urls) {
  if (urls.length === 0) {
    console.log('IndexNow: no changed pages');
    return;
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(submissionBody(urls)),
  });
  // 200 = accepted, 202 = accepted while the key is still being checked.
  console.log(`IndexNow: ${response.status} for ${urls.length} URL(s)\n${urls.join('\n')}`);
  if (!response.ok) {
    console.log(await response.text());
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'changed') await changed(args[0]);
  else if (command === 'submit') await submit(args.flatMap((arg) => arg.split(/\s+/)).filter(Boolean));
  else throw new Error('usage: node scripts/indexnow.mjs changed <sitemap.xml> | submit <url>…');
}
