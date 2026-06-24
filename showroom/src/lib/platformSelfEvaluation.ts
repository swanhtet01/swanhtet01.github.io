export type PlatformSelfEvaluationMetric = {
  id: string
  name: string
  score: number
  cap: 100
  evidence: string
  nextMove: string
}

export type PlatformSelfEvaluationArea = {
  id: string
  area: string
  score: number
  status: 'Strong' | 'Improving' | 'Weak'
  evidence: string
  nextMove: string
  metrics: PlatformSelfEvaluationMetric[]
}

export type PlatformSelfEvaluationRisk = {
  id: string
  risk: string
  severity: 'High' | 'Medium' | 'Low'
  fix: string
}

export type PlatformResearchInput = {
  id: string
  source: string
  decision: string
  useNow: string
  sourceUrl: string
}

export type PlatformUpgradeProof = {
  id: string
  proof: string
  impact: string
}

export type PlatformMetricHighlight = {
  id: string
  area: string
  name: string
  score: number
  cap: 100
  evidence: string
  nextMove: string
}

type PlatformSelfEvaluationMetricDefinition = Omit<PlatformSelfEvaluationMetric, 'cap'> & {
  score: number
}

type PlatformSelfEvaluationAreaDefinition = Omit<PlatformSelfEvaluationArea, 'score' | 'status' | 'metrics'> & {
  metrics: PlatformSelfEvaluationMetricDefinition[]
}

function capMetricScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function averageScore(scores: number[]) {
  if (!scores.length) {
    return 0
  }
  return Math.round(scores.reduce((total, value) => total + value, 0) / scores.length)
}

function statusFromScore(score: number): PlatformSelfEvaluationArea['status'] {
  if (score >= 80) {
    return 'Strong'
  }
  if (score >= 60) {
    return 'Improving'
  }
  return 'Weak'
}

const AREA_DEFINITIONS: PlatformSelfEvaluationAreaDefinition[] = [
  {
    id: 'deployment',
    area: 'Live deployment and domains',
    evidence: 'The public domains are live and smoke-tested, but the release path still needs to be fully automated and repeatable.',
    nextMove: 'Add an automated production smoke and domain check step to the release workflow.',
    metrics: [
      {
        id: 'domain-routing',
        name: 'Domain routing',
        score: 96,
        evidence: 'supermega.dev, app.supermega.dev, and ytf.supermega.dev resolve to the current production deployment.',
        nextMove: 'Keep domain verification in the release checklist until it is automated.',
      },
      {
        id: 'public-route-health',
        name: 'Public route health',
        score: 90,
        evidence: 'Public smoke checks for the core product and tenant routes return 200.',
        nextMove: 'Expand smoke coverage to more app routes and role homes.',
      },
      {
        id: 'release-repeatability',
        name: 'Release repeatability',
        score: 82,
        evidence: 'The deploy path is working, but packaging can still drift between prebuilt and source deploy flows.',
        nextMove: 'Standardize one deploy path and eliminate output drift between local and Vercel builds.',
      },
      {
        id: 'build-hygiene',
        name: 'Build hygiene',
        score: 91,
        evidence: 'Build, lint, and backend syntax checks pass cleanly.',
        nextMove: 'Add the same checks into a single machine-review pipeline.',
      },
    ],
  },
  {
    id: 'ux',
    area: 'Simple operator UX',
    evidence: 'The app is less noisy than before, but too many screens still require explanation instead of guiding the operator naturally.',
    nextMove: 'Cut each role down to one home, one queue, one main action, and one evidence trail.',
    metrics: [
      {
        id: 'login-start-clarity',
        name: 'Login and start clarity',
        score: 82,
        evidence: 'Login is simpler and tenant-aware, with fewer onboarding choices at entry.',
        nextMove: 'Reduce decision count further once authenticated by routing roles directly to their home surface.',
      },
      {
        id: 'navigation-focus',
        name: 'Navigation focus',
        score: 72,
        evidence: 'Navigation is functional, but there are still too many concept-heavy destinations for daily operators.',
        nextMove: 'Hide or collapse non-daily surfaces behind admin or architecture roles.',
      },
      {
        id: 'role-home-clarity',
        name: 'Role-home clarity',
        score: 78,
        evidence: 'Role-aware routing and pages exist, but more desks still need a clearer primary action and queue.',
        nextMove: 'Make each role home open on the single most important queue and next action.',
      },
      {
        id: 'visual-comfort',
        name: 'Visual comfort',
        score: 72,
        evidence: 'The visual system is calmer than before, but some internal surfaces still feel dense and copy-heavy.',
        nextMove: 'Keep stripping non-operational copy and reduce panel count on the busiest desks.',
      },
    ],
  },
  {
    id: 'modules',
    area: 'Sellable modules',
    evidence: 'There is real module coverage and live routing, but depth varies widely between the strongest desks and the weaker product lines.',
    nextMove: 'Promote Manager Workspace, DQMS, and Data Fabric to production-grade depth before expanding breadth again.',
    metrics: [
      {
        id: 'live-route-coverage',
        name: 'Live route coverage',
        score: 86,
        evidence: 'Product and tenant routes are live, exported, and visible to buyers.',
        nextMove: 'Keep new sellable modules connected to a live route and proof path.',
      },
      {
        id: 'workflow-depth',
        name: 'Workflow depth',
        score: 68,
        evidence: 'Some modules still explain workflows better than they complete them.',
        nextMove: 'Push deeper writeback, approvals, and operator loops into the strongest three modules first.',
      },
      {
        id: 'role-specificity',
        name: 'Role specificity',
        score: 74,
        evidence: 'Role-aware desks exist, but not every module feels narrowly optimized for the person using it.',
        nextMove: 'Cut generic cross-role copy and make each desk speak directly to its owner.',
      },
      {
        id: 'commercial-proof',
        name: 'Commercial proof',
        score: 68,
        evidence: 'The product story is stronger, but not every module has a buyer-ready proof path or current runtime evidence.',
        nextMove: 'Attach proof, route, and rollout note to every module that is being sold externally.',
      },
    ],
  },
  {
    id: 'agents',
    area: 'Agent runtime',
    evidence: 'The runtime is now inspectable in the UI, but durable traces, eval artifacts, and tool-call storage still need to move from intention to system behavior.',
    nextMove: 'Back the evidence ledger with stored tool calls, artifacts, reviewer approval, and eval score per run.',
    metrics: [
      {
        id: 'evidence-ledger',
        name: 'Evidence ledger',
        score: 84,
        evidence: 'Agent Ops now exposes reviewability, source coverage, cadence, connector scope, and approval gates.',
        nextMove: 'Persist the ledger server-side so it becomes durable proof instead of UI-only interpretation.',
      },
      {
        id: 'run-cadence-health',
        name: 'Run cadence health',
        score: 72,
        evidence: 'Recent runs and job cadence are visible and scored in one place.',
        nextMove: 'Turn stale or failed jobs into explicit operator exceptions and recovery flows.',
      },
      {
        id: 'approval-boundaries',
        name: 'Approval boundaries',
        score: 76,
        evidence: 'Approval gates and write policy are now visible at the crew and runtime level.',
        nextMove: 'Bind those gates to actual action approval workflows and logged human decisions.',
      },
      {
        id: 'trace-durability',
        name: 'Trace durability',
        score: 66,
        evidence: 'Run rows exist, but tool-level traces, artifacts, and eval outputs are not yet durable enough for enterprise trust.',
        nextMove: 'Store tool calls, artifacts, and eval outputs per run with retention and audit lookup.',
      },
    ],
  },
  {
    id: 'data',
    area: 'Tenant data and knowledge',
    evidence: 'The data model and source maps are credible, but the end-to-end loop from source ingestion to operator writeback is not yet complete.',
    nextMove: 'Make one Drive or Gmail ingestion path production-grade before broadening connector breadth.',
    metrics: [
      {
        id: 'source-mapping',
        name: 'Source mapping',
        score: 80,
        evidence: 'Factory Client source packs and data models are already grounded in real business data shape.',
        nextMove: 'Keep extending source coverage only where it directly improves decisions or writeback.',
      },
      {
        id: 'connector-ingestion',
        name: 'Connector ingestion',
        score: 64,
        evidence: 'Connector strategy exists, but not every advertised path is operating end to end yet.',
        nextMove: 'Promote one Gmail or Drive sync lane to a hardened operating record flow.',
      },
      {
        id: 'manager-writeback',
        name: 'Manager writeback',
        score: 64,
        evidence: 'The system points toward writeback, but the human input and approval loop is still partial in many desks.',
        nextMove: 'Complete manager writeback in the core operating modules before adding more analysis surfaces.',
      },
      {
        id: 'kpi-provenance',
        name: 'KPI provenance',
        score: 80,
        evidence: 'Data Fabric and insight layers already frame provenance and narrative better than simple dashboards.',
        nextMove: 'Attach freshness and provenance visibly to every KPI that can drive action.',
      },
    ],
  },
  {
    id: 'security',
    area: 'Enterprise security posture',
    evidence: 'The cross-tenant issues were addressed and the runtime now exposes better guardrails, but audit depth and regression discipline still need hardening.',
    nextMove: 'Add tenant-scoped agent identities, explicit tool permissions, and security regression tests.',
    metrics: [
      {
        id: 'tenant-isolation',
        name: 'Tenant isolation',
        score: 88,
        evidence: 'Cross-tenant snapshot and rollout visibility issues were fixed.',
        nextMove: 'Keep tenant ownership checks explicit anywhere snapshots or rollout packs can be loaded.',
      },
      {
        id: 'tool-scoping',
        name: 'Tool scoping',
        score: 74,
        evidence: 'Runtime crews now expose scope, write policy, and required capabilities in the UI.',
        nextMove: 'Make the backend enforce the same scopes per agent identity and tool call.',
      },
      {
        id: 'auditability',
        name: 'Auditability',
        score: 70,
        evidence: 'Run evidence is visible, but durable traces and reviewer actions are not fully persisted yet.',
        nextMove: 'Store reviewer approvals, artifacts, and tool traces in one queryable ledger.',
      },
      {
        id: 'regression-coverage',
        name: 'Regression coverage',
        score: 72,
        evidence: 'Build and smoke checks are real, but security and tenant-isolation regressions still need dedicated tests.',
        nextMove: 'Add regression tests for auth, snapshot ownership, and guarded agent execution.',
      },
    ],
  },
]

const derivedAreas: PlatformSelfEvaluationArea[] = AREA_DEFINITIONS.map((area) => {
  const metrics: PlatformSelfEvaluationMetric[] = area.metrics.map((metric) => ({
    ...metric,
    score: capMetricScore(metric.score),
    cap: 100,
  }))

  const score = averageScore(metrics.map((metric) => metric.score))

  return {
    ...area,
    score,
    status: statusFromScore(score),
    metrics,
  }
})

const metricHighlights: PlatformMetricHighlight[] = derivedAreas.flatMap((area) =>
  area.metrics.map((metric) => ({
    id: `${area.id}:${metric.id}`,
    area: area.area,
    name: metric.name,
    score: metric.score,
    cap: metric.cap,
    evidence: metric.evidence,
    nextMove: metric.nextMove,
  })),
)

const strongestMetrics = [...metricHighlights].sort((left, right) => right.score - left.score).slice(0, 4)
const weakestMetrics = [...metricHighlights].sort((left, right) => left.score - right.score).slice(0, 4)
const overallScore = averageScore(derivedAreas.map((area) => area.score))

export const PLATFORM_SELF_EVALUATION = {
  date: '2026-04-25',
  scoreCap: 100,
  stretchMindset: '110 mindset, 100-point scorecard.',
  overallScore,
  scoringRule:
    'Every metric is capped at 100. Category scores are the average of their metrics. Overall score is the average of category scores.',
  verdict:
    'The platform is credible and demonstrable, but the next compounding gains still depend on stronger writeback, durable agent traces, and tighter operator simplicity.',
  areas: derivedAreas,
  strongestMetrics,
  weakestMetrics,
  risks: [
    {
      id: 'too-many-surfaces',
      risk: 'The app can still feel like a menu of concepts instead of a daily operating tool.',
      severity: 'High',
      fix: 'Default each role to one home, one intake, one queue, and hide advanced modules behind role or admin gates.',
    },
    {
      id: 'agent-trust',
      risk: 'The ledger is visible now, but stored tool-call traces and eval artifacts are still not durable enough.',
      severity: 'Medium',
      fix: 'Persist tool calls, artifacts, approvals, and eval scores per run before expanding writeback.',
    },
    {
      id: 'connector-depth',
      risk: 'Many connector ideas are listed, but client value requires one reliable data path end to end.',
      severity: 'Medium',
      fix: 'Prioritize Drive/Gmail to operating record to KPI insight to manager writeback.',
    },
    {
      id: 'provider-sprawl',
      risk: 'Adding every new AI framework can recreate the tool sprawl the product is supposed to eliminate.',
      severity: 'Medium',
      fix: 'Use OpenAI as the core coded agent lane, Google as the Gemini/Workspace/enterprise governance lane, and visual tools only for R&D.',
    },
  ] satisfies PlatformSelfEvaluationRisk[],
  researchInputs: [
    {
      id: 'openai-agents',
      source: 'OpenAI Agents SDK and AgentKit',
      decision: 'Use OpenAI as the code-owned orchestration lane.',
      useNow: 'Agent work cells, human review gates, traces, evals, tools, and sandbox-backed runs.',
      sourceUrl: 'https://developers.openai.com/api/docs/guides/agents',
    },
    {
      id: 'openai-production',
      source: 'OpenAI Codex production systems',
      decision: 'Turn repeated repo and product work into skills, QA loops, and release checks.',
      useNow: 'Build automation, PR review, QA passes, workflow codification, and system health sweeps.',
      sourceUrl: 'https://developers.openai.com/codex/use-cases/collections/production-systems',
    },
    {
      id: 'google-gemini',
      source: 'Gemini 3 and Computer Use',
      decision: 'Use Google as the long-context, multimodal, browser-control, and Workspace-heavy lane.',
      useNow: 'Document review, UI experiments, browser/mobile control tests, and Drive/Gmail-heavy client analysis.',
      sourceUrl: 'https://ai.google.dev/gemini-api/docs/gemini-3',
    },
    {
      id: 'google-agent-platform',
      source: 'Gemini Enterprise Agent Platform and ADK',
      decision: 'Copy the enterprise control model before expanding autonomy.',
      useNow: 'Agent identity, runtime, sessions, memory, evaluation, registry, gateway, and governance patterns.',
      sourceUrl: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale',
    },
    {
      id: 'agent-security',
      source: 'GitHub agentic AI security training',
      decision: 'Treat autonomous agents as a security product, not only an automation feature.',
      useNow: 'Threat model goal hijacking, tool misuse, identity abuse, memory poisoning, sandbox escape, and untrusted-web risks.',
      sourceUrl: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    },
  ] satisfies PlatformResearchInput[],
  upgrades: [
    {
      id: 'agent-evidence-ledger',
      proof: 'Agent Ops now scores recent runs, reviewability, cadence, source coverage, connector scope, and approval gates.',
      impact: 'Moves agent trust from vague automation to inspectable operating evidence.',
    },
    {
      id: 'lint-cleanup',
      proof: 'Known React hook lint warnings were removed in Insights and Workspace Onboarding.',
      impact: 'Build hygiene improved and future changes have less background noise.',
    },
    {
      id: 'release-proof',
      proof: 'Production deploy and public route smoke checks passed on the live domains.',
      impact: 'The product can be shown without relying on local-only proof.',
    },
  ] satisfies PlatformUpgradeProof[],
} as const
