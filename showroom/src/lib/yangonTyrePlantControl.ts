export type PlantControlActionRow = {
  id: string
  lane: string
  title: string
  action: string
  owner: string
  priority: string
  due: string
  status: string
}

export type PlantControlExceptionRow = {
  exception_id: string
  source_type: string
  priority: string
  title: string
  summary: string
  owner: string
  route: string
}

export type PlantControlReceivingRow = {
  receiving_id: string
  supplier: string
  material: string
  grn_or_batch: string
  variance_note: string
  status: string
  owner: string
  next_action: string
}

export type PlantControlApprovalRow = {
  approval_id: string
  title: string
  approval_gate: string
  owner: string
  status: string
  due: string
  related_route: string
}

export type PlantControlInventoryRow = {
  inventory_id: string
  item_name: string
  warehouse: string
  available_qty: string
  reorder_point: string
  status: string
  next_action: string
}

export type PlantControlQualityIncidentRow = {
  incident_id: string
  status: string
  severity: string
  owner: string
  supplier: string
  title: string
  summary: string
  source_type: string
  reported_at: string
  target_close_date: string
}

export type PlantControlCapaRow = {
  capa_id: string
  incident_id: string
  status: string
  owner: string
  action_title: string
  verification_criteria: string
  target_date: string
}

export type PlantControlMetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  owner: string
  status: string
}

export type PlantControlTraceStage = {
  stage_id: string
  label: string
  status: 'ok' | 'watch' | 'blocked'
  evidence: string
  owner: string
}

export type PlantControlTracePack = {
  trace_id: string
  product: string
  batch_or_lot: string
  release_state: 'hold' | 'review' | 'release-ready'
  risk: 'high' | 'medium' | 'low'
  owner: string
  next_decision: string
  due: string
  source: string
  stages: PlantControlTraceStage[]
}

export type PlantControlInspectionCheck = {
  check_id: string
  label: string
  spec: string
  sample: string
  evidence: string
}

export type PlantControlInspectionPack = {
  pack_id: string
  name: string
  inspection_type: 'incoming' | 'compound-release' | 'final-release' | 'claim-review'
  stage: string
  owner: string
  default_decision: 'pass' | 'hold' | 'fail'
  trigger: string
  release_rule: string
  source: string
  checks: PlantControlInspectionCheck[]
}

export type PlantManagerShiftBoard = {
  id: string
  label: string
  title: string
  detail: string
  route: string
}

export type PlantManagerReviewRhythm = {
  id: string
  name: string
  cadence: string
  purpose: string
  route: string
}

export const YANGON_TYRE_PLANT_CONTROL_UPDATED_AT = '2026-04-09T08:53:24.388Z'

export const YANGON_TYRE_OPERATIONS_SUMMARY_SEED = {
  actions: {
    total_items: 9,
  },
  approvals: {
    approval_count: 6,
    by_status: {
      pending: 3,
      review: 2,
      blocked: 1,
    },
  },
  receiving: {
    hold_count: 4,
    variance_count: 5,
    receiving_count: 12,
  },
  inventory: {
    reorder_count: 3,
    watch_count: 6,
  },
} as const

export const YANGON_TYRE_OPERATIONS_ACTIONS_SEED: PlantControlActionRow[] = [
  {
    id: 'ops-shift-containment',
    lane: 'operations.shift',
    title: 'Run the SQDCP review before the next shift starts.',
    action: 'Confirm the red condition, owner, containment, and next review time for quality, delivery, and downtime losses.',
    owner: 'Plant manager',
    priority: 'high',
    due: 'Before next shift handoff',
    status: 'open',
  },
  {
    id: 'ops-receiving-hold',
    lane: 'receiving.control',
    title: 'Resolve the oldest incoming hold tied to raw stock and GRN mismatch.',
    action: 'Check GRN evidence, supplier reply, and quality disposition before material blocks the line further.',
    owner: 'Receiving + plant manager',
    priority: 'high',
    due: 'Today',
    status: 'review',
  },
  {
    id: 'ops-bottleneck',
    lane: 'operations.bottleneck',
    title: 'Review the current curing and release bottleneck.',
    action: 'Measure where queue pressure and defect containment are creating line imbalance across PD-3 and PD-4.',
    owner: 'Plant manager',
    priority: 'high',
    due: 'This shift',
    status: 'open',
  },
  {
    id: 'ops-maintenance-handoff',
    lane: 'maintenance.followup',
    title: 'Escalate repeat downtime cause to maintenance countermeasure.',
    action: 'Tie the latest breakdown note to the asset family and confirm the next PM or part action.',
    owner: 'Maintenance lead',
    priority: 'medium',
    due: 'Today',
    status: 'open',
  },
  {
    id: 'ops-quality-loop',
    lane: 'dqms.containment',
    title: 'Close the loop on the top repeat defect before new lots are released.',
    action: 'Open DQMS, review containment, and verify whether the process cause is proven or only described.',
    owner: 'Quality manager',
    priority: 'high',
    due: 'Today',
    status: 'review',
  },
]

export const YANGON_TYRE_OPERATIONS_EXCEPTIONS_SEED: PlantControlExceptionRow[] = [
  {
    exception_id: 'ops-ex-1',
    source_type: 'Receiving variance',
    priority: 'high',
    title: 'GRN mismatch is still unresolved for inbound raw material.',
    summary: 'Dock evidence exists, but supplier response and finance-ready packet are incomplete.',
    owner: 'Receiving + procurement',
    route: '/app/receiving',
  },
  {
    exception_id: 'ops-ex-2',
    source_type: 'Shift abnormality',
    priority: 'high',
    title: 'Release queue pressure is building behind containment decisions.',
    summary: 'Lots are waiting for quality closure longer than the normal handoff rhythm.',
    owner: 'Plant manager',
    route: '/app/dqms',
  },
  {
    exception_id: 'ops-ex-3',
    source_type: 'Reliability pattern',
    priority: 'medium',
    title: 'Repeat stoppage remains linked to one asset family.',
    summary: 'Breakdown pattern is visible, but the countermeasure is not yet locked into a weekly review.',
    owner: 'Maintenance lead',
    route: '/app/maintenance',
  },
]

export const YANGON_TYRE_RECEIVING_ROWS_SEED: PlantControlReceivingRow[] = [
  {
    receiving_id: 'recv-1',
    supplier: 'Top latex supplier',
    material: 'Natural rubber compound input',
    grn_or_batch: 'GRN-2025-041',
    variance_note: 'COA and received quantity are still under review.',
    status: 'hold',
    owner: 'Receiving',
    next_action: 'Verify supplier evidence and disposition.',
  },
  {
    receiving_id: 'recv-2',
    supplier: 'Carbon black vendor',
    material: 'Carbon black',
    grn_or_batch: 'GRN-2025-038',
    variance_note: 'Packaging variance recorded and awaiting approval.',
    status: 'review',
    owner: 'Plant manager',
    next_action: 'Confirm release path.',
  },
]

export const YANGON_TYRE_APPROVAL_ROWS_SEED: PlantControlApprovalRow[] = [
  {
    approval_id: 'approval-1',
    title: 'Approve release path for held inbound material',
    approval_gate: 'Receiving + quality + procurement',
    owner: 'Plant manager',
    status: 'pending',
    due: 'Today',
    related_route: '/app/approvals',
  },
  {
    approval_id: 'approval-2',
    title: 'Approve corrective maintenance spend on repeat asset issue',
    approval_gate: 'Maintenance + director',
    owner: 'Maintenance lead',
    status: 'review',
    due: 'This week',
    related_route: '/app/maintenance',
  },
  {
    approval_id: 'approval-3',
    title: 'Approve containment and closeout conditions for repeat defect',
    approval_gate: 'DQMS + plant manager',
    owner: 'Quality manager',
    status: 'pending',
    due: 'Today',
    related_route: '/app/dqms',
  },
]

export const YANGON_TYRE_INVENTORY_ROWS_SEED: PlantControlInventoryRow[] = [
  {
    inventory_id: 'inventory-1',
    item_name: 'Natural rubber compound',
    warehouse: 'Main warehouse',
    available_qty: '18',
    reorder_point: '25',
    status: 'reorder',
    next_action: 'Escalate supplier and receiving readiness.',
  },
  {
    inventory_id: 'inventory-2',
    item_name: 'Bead wire',
    warehouse: 'Plant store',
    available_qty: '12',
    reorder_point: '15',
    status: 'watch',
    next_action: 'Review next PO timing.',
  },
]

export const YANGON_TYRE_DQMS_SUMMARY_SEED = {
  quality: {
    incident_count: 7,
    capa_count: 5,
    by_status: {
      open: 3,
      review: 2,
      closed: 2,
    },
    top_suppliers: [
      { supplier: 'Internal process', incident_count: 3 },
      { supplier: 'Top latex supplier', incident_count: 2 },
    ],
  },
} as const

export const YANGON_TYRE_QUALITY_INCIDENTS_SEED: PlantControlQualityIncidentRow[] = [
  {
    incident_id: 'inc-1',
    status: 'open',
    severity: 'high',
    owner: 'Quality manager',
    supplier: 'Internal process',
    title: 'Repeat defect cluster remains open at release review.',
    summary: 'Containment exists, but the process cause and effectiveness proof are not yet closed.',
    source_type: 'DQMS seed',
    reported_at: '2026-04-08T08:10:00.000Z',
    target_close_date: '2026-04-22',
  },
  {
    incident_id: 'inc-2',
    status: 'review',
    severity: 'medium',
    owner: 'Plant manager',
    supplier: 'Top latex supplier',
    title: 'Incoming material variation is now tied to quality risk.',
    summary: 'Receiving variance and quality review need one linked closeout path.',
    source_type: 'Receiving + DQMS seed',
    reported_at: '2026-04-07T11:30:00.000Z',
    target_close_date: '2026-04-20',
  },
  {
    incident_id: 'inc-3',
    status: 'open',
    severity: 'medium',
    owner: 'Maintenance lead',
    supplier: 'Internal process',
    title: 'Asset-linked quality escape still needs reliability countermeasure.',
    summary: 'Machine condition and defect evidence are visible, but the maintenance action is not yet verified.',
    source_type: 'Maintenance + DQMS seed',
    reported_at: '2026-04-06T14:20:00.000Z',
    target_close_date: '2026-04-23',
  },
]

export const YANGON_TYRE_CAPA_ROWS_SEED: PlantControlCapaRow[] = [
  {
    capa_id: 'capa-1',
    incident_id: 'inc-1',
    status: 'review',
    owner: 'Quality manager',
    action_title: 'Prove root cause with batch and process evidence.',
    verification_criteria: 'Repeat defect rate drops on next reviewed lots and containment closes.',
    target_date: '2026-04-22',
  },
  {
    capa_id: 'capa-2',
    incident_id: 'inc-2',
    status: 'open',
    owner: 'Plant manager',
    action_title: 'Bind inbound variance to one release and supplier recovery workflow.',
    verification_criteria: 'Receiving hold, DQMS status, and supplier packet agree on the same disposition.',
    target_date: '2026-04-20',
  },
  {
    capa_id: 'capa-3',
    incident_id: 'inc-3',
    status: 'open',
    owner: 'Maintenance lead',
    action_title: 'Lock preventive maintenance action for repeat failure mode.',
    verification_criteria: 'Breakdown recurrence and defect recurrence both decline after the fix.',
    target_date: '2026-04-24',
  },
]

export const YANGON_TYRE_QUALITY_METRIC_ROWS_SEED: PlantControlMetricRow[] = [
  {
    metric_id: 'quality-metric-1',
    metric_name: 'B+R rate',
    metric_group: 'quality',
    metric_value: '0.51',
    unit: '%',
    period_label: '2024 baseline',
    owner: 'Quality manager',
    status: 'watch',
  },
  {
    metric_id: 'quality-metric-2',
    metric_name: 'Repeat defect cluster',
    metric_group: 'quality',
    metric_value: '3',
    unit: 'issues',
    period_label: 'current review',
    owner: 'Plant manager',
    status: 'attention',
  },
  {
    metric_id: 'quality-metric-3',
    metric_name: 'Containment backlog',
    metric_group: 'quality',
    metric_value: '2',
    unit: 'incidents',
    period_label: 'today',
    owner: 'Quality manager',
    status: 'watch',
  },
  {
    metric_id: 'quality-metric-4',
    metric_name: 'Downtime-linked quality loss',
    metric_group: 'production',
    metric_value: '1',
    unit: 'asset family',
    period_label: 'weekly review',
    owner: 'Maintenance lead',
    status: 'watch',
  },
]

export const YANGON_TYRE_INSPECTION_PACKS_SEED: PlantControlInspectionPack[] = [
  {
    pack_id: 'inspection-incoming-material',
    name: 'Incoming material check',
    inspection_type: 'incoming',
    stage: 'Receiving / raw material',
    owner: 'Receiving + Quality',
    default_decision: 'hold',
    trigger: 'Use when GRN, supplier COA, quantity, packaging, or visual condition is not clean.',
    release_rule: 'Material is not released to production until COA, quantity, visual condition, and quality disposition agree.',
    source: 'GRN / raw-stock / supplier packet',
    checks: [
      {
        check_id: 'incoming-coa',
        label: 'COA and supplier document',
        spec: 'COA present and matches purchase/GRN packet',
        sample: 'One supplier packet per GRN or lot',
        evidence: 'Attach supplier COA, PO/GRN reference, or photo of packet.',
      },
      {
        check_id: 'incoming-quantity',
        label: 'Quantity and packaging',
        spec: 'Received quantity and packaging condition accepted',
        sample: 'Receiving count plus visual check',
        evidence: 'Attach receiving note or package photo if abnormal.',
      },
      {
        check_id: 'incoming-disposition',
        label: 'Quality disposition',
        spec: 'Release / hold / return / concession decision recorded',
        sample: 'One decision before production use',
        evidence: 'Record owner and reason before moving material.',
      },
    ],
  },
  {
    pack_id: 'inspection-compound-release',
    name: 'Compound release check',
    inspection_type: 'compound-release',
    stage: 'Mixing / compound',
    owner: 'Swe Latt + Quality',
    default_decision: 'pass',
    trigger: 'Use before compound is treated as ready for downstream production.',
    release_rule: 'Compound moves forward only when batch identity, recipe/spec version, and visible abnormalities are reviewed.',
    source: 'Mixing sheet / recipe spec / QC result',
    checks: [
      {
        check_id: 'compound-batch',
        label: 'Batch identity',
        spec: 'Batch, date, shift, and material identity are clear',
        sample: 'One batch record',
        evidence: 'Attach mixing sheet or batch note.',
      },
      {
        check_id: 'compound-spec',
        label: 'Recipe/spec version',
        spec: 'Current approved recipe/spec is used',
        sample: 'One spec reference per batch family',
        evidence: 'Attach Drive link or note current spec revision.',
      },
      {
        check_id: 'compound-abnormality',
        label: 'Visible abnormality',
        spec: 'No contamination, scorch, under-mix, or abnormal handling',
        sample: 'Operator + QC visual check',
        evidence: 'Attach photo if abnormal.',
      },
    ],
  },
  {
    pack_id: 'inspection-final-release',
    name: 'Curing and final release check',
    inspection_type: 'final-release',
    stage: 'Curing / final QC',
    owner: 'Hlaing Hlaing Aye + Kyaw Soe Win 1 QC',
    default_decision: 'hold',
    trigger: 'Use when curing, visual QC, repeat defects, or release authority is unclear.',
    release_rule: 'Finished tyres are release-ready only after defect review, hold status, and release owner are clear.',
    source: 'Curing press / final inspection / release hold',
    checks: [
      {
        check_id: 'final-press',
        label: 'Press and cure condition',
        spec: 'Press, mould, time, and abnormal downtime are reviewed',
        sample: 'One press or lot group',
        evidence: 'Attach curing note or downtime evidence if abnormal.',
      },
      {
        check_id: 'final-defect',
        label: 'Visual defect decision',
        spec: 'Accepted / rework / scrap / hold decision recorded',
        sample: 'Sample by lot or defect cluster',
        evidence: 'Attach defect photo and count.',
      },
      {
        check_id: 'final-release-owner',
        label: 'Release authority',
        spec: 'Named QC owner approves release or hold',
        sample: 'One owner decision per lot/review',
        evidence: 'Record QC owner and decision reason.',
      },
    ],
  },
  {
    pack_id: 'inspection-claim-review',
    name: 'Claim tyre review',
    inspection_type: 'claim-review',
    stage: 'Claim / customer return',
    owner: 'Quality + Sales',
    default_decision: 'fail',
    trigger: 'Use when a returned or claimed tyre needs technical review and customer follow-up.',
    release_rule: 'Claim is not closed until tyre identity, failure mode, likely cause, and customer response are recorded.',
    source: 'Claim tyre file / sales evidence / QC review',
    checks: [
      {
        check_id: 'claim-identity',
        label: 'Tyre identity',
        spec: 'Size, pattern, serial/lot if available, customer, and date are captured',
        sample: 'One returned tyre or claim group',
        evidence: 'Attach claim photo and sales/customer note.',
      },
      {
        check_id: 'claim-failure-mode',
        label: 'Failure mode',
        spec: 'Failure type is classified and linked to possible process/material/use cause',
        sample: 'One failure mode per claim',
        evidence: 'Attach photos from several angles.',
      },
      {
        check_id: 'claim-response',
        label: 'Customer response',
        spec: 'Reject / accept / goodwill / more evidence decision recorded',
        sample: 'One customer follow-up decision',
        evidence: 'Attach response note or message thread.',
      },
    ],
  },
]

export const YANGON_TYRE_TRACE_PACKS_SEED: PlantControlTracePack[] = [
  {
    trace_id: 'trace-pcr-review-1',
    product: 'PCR focus tyre family',
    batch_or_lot: 'Production week review',
    release_state: 'review',
    risk: 'high',
    owner: 'Quality manager',
    next_decision: 'Confirm whether the defect cluster is material, machine, or method before release closeout.',
    due: 'Today',
    source: 'Tyre production + QC + claim evidence',
    stages: [
      {
        stage_id: 'trace-pcr-material',
        label: 'Material / GRN',
        status: 'watch',
        evidence: 'Receiving variance exists; supplier packet and release note need one linked decision.',
        owner: 'Receiving + Quality',
      },
      {
        stage_id: 'trace-pcr-mixing',
        label: 'Mixing',
        status: 'ok',
        evidence: 'Batch evidence is present enough for first review, but recipe/spec link should be promoted next.',
        owner: 'Swe Latt',
      },
      {
        stage_id: 'trace-pcr-building',
        label: 'Building',
        status: 'watch',
        evidence: 'Handoff is visible, but operator/station context is not yet strict enough for genealogy.',
        owner: 'Ye Lin Tun',
      },
      {
        stage_id: 'trace-pcr-curing',
        label: 'Curing',
        status: 'blocked',
        evidence: 'Repeat defect review needs press, timing, and containment proof before closeout.',
        owner: 'Hlaing Hlaing Aye',
      },
      {
        stage_id: 'trace-pcr-qc',
        label: 'QC / release',
        status: 'blocked',
        evidence: 'Containment exists; CAPA verification and release authority are still pending.',
        owner: 'Kyaw Soe Win 1 QC',
      },
    ],
  },
  {
    trace_id: 'trace-inbound-nr-1',
    product: 'Natural rubber input to finished tyre risk',
    batch_or_lot: 'GRN-2025-041',
    release_state: 'hold',
    risk: 'high',
    owner: 'Plant manager',
    next_decision: 'Hold, release with concession, or escalate supplier recovery after packet review.',
    due: 'Before next production use',
    source: 'Receiving hold + supplier evidence + DQMS review',
    stages: [
      {
        stage_id: 'trace-nr-supplier',
        label: 'Supplier packet',
        status: 'blocked',
        evidence: 'COA and received quantity are still under review.',
        owner: 'Procurement + Receiving',
      },
      {
        stage_id: 'trace-nr-stores',
        label: 'Stores / GRN',
        status: 'watch',
        evidence: 'GRN evidence exists but disposition is not yet finance-ready.',
        owner: 'Stores',
      },
      {
        stage_id: 'trace-nr-quality',
        label: 'Quality disposition',
        status: 'blocked',
        evidence: 'Quality must confirm whether material can enter production or stays contained.',
        owner: 'Quality manager',
      },
      {
        stage_id: 'trace-nr-production',
        label: 'Production impact',
        status: 'watch',
        evidence: 'Production risk should be visible in planning before the next run is approved.',
        owner: 'Plant manager',
      },
    ],
  },
  {
    trace_id: 'trace-asset-quality-1',
    product: 'Asset-linked defect family',
    batch_or_lot: 'Weekly reliability review',
    release_state: 'review',
    risk: 'medium',
    owner: 'Maintenance lead',
    next_decision: 'Verify whether maintenance countermeasure removes the repeat defect signal.',
    due: 'This week',
    source: 'Maintenance + DQMS + output review',
    stages: [
      {
        stage_id: 'trace-asset-machine',
        label: 'Machine condition',
        status: 'blocked',
        evidence: 'Asset-linked quality escape needs reliability countermeasure proof.',
        owner: 'U Myo Lin Tun',
      },
      {
        stage_id: 'trace-asset-capa',
        label: 'CAPA action',
        status: 'watch',
        evidence: 'Preventive action exists, but effectiveness must be checked against repeat defects.',
        owner: 'Aung Naing',
      },
      {
        stage_id: 'trace-asset-qc',
        label: 'QC verification',
        status: 'watch',
        evidence: 'QC should confirm next reviewed lots after the maintenance fix.',
        owner: 'Kyaw Soe Win 1 QC',
      },
    ],
  },
]

export const YANGON_TYRE_PLANT_MANAGER_SHIFT_BOARDS: PlantManagerShiftBoard[] = [
  {
    id: 'board-safety-quality',
    label: 'SQDCP',
    title: 'Safety and quality should be reviewed before volume.',
    detail: 'If containment, release, or receiving abnormalities are still unclear, the shift is not actually stable even if output looks acceptable.',
    route: '/app/dqms',
  },
  {
    id: 'board-flow',
    label: 'Flow',
    title: 'Read the constraint, not just the queue.',
    detail: 'Use operations and maintenance together to separate true bottlenecks from downstream backlog symptoms.',
    route: '/app/operations',
  },
  {
    id: 'board-handoff',
    label: 'Handoff',
    title: 'No shift handoff without owner, risk, and due time.',
    detail: 'Carryover work should leave one explicit record, not another retelling in chat.',
    route: '/app/actions',
  },
  {
    id: 'board-learning',
    label: 'Learning',
    title: 'Repeated plant pain should become the next feature or standard.',
    detail: 'Use Data Fabric and DQMS together so repeat abnormalities become persistent metrics, methods, and writeback rules.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS: PlantManagerReviewRhythm[] = [
  {
    id: 'rhythm-shift-open',
    name: 'Start-of-shift SQDCP review',
    cadence: 'Every shift',
    purpose: 'Align safety, quality, delivery, cost, and people before work drifts into firefighting.',
    route: '/app/operations',
  },
  {
    id: 'rhythm-containment',
    name: 'Containment and release review',
    cadence: 'Daily',
    purpose: 'Keep open incidents, held material, and release risk in one linked conversation.',
    route: '/app/dqms',
  },
  {
    id: 'rhythm-reliability',
    name: 'Reliability and bottleneck review',
    cadence: 'Weekly',
    purpose: 'Attack one real constraint using downtime, defect, and queue evidence rather than generic blame.',
    route: '/app/maintenance',
  },
  {
    id: 'rhythm-learning',
    name: 'Plant learning review',
    cadence: 'Weekly',
    purpose: 'Promote repeated shift pain into metrics, methods, and platform changes.',
    route: '/app/data-fabric',
  },
] as const
