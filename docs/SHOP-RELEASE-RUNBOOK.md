# SuperMega Shop release runbook

- Status: active; preparation only until the joint go/no-go
- Updated: 2026-10-22

This runbook defines evidence and handoffs. It does not authorize merge,
signing, production deployment, live data changes, or public claims.

## Release identity

Begin every release record with:

```text
PR and branch:
Final commit:
Native Shop tree:
Build/artifact IDs and hashes:
Scope included:
Scope explicitly excluded:
Rollback target/procedure:
Technical owner:
Operations acceptance owner:
```

Use [`../CURRENT.md`](../CURRENT.md) for the active lane. Do not copy its status
into a second candidate document.

## Gate 0 — scope and lane

Exit criteria:

- one integration lane and one candidate;
- each included change has an operator outcome and acceptance check;
- parked products and Connected Orders remain excluded/default-off;
- overlapping branches are merged, paused, archived, or client-specific;
- no unknown local or external changes are represented as migrated.

## Gate 1 — source and exact-head verification

Exit criteria:

- scoped source review has no unresolved release-blocking finding;
- relevant focused tests and broader suites pass;
- Android, unsigned iPad/iOS, and Windows native jobs pass for the exact head;
- dependency and repository security checks pass or have an accepted, explicit
  disposition;
- public Shop/gallery evidence, when changed, is bound to its source artifact;
- generated receipts match their writers and verifiers.

Unsigned CI output remains QA evidence. Record any check skipped by design and
the check that replaces it.

## Gate 2 — protected public preview

Exit criteria:

- the reviewed Vercel/public preview is immutable and tied to the candidate;
- Shop positioning, routes, gallery, and artifact provenance match the native
  source evidence;
- English and Burmese public content is readable at representative sizes and no
  claim exceeds the actual release;
- public errors and contact routes expose no secrets or private data.

The native app has no web-preview target in this repository. Public preview
acceptance does not verify counter, stock, export, recovery, installation, or
hardware behavior; those belong to the next gates.

## Gate 3 — installed device and recovery

Record the OS, device model, app/build identity, database state, and result for
each tested platform.

Minimum journey:

1. install or update through the proposed distribution path;
2. create representative catalog and opening stock;
3. complete a cash sale and inspect stock movement;
4. start/resume/cancel a wallet intent without duplicate sale or stock effects;
5. close and reopen the process/device;
6. export and create a backup;
7. restore a realistic backup and verify the records;
8. retry an interrupted action and prove idempotency.

An emulator or source test is labelled separately from installed hardware.

## Gate 4 — scanner, printer, and language

Exit criteria:

- keyboard-wedge scanner input preserves the intended barcode, including
  leading zeroes;
- the intended 58 mm and 80 mm receipt paths are each exercised or the support
  promise is narrowed to the actually tested path;
- test and sale receipts are produced only after the correct confirmation;
- printer failure does not undo or duplicate the sale;
- English and Burmese item names, totals, and essential labels are legible;
- the exact printer connection/retest behavior is understood after restart or
  network change.

Retain a reference to the physical receipt/evidence without committing private
merchant data.

## Gate 5 — merchant journey acceptance

Vivian runs this sequence using agreed representative business data:

> catalog → sale → stock → correction/refund → close → export → restart →
> restore

Record each step as PASS, FAIL, BLOCKED, or NOT RUN, with build/device/language.
A failure states its merchant impact and expected behavior. Acceptance is not
delegated to the implementation agent.

Native refund/exchange is not implemented in the current candidate. This gate
therefore remains open until a safe correction/refund workflow and recovery
procedure are implemented and accepted. Removing that outcome from launch
requires an explicit joint scope change in `supergoal.md`; this lower runbook
cannot waive it.

## Gate 6 — commercial and support readiness

Before promising availability, decide and record:

- free versus paid capability boundary and price;
- what assisted setup includes and excludes;
- supported operating systems, devices, scanners, and printers;
- whether hardware is supplied, recommended, or customer-owned;
- backup responsibility and recovery support;
- official support channel, hours, response expectation, and escalation owner;
- onboarding, cancellation, export, and data-retention expectations;
- claims the public product page may make.

Unknown economics remain unknown; do not invent revenue, savings, or customer
proof.

## Gate 7 — independent last-push review

After the final candidate push:

- review the actual commit, not a nearby checkout or stale diff;
- inspect money, stock, wallet, restore, privacy, signing, and release-sensitive
  paths at their risk level;
- confirm all required checks refer to the final head;
- resolve findings or record an owner-approved reason and consequence;
- repeat affected device/merchant gates after any material fix.

## Gate 8 — joint go/no-go

Swan confirms technical evidence and rollback readiness. Vivian confirms the
merchant journey and customer promise. Together they record GO, NO-GO, or GO
WITH NAMED CONDITIONS for the exact candidate.

A proposed date, draft PR, mergeable state, or green check suite is not GO.

## Gate 9 — founder-operated release and observation

The current native CI produces debug/unsigned QA artifacts; a supported native
signing and distribution path is not yet established. Only after the required
decision and that path exists:

1. the founder personally uses the owner-approved merge/signing/distribution
   and public-production procedures;
2. an agent may perform authorized read-only identity checks after the founder
   confirms dispatch;
3. the named operators run bounded first-use, sale, stock, export, restart, and
   support checks;
4. monitoring and recovery references are checked for private-data exposure;
5. public claims and support materials are compared with released capability;
6. completion, failure, rollback, or required follow-up is recorded.

Implementation agents never dispatch the production release workflow, mutate
production Supabase, or automate billing/entitlement transitions. If a release
step requires IAM, secret, spend, or customer-data access, the named human actor
must use that action's specific authority; go/no-go grants no provider access.

## Rollback triggers

Stop or roll back when the released candidate can duplicate or lose money or
stock, cannot reopen/restore representative records, crosses identity or tenant
boundaries, exposes secrets/private data, produces materially wrong receipts,
or cannot be supported under the agreed offer.

Preserve evidence, contain within authority, restore the last known safe state,
and communicate through the agreed support path. Do not hide a rollback by
editing status documents.

## Optional Connected Orders branch

Connected Orders remains outside the current candidate. If jointly added, this
runbook gains mandatory gates for authenticated account attachment, durable
server acknowledgement, offline/online conflict behavior, retry/idempotency,
two-tenant isolation, server backup/restore, support ownership, and honest
online/offline availability. A local outbox row alone proves none of these.
