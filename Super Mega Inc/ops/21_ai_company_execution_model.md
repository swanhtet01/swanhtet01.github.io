# AI Company Execution Model

This is the execution model for SuperMega as an AI-native software company.

## Core rule

The company runs through pods, queues, loops, and one control layer.

Not through:
- loose chat
- disconnected notes
- manual shell rituals
- one giant agent

## Surfaces

### Public site
- `supermega.dev`
- explains the company
- captures inbound
- shows proof

### Internal control plane
- `app.supermega.dev`
- main operating surface
- founder and pod control

Primary split:
- `Dev Desk` = founder control, runtime, tenant, auth, inbound, and release state
- `HQ` = company state and priorities
- pod pages = focused operating surfaces for revenue, delivery, and runtime

### Worker runtime
- scheduled and queued execution
- keeps loops moving 24/7

### Local mirror
- founder-readable outputs outside the browser
- machine-readable ops snapshots

## Company motion

The company should cycle through five steps:

1. Capture
- inbound requests
- research
- lists
- updates
- documents

2. Decide
- founder sets direction
- pod chooses next action
- approvals gate risky work

3. Execute
- loops run
- queues drain
- operators intervene only where needed

4. Verify
- runtime health
- release health
- queue freshness
- customer-visible output

5. Learn
- improve templates
- update offers
- update guardrails

## Pod execution model

### Founder Control Pod
- runs `Dev Desk`
- decides direction
- approves releases and promises
- reviews the brief

### Revenue Pod
- turns inbound and search into deals
- keeps next steps moving

### Delivery Pod
- provisions and maintains client systems
- keeps blockers visible

### Runtime Pod
- keeps the company stack healthy
- detects and recovers drift

### Knowledge Pod
- turns messy inputs into reusable operating state

## What agents must do

Agents must create durable state:
- deals
- tasks
- approvals
- exceptions
- decisions
- briefs
- incidents

If the output cannot be acted on in the app, it is incomplete.

## What humans still own

Humans still own:
- product direction
- pricing
- customer promises
- release approval
- ambiguous business judgment

## Phone vs desktop

### Phone
Use for:
- brief review
- approvals
- queue health
- incident awareness

### Desktop
Use for:
- founder control
- rollout review
- release review
- product and tenant decisions

## Dev Desk / Codex replacement boundary

The app should replace chat as the control plane for daily company operation.

`Dev Desk` should become the default place to answer:
- What is live right now?
- Which tenant is active?
- Are demo credentials still active?
- Is Google auth ready?
- Which loops are drifting?
- What changed since the last founder check?

Codex should remain for:
- engineering changes
- infrastructure restructuring
- one-off debugging
- deep investigations

If the founder needs Codex to know whether the company is healthy, the model is still incomplete.
