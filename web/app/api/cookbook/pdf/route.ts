import type { BrowserWorker } from "@cloudflare/puppeteer";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { handleCookbookPdf } from "@/lib/cookbook/server/handleCookbookPdf";
import { renderCookbookPdf } from "@/lib/cookbook/server/renderPdf";
import { supabaseUserVerifier } from "@/lib/cookbook/server/verifyUser";

// The PDF cookbook (PIN-142): made in Cloudflare's browser, ADR 028. Never prerendered or cached.
export const dynamic = "force-dynamic";

/** The Worker's bindings this route uses (web/wrangler.jsonc). */
type Bindings = {
  BROWSER?: BrowserWorker;
  COOKBOOK_PDF_LIMITER?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
};

function bindings(): Bindings {
  try {
    return getCloudflareContext().env as unknown as Bindings;
  } catch {
    // `next start` (the browser tests) runs outside Cloudflare: no browser, so the page offers printing.
    return {};
  }
}

const verifyUser = supabaseUserVerifier({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_KEY });

export async function POST(request: Request): Promise<Response> {
  const { BROWSER, COOKBOOK_PDF_LIMITER } = bindings();
  return handleCookbookPdf(request, {
    verifyUser,
    allow: COOKBOOK_PDF_LIMITER ? async (userId) => (await COOKBOOK_PDF_LIMITER.limit({ key: userId })).success : undefined,
    render: BROWSER ? (book, signal) => renderCookbookPdf(BROWSER, book, signal) : null,
  });
}
