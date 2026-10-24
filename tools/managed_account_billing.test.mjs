import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { assertManagedAccountBilling } from '../showroom/src/core/managed-account-billing.ts'
import { managedAccountHubEntryPath, managedAccountHubLoginPath, managedAccountHubRecoveryEntryPath, managedAccountPath } from '../showroom/src/core/account-routes.ts'

const identity = { userId: 'actor-owner', workspaceId: 'workspace-a' }

function response() {
  return {
    contract: 'supermega.managed_account_billing.v1',
    identity: { workspace_id: 'workspace-a', actor_id: 'actor-owner', actor_kind: 'human' },
    billing: {
      contract: 'supermega.merchant_billing_summary.v1',
      workspaceId: 'workspace-a',
      asOf: '2026-10-24T00:00:00Z',
      package: {
        bindingStatus: 'legacy_entitlement_only',
        packageCode: null,
        term: null,
        renewalAt: null,
        entitlementKey: 'premium',
        entitlementStatus: 'none',
      },
      invoices: [{
        invoiceId: 'invoice-0001',
        status: 'issued',
        issuedAt: '2026-10-20T00:00:00Z',
        dueDate: '2026-11-20',
        currency: 'MMK',
        exponent: 0,
        totalMinor: 125000,
        refundedMinor: 0,
        outstandingMinor: 125000,
        paymentState: 'pending_manual_verification',
        providerSettlementVerified: false,
        receiptAvailable: false,
      }],
      excluded: [],
      totalOutstandingMinorByCurrency: { MMK: 125000 },
      recurringBillingConfigured: false,
      providerSettlementVerified: false,
      administrativeActionsExposed: false,
      externalWritesPerformed: false,
      secretValuesExposed: false,
    },
  }
}

test('managed account billing accepts only the exact tenant-bound privacy projection', () => {
  assert.deepEqual(assertManagedAccountBilling(response(), identity), response())
  const empty = response()
  empty.billing.invoices = []
  empty.billing.totalOutstandingMinorByCurrency = {}
  assert.deepEqual(assertManagedAccountBilling(empty, identity), empty)
})

test('managed account billing rejects cross-tenant, admin, provider and arithmetic expansion', () => {
  const candidates = []
  const otherTenant = response()
  otherTenant.billing.workspaceId = 'workspace-b'
  candidates.push(otherTenant)
  const adminField = response()
  adminField.billing.paymentReference = 'private-reference'
  candidates.push(adminField)
  const providerClaim = response()
  providerClaim.billing.invoices[0].providerSettlementVerified = true
  candidates.push(providerClaim)
  const wrongMath = response()
  wrongMath.billing.invoices[0].outstandingMinor = 1
  candidates.push(wrongMath)
  const duplicate = response()
  duplicate.billing.invoices.push(structuredClone(duplicate.billing.invoices[0]))
  duplicate.billing.totalOutstandingMinorByCurrency.MMK = 250000
  candidates.push(duplicate)
  for (const candidate of candidates) assert.throws(() => assertManagedAccountBilling(candidate, identity))
})

test('managed account billing keeps amounts inside the browser safe-integer boundary', () => {
  const maximum = Number.MAX_SAFE_INTEGER
  const safe = response()
  safe.billing.invoices[0].totalMinor = maximum
  safe.billing.invoices[0].outstandingMinor = maximum
  safe.billing.totalOutstandingMinorByCurrency.MMK = maximum
  assert.equal(assertManagedAccountBilling(safe, identity).billing.invoices[0].totalMinor, maximum)

  const unsafe = structuredClone(safe)
  unsafe.billing.invoices[0].totalMinor = maximum + 1
  unsafe.billing.invoices[0].outstandingMinor = maximum + 1
  unsafe.billing.totalOutstandingMinorByCurrency.MMK = maximum + 1
  assert.throws(() => assertManagedAccountBilling(unsafe, identity))

  const overflow = response()
  overflow.billing.invoices[0].totalMinor = maximum
  overflow.billing.invoices[0].outstandingMinor = maximum
  overflow.billing.invoices.push({ ...structuredClone(overflow.billing.invoices[0]), invoiceId: 'invoice-0002' })
  overflow.billing.totalOutstandingMinorByCurrency.MMK = maximum
  assert.throws(() => assertManagedAccountBilling(overflow, identity))
})

test('account hub uses authenticated billing loader and never links unsigned builds', () => {
  const app = readFileSync(new URL('../showroom/src/App.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
  const login = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../showroom/src/core/ManagedAccountHubPage.tsx', import.meta.url), 'utf8')
  const downloads = readFileSync(new URL('../showroom/src/core/approved-app-downloads.ts', import.meta.url), 'utf8')
  assert.match(app, /path="account"/)
  assert.match(shell, /protectedPortalRoute = Boolean\(requestedProduct\) \|\| accountHubRoute/)
  assert.match(shell, /protectedPortalRoute && portalAccess\.status === 'reauthenticate'/)
  assert.match(page, /loadManagedAccountBilling\(identity\)/)
  assert.match(page, /portal\.capabilities\.includes\('billing\.read'\)/)
  assert.match(login, /accountHubReturnPath \? 'guide'/)
  assert.match(page, /currentManagedIdentity\(\)/)
  assert.match(page, /CI and debug packages are never customer downloads/)
  assert.match(downloads, /status: 'unavailable', href: null, signed: false/g)
  assert.doesNotMatch(downloads, /https?:\/\//)
  assert.equal(managedAccountHubLoginPath(), '/login?entry=account-hub-v1')
  assert.equal(managedAccountHubEntryPath('?entry=account-hub-v1'), '/account')
  assert.equal(managedAccountPath('/account/recovery', null, '?entry=account-hub-v1'), '/account/recovery?entry=account-hub-v1')
  assert.equal(managedAccountHubRecoveryEntryPath('?mode=recovery&entry=account-hub-v1&code=abcdefghijklmnop'), '/account')
  for (const unsafe of [
    '',
    '?entry=wrong',
    '?entry=account-hub-v1&entry=account-hub-v1',
    '?entry=account-hub-v1&next=https://example.com',
    '?entry=account-hub-v1&product=shop',
  ]) assert.equal(managedAccountHubEntryPath(unsafe), null)
  for (const unsafe of [
    '?mode=signup&entry=account-hub-v1&code=abcdefghijklmnop',
    '?mode=recovery&entry=account-hub-v1&next=https://example.com',
    '?mode=recovery&entry=account-hub-v1&entry=account-hub-v1',
  ]) assert.equal(managedAccountHubRecoveryEntryPath(unsafe), null)
})
