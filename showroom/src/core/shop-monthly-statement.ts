import type { ArAgingSummary } from './shop-ar-aging-summary.ts'
import type { ApAgingSummary } from './shop-ap-aging-summary.ts'
import {
  computeLedgerTrialBalance,
  finalizeShopLedgerJournal,
  ledgerRoleBalanceMmk,
  type LedgerJournal,
  type LedgerJournalEntry,
} from './shop-ledger-journal.ts'
import { coreLedgerAccounts } from './shop-ledger-accounts.ts'

// Owner-language monthly statement. Never a T-account: it says what the owner
// sold, gave back, and bought, the till differences, and what was kept BEFORE
// other costs -- deliberately not "profit", because rent, wages, and fuel are
// not in the operating record in v1. Pure projection over the ledger journal,
// following the WorkingCapitalSummary shape (no store, no side effects).
export const SHOP_MONTHLY_STATEMENT_SCHEMA = 'supermega.shop.monthly-statement.v1' as const

export type ShopMonthlyStatementPnl = {
  soldMmk: number // sales_revenue + sales_revenue_unverified, recognised at sale
  gaveBackMmk: number // refunds + credit corrections (sales_adjustment)
  boughtMmk: number // purchases_expense
  tillDifferencesMmk: number // cash_over_short, positive = net loss
  keptBeforeOtherCostsMmk: number
}

export type ShopCashAccountBalance = {
  accountCode: string
  name: string
  nameMy?: string
  balanceMmk: number
}

export type ShopMonthlyStatementBalance = {
  cashAndWallets: ShopCashAccountBalance[]
  cashAndWalletsTotalMmk: number
  customersOweYouMmk: number // ties to shop-ar-aging-summary totalOutstandingMmk
  youOweSuppliersMmk: number // ties to shop-ap-aging-summary totalPayableMmk
  taxCollectedNotPaidMmk: number
}

export type ShopTillVarianceOwner = {
  owner: string
  tillDifferenceMmk: number // positive = the till was short under this owner
}

export type ShopMonthlyStatement = {
  schema: typeof SHOP_MONTHLY_STATEMENT_SCHEMA
  currency: 'MMK'
  period: string // 'YYYY-MM' for a month, or 'all' for since-you-started
  fromDate: string
  toDate: string
  asOf: string
  hasActivity: boolean
  entryCount: number
  pnl: ShopMonthlyStatementPnl
  balance: ShopMonthlyStatementBalance
  tillVarianceOwners: ShopTillVarianceOwner[]
  tiesToAgingBriefs: boolean
}

export type ShopMonthlyStatementOptions = {
  period?: string // omit or 'all' for the whole ledger; 'YYYY-MM' for one month
  asOf: string
}

function entriesInPeriod(entries: LedgerJournalEntry[], period: string): LedgerJournalEntry[] {
  if (period === 'all') return entries
  return entries.filter((entry) => entry.postedPeriod === period)
}

// Till differences under each accountable operator, from the close-settlement
// entries. Positive means the till came up short under that owner.
function tillVarianceOwners(entries: LedgerJournalEntry[]): ShopTillVarianceOwner[] {
  const byOwner = new Map<string, number>()
  for (const entry of entries) {
    if (entry.source.kind !== 'close_settlement') continue
    let difference = 0
    for (const line of entry.lines) {
      if (line.accountRole !== 'cash_over_short') continue
      difference += line.side === 'debit' ? line.amountMmk : -line.amountMmk
    }
    if (difference === 0) continue
    byOwner.set(entry.actor, (byOwner.get(entry.actor) ?? 0) + difference)
  }
  return [...byOwner.entries()]
    .map(([owner, tillDifferenceMmk]) => ({ owner, tillDifferenceMmk }))
    .sort((left, right) => right.tillDifferenceMmk - left.tillDifferenceMmk || left.owner.localeCompare(right.owner))
}

// The P&L reads flow accounts (income/expense) over the selected period; the
// balance snapshot reads position accounts (asset/liability) cumulatively, so
// it always reflects the shop's current standing and ties to the AR/AP briefs
// computed as of the same asOf.
export function projectShopMonthlyStatement(
  journal: LedgerJournal,
  arAging: ArAgingSummary,
  apAging: ApAgingSummary,
  options: ShopMonthlyStatementOptions,
): ShopMonthlyStatement {
  const period = options.period && options.period !== 'all' ? options.period : 'all'
  const periodEntries = entriesInPeriod(journal.entries, period)
  const periodJournal = finalizeShopLedgerJournal(periodEntries) ?? journal
  const flowBalance = computeLedgerTrialBalance(periodJournal)
  const positionBalance = computeLedgerTrialBalance(journal)

  const soldMmk = ledgerRoleBalanceMmk(flowBalance, 'sales_revenue')
    + ledgerRoleBalanceMmk(flowBalance, 'sales_revenue_unverified')
  const gaveBackMmk = ledgerRoleBalanceMmk(flowBalance, 'sales_adjustment')
  const boughtMmk = ledgerRoleBalanceMmk(flowBalance, 'purchases_expense')
  const tillDifferencesMmk = ledgerRoleBalanceMmk(flowBalance, 'cash_over_short')
  const keptBeforeOtherCostsMmk = soldMmk - gaveBackMmk - boughtMmk - tillDifferencesMmk

  const accountNames = new Map(coreLedgerAccounts().map((account) => [account.code, account]))
  const cashAndWallets: ShopCashAccountBalance[] = positionBalance.rows
    .filter((row) => row.role === 'payment_clearing')
    .map((row) => {
      const account = accountNames.get(row.accountCode)
      const balance: ShopCashAccountBalance = {
        accountCode: row.accountCode,
        name: account?.name ?? row.accountCode,
        balanceMmk: row.balanceMmk,
      }
      if (account?.nameMy !== undefined) balance.nameMy = account.nameMy
      return balance
    })
  const cashAndWalletsTotalMmk = cashAndWallets.reduce((total, row) => total + row.balanceMmk, 0)
  const customersOweYouMmk = ledgerRoleBalanceMmk(positionBalance, 'accounts_receivable')
  const youOweSuppliersMmk = ledgerRoleBalanceMmk(positionBalance, 'accounts_payable')
  const taxCollectedNotPaidMmk = ledgerRoleBalanceMmk(positionBalance, 'tax_payable')

  const tiesToAgingBriefs = customersOweYouMmk === arAging.totalOutstandingMmk
    && youOweSuppliersMmk === apAging.totalPayableMmk

  return {
    schema: SHOP_MONTHLY_STATEMENT_SCHEMA,
    currency: 'MMK',
    period,
    fromDate: journal.fromDate,
    toDate: journal.toDate,
    asOf: options.asOf,
    hasActivity: journal.entries.length > 0,
    entryCount: periodEntries.length,
    pnl: { soldMmk, gaveBackMmk, boughtMmk, tillDifferencesMmk, keptBeforeOtherCostsMmk },
    balance: {
      cashAndWallets,
      cashAndWalletsTotalMmk,
      customersOweYouMmk,
      youOweSuppliersMmk,
      taxCollectedNotPaidMmk,
    },
    tillVarianceOwners: tillVarianceOwners(periodEntries),
    tiesToAgingBriefs,
  }
}
