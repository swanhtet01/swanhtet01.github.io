import type { PosBusinessType } from './posAuth'

export type PosReferenceRepoStatus = 'adopt-now' | 'pilot' | 'watch'

export type PosReferenceRepo = {
  id: string
  name: string
  source: string
  url: string
  status: PosReferenceRepoStatus
  focus: string
  fit: string
}

const SHARED_REPOS: PosReferenceRepo[] = [
  {
    id: 'odoo',
    name: 'Odoo',
    source: 'odoo/odoo',
    url: 'https://github.com/odoo/odoo',
    status: 'pilot',
    focus: 'POS + ERP backbone',
    fit: 'Use as reference for tightly integrated POS to accounting, inventory, and purchasing lanes.',
  },
  {
    id: 'erpnext',
    name: 'ERPNext',
    source: 'frappe/erpnext',
    url: 'https://github.com/frappe/erpnext',
    status: 'adopt-now',
    focus: 'Retail and multi-location control',
    fit: 'Reuse POS operational patterns for cashier lifecycle, stock movement, and day-close discipline.',
  },
  {
    id: 'opensourcepos',
    name: 'Open Source Point of Sale',
    source: 'opensourcepos/opensourcepos',
    url: 'https://github.com/opensourcepos/opensourcepos',
    status: 'adopt-now',
    focus: 'Cash register fundamentals',
    fit: 'Borrow practical flows for register, receipt, and transaction history behavior.',
  },
  {
    id: 'wcpos',
    name: 'WooCommerce POS',
    source: 'wcpos/woocommerce-pos',
    url: 'https://github.com/wcpos/woocommerce-pos',
    status: 'watch',
    focus: 'Web + store hybrid checkout',
    fit: 'Reference omnichannel sync and browser-first POS ergonomics for mixed online/offline storefronts.',
  },
  {
    id: 'stripe-terminal-devices',
    name: 'Stripe Terminal Apps on Devices',
    source: 'stripe-samples/terminal-apps-on-devices',
    url: 'https://github.com/stripe-samples/terminal-apps-on-devices',
    status: 'pilot',
    focus: 'Reader integration and payment handoff',
    fit: 'Use as implementation reference for reader connection lifecycle, payment collection, and device admin deep links.',
  },
  {
    id: 'stripe-terminal-ios',
    name: 'Stripe Terminal iOS SDK',
    source: 'stripe/stripe-terminal-ios',
    url: 'https://github.com/stripe/stripe-terminal-ios',
    status: 'pilot',
    focus: 'iOS in-person payments',
    fit: 'Use for production-grade mobile reader patterns and iOS app payment reliability on shared terminals.',
  },
  {
    id: 'stripe-terminal-rn',
    name: 'Stripe Terminal React Native SDK',
    source: 'stripe/stripe-terminal-react-native',
    url: 'https://github.com/stripe/stripe-terminal-react-native',
    status: 'watch',
    focus: 'Cross-platform terminal runtime',
    fit: 'Reference a single code path for Android + iOS payment reader workflows in mobile-first deployments.',
  },
]

const BUSINESS_REPOS: Record<PosBusinessType, PosReferenceRepo[]> = {
  restaurant: [
    {
      id: 'viewtouch',
      name: 'ViewTouch',
      source: 'ViewTouch/viewtouch',
      url: 'https://github.com/ViewTouch/viewtouch',
      status: 'watch',
      focus: 'Restaurant ticket and table operations',
      fit: 'Use as additional reference for table service controls and ticket-state discipline.',
    },
  ],
  spa: [
    {
      id: 'erpnext-healthcare',
      name: 'ERPNext Service Patterns',
      source: 'frappe/erpnext',
      url: 'https://github.com/frappe/erpnext',
      status: 'pilot',
      focus: 'Appointment and service workflow',
      fit: 'Use ERPNext role and workflow constructs for provider scheduling and service handoff.',
    },
  ],
  retail: [
    {
      id: 'odoo-stock',
      name: 'Odoo Stock + POS',
      source: 'odoo/odoo',
      url: 'https://github.com/odoo/odoo',
      status: 'pilot',
      focus: 'Transfer and replenishment workflows',
      fit: 'Use Odoo inventory movement and transfer concepts to harden retail stock movement controls.',
    },
  ],
}

export function getPosReferenceRepos(businessType: PosBusinessType) {
  return [...SHARED_REPOS, ...(BUSINESS_REPOS[businessType] || [])]
}
