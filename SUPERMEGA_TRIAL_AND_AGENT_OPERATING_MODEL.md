# SuperMega Trial and Agent Operating Model

`>_` is SuperMega's operating signature: direct, evidence-led, and ready for action. This model governs SuperMega Command, Shop, Plant, and Assist during product trials and production releases.

## Activation truth

The public app is an isolated demonstration, not a customer system of record. Its browser data is local, exportable, and deliberately disconnected from customer sources. The managed trial API at `/api/trial/v1` is a separate, fail-closed boundary for Command, Shop, Plant, Setup, and approvals.

A managed trial may be enabled only after the private Supabase migration is verified on a non-production branch; a dedicated non-BYPASSRLS database login is provisioned; named workspace memberships and capabilities exist; a trusted gateway signs workspace and actor identity; recovery and RLS tests pass; and a human explicitly enables writes. Browser code never receives a database service role or the identity-signing secret.

## Agent company roles

| Role | Owns | Boundary |
| --- | --- | --- |
| **>_ Operations Lead** | Intake, priorities, cross-product plan, daily brief | Cannot approve its own scope or release |
| **>_ Command Steward** | Command health, work queue, owners, dependencies | Coordinates work; does not alter Shop or Plant records |
| **>_ Shop Operator** | Catalog, inventory, orders, close checks, trial support | Cannot issue refunds, change prices, or export customer data without approval |
| **>_ Plant Operator** | Jobs, output, machines, issues, shift handoff | Cannot change safety limits or close critical incidents |
| **>_ Assist Steward** | Evidence-grounded briefs, drafts, recommendations, approval queue | Cannot claim unsupported facts or execute consequential actions |
| **>_ Verification Lead** | Acceptance criteria, tests, security and regression evidence | Cannot waive a failed control |
| **>_ Release Captain** | Release candidate, rollout, rollback, release record | Cannot promote without the required human gate |
| **>_ Trust & Incident Lead** | Access review, audit trail, incident command, postmortems | May pause agents and releases; cannot conceal or delete evidence |

One role owns each task. Agents may prepare and recommend; the named human trial owner remains accountable for commercial, financial, safety, privacy, access, and production decisions.

## Work lifecycle

1. **Intake** — Command records the outcome, affected surface, urgency, owner, data sensitivity, and measurable acceptance criteria.
2. **Plan** — Operations Lead decomposes the work, identifies dependencies and risks, assigns roles, and marks required approval gates.
3. **Execute** — The assigned operator works only inside the approved scope and records material decisions, changes, and evidence links in Command.
4. **Verify** — Verification Lead checks acceptance criteria, core journeys, permissions, data integrity, observability, and rollback readiness. The executor cannot self-verify.
5. **Approve** — The accountable human reviews the outcome and evidence for gated actions. Rejection returns the task to Plan with a reason.
6. **Release** — Release Captain deploys the approved candidate, performs smoke checks, monitors health, and records the result or rollback.

### Human approval gates

Human approval is mandatory before:

- changing trial scope, acceptance criteria, pricing, contractual promises, or customer-facing claims;
- importing, exporting, deleting, or broadly sharing customer or operational data;
- changing identity, permissions, credentials, integrations, billing, or financial records;
- executing refunds, purchases, external communications, or irreversible actions;
- changing Plant safety limits or overriding a critical operational warning;
- promoting to production, enabling a trial tenant, or accepting a known high-severity risk.

Agents must stop, preserve evidence, and escalate when a gate is missing or ambiguous. Approval must identify the approver, decision, scope, and time; chat silence is not approval.

## Trial onboarding checklist

- [ ] Name the executive sponsor, trial owner, daily operator, technical contact, and incident contact.
- [ ] Select trial outcomes and baseline metrics for Command, Shop, Plant, and Assist.
- [ ] Define one Shop location and one Plant workspace; keep trial data isolated.
- [ ] Invite named users with least-privilege roles and test sign-in, sign-out, and access removal.
- [ ] Load a reviewed sample catalog, inventory baseline, machines, jobs, and operating thresholds.
- [ ] Configure Assist sources, citation expectations, prohibited actions, and approval owners.
- [ ] Confirm data handling, retention, support hours, severity contacts, and rollback procedure.
- [ ] Run four golden journeys: Command work assignment; Shop sale and stock update; Plant job and issue flow; Assist brief and approval.
- [ ] Capture baseline performance, audit evidence, known limitations, and go/no-go acceptance.
- [ ] Obtain human trial activation approval and schedule the first daily check-in.

## Operating cadence

**Daily, 15 minutes:** Command reviews service health, trial activity, blocked work, agent approvals, data exceptions, and incidents. Each item leaves with one owner and due time. Release Captain posts a same-day release or no-release decision.

**Weekly, 45 minutes:** Review KPI movement, user feedback, Shop and Plant journey failures, Assist evidence quality, security/access changes, incidents, and the next week's trial experiments. The human trial owner accepts, changes, or stops the plan.

## Trial scorecard

| Area | KPI | Initial target |
| --- | --- | --- |
| Command | Priority work with owner, due time, and acceptance criteria | 100% |
| Shop | Golden sale and inventory journeys completed successfully | >= 98% |
| Plant | Jobs updated without lost or conflicting state | >= 98% |
| Assist | Brief claims linked to approved evidence | 100% |
| Approvals | Consequential actions executed without recorded approval | 0 |
| Reliability | Core-surface availability during trial hours | >= 99.5% |
| Support | Median acknowledgement of trial issues | < 30 minutes |
| Adoption | Invited operators completing a core journey weekly | >= 70% |
| Release | Production releases with verified rollback evidence | 100% |

Targets are trial baselines, not customer promises. Command reports the numerator, denominator, source, and measurement window for every KPI.

## Incident escalation

| Severity | Example | Response |
| --- | --- | --- |
| **SEV-1** | Data exposure, unauthorized consequential action, unsafe Plant behavior, or all core surfaces unavailable | Pause affected agents and releases immediately; notify human incident owner within 10 minutes; contain, preserve evidence, and provide updates every 30 minutes |
| **SEV-2** | A core Shop or Plant journey is unavailable with no safe workaround | Assign incident lead within 15 minutes; update hourly; restore or roll back before feature work resumes |
| **SEV-3** | Degraded workflow, inaccurate non-critical brief, or usable workaround | Triage the same business day and schedule a verified fix |
| **SEV-4** | Cosmetic issue or low-impact improvement | Add to the weekly product review |

Only the human incident owner may accept residual SEV-1 or SEV-2 risk. Every SEV-1/2 receives a blameless postmortem with timeline, impact, root cause, corrective owner, due date, and regression check.

## Next 30-day product trial

- **Days 1-3 — Ready:** confirm owners, isolate the trial workspace, provision access, load reviewed sample data, establish baselines, and pass all four golden journeys.
- **Days 4-7 — Guided use:** run daily Shop and Plant workflows, use Command for every trial task, and require approvals for every Assist recommendation that could trigger action.
- **Days 8-14 — Real workflow:** onboard the selected operator group, measure adoption and completion, resolve high-friction steps, and complete the first access review and recovery drill.
- **Days 15-21 — Controlled scale:** increase transaction and job volume, exercise shift handoffs, test degraded conditions, verify audit evidence, and rehearse rollback plus SEV-1 escalation.
- **Days 22-27 — Prove value:** compare trial KPIs with baselines, interview operators, close critical gaps, freeze non-essential scope, and prepare an evidence-backed trial report.
- **Days 28-30 — Decide:** run final verification, review security and limitations, and hold a human go/no-go decision for production expansion, a bounded extension, or shutdown with data disposition.

The trial succeeds only when users complete real Command, Shop, Plant, and Assist journeys, controls work under pressure, KPI evidence is credible, and the accountable human explicitly approves the next stage.
