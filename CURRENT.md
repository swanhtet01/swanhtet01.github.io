# SuperMega current release truth

- Last verified: 2026-11-01 UTC
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: one native Shop application for retail and cafe, its supporting
  website/account journey, release evidence, and accountable operations

## 2026-11-01 exact-head release checkpoint

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
- Separate local default-branch dependency candidate
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
  is unpublished and is not part of PR #753.
- A fresh security-boundary investigation confirms no safe minimatch repair can
  be built from existing trusted bytes. Modern ESLint/config-array and
  typescript-estree consumers require the v10 class/named APIs, while
  `eslint-plugin-jsx-a11y@6.10.2` has two callable-default v3 call sites that a
  blanket v11 override breaks. Cached minimatch `11.0.1` is a full matcher
  rewrite and requires `@isaacs/nonrecursive-glob-match@^1.0.1`, whose source,
  tests and provenance bytes are unavailable locally. A v10/v3-labelled
  backport would remain scanner-visible and cannot be called fixed. The gate
  therefore remains **BLOCKED** pending a compatible upstream jsx-a11y release
  or a separately authorized/provenance-reviewed v11 dependency plus narrow
  jsx-a11y adaptation and cross-platform matcher regression suite. No override,
  suppression, downgrade, exception or source patch was made.
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
