# Meta Tools And Company Stack

This is the stack for running SuperMega as a small AI-native company.

## Control principle

One control plane.
One state layer.
Multiple pods.
Durable loops.

## Founder-facing stack

### Dev Desk
Purpose:
- runtime view
- tenant identity
- auth mode
- loop control
- inbound and operator visibility

### HQ
Purpose:
- company state
- priorities
- risk
- decisions

### Company
Purpose:
- decisions
- operating record
- longer-running commitments

## Pod stack

### Revenue Pod
Uses:
- Deals
- contact intake
- lead and list tooling

Needs:
- prospect state
- outreach drafts
- follow-up tasks
- deal stage visibility

### Delivery Pod
Uses:
- Workflows
- approvals
- exceptions

Needs:
- rollout tasks
- provisioning actions
- blocker visibility
- implementation ownership

### Runtime Pod
Uses:
- Dev Desk
- Agents

Needs:
- scheduler state
- queue status
- recent runs
- incident visibility
- release checks

### Knowledge Pod
Uses:
- intake and document flows
- template and brief inputs

Needs:
- structured document output
- reusable template memory
- founder brief inputs

## Runtime stack

### Web
- Cloud Run app
- internal control plane
- public contact flow

### State
- Cloud SQL Postgres
- app-visible records as source of truth

### Execution
- scheduler-triggered loops
- queued processing
- worker actions that write durable state

### Secrets
- Secret Manager

### Local mirror
- `pilot-data/ops/*`
- `Super Mega Inc/ops/*`

## Visibility stack

Required:
- app-visible recent runs
- app-visible auth and tenant mode
- app-visible queue drift
- app-visible approvals and blockers

Next:
- Sentry
- PostHog
- Resend
- Cloud logging and alerting refinement

## Sidecar rule

Browser automation is sidecar-only.

Use it for:
- screenshots
- preview verification
- browser-only checks
- controlled admin automations

Do not use it as:
- the company memory
- the main runtime
- the only way to recover state

## Scaling rule

To scale, add capacity by:
- adding loops
- adding queues
- adding pod-specific views
- adding clearer outputs

Do not scale by:
- creating more vague agents
- creating another control plane
- creating more unstructured reports

## Operating standard

The stack is good enough when:
- the founder can run the company from Dev Desk and HQ
- every pod has one clear surface and one clear queue
- loops keep moving without Codex
- tenant and auth state are visible
- releases and incidents are visible
