import { sessionHasCapability, type WorkspaceCapability } from './workspaceApi'

const ROUTE_CAPABILITY_MAP: Record<string, WorkspaceCapability[]> = {
  '/app': ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/start': ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/portal': ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/use': ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/overview': ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/meta': ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/actions': ['actions.view'],
  '/app/action-board': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/live-data': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view', 'connector_admin.view', 'knowledge_admin.view'],
  '/app/onboarding': ['tenant_admin.view', 'platform_admin.view'],
  '/app/adoption-command': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/adoption': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/pilot': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/daily-entry': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/attendance-payroll': ['tenant_admin.view', 'platform_admin.view'],
  '/app/revenue': ['sales.view'],
  '/app/revenue/offers': ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/revenue/growth': ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/revenue/pipeline': ['sales.view'],
  '/app/revenue/prospecting': ['sales.view'],
  '/app/sales': ['sales.view'],
  '/app/sales/offers': ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/sales/growth': ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/sales/pipeline': ['sales.view'],
  '/app/sales/prospecting': ['sales.view'],
  '/app/commercial': ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/leads': ['sales.view'],
  '/app/leads/advanced': ['sales.view'],
  '/app/operations': ['operations.view'],
  '/app/plant-a': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/plant-manager': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/plant-os': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/industrial-os': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/operations-twin': ['operations.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/plantos-template': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/daily-brief': ['operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/manager-system': ['actions.view', 'receiving.view', 'approvals.view', 'documents.view', 'sales.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/simple-tools': ['actions.view', 'receiving.view', 'approvals.view', 'documents.view', 'sales.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/erp': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/ai-stack': ['tenant_admin.view', 'platform_admin.view'],
  '/app/change-monitor': ['tenant_admin.view', 'platform_admin.view'],
  '/app/data-quality': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/evaluation': ['tenant_admin.view', 'platform_admin.view'],
  '/app/owner-brief': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/manager-sops': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/invisible-iso': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/documents': ['operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'approvals.view', 'sales.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/receiving': ['receiving.view'],
  '/app/inventory': ['receiving.view', 'operations.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/approvals': ['approvals.view'],
  '/app/decisions': ['approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/exceptions': ['actions.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/dqms': ['dqms.view'],
  '/app/maintenance': ['maintenance.view'],
  '/app/director': ['director.view'],
  '/app/ceo': ['director.view'],
  '/app/news': ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/platform-admin': ['tenant_admin.view', 'platform_admin.view'],
  '/app/tenant-admin': ['tenant_admin.view', 'platform_admin.view'],
  '/app/meta-ops': ['tenant_admin.view', 'platform_admin.view'],
  '/app/meta-tools': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/open-source-radar': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/general-use-tools': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/integration-studio': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/tool-integration': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/process': ['agent_ops.view', 'architect.view', 'platform_admin.view'],
  '/app/founder-machine': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/market-intel': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/prototype-forge': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/email': ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/connectors': ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/workforce': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/cloud': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/cloud-ops': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/runtime': ['agent_ops.view', 'connector_admin.view', 'knowledge_admin.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/model-ops': ['agent_ops.view', 'architect.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/agent-space': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/custom-workflow': ['agent_ops.view', 'architect.view', 'director.view', 'sales.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/ai-workflow-desk': ['agent_ops.view', 'architect.view', 'director.view', 'sales.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/factory-operations': ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/restaurant-pos': ['sales.view', 'operations.view', 'finance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/client-room': ['actions.view', 'sales.view', 'operations.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/cloud-agent-army': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/agent-workbench': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/data-fabric': ['director.view', 'tenant_admin.view', 'platform_admin.view', 'connector_admin.view', 'knowledge_admin.view'],
  '/app/system': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/knowledge': ['knowledge_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/insights': ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/client-build': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/client-signup': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/factory': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/build-studio': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/portal-factory': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/teams': ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/workbench': ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/supermega-dev': ['tenant_admin.view', 'platform_admin.view'],
  '/app/product-ops': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/security': ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/policies': ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/lab': ['tenant_admin.view', 'platform_admin.view'],
  '/app/architect': ['architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/foundry': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/intake': ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/service-desk': ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/restaurant-os': ['sales.view', 'operations.view', 'finance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
}

const YTF_INTERNAL_BUILD_ROUTES = new Set([
  '/app/client-build',
  '/app/client-signup',
  '/app/factory',
  '/app/build-studio',
  '/app/portal-factory',
  '/app/supermega-dev',
  '/app/product-ops',
])

function isYtfWorkspaceSession(
  session: {
    username?: string
    workspace_slug?: string
    workspace_name?: string
  } | null | undefined,
) {
  const text = `${session?.username ?? ''} ${session?.workspace_slug ?? ''} ${session?.workspace_name ?? ''}`.toLowerCase()
  return text.includes('ytf') || text.includes('yangon tyre')
}

function normalizePortalRoute(route: string) {
  const trimmed = String(route || '').trim()
  const withoutHash = trimmed.split('#')[0] || '/'
  const withoutQuery = withoutHash.split('?')[0] || '/'
  return withoutQuery.replace(/\/+$/, '') || '/'
}

export function canAccessPortalRoute(
  route: string,
  session: {
    username?: string
    role?: string
    capabilities?: string[]
    workspace_slug?: string
    workspace_name?: string
  } | null | undefined,
) {
  const normalizedRoute = normalizePortalRoute(route)
  if (isYtfWorkspaceSession(session) && YTF_INTERNAL_BUILD_ROUTES.has(normalizedRoute)) {
    return false
  }
  const required = ROUTE_CAPABILITY_MAP[normalizedRoute]
  if (!required?.length) {
    return !normalizedRoute.startsWith('/app')
  }
  return required.some((capability) => sessionHasCapability(session, capability))
}
