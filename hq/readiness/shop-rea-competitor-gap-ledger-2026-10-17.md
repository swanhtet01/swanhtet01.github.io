# Shop REA and competitor gap ledger — 17 Oct 2026

## Decision

Use competitor research to test whether a customer job is easy and complete, not to copy another company's code, assets, or exact interface. Keep the customer-facing launch Shop-only; keep Sites and Commerce internal. Current product and website work is still a candidate, not a live release.

## Evidence and limits

| Subject | Evidence | What it establishes | What remains unknown |
| --- | --- | --- | --- |
| KMO Windows installer | REA evidence `ev_f91960950d461214d461d384f24688d06713a5ce9b55cf849e585e71b4ab99fc`; SHA-256 `e068fad1eb5c689dad664fbfb0eb860fdc7a2a78302ddb133fd4551bde1fc190` | 40,210,587-byte x86 PE; no managed CLI metadata; artifact inventory has one executable and no child entries. | No installer execution or runtime trace. Native disassembly is unavailable here: Ghidra is not configured, Hopper is unsupported on Windows, and IDA is not connected. Do not infer KMO internals from the installer filename or the supplied screenshot. |
| KMO Android APK | REA open result SHA-256 `324fd956faf36efbacf612b139478a5b45fc204891e49320d7a61424971d2f7f` | The supplied file is an APK archive. | Class/manifest inspection is blocked because this session has no caller-supplied JADX MCP JAR. REA's general archive inspection also refused the package because `res/9n.9.png` and `res/9N.9.png` collide under Windows path case-folding. This is an analyzer path-safety limitation, not proof the APK is malicious. The APK was not executed and its signature was not verified. |
| ZayTap | [Official ZayTap page](https://www.hextechsoftware.com/zaytap.php), read 17 Oct 2026 | The page presents EN/Myanmar, Myanmar SME positioning, sales, stock, reports, staff access, receipt handling, setup/support, and claims an offline mode. It lists Android v2.1.4 and marks Windows/web as pending. | These are vendor claims, not an independent product test. The same page shows zero-valued adoption/reliability counters; do not repeat those as proof or use the page as a trust benchmark. |
| HexTech | [Official company page](https://www.hextechsoftware.com/), read 17 Oct 2026 | Shows a local-service position and support/hardware/cloud services alongside ZayTap. | No evidence here that announced or “coming soon” products are shipping. |
| Square Retail | [Barcode item creation](https://squareup.com/help/us/en/article/7992-automate-item-creation-with-square-for-retail), [inventory workflows](https://squareup.com/help/us/en/article/6110-manage-inventory-with-the-retail-pos-app), and [capabilities](https://squareup.com/us/en/retail/capabilities), read 17 Oct 2026 | Official docs describe barcode-based item creation, duplicate-GTIN feedback, barcode-assisted inventory counts and bulk stock receiving, purchase orders/vendors, labels, refunds/exchanges, and offline-payment behavior. | Availability varies by device, plan, country, and hardware. These docs do not prove Myanmar payment support or local suitability. |

REA is now in the R&D loop for supplied binaries and runtime evidence. For this KMO sample, REA established identity and bounded PE facts; the deeper native and Android branches remain blocked by missing analysis providers. No software was installed and neither sample was executed.

## Shop implementation evidence

- The sale counter already accepts keyboard-wedge scans through the search field and camera scans through `BarcodeDetector`; both use the same exact-SKU resolver. Unknown, duplicate, and out-of-stock codes do not silently add an item. The scanner is available in product entry and stock count as well.
- Stock count scanning resolves an exact SKU and preserves location/lot review. A scanned code does not directly post stock.
- Customer receipts are bilingual, exclude internal evidence, and render to an 80 mm browser-print layout. Receipt details must be configured before printing; browser printing is not proof of a tested printer model.
- Shop offers MMK and local payment-method selection/merchant-QR presentation. No automated KBZPay API settlement or certification is established by these features.
- Catalog import and first-product guidance exist. They do not establish a production onboarding, hosted identity, tenant isolation, or zero-manual GTIN enrichment flow.
- This pass clarifies the counter search for Myanmar operators: it now says name, barcode or SKU, and an unmatched scan prompts those same recovery choices. The current exact-code resolver and camera scan path are unchanged.
- The Shop home carousel already contains four distinct app captures (counter sale, Today, orders, inventory). REA-linked integration review found the public preview path allowlist omitted the inventory desktop/mobile images; both exact static paths are now permitted, while query/hash variants remain rejected.

### Small UX change made this pass

When legacy open orders block opening a new Shop day, the operating strip now names the count (“Review 2 orders”) instead of the vague “Review orders”. It preserves the existing gate and order-review route; it does not create, close, or change an order.

## Gap ranking and acceptance

| Priority | Gap | Minimum evidence before calling it done |
| --- | --- | --- |
| P0 | Hosted auth and tenant isolation | Successful managed login; two synthetic tenants; each user can read/write only its own Shop data; anonymous and cross-tenant reads/writes denied; session revocation verified. The current preview branch is still reported `MIGRATIONS_FAILED`; reconcile exact migration history/schema before any approved preview repair. |
| P0 | Shop-first use | One owner can add/import a small catalog, scan and complete a sale, review order/stock effects, print a receipt, and close the day without contacting staff. Test from a clean account and retain the error/recovery path. |
| P1 | Hardware reality | Exercise a USB/Bluetooth keyboard-wedge scanner and camera on supported browsers; verify 58 mm and 80 mm printer output, Myanmar glyphs, clipping, duplicate prevention, and recovery after a cancelled print. Keep each exact model/version in the test record. |
| P1 | Receiving stock | Compare purchase-order receiving with Square’s bulk scan workflow. Current scanner coverage is strongest for sales/counting; prove multi-item receive, discrepancy review, and stock posting as one safe reviewed workflow before claiming parity. |
| P1 | Myanmar-ready service | Have a native Burmese reviewer approve the operator-facing Shop setup, sale, payment, and recovery strings. Pending translations stay English until reviewed. |
| P1 | Website proof | Keep screenshots tied to real Shop routes and current components, label synthetic records, and verify each link/image at desktop and mobile widths. Merge/deploy status must be verified separately; local captures do not update the public domain. |
| P2 | Offline/restore and integrations | Demonstrate durable offline queueing, reconnect conflict handling, backup/restore, and each payment integration with its official provider and explicit owner approval. Do not turn “QR shown” into “payment integrated”. |

## Status

REA artifact identity/format: **PASS**. KMO deep native inspection: **BLOCKED** by missing provider. APK class inspection: **BLOCKED** by missing JADX. ZayTap/Square public-source comparison: **PASS as a claims-and-workflow comparison only**. KMO runtime, hardware compatibility, managed hosted auth, multi-tenant isolation, public-site deployment, and customer acceptance: **NOT RUN**. The overall launch candidate is **not ready to mark GO** until the P0 evidence and hosted gates above are closed.
