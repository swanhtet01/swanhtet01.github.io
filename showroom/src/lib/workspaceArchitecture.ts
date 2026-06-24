export type WorkspaceArchitecturePrinciple = {
  id: string
  title: string
  detail: string
}

export type WorkspaceArchetype = {
  id: string
  title: string
  lens: string
  audience: string
  whenToUse: string
  mobileUse: string
  primaryRoute: string
  supportingRoutes: string[]
}

export type PortalModuleFamily = {
  id: string
  title: string
  purpose: string
  bestFor: string
  modules: Array<{
    name: string
    route: string
    detail: string
  }>
}

export type MobileEntryLane = {
  id: string
  title: string
  route: string
  detail: string
  bestFor: string
}

export const WORKSPACE_ARCHITECTURE_PRINCIPLES: WorkspaceArchitecturePrinciple[] = [
  {
    id: 'one-context',
    title: 'One workspace per decision context',
    detail: 'Use role homes for orientation, process desks for execution, data rooms for analysis, and approval lanes for sign-off instead of mixing everything into one dashboard.',
  },
  {
    id: 'mobile-first',
    title: 'Capture must be mobile-first and low-friction',
    detail: 'Any manager or operator update that takes longer than a few taps will move back into chat, memory, or paper. Entry lanes must stay short, structured, and contextual.',
  },
  {
    id: 'evidence-chain',
    title: 'Modules share one evidence chain',
    detail: 'Gmail, Drive, ERP extracts, forms, approvals, and AI outputs should all attach to the same operating record so actions remain reviewable and reusable.',
  },
  {
    id: 'bounded-ai',
    title: 'AI works inside bounded workspaces',
    detail: 'Agent work belongs in routing, drafting, summarizing, and prioritizing lanes with clear review gates. Sensitive state changes should stay inside approval-aware workspaces.',
  },
] as const

export const WORKSPACE_ARCHETYPES: WorkspaceArchetype[] = [
  {
    id: 'role-home',
    title: 'Role home',
    lens: 'Who am I and what matters now?',
    audience: 'Everyone',
    whenToUse: 'Start here to orient the user, show only the next desks that fit the role, and avoid menu sprawl.',
    mobileUse: 'Good for opening the right lane, not for doing the whole job.',
    primaryRoute: '/app/portal',
    supportingRoutes: ['/app/start', '/app/manager-system'],
  },
  {
    id: 'command-workspace',
    title: 'Command workspace',
    lens: 'What needs intervention now?',
    audience: 'Managers, directors, cross-functional leads',
    whenToUse: 'Use for cross-team review, shift command, escalation, and the daily intervention loop.',
    mobileUse: 'Best on tablet or desktop, but should keep the top actions obvious on mobile.',
    primaryRoute: '/app/manager-system',
    supportingRoutes: ['/app/director', '/app/operations'],
  },
  {
    id: 'process-desk',
    title: 'Process desk',
    lens: 'What work is owned here?',
    audience: 'Operations, quality, maintenance, commercial teams',
    whenToUse: 'Use when one function needs a stable queue, owner, due window, and writeback surface.',
    mobileUse: 'Managers can review on mobile, but full execution usually needs a larger screen.',
    primaryRoute: '/app/operations',
    supportingRoutes: ['/app/dqms', '/app/maintenance', '/app/revenue'],
  },
  {
    id: 'approval-lane',
    title: 'Approval lane',
    lens: 'What cannot move without review?',
    audience: 'Managers, finance, procurement, directors',
    whenToUse: 'Use when supplier, release, finance, or policy decisions must pass a clear gate.',
    mobileUse: 'Good for review and sign-off if the evidence summary is short.',
    primaryRoute: '/app/approvals',
    supportingRoutes: ['/app/documents', '/app/director'],
  },
  {
    id: 'data-room',
    title: 'Data room',
    lens: 'What changed in the system?',
    audience: 'Analysts, tenant admins, directors, data science',
    whenToUse: 'Use for source maps, KPI drift, anomaly review, connector posture, and evidence-backed storytelling.',
    mobileUse: 'Review only. Detailed analysis should stay on desktop.',
    primaryRoute: '/app/data-fabric',
    supportingRoutes: ['/app/insights', '/app/connectors'],
  },
  {
    id: 'mobile-capture',
    title: 'Mobile capture',
    lens: 'What happened right now?',
    audience: 'Supervisors, QC, maintenance, receiving, admin staff',
    whenToUse: 'Use for the fastest entry surface: handoff, incident note, downtime, discrepancy, audit, or approval prep.',
    mobileUse: 'Primary mobile lane. Designed for short updates and immediate writeback.',
    primaryRoute: '/app/daily-entry',
    supportingRoutes: ['/app/action-board', '/app/documents'],
  },
  {
    id: 'agent-workspace',
    title: 'Agent workspace',
    lens: 'What should AI do next?',
    audience: 'Tenant admins, platform admins, operators',
    whenToUse: 'Use when routing, summaries, quality prep, or recurring monitoring should happen continuously but visibly.',
    mobileUse: 'Mostly review-only on mobile.',
    primaryRoute: '/app/teams',
    supportingRoutes: ['/app/agent-space', '/app/runtime'],
  },
] as const

export const PORTAL_MODULE_FAMILIES: PortalModuleFamily[] = [
  {
    id: 'capture-and-routing',
    title: 'Capture and routing',
    purpose: 'Turn raw updates into owned work without asking the user to know the whole system first.',
    bestFor: 'Managers, admin, QC, supervisors, receiving clerks',
    modules: [
      {
        name: 'Daily Entry',
        route: '/app/daily-entry',
        detail: 'Short structured capture for shift handoff, incidents, receiving, maintenance, and KPI notes.',
      },
      {
        name: 'Action Board',
        route: '/app/action-board',
        detail: 'Plain-language intake that routes messy updates into the right module and owner lane.',
      },
      {
        name: 'Document Control',
        route: '/app/documents',
        detail: 'Keep SOPs, COAs, supplier packs, audit files, and government records attached to the work.',
      },
    ],
  },
  {
    id: 'operating-control',
    title: 'Operating control',
    purpose: 'Give cross-functional managers one controlled place to review blockers, status, and escalation.',
    bestFor: 'Plant managers, ops leads, directors',
    modules: [
      {
        name: 'Manager System',
        route: '/app/manager-system',
        detail: 'Main command workspace for review, intervention, and handoff.',
      },
      {
    name: 'Factory Operations App',
        route: '/app/operations',
        detail: 'Queue for receiving issues, supplier chase, shift blockers, and Floor Actions.',
      },
      {
        name: 'Approvals',
        route: '/app/approvals',
        detail: 'Review lane for release gates, supplier evidence, and policy-bound moves.',
      },
    ],
  },
  {
    id: 'quality-and-reliability',
    title: 'Quality and reliability',
    purpose: 'Embed industrial methods into the daily runtime instead of leaving them in binders or side spreadsheets.',
    bestFor: 'Quality, maintenance, plant leadership',
    modules: [
      {
        name: 'DQMS',
        route: '/app/dqms',
        detail: 'Incidents, containment, CAPA, fishbone, and 5W1H on one case record.',
      },
      {
        name: 'Maintenance',
        route: '/app/maintenance',
        detail: 'Downtime, repeat-failure review, preventive actions, and spare-part blockers.',
      },
      {
        name: 'Invisible ISO',
        route: '/app/invisible-iso',
        detail: 'Training layer that translates standards into short manager routines and guided capture.',
      },
    ],
  },
  {
    id: 'data-and-intelligence',
    title: 'Data and intelligence',
    purpose: 'Keep connectors, KPIs, knowledge, and AI analysis on the same runtime as the work.',
    bestFor: 'Tenant admins, directors, analysts, AI operators',
    modules: [
      {
        name: 'Data Fabric',
        route: '/app/data-fabric',
        detail: 'Source registry, writeback lanes, topic pipelines, and trust posture.',
      },
      {
        name: 'Insights',
        route: '/app/insights',
        detail: 'Gap analysis, anomaly review, and KPI-backed storytelling from the tenant data layer.',
      },
      {
        name: 'Agent Ops',
        route: '/app/teams',
        detail: 'Governed AI workspaces for routing, summaries, review prep, and continuous monitoring.',
      },
    ],
  },
] as const

export const MOBILE_ENTRY_LANES: MobileEntryLane[] = [
  {
    id: 'shift-handoff',
    title: 'Shift handoff',
    route: '/app/daily-entry',
    detail: 'One fast update with the issue, owner, due window, and photo or evidence link.',
    bestFor: 'Supervisors and line leaders',
  },
  {
    id: 'mixed-update',
    title: 'Mixed update intake',
    route: '/app/action-board',
    detail: 'Paste a chat summary, voice transcription, or meeting note and let the system classify the next move.',
    bestFor: 'Managers and coordinators',
  },
  {
    id: 'approval-check',
    title: 'Approval check',
    route: '/app/approvals',
    detail: 'Review the short evidence pack and decide only the items that actually need sign-off.',
    bestFor: 'Directors, finance, procurement',
  },
  {
    id: 'document-proof',
    title: 'Document proof',
    route: '/app/documents',
    detail: 'Add or review the missing file, then move back to the owning desk.',
    bestFor: 'Admin, QC, supplier follow-up',
  },
] as const
