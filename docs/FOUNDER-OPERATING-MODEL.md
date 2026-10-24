# SuperMega founder operating model

- Status: active for the Shop launch cycle
- Owners: Swan Htet and Vivian
- Updated: 2026-10-22

## Purpose

Swan leads technical execution. Vivian leads operations and business strategy.
This model lets both move in parallel without rebuilding the same plan or
mistaking technical readiness for a sellable, supportable product.

The shared objective and current release facts remain in
[`../supergoal.md`](../supergoal.md) and [`../CURRENT.md`](../CURRENT.md).

## Decision ownership

| Decision or work | Swan | Vivian | Joint |
| --- | --- | --- | --- |
| Architecture, security, data integrity, branch and CI integrity | Accountable | Consulted for operator impact | Material product-scope change |
| Merchant journey, onboarding, language clarity, daily operating fit | Consulted and implements technical fixes | Accountable | Acceptance criteria change |
| Packaging, free/paid boundary, setup policy, support channel/hours | Feasibility and cost evidence | Proposal and operating ownership | Final customer promise and price |
| Hardware support promise | Compatibility evidence | Merchant expectation and support burden | Supported device/printer list |
| Release candidate and rollback | Candidate/evidence owner | Operational acceptance owner | Exact-candidate go/no-go |
| Customer outreach, contract, public launch | Technical claims reviewed | Business process owner | Final authorization where consequential |

Codex and other engineering agents implement bounded work, test it, identify
risks, and prepare evidence. They do not approve merchant acceptance, price,
customer promises, or production release.

Dots or another external agent is an input source only after its exact artifact
is shared and attributed. Its output is reviewed like any other proposal.

## Shared work item

Create one record for each outcome, not separate technical and operations
copies. It contains:

```text
Outcome and merchant problem:
Direct owner:
Technical owner/reviewer:
Operations owner/reviewer:
Candidate or source revision:
In scope / out of scope:
Acceptance procedure:
Evidence level:
Decision needed by whom:
Next action and date:
```

The owner-designated Operations Hub may hold the human-facing record. The PR
and committed source hold implementation and exact evidence. Link the two.

## Technical-to-operations handoff

Swan's lane hands Vivian a runnable candidate, not a feature list:

1. exact build or preview identity;
2. installation/opening steps;
3. representative data to use and data that must not be invented;
4. the complete merchant journey and expected results;
5. known limits, failure/recovery steps, and unsupported promises;
6. where Vivian records PASS, FAIL, BLOCKED, or NOT RUN.

A CI pass is ready for operations testing only when the candidate can be
identified and the expected workflow is explicit.

## Operations-to-technical handoff

Vivian returns reproducible observations. Broader redesign proposals also name
the merchant problem, the changed acceptance outcome, and the business reason:

1. exact step and operator goal;
2. expected result and observed result;
3. build/device/language and data context;
4. screenshot or other evidence when appropriate;
5. severity: blocks sale, risks records/money, causes confusion, or polish;
6. whether the issue changes the offer, support burden, or training.

Swan or the integration agent reproduces and classifies the finding before a
new implementation lane starts.

## Parallel work without redundancy

While Swan closes public-preview/device/recovery gates, Vivian can close:

- the merchant dataset and acceptance script;
- the free/paid boundary and proposed price;
- assisted setup scope and exclusions;
- the supported printer wording;
- official support channel, hours, response expectation, and escalation path;
- onboarding and first-day support materials.

Both sides pause a task that depends on the other's undecided input instead of
guessing. A blocked item must name the one missing decision and continue with an
independent useful task.

## Decision states

Use only these terminal states:

- **Keep** — accepted as-is in the current system.
- **Merge** — bounded work belongs in the active integration lane.
- **Pause** — useful but waiting on a named gate or decision.
- **Archive** — superseded or not worth maintaining.
- **Client-specific** — valid for a named engagement, not the Shop core.

Revisit a terminal state only when new evidence or owner direction is recorded.

## Joint go/no-go

The release meeting reviews the exact candidate, the gate table in
[`SHOP-RELEASE-RUNBOOK.md`](SHOP-RELEASE-RUNBOOK.md), the merchant acceptance
result, the offer/support promises, unresolved risk, and rollback readiness.

The result is **GO**, **NO-GO**, or **GO WITH NAMED CONDITIONS**. It names the
candidate, decision makers, date, conditions, and next check. Silence, a green
CI badge, or a target date is not approval.
