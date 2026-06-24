import { sessionHasCapability, type WorkspaceCapability } from './workspaceApi'

const ROUTE_CAPABILITY_MAP: Record<string, WorkspaceCapability[]> = {
  '/app/actions': ['actions.view'],
  '/app/revenue': ['sales.view'],
  '/app/revenue/pipeline': ['sales.view'],
  '/app/revenue/prospecting': ['sales.view'],
  '/app/operations': ['operations.view'],
  '/app/plant-manager': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/manager-system': ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/receiving': ['receiving.view'],
  '/app/approvals': ['approvals.view'],
  '/app/dqms': ['dqms.view'],
  '/app/maintenance': ['maintenance.view'],
  '/app/director': ['director.view'],
  '/app/platform-admin': ['tenant_admin.view', 'platform_admin.view'],
  '/app/connectors': ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/workforce': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/cloud': ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/runtime': ['agent_ops.view', 'connector_admin.view', 'knowledge_admin.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/data-fabric': ['director.view', 'tenant_admin.view', 'platform_admin.view', 'agent_ops.view', 'sales.view', 'operations.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'receiving.view'],
  '/app/knowledge': ['knowledge_admin.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/insights': ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/factory': ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/teams': ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/adoption-command': ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/workbench': ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
  '/app/supermega-dev': ['tenant_admin.view', 'platform_admin.view'],
}

export function canAccessPortalRoute(
  route: string,
  session: {
    role?: string
    capabilities?: string[]
  } | null | undefined,
) {
  const required = ROUTE_CAPABILITY_MAP[route]
  return !required?.length || required.some((capability) => sessionHasCapability(session, capability))
}
