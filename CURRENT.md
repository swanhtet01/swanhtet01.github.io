# SuperMega current release truth

- Last verified: 2026-11-03 02:21 UTC
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: one native Shop application for retail and cafe, its supporting
  website/account journey, release evidence, and accountable operations

## 2026-11-03 02:21 UTC private typed retail projection boundary

- Public draft PR #752 remains
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`; no new publication or
  connected-mode activation occurred. Private source
  `cade088a450adeeae22e661bd3e434bbd58fab9c` (tree
  `f6c97de152b362bebb4ae279234d60927c8729bd`) adds an unmounted,
  manager/owner-only typed retail reservation-held candidate projection.
  It requires current signed `managementRead` authority, exact event/payload/
  line shape, tenant binding, state/version/time and digest consistency, then
  emits only product IDs, quantities, reservation ID/state and candidate
  digests. Actor/device IDs, free text and financial fields are omitted.
  Independent security review **ACCEPT** after correcting a provenance
  overclaim: the supplied candidate digest is not a PostgreSQL row or signed
  upload proof. Documentation successors `c82f596ea1e9e7878456b24812e1c2600fd33dca`
  and `037f82d4be3ad1fe7d1aab923651be7a67d62323` record this limit and
  clarify that no payload projection is approved for delivery.
- Connected-site source tests **58 PASS / 4 SKIPPED** (62 total), Python
  compilation and whitespace **PASS**. The four skipped cases are the opt-in
  disposable PostgreSQL 17 tests; real reader transaction/RLS/concurrency,
  installed device and two-device delivery are **NOT RUN**. Native LAN replica
  state has a durable cursor, but its full-state event contract cannot safely
  consume this cloud candidate: there is no authenticated PostgreSQL event/
  header binding, release/commit/expiry lifecycle, role-specific payload feed
  or cloud client apply contract. No stock availability decision or transport
  uses the new projection; connected mode remains default-off. Next Cloud
  work is to prove real PG17 reader behavior, then complete typed reservation
  lifecycle and authenticated durable apply before mounting any route.

## 2026-11-03 02:00 UTC private event visibility and PG17 test preparation

- Public draft PR #752 remains unchanged at
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`; no private source was
  published, mounted, deployed or production-enabled.
- Private source `ef9c66ebb6883aa60764dc650b82b800140bbb6f`
  (tree `a756d1ea71049abda4f24230d134ae5d311649d8`) records the
  source-grounded connected-site payload inventory and fail-closed role
  visibility boundary in `docs/CONNECTED-SITE-EVENT-VISIBILITY.md`. The v15
  SQL accepts arbitrary JSON object event payloads; café events may contain
  prices, table labels and free-text remarks. No raw event JSON is approved
  for any staff role. Current manager/owner access remains metadata-only;
  cashier, waiter, kitchen and stock payload projections are **NOT RUN** and
  default-denied. Owner decisions on remarks, ticket ownership and price/
  member visibility remain required before role projections are designed.
- An opt-in disposable PostgreSQL 17 test now prepares actual reader proof:
  snapshot ordering under a paused concurrent test-only writer, cursor
  continuation/mismatch, retained-lease revocation and a second-tenant event
  checked through forced RLS. The concurrent writer is a synthetic admin
  insert, not the normal upload adapter; another-tenant event uses the normal
  adapter. This workspace has no available PostgreSQL executable, and the
  opt-in environment flag was not set: **real PostgreSQL execution NOT RUN**.
  The local connected-site discovery was **55 PASS / 4 SKIPPED** (59 total),
  Python compilation and whitespace **PASS**, claims guard **179/179 PASS**.
  Independent source/SQL-fixture review **ACCEPT**, including the additional
  tenant-RLS case. Do not promote source tests to live PostgreSQL, mounted
  gateway, durable client cursor, installed two-device or pilot evidence.

## 2026-11-03 01:32 UTC private metadata-only event page

- Public draft PR #752 remains fixed at
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`; the private source has
  **not** been published, merged, mounted, deployed or production-enabled.
- Private implementation `5fb84a8d2e259ea82f89d8ae82d625bd04e4754f`
  (tree `3b77439c221c5f3256113d80e36fd5a36f61ffeb`) adds an unmounted
  PostgreSQL metadata-only event-header reader after the reviewed current
  manager/owner lease policy. It requires a transaction, sets tenant RLS
  context, uses one repeatable-read snapshot, locks the current site/device/
  lease rows, rechecks signed authority and retained lease identity/expiry,
  verifies the prior cursor and contiguous digest chain, and returns at most
  64 headers plus a continuation cursor. It checks live `clock_timestamp()`
  before and after the page fetch; no `event_json` or other payload is read.
  This does **not** implement cross-device replication or a durable client
  cursor. The production connected-site site gate remains false-only.
- Final-source connected-site discovery: **55 PASS / 3 SKIPPED** (58 total);
  the three opt-in disposable PostgreSQL 17 tests were **NOT RUN**. Python
  compilation and whitespace **PASS**. Independent security review initially
  **HOLD** for expiry races and retained-lease mismatch; both were fixed and
  the revised source was **ACCEPTED**. Scripted SQL-boundary tests do not prove
  actual PostgreSQL transaction/RLS/concurrent-write behavior. Tenant isolation,
  lease revocation under concurrent writes, reconnect and cursor replay are
  source-tested only; live PostgreSQL and installed two-device evidence remain
  **NOT RUN**. Next: opt-in disposable PostgreSQL 17 reader/concurrency proof,
  explicit event-payload visibility contract, then durable client cursor and
  recovery before any authenticated route or connected-mode enablement.

## 2026-11-03 01:16 UTC private actor-bound event-read prerequisite

- Public draft PR #752 remains fixed at
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`. Exact-head Native run
  `41549050338` is terminal **PASS** across all six jobs, including full
  Android and Windows. This is hosted source/build evidence, not signed or
  installed-device acceptance. App CI `41549042445` remains **FAIL** at the
  stale PostgreSQL rehearsal gate; Dependency Security `41549050479` remains
  **FAIL**; Kernel `41549050241` **PASS**. No new PR head was published.
- Private implementation `f1ccba555dc12b50cb60b7ed33b75809c9b304ea`
  (tree `db8d229e3787695b59420a71cfc51c2f8c177fd5`) defines an unmounted,
  default-off event-read authorization contract. All-site read is limited to
  a current manager/owner with `managementRead` in current membership and an
  issuer-signed lease; a device-signed, 30-second request binds the ingress
  principal, tenant/site/device/enrollment, current authority and revocation,
  lease digest and bounded continuation cursor. Disabled authority, stale or
  substituted identities, invalid generations and expired leases fail closed.
  The existing upload lease verifier was extracted without relaxing its rules.
  Identical authenticated reads may repeat within the 30-second window; this
  is freshness-bounded idempotent read, not one-shot replay protection.
- Final-source connected-site suite **49/49 PASS** for the five focused modules;
  broader `test_connected_site*.py` discovery **49 PASS / 3 SKIPPED** (52
  discovered; the opt-in live PostgreSQL tests did not run). Claims guard
  **179/179 PASS**, staged diff/whitespace **PASS**, and independent adversarial
  review **ACCEPT** after fixing disabled-authority and float-generation cases.
  No HTTP event endpoint, database event-page reader, durable cloud-download
  cursor, gateway/clock custody, deployed RLS test or two-device delivery was
  implemented or run. The prior rejected synthetic endpoint remains absent.
  Next Cloud-owned slice is an atomic tenant-scoped PostgreSQL page with a
  complete event/visibility contract and durable client cursor/recovery;
  connected mode stays disabled until authenticated ingress, revocation and
  installed two-device proof pass.

## 2026-11-03 00:35 UTC remote-event delivery review hold

- Public draft PR #752 remains fixed at
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`; Native run
  `41549050338` is still **IN PROGRESS** at this timestamp. Windows PC and
  the four isolated/Apple QA jobs passed separately; full Android has no
  terminal outcome yet. No newer private source was published.
- The current connected-site HTTP router has authority and upload/reconcile
  routes but no remote-event read route, atomic PostgreSQL event reader or
  durable cloud-download client cursor. A draft synthetic event-page endpoint
  was **REJECTED** in independent security review and completely withdrawn:
  the current principal binds a device, not a current staff actor/lease/read
  capability; a substituted reader could emit a coherent-looking sensitive
  or incomplete page. No endpoint, reader or permission expansion was kept.
- Private test-only checkpoint `78ce8c7a478d51484d0dee2aeaa95d881ba44f12`
  (tree `f2ea095e798a52e6ee64f4288bd202dcd31bb1fc`) asserts the synthetic
  mounted router returns 404 for remote events until reviewed read authority
  and a complete reader exist. Connected-site Python tests **45/45 PASS**,
  whitespace and independent final-diff review **PASS**. Two-device remote
  delivery, durable recovery, deployed PostgreSQL reader and installed-device
  revocation remain **NOT RUN/BLOCKED**. Next implementation must first define
  event-level actor/lease read policy and privacy filtering, then prove an
  atomic tenant-scoped PostgreSQL page and durable client cursor under
  reconnect/revocation tests; do not expose all site events to every device.

## 2026-11-03 00:17 UTC private gateway peer-binding foundation

- Public draft PR #752 remains fixed at
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e`; no newer source was
  published or deployed. Native run `41549050338` is **IN PROGRESS**:
  Windows PC, isolated Android/Windows/iOS QA and iPad/iOS jobs **PASS**;
  full Android remains in progress, so gallery/APK and installed acceptance
  are not claimed. App CI is **FAIL** on the stale PostgreSQL rehearsal,
  Dependency Security **FAIL**, Kernel **PASS** on that public head.
- Private implementation `dae723620227954b493612e3a9083d740811a3f7`
  (tree `307f90fe26f9837a5d52afd3e596264f866de61c`) adds an unmounted
  gateway principal-attestation adapter and adversarial synthetic tests. It
  accepts only a transient peer attestation bound to the same ASGI request,
  named gateway, current enabled tenant/site authority and active enrolled
  device fingerprint/session generation, observed within 30 seconds. Missing,
  stale, replayed, substituted, revoked or HTTP-self-asserted identity fails
  closed. Connected-site Python regression **45/45 PASS**, Python compilation,
  claims guard **179/179 PASS**, whitespace and independent final-diff review
  **PASS**. This is source-only: no real mTLS ingress, platform key custody,
  issuer, mounted route, deployed connected tables or two-device delivery is
  proven; connected mode remains disabled. Remote event download/replication
  is still **NOT RUN** and is a distinct next implementation dependency.

## 2026-11-03 00:01 UTC exact-head App CI terminal

- On draft PR #752 head `289ec76de4b80cd2de437afc3b28cfe76192ec1e`,
  App CI `41549042445` is terminal **FAIL** at canonical step 638/668,
  `hq:verify`: `database_rehearsal_evidence_stale`, with
  `secretValuesExposed:false`. Its earlier disposable PostgreSQL 17 replay
  test, release/RLS checks, dependency install, lint and deployment-contract
  steps passed. Desktop and 390px browser journeys were **NOT RUN** after the
  fail-closed gate. The synthetic PostgreSQL test does not replace the fresh
  authoritative Windows receipt. Native run `41549050338` remains **IN
  PROGRESS** at this timestamp; no full-Android or APK result is claimed.

## 2026-11-02 23:57 UTC guarded PR update and private Windows preflight

- Draft PR #752 was non-force fast-forwarded from
  `9806fbfe16741fcf6a0dde79f0f3ff664fe3338b` to
  `289ec76de4b80cd2de437afc3b28cfe76192ec1e` (tree
  `33edf49840b8b2c60677153c33198a4b3313c16b`), after remote-head,
  clean-tree, ancestry, diff-scope and terminal-prior-CI checks. Remote and PR
  readback matched; it remains open/draft and unmerged. The three included
  commits are one exact-head status checkpoint, the two-line wallet test
  reachability repair and its status checkpoint. No merge, deployment,
  release signing, manual workflow dispatch or connected-mode enablement.
- At this ledger timestamp, exact-head Kernel run `41549050241` **PASS**,
  Dependency Security run `41549050479` **FAIL**, App CI run `41549042445`
  **IN PROGRESS**, and Native run `41549050338` **IN PROGRESS**. The redundant
  same-head App pull-request run `41549050393` is **SKIPPED**, not a pass.
  Full Android, gallery, APK and installed-device outcomes on this head must
  not be inferred while Native remains in progress.
- Private, unpublished Windows bootstrap hardening
  `2e5940807e4956d07b0ac3ca3894d4dd6a793c22` (tree
  `9747d2abc008310710c4c9d3ea8c40c6f1d1baab`) moves the existing
  Rehearsal-only approval, closure-observer and required-component rejection
  before temporary workspace creation and installer download. Capture and
  downstream Authenticode/runtime/receipt checks remain unchanged. Focused
  Node source contracts **53/53 PASS**, whitespace and independent security
  source review **PASS**; executable Windows/PowerShell rehearsal validation
  is **NOT RUN**. This change does not approve any source, register #753 on
  main, authorize a dispatch or clear the stale PostgreSQL receipt.

## 2026-11-02 23:42 UTC terminal native CI, private wallet test repair, Windows rehearsal

- Draft PR #752 remains open and unmerged at
  `9806fbfe16741fcf6a0dde79f0f3ff664fe3338b`. Native run
  `41542621302` is terminal **FAIL**: the full Android `behavior_checkout`
  shard reached 79 passes and one substantive failure, `cancelling a member
  wallet intent restores a walk-in basket`. The preceding `Mobile money` tap
  missed its target at `test/widget_test_support.dart:7127`, so the pending
  wallet member card was absent. This is a reproduced test reachability
  failure, not evidence that the wallet transaction itself failed. Android
  gallery and APK stages were **NOT RUN**. The other five native jobs passed,
  including Windows PC's 102 backup tests and unsigned QA build; none proves
  signed or installed acceptance.
- Private implementation `5f7aa0e60c1a1c054295262831067bdbdf6b87c5`
  (tree `0a3ed1e79583a849cf0e9d10912943f990474488`) adds only
  `ensureVisible` and a settled frame before that existing test tap; all
  pending-member, cancellation, single-sale and stock assertions remain.
  Exact failing case **1/1 PASS** locally; full checkout widget file **80/80
  PASS** in 6m57s; changed-file Flutter analysis, Dart formatting, whitespace
  and independent read-only review **PASS**. Exact-head hosted verification
  of this private successor is **NOT RUN**. No PR update is authorized or
  performed by this checkpoint.
- PR #753 remains open/draft at
  `6e3d1511a9711e752a8b5529164d8ecb54a4bf3f`, targeting `main`.
  Its one-file workflow registration is **BLOCKED** by the older-main
  Dependency Security checks and branch review rules; `main` remains
  `5479c5d1ece3d697cf5c505e7feb431dc88baf75` without the workflow.
  Observer-probe, capture and rehearsal dispatches are **NOT RUN**. The
  source-only Windows workflow/profile/observer tests pass **53/53** locally,
  but the source registry has no approved Python, Psycopg, OpenSSL, Node or
  Git artifacts; the toolchain profile has no executable bindings and no
  complete runtime closure. The EDB installer identity observation is not a
  retained, approved toolchain profile. A fresh authoritative PostgreSQL 17
  Windows receipt remains **BLOCKED**, and App CI remains **FAIL** at
  `database_rehearsal_evidence_stale`. The hosted disposable PostgreSQL
  3/3 synthetic tests do not satisfy this gate. Next owner actions are to
  resolve #753's dependency/review requirements, authorize only a reviewed
  exact-ref observer probe, independently authenticate and bind all runtime
  sources and closure, then separately authorize a controlled rehearsal.

## 2026-11-02 23:16 UTC published successor and exact-head CI

- Draft PR #752 is open and unmerged at
  `9806fbfe16741fcf6a0dde79f0f3ff664fe3338b` (tree
  `46f4f0ffba7f4314f6dc135bf81f482de150b677`), a guarded non-force
  fast-forward from `2de3202161176b0a8e1ffeb4f7ced2cbae9bd8b9`.
  The nine-commit, six-path successor had cumulative independent source review
  **PASS** and full-range whitespace **PASS** before publication. No merge,
  deployment, signing or connected-mode enablement followed.
- Exact-head App CI `41542614510` **FAIL** at canonical step 638/668,
  `hq:verify`: `database_rehearsal_evidence_stale`. Its earlier disposable
  PostgreSQL 17 v15/v16 replay, rollback, concurrency and tenant-RLS probe
  ran **3/3 PASS** in 1.547 seconds, followed by successful release/RLS
  guards, lint and deployment-contract generation. The probe does **not**
  satisfy the authoritative v14 Windows rehearsal or deployed connected-site
  authority. Desktop/browser journeys after the failing step were **NOT RUN**.
- Exact-head Kernel `41542621083` **PASS**. Dependency Security
  `41542621122` **FAIL** in locked app/kernel audits; platform, runtime pip
  and added-line credential scan passed. GitGuardian's current PR check
  **PASS** does not by itself adjudicate historical incidents.
- Native run `41542621302` is still **IN PROGRESS** at this timestamp:
  isolated Android, Windows and iOS QA jobs and iPad/iOS completed **PASS**;
  full Android remains in serial Flutter shards, and Windows PC remains in
  its backup suite. Neither full Android nor Windows PC can be called passed
  before terminal results. Exact-source QA archives are not production-signed
  installed-device or physical-hardware evidence.

## 2026-11-02 23:02 UTC Windows backup UI gate

- Exact public PR #752 head `2de3202161176b0a8e1ffeb4f7ced2cbae9bd8b9`
  Native run `41538964926` is terminal **FAIL**. Windows PC completed 101/102
  backup tests but failed `export screen validates the password before opening
  Save As` at `test/shop_backup_test.dart:1732`: the validation text was not
  found. Android failed earlier at the known native inventory contract; full
  Android tests, gallery and APK packaging were **NOT RUN**. Three isolated QA
  jobs and the iPad/iOS job passed separately; they do not override
  either failed job.
- Private implementation `01b41856de4b4846a463c0de4cd2240a6a401edd`
  (tree `0a0ccaab5b686e92c232a0e66362d09f84150614`) scrolls the existing
  live-region validation message into view on short windows and makes the
  test explicitly scroll to the lazily built Save As button. The 12-rune
  password check, mismatch check and no-picker-before-validation assertion
  remain. Pinned Flutter 3.47.8 with existing LLVM ran the exact failing
  case **1/1 PASS**, adjacent export widget tests **5/5 PASS**, targeted
  `flutter analyze` **PASS**, Dart formatting **PASS** and independent source
  review **PASS**. Windows hosted execution of this private fix is **NOT RUN**.
- The prior private native-inventory and opt-in PostgreSQL 17 tests remain
  unpublished at this checkpoint. A real PostgreSQL 17 repository run, full
  Android job and signed installed recovery are still **NOT RUN** for the
  private source; dependency security remains **FAIL**. No release or pilot
  readiness follows from the local UI result.

## 2026-11-02 22:48 UTC exact-head CI and private successor

- Pre-existing `2026-11-03` headings below are retained checkpoint labels;
  they are not a later UTC verification of this exact-head CI status.
- Draft PR #752 was updated by one guarded non-force fast-forward from
  `fe02f283d51bb546db7fab0feabfcff0a43673ee` to
  `2de3202161176b0a8e1ffeb4f7ced2cbae9bd8b9` (tree
  `7f27b3fa51dcc4347bfa6d2759c12d895c21454b`); remote readback matched.
  No merge, deployment, release signing or connected-mode enablement occurred.
- Exact-head App CI `41538956811` **FAIL** at `Build and verify canonical app`:
  `tools:syntax:verify` found the missing QA metrics test in the native test
  inventory and shard assignment. Native run `41538964926` has the same first
  Android failure at `Verify pinned native toolchain contract`; full Android
  tests, gallery and APK packaging are **NOT RUN** on that job. At this ledger
  timestamp the Windows PC job is still in progress; isolated Android,
  Windows and both Apple QA jobs passed separately. Kernel `41538964891`
  **PASS**. Dependency Security `41538964925` **FAIL** in locked app/kernel
  dependency audits; platform, pip and added-line credential jobs passed.
- Private, unpublished workflow repair `841097bd3f8fd7f118df42f0ed78ebb4d709426d`
  (tree `66b1716a9387476c799ad5290c6b853ea619dbff`) adds the metrics test
  exactly once to inventory and the persistence shard, plus a fail-closed
  formatter check. Deterministic inventory diff, native CI contract **22/22**,
  QA isolation **33/33** and independent review **PASS**. Hosted verification
  of this successor is **NOT RUN**.
- Private, unpublished PG17 test successor
  `2fe9c269bec916c463d1cd3c3583496b88bd9eda` (tree
  `0b01a5d1d08eb43f43108d887b0c9dabbdce06ae`) adds an opt-in disposable
  PostgreSQL 17 v15/v16 replay/concurrency/tenant-RLS test and an explicit App
  CI invocation. The production `connected_enabled=false` source check stays
  required; only the synthetic disposable fixture relaxes it. Python syntax,
  non-PG authority/runtime suite **28/28 PASS**, three PG tests **SKIPPED**
  locally with the opt-in flag unset (a PostgreSQL 17 binary is also absent),
  claims guard **179 PASS**, and
  independent static review **PASS**. Actual PG SQL behavior, full v14→v16
  migration, authoritative Windows rehearsal and CI runtime are **NOT RUN**.
  Local `verify_app_deploy_workflow.mjs` is **BLOCKED** by the installed Python
  dependency pin mismatch `fastapi`, not by a reported workflow assertion.
- The unpublished test implementation is
  `2fe9c269bec916c463d1cd3c3583496b88bd9eda`; private follow-up
  `e68e8274774c976e92c3a0f3f8b8edd854ee299e` removes a final blank line
  exposed by the full-range whitespace check, which now **PASS**. None of
  these successors is hosted-tested or published. Next: preserve the current
  hosted job to terminal state, then separately review a guarded successor
  and run exact-head CI before using any new QA artifact.

## 2026-11-03 cumulative private candidate review

- Independent review of the cumulative draft-PR successor first **HELD** the
  Android installed-QA adapter because malformed authorization expiry and
  request deadline text could parse to `NaN` and evade an expiry comparison.
  Implementation `7eae84659a3947a2c934fbd7bb530d1c6e034eb1` (tree
  `c1f7d944871b385659c15297f081f074dc93e014`) requires canonical, finite,
  strictly future UTC timestamps at both boundaries and corrects the SQLite
  metrics comment to disclose in-memory row hashing. The affected installed
  protocol/handoff tests are **113/113 PASS**; independent re-review **ACCEPTS
  the cumulative source candidate** with this correction included.
- Public PR #752 remains draft at `fe02f283d51bb546db7fab0feabfcff0a43673ee`.
  Its prior App and dependency failures are terminal; no current-source hosted
  run, signed artifact, installed device, live PostgreSQL 17 replay, or
  two-merchant acceptance follows from the private source review.

## 2026-11-03 cross-device pilot gate recheck

- **SOURCE PASS / DEFAULT-OFF:** the v15 migration defines eight private
  connected-site tables, forces row-level security, revokes browser roles,
  and constrains `connected_enabled` to false. Native source contains the LAN
  coordinator, joining client, durable attempts and replica, and cloud
  reconciliation boundaries. The server runtime requires an injected issuer,
  member/device authority and repository; defaults remain unavailable.
- **LOCAL PASS:** `python -m unittest -q tests.test_connected_site_v15
  tests.test_connected_site_runtime tests.test_connected_site_lease_issuer`
  completed 35/35. The PGlite migration verifier was **NOT RUN** because
  `@electric-sql/pglite` is absent in this worktree; Dart/Flutter native tests
  were **NOT RUN** because those tools are absent. Neither missing dependency
  was installed.
- **BLOCKED:** no source-bound deployment of the eight tables, trusted cloud
  issuer, platform key custody, two synthetic-tenant hosted denial proof, or
  installed two-device WAN-loss/reconnect/restart/restore receipt is recorded
  for this candidate. Do not turn on Realtime or direct browser grants as a
  substitute. Cross-device live sync is a pilot requirement and remains off
  until the authority, transport, migration and recovery evidence all pass.

- **HISTORICAL FAIL / SUPERSEDED BELOW:** an independent source review identified a
  lost-response retry gap in both v15 repositories: they compare the client's
  original `after_cursor` with the server's advanced cursor before consulting
  retained acknowledgements. A first candidate that accepted stale-cursor
  replay was rejected because v15 retains no device cursor-to-command/event
  binding; a reordered or substituted batch could be mislabeled a replay.
  That candidate was withdrawn and the source restored. The required repair is
  a durable, tenant/site/device-scoped immutable batch or per-cursor binding,
  committed atomically with the ACK and cursor, with tests for identical lost
  response, reordered/substituted batch, changed digest, concurrent retries,
  tenant isolation and no duplicate money/stock effects. No sync-ready claim
  or production enablement followed from that 10/10 baseline unit pass.

### Private durable upload retry successor

- **SOURCE PASS / PRIVATE:** implementation
  `6d554f8c1bc1625f57a6ecaf542066db9ebe8c43` (tree
  `6c2ee8eda18767b4cb0045fda9bfae5aa75bb770`) closes the rejected
  stale-cursor shortcut with a new source-only v16 table retaining an immutable
  digest of the exact ordered batch, workspace, site, device and cursor range.
  Cursor, ACK and batch binding are written in one required non-autocommit
  transaction. The memory test repository stages under a lock and publishes
  only after the complete batch succeeds. Replay with reordered, substituted
  or wrong-tenant content fails closed; the original lost-response batch
  returns retained acknowledgements without another event effect.
- **LOCAL PASS:** Python authority/rehearsal contracts **77/77**, Node packet
  contracts **13/13**, `git diff --check` **PASS**. Existing cached PGlite
  `0.5.4` ran the connected schema verifier: **14 checks PASS**, **26
  migrations**, schema version **16**. Independent security review **ACCEPTS
  the private source/test checkpoint** after rejecting the first unbound
  retry design and requiring transaction and memory rollback guards.
- **NOT RUN / BLOCKED:** genuine PostgreSQL 17 repository replay, rollback
  and concurrent-transaction testing, authenticated issuer/deployed schema,
  and installed two-device WAN-loss/reconnect/restore evidence. PGlite schema
  checks do not satisfy the PostgreSQL rehearsal or pilot sync gate. Connected
  mode remains default-off; no PR update, provider change or deployment was
  performed.
- **FOLLOW-UP SOURCE TEST:** `b3a962356bae45c3e52e732fc73f298af464e9a2`
  (tree `4b7b056f21203606b7fae3b0cd0c502b077f8154`) proves an older
  identical batch still replays after a later batch advances the same device
  cursor; the affected Python authority/runtime suite is **39/39 PASS**.
  `npm run database:migrations:verify` is **PASS** with 153 private migration
  checks and the 27-table public baseline inventory. PostgreSQL 17 and
  installed two-device evidence remain **NOT RUN**.

## 2026-11-03 private Android pilot-successor preflight

- **SOURCE PASS / PRIVATE:** implementation
  `905f29110cda29d641905930952931a3584cb183` (tree
  `27307a405209ff03e12bc505d5c607d8faa61806`, native tree
  `0a47b2275e2027ba50e0487453e3143f7e8f0da7`) is a strict descendant of
  draft PR #752's public head `fe02f283d51bb546db7fab0feabfcff0a43673ee`.
  The exact 28-path standard binary diff is SHA-256
  `88987ac280af295b5971fe1d8e037efe7469596a8c14ed701610b7a79ceefe38`.
  It composes synthetic receipt evidence, stable installed-journey selectors,
  pure handoff/protocol authority, the source-only fail-closed ADB adapter,
  signed count-only QA metrics, operator-clarity fixes and the first two
  Android visual-system slices.
- Final-source release contracts plus adapter/protocol/handoff tests are
  **163/163 PASS**. Final native-tree focused evidence is: hidden filtered
  matches **2/2 PASS**, explicit shift difference/close **2/2 PASS**, backup
  guidance **1/1 PASS**, design tokens **4/4 PASS**, Sell/checkout responsive
  hierarchy **13/13 PASS**, and targeted analyzers **PASS**. The complete
  range `git diff --check` is **PASS** after the recorded one-line EOF
  correction. Metrics **9/9**, legacy QA evidence **7/7**, protocol/ADB
  **86/86** and QA isolation **33/33** are additionally **PASS**. Independent
  reviews accept each final source slice; combined candidate review is required
  before publication.
- **NOT RUN / BLOCKED:** this implementation has no exact-head hosted CI,
  rebuilt artifact, authorized remote installation or device observation.
  PostgreSQL rehearsal evidence remains stale and dependency security remains
  red on unsupported minimatch paths. Signing, installed restart/restore,
  TalkBack, physical hardware, merchant acceptance and production are not
  established. Connected mode remains default-off; no publication, merge or
  deployment is authorized by this ledger.

## 2026-11-03 Android operator-clarity checkpoint

- **SOURCE PASS / PRIVATE:** implementation
  `50cd0a7fa6e69f981c1249fad58be2ce6171bf11` (tree
  `fa74092dab7660c1a44acfa554a35d9933587b15`, parent installed-protocol
  ledger `cb1664ceab1810258e5cfb4b713ed9de78d133ab`) changes exactly six
  native Shop files. It prevents a category or favorites filter from offering
  duplicate product creation when an exact name or barcode match is merely
  hidden, makes the cash-difference confirmation explicitly state that it
  closes the shift, and separates backup contents, custody and restore-boundary
  guidance into accessible English and Burmese sections. The reviewed source
  commit's binary patch SHA-256 is
  `9f4bd6d85058d778ba960bdfe27edf05edb7600a3a446f0e5464c0ae9d17b5b3`.
- Hidden-name/barcode/category/favorites tests are **4/4 PASS**; existing and
  explicit shift-close tests are **3/3 PASS**; backup guidance plus live
  save/cancel/error status tests are **3/3 PASS**; targeted analyzer and diff
  checks are **PASS**. Independent UX, accessibility and accounting review
  **ACCEPTS** the final diff after replacing a contradictory hidden-match
  heading. No database, accounting, transaction or close-shift implementation
  changed; Keep open creates no state/outbox effect and the confirmed path
  creates exactly one existing close transition.
- A source-bound synthetic visual audit at predecessor
  `f250876575f79220da8b04c6af79cf5f96cd5e4f` captured and reviewed 138
  Flutter PNGs for EN/MY phone and tablet layouts; its 43/43 visual-capture
  tests **PASS**. The first bounded Android-first implementation is
  `813550ffe8ed1183b532f9d407eea13bcff432d1` (tree
  `df2d317a7411b6cfb828e2e155a2223329971133`, native tree
  `f0b5325173e41243b103339c75389b111f6b6efd`). Its two-file binary-diff
  SHA-256 is `dd1c76fb2cc54b6e648512178dad4aca4d4921785837ac748b298c7104988384`.
  It applies a warm-neutral canvas, white transactional surfaces, near-black
  type, existing blue decisive actions, padded Material targets and explicit
  48dp TextButton/IconButton minimums while preserving the existing EN/MY font,
  tracking and line-height contracts. Phone/tablet EN/MY at 1.3x text are
  **4/4 PASS**, targeted analyzer is **PASS**, and independent design,
  accessibility and transaction-boundary review **ACCEPTS** the final diff.
  Second-slice successor `9d2c4be0118d80f30a5bb6d447b73f225274f3f3`
  (tree `b18126e5b8542b92fc26469ada9aa99df75b5764`, native tree
  `8717de271cc830211f4967dbaa552428778bd290`) strengthens Sell/current-sale/
  checkout hierarchy with responsive 56/64/72dp product media, a stronger
  total and 56dp cash/wallet actions. Its two-file binary-diff SHA-256 is
  `6494b99156dd0713ef917e3342b5538d3126b9cad6566cf19c35adc31a044780`.
  New 390/820 EN/MY 1.3x tests are **4/4 PASS**, existing 768/1024 EN/MY
  normal/1.3x tests are **8/8 PASS**, the reviewer-requested 320px/1.5x
  Myanmar regression is **1/1 PASS**, analyzer and diff checks are **PASS**,
  and independent review **ACCEPTS** the exact final diff. Existing callbacks,
  identifiers, money logic, persistence, receipts, scanner/printer interfaces
  and connected defaults are unchanged. This remains a reversible visual
  foundation, not a complete or installed redesign; restrained motion and
  consolidated offline/LAN/sync/lease/backup/printer state remain later slices.
- **NOT RUN / BLOCKED:** no APK was rebuilt or installed for this private
  successor, no TalkBack or physical-device pass occurred, and no scanner,
  printer, signing, merchant or production evidence is created. Connected mode
  remains default-off. Draft PR #752 remains on public head `fe02f283`; this
  checkpoint has not been published.

## 2026-11-03 exact-head `fe02f283` Native CI receipt

- Draft PR #752 exact head `fe02f283d51bb546db7fab0feabfcff0a43673ee`
  (tree `662d6b932a4a01a51b231e1ab9c58bc544fb6c28`) completed Native run
  `41509167112` with **all six jobs PASS**. Full Android passed serial Flutter
  shards, real process-interruption recovery, analyzer, deterministic gallery
  capture, unsigned-release rejection and debug APK packaging. Windows PC,
  isolated Android/iOS/Windows QA and iPad/iOS also passed.
- Retained Android production-debug artifact `13176655623` is 104,995,993
  bytes and gallery artifact `13174854644` is 1,660,609 bytes; both are named
  for GitHub's tested synthetic merge `fb0c6b291f6e85d013d5df43fbeace75a798afbf`
  and expire 16 November 2026. Isolated Android synthetic-QA artifact
  `13171938890` is 104,999,415 bytes, promotion-ineligible, and expires 9
  November 2026. No artifact was downloaded in this checkpoint.
- **EVIDENCE BOUNDARY:** this is exact-head hosted CI and retained debug/QA
  artifact evidence, not production signing, installation, device recovery,
  physical hardware or merchant acceptance. App CI remains **FAIL/BLOCKED**
  at step 638/668 on stale PostgreSQL 17 rehearsal evidence; Dependency
  Security remains **FAIL/BLOCKED** on the known unsupported minimatch paths.

## 2026-11-03 installed Android protocol checkpoint

- **SOURCE PASS / PRIVATE:** pure-validator prerequisite
  `f250876575f79220da8b04c6af79cf5f96cd5e4f` (tree
  `3969b9c486a210b99ce6b3360727b26b301625da`) extracts deterministic
  Android QA manifest plus v1/v2/v3 handoff authority into a module importing
  only `node:crypto`. Existing CLI/writer exports remain compatible and all
  exported authority structures are deeply frozen. Its committed four-file
  binary-diff SHA-256 is
  `5f127f07bbb067898335eb8a7bfc7e4ac7c4caf40abcfcdb8ba6fa3c93bacfa2`.
- Handoff/preflight/writer tests are **53/53 PASS**; both self-tests and the
  997-script syntax verifier are **PASS**; QA isolation is **33/33 PASS**,
  Native contract **22/22 PASS**, and release preflight **5/5 PASS** while
  remaining blocked as intended. Independent review **ACCEPTS** the final
  extraction and mutation defense.
- **SOURCE PASS / PRIVATE:** protocol implementation
  `a59bd7c35a9cfb90900a3b94f727585975a77ad6` (tree
  `1c38355426f8c60422e70d4833a2b62894d1ffd2`, parent pure-validator
  checkpoint `f250876575f79220da8b04c6af79cf5f96cd5e4f`) defines a pure,
  injected-observation exact-APK installed-QA state machine. The two-file
  patch SHA-256 is `4dfe9c7f86eef2a2fec0a3fd4d40c4e72418dda5f31cfa3758927f78e65fcf36`.
- Canonical v3 authority derives source, merge, native-tree, archive, APK,
  signer and manifest identities. The protocol binds pre/post sale deltas,
  selectors, isolation, private-to-external staged evidence across `pm clear`,
  restored receipt count reset, session nonce/order/ack chain, same-target
  lock, abandoned recovery, separate operation/abort/cleanup deadlines and
  mandatory cleanup receipts. Timed-out operations remain `UNKNOWN` until a
  request-bound abort/join acknowledgement proves `ABORTED`.
- Focused protocol plus pure-validator tests are **99/99 PASS** and the
  extended handoff/preflight/manifest matrix is **126/126 PASS**; syntax is
  **PASS**. The original exact implementation's full-range diff check was
  **FAIL** on one trailing blank line at EOF, contrary to the earlier ledger
  wording. Whitespace-only successor
  `fdd5b7dab1f32990cc178f4e73eb92ffc927707b` removes that line; its exact
  protocol suite is **73/73 PASS** and the full candidate range diff check is
  **PASS**. Independent security review **ACCEPTS** the protocol source; the
  whitespace correction changes no runtime or assertion semantics.
- **NOT RUN / BLOCKED:** this is a protocol validator, not an ADB, filesystem,
  emulator or device adapter. UI actions, `pm clear`, staging, OS termination,
  isolation and cleanup remain injected attestations until executed against
  an authorized pinned Android target. No production signing, physical
  hardware or promotion eligibility is established.
- **SOURCE PASS / PRIVATE ADAPTER:** source-only successor
  `8428ffa169d3b25e739d3c4b95b4116d0b1cb7de` (tree
  `56a861b15f1b2800c92f82df0bea4a77dda632eb`) adds only the injected ADB
  adapter and its adversarial fake-executor tests. Its two-file binary-diff
  SHA-256 is `b4ed578b7826bbe3b5c34c5f0a7fd74ff823e936710ae19a0f3317c81ce9f2bc`.
  It fails closed on target authorization/isolation, target-wide atomic lock
  ownership, exact installed base/split APK bytes and single signer, per-step
  UI transition authority, metrics/recovery authority digests, staging,
  post-restore readback, timeout abort/join, privacy, foreign-lock replacement
  and post-clean absence. Adapter tests are **13/13 PASS** and the combined
  adapter/protocol/validator matrix is **86/86 PASS**; diff check is **PASS**.
  Independent security review initially **HELD** the draft for session-scoped
  locking, package-only identity and self-attested device observations, then
  **ACCEPTED** the revised final source after adversarial coverage closed those
  source defects.
- **NOT RUN / BLOCKED:** the adapter intentionally contains no concrete process
  executor, UI driver, metrics/recovery observer, atomic lock backend, workflow
  or provider integration. No ADB command, download, emulator, device,
  installation, `pm clear`, staged copy, restore or cleanup ran. An authorized
  remote target and independently bound concrete backends are still required
  before installed acceptance can begin.
- **SOURCE PASS / PRIVATE METRICS:** implementation
  `905f29110cda29d641905930952931a3584cb183` (tree
  `27307a405209ff03e12bc505d5c607d8faa61806`, native tree
  `0a47b2275e2027ba50e0487453e3143f7e8f0da7`) adds a synthetic-QA-only,
  loopback-only signed count observation for sales, stock movements, receipts,
  outbox, on-hand and shifts. Its six-file binary-diff SHA-256 is
  `196a85c36f5918bd9ec5eb8d5c760f9599b0133a7790ccb85c4ace4ff0587b54`.
  Counts and the canonical relevant-table state digest are captured inside one
  read transaction, while the emitted evidence contains no merchant rows,
  customer/product/payment/receipt content. Session, request, target, sequence,
  authority and pre/post/fresh-restore transition grammar are bound; production,
  default and network-printer paths fail closed.
- Metrics tests are **9/9 PASS**, legacy QA evidence tests **7/7 PASS**,
  protocol/ADB tests **86/86 PASS**, QA isolation **33/33 PASS**, targeted
  analyzer and diff checks **PASS**. Independent security review first
  **REJECTED** unkeyed/hash-only and underconstrained transitions, then
  **ACCEPTED** the detached-signature, full-state-digest and exact-transition
  revision with recompute/splice/replay tests.
- **NOT RUN / BLOCKED:** this remains an injected signing interface, not Android
  Keystore custody. A non-exportable device key, host-pinned raw public-key
  digest/algorithm, rotation/rollback/restart validation, concrete adapter
  wiring and real installed-device evidence remain required.

## 2026-11-03 installed Android selector checkpoint

- **SOURCE PASS / PRIVATE:** implementation
  `19c452772997b6805b40bf34fe5074413c0a6280` (tree
  `9db0646521e3c7b007b79d8f4096893d42486469`, parent Native-CI receipt
  `953b646c0b36d2b4f4e71754939d99e1876e0a35`) adds stable,
  locale-independent semantic identifiers to existing installed-journey
  controls without adding an API, bypass or alternate transaction path. The
  six-file patch SHA-256 is
  `a482900f7e855a758e62feabb05e264623b740009a07d9715a8b3eece4f66b9c`.
- Identifiers cover empty-catalog add, product fields/barcode reveal/save,
  dynamic catalog row, cart review, cash/given/confirm, startup start/confirm,
  restore choose/password/confirm and backup password/confirm/export. Existing
  receipt and restored-state selectors remain intact. Production changed-line
  scope is 93 lines across four files, including a 12-line metadata-only
  selector extension.
- The initial broad test run retained one pre-fix responsive-layout test-design
  failure with 105 other tests passing. Final-source EN/MY responsive,
  startup, backup and restore selector tests are **6/6 PASS**; the post-review
  journey rerun is **2/2 PASS**; targeted analyzer and diff checks are
  **PASS**. Independent review **ACCEPTS** the corrected final diff.
- **NOT RUN / BLOCKED:** no ADB, UIAutomator, APK installation, emulator,
  device, force-stop or restore execution is claimed. The earlier uncommitted
  runner draft was independently **HELD** for evidence-staging, restored-count,
  delta, isolation and crash-recovery gaps and was removed completely before
  this bounded selector implementation began.

## 2026-11-03 Android synthetic receipt evidence checkpoint

- **SOURCE PASS / PRIVATE:** implementation
  `ab97796b82ff415edb40fe45bbd42cad94c39494` (tree
  `4c9cb547b76ed00723e8171b0a3591bc7f2039c7`, parent published Android
  handoff ledger `fe02f283d51bb546db7fab0feabfcff0a43673ee`) adds an
  explicit synthetic-QA-only loopback receipt evidence path and stable,
  locale-independent accessibility identifiers for Recent Sales, saved
  receipt and reprint actions. The nine-file patch SHA-256 is
  `d8f742fb7db04db9212523bbb2eff74697a7de00362bddb04c1836d71976684c`.
- The evidence sidecar is private to the existing Android debug `run-as`
  boundary and contains only contract/profile/platform identities, immutable
  receipt/render SHA-256 digests, language and capture count. It stores no
  receipt rows, product, customer or payment payload. Atomic flush/rename and
  per-path serialization protect concurrent captures; the exact sidecar name
  is excluded from backup-restore candidates.
- Focused synthetic redaction, fixed-digest substitution, concurrency and
  no-sale/stock/outbox-effect tests are **PASS**. Production/default
  fail-closed, trusted network printing, semantic-selector reprint,
  device-only completion/recent navigation, EN/MY responsive task navigation,
  targeted analyzer and QA evidence coexistence/restore are **PASS**; the full
  evidence-store suite is **7/7 PASS**. Independent re-review **ACCEPTS** the
  final diff.
- **NOT RUN / BLOCKED:** this is source readiness, not installed acceptance.
  Real APK installation, Android force-stop/reopen, UIAutomator interaction,
  `run-as` extraction, emulator/device execution and physical printer evidence
  remain required. No public PR update, deployment or production enablement
  is included in this checkpoint.

## 2026-11-02 canonical Android QA v3 handoff checkpoint

- **SOURCE PASS / PRIVATE:** implementation
  `bed37993500e2960ad124d73db2eb4a1b4035261` (tree
  `311d92c26924b06f33375e275939afeed3ba08f8`, parent published ledger
  `517dd97a12b01b9e042b55d794a54a6dc45b3199`) fixes a source-only
  compatibility defect between the canonical Android QA handoff and the
  remote installed-QA preflight. The preflight now recognizes only exact v2
  and canonical v3 handoff contracts as capability-aware; v1 and unknown
  contracts remain blocked. The two-file patch SHA-256 is
  `4039f8cd14cb3f6ff4b38fca840ac24e1d4e4916fbb937eb71eac5d0a673cf52`.
- Combined handoff/preflight tests are **42/42 PASS**; Node syntax and diff
  checks are **PASS**. Independent review **ACCEPTS** the exact final diff and
  confirms canonical v3 still requires artifact/signing/provenance identity
  and cannot promote itself to observed installed evidence. The complete QA
  isolation contract is **33/33 PASS** with audit `ok:true`,
  `installedIsolationVerified:false` and `launchAuthorized:false`; the Native
  CI artifact-identity contract is **22/22 PASS** with verifier `ok:true`.
- **BLOCKED / NOT RUN:** the result remains `BLOCKED_OFFLINE_PLAN` on
  `external_remote_observation_required`; emulator/cloud execution flags stay
  false. The current GitHub Ubuntu runner advertises Android command-line,
  build and platform tools but not an emulator or system image, and the Shop
  source has no installed-app automation harness. A same-job emulator path
  therefore still requires an immutable official emulator/image lock,
  explicit Android license authority, verified KVM/no-egress containment,
  a reviewed exact-APK runner and a separate guarded workflow decision. No
  package was downloaded or executed, no emulator ran, and no CI workflow was
  changed or dispatched.

## 2026-11-02 trusted-time active-binding recheck checkpoint

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `6a8699001edfa0cc7346aba70c7cba73267088ef` (tree
  `95b50480cb1ab13d75a2071340c85b202319a0bc`, parent receipt/CI ledger
  `eae326ddbaf350fbafb2e360a182b1824758c6be`) closes the trusted-time
  revoke-during-request race. The client now resolves the complete active
  coordinator binding again after canonical signed-response parsing and before
  returning the observation. The two-file patch SHA-256 is
  `528fc1da380179d1a260ca678f2da5f1bf0a1d1e8690a79aa81cfb72a305eab2`.
- The comparison binds digest, workspace, site, coordinator/client identity,
  client fingerprint and key, approval/session generation, endpoint and TLS
  certificate. Revocation fails as binding unavailable; rotation or
  substitution fails as binding rejected. The POST remains one-shot with no
  automatic retry, and a rejected binding cannot return an observation to the
  runtime for persistence.
- Focused client tests are **17/17 PASS**. The broader client, trusted-time
  composition and durable restart/restore matrix is **29/29 PASS**; targeted
  analyzer, formatting and diff checks are **PASS**. Independent security
  review **ACCEPTS** the complete final diff.
- **NOT RUN / BLOCKED:** no listener, real key custody, enabled profile,
  installed-device revocation race or production issuer evidence is claimed.
  Connected operation remains unmounted and disabled in shipping profiles.

## 2026-11-02 exact-head `3c02a2bf` hosted CI receipt

- Draft PR #752 was updated by the exact authorized non-force fast-forward to
  `3c02a2bfca9c6012b1a667d0191291099bb6005b` (tree
  `ce89ef6a80849d6128d20d732de61eb01733d5dd`). It remains open, draft,
  unmerged and undeployed.
- Kernel run `41485851316` is **PASS**. App run `41485843414` passed through
  step 637/668 and is **FAIL/BLOCKED** at step 638 `hq:verify` only because
  `supermega.hq.database-rehearsal.v3` reports
  `database_rehearsal_evidence_stale`; later App steps are **NOT RUN**.
- Dependency run `41485851475` is **FAIL/BLOCKED** only in the App and Kernel
  locked-dependency audits for the known minimatch advisory (10 App and 5
  Kernel moderate records). Runtime/Python, platform and added-line credential
  scans are **PASS**. GitGuardian's external status is terminal **NEUTRAL**;
  this does not resolve or dismiss its historical findings.
- Native run `41485851468` is **PASS** after the specifically scoped
  failed-jobs-only retry. The original two `macos-latest` jobs were cancelled
  before runner assignment because GitHub reported hosted macOS arm64 capacity;
  no steps ran. Retry iPad/iOS job `125453513572` and isolated iOS QA job
  `125453512230` both acquired runners and are **PASS**. Android full
  analyze/test/gallery/debug package, isolated Android, Windows PC and isolated
  Windows retain their original **PASS** results and were not rerun. These are
  unsigned CI artifacts, not signed or installed-device acceptance.

## 2026-11-02 receipt-bound sale completion checkpoint

- **SOURCE PASS / PRIVATE:** implementation
  `9e0ac41d99b1acafba13b9d2a9de3b22651e2947` (tree
  `45afe737f1b1421bf58e8fe0dd4c8da7486dc4a7`, parent trusted-time
  composition ledger `fac86b7870af1ccf2a110558d5ae407853cc70e4`)
  replaces the replaceable post-sale SnackBar with one session-persistent card
  bound to the exact immutable saved receipt. The two-file patch SHA-256 is
  `ad816a5e8fd7b4c0eca5ae2e5424bf5c064c9d62ee2b65ef1a858c41b1314d4c`.
- The card distinguishes sale saved, payment record, change and printer state;
  printer `sent` still says paper needs checking, ambiguous delivery retains
  the may-have-printed warning, and wallet wording remains a local record. Its
  explicit reprint action calls the existing saved-receipt print path and never
  records another sale. A later completion replaces the complete prior receipt
  binding; a late print result can update only the same full receipt ID.
- The EN/MY completion boundary is a semantic live region. The focused
  ambiguous-printer/two-sale, slow-printer/change and device-only durable
  receipt tests are **3/3 PASS**;
  targeted analyzer is **PASS**. The two-sale regression proves sale B removes
  sale A's completion key, reprint sends sale B's receipt again, and sale,
  stock and outbox totals remain exactly two effects. QA-isolation contracts
  are **24/24 PASS** with strict verifier **PASS**; Native CI contracts are
  **22/22 PASS** with verifier **PASS**. Independent review initially **HELD**
  for live-region and replacement-proof gaps, then **ACCEPTED** the final diff.
  A separate independent review **ACCEPTED** the test-only device completion
  hardening at `db8e9bd9fafe24d9ea9b30d119982d10fec5d353` (tree
  `c7e66d23899a63e0c6d9176508ae62df06818bf5`, patch SHA-256
  `6808c11a469a3b4fb08734ecabbc4b983955d927600d6f7946d2be350bbd8f5e`).
- **NOT RUN / BLOCKED:** this is source/widget evidence, not physical printer,
  installed Android/Windows, large-text or merchant acceptance. The completion
  card is intentionally session-persistent; after restart, durable receipt,
  payment and change remain available through Recent Sales. This private
  successor has not been pushed, merged, deployed or enabled in production.

## 2026-11-02 trusted-time V2 composition checkpoint

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `4570f155b80209677dd8abb61995a27cd9110148` (tree
  `ff4a7ef80c68b367f433ec08c56c1146f1cb20b5`, parent published ledger
  `3c02a2bfca9c6012b1a667d0191291099bb6005b`) supplies a required,
  separately typed `ConnectedTrustedTimeCoordinatorAuthority` to the standard
  coordinator composition and enables only the already-reviewed
  `/v2/trusted-time` route inside that still-unmounted composition. The
  two-file patch SHA-256 is
  `8960a67506891b9f96a3917d8dddacfc044f4d1bb58b8d40dfd51cd23526b00d`.
- The signing/observation authority remains distinct from the accepted-time
  reader used for pairing, nonce, lease and command decisions. It must be
  injected explicitly and has no ambient or permissive default. Existing
  endpoint authentication still binds exact coordinator scope, enrolled
  client identity and fingerprint, protocol-specific request proof and a
  one-shot nonce before authority invocation; unavailable authority returns a
  fail-closed service response and challenge substitution remains rejected.
- Composition tests are **9/9 PASS**; combined composition and endpoint tests
  are **45/45 PASS**; targeted analyzer is **PASS**. Native CI contracts are
  **22/22 PASS** with verifier **PASS**; QA-isolation contracts are **24/24
  PASS** with strict verifier **PASS**; formatting and diff checks are
  **PASS**. Independent security review **ACCEPTS** the exact final diff.
- **NOT RUN / BLOCKED:** no listener, real signing key, production authority,
  credential, installed Windows/Android exchange or connected-mode acceptance
  is established. Connected operation remains unmounted and disabled in every
  shipping profile. This successor is private and has not been published,
  merged, deployed or enabled.

## 2026-11-02 verified-time coordinator propagation checkpoint

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `f2b0085abe26e4f90af04a7a82765d28d0699697` (tree
  `6d054fedc4bde18de39ff0f84a93a4c1eb5b0eea`, parent verified-time bridge
  ledger `2ac295e6b244efe938837e4afc263dd90e2d19f7`) removes the ordinary
  wall-clock callback from the standard coordinator transport context. The
  standard server builder now derives pairing expiry, request clock-skew,
  offline lease expiry, transport preparation and database-command time from
  the same workspace/site-scoped `ShopConnectedSiteCoordinatorTimeAuthority`.
  The five-file patch SHA-256 is
  `baf9f778de719f1a90c15e60f1d486754de560eb90703538b36782c72adaf7a5`
  with stable patch ID `33950f6f3c894cb685262255f2836c5a00247dec`.
- All changed time consumers accept asynchronous verified reads. Time failure
  occurs before pairing-nonce persistence, request-nonce consumption, lease
  authorization or command handling. The lease authorizer catches
  `StateError` only around the time read; signature-verifier and other
  authorization defects remain visible instead of being mislabeled as an
  ordinary denial. Direct low-level constructors retain synchronous test
  compatibility, while the standard composition always injects verified time.
- Targeted analyzer is **PASS**. Focused site/coordinator composition is
  **45/45 PASS** and the exact final coordinator/client/host/composition matrix
  is **77/77 PASS**. Native CI contracts are **22/22 PASS** with verifier
  **PASS**; QA-isolation contracts are **24/24 PASS** with strict verifier
  **PASS**; formatting and diff checks are **PASS**. Independent security
  review first **HELD** the patch for an overly broad `StateError` catch, then
  **ACCEPTED** the final diff after the catch was narrowed and an adversarial
  signature-verifier test proved the defect propagates.
- **NOT RUN / BLOCKED:** these are source and fixture results, not installed
  platform evidence. Windows MSVC compilation, real platform time behavior,
  protected key custody, TLS identity, signed artifacts, installed recovery,
  PostgreSQL rehearsal, dependency clearance and merchant acceptance remain
  open. Connected operation remains unmounted and disabled in every shipping
  profile; no publication, merge, deployment or production change occurred.

## 2026-11-02 verified-time coordinator adapter checkpoint

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `272c1284544871a7402e081b232dbc121de2e881` (tree
  `d87a5bbe898feac677c89c09779fb66ccd9ffbda`, parent Windows-clock ledger
  `09f1a7bbd6b0a33d418d9c0aa882a5c26bde89e1`) closes the missing source
  adapter between `ShopConnectedTrustedTimeRuntime` and the existing
  `ShopConnectedSiteCoordinatorTimeAuthority` required by stock and cafe sale
  paths. Its two-file patch SHA-256 is
  `c1d8ee5c9c2742c6ead509f8e7fef3e086bb0d3a427f15098d7989048e75ecbb`
  with stable patch ID `b55164e64e5596c88af0f9afcb997146404006dc`.
- The adapter rejects workspace or site substitution before reading retained
  state and exposes only the existing live effective time. Missing, expired,
  replayed, restarted, restored-audit-only or otherwise unavailable evidence
  cannot synthesize time and fails closed. It does not modify the verifier,
  persistence, protocol, composition mount, runtime profiles or network I/O.
- The focused trusted-time composition plus platform-clock suite is **10/10
  PASS** and targeted analyzer is **PASS**. The complete 11-file trusted-time
  regression is **65/65 PASS** in 1m20s, covering canonical wire contracts,
  replay, concurrent consumption, rollback, restart, migration, encrypted
  restore, expiry and regression. Formatting and diff checks are **PASS**.
  Independent security review **ACCEPTS** the final two-file diff.
- **BLOCKED / NOT RUN:** the enabled coordinator composition still requires an
  explicit reviewed mount of this authority and still uses a separate injected
  wall-clock callback for pairing, nonce and lease windows. No claim is made
  that all connected time decisions are protected. Production issuer/key
  custody, MSVC/runtime proof, signed artifacts, installed recovery and pilot
  acceptance remain **NOT RUN/BLOCKED**; connected operation remains off.

## 2026-11-02 current-base Windows trusted-time checkpoint

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `72dd4899c28c299efbfb086fb08e95d73d18c87e` (tree
  `dabadf6c3c8232a6d212a1adf7b197d534a87ef7`, parent exact-head Native-pass
  ledger `2efcc307169837f65d0d26803fa1bccabd4c7c9e`) adds the reviewed Windows
  current-boot identifier and monotonic clock to the current `108f9700`
  lineage. The four-file patch has SHA-256
  `3684e7c64fb146a39721eafd0fb37a1dc0b5dda63bfeafb424fba69021c3d89a`
  and stable patch ID `80191436e0bc7d20de94eb132d6342995cc4f4b1`, exactly matching the
  previously accepted Windows-clock implementation.
- The method-channel request accepts exactly the one-field v1 schema. Windows
  reads a nonzero system boot GUID, hashes it with a domain separator through
  CNG SHA-256, and reports `GetTickCount64` monotonic milliseconds. Missing
  `ntdll`/CNG symbols, failed or short queries, zero GUIDs, hash failure and
  integer overflow fail closed as clock unavailable. Dart rejects unknown
  sources, malformed IDs/types, boot substitution and monotonic regression.
- Focused clock tests are **5/5 PASS** and targeted analyzer is **PASS** using
  Flutter `3.47.8`, PUB cache `/workspace/.pub-cache`, and pinned LLVM at
  `/workspace/.toolchains/llvm-21.1.8-local/usr/lib/llvm-21/bin`. Native CI
  contracts are **22/22 PASS** with verifier **PASS**; QA isolation contracts
  are **24/24 PASS** with strict verifier **PASS**; formatting and diff checks
  are **PASS**. An initial fresh-worktree test attempt without pinned LLVM
  stopped during native-asset toolchain setup and is not product evidence.
  Independent security review **ACCEPTS** the exact final diff.
- **HELD / NOT RUN:** impact is high because this clock participates in
  offline authority, while regression protection remains partial until exact
  MSVC compilation, supported-Windows same-boot restart, real reboot boot-ID
  change and installed-device behavior run. Identity, command signing and TLS
  remain `NotImplemented`; coordinator host registration stays false and every
  shipping profile keeps connected operation disabled. No publication, merge,
  deployment, signing, installation or production enablement occurred.

## 2026-11-02 exact-head `108f9700` Native pass and pilot artifact boundary

- **PUBLIC DRAFT HEAD / NATIVE PASS:** the specifically authorized non-force
  fast-forward advanced draft PR #752 from
  `553927848f6b2ac0760e292a545d989da75da6f6` to
  `108f97004cc119210736b9780aa7ac8ed4c71533` (tree
  `6567d8bdbd05e7d4f2afc3a1745a3b49644a6e2d`). Automatic Native run
  `41454966155` is **PASS across all six jobs**. The full Android job proves
  the complete serial Flutter shards, all 14 real process-interruption
  scenarios, analysis, 43/43 synthetic captures, release-signing rejection,
  debug APK build, checksum and retention. Windows PC recovery plus unsigned
  packaging, isolated Android/Windows/iOS QA, and iPad/iOS jobs also **PASS**.
- **QA ARTIFACTS ARE NOT PILOT INSTALLATION EVIDENCE:** provider metadata
  binds Android debug artifact `13153110192`, gallery artifact `13150936977`
  and unsigned Windows artifact `13148320285` to exact head `108f9700`.
  Their archive names use the provider synthetic-merge identity
  `a69fa6dc4c8ac5c0de6727f6f5c57ab9a330377b`; that identity must not replace
  the recorded PR head. BD is independently processing the gallery archive.
  Production signing, artifact-content review, installation, force-stop,
  fresh-target restore, physical hardware and merchant acceptance remain
  **NOT RUN**.
- **REMAINING EXACT-HEAD GATES:** Kernel run `41454966713` is **PASS**. App
  run `41454958319` is **FAIL** in `Build and verify canonical app`; the exact
  log payload could not be re-read because the provider log redirect returned
  HTTP 403. This three-file Native-only successor does not change the known
  fail-closed PostgreSQL rehearsal path. Dependency run `41454966124` is
  **FAIL/BLOCKED** in the app and Kernel audits while platform, Python and
  added-line credential scans **PASS**; no dependency files changed in this
  successor. GitGuardian remains **FAIL/BLOCKED** on the two historical
  findings. No merge, deployment, signing or production enablement occurred.

## 2026-11-02 exact-head `34f14439` CI and process-interruption repair

- **PUBLIC DRAFT HEAD / CONNECTED SHARD PASS:** the specifically authorized
  non-force update advanced draft PR #752 from
  `680a237ddc93fb59ae69d399d76ab7097d3fac24` to
  `34f14439118d40593d364e5db5fadf7f588e8a42` (tree
  `d976275781486f9bb2bfd7a0d331078ece0e6fd0`). Exact-head Native run
  `41428571872` proves the complete serial Flutter shard suite, including the
  repaired 285-test connected shard, passed in 56m55s. Windows PC recovery and
  unsigned packaging, isolated Android/Windows/iOS QA, and iPad/iOS jobs all
  **PASS**. The full Android job then failed only because the separate real
  process-interruption harness hit its outer 180-second timeout; analysis,
  capture and Android debug packaging were **NOT RUN**. Missing gallery files
  are downstream noise, not independent evidence.
- **PRIVATE TIMEOUT-ENVELOPE REPAIR / HOSTED NOT RUN:** implementation
  `a74becbb6f0f98693488885ec44a129fabad912b` (tree
  `bc687cadf98b4a92d551251775ae407f309e3a91`) retains all 14 real OS
  kill/reopen scenarios, their order, process-group/descendant `SIGKILL`,
  negative signal-result assertion, database reopen, and rollback/commit
  verification. Internal 90-second marker and 120-second verification limits
  are unchanged. It adds flushed per-scenario start/pass timing and changes
  only the outer harness envelope from 180 to 300 seconds. The unchanged local
  harness is **14/14 PASS** in 166 seconds; the patched exact harness is
  **14/14 PASS** in 163 seconds with each scenario attributable at about
  11--13 seconds. Native CI contract **21/21 PASS** with verifier **PASS**;
  QA isolation **33/33 PASS** and audit strict-ready; Python compile and diff
  checks **PASS**. Independent review **ACCEPTS** the 300-second cap as bounded
  and evidence-based. Exact hosted validation is **NOT RUN** and no new push,
  merge, deployment, signing or manual dispatch occurred.
- **OTHER EXACT-HEAD CHECKS:** Kernel run `41428572078` **PASS**. App run
  `41428561578` passed checks 1--637 and failed at HQ 1/37 with
  `database_rehearsal_evidence_stale`, `secretValuesExposed:false`.
  Dependency run `41428571740` remains **FAIL/BLOCKED** only on the known app
  and Kernel minimatch paths; platform, Python and added-line credential scans
  **PASS**. GitGuardian remains **FAIL/BLOCKED** on the historical findings.

## 2026-11-02 exact-head `680a237d` connected-proof fixture repair

- **PUBLIC DRAFT HEAD / NO PROMOTION:** draft PR #752 is at
  `680a237ddc93fb59ae69d399d76ab7097d3fac24` (tree
  `aa19184e698ebfb0961025cccccc68466e55b792`). Automatic Native run
  `41418763937` is terminal **FAIL**: Windows PC, isolated Windows QA,
  isolated Android QA, isolated iOS QA and iPad/iOS jobs **PASS**; the full
  Android job failed in the connected persistence shard before analysis,
  capture and APK packaging. No Android artifact exists for this head.
- **ROOT CAUSE / PRODUCTION VERIFIER PRESERVED:** seven connected stock tests
  failed with `FormatException: connected_site_cloud_proof_binding`. Their
  synthetic command helper signed internal event names as `SiteCommandV1`
  command types. The production adapter already emits the required semantic
  `retail.stock.reserve.v1`, `cafe.stock.reserve.v1`,
  `retail.stock.release.v1` and `cafe.stock.release.v1` types; the hardened v2
  coordinator-derived proof correctly rejected the stale fixtures.
- **PRIVATE REPAIR PASS / HOSTED NOT RUN:** implementation
  `339313e97b8aa77b7cfba6696e46a224d181b6e2` (tree
  `98cb7f7f3735b36130add035577cce9ef4437b3c`) changes only
  `shop_connected_site_persistence_test.dart` so reserve/release fixtures use
  the production semantic command vocabulary. Production adapter, proof
  generator and strict v2 verifier bytes are unchanged. The complete focused
  persistence file is **18/18 PASS**. The exact 19-file hosted connected shard
  is **285/285 PASS** in 505 seconds under its 600-second bound. Targeted
  analyzer **PASS**; Native CI contract **21/21 PASS** with verifier **PASS**;
  QA isolation **33/33 PASS** and audit strict-ready; diff check **PASS**.
  Independent security review **ACCEPTS** the repair and confirms the
  unsupported-domain fallback remains fail-closed. Exact hosted CI is **NOT
  RUN** and no publication, merge, deployment, signing, manual dispatch or
  production enablement occurred.
- **OTHER EXACT-HEAD GATES:** App run `41418756028` is **FAIL/BLOCKED** at HQ
  1/37 with `database_rehearsal_evidence_stale` and
  `secretValuesExposed:false`; Kernel run `41418764007` is **PASS**;
  Dependency run `41418763971` remains **FAIL/BLOCKED** on the unsuppressed
  minimatch advisory; GitGuardian remains **FAIL/BLOCKED** on two historical
  findings. Production signing, installed recovery, physical hardware,
  merchant acceptance and joint go/no-go remain **NOT RUN/BLOCKED**.

## 2026-11-02 exact-head `770e217a` CI and private shard-budget repair

- **PUBLIC DRAFT HEAD / NO PROMOTION:** the specifically authorized non-force
  update advanced draft PR #752 from `ae456914c43eb1b33dfd25f98dabbf532625a103`
  to `770e217ae010f297341730bf2cc87ae5f26d29a8` (tree
  `c37910789f95cec8e3df8d2e72bdbe700ad4180f`). Remote readback and the PR head
  both converged on that exact SHA. No force push, merge, deployment, signing,
  production enablement or manual workflow dispatch occurred.
- **NATIVE CI FAIL / FORMAT FIX PROVED / AGGREGATE BUDGET DEFECT:** automatic
  run `41409460353` passed Windows PC, iPad/iOS, and isolated Android, iOS and
  Windows synthetic-QA jobs. The full Android job passed formatting and then
  reached the 2,400-second aggregate test ceiling with no preceding assertion
  failure. Hosted measurements were behavior core 448 seconds / 212 tests,
  shell 346 / 74, checkout 431 / 80, backup 430 / 101, persistence A 334 / 68,
  for **535 completed passing tests** across those five shards. Persistence B
  then ran about 394 seconds and showed **66 additional passing tests** before
  its dynamically shortened timeout; those observations do not make the
  incomplete shard a terminal pass. SQLite-full recovery and all connected,
  connected-successor and trusted-time shards were **NOT RUN**. The missing
  render archive is downstream noise; Android analysis, process-interruption
  proof, production-profile build and debug APK are **NOT RUN**.
- **PRIVATE SOURCE REPAIR / HOSTED NOT RUN:** implementation
  `75ffea78f9323d8960f7ed2d97ae1e89e45d766d` (tree
  `a0fba0dc2ef9d6231ee32f879ff3061de24b1eeb`) preserves all 68/68 exact-once
  test assignments and strict serial ordering; it does **not** introduce
  parallel jobs. Each of the nine shards retains its 600-second ceiling; the
  serial aggregate is now the coherent 9 x 600 = 5,400 seconds (90 minutes)
  and the Android job is bounded at 120 minutes. The nominal 30-minute
  difference is only gross headroom for setup, formatting, interruption tests,
  analysis, capture and packaging; it is not guaranteed remaining build time.
  Every shard classifies timeout status 124 first, any other nonzero status
  second with its exact diagnostic, and elapsed `>=` budget only after a zero
  process status.
  Production identity and packaging remain after every shard passes. Native CI
  contracts are **21/21 PASS**, verifier **PASS**, QA isolation command is
  **33/33 PASS** with audit **PASS/strict-ready**, diff check and shell syntax
  are **PASS**, and independent review **ACCEPTS** the fail-closed repair.
  Exact hosted validation is **NOT RUN** and requires a separately guarded
  publication decision. Standard hosted compute for this public repository is
  expected to remain in GitHub's public-repository free class, but account
  policy, future billing treatment and artifact/cache storage charges were not
  independently verified; the longer ceiling can increase consumed runner
  minutes even when no direct compute charge is applied.
- **OTHER EXACT-HEAD RESULTS:** App run `41409457577` passed steps 1--637 and
  failed at step 638 / HQ 1 of 37 with
  `database_rehearsal_evidence_stale`, `secretValuesExposed:false`.
  Dependency run `41409460330` remains **FAIL** on the minimatch advisory;
  Kernel run `41409460367` is **PASS**. GitGuardian remains a separate failed
  provider check with two historical findings requiring supported owner
  disposition. None of these gates is waived by the Native workflow repair.

## 2026-11-02 exact-head hosted CI and private formatter successor

- **PUBLIC EXACT HEAD / DRAFT ONLY:** the specifically authorized non-force
  update advanced draft PR #752 to ledger
  `ae456914c43eb1b33dfd25f98dabbf532625a103` (tree
  `be3f741aa42f4d25495251e96e9f33e435948a15`). No force push, merge,
  deployment, signing, production enablement or manual workflow dispatch
  occurred.
- **NATIVE CI PARTIAL PASS / ANDROID FAIL:** automatic run `41400100819`
  completed **FAIL**. Windows PC, iPad/iOS, and isolated Android, iOS and
  Windows synthetic-QA jobs all **PASS**. The production-profile Android job
  stopped before analysis, tests and APK packaging at changed-Dart formatting:
  Dart 3.47.8 changed exactly one line wrap in
  `shop_connected_site_reconciliation.dart`; the missing rendered-artifact
  upload was downstream noise. Private successor
  `7681baf2d6085c0bebeba05c648ba1ab3dde684f` (tree
  `65d7192bf078d142babf2a3fc986e4259bda72a0`) contains only that formatter
  output. Its Native CI contract is **21/21 PASS**, verifier **PASS**, QA
  isolation contracts are **33/33 PASS**, audit is **PASS/strict-ready**, and
  `git diff --check` is **PASS**. Independent review **ACCEPTS** the change as
  byte-identical to the hosted formatter hunk and semantically inert. Exact
  hosted Android analysis/tests/APK for this successor are **NOT RUN**; the
  successor is not published without a new exact guarded authorization.
- **APP CI FAIL / EXPECTED EVIDENCE GATE:** run `41400097120` passed steps
  1--637 and failed at step 638, the first `hq:verify` check,
  `node tools/record_postgres17_rehearsal.mjs --verify`, with
  `database_rehearsal_evidence_stale` and `secretValuesExposed:false`.
  Downstream App checks are **NOT RUN**. This is not an implementation PASS;
  a genuine exact-source PostgreSQL 17 rehearsal remains required.
- **DEPENDENCY SECURITY FAIL / UPSTREAM-BLOCKED:** run `41400100785` failed
  app and kernel audits on `GHSA-g3hv-75wg-m249`, minimatch `<11.0.1`, in the
  ESLint/tooling chains. Platform audit, Python audit and added-line credential
  scan **PASS**. Forced downgrades, blanket minimatch overrides and suppression
  remain prohibited because current consumers do not share a compatible API
  and supported semver range.
- **OTHER EXACT-HEAD CHECKS:** Kernel run `41400100790` **PASS**. GitGuardian
  remains **FAIL** with two historical findings; neither is disposed or
  reproduced here. Production signing, installed recovery, physical hardware,
  merchant acceptance and the joint go/no-go remain **NOT RUN/BLOCKED**.

## 2026-11-02 private release-candidate preflight

- **SOURCE/WORKFLOW PASS; PUBLICATION NOT AUTHORIZED:** the frozen implementation
  candidate is `56be3de0da96c46fb51b030757ec4e4d5b11f11b` (tree
  `131b062d4549a90b6ed8f0ac02ee82216e8f4177`, native tree
  `715110af0040010b05f308b4b82213f2d83f7f3a`, native `lib/` tree
  `1d01e5fbd4733f3df6dbb91b5cf7b2d13a01f676`, parent
  `0004c02bbc507e195f2adc0da06ebb046cd96d47`, patch SHA-256
  `6969a58b8537ea4b3720303eccbe56fe86ca22b2ca6e965dec3b0cc57dc61470`).
  PR #752 remains open/draft at public head
  `584b713554120ae4833ddd0d6517b759854f469d`; the private candidate is a
  strict descendant and no remote update was made.
- The candidate delta from that public head is deliberately large: 75 linear
  commits implementing the reviewed default-off connected/LAN/trusted-time
  chain, schema through v39, historical-fixture repairs, and its source
  evidence. It must be reviewed as a complete integration successor, not as a
  small CI-only patch. Older `584b7135` QA artifacts are **STALE** for this
  source and must not be relabelled.
- The preflight first found 15 new Flutter tests missing from Native CI. The
  accepted correction now binds the deterministic **68/68** inventory, assigns
  67 tests exactly once to bounded serial shards, retains the process
  interruption test in its separate bounded harness, and format-gates all 66
  changed Dart files. Native contract tests are **21/21 PASS**, its verifier is
  **PASS**, QA-isolation contracts are **24/24 PASS**, strict isolation is
  **PASS**, YAML and Android shell syntax are **PASS**, and `git diff --check`
  is **PASS**. Independent adversarial review is **ACCEPT**.
- Complete-diff security review found and closed one release-blocking cloud
  authorization gap: a retained signed command could previously be paired with
  unrelated coordinator-derived stock bytes. The v2 derivation now binds the
  exact signed reserve command and canonical reservation (identity, subject,
  lines, basket, workflow, actor, device, scope and capability) to the terminal
  transition; the security-insufficient v1 derivation fails closed. Python
  runtime and cloud tests are **24/24 PASS**, Native CI contracts remain **21/21
  PASS**, and independent adversarial re-review is **ACCEPT**. `operationId` is
  explicitly coordinator-authored audit metadata and cannot select different
  stock; retained native database/backup checks bind it to transition or sale
  evidence.
- **NOT RUN / BLOCKED:** the two new hosted shard runtimes, exact-source Android
  and Windows builds, signing, installation, device recovery and merchant
  acceptance are not proved until an exact guarded PR update and its automatic
  CI are separately authorized and complete. Durable `/workspace` free space
  was only `309104640` bytes at the latest read-only measurement, below the
  retained 384 MiB reserve; no local build or cleanup was attempted.
- Existing independent release gates remain red: App CI stops at the stale
  PostgreSQL 17 rehearsal receipt; dependency audits retain the unresolved
  minimatch advisory; GitGuardian retains two historical findings requiring
  owner disposition; protected key custody, production signing, installed
  recovery, physical hardware and merchant evidence are not complete.

## 2026-11-02 exact-head release checkpoint

### Private schema-v39 trusted-time client-head persistence

- **SOURCE PASS / DEFAULT-OFF / RESTORE-QUARANTINED:** implementation
  `c7edd0a0e0f0e238a98625c04bdc76f7d795a6f2` (repository tree
  `e4eb42d3ad76a520e4e85dfc191e0bdce0bd90b1`, native tree
  `722ed7af093491a6030d0a46095516479c6f7422`, native `lib/` tree
  `bd55b56bef2cab8a6175718a5a7aa8bb2bcb32c1`, binary patch SHA-256
  `ad05c6e64e69d972fe0d4a733302049ef3387bc0bb08a3ab91a288626423ab1f`)
  adds immutable accepted-entry, acknowledgement and client-head evidence,
  plus append-only restore barriers and clearances.
- Entry, ACK and resulting head persist atomically with exact scope,
  sequence/predecessor and digest closure. Replay is idempotent only for
  identical bytes; gaps, substitution, concurrency races and outer
  transaction rollback fail closed. Fresh-target restore preserves audit
  evidence but makes every stream unusable until injected authority and
  device-ACK verifiers, current binding resolution, platform clock and a
  separately approved restoration policy all revalidate the exact head.
  Clearance is audit-only and always records `timeGranted=false`; restored or
  expired evidence can never recreate live time.
- Focused client-store tests are **7/7 PASS**; the migration/issuer/store/export
  matrix is **26/26 PASS**; pending-cash regression is **14/14 PASS**; a final
  combined client-store/pending-cash rerun is **21/21 PASS** in 1m58s.
  Analyzer and diff checks are **PASS**. Independent security review is
  **ACCEPT** after closing ACK-entry permutation, restored-time grant and v39
  fixture/assertion findings. Schema/store/test SHA-256 identities are
  `a1148cd4785d6b96726423f6a29c7a20371cb7e065d83f5172937d0359347b3c`,
  `5b456aba8c34138c77a1bd67dcdacae2075ccc4dd97802dbc8e324b198f22a12`
  and `7eb998d861cc7c0784f5b3275209454abb4d5f4d901e8d95cc890060c1bb59ba`.
- **BLOCKED / NOT RUN:** there is no production restoration-policy authority,
  protected issuer/device key custody, platform clock bootstrap, endpoint
  composition, platform compilation or installed-device evidence. Connected
  mode remains off and no restored evidence grants time automatically.

### Private default-off trusted-time client stream acceptance

- **SOURCE PASS / DEFAULT-OFF / VOLATILE:** implementation
  `ebdf92515c5b1678df25709de4becef241dbc978` (repository tree
  `760abc3981b461e965dfff0f234773d8ed3a15ba`, native tree
  `ab5dc10c18e9baea6359c5f69e05be93f07875dd`, native `lib/` tree
  `1652c115158fed77d07b070f6ed6283350b64894`, binary patch SHA-256
  `0488c37caef0dcd5d3bf9c2da318234a96c35bb5b03fddc5062f10b3480f8fc8`)
  adds an injected client boundary for one authority-signed stream entry and
  its exact device-signed acknowledgement.
- Acceptance binds the complete stream scope, authority key/epoch, exact
  sequence and predecessor, boot session and monotonic progress. Continuity
  advances the immutable head but grants no time; time entries reject
  rollback; identical replay preserves the original acknowledgement and
  rechecks boot/monotonic state. Authority and device custody are injected and
  signer identity is checked before and after asynchronous signing.
- Combined acceptance/stream tests are **14/14 PASS**; targeted analyzer and
  diff checks are **PASS**. Independent adversarial review first returned
  **HOLD** for signer-identity substitution and stale replay, then **ACCEPT**
  after both were fixed and retested. Source/test SHA-256 identities are
  `e97b33ba698440934867e3e15c5d9aa8703982bb8b29b40be2bab2d56adeccc8`
  and `23c26807c6a55193b9e972b1d26c6b143060af7e4034cd99a0c4730ad7e284ea`.
- **BLOCKED / NOT RUN:** accepted state is intentionally volatile. No durable
  client head restoration, endpoint transport, production composition, real
  key custody, protected clock, compilation or installed-device evidence
  exists. Restart cannot resume past sequence one. Connected mode stays off.

### Schema-v38 historical fixture closure

- **TEST PASS:** fixture-only commit
  `827ee9b45afc14e644f0b505d44f90a69f59c819` (tree
  `429ee08595afbca36c65a716348052edb83cf1aa`, binary patch SHA-256
  `cbf929501f1e290e276c331b883f15ad99cd25ee844f3ba1d50b7e3f39ee19a4`)
  advances current-schema assertions to v38 and removes v38 issuer objects
  from fabricated older schemas before migration. Current-schema tamper tests
  now verify against v38 instead of passing from a version mismatch.
- Foundation/export are **82/82 PASS**; member identity is **19/19 PASS**;
  targeted historical migrations are **14/14 PASS**; cash v17 is **1/1
  PASS**; six reconciliation/backup tamper cases are **6/6 PASS**; analyzer
  and diff checks are **PASS**. Independent review is **ACCEPT**. Production
  migrations and fail-closed verifiers were not weakened.

### Private schema-v38 trusted-time issuer persistence

- **SOURCE PASS / DEFAULT-OFF / PERSISTENCE-ONLY:** implementation
  `8be2636c8de1b36c3c6ce37771894a1a747982de` (repository tree
  `324b00d944fcdc03fb2f803c0005f56022ac310a`, native tree
  `a640f279b2744dbb72bdd64e60c72bcfab5081ca`, native `lib/` tree
  `ac0e376974f2b6bc9cd0390e888963016fce28b3`, binary patch SHA-256
  `5f5b0bffbd574cef313fb346e3330f954d905cec14fca5793e235dadfd32fa60`)
  adds schema-v38 durable per-client issuer streams, allocation, signature,
  replay, acknowledgement, exact head advancement, immutable evidence and
  fresh-target restore suspension.
- Issuance is explicitly disabled unless injected by a reviewed caller. Exact
  canonical unsigned entries are parsed before allocation; same-stream
  allocation is transactional and retains at most one pending entry; restart
  and lost-response replay return the same signed bytes; acknowledgement must
  match the complete signed entry scope and advances only the exact next head.
  Backup verification reconstructs the allocation/signature/ack chain and
  fails closed on gaps, substitution, malformed canonical bytes or partial
  closure. A v37 upgrade creates no synthetic streams.
- Targeted analyzer is **PASS**. Focused issuer tests are **8/8 PASS** and
  existing stream tests are **5/5 PASS**. The combined issuer, stream and full
  backup/restore regression is **114/114 PASS** in 6m14s; diff checks are
  **PASS**. Independent adversarial review returned two **HOLD** rounds for
  global restore suspension, chain closure, unsigned parsing, transition
  guards and missing concurrency/restart cases, then **ACCEPT** after the
  corrections and negative tests. The issuer store and its tests have SHA-256
  `9bc20db71fed2c9a383a6c6e9613750c17a5268addccde42a875e8068f685ccd`
  and `fcc93fe3a7a2bdb5926583ac1ee9e40d3cf265241e1012ce6089b82a5604f8f7`.
- **BLOCKED / NOT RUN:** this is not a protected issuer runtime. No approved
  wall-clock bootstrap, production signer/key custody, client stream-head
  acceptance transport, restore-recovery authority, platform compilation or
  installed-device evidence exists. Restored issuer state stays suspended and
  there is intentionally no recovery-approval API. Connected mode remains off.

### Private trusted-time per-client stream prerequisite

- **SOURCE PASS / CONTRACT-ONLY / UNMOUNTED:** implementation
  `17774b345850aa5037a83698c0862839b71be3c1` (repository tree
  `7f0e0bdceb9622c716539b75ad83b9a816c1b67d`, native tree
  `317ce6c0afd695adb1cdcd99246cbf224c2b973c`, native `lib/` tree
  `4dadc4d7298b271691fb75fd441c652a5111ed81`, binary patch SHA-256
  `1a5f97b3374517cc4a50d14e8fa7420f49dcb731b1f1ba73fd5b46080d055342`)
  defines challenge-independent authority-signed entries and device-signed
  acknowledgements for exact per-client trusted-time streams.
- Entries bind full client/session/coordinator-binding scope, authority key
  identity/generation, epoch, per-client sequence, predecessor digest and
  bounded time. Continuity entries can preserve an immutable no-gap chain but
  cannot grant live time. Acknowledgements bind the exact resulting entry
  head, client signing identity, boot session and monotonic receipt.
- Exact canonical schemas enforce 8 KiB limits, deterministic domain-separated
  digests and canonical 64-byte Ed25519 encodings. Sequence/predecessor,
  independent-stream, substitution, malformed/noncanonical and altered-ack
  cases fail closed. Targeted analyzer is **PASS**; focused tests are **5/5
  PASS**; diff checks are **PASS**. Independent review first returned **HOLD**
  for regex-valid but noncanonical base64url signatures, then **ACCEPT** after
  decode/length/re-encode validation and negative tests. Reviewed file SHA-256
  identities are `f5ec7a0f43ca0b8a44e66d9afa46d24ab8d49997c1fcbf8a644635da15bfe80c`
  for the contract and
  `923b3c9cada8dd9c9e5f83fec3cbe2fa07426688439abf3a66a32c22d5059c51`
  for its tests.
- **BLOCKED / NOT RUN:** no issuer persistence, sequence allocator, client
  stream-head acceptance, acknowledgement transport, protected clock/signer,
  restore recovery or runtime mount exists. The contracts are not
  self-authenticating without injected verification, and authority issuance
  remains unavailable/default-off.

### Private trusted-time client-head prerequisite

- **SOURCE PASS / EVIDENCE-ONLY / UNMOUNTED:** implementation
  `d11a0fea380d622ca5db4ba6e5f1dea2c0c0b1ec` (repository tree
  `d0d3edd74e51348057df62d96d36daf76ce50c41`, native tree
  `fe6e3167327ab8564088cb74acadc1f5ea1360c0`, native `lib/` tree
  `0d603630ce789df0d2a519ff36cc65772c2c6630`, binary patch SHA-256
  `bfd45e8e7dc41f4ebcace441a6515b4776bcee2e898e6d1232876a380f8a1f6b`)
  defines canonical identity for the last trusted-time observation accepted by
  one exact client stream.
- The head binds workspace/site/coordinator, client device/fingerprint,
  session and coordinator-binding generations, authority key identity and
  generation, epoch/sequence, request/observation/acceptance digests,
  observed/effective/valid times, current boot and monotonic acceptance. Its
  domain-separated digest is self-consistency evidence only, not a signature
  or authority grant. Absence is represented by no object; no self-authored
  genesis head exists.
- Exact-schema canonical UTF-8/JSON parsing enforces an 8 KiB limit and rejects
  missing/extra/wrongly typed, substituted, malformed, noncanonical and
  oversized input. Targeted analyzer is **PASS**; focused tests are **4/4
  PASS**; diff checks are **PASS**; independent review is **ACCEPT**. Reviewed
  file SHA-256 identities are
  `27168505f8dd693d509972b84b4f8e9495bd8e08e3068994c94d0b1c5d0ce7a8`
  for the contract and
  `91131055d40d0332fa47ee872d53222047e42bc48bc62cfd721a190ee3e147b2`
  for its tests.
- **BLOCKED / NOT RUN:** no durable per-client issuer stream, acknowledgement
  transport, sequence allocator, approval registry, trusted issuance clock or
  protected authority signer exists. The current issuer cannot safely allocate
  the next tuple across lost replies/restart/concurrency, so authority issuance
  remains unavailable and connected mode stays off.

### Private trusted-time v2 in-process integration evidence

- **SOURCE TEST PASS / NO LIVE NETWORK:** test-only commit
  `46489ccb70d9afaca3796f525fe44e4c585f4dab` (repository tree
  `04df22da3186f82b7296a9c83546c2628db507fa`, native tree
  `deebd9cf49dede619d9cc293c67444d9ef3fc1d1`, binary patch SHA-256
  `e2b295cc944ca27edb6b64cf070ea9a68c38213a365bfdc13a5eac3353b74953`)
  adds an in-process client-to-server v2 trusted-time integration regression.
- The test uses the real `SiteCoordinatorClient`, exchange adapter,
  `SiteCoordinatorServer.dispatch`, Ed25519 request signer/authenticator,
  approved client enrollment, atomic request-nonce consumption and injected
  deterministic authority. It proves exact canonical request/response and
  challenge binding, rejects an outer-nonce replay with 403 without re-entering
  authority, and accepts a fresh outer nonce with a fresh trusted-time
  challenge.
- Targeted analyzer is **PASS**; focused loopback is **1/1 PASS**; combined
  authority, client, facade and coordinator matrix is **59/59 PASS**; diff
  checks are **PASS**; independent review is **ACCEPT**. The final test file
  SHA-256 is
  `696556a71e13c71fe57e1696847e7f1d9a7aba7f99a1b306a39db1b264d5590f`.
- **NOT RUN / BLOCKED:** the bridge opens no socket and is not installed-device
  evidence. No listener, live network, production key/credential, runtime
  mount, Windows clock or protected authority ran. Connected mode and v2 stay
  default-off.

### Private default-off trusted-time v2 client successor

- **SOURCE PASS / DEFAULT-OFF / UNMOUNTED:** implementation
  `20b8d1c861d3f384640b38393ccbf242ebe1746c` (repository tree
  `ae96686e934acde929d099d76ecf63dc2ba69058`, native tree
  `c9dbf2c01fd25c472cc941a541ca386f3ddd6f9a`, native `lib/` tree
  `ee8f9cfd0619d29ced49d9ee32a292b2cbeeebf1`, binary patch SHA-256
  `ab2ff842766e2999e903e70d4493ecbe73c1cabb0db8718b5dd58788ddbfa0f3`)
  adds the default-off client exchange for one retained trusted-time challenge.
- Before transmission, the client resolves one retained approved binding and
  binds workspace/site/coordinator, client device/fingerprint, current session
  generation, exact binding digest and approval generation. That same binding
  supplies the exact v2 endpoint and pinned TLS certificate, avoiding a second
  resolution race.
- The client sends canonical v2 bytes only to `POST /v2/trusted-time` with a
  v2 proof. Only approval digest and challenge cross the LAN. Responses require
  successful JSON within 16 KiB, exact canonical response, echoed request
  digest and original challenge. Ambiguous/lost POST errors propagate after
  exactly one send; the facade abandons that capability and a future refresh
  must create a new challenge.
- Targeted analyzer is **PASS**; client, authority and facade suites are
  **26/26 PASS**; diff checks are **PASS**; independent review is **ACCEPT**.
  Reviewed file SHA-256 identities are
  `7acd520703393c988d68492353c2967cc22b0e258b54b2226e9442337a9508d5`
  for the client,
  `79e4890f5db2fc0ec9360f8d3db8388060862c4c9fdf11bbdd9e11c973e57306`
  for the exchange adapter and
  `62d3805c7e6ac4fa8185dc75262c825e855c04992f55b28b225f9bceb30494db`
  for client tests.
- **BLOCKED / NOT RUN:** the client and server are not mounted into shipping
  composition and no live network ran. Protected coordinator authority,
  signing-key custody, clock bootstrap, Windows trusted clock, compilation and
  installed-device evidence remain absent. V2 and connected mode stay off.

### Private default-off trusted-time v2 route successor

- **SOURCE PASS / DEFAULT-OFF / UNMOUNTED:** implementation
  `477136d40ee79f93b74b8681b749213af961ff56` (repository tree
  `00686a2320cb725cf49c5673ca6e24d9f62fe07e`, native tree
  `7b2230c9ed92624499617dec57e47d9321af797f`, native `lib/` tree
  `64b5365fd0ff5424ef9e1af6fb3276d8e480690e`, binary patch SHA-256
  `0f0fbff3843885391b60dea2448723a07871c5a5eae7fd2cbf5c71f1658fe8ac`)
  adds an independently gated `POST /v2/trusted-time` dispatcher and explicit
  proof-version routing while preserving all v1 routes and signing bytes.
- V2 is disabled by default and returns 404 before accessing authority or
  authentication dependencies. When explicitly constructed for tests, it
  reuses signature verification, atomic request-nonce consumption and approved
  enrollment; requires protocol v2 only on the exact v2 POST target; parses
  canonical requests within 16 KiB; binds coordinator, workspace/site,
  device/fingerprint and exact returned challenge; and emits canonical JSON
  with `no-store` and `nosniff`. It does not invoke staff command capability
  authorization.
- Targeted analyzer is **PASS**; trusted-time authority and complete
  coordinator suites are **39/39 PASS**; diff checks are **PASS**; independent
  security review is **ACCEPT**. Tests include an explicit byte-level v1 proof
  golden, disabled dependency silence, wrong proof/target, replay, malformed
  and scope-substituted requests, unavailable authority and substituted
  observation. Reviewed file SHA-256 identities are
  `e672073e628df2d750d5498011a5d09763f3d3bf8197db804f99c0d721b2fb58`
  for the coordinator and
  `a1ce0f1e367d09f0c72c860cc3a0fa629574edd839ac1990c5e198ce138802e1`
  for its tests.
- **BLOCKED / NOT RUN:** no listener/runtime composition or client exchange is
  mounted; the injected authority remains unavailable without separately
  reviewed approval resolution and protected signing custody. Wall-clock
  bootstrap, Windows trusted clock, compilation and installed-device evidence
  remain absent. Connected mode and v2 remain default-off.

### Private trusted-time v2 wire-contract successor

- **SOURCE PASS / DEFAULT-OFF / UNMOUNTED:** implementation
  `7bd3e653570434b5787236be04db031a25280498` (repository tree
  `4b297d095aea1192e9dacb6bfd1f17bd9e1bab1a`, native tree
  `034d6aba1712c4138fdbe698e94c1ba884ffdb26`, native `lib/` tree
  `119a229eedd182e4240dbac04aa32f53160322fb`, binary patch SHA-256
  `99bbd9e4f9a931831c9d5b2687ba6d80fb84ff5a0651bd8d33604b33513840d0`)
  adds strict v2 wire request/response envelopes around the reviewed v1
  trusted-time authority request without changing any v1 contract or route.
- The v2 request digest binds its schema/version and complete v1 request. The
  v2 response must echo that exact digest and contain an observation parsed
  against the exact original challenge. Both exact four-field schemas enforce
  canonical UTF-8/JSON and a 16 KiB semantic limit before parsing; malformed,
  alternate, oversized, missing/extra, wrong-version and substituted values
  fail closed.
- Targeted analyzer is **PASS**; focused tests are **7/7 PASS**; diff checks
  are **PASS**; independent review is **ACCEPT**. Reviewed file SHA-256
  identities are `95dbb078e5ce43197938490a419b421450c130d4ca5c81b9d0db101c8b70736a`
  for the authority/wire contract and
  `d1225c958aa1ccfd05af4e4f2d5fc4a0c823968715892b12f7ab94a03cbf5c82`
  for its tests.
- **BLOCKED / NOT RUN:** no `/v2/trusted-time` endpoint, proof-version router,
  protected authority, signer/key custody, clock bootstrap, runtime mount,
  Windows clock or installed-device evidence exists. Frozen v1 endpoints and
  signing bytes remain unchanged; connected mode remains default-off.

### Private coordinator-binding session-generation successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `38e8bf5ea49dd7544461432cc78cba0dd5379853` (repository tree
  `9ec99824f82a6f41517313f8236b2f67b4692fc3`, native tree
  `30e93f769d3d1a8280a88928bbbb29e8de0e4fc5`, native `lib/` tree
  `8116b994d01e61412951a7d3411649d62571194f`, binary patch SHA-256
  `896df7ebd6f5ccff37390c38a7e1401c2701ce566a42696d24e697239668589f`)
  exposes the exact retained enrollment session generation through an approved
  coordinator binding and closes stale-session binding resolution.
- The binding query selects the session only from the exact enrollment
  evidence digest retained by the signed coordinator approval. It now also
  requires the device's current session generation to equal that evidence
  generation and the device to remain active. Advancing the device session
  without matching retained enrollment evidence therefore fails closed.
- Existing exact binding, latest approval/revocation, active enrollment,
  workspace/site/device/fingerprint/signing-key, expiry, authority-signature
  and approval-generation checks remain intact. No schema or migration changed.
- Targeted analyzer is **PASS**; attempt-store, reservation-session, client and
  platform-signer tests are **36/36 PASS**; diff checks are **PASS**;
  independent review is **ACCEPT**. Reviewed primary file SHA-256 identities
  are `83dadffd0496d96b06e7288181741fe2c0d199435b861d0f98060d929eb47e2d`
  for the store and
  `ac6d3be63e77b0bd97aa34afc826dd9595fe5401f44e3e3e1ebf406ac7cd8536`
  for its real-store tests.
- **BLOCKED / NOT RUN:** session generation is now available to future
  trusted-time authorization, but no trusted-time endpoint, issuer, protected
  signing custody, observation transport, runtime mount or installed-device
  evidence exists. Connected mode remains default-off.

### Private coordinator-binding approval-generation successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `b2f5ae871d2b1a218c7e612ab38b21dc71dadc74` (repository tree
  `414501c2deb75ef2245b98d0f07f6e555ef3509d`, native tree
  `ca7a0f748b80a4e2f0a7af4065ed7c9aa653644a`, native `lib/` tree
  `31c4f369b0c5a7567135904e8fcaa1557d3073e2`, binary patch SHA-256
  `8afa691572f3a3f611333721c20a02e59abe95fdf0b6c454fc95951d5c9dd76e`)
  exposes the retained signed coordinator approval generation through the
  resolved approved-binding object.
- No schema change was needed: `approval_generation` was already stored and
  covered by the canonical signed approval/binding digest. Binding resolution
  continues to require the exact workspace/site/device/fingerprint/signing
  key, latest non-revoked generation, active enrollment, expiry and verified
  authority signature before returning that generation.
- Targeted analyzer is **PASS**; attempt-store, reservation-session, client and
  platform-signer tests are **36/36 PASS** on the final source; diff checks are
  **PASS**; independent review is **ACCEPT**. An earlier analyzer-only run
  caught a mechanical field insertion into the neighboring class before any
  tests ran; the final diff removes that error. Reviewed primary file SHA-256
  identities are `db7fb20a5e9e5e90e38301ca40ac001d67368852564ac4fccf1bf95f3f59d6ab`
  for the store and
  `d744f9b052e04f270ebf89375d41dc3600811cc88c2956a92aa30069fc8ab491`
  for its focused real-store tests.
- **BLOCKED / NOT RUN:** this makes full binding generation available to a
  future trusted-time authority but does not add session-generation transport,
  an issuer, protected signer, LAN endpoint, runtime mount or installed-device
  evidence. Connected mode remains default-off.

### Private trusted-time authority request prerequisite

- **SOURCE PASS / DEFAULT-UNAVAILABLE / UNMOUNTED:** implementation
  `15d7ca82617091edc8b1e6da921cd394c28ff2b8` (repository tree
  `41209e78db9e13fc3465e08a7cd85e363a022be7`, native tree
  `2111937dd3c2d0167264129f7f888daa1f4eb20c`, native `lib/` tree
  `0843db53cae449fc35dab9ed3f43e8c725d163e9`, binary patch SHA-256
  `929729722d6dd214429bb790adef58127bce7640ac735f6c41661bb006ae46a4`)
  adds the transport-neutral trusted-time observation request and a
  default-unavailable coordinator authority seam.
- The canonical request carries only schema/version, retained approval digest,
  the complete device/session/binding-scoped challenge and a deterministic
  request digest. Exact-schema parsing rejects missing/extra/wrongly typed
  fields, approval/challenge/digest substitution, malformed UTF-8 and every
  noncanonical byte encoding. Raw approval bytes and bearer credentials are
  deliberately excluded.
- The authority interface explicitly requires a future implementation to
  resolve an independently owner-verified retained approval, revalidate exact
  enrollment/revocation and complete challenge scope, and sign through
  protected platform custody. Its only current implementation fails closed as
  unavailable.
- Targeted analyzer is **PASS**; focused tests are **4/4 PASS**; diff checks are
  **PASS**; independent review is **ACCEPT**. Reviewed file SHA-256 identities
  are `6258f728ae505e883cc7f30617b160157c98362875392344cc17373c979a0c99`
  for the authority/request contract and
  `8635670f0d7548cab9c0bfac84f4e76e9691b9aba67ea036df3463c6588ed5c2`
  for its tests.
- **BLOCKED / NOT RUN:** the frozen LAN v1 endpoint set is unchanged; no
  trusted-time endpoint, approval resolver, enrollment/revocation adapter,
  protected signer, observation transport, Windows clock, runtime mount,
  installed-device or pilot evidence exists. A separately reviewed protocol
  amendment and platform key-custody implementation are required before this
  seam can issue time.

### Private scoped trusted-time exchange composition successor

- **SOURCE PASS / DEFAULT-OFF / UNMOUNTED:** implementation
  `cc62e2ca6463227a6bbaea5e005e1f62ece61c62` (repository tree
  `3b186bafaa3db73d8d2718ea2848c975f1682109`, native tree
  `4ffe8d7d16088366fa9db328ddd38799f7c8a8d0`, native `lib/` tree
  `c20471cc1e369938cb67141792979e960087e0cc`, binary patch SHA-256
  `6199deec5ec1f406590522a2e93610c8b3c11288c91b18372cb4665daf094e1a`)
  adds a separate trusted-time facade without mounting it in a shipping
  composition.
- The facade pins one immutable approval snapshot, exact workspace/site,
  coordinator and client identities, client fingerprint, session generation,
  coordinator-binding digest/generation, verifier, database/store, platform
  clock, nonce source and explicit signed-observation exchange. Disabled
  resolution is lazy and does not touch dependencies. A refresh retains the
  challenge before exchange and exposes effective time only through the exact
  pinned scope; exchange, scope, key, observation, clock and replay failures
  remain fail closed.
- Store capability disposal now checks object identity before removing an
  active entry. A foreign capability with the same request digest is zeroized
  but cannot evict the legitimate retained capability through either
  `abandon` or `complete`.
- Targeted analyzer is **PASS** with no issues. Contract, durable-store and
  facade tests are **16/16 PASS** serially; formatting and diff checks are
  **PASS**. Independent review first returned **HOLD** for the cross-store
  same-digest eviction case, then returned **ACCEPT** after the identity-order
  correction and adversarial regression test. Reviewed file SHA-256 identities
  are `b15e45c8c99730c87ed9bc05e919b346c8bfe536221503fa9fe9906260556a92`
  for the facade, `818efc9dbf214e0a62a2bda9193a049cf0bbed4c432fbcd93dda4dbb37f3454d`
  for the store, `ba3ad95bba6487a2e49016e8e0cdd9865c16655452e5c03fdf30fcb26095a532`
  for the facade tests and
  `8ff8d67e4776d6cf1cbf5a3e2730277f6a9a5d045a9abcc6e1e0a11ca6560000`
  for the store tests.
- **BLOCKED / NOT RUN:** no signed observation transport/exchange
  implementation, production issuer or key custody, coordinator/lease runtime
  mount, Windows trusted clock, Android/Windows compilation, installed-device
  or pilot evidence exists. Connected mode remains default-off. This source
  boundary is not synchronization, trusted-time readiness or release
  acceptance.
- Capacity after verification: durable `/workspace` had `337,989,632` bytes
  free and `/dev/shm` had `5,313,351,680` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Complete schema-v37 affected migration and backup matrix

- **PASS:** exact ledger source
  `eba696b8ccf9c37792dc7341f7a547c3b759b6d2` (repository tree
  `9b39350b4a95f32eace7787c073ab649b6f087cd`) ran the complete
  13-file v37-affected Flutter matrix serially with `--no-pub
  --concurrency=1`: backup, café order, cash movement, connected attempt,
  authority, enrollment, persistence, replica and trusted-time stores,
  foundation, member identity, operational export and pending cash checkout.
- Result: **317/317 PASS**, zero reported skips, exit `0`, framework elapsed
  **19 minutes 54 seconds**, from `2026-11-02T03:35:01Z` to
  `2026-11-02T03:55:01Z` wall time. Coverage includes legacy migrations,
  schema-v37 migration, semantic snapshot validation, encrypted backup and
  fresh-target restore, replay/restart/idempotency, authority and replica
  evidence, member identity, café/payment/stock conservation and the new
  audit-only restored trusted-time boundary.
- Existing Drift multiple-database warnings appeared only in deliberate
  snapshot/restore multi-handle tests; no assertion failed. No source changed
  during the run. Durable `/workspace` had `338,628,608` bytes free and
  `/dev/shm` had `5,279,940,608` bytes free after completion. No build,
  cleanup, network, credential, provider, publication or production action
  occurred.

### Private Android current-boot trusted-time clock successor

- **SOURCE PASS / ANDROID-ONLY / DEFAULT-OFF:** implementation
  `28d93ef3b3410f202e43333677722d0d906ed6ac` (repository tree
  `4446560656c2cf54a9ce6078e20e26747e1864d6`, native tree
  `804e55c0839142d2a12695a9f31777ae0dca32b1`, native `lib/` tree
  `3f1e193a5b5b06dc4058739edac68b2ce18d27c5`, binary patch SHA-256
  `19bbc3bf79291fdedbe120116f66e5d163ed3a58717012fa5c54c73ffcc4124a`)
  adds a strict Dart platform-clock adapter and an Android API-33+ native
  response on the existing connected-security channel.
- Android derives a domain-separated 64-hex current-boot identity from
  `Settings.Global.BOOT_COUNT` and reports `SystemClock.elapsedRealtime()`,
  which includes deep sleep. Channel registration remains behind the existing
  `CONNECTED_SITE_PLATFORM_SECURITY_ENABLED` build flag and API-33 gate.
  Ordinary builds therefore remain unavailable and connected mode stays off.
- The Dart adapter requires exact request/response schemas and the reviewed
  Android source label. It rejects missing/extra/non-string fields, malformed
  boot IDs, negative or non-integer monotonic values, boot substitution and
  monotonic regression within one adapter. Missing plugins and platform errors
  fail closed. Windows recognizes the method name but deliberately continues
  to return `NotImplemented`; no synthetic Windows boot identity was added.
- Targeted analyzer is **PASS**, focused adversarial tests are **4/4 PASS**,
  and diff checks are **PASS**. Independent review is **ACCEPT**. Reviewed
  file SHA-256 identities are
  `1bc2cc0e5e18c9ab09d1e42a4a43ec104f65016488c4378b0149fc94cff42fba`
  for the adapter and
  `869c702f4f5ce22b7d5719a3230a4a8a1b1859ab70781df23b4255d1810b24a4`
  for its tests.
- **NOT RUN / BLOCKED:** Android Kotlin/Gradle compilation and installed-device
  behavior were not run because this source archive has no Android Gradle
  wrapper. `BOOT_COUNT` plus elapsed realtime provides current-boot evidence,
  not protected anti-rollback authority across reboot, restore, factory reset
  or a compromised OS. Windows remains unavailable until a stable supported
  boot-identity primitive is selected, compiled and installed-tested.
- Capacity at `2026-11-02T03:25:44Z`: durable `/workspace` had `338,710,528`
  bytes free and `/dev/shm` had `5,313,273,856` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private schema-v37 one-shot trusted-time persistence successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `fac04dd7bbb53b557e818f483a35ddd576e6c9e2` (repository tree
  `f3dba3b250a5c7b5c64349cabe5164c5487ca3cf`, native tree
  `d59dc14219bea7ab89b497aa958926e5b0430566`, native `lib/` tree
  `cca7c18e16e52c18f4d6f16f423643da8b991432`, binary patch SHA-256
  `45f2381204e18223b6f2204c57b171455af6fa06fccff60adb004a014456bd5d`)
  advances the Shop database, verified snapshot and encrypted backup contract
  to schema v37 with real atomic trusted-time evidence persistence.
- V37 retains immutable owner approvals, request challenges, signed
  observations and local acceptances. Only the hash of a random capability is
  persisted; completion also requires the exact opaque same-process capability
  retained in memory. Completion revalidates the complete retained evidence
  inside one database transaction, consumes a request once, and atomically
  advances reconstructable authority and device heads.
- Authority progress rejects repeated or regressed key-generation,
  epoch/sequence and observed-time tuples. Device progress binds workspace,
  site, coordinator, device/fingerprint, session, coordinator-binding digest
  and generation, boot session, effective time and monotonic acceptance.
  Missing, substituted or digest-invalid heads fail closed. Capability and
  temporary secret bytes are zeroized after use.
- Restart and encrypted fresh-target restore retain auditable evidence but do
  not recreate a live capability or effective time. A fresh verified challenge
  on the current process and boot is required. V36 migrates to an empty v37
  evidence set after verifying the complete v36 boundary; historical fixture
  teardown and snapshot validation were updated rather than weakening the
  production verifier.
- Changed-file analyzer is **PASS** with no issues. The final exact-source
  protocol, verifier, store and connected persistence matrix is **32/32 PASS**
  serially, including **5/5** focused replay/restart, concurrent consumption,
  rollback/head tamper, v36 migration and encrypted restore tests. The exact
  synthetic-v32 fixture that failed in the earlier broad run was repaired and
  its focused rerun is **PASS**. The earlier pre-fix authority+replica run was
  **30 PASS / 1 stale-fixture FAIL** and was not repeated in full after that
  fixture-only correction. Formatting and diff checks are **PASS**.
- Independent adversarial review is **ACCEPT** after two HOLD rounds. Verified
  fixes cover full approval/request/observation/acceptance reconstruction,
  strict tuple ordering, approval-to-observation authority binding, current
  head presence/digests, unchanged-generation binding consistency,
  transaction-local full evidence validation, full live-scope keys and secret
  zeroization. Reviewed primary file SHA-256 identities are
  `4c341b3c21905e14b9f4ae9b6896e7c18406e3c99113ba84e7323a1f597b5d49`
  for the store and
  `fde50d8fa5b74ff7767028e1eb3407d21480821f5b12ba33873dee5e35a9a0b6`
  for its focused tests.
- **BLOCKED / NOT RUN:** the store is intentionally not mounted in a shipping
  profile. Production owner/time-authority key enrollment and custody,
  installed Android/Windows protected boot/monotonic evidence, runtime lease
  integration and device acceptance remain required. Restoring an older but
  internally valid database cannot be detected by SQLite alone; restored
  trusted-time heads are audit-only. Offline authority across reboot requires
  a separately reviewed platform anti-rollback clock or counter.
- Capacity at `2026-11-02T03:21:41Z`: durable `/workspace` had `339,050,496`
  bytes free and `/dev/shm` had `5,312,966,656` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private pinned trusted-time verifier successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `a65ce554d7b23bb8d844d02dffdc3617c67831b7` (repository tree
  `5a7986c506c0b688163416945dc85d847ecbd40e`, native tree
  `9f61b50fcda7b53a1ea6b37a00f810ba5e3eccbc`, native `lib/` tree
  `e7f15796be69d017759acd9ce9ef0030081a5272`, binary patch SHA-256
  `43a3fcbc363c801452327ae81b1118d8710e28d215e74415fdec64e7cec091be`)
  supplies a non-secret Ed25519 verifier for the accepted trusted-time
  approval and observation protocol. No production key is embedded and no
  runtime imports or mounts this verifier.
- Owner approval is checked over its exact canonical evidence against a
  caller-supplied pinned owner key. The approved time key is independently
  pinned to the workspace, site, coordinator, coordinator-binding digest and
  generation, key ID and generation, and the SHA-256 fingerprint of its exact
  32-byte public key. Observation verification rechecks the owner approval,
  exact challenge scope/binding, authority identity and approval validity
  interval before verifying the canonical observation signature.
- Malformed owner keys, unknown keys, duplicate authority identities, wrong
  owner/time keys, scope/binding/generation substitutions, out-of-approval
  observations and altered signed fields fail closed. The verifier does not
  mistake signature validity for freshness, replay safety or platform time.
- Targeted analyzer is **PASS** with no issues; the protocol plus verifier
  suite is **9/9 PASS**. Formatting and diff checks are **PASS**. Independent
  review is **ACCEPT** and independently reproduced analyzer PASS and 9/9
  tests. Reviewed file SHA-256 identities are
  `98a6dffa500b9e4e99956920b3dcc396d6a908d3e947341a0ccf283baebb1d38`
  for the verifier and
  `7fca032472a8cbaf697b49a38b4595d7dfc8a4df12aaf6836e8f402a07e82cee`
  for its tests.
- **BLOCKED / NOT RUN:** durable v37 request/observation/acceptance evidence,
  atomic one-shot capability consumption, authority and device heads,
  replay/rollback/restart/multi-instance enforcement, platform boot/monotonic
  proof, production key enrollment/custody and runtime composition remain
  separate gates. The v37 audit identifies database, backup and historical
  fixture changes across multiple files; it must not be approximated with a
  mutable single-row clock. Restored heads must remain audit-only until a fresh
  current-boot challenge, and offline authority across reboot still requires a
  protected anti-rollback platform source.
- Capacity at `2026-11-02T02:57:52Z`: durable `/workspace` had `349,368,320`
  bytes free and `/dev/shm` had `5,313,896,448` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private request-bound trusted-time protocol successor

- **SOURCE PASS / PROTOCOL-ONLY / DEFAULT-OFF:** implementation
  `bfd26a5e80ad890bbd34e4b004b66fff0f56c4c9` (repository tree
  `c4b2357b3d5223b76c61c69a062597313fa02737`, native tree
  `5015692516697db906506280e93effa89e7f76b1`, native `lib/` tree
  `ffcc5448e25980f3ca55d227138c09fb1b6820c2`, binary patch SHA-256
  `14cefa5c32f745692d2a284739bee2c16342adee7147eab2b53d3a885b581ac7`)
  defines exact versioned approval, challenge and observation records for the
  previously missing request-bound trusted-time boundary. No production
  runtime imports or mounts this file.
- The owner approval binds the dedicated time-signing usage, workspace, site,
  coordinator, approved coordinator-binding digest and generation, time-key
  ID/fingerprint/generation, validity and owner-authority key. The challenge
  binds the client device/fingerprint, session generation, one-time nonce,
  platform boot-session evidence and monotonic start. The signed observation
  binds the exact challenge digest and fields, authority key, epoch, strictly
  representable sequence, observed time and a maximum two-minute validity.
- Parsers require exact field sets and string keys, recompute every digest and
  reject substituted fields. Owner and observation signatures require the
  canonical unpadded base64url encoding of exactly 64 bytes. Unavailable clock
  and authority-verifier adapters fail closed; the slice does not infer issuer
  trust from TLS, an endpoint, a URL or a stored payload.
- Targeted analyzer is **PASS** with no issues; focused protocol tests are
  **5/5 PASS**. Formatting and diff checks are **PASS**. Independent
  adversarial review is **ACCEPT** after finding and verifying fixes for a
  permissive owner-signature representation and non-string map-key coercion.
  Reviewed file SHA-256 identities are
  `b8be11b214097cb1b470506660326793a9625ea77d8b723c7a5fb1f6c28a2c83`
  for the contract and
  `2acd0345a5992a7a104c25a5f409fcaff4ede04315e03cff2d66930122d92fd0`
  for its test.
- **BLOCKED / NOT RUN:** this source slice deliberately provides no database
  migration, store, replay head, runtime adapter or effective-time result.
  Durable atomic one-shot consumption, sequence/epoch rollback prevention,
  restart and multi-instance exclusion, backup/restore semantics and an
  unpersisted same-process completion capability remain required. Real
  owner/time-authority cryptographic verification and key custody plus
  installed Android/Windows boot-session and monotonic-clock evidence also
  remain required. An ordinary monotonic clock cannot authorize a new offline
  window across reboot without a separately reviewed protected anti-rollback
  source. The earlier static-payload adapter and rejected mutable-head store
  draft remain excluded.
- Capacity at `2026-11-02T02:54:01Z`: durable `/workspace` had `349,663,232`
  bytes free and `/dev/shm` had `5,313,941,504` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private joining-device replica synchronization successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `abe2025be365939b8eb00823dd7373a9d03acba1` (repository tree
  `149e531e51ea8caf1a45484f6032084c62b59478`, native tree
  `444d7998e810b8b24fcca2562e229ddb105759c6`, native `lib/` tree
  `b44567941bb35fee3c819cc88ccb7f10792a17cd`, binary patch SHA-256
  `09fbc9e79e789074790680180bf82cba56ac4082d2428340d785931b12dd29db`)
  supplies the previously missing production-shaped composition for one
  secondary/joining device. It binds the real platform signer, durable command
  attempt store, pinned-TLS LAN client and read-only replica to one exact
  database, device identity, workspace/site and approved coordinator binding.
- The composition remains lazy and network/key silent when the connected-site
  capability is off. Its enabled facade exposes only pairing, one bounded
  snapshot/delta synchronization step and read-only replica status/projections;
  raw signing, arbitrary command transmission and direct replica mutation are
  not exposed.
- Every fetch requires the retained active approval to match the QR pairing's
  workspace, site, coordinator, endpoint and certificate plus the retained
  device fingerprint/signing-key identity. The replica re-resolves approval
  inside its apply transaction. Substitution, expiry, revocation before fetch,
  revocation between fetch and apply, transport failure and invalid apply all
  leave an established replica durably paused. The pause-only path is bound to
  the local scope/fingerprint and cannot unpause or apply data.
- The default request nonce now always starts with a protocol-valid token byte;
  secure random base64url output can no longer intermittently begin with `-` or
  `_` and fail its own request grammar.
- Targeted analyzer is **PASS** with no issues. Client composition, transport
  and protected-signing tests are **24/24 PASS**; the complete replica,
  migration and encrypted backup/restore file is **11/11 PASS**. Formatting
  and diff checks are **PASS**. Independent review is **ACCEPT** after finding
  and verifying fixes for privileged internal exposure and three durable-pause
  gaps (preflight failure, revocation during fetch/apply and substituted
  pairing after an earlier successful sync).
- **BLOCKED / NOT RUN:** this is not mounted in a shipping profile. A fresh,
  signed request-bound trusted-time observation remains absent; the rejected
  static authority-payload clock design must not be revived because it allowed
  replay/reset across adapters and restarts. Real issuer/key enrollment,
  installed Android/Windows LAN/TLS operation, cloud/RLS reconciliation,
  signed artifacts and merchant acceptance remain separate gates.
- Trusted-time audit confirms this is a protocol/schema prerequisite, not a
  safe one-file adapter. The next source slice must bind a fresh request to the
  workspace, site, coordinator, client device/fingerprint, session generation
  and nonce; bind the signed response to that request plus an owner-authorized
  coordinator signing key, authority epoch/sequence and validity; and retain
  immutable one-shot request/observation evidence atomically with monotonic
  trusted time. A persisted old request must not be completable after restart.
  Existing monotonic time rows, inbound request nonces and the TLS certificate
  do not prove those properties. Real issuer keys and installed platform
  boot/monotonic-clock evidence remain **NOT RUN**.
- Capacity after verification: durable `/workspace` had `268,193,792` bytes
  free and `/dev/shm` had `5,313,249,280` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private protected-platform LAN client signer successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `a5b2a01267ce412b7694add6c41163c416cbb5f8` (repository tree
  `8267442a2de175643612ee8712c9314d42abd368`, native tree
  `9a79ccd9cad0c15505b62a8239589c83a6aac9ca`, native `lib/` tree
  `d431c706ebe86f87ee773b07741b8894da24101f`, binary patch SHA-256
  `5aa2a392b0412e473c51108d9efb7f9a7901072feec09ca2fb56faf0d48911e6`)
  supplies the previously missing production-shaped
  `ConnectedSiteDeviceSigner` bridge from one explicit retained public identity
  to non-exportable `ConnectedPlatformSecurity` signing custody.
- The adapter discovers or creates no key. It maps the enrolled public-key
  fingerprint to the protocol client fingerprint/signing-key ID, canonicalizes
  the public key as unpadded base64url, requires the strict platform device-ID
  grammar, snapshots caller bytes before any await and reloads the exact
  platform identity before and after every signature.
- Every returned signature must be exactly 64 bytes and independently verify
  under the retained Ed25519 public key. This rejects alias/key substitution,
  wrong-key output and swap-sign-restore behavior. Caller, verification and
  platform payload copies plus signature bytes are separated and temporary
  copies are zeroed on every success and failure path.
- Targeted analyzer is **PASS** with no issues. Signer, real LAN-client request
  proof and platform-security tests are **40/40 PASS** serially; the final
  adapter-only regression is **7/7 PASS**. Formatting and diff checks are
  **PASS**. Independent review is **ACCEPT** after finding and verifying fixes
  for wrong-key output, pre-await caller mutation, incomplete failure cleanup
  and permissive device identifiers.
- **BLOCKED / NOT RUN:** the explicit device ID is ultimately authorized by the
  durable approved coordinator binding; it is not embedded in the retained
  platform identity. Real Android/Windows keys, installed-device signing,
  platform custody, runtime client composition and LAN acceptance remain
  required. The adapter is not mounted and connected mode remains default-off.
- Capacity at `2026-11-02T02:23:42Z`: durable `/workspace` had `269,660,160`
  bytes free and `/dev/shm` had `5,313,880,064` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Private scope-bound coordinator health successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `34e6957d4caff61f38fc0960700a81da893a4ed7` (repository tree
  `ff72f63abca9771a62deca9e689cd5621487823c`, native tree
  `e177756a302866b8ebdd55284668a7756a371ba7`, native `lib/` tree
  `e7c2407f5662acd011ab99cc1a9d368d203805c7`, binary patch SHA-256
  `00503c804ec49a7a3fccc8ceff11cd2c5bf0fe7f348404a5c958bdff2fba6df3`)
  replaces arbitrary coordinator-health injection with a projection constructed
  inside composition from the exact coordinator database, shared-write gate,
  workspace, site and device scope.
- Shared-write health now follows the real command gate. Pending conflicts are
  counted only through commands in the exact workspace/site and only while
  pending; foreign, resolved and quarantined conflicts do not contribute.
  Internet, cloud-sync and backup health remain false unless an explicit
  exact-scope observer supplies them; absent or unreadable observers fail
  closed, substituted scope is rejected, and cloud sync cannot report healthy
  without observed internet.
- Lease expiry remains absent because no active actor/device lease selection or
  trusted-time source is mounted. The unauthenticated LAN health response
  remains minimal and exposes none of these detailed fields. No issuer, key
  custody, freshness, endpoint or authority is inferred.
- Targeted analyzer is **PASS** with no issues. Provider, composition and
  coordinator protocol tests are **41/41 PASS** serially; formatting and diff
  checks are **PASS**. Independent review is **ACCEPT** with no blocking
  findings after separately running analyzer and **14/14 PASS** focused tests.
- **BLOCKED / NOT RUN:** a real platform observation adapter must still prove
  freshness and truthful internet/cloud/backup semantics. Trusted time, real
  issuer/key custody, active lease selection, installed-device LAN/TLS,
  cloud/RLS acceptance, signed artifacts, hardware and merchant evidence remain
  separate gates. Connected mode remains default-off and unmounted.
- Capacity at `2026-11-02T02:18:08Z`: durable `/workspace` had `270,237,696`
  bytes free and `/dev/shm` had `5,313,449,984` bytes free. No build, cleanup,
  network, credential, provider, publication or production action occurred.

### Complete historical/migration affected-matrix receipt

- **PASS:** exact source `22392605413698d410c87f5238563b2871271c1a`
  (tree `a169d8693a23b32542d0a6d604dd70b01ca00f0d`) ran the nine
  complete affected Flutter files serially with `--no-pub --concurrency=1`:
  café orders, cash movements, connected attempts, enrollment, replication,
  foundation, member identity, operational export and pending cash checkout.
- Result: **173/173 PASS**, zero reported skips, exit `0`, elapsed **554
  seconds**, from `2026-11-02T01:44:03Z` through
  `2026-11-02T01:53:17Z`. This includes migrations, encrypted backup/restore,
  restart/idempotency, transaction rollback, tamper rejection, stock/payment
  safety and the repaired historical fixtures. Existing Drift warnings were
  emitted only by deliberate concurrent snapshot/restore database handles;
  no assertion failed.
- No source changed during the run. No build, network, credential, provider,
  deployment or production action occurred; connected mode remains off.

### Private historical-schema fixture successor

- **PASS / test-only:** `eee4671683d87b76c1a88245704b890302341379`
  (tree `53e87c223c36f2e8d90487b40519183a2b9f8805`, native tree
  `838fa22920d61bda9e9962dcbf6fb4198f25c929`, binary patch SHA-256
  `ae7f2a2e28dbe59a2d1a2015b02aeca067dffa003b331daffbca86e598f8e9df`)
  advances the shared historical-fixture inventory to schema v36 and removes
  v36 authority-checkpoint objects before constructing claimed v5, v15,
  v17-v19, v21, v30-v32 histories. Production migration and fail-closed
  verification code are unchanged.
- The ten previously stale/failing historical cases are **10/10 PASS**. The
  independently identified v5 shift and v17 cash-movement migration/restore
  cases are **2/2 PASS**; shared inventory guard tests are **2/2 PASS**; the
  enrollment regression remains **1/1 PASS**. Targeted nine-file analyzer,
  formatting and diff checks are **PASS**.
- Independent review is **ACCEPT** after verifying v36 trigger/table teardown
  order, complete affected fixture coverage, and test-only scope. The prior
  historical-fixture FAIL recorded below is superseded by this evidence.

### Private scoped LAN coordinator composition successor

- **PASS / local-only:** implementation
  `36e56ed6a5a13b57a14b65abf1c0711724456a34` (tree
  `9a7b106bc10af9b6c87d794a00eee623e33fcb2c`, native tree
  `ab12a778c93dee97d282aefbd30a9cb870c48123`, native-lib tree
  `28f169c2ce37cf25b7b706511423e0c9b8dddd11`, binary patch SHA-256
  `02dec366f6cc3aa6c51f1f526408047ae769591e2490aceabc3fb8abb80d84b2`)
  composes the real TLS LAN server from the exact composition database,
  enrollment store and shared-write gate. Request authentication, command
  signatures, offline-lease authorization, command projection and replication
  now share that one state graph.
- Runtime workspace/site/coordinator, private address and pinned certificate
  must match the short-lived pairing record before platform or listener side
  effects. Pairing nonce registration is exact and idempotent. Prepared-only
  and partial starts participate in reverse cleanup. Protected-key aliases may
  differ from device IDs, while alias substitution between prepare and start
  fails closed.
- Café projection is rejected at composition and command-handler boundaries
  unless its store owns the identical database, preserving atomic command,
  event, stock, audit, acknowledgement and projection effects. The returned
  composition exposes no raw server, transport, gate or database seam.
- Focused coordinator/runtime/composition/protocol tests are **64/64 PASS**;
  targeted analyzer, formatting and diff checks are **PASS**. Independent
  review is **ACCEPT** after finding and verifying fixes for cross-database
  café projection and alias/device conflation.
- **PASS / test successor:** `a60cffba5d0dd878abc02372be21b2d21f82d737`
  (tree `ace61371122e70ab4e7f357c652cfc95865f2a11`, native tree
  `85243893618b118258640cfe62c7736155fe3abf`) corrects the enrollment
  migration assertion to current schema v36; its exact reproduction is
  **1/1 PASS**. The preceding broad run reached **181 PASS / 1 FAIL** before
  this correction.
- **FAIL / next source gate:** ten other historical tests still claim current
  schema v35. Four reach only that stale assertion; six fail earlier because
  fabricated v15/v17-v19/v32 snapshots retain later schema objects and are
  correctly rejected. They need genuine historical construction or complete
  post-version teardown; production verification remains fail-closed.
- **BLOCKED / NOT RUN:** connected mode remains default-off and unmounted.
  Real issuer keys, trusted time/health, installed TLS key custody, signed
  Android/Windows artifacts, device LAN tests, hardware, cloud/RLS acceptance
  and merchant evidence remain separate gates. No build, publication,
  deployment, credential, provider or production change occurred. Current
  capacity was 272,429,056 bytes free on `/workspace` and 5,312,831,488 bytes
  free on `/dev/shm`.

### Private connected runtime composition successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `38de79b9c87e4a133bcf4cb821c868500cbb084b`, repository tree
  `705a24915227a087fe585dbb0c48180e432c02d8`, native tree
  `46553787eb84c22d7e696681f42671ae942895ea`, and native `lib/` tree
  `19f77a6e3a8463658909ede322cfdf6d179b4d83`. Its exact predecessor is
  ledger `741941c1999f17e09827c2e9231a872df55d2ee2`; binary patch SHA-256 is
  `8bd6a36b517aa33fd00b20de0be0ab81bc18a0453c1550f4f4e097b3c39e20f2`.
  This successor is private and unpublished.
- One explicit, still-unmounted composition root now binds the reviewed
  database, retained enrollment evidence, signed authority payload store,
  authenticated cloud wire, reconciliation store, authority delta store,
  platform identity custody, native coordinator lifecycle, LAN transport and
  one shared write gate. Disabled shipping capabilities never invoke even the
  dependency factory. Enabled composition without complete explicit
  dependencies remains visibly blocked; no endpoint, credential, key or
  platform implementation is discovered from ambient state.
- Startup now proves database readiness, loaded platform identity, exact
  retained device enrollment and its session generation before a
  session-bound authority refresh may verify or retain cloud evidence. A
  mismatched response generation fails before signature verification or
  receipt retention. Revalidation pauses and drains shared writes before any
  identity/enrollment/cloud check, resumes only after the complete check, and
  stays paused after revocation or failure.
- Reconciliation is exposed only through a runtime-session-bound facade. It
  holds the same shared-write gate for the complete refresh, upload, outcome
  persistence and authority-delta transaction, with active enrollment
  fingerprint/generation checks before and after cloud I/O. The composition
  receipt no longer exposes its raw cloud client, mutable gate, readiness,
  coordinator or concrete runtime, and the application boundary retains its
  runtime only in a private field. Direct pre-runtime reconciliation, wrong
  identity and pending enrollment make zero cloud calls and retain zero
  authority rows.
- The exact connected authority/reconciliation/store/application/runtime
  suite is **88/88 PASS** serially in 2:10. The constructor-only final
  clarification then passed exact composition/application tests **12/12**;
  targeted eight-file analyzer, formatting and `git diff --check` are
  **PASS**. Independent security/correctness review is **ACCEPT** after four
  rounds that first found and then verified closure of pre-enrollment cloud
  mutation, unbound reconciliation, writes remaining open during
  revalidation, raw receipt-side escape hatches and one constructor-call
  ambiguity.
- **BLOCKED / NOT RUN:** this is source composition only. `main.dart` does not
  mount it and all shipping profiles keep connected-site capability off. Real
  issuer keys, production authenticated endpoints, Android Keystore/Windows
  DPAPI custody, installed-device private-LAN TLS, PostgreSQL/RLS acceptance,
  signed artifacts, restart/restore on installed targets, physical hardware,
  merchant and production acceptance remain **NOT RUN / BLOCKED**. No live
  endpoint, credential, APK, publication, deployment or merchant data was
  used.
- Capacity at `2026-11-02T01:10:06Z`: durable `/workspace` had 273,866,752
  bytes free and `/dev/shm` had 5,313,847,296 bytes free. The durable artifact
  build gate remains blocked; no cleanup or speculative build was attempted.

### Private cloud authority bootstrap integration successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `4175ac1c05bd4dc2537e952e46011ebbc5ad7163`, repository tree
  `5b59bee7ddbae8c9a73d4273a93aab81d7d6ce51`, native tree
  `ff217b15c417bcb7a2a4b709491150014fdf80ca`, native `lib/` tree
  `9df67e9512df1282f0eedd874d1122ae6b1543a1`, and server runtime tree
  `e6594e20c6269fa8c437eaea9da352ee00e7b946`. Its exact predecessor is
  ledger `d61e6f61a81aa3f4ce3accdd91917502b0a2d6ad`; binary patch SHA-256 is
  `75710d2970ea992865d3a609cd21722c2404318c67e295a77f5985862169a1a3`.
  This successor is private and unpublished.
- The real connected-cloud authority response now carries the canonical,
  signed, device-bound full-chain checkpoint required by a later-joining
  device. A genuinely empty SQLite authority store accepts only that complete
  checkpoint and atomically imports its payloads and immutable provenance;
  any existing payload row still requires prior bootstrap provenance.
  Incremental refresh remains exactly-next and rejects replay, gaps, digest,
  scope, device or current-payload substitution. The server fails closed when
  its authenticated device has no checkpoint evidence. Connected execution
  remains independently default-off before HTTP.
- Cross-runtime evidence no longer synthesizes separate checkpoint bytes.
  Python and Dart share one byte-exact signed one-payload wire fixture and a
  second Python-emitted four-payload bootstrap fixture, SHA-256
  `d27b5c36d25377ca1f4821d381c0d45755f6b5616f6322bf0b88404b5583abd9`.
  Dart imports the latter through the real SQLite receipt store, proves four
  retained payloads plus one provenance row, then accepts generation five as
  the exact-next incremental while retaining the single provenance record.
- Python runtime/v15/lease tests are **33/33 PASS**. Native reconciliation,
  durable store and authority tests are **63/63 PASS** serially in 1:55;
  targeted four-file analyzer, formatting and `git diff --check` are
  **PASS**. The first broader native run used an unpinned compiler path and is
  not product evidence; the next run exposed two stale historical fixtures,
  one retaining v36 objects while claiming v34 and one expecting schema 35
  from a schema-36 database. Both focused regressions and the final serial
  suite pass without relaxing production verification. Independent final
  security/correctness review is **ACCEPT** after first holding the change for
  a missing byte-exact multi-payload Python/Dart golden and post-bootstrap
  incremental wire proof.
- **BLOCKED / NOT RUN:** this establishes source and local verification only.
  The connected router/client remain unmounted and default-off. A real issuer,
  source-pinned production public key, Android Keystore/Windows DPAPI custody,
  installed-device LAN TLS, PostgreSQL/RLS acceptance, signed artifacts,
  restart/restore on installed targets, hardware, merchant and production
  acceptance remain **NOT RUN / BLOCKED**. No APK, publication, deployment,
  credential, live service or merchant data was used.
- Capacity at `2026-11-02T00:46:04Z`: durable `/workspace` had 276,320,256
  bytes free and `/dev/shm` had 5,313,478,656 bytes free. The durable artifact
  build gate remains blocked; no cleanup or speculative build was attempted.

### Private joining-device authority checkpoint successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `bd6830952684fb6c054499211c6c5754aa5fc15f`, repository tree
  `32696841b2253470580e87c3528428ad615c9ffd`, native tree
  `d51bf21988c21b05b1d0cc65ac55e28aed705761`, and native `lib/` tree
  `ef0593835fbaf65198b88fdca5a366e2576a534d`. Its exact predecessor is
  ledger `56fbfe5187c6b40c670f740eba604705d74251af`; binary patch SHA-256 is
  `76297ff5deeb832f28457468e299240db6f93aa949c60e13f31143d338926097`.
  This successor is private and unpublished.
- A later-joining device can now establish authority only from a freshly
  signed, device-bound `ConnectedSiteAuthorityCheckpointV1` containing the
  complete sequence-one authority chain. Schema v36 atomically retains the
  checkpoint, every payload/projection/revocation effect and immutable
  `checkpoint_joined` provenance. Checkpoint and payload signatures are
  independently reverified after restart/restore. Missing evidence, replay,
  changed digest, gaps, scope/device substitution, partial writes and former
  unsigned `incremental`/`legacy_incremental` fallback modes fail closed.
  Pre-v36 retained chains are deliberately quarantined until separately
  reauthenticated; migration does not invent a trusted bootstrap.
- Authority/checkpoint/migration/backup tests are **20/20 PASS** in 1:18;
  broader backup and connected persistence tests are **119/119 PASS** in 5:20;
  targeted four-file analyzer and `git diff --check` are **PASS**. A first
  broader run used the pre-fix test image, exposed stale schema-35 expectations
  and incomplete legacy-fixture teardown, and was interrupted after preserving
  those failures; the corrected focused checks and exact-source 119-test run
  passed. Independent security review is **ACCEPT** after rejecting two earlier
  drafts for optional checkpoint evidence and substitutable unsigned bootstrap
  modes.
- **BLOCKED / NOT RUN:** connected authority remains feature-off and is not
  mounted into a production runtime. Real issuer/key custody, Android
  Keystore/Windows DPAPI, installed-device enrollment, LAN TLS composition,
  PostgreSQL rehearsal, cloud/RLS acceptance and merchant evidence are not
  proven. Checkpoint issuance currently requires an OS-synchronized clock and
  rejects any future skew; this is a documented availability risk, not a
  relaxed security boundary. No APK, publication, deployment or live service
  was used.
- Capacity at `2026-11-02T00:29:28Z`: durable `/workspace` had 277,671,936
  bytes free and `/dev/shm` had 5,309,321,216 bytes free. The durable artifact
  build gate remains blocked; no cleanup or speculative build was attempted.

## 2026-11-01 exact-head release checkpoint

### Private authenticated cloud HTTP executor successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `45c41bb3e3a323239df5baef6428a5dc3089d123`, repository tree
  `acc3078f4e1e46324d3edc10fbcf2a387951a192`, native tree
  `ba14c5a990c1d4deecd72af6409a94daa978eff3`, and native `lib/` tree
  `d1e1b51a349c7d6054bd495c513050b02879b33b`. Its exact predecessor is
  ledger `386cc7116d32ca53f91e292004f9c16d90e54f0e`; binary patch SHA-256 is
  `3af69370a42764ef8740265ca1f3e3603e0d371bd93f29f40319477aa1cc217a`.
  This successor is private and unpublished.
- The default-off Dart I/O executor now supplies the previously missing real
  HTTPS boundary for the authenticated connected-cloud wire client. It binds
  one exact HTTPS origin, disables redirects and ambient proxies, rejects
  ambient `HttpOverrides` both before and after asynchronous authentication,
  accepts only bearer-only or the complete four-header signed-device
  envelope, copies caller inputs, enforces printable ASCII/header/body caps,
  uses one absolute auth-to-body deadline, force-closes on expiry, and stops
  oversized response streams without retaining server bodies in errors.
  Operating-system trust remains the default; an injected `SecurityContext`
  exists only for reviewed platform composition and deterministic local TLS
  tests. Native CI now formats and diff-checks the new source symmetrically.
- Exact-source connected client, authority, reconciliation and durable-store
  tests are **66/66 PASS** in 86 seconds, including a local ephemeral-TLS
  fixture, redirect rejection, response caps, incomplete/mixed credentials,
  control characters, pre/post-auth HTTP override substitution and slow-drip
  deadline attacks. Targeted analyzer is **PASS**; native CI and QA isolation
  contracts are **45/45 PASS**; `git diff --check` is **PASS**. Independent
  review is **ACCEPT** after three rounds; earlier rounds correctly held the
  change for the absolute deadline, complete authentication envelopes,
  control characters, HTTP-override TOCTOU and CI diff coverage.
- **BLOCKED / NOT RUN:** the executor and authenticator are still independently
  default-off and are not mounted into a production runtime. No live cloud
  endpoint, production credential, real issuer/key custody, certificate pin
  composition, installed-device network test, PostgreSQL rehearsal, merchant
  or production acceptance was used or claimed. A separately reviewed
  joining-device authority checkpoint remains required after sequence 1.
- Capacity was remeasured at `2026-11-01T23:56:34Z`: `/dev/shm` had
  5,316,374,528 bytes free and durable `/workspace` had 286,167,040 bytes
  free. No artifact build, cleanup, publication or deployment was attempted.

### Private connected-cloud reconciliation successor

- **SOURCE PASS / DEFAULT-OFF:** implementation
  `157f94c84e143aa95591c1be17447001c8f888ef`, repository tree
  `906e8b0108d8fd213f89ee291eb9445ec33e4b90`, native tree
  `b9b977fa2a309a43d02bd527a2bf73ddbbe2aca4`, native `lib/` tree
  `dc0a94fa9c6e0e2778fd846e7d8b3ee3d53ed429`, and server runtime tree
  `fcc85008422d7fdeb977a41d4856dda8b2e74b06`. Patch SHA-256 is
  `3ecef31fa46a4f0114eb4cbd532895d1d2cf0a0f3d132fe667157e62e92fdc95`.
  This private successor has not been pushed or published.
- The native client now requires an injected authenticated executor and a
  durably retained, independently signature-verified authority receipt before
  upload. It reuses the exact offline/restart authority parser, rejects
  redirects and oversized/non-canonical responses, binds authority generation
  and the complete signed membership/configuration delta, and cannot advance a
  cursor on an incomplete disposition. The server returns retained conflict
  facts rather than reconstructing them from client event time; PostgreSQL
  timestamps normalize to canonical UTC.
- Cross-runtime evidence is byte-bound through one non-empty Python/Dart
  golden containing a real signed upload and accepted acknowledgement.
  Python runtime/v15 tests **20/20 PASS**; native authority/reconciliation
  focused tests **37/37 PASS**; broader reconciliation, durable store,
  authority, restart/restore and reservation persistence shard **65/65 PASS**
  in 1:42; targeted analyzer **PASS**; `git diff --check` **PASS**. The first
  run without the pinned LLVM path failed during toolchain setup and is not
  counted as product evidence. Independent follow-up review **ACCEPT** after
  two rounds; its first round held the change for durable bootstrap, real-store
  integration, UTC conflict time, non-empty golden coverage and lockfile scope.
- **BLOCKED / NOT RUN:** the router and client remain unmounted/default-off.
  No production authenticated HTTP executor, pinned issuer/key custody,
  Android Keystore/Windows DPAPI binding, real PostgreSQL rehearsal, installed
  device, hardware, merchant or production acceptance exists. Authority-chain
  bootstrap is proven from sequence 1; a later-joining device after authority
  advances needs a separately reviewed authenticated chain/checkpoint protocol
  and must fail closed until then.
- Capacity is not build-ready in this worktree: `/dev/shm` had 5,316,472,832
  bytes free, while durable `/workspace` had only 287,547,392 bytes free at
  this checkpoint. No build or cleanup was attempted.

- Draft PR [#752](https://github.com/swanhtet01/swanhtet01.github.io/pull/752)
  is open, unmerged and published at exact head
  `584b713554120ae4833ddd0d6517b759854f469d`, tree
  `7d11d6690f85d02e467de3e16d6ac1b445da41e3`. Its guarded non-force
  publication and only the resulting automatic CI were authorized; no merge,
  deployment, signing, manual dispatch or production change occurred.
- Exact-head Native POS run `41354762889` is **PASS**. Android, Windows,
  iOS/iPad and all three isolated synthetic QA jobs passed. The full Android
  job completed the seven serial shards with all 52 Flutter test files, real
  interruption checks, analysis, synthetic gallery capture, unsigned-release
  rejection and a debug APK build. Recorded shard durations were 2:44, 2:09,
  2:40, 2:43, 2:00, 3:22 and 3:14. This is hosted build evidence, not
  installed-device, production-signing or hardware evidence.
- Exact-head Kernel run `41354762885` is **PASS**. App run `41354758410`
  passed checks 1--637/668 and remains **FAIL / BLOCKED** only at canonical
  `hq:verify` step 1/37 with `database_rehearsal_evidence_stale` and
  `secretValuesExposed:false`. Dependency run `41354762868` remains **FAIL /
  BLOCKED** only for the app/kernel minimatch advisory; platform, pip and
  added-line credential checks passed. No compatible supported upstream
  dependency set is currently available, and the rejected blanket v11
  override or forced downgrade must not be used.
- GitGuardian remains **FAIL / BLOCKED** with two distinct findings across the
  PR history. Sanitized independent triage correlates them with (1) a
  deterministic test-only PostgreSQL blocker assertion introduced at
  `d696c98a` and source-remediated at `721922eb`, and (2) a real private-key
  syntax block introduced at `4ede1560` as a synthetic self-signed coordinator
  test fixture and removed at `01e8eb13` in favor of per-run ephemeral
  generation. Both removal/remediation commits are ancestors of the published
  head; current source contains neither historical literal representation nor
  committed test key. No production use or trust binding is evidenced, but
  the historical key is treated as compromised by definition. GitHub exposes
  no finding annotations, so exact provider incident-to-path mapping still
  requires authorized dashboard read access. Neither incident is dispositioned
  by this ledger, their contents must not be reproduced, and no rotation or
  false-positive decision may be inferred without the owner confirming that no
  external trust store or deployment ever used the synthetic certificate.
- Local test-only successor
  `beb03ceb149f7e961d1d78b148b8da425e553726`, tree
  `dc2329e0f6db22f20522c249d8b3bd12ae97d677`, adds a fail-closed historical
  fixture inventory guard without changing production migration code. It
  rejects retained post-v15 tables/indexes/triggers and all views before a
  fixture claims an older version, binds the registry to schema version 35,
  and protects the repaired v15/v5 fixtures. Adversarial guard checks are
  **2/2 PASS**, both historical regressions pass, the complete affected files
  are **82/82 PASS**, diff checks pass and independent review **ACCEPTS** the
  bounded change. It is unpublished.
- A separate local registration-only candidate based directly on default
  branch `5479c5d1ece3d697cf5c505e7feb431dc88baf75` is
  `6e3d1511a9711e752a8b5529164d8ecb54a4bf3f`, tree
  `1f50bf314ad8ac2d0684d8ee94d0754e09cc9276`. Its sole file is manual-only
  `.github/workflows/postgres17-windows-evidence.yml`, exact blob
  `121dbe0526e354a88e198203d0be65206e47a5d9`. Independent security review
  **ACCEPTS** registration scope: `contents: read`, full-SHA-pinned actions,
  no secrets and six explicit JSON output paths retained for seven days.
  Registration and merge execute nothing. Default branch lacks the referenced
  scripts and tests, so this registration-only candidate is not successfully
  runnable on `main`; any later dispatch must select and reverify an exact
  reviewed ref containing the workflow and every dependency. Publication,
  merge and every later probe/capture/rehearsal dispatch remain separate
  decisions. No workflow or PostgreSQL process has run from this candidate,
  and path allowlisting alone is not proof that future generated contents are
  sanitized.
- Swan subsequently authorized publication of that exact one-file candidate.
  Draft PR [#753](https://github.com/swanhtet01/swanhtet01.github.io/pull/753)
  is open and unmerged at head `6e3d1511`, base `5479c5d1`, with one changed
  file and 94 additions. Automatic App run `41358488806`, Kernel run
  `41358498488`, GitGuardian and platform audit are **PASS**. Dependency run
  `41358498515` is **FAIL / BLOCKED** on pre-existing default-branch findings:
  app minimatch plus Vite/source-map/Zod advisories, kernel minimatch, and
  Python OpenTelemetry. The PR remains draft and merge-blocked; the manual
  workflow was not dispatched and no PostgreSQL process ran.
- Separate default-branch dependency candidate
  `92733fbafd3827fb83476fae8ab270e1f16bb04d`, tree
  `5f5bf5bd3245ff5e77efeeb3f871934d54c51f14`, contains only five manifest and
  lock files. It replays previously reviewed exact fixes for Vite `7.3.7`,
  source-map-js `1.2.2`, Zod `4.6.7`, and the coherent OpenTelemetry
  `1.45.1`/instrumentation `0.66b1` family. JSON/TOML parsing, offline npm
  package-lock dry-run, `uv lock --check --offline`, TypeScript and lint are
  **PASS**; independent review **ACCEPTS** the bounded candidate. A clean
  offline npm install succeeded. The production build transformed and emitted
  assets but correctly failed its release seal because the isolated checkout
  lacked generated `dist/sw.js`; the required release-metadata precursor was
  not run. Clean Python environment installation is **BLOCKED / NOT RUN**
  because an unrelated wheel is absent from the offline cache. Exact-head PR
  #752 evidence already showed these four advisories clear, but minimatch
  remains deliberately unchanged and **BLOCKED**. This dependency candidate
  is not part of PR #753.
- Swan subsequently authorized publication of that exact five-file candidate.
  Draft PR [#754](https://github.com/swanhtet01/swanhtet01.github.io/pull/754)
  is open, unmerged and source-exact at head `92733fba`, tree `5f5bf5bd`,
  based on `main` at `5479c5d1`. Its binary patch SHA-256 remains
  `daf17609553a2e30907443c463dab8647b45e7695eb2d68ac080b45abe8d8e82`.
  Automatic App run `41360921212`, Kernel run `41360925760`, GitGuardian,
  platform audit and Python audit are **PASS**. App CI passed the exact-source
  guard, canonical contracts, disposable PostgreSQL checks, RLS/release
  guards, lint, deployment contract, canonical production build and desktop
  plus 390px journeys. Dependency run `41360925744` remains **FAIL / BLOCKED**
  only for the deliberately unchanged app and Kernel minimatch advisory: the
  app reports 10 moderate records and Kernel reports 5. The reviewed Vite,
  source-map-js, Zod and OpenTelemetry advisories are absent. No forced fix,
  merge, deployment or manual workflow dispatch occurred.
- A fresh security-boundary investigation confirms no safe minimatch repair can
  be built from existing trusted bytes. Modern ESLint/config-array and
  typescript-estree consumers require the v10 class/named APIs, while
  `eslint-plugin-jsx-a11y@6.10.2` has two callable-default v3 call sites that a
  blanket v11 override breaks. Cached minimatch `11.0.1` is a full matcher
  rewrite and requires `@isaacs/nonrecursive-glob-match@^1.0.1`, whose source,
  tests and provenance bytes are unavailable locally. Its
  `brace-expansion@5.0.12` dependency requires Node `20 || >=22` and in turn
  requires `balanced-match@^4.0.2`, so the proposed acquisition closure was
  incomplete and contradicts minimatch's advertised Node 18 support. A
  v10/v3-labelled
  backport would remain scanner-visible and cannot be called fixed. The gate
  therefore remains **BLOCKED** pending a compatible upstream jsx-a11y release
  or a separately authorized/provenance-reviewed v11 dependency plus narrow
  jsx-a11y adaptation and cross-platform matcher regression suite. No override,
  suppression, downgrade, exception or source patch was made.
- Cloud remains the sole Shop integration writer. Local owns independent
  Windows, installed-device and physical-hardware evidence only when those
  gates become executable. Recovery after an interruption starts by reading
  this section and the exact remote PR/ref, then checking the named worktree
  and live processes before resuming; an in-progress label without a process,
  source identity or receipt is not evidence. The verified native test
  preflight uses Flutter `3.47.8`, PUB cache `/home/agent/.pub-cache`, and LLVM
  tools at `/workspace/.toolchains/llvm-21.1.8-local/usr/lib/llvm-21/bin`.
  Every handoff retains exact commit/tree/environment and labels each gate
  **PASS**, **FAIL**, **BLOCKED** or **NOT RUN** without promoting evidence
  between source, CI, installed device, hardware, merchant or production.
- Release remains **BLOCKED** on a genuine authenticated PostgreSQL 17 Windows
  rehearsal and fresh receipt, a compatible dependency-security resolution,
  both GitGuardian findings, production signing, exact installed
  restart/restore, named hardware and Burmese paper evidence, merchant
  acceptance, and the joint go/no-go. Connected operation remains default-off.

All older checkpoint sections below are retained as chronology. Where an
older identity or status conflicts with this section, this exact-head section
is authoritative; evidence must never be combined across source trees.

## 2026-11-01 native full-suite successor checkpoint

- Local implementation `b696cff4da4c30372a1b0435242987bfb10d6f29`, tree
  `895acaf976023b0afc6650a720048757eae905f6`, is a clean unpublished
  successor of migration-fixture repair
  `f0e67950b0ed3990dc9b8968232f9f03cc03992c` and locked-resolution
  predecessor `484dd12bbf9171cba11267082db11138b3ae35bc`. Published draft PR #752
  remains separately at `27491e680c7767c45b3a8046d3e85cb5e3e36ee1`; this checkpoint is not
  merged, deployed, signed or distributed.
- Two legacy-database tests now remove all post-version schema groups before
  presenting fabricated v19/v18 stores. Production schema classification and
  backup verification remain fail closed. The complete café order-store file
  is **25/25 PASS** and the complete cash-movement file is **6/6 PASS**;
  focused formerly failing cases, analyzer and formatting are **PASS**.
- Native CI now retains all 52 unique Flutter test files in seven strictly
  serial, isolated shards: behavior core 14, shell 1, checkout 1, backup 1,
  persistence A 7, persistence B 9 and connected 19. Every shard uses locked
  dependencies (`--no-pub`), concurrency 1, a two-minute per-test timeout, a
  600-second ceiling, explicit status/elapsed checks and complete temporary
  cleanup. Before every shard, its timeout is reduced to the remaining
  aggregate budget and fails closed when none remains.
- The exact final seven-shard workflow block is **PASS / exit 0**. Recorded
  shard terminals include behavior core **212 PASS**, shell **74 PASS**,
  checkout **80 PASS**, the complete split persistence coverage **PASS**, and
  connected **249 PASS**. The prior measured run also passed every test but
  exited 124 only at its old 2,100-second aggregate guard; the evidence-backed
  final bound is 2,400 seconds inside a hard 60-minute Android job. This leaves
  20 minutes gross for all setup and post-shard work, not a guaranteed
  post-test reserve.
- Real process-interruption scenarios are **PASS / exit 0**; full Flutter
  analysis reports no issues; formatting and diff checks are **PASS**. Native
  CI contract tests are **21/21 PASS**, the contract verifier is **PASS**, and
  extracted shell syntax is **PASS**. Independent source review and final
  budget/control review both **ACCEPT** with no findings.
- On the clean successor, PostgreSQL provenance/observer self-tests are
  **80/80 Node + 30/30 Python PASS** and the Shop claims guard is **179/179
  PASS**. The read-only receipt verifier returns only
  `database_rehearsal_evidence_stale` with no secret exposure, preserving the
  intended fail-closed release boundary.
- Release remains **BLOCKED**: PostgreSQL 17 evidence is stale and the genuine
  Windows rehearsal is **NOT RUN**; dependency security remains red on the
  unsupported upstream minimatch range; exact-current hosted CI, signed
  artifacts, installed recovery, physical hardware, bilingual paper receipts,
  merchant acceptance and joint go/no-go are **NOT RUN**. Connected mode stays
  default-off and no gate is waived by this source checkpoint.
- Source-only observer capability successor
  `69d941f2e762a7034308ea964a23cccb02c11f6b`, tree
  `27b2785cd28a46d50e3c662880e022db5b3a0e02`, enhances only the
  non-authoritative Windows WPR probe. It requires a fixed signed
  `cmd.exe` → copied `where.exe` two-level tree and sanitized proof of stable
  parent/child correlation, zero exit status, full image/module paths, ordered
  start/image/end lifecycles, zero lost events/buffers and complete drain.
  Unrelated system-wide events cannot substitute for controlled evidence.
  PostgreSQL self-tests are **83/83 Node + 30/30 Python PASS**, syntax and diff
  checks are **PASS**, and independent review **ACCEPTS** the corrected parser.
  The probe remains `authoritative:false`; closure observer and approval stay
  pending with command/hash null. Real `windows-2025` WPR/tracerpt execution,
  installer download/execution, PostgreSQL and authoritative evidence remain
  **NOT RUN**.

## 2026-11-02 exact-head CI repair checkpoint

- Swan authorized and Cloud completed a guarded plain fast-forward of draft PR
  #752 from `5c69ebd9` to this exact ledger `72bb614f`; remote readback matched.
  No force-push, merge, deployment, signing, production change or merchant
  contact occurred.
- Exact-head App run `41338374033` is terminal **FAIL** only at canonical step
  638/668 (`hq:verify` 1/37), `database_rehearsal_evidence_stale`, with
  `secretValuesExposed:false`; all preceding contracts, disposable PostgreSQL,
  migration, RLS, dependency install, lint and build-contract steps passed.
- Exact-head Kernel run `41338377485` is **PASS**. Dependency run `41338377467`
  remains **FAIL / BLOCKED** only for the known app/kernel minimatch audit;
  platform, pip and added-line credential scanning are **PASS**. Official
  registry metadata still exposes no compatible upstream range.
- Native run `41338377466` has exact-current isolated Android, iOS and Windows
  QA plus unsigned iPad/iOS jobs **PASS**. The full Android job is **FAIL** at
  its isolated shard step; Windows PC subsequently passed. Terminal logs show
  no assertion failure: healthy behavior, persistence and connected shards
  were terminated at 4:48 solely by the 300-second aggregate guard. Local
  successor `adfaca5172d482b3e656d11064a9e603e84c0140`, tree
  `9366a0ee4dced9a249e33d810a9a80d2ed58100b`, raises only that fail-closed
  orchestration bound to an evidence-backed 480 seconds. Per-test two-minute
  limits, per-shard timeouts, isolation, exit-status checks and elapsed guard
  remain unchanged. Native CI contract **21/21 PASS**, verifier **PASS**, diff
  check **PASS**, independent review **ACCEPT**.
- The separately authorized non-authoritative Windows observer probe could not
  dispatch: GitHub returned HTTP 404 because the manual workflow is not
  registered on the default branch. No bypass, alternate transfer, installer,
  PostgreSQL process or database was attempted.
- Local PostgreSQL evidence hardening `7e7f02179bb47c03a3ec08cb62b1aced59eaf5fa`,
  tree `c2be5d037af618ddfbcc4e512bafc4508db2a58a`, now requires both zero lost
  events and zero lost buffers across the authoritative policy, approval gate,
  bootstrap validation and retained closure schema. Nonzero buffer loss is
  adversarially rejected; focused provenance/observer suite **50/50 PASS**,
  diff check **PASS**, independent review **ACCEPT**. Observer and approval
  status remain pending with command/hash null, so Stage 2 stays disabled.

- Published draft PR #752 is at `27491e680c7767c45b3a8046d3e85cb5e3e36ee1`,
  tree `f3e0c7b0a05e2eff3775ca23e8d91cbc62fd7edd`; it is not merged or deployed.
- App CI run `41336319981` passed checks 1--637/668 and now fails only at the
  intended PostgreSQL gate, `database_rehearsal_evidence_stale`; the migration
  inventory repair is verified while the genuine Windows PostgreSQL 17
  rehearsal remains **BLOCKED / NOT RUN**.
- Native run `41336324219` proved the prior member-identity snapshot repair,
  then exposed three test-fixture/contract defects. Local implementation
  `524b8cb2d7886626478a2e82048c18af958bb3f8`, tree
  `df9d684c06e2e89a052c2340b6196b8253d0b074`, removes v30--v35 objects before
  fabricating v15/v5 legacy databases and restores the documented
  `readRecentSales(limit: 31)` expectation to 31. Production migration,
  export, pagination, scanner and printer code is unchanged.
- Verification for `524b8cb2`: all three formerly failing focused tests
  **PASS**; complete operational-export database file **3/3 PASS**; Flutter
  foundation suite **77/77 PASS**; analyzer **PASS**; format and diff checks
  **PASS**; independent review
  **ACCEPT** with no findings. The provider workflow is terminal **FAIL** only
  because the Android job contains these now-repaired failures; both isolated
  Android/iOS QA jobs, iPad/iOS, isolated Windows QA and Windows PC jobs are
  terminal **PASS**. A successor provider run is **NOT RUN**.
- Dependency security remains **FAIL / BLOCKED** on the upstream ESLint-chain
  minimatch range. GitGuardian's historical test-literal incident remains an
  external disposition gate. This local successor is unpublished; automatic
  CI, installed-device, hardware and merchant acceptance are **NOT RUN**.

This is the one volatile status record. It cannot authorize publication,
spending, credentials, signing, merge, deployment, provider mutation, live
database work, billing activation, or production use. Verify remote facts
before acting; a newer fact never widens authority.

## Exact candidates

### Published integration lane

| Item | Verified fact |
|---|---|
| Integration PR | [#734](https://github.com/swanhtet01/swanhtet01.github.io/pull/734), merged at 2026-10-31 05:58:11 UTC as `4977d4caafa6921e83c97c950a154d3bd8aaf584`; this is not deployment or production acceptance, and release gates remain open |
| Branch | `codex/shop-public-main-port-20261022` |
| Last verified remote head | `1664b6ad6dfb3c0aa83e56104c006783d32b06c5`, tree `287f074dc7f7ef93052c3ca220fbb8a5c8912736`, read directly from the remote branch on 2026-10-31 UTC; terminal checks are recorded below and include App and dependency-security failures |
| Deployment behavior | Root `vercel.json` retains `git.deploymentEnabled:false`; the PR merge is established above, but no production promotion or manual deployment is established by this record |

### PostgreSQL post-merge integration lane

| Item | Verified fact |
|---|---|
| Post-merge base | `codex/shop-main-integration-20261022` at PR #734 merge commit `4977d4caafa6921e83c97c950a154d3bd8aaf584`, tree `287f074dc7f7ef93052c3ca220fbb8a5c8912736`. GitHub still reports `main` at ancestor `5479c5d1ece3d697cf5c505e7feb431dc88baf75`; open draft PR #730 remains the integration path from that post-merge branch to `main` |
| Replacement technical lane | Draft PR [#752](https://github.com/swanhtet01/swanhtet01.github.io/pull/752), branch `codex/postgres17-provenance-integration-20261031`. Published predecessor `e28acadf75b60f10c5e15763e4edb03ba509c0e0`, tree `0fcb92dbfb94e70f6d271077244874ddc880ebb4`; architecture-revision implementation checkpoint `d696c98ae9d402fbdb4eae25d61d6135f8b8b286`, tree `10f783aa50eb341533a2bd0efe8189e1ed38c36e`, patch SHA-256 `3675a4a7c0e7ee43ef043e2f263b57e30607ffbd1399899c444e7f0ba86acb00`; adversarial Node-substitution test successor `c56dd4befed5c77cb4d8d38652264edb86633c38`, tree `3926da1ab0510d87bccd2d15c953f88ca5755dc1`. Publication status is recorded separately; these identities alone are not Windows or release evidence |
| Architecture revision | The base contract requires an exact-clean-head Windows rehearsal and complete independently reviewed toolchain provenance, not a custom native broker, two-pass materialization or a Python session-authority protocol. The revised path keeps Node as the sole receipt authority, binds every runtime file to its real authenticated source and trusts only a fresh isolated single-purpose Windows x64 runner with no concurrent/interactive same-user workload. Hostile same-host mutation is explicitly out of scope unless a separately approved execution lock is restored |
| Exact local validation | On exact implementation checkpoint `d696c98a`, with the focused suite repeated on test successor `c56dd4be`: PostgreSQL profile/recorder self-test **50/50 Node + 28/28 Python PASS**, isolated hostile-`PYTHONPATH` import preflight **PASS**, full Kernel **495/495 PASS**, tool syntax/preflight **PASS**, claims guard **179/179 PASS**, Python compile and diff checks **PASS**. Independent review found six authority/closure/execution findings; the revised profile slice and integrated source path are independently re-reviewed **PASS**. The receipt verifier and `hq:verify` correctly stop at `database_rehearsal_evidence_stale`; the dependency audit remains blocked by the upstream minimatch range |
| Release gates | PostgreSQL installer byte identity and publisher authentication are evidenced read-only, but the canonical retained observation file, runtime materialization, multi-source bindings/load closure, Windows rehearsal and fresh receipt remain **NOT RUN**. Receipt verification and `hq:verify` remain correctly blocked; no installer execution, database, merge, deployment or release readiness is established |
| Local source-authentication successor | Local-only implementation checkpoint `05092ef889e4c65b034e63388514ae0b430ddc5e`, tree `c809f96b71d89d146053c544e9ff48d848c4771c`, based on clean local predecessor `f6eab0b1e0d2d83415679129decab25cb4a29745`; binary patch SHA-256 `0a79bc020fcf604fbad652ce88d60acba96c06e78fd62d7df9626e3ad0425572`. It preserves the manual-only exact-SHA `windows-2025` workflow and adds fail-closed component-specific source authentication: exact official Authenticode artifacts for Python/Node/Git and the one PostgreSQL parent bundle, paired PyPI pure/binary Psycopg wheels, and an OpenSSL member bound to the freshly verified primary PostgreSQL source. Runtime authority requires a fresh Windows observation; deterministic receipt reconstruction is explicitly separate and cannot replace it. An unvalidated native observer was removed rather than represented as evidence. Stage 1 remains non-authoritative and Stage 2 remains blocked because exact registry artifacts/retained evidence/approval and a reviewed loss-aware Windows closure mechanism do not exist. PostgreSQL self-test **63/63 Node + 28/28 Python PASS**, focused source/profile checks **35/35 PASS**, Kernel **495/495 PASS**, claims guard **179/179 PASS**, and independent final security review **PASS**. `hq:verify` remains correctly **FAIL/BLOCKED** at step 1/37 with `database_rehearsal_evidence_stale`. Windows execution, download, installer execution, database rehearsal, workflow dispatch/upload and fresh receipt are **NOT RUN**. A standing publication hold prohibits pushing this successor, editing PR #752 or dispatching the workflow |
| Local authenticated-preflight successor | Local-only implementation checkpoint `2ac3b183162d85d0307a949938f40c143853da2f`, tree `6d906ca73ed726000afb7f4fbff082d425ff77b7`, based on clean status predecessor `59397679ca74c20601a04d5ac891c856926b6704`; binary patch SHA-256 `b1630a8cb62fffa720fc28c278356142a619e282879234983db9eafd9aefcb53`. The advertised legacy preflight now delegates only to the canonical Node recorder, which verifies the complete source-controlled profile and current Node identity before returning a path-free, non-authoritative summary; direct Python `--preflight`, including the `--import-preflight` flag combination, fails before helper or subprocess execution. The authenticated full recorder remains available. Managed-pilot and HQ receipt reconstruction now pass the already-validated receipt toolchain to `buildSanitizedProof`. PostgreSQL self-test **65/65 Node + 30/30 Python PASS**, Kernel **495/495 PASS** plus **69/69 connector** and **15/15 crew** resilience, claims guard **179/179 PASS**, tool syntax **988 scripts PASS**, diff check **PASS**, and independent final bypass review **PASS** after one flag-combination finding was fixed. `hq:verify` remains correctly **FAIL/BLOCKED** at step 1/37 with `database_rehearsal_evidence_stale`. Successful Windows preflight/full rehearsal and a fresh receipt remain **NOT RUN**. No push, PR edit, CI dispatch, installer execution, database, deployment or provider mutation was performed |

### Current private runtime candidate

> **Historical/superseded for the connected pilot.** The identities in this
> section describe earlier single-device runtime and QA work. The only current
> connected-pilot source identity is the frozen checkpoint in the next section;
> no APK, CI run, gallery archive, or installed evidence from this historical
> section may be carried forward to it.

| Item | Verified fact |
|---|---|
| Exact private technical checkpoint | Runtime implementation `11b52a597022f75f61fd61eee88b34d2dcfc1321`, repository tree `4db976717383a844ba08203f1bd5a359bfe0a121`; publication remains prohibited |
| Native identities | Current test-inclusive `mobile/shop_pos` tree `6675771e443dd1860ee16cac897d212064747bfd`; current runtime `lib/` tree `2e3791758444b3d669de1162e1a5acb34f61b3f8`. The independently accepted QA APK remains bound to older runtime `cc0efa4f` / `lib/` tree `504d6113d88163a066371462cd26e8fa64633658`. A current-source debug APK was retained for `11b52a59`, but its post-build control failed closed and it is not accepted release provenance |
| Runtime successor | `cc0efa4f56174c636fcd28cbdcf1e24c2db8349c`, containing cash-tender runtime `35d5b1d2`, v1 migration repair `1b2686bc`, and immutable cafe product-name snapshots |
| Pending-cash stock-reservation successor | Private implementation `8305a207` makes a pending counter or cafe cash intent reserve its saved quantities. Intent creation rejects insufficient unreserved stock; counter, cafe and wallet sale commits atomically preserve every other pending cash reservation; only a successfully validated current pending operation excludes its own reservation. Cancellation releases the reservation. Counter EN/MY and cafe UI now report the quantity available for the specific sale/order instead of misreporting physical on-hand stock. File-backed restart and widget regressions prove both reservation directions, rejected competitors leave sale/stock/outbox/order/pending state unchanged, and cancel-then-retry remains usable |
| Pending cash-reversal shift-close successor | Private implementation `11b52a59` prevents closing only the cash shift that owns an unresolved cash-reversal intent, preserving restart/retry and same-shift idempotency while leaving unrelated shifts and noncash work unaffected. Focused correction-consumption suite **17/17 PASS**, analyzer **PASS**, EN/MY guidance checks **PASS**, and independent final diff review **PASS**. Corrections remain production-disabled |
| Native local verification head | `f58be5f7bcdaf8b3f83ee5d7c89712fca282a4bd`, repository tree `919a1368d86f6c87d4e875b51adcf72d8587416b`; later evidence/docs/tooling changes leave native tree `f110be98` unchanged |
| Reviewed implementation/provenance head | `0af2750165f7d3925d4b106e7e91e44bc069350b`, repository tree `eefc0089c8ed17dead51fe5718a63aee218d807d`; includes release-truth reconciliation and source-only iOS/Windows QA provenance hardening, with native tree still `f110be98` |
| Latest private release-integrity checkpoint | `1213fa189de3912d95e0c3e18c6bb8913a257234`, repository tree `b5d182d1a748d176c4068da60dd6059dc28af5e9`; aligns the gallery verifier/refresher with the independently reviewed current native-CI workflow bytes, while leaving the native tree `f110be98` unchanged |
| PostgreSQL provenance source successor | Implementation checkpoint `d696c98ae9d402fbdb4eae25d61d6135f8b8b286`, tree `10f783aa50eb341533a2bd0efe8189e1ed38c36e`, removes the non-required broker/session/two-pass path and retains the base's exact source, lock, Windows-only, TLS, dump/restore, receipt and cleanup gates. The revised canonical profile uses authenticated `sources[]` and `bindings[]`, including exact Node and Git execution bindings; PostgreSQL cannot downgrade from Authenticode and locally asserted digest evidence is synthetic-only |
| Latest private public-smoke checkpoint | `20aa48b28c3469244f87f7507e05477ecbdb0be2`, repository tree `b23c022aeea186c2e49450c5f279c6cc94387551`; aligns live smoke checks with the Shop-only EN/MY surface, retired namespace 404 precedence and exact no-redirect behavior |
| Branch | `codex/postgres17-provenance-integration-20261031`, the single authorized replacement technical lane layered on the post-#734 merge branch |
| Successor classification | Includes reviewed website telemetry privacy `897a207c` + `64d26887`, managed/local workspace-controls privacy `2a80479d` + `957fcd12` + `87651b97`, Settings/company-recovery privacy `40f47962`, managed-account support routing `f0030f28`, privacy-aligned app verifier `040ffbff`, managed access-entry clarity `9fa44b4a`, public signup transition guard `ec0919cd`, verifier/contact-contract repairs through `8cb51ee0`, PostgreSQL version-binding hardening `d7399679`, durable native cash-tender v22 runtime `35d5b1d2`, empty-v1 migration repair `1b2686bc`, and cafe product-name snapshot repair `cc0efa4f` |
| Publication | Draft integration only; not merged, deployed, signed, or release-ready. Automatic CI on the replacement lane remains evidence, not production approval |
| Worktree note | Exact-current gallery captures are absent. Accepted private QA APK for native `cc0efa4f` remains at SHA-256 `ca5c7fa4...bf11`; installation is absent and it is stale for private runtime `11b52a59`. The source-matched debug APK at SHA-256 `cc9ad247...9be3` is private QA only and remains on build-control **HOLD** because Flutter wrote outside the preflight-bound output root. A bounded handoff from Local Tech Lead task `01a0d249-2b5d-7d83-a769-79336eeb777c` appoints this task as the single Cloud Tech Lead coordinator and reserves machine-specific evidence plus independent final review to Local. Do not claim full synchronization, recreate the Local task or duplicate its branch |

### Connected-pilot private checkpoint

| Item | Verified fact |
|---|---|
| Frozen candidate P | Default-off integration source `3f5fc8fddbe2269d986a285ac8549a8f38550951`, repository tree `5617429cebd276e9ed57f74c961028fa370e96b6`, native tree `4a4856126e8cf2d36e20db3f57652fbe116540a8`, runtime `lib/` tree `ff98f1167c6b20af3a0d452400f32cdebc56d0de`; runtime implementation ancestor `58b5a37c635fdb896446f67c18d8c957517f158d`; native database schema **v35**, source-only PostgreSQL schema **v15**, connected protocol **v1**. The `3f5fc8fd` successor adds only reviewed Android artifact-evidence tooling around the unchanged native/runtime source. This is the only source identity to use for new connected-pilot evidence |
| Implemented, default-off | Strict connected-site contracts; atomic SQLite command/event/stock/audit/ack persistence; signed offline-lease verification and a default-off issuer adapter; coordinator dispatcher/database adapter; durable enrollment, revocation, reservation, café command and client-replica evidence; QR-pinned HTTPS discovery; bounded default-off cloud reconciliation; and fail-closed Node/Python PostgreSQL evidence contracts. The shipping application owns one capability-bound connected-runtime lifecycle: normal production/QA startup is network-silent and disabled, an enabled profile without reviewed runtime authority is visibly blocked, capability-object substitution is rejected, coordinator shutdown is retried once before SQLite close, and SQLite remains open if listener cleanup is uncertain. The coordinator dispatcher shares the runtime's write gate: omission defaults closed, commands are rejected before authorization while paused, the gate is atomically reacquired after authorization, and every admitted command holds a write lease until the raw persistence Future terminates. An HTTP timeout cannot release that lease early; pause/revalidation/stop wait for the true database operation before host or SQLite teardown. The exact same immutable gate instance is now required across server, transport, host and runtime constructors, so a mismatched shipping composition fails before any listener or native lifecycle side effect. Android's strict MethodChannel bridge polls persisted foreground-service readiness and Windows has the matching strict Dart/native single-owner bridge. Native v35 retains canonical signed command and lease bytes plus device enrollment, coordinator binding, issuer, event and derived-transition bindings. Source-only PostgreSQL v15 retains FORCE RLS, backend-only policies, immutable events, exact idempotency and explicit conflicts, but no production route is mounted. Android's issuer registry remains intentionally empty; Windows non-exportable Ed25519 support remains disabled. No ordinary runtime profile enables connected operation |
| Exact validation | At exact implementation head `58b5a37c`: application boundary, runtime, coordinator host and TLS coordinator focused suites **60/60 PASS**; focused analyzer **PASS**; native CI contract **20/20 PASS**; claims **179/179 PASS**; diff check **PASS**; and independent final composition/security review **PASS** after the reviewer-required server-to-transport positive and negative identity tests were added. Adversarial tests prove every server → transport → host → runtime gate link, default omission stays closed, pause during authorization prevents mutation, and a timed-out command keeps the write lease until its underlying handler actually finishes. The predecessor `e45a2b83` database-adapter evidence and the earlier `3f18e586` full Shop shell **74/74 PASS** remain ancestral, not exact-head full-suite results. Full QA Kotlin compilation was previously attempted with the pinned offline toolchain but correctly stopped before compilation at `shop_android_build_identity_mismatch`; no identity file or guard was changed. Windows compilation is **NOT RUN** in this Linux environment. Full TypeScript project checking is **NOT RUN** because the local Showroom dependency tree is absent. The canonical receipt verifier intentionally remains **FAIL / BLOCKED** with `database_rehearsal_evidence_stale`, `secretValuesExposed:false` |
| Day-1 freeze and handoff | Candidate P manifest `/workspace/private-artifacts/connected-pilot-3f5fc8fd/candidate-manifest.json` is retained at **5,391 bytes**, SHA-256 `0ac47dd99a9d25ada18b504f2aa2503322ec6d7f74b8f9875159baa0be1c9ebd`, mode `0600`; its detached checksum and independent manifest review **PASS**. The reviewer recomputed all six source-input hashes and exact implementation/repository/native/runtime/ledger identities, reran Android evidence **95/95**, native CI and strict source-only QA contracts, and claims **179/179**, with no discrepancy. Runtime evidence remains the exact `58b5a37c` connected suites **60/60**, analyzer **8 items / 0 issues**, native CI contract **20/20**, claims **179/179**, diff check **PASS**, no skipped tests and no first failure. The manifest is source/toolchain evidence, not an application artifact: exact-current Android/Windows builds, installed Flutter archive proof, production signing, installation and launch remain **NOT RUN**; `promotionEligible:false`. Day-0 test-only successor `9f2b45331c8734b4c12c643d9ba375c598bc43ed`, tree `98719bcff24fbf0afc54e728ebb4b81a959675b7`, isolates the filled-worksheet negative CLI case from the unrelated live database gate; **7/7 tests and 6/6 self-test checks PASS**, independent review **PASS**, while the real no-argument Day-0 command remains correctly **FAIL / BLOCKED** at `managed_pilot_readiness_local_database_invalid` |
| End-of-week critical path | **NO-GO unless two red gates materially change.** PostgreSQL 17 is **BLOCKED**: only EDB installer identity/publisher evidence exists; canonical observation, 14 runtime bindings, authenticated Python/Psycopg/OpenSSL/Node/Git sources, reviewed loss-aware observer, complete load closure, isolated Windows execution and fresh receipt are **NOT RUN**. Dependency security is **BLOCKED**: the committed lockfiles resolve vulnerable minimatch 10.2.5/10.2.6/3.1.5; current/latest ESLint/config-array/typescript-estree ranges still exclude minimatch 11, jsx-a11y uses the legacy callable API and supports ESLint only through v9, so force/override/downgrade/suppression is prohibited. Owners: Cloud for bounded source/contracts and compatible dependency integration; Local for isolated Windows/device evidence; Swan for runner/signing/distribution authority; Vivian for named merchants/hardware/support. The 8 November controlled pilot remains possible only if both hard gates, exact-current signed artifacts, installed recovery, LAN/hardware/EN-MY evidence and merchant entry all pass; otherwise the required outcome is **NO-GO**, not a reduced claim |
| Android exact-artifact evidence contract | **SOURCE PASS / FREEZE-LEDGER CI ARTIFACT PASS / INSTALL NOT RUN**. Integration source `3f5fc8fddbe2269d986a285ac8549a8f38550951`, repository tree `5617429cebd276e9ed57f74c961028fa370e96b6`, retains frozen native tree `4a4856126e8cf2d36e20db3f57652fbe116540a8`. Android synthetic-QA CI retains one canonical six-file archive binding APK bytes/checksum, exact Git source/tree/native tree, structurally inspected application/capability/version/compile-min-target SDK/ABI identity, generated build-identity digest, observed Flutter toolchain, verified single debug signer certificate, and exact `apksigner` launcher/JAR/Build Tools metadata. Late tracked and untracked drift fail closed; manifest publication is exclusive; debug signing, `productionSigned:false`, `promotionEligible:false`, and all installed/hardware/merchant/production claims remain false. Focused cross-contract suite **95/95 PASS**; native and strict QA verifiers **PASS**; independent final source/workflow review **PASS** after two review rounds corrected real ABI-directory and staged-file allowlist failures. Automatic job `124884577889` built and uploaded the canonical promotion-ineligible archive at freeze-ledger head `4f718596`; the original bytes and receipts have not yet been independently downloaded or installed, and production signing is **NOT RUN** | Cloud Tech Lead source; Local Tech Lead artifact/device evidence | Local retrieves and independently verifies the original six-file archive plus run/artifact metadata; v3 handoff verification precedes any disposable-target installation. Do not relabel old APKs or treat CI build success as installed acceptance |
| Exact-head publication and local CI repair | The specifically authorized plain fast-forward advanced draft PR #752 from `721922ebebeb6a13a44ff128863d2abc471252b6` to freeze ledger `4f718596d4f9dfaac071509d24b3bd5f16446731`; no force, merge, deployment, signing or manual dispatch occurred. Automatic exact-head Kernel run `41318847577` **PASS**. App run `41318846990` **FAIL** only because the legacy v13 proof omitted the deliberate source-only v15 migration from its source inventory. Dependency run `41318847535` **FAIL** only at the existing minimatch `<11.0.1` advisory in app/kernel lint chains; platform, pip and added-line credential scan **PASS**. Native run `41318847554` **FAIL** overall: iOS, Windows, Android synthetic QA, iOS synthetic QA and Windows synthetic QA jobs **PASS**; the main Android job stopped at one formatter-only blank line in `shop_runtime_profile.dart`, and the later design-upload error was downstream because capture never ran. Local unpushed repair `8f994d2728c0131699acb9e88479cf0febb17abb`, tree `13dff9e564a006a3da40084e12a3adceb638ddb5`, formats that file and binds the v13 source identity to `CURRENT_MIGRATIONS + SOURCE_ONLY_MIGRATIONS` while still executing only the 23-entry v13 chain and v14 main chain. Focused Python **39/39 PASS**, native CI contract and claims **179/179 PASS**, diff check **PASS**, independent re-review **PASS**. Exact successor CI is **NOT RUN** pending separate scoped publication authority. GitGuardian incident `39348798` is independently reviewed as a non-secret historical test literal, but the supported false-positive disposition is **BLOCKED** by dashboard authentication and remains unchanged |
| Exact-head `3e92dd3f` CI diagnosis and private successor | Draft PR #752 exact-head runs are terminal: Kernel `41333346324` **PASS**; App `41333341810` **FAIL** at the rehearsal-packet migration inventory; Native `41333346267` **FAIL** at four synthetic v15→v16 member snapshot fixtures after its inventory guard passed; Dependency `41333346291` remains **FAIL** only for the unsuppressed minimatch advisory; GitGuardian remains unchanged. Private, unpushed repair `46eafa4c91676b8051d3d3ef195c844dfceea555`, tree `5e5db50818786555c11958d9fa4bb7a40ab83a58`, preserves the 25-entry executable PostgreSQL chain through v14 and separately digest-binds the single v15 connected-site source migration in both packet and preview-proposal contracts. It also makes the four synthetic legacy snapshots actually remove every post-v15 schema group; production snapshot verification is unchanged. Packet/proposal tests **13/13 PASS**, proposal self-test and tracked `--verify` **PASS**, proposal-consumer tests **38/38 PASS**, migration verification **PASS** with 24 private migrations / schema v14 / 153 checks, member tests **19/19 PASS**, affected backup/adapter tests **124/124 PASS**, analyzer **PASS**, and two independent reviews **ACCEPT**. `verify_hq_contract` remains correctly **BLOCKED** by the independently stale v13 managed-pilot readiness evidence; no real PostgreSQL 17 rehearsal, hosted CI rerun, installation, signing, hardware or merchant proof is implied. Publication and exact-successor CI are **NOT RUN** pending separate exact authorization |
| PostgreSQL v14 readiness prerequisite | Private, unpushed source prerequisite `fe06af927e1b6c0b419cf9f177055d4a3b84fee0`, tree `674c18b3992dc07c287f88b9dce57741a357875e`, aligns the HQ, technical-estate and strategy consumers with the canonical v14 contract: 24 private migrations, 79 behavior checks, 33/33 catalog checks and drift `14 - liveSchemaVersion`. Documentation now states that v14 is the source target, the accepted v13 receipt is historical, and fresh v14 PostgreSQL 17 evidence is **NOT RUN**. A synthetic fully validated v14 ledger proves technical-estate generation/verification convergence while an explicit negative test keeps the tracked v13 readiness rejected. Affected tests **25/25 PASS**, strategy self-test **4/4 PASS**, syntax/diff checks **PASS**, independent review **ACCEPT**. The real gates intentionally remain **FAIL / BLOCKED**: recorder `database_rehearsal_evidence_stale`, readiness `managed_pilot_readiness_local_database_invalid`, and technical estate the same stale-readiness rejection. No database, installer, hosted service, production write or external action ran |
| Local dependency-security investigation | **FUNCTIONAL PASS / SECURITY BLOCKED.** Fresh targeted audits reproduce **10 moderate app/showroom records** and **5 moderate Kernel records**, all rooted in GHSA-g3hv-75wg-m249 (`minimatch <11.0.1`). The affected packages are development/lint dependencies; no product-runtime import was found. As of 2026-11-01, latest `eslint@10.14.0`, `@eslint/config-array@0.23.5`, `@typescript-eslint/typescript-estree@8.72.1`, and `eslint-plugin-jsx-a11y@6.10.2` still declare minimatch ranges below 11; jsx-a11y also uses the removed callable CommonJS API and declares ESLint peers only through v9. npm's offered fixes are prohibited breaking downgrades. A prototyped global override/postinstall idea was rejected before retention because it is a forced substitution outside every consumer range. A compliant fix requires supported upstream ranges or independently maintained forks of the four consumers, including the two jsx-a11y named-export adaptations; that is not a bounded dependency update and no source change was retained. Exact-policy clean Showroom install/lint/production build/TypeScript **PASS**; Kernel lint **PASS with 0 errors / 62 existing warnings** and tests **495/495 PASS**. Independent read-only dependency review **PASS** on this blocked conclusion. The audit gate remains red and unsuppressed |
| PostgreSQL Windows rehearsal execution assessment | **SOURCE CONTRACT PASS / EXECUTION BLOCKED / NOT RUN.** Focused profile, source-registry, bootstrap, observer and sanitized-evidence contracts **50/50 PASS**; claims guard **179/179 PASS**. The receipt verifier remains the intended **FAIL** at `database_rehearsal_evidence_stale`, with `secretValuesExposed:false`. The only source-controlled bounded workflow path is exact-SHA, manual `workflow_dispatch`, `contents:read`, `windows-2025`, with no explicit secrets and checkout credentials not persisted. It cannot produce authoritative evidence from the present source: the canonical profile is `pending` with no runtime bindings; the publisher and official-source policies are pending; retained installer observation, exact authenticated Python/Psycopg/OpenSSL/Node/Git artifacts, independent approvals, observed process/module closure and executed/retained Windows observer-probe evidence are absent. Capture is explicitly non-authoritative and Stage 2 fails closed. This task does not authorize manual dispatch, and no existing artifact or stale v13 receipt can substitute. Minimum unblocker: independently approve and commit the complete exact-artifact source/profile/publisher evidence and runtime bindings at one published exact SHA, validate the observer probe on an isolated Windows runner, then obtain one explicit manual rehearsal-dispatch authorization. No workflow was dispatched and no installer or database was run |
| Evidence classification | APKs, CI artifacts and gallery captures preceding freeze-ledger head `4f718596` are **STALE/HELD**. The automatic `4f718596` Android/iOS/Windows synthetic-QA archives are exact-head, internal-only and promotion-ineligible; their original bytes have not yet been independently retrieved or installed. Installed Keystore/TLS/foreground-service behavior; Windows runtime/DPAPI/app-host behavior; Windows WPR observation; real private LAN; hosted RLS; actual issuer registry; deployed reconciliation; physical hardware; production signing; and merchant acceptance are **NOT RUN**. Local successor `8f994d27` is not published and has no CI artifact |
| Build-capacity preflight | Read-only measurement after freezing `58b5a37c`: durable `/workspace` on `overlay` **314,601,472 bytes free**; `/tmp` **7,017,017,344 bytes free**; `/dev/shm` **5,727,744,000 bytes free**. Retaining one expected-size Android QA APK (historical comparator **196,161,020 bytes**) plus the required **384 MiB / 402,653,184-byte** durable reserve needs at least **598,814,204 bytes**, leaving a **284,212,732-byte durable shortfall** before build intermediates or variance. No non-defunct active build process was observed; numerous inherited zombie process entries are not active capacity. Build preflight remains **BLOCKED** and no build was started; tmpfs alone cannot satisfy durable artifact retention |
| Release state | **NOT READY / default-off.** The source foundation and bounded security contracts are materially advanced and independently reviewed, but release remains blocked by the authenticated disposable PostgreSQL 17 rehearsal and fresh receipt; compatible dependency-security closure; real issuer approvals and keys; enabled transaction and cloud/RLS proof; Android foreground-service plus installed Keystore/TLS validation; Windows app-host/DPAPI validation; exact-current Android and Windows artifacts; restart/restore; named scanner/printer with EN/MY paper; two-merchant acceptance; 14 stable trading days; and explicit joint go/no-go |

The runtime successor composes the reviewed retail foundation, durable
cash-movement records, device-local cafe orders, modifiers and remarks,
area/table identity, local whole-unit bill splitting and constrained undo,
append-only kitchen/bar dispatch and status history, indexed catalog search,
stock activity/physical count, fail-closed kitchen entitlement, and fail-closed
managed staff role guards. It now also persists optional cash received and
derived change as immutable retail/cafe receipt evidence across retry, reopen,
reprint and backup/restore while shift totals continue to use the sale value.
Legacy sales keep unknown/null tender, and a real empty v1 database is covered
through strict v22 migration. New cafe lines preserve the ordered product name
through catalog rename/archive, reopen, split/undo, kitchen dispatch,
receipt/outbox and encrypted restore. Pre-fix tickets cannot recover a name
that was never stored and retain an explicit current-catalog fallback. This is
not an installed or production candidate.

Source-bound verification:

- predecessor cash-tender/v1-repair checkpoint `1b2686bc` / native tree
  `d8cafd8e`: analyzer **PASS**;
- predecessor isolated behavior/widget shard: **357 PASS, 0 FAIL** in 148 seconds;
- predecessor isolated persistence/recovery shard: **258 PASS, 33 intentional visual
  capture SKIP, 0 FAIL** in 221 seconds;
- predecessor combined evidence: **615 PASS, 33 SKIP, 0 FAIL**, with each
  shard inside the repository's 300-second ceiling;
- predecessor backup suite: **100 PASS**; affected foundation/member/cash/export suites:
  **104 PASS**; retail/cafe/pending suites: **36 PASS**;
- focused v21-to-v22, real empty-v1-to-v22 and adversarial v22 backup checks:
  **PASS**;
- independent cumulative review, including the v1 migration repair: **PASS**;
- managed/local Workspace Controls and Settings identity/recovery checks: **36
  PASS**. Two real Chromium StrictMode cases render the actual production pages:
  delayed file reads and a lock-delayed restore remain blocked after local access
  changes, while a pre-seeded Settings restore point loads on initial confirmed-local
  mount, disappears while identity is checking, and reloads only after local access
  is confirmed again;
- Settings/company-recovery privacy at `40f47962`: focused **14/14 PASS**;
  backup contract **134** checks plus nested **21/21 PASS**; security contract
  **107/107 PASS**; workspace identity boundary **7/7 PASS**; matched-lockfile
  Settings/company panel bundle and independent final review **PASS**;
- managed-account support routing at `f0030f28`: exact account-hub tuple,
  near-miss, EN/MY, persistence/idempotency/notification, payload-safety and
  v1-v4 retry compatibility checks **PASS**; client suite **25/25 PASS** and
  independent review **PASS**. Workflow remains `guide`, template remains
  blank, and no hosted delivery or owned tenant support case was exercised;
- contact-generator reconciliation at local-only checkpoint
  `6ed563cc32423dc67389179b4ef2a6c3dc6e6a09`, tree
  `982fd4d463451ed16b4f2c2d6dc7fb2a0bb5e0d1`, restores that account-help
  behavior where the current generator blob had lost it. Exact singleton
  `product` + `template=managed-account` + `utm_source=app` +
  `utm_medium=business_setup` handoffs show support-only EN/MY copy while the
  submitted workflow stays `guide` with blank plan/template/service. Duplicate
  or near-miss authority fields remain ordinary contact intent across language
  switching. Focused intent **4/4 PASS**, public deploy guard **37/37 PASS**,
  syntax **990 scripts PASS**, demo-playbook **531 checks PASS**, claims guard
  **179/179 PASS**, and independent final review **PASS**. The full public build
  and generated EN/MY receipt suite remain **BLOCKED/NOT RUN** at the preserved
  `native_shop_gallery_source_tree_drift` provenance gate; the broader account
  route suite is also **NOT RUN** because the existing local `typescript`
  dependency is absent. No package install, push, CI, publication or deployment
  was performed;
- managed access-entry clarity at `9fa44b4a`: rendered account-route suite
  **88/88 PASS**, product visibility **11/11 PASS**, EN/MY contact receipt
  generator **25/25 PASS**, and independent review **PASS**. Public Shop,
  account-hub, generic/invalid intent and private review/recovery paths retain
  exact bounded destinations; the form explicitly does not create an account
  or grant access;
- account/verifier reconciliation through `8cb51ee0`: public portal transitions
  cannot retain or submit the internal account-creation form; focused account,
  signup, cash-tender and contact/playbook checks **PASS**, deterministic lint
  inventory and storage-durability verifier repairs independently reviewed
  **PASS**. The exact canonical app verifier passes checks 1--637, then remains
  correctly fail-closed at HQ check 1 with `database_rehearsal_evidence_stale`;
  independent checks 639--668 **PASS** and are not represented as one aggregate
  release pass;
- PostgreSQL provenance is being revised on the sole PR #752 lane to the base
  contract's smaller trusted-runner design. Node remains the sole receipt
  authority and must bind every executed, imported and non-system loaded file
  through canonical authenticated `sources[]` and `bindings[]`; Python emits
  only a raw non-authoritative behavior report. The exact EDB PostgreSQL
  17.11-5 Windows x64 installer was downloaded twice without execution; both
  copies are 413,001,200 bytes with SHA-256
  `612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072`,
  matching Winget's pinned manifest. Windows reports valid embedded
  Authenticode, code-signing EKU `1.3.6.1.5.5.7.3.3`, signer raw-DER SHA-256
  `558b34d97944a53cefc13c031ea46845be00f0b9bb87f47dc3110eaee07f82d3`
  and timestamp-certificate raw-DER SHA-256
  `2da09da7f4131f9fe72db6c5e6e9c9656755af043f1ea742cc0d2120e141ebfc`.
  This establishes artifact identity and publisher authentication, not runtime
  closure or rehearsal authority. The retained canonical observation digest,
  materialized file inventory, authenticated Python/Psycopg/OpenSSL sources,
  complete load closure, isolated Windows run, fresh receipt and independent
  approval remain **NOT RUN/BLOCKED**. The trusted execution boundary excludes
  hostile concurrent same-user mutation; any such threat requires a separately
  approved execution lock. The read-only receipt verifier remains correctly
  blocked at `database_rehearsal_evidence_stale`. Local source successor
  `05092ef8` now makes the official-source methods closed and component-specific,
  requires exact PyPI pure/binary Psycopg pairing, and cross-binds OpenSSL to the
  exact freshly authenticated primary PostgreSQL parent. Runtime verification
  and receipt-only reconstruction are separate contracts, so retained evidence
  cannot impersonate a fresh Windows signature observation. No validated
  loss-aware Windows observer exists; the attempted custom observer scaffold was
  removed after review rather than used to clear the gate;
- privacy-aligned app verifier at `040ffbff`, verified again at `9fa44b4a`: focused local-recovery contract
  **14/14 PASS**, independent review **PASS**, exact-source canonical website
  build **PASS** (301 modules; offline precache 42 files / 2,083,862 bytes),
  TypeScript app/node typecheck **PASS**, built-artifact verifier **PASS**, and
  current-release artifact self-test **PASS** (134 checks; 8 login mutation checks).
  `ManagedLoginPage.tsx` lint **PASS** with a 1 GiB bound. The complete showroom
  lint now runs as a fail-closed deterministic 10-shard inventory: **748 files,
  6,134,265 bytes, PASS**, inventory SHA-256
  `ee6121ba7f3d9dcd6bc820cdbdcbcd4365fba07a953d224d29226bfe0c2a139b`.
  The matched external ESLint bridge requires identical lock/config bytes and the
  exact pinned ESLint manifest/CLI bytes; it is not a claim that every transitive
  `node_modules` byte is attested;
- exact current cafe product-name checkpoint `cc0efa4f` / native tree
  `f110be98`: analyzer **PASS**; affected store/table/screen
  suites **69/69 PASS**; backup suite **101/101 PASS**; contract suite **8/8
  PASS**; rename/archive/reopen, encrypted restore and rendered snapshot cases
  **PASS**; independent final review **PASS**;
- pending-cash stock-reservation checkpoint `8305a207` / native tree
  `f62edf75` / runtime `lib/` tree `b2b4ef90`: exact-source analyzer
  **PASS**; sequential behavior shard **361/361 PASS** in 2:34, log SHA-256
  `5660cf38443e107d184fc36c60404d4ca61cf0557441b28ed4db5ebf7387c4fb`;
  sequential persistence/recovery shard **265 PASS, 33 intentional
  visual-capture SKIP, 0 FAIL** in 3:44, log SHA-256
  `8de14a7283507d7cb7f9dc3e1ad88be780edbdb3327754b21758d281b4173537`;
  real subprocess interruption harness **14/14 PASS**, log SHA-256
  `bef2eb9490a59eefb01c02bb8b39b62a5117999dee22c1ed1ab55ae2871e2fda`;
  claims guard **179/179 PASS**. Focused reservation-conflict UI regressions
  **3/3 PASS** cover counter EN/MY and cafe, preserve physical on-hand truth,
  and assert no sale, movement, outbox or order-state effects. File-backed
  SQLite tests cover both reservation directions across restart, cancellation
  release, exact-once completion and rollback. An initial behavior run exposed
  three misleading stock-copy failures; the failed log remains preserved, the
  copy was corrected to say quantity available for the sale/order, and
  independent final source re-review is **PASS**. This is synthetic local
  evidence, not installed-device, cross-device or merchant acceptance;
- exact-native-tree local verification at whole-repository `f58be5f7`, native
  tree `f110be98`: sequential behavior shard **358 PASS, 0 SKIP, 0 FAIL** in
  2:47, log SHA-256
  `7b77aa9a479d5099437ed2fb6617aacbdfe97d4816a1ce88f70d6d50907fccd8`;
  sequential persistence/recovery shard **263 PASS, 33 intentional opt-in
  visual-capture SKIP, 0 FAIL** in 3:46, log SHA-256
  `7be34f2810a3e3a32d817cf60b6abf02fd78fcc55c4474656369629f1b2c4bf6`.
  The disjoint total is **621 PASS, 33 SKIP, 0 FAIL** and each local shard
  stayed below 300 seconds. The logs include non-fatal Drift multiple-database
  fixture warnings. The shards ran sequentially, not as the workflow's parallel
  aggregate; source/tool binding is a local cross-check, not authenticated CI
  attestation. The retained logs are currently under `/tmp`, so their hashes are
  evidence identifiers, not a durable cross-environment handoff;
- source-only iOS/Windows QA provenance hardening at `0af27501`: the workflow
  now inspects the built iOS app with `codesign` and the Windows executable with
  Authenticode before packaging, retains observed Flutter/Dart and signing
  receipts, and writes a canonical manifest bound to `HEAD`, repository tree,
  native tree and exact artifact bytes. Writer/isolation and native-CI contract
  tests **49/49 PASS**; the complete tool syntax chain verifies **1,000 scripts**
  and native release-preflight tests **5/5 PASS** while release remains blocked.
  Independent review **PASS**. No current macOS/Windows workflow was dispatched,
  so no exact-current platform artifact, signature chain, install or launch
  evidence exists;
- an earlier exact-native-tree broad behavior-shard attempt at whole-repository
  `a9051c96` stopped before tests because `libserialport_plus` could not find a
  configured Linux Clang compiler. It is **not a pass**; log SHA-256
  `1363d6dd5e2ac100057579cd52d03c405ccca71a184739229b8061d30914610d`;
- an earlier concurrent same-host predecessor shard run timed out and is not a
  pass; the accepted predecessor results above are the later sequential
  isolated runs;
- the approved redacted added-line scanner now covers the exact published
  `bbde87b` to private integration evidence head `447fadbf` delta:
  **48,565 added lines, 0 findings**, no values exposed. Its scanner and privacy
  fixtures pass **12/12** after replacing one static synthetic bearer literal
  with equivalent runtime construction; no production rule or assertion was
  weakened. A separate offline heuristic scanned all **2,974 tracked files**
  (**51,843,159 bytes**, zero oversize exclusions); all 60 credential-shaped
  matches triaged to tests, self-tests or an example README, with no plausible
  current-tree credential found. This heuristic is not reputable full-history
  coverage, provider-incident clearance or a security certification;
- process, file-backed SQLite, widget and synthetic authorization evidence is
  not installed-device, hardware, live-service or merchant evidence.

### Retained Android QA artifact

The newest accepted identity-verified private APK is bound to runtime source
`cc0efa4f56174c636fcd28cbdcf1e24c2db8349c` and native tree `f110be98`:

- location: private producer-local artifact store; the host path is intentionally
  omitted from the publishable handoff;
- bytes: `196161020`;
- APK SHA-256:
  `ca5c7fa4be9e34622451a3954349295855f5c7a0468cf436bbab9b7cfca6bf11`;
- package: `dev.supermega.supermega_shop.qa`;
- min/target/compile SDK: `24/36/36`; ABIs: `armeabi-v7a`, `arm64-v8a`,
  `x86_64`;
- Android v2 debug signer certificate SHA-256:
  `2c8259ecbebf1fc62d202acb6792de7a10e906d937a6a24543244dcb17b137bb`;
- build-control and post-build evidence were independently reviewed; the
  effective Gradle daemon heap was `-Xmx3G` and the build used retained pinned
  dependencies in offline mode;
- promotion-ineligible and **not production-signed**.

Later whole-repository evidence/docs/tooling commits through `f58be5f7` leave
the native tree unchanged; they do not relabel the APK's accepted source
identity. No install, emulator run, device restart/restore, scanner, printer, iOS, Windows,
or merchant acceptance is established for the current source.

### Current-source Android QA build hold

One private offline debug build was completed from exact current source
`11b52a597022f75f61fd61eee88b34d2dcfc1321`, repository tree `4db97671`,
native tree `6675771e` and runtime tree `2e379175`. The retained APK is
`196160064` bytes, SHA-256
`cc9ad247d9e0bbd880874a3641fbedf048ea9dc9e146962398f3945ac7839be3`,
package `dev.supermega.supermega_shop.qa`, min/target/compile SDK `24/36/36`,
ABIs `armeabi-v7a`, `arm64-v8a`, `x86_64`, and Android v2 debug signer
certificate SHA-256
`2c8259ecbebf1fc62d202acb6792de7a10e906d937a6a24543244dcb17b137bb`.

Artifact bytes, package metadata, signature, exact-source identity, durable
retention and the 384 MiB reserve independently **PASS** for private QA. The
post-build control **FAILS CLOSED / HOLD**: the logical build symlink was
created at the detached repository root instead of `mobile/shop_pos/build`, so
Flutter wrote into an uncontrolled temporary output directory. The verifier
returned `shop_private_android_build_control:source_not_clean`; the filesystem
was not retrofitted and no second build was run. The APK is not controlled-build,
installed, production-signing, release or launch evidence.

## Connected-site pilot Phase 1 source checkpoint

The owner-approved two-merchant connected-site pilot is now represented by a
**local, default-off source foundation** on base
`11b52a597022f75f61fd61eee88b34d2dcfc1321`. Protocol version is `v1`; native
SQLite schema version is `v23`. Production, synthetic QA and fallback runtime
profiles all retain `connectedSite=false`, and no production caller enables the
coordinator, onboarding or reconciliation seams.

Implemented at source/local-verification level:

- strict versioned pairing, lease, command, acknowledgement, delta, snapshot,
  conflict and recovery contracts with canonical full-envelope digests;
- seven-day Ed25519 offline-lease verification using an injected, default-
  unavailable key ring;
- private-address coordinator dispatch for the five planned routes, leaf-
  certificate pin binding, one-time request proofs, pending enrollment, and
  lease/capability gates for reads and commands;
- v23 persistence for device/lease/revocation, command/event/version/cursor,
  audit, acknowledgement, conflict, recovery and held-reservation records,
  including atomic command/event/audit/ack application and strict replay;
- default-off reconciliation interfaces with exact tenant/site/device/event,
  acknowledgement, conflict, revocation and idempotency bindings;
- resumable EN/MY onboarding source with guided mode as the default and
  independently rebound resume evidence;
- four isolated CI shards with exact once-only inventory and the original
  300-second aggregate ceiling.

Exact local checks for the mutable final worktree: connected integration
**81/81 PASS**; complete isolated shards **696 PASS, 33 visual-capture skips,
0 failures** in 247 seconds maximum wall time; affected legacy fixture files
**83/83 PASS**; targeted analyzer **PASS**;
full analyzer **PASS**; real process-interruption harness **14/14 PASS**;
native CI contract **17/17 PASS**; claims guard **179 checks PASS** with every
activation/external-write/commercial gate retained false; independent
security/design review **PASS for default-off Phase 1 only**.
Earlier failed runs remain evidence: one full run was manually interrupted when
the final security review required a digest-contract fix; one two-shard run
failed two legacy fixture emulations and timed out downstream; one preliminary
shard launch failed before tests because its TMPDIR children did not exist.
None is relabelled as a pass.

This is **not connected operation or pilot readiness**. Real issuer keys,
durable pairing/enrollment/nonces, Android Keystore and Windows DPAPI, a
coordinator-to-database adapter, authenticated cloud transport and hosted RLS,
two-tenant denial, reservation release/commit/expiry and ordinary-sale
integration, client TLS pinning, installed Android/Windows lifecycle, hardware,
restore, merchant and 14-day trading evidence remain **NOT RUN / BLOCKED**.
Existing APKs and CI artifacts predate schema v23 and are stale for this source.
Feature enablement, production signing, deployment and merchant enrollment
remain prohibited.

## Current merged-head CI truth

Fresh read-only GitHub evidence for remote head
`1664b6ad6dfb3c0aa83e56104c006783d32b06c5`:

- Native run
  [41170560321](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/41170560321):
  all six configured Android, iOS/iPad, Windows and isolated QA jobs **PASS**.
  GitHub metadata lists current gallery artifact `13031202317`, named
  `supermega-shop-flutter-renders-43790f4bab731543ec66519cee614f13909148af`;
  CI merge `43790f4b` has source `1664b6ad` as a direct parent and native tree
  `751cb7a1`. The supported artifact-byte retrieval returned HTTP 403 and
  created only a zero-byte local placeholder, so archive/pixel hashes remain
  unverified and no retry or alternate route is authorized. Provider metadata
  also lists a second distinct exact-current artifact, `13032608341`, from run
  `41174660446`; both artifacts expire on 2026-11-14. Neither original archive,
  archive member set/bytes, provider receipt binding nor cross-capture pixel
  equivalence is retained or verified locally;
- Dependency Security run
  [41170560278](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/41170560278):
  **FAIL**. App audit reports 10 moderate and Kernel audit reports 5 moderate
  records for minimatch advisory `GHSA-g3hv-75wg-m249`; platform and Python
  audits pass and the added-line credential scan passes. `npm audit --force`
  proposes breaking downgrades and is not an approved fix. GitGuardian is
  **SKIPPED / INCOMPLETE**, not a pass;
- Kernel run
  [41170560280](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/41170560280):
  verification **PASS** and owner-gated release **SKIPPED**;
- App push run
  [41170556406](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/41170556406):
  checks 1--637/668 **PASS**. Check 638 `hq:verify` fails at HQ 1/37 with
  `database_rehearsal_evidence_stale`; checks 639--668 and HQ 2--37 are **NOT
  RUN** in this provider run;
- the same-repository PR App run
  [41170560286](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/41170560286)
  is intentionally **SKIPPED** because the push run is authoritative.

The merge and successful native builds do not establish installation,
production signing, deployment, merchant acceptance, database readiness or
security clearance. No result from the private branch may be added to these
provider results as if it were one aggregate run.

## Historical published CI evidence (not the current remote head)

The following retained evidence belongs only to historical published head
`bbde87b`; it must not be attributed to current remote head `1664b6ad`:

- Native run
  [40604429607](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40604429607):
  all six configured Android, iOS/iPad, Windows and isolated QA jobs **PASS**;
- Dependency Security / configured audits run
  [40604429667](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40604429667):
  configured audits and added-line credential scan **PASS**; this is not
  complete reachable-history secret coverage;
- Kernel run
  [40604429591](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40604429591):
  verification **PASS** and owner-gated release **SKIPPED**;
- App run
  [40604423053](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40604423053):
  checks 1–637/668 **PASS**. Check 638 `hq:verify` fails at HQ 1/37 with
  `database_rehearsal_evidence_stale`. App checks 639–668, HQ checks 2–37,
  artifact self-tests and later journeys are **NOT RUN** for this run;
- the same-repository PR App duplicate is intentionally **SKIPPED** because the
  push run is authoritative;
- GitGuardian is **NEUTRAL / INCOMPLETE**, not a pass. Do not dismiss provider
  incidents or claim full-history coverage from the configured added-line scan.

These checks belong to historical published `bbde87b`, not current remote head
`1664b6ad` or private technical checkpoint `d7399679`. The current remote head
and terminal provider checks were re-read on 2026-10-31 as recorded above;
future remote actions require another attributable freshness check. Do not add
results across source trees.

## Implemented and source-tested product boundary

### Retail core

Synthetic Flutter/SQLite tests cover catalog and leading-zero barcode lookup,
cash tender and change, durable sale/stock/outbox records, immutable receipt and
reprint behavior, shift close, restart, encrypted backup/restore, idempotent
retry, interruption boundaries, EN/MY states, indexed search and tablet layout.
When the cashier enters cash received, the exact tender and derived change are
now bound to the sale fingerprint, persisted for retail and cafe, included in
the immutable outbox/receipt evidence, and reproduced after reopen/reprint.
Blank tender and legacy sales remain valid with unknown tender; wallet sales
cannot carry cash tender.
The source also preserves full-sale correction and cash-movement foundations,
but their trusted production issuers, pins, transports and user activation are
absent. Partial/item refund and exchange remain deferred.

### Cafe core

Source and synthetic tests cover distinct line instances, immutable product
name, modifier and remark snapshots, hold/resume/reopen, optional area/table
identity, whole-unit local bill splitting, a constrained
unchanged/unpaid/unrouted split undo, atomic cash
conversion, order cancellation, and append-only device-local kitchen/bar
dispatch and status history with stable identity, sequence and validation.
Current lines retain their ordered product name across catalog rename/archive;
legacy pre-fix tickets retain a current-catalog fallback because their original
name was never stored.
Route-free local cafe orders remain usable in Core. Routed kitchen/bar commands
require an injected policy; production injects none.

Not proven or unavailable: cross-device waiter-to-kitchen-to-cashier operation,
live kitchen acknowledgement, LAN/internet synchronization, reservations,
general bill merging, tender splitting, reassignment of routed tickets,
recipes, printer routing, floor plan, and merchant acceptance. The local split
flow is not split tender or connected-table service. Device-local tickets are
not shared orders.

### Roles, accounts and synchronization

Source-tested role/capability seams exist for cafe waiter, kitchen/bar, cashier
and manager/owner and retail cashier, stock and manager/owner. Managed commands
are bound to workspace, immutable store reference, actor, session generation,
capability, command and version. Anonymous unbound Core remains offline-first.

Production remains fail closed because there is no enrolled staff issuer,
signed offline grant, managed session/revocation service, staff-attributed audit
schema, kitchen status API, or cross-device reconciliation service. A local
role label or injected test identity is not authority.

### Performance and usability evidence

Measured on a managed Linux cloud host with 5 CPUs and 17 GiB RAM, not on a
merchant device:

- 1,000-product indexed search: cold median 679 us / p95 1,576 us; warm median
  149 us / p95 332 us;
- 10,000-product indexed search: cold median 5,392 us / p95 6,410 us; warm
  median 1,348 us / p95 1,645 us;
- legacy versus indexed 10,000-product / 120-query diagnostic: 313,298 us
  versus 190,821 us;
- 60 durable basket writes: median 3,460 us / p95 6,582 us / max 6,752 us,
  with reopen verification;
- repeated scan/search/cash/restart: 18/18 synthetic iterations;
- EN/MY tablet layouts at 768/1024 and text scale 1.0/1.3: 8/8 source/widget
  checks;
- RSS changed from about 137.8 MB to 157.5 MB during one sequential workload;
  this is not leak proof.

No installed-device GPU/frame, memory stability, scanner, printer, iOS,
Windows, competitor hands-on, or merchant performance proof exists.

## Platform and workflow evidence

| Surface | Built or tested | Still required | Owner |
|---|---|---|---|
| Responsive website | Source checks pass for mobile spacing, contact behavior and 25 contact-receipt cases. Client-error telemetry now emits only coarse class/route/commit, is fail-closed off `supermega.dev`, and passes 5 focused privacy plus 107 security checks. Managed/checking sessions cannot read browser-local merchant or company recovery/export state; both Workspace Controls and Settings reauthorize lock-delayed restore before mutation. Public Shop and account-hub entry now explain their distinct access-help routes without promising signup or access. Managed-safe QR/loyalty controls remain. Gallery verifier hardening requires two distinct retained archive bindings and narrows the reviewed CI artifact to the exact contracted 18 images. `1213fa18` binds both verifier and refresher to current workflow SHA-256 `ec08dbc4...b7761`; focused Node and Python suites pass **14/14** with independent review. `20aa48b2` makes the maintained live smoke fail closed on active redirects, missing Burmese routes, stale retained-product pages and nested-route precedence; **7/7** unit tests, offline self-test, 1,000-script syntax chain and independent review pass. Canonical TypeScript typecheck and complete deterministic 748-file lint PASS in the current private worktree | Public build remains fail-closed at `native_shop_gallery_schema_changed`: retained v2 gallery pixels are bound to older `aeed1c39` / native tree `4b9f676e`, not the current test-inclusive native tree `751cb7a1`; two exact-current v3 captures, retained provider evidence, protected preview, authenticated tenant journey, verified download and delivered support remain required. Runtime `lib/` remains byte-identical to accepted `cc0efa4f` | Engineering supplies facts; Swan controls provider/release; Vivian owns journey/content |
| Android | Exact-source private QA APK for `cc0efa4f` / native tree `f110be98` is retained at 196,161,020 bytes, SHA-256 `ca5c7fa4...bf11`, package `dev.supermega.supermega_shop.qa`, min/target SDK 24/36 and three ABIs. Guarded build, actual APK v2 debug-signature inspection, 10 build-control tests and independent review PASS. Exact-native-tree local broad verification at `f58be5f7` records 621 pass / 33 intentional capture skips / 0 fail across two sequential shards, each under 300 seconds; this is not a GitHub CI aggregate or installed-app result | Install these exact bytes on an authorized remote emulator/device and run retail/cafe setup, sale, restart and encrypted restore. This executor has no attached device, emulator binary/system image or `gcloud`; debug signing remains promotion-ineligible | Engineering + Swan environment/distribution authority + Vivian acceptance |
| iOS/iPad | Shared Flutter source and older no-codesign CI evidence. Private source now requires post-build `codesign` inspection plus canonical exact-source/native-tree/toolchain/signing receipts before retaining a QA archive; source contracts pass but have not run on macOS | Exact-current macOS workflow artifact, production signing/profile, install, tablet layout and recovery | Swan signing/provisioning; engineering evidence; Vivian acceptance |
| Windows | Older unsigned CI archives and shared source. Private source now requires Authenticode inspection plus canonical exact-source/native-tree/toolchain/signing receipts before retaining a QA archive; source contracts pass but have not run on Windows | Exact-current workflow artifact, signed installer identity, install/update/rollback, desktop and peripheral journey | Swan distribution/signing; engineering evidence; Vivian acceptance |
| External account/support | Source/synthetic routes, billing/help projections and fail-closed download contract. Exact account-hub requests now retain bounded `managed_account_help` routing while stripping workspace/query identifiers and making no access promise | Protected preview, real isolated tenant/session, owned support delivery, production-signed artifact | Swan identity/provider; Vivian operations |
| Internal operations | Source-only help queue and managed identity boundaries | Named staff enrollment, MFA, revocation/offboarding, hosted queue, monitoring, support roster/hours | Swan IAM/technical; Vivian staffing/operations |

Detailed role/workstation ownership is in
[`docs/SHOP-ROLE-WORKSTATION-DELIVERY.md`](docs/SHOP-ROLE-WORKSTATION-DELIVERY.md).
The domestic benchmark gap ledger is
[`docs/SHOP-DOMESTIC-RETAIL-CAFE-GAP.md`](docs/SHOP-DOMESTIC-RETAIL-CAFE-GAP.md).
Neither document upgrades source evidence to installed or merchant proof.

Read-only provider and fresh-browser evidence on 2026-10-31 confirms the exact
Facebook Shop campaign URL, apex, `www`, `/contact/` and `/privacy/` return HTTP
200. The earlier reported Shop 404 was not reproduced; the production aliases
remain attached to deployment `dpl_8JxmQV5gNZ2bZeE7DqrN686KpuA8`. No traffic,
domain or deployment mutation was needed.

Production is nevertheless stale and not release-ready. It serves source
`5479c5d1ece3d697cf5c505e7feb431dc88baf75` from 2026-09-30: `/` is an old
multi-product page, all required Burmese routes (`/my/shop/`, `/my/contact/`,
`/my/privacy/`) return 404, and `/website/` plus `/ecommerce/` still advertise
products that the current Shop-only public contract retires. The exact managed
account-help tuple still renders the old generic sales form. The current
unaliased preview `dpl_GZnxYBLHQaGrmNkJ2XBD3djFzeCL` does contain the Shop-first
EN/MY route shape, but it is source `f944f66b...`, not current private source,
and is not approved production evidence. Do not promote it as a shortcut.

## Domain templates and package boundary

Shop remains one codebase. Current internal tier IDs are `free`, `premium` and
`enterprise`, with Core, Premium and Managed owner-facing labels. The final
commercial tier count, names, prices and billing activation are undecided.

- **Core** protects local selling, records, stock, daily close, export,
  encrypted backup/recovery and device reset. Existing local access cannot be
  retroactively paywalled.
- **Premium** is a proposed boundary for reviewed optional services. Kitchen
  routing is only a fail-closed source policy today and is not a canonical,
  issued production entitlement.
- **Managed** is the proposed workspace/staff/custom-operation boundary. There
  is no production team workspace, staff issuer or cross-device order service.

Evidence-supported configurations in one application are retail, cafe/takeaway
and restaurant. A service/custom configuration is a source-tested candidate,
not a November 1 native launch claim. Templates configure content and workflow
emphasis; they never grant a plan, capability or authority.

## Website and BD/Ops coordination

Engineering owns truthful capability, limitation, artifact and evidence facts.
Vivian/BD/Ops owns packaging input, onboarding, support operation, outreach and
content decisions. Pricing, public publishing, customer contact and promises
require their applicable human decision. The supporting website must retain
truthful login, Shop/domain, plan, download and support states; unavailable
capabilities remain unavailable.

Social-media management and optional AI product interfaces are separate,
deferred workstreams. They must not enter Shop source, CI or release scope by
implication.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.

## Production release preflight

Read-only provider and source inspection on 2026-10-30 established the release
route and the existing rollback baseline. It did not dispatch, deploy, promote,
merge, sign, mutate provider state, or alter a live database.

| Component | Existing production destination and rollback baseline | Exact candidate / deployable artifact | Preflight disposition | Smallest next evidence or action |
|---|---|---|---|---|
| Public website | Vercel project `supermega-public` (`prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR`), aliases `supermega.dev` and `www.supermega.dev`; current production `dpl_8JxmQV5gNZ2bZeE7DqrN686KpuA8`, source `5479c5d1ece3d697cf5c505e7feb431dc88baf75`, is a provider rollback candidate. Shop/Contact/Privacy are reachable, but Burmese routes are 404 and the old root/Sites/Commerce claims violate the current Shop-only contract | Private technical checkpoint `d7399679`, tree `fae9d8de`; current test-inclusive native tree `751cb7a1`; accepted runtime `lib/` tree `504d6113` remains unchanged. Complete lint/typecheck and focused gallery contract tests pass, but no retained provenance-approved production `.vercel/output` exists | **BLOCKED**. Canonical `public:prebuilt` still fails closed at current-native gallery provenance; production has P1 localization, claims and account-help drift | After Swan's exact publication decision, publish one frozen integration source through the existing PR lane, obtain two distinct exact-`751cb7a1` retained capture archives/receipts, make canonical `public:prebuilt` and required CI pass, then verify a protected candidate before owner-only promotion |
| Account/app portal | Vercel project `megaos` (`prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG`), alias `app.supermega.dev`; current production `dpl_5aaikKNysx9wtMJaqFTC3FyyozZQ`, source `3fad1ea59eb4d11b31a606672323bbaf2bd5a6fd`, is a provider rollback candidate | The paired workflow builds this portal from the same exact `main` release commit; no exact-current protected candidate has been exercised | **BLOCKED**. Real isolated tenant/session, download, owned support delivery and the final operating mode are unverified | Stage the same final commit as an isolated candidate, run the workflow's environment/value, artifact, tenant and live-candidate verifiers, and retain `isolated_demo` unless managed credentials and readiness pass fail-closed checks |
| Android Shop | No customer distribution destination is established. Current CI intentionally rejects unsigned release packaging and retains only promotion-ineligible debug/QA artifacts | Accepted native source `cc0efa4f`, commit tree `1df871f7`, native tree `f110be98`; exact-source private QA APK SHA-256 `ca5c7fa4...`, 196,161,020 bytes, package `dev.supermega.supermega_shop.qa`, Android Debug certificate SHA-256 `2c8259ec...`, min/target SDK 24/36 and ABIs `armeabi-v7a`, `arm64-v8a`, `x86_64`. The guarded local build and actual APK signature verification passed; evidence remains local/unkeyed rather than authenticated CI attestation | **BLOCKED FOR CUSTOMER RELEASE**. The artifact is debug-signed, promotion-ineligible and not installed; physical hardware, restart/restore and merchant acceptance are unverified | Install these exact retained bytes on an authorized phone/tablet or emulator, complete the named retail/cafe restart/restore journey, then establish a reviewed production-signing, distribution and rollback path |
| iOS/iPad Shop | No App Store/TestFlight or other signed distribution destination is established | Shared Flutter source only; older no-codesign CI evidence is not an installable current artifact | **BLOCKED** | Exact-current macOS build, provisioning/signing decision, installed iPhone/iPad evidence and distribution/rollback procedure |
| Windows Shop | No signed installer/update destination is established | Older unsigned archives only; no exact-current signed installer | **BLOCKED** | Exact-current build, signed installer identity, clean install/update/rollback and peripheral journey |
| Legacy demo and retired POS alias | `demo.supermega.dev` maps to legacy deployment `dpl_CJFGHCbKzQEvuD2mJGi4hdT6neoJ` in project `prj_OIMMOqLyHDb5J0okIwhn8BS1Ea1h`. Read-only live inspection returned HTTP 200, body SHA-256 `72826d99...`, title `SuperMega - open the app`, and claims including “account-free”, “real Shop POS demo”, and “live Shop POS app”; it links to `pos.supermega.dev`. Both `?demo=retail` and `?demo=cafe` returned HTTP 200 with identical body SHA-256 `d7deb8e0...` and title `Shop Counter — the simple POS for Myanmar businesses` | Neither surface is an artifact of the accepted private Shop candidate. Authenticated read-only queries on 2026-10-31 (Yangon) confirm `pos.supermega.dev` is active, not deleted and not redirected, on deployment `dpl_5wme3JzpFQD1qd2NhD9K4vkbK8k6` in separate project `spa-desk-pilot` (`prj_ydSqFTuIcVBwVr61BGfxMUxrxueG`). The old domain-filtered list returned empty despite that active alias; the private workflow repair instead queries the pinned legacy project's alias inventory | **BLOCKED / CLAIMS DRIFT**. The active alias fails `verify_retired_vercel_alias_state.mjs` when fed the correct project-scoped inventory. The private workflow repair and its 343-check contract pass locally but are not published or executed. The legacy demo also presents unverified account-free/live-app claims and must not be marketed as the current product | Product/domain owner must choose and execute a separately reviewed rollback-capable correction: retire the `pos.supermega.dev` alias and remove or replace the legacy demo links/claims with truthful current availability. Publish the reviewed guard repair through the normal integration path, then re-run the provider inventory query, alias verifier and read-only EN/MY journey audit before the canonical pair is promoted; do not silently redirect or couple these unrelated deployments to the Shop release |
| Internal console | `console.supermega.dev` maps to READY production `dpl_5AYDddHhcBKBE9Kumc8ekt16zBUt` at source `0ceebd4e...` and has a provider rollback candidate | It is not an artifact of the private Shop release candidate | **OUT OF THIS RELEASE**. Preserve unchanged | Do not couple it to Shop promotion. If separately released, use its own owner-gated verification and rollback procedure |

The supported website route is
`.github/workflows/supermega-public-release.yml`. It is an owner-only manual
dispatch from an exact 40-character commit on `main`, requires the literal
paired-production confirmation, builds isolated app and public candidates,
verifies both before promotion, then verifies the production aliases. If a
post-promotion verification fails, it attempts to restore each component whose
promotion was attempted to its captured prior deployment target, then rechecks
the pair. This rollback path is source-reviewed but has not been exercised for
the private candidate. Do not replace it with a direct alias change or an ad-hoc
Vercel deploy.

Offline release-guard regression tests pass **41/41** for the public chain and
production environment-value contract. The system Python remains unsuitable
for release verification (FastAPI `0.141.1` instead of pinned `0.139.2`, with
Psycopg absent), but an existing matched-lockfile environment closed that local
environment gap without an install: the isolated source cold import passed all
10 dependency pins and 8 required routes, and the coordinated app deployment
workflow verifier passed **343** checks. Against the retained earlier `9fa44b4a`
compiled output, the current-release asset self-test passed **134** checks, the
app security contract passed **107** checks and the compiled app verifier
passed. These are source/local-artifact checks, not a protected candidate,
hosted tenant, provider-package or production acceptance result.

Current public claims must remain inside verified boundaries: local/offline Core
retail and device-local cafe capabilities may be described as source-tested,
not installed or merchant-proven. Do not claim production managed staff,
cross-device orders, live kitchen routing, billing/signup, partial refunds,
physical scanner/printer support, signed downloads, domestic competitor parity,
or current-platform availability. The contact path provides guidance; it does
not create an account or grant access.

## Competitive parity and R&D contract — 2026-11-03

The previously referenced domestic benchmark ledger now exists at
[`docs/SHOP-DOMESTIC-RETAIL-CAFE-GAP.md`](docs/SHOP-DOMESTIC-RETAIL-CAFE-GAP.md).
It records official-source benchmark input from KMO, ZayTap, Shopify, Square,
Toast, Lightspeed and Oracle Simphony; separates pilot parity from expansion
gaps; defines the enterprise engineering contract; and gates bounded AI/R&D
experiments from money, stock, authority and publication. This is a durable
product contract, not installed or merchant evidence. Partial returns/exchanges,
split tender, recipe/BOM, multi-location, physical hardware breadth and
automatic coordinator failover remain explicit gaps or exclusions. No release
status, production authority or public parity claim changed.

## Connected pilot Phase 2 checkpoint — 2026-10-31

Private commit `af51d53a2a9b0b6c0e93a0ed35e45a9eedf77106`, tree
`3fa3f741b60e6132dca15e05157da5efdf63b458`, is the reviewed default-off
connected stock and coordinator-database checkpoint. It advances schema v24
with explicit enrollment-scope binding, immutable retail/cafe reservations,
cash/wallet adoption, canonical release/commit/expiry events, trusted-time
rollback defense, encrypted backup/restore validation and the strict four-type
database adapter. Production, synthetic-QA and fallback runtime profiles remain
disabled; the checkpoint provides no LAN, cloud, issuer, key-store, installed
device or merchant proof.

Exact local evidence: focused analyzer **PASS** with no issues; native CI
contract **17/17 PASS**; isolated suite totals **724 PASS with 33 intentional
visual skips**: persistence A 168, persistence B 100 plus 33 skips, connected
94, and behavior 362. The first four-way run timed out the behavior shard at
300 seconds under contention and is retained as a failure; its exact unchanged
standalone retry passed 362/362 in 4:03 under the same ceiling. `git diff
--check` **PASS**; independent security re-review **PASS for default-off Phase
2 only**. Tests cover explicit
scope-before-write, final-unit competition, cash/wallet cancel and exact retry,
cafe adoption, commit/expiry replication and response-loss replay, v22/v23
migration, encrypted fresh-target restore, and coherent event-byte substitution.

Phase 3 remains blocked from enablement until durable authenticated enrollment
evidence replaces the test-only digest seam, pairing/public-key/nonces survive
restart, platform key custody exists, system-derived terminal events have a
reviewed cloud authority contract, and the real issuer/revocation/RLS path is
proved. Higher-level abandon-sale orchestration must require authenticated hold
release before a replacement operation. Do not call this checkpoint connected,
pilot-ready or production-ready.

## Connected pilot Phase 3 local authority checkpoint — 2026-10-31

Private implementation commit `baa6c437dc3f3c5643fe84cb235aef2d62204888`,
tree `a66e7e78ce9aa7e5ea20e7b220ec14d2030b8b06`, advances the default-off
native database to schema v25. It adds durable pairing-nonce consumption,
pending client enrollment, retained owner approval/revocation evidence,
one-key/one-device binding, immutable request replay tombstones and exact
public-key recovery. The preceding composition checkpoint
`9886f0931c1d9b8f4d7bebb7903f455342195137` proves the real signed coordinator
dispatch path reaches the real SQLite command/event transaction only after
request, enrollment, lease, scope and capability checks.

Live-open and encrypted-backup verification share one semantic authority-chain
reconstructor. It re-hashes the Ed25519 public key, canonical evidence and
digest, binds nonce/pending/coordinator/site/device state, permits exactly one
approval and at most one later higher-generation revocation, validates request
nonce timing, and rejects altered bytes. Valid revocation survives reopen,
encrypted export and fresh-target restore; stale or future evidence, a second
device using the same key, replayed requests and changed evidence fail closed.
The v24→v25 migration creates empty authority tables and invents no enrollment.

Exact implementation-runner evidence: focused enrollment/migration/restore
tests **3/3 PASS**; affected persistence/enrollment/backup suite **121/121
PASS** in 2:52; targeted analyzer **PASS** with no issues; native CI contract
**17/17 PASS**; `git diff --check` **PASS**. An earlier affected run exposed a
legacy fixture that dropped an index as a trigger; it remained a failure until
the fixture was corrected, then the exact test and complete affected suite
passed. Independent static security re-review **PASS for this default-off local
checkpoint**, after first placing the slice on HOLD for revocation self-brick,
multi-device key reuse and incomplete restore validation.

This checkpoint still has no production issuer verifier or trusted owner key,
no Android Keystore/Windows DPAPI custody, no LAN TLS client/server lifecycle,
no cloud/RLS issuer and two-tenant proof, and no installed-device evidence.
Request nonce retention is intentionally fail-closed and unbounded pending a
reviewed epoch/compaction protocol. The complete Flutter suite is **NOT RUN**
at this exact commit; its Phase 2 result must not be relabelled as Phase 3
evidence. Connected operation remains disabled in every runtime profile.

## External release gates

1. **PostgreSQL evidence:** the tracked rehearsal receipt is stale. The
   recorder now fails closed until a reviewed toolchain provenance profile and
   an authorized isolated remote target exist. No database rehearsal is
   authorized by this status file.
2. **Exact artifact:** **complete at private QA/debug level** for `cc0efa4f` /
   `f110be98`, APK SHA-256 `ca5c7fa4...bf11`. This is not production signing,
   distribution or installation evidence.
3. **Installed acceptance:** run phone/tablet core retail and cafe journeys,
   force-stop/restart and encrypted restore on an authorized remote target.
4. **Platform/hardware:** obtain applicable iOS and Windows installed evidence
   plus each promised scanner/printer/paper-width EN/MY result. Simulation is
   not physical proof.
5. **Identity/shared operation:** establish production staff enrollment,
   tenant/store authorization, revocation, audit and durable cross-device
   reconciliation before claiming managed roles or shared orders.
6. **Security:** complete reputable full-tree/reachable-history secret coverage
   and provider occurrence reconciliation without exposing values or weakening
   detection.
7. **Website/account/operations:** protected exact-source preview, isolated
   account/store binding, verified download, owned support flow and operational
   monitoring remain unproven. The private provenance hardening intentionally
   rejects the retained v2 receipt at `native_shop_gallery_schema_changed`;
   the underlying source-tree drift also remains. Old pixels must not be
   relabelled.
8. **Acceptance/release:** independent final review, Vivian merchant journey,
   commercial/support decisions and Swan/Vivian exact-candidate go/no-go precede
   merge, signing or promotion.

## Canonical delivery requirement ledger

This is the single dependency-aware inventory for the current release. `PASS`
means the named evidence exists for the exact identity shown; it does not imply
that a downstream installed, hardware, merchant or production gate passed.

| Requirement | Status | Exact evidence | Primary owner | Next observable close |
|---|---|---|---|---|
| Public integration identity | **PASS; REPLACEMENT DRAFT LANE PREPARED** | PR #734 is merged as `4977d4ca`; its head branch remains `1664b6ad`, tree `287f074d`, verified read-only on 2026-10-31. GitHub default `main` remains ancestor `5479c5d1`; open draft PR #730 is the integration path containing the #734 merge. The single replacement PostgreSQL lane is based directly on `4977d4ca`; it does not rewrite #734 or duplicate the Shop merge onto `main` | Cloud Tech Lead | Keep the replacement lane draft-only, consume automatic CI as evidence, and never force-push, merge, deploy, or present its source checks as release acceptance |
| Exact connected-pilot source and QA bytes | **SOURCE PASS / ARTIFACT STALE** | Current implementation is `e301a56b4fbd3926a1e955b7705e141db3589fb6`, tree `2a964e22adf64d04fd4335509c75fca9f3dee114`, native tree `965354dcf00209a0ac9af2ec2feebc68e84734d3`, runtime `lib/` tree `9a7a5cabc5b9817ba54a1b3be096b3c7ff641c00`; every retained APK predates this source and is **STALE** | Cloud Tech Lead source; Local Tech Lead artifacts | Preserve all receipts, but produce new exact-source Android and Windows QA artifacts before any installed claim |
| Current native CI | **LOCAL CONTRACT PASS / HOSTED STALE** | Exact-head native CI contract **20/20 PASS** and verifier **PASS** for source `1e020137`; hosted runs and retained gallery artifacts target older native trees and are not exact-current evidence | Cloud Tech Lead | Run exact-current hosted CI only after publication is separately authorized; obtain installed evidence separately |
| Current App CI | **FAIL / BLOCKED** | Push run `41170556406`: checks 1--637/668 pass; check 638 fails at HQ 1/37 with `database_rehearsal_evidence_stale`; checks 639--668 and HQ 2--37 are not run. PR run `41170560286` is intentionally skipped. A private worktree re-run based on `1c337fda`, using exact command `npm run hq:verify`, reproduces the same fail-closed error at step 1/37 | Cloud Tech Lead | Close PostgreSQL provenance and refresh the exact-source rehearsal receipt before rerunning the unchanged gate; do not fabricate a receipt or aggregate separately run tail checks into this provider result |
| Dependency security | **FAIL / BLOCKED** | Run `41170560278`: app 10 and kernel 5 moderate records for `GHSA-g3hv-75wg-m249`; affected minimatch `<11.0.1`. Current paths are dev lint chains. Fresh official registry metadata still reports latest `eslint@10.14.0` on minimatch `^10.2.6`, `@eslint/config-array@0.23.5` on `^10.2.4`, `@typescript-eslint/typescript-estree@8.72.1` on `^10.2.2`, and latest `eslint-plugin-jsx-a11y@6.10.2` on minimatch `^3.1.2` with ESLint peer support only through 9. Its transpiled utilities call minimatch as a callable default while minimatch 10/11 expose an object/named function, so a blanket `11.0.1` override is incompatible; `npm audit --force` proposes breaking downgrades | Cloud Tech Lead | Keep the audit red. Wait for a compatible reviewed upstream release or a separately provenance-reviewed patch/fork, then regenerate both lockfiles normally and prove clean installs, accessibility lint behavior, package verification and the audit. GitGuardian remains skipped/incomplete |
| PostgreSQL rehearsal provenance | **BLOCKED; PUBLISHER ARTIFACT PASS / RUNTIME NOT RUN** | PR #752 is being revised from the non-required broker/session/two-pass architecture to the base contract's smaller trusted-runner model. EDB 17.11-5 installer identity and Authenticode signer/EKU/timestamp identity are evidenced read-only, with no execution. Canonical retained observation bytes/digest, authenticated multi-source runtime bindings, complete executed/imported/load closure, exact isolated Windows materialization, rehearsal and fresh receipt remain absent. The authoritative recorder continues to fail closed at `database_rehearsal_evidence_stale` | Cloud Tech Lead source; Local Tech Lead Windows evidence | Finish and independently review the exact source revision. Then, only after separate execution approval, emit the canonical observation and materialize/verify the complete runtime on a fresh single-purpose isolated Windows x64 runner before any database process starts |
| Exact-current gallery evidence | **BLOCKED** | Provider metadata lists two distinct unexpired artifacts for native tree `751cb7a1`: `13031202317` from run `41170560321` and `13032608341` from run `41174660446`, both expiring 2026-11-14. Neither original archive is retained locally; archive member sets/bytes, provider receipt bindings, hashes and cross-capture pixel equivalence are unverified, and the previously supported byte retrieval returned HTTP 403 | Cloud Tech Lead | Retrieve both existing archives through a supported authorized route before expiry, verify their exact member sets/bytes and provider bindings plus pixel equivalence, then refresh through the reviewed v3 contract; never relabel local or old pixels and do not create unnecessary new CI |
| Website/account exact-source preview | **BLOCKED** | Private source checks, deterministic lint/typecheck and contact/privacy contracts pass; canonical public build still fails closed at `native_shop_gallery_schema_changed` | Cloud Tech Lead | Close gallery provenance, then produce and verify one protected exact-source preview without promotion |
| Managed identity/shared operation | **BLOCKED** | Source seams fail closed; no production staff issuer, revocation, tenant audit or durable cross-device reconciliation is proven | Cloud Tech Lead | Finish source contracts only against an approved identity design; production authority remains with Swan |
| Signed customer artifacts | **NOT RUN** | Retained Android artifact is debug-signed; no exact-current production Android, iOS or Windows signing receipt exists | Local Tech Lead | On an authorized machine, bind exact source, toolchain, signer and artifact digests; Swan must separately authorize signing/distribution |
| Installed restart/recovery | **NOT RUN** | No authorized phone/tablet/iPhone/iPad/Windows installation for the exact candidate; no observed force-stop, restart or encrypted restore | Local Tech Lead | Install exact approved bytes and record the named retail/cafe restart and recovery journey |
| Physical scanner/printer and Burmese receipt | **NOT RUN** | Synthetic fakes exist, but no named scanner/printer, 58/80 mm paper, Burmese rendering or controlled failed-print retry evidence exists | Local Tech Lead | Run the preserved merchant script on named hardware and retain photos/logs without claiming exactly-once paper printing |
| Independent final source/artifact review | **BLOCKED** | Per-change cloud reviews exist; the Local host has not acknowledged or reconciled the exact candidate/artifact set | Local Tech Lead | Read canonical identities after host reconnect, review disjoint evidence, and return an explicit acknowledgement/findings |
| Merchant acceptance and operational handoff | **NOT RUN** | No merchant-observed exact-candidate journey, support ownership or acceptance sign-off | Vivian | Run the preserved trial script after installed/hardware evidence is available; record PASS/FAIL by step |
| Production promotion and rollback | **BLOCKED** | No exact-candidate deployment, signed distribution, verified rollback or production monitoring handoff | Swan | After every upstream row closes, issue an exact-candidate decision and execute only the approved promotion/rollback path |
| Joint launch go/no-go | **BLOCKED** | Signed artifacts, installed recovery, physical Burmese receipt, merchant acceptance and independent Local review are not all proven | Swan | Convene Swan, Local Tech Lead, Cloud Tech Lead and Vivian on one frozen evidence packet; no release-ready claim before explicit go/no-go |

## Ownership and next action

| Lane | Current owner | State / next close |
|---|---|---|
| Integration, source truth, CI and release integrity | Cloud Tech Lead | Current connected-pilot checkpoint `e301a56b`, tree `2a964e22`, native tree `965354dc`, runtime `lib/` tree `9a7a5cab`; every retained APK and public CI/gallery artifact is stale or held for this source. Preserve one lane and compose only reviewed handoffs. Swan remains the decision authority, not a second execution owner |
| Website/account and BD/Ops journey | Cloud Tech Lead | Independent source contracts pass, but exact-current gallery recapture and protected preview remain blocked; no public deployment. Vivian's separate merchant-acceptance ownership is recorded in the canonical ledger |
| Native retail/cafe | Cloud Tech Lead | Runtime successor `cc0efa4f` composes cash-tender `35d5b1d2`, v1 migration repair `1b2686bc`, and immutable cafe product-name snapshots; exact-current private QA build and byte/signature verification pass, while an authorized remote installed target and journey evidence are still required |
| Roles/shared orders | Cloud Tech Lead | Fail-closed seams exist; production issuer, revocation, audit and synchronization are blocked. Swan retains authority over provider/identity changes |
| Packaging/templates | Swan | Existing Core/Premium/Managed mapping retained; final tier structure and pricing undecided. Engineering enforcement and Vivian input do not change the primary owner |
| Installed/platform/hardware acceptance | Local Tech Lead | **NOT RUN** for current source. Swan separately authorizes signing/distribution; Vivian separately owns merchant acceptance |
| Local Tech Lead coordination | Local Tech Lead task `01a0d249-2b5d-7d83-a769-79336eeb777c` | **BOUNDED HANDOFF RECEIVED / FULL RECONCILIATION BLOCKED**. Its explicit delegation appoints this task as single Cloud coordinator and reserves machine-specific evidence plus independent review to Local. Previous direct thread reads still failed with `connection closed before server request was answered`; Local source/worktree identity and acknowledgement therefore remain unverified. On reconnect, read the thread first, reconcile this ledger and exact hashes, require acknowledgement, then assign only disjoint files; do not infer full synchronization or create a replacement thread |

The next public-release prerequisite is an owner-authorized publication of one
frozen reviewed integration source followed by two distinct provenance-bound
native gallery capture runs; production currently exposes stale product claims
and lacks all required Burmese routes. The immediate native acceptance action is installation
of the retained exact-current QA bytes on an authorized remote Android device or
emulator and observation of the named retail/cafe restart/restore journey.
The connected Google Cloud console tab is not controllable from this executor
and `gcloud` is unavailable; no provider read or write was performed. Do not
call the debug artifact founder-usable until installation and the journey are
observed.

## Authority limits

- No push, merge, deployment, provider mutation, production signing, credential
  or security-setting change, live database work, billing activation, customer
  contact, or public publishing follows from this record.
- Workloads are remote-only. User-local computers are evidence sources unless a
  later exact owner instruction authorizes a named local action.
- A budget ceiling is not provider access or resource-creation authority.
- The Technical Hub source-disclosure route remains unavailable without a new
  destination-specific approval.
- Passing source or synthetic checks does not prove installed, hardware,
  merchant or production acceptance.

Follow [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md) for durable
gates. Update this file rather than creating another competing status document.
