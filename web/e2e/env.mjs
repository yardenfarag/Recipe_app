// Reads local Supabase's URL and keys from the Supabase CLI. Refuses anything that isn't on this machine, so the
// browser tests can never write to production.
import { execSync } from "node:child_process";

// Playwright loads this file both as ESM (serve.mjs) and through its own transform (global-setup.ts),
// so no import.meta here.
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

// Asking the CLI takes a second or two on Windows, and a test that calls the database twenty times would spend
// most of its time here, so the answer is read once per process. The local-only check below still runs on it.
let cached;

export function localSupabase() {
  cached ??= readLocalSupabase();
  return cached;
}

function readLocalSupabase() {
  let output;
  try {
    // The CLI on the PATH (CI installs it), else the copy in the repo root's node_modules.
    const status = (cli) => execSync(`${cli} status -o env`, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      output = status("supabase");
    } catch {
      output = status("npx --no-install supabase");
    }
  } catch {
    throw new Error("Local Supabase is not running. From the repo root: npx supabase start");
  }
  const values = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  const url = values.API_URL;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`Refusing to run browser tests against ${url ?? "an unknown Supabase"}: local only.`);
  }
  return { url, anonKey: values.ANON_KEY, serviceRoleKey: values.SERVICE_ROLE_KEY };
}
