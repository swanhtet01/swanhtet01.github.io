# SuperMega Resellable Product Templates (V1)

## Product Rule

A sellable SuperMega product must satisfy all of these:

- solves one business control problem
- needs only common client data sources
- produces owner, due date, and evidence-linked output
- can start as one module, then connect into `SuperMega OS`
- can be adapted by configuration, mapping, and terminology changes rather than rebuild

## Standard Product Template

Every product template should be defined with the same structure:

1. buyer
2. business problem
3. minimum required data
4. optional extra data
5. core workflow
6. standard outputs
7. rollout shape
8. reuse knobs

## 1. Supplier Watch Template

### Buyer

- procurement lead
- supply chain manager
- operations director

### Business Problem

Supplier risk is buried across inboxes, ETA sheets, customs notes, and forwarded messages.

### Minimum Required Data

- supplier email threads
- ETA or shipment sheet
- simple supplier list

### Optional Extra Data

- customs paperwork
- invoice/payment status
- purchase order register

### Core Workflow

1. ingest supplier signal
2. classify risk type:
   - delay
   - payment
   - customs
   - documentation
   - quality
3. score severity
4. assign owner and due date
5. push to supplier risk board

### Standard Outputs

- supplier risk queue
- escalation list
- owner follow-up list
- reply draft
- weekly supplier watch summary

### Rollout Shape

- week 1: connect inbox + sheet
- week 2: start risk queue and owner workflow
- week 3+: add escalation and score tuning

### Reuse Knobs

- supplier naming map
- buyer terminology
- document types
- risk thresholds
- owner routing rules

## 2. Quality Closeout Template

### Buyer

- QA lead
- plant manager
- operations director

### Business Problem

Quality incidents live in email, WhatsApp-like notes, spreadsheets, and memory instead of a close-out system.

### Minimum Required Data

- incident sheet or email intake
- severity field
- owner field

### Optional Extra Data

- evidence links
- batch or product reference
- supplier reference

### Core Workflow

1. create incident
2. assign containment
3. draft root cause path
4. create CAPA actions
5. track verification and closure

### Standard Outputs

- incident register
- open CAPA board
- closure checklist
- weekly quality summary
- supplier nonconformance view

### Rollout Shape

- week 1: incident intake
- week 2: CAPA chain
- week 3+: closure discipline and trend views

### Reuse Knobs

- severity model
- issue taxonomy
- supplier vs internal issue routing
- closure requirements
- approval rules

## 3. Cash Watch Template

### Buyer

- finance manager
- commercial controller
- founder / director

### Business Problem

Cash follow-up is scattered across invoice sheets, cash books, reminders, and informal follow-up.

### Minimum Required Data

- invoice sheet
- cash collection register or payment note
- customer list

### Optional Extra Data

- reminder emails
- bank confirmation files
- aging categories

### Core Workflow

1. ingest invoice and payment signals
2. detect overdue or missing follow-up
3. rank collection priority
4. assign owner
5. generate follow-up draft

### Standard Outputs

- overdue queue
- collection board
- customer follow-up pack
- weekly cash watch summary

### Rollout Shape

- week 1: ingest invoice + collection sheets
- week 2: priority queue + owner routing
- week 3+: reminder drafts and aging views

### Reuse Knobs

- aging buckets
- customer segmentation
- follow-up policy
- write-back rules
- priority scoring

## 4. Production Pulse Template

### Buyer

- plant manager
- production head
- operations director

### Business Problem

Shift updates and blockers are fragmented, so managers do not get one clean execution board.

### Minimum Required Data

- shift update form or sheet
- output or downtime note
- owner list

### Optional Extra Data

- target plan
- machine or line code
- reason code taxonomy

### Core Workflow

1. ingest shift update
2. classify issue or blocker
3. compare plan vs actual
4. assign owner and due date
5. generate daily plant brief

### Standard Outputs

- daily plant brief
- blocker queue
- owner action board
- shift handover summary

### Rollout Shape

- week 1: update template
- week 2: blocker queue
- week 3+: plan-vs-actual and recurring director brief

### Reuse Knobs

- plant / line structure
- reason codes
- owner routing
- escalation rules
- reporting cadence

## 5. Sales Signal Template

### Buyer

- commercial manager
- sales lead
- founder / director

### Business Problem

Demand shifts and market signals are spread across distributor notes, sales sheets, and external news.

### Minimum Required Data

- sales sheet
- channel or distributor update
- one external watch source

### Optional Extra Data

- pricing sheet
- inventory position
- customer segment tags

### Core Workflow

1. ingest market and channel signals
2. classify by product, region, or channel
3. detect demand shift
4. assign follow-up action
5. generate short commercial watch brief

### Standard Outputs

- demand shift alerts
- commercial watch board
- channel follow-up actions
- weekly market brief

### Rollout Shape

- week 1: channel update intake
- week 2: demand watch
- week 3+: price and inventory-linked decisions

### Reuse Knobs

- product hierarchy
- channel map
- territory names
- market watch sources
- price movement rules

## 6. SuperMega OS Template

### Buyer

- founder
- director
- COO / GM

### Business Problem

The company runs on scattered email, Drive, Sheets, and manual follow-up with no shared action layer.

### Minimum Required Data

- one or more module templates live
- owner directory
- approval structure

### Optional Extra Data

- ERP export
- customer / supplier master
- KPI baseline

### Core Workflow

1. normalize module outputs into one action model
2. unify owner, due date, status, evidence, and approval
3. generate role-specific views
4. run weekly decision loops

### Standard Outputs

- founder command view
- manager action boards
- weekly operating brief
- approval queue
- audit trail

### Reuse Knobs

- role structure
- approval rules
- KPI pack
- module mix
- reporting rhythm

## Packaging Rule

The easiest sellable structure is:

- free proof tool
- one control module
- `SuperMega OS` expansion path

Do not sell "AI agents" as the main thing.
Sell a control problem being fixed with a standard module template.
