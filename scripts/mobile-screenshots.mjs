#!/usr/bin/env node
/**
 * Screenshots of the mobile app (Expo web at phone size), signed in with canned data, in every language and colour
 * scheme asked for. For checking a restyle (PIN-177) without a device and without touching production.
 *
 *   node scripts/mobile-screenshots.mjs --out <folder> [--screens library,recipe,...] [--langs en,he]
 *     [--schemes light,dark] [--pack mist] [--port 8095] [--no-server] [--concurrency 3] [--viewport-only]
 *
 * - Starts `expo start --web` itself (file watching off) with a fake Supabase address, waits for the bundle, and stops
 *   it at the end. `--no-server` reuses one already running on --port; start it the same way:
 *     CI=1 EXPO_PUBLIC_SUPABASE_URL=http://pinch-fake.local EXPO_PUBLIC_SUPABASE_KEY=x npx expo start --web --port 8095
 * - Every request to the fake Supabase host is answered in the browser from scripts/mobile-screenshots.fixtures.mjs.
 *   Requests to any other outside host are blocked, and a request to *.supabase.co fails the run.
 * - Writes `<screen>-<lang>-<scheme>.png` (390×844 at 2x, grown to the full scroll height unless --viewport-only).
 * - Drives Microsoft Edge (or Chrome) through playwright-core, taken from web/node_modules, node_modules, or a copy
 *   installed once under the system temp folder.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as F from './mobile-screenshots.fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT_VERSION = '1.65.1';

// ---------------------------------------------------------------------------------------------------------------
// Screens


/** The recipe editor's "Add appliance" button (web.editor.addAppliance), which opens a sheet. */
const ADD_APPLIANCE_LABEL = { en: 'Add appliance', he: 'הוספת כלי', ar: 'إضافة أداة', es: 'Añadir utensilio', ru: 'Добавить технику' };

const SCREENS = {
  library: { path: '/' },
  // A new account: no recipes or collections yet.
  'library-empty': { path: '/', emptyLibrary: true, viewportOnly: true },
  recipe: { path: `/recipe/${F.MAIN_RECIPE_ID}` },
  cook: {
    // ?cook=1 opens cook mode once the recipe has loaded, as the Library's "Start cooking" does (PIN-177).
    path: `/recipe/${F.MAIN_RECIPE_ID}?cook=1`,
    async after(page) {
      await page.waitForTimeout(1200);
    },
    // A modal over the recipe: grow the page and it only stretches the backdrop.
    viewportOnly: true,
  },
  snap: { path: '/add' },
  hub: { path: '/hub' },
  list: { path: '/list' },
  settings: { path: '/settings' },
  credits: { path: '/settings/credits' },
  appearance: { path: '/settings/appearance' },
  cookbook: { path: '/cookbook' },
  onboarding: { path: '/onboarding', viewportOnly: true },
  // A question step of onboarding (4: the diets), resumed from storage.
  'onboarding-diet': { path: '/onboarding', viewportOnly: true, storage: { 'pinch:onboardingStep': '4' } },
  // Sign-in and sign-up, signed out (no session in storage).
  auth: { path: '/auth?mode=signin', signedOut: true },
  signup: { path: '/auth?mode=signup', signedOut: true },
  editor: { path: `/recipe/edit?id=${F.MAIN_RECIPE_ID}` },
  // The editor's appliance picker: the shared SheetModal.
  sheet: {
    path: `/recipe/edit?id=${F.MAIN_RECIPE_ID}`,
    async after(page, { lang }) {
      const label = ADD_APPLIANCE_LABEL[lang] ?? ADD_APPLIANCE_LABEL.en;
      const button = page.getByRole('button', { name: label }).first();
      await button.scrollIntoViewIfNeeded({ timeout: 15000 });
      await button.click();
      await page.waitForTimeout(1200);
    },
    viewportOnly: true,
  },
  kit: { path: '/admin/kit' },
};

// ---------------------------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const opts = {
    out: null,
    screens: Object.keys(SCREENS),
    langs: ['en', 'he'],
    schemes: ['light', 'dark'],
    pack: 'mist',
    port: 8095,
    server: true,
    concurrency: 3,
    viewportOnly: false,
  };
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined];
    const value = () => inline ?? argv[++i];
    switch (flag) {
      case '--out': opts.out = value(); break;
      case '--screens': opts.screens = list(value()); break;
      case '--langs': opts.langs = list(value()); break;
      case '--schemes': opts.schemes = list(value()); break;
      case '--pack': opts.pack = value(); break;
      case '--port': opts.port = Number(value()); break;
      case '--concurrency': opts.concurrency = Math.max(1, Number(value())); break;
      case '--no-server': opts.server = false; break;
      case '--viewport-only': opts.viewportOnly = true; break;
      case '-h': case '--help': usage(0); break;
      default: console.error(`Unknown option: ${arg}`); usage(1);
    }
  }
  if (!opts.out) { console.error('--out <folder> is required.'); usage(1); }
  const unknown = opts.screens.filter((s) => !SCREENS[s]);
  if (unknown.length) { console.error(`Unknown screen(s): ${unknown.join(', ')}. Known: ${Object.keys(SCREENS).join(', ')}`); process.exit(1); }
  const badScheme = opts.schemes.filter((s) => s !== 'light' && s !== 'dark');
  if (badScheme.length) { console.error(`Schemes are light and dark, not ${badScheme.join(', ')}`); process.exit(1); }
  opts.out = path.resolve(opts.out);
  return opts;
}

function usage(code) {
  console.log(`Usage: node scripts/mobile-screenshots.mjs --out <folder> [options]

  --screens a,b     ${Object.keys(SCREENS).join(',')} (default: all)
  --langs en,he     app languages (en, he, ar, es, ru)
  --schemes light,dark
  --pack mist       theme pack
  --port 8095       Expo web port
  --no-server       use an Expo web server already running on --port (started with the fake Supabase env)
  --concurrency 3   pages shot at once
  --viewport-only   keep 390x844 instead of growing to the full scroll height`);
  process.exit(code);
}

// ---------------------------------------------------------------------------------------------------------------
// playwright-core

async function loadChromium() {
  const cacheDir = path.join(os.tmpdir(), 'pinch-mobile-screenshots');
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    path.join(ROOT, 'web', 'node_modules', 'playwright-core'),
    path.join(ROOT, 'node_modules', 'playwright-core'),
    path.join(cacheDir, 'node_modules', 'playwright-core'),
  ].filter(Boolean);
  let found = candidates.find((dir) => existsSync(path.join(dir, 'package.json')));
  if (!found) {
    console.log(`playwright-core not found; installing ${PLAYWRIGHT_VERSION} into ${cacheDir} (once)...`);
    await mkdir(cacheDir, { recursive: true });
    // A package.json of its own, or npm walks up and installs into a parent folder.
    const pkg = path.join(cacheDir, 'package.json');
    if (!existsSync(pkg)) await writeFile(pkg, JSON.stringify({ name: 'pinch-mobile-screenshots', private: true }) + '\n');
    const result = spawnSync('npm', ['install', '--no-audit', '--no-fund', `playwright-core@${PLAYWRIGHT_VERSION}`], {
      cwd: cacheDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) throw new Error('Could not install playwright-core. Run `npm ci` in web/ and try again.');
    found = path.join(cacheDir, 'node_modules', 'playwright-core');
  }
  const mod = await import(pathToFileURL(path.join(found, 'index.mjs')).href);
  return mod.chromium ?? mod.default.chromium;
}

async function launchBrowser(chromium) {
  const errors = [];
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (err) {
      errors.push(`${channel ?? 'bundled chromium'}: ${String(err.message).split('\n')[0]}`);
    }
  }
  throw new Error(`No browser could be started:\n  ${errors.join('\n  ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Expo web server

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function startExpo(port) {
  const env = {
    ...process.env,
    CI: '1',
    BROWSER: 'none',
    EXPO_NO_TELEMETRY: '1',
    // Set here, they win over any .env file, so the app only ever talks to the fake host.
    EXPO_PUBLIC_SUPABASE_URL: F.FAKE_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_KEY: F.FAKE_SUPABASE_KEY,
    EXPO_PUBLIC_FUNCTION_PREVIEWS: '',
  };
  const child = spawn('npx', ['expo', 'start', '--web', '--port', String(port)], {
    cwd: ROOT,
    env,
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  const keep = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) log.push(line);
    if (log.length > 200) log.splice(0, log.length - 200);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return { child, log };
}

function stopExpo(server) {
  if (!server || server.child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-server.child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

/** Waits for the page, then for Metro to finish the web bundle, so the first screenshot doesn't time out. */
async function waitForApp(baseUrl, server, timeoutMs = 5 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  let html = null;
  while (Date.now() < deadline) {
    if (server && server.child.exitCode !== null) {
      throw new Error(`Expo exited (code ${server.child.exitCode}):\n${server.log.slice(-30).join('\n')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) { html = await res.text(); break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!html) throw new Error(`Expo web did not answer at ${baseUrl} within ${timeoutMs / 1000}s`);
  const origin = new URL(baseUrl).origin;
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const res = await fetch(new URL(src, origin), { signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    if (!res.ok) throw new Error(`Bundle ${src} failed: HTTP ${res.status}\n${(await res.text()).slice(0, 2000)}`);
    await res.arrayBuffer();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The fake Supabase

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
  'access-control-expose-headers': 'content-range, x-total-count',
};

function svgPhoto(key) {
  const p = F.PHOTOS[key] ?? { from: '#9CA3AF', to: '#4B5563', emoji: '🍽️' };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/></linearGradient>
<radialGradient id="l" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="800" height="800" fill="url(#g)"/><rect width="800" height="800" fill="url(#l)"/>
<circle cx="400" cy="420" r="250" fill="#fff" fill-opacity="0.16"/><circle cx="400" cy="420" r="200" fill="#fff" fill-opacity="0.12"/>
<text x="400" y="490" font-size="210" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${p.emoji}</text>
</svg>`;
}

function parseList(raw) {
  // (a,b,"c,d") or {a,b}
  const inner = raw.replace(/^[({]|[)}]$/g, '');
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of inner) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur || inner.length) out.push(cur);
  return out;
}

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === 'number' || (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '')) {
    return na - nb;
  }
  return String(a) < String(b) ? -1 : 1;
}

function matches(row, column, expr) {
  let negate = false;
  if (expr.startsWith('not.')) { negate = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const value = row[column];
  let ok;
  switch (op) {
    case 'eq': ok = value !== null && value !== undefined && String(value) === raw; break;
    case 'neq': ok = String(value) !== raw; break;
    case 'gt': ok = value != null && compare(value, raw) > 0; break;
    case 'gte': ok = value != null && compare(value, raw) >= 0; break;
    case 'lt': ok = value != null && compare(value, raw) < 0; break;
    case 'lte': ok = value != null && compare(value, raw) <= 0; break;
    case 'is': ok = raw === 'null' ? value == null : String(value) === raw; break;
    case 'in': ok = parseList(raw).includes(String(value)); break;
    case 'cs': ok = Array.isArray(value) && parseList(raw).every((v) => value.includes(v)); break;
    case 'like':
    case 'ilike': {
      const re = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*')}$`, op === 'ilike' ? 'i' : '');
      ok = value != null && re.test(String(value));
      break;
    }
    default: ok = true; // or=, fts and friends: not modelled, keep the row
  }
  return negate ? !ok : ok;
}

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);

function queryRows(rows, url, headers) {
  let out = rows.slice();
  for (const [key, expr] of url.searchParams) {
    if (RESERVED_PARAMS.has(key) || key.includes('.')) continue;
    out = out.filter((row) => matches(row, key, expr));
  }
  const order = url.searchParams.get('order');
  if (order) {
    const keys = order.split(',').map((part) => {
      const [col, ...mods] = part.split('.');
      return { col, desc: mods.includes('desc') };
    });
    out.sort((a, b) => {
      for (const { col, desc } of keys) {
        const c = compare(a[col], b[col]);
        if (c !== 0) return desc ? -c : c;
      }
      return 0;
    });
  }
  const total = out.length;
  let offset = Number(url.searchParams.get('offset') ?? 0);
  let limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
  const range = headers.range?.match(/(\d+)-(\d+)?/);
  if (range) {
    offset = Number(range[1]);
    if (range[2] !== undefined) limit = Number(range[2]) - offset + 1;
  }
  out = out.slice(offset, offset + limit);
  return { rows: out, total, offset };
}

function createFakeSupabase(state) {
  const { lang, scheme, pack, unmocked, emptyLibrary } = state;
  const user = F.fakeUser({ lang, scheme, pack });
  const session = F.fakeSession(user);
  const tables = {
    recipes: emptyLibrary ? [] : F.RECIPES,
    collections: emptyLibrary ? [] : F.COLLECTIONS,
    collection_recipes: emptyLibrary ? [] : F.COLLECTION_RECIPES,
    shopping_list_items: F.shoppingList(lang),
    profiles: [F.profileRow({ admin: true })],
    extract_usage_monthly: [{ ...F.EXTRACT_USAGE, year_month: new Date().toISOString().slice(0, 7) }],
    recipe_translations: F.recipeTranslations(lang),
    recipe_cards: F.HUB_CARDS,
    token_ledger: F.TOKEN_LEDGER,
  };
  const quietTables = new Set(['product_events', 'feedback', 'support_tickets']);

  const rpc = {
    hub_cards: (args) => {
      let cards = F.HUB_CARDS;
      if (args.p_platform) cards = cards.filter((c) => c.platform === args.p_platform);
      if (args.p_tags?.length) cards = cards.filter((c) => args.p_tags.every((t) => c.tags.includes(t)));
      if (args.p_sort === 'newest') cards = cards.slice().sort((a, b) => compare(b.created_at, a.created_at));
      const offset = args.p_offset ?? 0;
      return cards.slice(offset, offset + (args.p_limit ?? 40));
    },
    hub_popular_tags: () => F.HUB_TAGS.map((tag) => ({ tag })),
    get_in_app_messages: () => [],
    record_in_app_message_event: () => null,
    ensure_user_profile: () => null,
    log_interaction_events: () => null,
    register_push_token: () => null,
    unregister_push_token: () => null,
    library_recipe_for_card: () => null,
    library_recipe_for_url: () => null,
    migrate_guest_shopping_list: () => null,
  };

  const functions = {
    'backfill-thumbnails': () => ({ updated: [], thumbnails: {} }),
  };

  const json = (status, body, extra = {}) => ({
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...extra },
    body: body === undefined ? '' : JSON.stringify(body),
  });

  const note = (key) => unmocked.add(key);

  return function handle(method, url, headers, postData) {
    const p = url.pathname;
    if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };

    if (p.startsWith('/storage/v1/object/')) {
      const key = path.basename(p).replace(/\.[a-z]+$/, '');
      return { status: 200, headers: { ...CORS, 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' }, body: svgPhoto(key) };
    }

    if (p.startsWith('/auth/v1/')) {
      const route = p.slice('/auth/v1/'.length);
      if (route === 'user') {
        if (method === 'PUT') {
          const data = JSON.parse(postData || '{}').data ?? {};
          return json(200, { ...user, user_metadata: { ...user.user_metadata, ...data } });
        }
        return json(200, user);
      }
      if (route.startsWith('token')) return json(200, session);
      if (route === 'logout') return { status: 204, headers: CORS, body: '' };
      note(`${method} ${p}`);
      return json(200, {});
    }

    if (p.startsWith('/rest/v1/rpc/')) {
      const name = p.slice('/rest/v1/rpc/'.length);
      let args = {};
      try { args = postData ? JSON.parse(postData) : Object.fromEntries(url.searchParams); } catch { /* keep {} */ }
      if (rpc[name]) return json(200, rpc[name](args));
      if (name.startsWith('admin_')) return json(200, []);
      note(`rpc ${name}`);
      return json(200, []);
    }

    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const wantsObject = (headers.accept ?? '').includes('vnd.pgrst.object');
      const rows = tables[table];
      if (!rows && !quietTables.has(table)) note(`table ${table} (${method})`);

      if (method === 'GET' || method === 'HEAD') {
        const { rows: found, total, offset } = queryRows(rows ?? [], url, headers);
        const contentRange = found.length ? `${offset}-${offset + found.length - 1}/${total}` : `*/${total}`;
        if (wantsObject) {
          if (found.length !== 1) {
            return json(406, { code: 'PGRST116', details: `The result contains ${found.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
          }
          return json(200, found[0], { 'content-range': contentRange });
        }
        return { ...json(200, found, { 'content-range': contentRange }), ...(method === 'HEAD' ? { body: '' } : {}) };
      }

      // Writes are answered as if they worked, and not kept: every page starts from the same data.
      let body = null;
      try { body = postData ? JSON.parse(postData) : null; } catch { /* not JSON */ }
      if ((headers.prefer ?? '').includes('return=minimal')) return { status: method === 'POST' ? 201 : 204, headers: CORS, body: '' };
      let result;
      if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body ?? {}];
        result = list.map((row, i) => ({ id: `fake-${Date.now()}-${i}`, created_at: new Date().toISOString(), user_id: F.USER_ID, ...row }));
      } else if (method === 'PATCH') {
        result = queryRows(rows ?? [], url, headers).rows.map((row) => ({ ...row, ...(body ?? {}) }));
      } else {
        result = [];
      }
      if (wantsObject) return json(result.length ? 200 : 406, result[0] ?? { code: 'PGRST116', message: 'no rows' });
      return json(method === 'POST' ? 201 : 200, result);
    }

    if (p.startsWith('/functions/v1/')) {
      const name = p.slice('/functions/v1/'.length).split('/')[0];
      if (functions[name]) return json(200, functions[name]());
      note(`function ${name}`);
      return json(200, {});
    }

    note(`${method} ${p}`);
    return json(200, {});
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Shots

const VIEWPORT = { width: 390, height: 844 };
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const LOCALES = { en: 'en-US', he: 'he-IL', ar: 'ar', es: 'es-ES', ru: 'ru-RU' };
const FAKE_HOST = new URL(F.FAKE_SUPABASE_URL).host;

function deviceStorage({ lang, scheme, pack }) {
  const user = F.fakeUser({ lang, scheme, pack });
  return {
    [F.AUTH_STORAGE_KEY]: JSON.stringify(F.fakeSession(user)),
    'pinch:onboardingComplete': 'true',
    'pinch:walkthroughState': 'done',
    'pinch.themePreference': scheme,
    'pinch.themePack': pack,
    'pinch:appLanguage': lang,
    'pinch:measurementSystem': 'original',
    'pinch:unitSystem': lang === 'en' ? 'us' : 'metric',
    'pinch.pushPromptAsked': 'true',
    'pinch:install-id': 'screenshot-install',
  };
}

/** A screen's own storage on top of the device's: `signedOut` drops the session, `storage` adds or replaces keys. */
function screenStorage(def, entries) {
  const out = { ...entries, ...(def.storage ?? {}) };
  if (def.signedOut) delete out[F.AUTH_STORAGE_KEY];
  return out;
}

/** Waits until the fake backend has gone quiet, fonts are in and images have loaded. */
async function settle(page, inflight, maxMs = 20000) {
  const start = Date.now();
  let quietSince = Date.now();
  while (Date.now() - start < maxMs) {
    if (inflight.size > 0) quietSince = Date.now();
    else if (Date.now() - quietSince > 900) break;
    await page.waitForTimeout(150);
  }
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => { img.onload = img.onerror = resolve; setTimeout(resolve, 4000); })),
    );
  }).catch(() => {});
  await page.waitForTimeout(700);
}

/** Grows the viewport to the tallest scroll container's full height, so one PNG shows the whole screen. */
async function growToContent(page) {
  let height = VIEWPORT.height;
  for (let i = 0; i < 5; i++) {
    const extra = await page.evaluate(() => {
      let best = 0;
      for (const el of document.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        if (!/(auto|scroll)/.test(style.overflowY) || el.clientHeight < 200) continue;
        best = Math.max(best, el.scrollHeight - el.clientHeight);
      }
      return Math.max(best, document.documentElement.scrollHeight - window.innerHeight);
    });
    if (extra <= 2) break;
    height = Math.min(height + extra, 9000);
    await page.setViewportSize({ width: VIEWPORT.width, height });
    await page.waitForTimeout(600);
    if (height >= 9000) break;
  }
}

async function shoot(browser, baseUrl, job, opts, report) {
  const { screen, lang, scheme } = job;
  const def = SCREENS[screen];
  const name = `${screen}-${lang}-${scheme}`;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
    colorScheme: scheme,
    locale: LOCALES[lang] ?? lang,
    serviceWorkers: 'block',
  });
  const state = { lang, scheme, pack: opts.pack, unmocked: report.unmocked, emptyLibrary: Boolean(def.emptyLibrary) };
  const handle = createFakeSupabase(state);
  const inflight = new Set();
  const problems = [];

  await context.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem('__pinchSeeded')) return;
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      sessionStorage.setItem('__pinchSeeded', '1');
    } catch { /* storage blocked */ }
  }, screenStorage(def, deviceStorage(state)));

  const local = new URL(baseUrl).host;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.host === local) return route.continue();
    if (url.host === FAKE_HOST) {
      inflight.add(request);
      try {
        const res = handle(request.method(), url, request.headers(), request.postData());
        await route.fulfill(res);
      } finally {
        inflight.delete(request);
      }
      return;
    }
    if (/\.supabase\.co$/i.test(url.hostname)) report.realSupabase.add(url.host);
    report.blockedHosts.add(url.host);
    return route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  page.on('pageerror', (err) => problems.push(`page error: ${String(err.message).split('\n')[0]}`));

  const target = `${baseUrl}${def.path === '/' ? '' : def.path}`;
  const file = path.join(opts.out, `${name}.png`);
  try {
    await page.goto(target, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 60000 });
    await settle(page, inflight);
    if (def.after) {
      await def.after(page, job);
      await settle(page, inflight, 8000);
    }
    const finalPath = new URL(page.url()).pathname.replace(/^\/app/, '') || '/';
    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    const expectedPath = def.path.split('?')[0];
    if (finalPath !== expectedPath && !(expectedPath === '/' && finalPath === '')) {
      problems.unshift(`ended on ${finalPath} instead of ${expectedPath}`);
    }
    if (/unmatched route|this screen doesn.t exist|page could not be found/i.test(text)) problems.unshift('route not found');
    if (/something went wrong/i.test(text)) problems.unshift('error screen');
    if (!(opts.viewportOnly || def.viewportOnly)) await growToContent(page);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
    const entry = { name, file, problems };
    report.done.push(entry);
    return entry;
  } catch (err) {
    try { await page.screenshot({ path: file, animations: 'disabled' }); } catch { /* page gone */ }
    const entry = { name, file, problems: [`failed: ${String(err.message).split('\n')[0]}`, ...problems] };
    report.done.push(entry);
    return entry;
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  await mkdir(opts.out, { recursive: true });
  const baseUrl = `http://localhost:${opts.port}/app`;

  let server = null;
  const cleanup = () => stopExpo(server);
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

  if (opts.server) {
    if (await portInUse(opts.port)) {
      throw new Error(`Port ${opts.port} is busy. Pass --port <free port>, or --no-server to use the server running there.`);
    }
    console.log(`Starting Expo web on port ${opts.port} (fake Supabase at ${F.FAKE_SUPABASE_URL})...`);
    server = startExpo(opts.port);
  } else {
    console.log(`Using the Expo web server on port ${opts.port}.`);
  }

  const chromiumPromise = loadChromium();
  await waitForApp(baseUrl, server);
  console.log(`App bundled after ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  const browser = await launchBrowser(await chromiumPromise);

  const jobs = [];
  for (const screen of opts.screens) for (const lang of opts.langs) for (const scheme of opts.schemes) jobs.push({ screen, lang, scheme });
  const report = { done: [], unmocked: new Set(), blockedHosts: new Set(), realSupabase: new Set() };

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const last = await shoot(browser, baseUrl, job, opts, report);
      console.log(`${last.problems.length ? '!' : '✓'} ${last.name}${last.problems.length ? `  ${last.problems[0]}` : ''}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, worker));
  } finally {
    await browser.close();
    cleanup();
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const failed = report.done.filter((d) => d.problems.length);
  console.log(`\n${report.done.length} screenshots in ${opts.out} (${seconds}s).`);
  if (failed.length) {
    console.log(`\nWith problems (${failed.length}):`);
    for (const d of failed) console.log(`  ${d.name}\n    ${d.problems.slice(0, 4).join('\n    ')}`);
  }
  if (report.unmocked.size) {
    console.log('\nUnmocked requests (answered with [] or {}):');
    for (const key of [...report.unmocked].sort()) console.log(`  ${key}`);
  }
  if (report.blockedHosts.size) console.log(`\nBlocked outside hosts: ${[...report.blockedHosts].sort().join(', ')}`);
  if (report.realSupabase.size) {
    console.error(`\nThe app tried to reach a real Supabase project (${[...report.realSupabase].join(', ')}): the server was not started with the fake address. Those calls were blocked.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
