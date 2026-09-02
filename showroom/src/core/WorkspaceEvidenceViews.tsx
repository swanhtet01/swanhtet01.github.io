import { Link } from 'react-router'

import { readWebsiteLeadLedger } from '../products/website/website-leads'
import { PageHeading, type RuntimeHealth } from './CoreShell'
import { readCommerceWorkspace } from './commerce-workspace'
import { readProductionWorkspace } from './production-workspace'

const ECOMMERCE_BUYING_LOCAL_KEY = 'supermega.ecommerce.buying_lifecycle.v1.ecommerce%3Alocal'
const PRODUCT_LINKS = [
  ['Shop', '/settings/?product=shop'],
  ['Plant', '/settings/?product=plant'],
  ['Website', '/settings/?product=website'],
  ['Ecommerce', '/settings/?product=ecommerce'],
] as const

function arrayRecordCount(value: object) {
  return Object.values(value).reduce((total, item) => total + (Array.isArray(item) ? item.length : 0), 0)
}

function ecommerceRecordCount() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(ECOMMERCE_BUYING_LOCAL_KEY)
    return raw ? arrayRecordCount(JSON.parse(raw) as object) : 0
  } catch {
    return 0
  }
}

export function CeoOperatingBriefView({ backupReady, runtime }: { backupReady: boolean; runtime: RuntimeHealth }) {
  const commerce = readCommerceWorkspace().state
  const production = readProductionWorkspace().state
  const website = typeof window !== 'undefined' ? readWebsiteLeadLedger(window.localStorage).leads.length : 0
  const ecommerce = ecommerceRecordCount()
  const reports = [
    ['Shop', '/settings/?view=shop-revenue#controls', arrayRecordCount(commerce)],
    ['Plant', '/settings/?view=plant-oee#controls', arrayRecordCount(production)],
    ['Website', '/settings/?view=website-leads#controls', website],
    ['Ecommerce', '/settings/?view=ecommerce-pipeline#controls', ecommerce],
  ] as const
  const localRecordProductCount = reports.filter(([, , count]) => count > 0).length

  return <div className="workspace-screen settings-screen">
    <PageHeading copy="Four-product status. Read-only." eyebrow="CEO brief" title="CEO status" />
    <div className="settings-control-stack">
      <section className="core-panel system-boundary-panel">
        <div><span className="core-eyebrow">Evidence boundary</span><h2>Local view — not commercial proof</h2></div>
        <p className="form-notice">Local records: {localRecordProductCount} / 4 · Pilot: Not proven · Production telemetry: Not observed</p>
        <div className="trial-actions">{reports.map(([product, path, count]) => <Link className="core-button" key={product} to={path}>{product}: {count > 0 ? `${count} local records` : 'No local records'}</Link>)}</div>
        <p className="authority-note">Local records are not customer, pilot, revenue, commercial, production, or telemetry proof.</p>
      </section>
      <section aria-label="Go-live controls" className="core-panel">
        <div><span className="core-eyebrow">Go-live path</span><h2>Set up, protect, prove, release</h2></div>
        <p className="form-notice">Backup: {backupReady ? 'Ready' : 'Needs attention'} · Writes: {runtime.writesReady ? 'Ready' : 'Locked'} · Release: Owner-gated</p>
        <div className="trial-actions">
          {PRODUCT_LINKS.map(([product, path]) => <Link className="core-button" key={product} to={path}>Set up {product}</Link>)}
          <Link className="core-button" to="/settings/#controls">Backup and recovery</Link>
          <Link className="core-button" to="/settings/?view=local-metrics#controls">Device activity</Link>
        </div>
        <p className="authority-note">No deployment, publishing, contact, stock, payment, or managed write.</p>
      </section>
    </div>
  </div>
}
