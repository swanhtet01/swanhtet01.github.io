export type YtfPortalStep = {
  id: string
  title: string
  detail: string
}

export type YtfPortalRoleRoute = {
  id: string
  role: string
  route: string
  owner: string
  detail: string
}

export const YTF_PORTAL_RUNTIME = {
  domain: 'ytf.supermega.dev',
  provider: 'Vercel',
  rolloutState: 'pilot',
  routeRoot: '/app',
  summary: 'First live tenant portal with sales, operations, DQMS, maintenance, and admin desks.',
  managedBy: ['Implementation Lead', 'Tenant Admin', 'Cloud Ops'],
  proofPaths: ['/app/portal', '/app/plant-manager', '/app/operations', '/app/dqms', '/app/platform-admin'],
} as const

export const YTF_PORTAL_DIALECTIC = {
  thesis: 'Run Yangon Tyre from one role-safe operating system with shared evidence.',
  antithesis: 'Drive folders, email threads, ERP exports, and shift notes still fragment the operating record.',
  synthesis: 'ytf.supermega.dev becomes the live command surface where plant, quality, maintenance, sales, and admin work from one runtime.',
} as const

export const YTF_FIRST_HOUR_PLAYBOOK: YtfPortalStep[] = [
  {
    id: 'open-home',
    title: 'Open the role home first',
    detail: 'Start from the tenant portal or plant manager interface so the next desk opens from the right context instead of from chat or bookmarks.',
  },
  {
    id: 'pick-lane',
    title: 'Choose one working lane',
    detail: 'Move into Operations, DQMS, Receiving, Maintenance, or Revenue based on the issue owner. Do not split the same issue across multiple side trackers.',
  },
  {
    id: 'record-fact',
    title: 'Write the fact where the work lives',
    detail: 'Attach the batch, GRN, defect, downtime, dealer, or approval evidence to the desk that owns the next action.',
  },
  {
    id: 'close-loop',
    title: 'End with owner, due time, and next review',
    detail: 'Each abnormal item should leave the review with one owner, one due time, and one explicit next check.',
  },
]

export const YTF_SHIFT_START_PROTOCOL: YtfPortalStep[] = [
  {
    id: 'shift-1',
    title: 'Review the red conditions',
    detail: 'Check shift blockers, receiving holds, open incidents, and repeat downtime before opening deeper analysis.',
  },
  {
    id: 'shift-2',
    title: 'Split micro from macro',
    detail: 'Use micro review for one batch, one defect, or one machine. Use macro review for throughput drift, concentration, and recurring loss.',
  },
  {
    id: 'shift-3',
    title: 'Escalate only with evidence',
    detail: 'Containment, approval, or release decisions should carry the underlying file, source lane, or case record.',
  },
]

export const YTF_ROLE_ENTRYPOINTS: YtfPortalRoleRoute[] = [
  {
    id: 'plant-manager',
    role: 'Plant manager',
    route: '/app/plant-manager',
    owner: 'Shift control',
    detail: 'Combined command surface for operations, DQMS, maintenance, receiving, and plant-level review.',
  },
  {
    id: 'operations',
    role: 'Operations and receiving',
    route: '/app/operations',
    owner: 'Execution control',
    detail: 'Daily blockers, inbound holds, approvals, inventory pressure, and action ownership.',
  },
  {
    id: 'quality',
    role: 'Quality and lab',
    route: '/app/dqms',
    owner: 'Containment and CAPA',
    detail: 'Incidents, CAPA, fishbone, 5W1H, KPI review, and closeout discipline.',
  },
  {
    id: 'maintenance',
    role: 'Maintenance and reliability',
    route: '/app/maintenance',
    owner: 'Downtime and countermeasure',
    detail: 'Breakdowns, PM work, repeat-failure follow-up, and asset-level reliability review.',
  },
  {
    id: 'admin',
    role: 'Tenant admin',
    route: '/app/platform-admin',
    owner: 'Domain and rollout control',
    detail: 'Roles, connectors, rollout posture, workspace policy, and live tenant operations.',
  },
]
