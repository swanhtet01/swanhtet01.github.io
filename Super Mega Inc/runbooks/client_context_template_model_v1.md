# Client Context Template Model (V1)

## Purpose

This model defines what must be collected to adapt one SuperMega product to a new client without redesigning the product itself.

## Context Pack

Each client should get one context pack with these sections.

## 1. Company Identity

- company name
- industry
- operating footprint
- core roles
- main business priorities

## 2. Data Sources

- Gmail mailboxes or forwarding rules
- Drive folders
- Shared Drives
- Sheets
- local exports
- optional ERP or accounting source

## 3. Entity Maps

- suppliers
- customers
- plants
- warehouses
- owner list
- approver list

## 4. Business Rules

- severity levels
- risk categories
- due-date rules
- escalation rules
- approval rules

## 5. Module Selection

- which free tool matters most
- which control module lands first
- what role dashboard is needed first

## 6. Success Metrics

- what success looks like in week 1
- what success looks like in month 1
- what gets measured

## Example Mapping

### Yangon Tyre

- first modules:
  - `Supplier Watch`
  - `Quality Closeout`
  - `Action Board`
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

## What Can Be Adapted

These should be swapped per client:

- labels
- aliases
- role names
- thresholds
- connectors
- templates
