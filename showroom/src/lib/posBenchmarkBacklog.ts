import type { PosBusinessType } from './posAuth'

export type PosBenchmarkStatus = 'live' | 'build' | 'missing'

export type PosBenchmarkItem = {
  id: string
  benchmark: string
  source: string
  status: PosBenchmarkStatus
  action: string
}

const SHARED_BENCHMARKS: PosBenchmarkItem[] = [
  {
    id: 'square-passcodes',
    benchmark: 'Personal passcodes and permission sets',
    source: 'Square POS',
    status: 'build',
    action: 'Move from demo account PINs to staff-linked PIN validation against backend identities.',
  },
  {
    id: 'square-personal-passcode-audit',
    benchmark: 'Per-user passcode attribution for shift, sales, and actions',
    source: 'Square Support: Require passcodes at point of sale',
    status: 'build',
    action: 'Require personal passcode logins (not shared passcodes) for every privileged action so audits map to exact staff identity.',
  },
  {
    id: 'lightspeed-auto-signout-delay',
    benchmark: 'Shared terminal auto sign-out delay policy',
    source: 'Lightspeed Retail (R-Series) employee roles',
    status: 'build',
    action: 'Enforce configurable inactivity auto-lock per role and include override evidence for owner/manager unlock actions.',
  },
  {
    id: 'odoo-multi-employee',
    benchmark: 'Multi-employee session switching',
    source: 'Odoo POS',
    status: 'build',
    action: 'Add quick switch for authorized staff on shared terminal without re-entering global account credentials.',
  },
  {
    id: 'square-offline-guardrails',
    benchmark: 'Offline payment guardrails with reconnect deadline and pending queue',
    source: 'Square POS',
    status: 'build',
    action: 'Add explicit reconnect countdown, pending upload queue warnings, and lock dangerous actions while offline.',
  },
  {
    id: 'square-offline-expiry-windows',
    benchmark: 'Offline payment expiry windows by device profile',
    source: 'Square Support: Offline payments',
    status: 'build',
    action: 'Track 24h and 72h expiry windows in the sync lane and block closeout when expiry risk is high.',
  },
  {
    id: 'square-offline-session-protection',
    benchmark: 'Offline pending-payment protection against sign-out/location-switch',
    source: 'Square Support: Offline payments',
    status: 'build',
    action: 'Block role switch, workspace switch, and logout while pending offline uploads exist, unless owner override is captured.',
  },
  {
    id: 'square-offline-payments-visibility',
    benchmark: 'Explicit pending offline payment queue view in POS runtime',
    source: 'Square Support: View offline payments',
    status: 'build',
    action: 'Add dedicated offline-payments list by terminal with age, expiry risk, and required reconnect action before closeout.',
  },
  {
    id: 'square-offline-mode-permission-policy',
    benchmark: 'Offline mode enable policy by role and device mode',
    source: 'Square Support: Process offline payments',
    status: 'build',
    action: 'Require owner or manager permission to enable offline mode and attach policy evidence per terminal profile before shift start.',
  },
  {
    id: 'lightspeed-custom-roles',
    benchmark: 'Custom role permissions by business policy',
    source: 'Lightspeed Retail (X-Series)',
    status: 'build',
    action: 'Extend seeded roles with custom role templates so each client can enable fine-grained permissions.',
  },
  {
    id: 'shopify-pos-role-templates',
    benchmark: 'Role templates with scoped POS access per staff type',
    source: 'Shopify POS',
    status: 'build',
    action: 'Add reusable role templates for owner, manager, counter, and service lanes with explicit grant/revoke toggles.',
  },
  {
    id: 'shopify-manager-approval-pin',
    benchmark: 'Manager PIN approval for sensitive checkout and return actions',
    source: 'Shopify POS permissions',
    status: 'build',
    action: 'Map approval-required actions to a manager PIN event log and keep approval evidence inside the day-close pack.',
  },
  {
    id: 'shopify-manage-transfers-permission',
    benchmark: 'Permission-gated transfer fulfill/receive from POS',
    source: 'Shopify POS permissions',
    status: 'build',
    action: 'Enforce role policy for transfer fulfill and receive actions so unauthorized roles cannot complete stock movement.',
  },
  {
    id: 'shopify-staff-permissions',
    benchmark: 'Staff permissions managed centrally then applied to POS',
    source: 'Shopify Staff Permissions',
    status: 'build',
    action: 'Sync role templates to tenant policy and block local drift between configured permissions and active terminal access.',
  },
  {
    id: 'shopify-location-assignment',
    benchmark: 'Location-scoped staff access policy',
    source: 'Shopify POS staff management',
    status: 'build',
    action: 'Enforce location assignments per staff profile and block unauthorized location sign-in from shared terminals.',
  },
  {
    id: 'shopify-offline-checkout-permissions',
    benchmark: 'Offline checkout permissions with manager approval',
    source: 'Shopify POS offline checkout',
    status: 'build',
    action: 'Require manager-approved offline mode switch and store the approval event with reconnect proof before closeout.',
  },
  {
    id: 'stripe-terminal-offline-configuration',
    benchmark: 'Terminal offline mode configured by location and reader policy',
    source: 'Stripe Terminal offline mode + configurations',
    status: 'build',
    action: 'Add per-location offline payment policy and reader config evidence so reconnect behavior and queue expiry are controlled centrally.',
  },
  {
    id: 'shopify-inventory-transfer-flow',
    benchmark: 'Inventory transfer and receiving lifecycle between locations',
    source: 'Shopify POS',
    status: 'build',
    action: 'Transfer request/dispatch/receive/variance flow is live in POS; next step is backend sync and transfer SLA alerts.',
  },
  {
    id: 'shopify-pos-transfer-fulfill-receive',
    benchmark: 'Transfer fulfillment + receiving directly from POS device',
    source: 'Shopify POS (Help Center + Changelog)',
    status: 'build',
    action: 'Complete tenant-grade POS transfer flow with scan confirmation, in-transit state, and receiving completion proof.',
  },
  {
    id: 'shopify-transfer-packing-slip-proof',
    benchmark: 'Transfer packing slip + scan confirmation for shipments',
    source: 'Shopify POS transfer workflow',
    status: 'missing',
    action: 'Add outgoing transfer packing-slip export and receiving scan proof so dispatch and receive counts can be audited by shipment.',
  },
  {
    id: 'toast-offline-shift-review',
    benchmark: 'Offline shift-review safeguards with pending tips tracking',
    source: 'Toast POS Offline Mode',
    status: 'build',
    action: 'Current queue lock is live; next step is forced offline checklist, pending-tip reconciliation, and post-reconnect recovery tasking.',
  },
  {
    id: 'toast-tip-adjustment-audit',
    benchmark: 'Tip adjustment review with closeout audit trail',
    source: 'Toast POS',
    status: 'build',
    action: 'Link tip edit actions to operator ID, approval event, and settlement proof row before closeout can finalize.',
  },
  {
    id: 'lightspeed-permission-matrix',
    benchmark: 'Configurable role permission matrix for cashier and manager',
    source: 'Lightspeed Retail (X-Series)',
    status: 'build',
    action: 'Extend seeded roles into editable templates with module-level permission toggles and audit history.',
  },
  {
    id: 'lightspeed-po-discipline',
    benchmark: 'Purchase order and receiving controls linked to stock movement',
    source: 'Lightspeed Retail (X-Series)',
    status: 'build',
    action: 'Add PO creation, receiving evidence, and mismatch escalation into the stock module.',
  },
  {
    id: 'lightspeed-transfer-receive',
    benchmark: 'Destination receiving step before stock is available for sale',
    source: 'Lightspeed Retail (X-Series)',
    status: 'build',
    action: 'Require explicit receive-transfer action before destination stock is counted as available and close with receiver proof.',
  },
  {
    id: 'toast-offline-check-sequence',
    benchmark: 'Offline check sequencing and reconnect reconciliation',
    source: 'Toast Platform Guide',
    status: 'build',
    action: 'Record offline check numbering lane and reconciliation notes so support can trace checks created during network loss.',
  },
  {
    id: 'square-gift-cards-and-store-credit',
    benchmark: 'Gift card and store-credit tender lifecycle',
    source: 'Square Gift Cards + POS',
    status: 'missing',
    action: 'Add gift card sell/redeem flow, balance checks, and refund-to-credit controls with audit trail.',
  },
  {
    id: 'toast-gift-card-balance-lane',
    benchmark: 'Gift card issue, redeem, and balance verification in checkout',
    source: 'Toast Gift Cards',
    status: 'missing',
    action: 'Add gift-card tender lane with online balance check and settlement audit rows in day-close exports.',
  },
  {
    id: 'shopify-loyalty-profile-sync',
    benchmark: 'Loyalty identity linked to checkout profile',
    source: 'Shopify POS customer profiles',
    status: 'missing',
    action: 'Capture loyalty ID, points balance, and reward redemption evidence directly in checkout and closeout exports.',
  },
  {
    id: 'toast-receipt-reprint-audit',
    benchmark: 'Receipt reprint and transaction lookup audit trail',
    source: 'Toast POS',
    status: 'build',
    action: 'Track who reprinted receipts, why they were reprinted, and link to order/payment timeline for dispute handling.',
  },
  {
    id: 'toast-kds-station-routing',
    benchmark: 'Kitchen display station routing and expo handoff',
    source: 'Toast KDS',
    status: 'build',
    action: 'Add station-level prep timers, expo-ready handoff proof, and SLA breach alerts in the kitchen queue lane.',
  },
  {
    id: 'shopify-local-pickup-handoff',
    benchmark: 'Local pickup handoff between ecommerce and in-store POS',
    source: 'Shopify POS',
    status: 'missing',
    action: 'Add pickup-ready queue, pickup verification proof, and inventory handoff reconciliation between channels.',
  },
  {
    id: 'square-online-order-reconciliation',
    benchmark: 'Online and in-store order reconciliation under one queue',
    source: 'Square for Restaurants',
    status: 'missing',
    action: 'Merge web/delivery order ingestion with counter/table queue and attach payment/order source evidence to closeout.',
  },
  {
    id: 'clover-labor-clock',
    benchmark: 'Employee clock-in/clock-out and labor export lane',
    source: 'Clover',
    status: 'missing',
    action: 'Add staff time clock, break tracking, and labor-cost export linked to daily close and manager review.',
  },
  {
    id: 'square-report-export',
    benchmark: 'CSV/Excel export for operational and financial reports',
    source: 'Square Reporting',
    status: 'live',
    action: 'Keep day-pack export stable and add export quality checks for every release.',
  },
  {
    id: 'square-customer-directory',
    benchmark: 'Customer directory and receipt-linked service history',
    source: 'Square Customer Directory',
    status: 'build',
    action: 'Attach customer profile, service history, and refund context to POS transactions for frontline recovery.',
  },
  {
    id: 'lightspeed-cycle-count',
    benchmark: 'Cycle count workflows with variance approvals',
    source: 'Lightspeed Retail (X-Series)',
    status: 'missing',
    action: 'Add cycle-count tasks, variance approval routing, and recount evidence for inventory confidence.',
  },
]

const BUSINESS_BENCHMARKS: Record<PosBusinessType, PosBenchmarkItem[]> = {
  restaurant: [
    {
      id: 'toast-void-reasons',
      benchmark: 'Void/refund policy with manager approval reason trail',
      source: 'Toast POS',
      status: 'build',
      action: 'Require reason codes for void/refund and include manager decision trail in closeout export.',
    },
    {
      id: 'kitchen-device-map',
      benchmark: 'Kitchen station and service-device assignment',
      source: 'Restaurant POS market baseline',
      status: 'build',
      action: 'Device assignment map is active for table/kitchen lanes; next step is enforcement in staff identity backend.',
    },
    {
      id: 'toast-offline-shift-review',
      benchmark: 'Offline shift review and pending tip recovery workflow',
      source: 'Toast POS',
      status: 'build',
      action: 'Offline guardrail and tip recovery queue are active with shift review lock; next step is automatic upload reconciliation.',
    },
    {
      id: 'toast-menu-schedule',
      benchmark: 'Scheduled menu/daypart activation by service window',
      source: 'Toast POS',
      status: 'build',
      action: 'Daypart schedule windows are active with manager toggles; next step is auto-switch notifications and publish logs.',
    },
    {
      id: 'toast-self-serve-kiosk-handoff',
      benchmark: 'Self-serve kiosk order source routed into kitchen + counter handoff',
      source: 'Toast self-serve kiosk + KDS baseline',
      status: 'missing',
      action: 'Add kiosk order source tags, queue priority policy, and payment-to-kitchen handoff proof so self-order flow is audit-safe.',
    },
  ],
  spa: [
    {
      id: 'spa-provider-switch',
      benchmark: 'Front-desk to provider session ownership handoff',
      source: 'Service-desk POS baseline',
      status: 'build',
      action: 'Add explicit appointment handoff state with provider acceptance and delay capture.',
    },
    {
      id: 'spa-membership-pack',
      benchmark: 'Membership package utilization and expiry controls',
      source: 'Service retail POS baseline',
      status: 'missing',
      action: 'Track package consumption, expiry warnings, and renewal prompts by customer.',
    },
  ],
  retail: [
    {
      id: 'shopify-transfer-queue',
      benchmark: 'Inventory transfer fulfill/receive flow',
      source: 'Shopify POS',
      status: 'build',
      action: 'Transfer lifecycle exists in POS; next step is multi-location backend writeback and receiving confirmation alerts.',
    },
    {
      id: 'retail-returns-guardrail',
      benchmark: 'Returns guardrails with policy windows and review',
      source: 'Retail POS market baseline',
      status: 'build',
      action: 'Enforce policy windows and high-risk return review before final refund.',
    },
    {
      id: 'shopify-demand-forecast-po',
      benchmark: 'Purchase-order suggestions from demand and seasonality signals',
      source: 'Shopify POS + Stocky baseline',
      status: 'missing',
      action: 'Add reorder recommendation lane that proposes PO quantities by velocity, lead time, and safety stock before manager approval.',
    },
  ],
}

export function getPosBenchmarkBacklog(businessType: PosBusinessType) {
  return [...SHARED_BENCHMARKS, ...(BUSINESS_BENCHMARKS[businessType] || [])]
}
