import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // The app lives at pinch-app.io/app (and next.pinch-app.io/app while we build it). ADR 027.
  basePath: "/app",
  // Cloudflare Images would bill for resizing; recipe photos already come sized. ADR 027.
  images: { unoptimized: true },
  // next.pinch-app.io/ has nothing on it; send visitors to the app. After the switch only /app reaches this Worker.
  async redirects() {
    return [{ source: "/", destination: "/app", basePath: false, permanent: false }];
  },
  // Cache Components (the create-next-app default) are off: OpenNext does not fully support them on
  // Cloudflare yet, and signed-in screens render in the browser anyway (ADR 026).
  turbopack: {
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
