import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: signed-in screens render in the browser (ADR 026), so there is nothing to revalidate yet.
export default defineCloudflareConfig({});
