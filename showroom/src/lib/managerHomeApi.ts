import { loadAdoptionCommandDataset, type AdoptionCommandDataset, type AdoptionRolePack } from './adoptionCommandApi'
import { loadRuntimeControlDataset, type RuntimeControlDataset } from './runtimeControlApi'
import { resolveTenantRoleExperience, type TenantRoleExperience } from './tenantRoleExperience'
import { loadWorkforceRegistry, type WorkforceAssignmentLane, type WorkforceReviewCycle } from './workforceCommandApi'
import { listWorkspaceTasks, type WorkspaceTaskRow } from './workspaceApi'

type ManagerRoleId =
  | 'director'
  | 'tenant_admin'
  | 'plant_manager'
  | 'receiving_clerk'
  | 'procurement_lead'
  | 'finance_controller'
  | 'quality_manager'
  | 'maintenance_lead'
  | 'sales_lead'
  | 'platform_admin'

type Tone = 'stable' | 'watch' | 'attention'

export type ManagerHomeMetric = {
  label: string
  value: string
  detail: string
}

export type ManagerHomeAction = {
  id: string
  title: string
  detail: string
  route: string
  emphasis: 'primary' | 'secondary' | 'attention'
}

export type ManagerHomeSignal = {
  id: string
  label: string
  detail: string
  route: string
  tone: Tone
}

export type ManagerHomeRoutine = {
  id: string
  name: string
  cadence: string
  purpose: string
  script: string
  doneWhen: string
  route: string
}

export type ManagerHomeMethod = {
  id: string
  name: string
  question: string
  measure: string
  route: string
}

export type ManagerHomeModule = {
  id: string
  title: string
  route: string
  detail: string
  status: string
  reason: string
}

export type ManagerHomeSupportTool = {
  id: string
  label: string
  route: string
  detail: string
}

export type ManagerHomeDataset = {
  source: 'seed' | 'live'
  updatedAt: string | null
  experience: TenantRoleExperience
  headline: string
  metrics: ManagerHomeMetric[]
  actions: ManagerHomeAction[]
  signals: ManagerHomeSignal[]
  routines: ManagerHomeRoutine[]
  methods: ManagerHomeMethod[]
  modules: ManagerHomeModule[]
  supportTools: ManagerHomeSupportTool[]
  trainingSequence: string[]
  managerRules: string[]
}

const ROLE_MATCHERS: Record<ManagerRoleId, string[]> = {
  director: ['director', 'ceo', 'owner', 'leadership'],
  tenant_admin: ['tenant admin', 'admin', 'platform'],
  platform_admin: ['platform admin', 'platform'],
  plant_manager: ['plant manager', 'operations', 'plant', 'shift'],
  receiving_clerk: ['receiving clerk', 'receiving', 'inbound'],
  procurement_lead: ['procurement lead', 'procurement', 'supplier', 'buyer'],
  finance_controller: ['finance controller', 'finance', 'controller'],
  quality_manager: ['quality manager', 'quality', 'qc'],
  maintenance_lead: ['maintenance lead', 'maintenance', 'reliability'],
  sales_lead: ['sales lead', 'sales', 'commercial'],
}

const DEFAULT_TRAINING_SEQUENCE = [
  'Start every shift from this home page, not from side chats or private notes.',
  'Open one working desk for the issue, record the fact there, then assign the next owner.',
  'Use the pilot issue log when the system is confusing, missing data, or creates rework.',
  'End the day with one handoff review so the next shift inherits clear owners and due times.',
]

const DEFAULT_MANAGER_RULES = [
  'One issue should have one owner, one due time, and one next step.',
  'Evidence first: link the file, photo, batch, or message before escalating.',
  'Use the portal record as the source of truth; chats are only for notification.',
  'Treat repeated workaround as a system problem that must be logged and fixed.',
]

const SUPPORT_TOOLS: ManagerHomeSupportTool[] = [
  {
    id: 'plant-manager',
    label: 'Plant manager',
    route: '/app/plant-manager',
    detail: 'Open the calm plant-manager layer for review loops, shift control, industrial methods, and teaching packs.',
  },
  {
    id: 'pilot',
    label: 'Pilot issue log',
    route: '/app/pilot',
    detail: 'Record confusion, bugs, and training friction while people are actually using the desk.',
  },
  {
    id: 'adoption',
    label: 'Adoption review',
    route: '/app/adoption-command',
    detail: 'See whether managers and staff are using the portal with the right cadence and writeback quality.',
  },
  {
    id: 'workforce',
    label: 'Workforce command',
    route: '/app/workforce',
    detail: 'Review routines, assignments, core team ownership, and AI coworker coverage.',
  },
  {
    id: 'data-fabric',
    label: 'Data fabric',
    route: '/app/data-fabric',
    detail: 'See data freshness, lineage, learning coverage, and role-specific stories from the source systems.',
  },
]

const ROUTINES_BY_ROLE: Record<ManagerRoleId, ManagerHomeRoutine[]> = {
  director: [
    {
      id: 'director-morning-brief',
      name: 'Morning leadership brief',
      cadence: 'Daily / 15 minutes',
      purpose: 'Reset attention to the few plant, supplier, and commercial issues that actually move the day.',
      script: 'Ask what changed, what is off target, what decision is blocked, and who now owns the next move.',
      doneWhen: 'Every critical gap has a named owner and the next review time is explicit.',
      route: '/app/director',
    },
    {
      id: 'director-approval-review',
      name: 'Decision unblock review',
      cadence: 'Daily / 10 minutes',
      purpose: 'Prevent supplier, cash, or release approvals from silently slowing the plant.',
      script: 'Review the oldest blocked approvals first, then remove only the true blockers.',
      doneWhen: 'No urgent approval is waiting without a decision path.',
      route: '/app/approvals',
    },
    {
      id: 'director-weekly-improvement',
      name: 'Weekly improvement review',
      cadence: 'Weekly',
      purpose: 'Turn repeated exceptions into system fixes, not more managerial chasing.',
      script: 'Choose one repeated failure pattern, confirm the root cause, assign the fix, and verify the measure.',
      doneWhen: 'One repeated failure has a funded, tracked, and owned corrective action.',
      route: '/app/data-fabric',
    },
    {
      id: 'director-adoption',
      name: 'Manager discipline check',
      cadence: 'Weekly',
      purpose: 'Keep the portal as the operating system instead of allowing spreadsheet relapse.',
      script: 'Check which teams are still running side trackers and push them back into the live module.',
      doneWhen: 'Every manager can show the daily review inside the portal.',
      route: '/app/adoption-command',
    },
  ],
  tenant_admin: [
    {
      id: 'admin-live-sources',
      name: 'Source health check',
      cadence: 'Daily',
      purpose: 'Make sure the desks people use are fed by the right sources before asking for more adoption.',
      script: 'Review stale or degraded connectors, then fix source trust before pushing more automation.',
      doneWhen: 'No critical desk is relying on stale or manual-only data without an explicit exception.',
      route: '/app/connectors',
    },
    {
      id: 'admin-role-review',
      name: 'Role and module review',
      cadence: 'Weekly',
      purpose: 'Keep the interface small enough that each role only sees the surfaces it must use.',
      script: 'Remove extra exposure before adding more modules, and keep the default homes role-specific.',
      doneWhen: 'Each role can name its main desk, review cadence, and escalation route.',
      route: '/app/platform-admin',
    },
    {
      id: 'admin-adoption-check',
      name: 'Adoption health review',
      cadence: 'Weekly',
      purpose: 'See where usage, writeback, or review routines are slipping.',
      script: 'Check degraded role packs first, then map the intervention to training, UI, or source quality.',
      doneWhen: 'Every degraded role has an intervention owner and due date.',
      route: '/app/adoption-command',
    },
    {
      id: 'admin-learning-loop',
      name: 'Learning database review',
      cadence: 'Weekly',
      purpose: 'Turn raw records and bug notes into reusable knowledge for the next month of rollout.',
      script: 'Promote repeated bugs, missing fields, and new analysis needs into the knowledge and data backlog.',
      doneWhen: 'The next build list is fed by real usage evidence, not guesswork.',
      route: '/app/data-fabric',
    },
  ],
  platform_admin: [
    {
      id: 'platform-posture',
      name: 'Platform posture review',
      cadence: 'Daily',
      purpose: 'Check routing, runtime, cloud, and tenant control before expanding agent scope.',
      script: 'Review blockers first, then open only the lane needed to remove the risk.',
      doneWhen: 'The control surface shows no unknown critical blocker.',
      route: '/app/workbench',
    },
    {
      id: 'platform-workforce',
      name: 'AI workforce review',
      cadence: 'Weekly',
      purpose: 'Keep ownership, tool scope, and approval gates coherent across teams.',
      script: 'Verify each crew has one mission, one write scope, and a clear review gate.',
      doneWhen: 'Each build lane is traceable to a named crew and release path.',
      route: '/app/workforce',
    },
    {
      id: 'platform-routing',
      name: 'Model routing review',
      cadence: 'Weekly',
      purpose: 'Keep provider choice, security, and workload fit explicit.',
      script: 'Review where the current model contract is overpowered, underpowered, or unverified.',
      doneWhen: 'Routing rules match the actual work and risk posture.',
      route: '/app/model-ops',
    },
    {
      id: 'platform-learnings',
      name: 'Operational learning review',
      cadence: 'Weekly',
      purpose: 'Use field usage and bug data to steer the next build cycle.',
      script: 'Check the issue log, adoption drift, and change lineage before designing the next module.',
      doneWhen: 'The next release is justified by live usage evidence.',
      route: '/app/pilot',
    },
  ],
  plant_manager: [
    {
      id: 'plant-sqdcp',
      name: 'SQDCP start-of-shift review',
      cadence: 'Start of shift / 10 minutes',
      purpose: 'Review safety, quality, delivery, cost, and people with one common plant language.',
      script: 'Ask what changed, what is behind plan, what is abnormal, who owns it, and when it will be reviewed again.',
      doneWhen: 'Every red item is assigned to an owner with a time-bound next step.',
      route: '/app/operations',
    },
    {
      id: 'plant-gemba',
      name: 'Gemba exception capture',
      cadence: 'During shift',
      purpose: 'Record the abnormality where it happens instead of reconstructing it later from memory.',
      script: 'Capture line, lot, time, symptom, containment, and the next owner before moving on.',
      doneWhen: 'The next shift can understand the issue without retelling the story in chat.',
      route: '/app/operations',
    },
    {
      id: 'plant-handoff',
      name: 'End-of-shift handoff',
      cadence: 'End of shift / 10 minutes',
      purpose: 'Stop hidden carryover and make the next shift inherit only clear work.',
      script: 'Review what remains open, what risk remains, and what the next shift must do first.',
      doneWhen: 'No open plant risk is handed over without owner, condition, and due time.',
      route: '/app/actions',
    },
    {
      id: 'plant-bottleneck',
      name: 'Weekly bottleneck review',
      cadence: 'Weekly',
      purpose: 'Attack the real constraint using throughput, WIP, defect, and downtime evidence.',
      script: 'Choose one bottleneck, inspect the data, agree the cause, and assign one improvement experiment.',
      doneWhen: 'One bottleneck has a countermeasure and a measure of success.',
      route: '/app/data-fabric',
    },
  ],
  receiving_clerk: [
    {
      id: 'receiving-dock-check',
      name: 'Dock-to-record capture',
      cadence: 'Per receipt',
      purpose: 'Create one reliable record at the moment the discrepancy is seen.',
      script: 'Capture supplier, PO, batch, shortage or hold reason, and evidence before material moves on.',
      doneWhen: 'The issue can be understood later without asking the clerk again.',
      route: '/app/receiving',
    },
    {
      id: 'receiving-release-loop',
      name: 'Hold and release review',
      cadence: 'Each review cycle',
      purpose: 'Keep blocked material visible until it is released or escalated.',
      script: 'Review the oldest holds first and confirm whether the next step is receiving, procurement, quality, or finance.',
      doneWhen: 'No hold is aging without a named next owner.',
      route: '/app/receiving',
    },
    {
      id: 'receiving-evidence',
      name: 'Evidence discipline check',
      cadence: 'Daily',
      purpose: 'Make sure photos, docs, GRNs, and supplier evidence remain linked to the same case.',
      script: 'Open the oldest discrepancy records and check whether the source evidence is actually attached.',
      doneWhen: 'A reviewer can trace the issue from dock to decision inside one record.',
      route: '/app/documents',
    },
    {
      id: 'receiving-weekly',
      name: 'Weekly discrepancy learning',
      cadence: 'Weekly',
      purpose: 'See which supplier or process failures are repeating at the dock.',
      script: 'Group repeated discrepancy types, then escalate the top pattern into supplier or process action.',
      doneWhen: 'The same receipt problem is not treated as a new surprise every week.',
      route: '/app/pilot',
    },
  ],
  procurement_lead: [
    {
      id: 'procurement-supplier-board',
      name: 'Supplier recovery board',
      cadence: 'Daily',
      purpose: 'Prevent supplier delays, missing COA, and mismatch debt from silently blocking production.',
      script: 'Review aged discrepancy cases first, then assign the supplier and internal next move.',
      doneWhen: 'Every critical supplier case has an owner, contact action, and next review time.',
      route: '/app/approvals',
    },
    {
      id: 'procurement-evidence',
      name: 'Evidence completeness check',
      cadence: 'Daily',
      purpose: 'Keep PO, invoice, COA, and chat evidence on one case before the issue escalates further.',
      script: 'Check whether the case is missing any document that would force rework later.',
      doneWhen: 'No escalation depends on someone hunting inboxes or Drive folders manually.',
      route: '/app/documents',
    },
    {
      id: 'procurement-aging',
      name: 'Approval aging review',
      cadence: 'Daily',
      purpose: 'Stop financial or supplier approvals from becoming silent queue blockers.',
      script: 'Review the oldest approvals first and escalate only the cases that block plant or cash movement.',
      doneWhen: 'Aged approvals are visible and moving, not hidden in email.',
      route: '/app/approvals',
    },
    {
      id: 'procurement-weekly',
      name: 'Weekly supplier pattern review',
      cadence: 'Weekly',
      purpose: 'See which supplier problem types are systemic instead of treating every case individually.',
      script: 'Review the top repeated supplier failure, choose one corrective move, and verify the follow-up metric.',
      doneWhen: 'Supplier recovery work feeds supplier improvement, not just firefighting.',
      route: '/app/data-fabric',
    },
  ],
  finance_controller: [
    {
      id: 'finance-blocker-review',
      name: 'Financial blocker review',
      cadence: 'Daily',
      purpose: 'Resolve the few approvals that truly block release, supply, or cash discipline.',
      script: 'Review aging approvals in order of plant impact and confirm the financial decision path.',
      doneWhen: 'No urgent financial blocker is hidden in a mixed approval queue.',
      route: '/app/approvals',
    },
    {
      id: 'finance-context',
      name: 'Context before decision',
      cadence: 'Daily',
      purpose: 'Make finance decisions with plant, supplier, and customer context visible.',
      script: 'Open the linked operating record before deciding so the financial answer fits the actual risk.',
      doneWhen: 'Approvals are decided with business context, not document fragments alone.',
      route: '/app/director',
    },
    {
      id: 'finance-document-loop',
      name: 'Document trace review',
      cadence: 'Daily',
      purpose: 'Keep invoices, POs, and release evidence tied to the decision record.',
      script: 'Check whether the approval can be audited later from one place.',
      doneWhen: 'Audit trail is complete without asking multiple departments to resend files.',
      route: '/app/documents',
    },
    {
      id: 'finance-weekly',
      name: 'Weekly exposure review',
      cadence: 'Weekly',
      purpose: 'Use queue and case data to see where exposure is forming.',
      script: 'Group delayed approvals, missing documents, and high-risk cases into one weekly review.',
      doneWhen: 'Finance sees early signals rather than only month-end surprises.',
      route: '/app/data-fabric',
    },
  ],
  quality_manager: [
    {
      id: 'quality-containment',
      name: 'Containment first review',
      cadence: 'Each incident',
      purpose: 'Stop spread before root-cause work begins.',
      script: 'Ask what is affected, what is quarantined, what is still moving, and who owns containment.',
      doneWhen: 'Defect spread is controlled before deeper analysis starts.',
      route: '/app/dqms',
    },
    {
      id: 'quality-root-cause',
      name: '5 Why and fishbone review',
      cadence: 'Daily',
      purpose: 'Keep problem solving anchored in process cause rather than blame or guesswork.',
      script: 'Review the top incident, trace cause step by step, then confirm the proof for the cause statement.',
      doneWhen: 'The corrective action addresses the process cause, not just the symptom.',
      route: '/app/dqms',
    },
    {
      id: 'quality-verification',
      name: 'CAPA verification',
      cadence: 'Weekly',
      purpose: 'Confirm that corrective actions actually reduce repeat failures.',
      script: 'Check whether the implemented action changed defect rate, audit result, or release risk.',
      doneWhen: 'CAPA is closed only after effectiveness is demonstrated.',
      route: '/app/dqms',
    },
    {
      id: 'quality-learning',
      name: 'Quality learning review',
      cadence: 'Weekly',
      purpose: 'Turn repeated incidents into standard work, training, and process control.',
      script: 'Review the top repeat issue and decide the one-point lesson, SOP change, or training update needed.',
      doneWhen: 'The same quality issue is less likely next month because knowledge was updated.',
      route: '/app/knowledge',
    },
  ],
  maintenance_lead: [
    {
      id: 'maintenance-response',
      name: 'Downtime first response',
      cadence: 'Each breakdown',
      purpose: 'Restore flow quickly without losing the facts needed for later reliability work.',
      script: 'Capture asset, failure mode, response start, temporary fix, and plant impact immediately.',
      doneWhen: 'A breakdown can be analyzed later without relying on memory.',
      route: '/app/maintenance',
    },
    {
      id: 'maintenance-repeat',
      name: 'Repeat failure review',
      cadence: 'Daily',
      purpose: 'Separate one-off noise from recurring reliability loss.',
      script: 'Review the top repeat event and decide whether the next move is PM, component change, or operating condition change.',
      doneWhen: 'Repeat failures are owned as reliability problems, not normal chaos.',
      route: '/app/maintenance',
    },
    {
      id: 'maintenance-pm',
      name: 'PM compliance review',
      cadence: 'Weekly',
      purpose: 'Protect planned work before urgent breakdowns consume all capacity.',
      script: 'Check overdue PM first, then review which tasks must not slip again.',
      doneWhen: 'Critical PM work is explicit and not silently displaced.',
      route: '/app/maintenance',
    },
    {
      id: 'maintenance-weekly',
      name: 'Reliability pattern review',
      cadence: 'Weekly',
      purpose: 'Use MTBF, MTTR, and downtime Pareto to target the assets that matter most.',
      script: 'Choose one asset family, inspect failure and downtime patterns, then assign a countermeasure.',
      doneWhen: 'Reliability work is aimed at the biggest plant loss, not the loudest complaint.',
      route: '/app/data-fabric',
    },
  ],
  sales_lead: [
    {
      id: 'sales-daily',
      name: 'Daily account review',
      cadence: 'Daily',
      purpose: 'Keep the next customer move visible instead of losing momentum in chat and memory.',
      script: 'Review the accounts that changed, then confirm the next step, owner, and promised date.',
      doneWhen: 'Every active account has one clear next commercial move.',
      route: '/app/revenue',
    },
    {
      id: 'sales-source-check',
      name: 'Lead source health check',
      cadence: 'Daily',
      purpose: 'Make sure website, Gmail, and calendar signals reach the account record.',
      script: 'Check whether any new lead or follow-up is still stranded in inboxes or forms.',
      doneWhen: 'No active commercial signal lives outside the account record.',
      route: '/app/connectors',
    },
    {
      id: 'sales-pipeline',
      name: 'Pipeline discipline review',
      cadence: 'Weekly',
      purpose: 'Keep stages and forecast grounded in actual next steps.',
      script: 'Review aged opportunities first and remove any stage that is not supported by evidence.',
      doneWhen: 'Pipeline stages reflect reality, not optimism.',
      route: '/app/revenue/pipeline',
    },
    {
      id: 'sales-learning',
      name: 'Commercial learning review',
      cadence: 'Weekly',
      purpose: 'Feed the next sales process or product improvement from real account friction and pattern data.',
      script: 'Review lost reasons, repeated objections, and response delays to choose one improvement theme.',
      doneWhen: 'Commercial losses teach the next workflow or product change.',
      route: '/app/data-fabric',
    },
  ],
}

const METHODS_BY_ROLE: Record<ManagerRoleId, ManagerHomeMethod[]> = {
  director: [
    {
      id: 'director-risk',
      name: 'Risk triage',
      question: 'Which problem will hurt the plant, cash, or customer most if we leave it alone today?',
      measure: 'Critical blockers and aged approvals',
      route: '/app/director',
    },
    {
      id: 'director-portfolio',
      name: 'Intervention focus',
      question: 'What one intervention removes the most friction instead of creating more meetings?',
      measure: 'Blocked queue and repeat exceptions',
      route: '/app/workbench',
    },
    {
      id: 'director-learning',
      name: 'Learning loop',
      question: 'Which repeated failure should become a system fix this week?',
      measure: 'Repeat bug, approval, or quality patterns',
      route: '/app/pilot',
    },
    {
      id: 'director-story',
      name: 'Role-based storytelling',
      question: 'Can every manager see the same truth translated for their desk and review cadence?',
      measure: 'Role adoption and data-fabric freshness',
      route: '/app/data-fabric',
    },
  ],
  tenant_admin: [
    {
      id: 'admin-scope',
      name: 'Role scope control',
      question: 'Does each role see only the few modules it must use every day?',
      measure: 'Role home, visible modules, side-tracker count',
      route: '/app/platform-admin',
    },
    {
      id: 'admin-source-trust',
      name: 'Source trust',
      question: 'Are the live desks fed by trustworthy source data or by manual patching?',
      measure: 'Connector attention and stale-source count',
      route: '/app/connectors',
    },
    {
      id: 'admin-adoption',
      name: 'Adoption systems thinking',
      question: 'Is the team failing because of discipline, design, or missing data?',
      measure: 'Role-pack score and writeback quality',
      route: '/app/adoption-command',
    },
    {
      id: 'admin-knowledge',
      name: 'Operational memory',
      question: 'Are repeated problems becoming reusable knowledge for the next build?',
      measure: 'Learning database and bug-loop evidence',
      route: '/app/data-fabric',
    },
  ],
  platform_admin: [
    {
      id: 'platform-routing',
      name: 'Routing fit',
      question: 'Does each workload have the right model, tool scope, and review gate?',
      measure: 'Routing profile health',
      route: '/app/model-ops',
    },
    {
      id: 'platform-runtime',
      name: 'Runtime truth',
      question: 'Is the runtime controlled by live evidence or by assumptions?',
      measure: 'Connector events and control-surface blockers',
      route: '/app/runtime',
    },
    {
      id: 'platform-release',
      name: 'Release discipline',
      question: 'What should ship now versus stay in the build system?',
      measure: 'Foundry gates and workbench priorities',
      route: '/app/foundry',
    },
    {
      id: 'platform-adoption',
      name: 'Operator reality',
      question: 'Do the factory-facing screens still feel simple enough for daily use?',
      measure: 'Pilot bugs, training friction, and role use',
      route: '/app/pilot',
    },
  ],
  plant_manager: [
    {
      id: 'plant-bottleneck',
      name: 'Bottleneck focus',
      question: 'Which process step is limiting throughput right now?',
      measure: 'Output loss, downtime, WIP, and blocked lots',
      route: '/app/operations',
    },
    {
      id: 'plant-plan-vs-actual',
      name: 'Plan versus actual',
      question: 'Where is the shift off plan, and is the cause quality, machine, material, or manpower?',
      measure: 'Shift attainment and open blockers',
      route: '/app/actions',
    },
    {
      id: 'plant-fpy',
      name: 'First-pass yield',
      question: 'Where did rework or defect start, and what process condition changed?',
      measure: 'B+R, incident trend, and containment load',
      route: '/app/dqms',
    },
    {
      id: 'plant-smed',
      name: 'Changeover discipline',
      question: 'What setup or handoff loss keeps repeating between products or shifts?',
      measure: 'Lost time per changeover and delayed start',
      route: '/app/data-fabric',
    },
  ],
  receiving_clerk: [
    {
      id: 'receiving-dock-to-stock',
      name: 'Dock-to-stock flow',
      question: 'How long does material wait before the record and release decision are complete?',
      measure: 'Receipt aging and hold count',
      route: '/app/receiving',
    },
    {
      id: 'receiving-grn',
      name: 'GRN discrepancy control',
      question: 'What discrepancy types create the most rework at receipt?',
      measure: 'Shortage, mismatch, and hold cases',
      route: '/app/receiving',
    },
    {
      id: 'receiving-traceability',
      name: 'Batch traceability',
      question: 'Can every held or accepted batch be traced later without rework?',
      measure: 'Evidence completeness and batch linkage',
      route: '/app/documents',
    },
    {
      id: 'receiving-learning',
      name: 'Supplier receiving patterns',
      question: 'Which supplier or document problem is repeating enough to escalate structurally?',
      measure: 'Repeat discrepancy patterns',
      route: '/app/data-fabric',
    },
  ],
  procurement_lead: [
    {
      id: 'procurement-otif',
      name: 'Supplier reliability',
      question: 'Which supplier issue is now affecting release, lead time, or plant stability?',
      measure: 'Aged cases and repeated supplier failures',
      route: '/app/approvals',
    },
    {
      id: 'procurement-evidence',
      name: 'Evidence completeness',
      question: 'What missing document or proof keeps forcing rework in the recovery loop?',
      measure: 'Missing COA, invoice, PO, or shipment proof',
      route: '/app/documents',
    },
    {
      id: 'procurement-aging',
      name: 'Case aging',
      question: 'Which supplier cases are sitting without a next action?',
      measure: 'Open aging and stalled review loops',
      route: '/app/approvals',
    },
    {
      id: 'procurement-prevention',
      name: 'Prevention over chasing',
      question: 'What one preventive move will remove the top repeated supplier issue?',
      measure: 'Repeat pattern count and closure effectiveness',
      route: '/app/data-fabric',
    },
  ],
  finance_controller: [
    {
      id: 'finance-aging',
      name: 'Aging approvals',
      question: 'Which unresolved approval now creates the biggest business exposure?',
      measure: 'Approval aging and blocked release value',
      route: '/app/approvals',
    },
    {
      id: 'finance-context',
      name: 'Operating context',
      question: 'What plant or supplier consequence follows this finance decision?',
      measure: 'Linked case context and director priorities',
      route: '/app/director',
    },
    {
      id: 'finance-trace',
      name: 'Traceable decisions',
      question: 'Can this approval be audited later from one record?',
      measure: 'Document completeness and linked evidence',
      route: '/app/documents',
    },
    {
      id: 'finance-patterns',
      name: 'Exposure patterns',
      question: 'What approval or evidence pattern is creating recurring financial risk?',
      measure: 'Weekly repeated cases',
      route: '/app/data-fabric',
    },
  ],
  quality_manager: [
    {
      id: 'quality-pareto',
      name: 'Defect Pareto',
      question: 'Which defect family is causing the largest loss and must be reviewed first?',
      measure: 'Incident and CAPA trend',
      route: '/app/dqms',
    },
    {
      id: 'quality-fpy',
      name: 'First-pass yield',
      question: 'Where is the process losing good units before release?',
      measure: 'B+R, scrap, and repeat incident count',
      route: '/app/dqms',
    },
    {
      id: 'quality-root-cause',
      name: 'Structured root cause',
      question: 'Have we proven the process cause with evidence or only described the symptom?',
      measure: '5 Why quality and CAPA effectiveness',
      route: '/app/knowledge',
    },
    {
      id: 'quality-release',
      name: 'Containment discipline',
      question: 'Is the suspect material physically and digitally controlled until release?',
      measure: 'Open holds and containment aging',
      route: '/app/operations',
    },
  ],
  maintenance_lead: [
    {
      id: 'maintenance-mtbf',
      name: 'MTBF and MTTR',
      question: 'Which asset family is generating the most reliability loss?',
      measure: 'Downtime, repeat failure, MTBF, and MTTR',
      route: '/app/maintenance',
    },
    {
      id: 'maintenance-pm',
      name: 'PM protection',
      question: 'Which preventive task is at risk of being displaced by reactive work again?',
      measure: 'Overdue PM and breakdown pressure',
      route: '/app/maintenance',
    },
    {
      id: 'maintenance-spares',
      name: 'Spare criticality',
      question: 'What missing spare or support item is prolonging downtime?',
      measure: 'Waiting time inside breakdown cases',
      route: '/app/actions',
    },
    {
      id: 'maintenance-operations',
      name: 'Plant impact',
      question: 'Where is machine loss becoming output loss or quality risk for the plant?',
      measure: 'Linked plant blocker and defect impact',
      route: '/app/operations',
    },
  ],
  sales_lead: [
    {
      id: 'sales-stage-discipline',
      name: 'Stage discipline',
      question: 'Which account is overstated in stage versus the real next step?',
      measure: 'Aged deals and missing next actions',
      route: '/app/revenue/pipeline',
    },
    {
      id: 'sales-response',
      name: 'Response discipline',
      question: 'Where is lead response or quote follow-up slipping?',
      measure: 'New lead aging and follow-up delay',
      route: '/app/revenue',
    },
    {
      id: 'sales-source-mesh',
      name: 'Source mesh',
      question: 'Are website, Gmail, and calendar signals landing on the same account record?',
      measure: 'Connector freshness and orphaned signals',
      route: '/app/connectors',
    },
    {
      id: 'sales-learning',
      name: 'Commercial learning',
      question: 'What objection, delay, or loss pattern should shape the next sales workflow?',
      measure: 'Lost reasons and repeated friction',
      route: '/app/data-fabric',
    },
  ],
}

function asLower(value: string) {
  return value.trim().toLowerCase()
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.id || seen.has(row.id)) {
      return false
    }
    seen.add(row.id)
    return true
  })
}

function isAttentionStatus(value: string) {
  const normalized = asLower(value)
  return normalized === 'warning' || normalized === 'degraded' || normalized === 'needs wiring' || normalized === 'open' || normalized === 'review'
}

function isOpenTaskStatus(value: string) {
  const normalized = asLower(value)
  return normalized !== 'done' && normalized !== 'closed' && normalized !== 'cancelled' && normalized !== 'resolved'
}

function toneFromStatus(value: string): Tone {
  if (isAttentionStatus(value)) {
    return value.trim().toLowerCase() === 'warning' || value.trim().toLowerCase() === 'review' ? 'watch' : 'attention'
  }
  return 'stable'
}

function routeBelongsToExperience(route: string, experience: TenantRoleExperience) {
  const routes = new Set<string>(['/app/actions', '/app/pilot', experience.defaultHome, ...experience.sections.map((section) => section.route)])
  return routes.has(route)
}

function matchesRoleText(value: string, canonicalRole: string) {
  const aliases = ROLE_MATCHERS[(canonicalRole as ManagerRoleId) || 'plant_manager'] ?? ROLE_MATCHERS.plant_manager
  const normalized = asLower(value)
  return aliases.some((alias) => normalized.includes(alias))
}

function matchesAssignment(assignment: WorkforceAssignmentLane, experience: TenantRoleExperience) {
  return (
    routeBelongsToExperience(assignment.route, experience) ||
    matchesRoleText(assignment.currentOwner, experience.canonicalRole) ||
    matchesRoleText(assignment.suggestedOwner, experience.canonicalRole) ||
    matchesRoleText(assignment.suggestedRole, experience.canonicalRole)
  )
}

function matchesReviewCycle(reviewCycle: WorkforceReviewCycle, experience: TenantRoleExperience) {
  return routeBelongsToExperience(reviewCycle.route, experience) || matchesRoleText(reviewCycle.ownerRole, experience.canonicalRole)
}

function normalizeRolePack(experience: TenantRoleExperience, adoption: AdoptionCommandDataset) {
  return (
    adoption.rolePacks.find((pack) => matchesRoleText(pack.role, experience.canonicalRole) || routeBelongsToExperience(pack.route, experience)) ??
    adoption.rolePacks.find((pack) => routeBelongsToExperience(pack.route, experience)) ??
    null
  )
}

function buildReadinessLabel(rolePack: AdoptionRolePack | null, connectorAttentionCount: number, reviewPressure: number) {
  const score = Math.max(35, Math.min(98, Math.round((rolePack?.adoptionScore ?? 62) - connectorAttentionCount * 4 - reviewPressure * 2)))
  if (score >= 82) {
    return { value: `${score}%`, detail: 'Stable enough to run the routine and improve one issue at a time.' }
  }
  if (score >= 65) {
    return { value: `${score}%`, detail: 'Usable, but the manager should tighten review discipline and source trust today.' }
  }
  return { value: `${score}%`, detail: 'Needs intervention: simplify the flow, coach the team, and remove one blocker now.' }
}

function buildTaskSignal(rows: WorkspaceTaskRow[]) {
  const openRows = rows.filter((row) => isOpenTaskStatus(row.status))
  return {
    count: openRows.length,
    detail: openRows.length ? `${openRows.length} open follow-up task${openRows.length === 1 ? '' : 's'} still need closure.` : 'No open follow-up tasks are waiting in the current workspace.',
  }
}

function buildSignals(
  rolePack: AdoptionRolePack | null,
  assignments: WorkforceAssignmentLane[],
  reviews: WorkforceReviewCycle[],
  runtime: RuntimeControlDataset,
  openTaskCount: number,
) {
  const signals: ManagerHomeSignal[] = []

  if (rolePack) {
    signals.push({
      id: 'role-pack',
      label: `Role readiness: ${rolePack.status}`,
      detail: rolePack.blockers.length ? rolePack.blockers.slice(0, 2).join(' ') : rolePack.nextEscalation,
      route: rolePack.route,
      tone: toneFromStatus(rolePack.status),
    })
  }

  if (assignments[0]) {
    signals.push({
      id: `assignment-${assignments[0].id}`,
      label: assignments[0].title,
      detail: assignments[0].nextAction || assignments[0].reason,
      route: assignments[0].route,
      tone: toneFromStatus(assignments[0].status || assignments[0].priority),
    })
  }

  if (reviews[0]) {
    signals.push({
      id: `review-${reviews[0].id}`,
      label: `${reviews[0].name} review`,
      detail: reviews[0].queueCount > 0 ? `${reviews[0].queueCount} queued item${reviews[0].queueCount === 1 ? '' : 's'} need review.` : reviews[0].nextMove,
      route: reviews[0].route,
      tone: reviews[0].queueCount > 0 ? 'attention' : toneFromStatus(reviews[0].status),
    })
  }

  const topConnector = runtime.connectors.find((connector) => isAttentionStatus(connector.status))
  if (topConnector) {
    signals.push({
      id: `connector-${topConnector.id}`,
      label: `${topConnector.name} needs attention`,
      detail: `${topConnector.freshness}. ${topConnector.nextAutomation}`,
      route: '/app/connectors',
      tone: toneFromStatus(topConnector.status),
    })
  }

  signals.push({
    id: 'follow-up-count',
    label: 'Follow-up backlog',
    detail: openTaskCount > 0 ? `${openTaskCount} open follow-up task${openTaskCount === 1 ? '' : 's'} remain in the workspace.` : 'The current workspace has no open follow-up backlog.',
    route: '/app/actions',
    tone: openTaskCount > 4 ? 'attention' : openTaskCount > 0 ? 'watch' : 'stable',
  })

  return uniqueById(signals).slice(0, 5)
}

function buildActions(
  experience: TenantRoleExperience,
  assignments: WorkforceAssignmentLane[],
  reviews: WorkforceReviewCycle[],
  openTaskCount: number,
): ManagerHomeAction[] {
  const mainSection = experience.sections[0] ?? {
    title: experience.title,
    route: experience.defaultHome,
    detail: experience.mission,
  }

  const actions: ManagerHomeAction[] = [
    {
      id: 'main-desk',
      title: `Open ${mainSection.title}`,
      detail: mainSection.detail,
      route: mainSection.route,
      emphasis: 'primary',
    },
    {
      id: 'queue',
      title: 'Open team queue',
      detail: openTaskCount > 0 ? `${openTaskCount} open follow-up task${openTaskCount === 1 ? '' : 's'} need closure or reassignment.` : 'Use the queue to keep the next owned action explicit.',
      route: '/app/actions',
      emphasis: 'secondary',
    },
    {
      id: 'pilot-log',
      title: 'Record friction or bug',
      detail: 'Use the pilot issue log whenever staff are confused, forced into workaround, or missing a field.',
      route: '/app/pilot',
      emphasis: 'attention',
    },
  ]

  if (assignments[0]) {
    actions.splice(1, 0, {
      id: `assignment-${assignments[0].id}`,
      title: assignments[0].title,
      detail: assignments[0].nextAction || assignments[0].reason,
      route: assignments[0].route,
      emphasis: assignments[0].priority.toLowerCase() === 'high' ? 'attention' : 'secondary',
    })
  }

  if (reviews[0]) {
    actions.splice(2, 0, {
      id: `review-${reviews[0].id}`,
      title: `Run ${reviews[0].name}`,
      detail: reviews[0].queueCount > 0 ? `${reviews[0].queueCount} queued item${reviews[0].queueCount === 1 ? '' : 's'} need review.` : reviews[0].nextMove,
      route: reviews[0].route,
      emphasis: reviews[0].queueCount > 0 ? 'attention' : 'secondary',
    })
  }

  return uniqueById(actions).slice(0, 5)
}

function buildModules(
  experience: TenantRoleExperience,
  assignments: WorkforceAssignmentLane[],
  reviews: WorkforceReviewCycle[],
  rolePack: AdoptionRolePack | null,
) {
  return experience.sections.slice(0, 4).map((section) => {
    const assignmentCount = assignments.filter((item) => item.route === section.route).length
    const reviewCount = reviews.filter((item) => item.route === section.route).length
    const status =
      assignmentCount > 0
        ? `${assignmentCount} live action${assignmentCount === 1 ? '' : 's'}`
        : reviewCount > 0
          ? `${reviewCount} review loop${reviewCount === 1 ? '' : 's'}`
          : rolePack && rolePack.route === section.route
            ? rolePack.status
            : 'Use when needed'

    const reason =
      assignmentCount > 0
        ? 'This desk already has live action pressure and should be reviewed first.'
        : reviewCount > 0
          ? 'This desk carries a scheduled review loop and should anchor manager discipline.'
          : 'Keep this desk in the role routine, but only after the current issues are under control.'

    return {
      id: `${section.route}-${section.title}`,
      title: section.title,
      route: section.route,
      detail: section.detail,
      status,
      reason,
    }
  })
}

export async function loadManagerHomeDataset(tenantKey: string, role?: string | null): Promise<ManagerHomeDataset> {
  const experience = resolveTenantRoleExperience(tenantKey as never, role)
  const canonicalRole = (experience.canonicalRole as ManagerRoleId) || 'plant_manager'

  const [adoption, workforce, runtime, taskPayload] = await Promise.all([
    loadAdoptionCommandDataset(),
    loadWorkforceRegistry(),
    loadRuntimeControlDataset(),
    listWorkspaceTasks(undefined, 200).catch(() => ({ rows: [] as WorkspaceTaskRow[] })),
  ])

  const assignments = workforce.live.assignmentBoard.filter((assignment) => matchesAssignment(assignment, experience))
  const reviews = workforce.live.reviewCycles.filter((review) => matchesReviewCycle(review, experience))
  const rolePack = normalizeRolePack(experience, adoption)
  const taskSignal = buildTaskSignal(taskPayload.rows ?? [])
  const connectorAttentionCount = runtime.connectors.filter((connector) => isAttentionStatus(connector.status)).length
  const readiness = buildReadinessLabel(rolePack, connectorAttentionCount, reviews.reduce((sum, review) => sum + review.queueCount, 0))
  const source: 'seed' | 'live' = adoption.source === 'live' || runtime.source === 'live' ? 'live' : 'seed'

  return {
    source,
    updatedAt: workforce.updatedAt ?? adoption.updatedAt ?? runtime.updatedAt,
    experience,
    headline: `${experience.title} should start from one calm screen: what changed, what to do now, and how to coach the team.`,
    metrics: [
      {
        label: 'Role readiness',
        value: readiness.value,
        detail: readiness.detail,
      },
      {
        label: 'Open follow-up',
        value: String(taskSignal.count),
        detail: taskSignal.detail,
      },
      {
        label: 'Review loops',
        value: String(reviews.length),
        detail: reviews.length ? `${reviews.length} live review loop${reviews.length === 1 ? '' : 's'} match this role.` : 'No role-specific review loops are mapped yet.',
      },
      {
        label: 'Source attention',
        value: String(connectorAttentionCount),
        detail: connectorAttentionCount ? 'Some source lanes need trust or freshness review before relying on them.' : 'No connector attention signal is currently active.',
      },
    ],
    actions: buildActions(experience, assignments, reviews, taskSignal.count),
    signals: buildSignals(rolePack, assignments, reviews, runtime, taskSignal.count),
    routines: ROUTINES_BY_ROLE[canonicalRole] ?? ROUTINES_BY_ROLE.plant_manager,
    methods: METHODS_BY_ROLE[canonicalRole] ?? METHODS_BY_ROLE.plant_manager,
    modules: buildModules(experience, assignments, reviews, rolePack),
    supportTools: SUPPORT_TOOLS,
    trainingSequence: DEFAULT_TRAINING_SEQUENCE,
    managerRules: DEFAULT_MANAGER_RULES,
  }
}
