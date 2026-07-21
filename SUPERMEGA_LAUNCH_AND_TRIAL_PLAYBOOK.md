# `>_` SuperMega Launch and Trial Playbook

Owner: Founder / CEO
Operators: GTM & Customer Success, Product Operations, Verification, Release, and Trust agents
Scope: SuperMega Shop and SuperMega Plant
Operating rule: make the next action clear, keep the evidence, and require a responsible person to approve consequential work.

## 1. Positioning

**Company:** SuperMega builds operating software for Myanmar businesses. It connects daily work, records, approvals, and governed AI assistance in one clear system.

**Shop:** a commerce operating system for sales, local payments, stock, customers, bookings, purchasing, reporting, and daily close. The promise is one reliable operating record from counter to close.

**Plant:** a production operating system for plans, job output, machine state, materials, quality, maintenance, issues, and shift handoff. The promise is one controlled operational memory for the factory floor.

Assist is a governed capability inside Shop and Plant: it prepares evidence-linked briefs and draft actions; a responsible person approves consequential action.

### Environment truth

| Mode | What it is | Data and action boundary | Approved language |
| --- | --- | --- | --- |
| **Isolated demo** | A product demonstration at `app.supermega.dev` | Browser-local sample state; not connected to customer sources; not a system of record | "Explore the isolated Shop or Plant demo." |
| **Managed trial candidate** | A qualified customer and agreed trial plan awaiting controls | No managed writes until activation gates pass | "We are assessing a managed trial against your workflow and control requirements." |
| **Activated managed trial** | A bounded workspace enabled after recorded approval | Named users, least privilege, verified isolation, audit, recovery, support, and write controls | "Your approved managed trial workspace is active for the agreed scope." |

Never imply that opening the isolated demo activates a managed workspace.

## 2. Ideal customer profiles

| Product | Strong fit | Buyer and champion | Trigger | Poor fit for the current trial |
| --- | --- | --- | --- | --- |
| **Shop** | Myanmar retailer, restaurant, service business, or multi-branch operator with repeat daily transactions and stock movement | Owner / GM; operations or finance lead; branch manager as champion | Unreliable close, stock mismatch, disconnected sales records, weak owner visibility, or branch inconsistency | Needs an unscoped replacement of every finance, logistics, and commerce system on day one |
| **Plant** | Small or mid-market manufacturer with repeat production jobs, shifts, machines, materials, and quality checks | Owner / GM or plant director; production manager as champion; shift supervisor as operator | Output tracked manually, downtime unclear, handoffs inconsistent, exceptions discovered late, or traceability fragmented | Safety-critical autonomous control, unsupported machine integration, or immediate plant-wide rollout without a bounded pilot |

Prioritize customers with one accountable sponsor, one measurable workflow, accessible operators, usable baseline data, and willingness to run a controlled 30-day trial.

## 3. Qualification and stage gates

Ask these questions before recommending a template:

1. What business outcome must improve in the next 30 days?
2. Which single workflow causes the most delay, loss, rework, or uncertainty today?
3. Who owns that workflow, who performs it, and who approves changes?
4. How many locations, lines, shifts, users, transactions, or jobs are in the proposed scope?
5. What system or record is authoritative today, and what sample data can be reviewed safely?
6. What baseline measures exist for completion time, error rate, variance, downtime, close accuracy, or adoption?
7. Which roles may view, create, approve, export, or delete records?
8. Which payments, safety decisions, external messages, or operational actions must always remain human-controlled?
9. What identity, privacy, retention, integration, backup, recovery, and support requirements apply?
10. Who is the executive sponsor, daily trial owner, technical contact, and incident contact?
11. What evidence would support a go decision on day 30?
12. What would require a pause, rollback, extension, or no-go decision?

### Funnel stages

| Stage | Exit evidence | Owner |
| --- | --- | --- |
| **New** | Named company, contact, product interest, source, and next action | GTM & CS Agent |
| **Qualified** | Workflow, pain, sponsor, operator, baseline, timing, and safety boundary recorded | GTM & CS Agent; Founder approves fit |
| **Demo booked** | Relevant template selected and agenda accepted | Demo Agent |
| **Trial candidate** | Bounded scope, success measures, users, data class, controls, and decision date agreed | Founder + Customer Trial Owner |
| **Activation review** | Identity, workspace isolation, permissions, audit, recovery, support, and write-gate evidence passed | Verification + Trust Leads |
| **Managed trial** | Human activation decision recorded; workspace and support contacts confirmed | Founder + Customer Trial Owner |
| **Decision** | Evidence report supports production expansion, bounded extension, or shutdown and data disposition | Founder + Customer Sponsor |

## 4. Template-to-customer mapping

| Product template | Select when | First configured workflow | Day-30 proof |
| --- | --- | --- | --- |
| **Shop: Retail counter** | Fast selling and stock accuracy drive the business | Sale -> payment record -> stock update -> daily close | Sale and inventory journeys complete reliably; close variance is measurable |
| **Shop: Restaurant and inventory** | Menu sales depend on ingredients, purchasing, waste, and shift close | Menu sale -> ingredient movement -> exception -> shift close | Ingredient and cash exceptions are visible and assigned |
| **Shop: Service and bookings** | Appointments, work status, parts, and follow-up share one customer journey | Booking -> work status -> parts -> payment -> follow-up draft | Operators can trace each booking through completion |
| **Shop: Multi-branch control** | Owners need shared standards and branch-level accountability | Shared catalogue -> branch transaction -> transfer / exception -> owner review | Branch exceptions and responsibilities are visible without merging roles |
| **Plant: Production control** | Plan-versus-actual output and handoff are the main gap | Job plan -> output confirmation -> variance -> shift handoff | Job updates remain complete, attributable, and conflict-free |
| **Plant: Maintenance and downtime** | Machine stoppage ownership and return to service are unclear | Machine state -> downtime issue -> owner -> repair evidence -> approved return | Downtime duration, owner, cause, and resolution are traceable |
| **Plant: Quality and traceability** | Checks, exceptions, evidence, and lot history are fragmented | Quality check -> exception -> evidence -> approval -> lot history | Required checks and exception decisions have complete evidence |
| **Plant: Material receiving** | Arrival quantity, inspection, variance, and stock handoff are weak | Receipt -> inspection -> accepted quantity -> variance -> handoff | Receipts and variances reconcile with named acceptance decisions |

Start with one template. Add a second only when the first golden journey is stable and the sponsor accepts the added scope.

## 5. Demo script (20 minutes)

**Before the call:** record the prospect's workflow, choose one template, reset the demo, use sample data only, and write one outcome question. Do not improvise integrations or commitments.

1. **Frame - 2 min:** "SuperMega gives Shop or Plant one clear operating record. Today is an isolated demo using browser-local sample data, not your managed workspace."
2. **Confirm outcome - 2 min:** restate the current workflow, pain, responsible roles, and desired evidence. Ask the prospect to correct it.
3. **Command - 3 min:** create a work item, assign an owner, start it, and explain that work moves from queued to in progress to done with visible responsibility.
4. **Product journey - 6 min:**
   - Shop: record a sample sale, show the stock movement, inspect an exception, and create a daily-close snapshot; or
   - Plant: update a sample job within its target, change a sample machine state, open an issue, and show the handoff record.
5. **Assist - 2 min:** build an evidence-grounded brief and route a draft through approval. State: "AI prepares; a responsible person approves."
6. **Setup and evidence - 2 min:** select the recommended template, show workspace ownership, export demo evidence, and explain that demo state remains local and resettable.
7. **Trust boundary - 1 min:** distinguish demo readiness from managed-trial activation and name the identity, isolation, access, audit, backup, recovery, and approval gates.
8. **Close - 2 min:** ask, "Is this the workflow worth proving for 30 days?" Agree one next action, owner, and date; otherwise close the lead respectfully.

After the call, send only human-approved notes and links. Record objections, requested capabilities, unsupported assumptions, and the next decision.

## 6. Managed-trial activation checklist

The 30-day managed-trial clock starts only after every activation item is evidenced and the Founder plus customer trial owner record a go decision.

- [ ] Executive sponsor, trial owner, daily operators, technical contact, and incident contact named.
- [ ] One product, one primary template, bounded locations / lines, and explicit exclusions agreed.
- [ ] Baseline, target, numerator, denominator, source, and measurement window agreed for each KPI.
- [ ] Data inventory reviewed; approved sample / trial data and disposition plan documented.
- [ ] Trial workspace isolated; trusted identity gateway and named memberships verified.
- [ ] Least-privilege capabilities tested, including access removal and prohibited actions.
- [ ] Private data controls, immutable events, versioned state, and approval records verified.
- [ ] No browser credential can bypass workspace controls or sign identity.
- [ ] Backup, restore, rollback, and RLS / isolation tests pass with retained evidence.
- [ ] Support hours, severity contacts, response path, and communications cadence accepted.
- [ ] Product golden journey, approval journey, and failure / recovery journey pass.
- [ ] Known limitations and all customer-facing claims reviewed by a human.
- [ ] Managed writes enabled only after the recorded human activation approval.

If any item fails, continue discovery or isolated-demo evaluation; do not relabel it as an active managed trial.

## 7. Thirty-day managed-trial lifecycle

| Phase | Required work | Exit evidence |
| --- | --- | --- |
| **Days 1-3: Ready** | Reconfirm owners and scope; provision named access; load approved data; capture baselines; pass product, approval, and recovery journeys | Signed kickoff record, access evidence, baseline snapshot, golden-journey results |
| **Days 4-7: Guided use** | Run the core workflow daily; assign every issue; observe operators; require approvals for consequential drafts | Daily completion log, friction list, approval record, no unresolved critical control failure |
| **Days 8-14: Real workflow** | Expand to the selected operator group; measure adoption and errors; complete access review and restore drill | Weekly scorecard, operator interviews, access review, recovery evidence |
| **Days 15-21: Controlled scale** | Increase bounded volume; exercise handoffs and degraded conditions; verify audit coverage; rehearse rollback and incident response | Load comparison, handoff evidence, audit sample, rollback and incident drill |
| **Days 22-27: Prove value** | Compare with baseline; resolve critical gaps; freeze optional scope; draft the evidence report | KPI calculations, limitations, user feedback, decision options and costs |
| **Days 28-30: Decide** | Run final verification and security review; agree expansion, bounded extension, or shutdown | Human decision, approved next scope or data-disposition confirmation |

An extension needs a specific unanswered question, a fixed duration, an owner, and a new decision date. It is not the default response to weak evidence.

## 8. Evidence and KPI scorecard

Every metric must include its baseline, trial result, numerator, denominator, source, window, owner, and confidence note. Targets are evaluation thresholds, not commercial guarantees.

| Area | Measure | Initial trial target | Evidence source | Owner |
| --- | --- | --- | --- | --- |
| Workflow ownership | Priority work with owner and acceptance criteria | 100% | Command task export | Operations Lead |
| Shop journey | Successful sale, stock, and close journeys | >= 98% | Shop records + verification log | Shop Operator |
| Plant journey | Job updates without lost or conflicting state | >= 98% | Plant records + verification log | Plant Operator |
| Evidence quality | Material brief claims linked to approved evidence | 100% | Assist brief + source review | Assist Steward |
| Approval safety | Consequential actions without recorded approval | 0 | Approval and immutable event records | Trust Lead |
| Access control | Unauthorized cross-role or cross-workspace access | 0 | Access / isolation test evidence | Verification Lead |
| Reliability | Core-surface availability during agreed trial hours | >= 99.5% | Health and incident records | Release Captain |
| Support | Median issue acknowledgement | < 30 minutes during agreed support hours | Support log | GTM & CS Agent |
| Adoption | Invited operators completing one core journey weekly | >= 70% | Named-user activity summary | Customer Trial Owner |
| Recovery | Required restore and rollback exercises passed | 100% | Dated recovery evidence | Release + Trust Leads |
| Value | Agreed business measure versus baseline | Direction and threshold agreed before activation | Customer-approved source | Founder + Sponsor |

The weekly scorecard must also list open limitations, incidents by severity, customer decisions required, and evidence gaps. A missing source is a failed measurement, not a zero.

## 9. Lead follow-up sequences

Agents may prepare these messages; a human approves every external send. Stop on opt-out, wrong contact, clear no-fit, or risk concern. Record channel, date, owner, response, consent / preference, and next action.

### A. Qualified demo follow-up

| Timing | Purpose | Message structure | CTA |
| --- | --- | --- | --- |
| **Same day** | Confirm relevance | Their stated workflow -> selected Shop / Plant template -> isolated-demo boundary | Confirm 20-minute demo time |
| **Day 2** | Add practical value | One workflow map and the evidence the demo will produce | Reply with current baseline or owner |
| **Day 5** | Resolve uncertainty | Answer one known objection without making a new claim | Keep, change, or cancel the demo |
| **Day 10** | Close the loop | Summarize fit and missing qualification evidence | Book next step or close record |

### B. Post-demo trial sequence

| Timing | Purpose | Required content | CTA |
| --- | --- | --- | --- |
| **Within 4 hours** | Preserve shared understanding | Outcome, template shown, demo-only status, questions, next owner and date | Confirm notes |
| **Day 2** | Define trial | Proposed bounded scope, baseline, KPI, users, exclusions, activation controls | Hold 30-minute scope review |
| **Day 5** | Test commitment | Activation checklist progress, unresolved risks, customer dependencies | Assign owners and due dates |
| **Day 10** | Decide readiness | Evidence passed, failed, or missing; no pressure language | Activate after approval, continue discovery, or stop |

### C. Trial communications

- **Kickoff:** scope, responsibilities, data boundary, support path, success scorecard, and stop conditions.
- **Daily brief:** health, completed journeys, blockers, approvals, incidents, and today's owners.
- **Weekly review:** KPI movement, operator feedback, evidence quality, access changes, risks, and next experiment.
- **Incident update:** known facts, impact, containment, owner, next update time; never speculate.
- **Day-30 decision:** baseline comparison, controls, limitations, recommendation, costs / dependencies, and recorded human decision.

## 10. Founder and agent ownership

| Role | Accountable output | Cannot do alone |
| --- | --- | --- |
| **Founder / CEO** | Positioning, qualification approval, commercial terms, activation and expansion decision | Delegate accountability for claims, contracts, customer risk, or production approval |
| **GTM & CS Agent** | Lead record, qualification brief, follow-up drafts, onboarding coordination, customer health | Send externally, promise price / timing / capability, or activate a workspace |
| **Demo Agent** | Template-specific agenda, reset demo, demo evidence, objection log | Use customer data in the isolated demo or imply managed operation |
| **Operations Lead** | Trial plan, Command ownership, daily brief, dependencies | Approve its own scope or release |
| **Shop / Plant Operator** | Product journey execution, exceptions, operator support, evidence | Execute financial, safety, deletion, export, or external action without approval |
| **Assist Steward** | Evidence-linked briefs and approval-ready drafts | Present inference as fact or execute consequential action |
| **Verification Lead** | Acceptance, regression, isolation, access, and recovery evidence | Waive a failed control or self-verify implementation work |
| **Release Captain** | Candidate, smoke checks, monitoring, rollback record | Promote without required human and verification gates |
| **Trust & Incident Lead** | Access review, audit, incident control, postmortem | Hide, alter, or delete material evidence |

One role owns each action; one human is accountable for each gate. Agent output is a draft or recommendation until the named human accepts it.

## 11. Operating communications cadence

| Moment | Participants | Artifact | Decision |
| --- | --- | --- | --- |
| **New lead, same business day** | GTM & CS Agent -> Founder | Qualification snapshot | Pursue, nurture, or close |
| **Pre-demo, 15 min internal** | GTM & CS + Demo Agent | Demo brief | Template, outcome, boundary |
| **Managed trial daily, 15 min** | Customer owner + operators + Operations Lead | Command brief | Owners, due times, escalation |
| **Managed trial weekly, 45 min** | Sponsor + Founder + trial team | KPI / risk scorecard | Continue, change, pause |
| **Release decision** | Verification + Release + Founder | Release and rollback evidence | Go or no-go |
| **Incident** | Trust Lead + human incident owner | Timestamped incident record | Contain, communicate, restore |
| **Day 30, 60 min** | Sponsor + Founder + accountable leads | Evidence report | Expand, extend, or shut down |

## 12. Claims and safety boundaries

**May say:**

- SuperMega builds Shop and Plant operating software for Myanmar businesses.
- The public product experience is an isolated demo using sample, browser-local state.
- Governed assistance can prepare evidence-linked briefs and approval-ready drafts.
- A managed trial is available only after its technical, operational, and human activation gates pass.
- Trial targets and observed results will be reported with sources and limitations.

**Must not say or imply:**

- that isolated-demo records are managed, durable, backed up, integrated, or a customer system of record;
- that a managed workspace, database, integration, security control, recovery process, or enterprise capability is active before current evidence proves it;
- guaranteed revenue, savings, uptime, accuracy, compliance, safety, or autonomous operation;
- that AI can approve, pay, publish, contact, delete, export, change access, or control production without the required person;
- a customer name, result, logo, quote, or data point without recorded permission and source evidence;
- pricing, implementation dates, scope, or contractual terms not approved by the Founder.

**Always escalate:** financial action; external communication; personal or sensitive data; access or credential change; export or deletion; Plant safety limit or critical warning; legal / compliance claim; production promotion; material incident; or any ambiguous authority.

The default response to missing evidence is: **"Not yet verified. Here is the gate, owner, and next check."**
