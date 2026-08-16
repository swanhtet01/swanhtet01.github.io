import {
  myanmarBusinessDate,
  sha256Hex,
  type CommerceState,
  type CommerceOrder,
  type CommerceClose,
  type CommerceOrderCorrection,
} from './commerce-workspace.ts'
import {
  ledgerAccountCodeForRole,
  ledgerRoleType,
  type LedgerAccountRole,
  type LedgerAccountType,
} from './shop-ledger-accounts.ts'

// The general ledger is a projection, never a store. Every LedgerJournalEntry
// derives from one existing evidence-gated event and carries that event's kind,
// id, and (where the source is digest-sealed) its artifact digest. A line with
// no source event cannot be constructed: the type has no optional source.
export const SHOP_LEDGER_JOURNAL_SCHEMA = 'supermega.shop.ledger-journal.v1' as const

export type LedgerSourceEventKind =
  | 'daily_close'
  | 'close_settlement'
  | 'order_correction'
  | 'refund_settlement'
  | 'payment_reconciliation'
  | 'supplier_invoice'
  | 'supplier_credit_note'

export type LedgerSourceEvent = {
  kind: LedgerSourceEventKind
  id: string
  artifactDigest: string | null
}

export type LedgerJournalLine = {
  lineId: string
  side: 'debit' | 'credit'
  accountCode: string
  accountRole: LedgerAccountRole
  amountMmk: number
  memo: string
}

export type LedgerJournalEntry = {
  entryId: string
  businessDate: string
  postedPeriod: string
  // sourcePeriod is set only when an event proved after a locked close posts
  // into the current open period (period lock, design section 5.2). Section 6's
  // required fields are all present; this is the additive linkage that lock needs.
  sourcePeriod?: string
  source: LedgerSourceEvent
  actor: string
  evidenceReference: string
  reversalOfEntryId?: string
  lines: LedgerJournalLine[]
}

export type LedgerJournal = {
  schema: typeof SHOP_LEDGER_JOURNAL_SCHEMA
  currency: 'MMK'
  fromDate: string
  toDate: string
  entries: LedgerJournalEntry[]
  totalDebitMmk: number
  totalCreditMmk: number
  digest: string
}

export type LedgerTrialBalanceRow = {
  accountCode: string
  role: LedgerAccountRole
  type: LedgerAccountType
  debitMmk: number
  creditMmk: number
  balanceMmk: number
}

export type LedgerTrialBalance = {
  rows: LedgerTrialBalanceRow[]
  totalDebitMmk: number
  totalCreditMmk: number
}

const SOURCE_ORDER: Record<LedgerSourceEventKind, number> = {
  daily_close: 0,
  close_settlement: 1,
  order_correction: 2,
  refund_settlement: 3,
  payment_reconciliation: 4,
  supplier_invoice: 5,
  supplier_credit_note: 6,
}

function periodOf(businessDate: string): string {
  return businessDate.slice(0, 7)
}

function isCreditOrder(order: CommerceOrder | undefined): boolean {
  return Boolean(order?.paymentDueAt)
}

type LineDraft = { side: 'debit' | 'credit'; role: LedgerAccountRole; amountMmk: number; memo: string; paymentMethod?: string }

function assembleLines(entryId: string, drafts: LineDraft[]): LedgerJournalLine[] {
  return drafts
    .filter((draft) => draft.amountMmk > 0)
    .map((draft, index) => ({
      lineId: `${entryId}-${draft.side === 'debit' ? 'D' : 'C'}${index + 1}`,
      side: draft.side,
      accountCode: ledgerAccountCodeForRole(draft.role, draft.paymentMethod),
      accountRole: draft.role,
      amountMmk: draft.amountMmk,
      memo: draft.memo,
    }))
}

// --- Source 1: daily close -------------------------------------------------
// The close's revenue recognition is exactly today's handoff credit lines
// (sales_revenue / tax_payable / sales_revenue_unverified), derived from the
// same orders. The debit side is split: cash sales debit the payment_clearing
// leaf for their method; credit sales (paymentDueAt set) debit accounts_
// receivable instead -- the matching DR that a later reconciliation clears
// (design source 5). Read directly from the closed orders so the journal stays
// a pure projection over the operating record, like the AR/AP aging briefs.
function buildDailyCloseEntries(
  close: CommerceClose,
  orderById: Map<string, CommerceOrder>,
): LedgerJournalEntry[] {
  if (!close.businessDate || !close.orderIds) return []
  const businessDate = close.businessDate
  const cashByMethod = new Map<string, number>()
  let receivableMmk = 0
  let acceptedSubtotalMmk = 0
  let acceptedTaxMmk = 0
  let legacyUnverifiedMmk = 0
  for (const orderId of close.orderIds) {
    const order = orderById.get(orderId)
    if (!order) continue
    const originalTotalMmk = order.total
    if (isCreditOrder(order)) {
      receivableMmk += originalTotalMmk
    } else {
      cashByMethod.set(order.payment, (cashByMethod.get(order.payment) ?? 0) + originalTotalMmk)
    }
    const accepted = acceptedCalculation(order)
    if (accepted) {
      acceptedSubtotalMmk += accepted.subtotalMmk
      acceptedTaxMmk += accepted.taxMmk
    } else {
      legacyUnverifiedMmk += originalTotalMmk
    }
  }
  const entryId = `LJE-CLOSE-${close.id}`
  const drafts: LineDraft[] = []
  for (const method of [...cashByMethod.keys()].sort()) {
    drafts.push({ side: 'debit', role: 'payment_clearing', amountMmk: cashByMethod.get(method) ?? 0, memo: `Cash taken (${method})`, paymentMethod: method })
  }
  drafts.push({ side: 'debit', role: 'accounts_receivable', amountMmk: receivableMmk, memo: 'Credit sales, customers still owe' })
  drafts.push({ side: 'credit', role: 'sales_revenue', amountMmk: acceptedSubtotalMmk, memo: 'What you sold (verified)' })
  drafts.push({ side: 'credit', role: 'tax_payable', amountMmk: acceptedTaxMmk, memo: 'Tax collected on sales' })
  drafts.push({ side: 'credit', role: 'sales_revenue_unverified', amountMmk: legacyUnverifiedMmk, memo: 'What you sold (older records)' })
  const lines = assembleLines(entryId, drafts)
  if (!lines.length) return []
  return [{
    entryId,
    businessDate,
    postedPeriod: periodOf(businessDate),
    source: { kind: 'daily_close', id: close.id, artifactDigest: closeSourceDigest(close) },
    actor: close.operator ?? 'unknown',
    evidenceReference: close.evidenceReference ?? '',
    lines,
  }]
}

// An order counts as verified revenue when it carries a calculation with whole
// subtotal and tax that reconstruct its total. Anything older lands entirely in
// sales_revenue_unverified, exactly as the daily-close export classifies it.
function acceptedCalculation(order: CommerceOrder): { subtotalMmk: number; taxMmk: number } | null {
  const calculation = order.calculation
  if (!calculation) return null
  const subtotalMmk = calculation.subtotalMmk
  const taxMmk = calculation.taxMmk
  if (typeof subtotalMmk !== 'number' || typeof taxMmk !== 'number') return null
  if (subtotalMmk + taxMmk !== order.total) return null
  return { subtotalMmk, taxMmk }
}

// Each daily close is sealed with a deterministic digest over its stable
// identity so every promoted line traces to a digest-sealed source.
function closeSourceDigest(close: CommerceClose): string {
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.shop.ledger-close-source.v1',
    close.id,
    close.businessDate ?? null,
    close.actionId ?? null,
    close.total,
    close.orderIds ?? [],
  ]))}`
}

// --- Source 2: close settlement variance -----------------------------------
// Reconcile the cash leaf to what was actually counted. A shortage records a
// till loss; an overage records a till gain. varianceOwner is the accountable
// operator, named in the memo.
function buildSettlementEntries(close: CommerceClose): LedgerJournalEntry[] {
  const settlement = close.settlement
  if (!settlement || !close.businessDate) return []
  const entries: LedgerJournalEntry[] = []
  settlement.lines.forEach((line, index) => {
    if (line.varianceMmk === 0) return
    const businessDate = close.businessDate as string
    const entryId = `LJE-SETTLE-${close.id}-${index + 1}`
    const owner = line.varianceOwner ?? 'unassigned'
    const magnitude = Math.abs(line.varianceMmk)
    const shortage = line.varianceMmk < 0
    const drafts: LineDraft[] = shortage
      ? [
          { side: 'debit', role: 'cash_over_short', amountMmk: magnitude, memo: `Till short (${line.paymentMethod}, owner ${owner})` },
          { side: 'credit', role: 'payment_clearing', amountMmk: magnitude, memo: `Cash reduced to counted (${line.paymentMethod})`, paymentMethod: line.paymentMethod },
        ]
      : [
          { side: 'debit', role: 'payment_clearing', amountMmk: magnitude, memo: `Cash raised to counted (${line.paymentMethod})`, paymentMethod: line.paymentMethod },
          { side: 'credit', role: 'cash_over_short', amountMmk: magnitude, memo: `Till over (${line.paymentMethod}, owner ${owner})` },
        ]
    entries.push({
      entryId,
      businessDate,
      postedPeriod: periodOf(businessDate),
      source: { kind: 'close_settlement', id: `${close.id}#${line.paymentMethod}`, artifactDigest: null },
      actor: owner,
      evidenceReference: close.evidenceReference ?? '',
      lines: assembleLines(entryId, drafts),
    })
  })
  return entries
}

// --- Source 3: order corrections (reversals, never edits) -------------------
// A correction posts a linked reversal of the sale it corrects. The original
// close entry is never touched; reversalOfEntryId points back to it. A
// correction proved after the close's period posts into the open period and
// carries sourcePeriod = the locked period it economically belongs to.
function buildCorrectionEntries(
  order: CommerceOrder,
  correction: CommerceOrderCorrection,
  closeForOrder: CommerceClose | undefined,
): LedgerJournalEntry {
  const businessDate = myanmarBusinessDate(correction.createdAt)
  const postedPeriod = periodOf(businessDate)
  const entryId = `LJE-CORR-${correction.documentId}`
  const drafts: LineDraft[] = []
  if (correction.kind === 'credit') {
    drafts.push({ side: 'debit', role: 'sales_adjustment', amountMmk: correction.calculation.subtotalMmk, memo: `Credit correction on ${order.id}` })
    drafts.push({ side: 'debit', role: 'tax_payable', amountMmk: correction.calculation.taxMmk, memo: `Tax reversed on ${order.id}` })
    drafts.push({ side: 'credit', role: 'correction_payable', amountMmk: correction.calculation.totalMmk, memo: `Owed back to customer on ${order.id}` })
  } else {
    drafts.push({ side: 'debit', role: 'correction_receivable', amountMmk: correction.calculation.totalMmk, memo: `Extra owed by customer on ${order.id}` })
    drafts.push({ side: 'credit', role: 'sales_adjustment', amountMmk: correction.calculation.subtotalMmk, memo: `Debit correction on ${order.id}` })
    drafts.push({ side: 'credit', role: 'tax_payable', amountMmk: correction.calculation.taxMmk, memo: `Tax added on ${order.id}` })
  }
  const entry: LedgerJournalEntry = {
    entryId,
    businessDate,
    postedPeriod,
    source: { kind: 'order_correction', id: correction.documentId, artifactDigest: correction.sourceCalculationDigest },
    actor: correction.actor,
    evidenceReference: correction.evidenceReference,
    lines: assembleLines(entryId, drafts),
  }
  if (closeForOrder?.businessDate) {
    const closePeriod = periodOf(closeForOrder.businessDate)
    entry.reversalOfEntryId = `LJE-CLOSE-${closeForOrder.id}`
    if (closePeriod !== postedPeriod) entry.sourcePeriod = closePeriod
  }
  return entry
}

// --- Source 4: refund settlement -------------------------------------------
// A settled refund reverses the recognised sale and pays cash out of the leaf.
function buildRefundEntries(order: CommerceOrder): LedgerJournalEntry[] {
  if (order.refundStatus !== 'settled' || !order.refundSettledAt) return []
  const businessDate = myanmarBusinessDate(order.refundSettledAt)
  const entryId = `LJE-REFUND-${order.id}`
  const calc = order.calculation
  const subtotalMmk = calc?.subtotalMmk ?? null
  const taxMmk = calc?.taxMmk ?? null
  const ties = subtotalMmk !== null && taxMmk !== null && subtotalMmk + taxMmk === order.total
  const drafts: LineDraft[] = ties
    ? [
        { side: 'debit', role: 'sales_adjustment', amountMmk: subtotalMmk as number, memo: `Refund on ${order.id}` },
        { side: 'debit', role: 'tax_payable', amountMmk: taxMmk as number, memo: `Tax reversed on refund ${order.id}` },
        { side: 'credit', role: 'payment_clearing', amountMmk: order.total, memo: `Refund paid out (${order.payment})`, paymentMethod: order.payment },
      ]
    : [
        { side: 'debit', role: 'sales_adjustment', amountMmk: order.total, memo: `Refund on ${order.id}` },
        { side: 'credit', role: 'payment_clearing', amountMmk: order.total, memo: `Refund paid out (${order.payment})`, paymentMethod: order.payment },
      ]
  const lines = assembleLines(entryId, drafts)
  if (!lines.length) return []
  return [{
    entryId,
    businessDate,
    postedPeriod: periodOf(businessDate),
    source: { kind: 'refund_settlement', id: order.refundSettlementActionId ?? order.id, artifactDigest: null },
    actor: order.refundSettledBy ?? 'unknown',
    evidenceReference: order.refundEvidenceReference ?? '',
    lines,
  }]
}

// --- Source 5: credit-order payment reconciliation --------------------------
// When a credit sale's payment is proved, cash rises and accounts_receivable
// clears. The DR accounts_receivable was posted at the close (source 1).
function buildReconciliationEntries(
  order: CommerceOrder,
  closeForOrder: CommerceClose | undefined,
): LedgerJournalEntry[] {
  if (!order.paymentDueAt || !order.paymentReconciledAt) return []
  if (!closeForOrder) return [] // AR was only created if the sale was closed
  const businessDate = myanmarBusinessDate(order.paymentReconciledAt)
  const postedPeriod = periodOf(businessDate)
  const entryId = `LJE-RECON-${order.id}`
  const drafts: LineDraft[] = [
    { side: 'debit', role: 'payment_clearing', amountMmk: order.total, memo: `Credit payment received (${order.payment})`, paymentMethod: order.payment },
    { side: 'credit', role: 'accounts_receivable', amountMmk: order.total, memo: `Cleared what ${order.customer} owed` },
  ]
  const entry: LedgerJournalEntry = {
    entryId,
    businessDate,
    postedPeriod,
    source: { kind: 'payment_reconciliation', id: order.paymentReconciliationActionId ?? order.id, artifactDigest: null },
    actor: order.paymentReconciledBy ?? 'unknown',
    evidenceReference: order.paymentEvidenceReference ?? '',
    lines: assembleLines(entryId, drafts),
  }
  if (closeForOrder.businessDate) {
    const closePeriod = periodOf(closeForOrder.businessDate)
    if (closePeriod !== postedPeriod) entry.sourcePeriod = closePeriod
  }
  return entry.lines.length ? [entry] : []
}

// --- Source 6 & 7: supplier invoice payable review + credit note ------------
function buildSupplierInvoiceEntries(state: CommerceState): LedgerJournalEntry[] {
  const entries: LedgerJournalEntry[] = []
  for (const purchaseOrder of state.purchaseOrders ?? []) {
    if (purchaseOrder.cancellation) continue
    const invoice = purchaseOrder.supplierInvoice
    if (!invoice?.payableReview) continue
    const businessDate = myanmarBusinessDate(invoice.payableReview.capturedAt)
    const entryId = `LJE-PAY-${invoice.id}`
    const drafts: LineDraft[] = [
      { side: 'debit', role: 'purchases_expense', amountMmk: invoice.totalMmk, memo: `Bought from ${purchaseOrder.supplier} (${purchaseOrder.sku})` },
      { side: 'credit', role: 'accounts_payable', amountMmk: invoice.totalMmk, memo: `You owe ${purchaseOrder.supplier}` },
    ]
    const lines = assembleLines(entryId, drafts)
    if (!lines.length) continue
    entries.push({
      entryId,
      businessDate,
      postedPeriod: periodOf(businessDate),
      source: { kind: 'supplier_invoice', id: invoice.id, artifactDigest: null },
      actor: invoice.payableReview.actor,
      evidenceReference: invoice.payableReview.evidenceReference,
      lines,
    })
  }
  return entries
}

function buildSupplierCreditNoteEntries(state: CommerceState): LedgerJournalEntry[] {
  const entries: LedgerJournalEntry[] = []
  for (const purchaseOrder of state.purchaseOrders ?? []) {
    if (purchaseOrder.cancellation) continue
    for (const claim of purchaseOrder.supplierReturns ?? []) {
      for (const creditNote of claim.creditNotes) {
        const businessDate = myanmarBusinessDate(creditNote.recording.capturedAt)
        const entryId = `LJE-SCN-${creditNote.id}`
        const drafts: LineDraft[] = [
          { side: 'debit', role: 'accounts_payable', amountMmk: creditNote.amountMmk, memo: `Supplier credit from ${purchaseOrder.supplier}` },
          { side: 'credit', role: 'purchases_expense', amountMmk: creditNote.amountMmk, memo: `Reduced ${purchaseOrder.sku} cost` },
        ]
        const lines = assembleLines(entryId, drafts)
        if (!lines.length) continue
        entries.push({
          entryId,
          businessDate,
          postedPeriod: periodOf(businessDate),
          source: { kind: 'supplier_credit_note', id: creditNote.id, artifactDigest: null },
          actor: creditNote.recording.actor,
          evidenceReference: creditNote.recording.evidenceReference,
          lines,
          reversalOfEntryId: purchaseOrder.supplierInvoice ? `LJE-PAY-${purchaseOrder.supplierInvoice.id}` : undefined,
        })
      }
    }
  }
  return entries
}

// Assemble every source into the unsorted entry set. Each entry is balanced by
// construction; the control-total guard in finalizeShopLedgerJournal is the
// fail-closed backstop.
export function buildShopLedgerJournalEntries(state: CommerceState): LedgerJournalEntry[] {
  const orderById = new Map(state.orders.map((order) => [order.id, order]))
  const closeByOrderId = new Map<string, CommerceClose>()
  for (const close of state.closes) {
    for (const orderId of close.orderIds ?? []) {
      if (!closeByOrderId.has(orderId)) closeByOrderId.set(orderId, close)
    }
  }
  const entries: LedgerJournalEntry[] = []
  for (const close of state.closes) {
    entries.push(...buildDailyCloseEntries(close, orderById))
    entries.push(...buildSettlementEntries(close))
  }
  for (const order of state.orders) {
    for (const correction of order.corrections ?? []) {
      entries.push(buildCorrectionEntries(order, correction, closeByOrderId.get(order.id)))
    }
    entries.push(...buildRefundEntries(order))
    entries.push(...buildReconciliationEntries(order, closeByOrderId.get(order.id)))
  }
  entries.push(...buildSupplierInvoiceEntries(state))
  entries.push(...buildSupplierCreditNoteEntries(state))
  return entries
}

function sortedEntries(entries: LedgerJournalEntry[]): LedgerJournalEntry[] {
  return [...entries].sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate)
    || SOURCE_ORDER[left.source.kind] - SOURCE_ORDER[right.source.kind]
    || left.entryId.localeCompare(right.entryId))
}

// Fail-closed control total: names the first entry whose debit and credit lines
// do not balance, or null when every entry balances. When any entry is out of
// balance the journal refuses to emit (finalizeShopLedgerJournal returns null).
export function ledgerJournalControlTotalSourceId(entries: readonly LedgerJournalEntry[]): string | null {
  for (const entry of entries) {
    let debit = 0
    let credit = 0
    for (const line of entry.lines) {
      if (line.side === 'debit') debit += line.amountMmk
      else credit += line.amountMmk
    }
    if (debit !== credit) return entry.source.id
  }
  return null
}

function ledgerJournalProjection(journal: Omit<LedgerJournal, 'digest'>) {
  return [
    journal.schema,
    journal.currency,
    journal.fromDate,
    journal.toDate,
    journal.totalDebitMmk,
    journal.totalCreditMmk,
    journal.entries.map((entry) => [
      entry.entryId,
      entry.businessDate,
      entry.postedPeriod,
      entry.sourcePeriod ?? null,
      entry.source.kind,
      entry.source.id,
      entry.source.artifactDigest,
      entry.actor,
      entry.evidenceReference,
      entry.reversalOfEntryId ?? null,
      entry.lines.map((line) => [line.lineId, line.side, line.accountCode, line.accountRole, line.amountMmk, line.memo]),
    ]),
  ]
}

export function shopLedgerJournalDigest(journal: Omit<LedgerJournal, 'digest'>): string {
  return `sha256:${sha256Hex(JSON.stringify(ledgerJournalProjection(journal)))}`
}

// Seal a set of entries into a journal. Returns null on any imbalance -- no
// partial ledger is ever emitted (design section 5.4).
export function finalizeShopLedgerJournal(entries: LedgerJournalEntry[]): LedgerJournal | null {
  if (ledgerJournalControlTotalSourceId(entries) !== null) return null
  const ordered = sortedEntries(entries)
  let totalDebitMmk = 0
  let totalCreditMmk = 0
  for (const entry of ordered) {
    for (const line of entry.lines) {
      if (line.side === 'debit') totalDebitMmk += line.amountMmk
      else totalCreditMmk += line.amountMmk
    }
  }
  if (totalDebitMmk !== totalCreditMmk) return null
  const businessDates = ordered.map((entry) => entry.businessDate)
  const unsigned: Omit<LedgerJournal, 'digest'> = {
    schema: SHOP_LEDGER_JOURNAL_SCHEMA,
    currency: 'MMK',
    fromDate: businessDates.length ? (businessDates[0] as string) : '',
    toDate: businessDates.length ? (businessDates[businessDates.length - 1] as string) : '',
    entries: ordered,
    totalDebitMmk,
    totalCreditMmk,
  }
  return { ...unsigned, digest: shopLedgerJournalDigest(unsigned) }
}

// The whole ledger since the shop's first close. Null only on imbalance; an
// empty operating record yields an empty (still valid) journal.
export function buildShopLedgerJournal(state: CommerceState): LedgerJournal | null {
  return finalizeShopLedgerJournal(buildShopLedgerJournalEntries(state))
}

// Trial balance per leaf account. Natural sign per account type: assets and
// expenses carry a debit balance, liabilities/income/equity a credit balance.
export function computeLedgerTrialBalance(journal: LedgerJournal): LedgerTrialBalance {
  const byCode = new Map<string, { role: LedgerAccountRole; debitMmk: number; creditMmk: number }>()
  for (const entry of journal.entries) {
    for (const line of entry.lines) {
      const row = byCode.get(line.accountCode) ?? { role: line.accountRole, debitMmk: 0, creditMmk: 0 }
      if (line.side === 'debit') row.debitMmk += line.amountMmk
      else row.creditMmk += line.amountMmk
      byCode.set(line.accountCode, row)
    }
  }
  const rows: LedgerTrialBalanceRow[] = [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([accountCode, row]) => {
      const type = ledgerRoleType(row.role)
      const debitNatural = type === 'asset' || type === 'expense'
      return {
        accountCode,
        role: row.role,
        type,
        debitMmk: row.debitMmk,
        creditMmk: row.creditMmk,
        balanceMmk: debitNatural ? row.debitMmk - row.creditMmk : row.creditMmk - row.debitMmk,
      }
    })
  return {
    rows,
    totalDebitMmk: rows.reduce((total, row) => total + row.debitMmk, 0),
    totalCreditMmk: rows.reduce((total, row) => total + row.creditMmk, 0),
  }
}

// Sum the natural balance of every account carrying a given role.
export function ledgerRoleBalanceMmk(trialBalance: LedgerTrialBalance, role: LedgerAccountRole): number {
  return trialBalance.rows
    .filter((row) => row.role === role)
    .reduce((total, row) => total + row.balanceMmk, 0)
}

function ledgerCsvCell(value: string | number | null): string {
  let raw = value === null ? '' : String(value)
  if (/^[=+@-]/.test(raw)) raw = `'${raw}`
  return `"${raw.replace(/"/g, '""')}"`
}

// The full journal CSV, digest-sealed like every handoff CSV. Refuses to emit
// if the journal's own digest does not verify.
export function shopLedgerJournalCsv(journal: LedgerJournal): string {
  const { digest, ...unsigned } = journal
  if (journal.schema !== SHOP_LEDGER_JOURNAL_SCHEMA || digest !== shopLedgerJournalDigest(unsigned)) {
    throw new Error('Shop ledger journal integrity check failed.')
  }
  const header = [
    'schema', 'currency', 'from_date', 'to_date', 'total_debit_mmk', 'total_credit_mmk',
    'entry_id', 'business_date', 'posted_period', 'source_period', 'source_kind', 'source_id',
    'source_artifact_digest', 'actor', 'evidence_reference', 'reversal_of_entry_id',
    'line_id', 'side', 'account_code', 'account_role', 'amount_mmk', 'memo', 'artifact_digest',
  ]
  const rows: Array<Array<string | number | null>> = []
  for (const entry of journal.entries) {
    for (const line of entry.lines) {
      rows.push([
        journal.schema, journal.currency, journal.fromDate, journal.toDate,
        journal.totalDebitMmk, journal.totalCreditMmk,
        entry.entryId, entry.businessDate, entry.postedPeriod, entry.sourcePeriod ?? null,
        entry.source.kind, entry.source.id, entry.source.artifactDigest,
        entry.actor, entry.evidenceReference, entry.reversalOfEntryId ?? null,
        line.lineId, line.side, line.accountCode, line.accountRole, line.amountMmk, line.memo, journal.digest,
      ])
    }
  }
  return [header, ...rows].map((row) => row.map(ledgerCsvCell).join(',')).join('\r\n') + '\r\n'
}
