export type YangonTyreRuntimeGuideStep = {
  id: string
  title: string
  detail: string
}

export type YangonTyreDatabaseLayer = {
  id: string
  name: string
  purpose: string
  grain: string
  storage: string
  outputs: string[]
}

export type YangonTyreDecisionLens = {
  id: 'micro' | 'macro'
  name: string
  focus: string
  watches: string[]
  outputs: string[]
}

export type YangonTyreToolRecommendation = {
  id: string
  phase: 'now' | 'next' | 'scale'
  category: string
  name: string
  why: string
  useFor: string[]
  url: string
}

export const YANGON_TYRE_RUNTIME_GUIDE_STEPS: YangonTyreRuntimeGuideStep[] = [
  {
    id: 'start-lens',
    title: 'Pick the lens first',
    detail:
      'Start with one lens only: operations, quality, commercial, or governance. That keeps the review grounded in one control loop before you open deeper source or story lanes.',
  },
  {
    id: 'read-kpis',
    title: 'Read the KPI strip before opening files',
    detail:
      'The KPI cards are the fast management summary. They tell you whether the problem is concentration, cost leakage, quality drift, or source-governance drift before you go into raw evidence.',
  },
  {
    id: 'inspect-behavior',
    title: 'Use source behavior instead of folder names',
    detail:
      'Treat each source lane as a behavior: shortcut hub, workbook, process grammar, mailbox packet, or governed registry. This is how you decide the right extractor and risk policy.',
  },
  {
    id: 'promote-features',
    title: 'Promote repeat questions into features',
    detail:
      'If management keeps asking the same question, turn it into a named feature and semantic metric rather than recomputing it in a notebook or slide each week.',
  },
  {
    id: 'close-loop',
    title: 'Write back into the operating desks',
    detail:
      'The mart is only useful if the team closes the loop through receiving, DQMS, maintenance, metric intake, approvals, and manager notes. Otherwise the warehouse drifts away from the real shop-floor system.',
  },
] as const

export const YANGON_TYRE_DATABASE_LAYERS: YangonTyreDatabaseLayer[] = [
  {
    id: 'source-events',
    name: 'Layer 0 · Source event log',
    purpose: 'Append-only capture of Drive revisions, mailbox packets, attachments, form submissions, and operator writeback.',
    grain: 'one source event or revision',
    storage: 'Drive and mailbox crawls plus append-only event tables',
    outputs: ['freshness tracking', 'change lineage', 'ingestion checkpoints'],
  },
  {
    id: 'canonical-records',
    name: 'Layer 1 · Canonical records',
    purpose: 'Normalize files, worksheets, incidents, approvals, supplier cases, and manager notes into durable business records.',
    grain: 'document, issue, shipment, batch, dealer, or decision record',
    storage: 'relational tables with source IDs, hashes, owners, and timestamps',
    outputs: ['deduped entities', 'tenant memory', 'governed evidence links'],
  },
  {
    id: 'feature-marts',
    name: 'Layer 2 · Feature marts',
    purpose: 'Turn canonical records into reusable operational, quality, commercial, and governance features.',
    grain: 'shift x stage, incident x batch, supplier x discrepancy, account x quote, review cycle x theme',
    storage: 'analytical tables or Parquet marts',
    outputs: ['plant flow mart', 'quality loss mart', 'supplier recovery mart', 'commercial demand mart'],
  },
  {
    id: 'semantic-metrics',
    name: 'Layer 3 · Semantic metric layer',
    purpose: 'Define KPI formulas once so every desk, deck, notebook, and agent uses the same metric meaning.',
    grain: 'governed metric definition',
    storage: 'metric specs and semantic models over the marts',
    outputs: ['consistent KPI cards', 'filtered manager views', 'agent-safe metric queries'],
  },
  {
    id: 'graph-memory',
    name: 'Layer 4 · Graph memory',
    purpose: 'Model how suppliers, batches, defects, machines, products, documents, and decisions connect over time.',
    grain: 'entity and relationship',
    storage: 'graph database or graph projection on warehouse records',
    outputs: ['root-cause chains', 'cross-functional impact paths', 'GraphRAG context'],
  },
  {
    id: 'retrieval-context',
    name: 'Layer 5 · Retrieval context',
    purpose: 'Keep chunked SOPs, guidebooks, emails, tables, and evidence packs ready for AI retrieval with traceable citations.',
    grain: 'chunk with embedding and source metadata',
    storage: 'vector index or hybrid search store tied back to canonical records',
    outputs: ['copilot context', 'evidence-grounded answers', 'document search'],
  },
] as const

export const YANGON_TYRE_DECISION_LENSES: YangonTyreDecisionLens[] = [
  {
    id: 'micro',
    name: 'Micro',
    focus: 'Follow the smallest operating unit where work actually fails: one shift, one batch, one defect, one supplier packet, one dealer, one manager note.',
    watches: ['batch-level defects', 'downtime reasons', 'document completeness', 'dealer quote follow-up', 'weight delta by product'],
    outputs: ['root-cause action', 'owner-linked closeout', 'next operator task'],
  },
  {
    id: 'macro',
    name: 'Macro',
    focus: 'Read the business as a system: concentration, margin drag, stage-map drift, demand mix, supplier debt, and multi-team risk.',
    watches: ['monthly B+R trend', 'top family concentration', 'top dealer concentration', 'cross-functional trust score', 'annual volume drift'],
    outputs: ['management brief', 'priority reset', 'portfolio-level intervention'],
  },
] as const

export const YANGON_TYRE_TOOL_RECOMMENDATIONS: YangonTyreToolRecommendation[] = [
  {
    id: 'dlt',
    phase: 'now',
    category: 'Incremental extraction',
    name: 'dlt',
    why: 'Best fit when you need stateful incremental loading, merge semantics, and idempotent loads from messy operational sources into a local analytical store.',
    useFor: ['Drive and Sheets extract checkpoints', 'incremental mailbox packets', 'merge and upsert loading into local marts'],
    url: 'https://dlthub.com/docs/general-usage/incremental-loading',
  },
  {
    id: 'duckdb',
    phase: 'now',
    category: 'Local analytical database',
    name: 'DuckDB',
    why: 'Strong first database for this repo because it is in-process, fast on Parquet and spreadsheets, and easy to ship with the showroom and notebooks.',
    useFor: ['local OLAP', 'Parquet-backed marts', 'ad hoc feature engineering', 'embedded analytics APIs'],
    url: 'https://duckdb.org/docs/stable/guides/overview',
  },
  {
    id: 'dagster',
    phase: 'next',
    category: 'Asset orchestration',
    name: 'Dagster',
    why: 'Useful once the marts become multi-stage assets that need explicit lineage, schedules, retries, and observability instead of one-off scripts.',
    useFor: ['asset jobs', 'source freshness checks', 'lineage-aware orchestration', 'partitioned materializations'],
    url: 'https://docs.dagster.io/',
  },
  {
    id: 'dbt',
    phase: 'next',
    category: 'Semantic metrics',
    name: 'dbt Semantic Layer',
    why: 'Use it when the same KPIs must be consistent across manager desks, decks, notebooks, and AI agents.',
    useFor: ['semantic metric definitions', 'shared KPI formulas', 'governed dimensions and filters'],
    url: 'https://docs.getdbt.com/',
  },
  {
    id: 'great-expectations',
    phase: 'next',
    category: 'Data quality',
    name: 'Great Expectations',
    why: 'Good for turning the current informal data assumptions into explicit assertions on completeness, validity, and cross-source consistency.',
    useFor: ['sheet and mart checks', 'null and range validation', 'contract tests on promoted records'],
    url: 'https://docs.greatexpectations.io/docs/cloud/expectations/expectations_overview/',
  },
  {
    id: 'neo4j',
    phase: 'next',
    category: 'Graph and macro reasoning',
    name: 'Neo4j',
    why: 'Best fit when the hard question is not a table aggregate but a relationship path across suppliers, defects, approvals, machines, and decisions.',
    useFor: ['knowledge graph', 'impact paths', 'root-cause chains', 'GraphRAG for management copilots'],
    url: 'https://neo4j.com/docs/',
  },
  {
    id: 'openai-prod',
    phase: 'next',
    category: 'AI system discipline',
    name: 'OpenAI production guides and evals',
    why: 'Use this for the agent layer itself: prompt evaluation, production hardening, cost-latency tradeoffs, and safer tool use.',
    useFor: ['agent evals', 'production prompt policies', 'runtime guardrails', 'tool-calling review'],
    url: 'https://platform.openai.com/docs/guides/production-best-practices/model-overview',
  },
  {
    id: 'airbyte',
    phase: 'scale',
    category: 'Connector breadth',
    name: 'Airbyte',
    why: 'Employ it when source count and connector maintenance become the bottleneck and you need a wider standardized connector surface.',
    useFor: ['connector catalog expansion', 'replication into warehouse destinations', 'managed connector operations'],
    url: 'https://docs.airbyte.com/',
  },
  {
    id: 'iceberg',
    phase: 'scale',
    category: 'Large-table evolution',
    name: 'Apache Iceberg',
    why: 'Bring this in only when the marts outgrow local embedded storage and need schema evolution, partition evolution, and larger lakehouse-style tables.',
    useFor: ['table evolution', 'large historical marts', 'time-travel-friendly analytical storage'],
    url: 'https://iceberg.apache.org/docs/1.6.0/',
  },
] as const
