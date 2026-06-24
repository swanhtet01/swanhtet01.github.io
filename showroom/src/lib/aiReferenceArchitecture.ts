export type KnowledgeRuntimeStage = {
  id: string
  lane: 'Online runtime' | 'Offline pipeline'
  name: string
  purpose: string
  controls: string[]
  output: string
  modules: string[]
}

export type AiCapabilityDomain = {
  id: string
  name: string
  thesis: string
  skills: string[]
  technologies: string[]
  modules: string[]
  operatorValue: string
}

export type AiInfrastructurePillar = {
  id: string
  name: string
  summary: string
  controls: string[]
  operatorOutcome: string
}

export type ProductArchitectureCategory = 'Workflow' | 'Knowledge' | 'Automation' | 'Intelligence' | 'Starter'

export const PRODUCTION_KNOWLEDGE_RUNTIME_STAGES: KnowledgeRuntimeStage[] = [
  {
    id: 'input-guard-and-routing',
    lane: 'Online runtime',
    name: 'Input guard and routing',
    purpose: 'Classify the request, block unsafe paths, and choose the right retrieval or action lane before tokens are spent.',
    controls: ['input guard', 'intent routing', 'policy check'],
    output: 'A safe request shape with the right runtime lane attached.',
    modules: ['Document Intelligence', 'Knowledge Hub', 'Manager Workspace'],
  },
  {
    id: 'memory-cache-and-context',
    lane: 'Online runtime',
    name: 'Memory, cache, and context',
    purpose: 'Reuse prior context, cache common answers, and keep each role inside the correct tenant memory boundary.',
    controls: ['semantic cache', 'conversation memory', 'tenant scoping'],
    output: 'Faster responses with less repeated retrieval and lower hallucination pressure.',
    modules: ['Agent Runtime', 'Founder Brief', 'Knowledge Graph'],
  },
  {
    id: 'hybrid-retrieval-and-ranking',
    lane: 'Online runtime',
    name: 'Hybrid retrieval and ranking',
    purpose: 'Combine keyword, vector, metadata, and graph-aware retrieval, then rerank before the model writes.',
    controls: ['dense retrieval', 'sparse retrieval', 'reranking', 'metadata filters'],
    output: 'Higher-trust evidence packets instead of broad raw dumps.',
    modules: ['Knowledge Hub', 'Data Fabric', 'Quality DQMS'],
  },
  {
    id: 'grading-citations-and-response',
    lane: 'Online runtime',
    name: 'Grading, citations, and response',
    purpose: 'Judge evidence quality, attach citations, redact where needed, and return a reviewable answer or action pack.',
    controls: ['retrieval grading', 'citations', 'output guard', 'response trace'],
    output: 'Inspectable answers and writeback proposals that survive audit.',
    modules: ['Manager Workspace', 'Agent Ops', 'Platform Admin'],
  },
  {
    id: 'source-ingest-and-normalization',
    lane: 'Offline pipeline',
    name: 'Source ingest and normalization',
    purpose: 'Detect changed files, messages, and exports, then normalize them into one company record with provenance.',
    controls: ['file watch', 'format detection', 'normalization', 'deduplication'],
    output: 'Canonical source rows that can feed marts, graphs, and desks.',
    modules: ['Data Fabric', 'Document Intake', 'Connector Ops'],
  },
  {
    id: 'extraction-and-enrichment',
    lane: 'Offline pipeline',
    name: 'Extraction and enrichment',
    purpose: 'Extract entities, metrics, structured fields, and evidence from files, sheets, and threads.',
    controls: ['OCR', 'table extraction', 'entity extraction', 'feature engineering'],
    output: 'Governed fields and signals ready for KPI packs and role stories.',
    modules: ['Data Science Studio', 'Operations Desk', 'Sales Desk'],
  },
  {
    id: 'chunking-embedding-and-indexing',
    lane: 'Offline pipeline',
    name: 'Chunking, embedding, and indexing',
    purpose: 'Prepare retrieval-ready slices and indexes without losing document ownership, lineage, or tenant scope.',
    controls: ['chunking', 'embedding', 'payload indexes', 'index refresh'],
    output: 'Fast knowledge search and graph-backed retrieval over operational evidence.',
    modules: ['Knowledge Graph', 'Knowledge Hub', 'RAG Runtime'],
  },
  {
    id: 'evaluation-and-promotion',
    lane: 'Offline pipeline',
    name: 'Evaluation and promotion',
    purpose: 'Score data quality, retrieval quality, and module usefulness so repeated patterns can graduate into tighter desks.',
    controls: ['evals', 'drift watch', 'quality score', 'promotion gate'],
    output: 'Adaptive module promotion instead of permanent prototype sprawl.',
    modules: ['Build Studio', 'Product Ops', 'Agent Ops'],
  },
]

export const AI_CAPABILITY_DOMAINS: AiCapabilityDomain[] = [
  {
    id: 'agentic-ai',
    name: 'Agentic AI',
    thesis: 'Agents are useful when they can route work, use tools, hand off, and return inspectable evidence.',
    skills: ['planning', 'task decomposition', 'tool use', 'handoffs', 'evaluation'],
    technologies: ['Agents SDK', 'MCP', 'workflow runtimes', 'trace/eval systems'],
    modules: ['Agent Runtime', 'Agent Ops', 'Workforce Command'],
    operatorValue: 'Replace manual coordination, not human accountability.',
  },
  {
    id: 'knowledge-and-rag',
    name: 'Knowledge and RAG',
    thesis: 'Operational knowledge needs guarded retrieval, citations, and continuous source refresh.',
    skills: ['retrieval design', 'chunking', 'ranking', 'citation design', 'memory scoping'],
    technologies: ['vector indexes', 'rerankers', 'semantic cache', 'knowledge graphs'],
    modules: ['Knowledge Hub', 'Document Intelligence', 'Data Fabric'],
    operatorValue: 'Turn files, email, and exports into one reliable answer surface.',
  },
  {
    id: 'data-science-and-ml',
    name: 'Data Science and ML',
    thesis: 'Feature engineering and drift-aware KPI packs matter more than decorative dashboards.',
    skills: ['feature engineering', 'anomaly detection', 'model evaluation', 'trend storytelling'],
    technologies: ['DuckDB', 'Python ML stack', 'warehouse marts', 'observability'],
    modules: ['Data Science Studio', 'Insights', 'Product Ops'],
    operatorValue: 'Extract the next action from metric change, not just report numbers.',
  },
  {
    id: 'multimodal-and-computer-use',
    name: 'Multimodal and computer use',
    thesis: 'Real company data is messy, visual, and often still trapped in files, screens, and office software.',
    skills: ['OCR', 'image reasoning', 'browser action', 'desktop companion flows'],
    technologies: ['multimodal models', 'desktop shells', 'browser agents', 'camera/file capture'],
    modules: ['Desktop Companion', 'Document Intake', 'Operations Desk'],
    operatorValue: 'Bridge the gap between human-owned files and governed portal records.',
  },
  {
    id: 'governance-and-safety',
    name: 'Governance and safety',
    thesis: 'Enterprise AI only sells when identity, policies, traces, and writeback gates are explicit.',
    skills: ['policy design', 'approval routing', 'risk review', 'auditability'],
    technologies: ['trace stores', 'approval engines', 'role controls', 'retention rules'],
    modules: ['Platform Admin', 'Security Control', 'Approval Engine'],
    operatorValue: 'Let the system move fast without becoming opaque or fragile.',
  },
  {
    id: 'cloud-and-runtime',
    name: 'Cloud and runtime',
    thesis: 'Autonomy survives only when queues, workers, storage, and compute are treated as first-class product layers.',
    skills: ['runtime orchestration', 'queue operations', 'tenant isolation', 'deployment discipline'],
    technologies: ['queue workers', 'stateful runtimes', 'accelerated compute', 'observability'],
    modules: ['Cloud Ops', 'Tenant Control Plane', 'Runtime Overview'],
    operatorValue: 'Keep agents running outside the chat session and inside governed infrastructure.',
  },
]

export const AI_INFRASTRUCTURE_PILLARS: AiInfrastructurePillar[] = [
  {
    id: 'security-and-compliance',
    name: 'Security and compliance',
    summary: 'Identity, secret handling, audit trail, tenant isolation, and retention rules must be built in before wider autonomy.',
    controls: ['SSO or managed auth', 'secret rotation', 'tenant isolation', 'retention policy'],
    operatorOutcome: 'Client data stays governable as portals scale.',
  },
  {
    id: 'ai-orchestration',
    name: 'AI orchestration',
    summary: 'Queues, workflows, schedulers, and runtime contracts coordinate long-running jobs and human review.',
    controls: ['durable workflows', 'queue workers', 'scheduler lane', 'approval checkpoints'],
    operatorOutcome: 'Agent work survives deploys, retries, and long waits.',
  },
  {
    id: 'integrated-data-services',
    name: 'Integrated data services',
    summary: 'The platform needs canonical records, marts, retrieval indexes, and lineage across files, connectors, and writeback.',
    controls: ['source registry', 'analytics marts', 'retrieval indexes', 'lineage'],
    operatorOutcome: 'Every module reads from the same operating record.',
  },
  {
    id: 'high-performance-storage',
    name: 'High-performance storage',
    summary: 'Embeddings, structured facts, artifacts, and raw evidence need storage tiers that match their access pattern.',
    controls: ['artifact storage', 'database tiers', 'vector storage', 'snapshot retention'],
    operatorOutcome: 'Knowledge and outputs stay fast and durable under load.',
  },
  {
    id: 'high-speed-networking',
    name: 'High-speed networking',
    summary: 'Agent rooms, browser sessions, portal APIs, and remote workers need low-friction service connectivity.',
    controls: ['private service links', 'edge routing', 'real-time channels', 'egress policy'],
    operatorOutcome: 'Operators and agents stay responsive across tenant surfaces.',
  },
  {
    id: 'accelerated-compute',
    name: 'Accelerated compute',
    summary: 'Different workloads need the right mix of CPU, memory, and accelerator capacity rather than one generic host.',
    controls: ['CPU workers', 'GPU lanes', 'burst controls', 'job family placement'],
    operatorOutcome: 'RAG, extraction, and multimodal workloads stop competing blindly for the same runtime.',
  },
  {
    id: 'automation-and-management',
    name: 'Automation and management',
    summary: 'Provisioning, domain checks, deploys, rollback, smoke, and observability need one management strip.',
    controls: ['deployment automation', 'domain verification', 'smoke checks', 'alerting'],
    operatorOutcome: 'The platform becomes sellable because the operating layer is repeatable.',
  },
]

const CAPABILITY_DOMAIN_IDS_BY_PRODUCT_CATEGORY: Record<ProductArchitectureCategory, string[]> = {
  Workflow: ['agentic-ai', 'knowledge-and-rag', 'governance-and-safety'],
  Knowledge: ['knowledge-and-rag', 'multimodal-and-computer-use', 'governance-and-safety'],
  Automation: ['agentic-ai', 'cloud-and-runtime', 'governance-and-safety'],
  Intelligence: ['data-science-and-ml', 'knowledge-and-rag', 'agentic-ai'],
  Starter: ['agentic-ai', 'knowledge-and-rag', 'governance-and-safety'],
}

const KNOWLEDGE_RUNTIME_STAGE_IDS_BY_PRODUCT_CATEGORY: Record<ProductArchitectureCategory, string[]> = {
  Workflow: ['source-ingest-and-normalization', 'extraction-and-enrichment', 'input-guard-and-routing', 'evaluation-and-promotion'],
  Knowledge: ['source-ingest-and-normalization', 'chunking-embedding-and-indexing', 'hybrid-retrieval-and-ranking', 'grading-citations-and-response'],
  Automation: ['input-guard-and-routing', 'memory-cache-and-context', 'grading-citations-and-response', 'evaluation-and-promotion'],
  Intelligence: ['extraction-and-enrichment', 'memory-cache-and-context', 'hybrid-retrieval-and-ranking', 'evaluation-and-promotion'],
  Starter: ['source-ingest-and-normalization', 'input-guard-and-routing', 'grading-citations-and-response', 'evaluation-and-promotion'],
}

function resolveCapabilityDomains(ids: string[]) {
  return ids
    .map((id) => AI_CAPABILITY_DOMAINS.find((item) => item.id === id))
    .filter((item): item is AiCapabilityDomain => Boolean(item))
}

function resolveKnowledgeRuntimeStages(ids: string[]) {
  return ids
    .map((id) => PRODUCTION_KNOWLEDGE_RUNTIME_STAGES.find((item) => item.id === id))
    .filter((item): item is KnowledgeRuntimeStage => Boolean(item))
}

export function getCapabilityDomainsForProductCategory(category: ProductArchitectureCategory) {
  return resolveCapabilityDomains(CAPABILITY_DOMAIN_IDS_BY_PRODUCT_CATEGORY[category] ?? CAPABILITY_DOMAIN_IDS_BY_PRODUCT_CATEGORY.Workflow)
}

export function getKnowledgeRuntimeStagesForProductCategory(category: ProductArchitectureCategory) {
  return resolveKnowledgeRuntimeStages(KNOWLEDGE_RUNTIME_STAGE_IDS_BY_PRODUCT_CATEGORY[category] ?? KNOWLEDGE_RUNTIME_STAGE_IDS_BY_PRODUCT_CATEGORY.Workflow)
}
