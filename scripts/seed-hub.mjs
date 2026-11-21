#!/usr/bin/env node
/**
 * Seeds the Cooking Hub by sending public recipe links through the live `extract-recipe`
 * function, signed in as a normal user. Every full extraction publishes a Hub card there
 * (PIN-67: our extraction is the only writer of card content); nothing is written here.
 *
 *   SEED_EMAIL=… SEED_PASSWORD=…   node scripts/seed-hub.mjs <links.json> [--limit N] [--concurrency N]
 *   SEED_REFRESH_TOKEN=…           node scripts/seed-hub.mjs <links.json>   (Google / Apple sign-in)
 *
 * <links.json> is an array of { url, diet?, title? }. Progress goes to <links>.results.json next
 * to it, so a rerun skips links already done. Each extraction costs the account one credit, and
 * the content check allows 40 a day per user: the run stops cleanly on `daily_limit` or
 * `insufficient_credits`; run it again the next day.
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY from the environment or `.env`.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STOP_CODES = new Set(['daily_limit', 'insufficient_credits', 'metering_error']);
const REQUEST_TIMEOUT_MS = 180_000;

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function parseArgs(argv) {
  const args = { file: null, limit: Infinity, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--concurrency') args.concurrency = Math.max(1, Math.min(4, Number(argv[++i])));
    else args.file = argv[i];
  }
  if (!args.file)
    throw new Error('Usage: node scripts/seed-hub.mjs <links.json> [--limit N] [--concurrency N]');
  return args;
}

async function signIn(base, apikey) {
  const SEED_EMAIL = process.env.SEED_EMAIL;
  const SEED_PASSWORD = process.env.SEED_PASSWORD;
  const SEED_REFRESH_TOKEN = process.env.SEED_REFRESH_TOKEN;
  const body = SEED_REFRESH_TOKEN
    ? { grant: 'refresh_token', payload: { refresh_token: SEED_REFRESH_TOKEN } }
    : SEED_EMAIL && SEED_PASSWORD
      ? { grant: 'password', payload: { email: SEED_EMAIL, password: SEED_PASSWORD } }
      : null;
  if (!body) throw new Error('Set SEED_EMAIL and SEED_PASSWORD, or SEED_REFRESH_TOKEN.');
  const res = await fetch(`${base}/auth/v1/token?grant_type=${body.grant}`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body.payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token)
    throw new Error(`Sign-in failed (${res.status}): ${json.msg ?? json.error_description ?? ''}`);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const apikey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!base || !apikey)
    throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY are required.');

  const links = JSON.parse(readFileSync(args.file, 'utf8'));
  const resultsPath = args.file.replace(/\.json$/, '') + '.results.json';
  const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};
  const save = () => writeFileSync(resultsPath, JSON.stringify(results, null, 1));

  // A link is done once it got a final answer; network errors and limits are retried next run.
  const isDone = (r) =>
    r && ['full', 'partial', 'failed', 'cached'].includes(r.status) && !STOP_CODES.has(r.code);
  const done = links.filter((l) => isDone(results[l.url])).length;
  const queue = links.filter((l) => !isDone(results[l.url])).slice(0, args.limit);
  console.log(`${links.length} links, ${done} already done, ${queue.length} to run now.`);

  let session = await signIn(base, apikey);
  const token = async () => {
    if (Date.now() > session.expiresAt - 120_000) {
      process.env.SEED_REFRESH_TOKEN = session.refreshToken;
      session = await signIn(base, apikey);
    }
    return session.accessToken;
  };

  let stopReason = null;
  let n = 0;
  const worker = async () => {
    while (!stopReason && queue.length > 0) {
      const link = queue.shift();
      const i = ++n;
      const started = Date.now();
      let entry;
      try {
        const res = await fetch(`${base}/functions/v1/extract-recipe`, {
          method: 'POST',
          headers: { apikey, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link.url, request_id: `hub-seed-${randomUUID()}` }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const json = await res.json().catch(() => ({}));
        entry = {
          status: json.status ?? `http_${res.status}`,
          code: json.code ?? null,
          message: typeof json.message === 'string' ? json.message.slice(0, 200) : (json.error ?? null),
          title: json.recipe?.title ?? null,
        };
      } catch (err) {
        entry = {
          status: 'error',
          code: null,
          message: String(err?.message ?? err).slice(0, 200),
          title: null,
        };
      }
      results[link.url] = {
        ...entry,
        diet: link.diet ?? null,
        ms: Date.now() - started,
        at: new Date().toISOString(),
      };
      save();
      console.log(
        `[${i}] ${entry.status}${entry.code ? `/${entry.code}` : ''}  ${link.diet ?? ''}  ${entry.title ?? link.title ?? link.url}`,
      );
      if (STOP_CODES.has(entry.code) || STOP_CODES.has(entry.message))
        stopReason = entry.code ?? entry.message;
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  const tally = {};
  for (const l of links) {
    const s = results[l.url]?.status ?? 'not_run';
    tally[s] = (tally[s] ?? 0) + 1;
  }
  console.log('\nTotals:', tally);
  if (stopReason) console.log(`Stopped: ${stopReason}. Run again later to continue.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
