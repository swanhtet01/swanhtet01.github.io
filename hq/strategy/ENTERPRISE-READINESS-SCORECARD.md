# Enterprise Readiness Scorecard

Date: 2026-08-16
Author: QA Codex
Status: analysis (no deploy, write, or gate change authorized by this document)
Question answered: "enterprise level and what other infrastructure and tools"
Rule: every grade cites a repo file. Companion: ERP-COMPETITIVE-ROADMAP.md sec 3
(the enterprise checklist), AI-NATIVE-ARCHITECTURE.md (stages and triggers),
hq/readiness/managed-pilot-readiness.json (gate ledger, 4 blocking).

**Freshness note, 2026-08-17 (tech lead):** this scorecard predates a full day
of subsequent work and should not be quoted as current without checking the
newer sources first: `PRODUCT-CATALOG-AND-PRICING.md` (code-grounded, dated
2026-08-17), `hq/readiness/managed-pilot-readiness.json` (gate ledger now 2
blocking, not 4 — self-serve remediation #419 and its release #420 are both
merged), and `BILLING-RAIL-DESIGN.md` (Gate 9's successor — the billing data
model, RLS, and founder-action methods are now built and tested; only the
operational entrypoint is missing, not the whole rail). Grades below are not
re-derived; treat any grade touching security, auditability, or the managed
pilot as a floor, not a current reading, until a full re-grade pass is done.

**Freshness note, 2026-08-19:** recommendation #4 below (section 8) is stale
and its citation was wrong even when written — see the correction inline at
that item. Do not resurrect it as open work without reading that note first.

Grading key: A = provable today against an enterprise buyer's checklist.
C = built or designed but not activated. F = absent with no plan.

| # | Area | Grade |
|---|---|---|
| 1 | Security | A- |
| 2 | Reliability | B |
| 3 | Auditability | A- |
| 4 | Access control | C+ |
| 5 | Testing | A- |
| 6 | Observability | D+ |
| 7 | Scalability | B- |
| - | OVERALL | B- |

---

## 1. Security: A-

Justification: RLS on every managed table with browser roles denied, schema v10
zero drift, Security Advisor clear (findingCount 0, browser quarantine applied,
zero browser-privileged objects) per managed-pilot-readiness.json securityAudit
and hq/NOW.md Blockers; public repo carries zero secrets (env-only credentials,
GitGuardian in CI, dependency-security.yml) per AI-NATIVE-ARCHITECTURE.md 4.3.

- Secrets: operator CLI rejects credential-shaped manifest fields pre-network
  and zeroes the key buffer (kernel/README.md Guided Operator).
- Fail-closed density: 67 files across showroom/kernel/tools/hq state an
  explicit fail-closed rule; unavailable budget store, stale verifier, and
  tampered readiness ledger all stop the action (AI-NATIVE 4.3).
- Deduction: client connector secrets are per-Vercel-project, not a vault
  (kernel/README.md Honest Limits); hosted write path still unproven.

Highest leverage: a per-tenant secrets vault decision BEFORE multi-client
scale, entered through researchGates like every other tool.

## 2. Reliability: B

Justification: release is a paired, typed-confirmation, single-actor promotion
with exact live-identity verification and automatic rollback of both domains on
a stale verifier (supermega-public-release.yml shape, CEO-020 evidence, cited
in AI-NATIVE-ARCHITECTURE.md 4.1; tools/resolve_vercel_rollback_target.mjs).

- Gate coverage: 621-step app:verify chain plus 7 CI workflows; lint and
  showroom CI fail on their own (AI-NATIVE 4.1 note).
- Live verification: supermega-public-live-health.yml runs post-release and on
  a daily 01:45 UTC cron against https://supermega.dev.
- Deduction: backup/restore is proven local only (core/company-backup.ts,
  600k-iteration KDF); hosted durable-write, recovery, and restore have never
  run -- managed_persistence gate is blocked, "Live managed persistence ready
  is false" (managed-pilot-readiness.json). The OPS-754 seven-proof instrument
  (durable write, idempotent retry, event immutability, cross-tenant denial,
  recovery round-trip, induced rollback; commit cb59abe8) is built but unrun.

Highest leverage: execute the founder-approved 24h preview-branch rehearsal
with the OPS-754 instrument; it converts four blocked gates into evidence.

## 3. Auditability: A-

Justification: every mutation carries an action proof (CommerceActionProof /
ProductionActionProof) with a registered behavior-trail store (ERP roadmap
sec 2.2; showroom/src/core/behavior-trail.ts), and control state uses
append-only supermega_control_transitions with immutable reviews/evaluations
that a second decision cannot overwrite (kernel/README.md).

- Evidence is frozen by payload hash before approval; the readiness ledger is
  digest-bound to 8 sha256 source receipts (managed-pilot-readiness.json).
- Accountable operators: reviews record reviewer, recorder, source, and
  provenance class (operator_recorded vs tenant_bound_customer_session).
- Deduction: hosted immutability unproven until the rehearsal passes (ERP
  roadmap sec 3 audit-trail row); OPS-754 proof 4 covers exactly this.

Highest leverage: run OPS-754 proof 4 (event immutability) hosted.

## 4. Access control: C+

Justification: RBAC is built but gated -- 10 staff roles cashier->owner with
role levels and a required-authority schema exist in code
(showroom/src/core/enterprise-staff-roles.ts), but the file header itself
states the gate: "Prerequisites: verified-statements proven in production."

- Session model is genuinely good: one-use tenant codes exchanged for
  role-scoped HttpOnly Secure SameSite sessions, fingerprint-only storage,
  atomic owner revocation, same-origin write marker (kernel/README.md).
- SSO/MFA: absent by sequenced decision, not omission -- "add SSO/MFA where a
  tenant requires it" is kernel/README.md Next step 2, after delivery proof.
- Customer-session codes prove possession, not identity (Honest Limits).
- Net: the shipped product has one implicit owner; no in-product RBAC is live.

Highest leverage: activate Tier 1 verified-statements on the managed tenant
once storage proof exists (enterprise-capabilities researchGate sequence);
staff-roles cannot ship before it.

## 5. Testing: A-

Justification: 600 tools/test_*.mjs files green (OPS-736, hq/TIMELINE.md),
51 kernel test files, ~41 python test files with the tests/ suite run in CI
via `python -m unittest discover -s tests` (showroom-ci.yml), all under the
621-step app:verify chain.

- Adversarial culture is real: OPS-750/751 added leak/pagination/429 and
  body-discrimination adversarial cases; OPS-754 ships 37 offline adversarial
  self-test cases; the control-records rollback fixture refuses to drop
  non-empty authority tables (kernel/README.md).
- The OPS-753 lesson (commit 9d02b574): maintenance-strategy fixtures carried
  fixed future dates validated against the real save clock -- CI failed the
  exact morning the first nextDueAt passed, and the negative cases would have
  begun falsely passing weeks later. Fix: re-anchor the whole fixture timeline
  at import-time now, preserving relative offsets. Standing rule: never let a
  fixture's absolute date race the wall clock; anchor relative or freeze.
- Five concrete coverage gaps:
  1. kernel/connectors/: 82 connector modules vs 51 kernel test files; most
     fixed-host adapters have no dedicated contract test.
  2. CoreApp.tsx (~500KB per OPS-165 lint note): zero component tests; UI is
     verified by build gates plus MANUAL 390px journeys -- no automated
     browser E2E exists in any workflow.
  3. Ecommerce resolved-support-outcome UI state: ENG-144 records "the
     fixture has no resolved case, so that state remains verifier-proven" --
     a named, never-rendered state.
  4. Hosted recovery: the OPS-754 restore/rollback proofs have never
     executed against a real branch; recovery is local-rehearsal-only.
  5. Load/perf: nothing exercises pool pressure, the 25/day scheduler
     ceiling, or concurrent budget reservation (the token cap "can modestly
     overshoot under highly concurrent calls" -- kernel Honest Limits --
     and no test measures by how much).

Highest leverage: one automated 390px browser journey in CI to replace the
manual QA lane -- it protects the largest untested surface (CoreApp.tsx).

## 6. Observability: D+ — GRADE STALE, re-derive (corrected 2026-08-31)

> **Two of the four gaps below are no longer true, and the "highest leverage"
> recommendation at the foot of this section is already complete.** Verified
> against live source, not inferred:
>
> - **Tracing shipped.** OpenTelemetry Phase A is implemented, declared and
>   wired. Four packages are pinned in BOTH `requirements.txt:5-8` and
>   `pyproject.toml:11-14` (`opentelemetry-sdk==1.44.0`,
>   `-instrumentation-fastapi`, `-instrumentation-psycopg`,
>   `-exporter-otlp-proto-grpc`). `supermega_runtime/telemetry/` carries
>   `schema.py` (283 lines), `redact.py` (314) and `tracing.py` (367), and
>   `runtime.py:36,:1047` calls `instrument_telemetry(app)` additively inside a
>   try/except so a telemetry fault cannot affect a response. The import
>   succeeds in a clean checkout. `tests/telemetry/test_redact.py` passes 12/12.
>   The scrubber fails CLOSED — on any scrub exception it drops the span rather
>   than exporting it (`tracing.py:90-92`).
> - **Alerting over measured target states shipped.**
>   `kernel/agent-company-operations.mjs:1861` is headed "founder alerting over
>   the measured target states" and imports `notifyDetailed` from `alert.mjs`.
>   Best-effort and fail-closed: without owner Telegram tokens it performs no
>   I/O, and an alert failure cannot affect the report response.
>
> **Still true:** there is no error tracking — no Sentry or equivalent in any
> manifest (re-checked across `package.json`, `showroom/`, `kernel/`,
> `requirements.txt`, `pyproject.toml`). That, not tracing, is now the real
> highest-leverage gap.
>
> The D+ rests on premises that are now false, so it is left visible rather
> than silently bumped: **re-derive it against the rubric.** The honest input
> is that three of the four original bullets are closed or partly closed, and
> what remains is error tracking plus the founder-gated items. Grading is a
> judgement call and is deliberately not made here.


Justification: what exists is thin -- a local metrics collector with four
emit sites (sale.completed, shift.close.confirmed, order.created,
accounting.export.downloaded; showroom/src/analytics/metrics-collector.ts,
OPS-165) that ships no beacon anywhere, plus the daily live-health workflow
and the kernel operations-report (7/30/90-day windows, kernel/README.md).

- No error tracking: no Sentry or equivalent dependency exists in any
  package.json (verified by search), and no error-event lane exists.
- ~~No tracing: ... zero packages installed and zero spans emitted.~~
  **STALE — withdrawn 2026-08-31.** Phase A is shipped, declared, wired and
  tested; see the correction at the head of this section. What remains is
  Phase B (managed mode), which is gated by section 5 of the implementation
  plan, not by engineering.
- ~~No alerting over measured target states: ... explicitly future -- this
  part still holds.~~ **STALE — withdrawn 2026-08-31.** It shipped; see the
  correction at the head of this section. The original narrower correction
  about live-health alerting, below, stands unchanged. Narrower correction, 2026-08-19: a failed *live-health* run is
  no longer a silent red X -- `supermega-public-live-health.yml`'s "Alert
  owner on failed live verification" step files/comments a GitHub issue on
  red, fail-open, since before this scorecard was written. See section 8
  item 4 for the full correction; the remaining gap is metric-target
  alerting (e.g. error-rate or latency thresholds), not live-health.
- Analytics is adopt (implementation-steps-ready) but the no-PII MetricEvent
  aggregate schema has not passed founder PII review or shipped.

~~Highest leverage: execute the OpenTelemetry local phase now.~~ **DONE —
this recommendation is complete as of 2026-08-31 verification; following it
would redo finished work.**

Highest leverage now: **error tracking**, which is the one bullet in this
section that survived checking. There is no Sentry or equivalent in any
manifest and no error-event lane, so a runtime exception in the hosted layer
is presently invisible. Note the adjacent partial: `client-error-reporter.ts`
exists on the browser side and reports through the metrics surface map, so
this gap is server-side, not total — scope any work to that before assuming
a greenfield build.

## 7. Scalability: B-

Justification: the design is stage-gated with concrete triggers
(AI-NATIVE-ARCHITECTURE.md sec 3.3 and 5): Stage 0 device-local trials at
zero marginal server cost, Stage 1 single-project RLS, Stage 2 pooling +
scheduler at its reviewed 25/day ceiling + analytics at 10 tenants, Stage 3
regional only on a measured residency requirement through researchGates.

- Cost scales honestly: scale-to-zero agents, durable atomic UTC-day budget
  (500k default / 2M hard max), cache hits reserve nothing (AI-NATIVE 4.2).
- Deduction: zero managed tenants and zero real leads (AI-NATIVE sec 5 Day 0
  state) means no stage above 0 has ever been exercised; every trigger
  (3 tenants, 10 tenants, 100 tenants, 80% AI spend) is waiting on data the
  observability layer (sec 6) cannot yet produce.

Highest leverage: tenant #1 on the approved preview target (Phase B), which
turns the trigger table from theory into instrumentation requirements.

---

## 8. Infrastructure and tooling recommendations (max 5)

All respect the repo's philosophy: minimal dependencies, fail-closed,
self-verifying, and entry through hq/portfolio.json researchGates. None
duplicates the deferred (dense-data-grid, realtime-broadcast) or rejected
(second-queue-or-crm) gates, existing CI, or the kernel queue.

1. OpenTelemetry tracing, local phase first.
   Why: the only planned answer to "what broke and where" across request,
   model, and database operations. Cost: dev cycles only; no vendor until
   managed mode. Gate: the EXISTING opentelemetry researchGate
   (adopt-with-managed-mode; redaction + correlation conditions must hold).
2. Error-event lane on the planned MetricEvent beacon -- not Sentry.
   Why: error tracking is the biggest observability hole, and a Sentry
   dependency would duplicate the adopted analytics beacon while adding a
   data-egress vendor. Cost: one schema addition plus review. Gate: the
   EXISTING analytics researchGate (no PII, founder PII review, localStorage
   key clears on device reset) extended to the error event shape.
3. Vercel Workflows for approval-wait patterns.
   Why: removes the "no unattended dispatcher" honest limit without building
   a scheduler. Cost: Vercel usage-priced. Gate: the EXISTING
   durable-workflows researchGate (managed persistence proven, callback auth
   satisfies the RLS tenant boundary, exactly-once order creation, lease
   check before workflow start).
4. ~~Live-health failure alerting on the existing founder-notify rail.~~
   **STALE as of 2026-08-19, and the citation was wrong when written.**
   `.github/workflows/supermega-public-live-health.yml` already has an
   "Alert owner on failed live verification" step: on a red run it opens (or
   comments on an existing open) GitHub issue via the built-in
   `GITHUB_TOKEN`, which reaches the owner through normal GitHub issue-
   notification email. `continue-on-error: true` makes it fail-open exactly
   as this recommendation asked (alert failure never blocks or rolls back
   the release), and the payload is just the run URL and which surface
   failed -- no customer data. The "daily verifier exists but fails
   silently" premise no longer holds.
   Separately, this recommendation's citation was never accurate: OPS-738
   (`hq/WORKBOARD.md`) is `sendCustomerAcknowledgement`, a Resend email sent
   to a *customer/lead* on delivery, not a founder alert -- and
   AI-NATIVE-ARCHITECTURE.md sec 3.2 is the self-serve onboarding pipeline,
   not an alerting rail. The real founder-facing notify path is
   `kernel/alert.mjs` (`captureError`/`notify`, Telegram-only, already wired
   into the money path in `kernel/connectors/payment-stripe.mjs`,
   `kernel/api/stripe-webhook.mjs`, `kernel/api/brief.mjs`,
   `kernel/api/workcells.mjs`) -- unrelated to OPS-738/Resend. The live-health
   workflow uses neither path; it has its own simpler GitHub-issue mechanism,
   which already satisfies the underlying need this recommendation asked for.
   No `researchGate` entry is needed for this item.
5. Scheduled hosted restore drills using the OPS-754 recovery proof.
   Why: backup that has never restored hosted is a hope, not a control;
   disposable Supabase preview branches are already the proven pattern
   (storage-privacy proof, OPS-752). Cost: branch-hours only. Gate: the
   managed_persistence readiness gate must pass first, then a NEW
   researchGate entry "restore-drills" bound by the reviewed 25/day
   scheduler ceiling (OPS-026) and delete-after-evidence.

---

## Overall: B- (strong spine, unproven hosted layer, thin observability)

The three moves that raise the grade fastest:

1. Run the approved 24h preview-branch rehearsal with the OPS-754 instrument
   (managed-pilot-readiness.json founderDecision). One bounded action turns
   Reliability B -> A-, Auditability A- -> A, and unlocks the access ladder.
2. Ship the observability floor: OTel local phase + error lane on the
   MetricEvent beacon (recs 1, 2 -- rec 4 is retired, already done; see
   section 8 above). D+ -> B, and it feeds every scaling trigger in
   AI-NATIVE-ARCHITECTURE.md sec 5.
3. Walk the enterprise-capabilities sequence: verified-statements on the
   managed tenant, then staff-roles with a named operator (researchGates
   sequence; enterprise-staff-roles.ts header). Access control C+ -> B+ and
   answers "enterprise level" with shipped capability instead of design.

End of document. Nothing here authorizes a deploy, push, provider write, or
production change; those remain owner-gated per hq/NOW.md.
