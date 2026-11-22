# ADR 028: The web app makes cookbook PDFs on its server

**Status:** Accepted
**Date:** 2026-11-22
**Deciders:** Yarden (product)

## Context

The PDF cookbook (PIN-142) lets people pick saved recipes and get them as one book. The phone turns the book's HTML into a PDF file with its own print service. A browser has no such API: the first web version opened the print dialog, and people had to pick "Save as PDF" themselves. Yarden asked for a real download instead.

There are two ways to make the file. A PDF library in the browser either takes a picture of each page (text can't be selected, files are large, 50 recipes are slow) or needs every page laid out again by hand, with extra work for Hebrew and Arabic. A real browser on a server prints the same HTML the phone uses, as well as Chrome's own "Save as PDF" does.

The web app already runs on Cloudflare Workers Paid (ADR 027). Cloudflare's Browser Rendering (now called Browser Run) runs Chrome for a Worker through a binding.

## Decision

- **The web app's Worker makes the PDF: `POST /app/api/cookbook/pdf`, using Chrome through the `BROWSER` binding and `@cloudflare/puppeteer`.** The page shows a progress bar, then the file downloads. Printing stays as a choice after the download ("Print"), and as the way out when the server can't make the file ("Print instead").
- **The request carries the book as data, never HTML.** The page sends `buildCookbookBook()`'s output: titles, ingredients, steps and photo addresses, already in the reader's language and units. The server checks every field and its length (`web/lib/cookbook/pdfBook.ts`), then lays out the pages with the shared builder, which escapes every word. *Reason:* a request can only ever print a Pinch cookbook, not any page someone sends.
- **The page in Chrome is locked down.** A Content-Security-Policy allows photos over https, the Google Fonts stylesheet and fonts, and nothing else: no scripts, frames or requests. Photo addresses must be https.
- **Signed-in accounts only, five books a minute each.** The route checks the session with Supabase Auth, and a Workers rate limiter (`COOKBOOK_PDF_LIMITER`) counts per account.
- **Photos the server can't load get the placeholder.** Chrome loads them as a browser would, so recipe sites' CORS settings don't matter. After 25 seconds, or on an error, the page is laid out again without the missing ones, and the response says which (`X-Cookbook-Missing-Photos`), so the page can tell the reader.
- **The PDF is streamed, not held.** A 60-recipe book with large photos is about 24 MB, and a Worker has 128 MB.
- **The fonts come from the page.** Cloudflare's Chrome has no Hebrew font, so the book keeps loading Noto Sans Hebrew and Arabic from Google Fonts.

## Cost

Workers Paid includes 10 browser hours a month, then $0.09 an hour, and 10 concurrent browsers (the monthly average of the daily peak), then $2 for each extra one (developers.cloudflare.com/browser-run/pricing). Measured locally, a 3-recipe book takes 2.5 seconds and a 60-recipe book with photos takes 7. Even 1,000 books a month would use about 2 hours.

## Consequences

### Positive

- One press gives a real file, in the same layout as the phone's book.
- Photos no longer depend on how a recipe site is set up.
- Printing still works when the server can't make the file.

### Negative

- It's the first server route in `web/`. ADR 026 still holds for screens: they render in the browser, and the route reads the session from the request's `Authorization` header, not from cookies.
- `next dev` and `next start` have no working browser binding, so locally the route answers 503 and the page offers printing. The browser tests stand in for the server with `page.route`. To make a real PDF locally, run the route's code under `wrangler dev`, which starts a local Chrome.
- A recipe site that blocks Cloudflare's servers shows the placeholder in the PDF even if the photo loads in the reader's browser.
