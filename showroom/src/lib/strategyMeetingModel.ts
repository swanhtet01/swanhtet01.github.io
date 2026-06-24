export type StrategyScore = {
  id: string
  label: string
  score: number
  target: number
  reason: string
  nextMove: string
}

export type StrategyBet = {
  id: string
  name: string
  decision: 'Double down' | 'Prototype' | 'Hold'
  why: string
  proof: string
  route: string
}

export type StrategySignal = {
  id: string
  source: string
  implication: string
  action: string
  sourceUrl: string
}

export type ErrcMove = {
  id: string
  mode: 'Eliminate' | 'Reduce' | 'Raise' | 'Create'
  move: string
}

export const STRATEGY_SCORES: StrategyScore[] = [
  {
    id: 'clarity',
    label: 'Buyer clarity',
    score: 91,
    target: 95,
    reason: 'Back Office Workflow Desk, Factory Operations App, and Restaurant POS + Inventory are the three sane product paths. Everything else must be internal or included module infrastructure.',
    nextMove: 'Cut or hide any public proof route that does not support one of these three paths or a client workspace manifest.',
  },
  {
    id: 'utility',
    label: 'First-task utility',
    score: 82,
    target: 95,
    reason: 'The product proof routes now have cleaner first actions, but each module still needs one visible input, one review step, and one saved output.',
    nextMove: 'Make each sellable module declare trigger, input, human decision, AI draft, and saved operating record.',
  },
  {
    id: 'agent-readiness',
    label: 'Agent readiness',
    score: 91,
    target: 96,
    reason: 'Tooling, source ledgers, QA, and agent work cells exist; the new gap is live recursive-workcell evals and security drills.',
    nextMove: 'Ship recursive workcell manifests plus goal-hijack, tool-misuse, memory-poisoning, and delegation drills.',
  },
  {
    id: 'sellability',
    label: 'Sellability',
    score: 84,
    target: 94,
    reason: 'The public site and app proof routes are live, but pricing, Stripe packaging, and one-page proof scripts are not fully closed.',
    nextMove: 'Connect Back Office Workflow Desk, Factory Operations App, and Restaurant POS + Inventory to Stripe/package readiness and generate one short proof script per product.',
  },
  {
    id: 'ops-safety',
    label: 'Ops safety',
    score: 90,
    target: 98,
    reason: 'Domain smoke, route audit, protected endpoints, and Meta Ops exist; GitHub CLI still needs account approval.',
    nextMove: 'Finish GitHub CLI auth, then use GitHub/CI status as a required release gate.',
  },
]

export const STRATEGY_BETS: StrategyBet[] = [
  {
    id: 'Back Office Workflow Desk',
    name: 'Back Office Workflow Desk',
    decision: 'Double down',
    why: 'Primary wedge: every buyer can understand one repeated workflow becoming one useful app.',
    proof: 'A buyer opens one product proof route, sees source intake, work queue, owner review, and release proof without learning internal platform concepts.',
    route: '/app/documents',
  },
  {
    id: 'Factory Operations App',
    name: 'Factory Operations App',
    decision: 'Double down',
    why: 'Most differentiated wedge: quality, maintenance, receiving, source truth, and executive brief can replace real factory coordination work.',
    proof: 'A plant manager can open one desk, pick the blocker, assign owner, and preserve evidence.',
    route: '/app/factory-operations',
  },
  {
    id: 'Restaurant POS + Inventory',
    name: 'Restaurant POS + Inventory',
    decision: 'Prototype',
    why: 'Good SMB entry wedge if POS, menu, payment proof, and shift control become the first value moments before heavier operations modules.',
    proof: 'Owner opens one desk for menu, payments, shift notes, stock, and guest recovery.',
    route: '/app/restaurant-pos',
  },
  {
    id: 'random-portals',
    name: 'Random bespoke portals',
    decision: 'Hold',
    why: 'Too many custom concepts create confusion and support drag before the core factory pattern is proven.',
    proof: 'Only revive when a paid client has a repeated workflow that maps to the module contract.',
    route: '/app/portal-factory',
  },
]

export const STRATEGY_SIGNALS: StrategySignal[] = [
  {
    id: 'recursive-mas',
    source: 'RecursiveMAS via Hugging Face papers',
    implication: 'The right multi-agent pattern is recursive collaboration with planner, worker, critic, verifier, and clear stopping rules.',
    action: 'Prototype recursive workcells only for CAPA packets, supplier claims, executive briefs, and portal factory manifests.',
    sourceUrl: 'https://huggingface.co/papers/2604.25917',
  },
  {
    id: 'github-agentic-security',
    source: 'GitHub agentic AI security game',
    implication: 'Agent security is now a practical skill area: goals, tools, memories, and handoffs need attack/defense exercises.',
    action: 'Add an agent security gym to Meta Ops release gates before any connector writeback or autonomous job promotion.',
    sourceUrl: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
  },
  {
    id: 'openai-sandbox-agents',
    source: 'OpenAI Agents SDK sandbox agents',
    implication: 'Agent work should run in controlled workspaces with files, commands, tools, traces, and human review.',
    action: 'Standardize SuperMega agent runs as workspace manifests with source scope, output folder, review gate, and evidence row.',
    sourceUrl: 'https://developers.openai.com/api/docs/guides/agents',
  },
  {
    id: 'google-adk-agent-platform',
    source: 'Google ADK and Gemini Enterprise agent registry',
    implication: 'Enterprise buyers expect agent inventory, identity, governance, sharing, and lifecycle management.',
    action: 'Make Agent Teams show owner, tools, data scope, approval policy, last run, and readiness status.',
    sourceUrl: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-development-kit/overview',
  },
  {
    id: 'cloudflare-long-running-agents',
    source: 'Cloudflare durable agents',
    implication: 'Long-running agent work should persist state and wake on events instead of pretending a chat session is a worker.',
    action: 'Prototype source-change watchers and client workrooms as durable agent actors after the current Vercel app is stable.',
    sourceUrl: 'https://developers.cloudflare.com/agents/concepts/long-running-agents/',
  },
  {
    id: 'vercel-ai-agents',
    source: 'Vercel AI SDK agent loop',
    implication: 'The deployed app can host simple route-aware AI actions with bounded tool steps before a heavier orchestrator is required.',
    action: 'Keep universal page assistant, then add module-specific AI actions for only the highest-value workflows.',
    sourceUrl: 'https://vercel.com/docs/agents',
  },
]

export const ERRC_MOVES: ErrcMove[] = [
  {
    id: 'eliminate-demo-sprawl',
    mode: 'Eliminate',
    move: 'Remove portal proof routes that do not map to a paid buyer, real route, module contract, and first task.',
  },
  {
    id: 'reduce-text-buttons',
    mode: 'Reduce',
    move: 'Reduce text, navigation, and competing calls to action; every screen should start with one job.',
  },
  {
    id: 'raise-proof',
    mode: 'Raise',
    move: 'Raise evidence: source links, saved records, route QA, role access, and proof scripts must be visible.',
  },
  {
    id: 'create-agent-ledger',
    mode: 'Create',
    move: 'Create agent equipment ledgers and client workspace manifests as the core scaling machine.',
  },
]

export function strategyOverallScore() {
  const total = STRATEGY_SCORES.reduce((sum, item) => sum + item.score, 0)
  return Math.round(total / STRATEGY_SCORES.length)
}
