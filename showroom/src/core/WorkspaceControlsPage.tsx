import { useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router'

import { getSessionEvents } from '../analytics/metrics-collector'

import {
  LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
  LOCAL_WORKSPACE_RESTORE_POINT_KEY,
  applyLocalWorkspaceBackup,
  collectLocalWorkspaceBackup,
  listLocalWorkspaceStorageKeys,
  restoreLocalWorkspaceBackup,
  restoreLocalWorkspaceBackupFromEvidence,
  type LocalWorkspaceBackup,
} from './local-workspace-backup'
import { PageHeading, RuntimeBadge, type RuntimeHealth } from './CoreShell'
import { loadCommerceWorkspace } from './commerce-workspace'
import { loadProductionWorkspace } from './production-workspace'
import { projectShopOrderProductionStatus } from './shop-production-status'
import { projectCrossProductOperatingSummary } from './cross-product-report'
import { projectShopRevenueSummary } from './shop-revenue-summary'
import { projectPlantOeeSummary } from './plant-oee-summary'
import { projectWebsiteLeadSummary } from './website-lead-summary'
import { readWebsiteLeadLedger } from '../products/website/website-leads'
import { projectCustomerJourneySummary } from './customer-journey-summary'

function EcommercePipelineView() {
  const stats = useMemo(() => { try { const r = typeof window !== 'undefined' && window.localStorage.getItem('supermega.ecommerce.buying_lifecycle.v1.ecommerce%3Alocal'); const p = r ? JSON.parse(r) as Record<string, unknown[]> : null; return p ? { requests: p.requests?.length ?? 0, returns: p.returnIntents?.length ?? 0, cancels: p.cancellationIntents?.length ?? 0 } : null } catch { return null } }, [])
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Order requests from Ecommerce. Read-only." eyebrow="Ecommerce" title="Pipeline" />
      <div className="settings-control-stack"><section className="core-panel">
        <div><span className="core-eyebrow">Pipeline</span></div>
        {stats ? <div className="readiness-list">
          <span><small>Requests</small><strong>{stats.requests}</strong></span>
          <span><small>Returns</small><strong>{stats.returns}</strong></span>
          <span><small>Cancels</small><strong>{stats.cancels}</strong></span>
        </div> : <p className="form-notice">No order requests yet.</p>}
      </section></div>
    </div>
  )
}

function CustomerJourneyView() {
  const commerce = useMemo(() => loadCommerceWorkspace().state, [])
  const summary = useMemo(() => projectCustomerJourneySummary(commerce), [commerce])
  const summaryRows: Array<readonly [string, string]> = [
    ['Unique customers', String(summary.uniqueCustomers)],
    ['Repeat customers', String(summary.repeatCustomers)],
    ['New customers', String(summary.newCustomers)],
    ['Avg orders / customer', summary.uniqueCustomers > 0 ? String(summary.averageOrdersPerCustomer) : '—'],
  ]
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Customer order history from Shop records. Read-only." eyebrow="CRM" title="Customer journey" />
      <div className="settings-control-stack">
        <section className="core-panel">
          <div><span className="core-eyebrow">Customer summary</span></div>
          <div aria-label="Customer journey summary" className="readiness-list">
            {summaryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        </section>
        {summary.topCustomers.length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">Top customers by revenue</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Customer</th><th>Orders</th><th>Revenue</th><th>Completed</th><th>Cancelled</th><th>Last order</th></tr></thead>
                <tbody>{summary.topCustomers.map((c) => (
                  <tr key={c.customer}>
                    <td>{c.customer}</td><td>{c.orderCount}</td><td>{c.totalRevenue.toLocaleString()}</td>
                    <td>{c.completedOrders}</td><td>{c.cancelledOrders}</td><td>{c.lastOrderDate?.slice(0, 10) ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div></section>
          : <p className="form-notice">No Shop orders yet. Complete a sale to see customer history here.</p>}
      </div>
    </div>
  )
}

function CrossProductView() {
  const commerce = useMemo(() => loadCommerceWorkspace().state, [])
  const production = useMemo(() => loadProductionWorkspace().state, [])
  const summary = useMemo(() => projectCrossProductOperatingSummary(commerce, production, new Date().toISOString()), [commerce, production])
  const orderStatuses = useMemo(() => projectShopOrderProductionStatus(commerce, production), [commerce, production])
  const summaryRows: Array<readonly [string, string]> = [
    ['Orders with Plant coverage', String(summary.ordersWithCoverage)],
    ['Orders without coverage', String(summary.ordersWithoutCoverage)],
    ['Orders on hold', String(summary.ordersOnHold)],
    ['Orders all done', String(summary.ordersAllCompleted)],
    ['Closed jobs with receipt gap', summary.closedJobsWithGap ? `${summary.closedJobsWithGap} (${summary.totalReceiptGap} units)` : 'None'],
  ]
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Shop orders linked to Plant jobs. Read-only — nothing is changed." eyebrow="Cross-product" title="Order and production status" />
      <div className="settings-control-stack">
        <section className="core-panel">
          <div><span className="core-eyebrow">Operating summary</span></div>
          <div aria-label="Cross-product summary" className="readiness-list">
            {summaryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        </section>
        {orderStatuses.length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">Linked orders</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Order</th><th>Customer</th><th>Item</th><th>Qty</th><th>Job</th><th>Line</th><th>Progress</th><th>Status</th><th>Due</th></tr></thead>
                <tbody>{orderStatuses.flatMap((order) => order.linkedJobs.map((job) => (
                  <tr key={`${order.orderId}:${job.jobId}`}>
                    <td>{order.orderId}</td><td>{order.customer}</td><td>{order.item}</td><td>{order.quantity}</td>
                    <td>{job.jobId}</td><td>{job.line}</td><td>{job.progress}%</td><td>{job.status}</td><td>{job.dueAt?.slice(0, 10) ?? '—'}</td>
                  </tr>
                )))}</tbody>
              </table></div></section>
          : <p className="form-notice">No Shop orders have linked Plant jobs yet. Create a production job from Shop demand first.</p>}
      </div>
    </div>
  )
}

function WebsiteLeadsView() {
  const ledger = useMemo(() => (typeof window !== 'undefined' ? readWebsiteLeadLedger(window.localStorage) : { schema: 'supermega.website.lead-ledger.v1' as const, revision: 0, leads: [] }), [])
  const summary = useMemo(() => projectWebsiteLeadSummary(ledger), [ledger])
  const summaryRows: Array<readonly [string, string]> = [
    ['Total leads', String(summary.totalLeads)],
    ['New', String(summary.newLeads)],
    ['Qualified', String(summary.qualifiedLeads)],
    ['Closed', String(summary.closedLeads)],
    ['Qualification rate', summary.totalLeads > 0 ? `${summary.qualificationRate}%` : '—'],
    ['Closure rate', summary.totalLeads > 0 ? `${summary.closureRate}%` : '—'],
  ]
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Lead funnel from Website contact forms. Read-only." eyebrow="Website" title="Lead summary" />
      <div className="settings-control-stack">
        <section className="core-panel">
          <div><span className="core-eyebrow">Funnel summary</span></div>
          <div aria-label="Website lead summary" className="readiness-list">
            {summaryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        </section>
        {Object.keys(summary.bySourcePage).length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">By source page</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Page</th><th>Total</th><th>Qualified</th><th>Closed</th></tr></thead>
                <tbody>{Object.entries(summary.bySourcePage).map(([page, m]) => (
                  <tr key={page}><td>{page}</td><td>{m.total}</td><td>{m.qualified}</td><td>{m.closed}</td></tr>
                ))}</tbody>
              </table></div></section>
          : <p className="form-notice">No leads recorded yet. Contacts submitted through your Website will appear here.</p>}
      </div>
    </div>
  )
}

function PlantOeeView() {
  const production = useMemo(() => loadProductionWorkspace().state, [])
  const summary = useMemo(() => projectPlantOeeSummary(production, new Date().toISOString()), [production])
  const summaryRows: Array<readonly [string, string]> = [
    ['Total jobs', String(summary.totalJobs)],
    ['Closed', String(summary.closedJobs)],
    ['Open', String(summary.openJobs)],
    ['On hold', String(summary.onHoldJobs)],
    ['Overdue', String(summary.overdueJobs)],
    ['Quality rate', summary.totalTarget > 0 ? `${summary.qualityRate}%` : '—'],
    ['Avg job progress', `${summary.avgJobProgress}%`],
  ]
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Job quality and throughput from Plant production records. Read-only." eyebrow="Plant" title="OEE summary" />
      <div className="settings-control-stack">
        <section className="core-panel">
          <div><span className="core-eyebrow">Production summary</span></div>
          <div aria-label="Plant OEE summary" className="readiness-list">
            {summaryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        </section>
        {Object.keys(summary.byLine).length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">By production line</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Line</th><th>Total</th><th>Closed</th><th>On hold</th><th>Target</th><th>Scrap</th></tr></thead>
                <tbody>{Object.entries(summary.byLine).map(([line, m]) => (
                  <tr key={line}><td>{line}</td><td>{m.total}</td><td>{m.closed}</td><td>{m.onHold}</td><td>{m.target}</td><td>{m.scrap}</td></tr>
                ))}</tbody>
              </table></div></section>
          : <p className="form-notice">No production jobs yet. Create a job in Plant to populate this view.</p>}
      </div>
    </div>
  )
}

function ShopRevenueView() {
  const commerce = useMemo(() => loadCommerceWorkspace().state, [])
  const summary = useMemo(() => projectShopRevenueSummary(commerce), [commerce])
  const summaryRows: Array<readonly [string, string]> = [
    ['Total revenue', String(summary.totalRevenue)],
    ['Completed revenue', String(summary.completedRevenue)],
    ['Orders', String(summary.orderCount)],
    ['Completed', String(summary.completedCount)],
    ['Cancelled', String(summary.cancelledCount)],
    ['Average order value', String(summary.averageOrderValue)],
  ]
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Revenue projection from Shop orders and shift closes. Read-only." eyebrow="Shop" title="Revenue summary" />
      <div className="settings-control-stack">
        <section className="core-panel">
          <div><span className="core-eyebrow">Revenue summary</span></div>
          <div aria-label="Revenue summary" className="readiness-list">
            {summaryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        </section>
        {Object.keys(summary.byChannel).length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">By channel</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Channel</th><th>Revenue</th><th>Orders</th></tr></thead>
                <tbody>{Object.entries(summary.byChannel).map(([ch, v]) => (
                  <tr key={ch}><td>{ch}</td><td>{v.revenue}</td><td>{v.count}</td></tr>
                ))}</tbody>
              </table></div></section>
          : null}
        {summary.topSkus.length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">Top SKUs</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>SKU</th><th>Revenue</th><th>Orders</th></tr></thead>
                <tbody>{summary.topSkus.map((s) => (
                  <tr key={s.sku}><td>{s.sku}</td><td>{s.revenue}</td><td>{s.count}</td></tr>
                ))}</tbody>
              </table></div></section>
          : null}
        {summary.closeSummary.length > 0
          ? <section className="core-panel"><div><span className="core-eyebrow">Shift closes</span></div>
              <div style={{ overflowX: 'auto' }}><table>
                <thead><tr><th>Date</th><th>Revenue</th><th>Orders</th></tr></thead>
                <tbody>{summary.closeSummary.map((c, i) => (
                  <tr key={i}><td>{c.businessDate}</td><td>{c.total}</td><td>{c.orders}</td></tr>
                ))}</tbody>
              </table></div></section>
          : <p className="form-notice">No shift closes recorded yet. Close a shift in Shop to populate this view.</p>}
      </div>
    </div>
  )
}

function LocalMetricsView() {
  const events = getSessionEvents()
  return (
    <div className="workspace-screen settings-screen">
      <PageHeading copy="Session activity. Nothing leaves this device." eyebrow="Analytics" title="Session metrics" />
      <div className="settings-control-stack">
        {events.length === 0
          ? <p className="form-notice">No events yet. Open a product to begin.</p>
          : <table><thead><tr><th>Product</th><th>Action</th></tr></thead><tbody>
              {events.map((e, i) => <tr key={i}><td>{e.product}</td><td>{e.action}</td></tr>)}
            </tbody></table>}
      </div>
    </div>
  )
}

function loadRestorePoint() {
  if (typeof window === 'undefined') return null
  try {
    return restoreLocalWorkspaceBackup(JSON.parse(window.sessionStorage.getItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY) || 'null'))
  } catch {
    return null
  }
}

function collectCurrentBackup() {
  return typeof window === 'undefined' ? null : collectLocalWorkspaceBackup(window.localStorage)
}

function backupHref(backup: LocalWorkspaceBackup | null) {
  return backup ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}` : '#'
}

function backupFilename(backup: LocalWorkspaceBackup | null) {
  const day = backup?.createdAt.slice(0, 10) || new Date().toISOString().slice(0, 10)
  return `supermega-workspace-backup-${day}.json`
}

export function WorkspaceControlsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [searchParams] = useSearchParams()
  const [currentBackup, setCurrentBackup] = useState<LocalWorkspaceBackup | null>(collectCurrentBackup)
  const [restorePoint, setRestorePoint] = useState<LocalWorkspaceBackup | null>(loadRestorePoint)
  const [restorePointLabel, setRestorePointLabel] = useState(restorePoint ? 'Saved on this device' : '')
  const [notice, setNotice] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const backupDownload = useMemo(() => ({ href: backupHref(currentBackup), filename: backupFilename(currentBackup) }), [currentBackup])
  const recordCount = currentBackup ? Object.keys(currentBackup.records).length : 0
  const statusRows: Array<readonly [string, string]> = [
    ['Mode', runtime.status === 'enterprise' ? 'Company data' : runtime.status === 'checking' ? 'Checking' : 'Demo on this device'],
    ['Writes', runtime.writesReady ? 'Ready' : 'Locked'],
    ['Local records', currentBackup ? String(recordCount) : 'Backup unavailable'],
    ['Next action', runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? 'Open a product and continue working.'],
  ]
  if (searchParams.get('view') === 'local-metrics') return <LocalMetricsView />
  if (searchParams.get('view') === 'cross-product') return <CrossProductView />
  if (searchParams.get('view') === 'shop-revenue') return <ShopRevenueView />
  if (searchParams.get('view') === 'plant-oee') return <PlantOeeView />
  if (searchParams.get('view') === 'website-leads') return <WebsiteLeadsView />
  if (searchParams.get('view') === 'customer-journey') return <CustomerJourneyView />
  if (searchParams.get('view') === 'ecommerce-pipeline') return <EcommercePipelineView />

  function saveRestorePoint() {
    const backup = collectCurrentBackup()
    if (!backup) {
      setNotice('This workspace is too large to save safely. Download smaller product exports before resetting this device.')
      return
    }
    try {
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setCurrentBackup(backup)
      setRestorePoint(backup)
      setRestorePointLabel('Saved on this device')
      setNotice(`${Object.keys(backup.records).length} local records saved as a restore point.`)
    } catch {
      setNotice('This browser could not save a restore point. Download the workspace backup instead.')
    }
  }

  async function loadBackupFile(file: File | null) {
    if (!file) return
    try {
      if (file.size < 1 || file.size > LOCAL_WORKSPACE_BACKUP_MAX_BYTES) throw new Error('Choose a SuperMega backup smaller than 5 MB.')
      const parsed: unknown = JSON.parse(await file.text())
      const backup = restoreLocalWorkspaceBackup(parsed) ?? restoreLocalWorkspaceBackupFromEvidence(parsed)
      if (!backup) throw new Error('This is not a valid SuperMega workspace backup or version 24 evidence file.')
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setRestorePoint(backup)
      setRestorePointLabel(file.name)
      setNotice(`${Object.keys(backup.records).length} records verified. Restore only when you are ready to replace this browser workspace.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The workspace backup could not be loaded.')
    }
  }

  function restoreWorkspace() {
    if (!restorePoint || restoreBusy) return
    setRestoreBusy(true)
    try {
      applyLocalWorkspaceBackup(window.localStorage, restorePoint)
      window.sessionStorage.removeItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY)
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The previous workspace could not be restored safely.')
      setRestoreBusy(false)
    }
  }

  async function resetWorkspace() {
    if (resetBusy) return
    setResetBusy(true)
    try {
      if (!loadRestorePoint()) {
        const backup = collectCurrentBackup()
        if (!backup) throw new Error('Save or download a restore point before resetting this device.')
        window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      }
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      listLocalWorkspaceStorageKeys(window.localStorage).forEach((key) => window.localStorage.removeItem(key))
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The workspace could not be reset safely.')
      setResetBusy(false)
    }
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading
        actions={<Link className="core-button" to="/">Back to products</Link>}
        copy="Check company readiness and protect the work saved in this browser. Product setup and internal client tools stay separate."
        eyebrow="Workspace controls"
        title="Status and recovery"
      />
      <div className="settings-control-stack">
        <section className="core-panel system-boundary-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Company boundary</span><h2>{runtime.writesReady ? 'Company writes are ready' : 'Real changes stay locked'}</h2><p>Local work remains usable while hosted identity, persistence, and security evidence are checked.</p></div><RuntimeBadge status={runtime.status} /></div>
          <div aria-label="Workspace readiness" className="readiness-list">{statusRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
          {runtime.requirements.length ? <ul className="requirement-list">{runtime.requirements.slice(0, 4).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
          <div className="trial-actions"><Link className="core-button" to="/login">Company login</Link><Link className="core-button primary" to="/">Open a product</Link></div>
          <p className="authority-note">SuperMega can prepare local work. Customer messages, payments, publishing, imports, and managed writes still require verified company controls and human approval.</p>
        </section>

        <section className="core-panel trial-control-panel">
          <div><span className="core-eyebrow">Browser workspace</span><h2>Save or restore your work.</h2><p>A restore point stays on this device. A downloaded backup can be kept somewhere safer.</p></div>
          <div className="trial-actions">
            <button className="core-button" onClick={saveRestorePoint} type="button">Save restore point</button>
            {currentBackup ? <a className="core-button" download={backupDownload.filename} href={backupDownload.href}>Download workspace backup</a> : <button className="core-button" disabled type="button">Backup unavailable</button>}
            <label className="core-button">Load backup file<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadBackupFile(file) }} type="file" /></label>
          </div>
        </section>

        {restorePoint ? <section aria-label="Local workspace restore point" className="setup-complete settings-restore-point"><div><strong>Restore point ready.</strong><small>{restorePointLabel} · {Object.keys(restorePoint.records).length} records</small></div><button className="core-button primary" disabled={restoreBusy} onClick={restoreWorkspace} type="button">{restoreBusy ? 'Restoring...' : 'Restore previous workspace'}</button></section> : null}
        {notice ? <p aria-live="polite" className="form-notice" role="status">{notice}</p> : null}

        <details className="compact-disclosure">
          <summary><span>Reset this device</span><small>Destructive</small></summary>
          <div className="setup-template-summary"><div><span>What will be cleared</span><strong>Local Shop, Plant, Website, Ecommerce, setup, drafts, approvals, and AI-memory records</strong></div><p>A restore point is created first. Managed company records and external systems are not changed.</p><div className="trial-actions">{resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetWorkspace()} type="button">{resetBusy ? 'Resetting...' : 'Confirm local reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Prepare local reset</button>}</div></div>
        </details>
      </div>
    </div>
  )
}
