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
  summary: 'Private Yangon Tyre portal with operating intake, plant command, daily entry, quality follow-up, maintenance, and admin desks.',
  managedBy: ['Implementation Lead', 'Tenant Admin', 'Cloud Ops'],
  reviewPaths: ['/app/portal', '/app/live-data', '/app/plant-manager', '/app/action-board', '/app/daily-entry', '/app/platform-admin'],
} as const

export const YTF_PORTAL_DIALECTIC = {
  thesis: 'Run Yangon Tyre from one role-safe operating system with shared evidence.',
  antithesis: 'Department records, email threads, exports, and shift notes still fragment the operating record.',
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
    detail: 'Move into Entry, Work, Plant, or Data based on the issue owner. Do not split the same issue across multiple side trackers.',
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
    id: 'manager-system',
    role: 'Plant manager',
    route: '/app/plant-manager',
    owner: 'Shift control',
    detail: 'Combined command surface for production, quality, maintenance, receiving, and plant-level review.',
  },
  {
    id: 'ai-erp',
    role: 'AI ERP runtime',
    route: '/app/erp',
    owner: 'Module and automation map',
    detail: 'Simple operating picture for useful modules, automation loops, and rollout depth.',
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
    route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    owner: 'Containment and root cause',
    detail: 'Defects, holds, 5W1H, KPI review, and closeout discipline.',
  },
  {
    id: 'maintenance',
    role: 'Maintenance and reliability',
    route: '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
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
