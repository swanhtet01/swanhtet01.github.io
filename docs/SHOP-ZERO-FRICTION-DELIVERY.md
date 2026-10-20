# Shop zero-friction onboarding: implementation plan and release gates

**Objective:** make first-use setup fast without creating a second catalog, claiming unsupported hardware, or implying that a QR scan proves payment.

## Current architecture and decision

The customer-facing Shop remains React/TypeScript with device-local browser state. Vercel routes the exact /api/shop/menu-import path to its Node function before the general /api/(.*) Python fallback. A Flutter setup client now lives at mobile/shop_pos and uses Drift for non-saleable import drafts and local payment setup. It is not yet a second Shop catalog: the existing Commerce v2 model has no immutable product ID or description, and the native client has no sales, inventory, or remote sync path. Do not present this setup client as a shipped POS.

Existing foundations worth extending:

- CSV catalog import already previews, validates, and catches duplicates before a confirmed write.
- Shop accepts an owner-supplied provider QR image and keeps payment confirmation manual.
- A local MMQR structural helper exists in `kernel/connectors/_mmqr-core.mjs`; its self-test is synthetic and is not proof of issuer acceptance or Shop integration.
- Shop supports browser receipt printing and barcode capture; it has no raw ESC/POS transport or physical printer acceptance evidence.

## Implementation slice in this change

Added the shared versioned contract `shared/contracts/shop-menu-import.v1.json` and Node.js Vercel endpoint `POST /api/shop/menu-import`. It verifies a Supabase bearer session, requires explicit `cloudConsent`, accepts only bounded JPEG/PNG/WebP data URLs, calls the OpenAI Responses API with strict JSON Schema output, returns at most 100 catalog candidates, and never writes products or logs the image. A null price means the menu text was unclear and must be corrected before import. The contract response is a versioned envelope with the requested four-field candidate array under `items`.

The endpoint is fail-closed. It does not call OpenAI unless SHOP_MENU_AI_ENABLED=true, the verified user ID is in SHOP_MENU_AI_ALLOWED_USER_IDS, and OPENAI_API_KEY exists. It checks that JPEG, PNG, and WebP data URLs match their file signatures before forwarding them. The allowlist is an internal pilot gate, not the final self-serve entitlement/quota design. No image has been sent and the endpoint has not been deployed.

The native setup client adds camera capture, a separately checked cloud-consent step, existing-account email-code sign-in, editable suggestions, and transactional Drift staging. It checks image length before reading bytes or requesting a session token, then validates signature and size again before upload. The picker keeps a temporary camera file; the screen deletes it after parsing, replacement, or exit and never stores the image in Drift. Each imported row remains a review draft; the app does not invent an SKU or opening count and cannot create a sellable product until the shared catalog contract is migrated.

Printer discovery is explicitly operator-started and limited to the current private IPv4 subnet, port 9100, at most 510 hosts and bounded concurrency. It rechecks the Wi-Fi range around each probe batch and aborts if the network changes. Candidates can only come from a completed scan, are bound to that scan, and are invalidated by a later scan or Wi-Fi change. After a successful test slip, the app stores that private host; completed sales use the saved printer and offer a retry action if printing fails. This is implemented in source only: a detected port, socket write, or retry action is not proof of physical output, compatibility, or restart-safe print history.

Payment setup stores KBZPay/WavePay numbers and a merchant-confirmed static Myanmar MMQR payload locally. The native client requires static initiation mode, validates TLV structure, Myanmar MMQR account fields and CRC before rendering; it cannot authenticate the issuer, verify merchant identity or confirm settlement. It never creates a wallet URI from a phone number or marks a payment received. This is setup/QR preview, not checkout or payment reconciliation. See [KBZPay MMQR](https://www.kbzpay.com/en/products/mmqr) and [WavePay QR guidance](https://www.wavemoney.com.mm/userguide-type/qr-payment-wave-app/).

## Product sequence and ownership

| Lane | Build next | Release proof |
| --- | --- | --- |
| Product/data | Map the existing `supermega.commerce.workspace.v2` fields and behavior first, then define a reviewed compatibility contract for React and Flutter. Current catalog rows have no immutable product ID or description, while menu-import candidates include a description and orders link through SKU. Add a shared immutable product ID and optional description before Drift; preserve text barcodes (including leading zeroes), Burmese names, item/order history, and MMK arithmetic. The existing `supermega.commerce.sync-outbox.v1` is a browser-local recovery journal (`local_applied`/`abandoned`), not a remote sync API or server acknowledgement. Define tenant-scoped server writes, revisions, idempotency, and conflict rules before claiming cross-device sync. | Round-trip old Shop data without loss; two clients resolve the same item; replay is idempotent; no duplicate sale, silent overwrite, or false cloud-synced state. |
| AI onboarding | Add a mobile photo picker with crop/rotate and local downscale; ask once before sending the image to cloud AI; show compact editable candidates; route approved rows through the current duplicate/validation rules; commit one Drift transaction. Add workspace entitlement and durable per-user quota before enabling the endpoint beyond an allowlisted pilot. | Burmese and English menu fixtures; illegible-price/duplicate tests; cancel sends nothing; accepted batch is atomic and restart-safe; no raw image in logs or storage. |
| Hardware | Use `unified_esc_pos_printer` behind bounded private-subnet TCP 9100 discovery. Ask the operator to start the scan, show candidates, print a test slip, save the tested host, and use it for receipts with an explicit retry path. | Named Android tablet + iPad + printer matrix, OS permission, port/protocol check, Burmese receipt output, reconnect, duplicate-print and process-restart tests. Open port 9100 and a successful socket write are only candidates, not printer acceptance. Before targeting Android API 37, add and test the local-network permission flow documented by [Android Developers](https://developer.android.com/privacy-and-security/local-network-permission). |
| Mobile money | Save KBZPay/WavePay phone details and the exact provider-issued static MMQR payload. Checkout displays that payload and amount, then requires the cashier to verify the incoming payment in the wallet app and confirm in Shop. A phone number never becomes a generated QR or proof of payment. | Test the QR in named provider app versions, verify merchant identity and amount, and ensure cancel/decline leaves stock unchanged. No payment API or settlement reconciliation is present. |
| UX / QA | One first-run checklist: add/import products → connect a printer → choose payment methods → test a sale. Keep advanced controls out of the cashier path. | First sale task test on phone, tablet, and desktop; measure setup time, correction rate, and help requests. |

### Current team coordination

The CTO/integrator owns the shared Shop data contract, safe rollout boundaries, and evidence. Read-only reviews identified missing durable AI quotas, shared catalog/sync boundaries, physical printer evidence, and encrypted backup/restore. The local app now binds printer candidates to real scans, persists a tested private printer host, prints receipt snapshots after a sale with retry on the current screen, validates static MMQR structure, checks image limits before token access, stores a sellable local catalog, completes offline sales, exposes a pending local outbox, and supports manually verified wallet QR checkout. The remaining work is workspace-scoped entitlement/quota, remote outbox delivery and shared catalog compatibility, restart-safe receipt history/reprint, encrypted backup/restore, and real device/provider acceptance. Flutter/Dart are unavailable in the current Windows session, so the native test suite is not currently verified. A separate release reviewer checks the candidate without self-approving release.

## Release status

- Menu parser endpoint and isolated tests: **implemented locally; 9 mocked endpoint tests pass; provider call not run**.
- Shared menu import v1 response contract: **implemented locally and covered by endpoint tests**.
- Native Shop: **implemented locally; Flutter analysis/tests NOT RUN in the current Windows session** because Flutter and Dart are unavailable. The earlier “33 tests pass” statement is not current acceptance evidence. Drift v3 source stores products, completed sales, sale-line snapshots, stock movements, wallet settings, review drafts, and pending local outbox events. Cash and manually verified wallet sales are transactional and idempotent. No remote sync or web catalog compatibility is present.
- Menu-photo UI/API: **implemented locally with explicit cloud consent, signed-in user verification, editable candidates, and atomic local catalog commit**. The Node endpoint uses `gpt-4o` strict JSON schema and returns candidates only. No live AI request was made. The owner chose to reuse the existing key; safe local checks and earlier Vercel environment metadata found no configured `OPENAI_API_KEY`, `SHOP_MENU_AI_ENABLED`, or allowlist in serving projects as of 20 Oct 2026. No secret was read or changed. The feature remains disabled until key access and workspace-scoped quota/authorization are available.
- Printer: **implemented locally with bounded private-subnet port-9100 discovery, Wi-Fi-change aborts, test-before-save, and sale-receipt print/retry source paths**. No real printer has been scanned or tested; restart-safe print history and physical acceptance remain open.
- Mobile money: **implemented locally for phone details, exact static provider-issued MMQR display at checkout, and manual payment confirmation before stock decrement**. It does not synthesize wallet URIs or confirm/verify a real payment automatically.
- MMQR helper: **local structural/CRC checks implemented; no provider or wallet acceptance evidence**. The detailed architecture and release gates are in [`SHOP-NATIVE-POS-ARCHITECTURE.md`](SHOP-NATIVE-POS-ARCHITECTURE.md).
- Cloud enablement, preview/production routing, workspace-scoped entitlement/quota, remote catalog/order sync, and customer acceptance: **not run**. The current API allowlist is a user-level internal gate and does not establish workspace authorization or self-serve billing limits.

## ERRC / competitive transfer

- **Eliminate:** manual retyping of a whole menu; invented wallet links; repeated setup instructions.
- **Reduce:** required setup fields and taps; data sent to AI; cashier prompts; scan-to-print misconfiguration.
- **Raise:** catalog accuracy, offline write durability, Burmese readability, recovery evidence, and hardware compatibility proof.
- **Create:** reviewed photo-to-catalog drafts, a one-tap printer test, and one portable setup checklist across Shop clients.

Square's hardware setup and inventory controls are the global usability baseline; KMO/ZayTap and IrraTech establish local expectations around Burmese setup, barcode POS, receipts, roles and support; Autumn's social/order intake is a separate connector roadmap, not an automatic message-to-order shortcut. Continue the repo's REA/source review, then validate these workflows with actual named devices and operators before making comparative claims.

## Hosted provisioning refresh — 20 October 2026, 02:56 UTC

The owner approved reuse of an existing SuperMega OpenAI key. Vercel project-domain listings map `supermega.dev` and `www.supermega.dev` to `supermega-public`, and `app.supermega.dev` to `megaos`; both domain records are verified. The latest READY production deployments are still 30 Sep 2026 (public site, commit `5479c5d1…`) and 3 Oct 2026 (app, commit `3fad1ea5…`), not this candidate. Read-only environment metadata found no `OPENAI_API_KEY` on either serving project or four other connected SuperMega projects; the public Preview and app environments also have no `SHOP_MENU_AI_ENABLED` or `SHOP_MENU_AI_ALLOWED_USER_IDS`. Secret values were not decrypted or changed, no replacement key was created, and no live model request was made. Keep the API disabled until the existing key is available in the correct server-side environment and the authenticated allowlist and workspace quota are set.

The managed preview `twflgmlwfkykgzsxnegc` still reports `MIGRATIONS_FAILED`. It has one Auth identity but no workspace memberships or workspace state, and no Shop/POS/catalog/order/stock tables. Therefore hosted sign-in, tenant isolation, and managed Shop persistence remain blocked. The local managed-access and mocked menu-import tests passed 40/40; this is source-level evidence only.
