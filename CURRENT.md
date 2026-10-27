# SuperMega current release truth

- Last verified: 2026-10-27 UTC
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: native Shop, its supporting website/access path, and release evidence

This file records volatile facts. It cannot authorize publication, spending,
credentials, signing, merge, deployment, provider mutation, live database work,
or production use. When a remote fact below becomes stale, verify it and update
this file; do not reinterpret the stale value as authority.

## Exact candidate

| Item | Verified fact |
|---|---|
| Integration PR | [#734](https://github.com/swanhtet01/swanhtet01.github.io/pull/734), open, non-draft, unmerged, `UNSTABLE` because release gates remain open |
| Branch | `codex/shop-public-main-port-20261022` |
| Source | `13ef5c3201b67308a8c086133fc384c907080602` |
| Source tree | `8c4ca6503aa71ebd237c293ef3f868608af4f1e9` |
| PR merge used by Native CI | `de9ca46626b177966482d91fbd1aa11b76126449` |
| Merge tree | `8c4ca6503aa71ebd237c293ef3f868608af4f1e9` — identical to the source tree |
| Native tree | `31f10b8ed67772e0307f0053eef794217c3eb4b7` |
| Deployment behavior | Root `vercel.json` retains `git.deploymentEnabled:false`; no merge, production release, alias promotion, or manual deployment occurred |

The candidate includes the reviewed cold-rollback-journal recovery repair. It
accepts an intact committed SQLite database only when the zero-magic journal is
structurally valid, its page pre-images match the current database, SQLite
checksums and bounds pass, and database integrity is good. Forged, mismatched,
corrupt, and unknown sidecars remain fail closed and preserved.

## Exact-head CI

- [Native run 40569480097](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40569480097): **PASS**, all six Android, iPad/iOS,
  Windows, and isolated QA jobs.
- [Dependency Security 40569479822](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40569479822): **PASS** for its configured dependency and
  added-line checks. This is not a complete reachable-history secret scan.
- [Kernel 40569479998](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40569479998): verification **PASS**; owner-gated release job
  intentionally **SKIPPED**.
- [App run 40569468264](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40569468264): checks 1–637/668 **PASS**. Check 638 `hq:verify`
  fails at HQ 1/37 with `database_rehearsal_evidence_stale`. App checks 639–668,
  HQ checks 2–37, and later journey stages are **NOT RUN**.
- The duplicate same-repository PR App run 40569479867 is intentionally
  **SKIPPED**; the push run above is authoritative.
- GitGuardian is **NEUTRAL / INCOMPLETE**, not a pass. The PR exceeds the
  provider scan limit. A reported PostgreSQL-shaped occurrence is exactly tied
  to the repeated-character `example.invalid` rejection fixture at
  `tools/verify_repository_secret_diff.test.mjs:43` in historical commit
  `159b5f5f9fa7c6b788e660d019d746edd03d505f`; no provider incident was dismissed,
  and full-history coverage remains open.

No unchanged workflow should be rerun to seek a different result. The next App
run needs fresh, exact-source PostgreSQL evidence or a separate demonstrated
code defect.

## Retained QA artifacts

The current Android QA archive is GitHub Actions artifact `12764752898` from
Native run `40569480097`:

- artifact name:
  `synthetic-qa-promotion-ineligible-de9ca46626b177966482d91fbd1aa11b76126449-sha-256-android`;
- archive bytes: `104048273`;
- archive SHA-256:
  `7ba7e5083631cb26cc39cfba528160dba666c9bbcaf94b39ba004c7f281bebdb`;
- expiry: `2026-11-03T19:34:41Z`;
- package: `dev.supermega.supermega_shop.qa`, label `Shop QA`;
- capability contract `supermega.shop.android-qa-capabilities.v1` and evidence
  contract `supermega.shop.synthetic-qa-evidence.v1`;
- scoped encrypted restore and synthetic export are present; general external
  file access is denied;
- debug QA and promotion-ineligible; **not production-signed**.

The producer inspected package and manifest metadata. This executor could not
retrieve the archive bytes through the permitted path, so the inner APK digest
and APK signature were not independently recomputed. No install, emulator,
restart, update, restore, scanner, printer, or physical-hardware acceptance has
run for this artifact.

Other current-run archives are iOS QA `12765341393`, Flutter renders
`12765282070`, unsigned Windows `12765252707`, Android production-debug
`12764748948`, and Windows QA `12764113203`. They are build evidence, not
signed distributions.

## Source and environment boundaries

- Cloud is the sole integration writer. Separate private checkpoints, test-only
  branches, local worktrees, and their test counts are not part of PR #734
  unless Git ancestry and an exact candidate manifest prove inclusion.
- Git and PR #734 are the canonical technical copy. Access or acknowledgment by
  the original Local Tech Lead is unconfirmed; do not claim synchronization or
  overwrite a divergent local file without an attributable readback.
- Reviewed mobile-CSS, visual-test, remote-runbook, member/owner, account,
  correction, and hosted-collector checkpoints remain separate. Do not merge
  them wholesale or describe their behavior as present in `13ef5c32`.
- Emulator, installation, PostgreSQL rehearsal, and agent workloads are
  remote-only. Ally, V, and other user-local computers remain excluded.
- Read-only evidence confirms GCP project `supermega-468612` (project number
  `453184845544`) is visible to the selected owner account, and the owner reports
  billing linked. Compute authority, quota, organization policy, automation
  access, and the exact remote rehearsal target remain unverified. No VM or
  billable resource exists from this task.
- The approved US$15 pilot budget is a ceiling, not compute access or permission
  to create, retain, or delete resources. A stopped VM may still incur disk or
  IP charges.
- A prior local or older-source PostgreSQL approval does not transfer to this
  candidate or a remote host.

## Product truth

Source and synthetic tests cover the local cashier core: product and barcode,
cash tender/change, durable sale and stock movement, immutable receipt/reprint,
shift close, SQLite reopen, encrypted backup/restore, retry idempotency, and
EN/MY widget states. The cold-journal repair additionally prevents a valid
committed database from being rejected after an abrupt process exit.

These results are source, local-test, and CI evidence. They do not prove a
founder-usable installer, production signing, hosted tenant/account, online
correction authority, physical scanner/printer compatibility, merchant
acceptance, support readiness, or production launch. Full-sale correction is
the only accepted correction scope; partial/item refunds and exchanges remain
deferred. Member/loyalty expansion and social-media automation are not core
release work.

BD/Ops owns pricing, onboarding content, support, outreach, and social work.
Engineering supplies verified capability/limitation facts and must not turn
those tasks into Shop source or CI scope.

## Open gates and next eligible work

1. **Database evidence:** establish an authorized isolated remote target, then
   run one fresh synthetic PostgreSQL-17 rehearsal bound to source `13ef5c32`.
   Do not use live customer or production data.
2. **Artifact verification:** retrieve the retained Android QA archive in an
   authorized compatible environment, verify archive and inner APK hashes and
   the APK signature with official tooling, then run the remote emulator core
   journey with synthetic data.
3. **Security:** complete the GitGuardian/provider occurrence reconciliation
   and a reputable full-tree/reachable-history scan without exposing values or
   weakening detection.
4. **Hosted access:** produce an exact-source protected preview and isolated
   synthetic account/store/backend binding; current local fixtures do not prove
   this.
5. **Acceptance and release:** complete installed restart/restore, applicable
   hardware evidence, Vivian's merchant journey, support/commercial decisions,
   independent final review, and Swan/Vivian go/no-go before merge or production
   promotion. Owner-operated QA or production signing remains a separately
   authorized action tied to the exact artifact.

Passing a lower evidence level never closes a higher one. Follow
[`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
