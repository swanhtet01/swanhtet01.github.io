export type YtfEnterpriseDatabase = {
  id: string
  name: string
  purpose: string
  records: string[]
  usedBy: string[]
  aiUse: string
  adminSetup: string
  route: string
}

export type YtfRoleDataAccess = {
  role: string
  account: string
  writes: string[]
  reads: string[]
  hidden: string[]
  dailyJob: string
  route: string
}

export type YtfAdminSetupPrompt = {
  id: string
  title: string
  question: string
  result: string
  route: string
}

export type YtfTemplateFeaturePack = {
  id: string
  label: string
  defaultForYtf: boolean
  value: string
}

export const YTF_ENTERPRISE_DATABASES: YtfEnterpriseDatabase[] = [
  {
    id: 'operating-db',
    name: 'Operating database',
    purpose: 'The system-of-record for manager entry, actions, owners, status, daily close, and work history.',
    records: ['daily entries', 'action board items', 'whiteboard captures', 'owner/status updates', 'closeout notes'],
    usedBy: ['Manager', 'Plant Manager', 'Admin'],
    aiUse: 'Turns short manager notes into clean actions, repeat-issue clusters, shift handoff, 5W1H, CAPA, and daily brief drafts.',
    adminSetup: 'Define required fields, dropdowns, departments, machine list, and who can edit owner/status.',
    route: '/app/daily-entry',
  },
  {
    id: 'source-warehouse',
    name: 'Source warehouse',
    purpose: 'Transformed Google Drive, Gmail, chat, uploads, and archive documents with source, plant, owner, and freshness metadata.',
    records: ['Drive source records', 'source-change events', 'Gmail/chat events', 'file lineage', 'Factory Floor / Plant B scope'],
    usedBy: ['Admin', 'Plant Manager', 'AI agents'],
    aiUse: 'Detects changed files, classifies Factory Floor vs Plant B vs shared, finds KPI candidates, and asks humans for missing context.',
    adminSetup: 'Connect folders, assign each lane to Factory Floor, Plant B, or Shared, and set source owner/team.',
    route: '/app/live-data?view=data',
  },
  {
    id: 'knowledge-memory',
    name: 'Knowledge and archive memory',
    purpose: 'Searchable memory for layouts, SOPs, ISO docs, admin files, manuals, supplier docs, and historical archives.',
    records: ['document chunks', 'embeddings', 'entity links', 'SOP evidence', 'layout/admin archive context'],
    usedBy: ['Admin', 'Plant Manager', 'AI agents'],
    aiUse: 'Answers questions with source context, compares new entries against archive knowledge, and drafts SOP/training updates.',
    adminSetup: 'Upload or connect archive folders, label sensitive documents, and mark which roles can search each knowledge lane.',
    route: '/app/live-data?view=data',
  },
  {
    id: 'metric-mart',
    name: 'KPI and feature mart',
    purpose: 'Clean KPI values and feature tables for output, reject, WIP, downtime, defects, stock, sales, finance, and planning.',
    records: ['KPI values', 'daily close rows', 'feature tables', 'trend snapshots', 'role scorecards'],
    usedBy: ['Plant Manager', 'Admin', 'AI agents'],
    aiUse: 'Builds dashboards, trend stories, anomalies, bottleneck hints, and next-best-action suggestions.',
    adminSetup: 'Choose official KPI definitions, units, plant scope, daily cadence, and which manager entry pack feeds each KPI.',
    route: '/app/live-data?view=kpi',
  },
  {
    id: 'template-config',
    name: 'YTF setup controls',
    purpose: 'The Factory Client configuration layer for plants, roles, permissions, source maps, forms, and background jobs.',
    records: ['YTF tenant config', 'module checklist', 'role templates', 'permission matrix', 'plant launch checklist'],
    usedBy: ['Admin'],
    aiUse: 'Suggests the next Factory Client role home, form, record lane, and plant setup task from current usage and missing data.',
    adminSetup: 'Choose which Factory Client modules are active now, staged next, or hidden until the team is ready.',
    route: '/app/platform-admin',
  },
]

export const YTF_ROLE_DATA_ACCESS: YtfRoleDataAccess[] = [
  {
    role: 'Manager',
    account: 'ytf-manager plus future role accounts',
    writes: ['daily entry', 'board photo evidence', 'machine/section note', 'owner/team suggestion', 'status update'],
    reads: ['own team queue', 'today dashboard', 'role KPI cards', 'Plant Manager notes'],
    hidden: ['raw messages', 'raw folder tree', 'admin setup', 'cross-plant confidential files'],
    dailyJob: 'Enter what happened once, attach evidence if useful, and keep the work visible.',
    route: '/app/daily-entry',
  },
  {
    role: 'Plant Manager',
    account: 'ytf-plant-manager',
    writes: ['plant review note', 'owner/status correction', 'Factory Floor/B scope correction', 'daily close story', 'training/SOP follow-up'],
    reads: ['all Factory Floor manager entries', 'Plant B staged signals', 'evidence-backed actions', 'KPI trends', 'repeat issue clusters'],
    hidden: ['system secrets', 'raw connector credentials', 'client-template internals'],
    dailyJob: 'Run the transparent daily check: what is open, who owns it, what changed, and what needs help.',
    route: '/app/plant-manager',
  },
  {
    role: 'Admin',
    account: 'ytf-admin',
    writes: ['users and roles', 'permission rules', 'record lane owners', 'feature checklist', 'data refresh jobs', 'template setup request'],
    reads: ['all source health', 'all role access', 'database health', 'connector status', 'privacy and release checks'],
    hidden: ['other tenant data', 'private secrets in UI', 'manager-only noise by default'],
    dailyJob: 'Keep the platform stable, connected, private, and easier for staff to use.',
    route: '/app/platform-admin',
  },
]

export const YTF_ADMIN_SETUP_PROMPTS: YtfAdminSetupPrompt[] = [
  {
    id: 'source-owner',
    title: 'Classify source lanes',
    question: 'Which folder, email, chat, or archive belongs to Factory Floor, Plant B, or Shared company?',
    result: 'Cleaner dashboards, no mixed plant KPIs, and safer AI context.',
    route: '/app/live-data?view=data',
  },
  {
    id: 'manager-entry-fields',
    title: 'Tune manager entry',
    question: 'What must managers enter every day: output, reject, WIP, downtime, defect, stock, manpower, or issue?',
    result: 'Short forms that feed the operating database and KPI mart.',
    route: '/app/daily-entry',
  },
  {
    id: 'role-access',
    title: 'Set role access',
    question: 'Which data should Manager, Plant Manager, Admin, QC, Maintenance, Sales, and Planning see?',
    result: 'Managers see useful work; Admin sees setup; sensitive source data stays controlled.',
    route: '/app/platform-admin',
  },
  {
    id: 'archive-memory',
    title: 'Load archive knowledge',
    question: 'Which layouts, SOPs, admin files, manuals, historical Excel files, and PDFs should become searchable company evidence?',
    result: 'AI answers and drafts use Factory Client context instead of generic manufacturing advice.',
    route: '/app/live-data?view=data',
  },
  {
    id: 'client-template',
    title: 'Lock Factory Client modules',
    question: 'Which YTF modules should be active now, staged next, or hidden for later?',
    result: 'A cleaner Factory Client module map with fewer confusing pages and better role focus.',
    route: '/app/platform-admin',
  },
]

export const YTF_TEMPLATE_FEATURE_PACKS: YtfTemplateFeaturePack[] = [
  { id: 'production', label: 'Production and daily close', defaultForYtf: true, value: 'Output, reject, WIP, plan vs actual, shift notes.' },
  { id: 'quality', label: 'QMS / ISO / CAPA', defaultForYtf: true, value: 'Defects, claims, containment, 5W1H, fishbone, CAPA, document control.' },
  { id: 'maintenance', label: 'Maintenance and reliability', defaultForYtf: true, value: 'Downtime, asset history, PM, spare blockers, repeat failures.' },
  { id: 'inventory', label: 'Inventory and stock movement', defaultForYtf: true, value: 'Raw material, WIP, finished goods, showroom stock, reorder signals.' },
  { id: 'sales', label: 'Sales / CRM', defaultForYtf: true, value: 'Dealer follow-up, quote, order, delivery promise, collection signal.' },
  { id: 'finance', label: 'Finance and purchasing', defaultForYtf: true, value: 'PO, supplier docs, cash exposure, export, finance packets.' },
  { id: 'hr', label: 'HR / training / attendance', defaultForYtf: false, value: 'Training, skill matrix, OT, attendance, policy acknowledgement.' },
  { id: 'whiteboard-ocr', label: 'Whiteboard and photo extraction', defaultForYtf: true, value: 'Upload section board photos and extract draft KPI rows.' },
  { id: 'supplier-portal', label: 'Supplier/customer portal', defaultForYtf: false, value: 'External status rooms, document requests, delivery and claim follow-up.' },
  { id: 'agent-workforce', label: 'AI agent workforce', defaultForYtf: true, value: 'Background checks, summaries, missing-data prompts, and data cleanup.' },
]
