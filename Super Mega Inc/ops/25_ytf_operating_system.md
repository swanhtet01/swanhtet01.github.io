# YTF Operating System

This file defines the YTF solution as a vertical operating system.

YTF is not just one screen.
It is one operating layer for the company.

## Goal

Turn the current YTF source material into one live operating system for:
- daily execution
- planning
- approvals
- KPI review
- founder and manager review

## Source material

The source of truth starts from existing company material:
- Google Drive folders
- Google Docs
- Google Sheets
- uploaded documents
- daily typed or pasted updates
- receiving and exception logs
- manager notes

The system should adapt to that reality first.

Do not force YTF into a big ERP migration before the current source material is working.

## Core layers

### 1. Source layer
- Google Drive folders
- Docs
- Sheets
- uploaded files

### 2. Memory layer
- structured records in the app
- graph-style relationships between:
  - suppliers
  - shipments
  - batches
  - approvals
  - KPIs
  - tasks
  - decisions

This is the working company graph.

### 3. Behavioral layer
- track who updates what
- track where work gets delayed
- learn recurring exception patterns
- learn which metrics and issues matter most to each manager

This is not hype.
It is practical behavioral learning for routing and review.

### 4. Review layer
- founder brief
- manager review
- KPI review
- approval review
- exception review

## Main modules

### Receiving Control
- receiving issues
- shortages
- holds
- supplier follow-up

### Task and Exception Queue
- one queue for daily work that needs action
- owners
- due dates
- escalation

### KPI Review
- daily and weekly KPI entry
- actual vs target
- trend visibility
- missing update alerts

### Planning Layer
- weekly priorities
- production or operational targets
- open blockers
- dependency tracking

### Approval Flow
- purchasing
- exception signoff
- spending
- operational approvals

### Founder and Manager Review
- founder sees only what needs judgment
- managers see their area, queue, and KPI status

## Update paths

The YTF system should accept updates from:
- direct app entry
- pasted text
- imported sheets
- imported Drive documents
- manager note entry

This matters because YTF will not update everything from one clean API source.

## Knowledge graph / graph memory

Graph memory should connect:
- supplier -> shipment -> receiving issue -> action
- manager -> KPI -> target -> missed update
- document -> approval -> decision -> next task
- plan item -> blocker -> owner -> escalation

That creates reviewable operating context, not just loose notes.

## Behavioral learning

Behavioral learning should answer:
- which teams update on time
- which queues are always late
- which supplier issues repeat
- which manager reviews create the most follow-up
- which KPIs matter most to the founder

The goal is better routing and review, not abstract prediction theater.

## Daily operating path

### Staff
- enter updates
- log issues
- attach documents
- move assigned tasks

### Managers
- review queues
- review KPI entries
- approve or reject items
- escalate blockers

### Founder
- review founder brief
- review top risks
- review blocked approvals
- decide on exceptions and priority changes

## What YTF replaces

YTF should reduce dependence on:
- scattered Drive folders with no operating layer
- uncontrolled Docs and Sheets
- chat-based approvals
- paper receiving logs
- verbal follow-up
- manual founder status chasing

It should not try to replace every accounting or ERP function on day one.

## Rollout order

### Phase 1
- receiving control
- task and exception queue
- founder brief

### Phase 2
- KPI review
- approval flow
- manager review

### Phase 3
- planning layer
- graph memory enrichment
- behavioral learning refinement

## Rule

If YTF data can only be stored but not reviewed, assigned, escalated, and summarized, it is not yet an operating system.
