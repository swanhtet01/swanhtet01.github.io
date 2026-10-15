# Sites publishing integration

This source implementation is not a production activation record.

## Customer workflow

1. Edit and save pages, including photos. Review the current content and retain its approved site version.
2. Open Publish website. The server reports the exact saved version and current publication; Publish uses that version, not browser-supplied HTML.
3. Open the published site. Its contact form delivers to the company's managed Inquiries view. The visible inbox refreshes every 45 seconds and pauses background polling when the tab is hidden or a request fails.
4. Take website offline requires a confirmation. Withdrawal closes its pages, photo access and contact form; received inquiries remain available.

Phone and in-person requests remain a separate, collapsed section. Received website inquiries have Open and Handled views, assignment to the current operator, release, private team notes, completion and reopening. On phones, selecting a request opens its detail pane with an All inquiries return action; unsaved notes survive navigation within the current workspace session. Notes do not send a customer reply. Outbound replies and CRM integration are not implemented.

Every follow-up command uses an expected revision and action ID. The database serializes changes, rejects stale/conflicting writes and retains an audit receipt. A same-command retry reuses its identity; it cannot overwrite a newer note silently. Workspace/session/entitlement, permission and schema checks apply before writes. These are implemented and tested locally; managed hosted acceptance remains required.

## Deployment prerequisites

- Apply the complete canonical migration chain, including `20261010063000_website_publishing_and_inquiries.sql`, `20261010070000_website_published_hero_media.sql` and `20261010120857_website_inquiry_followup.sql`, through the reviewed migration process. These add approved publication/photo boundaries and audited inquiry follow-up. Do not execute the historical proposal file separately.
- Use the existing validated PostgreSQL runtime and managed identity configuration. Publishing requires a human with `website.write`, current membership/session/entitlement, and an exact saved approval. A read-only role cannot publish or read customer inquiries.
- Provide a pre-existing private `supermega-sites-media` Storage bucket and the server-only Storage key for device photos. Missing storage prevents publishing a snapshot that references private photos.
- Explicitly set `SUPERMEGA_WEBSITE_PUBLISHING_ENABLED=true`, `SUPERMEGA_WEBSITE_INGRESS=vercel`, and `SUPERMEGA_WEBSITE_PUBLIC_ORIGIN` to the exact HTTPS origin with no trailing slash or path. Supply a random 32-byte HMAC key as 64 hex characters in `SUPERMEGA_WEBSITE_INQUIRY_HMAC_KEY`.
- `VERCEL=1` and `VERCEL_ENV=preview` or `production` are provider-owned. The adapter accepts only a single valid `x-vercel-forwarded-for` address. It does not fall back to caller-supplied `X-Forwarded-For`, forwarded host, or a query parameter. Other hosting platforms require a reviewed address adapter. Reference: https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for.
- `/sites/*` must reach `api/app.py` before the application shell's header rule. The renderer supplies its own nonce-based CSP; the application shell keeps its existing policy. `/api/*` keeps the existing API route.
- Never put Storage or HMAC keys into frontend variables, source, screenshots, receipts or logs. This change creates no credentials, buckets, roles or external accounts.

## Required acceptance before release

Local PostgreSQL and synthetic-transport browser checks do not prove provider routing, real Storage permissions, managed founder access, or customer usability. Verify the Python 3.12/Linux package, preview routing/CSP/ingress headers, two-workspace denial, real save/reload/photo upload, publish/contact/inbox/withdraw journey, and missing-config behavior. Bind evidence to the exact clean source and require the normal independent release review.

Known limits: generated publication URLs, one inquiry form per published channel, no custom domain setup, no outbound reply or CRM integration, no orphan-photo reconciliation, and the simplified review/follow-up workflow still needs managed and customer acceptance. A publication replacement atomically retires the previous channel for the whole site at the same origin, including when the contact page changes. Do not describe the current UI as complete custom-domain or enterprise hosting.

## Presentation contract

Edit `showroom/src/products/website/website-presentation.css`, then run `node tools/sync_website_presentation.mjs --write`. The editor imports this CSS; export and the Python renderer use generated bindings with its digest. The product build verifier rejects stale bindings. Validate the same artifact at desktop and phone widths across all three renderers after changes. Hero and section images must load, and custom contact slugs must keep the form on the same page.

The editor and downloaded HTML show a disabled contact form explicitly labeled as preview or offline. Only a configured, enabled publication accepts messages. The downloaded copy remains script-free and never embeds runtime credentials. Renderer parity is local evidence; platform headers, Storage and real inquiry delivery still require the managed acceptance above.

## Required CI and package checks

`tools/verify_sites_database.py --require-supported-python` runs the four current photo/publication/inquiry/follow-up suites on Linux/Python 3.12 with disposable PostgreSQL 17. CI sets `SUPERMEGA_TEST_POSTGRES=1`, `SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL=1`, schema version 13 and the PostgreSQL binary path. Skips or an empty suite fail acceptance. The receipt explicitly excludes real Storage, managed Auth and hosted acceptance.

`tools/verify_packaged_app_import.py` must inspect the actual generated Linux function. It verifies all 20 required route/method pairs and actual JPEG/PNG/WebP encoding/decoding from packaged Pillow, in addition to dependency/native-origin checks. `tools/test_packaged_app_import.py` tests the verifier's rejection behavior; its success alone is not a working provider package. The local Windows machine has no WSL/Docker runtime, so use the exact-source Linux CI and supported provider package stage rather than relabel a Windows run.
