import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import sharedPackages from "../shared/packages.json";

const nextConfig: NextConfig = {
  // The app lives at pinch-app.io/app (and next.pinch-app.io/app until PIN-148). ADR 027.
  basePath: "/app",
  // Cloudflare Images would bill for resizing; recipe photos already come sized. ADR 027.
  images: { unoptimized: true },
  // next.pinch-app.io/ has nothing on it; send visitors to the app. On pinch-app.io only /app reaches this Worker.
  async redirects() {
    return [
      { source: "/", destination: "/app", basePath: false, permanent: false },
      // Addresses of the Expo web app that the new app has no page for, so old links and bookmarks still land
      // somewhere (PIN-146). Favorites became a Library filter; the legal pages are the static files on the main site.
      { source: "/favorites", destination: "/?favorites=1", permanent: true },
      { source: "/legal/:doc(privacy|terms|delete-account|delete-data)", destination: "https://pinch-app.io/:doc.html", permanent: true },
    ];
  },
  // Cache Components (the create-next-app default) are off: OpenNext does not fully support them on
  // Cloudflare yet, and signed-in screens render in the browser anyway (ADR 026).
  turbopack: {
    // The repo root, so the build can read ../shared (code both apps use). See shared/README.md.
    root: path.join(__dirname, ".."),
    // Files in ../shared sit outside web/, so their packages would be looked up in the mobile app's
    // node_modules. Point each package shared code may use at web's own copy.
    resolveAlias: Object.fromEntries(sharedPackages.map((name) => [name, `./node_modules/${name}`])),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings from wrangler.jsonc.
initOpenNextCloudflareForDev();
