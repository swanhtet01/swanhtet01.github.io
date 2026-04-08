# Google, Graph, And KPI Scaffold

This file defines the current scaffold for Google Drive, Gmail, knowledge graph behavior, and KPI flow across the platform.

## 1. Platform rule

Use the platform layer first.

That means:
- Google Drive integration should start as a shared platform capability
- Gmail integration should start as a shared platform capability
- graph behavior should come from shared records and relationships
- KPI review should start as reusable scorecards

Then add tenant-specific rules where needed.

## 2. Google Drive scaffold

### Current intent
Use Google Drive as a source layer for:
- Docs
- Sheets
- uploaded files
- tenant folders

### Recommended model

#### General SuperMega
- one shared platform ingestion path
- reusable parsing and classification
- source links preserved back to Drive

#### YTF
- tenant-specific folder mapping
- receiving documents
- planning sheets
- KPI sheets
- approval and decision documents

### Output
Drive ingestion should create:
- documents
- tasks
- approvals
- KPI entries
- related source links

## 3. Gmail scaffold

### Current intent
Use Gmail as a structured input, not only as a compose tool.

### General SuperMega
- founder and shared mailbox workflows
- inbound contact
- sales follow-up
- delivery updates

### YTF
- tenant mailbox or thread profiles
- supplier follow-up
- receiving-related communication
- manager and approval updates

### Output
Gmail ingestion should create or update:
- leads
- deals
- tasks
- approvals
- incidents

## 4. Knowledge graph scaffold

Do not start with a separate graph database.

Start with:
- Postgres records
- explicit relationship tables
- source references

### Core entities
- company
- contact
- deal
- task
- approval
- document
- KPI
- decision
- shipment
- receiving issue

### Core edges
- company -> contact
- contact -> deal
- deal -> task
- document -> approval
- approval -> decision
- KPI -> owner
- KPI -> founder brief
- shipment -> receiving issue
- receiving issue -> task

That gives graph-like behavior without introducing a separate graph stack too early.

## 5. KPI flow scaffold

### Inputs
- direct app entry
- manager updates
- Google Sheets import later
- queue-derived metrics

### Processing
- normalize values
- compare against target
- mark missing or late updates
- attach owner and scope
- feed founder and manager review

### Outputs
- founder brief
- manager review
- risk flags
- exceptions
- scorecards

## 6. General vs YTF implementation order

### General SuperMega first
1. shared Drive ingestion
2. shared Gmail ingestion
3. shared graph relationships
4. shared KPI scorecards

### Then YTF-specific
1. Plant A Drive folder mapping
2. Plant A Gmail thread and mailbox profiles
3. Plant A receiving relationships
4. Plant A KPI and manager review rules
5. Plant A founder brief weighting

## 7. What runs now

Running or partially present now:
- Gmail compose / draft path
- Google Drive probe path
- platform state in Postgres
- founder brief and operating reports

Not complete yet:
- strong inbound Gmail sync
- strong Drive-to-record ingestion
- explicit relationship layer for graph behavior
- tenant-specific KPI review inside the app

## 8. What to build next

### General platform
- reliable Google Drive source ingestion
- reliable Gmail inbound classification
- relationship tables for cross-object context
- reusable KPI scorecards in the app

### YTF
- YTF logo and app header
- YTF receiving and KPI surfaces
- YTF document-to-approval flows
- YTF founder and manager review tuning

## 9. Blunt rule

Do not build YTF as a separate custom universe first.

Build:
- one strong platform ingestion layer
- one strong graph-like relationship layer
- one strong KPI layer

Then apply tenant-specific rules for YTF on top.
