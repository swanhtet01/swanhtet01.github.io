# Shop release runbook

- Status: active; preparation only until the joint go/no-go
- Updated: 2026-10-23

This runbook defines evidence and handoffs. It does not authorize merge,
signing, production deployment, live data changes, or public claims.

Native Shop SQLite schema versions and hosted PostgreSQL/Supabase schema
profiles are separate contracts. Every receipt must name its datastore; one
cannot prove the other.

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
- overlapping branches are kept, merged, paused, archived, or client-specific;
- no unknown local or external changes are represented as migrated.

## Gate 1 — source and exact-head verification

Exit criteria:

- scoped source review has no unresolved release-blocking finding;
- relevant focused tests and broader suites pass;
- Android, unsigned iPad/iOS, and Windows native jobs pass for the final source
  identity;
- required App CI, including `hq:verify`, passes for the final source identity;
- native database migrations classify the complete supported origin before
  DDL, reject unknown or hybrid shapes without mutation, and prove staged
  restore plus backup round-trip behavior;
- correction-bearing migrations and unified direct opens recompute reversal,
  authorization, restock, reconciliation, outbox, and cash-close evidence;
  semantic tampering fails before runtime use and pre-DDL failure leaves the
  historical database unchanged;
- dependency and repository security checks pass or have an accepted, explicit
  disposition;
- public Shop/gallery evidence, when changed, is bound to its source artifact;
- generated receipts match their writers and verifiers.

Unsigned CI output remains QA evidence. Record any check skipped by design and
the check that replaces it. Distinguish an exact push-head run from a pull
request merge-ref run. For a merge-ref, record both the merge SHA and contained
source head/tree; never relabel the merge-ref as exact-head evidence. Record
GitHub artifact ID, name, archive digest, and expiry separately from any inner
APK/image/package filename and hash.

Source-level authorization, migration, direct-open, backup, and restore
hardening may continue while signed-device and physical-hardware evidence is
blocked. It does not promote the candidate or satisfy those human gates.

## Gate 2 — protected public preview

Exit criteria:

- the reviewed Vercel/public preview is immutable and tied to the candidate;
- Shop positioning, routes, gallery, and artifact provenance match the native
  source evidence;
- English and Burmese public content is readable at representative sizes and no
  claim exceeds the actual release;
- public errors and contact routes expose no secrets or private data.

The public Shop candidate uses one concise product story and one noninteractive
desktop/tablet/phone composition—no device selector, repeated device banners,
or stacked mockups. Record English and Burmese screenshots at 390 px, 768 px,
and 1440 px. The English contract is:

- eyebrow: `Shop for Myanmar retailers`;
- heading: `Sell clearly. Keep stock accurate.`;
- body: `Find an item, take payment and see what needs attention—even when the
  connection is unreliable.`;
- primary action while access remains assisted: `Contact us about Shop`.

Use an idiomatic, shorter Burmese heading with locale-aware type size,
line-height, and measure rather than copying the English layout. Public proof
labels may describe only implemented, verified behavior. Printer compatibility,
automatic social orders, multi-device sync, cloud backup, and AI import stay
unclaimed until their applicable gates pass.

The permitted proof-label candidates are `Search or scan`,
`Offline-first sales`, `Stock history`, and `English or Burmese`. Include each
only when its source and acceptance evidence pass. Add `Print and reprint
receipts` only after physical receipt tests pass.

Public intake accepts exactly one current plan value, `shop-pilot`. Template
values are independent presets and accept exactly `mini-mart`, `tea-coffee`,
`fashion`, or `beauty-spa`. Assisted Launch is an optional separate service,
never a plan. Managed Cloud and Multi-site are noninteractive roadmap labels;
legacy, arbitrary, or crafted plan values fail closed. Publish no numeric price.
English and Burmese parity tests must enumerate exactly those four public
inquiry templates, exactly one current offer, and exactly two noninteractive
roadmap items.

These four public inquiry-template values are a separate intake vocabulary from
the five native workflow profiles below. Do not infer or publish a one-to-one
mapping unless product owners define and test it.

The implementation must reuse the shared design system; support responsive
touch and keyboard operation; meet the repository's accessibility and
performance checks; keep complete English and Burmese modes rather than mixed
copy; preserve auth, data, and security boundaries; and keep telemetry
privacy-aware. Feature flags and experiment hooks must default safely and must
not bypass entitlement, consent, or release gates.

The native app has no web-preview target in this repository. Public preview
acceptance does not verify counter, stock, export, recovery, installation, or
hardware behavior; those belong to the next gates.

### Research-informed acceptance mapping

The Operations Hub's initial market-research pack supplies five prompts for the
existing gates; it does not add five features or replace technical review:

| Prompt | Existing release evidence |
| --- | --- |
| `T-MR-01` supported units and prices | Reconcile the supported entry path, opening quantities, sale total, stock movement, reversal, close, and export. Record wholesale, variants, imports, or unit conversion as unsupported, blocked, or later unless already in the agreed candidate. |
| `T-MR-02` actual counter device | Bind Gates 3 and 4 to the exact OS, device, scanner, printer, connection, and build. Source, emulator, or CI evidence is not hardware acceptance. |
| `T-MR-03` connectivity change | Exercise interruption, restart, and recovery while distinguishing the local single-device sale loop from hosted authorization. Do not claim offline correction authorization, server acknowledgement, or synchronization from a local outbox row. |
| `T-MR-04` data setup and first sale | Use the approved synthetic fixture and supported data-entry path through first-sale reconciliation. Do not infer spreadsheet import, hosted activation, or merchant-data readiness. |
| `T-MR-05` permissions and claims | Prove the supported operator authority and keep unsupported actions unavailable. Classify each new request as an existing blocker, a disclosed limitation, or a later opportunity rather than silently widening launch scope. |

These prompts derive from 23 publicly indexed Facebook post excerpts observed
on 22 October 2026. Full posts, dates, authorship, affiliations, and
representativeness remain unverified, so the prompts are not customer proof or
market-wide requirements. Vivian owns qualification, onboarding, and support
readiness; Swan and the Tech Leads own build-linked review and test evidence.

### Post-blocker product and validation contract

This contract queues the next bounded work; it does not claim implementation or
expand the current release:

- `P0`: prove the signed installed app across restart/update and encrypted
  restore on the supported device set;
- `P0`: prove the applicable physical USB/Bluetooth/camera scanner paths;
- `P0`: prove the implemented private-subnet LAN/port-9100 ESC/POS path on each
  promised 58 mm and 80 mm Burmese paper width. USB/Bluetooth printer support
  is not implemented or proven and must not be promised;
- `P0`: expose correction only through actual operator authorization while
  preserving the original sale, reason/actor evidence, and once-only stock and
  shift effects;
- `P1`: make clean install → preset → catalog path → guided first sale complete
  in English or Burmese with at most five setup decisions;
- `P1`: treat cross-device continuity as optional until conflicts and
  cross-tenant denial are visible and proven;
- plans govern entitlements; templates configure editable workflows and never
  create product forks;
- preserve the five native starting profiles: `mini-mart`, `cafe-takeaway`,
  `fashion-accessories`, `beauty-household`, and `custom`;
- first run is seller type → catalog path (photo, CSV, or add one) → guided
  first sale;
- keep one calm sell → payment → receipt model, hide modules until enabled, and
  keep continuity/backup guidance in Settings unless the operator must act;
- consider wholesale/distribution and service-seller presets only after the
  current five are reversible and clear; capability-pack order is units/pack
  sizes, variants, then expiry/batch or serial/credit;
- maintain automated journeys for first product, first sale, wrong scan,
  offline restart, payment uncertainty, receipt/reprint, close shift, and
  restore across the applicable templates and device classes, with injected
  failure and recovery checks;
- synthetic AI evaluation may reject a design or expose a defect, but it is not
  customer or merchant acceptance.

Eliminate plan selection and repeated storage banners from checkout, reduce
setup, and raise recovery, hardware, Burmese, and correction evidence. Reviewed
photo import and one continuity page may enter only through their applicable
gates. Do not add counter clutter; keep continuity and backup in Settings unless
the operator must act.

Operations supplies one evidence-backed website brief at a time. Engineering
implements one exact preview/build, and Vivian returns reproducible findings
that become bounded defects with focused reruns. A product experiment requires
a predeclared hypothesis, primary metric, guardrails, eligible audience,
privacy boundary, minimum evidence, and stopping rule. Use feature flags rather
than permanent branches, and remove the losing variant after the decision.

## Gate 3 — installed device and recovery

Record the OS, device model, app/build identity, database state, and result for
each tested platform.

Minimum journey:

1. install or update through the proposed distribution path;
2. create representative catalog and opening stock;
3. complete a cash sale and inspect stock movement;
4. start/resume/cancel a wallet intent without duplicate sale or stock effects;
5. reverse one complete cash sale with the agreed restock choice, verify the
   original receipt remains immutable, and retry without another stock or cash
   effect;
6. reverse one wallet sale and verify the local record remains external
   reconciliation pending until a separate evidence-backed outcome;
7. review gross sales, reversals, net sales, wallet liabilities, and cash
   returned before closing the shift;
8. close and reopen the process/device;
9. export the agreed operational record and create an encrypted backup;
10. restore a realistic backup and verify the original sale, reversal,
    reconciliation, stock, close, and retry records;
11. retry an interrupted action and prove idempotency.

An emulator or source test is labelled separately from installed hardware.

## Gate 4 — scanner, printer, and language

Exit criteria:

- each promised physical USB, Bluetooth, camera, or keyboard-wedge scanner path
  preserves the intended barcode, including leading zeroes;
- the implemented printer transport is private-subnet LAN ESC/POS on port 9100;
  the intended 58 mm and 80 mm paper paths are each exercised over that
  transport or the support promise is narrowed to the actually tested path;
- USB/Bluetooth scanner evidence is not USB/Bluetooth printer evidence; those
  ESC/POS printer transports remain unsupported until separately implemented
  and proven;
- test and sale receipts are produced only after the correct confirmation;
- printer failure does not undo or duplicate the sale;
- English and Burmese item names, totals, and essential labels are legible on
  paper;
- native layout with the actual bundled Inter/Noto Sans Myanmar UI fonts is
  legible at 390 px and at 320 px with 1.5× text scale; Ahem or normal-scale
  widget evidence is insufficient;
- the exact printer connection/retest behavior is understood after restart or
  network change.

Retain a reference to the physical receipt/evidence without committing private
merchant data.

### Gate 3/4 technical evidence record

Complete one record for each exact build, device, and printer combination. This
record captures technical evidence only; it is not Vivian's merchant acceptance
and it does not turn source or CI coverage into installed-hardware proof.

```text
Candidate
PR / branch:
Commit / native Shop tree:
GitHub artifact ID / name / archive digest / expiry:
Inner build filename / SHA-256 (if independently calculated):
Distribution path:
Test date / observer role:
Private evidence reference (no secret or merchant data):

Installed environment
OS and version:
Device make / model:
App build identity:
Language(s):
Starting database state:

Recovery — record PASS, FAIL, BLOCKED, or NOT RUN plus expected and observed
Process-kill and reopen / retained record IDs or counts:
Connectivity change during sale / expected local and hosted boundaries:
Hosted-only action while disconnected / expected blocked behavior:
Encrypted backup creation / artifact reference:
Fresh-target restore / retained record IDs or counts:
Interrupted-action retry / duplicate-count evidence:
Full-sale cash reversal and retry:
Wallet reversal and separate reconciliation:

Scanner
Model / connection:
Leading-zero fixture / expected / observed / status:

58 mm printer
Model / connection:
Test-before-sale status:
English / Burmese legibility status:
Sale receipt only after commit status:
Failure caused no duplicate sale status:
Restart or network-change retest status:
Private physical-receipt reference:

80 mm printer
Model / connection:
Test-before-sale status:
English / Burmese legibility status:
Sale receipt only after commit status:
Failure caused no duplicate sale status:
Restart or network-change retest status:
Private physical-receipt reference:

Gate disposition / blockers:
```

Until the trusted native correction action is available, both reversal rows in
this record are `BLOCKED`, not `PASS` or `NOT RUN`. Never put passwords, tokens,
private merchant data, or raw customer records in the repository. Reference
private photos, receipts, and logs from their approved store. If either paper
width is not exercised, its evidence row is `NOT RUN`; Gate 4 remains
`BLOCKED` unless the intended test passes or Swan and Vivian explicitly narrow
the supported printer promise.

## Gate 5 — merchant journey acceptance

Vivian runs this sequence using agreed representative business data:

> catalog → sale → stock → correction/refund → close → export → restart →
> restore

Record each step as PASS, FAIL, BLOCKED, or NOT RUN, with build/device/language.
A failure states its merchant impact and expected behavior. Acceptance is not
delegated to the implementation agent.

Use this record for each exact installed candidate. Keep private merchant data,
photos, receipts, and logs in the approved private store; this repository keeps
only status and non-secret references. The browser-local playbook in
`docs/demo-playbooks/shop.md` is rehearsal evidence and cannot satisfy this
native merchant-acceptance gate.

```text
Exact candidate / signed build:
Device, OS and installation channel:
Language: EN | MY
Representative-data owner:

Journey step | Expected | Observed | PASS/FAIL/BLOCKED/NOT RUN | Private evidence reference
Catalog:
Sale:
Stock:
Correction/refund:
Close:
Export:
Restart:
Restore:

Merchant-impact findings:
Full-sale-only correction accepted for launch: YES | NO | UNDECIDED
Partial return/exchange required for launch: YES | NO | UNDECIDED
Commercial/support blockers:
Vivian disposition: ACCEPT | REJECT | BLOCKED
Vivian / date:
```

The committed native SQLite v13 anchor has a source-level full-sale reversal
engine: it preserves the original receipt and prices, records an immutable
linked audit, makes restock an explicit all-or-none choice, protects retries,
and accounts for cash outflow only after an explicit full-cash-return
attestation bound to the exact reviewed open shift. A later shift cannot
consume that authorization. Wallet money-return status stays external-pending
until separately reconciled, and the records are validated through encrypted
backup/restore.

The committed security increment advances native SQLite to schema v14. It
verifies a v2 receipt's Ed25519 signature against a reviewed public key
pinned in source, persists one immutable `signed_v2` proof bound to workspace,
actor, capability, exact command, expiry, and local operation, and preserves
migrated v1 digest rows only as `legacy_unverified_v1` audit evidence. It also
extends semantic validation across migration, direct open, backup, and staged
restore. Focused regressions and exact-head native/App CI pass; installed-device,
hosted authorization, global replay/time, and merchant-acceptance gates remain
open.

Gate 5 remains open for two exact reasons:

1. Source contains a default-dark authorization issuer at
   `POST /api/trial/v1/shop/correction-authorizations`, a strict native client,
   and an immutable workspace anchor. The working v2 path signs the exact
   receipt digest with Ed25519 and the native verifier accepts only a known key
   pinned in source. The production public-key ring is empty, no production
   issuer signing secret is configured in this environment, authenticated
   managed-workspace discovery is not wired to the anchor. Recent sales now
   contains the restrained correction entry and rechecks the immutable
   workspace/actor binding before opening the reviewed dialog, but empty pins
   and absent issuer configuration keep the action unreachable and
   default-dark. Reversal acceptance rows remain `BLOCKED` until that exact
   signed installed build has the reviewed issuer, pins, workspace anchor, and
   operator-authority evidence. Pilot correction is an online-authorized
   workspace-owner action; normal selling remains offline. Do not imply
   offline correction parity. Defer device-bound offline manager
   credentials/passkeys until a reviewed threat model and demonstrated
   merchant need exist. Global receipt consumption across cloned databases and
   trusted time/device-clock rollback remain blockers even after local
   signature verification, and real PostgreSQL/RLS tenant isolation,
   revoked-session, replay, owner-transfer, and expiry behavior remain
   unproven. A typed name, shift label, shared PIN, locally constructed receipt,
   raw Supabase session, or broad write role is insufficient authority.
2. The engine reverses a complete sale only. Partial returns and exchanges are
   not implemented. Swan and Vivian must explicitly accept full-sale reversal
   as the November correction/refund scope or retain partial/exchange as a
   blocker. This runbook cannot silently narrow the merchant outcome.

Pre-hardening schema-v11 wallet-reconciliation rows using the earlier four-key
fingerprint intentionally fail current replay and restore. Before launch, prove
that no retained candidate data needs compatibility or add an explicit,
versioned migration.

Source tests and CI are not merchant acceptance. Vivian still runs the journey,
and installed restart/restore plus operator-authority evidence remain required.

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

Until those decisions change through the joint owner gate, Local Pilot is the
only current offer. Assisted Launch is a separate optional one-time service.
Managed Cloud and Multi-site remain planned/internal, not purchasable plans.
Business templates configure editable starting workflows; they do not grant
entitlements or create separate product forks.

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
