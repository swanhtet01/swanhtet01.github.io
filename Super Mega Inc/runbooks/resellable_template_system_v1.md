# Resellable Template System (V1)

## Goal

Build products once, then adapt them to different clients by changing:

- data connectors
- entity mapping
- business rules
- role views

without changing the core workflow every time

## Template Layers

### 1. Connector Layer

What changes per client:

- Gmail mailboxes or forwarded email paths
- Drive or Shared Drive folder IDs
- Sheets IDs and tab names
- optional ERP or database source
- external watch sources

What stays standard:

- connector interface
- ingest schedule
- normalization contract

## 2. Entity Layer

What changes per client:

- supplier names
- customer names
- invoice schema
- incident types
- plant names
- role names

What stays standard:

- entity classes
- record IDs
- status model
- owner model

## 3. Workflow Layer

What changes per client:

- severity thresholds
- due-date rules
- escalation ladder
- review cadence

What stays standard:

- ingest
- classify
- assign
- track
- close

## 4. View Layer

What changes per client:

- founder view
- director view
- manager view
- team lane names

What stays standard:

- action board
- blocker list
- approval queue
- evidence-linked detail

## Standard Product Template

Every sellable module should have:

1. buyer
2. business problem
3. required data
4. standard workflow
5. standard outputs
6. adaptation fields
7. rollout steps
8. success checks

## Standard Rollout Steps

### Step 1. Context intake

- collect source list
- collect entity aliases
- collect owner map
- collect business rules

### Step 2. Connector setup

- connect mailbox, Drive, and Sheets
- test source access
- validate sample records

### Step 3. Template adaptation

- map client entities to standard schema
- map role names
- set risk or severity rules

### Step 4. First workflow live

- run one module
- review outputs with client owner
- tighten logic and language

### Step 5. Operating rhythm

- set daily or weekly review cadence
- confirm owner actions
- confirm closeout behavior

## Minimum Shared Schema

Every client should map into these standard record types:

- `action_item`
- `signal_event`
- `supplier_record`
- `customer_record`
- `incident_record`
- `capa_record`
- `invoice_record`
- `payment_record`
- `shipment_record`

## Why This Matters

Without a template system, every client becomes a custom project.

With a template system:

- the product is clearer
- the rollout is faster
- the SOP is reusable
- the company can scale without rebuilding from scratch
