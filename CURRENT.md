# SuperMega current release truth

- Last verified: 2026-10-26
- Active objective: verified Shop and account-portal delivery; see
  [`supergoal.md`](supergoal.md)
- Scope: Shop, supporting web/infrastructure, accountable operations, and
  entitlement-gated optional packages

This file records volatile facts. It does not authorize publication, provider
writes, spending, credentials, signing, merge, deployment or production use.
Historical implementation detail remains in Git history and its source packets;
it must not override the current facts below.

## Release and branch identity

- PR [#734](https://github.com/swanhtet01/swanhtet01.github.io/pull/734)
  remains open and draft at remote head
  `6bf59b49c6607f411953a19aa90d64ca89eb522e`. Nothing in this local branch
  moves, merges or publishes that PR.
- The active unpushed source/evidence lane is
  `codex/shop-core-ux-polish-20261026`. Reviewed product test checkpoint
  `b1e45c7567c751c767c3f7784a028e266b4fab04` / tree
  `495e5a53d29ea43843cd2b0bc08d0ee39c3f7040` adds no production behavior.
- Remote-QA source preparation is retained locally through
  `9e20a088c223a9edada6c7a16ebf32866f9ca11f` / tree
  `ba48bd1020045d35fb73cba17163d7f09585ad18`. It integrates the reviewed
  Android artifact handoff verifier and an advisory offline remote-host
  preflight. It remains unpushed and is not run authority.
- Separate reviewed member/owner, correction/recovery, hosted-collector,
  download, account and CSV checkpoints are preserved on their own branches.
  They are not in PR #734 or this Shop-core candidate unless Git ancestry says
  otherwise. Never add their test counts together or merge them blindly.

## What a shop user can do in tested source

The composed file-backed native test proves one fictional product and
leading-zero barcode, cash tender and change, exactly one durable sale and stock
movement, immutable receipt render/reprint, shift close, SQLite close/reopen,
encrypted backup, restore into a new database and retry without duplicate sale,
stock or outbox effects.

Direct Flutter widget tests cover short-cash rejection, rapid duplicate cash
taps, barcode/search, scan cancellation, reprint without a second sale,
clear-sale confirmation and database failure, startup path collision, keyboard
focus and return navigation. The latest test/evidence checkpoint reports:

- Flutter analyzer: PASS;
- full native suite: 409 passed, 33 suite-defined capture skips, 0 failed;
- focused new regressions: 2/2 passed;
- opt-in render capture: 39/39 passed, 130 non-empty PNGs;
- independent source/image review: PASS for the bounded checkpoint.

Technical Hub Sequence 131 contains representative EN/MY Flutter renders for
startup, confirmation, blocked recovery, checkout, cash/change, completed sale
and synthetic receipts. They are rendered-widget evidence, not installed-device
or physical-hardware screenshots.

## Retained Android QA artifact

GitHub Actions artifact `12609717130` contains `app-qa-debug.apk`:

- bytes: `195800696`;
- APK SHA-256:
  `d61170603382e96fda064fa68f4ec4db59b251795c26e1dc2ed3d835ffe5755b`;
- original archive SHA-256:
  `5dcc1a74167c13431550d2963b9b5a4b00b67a2ba8c07d4e41d573d864e6c611`;
- package: `dev.supermega.supermega_shop.qa`;
- CI source/merge: `0a7fb8e4c01741a1195b6f2a586d43a1f0e3af6a`;
- native tree: `3cbfc2038bef56d889fa0ccdef1d266783e0fcb8`;
- signing: Android debug, not production-signed;
- ABIs: x86_64, arm64-v8a and armeabi-v7a;
- promotion eligibility: false.

The artifact predates all newer unpushed local source. It cannot be described as
containing the later acceptance, UX, correction, member or account work.

The exact retained handoff packet is
[`evidence/remote-android-qa/retained-artifact-handoff.json`](evidence/remote-android-qa/retained-artifact-handoff.json).
Its unkeyed digest provides integrity checking, not provider or human authority.

## Remote-only Android pilot

The user requires emulator, hosting and agent execution to remain remote-only.
Ally, V and other user-local computers must not run this app, emulator,
PostgreSQL rehearsal or agent workload. The earlier Ally emulator setup remains
stopped before restart; it is not an eligible host.

The bounded remote plan is one Intel GCP `n2-standard-4` VM, 4 vCPU, 16 GiB,
60 GiB balanced disk, nested KVM, one AOSP API 35 x86_64 AVD, no Play/account,
private-loopback ADB and a six-hour provider STOP. The owner approved up to
US$15 usage. Read-only browser evidence now confirms that the owner's selected
personal Google account can open the existing `supermega-468612` project
(project number `453184845544`) dashboard; the owner separately confirms that
billing is linked. Project visibility is independently observed and billing is
owner-reported. Compute Engine create authority, quota, organization policy,
IAM roles and non-interactive automation access remain unverified. No VM, disk,
IP, network, API, credential, IAM grant or billable resource was created.

STOP bounds compute runtime but can leave disk/IP/network charges. It is not a
hard dollar cap and does not authorize deletion. The runbook requires evidence
export before stop, a 24-hour retained-cost review, and a separate exact
deletion or bounded-retention decision. See
[`docs/REMOTE-ANDROID-QA-PILOT.md`](docs/REMOTE-ANDROID-QA-PILOT.md).

The dependency-free preflight at
`tools/prepare_remote_android_qa_preflight.mjs` validates exact artifact
identity, reported KVM/resources, private-ADB configuration, absence of VM
credentials/scopes/secrets, synthetic data, runtime/budget and evidence
inventory. It imports the reviewed artifact handoff and uses the process clock
for expiry. Version 1 is deliberately advisory:

- host/provider fields are caller-reported, never authenticated by the packet;
- status is always `BLOCKED_OFFLINE_PLAN`, never READY;
- no command-execution, networking or provider SDK is imported;
- no cloud command, emulator, database, SDK download, credential use or
  provider write occurred;
- 16 preflight tests and 16 artifact-handoff tests pass.

The reproducible current input/result are
[`current-offline-plan.json`](evidence/remote-android-qa/current-offline-plan.json)
and
[`current-offline-result.json`](evidence/remote-android-qa/current-offline-result.json).
The exact result is blocked on:

1. project visibility is verified and billing is owner-confirmed, but compute
   authority, quota, policy and automation access are not verified;
2. no externally authenticated remote-host observation;
3. retained artifact encrypted restore unavailable;
4. retained artifact scoped synthetic-evidence export unavailable.

The v1 Android handoff contract intentionally requires restore/export to remain
blocked, so it cannot be reused to call a future artifact ready. The next source
outcome is an exact-head QA artifact containing the now-implemented scoped
synthetic-evidence saver/loader and encrypted restore contract, plus a new
capability-aware handoff contract and independent review. The source capability
is preserved separately at `d0c48586c22aa27ac7081802754392cbdb4d89b8`
(`32a184c89d19fffd2895102e919e7e094d42050a`): analysis passes, the focused
tests pass 6/6, the full Flutter suite passes 415 with 33 declared skips, and an
independent local source review closed the scope-binding and ambiguous-file
findings. It has not been pushed or built, and it is not present in retained
artifact `12609717130`. Installed export, transfer, restart and restore remain
NOT RUN.

The separate capability-handoff lane now defines a versioned v2 contract for a
future successor build. Android QA embeds exact manifest metadata for scoped
export/restore and explicitly denies general external-file access; CI must
inspect those compiled values and bind them into the source/APK sidecar before
v2 can be issued. The retained `6bf59b49` APK remains v1, keeps both
capabilities blocked and cannot be relabelled v2. No v2 APK or installed
evidence exists yet.

## CI and external gates

- App CI at `6bf59b49` fails first on stale PostgreSQL evidence; later App checks
  did not run.
- GitGuardian fails on two historical synthetic fixture findings. Reviewed local
  fixture hygiene does not resolve or dismiss the provider incidents.
- Native, Dependency Security and Kernel checks pass at the stated remote head.
- The exact-source PostgreSQL-17 rehearsal previously approved for Local is now
  paused by the remote-only direction and inaccessible-task state. That approval
  does not transfer to a remote host or different source build.
- Production correction remains unavailable: server authority, source-pinned
  keys and global consumption readiness stay fail closed. Normal selling remains
  offline; partial/item refund and exchange remain deferred.
- No protected exact-source preview, synthetic hosted account/store, production
  signing, customer download, installed restart/restore, physical scanner or
  printer proof, merchant acceptance or joint go/no-go exists.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.

## Resource and ownership truth

The active stack is Flutter/Drift, GitHub Actions, Vercel, Supabase and company
Google Workspace. Workspace is a collaboration capability, not Compute Engine
credit or provider IAM. Generic repository/credential inventories do not prove
installation or authority.

Coolify, PostHog, Penpot, Excalidraw, NocoDB, n8n, Dify, Ollama and AppFlowy are
deferred candidates under the adoption contract in `supergoal.md`; no install or
integration follows merely from their names. Plant is outside SuperMega.dev.
Sites/Ecommerce remain optional entitlement-gated custom packages, not default
launch products. SOL, Spa and client-specific work remain excluded.

Swan owns architecture, repository/provider decisions, security and release
integrity. Vivian owns merchant workflow, operating offer and acceptance, not
engineering QA. Cloud remains the sole integration writer. Git, PR checks and
committed runbooks are technical truth; the Operations Hub coordinates handoff
and decisions.

## Next action

Active source dependency: implement and independently review the scoped
synthetic-evidence export/loader and encrypted restore path without enabling
general external file access, then build a new exact-head QA artifact with a
capability-aware handoff contract.

External dependency: verify one authorized Google Cloud project, billing,
quota, nested-virtualization policy and minimum IAM path without copying raw
credentials or changing provider state. Only after both dependencies close may
the remote emulator run proceed.

After installed evidence: exact PR App/security evidence → exact-source gallery
→ protected preview and isolated synthetic account → account/setup/sale/restart/
recovery walkthrough → owner-operated signing/distribution → applicable
hardware and merchant acceptance → independent final review and joint go/no-go.
Passing a lower evidence level never closes a higher one; see
[`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
