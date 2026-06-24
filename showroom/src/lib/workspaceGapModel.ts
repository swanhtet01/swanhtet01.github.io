export type WorkspaceErrcProfile = {
  eliminate: string
  reduce: string
  raise: string
  create: string
}

export type WorkspaceGapCard = {
  id: string
  name: string
  route: string
  owner: string
  score: number
  verdict: string
  currentStrength: string
  mainGap: string
  changeLoop: string
  kpiLens: string[]
  desktopUse: string
  mobileUse: string
  errc: WorkspaceErrcProfile
}

export type HumanDataLoop = {
  id: string
  name: string
  owner: string
  changeSignal: string
  agentAction: string
  humanDecision: string
  kpis: string[]
}

export type OpenStackAccelerator = {
  id: string
  name: string
  category: string
  fit: string
  useNow: string
  sourceLabel: string
  sourceUrl: string
}

export type SourceOwnerChangeLoop = {
  id: string
  name: string
  ownerContext: string
  changeSignal: string
  systemAction: string
  humanDecision: string
  insightOutput: string
  desktopFit: string
  mobileFit: string
}

export type WorkspaceExperienceScorecard = {
  workspaceId: string
  label: string
  simplicityScore: number
  mobileScore: number
  learningScore: number
  collaborationScore: number
  insightScore: number
  verdict: string
  errcFocus: string
}

function capWorkspaceScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export const WORKSPACE_GAP_CARDS: WorkspaceGapCard[] = [
  {
    id: 'manager-system',
    name: 'Manager Workspace',
    route: '/app/manager-system',
    owner: 'Prototype Studio + Workflow Systems Cell',
    score: capWorkspaceScore(82),
    verdict: 'Strong operator wedge',
    currentStrength: 'The manager path is already close to the right pattern: short capture, linked proof, and one next move.',
    mainGap: 'The next missing layer is automatic drift packs when entries, documents, or KPI notes start changing faster than the manager can review.',
    changeLoop: 'Watch daily entry, document updates, and task churn; group the delta into one manager review instead of more noise.',
    kpiLens: ['open tasks', 'pending approvals', 'repeat issue count'],
    desktopUse: 'Best for review, triage, and document-heavy control.',
    mobileUse: 'Best for capture, proof attachment, and fast owner assignment.',
    errc: {
      eliminate: 'Long operator explanations on the first screen.',
      reduce: 'Extra clicks between capture, proof, and next action.',
      raise: 'Automatic summary quality and role-specific KPI packs.',
      create: 'Change-driven manager brief with one acceptance decision.',
    },
  },
  {
    id: 'plant-manager',
    name: 'Plant Manager',
    route: '/app/plant-manager',
    owner: 'Plant control lead + Decision Systems Cell',
    score: capWorkspaceScore(79),
    verdict: 'Good control room, still dense',
    currentStrength: 'The cross-team review posture is clear and the page already owns containment and escalation.',
    mainGap: 'It still needs tighter recurring packs for repeat failures, supplier drift, and cross-shift review so the page becomes less reactive.',
    changeLoop: 'Watch receiving holds, quality incidents, and maintenance stops; roll repeated clusters into one control packet with owner and due window.',
    kpiLens: ['receiving holds', 'quality incidents', 'maintenance stops'],
    desktopUse: 'Best for shift review, containment, and cross-team decisions.',
    mobileUse: 'Use for quick escalation acknowledgment, not long investigation.',
    errc: {
      eliminate: 'Manual cross-team status chasing before each review.',
      reduce: 'Scrolling through too many parallel cards before the main blocker is clear.',
      raise: 'Repeat-failure grouping, supplier risk packets, and review evidence bundles.',
      create: 'One plant review packet for every red cluster.',
    },
  },
  {
    id: 'platform-admin',
    name: 'Platform Admin',
    route: '/app/platform-admin',
    owner: 'Governance Runtime + Tenant Launch Pod',
    score: capWorkspaceScore(74),
    verdict: 'Real control layer, still operator-heavy',
    currentStrength: 'Roles, rollout, modules, and runtime controls already exist in one governed surface.',
    mainGap: 'It still needs more decision compression so domains, connectors, launch state, and rollback posture feel like one command surface.',
    changeLoop: 'Watch module promotion, member changes, connector health, and rollout drift; compress them into one go or hold queue.',
    kpiLens: ['enabled modules', 'connector attention', 'member count'],
    desktopUse: 'Primary control plane for rollout, policy, and tenant setup.',
    mobileUse: 'Use for alerts, approvals, and quick go-hold decisions only.',
    errc: {
      eliminate: 'Scattered admin checks across multiple sub-pages before a decision is possible.',
      reduce: 'Route hunting when something is blocked in launch or policy.',
      raise: 'Rollout clarity, domain status, and connector health compression.',
      create: 'Single release-control packet per tenant launch.',
    },
  },
  {
    id: 'agent-ops',
    name: 'Agent Ops',
    route: '/app/teams',
    owner: 'Agent Ops pod + Autonomy and Safety Cell',
    score: capWorkspaceScore(76),
    verdict: 'Good runtime oversight, needs stronger data loops',
    currentStrength: 'Runtime contracts, evidence ledger, crew scopes, and approval gates are now explicit.',
    mainGap: 'The system still needs more human-owner loops that react to source changes and turn them into KPI packs instead of just job histories.',
    changeLoop: 'Watch connector changes, stale jobs, and repeated failures; prepare the human review packet before any risky action runs.',
    kpiLens: ['stale loops', 'errored loops', 'evidence score'],
    desktopUse: 'Primary workspace for runtime inspection, approvals, and failure recovery.',
    mobileUse: 'Use for alerts, approvals, and quick takeover decisions.',
    errc: {
      eliminate: 'Blind autonomy with no inspectable evidence trail.',
      reduce: 'Manual polling to see whether source changes need action.',
      raise: 'Human-owner handoff quality and KPI packet usefulness.',
      create: 'Change-triggered human review packets for each critical source lane.',
    },
  },
  {
    id: 'product-ops',
    name: 'Product Ops',
    route: '/app/product-ops',
    owner: 'Product systems pod + Module Factory',
    score: capWorkspaceScore(75),
    verdict: 'Good portfolio map, needs tighter client packaging',
    currentStrength: 'Product lines, release trains, workspace programs, and launch tracks are visible in one portfolio desk.',
    mainGap: 'The next gap is stronger client packaging: one pack, one proof route, one onboarding sequence, and one upgrade path per offer.',
    changeLoop: 'Watch launch blockers, release state, proof freshness, and rollout gaps; keep commercial packaging attached to the live routes.',
    kpiLens: ['open tasks', 'recent agent runs', 'attention items'],
    desktopUse: 'Best for release review, portfolio packaging, and client-build planning.',
    mobileUse: 'Use for status checks, not deep planning.',
    errc: {
      eliminate: 'Selling from disconnected modules with no launch pack.',
      reduce: 'Rebuilding the same client explanation for each deal.',
      raise: 'Proof-route clarity, onboarding pack quality, and commercial legibility.',
      create: 'Client build kits tied to one proof route and one rollout path.',
    },
  },
  {
    id: 'build-studio',
    name: 'Build Studio',
    route: '/app/factory',
    owner: 'R&D Lab + Module Factory',
    score: capWorkspaceScore(78),
    verdict: 'Strong internal build map, still proof-hungry',
    currentStrength: 'The page now has real metric scoring, client build kits, seedable sprints, and a named R&D command chain.',
    mainGap: 'The next gap is automatic proof capture from real tenants so screenshots, walkthroughs, and launch readiness stop depending on manual refresh.',
    changeLoop: 'Watch module posture, proof-route freshness, and client sprint state; keep the build system attached to live rollout evidence.',
    kpiLens: ['average readiness', 'live modules', 'recent runs'],
    desktopUse: 'Primary internal factory board for packaging, review, and module graduation.',
    mobileUse: 'Use for quick factory status and approvals, not deep editing.',
    errc: {
      eliminate: 'Prototype claims without proof-linked launch material.',
      reduce: 'Manual rebuilding of the same build and rollout checklist.',
      raise: 'Client-pack repeatability and module graduation discipline.',
      create: 'Live artifact capture loop tied to client delivery sprints.',
    },
  },
]

export const HUMAN_DATA_LOOPS: HumanDataLoop[] = [
  {
    id: 'drive-delta',
    name: 'Drive delta to canon pack',
    owner: 'Document owner or department manager',
    changeSignal: 'New, edited, or moved files in controlled Drive folders.',
    agentAction: 'Classify the changed files, extract fields, attach provenance, and queue the right records for review.',
    humanDecision: 'Approve canon promotion, reject noisy files, or assign the next corrective action.',
    kpis: ['document backlog', 'unclassified files', 'control cycle time'],
  },
  {
    id: 'gmail-thread',
    name: 'Gmail thread to action packet',
    owner: 'Sales lead, buyer, or operations manager',
    changeSignal: 'Important supplier, customer, or internal threads change state.',
    agentAction: 'Group the thread, extract the business signal, draft the next action, and refresh the relevant KPI pack.',
    humanDecision: 'Approve the reply, escalate the issue, or hold the action.',
    kpis: ['response lag', 'follow-up due count', 'blocked deal count'],
  },
  {
    id: 'erp-export-diff',
    name: 'ERP export diff to variance review',
    owner: 'Ops admin or finance owner',
    changeSignal: 'A new export lands or key ERP fields change materially.',
    agentAction: 'Normalize the export, detect deltas, update marts, and open exception packets where values drift.',
    humanDecision: 'Confirm the variance, request correction, or approve writeback.',
    kpis: ['variance count', 'stale export age', 'writeback acceptance rate'],
  },
  {
    id: 'daily-entry-drift',
    name: 'Daily entry drift to manager review',
    owner: 'Department manager',
    changeSignal: 'A cluster of entries shows repeated issues, delayed closure, or missing evidence.',
    agentAction: 'Prepare a short gap-analysis pack, fishbone starter, and KPI summary from the affected records.',
    humanDecision: 'Choose containment, assign the owner, and set the next review window.',
    kpis: ['repeat issue count', 'open action age', 'evidence completeness'],
  },
  {
    id: 'quality-cluster',
    name: 'Quality cluster to plant control packet',
    owner: 'Plant manager or quality lead',
    changeSignal: 'Quality incidents or supplier issues cross the repeat-failure threshold.',
    agentAction: 'Assemble the evidence, summarize the pattern, and pre-build the CAPA starter with related metrics.',
    humanDecision: 'Approve the control action, hold the supplier, or escalate to director review.',
    kpis: ['incident recurrence', 'supplier risk count', 'capa closure time'],
  },
]

export const SOURCE_OWNER_CHANGE_LOOPS: SourceOwnerChangeLoop[] = [
  {
    id: 'desktop-companion',
    name: 'Desktop companion watch',
    ownerContext: 'Files still owned on the manager or analyst computer',
    changeSignal: 'Selected folders or controlled files change on the desktop companion.',
    systemAction: 'The companion records the delta, syncs the metadata, and queues a review packet instead of copying whole folders blindly.',
    humanDecision: 'Approve canon sync, ignore noise, or reclassify the folder as a different workflow lane.',
    insightOutput: 'Freshness, backlog, missing evidence, and changed-file KPI summary.',
    desktopFit: 'Primary bridge when company data still lives on Windows or shared office machines.',
    mobileFit: 'Mobile sees the summary and approvals, not the raw file operation.',
  },
  {
    id: 'drive-and-docs',
    name: 'Drive and docs drift watch',
    ownerContext: 'Shared documents, SOPs, quality packs, and team folders',
    changeSignal: 'Files are added, edited, moved, or renamed in watched Drive folders.',
    systemAction: 'Extract fields, classify the record, and compare the new version against the current operating canon.',
    humanDecision: 'Promote the new version, hold it for review, or request a cleaner upload.',
    insightOutput: 'Document aging, uncontrolled-change count, and role-specific review packs.',
    desktopFit: 'Best for managers and document owners working in full review mode.',
    mobileFit: 'Useful for approval and quick acknowledgement after the system prepares the packet.',
  },
  {
    id: 'spreadsheet-diff',
    name: 'Spreadsheet diff to KPI pack',
    ownerContext: 'Teams still operating from exports, tracker sheets, and analyst-owned models',
    changeSignal: 'A sheet or export changes materially in values, rows, or formula outputs.',
    systemAction: 'Detect deltas, normalize key fields, and refresh the KPI mart plus exception list.',
    humanDecision: 'Accept the new official numbers, challenge the variance, or request corrected source data.',
    insightOutput: 'Variance tables, trend movement, and anomaly-backed KPI stories.',
    desktopFit: 'Best for analysis and exception review with full tables.',
    mobileFit: 'Shows the final KPI brief and exception count, not raw sheet editing.',
  },
  {
    id: 'email-thread-owner',
    name: 'Email thread owner loop',
    ownerContext: 'Managers, buyers, sellers, and customer-facing operators',
    changeSignal: 'A tagged thread changes state, gains a new attachment, or misses the expected reply window.',
    systemAction: 'Summarize the thread, extract the next action, and attach the issue to the right operating record.',
    humanDecision: 'Approve the reply, escalate, or convert the thread into a tracked case.',
    insightOutput: 'Response lag, blocked thread count, and case conversion quality.',
    desktopFit: 'Best for full thread review and drafting.',
    mobileFit: 'Useful for quick reply approval and escalation.',
  },
]

export const OPEN_STACK_ACCELERATORS: OpenStackAccelerator[] = [
  {
    id: 'temporal',
    name: 'Temporal',
    category: 'Durable workflows',
    fit: 'Use for long-running client onboarding, connector retries, rollout steps, and recovery-safe background flows.',
    useNow: 'Best upgrade when queue work must survive crashes, redeploys, or long waits without losing state.',
    sourceLabel: 'Temporal Docs',
    sourceUrl: 'https://docs.temporal.io/',
  },
  {
    id: 'airbyte',
    name: 'Airbyte',
    category: 'Connector ingestion',
    fit: 'Use for connector breadth, normalized syncs, and agent-ready source access beyond the current custom ingest paths.',
    useNow: 'Best upgrade when tenant data comes from many SaaS sources and you need repeatable sync contracts fast.',
    sourceLabel: 'Airbyte Docs',
    sourceUrl: 'https://docs.airbyte.com/',
  },
  {
    id: 'openmetadata',
    name: 'OpenMetadata',
    category: 'Metadata and lineage',
    fit: 'Use for lineage, observability, cataloging, and governed metadata around marts, pipelines, and knowledge assets.',
    useNow: 'Best upgrade when you want stronger cross-source provenance and data-governance visibility for enterprise buyers.',
    sourceLabel: 'OpenMetadata Docs',
    sourceUrl: 'https://docs.open-metadata.org/',
  },
  {
    id: 'opentelemetry',
    name: 'OpenTelemetry',
    category: 'Observability',
    fit: 'Use for traces, metrics, and logs across agents, APIs, connector jobs, and tenant runtime flows.',
    useNow: 'Best upgrade when you need one telemetry language for runtime truth, alerting, and KPI freshness monitoring.',
    sourceLabel: 'OpenTelemetry Docs',
    sourceUrl: 'https://opentelemetry.io/docs/',
  },
  {
    id: 'expo',
    name: 'Expo',
    category: 'Mobile shell',
    fit: 'Use for a dedicated mobile companion for managers and frontline roles while keeping one TypeScript product line.',
    useNow: 'Best upgrade when the browser shell is not enough and you need offline-friendly native capture on Android and iOS.',
    sourceLabel: 'Expo Docs',
    sourceUrl: 'https://docs.expo.dev/',
  },
  {
    id: 'tauri',
    name: 'Tauri',
    category: 'Desktop companion',
    fit: 'Use for a lightweight desktop shell that can watch local folders, bridge office files, and keep the portal close to the user-owned machine.',
    useNow: 'Best upgrade when source-of-truth files still live on local Windows or Mac desktops and the browser alone cannot observe them safely.',
    sourceLabel: 'Tauri Docs',
    sourceUrl: 'https://v2.tauri.app/start/',
  },
  {
    id: 'nango',
    name: 'Nango',
    category: 'Connector control',
    fit: 'Use for managed OAuth, sync plumbing, and change-aware SaaS integrations when the connector surface keeps expanding.',
    useNow: 'Best upgrade when client portals need broader SaaS coverage without rebuilding auth and sync logic per provider.',
    sourceLabel: 'Nango Docs',
    sourceUrl: 'https://docs.nango.dev/guides/infrastructure',
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    category: 'AI observability',
    fit: 'Use for LLM tracing, evaluations, prompt management, and continuous improvement loops on agent-heavy products.',
    useNow: 'Best upgrade when you need inspectable traces and evaluation data for every agent loop, KPI brief, and adaptive module.',
    sourceLabel: 'Langfuse Docs',
    sourceUrl: 'https://langfuse.com/docs',
  },
  {
    id: 'stagehand',
    name: 'Stagehand',
    category: 'Browser agents',
    fit: 'Use for browser workflows that need deterministic Playwright actions with AI-assisted extraction and recovery.',
    useNow: 'Best upgrade for client onboarding, competitor research, admin console checks, and proof capture that should run without manual clicking.',
    sourceLabel: 'Stagehand GitHub',
    sourceUrl: 'https://github.com/browserbase/stagehand',
  },
  {
    id: 'skyvern',
    name: 'Skyvern',
    category: 'Browser agents',
    fit: 'Use for longer browser workflows where the system must interpret forms, tables, and external portals without brittle selectors only.',
    useNow: 'Best upgrade for supplier portals, public registries, admin dashboards, and semi-structured SaaS workflows that change often.',
    sourceLabel: 'Skyvern GitHub',
    sourceUrl: 'https://github.com/Skyvern-AI/skyvern',
  },
  {
    id: 'ragflow',
    name: 'RAGFlow',
    category: 'Knowledge ingestion',
    fit: 'Use for document-heavy portals where parsing quality, retrieval, and provenance need to be more serious than a simple upload box.',
    useNow: 'Best upgrade for Factory Client source folders, SOP packs, policy documents, and client knowledge cleanrooms.',
    sourceLabel: 'RAGFlow GitHub',
    sourceUrl: 'https://github.com/infiniflow/ragflow',
  },
  {
    id: 'docling',
    name: 'Docling',
    category: 'Document intelligence',
    fit: 'Use for robust PDF, office document, and scanned source conversion before records enter the knowledge graph or KPI mart.',
    useNow: 'Best upgrade for transforming messy client files into evidence-backed records without hand-copying fields.',
    sourceLabel: 'Docling GitHub',
    sourceUrl: 'https://github.com/docling-project/docling',
  },
  {
    id: 'mcp-servers',
    name: 'MCP Servers',
    category: 'Agent tool plane',
    fit: 'Use as the standard pattern for exposing tools, data, and controlled actions to agent workers without hardcoding every integration.',
    useNow: 'Best upgrade for turning Gmail, Drive, GitHub, Stripe, browser, and internal APIs into governed tool contracts.',
    sourceLabel: 'MCP Servers GitHub',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'e2b-daytona',
    name: 'E2B + Daytona',
    category: 'Agent sandboxes',
    fit: 'Use for isolated code execution, agent experiments, generated notebook checks, and temporary dev environments.',
    useNow: 'Best upgrade for R&D pilots that should execute code safely before being promoted into the production app.',
    sourceLabel: 'Daytona GitHub',
    sourceUrl: 'https://github.com/daytonaio/daytona',
  },
  {
    id: 'dspy-mlflow',
    name: 'DSPy + MLflow',
    category: 'Agent evals',
    fit: 'Use for prompt/program optimization, evaluation tracking, and measurable agent quality instead of subjective proof claims.',
    useNow: 'Best upgrade for module-specific AI actions where output quality must improve over time with evidence.',
    sourceLabel: 'DSPy GitHub',
    sourceUrl: 'https://github.com/stanfordnlp/dspy',
  },
  {
    id: 'duckdb',
    name: 'DuckDB',
    category: 'Local analytics mart',
    fit: 'Use for portable analytics marts and KPI computation close to the data, including file-based and embedded workloads.',
    useNow: 'Best upgrade when you need fast local or tenant-scoped KPI processing from CSV, Parquet, JSON, and other file exports.',
    sourceLabel: 'DuckDB Docs',
    sourceUrl: 'https://duckdb.org/docs/current/clients/overview.html',
  },
]

export const WORKSPACE_EXPERIENCE_SCORECARDS: WorkspaceExperienceScorecard[] = [
  {
    workspaceId: 'manager-system',
    label: 'Manager Workspace',
    simplicityScore: capWorkspaceScore(84),
    mobileScore: capWorkspaceScore(88),
    learningScore: capWorkspaceScore(74),
    collaborationScore: capWorkspaceScore(82),
    insightScore: capWorkspaceScore(76),
    verdict: 'Best day-to-day operator wedge. Needs stronger adaptive coaching from real file and task drift.',
    errcFocus: 'Eliminate over-explaining, reduce taps, raise role coaching, create change-driven manager briefs.',
  },
  {
    workspaceId: 'plant-manager',
    label: 'Plant Manager',
    simplicityScore: capWorkspaceScore(71),
    mobileScore: capWorkspaceScore(72),
    learningScore: capWorkspaceScore(79),
    collaborationScore: capWorkspaceScore(88),
    insightScore: capWorkspaceScore(84),
    verdict: 'Strong review room. Still too dense for repeated quick decisions unless clustering improves.',
    errcFocus: 'Eliminate manual chasing, reduce card sprawl, raise cluster packets, create one red-cluster review pack.',
  },
  {
    workspaceId: 'platform-admin',
    label: 'Platform Admin',
    simplicityScore: capWorkspaceScore(68),
    mobileScore: capWorkspaceScore(61),
    learningScore: capWorkspaceScore(73),
    collaborationScore: capWorkspaceScore(78),
    insightScore: capWorkspaceScore(75),
    verdict: 'Real control plane, but still needs tighter compression for launch, connectors, and rollback.',
    errcFocus: 'Eliminate scattered checks, reduce route hunting, raise launch clarity, create one release-control packet.',
  },
  {
    workspaceId: 'agent-ops',
    label: 'Agent Ops',
    simplicityScore: capWorkspaceScore(74),
    mobileScore: capWorkspaceScore(69),
    learningScore: capWorkspaceScore(86),
    collaborationScore: capWorkspaceScore(83),
    insightScore: capWorkspaceScore(82),
    verdict: 'Good runtime oversight. Needs stronger human-owner loops attached to source changes.',
    errcFocus: 'Eliminate blind autonomy, reduce polling, raise handoff quality, create source-triggered review packets.',
  },
  {
    workspaceId: 'product-ops',
    label: 'Product Ops',
    simplicityScore: capWorkspaceScore(76),
    mobileScore: capWorkspaceScore(64),
    learningScore: capWorkspaceScore(78),
    collaborationScore: capWorkspaceScore(81),
    insightScore: capWorkspaceScore(84),
    verdict: 'Good portfolio desk. Needs better client-pack compression and adaptive module prioritization.',
    errcFocus: 'Eliminate disconnected selling, reduce repeated explanations, raise proof clarity, create adaptive rollout packs.',
  },
  {
    workspaceId: 'build-studio',
    label: 'Build Studio',
    simplicityScore: capWorkspaceScore(73),
    mobileScore: capWorkspaceScore(62),
    learningScore: capWorkspaceScore(85),
    collaborationScore: capWorkspaceScore(80),
    insightScore: capWorkspaceScore(79),
    verdict: 'Strong internal machine. Needs more live proof capture and less reliance on manual graduation checks.',
    errcFocus: 'Eliminate proofless claims, reduce manual graduation work, raise repeatability, create live artifact capture.',
  },
]

export function summarizeWorkspaceGapCards(cards: WorkspaceGapCard[] = WORKSPACE_GAP_CARDS) {
  const safeCards = cards.map((card) => ({
    ...card,
    score: capWorkspaceScore(card.score),
  }))

  const totalScore = safeCards.reduce((total, card) => total + card.score, 0)
  const averageScore = safeCards.length ? capWorkspaceScore(totalScore / safeCards.length) : 0
  const weakestCard = safeCards.reduce<WorkspaceGapCard | null>((weakest, card) => {
    if (!weakest || card.score < weakest.score) {
      return card
    }
    return weakest
  }, null)
  const strongCount = safeCards.filter((card) => card.score >= 80).length
  const interventionCount = safeCards.filter((card) => card.score < 78).length

  return {
    averageScore,
    strongestCount: strongCount,
    interventionCount,
    weakestCard,
    cards: safeCards,
  }
}

export function summarizeWorkspaceExperienceScorecards(cards: WorkspaceExperienceScorecard[] = WORKSPACE_EXPERIENCE_SCORECARDS) {
  const safeCards = cards.map((card) => ({
    ...card,
    simplicityScore: capWorkspaceScore(card.simplicityScore),
    mobileScore: capWorkspaceScore(card.mobileScore),
    learningScore: capWorkspaceScore(card.learningScore),
    collaborationScore: capWorkspaceScore(card.collaborationScore),
    insightScore: capWorkspaceScore(card.insightScore),
  }))

  const average = (values: number[]) => (values.length ? capWorkspaceScore(values.reduce((sum, value) => sum + value, 0) / values.length) : 0)
  const overallAverage = average(
    safeCards.map((card) => average([card.simplicityScore, card.mobileScore, card.learningScore, card.collaborationScore, card.insightScore])),
  )

  return {
    overallAverage,
    simplicityAverage: average(safeCards.map((card) => card.simplicityScore)),
    mobileAverage: average(safeCards.map((card) => card.mobileScore)),
    learningAverage: average(safeCards.map((card) => card.learningScore)),
    collaborationAverage: average(safeCards.map((card) => card.collaborationScore)),
    insightAverage: average(safeCards.map((card) => card.insightScore)),
    cards: safeCards,
  }
}
