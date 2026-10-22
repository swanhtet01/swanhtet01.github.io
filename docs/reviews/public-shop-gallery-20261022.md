# Independent public Shop gallery review — 22 October 2026

**Reviewed source and asset head:** `7834fa8c597a430cab32f60691bf0e319c4f48a5` on draft PR #726. The branch was clean and matched its remote when reviewed. Exact-head App CI run `39769362426` finished successfully before this review was committed. This document is a review artifact; its own commit changes the Git head without changing the reviewed showroom or gallery assets.

**Verdict: PASS for a `browser_component_synthetic` Shop-gallery attestation only.** The captures are of the real local browser component with synthetic records. This verdict does not establish hosted behavior, customer acceptance, a native-app release, full Burmese coverage, or launch readiness.

| Gate | Result | Evidence and limit |
| --- | --- | --- |
| Capture provenance | PASS | [`public-gallery-capture.json`](../../tools/public-assets/public-gallery-capture.json) has 31 captures; all 31 PNG SHA-256 values and PNG dimensions match the files and [`public-gallery-provenance.json`](../../tools/public-assets/public-gallery-provenance.json). Capture source commit `62f044d8faaf9c81454ec0f9610b31243f206032` records showroom tree `b98162d3b373604a37f4409b05c13c24b1578ff8`, identical to the reviewed head's showroom tree. |
| Public scope | PASS | The 15 names in [`PUBLIC_SHOP_GALLERY_ASSETS`](../../tools/public_gallery_rights.mjs) are unique Shop PNGs, all present in capture/provenance and byte-identical to the 15 `actual-*.png` files in local `.vercel/output/static/images/`. The other 16 source captures are not in that public output. |
| Cross-host raw inputs | PASS | Windows worktree and Git-blob SHA-256 agree: capture `78352780408029ba8e115e9b4e39586ff34a544e2b3e7ac076003857c2404d64`; provenance `d9d867aa3725f3ced71af91fea3052ff9a026edec9a4c319151ec3fed04a7690`; photo rights ledger `90bf5d0e0c3afacb0e51f688d53a7ec784832327afc3118b2ec20e2b372e0aa8`. |
| Product-photo ledger | PASS for internal consistency | All five derivative PNG hashes match [`sources.json`](../../tools/qa-assets/shop-products/sources.json) and each item's `publication_rights.evidence_sha256`. The ledger identifies the author, Commons source page, publication basis, and attribution below. Independent access to the live Commons license pages was **NOT RUN**; do not describe these as externally reverified by this review. |
| Focused checks | PASS | `node --test tools/test_shop_photo_provenance.mjs tools/test_public_gallery_release_gate.mjs tools/test_shop_order_attention.mjs tools/test_ui_locale.mjs`: 17 passed, 0 failed at the reviewed asset state. |

The photo ledger records these five source and attribution claims; the full derivative digests remain in `sources.json`:

| Sample item | Ledger author and source | Ledger publication basis |
| --- | --- | --- |
| Red apple | Fructibus, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Red_apple_on_a_plate_2017_A.jpg) | CC0 1.0 |
| Bananas | ZooFari, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Banana_Fruit.JPG) | Author public-domain dedication |
| Red tomato | Nat1620, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Red_tomato.jpg) | CC0 1.0 |
| Red onions | Eoin Kilfeather, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Red_onion.jpg) | Author public-domain dedication |
| Mango | Saidismailanik, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_ripe_yellow_mango_2025.jpg) | CC0 1.0 |

Visual inspection of the actual Shop captures at 390, 768, and 1440 pixels found legible product photos, stock values, sale actions, and order labels without evident clipping in the inspected frames. English and Burmese Inventory now depict the **same completed synthetic sale**: apple stock 7, bananas 33, 87 total units; the earlier locale-state mismatch is resolved. Orders labels distinguish `UNPAID` from `ORDER DUE SOON` (the fulfilment promise) and do not claim that payment is late. The Today sales figure shows one completed synthetic sale; its sparse chart explains why no trend is shown. Public Shop copy calls the screens browser samples with illustrative records and prices, not a live retail feed.

**Remaining gates and quality findings:** Rendered Contact-page/browser navigation QA, live source-license URL verification, hosted Preview readback, and customer/device testing are **NOT RUN** by this independent review. Source inspection found Shop/Contact navigation and language links consistent, but that is not rendered QA. Full Burmese coverage is **BLOCKED**: the captures retain Latin `MMK`, and secondary flows are not completely translated. The desktop Orders capture remains sparse above a long stack of secondary accordions; it is an app-design improvement still due, not proof of the requested premium finish. These limitations must remain visible beside any scoped gallery attestation. Any subsequent showroom, capture, public-asset, or rights-ledger change requires a fresh review.
