import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { assertManagedAccountBilling } from '../showroom/src/core/managed-account-billing.ts'
import { formatManagedInvoiceMinor } from '../showroom/src/core/format-managed-invoice-minor.ts'

function validatedInvoice(value, currency = 'USD', exponent = 2) {
  const response = {
    contract: 'supermega.managed_account_billing.v1',
    identity: { workspace_id: 'workspace-a', actor_id: 'actor-owner', actor_kind: 'human' },
    billing: {
      contract: 'supermega.merchant_billing_summary.v1', workspaceId: 'workspace-a', asOf: '2026-10-24T00:00:00Z',
      package: { bindingStatus: 'legacy_entitlement_only', packageCode: null, term: null, renewalAt: null, entitlementKey: 'premium', entitlementStatus: 'none' },
      invoices: [{ invoiceId: 'invoice-0001', status: 'issued', issuedAt: '2026-10-20T00:00:00Z', dueDate: '2026-11-20', currency, exponent, totalMinor: value, refundedMinor: 0, outstandingMinor: value, paymentState: 'pending_manual_verification', providerSettlementVerified: false, receiptAvailable: false }],
      excluded: [], totalOutstandingMinorByCurrency: value ? { [currency]: value } : {}, recurringBillingConfigured: false,
      providerSettlementVerified: false, administrativeActionsExposed: false, externalWritesPerformed: false, secretValuesExposed: false,
    },
  }
  return assertManagedAccountBilling(response, { userId: 'actor-owner', workspaceId: 'workspace-a' }).billing.invoices[0]
}

test('account invoice formatter preserves every accepted cent at the safe-integer boundary', () => {
  const invoice = validatedInvoice(9007199254740901)
  const before = structuredClone(invoice)
  assert.equal(formatManagedInvoiceMinor(invoice, invoice.outstandingMinor), '$90,071,992,547,409.01')
  assert.deepEqual(invoice, before)
})

test('account invoice formatter retains ordinary MMK and USD display', () => {
  const mmk = validatedInvoice(125000, 'MMK', 0)
  assert.equal(formatManagedInvoiceMinor(mmk, mmk.outstandingMinor), 'MMK\u00a0125,000')
  const usd = validatedInvoice(1005)
  assert.equal(formatManagedInvoiceMinor(usd, usd.outstandingMinor), '$10.05')
  assert.equal(formatManagedInvoiceMinor(validatedInvoice(0), 0), '$0.00')
})

test('account invoice formatter preserves six-digit subunits and unknown three-letter currency', () => {
  const six = validatedInvoice(Number.MAX_SAFE_INTEGER, 'USD', 6)
  assert.equal(formatManagedInvoiceMinor(six, six.outstandingMinor), '$9,007,199,254.740991')
  for (const [exponent, expected] of [
    [0, '$1,000,007'],
    [1, '$100,000.7'],
    [2, '$10,000.07'],
    [3, '$1,000.007'],
    [4, '$100.0007'],
    [5, '$10.00007'],
    [6, '$1.000007'],
  ]) {
    const invoice = validatedInvoice(1000007, 'USD', exponent)
    assert.equal(formatManagedInvoiceMinor(invoice, invoice.outstandingMinor), expected)
  }
  const unknown = validatedInvoice(123, 'ZZZ', 2)
  const display = formatManagedInvoiceMinor(unknown, unknown.outstandingMinor)
  assert.match(display, /^ZZZ/u)
  assert.match(display, /1\.23$/u)
})

test('account invoice formatter refuses malformed direct inputs', () => {
  const invoice = validatedInvoice(1005)
  for (const value of [-1, Number.MAX_SAFE_INTEGER + 1, 1.5, NaN]) {
    assert.throws(() => formatManagedInvoiceMinor(invoice, value))
  }
  for (const invalid of [null, { currency: 'US<', exponent: 2 }, { currency: 'usd', exponent: 2 }, { currency: 'USD', exponent: -1 }, { currency: 'USD', exponent: 7 }]) {
    assert.throws(() => formatManagedInvoiceMinor(invalid, 1005))
  }
})

test('account page source calls the exact helper for validated outstanding amounts', () => {
  const page = readFileSync(new URL('../showroom/src/core/ManagedAccountHubPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /formatManagedInvoiceMinor\(invoice, invoice\.outstandingMinor\)/u)
  assert.doesNotMatch(page, /value \/ 10 \*\* invoice\.exponent/u)
})
