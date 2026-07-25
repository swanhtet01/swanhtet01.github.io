# Agent operations and security brief

Updated: 2026-07-26
Agent-operations checkpoint: `69dfb09`
Legacy-security checkpoint: `98b8044`
Mode: local evidence only; no hosted or production claim

## Operating decision

SuperMega uses four standing AI teams: Product, Engineering, Growth, and Finance / Risk. A registered role is a dormant record, not a running process. The local roster caps at 12, active company assignments cap at four, and an empty queue scales to zero. One work item has one owner. Stale, duplicate, over-capacity, or unevidenced review states fail closed.

Runtime work is limited by job family, queue depth, concurrent runs, daily runs, daily units, batch size, and lease duration. Budget grants are signed, expiring, single-use, reservation-bound, and require at least 32 UTF-8 bytes of secret material. Consequential sends, payments, publishes, deployments, access changes, and production writes remain human-gated.

## Verified locally

- Full app lint/build and release/security/database/HQ contracts pass.
- All 173 Python tests pass; the focused cloud/runtime slice has 18 and the legacy-security slice has six passing tests.
- The retired AgentOS gateway reports not-ready and writes-disabled; old log/status routes return HTTP 410 and OpenAPI is disabled.
- The retired finance launcher reports payments-disabled and exits nonzero.
- HQ Agent Teams at 390 and 1280 px has no horizontal overflow or browser warnings/errors; visible mobile controls are at least 44 px.
- The private-trial migration validator rejects public Storage buckets and permissive Storage policy surfaces. This is code evidence, not hosted proof.

## Closed locally at `98b8044`

1. Remote news hydration is removed. Any supplied URL fails before network access; reviewed text or a governed connector is required.
2. The launcher defaults to `127.0.0.1` and rejects every non-loopback bind before pipeline work starts.
3. Approval reads and atomic mutations are workspace-scoped. Unknown historical rows remain unclaimed; the client cannot set requester or initial status.
4. Request and decision capabilities are separate. Terminal decisions require a note, record the server-resolved actor in bounded history, and cannot be reversed.
5. SQLite connections now close deterministically; the full 173-test suite passes on Windows.

These are local code and test results. They do not prove a hosted deployment, live credentials, or production data migration.

## Remaining release blockers

1. Critical if launched: the root development compose publishes services with weak/default controls, floating images, and a Docker socket. Retire it or close ports, pin images, remove socket authority, and provision server-only secrets.
2. High: queue viewing can authorize processing or preview deployment. Split `view`, `execute`, and `deploy` capabilities and require human approval for deployment.
3. High: an older worker runner can forward credentials to an arbitrary base URL. Require bounded HTTPS allowlists, no token CLI arguments, response limits, and secret-safe logs.
4. High: payment-event data and public contact side effects need explicit RLS/revokes, durable idempotency, rate/origin controls, and replay evidence before hosted use.
5. Hosted proof is missing for Supabase Storage privacy, Security Advisor, Vercel observability/alerts, queue recovery, and cross-device human review.

The linked Instagram example warns that a polished AI app may still expose an enumerable storage bucket. It was used as a threat-model prompt only, not as authoritative evidence about SuperMega.

## Next bounded slice

Split agent `view`, `execute`, and `deploy` capabilities first, then retire or close the root development compose exposure and constrain worker destinations. Do not start a public listener, use production credentials, or deploy while validating.
