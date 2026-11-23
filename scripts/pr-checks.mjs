// Decides which Quality jobs (quality.yml) a pull request needs, from the files it changes.
//
//   node scripts/pr-checks.mjs changed-files.txt
//
// Writes app, web and e2e (true or false) to $GITHUB_OUTPUT when it is set. Deploys and manual runs don't use
// this: they pick their checks with the workflow inputs.

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Changing how the checks are picked runs all of them.
const EVERYTHING = ['.github/workflows/quality.yml', 'scripts/pr-checks.mjs'];

// The Next.js app imports these besides web/ itself (shared/ imports the generated database types).
const DB_TYPES = 'supabase/functions/_shared/core/database.types.ts';

const under = (file, ...dirs) => dirs.some((dir) => file.startsWith(`${dir}/`));

/** Files the root checks (tests, typecheck, lint, Expo export) never read. */
function outsideApp(file) {
  if (under(file, 'web', 'docs', 'supabase/migrations', 'supabase/tests', 'supabase/snippets')) return true;
  if (file === 'supabase/README.md') return true;
  // Markdown at the top level (README, AGENTS.md). Elsewhere it can be content: content/guides is tested.
  return !file.includes('/') && file.endsWith('.md');
}

/** @param {string[]} changed files the pull request changes */
export function planPrChecks(changed) {
  if (changed.length === 0 || changed.some((f) => EVERYTHING.includes(f))) {
    return { app: true, web: true, e2e: true };
  }
  const app = changed.some((f) => !outsideApp(f));
  const web = changed.some((f) => under(f, 'web', 'shared') || f === DB_TYPES);
  // The browser tests run against a local Supabase built from the migrations, so a schema change can break them.
  const e2e =
    web ||
    changed.some((f) => under(f, 'supabase/migrations') || f === 'supabase/config.toml' || /^supabase\/seed/.test(f));
  return { app, web, e2e };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const changed = readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const plan = planPrChecks(changed);

  console.log(`${changed.length} files changed.`);
  console.log(`App checks (Expo, shared, Workers, scripts): ${plan.app ? 'yes' : 'no'}`);
  console.log(`Web checks (Next.js): ${plan.web ? 'yes' : 'no'}`);
  console.log(`Browser tests: ${plan.e2e ? 'yes' : 'no'}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${plan.app}\nweb=${plan.web}\ne2e=${plan.e2e}\n`);
  }
}
