# Shop local-POS benchmark and implementation note — 17 Oct 2026

## Scope and evidence boundary

This is a bounded workflow benchmark for the Shop-first release candidate. It combines the supplied counter screenshot, a static REA attempt on the supplied KMO packages, competitor-published product material, and SuperMega source/tests. Vendor pages describe vendor claims; they do not prove observed runtime behavior. The KMO installer and APK were not executed.

- The supplied counter screenshot shows a cashier-oriented layout: barcode/SKU search, category shortcuts, product tiles with stock and MMK price, a persistent basket, quantity changes, discount, hold/order actions, and Cash/KBZPay/WavePay/AYA Pay/MMQR choices.
- The KMO Windows file was SHA-256 `e068fad1eb5c689dad664fbfb0eb860fdc7a2a78302ddb133fd4551bde1fc190`. REA classified it as an x86 PE, not a managed application; archive inspection found no child package. REA evidence: `ev_c4ff602c2908b0361d1f378da50e6d10d7525acf2f1871427f972401414f6da9` and `ev_f56a71664195703b8d6a95dd66a822eca525a0b59efd7f0566641ffaa55b4ddd`. Application behavior remains unknown from those results.
- The KMO Android file was SHA-256 `324fd956faf36efbacf612b139478a5b45fc204891e49320d7a61424971d2f7f`. REA identified it as an APK, but bytecode inventory was unavailable because this host has no caller-supplied JADX MCP JAR. General APK inventory also stopped on case-colliding entries `res/9n.9.png` and `res/9N.9.png`. No KMO APK code or runtime behavior is claimed here.
- KMO’s public page claims offline local storage, Burmese thermal printing, barcode scanning/labels, alternate units, customer credit/loyalty, cash reconciliation, and an MMK note calculator. These are useful benchmark leads, not independently validated capabilities: [KMO POS](https://kmopos.com/).
- ZayTap’s public page emphasizes Myanmar SME fit, English/Myanmar language choice, setup help, online/offline operation, local support, multi-user access, receipts, and a simple add-stock-sell-report flow: [ZayTap](https://www.hextechsoftware.com/zaytap.php). These remain product-page claims.
- Square’s official guidance documents stock receiving and reason-coded adjustments, bulk and location-aware stock operations, and camera/USB/Bluetooth barcode paths that add scanned items to checkout: [inventory workflows](https://squareup.com/help/us/en/article/6110-manage-inventory-with-the-retail-pos-app), [barcode scanning](https://squareup.com/help/us/en/article/5143-bar-code-scanners-with-square-point-of-sale).

## SuperMega baseline and applied improvement

Current Shop source already supports catalog import with Burmese category/header matching and preserved leading-zero barcodes, camera and keyboard-wedge scans, stock counts and purchase receiving, an order close workflow with variance ownership, and Burmese/English browser-print receipts. Focused local tests cover those source behaviors. Real scanner/printer compatibility and true offline operation remain unverified.

The close flow required a cashier to calculate drawer cash separately and type one total. The new collapsed **Count cash by notes** helper appears only beside a cash settlement line. It totals common MMK notes plus an “Other notes or coins” amount, then fills the existing counted-cash draft. It does not save a close, move money, or change non-cash payment lines. Invalid, fractional, negative, or incomplete inputs cannot be applied.

The public site candidate already presents four distinct real Shop application captures—Today, counter sale, orders, and inventory—with desktop and mobile views. Capture records are synthetic local data, tied to the Shop source tree; this is not customer data or proof of a live deployment. The local build is not a production release.

## Competitive build priorities

1. **Finish trust gates before launch:** establish managed sign-in and tenant-isolation evidence in preview; prove the exact public site candidate on its hosted route; and run real Android/desktop scanner and thermal-printer tests, including Burmese glyph rendering. A payment label such as KBZPay is not evidence of a live payment-gateway integration.
2. **Make Myanmar retail tasks one-pass:** preserve the visible scanner-to-basket flow, MMK arithmetic, bilingual item names and receipts; next add explicit item-unit conversions with safe base-unit stock accounting and CSV import/export round trips.
3. **Earn offline claims:** benchmark KMO’s claim, then design a bounded local outbox, idempotent sync, conflict visibility, restore testing, and tenant-safe retention. Keep offline mode unclaimed until these pass on real hardware and with managed accounts.
4. **Add depth only where it removes manual work:** evaluate expiry/batch capture for pharmacies, tiered prices and customer credit for wholesale, barcode label printing, and shift float/cash-difference review. Reuse the existing Shop order, stock, and accountable-close records instead of adding parallel lists.
5. **Keep the public story visual and verifiable:** use real feature captures and responsive framing, Burmese/MMK examples, and transparent demo-data labels. Do not reuse competitor code, artwork, text, or screenshots; reproduce useful workflow principles in SuperMega’s own UI and brand.

## Gate status

This benchmark and cash-count improvement raise local/source readiness only. Preview auth and tenant isolation, hosted website acceptance, physical hardware, offline reliability, KBZPay gateway status, and production release remain separate evidence gates.
