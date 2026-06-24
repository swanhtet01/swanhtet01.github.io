import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { resolveCompanyPortalProfile } from '../lib/companyPortalProfile'
import { isSharedAppHost, supermegaYtfHost } from '../lib/domainRouting'
import { canAccessPortalRoute } from '../lib/portalRouteAccess'
import { getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import {
  getCapabilityProfileForRole,
  getWorkspaceSession,
  isWorkspaceAuthError,
  clearCachedWorkspaceSession,
  loadCachedWorkspaceSession,
  logoutWorkspace,
  type WorkspaceCapability,
} from '../lib/workspaceApi'
import { BrandLockup } from './Brand'

type SessionState = {
  username?: string
  display_name?: string
  role?: string
  capabilities?: string[]
  workspace_name?: string
  workspace_slug?: string
}

type AppNavItem = {
  label: string
  to: string
  requires: WorkspaceCapability[]
  group: 'primary' | 'workstream' | 'runtime' | 'change'
}

type AppOverflowGroup = {
  label: string
  targets: string[]
}

async function getWorkspaceSessionWithTimeout(timeoutMs = 9000) {
  const cachedSession = loadCachedWorkspaceSession()
  if (!cachedSession?.authenticated) {
    return await getWorkspaceSession()
  }

  return await Promise.race([
    getWorkspaceSession(),
    new Promise<typeof cachedSession>((resolve) => {
      window.setTimeout(() => resolve(cachedSession), timeoutMs)
    }),
  ])
}

const appNavItems: AppNavItem[] = [
  { label: 'Onboarding', to: '/app/onboarding', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  { label: 'Client Setup', to: '/app/client-build', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  {
    label: 'Start',
    to: '/app/start',
    requires: [
      'actions.view',
      'sales.view',
      'operations.view',
      'director.view',
      'receiving.view',
      'approvals.view',
      'dqms.view',
      'maintenance.view',
      'agent_ops.view',
      'architect.view',
      'tenant_admin.view',
      'platform_admin.view',
    ],
    group: 'primary',
  },
  { label: 'CEO Review', to: '/app/director', requires: ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  { label: 'Collaboration', to: '/app/actions', requires: ['actions.view'], group: 'primary' },
  { label: 'Action Board', to: '/app/action-board', requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  {
    label: 'Factory Ops',
    to: '/app/factory-operations',
    requires: ['operations.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Use YTF',
    to: '/app/use',
    requires: ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Daily Entry',
    to: '/app/daily-entry',
    requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'approvals.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Attendance',
    to: '/app/attendance-payroll',
    requires: ['tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Documents',
    to: '/app/documents',
    requires: ['documents.view', 'actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Manager Home',
    to: '/app/manager-system',
    requires: ['actions.view', 'receiving.view', 'approvals.view', 'documents.view', 'sales.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Simple Tools',
    to: '/app/simple-tools',
    requires: ['actions.view', 'receiving.view', 'approvals.view', 'documents.view', 'sales.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'ERP',
    to: '/app/erp',
    requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'System',
    to: '/app/system',
    requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'documents.view', 'sales.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Data Stack',
    to: '/app/ai-stack',
    requires: ['tenant_admin.view', 'platform_admin.view'],
    group: 'runtime',
  },
  { label: 'Revenue', to: '/app/revenue', requires: ['sales.view'], group: 'primary' },
  { label: 'Growth', to: '/app/revenue/growth', requires: ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  { label: 'Offers', to: '/app/revenue/offers', requires: ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  {
    label: 'Plant Manager',
    to: '/app/plant-manager',
    requires: ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Factory Ops',
    to: '/app/factory-operations',
    requires: ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  { label: 'ERP Template', to: '/app/plantos-template', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  {
    label: 'Daily Brief',
    to: '/app/daily-brief',
    requires: ['operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  {
    label: 'Plant A',
    to: '/app/plant-a',
    requires: ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Manager SOPs',
    to: '/app/manager-sops',
    requires: ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  { label: 'Operations', to: '/app/operations', requires: ['operations.view'], group: 'primary' },
  { label: 'Director', to: '/app/director', requires: ['director.view'], group: 'primary' },
  { label: 'Receiving', to: '/app/receiving', requires: ['receiving.view'], group: 'workstream' },
  { label: 'Approvals', to: '/app/approvals', requires: ['approvals.view'], group: 'workstream' },
  { label: 'Quality', to: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection', requires: ['dqms.view'], group: 'workstream' },
  { label: 'Maintenance', to: '/app/daily-entry?mode=normal_abnormal&section=Maintenance', requires: ['maintenance.view'], group: 'workstream' },
  {
    label: 'Adoption',
    to: '/app/adoption-command',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Pilot',
    to: '/app/pilot',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Workforce',
    to: '/app/workforce',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  { label: 'Insights', to: '/app/insights', requires: ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'workstream' },
  {
    label: 'Counter Ops',
    to: '/app/restaurant-pos',
    requires: ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  { label: 'Runtime', to: '/app/runtime', requires: ['agent_ops.view', 'connector_admin.view', 'knowledge_admin.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Cloud', to: '/app/cloud', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Meta Ops', to: '/app/meta-ops', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Meta Tools', to: '/app/meta-tools', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Process', to: '/app/process', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Founder Machine', to: '/app/founder-machine', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Market Intel', to: '/app/market-intel', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'R&D Studio', to: '/app/prototype-forge', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Integration Studio', to: '/app/integration-studio', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'supermega.dev', to: '/app/supermega-dev', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  {
    label: 'Model Ops',
    to: '/app/model-ops',
    requires: ['agent_ops.view', 'architect.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'runtime',
  },
  { label: 'Run Queue', to: '/app/agent-space', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Workflow', to: '/app/custom-workflow', requires: ['agent_ops.view', 'architect.view', 'director.view', 'sales.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  { label: 'Workflow', to: '/app/custom-workflow', requires: ['agent_ops.view', 'architect.view', 'director.view', 'sales.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Cloud Jobs', to: '/app/cloud-agent-army', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Build QA', to: '/app/agent-workbench', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Connectors', to: '/app/connectors', requires: ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Email', to: '/app/email', requires: ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  {
    label: 'Data Fabric',
    to: '/app/data-fabric',
    requires: [
      'director.view',
      'tenant_admin.view',
      'platform_admin.view',
      'connector_admin.view',
      'knowledge_admin.view',
    ],
    group: 'runtime',
  },
  {
    label: 'Live Data',
    to: '/app/live-data',
    requires: [
      'actions.view',
      'operations.view',
      'dqms.view',
      'maintenance.view',
      'receiving.view',
      'documents.view',
      'sales.view',
      'approvals.view',
      'director.view',
      'tenant_admin.view',
      'platform_admin.view',
      'connector_admin.view',
      'knowledge_admin.view',
    ],
    group: 'primary',
  },
  {
    label: 'Change Monitor',
    to: '/app/change-monitor',
    requires: ['tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Data Quality',
    to: '/app/data-quality',
    requires: [
      'actions.view',
      'operations.view',
      'dqms.view',
      'maintenance.view',
      'receiving.view',
      'director.view',
      'tenant_admin.view',
      'platform_admin.view',
    ],
    group: 'workstream',
  },
  {
    label: 'Evaluation',
    to: '/app/evaluation',
    requires: ['tenant_admin.view', 'platform_admin.view'],
    group: 'runtime',
  },
  {
    label: 'Owner Brief',
    to: '/app/owner-brief',
    requires: [
      'actions.view',
      'operations.view',
      'dqms.view',
      'maintenance.view',
      'receiving.view',
      'director.view',
      'tenant_admin.view',
      'platform_admin.view',
    ],
    group: 'runtime',
  },
  { label: 'Knowledge', to: '/app/knowledge', requires: ['knowledge_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Security', to: '/app/security', requires: ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Policies', to: '/app/policies', requires: ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Workbench', to: '/app/workbench', requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'R&D', to: '/app/lab', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Automation Review', to: '/app/teams', requires: ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Architect', to: '/app/architect', requires: ['architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Foundry', to: '/app/foundry', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Build Studio', to: '/app/factory', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Client Templates', to: '/app/portal-factory', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Product Setup', to: '/app/product-ops', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Platform Admin', to: '/app/platform-admin', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'change' },
]

const ROLE_PRIMARY_NAV: Record<string, string[]> = {
  member: ['/app/start', '/app/actions'],
  operator: ['/app/start', '/app/actions', '/app/operations', '/app/revenue'],
  manager: ['/app/start', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  manager_plant_a: ['/app/start', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  manager_plant_b: ['/app/start', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  owner: ['/app/start', '/app/owner-brief', '/app/director', '/app/data-fabric'],
  tenant_admin: ['/app/start', '/app/revenue/offers', '/app/platform-admin', '/app/process'],
  platform_admin: ['/app/start', '/app/revenue/offers', '/app/platform-admin', '/app/process'],
  director: ['/app/start', '/app/director', '/app/insights', '/app/approvals'],
  ceo: ['/app/start', '/app/daily-brief', '/app/director', '/app/insights'],
  admin: ['/app/start', '/app/daily-brief', '/app/platform-admin', '/app/data-fabric'],
  sales: ['/app/start', '/app/revenue', '/app/revenue/offers', '/app/actions'],
  sales_lead: ['/app/start', '/app/revenue/offers', '/app/revenue/growth', '/app/revenue'],
  operations: ['/app/start', '/app/daily-entry', '/app/action-board', '/app/plant-manager'],
  plant_manager: ['/app/start', '/app/daily-brief', '/app/plant-manager', '/app/live-data'],
  plant_a_manager: ['/app/start', '/app/daily-brief', '/app/plant-manager', '/app/live-data'],
  plant_b_manager: ['/app/start', '/app/daily-brief', '/app/plant-manager', '/app/live-data'],
  receiving_clerk: ['/app/start', '/app/receiving', '/app/actions', '/app/approvals'],
  procurement_lead: ['/app/start', '/app/approvals', '/app/receiving', '/app/actions'],
  quality: ['/app/start', '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection', '/app/operations', '/app/actions'],
  quality_manager: ['/app/start', '/app/plant-manager', '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection', '/app/actions'],
  maintenance: ['/app/start', '/app/plant-manager', '/app/daily-entry?mode=normal_abnormal&section=Maintenance', '/app/actions'],
}

const DEFAULT_ROLE_OVERFLOW_NAV: AppOverflowGroup[] = [
  { label: 'Work', targets: ['/app/actions', '/app/documents', '/app/approvals'] },
]

const ROLE_OVERFLOW_NAV: Record<string, AppOverflowGroup[]> = {
  member: DEFAULT_ROLE_OVERFLOW_NAV,
  operator: [
    { label: 'Work', targets: ['/app/actions', '/app/operations', '/app/documents'] },
    { label: 'Follow up', targets: ['/app/approvals', '/app/data-quality'] },
  ],
  manager: [
    { label: 'Work', targets: ['/app/daily-entry', '/app/action-board', '/app/manager-system'] },
    { label: 'Review', targets: ['/app/owner-brief', '/app/data-quality', '/app/documents'] },
  ],
  owner: [
    { label: 'Run', targets: ['/app/owner-brief', '/app/director', '/app/evaluation'] },
    { label: 'Work', targets: ['/app/revenue/growth', '/app/operations', '/app/documents'] },
  ],
  director: [
    { label: 'Review', targets: ['/app/director', '/app/insights', '/app/approvals'] },
    { label: 'Data', targets: ['/app/data-fabric', '/app/evaluation', '/app/owner-brief'] },
  ],
  ceo: [
    { label: 'Company', targets: ['/app/daily-brief', '/app/director', '/app/insights'] },
    { label: 'Control', targets: ['/app/data-fabric', '/app/evaluation', '/app/platform-admin'] },
  ],
  admin: [
    { label: 'Operate', targets: ['/app/actions', '/app/revenue/growth', '/app/operations', '/app/documents'] },
    { label: 'Control', targets: ['/app/meta-tools', '/app/connectors', '/app/platform-admin'] },
  ],
  tenant_admin: [
    { label: 'Operate', targets: ['/app/actions', '/app/revenue/offers', '/app/revenue/growth', '/app/operations', '/app/documents'] },
    { label: 'Control', targets: ['/app/process', '/app/market-intel', '/app/prototype-forge', '/app/integration-studio', '/app/meta-tools'] },
    { label: 'Setup', targets: ['/app/client-build', '/app/cloud-agent-army', '/app/agent-workbench', '/app/founder-machine', '/app/portal-factory', '/app/factory', '/app/product-ops'] },
  ],
  platform_admin: [
    { label: 'Operate', targets: ['/app/actions', '/app/revenue/offers', '/app/revenue/growth', '/app/operations', '/app/documents'] },
    { label: 'Control', targets: ['/app/process', '/app/market-intel', '/app/prototype-forge', '/app/integration-studio', '/app/meta-tools'] },
    { label: 'Setup', targets: ['/app/client-build', '/app/cloud-agent-army', '/app/agent-workbench', '/app/founder-machine', '/app/portal-factory', '/app/factory', '/app/product-ops'] },
  ],
  sales: [
    { label: 'Sales', targets: ['/app/revenue', '/app/revenue/offers', '/app/revenue/pipeline', '/app/actions'] },
    { label: 'Review', targets: ['/app/approvals', '/app/documents'] },
  ],
  sales_lead: [
    { label: 'Sales', targets: ['/app/revenue/offers', '/app/revenue/growth', '/app/revenue', '/app/revenue/pipeline'] },
    { label: 'Review', targets: ['/app/director', '/app/approvals', '/app/documents'] },
  ],
  operations: [
    { label: 'Plant', targets: ['/app/daily-brief', '/app/plant-manager', '/app/operations'] },
    { label: 'Control', targets: ['/app/action-board', '/app/data-quality', '/app/documents'] },
  ],
  plant_manager: [
    { label: 'Plant', targets: ['/app/daily-brief', '/app/plant-manager', '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection'] },
    { label: 'Control', targets: ['/app/daily-entry?mode=normal_abnormal&section=Maintenance', '/app/data-fabric', '/app/action-board'] },
  ],
  receiving_clerk: [
    { label: 'Receiving', targets: ['/app/receiving', '/app/actions', '/app/documents'] },
  ],
  procurement_lead: [
    { label: 'Procurement', targets: ['/app/approvals', '/app/receiving', '/app/actions'] },
    { label: 'Evidence', targets: ['/app/documents', '/app/data-quality'] },
  ],
  quality: [
    { label: 'Quality', targets: ['/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection', '/app/operations', '/app/documents'] },
  ],
  quality_manager: [
    { label: 'Quality', targets: ['/app/plant-manager', '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection', '/app/data-quality'] },
    { label: 'Evidence', targets: ['/app/documents', '/app/action-board'] },
  ],
  maintenance: [
    { label: 'Maintenance', targets: ['/app/plant-manager', '/app/daily-entry?mode=normal_abnormal&section=Maintenance', '/app/actions'] },
  ],
}

const PLATFORM_OPERATOR_OVERFLOW_NAV: AppOverflowGroup[] = [
  { label: 'Work', targets: ['/app/revenue', '/app/actions', '/app/data-fabric', '/app/connectors'] },
  { label: 'Admin', targets: ['/app/meta-ops', '/app/process', '/app/model-ops', '/app/integration-studio'] },
]

const INTERNAL_OPERATOR_ROUTES = new Set([
  '/app/ai-stack',
  '/app/runtime',
  '/app/cloud',
  '/app/meta-ops',
  '/app/meta-tools',
  '/app/process',
  '/app/founder-machine',
  '/app/market-intel',
  '/app/prototype-forge',
  '/app/integration-studio',
  '/app/supermega-dev',
  '/app/model-ops',
  '/app/agent-space',
  '/app/ai-workflow-desk',
  '/app/cloud-agent-army',
  '/app/agent-workbench',
  '/app/client-build',
  '/app/build-studio',
  '/app/workbench',
  '/app/lab',
  '/app/teams',
  '/app/architect',
  '/app/foundry',
  '/app/factory',
  '/app/portal-factory',
  '/app/product-ops',
  '/app/plantos-template',
])

const DEMO_APP_ROUTES = new Set([
  '/app',
  '/app/start',
  '/app/documents',
  '/app/custom-workflow',
  '/app/factory-operations',
  '/app/restaurant-pos',
  '/app/restaurant-os',
])

const DEMO_PRIMARY_NAV_TARGETS = [
  '/app/start',
  '/app/documents',
  '/app/factory-operations',
  '/app/restaurant-pos',
]

const PUBLIC_DEMO_PRODUCT_NAV = [
  {
    label: 'Document Extraction Ledger',
    shortLabel: 'Workflow',
    routes: ['/app/documents', '/app/custom-workflow', '/app/ai-workflow-desk'],
  },
  {
    label: 'Factory Operations App',
    shortLabel: 'Factory',
    routes: ['/app/factory-operations', '/app/operations-twin', '/app/industrial-os', '/app/plant-os'],
  },
  {
    label: 'Restaurant POS + Inventory',
    shortLabel: 'POS',
    routes: ['/app/restaurant-pos', '/app/restaurant-os'],
  },
] as const

function publicProductNavShortLabel(route: string) {
  return PUBLIC_DEMO_PRODUCT_NAV.find((product) => (product.routes as readonly string[]).includes(route))?.shortLabel ?? null
}

const INTERNAL_OPERATOR_ROLES = new Set([
  'admin',
  'ceo',
  'platform_admin',
  'product_owner',
  'implementation_lead',
])

function canSeeInternalOperatorRoutes(roleKey: string, tenantSiteMode: string) {
  return tenantSiteMode === 'platform' && INTERNAL_OPERATOR_ROLES.has(roleKey)
}

const YTF_ALLOWED_APP_ROUTES = new Set([
  '/app',
  '/app/start',
  '/app/portal',
  '/app/use',
  '/app/erp',
  '/app/system',
  '/app/director',
  '/app/ceo',
  '/app/plant-a',
  '/app/plant-manager',
  '/app/daily-brief',
  '/app/plant-os',
  '/app/industrial-os',
  '/app/manager-system',
  '/app/daily-entry',
  '/app/work',
  '/app/action-board',
  '/app/data-quality',
  '/app/live-data',
  '/app/data-fabric',
  '/app/platform-admin',
  '/app/dqms',
  '/app/maintenance',
  '/app/operations',
  '/app/attendance-payroll',
  '/app/revenue',
  '/app/revenue/pipeline',
  '/app/revenue/prospecting',
  '/app/inventory',
  '/app/receiving',
  '/app/documents',
  '/app/approvals',
  '/app/decisions',
  '/app/invisible-iso',
])

const YTF_VISIBLE_NAV_ROUTES = new Set([
  '/app/manager-system',
  '/app/erp',
  '/app/daily-entry',
  '/app/action-board',
  '/app/live-data',
  '/app/director',
  '/app/ceo',
  '/app/plant-manager',
  '/app/platform-admin',
])

const YTF_ROLE_NAV_ROUTES: Record<string, string[]> = {
  admin: ['/app/erp', '/app/action-board', '/app/live-data', '/app/platform-admin'],
  tenant_admin: ['/app/erp', '/app/action-board', '/app/live-data', '/app/platform-admin'],
  platform_admin: ['/app/erp', '/app/action-board', '/app/live-data', '/app/platform-admin'],
  ceo: ['/app/erp', '/app/action-board', '/app/director', '/app/live-data'],
  director: ['/app/erp', '/app/action-board', '/app/director', '/app/live-data'],
  plant_manager: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  plant_a_manager: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  plant_b_manager: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  manager: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  manager_plant_a: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  manager_plant_b: ['/app/erp', '/app/live-data', '/app/daily-entry', '/app/action-board'],
  operations: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  maintenance: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  quality: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  sales: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  receiving_clerk: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  procurement_lead: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/manager-system'],
  admin_hr_planning: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/live-data'],
  finance_controller: ['/app/erp', '/app/action-board', '/app/live-data', '/app/manager-system'],
  quality_manager: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/live-data'],
  maintenance_lead: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/live-data'],
  sales_lead: ['/app/erp', '/app/daily-entry', '/app/action-board', '/app/live-data'],
}

function isCurrentPath(pathname: string, target: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const normalizedTarget = target.replace(/\/+$/, '') || '/'
  if (normalizedTarget === '/app') {
    return normalizedPath === '/app'
  }
  return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`)
}

function buildPrimaryNav(roleKey: string, visibleNavItems: AppNavItem[], pathname: string) {
  const orderedTargets = ROLE_PRIMARY_NAV[roleKey] ?? ROLE_PRIMARY_NAV.member
  const visibleWorkItems = visibleNavItems.filter((item) => item.group === 'primary')
  const byPath = new Map(visibleWorkItems.map((item) => [item.to, item]))
  const primary: AppNavItem[] = []

  for (const target of orderedTargets) {
    const item = byPath.get(target)
    if (item) {
      primary.push(item)
    }
  }

  const currentItem = visibleWorkItems.find((item) => isCurrentPath(pathname, item.to))
  if (currentItem && !primary.some((item) => item.to === currentItem.to)) {
    primary.unshift(currentItem)
  }

  for (const item of visibleWorkItems) {
    if (primary.length >= 4) {
      break
    }
    if (!primary.some((entry) => entry.to === item.to)) {
      primary.push(item)
    }
  }

  return primary
}

function buildCoreNav(visibleNavItems: AppNavItem[], pathname: string, preferredTargets: string[], maxItems = 3) {
  const byPath = new Map(visibleNavItems.map((item) => [item.to, item]))
  const primary: AppNavItem[] = []

  for (const target of preferredTargets) {
    const item = byPath.get(target)
    if (!item || primary.some((entry) => entry.to === item.to)) {
      continue
    }
    primary.push(item)
    if (primary.length >= maxItems) {
      break
    }
  }

  const currentItem = visibleNavItems.find((item) => isCurrentPath(pathname, item.to))
  if (currentItem && !primary.some((item) => item.to === currentItem.to)) {
    primary.unshift(currentItem)
  }

  for (const item of visibleNavItems) {
    if (primary.length >= maxItems) {
      break
    }
    if (!primary.some((entry) => entry.to === item.to)) {
      primary.push(item)
    }
  }

  return primary.slice(0, maxItems)
}

function mergeNavItems(...groups: AppNavItem[][]) {
  const merged: AppNavItem[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.to)) {
        continue
      }
      seen.add(item.to)
      merged.push(item)
    }
  }

  return merged
}

function buildOverflowGroupsFromPlan(
  visibleNavItems: AppNavItem[],
  topNavItems: AppNavItem[],
  groupPlan: AppOverflowGroup[],
  maxGroups: number,
) {
  const byPath = new Map(visibleNavItems.map((item) => [item.to, item]))
  const topPaths = new Set(topNavItems.map((item) => item.to))

  return groupPlan
    .slice(0, maxGroups)
    .map((group) => ({
      label: group.label,
      items: group.targets
        .map((target) => byPath.get(target))
        .filter((item): item is AppNavItem => item !== undefined && !topPaths.has(item.to))
        .slice(0, 4),
    }))
    .filter((group) => group.items.length > 0)
}

function buildRoleOverflowGroups(
  visibleNavItems: AppNavItem[],
  topNavItems: AppNavItem[],
  roleKey: string,
  isClientTenant: boolean,
) {
  return buildOverflowGroupsFromPlan(
    visibleNavItems,
    topNavItems,
    ROLE_OVERFLOW_NAV[roleKey] ?? DEFAULT_ROLE_OVERFLOW_NAV,
    isClientTenant ? 2 : 3,
  )
}

function displayNavLabel(item: AppNavItem, platformWorkspace = false, ytfWorkspace = false, demoWorkspace = false) {
  if (demoWorkspace) {
    const publicProductShortLabel = publicProductNavShortLabel(item.to)
    if (publicProductShortLabel) return publicProductShortLabel
    if (item.to === '/app/start') return 'Products'
    if (item.to === '/app/erp') return 'Records'
    if (item.to === '/app/factory-operations' || item.to === '/app/operations-twin') return 'Factory'
    if (item.to === '/app/industrial-os' || item.to === '/app/plant-os') return 'Factory'
    if (item.to === '/app/restaurant-pos' || item.to === '/app/restaurant-os') return 'POS'
    if (item.to === '/app/custom-workflow' || item.to === '/app/ai-workflow-desk') return 'Workflow'
    if (item.to === '/app/documents') return 'Files'
  }
  if (platformWorkspace) {
    if (item.to === '/app/start') return 'Home'
    if (item.to === '/app/custom-workflow') return 'Workflow'
    if (item.to === '/app/factory-operations') return 'Factory'
    if (item.to === '/app/restaurant-pos') return 'POS'
    if (item.to === '/app/revenue/growth') return 'Revenue'
    if (item.to === '/app/client-build') return 'Setup'
    if (item.to === '/app/ai-workflow-desk') return 'Workflow'
    if (item.to === '/app/cloud-agent-army') return 'Cloud'
    if (item.to === '/app/portal-factory') return 'Templates'
    if (item.to === '/app/agent-workbench') return 'QA'
    if (item.to === '/app/platform-admin') return 'Settings'
    if (item.to === '/app/meta-ops') return 'Ops'
  }
  if (ytfWorkspace && item.to === '/app/manager-system') return 'Today'
  if (ytfWorkspace && item.to === '/app/plant-manager') return 'Today'
  if (ytfWorkspace && item.to === '/app/director') return 'CEO'
  if (ytfWorkspace && item.to === '/app/live-data') return 'Data'
  if (ytfWorkspace && item.to === '/app/action-board') return 'Work'
  if (ytfWorkspace && item.to === '/app/platform-admin') return 'Settings'
  if (ytfWorkspace && item.to === '/app/daily-entry') return 'Entry'
  if (ytfWorkspace && item.to === '/app/email') return 'Collab'
  if (item.to === '/app/portal') return 'Dashboard'
  if (item.to === '/app/use') return 'Home'
  if (item.to === '/app/email') return 'Collab'
  if (item.to === '/app/live-data') return 'Data'
  if (item.to === '/app') return 'Home'
  if (item.to === '/app/erp') return 'ERP'
  if (item.to === '/app/system') return 'System'
  if (item.to === '/app/plant-a') return 'Plant A'
  if (item.to === '/app/daily-entry') return 'Entry'
  if (item.to === '/app/attendance-payroll') return 'Attend'
  if (item.to === '/app/actions') return 'Collab'
  if (item.to === '/app/action-board') return 'Actions'
  if (item.to === '/app/manager-system') return 'Today'
  if (item.to === '/app/simple-tools') return 'Tools'
  if (item.to === '/app/plant-manager') return 'Plant'
  if (item.to === '/app/change-monitor') return 'Changes'
  if (item.to === '/app/data-quality') return 'Quality'
  if (item.to === '/app/evaluation') return 'Eval'
  if (item.to === '/app/owner-brief') return 'Brief'
  if (item.to === '/app/meta-tools') return 'Infra'
  if (item.to === '/app/meta') return 'HQ'
  if (item.to === '/app/meta-ops') return 'Ops'
  if (item.to === '/app/process') return 'Process'
  if (item.to === '/app/founder-machine') return 'Machine'
  if (item.to === '/app/market-intel') return 'Market'
  if (item.to === '/app/prototype-forge') return 'Forge'
  if (item.to === '/app/integration-studio') return 'Studio'
  if (item.to === '/app/ai-stack') return 'Stack'
  if (item.to === '/app/revenue/growth') return 'Growth'
  if (item.to === '/app/revenue') return 'Sales'
  if (item.to === '/app/director') return 'Review'
  if (item.to === '/app/platform-admin') return 'Setup'
  if (item.to === '/app/workbench') return 'Control'
  if (item.to === '/app/data-fabric') return 'Data'
  if (item.to === '/app/connectors') return 'Comms'
  if (item.to === '/app/documents') return 'Docs'
  if (item.to === '/app/teams') return 'Review'
  if (item.to === '/app/maintenance') return 'Maint'
  if (item.to === '/app/receiving') return 'Receive'
  if (item.to === '/app/industrial-os') return 'Plant'
  if (item.to === '/app/factory-operations') return 'Factory'
  if (item.to === '/app/restaurant-pos') return 'POS'
  if (item.to === '/app/restaurant-os') return 'Restaurant'
  if (item.to === '/app/service-desk') return 'Service'
  if (item.to === '/app/client-build') return 'Setup'
  if (item.to === '/app/custom-workflow' || item.to === '/app/ai-workflow-desk') return 'Workflow'
  if (item.to === '/app/factory') return 'Studio'
  if (item.to === '/app/portal-factory') return 'Templates'
  if (item.to === '/app/product-ops') return 'Product'
  if (item.to === '/app/cloud-agent-army') return 'Cloud'
  if (item.to === '/app/agent-workbench') return 'QA'
  return item.label
}

function shortYtfRoleLabel(roleKey: string, fallback: string) {
  const normalized = String(roleKey || '').trim().toLowerCase()
  if (normalized === 'ceo' || normalized === 'director') return 'CEO'
  if (['admin', 'tenant_admin', 'platform_admin'].includes(normalized)) return 'Admin'
  if (normalized === 'plant_a_manager') return 'Plant A Manager'
  if (normalized === 'plant_b_manager') return 'Plant B Manager'
  if (normalized === 'manager_plant_a') return 'Manager A'
  if (normalized === 'manager_plant_b') return 'Manager B'
  if (normalized === 'plant_manager') return 'Plant Manager'
  if (normalized === 'quality') return 'QC'
  if (normalized === 'maintenance') return 'Maintenance'
  if (normalized === 'sales') return 'Sales'
  if (normalized === 'operations') return 'Operations'
  return fallback || 'Manager'
}

function ytfBrandMetaForRole(roleKey: string, fallback: string) {
  const normalized = String(roleKey || '').trim().toLowerCase()
  if (normalized === 'ceo' || normalized === 'director') return 'Yangon Tyre Company'
  if (normalized.includes('plant_b') || normalized === 'manager_plant_b') return 'Yangon Tyre Plant B'
  if (
    normalized.includes('plant_a') ||
    normalized === 'manager_plant_a' ||
    normalized === 'manager' ||
    normalized === 'plant_manager' ||
    normalized === 'operations' ||
    normalized === 'maintenance' ||
    normalized === 'quality' ||
    normalized === 'sales'
  ) {
    return 'Yangon Tyre Plant A'
  }
  if (['admin', 'tenant_admin', 'platform_admin'].includes(normalized)) return 'Yangon Tyre Admin'
  return fallback || 'Yangon Tyre'
}

function buildYtfPreferredTargets(roleKey: string) {
  const normalized = String(roleKey || '').trim().toLowerCase()
  return YTF_ROLE_NAV_ROUTES[normalized] ?? YTF_ROLE_NAV_ROUTES.manager
}

function isYtfVisibleForRole(roleKey: string, route: string) {
  const normalized = String(roleKey || '').trim().toLowerCase()
  const roleRoutes = YTF_ROLE_NAV_ROUTES[normalized] ?? YTF_ROLE_NAV_ROUTES.manager
  return roleRoutes.includes(route)
}

function ytfRouteRedirect(pathname: string, roleKey = 'manager') {
  const normalized = pathname.replace(/\/+$/, '') || '/app'
  const roleHome = buildYtfPreferredTargets(roleKey)[0] ?? '/app/erp'
  if (normalized === '/app' || normalized === '/app/start' || normalized === '/app/use' || normalized === '/app/portal') {
    return roleHome
  }
  const redirects: Record<string, string> = {
    '/app/system': '/app/erp',
    '/app/plant-a': '/app/plant-manager',
    '/app/simple-tools': '/app/erp',
    '/app/service-desk': '/app/erp',
    '/app/data-fabric': '/app/live-data?view=kpi',
    '/app/change-monitor': '/app/action-board',
    '/app/attendance-payroll': '/app/manager-system',
    '/app/evaluation': '/app/platform-admin',
    '/app/owner-brief': '/app/plant-manager',
    '/app/daily-brief': '/app/plant-manager',
    '/app/plant-os': '/app/plant-manager',
    '/app/industrial-os': '/app/plant-manager',
    '/app/operations': '/app/erp',
    '/app/work': '/app/action-board',
    '/app/actions': '/app/action-board',
    '/app/approvals': '/app/action-board',
    '/app/decisions': '/app/action-board',
    '/app/data-quality': '/app/live-data?view=kpi',
    '/app/documents': '/app/erp',
    '/app/dqms': '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    '/app/maintenance': '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
    '/app/receiving': '/app/erp',
    '/app/inventory': '/app/live-data?view=kpi',
    '/app/revenue': '/app/erp',
    '/app/revenue/pipeline': '/app/erp',
    '/app/revenue/prospecting': '/app/erp',
    '/app/invisible-iso': '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    '/app/ai-stack': '/app/live-data?view=kpi',
    '/app/email': '/app/action-board',
    '/app/connectors': '/app/action-board',
  }
  return redirects[normalized] || ''
}

function currentLocationForLogin(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search || ''}${location.hash || ''}`
}

const appNavClassName = ({ isActive }: { isActive: boolean }) => `sm-app-nav-link ${isActive ? 'is-active' : ''}`.trim()

const appSubnavClassName = ({ isActive }: { isActive: boolean }) => `sm-app-subnav-link ${isActive ? 'is-active' : ''}`.trim()

function sessionLooksLikeYtf(session?: SessionState | null) {
  const text = [
    session?.username,
    session?.workspace_slug,
    session?.workspace_name,
    session?.display_name,
    session?.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes('ytf') || text.includes('yangon tyre') || text.includes('plant a')
}

function sessionLooksLikeDemo(session?: SessionState | null) {
  const text = [
    session?.workspace_slug,
    session?.workspace_name,
    session?.display_name,
    session?.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes('supermega-demo') || text.includes('demo workspace')
}

function YtfIndustrialBrand({ meta }: { meta: string }) {
  return (
    <span className="sm-ytf-brand-lockup flex items-center gap-3" translate="no">
      <span className="sm-brand-mark sm-ytf-brand-mark sm-ytf-brand-logo-mark flex h-11 items-center justify-center bg-white shadow-sm" aria-hidden="true">
        <img src="/brand/yangon-tyre-logo.png" alt="" loading="eager" decoding="async" />
      </span>
      <span className="grid gap-0.5">
        <span className="sm-ytf-brand-title text-base font-black leading-none tracking-tight text-[#17211f]">Yangon Tyre ERP</span>
        <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{meta}</span>
      </span>
    </span>
  )
}

export function AppFrame() {
  const location = useLocation()
  const navigate = useNavigate()
  const tenant = getTenantConfig()
  const cachedSession = loadCachedWorkspaceSession()
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname.trim().toLowerCase() : ''
  const sharedAppHost = isSharedAppHost(currentHostname)
  const hostLooksYtf = currentHostname === supermegaYtfHost || currentHostname.startsWith('ytf.')
  const tenantIsYtf = tenant.key === 'ytf-plant-a' || hostLooksYtf || (!sharedAppHost && sessionLooksLikeYtf(cachedSession?.session))
  const [loading, setLoading] = useState(!cachedSession)
  const [authenticated, setAuthenticated] = useState(Boolean(cachedSession?.authenticated))
  const [session, setSession] = useState<SessionState | null>(cachedSession?.session ?? null)
  const isYtfTenant = tenantIsYtf || sessionLooksLikeYtf(session)
  const isDemoWorkspace = !isYtfTenant && sessionLooksLikeDemo(session)

  useEffect(() => {
    if (!authenticated || !sessionLooksLikeYtf(session) || typeof window === 'undefined') {
      return
    }

    if (!isSharedAppHost(window.location.hostname)) {
      return
    }

    const target = new URL(`${window.location.protocol}//${supermegaYtfHost}${window.location.pathname}${window.location.search}${window.location.hash}`)
    window.location.replace(target.toString())
  }, [authenticated, session])

  useEffect(() => {
    let cancelled = false
    let settled = false
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || settled) {
        return
      }

      const fallbackSession = loadCachedWorkspaceSession()
      setAuthenticated(Boolean(fallbackSession?.authenticated))
      setSession(fallbackSession?.session ?? null)
      setLoading(false)
    }, 10000)

    async function load() {
      try {
        const payload = await getWorkspaceSessionWithTimeout()
        if (cancelled) {
          return
        }
        settled = true
        setAuthenticated(Boolean(payload?.authenticated))
        setSession(payload?.session ?? null)
      } catch (error) {
        if (!cancelled) {
          settled = true
          if (isWorkspaceAuthError(error)) {
            setAuthenticated(false)
            setSession(null)
          } else {
            const fallbackSession = loadCachedWorkspaceSession()
            setAuthenticated(Boolean(fallbackSession?.authenticated))
            setSession(fallbackSession?.session ?? null)
          }
        }
      } finally {
        window.clearTimeout(fallbackTimer)
        if (!cancelled) {
          settled = true
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  async function handleLogout() {
    clearCachedWorkspaceSession()
    await Promise.race([
      logoutWorkspace().catch(() => null),
      new Promise((resolve) => window.setTimeout(resolve, 1200)),
    ])
    navigate('/login', { replace: true })
  }

  const ytfRouteAllowed =
    !isYtfTenant || [...YTF_ALLOWED_APP_ROUTES].some((route) => isCurrentPath(location.pathname, route))
  if (!ytfRouteAllowed) {
    return <Navigate replace to="/app/start" />
  }

  if (loading) {
    return (
      <div className={`sm-app-shell ${isYtfTenant ? 'sm-ytf-app' : ''} min-h-screen text-[var(--sm-ink)]`.trim()}>
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
          <div className="sm-chip text-white">{isYtfTenant ? 'Loading Yangon Tyre...' : 'Opening app...'}</div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="sm-app-shell min-h-screen text-[var(--sm-ink)]">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16">
          <div className="sm-app-auth-panel max-w-2xl p-8 text-center">
            <p className="sm-kicker text-[var(--sm-accent)]">{isYtfTenant ? 'Yangon Tyre portal' : 'Client app'}</p>
            <h1 className="mt-4 text-4xl font-extrabold text-white">{isYtfTenant ? 'Sign in to open your work screen.' : 'Sign in to open the app.'}</h1>
            <p className="mt-4 text-[var(--sm-muted)]">
              {isYtfTenant
                ? 'Use the account assigned to your team. Your role controls what opens.'
                : 'Use the account assigned to your team. SUPERMEGA opens the right product or client account after login.'}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <NavLink className="sm-button-primary" to={`/login?next=${encodeURIComponent(currentLocationForLogin(location))}`}>
                Sign in
              </NavLink>
              {!isYtfTenant ? (
                <a className="sm-button-secondary" href="https://supermega.dev">
                  Back to site
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const ytfRedirect = isYtfTenant ? ytfRouteRedirect(location.pathname, session?.role) : ''
  if (ytfRedirect) {
    return <Navigate replace to={ytfRedirect} />
  }

  const demoRouteAllowed =
    !isDemoWorkspace || [...DEMO_APP_ROUTES].some((route) => isCurrentPath(location.pathname, route))
  if (!demoRouteAllowed) {
    return <Navigate replace to="/app/start" />
  }

  const capabilityProfile = getCapabilityProfileForRole(session?.role)
  const experience = resolveTenantRoleExperience(tenant.key, session?.role)
  const routeCapabilityAllowed = canAccessPortalRoute(location.pathname, session)
  if (!routeCapabilityAllowed) {
    const fallbackRoute = experience.defaultHome || '/app/start'
    return (
      <div className={`sm-app-shell ${isYtfTenant ? 'sm-ytf-app' : ''} min-h-screen text-[var(--sm-ink)]`.trim()}>
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16">
          <div className="sm-app-auth-panel max-w-2xl p-8 text-center">
            <p className="sm-kicker text-[var(--sm-accent)]">{isYtfTenant ? 'Not available for this role' : 'Module locked'}</p>
            <h1 className="mt-4 text-4xl font-extrabold text-[var(--sm-ink)]">{isYtfTenant ? 'This page is not assigned to your role.' : 'This role cannot open that module.'}</h1>
            <p className="mt-4 text-[var(--sm-muted)]">
              {isYtfTenant
                ? 'This portal only shows Yangon Tyre data and actions allowed for your role.'
                : 'SuperMega only shows the data, tools, and actions that match the signed-in role and permissions.'}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <NavLink className="sm-button-primary" to={fallbackRoute}>
                Open my app
              </NavLink>
              <NavLink className="sm-button-secondary" to="/app/start">
                Go to start
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const portalProfile = resolveCompanyPortalProfile(tenant, experience, session)
  const declaredCapabilities = (session?.capabilities ?? []) as WorkspaceCapability[]
  const capabilitySet = new Set<WorkspaceCapability>([...capabilityProfile.capabilities, ...declaredCapabilities])
  const canOpenInternalTools = canSeeInternalOperatorRoutes(capabilityProfile.roleKey, tenant.siteMode ?? 'platform')
  const processRouteAllowed =
    !isCurrentPath(location.pathname, '/app/process') ||
    capabilitySet.has('agent_ops.view') ||
    capabilitySet.has('architect.view') ||
    capabilitySet.has('platform_admin.view') ||
    (tenant.siteMode !== 'client' && capabilitySet.has('tenant_admin.view'))
  if (!processRouteAllowed) {
    return <Navigate replace to="/app/start" />
  }
  const tenantPortalItem: AppNavItem | null =
    tenant.siteMode === 'client'
        ? {
          label: 'Dashboard',
          to: '/app/portal',
          requires: ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
          group: 'primary',
        }
      : null
  const navItems = tenantPortalItem ? [tenantPortalItem, ...appNavItems] : appNavItems
  const visibleNavItems = navItems.filter((item) => {
    if ((isYtfTenant || hostLooksYtf) && item.to === '/app/attendance-payroll') {
      return false
    }
    if (isDemoWorkspace && !DEMO_APP_ROUTES.has(item.to)) {
      return false
    }
    if (item.to === '/app/process' && tenant.siteMode === 'client') {
      return false
    }
    if (isYtfTenant && !YTF_ALLOWED_APP_ROUTES.has(item.to)) {
      return false
    }
    if (isYtfTenant && !YTF_VISIBLE_NAV_ROUTES.has(item.to)) {
      return false
    }
    if (isYtfTenant && !isYtfVisibleForRole(capabilityProfile.roleKey, item.to)) {
      return false
    }
    if (!isDemoWorkspace && INTERNAL_OPERATOR_ROUTES.has(item.to) && !canOpenInternalTools) {
      return false
    }
    return item.requires.some((capability) => capabilitySet.has(capability))
  })
  const basePrimaryNavItems = buildPrimaryNav(capabilityProfile.roleKey, visibleNavItems, location.pathname)
  const appHomeRoute = isDemoWorkspace ? '/app/start' : '/app'
  const isPlatformWorkspace = tenant.siteMode === 'platform' && !isYtfTenant && !isDemoWorkspace
  const platformPreferredPrimaryTargets = isDemoWorkspace
    ? DEMO_PRIMARY_NAV_TARGETS
    : [
        '/app/start',
        '/app/custom-workflow',
        '/app/factory-operations',
        '/app/restaurant-pos',
      ]
  const ytfPreferredPrimaryTargets = buildYtfPreferredTargets(capabilityProfile.roleKey)
  const preferredPrimaryTargets =
    isYtfTenant
      ? ytfPreferredPrimaryTargets
      : tenant.siteMode === 'client'
        ? ['/app', '/app/erp', '/app/plant-manager', '/app/data-fabric', '/app/manager-system', '/app/change-monitor', '/app/evaluation', '/app/data-quality', '/app/owner-brief']
        : platformPreferredPrimaryTargets
  const topNavItems = buildCoreNav(
    visibleNavItems,
    location.pathname,
    [...preferredPrimaryTargets, ...basePrimaryNavItems.map((item) => item.to)],
    isDemoWorkspace ? 4 : isYtfTenant ? 4 : isPlatformWorkspace ? 4 : 3,
  )
  const overflowGroups = isYtfTenant || isDemoWorkspace
    ? []
    : isPlatformWorkspace
      ? buildOverflowGroupsFromPlan(visibleNavItems, topNavItems, PLATFORM_OPERATOR_OVERFLOW_NAV, 2)
      : buildRoleOverflowGroups(visibleNavItems, topNavItems, capabilityProfile.roleKey, tenant.siteMode === 'client')
  const mobileMenuItems = isYtfTenant
    ? buildCoreNav(visibleNavItems, location.pathname, ytfPreferredPrimaryTargets, 5)
    : isDemoWorkspace
      ? topNavItems
      : mergeNavItems(topNavItems, ...overflowGroups.map((group) => group.items))
  const mobileDockItems =
    tenant.siteMode === 'client' || isYtfTenant || isDemoWorkspace
      ? buildCoreNav(
          visibleNavItems,
          location.pathname,
          isYtfTenant ? ytfPreferredPrimaryTargets : isDemoWorkspace ? DEMO_PRIMARY_NAV_TARGETS : ['/app', '/app/erp', '/app/daily-entry', '/app/change-monitor', '/app/plant-manager'],
          isYtfTenant || isDemoWorkspace ? 4 : 5,
        )
      : []
  const productCockpitRoute = [
    '/app/custom-workflow',
    '/app/factory-operations',
    '/app/restaurant-pos',
    '/app/service-desk',
  ].some((path) => isCurrentPath(location.pathname, path)) ||
    (!isYtfTenant && !isDemoWorkspace && tenant.siteMode === 'platform' && isCurrentPath(location.pathname, '/app/start'))
  const hideMobileDock =
    productCockpitRoute || (isYtfTenant && isCurrentPath(location.pathname, '/app/daily-entry'))
  const ytfRoleBadge = shortYtfRoleLabel(capabilityProfile.roleKey, capabilityProfile.label)
  const ytfBrandMeta = ytfBrandMetaForRole(capabilityProfile.roleKey, portalProfile.companyName)
  const inRevenueWorkspace =
    location.pathname.startsWith('/app/revenue') || location.pathname.startsWith('/app/sales') || location.pathname.startsWith('/app/leads')
  const revenueSubnavItems = (
    isYtfTenant
      ? [
          capabilitySet.has('sales.view') ? { label: 'Desk', to: '/app/revenue' } : null,
          capabilitySet.has('actions.view') ? { label: 'Tasks', to: '/app/actions' } : null,
          capabilitySet.has('actions.view') ? { label: 'Work', to: '/app/action-board' } : null,
        ]
      : isPlatformWorkspace
        ? [
            capabilitySet.has('sales.view') ? { label: 'Sales desk', to: '/app/revenue' } : null,
            capabilitySet.has('sales.view') ? { label: 'Pipeline', to: '/app/revenue/pipeline' } : null,
            capabilitySet.has('actions.view') ? { label: 'Tasks', to: '/app/actions' } : null,
          ]
      : [
          capabilitySet.has('sales.view') ? { label: 'Desk', to: '/app/revenue' } : null,
          capabilitySet.has('sales.view') || capabilitySet.has('agent_ops.view') || capabilitySet.has('tenant_admin.view') || capabilitySet.has('platform_admin.view')
            ? { label: 'Growth', to: '/app/revenue/growth' }
            : null,
          capabilitySet.has('sales.view') ? { label: 'Pipeline', to: '/app/revenue/pipeline' } : null,
          capabilitySet.has('sales.view') ? { label: 'Prospecting', to: '/app/revenue/prospecting' } : null,
          capabilitySet.has('actions.view') ? { label: 'Tasks', to: '/app/actions' } : null,
          capabilitySet.has('approvals.view') ? { label: 'Approvals', to: '/app/approvals' } : null,
        ]
  ).filter(Boolean) as Array<{ label: string; to: string }>
  return (
    <div className={`sm-app-shell ${isYtfTenant ? 'sm-ytf-app' : ''} ${productCockpitRoute ? 'sm-app-shell-product-cockpit' : 'min-h-screen'} ${hideMobileDock ? 'sm-app-shell-no-mobile-dock' : ''} text-[var(--sm-ink)]`.trim()}>
      <a className="sm-skip-link" href="#app-main-content">
        Skip to content
      </a>
      <div className="sm-app-header">
        <div className="sm-app-topbar mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <NavLink className="flex items-center gap-3" to={appHomeRoute}>
              {isYtfTenant ? (
                <YtfIndustrialBrand meta={ytfBrandMeta} />
              ) : (
                <BrandLockup
                  markClassName="h-11 w-11"
                  meta={isDemoWorkspace ? 'PRODUCT APP' : portalProfile.companyName}
                  wordmarkClassName="text-lg sm-app-wordmark"
                />
              )}
            </NavLink>
            <span className="sm-app-badge">{isYtfTenant ? ytfRoleBadge : isDemoWorkspace ? 'Product app' : 'App'}</span>
            {!isYtfTenant && !isDemoWorkspace ? <span className="sm-status-pill hidden lg:inline-flex">{capabilityProfile.label}</span> : null}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {mobileMenuItems.length ? (
              <details className="relative">
                <summary className="sm-app-nav-link list-none">
                  Menu
                </summary>
                <div className="sm-app-tools-menu absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-72">
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Screens</p>
                      {mobileMenuItems.map((item) => (
                        <NavLink className={appNavClassName} key={item.to} to={item.to}>
                          {displayNavLabel(item, isPlatformWorkspace, isYtfTenant, isDemoWorkspace)}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ) : null}
            <button className="sm-button-secondary" onClick={() => void handleLogout()} type="button">
              Logout
            </button>
          </div>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {topNavItems.map((item) => (
              <NavLink className={appNavClassName} key={item.to} to={item.to}>
                {displayNavLabel(item, isPlatformWorkspace, isYtfTenant, isDemoWorkspace)}
              </NavLink>
            ))}
            {overflowGroups.length ? (
              <details className="relative">
                <summary className="sm-app-nav-link list-none">
                  {tenant.siteMode === 'client' ? 'More' : isPlatformWorkspace ? 'Admin' : 'Tools'}
                </summary>
                <div className="sm-app-tools-menu absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-72">
                  <div className="grid gap-3">
                    {overflowGroups.map((group) => (
                      <div className="grid gap-1" key={group.label}>
                        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">{group.label}</p>
                        {group.items.map((item) => (
                          <NavLink className={appNavClassName} key={item.to} to={item.to}>
                            {displayNavLabel(item, isPlatformWorkspace, isYtfTenant, isDemoWorkspace)}
                          </NavLink>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}
            <button className="sm-button-secondary" onClick={() => void handleLogout()} type="button">
              Logout
            </button>
          </div>
        </div>
        {inRevenueWorkspace && revenueSubnavItems.length ? (
          <div className="border-t border-white/8 bg-[rgba(10,16,28,0.72)]">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Revenue</span>
              {revenueSubnavItems.map((item) => (
                <NavLink className={appSubnavClassName} key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <main
        className={`sm-app-main mx-auto w-full max-w-7xl px-4 lg:px-8 ${productCockpitRoute ? 'pb-3 pt-3' : 'pb-16 pt-8'}`}
        id="app-main-content"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      {(tenant.siteMode === 'client' || isYtfTenant || isDemoWorkspace) && mobileDockItems.length && !hideMobileDock ? (
        <nav aria-label="Mobile primary" className="sm-mobile-dock md:hidden">
          {mobileDockItems.map((item) => (
            <NavLink className={appSubnavClassName} key={item.to} to={item.to}>
                {displayNavLabel(item, isPlatformWorkspace, isYtfTenant, isDemoWorkspace)}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
