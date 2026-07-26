# Agent operations and security brief

Updated: 2026-07-26
Agent-operations checkpoint: `afb4bdf`
Legacy-security checkpoint: `98b8044`
Mode: local evidence only; no hosted or production claim

## Operating decision

SuperMega uses four standing AI teams: Product, Engineering, Growth, and Finance / Risk. A registered role is a dormant record, not a running process. The local roster caps at 12, active company assignments cap at four, and an empty queue scales to zero. One work item has one owner. Stale, duplicate, over-capacity, or unevidenced review states fail closed.

Runtime work is limited by job family, queue depth, concurrent runs, daily runs, daily units, batch size, lease duration, and server-owned retry allowance. Budget grants are signed, expiring, single-use, reservation-bound, and require at least 32 UTF-8 bytes of secret material. Consequential sends, payments, publishes, deployments, access changes, and production writes remain human-gated.

## Verified locally

- Full app lint/build and release/security/database/Vercel/HQ contracts pass.
- All 212 Python tests pass; the focused cloud/runtime slice has 23, the legacy-security slice has 16, and the coordinated-release verifier has 60 passing checks.
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

## Closed locally after `98b8044`

1. Agent visibility, execution, and preview deployment use separate capabilities. Managers can inspect but cannot run or deploy; execution and deployment require owner authority.
2. Preview deployment additionally requires an approved workspace-bound decision for the exact mode and clean Git revision before any deploy process starts.
3. The root development Compose entry point is retired as `services: {}`; it exposes no ports, floating service images, default credentials, or Docker socket.
4. The durable runner fixes its endpoint paths, rejects redirects and non-HTTPS remote URLs, bounds JSON responses, and keeps credentials out of CLI arguments.
5. Runtime host configuration may only narrow the compiled `app.supermega.dev` and canonical Cloud Run destinations. An environment value cannot add a third credential destination.
6. Expired leases may reclaim the same run once only for the four read-only jobs. Task-writing and release-watch jobs remain single-attempt; callers cannot expand the server policy, stale claim tokens are rejected, and every reservation remains charged to daily capacity.
7. Preview deployment approval is atomically reserved before a deploy subprocess starts. The exact action and target are single-use; concurrent requests, replay after success or failure, and stale claims fail closed, while internal claim material is redacted from API output.
8. The unlinked claimable-preview service is retired. Both legacy launchers fail closed; only Vercel team `team_wI4l7ZgSxcEztQPSlCCYVeJ5` and app project `prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG` (`megaos`) are accepted, with no production alias mutation.
9. Human review is bound to one clean commit by a server-owned, digest-checked packet. It fixes the release identity, canonical preview target, nine required verification contracts, human-review status, and discard-preview rollback. Open reviews deduplicate; generic approval requests, packet drift, used approvals, and revision drift fail closed.

These are local code and test results. They do not prove a hosted deployment, live credentials, or production data migration.

## Remaining release blockers

1. High: payment-event data and public contact side effects need explicit RLS/revokes, durable idempotency, rate/origin controls, and replay evidence before hosted use.
2. Hosted proof is missing for Supabase Storage privacy, Security Advisor, Vercel observability/alerts, queue recovery, and cross-device human review.
3. Read-only Vercel inventory confirms canonical app project `megaos` and public project `supermega-public`; similarly named projects are not release authority. This checkout has no canonical `.vercel/project.json` link and lacks exact org/project environment values and `VERCEL_TOKEN`, so preview deployment is deliberately blocked.

A previously shared social post remains a threat-model prompt only. Its exact content was not independently verified and is not evidence about SuperMega.

## Next bounded slice

Request explicit owner approval for one normal fast-forward-only push so remote checks can evaluate the current candidate. Do not force-push, merge, link Vercel, use credentials, deploy, promote, or mutate aliases in that same action.
