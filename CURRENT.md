# SuperMega current release truth

- Last verified: 2026-10-31 UTC
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: one native Shop application for retail and cafe, its supporting
  website/account journey, release evidence, and accountable operations

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
| Replacement technical lane | Draft PR [#752](https://github.com/swanhtet01/swanhtet01.github.io/pull/752), branch `codex/postgres17-provenance-integration-20261031`. Remote head remains `9e8b0731152ef551a89742de92677b24aaad0d4e`, tree `8a26a25ff96887125418991f3d3bc6bedc033b8f`; local source-only Windows build successor is `4a4fc42031fffdc7d7693c6ccf64a77f31113d6f`, tree `b0dd72b6a22b6278ca5f17bd486edce5714e17ae`, and is not published or Windows-validated |
| Conflict resolution | `CURRENT.md` was replaced by the newer canonical delivery ledger because the merged copy still described PR #734 as unmerged. PostgreSQL profile/verifier paths deleted on the merged side were restored from the reviewed fail-closed stack. Unrelated merged `package.json` scripts were retained; only `database:postgres17:record:self-test` was expanded to the exact authority/materialization/profile/recorder and Python broker/lock suites |
| Exact local validation | On local successor `4a4fc420`: PostgreSQL integrated self-test **76/76 Node + 28/28 Python PASS**; broker source/static suite **5/5 PASS**; rehearsal contract **27/27 PASS**; claims guard **179/179 PASS**; exact full Kernel verifier **495/495**, brand, footprint, 69-connector/993-call resilience and 15-crew/214-check resilience **PASS**. Remote predecessor `9e8b0731` has terminal Kernel **PASS**, while App stops correctly at check 638/668 with `database_rehearsal_evidence_stale` and dependency audit remains **FAIL** at 10 app / 5 kernel moderate minimatch-chain records. The Local Windows compile of `9e8b0731` is **FAIL** with deterministic-flag, macro, `PeekNamedPipe` and process-image type errors; it is not evidence for the local successor |
| Release gates | The local successor derives exact compiler/SDK include and library roots instead of trusting ambient VsDevCmd lists, rejects non-empty `CL`/`_CL_`/`LINK`, uses a dependency-free SHA-256 helper, makes the compiler probe StrictMode-safe, adds `/experimental:deterministic`, and fixes the four reported C++ compiler errors. Real Windows compile and hostile execution on this successor are **NOT RUN**. Receipt verification and `hq:verify` still correctly stop at `database_rehearsal_evidence_stale`; signing, real publisher/profile approval, fresh rehearsal and release readiness remain **BLOCKED** |

### Current private runtime candidate

| Item | Verified fact |
|---|---|
| Exact private technical checkpoint | `965292a56686c141ac9b3710fb5b47b8ae18efd8` |
| Repository tree | `288a3a7ec9dc40015d5c6b17c6bee1ba24127258` |
| Native identities | Current test-inclusive `mobile/shop_pos` tree `751cb7a1ee8aa8b8100a356b8fb258786a05f0a5`; accepted runtime `lib/` tree remains exactly `504d6113d88163a066371462cd26e8fa64633658`, identical to runtime successor `cc0efa4f`. The native-tree change after `cc0efa4f` is limited to two Windows/cold-journal test files and must not relabel the retained APK |
| Runtime successor | `cc0efa4f56174c636fcd28cbdcf1e24c2db8349c`, containing cash-tender runtime `35d5b1d2`, v1 migration repair `1b2686bc`, and immutable cafe product-name snapshots |
| Native local verification head | `f58be5f7bcdaf8b3f83ee5d7c89712fca282a4bd`, repository tree `919a1368d86f6c87d4e875b51adcf72d8587416b`; later evidence/docs/tooling changes leave native tree `f110be98` unchanged |
| Reviewed implementation/provenance head | `0af2750165f7d3925d4b106e7e91e44bc069350b`, repository tree `eefc0089c8ed17dead51fe5718a63aee218d807d`; includes release-truth reconciliation and source-only iOS/Windows QA provenance hardening, with native tree still `f110be98` |
| Latest private release-integrity checkpoint | `1213fa189de3912d95e0c3e18c6bb8913a257234`, repository tree `b5d182d1a748d176c4068da60dd6059dc28af5e9`; aligns the gallery verifier/refresher with the independently reviewed current native-CI workflow bytes, while leaving the native tree `f110be98` unchanged |
| PostgreSQL provenance source successor | Local source-only checkpoint `4a4fc42031fffdc7d7693c6ccf64a77f31113d6f`, tree `b0dd72b6a22b6278ca5f17bd486edce5714e17ae`, layered on remote PR #752 head `9e8b0731`. It composes the Authenticode prerequisite, exact two-root materialization inventory, independent Python authority verifier, immutable Windows staging/lock contract, dependency-free native broker source and a deterministic direct-MSVC build handoff corrected against the predecessor's real Windows compiler diagnostics. It does not supply or approve a real installer/profile, validate the successor on Windows, sign a broker, run PostgreSQL, or refresh the rehearsal receipt |
| Latest private public-smoke checkpoint | `20aa48b28c3469244f87f7507e05477ecbdb0be2`, repository tree `b23c022aeea186c2e49450c5f279c6cc94387551`; aligns live smoke checks with the Shop-only EN/MY surface, retired namespace 404 precedence and exact no-redirect behavior |
| Branch | `codex/postgres17-provenance-integration-20261031`, the single authorized replacement technical lane layered on the post-#734 merge branch |
| Successor classification | Includes reviewed website telemetry privacy `897a207c` + `64d26887`, managed/local workspace-controls privacy `2a80479d` + `957fcd12` + `87651b97`, Settings/company-recovery privacy `40f47962`, managed-account support routing `f0030f28`, privacy-aligned app verifier `040ffbff`, managed access-entry clarity `9fa44b4a`, public signup transition guard `ec0919cd`, verifier/contact-contract repairs through `8cb51ee0`, PostgreSQL version-binding hardening `d7399679`, durable native cash-tender v22 runtime `35d5b1d2`, empty-v1 migration repair `1b2686bc`, and cafe product-name snapshot repair `cc0efa4f` |
| Publication | Draft integration only; not merged, deployed, signed, or release-ready. Automatic CI on the replacement lane remains evidence, not production approval |
| Worktree note | Exact-current gallery captures are absent. Accepted private QA APK for native `cc0efa4f` is retained at SHA-256 `ca5c7fa4...bf11`; installation is absent. A bounded handoff from Local Tech Lead task `01a0d249-2b5d-7d83-a769-79336eeb777c` now appoints this task as the single Cloud Tech Lead coordinator and reserves machine-specific evidence plus independent final review to Local. Full Local thread readback, source/worktree reconciliation and receiver acknowledgement remain **UNVERIFIED** because direct thread reads previously returned `connection closed before server request was answered`. Do not claim full synchronization, recreate the Local task or duplicate its branch |

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
- PostgreSQL provenance hardening through implementation checkpoint `965292a5`:
  all seven bound PostgreSQL
  executables must report the exact declared upstream version, including when
  internally consistent wrong-version evidence is rehashed. Provenance/recorder
  predecessor version/profile/recorder tests **47/47 PASS**, application
  security **107/107 PASS**, coordinated release-workflow contract **343/343
  PASS**, and predecessor independent review **PASS**. The current successor's
  focused count and review verdict are recorded below and must not be conflated
  with that predecessor review.
  The source-local publisher verifier now requires the profile archive itself
  to be a timestamped, embedded-Authenticode-signed `.exe`, rejects a signed
  sibling as authority for the historical ZIP, pins the SHA-256 leaf
  certificate through an independently reviewed policy, rejects reparse/path,
  byte/digest, signer, EKU and timestamp drift, and repeats the live
  observation before and after the child. Receipt freshness binds the profile,
  policy, signed source, signer, timestamp, authentication evidence, reviewed
  load-closure evidence and execution bundle. Receipt validation derives that
  tuple from current source-controlled evidence rather than trusting receipt
  fields. The production verifier has no injectable
  Authenticode seam and the Python release gate remains disabled. The claims
  guard is **179/179 PASS**. The read-only receipt verifier remains correctly
  **BLOCKED** at `database_rehearsal_evidence_stale`. The tracked production
  profile/policy remain pending and unapproved: the official signed installer,
  reviewed signer certificate, real Windows file/load-closure evidence and
  independent profile approval are still absent. The production profile is
  additionally blocked by `materialization_executor_unavailable`: the source
  verifier now rejects incomplete, extra, traversal/ADS, case-colliding,
  symlink/reparse-like, hard-linked, substituted and non-identical two-root
  inventories, but no reviewed Windows executor or verified official-installer
  argument contract has produced those roots. The one-time request contract
  exact-binds source, profile/policy/materialization/load-closure hashes,
  execution paths, nonce, session and freshness and atomically claims a stable
  file, but remains deliberately `authoritative:false`. Python still performs
  no independent publisher/tree/path revalidation, so the secure authority
  handoff is **BLOCKED**, not inferred from environment variables or a receipt;
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
  unverified and no retry or alternate route is authorized. A second distinct
  exact-current capture is also absent;
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
| Exact private source and QA bytes | **PASS (QA only)** | Accepted runtime `cc0efa4f`, runtime `lib/` tree `504d6113`; retained debug APK SHA-256 `ca5c7fa4...bf11`, package `dev.supermega.supermega_shop.qa` | Cloud Tech Lead | Keep source/artifact receipt immutable; installation and signing remain separate gates |
| Current native CI | **PASS (source/build only)** | Run `41170560321`: all six configured Android, iOS/iPad, Windows and isolated QA jobs pass for public native tree `751cb7a1` | Cloud Tech Lead | Consume only as build evidence; obtain installed evidence separately |
| Current App CI | **FAIL / BLOCKED** | Push run `41170556406`: checks 1--637/668 pass; check 638 fails at HQ 1/37 with `database_rehearsal_evidence_stale`; checks 639--668 and HQ 2--37 are not run. PR run `41170560286` is intentionally skipped. A private worktree re-run based on `1c337fda`, using exact command `npm run hq:verify`, reproduces the same fail-closed error at step 1/37 | Cloud Tech Lead | Close PostgreSQL provenance and refresh the exact-source rehearsal receipt before rerunning the unchanged gate; do not fabricate a receipt or aggregate separately run tail checks into this provider result |
| Dependency security | **FAIL / BLOCKED** | Run `41170560278`: app 10 and kernel 5 moderate records for `GHSA-g3hv-75wg-m249`; affected minimatch `<11.0.1`. Current paths are dev lint chains. Fresh official registry metadata still reports latest `eslint@10.14.0` on minimatch `^10.2.6`, `@eslint/config-array@0.23.5` on `^10.2.4`, `@typescript-eslint/typescript-estree@8.72.1` on `^10.2.2`, and latest `eslint-plugin-jsx-a11y@6.10.2` on minimatch `^3.1.2` with ESLint peer support only through 9. Its transpiled utilities call minimatch as a callable default while minimatch 10/11 expose an object/named function, so a blanket `11.0.1` override is incompatible; `npm audit --force` proposes breaking downgrades | Cloud Tech Lead | Keep the audit red. Wait for a compatible reviewed upstream release or a separately provenance-reviewed patch/fork, then regenerate both lockfiles normally and prove clean installs, accessibility lint behavior, package verification and the audit. GitGuardian remains skipped/incomplete |
| PostgreSQL rehearsal provenance | **BLOCKED; SOURCE-ONLY WINDOWS REPAIR PASS / WINDOWS SUCCESSOR NOT RUN** | Remote PR #752 head `9e8b0731` correctly retains the reviewed Authenticode, materialization, Python authority, immutable staging and native-broker contracts, but its Local Windows compile is **FAIL**: the build probe/environment handling and four C++ compile errors prevented a broker binary. Local successor `4a4fc420`, tree `b0dd72b`, derives exact MSVC/SDK roots, rejects ambient compiler/linker flags, hashes without PowerShell modules, makes `/Bv /?` probe handling explicit, adds `/experimental:deterministic`, and fixes the macro, pipe and process-image compiler errors. Integrated recorder **76/76 Node + 28/28 Python**, broker suite **5/5**, rehearsal contract **27/27**, claims **179/179**, and full Kernel **495/495** plus all broad guards pass locally. The manifest and any future receipt remain `productionAdapterEnabled:false`, `signed:false`, `windowsCompiled:false`, `windowsValidated:false`, `authoritative:false`, `executionLocked:false`, and `toolchainClosureComplete:false`. Receipt/HQ remains fail-closed at `database_rehearsal_evidence_stale`; no successor Windows compile, installer download, PostgreSQL process, SQL or database ran | Local Tech Lead | Compile exact successor `4a4fc420` on the authorized Windows host, retain the actual build receipt and full tool/header/default-library closure, and report PASS/FAIL before any hostile test, signing or disposable rehearsal |
| Exact-current gallery evidence | **BLOCKED** | Artifact `13031202317` is metadata-bound to run `41170560321` / native tree `751cb7a1`, but supported byte retrieval returned HTTP 403 and a second distinct capture does not exist | Cloud Tech Lead | Obtain two retained exact-current provider capture archives through a supported route; never relabel old pixels |
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
| Integration, source truth, CI and release integrity | Cloud Tech Lead | Private technical checkpoint `965292a5`, tree `288a3a7e`; current test-inclusive native tree `751cb7a1`; accepted runtime `cc0efa4f`, runtime `lib/` tree `504d6113`; retained APK remains bound to the earlier full native tree `f110be98`; preserve one lane and compose only reviewed handoffs. Swan remains the decision authority, not a second execution owner |
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
