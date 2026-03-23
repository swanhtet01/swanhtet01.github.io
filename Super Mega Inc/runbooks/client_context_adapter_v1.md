# Client Context Adapter (V1)

## Purpose

This is the layer that makes SuperMega products reusable across clients.

The product logic should stay mostly stable.
What changes per client is the context pack.

## Rule

Do not rebuild the product for each company.

Swap these six packs instead:

1. connector pack
2. entity map
3. terminology pack
4. workflow rules pack
5. output pack
6. governance pack

## 1. Connector Pack

This defines where signals come from.

Supported connector types:

- `gmail_thread`
- `drive_file`
- `sheet_row`
- `manual_form`
- `external_feed`
- `erp_export`

Each product template should declare:

- required connectors
- optional connectors
- polling or refresh rule
- write-back target if any

## 2. Entity Map

This is the minimum reusable data model.

### Core Entities

- company
- person
- team
- supplier
- customer
- item
- document
- signal
- action
- incident
- approval
- metric

### Required Shared Fields

Every action-like entity should carry:

- `source_ref`
- `owner`
- `due_date`
- `priority`
- `status`
- `evidence_links`
- `created_at`
- `updated_at`

## 3. Terminology Pack

Different clients use different language for the same thing.

Examples:

- incident vs issue vs complaint
- PO vs order vs requisition
- shift vs line vs plant vs branch
- collection vs payment follow-up

The terminology pack maps client words into canonical product entities.

## 4. Workflow Rules Pack

This holds the client-specific logic that should stay outside the core product.

Examples:

- severity thresholds
- escalation timing
- owner routing rules
- approval requirements
- due-date defaults
- business calendar rules

## 5. Output Pack

The same product should be able to render different views for different buyers.

Standard output types:

- action board
- weekly brief
- exception queue
- manager view
- founder view
- audit export

The output pack decides:

- view labels
- required columns
- summary phrasing
- chart or KPI set

## 6. Governance Pack

This defines what the machine may do automatically.

Examples:

- read-only
- draft-only
- write-back allowed
- approval required
- who can close or override

## Productization Pattern

The reusable architecture should look like this:

`product template` + `client context adapter` = `client-specific deployment`

That means:

- the product template owns workflow logic
- the adapter owns mappings and client-specific variation

## Example

### Supplier Watch

Stable product logic:

- detect supplier risk
- score severity
- assign owner
- create follow-up queue

Client-specific adapter:

- which inboxes to monitor
- supplier naming aliases
- customs document names
- owner routing
- escalation window

## Implementation Guidance

### V1

Store the adapter as config + mappings:

- `client_profile.json`
- `entity_aliases.json`
- `routing_rules.json`
- `output_preferences.json`

### V2

Move adapter data into a database-backed admin layer:

- connector registry
- entity aliases table
- rule packs
- role and approval settings

## Why This Matters

Without this adapter layer, every pilot becomes custom software.

With it, the same five SuperMega modules can be sold into:

- factory
- distributor
- trading company
- service company
- retail network

with mostly the same code and different context packs.
