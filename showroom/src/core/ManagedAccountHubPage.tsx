import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'

import { approvedAppDownloads } from './approved-app-downloads'
import { managedAccountHubLoginPath } from './account-routes'
import { PageHeading, useCurrentManagedPortalAccess } from './CoreShell'
import type { ManagedAccountBilling, ManagedBillingInvoice } from './managed-account-billing'
import { currentManagedIdentity, loadManagedAccountBilling } from './managed-trial'

type BillingLoad =
  | { status: 'loading' }
  | { status: 'ready'; value: ManagedAccountBilling }
  | { status: 'error'; message: string }

function formatMinor(invoice: ManagedBillingInvoice, value: number) {
  const amount = value / 10 ** invoice.exponent
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency,
      minimumFractionDigits: invoice.exponent,
      maximumFractionDigits: invoice.exponent,
    }).format(amount)
  } catch {
    return `${invoice.currency} ${amount.toLocaleString('en-US')}`
  }
}

function paymentCopy(invoice: ManagedBillingInvoice) {
  if (invoice.paymentState === 'pending_manual_verification') {
    return 'Awaiting manual payment verification. No provider settlement is confirmed.'
  }
  if (invoice.paymentState === 'confirmed_out_of_band') {
    return 'Payment was manually verified outside this portal. This is not provider confirmation.'
  }
  return 'This invoice is void and has no outstanding amount.'
}

export function ManagedAccountHubPage() {
  const portal = useCurrentManagedPortalAccess()
  const [attempt, setAttempt] = useState(0)
  const [billing, setBilling] = useState<BillingLoad>({ status: 'loading' })
  const errorRef = useRef<HTMLParagraphElement>(null)
  const workspaceId = portal.status === 'ready' ? portal.workspaceId : ''

  useEffect(() => {
    if (portal.status !== 'ready') return
    let active = true
    setBilling({ status: 'loading' })
    void currentManagedIdentity()
      .then(async (identity) => {
        if (!identity || identity.workspaceId !== portal.workspaceId) {
          throw new Error('The company account changed. Sign in again.')
        }
        const value = await loadManagedAccountBilling(identity)
        if (active) setBilling({ status: 'ready', value })
      })
      .catch((error) => {
        if (!active) return
        setBilling({
          status: 'error',
          message: error instanceof Error ? error.message : 'Plan and billing could not be loaded.',
        })
      })
    return () => { active = false }
  }, [attempt, portal.status, workspaceId])

  useEffect(() => {
    if (billing.status !== 'error') return
    const frame = requestAnimationFrame(() => errorRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [billing.status])

  if (portal.status !== 'ready') return <Navigate replace to={managedAccountHubLoginPath()} />
  const summary = billing.status === 'ready' ? billing.value.billing : null
  const shopAssigned = portal.products.includes('commerce')

  return <div className="workspace-screen account-hub-screen">
    <PageHeading
      eyebrow="Company account"
      title={portal.companyName}
      copy="Review account access, billing, setup, and approved app downloads."
      actions={shopAssigned ? <Link className="core-button primary" to="/shop/">Open Shop</Link> : undefined}
    />

    <section className="account-hub-grid" aria-label="Account overview">
      <article className="account-hub-card">
        <span className="core-eyebrow">Overview</span>
        <h2>Account and access</h2>
        <dl className="account-hub-facts">
          <div><dt>Signed in as</dt><dd>{portal.accountEmail}</dd></div>
          <div><dt>Company role</dt><dd>{portal.companyRole}</dd></div>
          <div><dt>Company ID</dt><dd>{portal.workspaceId}</dd></div>
        </dl>
        <div className="account-hub-actions">
          {shopAssigned ? <Link className="core-button" to="/settings/?product=shop">Shop setup</Link> : null}
          {shopAssigned ? <Link className="core-button" to="/settings/#controls">Backup and recovery</Link> : null}
          <Link className="core-button" to={managedAccountHubLoginPath()}>Switch company or sign out</Link>
        </div>
      </article>

      <article className="account-hub-card" aria-busy={billing.status === 'loading'}>
        <span className="core-eyebrow">Plan &amp; billing</span>
        <h2>{summary?.package.packageCode ?? 'No package assigned'}</h2>
        {billing.status === 'loading' ? <p role="status">Loading billing records…</p> : null}
        {billing.status === 'error' ? <div className="account-hub-error">
          <p ref={errorRef} role="alert" tabIndex={-1}>{billing.message}</p>
          <button className="core-button" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button>
        </div> : null}
        {summary ? <>
          <p>Package and renewal terms have not been assigned in the billing ledger. Recurring billing is not configured.</p>
          {summary.invoices.length === 0 ? <p className="empty-state" role="status">No invoices are available for this company.</p> : <div className="account-billing-list">
            {summary.invoices.map((invoice) => <article className="account-billing-row" key={invoice.invoiceId}>
              <div><strong>{invoice.invoiceId}</strong><span>Due {invoice.dueDate}</span></div>
              <div><strong>{formatMinor(invoice, invoice.outstandingMinor)}</strong><span>{paymentCopy(invoice)}</span></div>
            </article>)}
          </div>}
          {summary.excluded.length ? <p role="status">{summary.excluded.length} billing record{summary.excluded.length === 1 ? '' : 's'} could not be shown safely.</p> : null}
        </> : null}
      </article>

      <article className="account-hub-card account-downloads-card">
        <span className="core-eyebrow">Apps</span>
        <h2>Approved downloads</h2>
        <p>Only signed, approved releases will appear here. CI and debug packages are never customer downloads.</p>
        <ul>
          {approvedAppDownloads.platforms.map((download) => <li key={download.id}>
            <span>{download.label}</span><strong>Not available yet</strong>
          </li>)}
        </ul>
      </article>
    </section>
  </div>
}
