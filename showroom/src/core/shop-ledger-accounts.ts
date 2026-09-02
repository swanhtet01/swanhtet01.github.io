import type { CommerceAccountRole } from './commerce-workspace.ts'

// General ledger chart of accounts. This is a projection surface, never a store:
// the ledger derives from the operating record (see shop-ledger-journal.ts), so
// the chart only names roles and their leaf accounts. It extends the existing
// CommerceAccountRole (7 roles) by the four roles the ledger adds, giving the
// third generation the account-mapping validation now recognises alongside the
// legacy-4 and current-7 generations.
export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export type LedgerAccountRole = CommerceAccountRole
  | 'accounts_receivable' | 'accounts_payable'
  | 'purchases_expense' | 'cash_over_short'

export type LedgerAccount = {
  code: string
  role: LedgerAccountRole
  type: LedgerAccountType
  name: string
  nameMy?: string
  packId?: string // core accounts carry no packId; a trade pack tags what it adds
}

// Canonical generation, newest-longest, mirroring legacy-4 / current-7. The
// account-mapping validation in commerce-workspace uses this length + order to
// accept a third mapping generation the same way it accepts the first two.
export const ledgerAccountRoles: readonly LedgerAccountRole[] = [
  'payment_clearing',
  'sales_revenue',
  'sales_revenue_unverified',
  'tax_payable',
  'sales_adjustment',
  'correction_receivable',
  'correction_payable',
  'accounts_receivable',
  'accounts_payable',
  'purchases_expense',
  'cash_over_short',
]

// A core role can never be re-typed by a pack: the type is fixed here and every
// added leaf inherits its role's type (see extendLedgerChart).
const ledgerRoleTypes: Record<LedgerAccountRole, LedgerAccountType> = {
  payment_clearing: 'asset',
  accounts_receivable: 'asset',
  correction_receivable: 'asset',
  accounts_payable: 'liability',
  tax_payable: 'liability',
  correction_payable: 'liability',
  sales_revenue: 'income',
  sales_revenue_unverified: 'income',
  purchases_expense: 'expense',
  sales_adjustment: 'expense',
  cash_over_short: 'expense',
}

export function ledgerRoleType(role: LedgerAccountRole): LedgerAccountType {
  return ledgerRoleTypes[role]
}

// payment_clearing splits into cash/wallet leaf accounts by the order's payment
// method label. Everything else is one leaf per role.
const CORE_ACCOUNTS: readonly LedgerAccount[] = [
  { code: 'cash_drawer', role: 'payment_clearing', type: 'asset', name: 'Cash drawer', nameMy: 'ငွေအံ' },
  { code: 'cash_kbz_wallet', role: 'payment_clearing', type: 'asset', name: 'KBZPay wallet', nameMy: 'KBZPay ပိုက်ဆံအိတ်' },
  { code: 'cash_wave_wallet', role: 'payment_clearing', type: 'asset', name: 'WavePay wallet', nameMy: 'WavePay ပိုက်ဆံအိတ်' },
  { code: 'cash_aya_wallet', role: 'payment_clearing', type: 'asset', name: 'AYA Pay wallet', nameMy: 'AYA Pay ပိုက်ဆံအိတ်' },
  { code: 'cash_mmqr_clearing', role: 'payment_clearing', type: 'asset', name: 'MMQR wallet clearing', nameMy: 'MMQR ငွေလက်ခံ' },
  { code: 'cash_other_clearing', role: 'payment_clearing', type: 'asset', name: 'Other payment clearing', nameMy: 'အခြား ငွေလက်ခံ' },
  { code: 'accounts_receivable', role: 'accounts_receivable', type: 'asset', name: 'Customers owe you', nameMy: 'ဖောက်သည် ကြွေးကျန်' },
  { code: 'correction_receivable', role: 'correction_receivable', type: 'asset', name: 'Invoice corrections owed to you', nameMy: 'ပြင်ဆင်ချက် ရရန်' },
  { code: 'accounts_payable', role: 'accounts_payable', type: 'liability', name: 'You owe suppliers', nameMy: 'ပေးသွင်းသူ ကြွေးကျန်' },
  { code: 'tax_payable', role: 'tax_payable', type: 'liability', name: 'Tax collected, not yet paid', nameMy: 'ကောက်ခံထားသော အခွန်' },
  { code: 'correction_payable', role: 'correction_payable', type: 'liability', name: 'Invoice corrections you owe', nameMy: 'ပြင်ဆင်ချက် ပေးရန်' },
  { code: 'sales_revenue', role: 'sales_revenue', type: 'income', name: 'What you sold', nameMy: 'ရောင်းရငွေ' },
  { code: 'sales_revenue_unverified', role: 'sales_revenue_unverified', type: 'income', name: 'What you sold (older records)', nameMy: 'ရောင်းရငွေ (အဟောင်း)' },
  { code: 'purchases_expense', role: 'purchases_expense', type: 'expense', name: 'What you bought', nameMy: 'ဝယ်ယူစရိတ်' },
  { code: 'sales_adjustment', role: 'sales_adjustment', type: 'expense', name: 'What you gave back', nameMy: 'ပြန်အမ်းငွေ' },
  { code: 'cash_over_short', role: 'cash_over_short', type: 'expense', name: 'Till differences', nameMy: 'ငွေအံ ကွာဟချက်' },
]

export function coreLedgerAccounts(): LedgerAccount[] {
  return CORE_ACCOUNTS.map((account) => ({ ...account }))
}

// The payment_clearing leaf for a payment method label. Deterministic and total:
// any unrecognised label lands in the single "other" clearing account so the
// journal can never be built with an unresolved cash line.
export function cashAccountCodeForMethod(paymentMethod: string): string {
  const label = paymentMethod.toLowerCase()
  if (label.includes('kbz')) return 'cash_kbz_wallet'
  if (label.includes('wave')) return 'cash_wave_wallet'
  if (label.includes('aya')) return 'cash_aya_wallet'
  if (label.includes('mmqr')) return 'cash_mmqr_clearing'
  if (label.includes('cash')) return 'cash_drawer'
  return 'cash_other_clearing'
}

// Resolve the leaf account code a role posts to. payment_clearing needs the
// method; every other role has exactly one leaf in the core chart.
export function ledgerAccountCodeForRole(role: LedgerAccountRole, paymentMethod?: string): string {
  if (role === 'payment_clearing') return cashAccountCodeForMethod(paymentMethod ?? '')
  const account = CORE_ACCOUNTS.find((candidate) => candidate.role === role && candidate.packId === undefined)
  if (!account) throw new Error(`No core ledger account for role ${role}.`)
  return account.code
}

export type LedgerAccountPackExtension = {
  packId: string
  // Rename an existing leaf's display labels. Role and type are untouchable.
  renamedAccounts?: ReadonlyArray<{ code: string; name: string; nameMy?: string }>
  // Add a new leaf under an existing role. The declared type MUST match the
  // role's canonical type -- this is where a pack that tries to re-type a core
  // role is refused.
  addedAccounts?: ReadonlyArray<{ code: string; role: LedgerAccountRole; type: LedgerAccountType; name: string; nameMy?: string }>
}

export type LedgerChartExtensionResult =
  | { ok: true; accounts: LedgerAccount[] }
  | { ok: false; reason: string }

// A pack may RENAME and ADD leaf accounts. It can never remove a core account
// (there is no removal operation) and never re-type a core role (an addition's
// type must equal the role's canonical type; a rename cannot touch the type).
export function extendLedgerChart(extension: LedgerAccountPackExtension): LedgerChartExtensionResult {
  const packId = extension.packId.trim()
  if (!packId) return { ok: false, reason: 'pack_id_required' }
  const accounts = coreLedgerAccounts()
  const byCode = new Map(accounts.map((account) => [account.code, account]))

  for (const rename of extension.renamedAccounts ?? []) {
    const target = byCode.get(rename.code)
    if (!target) return { ok: false, reason: `unknown_account:${rename.code}` }
    const name = rename.name.trim()
    if (!name) return { ok: false, reason: `empty_name:${rename.code}` }
    target.name = name
    if (rename.nameMy !== undefined) target.nameMy = rename.nameMy
    // role and type are deliberately never reassigned here.
  }

  for (const addition of extension.addedAccounts ?? []) {
    if (!(addition.role in ledgerRoleTypes)) return { ok: false, reason: `unknown_role:${addition.role}` }
    if (addition.type !== ledgerRoleTypes[addition.role]) {
      return { ok: false, reason: `role_type_mismatch:${addition.code}` }
    }
    const code = addition.code.trim()
    if (!code) return { ok: false, reason: 'empty_code' }
    if (byCode.has(code)) return { ok: false, reason: `duplicate_account:${code}` }
    const account: LedgerAccount = {
      code,
      role: addition.role,
      type: addition.type,
      name: addition.name.trim(),
      packId,
    }
    if (addition.nameMy !== undefined) account.nameMy = addition.nameMy
    accounts.push(account)
    byCode.set(code, account)
  }

  const invalid = validateLedgerChart(accounts)
  if (invalid) return { ok: false, reason: invalid }
  return { ok: true, accounts }
}

// Generational integrity: every core role must still be present with its
// canonical type, exactly once as its role's primary leaf. Mirrors how the
// account-mapping validation refuses a mapping that drops or re-types a role.
export function validateLedgerChart(accounts: readonly LedgerAccount[]): string | null {
  for (const account of accounts) {
    if (account.type !== ledgerRoleTypes[account.role]) return `retyped_role:${account.code}`
  }
  for (const role of ledgerAccountRoles) {
    if (!accounts.some((account) => account.role === role)) return `removed_role:${role}`
  }
  return null
}
