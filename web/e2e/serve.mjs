// Builds the web app against local Supabase and serves it, for the browser tests.
// Usage: node e2e/serve.mjs <port>
import { execSync, spawn } from "node:child_process";

import { localSupabase } from "./env.mjs";

const port = process.argv[2] ?? "3100";
const { url, anonKey } = localSupabase();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_KEY: anonKey,
  NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED: "false",
};

execSync("npx next build", { stdio: "inherit", env });
const server = spawn("npx", ["next", "start", "-p", port], { stdio: "inherit", env, shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
