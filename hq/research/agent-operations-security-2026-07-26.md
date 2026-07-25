# Agent operations and security brief

Updated: 2026-07-26
Checkpoint: `69dfb09`
Mode: local evidence only; no hosted or production claim

## Operating decision

SuperMega uses four standing AI teams: Product, Engineering, Growth, and Finance / Risk. A registered role is a dormant record, not a running process. The local roster caps at 12, active company assignments cap at four, and an empty queue scales to zero. One work item has one owner. Stale, duplicate, over-capacity, or unevidenced review states fail closed.

Runtime work is limited by job family, queue depth, concurrent runs, daily runs, daily units, batch size, and lease duration. Budget grants are signed, expiring, single-use, reservation-bound, and require at least 32 UTF-8 bytes of secret material. Consequential sends, payments, publishes, deployments, access changes, and production writes remain human-gated.

## Verified locally

- Full app lint/build and release/security/database/HQ contracts pass.
- All 167 Python tests pass; the focused cloud/runtime slice has 18 passing tests.
- The retired AgentOS gateway reports not-ready and writes-disabled; old log/status routes return HTTP 410 and OpenAPI is disabled.
- The retired finance launcher reports payments-disabled and exits nonzero.
- HQ Agent Teams at 390 and 1280 px has no horizontal overflow or browser warnings/errors; visible mobile controls are at least 44 px.
- The private-trial migration validator rejects public Storage buckets and permissive Storage policy surfaces. This is code evidence, not hosted proof.

## Release blockers

1. Critical: legacy pilot tooling can fetch an arbitrary HTTP(S) URL and has a network-bind launch path. Before any start, require authentication, loopback defaults, destination allowlisting, redirect denial, private/link-local/metadata address denial, time and response bounds, and adversarial tests.
2. Critical: the legacy approval prototype is not workspace-scoped and accepts untrusted requester/status fields. Require resolved actor/workspace identity, transition policy, capability checks, idempotency, and audit evidence before mutation.
3. Critical if launched: the root development compose publishes services with weak/default controls, floating images, and a Docker socket. Retire it or close ports, pin images, remove socket authority, and provision server-only secrets.
4. High: queue viewing can authorize processing or preview deployment. Split `view`, `execute`, and `deploy` capabilities and require human approval for deployment.
5. High: an older worker runner can forward credentials to an arbitrary base URL. Require bounded HTTPS allowlists, no token CLI arguments, response limits, and secret-safe logs.
6. High: payment-event data and public contact side effects need explicit RLS/revokes, durable idempotency, rate/origin controls, and replay evidence before hosted use.
7. Hosted proof is missing for Supabase Storage bucket privacy, object-listing denial, Security Advisor results, Vercel observability/alerts, queue recovery, and cross-device human review.

The linked Instagram example warns that a polished AI app may still expose an enumerable storage bucket. It was used as a threat-model prompt only, not as authoritative evidence about SuperMega.

## Next bounded slice

Close blockers 1 and 2 first. Acceptance requires tests that deny redirects to private targets, DNS/IP rebinding shapes, cross-workspace reads or decisions, forged actors, arbitrary statuses, replay conflicts, and mutation without prior authorization. Do not start a network listener, use production credentials, or deploy while validating.
