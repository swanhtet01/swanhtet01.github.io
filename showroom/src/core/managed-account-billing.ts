export type ManagedBillingInvoice = {
  invoiceId: string
  status: 'issued' | 'paid' | 'void'
  issuedAt: string
  dueDate: string
  currency: string
  exponent: number
  totalMinor: number
  refundedMinor: number
  outstandingMinor: number
  paymentState: 'pending_manual_verification' | 'confirmed_out_of_band' | 'void'
  providerSettlementVerified: false
  receiptAvailable: false
}

export type ManagedAccountBilling = {
  contract: 'supermega.managed_account_billing.v1'
  identity: { workspace_id: string; actor_id: string; actor_kind: 'human' }
  billing: {
    contract: 'supermega.merchant_billing_summary.v1'
    workspaceId: string
    asOf: string
    package: {
      bindingStatus: 'legacy_entitlement_only'
      packageCode: null
      term: null
      renewalAt: null
      entitlementKey: 'premium'
      entitlementStatus: 'none' | 'granted' | 'revoked'
    }
    invoices: ManagedBillingInvoice[]
    excluded: Array<{
      invoiceId: string
      reason: 'stored_invoice_summary_unavailable' | 'stored_refund_history_invalid' | 'stored_refund_total_invalid'
    }>
    totalOutstandingMinorByCurrency: Record<string, number>
    recurringBillingConfigured: false
    providerSettlementVerified: false
    administrativeActionsExposed: false
    externalWritesPerformed: false
    secretValuesExposed: false
  }
}

type ExpectedManagedBillingIdentity = { userId: string; workspaceId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true
  }
  return false
}

function safeText(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
    && !hasControlCharacter(value)
}

function safeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

const responseKeys = ['contract', 'identity', 'billing'] as const
const billingKeys = [
  'contract', 'workspaceId', 'asOf', 'package', 'invoices', 'excluded',
  'totalOutstandingMinorByCurrency', 'recurringBillingConfigured',
  'providerSettlementVerified', 'administrativeActionsExposed',
  'externalWritesPerformed', 'secretValuesExposed',
] as const
const packageKeys = ['bindingStatus', 'packageCode', 'term', 'renewalAt', 'entitlementKey', 'entitlementStatus'] as const
const invoiceKeys = [
  'invoiceId', 'status', 'issuedAt', 'dueDate', 'currency', 'exponent',
  'totalMinor', 'refundedMinor', 'outstandingMinor', 'paymentState',
  'providerSettlementVerified', 'receiptAvailable',
] as const
const excludedReasons = new Set([
  'stored_invoice_summary_unavailable',
  'stored_refund_history_invalid',
  'stored_refund_total_invalid',
])

export function assertManagedAccountBilling(
  value: unknown,
  expectedIdentity: ExpectedManagedBillingIdentity,
): ManagedAccountBilling {
  if (!isRecord(value) || !exactKeys(value, responseKeys) || value.contract !== 'supermega.managed_account_billing.v1') {
    throw new Error('The billing response is invalid. Try again.')
  }
  const identity = value.identity
  const billing = value.billing
  if (!isRecord(identity)
    || !exactKeys(identity, ['workspace_id', 'actor_id', 'actor_kind'])
    || identity.workspace_id !== expectedIdentity.workspaceId
    || identity.actor_id !== expectedIdentity.userId
    || identity.actor_kind !== 'human'
    || !isRecord(billing)
    || !exactKeys(billing, billingKeys)
    || billing.contract !== 'supermega.merchant_billing_summary.v1'
    || billing.workspaceId !== expectedIdentity.workspaceId
    || !safeText(billing.asOf, 40)
    || Number.isNaN(Date.parse(String(billing.asOf)))) {
    throw new Error('The billing response does not match this account. Sign in again.')
  }
  for (const key of [
    'recurringBillingConfigured', 'providerSettlementVerified',
    'administrativeActionsExposed', 'externalWritesPerformed', 'secretValuesExposed',
  ]) {
    if (billing[key] !== false) throw new Error('The billing response contains unsupported claims.')
  }
  const packageState = billing.package
  if (!isRecord(packageState)
    || !exactKeys(packageState, packageKeys)
    || packageState.bindingStatus !== 'legacy_entitlement_only'
    || packageState.packageCode !== null
    || packageState.term !== null
    || packageState.renewalAt !== null
    || packageState.entitlementKey !== 'premium'
    || !['none', 'granted', 'revoked'].includes(String(packageState.entitlementStatus))) {
    throw new Error('The billing package response is invalid.')
  }
  if (!Array.isArray(billing.invoices) || billing.invoices.length > 500
    || !Array.isArray(billing.excluded) || billing.excluded.length > 500
    || !isRecord(billing.totalOutstandingMinorByCurrency)) {
    throw new Error('The billing response is too large or invalid.')
  }
  const invoiceIds = new Set<string>()
  const calculatedTotals: Record<string, number> = {}
  let previousInvoiceId = ''
  for (const invoice of billing.invoices) {
    if (!isRecord(invoice) || !exactKeys(invoice, invoiceKeys) || !safeText(invoice.invoiceId, 120)) {
      throw new Error('An invoice summary is invalid.')
    }
    const invoiceId = String(invoice.invoiceId)
    if (invoiceIds.has(invoiceId) || invoiceId < previousInvoiceId) throw new Error('Invoice order is invalid.')
    invoiceIds.add(invoiceId)
    previousInvoiceId = invoiceId
    const expectedPaymentState = invoice.status === 'issued'
      ? 'pending_manual_verification'
      : invoice.status === 'paid'
        ? 'confirmed_out_of_band'
        : invoice.status === 'void' ? 'void' : null
    if (!expectedPaymentState
      || invoice.paymentState !== expectedPaymentState
      || !safeText(invoice.issuedAt, 40)
      || Number.isNaN(Date.parse(String(invoice.issuedAt)))
      || !/^\d{4}-\d{2}-\d{2}$/u.test(String(invoice.dueDate))
      || !/^[A-Z]{3}$/u.test(String(invoice.currency))
      || !safeInteger(invoice.exponent)
      || Number(invoice.exponent) > 6
      || !safeInteger(invoice.totalMinor)
      || !safeInteger(invoice.refundedMinor)
      || !safeInteger(invoice.outstandingMinor)
      || Number(invoice.refundedMinor) > Number(invoice.totalMinor)
      || Number(invoice.outstandingMinor) !== (invoice.status === 'issued' ? Number(invoice.totalMinor) - Number(invoice.refundedMinor) : 0)
      || invoice.providerSettlementVerified !== false
      || invoice.receiptAvailable !== false) {
      throw new Error('An invoice summary is inconsistent.')
    }
    if (Number(invoice.outstandingMinor)) {
      const currency = String(invoice.currency)
      const calculated = (calculatedTotals[currency] ?? 0) + Number(invoice.outstandingMinor)
      if (!Number.isSafeInteger(calculated)) throw new Error('Billing totals exceed the supported range.')
      calculatedTotals[currency] = calculated
    }
  }
  let previousExcludedId = ''
  const excludedIds = new Set<string>()
  for (const excluded of billing.excluded) {
    if (!isRecord(excluded)
      || !exactKeys(excluded, ['invoiceId', 'reason'])
      || !safeText(excluded.invoiceId, 120)
      || !excludedReasons.has(String(excluded.reason))) {
      throw new Error('An excluded invoice summary is invalid.')
    }
    const invoiceId = String(excluded.invoiceId)
    if (invoiceIds.has(invoiceId) || excludedIds.has(invoiceId) || invoiceId < previousExcludedId) {
      throw new Error('Excluded invoice order is invalid.')
    }
    excludedIds.add(invoiceId)
    previousExcludedId = invoiceId
  }
  const totals = Object.entries(billing.totalOutstandingMinorByCurrency)
  if (totals.length > 20 || totals.some(([currency, amount]) => !/^[A-Z]{3}$/u.test(currency) || !safeInteger(amount))) {
    throw new Error('Billing totals are invalid.')
  }
  if (JSON.stringify(Object.fromEntries(totals.sort())) !== JSON.stringify(Object.fromEntries(Object.entries(calculatedTotals).sort()))) {
    throw new Error('Billing totals do not match the invoices.')
  }
  return value as ManagedAccountBilling
}
