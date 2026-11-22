# Printed cookbook research (PIN-159)

> **Sources:** the print partners' own price lists, API docs, help centres and terms. The payment rules come from Apple's App Review Guidelines, Google Play's Payments policy, and the acceptable use policies of Polar, Paddle and Lemon Squeezy. Every page below was read on **2026-11-22** unless a line says otherwise. Some pages refused automated reads (Gelato's site and developer docs, Peecho's help centre, PayPal's fee page). Facts from those pages are marked "(search snippet, not opened)" or "not verified".
>
> **Project context:** Pinch already makes a PDF cookbook. `shared/lib/cookbook/buildCookbookHtml.ts` lays out the book, and the web app's Worker prints it with Chrome (ADR 028). The phone prints the same HTML with `expo-print`. Web payments go through Polar as merchant of record (credit packs only), and in-app purchases through RevenueCat (ADR 012). Stripe is not available to the account's country, so neither is RevenueCat Web Billing (`docs/RECIPE_CREDITS_ROLLOUT.md`).
>
> **Why this note exists:** PIN-159. People want to order a real printed book of their own saved recipes and get it in the mail, for themselves or as a gift. This note covers who prints it, how we take payment, what it costs, and what the PDF needs. The decisions go into an ADR with Yarden later.

---

## Summary

- **Print partner: Lulu Print API.** It is the only partner with all of these:
  - a public price list for every product;
  - a sandbox, webhooks signed with HMAC, and a cost-quote endpoint;
  - a documented way to print right-to-left books;
  - delivery to Israel, the US and the EU;
  - no PDF/X requirement, so our Chrome-made PDF can go in nearly as it is.

  Gelato and Cloudprinter are the backups. Both deliver to Israel, but neither publishes prices.
- **Payment is the blocker.** Apple and Google both require a non-store payment method for physical goods, so the store rules are fine. **But Polar forbids physical goods** ("Physical products" is the first item on its prohibited list). Paddle and Lemon Squeezy forbid them too, and Shopify Payments isn't available in Israel. We need a second payment path, which makes Pinch the seller, with the tax work that comes with it. The one way to avoid that is Peecho's hosted checkout, where Peecho is the seller. Before building, ask Peecho whether it ships to Israel and pays out to Israel.
- **Cost of a 50-recipe book (about 80 pages):** with Lulu, a US Letter or A4 hardcover in premium colour costs **$28.16** to print, plus a **$0.75** fee per order. Shipping is extra: about $8 to the US, $11–15 to the EU and $35–40 to Israel (express only, for now). Those shipping figures are planning numbers, not quotes. **Suggested price: $49 plus shipping at cost.** After about 5% in payment fees, that leaves about $17.60 before tax. If the cheaper standard colour looks good enough in a test print, the same book costs $16.06 and the margin is about $30.
- **First version:**
  - Options: title, cover photo (picked from the book's own recipes), a dedication page, and recipe order (drag to reorder).
  - Hardcover only, at one size: the page size the PDF already picks by locale.
  - Photos are printed large, printed small or left out, depending on their pixel width.
  - Hebrew and Arabic books print right-bound with Lulu's documented method: reverse the page order, and put the front cover on the left.
  - We never store the shipping address. It goes from checkout straight into the Lulu print job, and we keep only the Lulu job id and the country.

---

## 1. Print partners

### Comparison

| | **Lulu Print API** | **Gelato** | **Cloudprinter** | **Prodigi / Peecho** | **RPI Print (Blurb's API)** |
|---|---|---|---|---|---|
| Book products | Paperback and casewrap hardcover in A4, US Letter, 8.5" square and more; 24–800 pages (hardcover), 32–800 (paperback); standard or premium colour, 60# or 80# paper ([spec sheet](https://assets.lulu.com/media/specs/lulu-print-api-spec-sheet.xlsx), "Last Update 3/2026") | Photo books, 30–200 inner pages; 8x8, 8x11, 11x11 in hardcover; no A4 found (search snippet, not opened) | Photobook in "over 40 sizes", 105x148 mm up to 279x432 mm; perfect binding or case wrap; 24 pages minimum ([product page](https://www.cloudprinter.com/products/photobook-print-online-worldwide), [design guide](https://knowledge.cloudprinter.com/how-to-design-a-photobook)) | Prodigi: hardcover and softcover in A4, A5 and square sizes, 20/24–300 pages ([technical guide](https://www.prodigi.com/blog/photo-books-technical-guide/)). Peecho: softcover 20–300, hardcover 24–504 ([softcover](https://www.peecho.com/products/books/softcover), [hardcover](https://www.peecho.com/products/books/hardcover)) | Softcover and hardcover in 8x10, 8.5x11, 8x8; A4 hardcover only; 20–550 pages ([catalog](https://products.api.rpiprint.com/catalog/v1/products.md)) |
| Price per book | **Public:** base + per-page price for every SKU ([spec sheet](https://assets.lulu.com/media/specs/lulu-print-api-spec-sheet.xlsx)). See §3 | Not public. Dashboard only ([help](https://support.gelato.com/en/articles/8996077-how-can-i-check-your-product-price)) | Not public. "There is no set price list" ([help](https://knowledge.cloudprinter.com/where-can-i-find-the-prices)) | Prodigi: "From £6.50" softcover, no page count given ([page](https://www.prodigi.com/products/books-and-magazines/softcover-photo-book/)). Peecho: hardcover "from €5,20" ([books](https://www.peecho.com/products/books)) | **Public:** 8x10 hardcover is $16.20 / $18.90 / $25.20 at 50 / 80 / 150 pages ([pricing formula](https://docs.api.rpiprint.com/llms-only/catalog-and-pricing.md)) |
| US | Yes | Yes | Yes | Yes | Yes (US and Canada only) |
| EU | Yes | Yes (local production in 32 countries) | Yes | Yes (Prodigi prints in the UK and EU) | **No**, unless arranged as a "Managed" account through their sales team ([shipping](https://docs.api.rpiprint.com/llms-only/shipping.md)) |
| Israel | **Yes, but express or expedited only for now.** Mail is suspended to Israel and the region, and delivery "cannot [be] guarantee[d]" ([alert](https://help.api.lulu.com/en/support/solutions/articles/64000311302-middle-east-shipping-service-alert), modified 2026-10-26) | **Yes**, listed as "IL Israel Worldwide" ([countries](https://support.gelato.com/en/articles/8996083-what-countries-are-included-in-each-geographical-area)), with a Middle East delay notice ([notice](https://support.gelato.com/en/articles/10214068-delivery-service-update-middle-east)) | Very likely: Israel is in its print network ([network](https://www.cloudprinter.com/global-network)). The delivery list is behind the API | Prodigi: "anywhere in the world" ([FAQ](https://www.prodigi.com/faq/shipping/)). Peecho: not verified | No |
| API: create order | `POST /print-jobs/` | `POST /v4/orders` (draft or order) | `POST /cloudcore/1.0/orders/add` | Prodigi `POST /v4.0/Orders`; Peecho `POST /rest/v3/order/` | `POST /orders/create` |
| Webhooks | Yes. `PRINT_JOB_STATUS_CHANGED`, signed in the `Lulu-HMAC-SHA256` header, retried 5 times ([API docs](https://api.lulu.com/docs/)) | Yes; signed by header or query-string auth ([help](https://support.gelato.com/en/articles/8996576-how-do-i-configure-notifications-webhooks)) | Yes (CloudSignal). Authenticated by the API key in the body, not by HMAC ([docs](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-1)) | Prodigi: CloudEvents callback. Peecho: SHA-256 of the secret and the order id | Yes, signed ([docs](https://docs.api.rpiprint.com/documentation/webhooks.md)) |
| Sandbox | Yes. `api.sandbox.lulu.com`; jobs are never printed, test cards accepted ([API docs](https://api.lulu.com/docs/)) | Test orders, cancelled automatically | Yes, free, simulates the printer's status updates ([docs](https://docs.cloudprinter.com/client/how-to-test-the-integration)) | Yes, both | Yes |
| Price quote by API | `POST /print-job-cost-calculations/` returns product, shipping, fees and tax for an address | Yes | `POST /orders/quote`, `/prices/lookup` | Yes | Yes |
| File format | Plain PDF: fonts embedded, 300–600 PPI images, sRGB allowed, separate cover spread ([guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)) | **PDF/X-4**, one file with the cover as page 1 ([help](https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads)) | PDF 1.6, cover and pages as two files; knowledge base says PDF/X-4 ([docs](https://docs.cloudprinter.com/client/how-to-build-the-pdf)) | **PDF/X-4** (Prodigi) | Any PDF with embedded fonts ([docs](https://docs.api.rpiprint.com/documentation/press-ready-PDFs.md)) |
| Right-bound (RTL) books | **Documented:** reverse the pages and put the front cover on the left ([help](https://help.lulu.com/en/support/solutions/articles/64000255590), modified 2026-06-08) | No statement | No statement | No statement | Blurb: "can't print a book that opens right to left" ([help](https://support.blurb.com/hc/en-us/articles/49810039246221)) |
| Who sells to the customer | We do. We pay Lulu by card on file | We do | We do | Prodigi: we do. **Peecho: can be the seller** through its hosted checkout (§2) | We do |

Two more partners were checked and left out:

- **Mixam** offers right-to-left binding on its website ([binding](https://mixam.com/support/binding)), but its API has no right-to-left value. Its US terms say it delivers only within the US "unless we expressly agree otherwise" ([terms](https://mixam.com/terms-of-use)).
- **BookVault** documents RTL books, but its production barcode "may end up at the front" ([help](https://help.bookvault.app/can-bookvault-print-rtl)). Books with different files on every order are printed in the UK only ([help](https://help.bookvault.app/fulfilling-personalized-books)).

### Print quality

No partner publishes measurable quality data, so a test print is the only real check. These are the claims:

- **Lulu** says Premium Color "is perfect for high-resolution photos and full-bleed page coverage". Standard Color suits "small photos" ([guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)).
- **Peecho and Prodigi** print on HP Indigo with PUR binding ([Peecho softcover](https://www.peecho.com/products/books/softcover)).
- **Gelato** uses 170 gsm silk paper (search snippet, not opened).

Order test copies of the same Hebrew and English book in standard and premium colour before choosing the paper.

### Recommendation

**Lulu Print API.** It wins on what we can check without signing up:

1. **Public prices.** We can set a price today and recompute it whenever the spec sheet changes. Gelato, Cloudprinter and Prodigi hide prices behind a dashboard.
2. **RTL is documented.** For the other partners, a right-bound book would be our own untested trick.
3. **Our PDF goes in nearly as it is.** Lulu takes an ordinary PDF with sRGB images. Gelato and Prodigi want PDF/X-4, which Chrome can't produce, so we'd need a conversion step.
4. **The API is complete.** It has a sandbox, signed webhooks, a quote endpoint that includes tax and shipping for an address, a cover-size endpoint, and file validation.
5. **It ships to Israel, the US and the EU.** Israel is express or expedited only while Lulu's Middle East alert stands.

**Backups:**

- **Gelato** if Lulu's Israel shipping turns out too expensive or slow. It lists Israel and produces locally in 32 countries.
- **Cloudprinter**, which has a print partner in Israel. Local printing could make Israeli orders much cheaper.

Both need a dashboard account to see prices. That's a sign-up Yarden would do.

---

## 2. Store rules, Polar, and how we take payment

### Store rules: physical goods must not use in-app purchase

- **Apple, guideline 3.1.3(e) "Goods and Services Outside of the App":** "If your app enables people to purchase physical goods or services that will be consumed outside of the app, you must use purchase methods other than in-app purchase to collect those payments, such as Apple Pay or traditional credit card entry." ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#goods-and-services-outside-of-the-app))
- **Google Play, Payments policy, section 3:** Google Play's billing system must not be used when payment is primarily "for the purchase or rental of physical goods" ([Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)).

So the phone apps can sell the book with a card form or a link to our web checkout, and the stores take no cut. It also means RevenueCat can't be used for the book: it only sells store products and its Stripe web billing.

### Polar: physical goods are not allowed

Polar's acceptable use policy ([page](https://polar.sh/docs/merchant-of-record/acceptable-use)) says:

- "If your company's primary offering is human services or the sale of physical goods, the Services are not designed for and should not be used by you."
- The first prohibited category is "Physical products".
- Breaking the policy "may result in immediate termination of your right to use any and all Services provided by Polar".

Selling books through Polar would put the credit-pack checkout at risk too. **Don't.**

### Other merchant-of-record services: also no

| Service | Physical goods? | Source |
|---|---|---|
| Paddle | No: "Physical products or products that require physical delivery" (page updated 2026-04-13) | [Paddle](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) |
| Lemon Squeezy | No: "Physical goods of any kind." | [Lemon Squeezy](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products) |
| Shopify Payments | Not available in Israel (not on the list of 41 countries) | [Shopify](https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries) |

### Payment paths that remain

| Path | Who is the seller | What it means for us | Open questions |
|---|---|---|---|
| **A. Peecho hosted checkout.** We create a "publication" per book through the API and send the buyer to Peecho's checkout ([API](https://www.peecho.com/mio-dashboard/docs/api/publications/createAProductListingpublication)) | **Peecho B.V.** Its buyer terms make Peecho the contracting party ([buyer terms](https://www.peecho.com/buyer-terms-conditions), updated 2022-12-02). It takes payment through Adyen and pays us a "Profit" on request ([seller terms](https://www.peecho.com/seller-terms-conditions)) | No VAT or sales tax for us, no card handling, and **Peecho collects the address, so we never see it** | Does it ship to Israel? Can an Israeli company receive payouts? What are the fees? Does it handle RTL? The checkout marketing page has a 2024 footer and leftover placeholder text ([page](https://www.peecho.com/solutions/checkout)) |
| **B. Our own checkout + Lulu.** PayPal Checkout, or an Israeli processor with a hosted page such as Tranzila (it accepts USD, EUR and GBP and marks foreign cards, per its [docs](https://docs.tranzila.com/docs/payments-and-billing/iframe-integration-directng)) | **Pinch** | We charge the buyer, then pay Lulu by card on file. We handle refunds, receipts, and VAT or sales tax for each country | Which processor? (decision 2) Which taxes do we owe as the seller of goods shipped to the US, EU and Israel? That needs an accountant |

PayPal is available to Israeli business accounts, with payouts in ILS to an Israeli bank ([PayPal IL help](https://paypal.com/il/cshelp/article/how-do-i-link-a-bank-account-to-my-paypal-account-help183)). Its Israeli fee page refused automated reads. Search snippets show 3.40% + ₪1.20, plus 1% for US or EU buyers. Not verified.

**Recommendation:**

1. **Ask Peecho first.** The questions are in decision 2. If Peecho ships to Israel, pays out to Israel and prints a reversed-page book correctly, path A removes the hardest parts: tax, card handling and the address.
2. **If Peecho can't do it, use path B:** Lulu for printing, plus one hosted-checkout processor. Have an accountant confirm the tax position before launch.

---

## 3. Cost, price and margin

### Pages per book (estimated from the current PDF layout)

How the current layout uses pages:

- `buildCookbookHtml` gives the cover one page.
- Every recipe starts on a new page (`break-before: page`, `min-height: 100vh`).
- On A4, the 220 px photo, the title and the meta line leave about 430 px for the two columns. Twelve ingredient rows fit. Six to eight steps of normal length don't, so long recipes run onto a second page.

So a recipe takes one or two pages. This estimate assumes **1.5 pages per recipe on average**, plus 4 pages at the front (title page, dedication, two contents pages), rounded up to an even number:

| Recipes | Estimated interior pages |
|---|---|
| 30 | 50 |
| 50 | 80 |
| 100 | 154 |

The server already renders the book in Chrome, so at order time we know the **exact** page count and can ask Lulu for an exact quote.

### What Lulu charges us (list prices, USD)

Prices are base + per-page price × pages, from Lulu's spec sheet ([xlsx](https://assets.lulu.com/media/specs/lulu-print-api-spec-sheet.xlsx), "Last Update 3/2026"). US Letter, A4 and 8.5" square cost the same, all on 80# coated white paper:

| SKU | Base | Per page |
|---|---|---|
| Hardcover (casewrap), premium colour, `0850X1100.FC.PRE.CW.080CW444.GXX` | $10.98 | $0.2148 |
| Hardcover, standard colour, `…FC.STD.CW.080CW444.GXX` | $10.98 | $0.0635 |
| Paperback, premium colour, `…FC.PRE.PB.080CW444.GXX` | $2.16 | $0.2148 |
| Paperback, standard colour, `…FC.STD.PB.080CW444.GXX` | $2.16 | $0.0635 |

Lulu also charges a **fulfillment fee of $0.75 per order**, however many books it holds ([help](https://help.api.lulu.com/en/support/solutions/articles/64000265990-per-order-fulfillment-fee), modified 2024-05-17). The API has no subscription or setup fee ([help](https://help.api.lulu.com/en/support/solutions/articles/64000254631-are-there-fees-to-use-lulu-s-print-api-)).

| Recipes (pages) | Hardcover premium | Hardcover standard | Paperback premium | Paperback standard |
|---|---|---|---|---|
| 30 (50) | $21.72 | $14.16 | $12.90 | $5.34 |
| 50 (80) | **$28.16** | $16.06 | $19.34 | $7.24 |
| 100 (154) | $44.06 | $20.76 | $35.24 | $11.94 |

**Caveat.** "Base + per page × pages" is our reading of the spec sheet. A cross-check against Lulu's blog suggests prices have risen since that post: a 6x9 hardcover with 100 black-and-white pages is $13.18 from the sheet against the blog's $12.07 ([blog](https://blog.lulu.com/print-on-demand-costs-for-authors/), undated). The sheet's numbers also don't match the "starting at" prices on Lulu's photo-book page ([page](https://www.lulu.com/create/photo-books)). Confirm with `POST /print-job-cost-calculations/` in the sandbox before setting prices.

### Shipping (planning figures, not quotes)

Lulu's shipping calculator and API need a browser session or an account, so no Lulu shipping prices were read. These figures are anchored on published rates for similar books:

| To | Planning figure (1 hardcover, ~1 kg) | Anchors |
|---|---|---|
| US | ~$8 (ground or mail) | RPI Print Standard to the US: $6.99 ([rates](https://open.api.rpiprint.com/shipping/rates)); Lulu's cheapest US option for a light 6x9 book: $5.69 ([blog](https://blog.lulu.com/print-on-demand-costs-for-authors/)) |
| EU (Germany) | ~$11–15 | Blurb consumer Standard to Germany: $10.99 ([Blurb shipping](https://www.blurb.com/shipping)) |
| Israel | ~$35–40, express only for now | Blurb consumer Express to Israel: $37.99 ([Blurb shipping](https://www.blurb.com/shipping)); Lulu offers only express or expedited to Israel today ([alert](https://help.api.lulu.com/en/support/solutions/articles/64000311302-middle-east-shipping-service-alert)) |

**Charge shipping at cost.** Lulu's quote endpoint returns the exact amount for the buyer's address and the shipping level they pick (`MAIL`, `PRIORITY_MAIL`, `GROUND`, `EXPEDITED`, `EXPRESS`), so we show it before payment. Israel's high shipping cost is the main risk for Israeli buyers. It's also the reason to price Gelato and Cloudprinter, which can print locally (§1).

### Suggested price

Price the book by recipe count, so the buyer sees one simple rule: **hardcover, $24 + $0.50 per recipe, shipping at cost.**

The margins below assume premium colour and about 5% in payment fees. They are before VAT and sales tax:

| Recipes | Price | Lulu cost (book + fee) | Payment fees (~5%) | Margin |
|---|---|---|---|---|
| 30 | $39 | $22.47 | $1.95 | **$14.58 (37%)** |
| 50 | $49 | $28.91 | $2.45 | **$17.64 (36%)** |
| 100 | $74 | $44.81 | $3.70 | **$25.49 (34%)** |

**For comparison:** Blurb sells an 8x10 hardcover photo book of 80 pages to consumers for $60.80 ([Blurb pricing](https://www.blurb.com/pricing)), so $49 for 50 recipes is fair. If standard colour passes the test print, the 50-recipe margin rises to about $29.70. In that case, either keep the price and the margin, or drop to about $39.

Two things not in these numbers:

- **Taxes.** Lulu's quote includes sales tax or VAT for the address, charged to us. If we're the seller (path B), we owe tax on our sale too. Get an accountant's answer before launch.
- **Reprints.** A book that arrives damaged or misprinted has to be reprinted. Plan on a few percent of orders.

A paperback could follow later as a cheaper entry, at about $12 + $0.30 per recipe in standard colour. With premium colour, a paperback earns only $4–6 at those prices.

---

## 4. Customization for a first version

| Option | V1? | Why |
|---|---|---|
| Recipes (pick from saved recipes) | **Yes** | Already built for the PDF (`BookPanel`). Set limits: at least 12 recipes, so the hardcover reaches Lulu's 24-page minimum ([guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)), and at most 150 |
| Title | **Yes** | Already in the PDF. It goes on the cover, the spine and the title page |
| Cover photo | **Yes**, chosen from the book's own recipe photos, and only those that pass the cover size rule (§5). Otherwise the current designed cover | No uploads in v1: less storage, less moderation, no extra privacy work |
| Dedication page | **Yes** | One text field, about 300 characters. It's what makes the book a gift, and it costs one page. Escape it like every other field (ADR 028) |
| Recipe order | **Yes**, drag to reorder, plus "sort A–Z" | Cheap, and people care. Chapters (grouping by tag) can wait for v2: tags are free-form today |
| Hardcover or softcover | **Hardcover only** in v1 | It's the gift product and has the healthier margin. A cheaper paperback comes later if people ask |
| Size | **One size, from the locale**: US Letter for en-US, A4 for everyone else, as the PDF does today (`cookbookPageSizeForLocale`) | Same price at Lulu, and the layout already exists |
| Paper or colour quality | **Not a choice for buyers.** We pick after the test prints | One fewer option to explain |
| Fonts, themes, layouts, back-cover text | Not in v1 | Every option is another thing to test in Hebrew and Arabic |
| Table of contents, page numbers | **Yes, automatic** | A printed book without them feels broken. Number pages in the book's own direction (§6) |

---

## 5. Photos: are they good enough to print?

**What the partners ask for:**

- **Lulu:** "Embedded images are 300 PPI resolution minimum, not exceeding 600 PPI". It also calls 150 PPI the "minimum resolution for simple graphics intended for print" ([guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)).
- **Gelato:** images "at least 150 dpi and a maximum of 300 dpi" ([help](https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads)).
- **RPI Print:** recommends 300 ppi; its preflight check warns below 150 ([docs](https://docs.api.rpiprint.com/documentation/preflight.md)).

Below 150 PPI a printed photo looks soft. Below about 100 PPI it looks blurry.

**What we store:**

- Recipes keep one `image_url`, saved from the source as it is (`persistThumbnail.ts`, in the `recipe-thumbnails` bucket). We don't record its size.
- Sources vary. Our own code treats YouTube's `hqdefault` and `sddefault` thumbnails as poor (`needsThumbnailBackfill` in `shared/lib/youtube.ts`), and many social posts give a thumbnail rather than the full photo.

**The maths for the current layout:**

- On A4, the photo at the top of a recipe page is about 7.3 in wide (523 of 595 page points).
- At 150 PPI it needs about **1,100 px** of width. A typical 1,080 px social photo just makes it.
- A 640 px thumbnail comes out at about 88 PPI, which is visibly blurry at full width.

**Suggested rule.** Measure each photo's real pixel width when the print PDF is built (the Worker already loads every photo):

| Photo width | In the printed book |
|---|---|
| ≥ 1,100 px | Full width, as today |
| 550–1,099 px | Printed small: half the page width (~3.6 in), with the title beside it. That's still ≥ 150 PPI |
| < 550 px, or failed to load | No photo. The title starts the page, as with `hideImages` today. No placeholder in print |
| Cover photo | ≥ 1,300 px wide, so it fills the front cover at 150 PPI (8.5 in) |

The order page shows a warning before payment: "4 photos are too small to print well and will be left out." The buyer can then remove those recipes or accept.

---

## 6. Right-to-left books

**Binding direction.** A Hebrew or Arabic book opens from the right, with the spine on the right. Lulu documents how to make one from an ordinary left-bound book ([help](https://help.lulu.com/en/support/solutions/articles/64000255590), modified 2026-06-08):

1. "The first page of your manuscript should be the last page of your print-ready interior PDF." In other words, reverse the page order.
2. If there are page numbers, they run in descending order in the file.
3. Put the intended front cover on the **left** of the cover spread and the back cover on the right.
4. Keep the cover as a file separate from the interior.

Lulu's own previews will show the back cover as the front ("We are unable to swap the front and back covers at this time"). We don't use Lulu's bookstore, so that doesn't matter for us.

**Other partners:**

- Blurb says it can't print RTL books.
- BookVault can, but a production barcode may land on the first page.
- Mixam offers RTL on its website only.
- Gelato, Cloudprinter and Prodigi say nothing. The same page-reversal trick should work with them, but it's untested.

**What the print PDF must do for an RTL book:**

- Choose the binding direction from the **book's** language. A Hebrew recipe inside an English book keeps its own `dir="rtl"` page, as today, but the book binds on the left.
- Reverse the page order only in the file sent to the printer. The on-screen PDF stays in reading order.
- Use the same inner margin on both sides of every page (§7). Otherwise the gutter would have to swap sides for reversed pages, which is easy to get wrong.
- Spine text reads the same way for both directions: the spine face doesn't change when a book is turned over. Lulu says to leave spine text off books of 80 pages or fewer ([guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)).
- Order a Hebrew and an Arabic test copy before launch.

---

## 7. What the print-mode PDF needs (Lulu)

All from Lulu's Book Creation Guide ([PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)) and API docs ([docs](https://api.lulu.com/docs/), [OpenAPI file](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml)).

**Interior file (one PDF):**

- **Page layout:** single pages, not spreads. All pages the same size. At least 2 pages. Hardcover needs at least 24 interior pages and paperback 32. Pad to an even count with blank pages.
- **Trim size and bleed:** US Letter is 8.5 × 11 in; with bleed, 8.75 × 11.25 in. A4 is 8.27 × 11.69 in; with bleed, 8.52 × 11.94 in. Bleed is 0.125 in (3.175 mm) on every side.
  - If nothing reaches the page edge, the file can be at trim size and "our system will automatically add the 0.125 in/3.175 mm bleed".
  - **Recommendation:** in print mode, use white pages (no `#FBF9FC` tint) and keep photos inside the margins. Then the interior goes in at trim size and needs no bleed.
- **Margins:** a safety margin of at least 0.5 in (12.7 mm). Gutter: add 0.125 in for 61–150 pages, or 0.5 in for 151–400 pages, on the spine side.
  - With the symmetric margins recommended in §6, use 0.625 in on both sides up to 150 pages, and 1 in above that.
- **Images:** 300–600 PPI is the stated spec. §5 explains why we accept 150 PPI or more.
- **Colour:** sRGB (IEC61966-2.1) or CMYK (Coated GRACoL 2006). RGB is fine: "For most projects, either color space will print without issue." Chrome outputs sRGB.
- **Fonts and file:** fonts embedded (Chrome embeds font subsets). Transparency flattened. No trim or crop marks. No password.
  - The cover's CSS blur on the "orb" shapes may produce transparency. Run `POST /validate-interior/` and `POST /validate-cover/` on every file before payment.

**Cover file (one PDF, one page):** the back cover, spine and front cover as a single spread, with 0.125 in bleed and a 0.5 in safety margin.

- **Paperback spine width:** `pages / 444 + 0.06` in, or `pages / 17.48 + 1.524` mm.
- **Paperback cover width:** 2 × trim width + spine + 0.25 in. Height: trim height + 0.25 in.
  - Lulu's own example, a 6x9 paperback with 210 pages, returns 920 × 666 pt. That matches the formula.
- **Hardcover (casewrap) spine:** from a table, not a formula:

  | Pages | Spine |
  |---|---|
  | 24–84 | 0.25 in (6 mm) |
  | 85–140 | 0.5 in (13 mm) |
  | 141–168 | 0.625 in |
  | 169–194 | 0.688 in |
  | 195–222 | 0.75 in |

- **Hardcover cover size:** a casewrap cover also wraps around the boards, so **get the full size from `POST /cover-dimensions/`** (pod_package_id + page count → width and height in pt, mm or inches) rather than computing it.
- **RTL books:** the front cover goes on the left (§6).

**Making it with what we have (ADR 028):**

- The Worker already renders `buildCookbookHtml` in Chrome. Print mode adds two things:
  1. An interior render at trim size, with print CSS: white pages, symmetric margins, the photo rule from §5, a contents page, a dedication page, page numbers, and at most two pages per recipe.
  2. A second HTML page for the cover spread, at the size from `/cover-dimensions/`.
- Lulu downloads files from a URL. Upload both PDFs to private storage with a signed URL that expires, and delete them once the job is `SHIPPED`.
  - ADR 028 measured a 60-recipe book at about 24 MB, so a 150-recipe book may approach the Worker's 128 MB memory if it's held in memory. Keep streaming it to storage rather than buffering.

**The print job** (`POST /print-jobs/`):

- **Line item:** the `pod_package_id`, the interior and cover URLs, and the title.
- **Address:** `shipping_address`, which **must include a phone number**, because Lulu's carriers require one.
- **Shipping and contact:** a `shipping_level`, and `contact_email`. That email should be ours, not the buyer's.
- **Our reference:** an `external_id`, which is our order id.
- **Cancellation window:** a `production_delay` of 60 to 2,880 minutes before the job goes to print. Use it to offer "cancel within an hour".
- **Payment:** with a card on file, Lulu charges when the job goes to production.
- **Status changes:** they arrive on the `PRINT_JOB_STATUS_CHANGED` webhook. Check the `Lulu-HMAC-SHA256` header (HMAC-SHA256 of the payload, keyed with the API secret).

---

## 8. Addresses and privacy

This is the first time Pinch would handle postal addresses and phone numbers. Gift orders add someone else's details: the recipient, who never agreed to anything with us.

**Proposal: pass the address through, don't keep it.**

| Data | Where it lives | How long |
|---|---|---|
| Buyer's name and email, payment record | The payment provider (path B) or Peecho (path A). We keep the order id, amount, currency and status | As long as accounting law requires; the accountant confirms the period |
| Shipping name, address, phone | **Sent straight from checkout into the Lulu print job and not written to our database.** Lulu keeps it, and we can read it back with `GET /print-jobs/{id}/` for support | Ours: never stored. Lulu's: per Lulu's policy, not verified |
| Country code, shipping level, Lulu print job id, tracking URL | Our `print_orders` table | With the order |
| Interior and cover PDFs (recipes, dedication) | Private storage, signed URL | Delete when the job is `SHIPPED` or `CANCELED` |
| Dedication text | In the order row until the PDF is made, then cleared | Until shipped |

How the flow works:

- **Path A (Peecho):** we never see the address at all.
- **Path B:** the hosted checkout collects the address, and PayPal Checkout can collect a shipping address. Our webhook handler creates the Lulu job in the same request.
- **When the Lulu call fails** (address validation, file rejected): keep the address encrypted, for at most 7 days, so we can retry or ask the buyer to fix it. Then delete it.
- **Address checking:** Lulu's quote endpoint returns `warnings` and a `suggested_address` (its own example: "Holstenstr. 40 -> Holstenstraße 40"). Run it before payment, so bad addresses are caught while the buyer is still on the page.
- **Privacy policy:** name Lulu, and the payment provider, as recipients of shipping data. Say that the recipient's details are used only to deliver the book.

---

## 9. Decisions for Yarden's ADR

Each one has a recommended answer.

1. **Print partner.**
   *Recommended:* Lulu Print API. Gelato is the backup if Israeli shipping costs kill Israeli orders.
2. **Who is the seller, and how is payment taken?**
   *Recommended:* first email Peecho with three questions:
   - Do you ship books to Israel?
   - Can an Israeli company receive payouts?
   - Will a book with reversed pages print correctly?

   If all three are yes, use Peecho's checkout, with Peecho as seller (path A). If not, Lulu plus a hosted checkout of our own (path B), with an accountant's sign-off on VAT and sales tax first. **Polar is out**, because its policy forbids physical goods.
3. **Which processor for path B?**
   *Recommended:* PayPal Checkout. It works for Israeli businesses, buyers in the US and EU know it, and it can collect the shipping address. Tranzila is the alternative if lower fees for Israeli buyers matter more.
4. **Product for v1.**
   *Recommended:*
   - Hardcover only.
   - One size per locale (US Letter for en-US, A4 for everyone else).
   - Colour quality (standard or premium) chosen after test prints.
   - 12–150 recipes.
5. **Price.**
   *Recommended:* $24 + $0.50 per recipe (for example, $49 for 50 recipes), with shipping charged at Lulu's quoted cost. Review the price after the test prints and the tax answer.
6. **Customization in v1.**
   *Recommended:* title, cover photo from the book's recipes, a dedication page, recipe order, and an automatic contents page with page numbers. No photo uploads, chapters, fonts or themes.
7. **Photo rule.**
   *Recommended:* full width at ≥ 1,100 px, half width at 550–1,099 px, left out below 550 px. A cover photo needs ≥ 1,300 px. Warn the buyer before payment.
8. **RTL.**
   *Recommended:* the binding follows the book's language. Use Lulu's method (reverse the pages, front cover on the left) and symmetric margins. Order a Hebrew and an Arabic test copy before launch.
9. **Addresses.**
   *Recommended:*
   - Never store the shipping address; it goes straight from checkout into the print job.
   - Keep the country, the Lulu job id and tracking.
   - When a job fails, keep the address encrypted for 7 days at most.
   - Delete the PDFs once the job ships.
10. **Where the code runs.**
    *Recommended:*
    - The print PDF is made in the web Worker, which already has Chrome (ADR 028).
    - The order, quote and Lulu webhook live in Edge Functions, following ADR 024's conventions.
    - Test with the Lulu sandbox and the payment provider's sandbox (`supabase/README.md`, "Testing backend changes"), never with real orders.
11. **Which platforms sell it?**
    *Recommended:*
    - Launch on web first.
    - The phone apps link to the web order page. Apple 3.1.3(e) and Google's Payments policy both allow this for physical goods.
    - Add an in-app card form only if people ask for one.

### What wasn't verified (check before the ADR)

- **Exact Lulu prices and shipping** for real addresses in the US, Germany and Israel. Run `/print-job-cost-calculations/` in the sandbox; this needs a sandbox account.
- **Gelato and Cloudprinter** book and shipping prices to Israel (their dashboards).
- **Peecho:** Israel shipping, payouts, fees, RTL, and whether the checkout is still maintained.
- **Lulu packaging:** whether Lulu puts a packing slip or prices in the parcel (matters for gifts), and how long Lulu keeps shipping addresses.
- **PayPal:** Israel fees and acceptable use policy (the pages refused automated reads).
- **Taxes:** VAT and sales tax obligations for path B.
