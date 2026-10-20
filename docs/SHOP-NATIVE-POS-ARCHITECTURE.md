# SuperMega Shop native POS: architecture and release plan

**Decision:** build a first-party Flutter counter client for Android tablets and iPad, backed by Drift/SQLite on each device. Until the shared catalog and sync contract is implemented, treat it as a separate local-first Shop pilot; do not present its catalog as synchronized with the existing web Shop.

**Current baseline (20 Oct 2026):** the customer-facing Shop remains React/Vite with local browser persistence and the `supermega.commerce.workspace.v2` data model. Its browser recovery journal does not sync to a server or prove remote acknowledgement. The native Flutter source has an empty-first counter, a Drift v3 local catalog, keyboard-wedge barcode search, manual product setup, reviewed menu-to-catalog import, atomic cash and manually verified wallet sales, stock movements, and a pending local outbox. User-started private-subnet printer discovery now saves a tested private host and completed sales can send/retry a receipt; this is source evidence only, with no physical printer acceptance. Local KBZPay/WavePay settings display the exact merchant-confirmed static MMQR. These stores are not connected to the web Shop or a remote service. The photo endpoint is strict-schema `gpt-4o` code but remains disabled: the checked serving Vercel projects have no `OPENAI_API_KEY`, `SHOP_MENU_AI_ENABLED`, or pilot allowlist configured. Flutter/Dart are not available in this Windows session, so analysis and Flutter tests are **NOT RUN** here; earlier 33-test claims are not current evidence. Android packaging is also blocked by the missing Android SDK; iOS packaging needs macOS/Xcode. No physical device, printer, or wallet scan has been tested. This is local implementation evidence, not a shipped or launch-ready native POS claim.

### Existing Shop contract to preserve

Before syncing the native local catalog with the existing Commerce v2 state, inventory its serialization, validation and migration paths, barcode/category/Burmese-name semantics, order snapshots, stock movements, payment records, and backup/import/export behavior. Define an explicit lossless mapping and versioned compatibility layer. Native product IDs are local stable IDs; SKU and barcode remain editable text identifiers, not global identity. The current Drift database contains active products, sales, sale-line snapshots, stock movements, wallet profiles, menu drafts, and a local outbox. That outbox has no delivery worker or server acknowledgement. The browser recovery journal is also not a server sync API, so the tenant boundary, auth, idempotency, revision/conflict behavior, and acknowledgement receipt must be designed and tested before cloud sync.

### Data-contract gate before shared sync

The current `CommerceItem` shape in `showroom/src/core/commerce-workspace.ts` has a SKU, names, category, barcode, stock, reorder level, and MMK price; it has no immutable `productId` or description. Existing order lines snapshot the SKU and item names rather than a product ID. The menu-import contract returns `category`, `description`, `name`, and `price`, but not SKU or starting stock; a direct insert into the current model would discard the description and require invented or user-entered identity/stock. Do not create a second native catalog to work around this mismatch.

Before catalog sync, version the shared contract to add an immutable product ID and optional description, migrate existing records once, preserve text barcodes and Burmese fields, and snapshot product IDs plus display fields on sale lines. Define collision-safe SKU generation and keep the opening-stock confirmation required. Preserve fields through the browser validator, CSV import/export, backup and server API. Test old workspace migration, round-trip export/import, and duplicate/offline ID reconciliation. Photo candidates cannot enter the local sellable catalog until each name, price, and opening-stock count is confirmed.

## Product promise and first-use flow

The cashier can start offline without a login or fake demo products. Network-dependent features explain the dependency only when used.

1. Open Shop and add a real product; do not require cloud sign-in to make the first local sale.
2. Add items by typing or the optional menu photo. AI import requires explicit photo consent and a configured signed-in account; results are suggestions until reviewed. Blank/uncertain prices and opening stock must be confirmed before commit.
3. Complete a cash sale offline. The database commits the sale, line snapshots, stock movement, and sync-outbox event in one SQLite transaction.
4. Open receipt-printer setup only when needed, tap **Find printers**, and send a test slip to a candidate. After the test, the app saves that private host; completed sales try to print and expose a retry action if printing fails. Receipt delivery after a process restart and physical hardware behavior are not yet proven.
5. Save merchant details and the exact provider-issued static MMQR payload. A phone number by itself never becomes a payment QR. At checkout the customer scans the merchant QR and enters the displayed amount; the cashier checks the incoming transaction in the wallet app and explicitly confirms it in Shop. A scan or QR display never marks payment received.
6. Local sales create pending outbox events only. Cloud sync is not implemented; never describe those records as backed up or synchronized.

## Architecture boundaries

| Layer | Responsibility | Must not do |
| --- | --- | --- |
| Flutter screens | Counter, catalogue setup, review drafts, printer selection/test, payment settings | Call provider SDKs, mutate SQLite tables directly, or hide sync/payment state |
| Application services | `CreateSale`, `CommitCatalogBatch`, `ImportMenuDraft`, `DiscoverPrinters`, `PrintTestReceipt`, `SyncOutbox` | Depend on widget state or fabricate successful external actions |
| Domain | MMK integer arithmetic, order/payment/inventory transitions, stable IDs, validation and conflict policy | Assume a network, clock, printer, wallet, or remote write succeeded |
| Drift database | Transactional source of truth for the current device; migrations, indexes, constraints | Store an unreviewed AI draft as sellable stock or acknowledge cloud sync locally |
| Adapters | Vercel/Supabase API, image picker, LAN scanner, ESC/POS transport, QR renderer | Leak provider/network exceptions into cashier flows or claim payment confirmation |

Use ports/interfaces around image recognition, printer discovery/printing, and sync. Keep the low-adoption printer package behind that port so it can be replaced without rewriting the counter.

### Local data and durable writes

The native first-run counter now has a versioned Drift schema for local products, completed cash sales, immutable sale-line snapshots, stock movements and a pending sync outbox. It also preserves the existing menu-import review drafts and merchant wallet profiles. This is the on-device transaction boundary, not proof of cloud sync or multi-device consistency. The broader workspace and sync fields below remain the target contract:

- `workspace` and `device`: stable IDs, owner-visible names, local preferences and last acknowledged server revision.
- `product` and `product_barcode`: stable `productId`, workspace/store scope, SKU/barcode as text, English/Burmese display names, category, variant, integer `priceMmk`, integer `onHand`, `reorderAt`, local revision, and archived state. Barcode is text so leading zeroes survive.
- `sale`, `sale_line`, `payment_entry`, `inventory_movement`: immutable historical snapshots and append-only financial/stock events; corrections are new events with an actor and reason.
- `sync_outbox`: unique `operationId`, workspace/device IDs, schema version, event type, canonical payload, creation time, retry count, last error class, and server acknowledgement. Never store access tokens or raw menu images here.
- `printer_profile`: operator-selected transport, host/port or OS-managed identity, model notes, paper width, and last test result. Do not persist every discovered network host.

**Atomicity rule:** a completed sale, its line price/name snapshots, payment record, stock movement, and one idempotent outbox operation commit together. A failed transaction leaves all of them unchanged. “Parked” orders reserve stock only if the existing domain policy explicitly says so; no hidden stock decrement. AI import commits all approved rows in one transaction, assigning IDs locally and requiring the operator to supply or confirm SKU/barcode and opening stock. The model never invents those identifiers or counts.

### Sync and offline recovery

1. SQLite is authoritative for local work, even after a process kill or reboot.
2. Each accepted mutation writes an outbox event in the same transaction as the business rows. Retrying the same `operationId` must return the same server result without applying stock twice.
3. Server responses acknowledge an operation and advance a workspace revision. Pending, failed, and acknowledged are distinct states; “saved” never means “synced”.
4. Catalog edits use explicit revision/conflict handling. Sales, payments, and stock movements are append-only; never last-write-wins financial records.
5. If a device is offline, local sales and receipts continue. Sync pauses safely and resumes later with backoff. A conflict enters a human review queue; it never silently overwrites a sale or stock count.
6. Backups are encrypted, owner-triggered or clearly scheduled, workspace-scoped, versioned, and restore-tested. A backup is not sync and a QR image is not automatically copied between merchant workspaces.

Before implementing sync, align this native schema with existing Shop/API contracts and the managed server's current schema. Do not put new fields into Supabase or production until schema ownership, RLS, idempotency, migration rollback, and the approved preview path are verified. The current preview migration state is not clean enough to count as sync acceptance.

## Zero-friction features

### Snap-to-Menu

**Already present locally:** `POST /api/shop/menu-import` is disabled by default, requires a verified Supabase user on an explicit internal allowlist, requires `cloudConsent: true`, caps JPEG/PNG/WebP at 2.4 MB, requests strict structured output, and returns at most 100 candidates under the shared `shop-menu-import.v1` contract. It logs no image and does not write the catalog. Its tests are local mocks; no provider request or deployment has run.

**Native flow:** `image_picker` opens the camera/gallery only after an operator action. Allow crop/rotate and resize on device; show exactly what will leave the device and require one explicit cloud-consent action. Send only the chosen image to the authenticated function. Display extracted category/name/price/description in a compact editable list; flag uncertain/duplicate rows, never fill missing prices with zero, and add SKU/barcode/opening stock through a short review step. Confirmation inserts the approved batch in one Drift transaction. Cancel sends nothing and creates no catalog row. Delete the temporary image after the response; do not cache it in the outbox or logs.

The OpenAI strict schema uses a versioned object envelope with the requested item array at `items`; this keeps the transport version explicit while the AI output itself remains constrained to the four requested fields. The model is not trusted to create a SKU, barcode, stock count, payment state, or category outside its supplied evidence.

**Acceptance:** offline/manual and CSV setup still work; network loss before response creates no rows; cancel is no-write; a null/ambiguous price blocks final confirmation; duplicates are visible; a process kill during commit yields either the entire batch or none; retry never duplicates; English and Burmese source text survive round-trip; image bytes are absent from logs, local catalog, outbox, and backups.

### Zero-configuration receipt printer

Do discovery only after an explicit tap and a short explanation that Shop will look on the current local network. First use the OS/platform's supported local discovery where available; otherwise obtain the current subnet and run a bounded, cancellable TCP reachability scan with a small concurrency and strict timeout. Port 9100 means “possible raw ESC/POS endpoint”, not “compatible printer”. Show a short candidate list with address/vendor hints where actually observed, let the cashier select one, then require a successful test receipt before persisting.

Keep the connection profile per store/device. Do not scan continuously, cross subnets, send arbitrary commands, or silently pick the first host. A failed print remains visible and can be retried; the sale is not replayed because a receipt print failed. Support system print/share fallback. Burmese output must be tested: if printer code pages do not support Myanmar Unicode, rasterize the receipt using a bundled/licensed Myanmar font and test paper width, clipping, speed, and legibility.

Do not use `ping_discover_network` 0.2.0+1: pub.dev marks it Dart 3 incompatible and its last release was six years ago. The current `unified_esc_pos_printer` guide documents network-only `scanPrinters` with a timeout and a network connection on port 9100. It does not document a configurable scan-port option or guarantee that discovery is limited to the device's current subnet. Keep it behind `ReceiptPrinterDiscovery`; inspect the exact pinned source before adopting its scanner. If its scan scope cannot be bounded, derive the current interface's local prefix and run a cancellable, concurrency-limited TCP probe only on that local range, with a hard host-count cap. Never scan continuously, cross subnets, or silently select a result. Port 9100 means “possible raw ESC/POS endpoint”, not “compatible printer”. The package's tested-device table lists RPP02N for BLE, Bluetooth Classic, and USB—not network printing. Treat network discovery and transport as unverified until tested against named printer models. iPadOS requires `NSLocalNetworkUsageDescription`; ask for access only when the operator starts discovery. Test permission denied, Wi-Fi changed, subnet unavailable, isolated guest Wi-Fi, printer asleep, wrong protocol, paper-out, disconnect during print, duplicate tap, and reprint behavior.

### KBZPay, WavePay, and Myanmar QR

The settings form may store a merchant's provider label and phone number for staff reference, with access controls. It must clearly say that this does not connect a wallet or create a payment request. KBZPay describes MMQR as a merchant payment service and requires partner onboarding; Wave Money likewise distinguishes Wave Merchant QR/MMQR from a personal phone number. MVP checkout displays the merchant's provider-issued QR image/payload and amount due as presentation only; the cashier records payment only after checking the provider confirmation. A QR scan never flips an order to paid.

The official [Myanmar QR specification](https://myanmarpay.gov.mm/frontend/assets/files/MyanmarQRSpecification.pdf) defines static and dynamic merchant-presented QR formats and their merchant/acquirer data. [KBZPay MMQR](https://www.kbzpay.com/en/products/mmqr) and [Wave Money MMQR merchant onboarding](https://www.wavemoney.com.mm/partner/myanmar-pay-merchant/) describe merchant enrollment and official QR issuance. Wave's [customer QR guide](https://www.wavemoney.com.mm/userguide-type/qr-payment-wave-app/) also documents manually entering a merchant phone number and then entering the amount; that supports a clear manual fallback, not an invented URI. `qr_flutter` only renders data. Use it to render an official provider-issued payload, or a dynamic payload only after its provider/acquirer has confirmed the exact scheme and tests pass. Do not synthesize `kbzpay://` or `wavepay://` links from phone numbers. On the payment screen keep the amount, merchant identity, method, and **Mark payment received** action together; payment remains pending until cashier confirmation or an audited provider callback.

The existing kernel QR helper conservatively counts UTF-8 bytes, validates fee-indicator dependencies, known additional-data formats, and nested payment-system TLV structure, applies a 512-byte aggregate limit to input and generated output, checks required structure and checksum, rejects zero/fractional/unsafe MMK values, preserves existing additional-data fields, and labels its fixture as synthetic. This is a supported subset validator, not issuer certification: the local tests do not prove a real issuer accepts generated dynamic codes. The Shop UI still uses provider-issued QR image storage and manual confirmation; the kernel helper is not wired into the Flutter app.

## Package and platform decision (candidate versions checked 20 Oct 2026)

| Capability | Candidate | Decision / caveat |
| --- | --- | --- |
| Flutter image capture | `image_picker` 1.2.4 | Camera/gallery input; verify Android activity recovery and iPad permission/cancellation paths. |
| Local database | `drift` 2.35.2 + `drift_flutter` 0.3.1 + `drift_dev` 2.35.1 | SQLite, typed queries and generated schema; use migration tests and keep app DB versioned. |
| Network interface details | `network_info_plus` 8.2.2 | Optional fallback; requires Flutter 3.38.1 and Dart 3.10. Confirm project baseline before pinning. |
| ESC/POS transport | `unified_esc_pos_printer` 3.4.0 | Provides network scan and TCP/IP transport; `NetworkPrinterDevice` uses port 9100. Its only listed test device is reported for BLE/Bluetooth Classic/USB, not network; adoption and SuperMega hardware proof remain limited. Isolate behind `ReceiptPrinter` and test actual Android/iPad + printer pairs before release. |
| QR rendering | `qr_flutter` 4.1.0 | Rendering only, not a wallet integration or payment confirmation. |

Package docs: [image_picker](https://pub.dev/packages/image_picker), [drift](https://pub.dev/packages/drift), [drift_flutter](https://pub.dev/packages/drift_flutter), [drift_dev](https://pub.dev/packages/drift_dev), [network_info_plus](https://pub.dev/packages/network_info_plus), [unified_esc_pos_printer](https://pub.dev/packages/unified_esc_pos_printer), and [qr_flutter](https://pub.dev/packages/qr_flutter). The current drift_flutter and network_info_plus releases also require Dart 3.10; select an explicit Flutter/Dart floor before pinning. Run dependency/license/security review before adoption. Reject the old `ping_discover_network` package for the current Dart baseline.

## Delivery lanes and release gates

| Lane | Deliverable | Exit criteria |
| --- | --- | --- |
| Product/data | Lossless Commerce v2 compatibility map first; then reviewed versioned catalog/order/payment API and tenancy/idempotency contract. Do not equate the existing browser-local recovery journal with cloud sync. | Old Shop data round-trips; React and Flutter resolve the same stable IDs; server replays are idempotent; no lost fields or false sync acknowledgement |
| Native client | Flutter app shell, Drift migrations, counter, product setup, offline sale and receipt view | Android tablet and iPad builds; local sale survives process kill/restart; Burmese input/rendering checked |
| AI/catalog | Camera crop/consent/review/atomic import over current Node function | Synthetic English/Burmese fixture set; no unreviewed write; quota and privacy gates before enabling beyond allowlist |
| Hardware | Discovery adapter, selected printer profile, ESC/POS test/receipt | Named Android/iPad/printer matrix, Burmese print quality, reconnect and no-duplicate-sale proof |
| Payments | Provider QR display, manual confirmation, provider onboarding guidance | Scan in named KBZPay/WavePay/MMQR apps; correct merchant identity; order stays pending until verified |
| Reliability/security | Outbox idempotency, backup/restore, telemetry and privacy review | Offline/low-storage/clock/retry/restore tests; tenant access reviewed; no secrets or contact data in diagnostic logs |
| Go-to-market | First-run usability sessions and support playbook for local merchants | Timed setup and first-sale tasks, observed error/help rate, named device and wallet records, honest feature boundaries |

Run these tracks with one primary code writer and bounded reviews: native/data architecture review (completed read-only), mobile implementation, payment/hardware validation, and operator usability. Keep the website/marketing lane separate from application readiness; public product claims must follow the evidence in the release checklist. No team can approve its own production promotion.

## Current status and blockers

- **PASS (local source):** Node menu endpoint uses authenticated Supabase user validation, internal allowlisting, photo consent, bounded image validation, `gpt-4o` Responses API strict JSON schema, and candidate-only output. Its 9 mocked Node tests pass; no live provider call occurred.
- **PASS (local implementation):** the native app supports an empty catalog, manual product setup with text barcodes, keyboard-wedge search, cash and operator-verified KBZPay/WavePay checkout, stock decrement, immutable sale-line snapshots, and pending local outbox events in one SQLite transaction. Retries are idempotent; insufficient stock rolls back. Cash idempotency fingerprints remain compatible with the earlier native format.
- **NOT RUN in this environment:** Flutter analysis and Flutter tests cannot run because neither Flutter nor Dart is installed/on PATH. A previous document entry said 33 tests passed, but that result is not reproducible here and must not be used as current acceptance evidence.
- **PASS (local implementation only):** menu-photo flow requires explicit consent and signed-in auth, edits each candidate, confirms price and opening stock, then commits one atomic local batch. It preserves Burmese text, category, description, SKU, and text barcodes. The captured photo is discarded after parsing.
- **BLOCKED:** the owner chose reuse of the existing SuperMega OpenAI key, but safe local checks and earlier Vercel environment-name checks found none configured for the serving projects. The feature remains disabled; no new key was created and no live AI request was made.
- **PASS (local structure only):** static MMQR payload structure and CRC checks are enforced; the checkout displays the exact merchant payload and requires an operator to confirm receipt in the provider app. No wallet scan or settlement verification has been performed.
- **PASS (source only):** user-started printer discovery probes a bounded private IPv4 subnet on TCP 9100, binds candidates to that scan, and aborts if Wi-Fi changes. A successful test saves the private host; completed sales use it to print the immutable receipt snapshot and show a retry action on failure. No printer was physically tested, and restart-safe print history is not implemented.
- **BLOCKED:** `flutter build apk --debug` cannot run because this workstation has no Android SDK. iOS builds require macOS/Xcode. No physical camera, local-network permission, printer, wallet QR, or Android/iPad device has been tested.
- **BLOCKED:** cross-client catalog/order compatibility, cloud outbox delivery/acknowledgement, sale history, refunds/voids, backup restore, workspace quota/entitlements, and hosted tenant proof remain unimplemented or unverified. Preview authentication/tenant isolation and migration gates remain open.
- **BLOCKED:** REA accepted the supplied KMO APK as an archive (`SHA-256 324fd956faf36efbacf612b139478a5b45fc204891e49320d7a61424971d2f7f`), but artifact inspection stops on a case-colliding resource path (`res/9n.9.png` / `res/9N.9.png`). Android package decompilation is separately unavailable because no caller-supplied JADX MCP JAR/JDK is configured. The APK and installer were not executed. Do not claim reverse-engineered behavior or copy competitor code; use official product material until a safe, supported inspection path is available.
- **NOT AUTHORIZED / NOT RUN:** Vercel deployment, provider enablement, production database changes, wallet API onboarding, commercial acceptance, or VPS changes.

## Competitive transfer / ERRC

- **Eliminate:** retyping whole menus, entering printer IPs, phone-number-as-payment-QR assumptions, forced login before a first offline sale, and repeated setup screens.
- **Reduce:** fields, taps, repeated data entry, and time spent recovering after a dropped connection.
- **Raise:** scan accuracy, transactional safety, Burmese readability, printer testability, auditability, setup completion, and transparent sync/payment state.
- **Create:** reviewed menu capture, a useful one-tap printer test, a resilient local outbox, and a single onboarding checklist that can resume after interruption.

Do not claim feature parity from screenshots. Local competitors such as KMO/ZayTap and IrraTech should inform Myanmar-language workflows, barcode operation, receipts and support expectations; global incumbents such as Square establish the bar for fast setup, readable inventory controls and visible order state. Validate the actual workflows with the supplied KMO app and named devices before making claims. The supplied APK has not yet been reverse engineered because the REA JADX dependency is unavailable.
