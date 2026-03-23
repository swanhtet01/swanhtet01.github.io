# Client Context Template Model (V1)

## Purpose

This model defines what must be collected to adapt one SuperMega product to a new client without redesigning the product itself.

## Context Pack

Each client should get one context pack with a stable runtime shape.

## Runtime Sections

## 1. Company

- `name`
- `industry`
- `footprint`
- `roles`
- `priorities`

## 2. Selected Products

- `flagship`
- `free_tools`
- `control_modules`
- `role_dashboards`

## 3. Connectors

- `gmail`
- `drive`
- `sheets`
- `external`

This is the section that projects into the current runtime config.

## 4. Entity Maps

- suppliers
- customers
- plants
- teams
- owners
- approvers
- aliases

## 5. Workflow Rules

- severity levels
- risk categories
- routing rules
- due-date rules
- escalation rules
- approval rules

## 6. Outputs

- dashboard title
- email profiles
- search queries
- input templates
- views

## 7. Governance

- read-only vs draft-only vs write-back
- approval-required actions
- closers
- overrides

## 8. Success Metrics

- week 1 outcomes
- month 1 outcomes
- KPIs

## Example Mapping

### Yangon Tyre

- first modules:
  - `Action OS`
  - `Supplier Watch`
  - `Quality Closeout`
- key entities:
  - KIIC
  - JUNKY
  - Yangon Tyre internal teams
- core sources:
  - Drive folder mirror
  - Gmail profiles
  - input center sheets

### Generic Distributor Client

- first modules:
  - `Cash Watch`
  - `Sales Signal`
  - `Action Board`
- key entities:
  - distributors
  - customers
  - collectors
- core sources:
  - AR sheet
  - inbox
  - CRM export

## What Must Stay Standard

These should not be redesigned for every client:

- action item schema
- owner and due-date model
- signal classification pattern
- closeout pattern
- weekly review pack
- product blueprint registry

## What Can Be Adapted

These should be swapped per client:

- labels
- aliases
- role names
- thresholds
- connectors
- templates
- governance rules
