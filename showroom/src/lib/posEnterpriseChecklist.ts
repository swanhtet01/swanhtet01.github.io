import type { PosBusinessType } from './posAuth'

export type PosEnterpriseReadinessStatus = 'live' | 'build' | 'missing'

export type PosEnterpriseReadinessItem = {
  id: string
  control: string
  status: PosEnterpriseReadinessStatus
  owner: string
  detail: string
}

type PosEnterpriseReadinessSummary = {
  live: number
  build: number
  missing: number
}

const BASE_CHECKLIST: PosEnterpriseReadinessItem[] = [
  {
    id: 'role-permissions',
    control: 'Role permissions with manager override',
    status: 'live',
    owner: 'Owner',
    detail: 'Role-based module access and manager override PIN flow are active.',
  },
  {
    id: 'day-pack-export',
    control: 'Daily proof export (Excel + JSON)',
    status: 'live',
    owner: 'Manager',
    detail: 'Day pack export supports summary, queue, payments, closeout, setup, and audit trail.',
  },
  {
    id: 'multi-location-scope',
    control: 'Multi-location workspace isolation',
    status: 'live',
    owner: 'Platform admin',
    detail: 'Location-specific workspace keys isolate records across branches and business packs.',
  },
  {
    id: 'closeout-approval',
    control: 'Closeout approval queue',
    status: 'live',
    owner: 'Owner / manager',
    detail: 'Closeout sign-off and sensitive actions route through approval records.',
  },
  {
    id: 'manual-payment-invoice-kit',
    control: 'Manual payment, invoice, and normal printer kit',
    status: 'live',
    owner: 'Owner / cashier',
    detail: 'Go-live kit supports cash, wallet/bank proof, invoice JSON, browser invoice/receipt printing, and normal installed printer tests.',
  },
  {
    id: 'backup-restore-drill',
    control: 'Backup export and restore drill',
    status: 'build',
    owner: 'Platform admin',
    detail: 'Workspace backup export and restore-file validation are active; paid production still needs automated cloud backup, restore rehearsal, and retention policy.',
  },
  {
    id: 'offline-capture',
    control: 'Offline-safe local capture',
    status: 'build',
    owner: 'Platform admin',
    detail: 'Offline guardrail controls, reconnect deadline, and queue lock policy are active; add conflict-resolution rules for multi-device sync before production rollout.',
  },
  {
    id: 'staff-directory',
    control: 'Staff directory and PIN lifecycle',
    status: 'build',
    owner: 'Owner / operations lead',
    detail: 'Roster, PIN rotation, role/location assignment, and suspend/reactivate controls exist; add backend identity sync before full production.',
  },
  {
    id: 'sales-admin-client-registry',
    control: 'Sales admin client registry and role-template handoff',
    status: 'build',
    owner: 'Revenue ops',
    detail: 'Client onboarding registry, stage updates, and role-template mapping are available locally; add backend tenancy sync and audit trail.',
  },
  {
    id: 'permission-drift-audit',
    control: 'Permission drift audit',
    status: 'build',
    owner: 'Security admin',
    detail: 'Track policy-to-runtime permission drift and force remediation before new deployment packs are marked ready.',
  },
  {
    id: 'incident-timeline-pack',
    control: 'Support incident packet',
    status: 'live',
    owner: 'Ops owner',
    detail: 'Go-live kit exports severity, category, workspace, sync state, payment policy, printer policy, and next response action into one support JSON packet.',
  },
  {
    id: 'scheduled-owner-brief-pack',
    control: 'Scheduled owner brief and export pack',
    status: 'build',
    owner: 'Platform admin',
    detail: 'Daily pack exports and AI-native brief exist on demand; add scheduler and signed delivery channel before enterprise rollout.',
  },
  {
    id: 'gift-card-loyalty-runtime',
    control: 'Gift card + loyalty runtime with redemption audit',
    status: 'missing',
    owner: 'Product + revenue ops',
    detail: 'Add stored-value tender flow, loyalty points redemption, and per-transaction reward evidence in closeout packs.',
  },
  {
    id: 'hardware-health-monitoring',
    control: 'Hardware and device health monitoring',
    status: 'build',
    owner: 'Platform admin',
    detail: 'Browser print tests are active for normal printers; direct thermal printing, scanners, cash drawer kicks, and card terminals still need provider/device integration.',
  },
  {
    id: 'tax-fee-policy-pack',
    control: 'Tax, service-charge, and discount policy pack',
    status: 'build',
    owner: 'Finance owner',
    detail: 'Version tax/service-fee rules by location and enforce manager review when policies are changed mid-shift.',
  },
  {
    id: 'labor-time-clock-pack',
    control: 'Labor clock and shift-cost export pack',
    status: 'missing',
    owner: 'Operations lead',
    detail: 'Add staff clock-in/out, break records, and labor-cost export linked to closeout and approval evidence.',
  },
  {
    id: 'omnichannel-order-lane',
    control: 'Omnichannel order and pickup reconciliation lane',
    status: 'missing',
    owner: 'Product owner',
    detail: 'Merge web/delivery/pickup orders with in-store queues and enforce proof-backed handoff before closeout.',
  },
]

const BUSINESS_ADDITIONS: Record<PosBusinessType, PosEnterpriseReadinessItem[]> = {
  restaurant: [
    {
      id: 'void-reasons-policy',
      control: 'Void/refund reason policy',
      status: 'build',
      owner: 'Manager',
      detail: 'Enforce reason codes on void/refund actions and include them in closeout reports.',
    },
    {
      id: 'kitchen-device-assignment',
      control: 'Kitchen/table device assignment',
      status: 'build',
      owner: 'Ops lead',
      detail: 'Station/device mapping is active for table and kitchen lanes; next step is staff identity enforcement and hardware health monitoring.',
    },
    {
      id: 'tip-recovery-lock',
      control: 'Tip recovery and shift review lock',
      status: 'build',
      owner: 'Cash-up owner',
      detail: 'Pending tip recovery queue and shift review lock/unlock flow are active; next step is backend settlement auto-recovery.',
    },
    {
      id: 'menu-daypart-schedule',
      control: 'Menu daypart scheduling',
      status: 'build',
      owner: 'Manager',
      detail: 'Scheduled menu windows and manager override toggles are active; next step is auto-activation events and publish audit webhooks.',
    },
  ],
  spa: [
    {
      id: 'appointment-no-show-policy',
      control: 'Deposit and no-show policy automation',
      status: 'build',
      owner: 'Front desk lead',
      detail: 'Automate deposit checks, no-show flags, and recovery actions for rebooking.',
    },
    {
      id: 'provider-utilization-report',
      control: 'Provider utilization and payout proof',
      status: 'missing',
      owner: 'Owner',
      detail: 'Track per-provider utilization, package usage, and payout-ready evidence.',
    },
  ],
  retail: [
    {
      id: 'location-transfer-queue',
      control: 'Inter-location inventory transfer queue',
      status: 'build',
      owner: 'Inventory lead',
      detail: 'Transfer request-dispatch-receive-variance flow is active in POS; add backend receiving enforcement before production.',
    },
    {
      id: 'return-policy-enforcement',
      control: 'Return policy and approval enforcement',
      status: 'build',
      owner: 'Store manager',
      detail: 'Enforce policy windows, reason codes, and manager approval for high-risk returns.',
    },
  ],
}

export function getPosEnterpriseReadinessChecklist(businessType: PosBusinessType) {
  return [...BASE_CHECKLIST, ...(BUSINESS_ADDITIONS[businessType] || [])]
}

export function getPosEnterpriseReadinessSummary(items: PosEnterpriseReadinessItem[]): PosEnterpriseReadinessSummary {
  return items.reduce<PosEnterpriseReadinessSummary>(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { live: 0, build: 0, missing: 0 },
  )
}
