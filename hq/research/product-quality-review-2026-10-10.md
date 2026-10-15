# Product quality review — 10 October 2026

Status: bounded design and competitive review. This note records a local Shop
improvement and an evidence-backed sequence for Shop, Sites and Commerce. It
does not authorize provider writes, production release, customer contact, or
new account access.

## Evidence and limits

- The supplied Shop image is explicitly an isolated, network-blocked test
  fixture with synthetic records. Its top button strip is QA harness chrome;
  it is not a customer feature and must not appear in a public product capture.
- Source review found `ShopToday` rendered only the first six catalog rows.
  This could hide an item at or below its reorder level. The dashboard now puts
  those rows first and preserves the catalog order within each group.
- REA static evidence `ev_2486158ba642f2732572d99f79ddf613dddc343f1e3cf1cd90597e5ef4b4a98e`
  covers one 398,551-byte shipped JavaScript chunk (109 graph nodes, 518
  edges). It is static, single-chunk evidence: it does not prove runtime
  behavior, cover every route, or establish how a competitor's logged-in POS
  works. A focused REA MCP trace was unavailable because its transport closed;
  no retry was made.
- Competitor comparisons below use public vendor pages and help documentation.
  They are vendor-published claims, not independent merchant trials.

## Competitive observations

- [Autumn](https://autumnos.com/) markets automatic order capture across
  Facebook, Telegram, inbox, TikTok, website and POS; barcode packing checks;
  automatic invoicing; and shared inventory. This makes connected social order
  intake a local-market parity gap. It does not justify presenting manual
  message pasting as an integration.
- [IrraTech](https://irratechmyanmar.com/en) markets barcode-ready SKU setup,
  stock in/out and valuation, daily sales and cash summaries, order tracking,
  multi-branch inventory, and online catalog/payment/fulfilment management.
- [Square](https://squareup.com/us/en/retail/capabilities?country_redirection=true)
  documents barcode item creation, stock counts, low-stock alerts, purchase
  orders, barcode labels and cross-channel/location inventory. Its separate
  [offline-payment guidance](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode)
  makes pending, declined and risk-limited offline payments explicit; card
  acquiring behavior must not be copied as if it were KBZPay or WavePay.
- [Shopify's inventory CSV workflow](https://help.shopify.com/en/manual/inventory-and-locations/setup/inventory-csv)
  distinguishes inventory states and locations and checks the exported
  current count before applying a new count. This is a useful safety pattern
  for our import and reconciliation work.

## Product findings and sequence

### Shop — first priority

1. **Dashboard relevance (implemented locally):** surface stock at/below
   reorder before healthy products in the existing six-row preview, without
   adding controls or changing inventory.
2. **Reliable daily loop:** keep the default path to sell, fulfil/collect,
   reconcile and close. Make urgent exceptions the first action; keep
   advanced controls out of the daily path.
3. **Catalog speed and safety:** retain the existing reviewed CSV import;
   next add preview reconciliation that detects stale counts and duplicate
   SKU/barcode rows before approval. Keep barcode/camera and keyboard-wedge
   paths feeding the same item lookup.
4. **Channel intake:** Website and Commerce requests currently appear
   automatically; the Orders UI says Messenger and Viber are not connected.
   Build channel adapters only against official provider APIs, with
   idempotency, source-message/order provenance, duplicate handling and a
   human review queue for ambiguous identity, item, quantity, address or
   payment. Keep manual capture for phone/walk-in only.
5. **Restock and hardware:** turn a low-stock signal into an explainable
   reorder draft using sales velocity and lead time; never submit a supplier
   order automatically. Validate receipt printers and scanners against a
   real Myanmar Android device/printer before claiming compatibility.

### Sites and Commerce

- Sites: make the first-run path choose a Burmese/English template, replace
  sample content, preview mobile/desktop, pass page checks, then publish. Use
  real current app captures for every advertised editor/inquiry workflow; the
  public screenshots must not be stale or include QA controls.
- Commerce: start from the same Shop catalog, make the request-to-confirmed
  order and payment/fulfilment state obvious, and show the next human action.
  Any catalog, payment, or channel connection must be labelled by its actual
  state (local draft, connected, synced, or awaiting review).
- Shared onboarding: get a first real item/page/order recorded with only
  essential fields, Myanmar language and MMK defaults, sample data clearly
  separated, and a recovery/export path visible before inviting a team.

### AI and architecture

- Treat shelf photos and supplier invoices as **proposal sources**, not
  authoritative catalog writes: extract candidates, show evidence and
  confidence, validate SKU/price/quantity, then require operator approval.
  Build a Burmese/English golden set and measure field accuracy before exposing
  AI assistance to merchants.
- Let replenishment agents prepare a purchase draft with the stock calculation,
  lead-time assumption and source records shown. Do not let a model negotiate,
  message suppliers, spend money or commit inventory without a separately
  authorized workflow.
- Do not replace the current commerce core with Medusa/Saleor or add a CRDT /
  workflow engine solely because the supplied memo names them. First write the
  source-of-truth, offline-write, idempotency, conflict and recovery contract;
  then test an adapter/isolated spike against that contract and compare
  operational cost, data ownership, migration and device performance.

## Acceptance checks for the next design cycle

- A first-time Myanmar shop operator can add one item, scan it, record a sale,
  show a receipt and understand remaining stock without opening advanced tools.
- Low-stock rows are visible in the first dashboard product preview, and a
  healthy catalog stays in its existing order.
- An imported stale count or duplicate SKU is flagged before any stock change.
- A connected channel order appears once with its source and a clear next step;
  ambiguous messages never become confirmed orders automatically.
- Every public product image is a dated capture of the real app with synthetic
  example data disclosed and test harness controls cropped out.
- AI catalog/reorder suggestions are judged on a held-out Burmese/English
  dataset and remain drafts until an operator confirms them.

## Next execution order

1. Refresh actual Shop/Sites/Commerce product captures from the isolated real
   fixtures, excluding fixture-only controls; do not reuse generated mockups as
   product proof.
2. Add stale-stock/duplicate detection to reviewed import and exercise it on
   low-end Android-sized layouts.
3. Measure the first-sale journey with Burmese-speaking operators using
   consented synthetic or owner-approved data; record time, errors and
   abandonment before redesigning secondary controls.
4. Build a documented channel adapter proof only after official API access and
   sandbox credentials are separately available; keep the internal schema
   transport-neutral.
5. Evaluate photo/invoice catalog assistance offline on a golden set before
   deciding whether to ship it.
