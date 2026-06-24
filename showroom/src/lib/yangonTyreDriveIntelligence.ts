export type YangonTyreStoryBeat = {
  id: string
  label: string
  metric: string
  title: string
  summary: string
  route: string
  evidence: string[]
  implication: string
}

export type YangonTyreNarrativeArc = {
  id: string
  name: string
  route: string
  thesis: string
  antithesis: string
  synthesis: string
}

export type YangonTyrePipelineChapter = {
  id: string
  stage: string
  headline: string
  detail: string
  route: string
  actions: string[]
}

export type YangonTyreSnapshotMetric = {
  id: string
  label: string
  value: string
  detail: string
}

export const YANGON_TYRE_DRIVE_DATASET_UPDATED_AT = '2026-04-09T08:53:24.388Z'

export const YANGON_TYRE_DRIVE_SOURCE_REGISTRY_SEED = [
  {
    id: 'future-source-register',
    name: 'Drive source register',
    sourceType: 'Google Docs',
    status: 'live',
    coverage:
      'The register links 13 meaningful source lanes after collapsing duplicate references to the same shared Yangon Tyre root folder.',
    route: '/app/connectors',
    evidenceCount: 13,
    lastSignalAt: '2025-11-16T02:01:53.302Z',
    consumers: ['Admin and Connector Control', 'Operating Intelligence Studio', 'Tenant App Foundry'],
    nextAutomation:
      'Parse every linked source into a canonical manifest with deduped source IDs, owners, and extraction policy.',
  },
  {
    id: 'drive-plant-a',
    name: 'Plant A operating structure',
    sourceType: 'Google Drive folders and shortcuts',
    status: 'live',
    coverage:
      'Plant A now exposes planning, admin, and tyre sales and inventory folders plus shortcut lanes for GRN, ISO, raw stock, and tyre production.',
    route: '/app/operations',
    evidenceCount: 10,
    lastSignalAt: '2026-04-09T08:47:52.705Z',
    consumers: ['Receiving Control', 'Operations Control', 'Manufacturing Command', 'Supplier and Approval Control'],
    nextAutomation:
      'Resolve every Plant A shortcut target and persist revision lineage for GRN, raw stock, ISO, and production records.',
  },
  {
    id: 'drive-ops-manual',
    name: 'YT Operations Guidebook',
    sourceType: 'Google Docs',
    status: 'live',
    coverage:
      'The operations guidebook maps 11 named factory and support sections from compound mixing through quality control across a 24/7 three-shift plant.',
    route: '/app/knowledge',
    evidenceCount: 11,
    lastSignalAt: '2024-11-14T15:13:50.157Z',
    consumers: ['Manufacturing Command', 'DQMS and Quality Lab', 'Maintenance and Reliability', 'Knowledge Graph and SOP Vault'],
    nextAutomation:
      'Promote each guidebook section into a stage-aware SOP graph, KPI schema, and writeback checklist.',
  },
  {
    id: 'drive-tyre-analysis',
    name: 'Tyre Analysis workbook',
    sourceType: 'Google Sheets',
    status: 'live',
    coverage:
      'The workbook already contains price history, cost calculations, tube economics, product specs, dealer concentration, and segment-level sales mix.',
    route: '/app/insights',
    evidenceCount: 7,
    lastSignalAt: '2024-03-23T10:03:12.679Z',
    consumers: ['Operating Intelligence Studio', 'Sales and Dealer Control', 'CEO Command Center'],
    nextAutomation:
      'Split workbook sections into marts for product mix, price drift, dealer concentration, and tube-cost leakage.',
  },
  {
    id: 'drive-ceo-data',
    name: 'CEO data hub',
    sourceType: 'Google Drive shortcut hub',
    status: 'live',
    coverage:
      'Leadership view is already curated around 2025 YTF, 2026 YTF, export, and Bilin bundles, but the lane is shortcut-heavy and needs target-level lineage.',
    route: '/app/director',
    evidenceCount: 4,
    lastSignalAt: '2026-04-09T08:52:29.644Z',
    consumers: ['CEO Command Center', 'Operating Intelligence Studio'],
    nextAutomation:
      'Resolve shortcut targets and turn the CEO lane into a governed briefing feed instead of a manual bookmark set.',
  },
  {
    id: 'email-financials',
    name: 'Finance and purchase-order packs',
    sourceType: 'Email-linked Google Sheets and Docs',
    status: 'mapped',
    coverage:
      'Source register points to H1 2024, H2 2024, H1 2025 financial sheets plus NR purchase orders and export planning docs, but mailbox lineage is still missing.',
    route: '/app/approvals',
    evidenceCount: 5,
    lastSignalAt: '2025-11-16T02:01:53.302Z',
    consumers: ['Supplier and Approval Control', 'CEO Command Center', 'Operating Intelligence Studio'],
    nextAutomation:
      'Bind the email-linked financial packs to supplier, approval, and director-review records with human approval gates.',
  },
] as const

export const YANGON_TYRE_DRIVE_CONNECTOR_SIGNAL_SEED = [
  {
    id: 'drive-spine',
    name: 'Google Drive evidence spine',
    system: 'Google Drive',
    status: 'Healthy',
    freshness: 'Drive estate was reorganized on April 9, 2026 and still points to a curated source register plus live plant and CEO branches.',
    backlog:
      'Highest-value work is target resolution for shortcuts, nested folder crawl, and source-to-topic extraction from the analysis workbook and operations guide.',
    route: '/app/connectors',
    surfaces: ['Manufacturing Command', 'Operating Intelligence Studio', 'CEO Command Center', 'Admin and Connector Control'],
    firstJobs: ['shortcut target resolution', 'whole-folder indexing', 'workbook section extraction'],
    nextAutomation:
      'Persist append-only Drive lineage events so every downstream story can link back to exact files and revisions.',
    risks: ['Leadership and plant lanes still rely on shortcuts, which weakens target-level freshness and provenance until resolved.'],
  },
  {
    id: 'gmail-intake',
    name: 'Gmail and attachment intake',
    system: 'Gmail',
    status: 'Warning',
    freshness: 'Financial and purchase-order packs are named in the source register, but thread-level ingestion is not yet visible inside the runtime.',
    backlog:
      'Mailbox evidence needs sender identity, attachment manifests, and approval-lane promotion before supplier and finance stories are trustworthy.',
    route: '/app/approvals',
    surfaces: ['Supplier and Approval Control', 'CEO Command Center', 'Operating Intelligence Studio'],
    firstJobs: ['thread-to-record capture', 'attachment lineage', 'finance packet scoring'],
    nextAutomation:
      'Promote financial threads into approval-ready packets with document completeness scoring and escalation rules.',
    risks: ['Without thread lineage, managers can see the file list but not the decision chain that produced it.'],
  },
  {
    id: 'shopfloor-forms',
    name: 'Shopfloor forms and line logs',
    system: 'Human Entry',
    status: 'Needs wiring',
    freshness: 'The operations guide clearly defines stages and KPIs, but structured line-level writeback is still absent.',
    backlog:
      'Plant sections need stage-specific forms for shift blockers, downtime, release checks, and material movement instead of retrospective document edits.',
    route: '/app/adoption-command',
    surfaces: ['Manufacturing Command', 'DQMS and Quality Lab', 'Maintenance and Reliability'],
    firstJobs: ['stage-specific forms', 'batch and lot capture', 'downtime reason coding'],
    nextAutomation:
      'Convert the guidebook section map into writeback lanes so plant events become data at the source.',
    risks: ['Manual docs give process grammar, but not the timestamped, owner-linked events required for live control.'],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics and funnel telemetry',
    system: 'Analytics',
    status: 'Needs wiring',
    freshness: 'Commercial workbook data is present, but web and funnel telemetry has not been bound into the same demand graph.',
    backlog:
      'Demand intelligence will stay incomplete until public traffic, dealer inquiry, and quote flow share one account timeline.',
    route: '/app/insights',
    surfaces: ['Operating Intelligence Studio', 'CEO Command Center'],
    firstJobs: ['traffic ingest', 'campaign attribution', 'lead-source scoring'],
    nextAutomation:
      'Join external demand signals to dealer, product, and pricing marts before expanding revenue storytelling.',
    risks: ['Commercial stories will over-index on historical workbook data until live demand telemetry lands.'],
  },
  {
    id: 'facebook-commerce',
    name: 'Facebook and social commercial inbox',
    system: 'Social',
    status: 'Needs wiring',
    freshness: 'No social inquiry lineage is visible in the current curated Drive snapshot.',
    backlog:
      'Social channels need identity resolution, follow-up ownership, and cross-linking into the commercial account timeline.',
    route: '/app/revenue',
    surfaces: ['Sales and Dealer Control', 'Operating Intelligence Studio'],
    firstJobs: ['message ingestion', 'campaign response tagging', 'dealer engagement summary'],
    nextAutomation:
      'Promote social interactions into the same account graph used by dealer and quote follow-up.',
    risks: ['Commercial response quality will drift if social demand stays outside the system of record.'],
  },
  {
    id: 'chat-mesh',
    name: 'Internal and external chat mesh',
    system: 'Chat Mesh',
    status: 'Needs wiring',
    freshness: 'Critical follow-up likely still happens in chat, but the current snapshot contains no governed chat evidence lane.',
    backlog:
      'Supplier, plant, and leadership handoffs need event capture and owner-linked follow-up, not silent chat-side resolution.',
    route: '/app/adoption-command',
    surfaces: ['Operations Control', 'Supplier and Approval Control', 'Sales and Dealer Control'],
    firstJobs: ['chat-linked task capture', 'decision evidence capture', 'follow-up reminders'],
    nextAutomation:
      'Treat chat as exception evidence that must be promoted into formal records before work is considered complete.',
    risks: ['Chat-only decisions disappear from the learning loop and weaken cross-functional visibility.'],
  },
] as const

export const YANGON_TYRE_DRIVE_SOURCE_EVENT_SEED = [
  {
    id: 'drive-register-confirmed',
    source: 'Drive source register',
    kind: 'source register',
    title: 'Register links the full Yangon Tyre source estate.',
    detail:
      'The register now points to plant PCs, the shared showroom folder, the Tyre Analysis workbook, the Operations Guidebook, finance sheets, purchase orders, export planning, and strategy docs.',
    route: '/app/connectors',
    signalAt: '2025-11-16T02:01:53.302Z',
    owner: 'Tenant admin',
  },
  {
    id: 'plant-a-curated',
    source: 'Plant A',
    kind: 'folder curation',
    title: 'Plant A reorganized into operations-ready branches.',
    detail:
      'Planning, admin, and tyre sales and inventory folders now sit beside GRN, raw stock, ISO, and tyre production shortcut lanes.',
    route: '/app/operations',
    signalAt: '2026-04-09T08:47:52.705Z',
    owner: 'Operations',
  },
  {
    id: 'ceo-hub-curated',
    source: 'CEO data hub',
    kind: 'leadership lane',
    title: 'CEO lane was staged for year-over-year and export review.',
    detail:
      'Leadership folder now centers 2025 YTF, 2026 YTF, export, and Bilin bundles, but each item still needs canonical target resolution.',
    route: '/app/director',
    signalAt: '2026-04-09T08:52:29.644Z',
    owner: 'Leadership',
  },
  {
    id: 'ops-guide-revised',
    source: 'YT Operations Guidebook',
    kind: 'document update',
    title: 'Operations guide last revised with plant stage detail.',
    detail:
      'Guidebook encodes 11 named sections, process instructions, machinery context, KPI headings, and raw-material usage references.',
    route: '/app/knowledge',
    signalAt: '2024-11-14T15:13:50.157Z',
    owner: 'Plant and quality',
  },
  {
    id: 'analysis-workbook-revised',
    source: 'Tyre Analysis workbook',
    kind: 'sheet update',
    title: 'Workbook still carries the strongest structured commercial and cost evidence.',
    detail:
      'The March 23, 2024 snapshot contains 2023 sales volume, 2024 price resets, tube economics, dealer concentration, spec weights, and product reference tables.',
    route: '/app/insights',
    signalAt: '2024-03-23T10:03:12.679Z',
    owner: 'Commercial and leadership',
  },
] as const

export const YANGON_TYRE_DRIVE_CHANGE_LINEAGE_SEED = [
  {
    id: 'lineage-root-register',
    source: 'Google Docs register',
    assetName: 'YTF Data Sources Collection',
    changeType: 'manifest refresh',
    changedAt: '2025-11-16T02:01:53.302Z',
    changedBy: 'Tenant admin',
    route: '/app/connectors',
    impact:
      'Source-of-truth moved from ad hoc memory to an explicit manifest listing plant, finance, planning, and strategy evidence.',
    nextStep: 'Convert the register into machine-readable connector config with deduped source IDs.',
  },
  {
    id: 'lineage-plant-a-layout',
    source: 'Plant A folder',
    assetName: 'Plant A operational branch layout',
    changeType: 'folder restructuring',
    changedAt: '2026-04-09T08:47:52.705Z',
    changedBy: 'Operations',
    route: '/app/operations',
    impact:
      'Operational evidence is now grouped by planning, admin, and inventory while still exposing GRN, ISO, raw stock, and production shortcuts.',
    nextStep: 'Resolve shortcut targets and index nested files under each operational branch.',
  },
  {
    id: 'lineage-ceo-hub',
    source: 'CEO data hub',
    assetName: '2025/2026 YTF leadership lane',
    changeType: 'shortcut staging',
    changedAt: '2026-04-09T08:52:29.644Z',
    changedBy: 'Leadership',
    route: '/app/director',
    impact:
      'Executive review now has a single visible lane, but the current form is still a curated shortcut surface rather than a canonical briefing feed.',
    nextStep: 'Bind each shortcut to a target file ID, owner, freshness window, and downstream executive brief template.',
  },
  {
    id: 'lineage-ops-guide',
    source: 'YT Operations Guidebook',
    assetName: 'Plant A stage map',
    changeType: 'document revision',
    changedAt: '2024-11-14T15:13:50.157Z',
    changedBy: 'Plant and quality',
    route: '/app/knowledge',
    impact:
      'Plant knowledge is structured enough to become stage-aware SOP graph nodes, but still lives as a narrative document instead of event-linked operations data.',
    nextStep: 'Extract section, machine, KPI, and material usage entities into canonical records.',
  },
  {
    id: 'lineage-analysis-workbook',
    source: 'Tyre Analysis workbook',
    assetName: 'Commercial and cost workbook',
    changeType: 'sheet revision',
    changedAt: '2024-03-23T10:03:12.679Z',
    changedBy: 'Commercial and leadership',
    route: '/app/insights',
    impact:
      'Workbook still provides the richest structured view of price, cost, dealer mix, and product-level economics for the tenant.',
    nextStep: 'Promote workbook blocks into marts with product, segment, dealer, and cost dimensions.',
  },
] as const

export const YANGON_TYRE_DRIVE_LEARNING_SEED = {
  status: 'Warning',
  canonicalRecordCount: 41,
  graphNodeCount: 59,
  graphEdgeCount: 76,
  lineageEventCount: YANGON_TYRE_DRIVE_CHANGE_LINEAGE_SEED.length,
  featureSetCount: 7,
  trustScore: 61,
  lastLearnedAt: YANGON_TYRE_DRIVE_DATASET_UPDATED_AT,
  qualitativeMethods: ['thesis-antithesis-synthesis', '5 Why', 'Ishikawa', 'SOP extraction'],
  quantitativeMethods: ['price drift cuts', 'dealer concentration', 'cost leakage', 'product-mix ranking'],
  nextAutomation:
    'Keep enriching the Drive-derived graph, but block sensitive supplier and finance writeback behind manager acceptance.',
} as const

export const YANGON_TYRE_DRIVE_BIG_PICTURE = {
  thesis:
    'Yangon Tyre already has a usable source mesh; the next step is to turn that mesh into governed extraction, feature marts, and role stories.',
  currentTruth: [
    'The source register now maps 13 meaningful source lanes once duplicate shared-root references are collapsed.',
    'Plant A already exposes three real operating branches plus seven shortcuts that map to GRN, raw stock, ISO, and production workflows.',
    'The Operations Guidebook defines 11 plant and support sections, giving the pipeline a true factory process grammar.',
    'The Tyre Analysis workbook shows 263,317 units in 2023 sales, MMK 59.1B gross sales, MMK 54.8B net after tube cost, and roughly a 5.0% price reset across key lines.',
    'CEO data is now curated into a leadership lane, but shortcut opacity still blocks target-level freshness and provenance.',
  ],
  nextBuilds: [
    'Resolve shortcut targets into canonical file IDs and persist revision lineage per target.',
    'Promote workbook blocks into reusable marts for product mix, price drift, dealer concentration, and tube-cost leakage.',
    'Turn the 11 operations-guide sections into stage-linked writeback forms and KPI checks so plant events stop living only in documents.',
  ],
} as const

export const YANGON_TYRE_DRIVE_STORY_BEATS: YangonTyreStoryBeat[] = [
  {
    id: 'source-estate',
    label: 'Source estate',
    metric: '13 linked lanes',
    title: 'The system of record is already multi-origin.',
    summary:
      'The source register ties together plant PCs, shared Drive folders, the Tyre Analysis workbook, the Operations Guidebook, finance packs, purchase orders, and strategy documents.',
    route: '/app/connectors',
    evidence: [
      'Shared Yangon Tyre Drive root appears twice in the register and needs deduping into one canonical source.',
      'Finance and purchase-order packs are present as named links, but not yet as mailbox-derived evidence chains.',
      'Plant A and CEO lanes have been curated more recently than the workbook itself.',
    ],
    implication:
      'The pipeline problem is not finding data anymore. It is normalizing ownership, freshness, and lineage across different source behaviors.',
  },
  {
    id: 'product-concentration',
    label: 'Commercial mix',
    metric: '28.4%',
    title: 'Three SKU families already carry more than a quarter of the 2023 volume.',
    summary:
      '7.00-16 YT-713, 5.00-12 YT-712, and 6.00-12 555 account for 74,713 units out of the 263,317-unit workbook total.',
    route: '/app/revenue',
    evidence: [
      '7.00-16 YT-713 shows 26,225 units.',
      '5.00-12 YT-712 shows 24,260 units.',
      '6.00-12 555 AG shows 24,228 units.',
    ],
    implication:
      'Product mix should become a living mart with rank shifts, margin changes, and channel concentration visible by week and quarter.',
  },
  {
    id: 'cost-leakage',
    label: 'Economics',
    metric: '7.2% tube drag',
    title: 'Tube cost is already visible as margin leakage inside the workbook.',
    summary:
      'The extracted sales view shows MMK 59.1B gross sales against MMK 4.27B tube cost, leaving 92.8% of gross sales after tube cost before other overheads.',
    route: '/app/insights',
    evidence: [
      'Gross sales: MMK 59,065,338,000.',
      'Tube cost: MMK 4,265,871,736.',
      'Net after tube cost: MMK 54,799,466,264.',
    ],
    implication:
      'Cost storytelling should track leakage by tyre family, tube family, and supplier or import assumptions instead of burying it inside a spreadsheet.',
  },
  {
    id: 'documentation-drift',
    label: 'Governance',
    metric: '2.63x gap',
    title: 'Documentation drift is already a planning risk.',
    summary:
      'The Operations Guidebook says Plant A manufactures about 100,000 pieces annually, while the workbook shows 263,317 units in 2023 sales.',
    route: '/app/knowledge',
    evidence: [
      'Guidebook plant overview still says about 100,000 pcs annually and even leaves question marks in place.',
      'Workbook total sales quantity is 263,317.',
      'A pipeline that trusts both sources equally will tell the wrong story to managers.',
    ],
    implication:
      'AI agents need freshness scoring and contradiction detection so older narrative docs do not silently override structured commercial evidence.',
  },
  {
    id: 'plant-grammar',
    label: 'Operations',
    metric: '11 sections',
    title: 'Plant A already gives the pipeline a full process grammar.',
    summary:
      'From mixing and rubberizing through curing, packing, warehouse, utilities, and quality control, the guidebook encodes a real stage map for extraction and writeback.',
    route: '/app/operations',
    evidence: [
      'Compound mixing, rubberizing, tread extrusion, bead, cutting, building, curing, packing, warehouse, utilities, and quality control are all named.',
      'The plant is described as a 24/7, three-shift operation with around 400 people.',
      'Raw-material usage, machinery, and KPI headings are present even when the data is not yet structured.',
    ],
    implication:
      'This is enough structure to drive stage-aware agent routing, line forms, and bottleneck stories without inventing the factory model from scratch.',
  },
  {
    id: 'dealer-concentration',
    label: 'Channel exposure',
    metric: '44.3%',
    title: 'A small dealer cluster already dominates the sampled workbook slice.',
    summary:
      'The extracted dealer view shows Ko Phyo, Ko Tin Ko, and Manpower totaling 44.3% of the captured dealer-share snapshot.',
    route: '/app/revenue/pipeline',
    evidence: [
      'Ko Phyo share is listed at 28.6%.',
      'Ko Tin Ko share is listed at 14.9%.',
      'Manpower appears at about 0.8% in the same slice.',
    ],
    implication:
      'The commercial graph should highlight dealer concentration and follow-up risk, not just total sales volume.',
  },
]

export const YANGON_TYRE_DRIVE_NARRATIVE_ARCS: YangonTyreNarrativeArc[] = [
  {
    id: 'observe',
    name: 'Observe the estate',
    route: '/app/connectors',
    thesis: 'Drive already holds the operating memory.',
    antithesis: 'The memory is split across folders, shortcuts, docs, sheets, and email-linked packs with uneven freshness.',
    synthesis:
      'Whole-folder indexing plus source-register parsing creates one governed source manifest for the tenant.',
  },
  {
    id: 'interpret',
    name: 'Interpret the economics',
    route: '/app/insights',
    thesis: 'The Tyre Analysis workbook already exposes product mix, price, and cost structure.',
    antithesis: 'Important signals like concentration, leakage, and drift are buried inside workbook sections instead of promoted into reusable marts.',
    synthesis:
      'Section-aware extraction turns workbook blocks into product, channel, and cost marts that can feed every role story.',
  },
  {
    id: 'act',
    name: 'Act at the section level',
    route: '/app/operations',
    thesis: 'The Operations Guidebook defines the real plant stages and KPI families.',
    antithesis: 'Those stages still live as prose, not timestamped operating events with owners and feedback loops.',
    synthesis:
      'Stage-linked writeback forms let AI agents move from passive summarization to controlled operational follow-through.',
  },
]

export const YANGON_TYRE_DRIVE_PIPELINE_CHAPTERS: YangonTyrePipelineChapter[] = [
  {
    id: 'chapter-watch',
    stage: 'Watch',
    headline: 'Watch the full Drive estate, not just a chosen sheet.',
    detail:
      'Start with the source register, shared root, Plant A branches, and leadership shortcuts so the pipeline sees the real document and folder behavior.',
    route: '/app/connectors',
    actions: ['parse the source register', 'crawl the root folders', 'resolve shortcut targets'],
  },
  {
    id: 'chapter-extract',
    stage: 'Extract',
    headline: 'Extract workbook lenses and guidebook sections into canonical records.',
    detail:
      'Workbook blocks become marts and guidebook sections become stage-aware SOP and KPI nodes, each linked back to source evidence.',
    route: '/app/knowledge',
    actions: ['slice workbook blocks', 'map section entities', 'promote contradictions to review'],
  },
  {
    id: 'chapter-story',
    stage: 'Story',
    headline: 'Turn the same evidence into different stories for directors, plant managers, and commercial leads.',
    detail:
      'The portal should tell different truths depending on role: cost leakage for directors, section friction for plant, concentration risk for sales.',
    route: '/app/insights',
    actions: ['build role briefs', 'rank signal importance', 'attach evidence before summary'],
  },
  {
    id: 'chapter-writeback',
    stage: 'Write back',
    headline: 'Close the loop through structured desks, not more documents.',
    detail:
      'Once signals are identified, the next move should happen in a controlled writeback lane with owner, reason code, and review policy.',
    route: '/app/adoption-command',
    actions: ['launch stage forms', 'capture owner and reason', 'route accepted changes downstream'],
  },
]

export const YANGON_TYRE_DRIVE_SNAPSHOT_METRICS: YangonTyreSnapshotMetric[] = [
  {
    id: 'metric-sources',
    label: 'Curated source lanes',
    value: '13',
    detail: 'Meaningful source lanes named in the register after collapsing duplicate shared-root references.',
  },
  {
    id: 'metric-sections',
    label: 'Plant sections',
    value: '11',
    detail: 'Named process and support sections extracted from the Operations Guidebook.',
  },
  {
    id: 'metric-sales',
    label: '2023 sales volume',
    value: '263,317',
    detail: 'Structured total sales quantity pulled from the Tyre Analysis workbook.',
  },
  {
    id: 'metric-net',
    label: 'Net after tube cost',
    value: 'MMK 54.8B',
    detail: 'Workbook gross sales minus tube cost before wider manufacturing and channel overheads.',
  },
]

export function buildYangonTyreInsightSeed() {
  return {
    headline:
      'Yangon Tyre already has the raw material for an AI-native data pipeline; the missing layer is governed extraction, contradiction handling, and role-specific storytelling.',
    engine: 'drive-source-register + ops-guide + tyre-analysis seed',
    insights: [
      {
        key: 'source-estate',
        title: 'Drive estate already behaves like a source mesh',
        summary:
          'The source register ties together a dozen-plus lanes across plant folders, strategy docs, finance packs, and the analysis workbook. The pipeline job is normalization, not invention.',
        category: 'Source estate',
        route: '/app/connectors',
      },
      {
        key: 'mix-concentration',
        title: 'Three SKU families drive 28.4% of workbook volume',
        summary:
          '7.00-16 YT-713, 5.00-12 YT-712, and 6.00-12 555 account for 74,713 units. Product-mix rank shifts should become a live mart, not a spreadsheet exercise.',
        category: 'Commercial mix',
        route: '/app/revenue',
      },
      {
        key: 'cost-leakage',
        title: 'Tube cost removes MMK 4.27B from gross sales',
        summary:
          'The workbook already exposes a 7.2% tube-cost drag. This is the right seam for a reusable cost-leakage storyline and supplier follow-up graph.',
        category: 'Economics',
        route: '/app/insights',
      },
      {
        key: 'doc-drift',
        title: 'The plant narrative and workbook totals disagree',
        summary:
          'The guidebook still says about 100,000 pieces annually, while the workbook shows 263,317 units in 2023 sales. The agent pipeline must score contradictions, not hide them.',
        category: 'Governance',
        route: '/app/knowledge',
      },
    ],
    recommended_actions: [
      'Resolve Plant A and CEO shortcuts into canonical target IDs before deeper automation.',
      'Promote the Tyre Analysis workbook into marts for product mix, price drift, dealer concentration, and tube-cost leakage.',
      'Turn the 11 Operations Guidebook sections into stage-linked writeback forms and KPI checks.',
      'Flag contradictory source claims so outdated narrative docs cannot silently override structured evidence.',
      'Keep finance and purchase-order packs behind manager review until mailbox lineage is active.',
    ],
    source_registry: YANGON_TYRE_DRIVE_SOURCE_REGISTRY_SEED.map((item) => ({ ...item })),
    source_events: YANGON_TYRE_DRIVE_SOURCE_EVENT_SEED.map((item) => ({ ...item })),
    story_beats: YANGON_TYRE_DRIVE_STORY_BEATS.map((item) => ({ ...item, evidence: [...item.evidence] })),
    narrative_arcs: YANGON_TYRE_DRIVE_NARRATIVE_ARCS.map((item) => ({ ...item })),
    pipeline_chapters: YANGON_TYRE_DRIVE_PIPELINE_CHAPTERS.map((item) => ({ ...item, actions: [...item.actions] })),
    snapshot_metrics: YANGON_TYRE_DRIVE_SNAPSHOT_METRICS.map((item) => ({ ...item })),
    updated_at: YANGON_TYRE_DRIVE_DATASET_UPDATED_AT,
  }
}
