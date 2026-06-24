export type BlueOceanMove = {
  eliminate: string
  reduce: string
  raise: string
  create: string
}

export type DataToActionContract = {
  ingest: string
  understand: string
  act: string
  learn: string
}

export type AdaptivePortalEvolutionItem = {
  id: string
  title: string
  priority: 'now' | 'next' | 'watch'
  signal: string
  moduleToPromote: string
  prototype: string
  agentExperiment: string
  dataNeeded: string[]
  humanOwner: string
  successMetric: string
  blueOcean: BlueOceanMove
  actionContract: DataToActionContract
}

export type IndustrialEvolutionSignals = {
  liveSources: number
  sources: number
  attentionConnectors: number
  trustScore: number
  writebackLanes: number
}

export type RestaurantEvolutionSignals = {
  openBlockers: number
  stockoutRisks: number
  wasteUnits: number
  guestIssuesOpen: number
  promosNeedingDecision: number
  menuItems: number
  paymentReviewCount: number
  paymentReviewValueMmk: number
  recordCount: number
}

function priorityFromScore(score: number): AdaptivePortalEvolutionItem['priority'] {
  if (score >= 8) {
    return 'now'
  }
  if (score >= 4) {
    return 'next'
  }
  return 'watch'
}

function sortEvolutionQueue(items: AdaptivePortalEvolutionItem[]) {
  const weight = { now: 3, next: 2, watch: 1 }
  return [...items].sort((left, right) => weight[right.priority] - weight[left.priority] || left.title.localeCompare(right.title))
}

function actionContract(ingest: string, understand: string, act: string, learn: string): DataToActionContract {
  return { ingest, understand, act, learn }
}

export function buildIndustrialEvolutionQueue(signals: IndustrialEvolutionSignals): AdaptivePortalEvolutionItem[] {
  const connectorScore = signals.attentionConnectors * 3 + Math.max(0, signals.sources - signals.liveSources)
  const trustScore = Math.max(0, 80 - signals.trustScore) / 10
  const writebackScore = signals.writebackLanes === 0 ? 8 : Math.max(0, 3 - signals.writebackLanes)

  return sortEvolutionQueue([
    {
      id: 'industrial-source-autopilot',
      title: 'Source Change Autopilot',
      priority: priorityFromScore(connectorScore),
      signal: `${signals.attentionConnectors} connector(s) need attention and ${signals.liveSources}/${signals.sources} sources are live.`,
      moduleToPromote: 'Factory Knowledge Runtime',
      prototype: 'A daily changed-file queue that classifies Drive/Gmail/Sheet changes into DQMS, maintenance, receiving, or executive review.',
      agentExperiment: 'Run one classifier agent over changed sources, then ask the data owner to approve the proposed canonical record.',
      dataNeeded: ['Changed Drive files', 'Gmail attachments', 'Sheet tabs', 'Source owner'],
      humanOwner: 'Data owner',
      successMetric: 'Unreviewed source changes cleared per day',
      blueOcean: {
        eliminate: 'Manual file hunting before every review.',
        reduce: 'Generic dashboard browsing.',
        raise: 'Source ownership, provenance, and change visibility.',
        create: 'A learning source ledger that promotes new module work automatically.',
      },
      actionContract: actionContract(
        'Watch changed Drive files, Gmail attachments, Sheets, and source-owner notes.',
        'Classify every change into department, record type, risk, and likely next action.',
        'Create a review queue item with the proposed canonical record and required approver.',
        'Store owner corrections so future routing and extraction improve.',
      ),
    },
    {
      id: 'industrial-writeback-control',
      title: 'Gated Writeback Studio',
      priority: priorityFromScore(writebackScore),
      signal: `${signals.writebackLanes} writeback lane(s) are active.`,
      moduleToPromote: 'Agent Control Plane',
      prototype: 'A writeback approval queue for CAPA, supplier claims, maintenance actions, and executive decisions.',
      agentExperiment: 'Have agents prepare writeback payloads with rollback notes, then require human approval before mutating records.',
      dataNeeded: ['Target record', 'Approval owner', 'Rollback note', 'Evidence packet'],
      humanOwner: 'Tenant admin',
      successMetric: 'Reviewed writebacks with source evidence',
      blueOcean: {
        eliminate: 'Uncontrolled AI actions and hidden spreadsheet edits.',
        reduce: 'Copy-paste admin work.',
        raise: 'Auditability and human accountability.',
        create: 'Safe operational automation that enterprises can trust.',
      },
      actionContract: actionContract(
        'Collect target record, source evidence, current value, proposed value, and rollback note.',
        'Compare the proposed mutation against policy, role permission, and recent related decisions.',
        'Queue the writeback for approval; execute only after an authorized human confirms.',
        'Log accepted, rejected, and revised payloads into the evidence ledger.',
      ),
    },
    {
      id: 'industrial-quality-memory',
      title: 'Defect Memory and Genealogy',
      priority: priorityFromScore(trustScore),
      signal: `Learning trust score is ${signals.trustScore}.`,
      moduleToPromote: 'DQMS and CAPA Control',
      prototype: 'A defect memory that links repeated issues by product, batch, machine, supplier, shift, and owner.',
      agentExperiment: 'Cluster quality issues and draft the suspected genealogy graph for quality-lead review.',
      dataNeeded: ['QC rows', 'Complaint emails', 'Batch/lot fields', 'Machine or process step'],
      humanOwner: 'Quality lead',
      successMetric: 'Repeat defects with a confirmed genealogy link',
      blueOcean: {
        eliminate: 'Blank root-cause forms.',
        reduce: 'Repeat defect rediscovery.',
        raise: 'Traceability and CAPA evidence quality.',
        create: 'A factory memory that compounds after every incident.',
      },
      actionContract: actionContract(
        'Ingest QC rows, complaints, CAPA notes, batch fields, machine events, and supplier documents.',
        'Cluster defects by recurring pattern, genealogy link, suspected cause, and missing evidence.',
        'Draft root-cause hypotheses and CAPA starter packs for quality-lead review.',
        'Promote confirmed links into the defect memory and demote weak hypotheses.',
      ),
    },
  ])
}

export function buildRestaurantEvolutionQueue(signals: RestaurantEvolutionSignals): AdaptivePortalEvolutionItem[] {
  const serviceScore = signals.openBlockers * 2 + signals.guestIssuesOpen * 2
  const marginScore = signals.stockoutRisks * 2 + Math.min(8, signals.wasteUnits / 5) + signals.promosNeedingDecision * 2
  const menuScore = signals.menuItems === 0 ? 8 : signals.menuItems < 8 ? 5 : 2
  const paymentScore = signals.paymentReviewCount * 3 + Math.min(8, signals.paymentReviewValueMmk / 100000)

  return sortEvolutionQueue([
    {
      id: 'restaurant-menu-autopilot',
      title: 'Menu Autopilot',
      priority: priorityFromScore(menuScore),
      signal: `${signals.menuItems} structured menu item(s) exist.`,
      moduleToPromote: 'QR Menu Transition',
      prototype: 'Upload menu images/PDFs, extract items, flag price/allergen gaps, then publish QR and printable menu after manager approval.',
      agentExperiment: 'Run menu extraction and compare item names/prices against the manager-approved menu.',
      dataNeeded: ['Menu PDF or images', 'Current prices', 'Allergen notes', 'Branch slug'],
      humanOwner: 'Store manager',
      successMetric: 'Time from menu change to approved QR menu',
      blueOcean: {
        eliminate: 'Manual menu redesign for every price change.',
        reduce: 'POS dependency for simple digital menus.',
        raise: 'Speed and price accuracy.',
        create: 'A lightweight AI menu system that can become ordering later.',
      },
      actionContract: actionContract(
        'Accept menu photos, PDFs, spreadsheets, item notes, branch slugs, and current prices.',
        'Extract item names, categories, prices, options, allergens, gaps, and duplicate entries.',
        'Generate a QR menu draft and printable menu for manager approval before publishing.',
        'Keep a versioned menu memory so future edits only require delta review.',
      ),
    },
    {
      id: 'restaurant-pos-reconciliation',
      title: 'Payment Proof Cash-up Control',
      priority: priorityFromScore(paymentScore),
      signal: `${signals.paymentReviewCount} payment(s) need review, worth ${signals.paymentReviewValueMmk.toLocaleString()} MMK.`,
      moduleToPromote: 'Payment Proof and Cash-Up Control',
      prototype: 'A cashier-safe payment ledger that stores provider payment proof, tracks paid/pending/reconcile states, and flags cash-up gaps.',
      agentExperiment: 'Match open payment records against provider exports and draft the cash-up exception note for owner review.',
      dataNeeded: ['Provider payment link/slip', 'Order reference', 'Amount', 'Cash-up export', 'Settlement screenshot'],
      humanOwner: 'Cashier lead',
      successMetric: 'Unreconciled payment value at close',
      blueOcean: {
        eliminate: 'Payment screenshots lost in chat.',
        reduce: 'Manual end-of-day mismatch hunting.',
        raise: 'Settlement evidence and cashier accountability.',
        create: 'A payment control loop that can attach to any light POS or restaurant portal.',
      },
      actionContract: actionContract(
        'Capture order refs, provider payloads or links, amounts, payment status, and cash-up notes.',
        'Classify paid, pending, duplicate, amount mismatch, and missing-settlement cases.',
        'Queue review-only reconciliation actions; never mutate provider settlement without approval.',
        'Learn recurring mismatch causes by cashier, branch, provider, and daypart.',
      ),
    },
    {
      id: 'restaurant-service-recovery',
      title: 'Guest Recovery Loop',
      priority: priorityFromScore(serviceScore),
      signal: `${signals.openBlockers} blocker(s) and ${signals.guestIssuesOpen} open guest issue(s).`,
      moduleToPromote: 'Guest Recovery',
      prototype: 'A complaint memory that clusters repeat guest issues and routes recovery, refund, or training work.',
      agentExperiment: 'Cluster guest issues by cause and draft one recovery response plus one training cue.',
      dataNeeded: ['Guest complaint', 'Branch', 'Channel', 'Recovery action', 'Manager owner'],
      humanOwner: 'Area manager',
      successMetric: 'Repeat complaint rate',
      blueOcean: {
        eliminate: 'Scattered reviews and chat screenshots.',
        reduce: 'Manager time spent rewriting the same recovery messages.',
        raise: 'Training feedback and recovery consistency.',
        create: 'A service memory that turns complaints into operating changes.',
      },
      actionContract: actionContract(
        'Capture guest complaints, review snippets, branch context, receipt references, and recovery notes.',
        'Group repeat failures by service step, food issue, timing, branch, and responsible owner.',
        'Prepare a recovery response, staff cue, and manager task while sensitive replies stay approved.',
        'Track recurrence and identify which recovery actions actually reduce repeat issues.',
      ),
    },
    {
      id: 'restaurant-margin-copilot',
      title: 'Margin Copilot',
      priority: priorityFromScore(marginScore),
      signal: `${signals.stockoutRisks} stock risk(s), ${signals.wasteUnits} waste unit(s), ${signals.promosNeedingDecision} promo decision(s).`,
      moduleToPromote: 'Prep, Stock, and Waste',
      prototype: 'A daily food-cost and service-risk brief that connects stock, waste, promos, and supplier issues.',
      agentExperiment: 'Explain the top margin leak and suggest one par, supplier, or promo correction.',
      dataNeeded: ['Prep counts', 'Waste records', 'Promo records', 'Supplier notes'],
      humanOwner: 'Owner operator',
      successMetric: 'Waste and stock-out exceptions per week',
      blueOcean: {
        eliminate: 'Spreadsheet-only food cost reviews.',
        reduce: 'Blind promotion decisions.',
        raise: 'Operating context behind margin movement.',
        create: 'A small-business margin brain that works from daily records.',
      },
      actionContract: actionContract(
        'Pull prep counts, waste logs, stock movement, supplier notes, menu prices, and promo records.',
        'Explain which item, supplier, waste pattern, or promotion is moving margin.',
        'Recommend one par, price, promo, or supplier action for owner approval.',
        'Measure post-decision waste, stock-out, and gross-margin movement.',
      ),
    },
  ])
}
