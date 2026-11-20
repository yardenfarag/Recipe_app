import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

import sharedPackages from "../shared/packages.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // ../shared is code both apps use (shared/README.md). Its packages must come from web's node_modules.
      "@shared": path.join(here, "../shared"),
      ...Object.fromEntries(sharedPackages.map((name) => [name, path.join(here, "node_modules", name)])),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    // Browser tests (e2e/) run with Playwright: npm run test:e2e.
    exclude: ["node_modules/**", ".next/**", ".open-next/**", "e2e/**"],
  },
});
