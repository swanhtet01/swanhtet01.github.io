# Sites publishing integration

This source implementation is not a production activation record.

## Customer workflow

1. Edit and save pages, including photos. Review the current content and retain its approved site version.
2. Open Publish website. The server reports the exact saved version and current publication; Publish uses that version, not browser-supplied HTML. After publication, Sites shows the generated address and asks the owner to open it before sharing. A publication record is not proof that DNS, HTTPS and the public route work end to end.
3. Open the published site. Its contact form delivers to the company's managed Inquiries view. The visible inbox refreshes every 45 seconds and pauses background polling when the tab is hidden or a request fails.
4. Take website offline requires a confirmation. Withdrawal closes its pages, photo access and contact form; received inquiries remain available.

Phone and in-person requests remain a separate, collapsed section. Received website inquiries have Open and Handled views, assignment to the current operator, release, private team notes, completion and reopening. On phones, selecting a request opens its detail pane with an All inquiries return action; unsaved notes survive navigation within the current workspace session. Notes do not send a customer reply. Outbound replies and CRM integration are not implemented.

Every follow-up command uses an expected revision and action ID. The database serializes changes, rejects stale/conflicting writes and retains an audit receipt. A same-command retry reuses its identity; it cannot overwrite a newer note silently. Workspace/session/entitlement, permission and schema checks apply before writes. These are implemented and tested locally; managed hosted acceptance remains required.

## Deployment prerequisites

- On a fresh database, apply the complete canonical migration chain, including `20261010063000_website_publishing_and_inquiries.sql`, `20261010070000_website_published_hero_media.sql`, `20261010120857_website_inquiry_followup.sql`, `20261014090000_website_channel_stable_update.sql`, and `20261014103000_website_custom_domain_bindings.sql`, through the reviewed migration process. These add approved publication/photo boundaries, audited inquiry follow-up, stable-channel updates, and tenant-proven domain bindings. On a production-derived database with inherited schema history, first reconcile the ledger and prove the inherited schema before applying only the reviewed missing deltas; never replay the full source chain there. Do not execute the historical proposal file separately.
- Use the existing validated PostgreSQL runtime and managed identity configuration. Publishing requires a human with `website.write`, current membership/session/entitlement, and an exact saved approval. A read-only role cannot publish or read customer inquiries.
- Provide a pre-existing private `supermega-sites-media` Storage bucket and the server-only Storage key for device photos. Missing storage prevents publishing a snapshot that references private photos.
- Explicitly set `SUPERMEGA_WEBSITE_PUBLISHING_ENABLED=true`, `SUPERMEGA_WEBSITE_INGRESS=vercel`, and `SUPERMEGA_WEBSITE_PUBLIC_ORIGIN` to the exact HTTPS origin with no trailing slash or path. Supply a random 32-byte HMAC key as 64 hex characters in `SUPERMEGA_WEBSITE_INQUIRY_HMAC_KEY`.
- `VERCEL=1` and `VERCEL_ENV=preview` or `production` are provider-owned. The adapter accepts only a single valid `x-vercel-forwarded-for` address. It does not fall back to caller-supplied `X-Forwarded-For`, forwarded host, or a query parameter. Other hosting platforms require a reviewed address adapter. Reference: https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for.
- `/sites/*` must reach `api/app.py` before the application shell's header rule. The renderer supplies its own nonce-based CSP; the application shell keeps its existing policy. `/api/*` keeps the existing API route.
- The generated Vercel config routes customer-host GET/HEAD page paths to the private domain resolver before the application shell. The resolver checks the original Host against one active, unexpired tenant binding. The route excludes `supermega.dev` subdomains and `*.vercel.app`; review all project aliases before enabling domains. The local route test validates config shape, not Vercel's deployed matching or Host forwarding.
- Never put Storage or HMAC keys into frontend variables, source, screenshots, receipts or logs. This change creates no credentials, buckets, roles or external accounts.

## Custom domains and lease renewal (dormant)

The owner may connect one DNS-ASCII hostname to one published channel after enabling the separate domain feature flag. A per-claim `_supermega.<hostname>` TXT record, Vercel project verification, and provider-recommended A/CNAME check are all required. Public pages, media and inquiries stop when the channel is withdrawn, the workspace is inactive, the hostname is released, or its 24-hour verification lease expires. A connected status is not live proof until DNS, TLS, root/contact pages and inquiry delivery are checked on the actual customer hostname.

The source includes `tools/run_website_domain_renewal.py` for the existing approved paid worker. It claims at most 20 domains due within 12 hours, rechecks tenant TXT and Vercel project/DNS state, and extends each lease only after all checks succeed. Failed checks retain the prior lease for retry after 30 minutes; repeated failures eventually close public access. The command prints counts only and registers no scheduler. A configuration check omits `--apply`; a scheduled run requires an exact preview/production database target, TLS, feature flags, the canonical Vercel project/team, and `--apply`. Keep the feature disabled until the owner has approved the worker schedule and two consecutive timed runs, missed-run alerting, preview migration/routing, and customer-host acceptance have all been observed. Do not place connection URLs or provider tokens in command arguments or run logs.

## Required acceptance before release

Local PostgreSQL and synthetic-transport browser checks do not prove provider routing, real Storage permissions, managed founder access, or customer usability. Verify the Python 3.12/Linux package, preview routing/CSP/ingress headers, two-workspace denial, real save/reload/photo upload, publish/contact/inbox/withdraw journey, and missing-config behavior. Bind evidence to the exact clean source and require the normal independent release review.

Known limits: generated publication URLs, one inquiry form per published channel, dormant custom-domain source pending the acceptance above, no outbound reply or CRM integration, no orphan-photo reconciliation, and the simplified review/follow-up workflow still needs managed and customer acceptance. A publication replacement atomically retires the previous channel for the whole site at the same origin, including when the contact page changes. Do not describe the current UI as complete custom-domain or enterprise hosting.

## Presentation contract

Edit `showroom/src/products/website/website-presentation.css`, then run `node tools/sync_website_presentation.mjs --write`. The editor imports this CSS; export and the Python renderer use generated bindings with its digest. The product build verifier rejects stale bindings. Validate the same artifact at desktop and phone widths across all three renderers after changes. Hero and section images must load, and custom contact slugs must keep the form on the same page.

The editor and downloaded HTML show a disabled contact form explicitly labeled as preview or offline. Only a configured, enabled publication accepts messages. The downloaded copy remains script-free and never embeds runtime credentials. Renderer parity is local evidence; platform headers, Storage and real inquiry delivery still require the managed acceptance above.

## Required CI and package checks

`tools/verify_sites_database.py --require-supported-python` runs the five photo/publication/inquiry/follow-up/domain suites on Linux/Python 3.12 with disposable PostgreSQL 17. CI sets `SUPERMEGA_TEST_POSTGRES=1`, `SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL=1`, `SUPERMEGA_RUN_WEBSITE_DOMAIN_SQL=1`, schema version 13 and the PostgreSQL binary path. Skips or an empty suite fail acceptance. The receipt explicitly excludes real Storage, managed Auth and hosted acceptance.

`tools/verify_packaged_app_import.py` must inspect the actual generated Linux function. It verifies all 20 required route/method pairs and actual JPEG/PNG/WebP encoding/decoding from packaged Pillow, in addition to dependency/native-origin checks. `tools/test_packaged_app_import.py` tests the verifier's rejection behavior; its success alone is not a working provider package. The local Windows machine has no WSL/Docker runtime, so use the exact-source Linux CI and supported provider package stage rather than relabel a Windows run.
