// Decides what a backend deploy (deploy-backend.yml) has to test and deploy, from the files that changed since
// the last successful deploy.
//
//   node scripts/backend-changes.mjs [changed-files.txt]
//
// Without a file (a manual run, or no earlier deploy to compare with) it plans everything. Writes db-tests,
// function-tests, all-functions and functions (space-separated names) to $GITHUB_OUTPUT when it is set.

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FUNCTIONS_DIR = 'supabase/functions';
const DB_TYPES = 'supabase/functions/_shared/core/database.types.ts';

// Changing how the deploy works redeploys and retests everything.
const EVERYTHING = ['.github/workflows/deploy-backend.yml', '.github/workflows/backend-tests.yml', 'scripts/backend-changes.mjs'];

/** The function whose folder holds `file`, or null for _shared, deno.json and anything else every function uses. */
function owningFunction(file) {
  if (!file.startsWith(`${FUNCTIONS_DIR}/`)) return null;
  const parts = file.slice(FUNCTIONS_DIR.length + 1).split('/');
  if (parts.length < 2 || parts[0].startsWith('_')) return null;
  return parts[0];
}

/**
 * @param {string[] | null} changed files changed since the last successful deploy; null when unknown
 * @param {string[]} functionNames every function in the repo now
 */
export function planBackendDeploy(changed, functionNames) {
  const everything = { dbTests: true, functionTests: true, allFunctions: true, functions: functionNames };
  if (!changed || changed.some((f) => EVERYTHING.includes(f))) return everything;

  // config.toml holds both database settings and per-function ones (verify_jwt and the like).
  if (changed.includes('supabase/config.toml')) return everything;

  const functionFiles = changed.filter((f) => f.startsWith(`${FUNCTIONS_DIR}/`));
  const dbTests = changed.some(
    (f) => f.startsWith('supabase/migrations/') || f.startsWith('supabase/tests/') || f === DB_TYPES,
  );
  const functionTests = functionFiles.length > 0;

  if (functionFiles.some((f) => owningFunction(f) === null)) {
    return { dbTests, functionTests, allFunctions: true, functions: functionNames };
  }
  // A deleted function isn't in functionNames, so it drops out here (deploys never delete one).
  const touched = new Set(functionFiles.map(owningFunction));
  const functions = functionNames.filter((name) => touched.has(name));
  return { dbTests, functionTests, allFunctions: false, functions };
}

/** Function folders with an index.ts, the same ones `supabase functions deploy` picks up. */
export function listFunctions(root = '.') {
  const dir = join(root, FUNCTIONS_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(dir, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const listFile = process.argv[2];
  const changed = listFile
    ? readFileSync(listFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : null;
  const plan = planBackendDeploy(changed, listFunctions());

  console.log(changed ? `${changed.length} files changed since the last successful deploy.` : 'Planning everything.');
  console.log(`Database tests: ${plan.dbTests ? 'yes' : 'no'}`);
  console.log(`Edge Function tests: ${plan.functionTests ? 'yes' : 'no'}`);
  console.log(
    `Functions to deploy: ${plan.allFunctions ? 'all' : plan.functions.length ? plan.functions.join(', ') : 'none'}`,
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `db-tests=${plan.dbTests}`,
        `function-tests=${plan.functionTests}`,
        `all-functions=${plan.allFunctions}`,
        `functions=${plan.functions.join(' ')}`,
        '',
      ].join('\n'),
    );
  }
}
