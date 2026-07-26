# Agent operations and security brief

Updated: 2026-07-27
Agent-operations checkpoint: `be78a02`
Legacy-security checkpoint: `98b8044`
Mode: local evidence only; no hosted or production claim

## Operating decision

SuperMega uses four standing AI teams: Product, Engineering, Growth, and Finance / Risk. A registered role is a dormant record, not a running process. The local roster caps at 12, active company assignments cap at four, and an empty queue scales to zero. One work item has one owner. Stale, duplicate, over-capacity, or unevidenced review states fail closed.

Runtime work is limited by job family, queue depth, concurrent runs, daily runs, daily units, batch size, lease duration, and server-owned retry allowance. Budget grants are signed, expiring, single-use, reservation-bound, and require at least 32 UTF-8 bytes of secret material. Consequential sends, payments, publishes, deployments, access changes, and production writes remain human-gated.

## Verified locally

- Full app lint/build and release/security/database/Vercel/HQ contracts pass.
- All 292 Python tests pass; the focused Storage slice has 13, its offline self-test has 11 adversarial cases, the Kernel has 277, and the coordinated-release verifier has 67 passing checks. All 69 connectors survive 993 adversarial calls and all 15 crews pass 214 checks.
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
10. A future approved preview pulls only preview settings, stamps the reviewed commit, builds once, rechecks the canonical project, requires `.vercel/output`, and deploys that artifact with pinned `--prebuilt`. It never selects production, mutates aliases, passes the token in argv, returns raw CLI failures, or accepts a deceptive URL.
11. Kernel company cycles now acquire one of four atomic durable capacity claims before model work. The fifth cycle is rejected, work orders return to planned for safe retry, claims release on completed and failed crews, stale claims can transfer after 120 seconds, and owner-bound release prevents an expired process from deleting its successor.
12. The old Google Cloud Scheduler entry point is now a read-only compatibility shim: it accepts no credentials, invokes no provider CLI, performs no provider read or write, and reports that GCP scheduler mutation is retired.
13. Vercel remains the sole permitted recurring scheduler, but authority v2 is dormant: the generated project defines zero crons and zero scheduled invocations. The activation plan is hourly plus daily, capped at 25 invocations/day instead of 97. The exact old schedule is accepted only during preflight cleanup; post-deploy verification rejects every surviving cron.
14. The SuperMega CEO brief now follows `supermega.ceo-outcome-authority.v1`: one deterministic priority-then-ID selection and at most one outcome per cycle. Storage privacy proof, exact protected preview, and named pilot evidence remain blocked. The ready owner brief uses exact leads, pipeline, FX, and platform-status reads plus one synthesis call, removing the planner model call. Completed, in-flight, durable-claim duplicate, malformed, smuggled, and unauthorized-action outcomes stop before model work or notification.
15. CEO outcome evidence now follows `supermega.ceo-outcome-operation.v1` plus `supermega.ceo-outcome-evaluation.v1`. Completion metadata is durable before notification and excludes brief text, prompts, tool rows, provider, and model identity. An owner/operator separately records immutable acceptance or revision. Efficiency remains unavailable unless the tenant-bound records are durable, integrity-valid, fully evaluated, and fully measured in `bulk_equivalent_tokens`.
16. Hosted scheduler activation now follows `supermega.scheduler-activation-evidence.v1`. `SUPERMEGA_HOSTED_SCHEDULER_ENABLED=1` is insufficient by itself: an HMAC-signed exact-shape bundle must bind the scheduler-authority digest, canonical `megaos` project, production environment, exact deployed commit, managed tenant, owner decision, all five required proof digests, and a maximum seven-day lifetime. Duplicate keys, tampering, missing or failed proof, stale or expired evidence, preview scope, wrong project or commit, plaintext activation variables, and dormant environment remnants fail before worker invocation. Runtime status exposes only contract, digest, release, expiry, and count metadata.
17. Managed Storage privacy now has `supermega.private-storage-privacy.v1` and a current Supabase Storage REST v2 adapter. Live mode requires one exact owner-approval ID, HTTPS host allowlist, publishable or anon key, and two distinct unexpired user JWTs; service-role/secret credentials are forbidden. The fixed six-request sequence proves explicit anonymous-list denial, one positive-control sentinel, cross-tenant list/object denial, and 60-second signed access. Redirects and proxies are disabled, responses and JSON complexity are bounded, and evidence exposes only digests, status classes, proof IDs, counts, and zero-mutation/redaction flags. The 11-case self-test makes zero network requests. This is verifier evidence, not hosted Storage proof.
18. `storage:privacy:preflight` now loads the same exact target and credential contract but performs zero network requests. It returns only host, bucket, approval, and evidence digests plus local-shape, request-ceiling, TTL, redaction, and zero-mutation metadata; it explicitly reports that provider credentials are unverified. The owner handoff forbids `supermegabase`, production/customer data, privileged credentials, persisted secrets, and unapproved setup or cleanup. Sentinel creation and cleanup remain owner-controlled provider writes outside the verifier.

These are local code and test results. They do not prove a hosted deployment, live credentials, or production data migration.

## Remaining release blockers

1. High: payment-event data and public contact side effects need explicit RLS/revokes, durable idempotency, rate/origin controls, and replay evidence before hosted use.
2. Hosted proof is missing for Supabase Storage privacy, Security Advisor, Vercel observability/alerts, queue recovery, and cross-device human review.
3. Read-only Vercel inventory confirms canonical app project `megaos` and public project `supermega-public`; similarly named projects are not release authority. This checkout has no canonical `.vercel/project.json` link and lacks exact org/project environment values and `VERCEL_TOKEN`, so preview deployment is deliberately blocked.
4. Read-only Vercel Agent Runs observability reports no production or preview project activity over 90 days. The canonical `megaos` project has a ready production deployment, but grouped runtime-log reads timed out and then returned 403; live cron and environment state remain unproven.
5. Local authority emits no crons and no activation bundle was issued. Hosted cleanup still requires a protected deployment and may require removal of dormant scheduler environment variables. No provider state was changed here.

The selected Instagram security slide warns that storage buckets may remain enumerable even when individual object links appear private. SuperMega therefore requires bucket inventory, anonymous-list denial, cross-tenant-list denial, and short-lived authorized object access before managed activation. This is a release gate, not hosted proof.

## Next bounded slice

Audit managed Shop order pricing and tax boundaries, then implement only the smallest missing server-authoritative calculation foundation. Preserve immutable catalog price snapshots, idempotent replay, tenant isolation, human-only authority, zero-tax legacy compatibility, and the existing Orders page; add no route, product, provider call, legal tax-rate claim, or live write.
