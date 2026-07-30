import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import {
  COMMERCE_KEY,
  createSeedCommerce,
  validateCommerceState,
  type CommerceState,
} from './commerce-workspace'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  type ManagedStateRecord,
} from './managed-trial'
import {
  buildOperationalReport,
  buildSharedMasterDataDryRunPlan,
  exportOperationalReport,
  exportSharedMasterDataReviewPacket,
  filterOperationalReport,
  operationalProducts,
  OPERATIONAL_REPORT_VIEW_KEY,
  restoreOperationalReportView,
  type OperationalProduct,
  type OperationalReport,
  type OperationalReportView,
  type OperationalSource,
  type SharedMasterDataResolution,
} from './operational-report'
import {
  PRODUCTION_KEY,
  createSeedProduction,
  validateProductionState,
  type ProductionState,
} from './production-workspace'
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_STORAGE_KEY,
  createInitialWorkspace,
  loadWebsiteWorkspace,
  restoreWorkspace,
  type WebsiteWorkspace,
} from '../products/website/website-model'

type RuntimeStatus = 'checking' | 'enterprise' | 'demo'

const productLabel: Record<OperationalProduct, string> = {
  commerce: 'Shop',
  production: 'Plant',
  website: 'Website',
  ecommerce: 'Ecommerce',
}

function readJson(key: string) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function localOperationalReport() {
  const commerceRaw = readJson(COMMERCE_KEY)
  const productionRaw = readJson(PRODUCTION_KEY)
  const websiteRaw = readJson(WEBSITE_STORAGE_KEY) ?? readJson(LEGACY_WEBSITE_STORAGE_KEY)
  let commerce: CommerceState | undefined
  let production: ProductionState | undefined
  let website: WebsiteWorkspace | undefined
  let commerceMode: OperationalSource['mode'] = commerceRaw ? 'record' : 'sample'
  let productionMode: OperationalSource['mode'] = productionRaw ? 'record' : 'sample'
  let websiteMode: OperationalSource['mode'] = websiteRaw ? 'record' : 'sample'
  try { commerce = commerceRaw ? validateCommerceState(JSON.parse(commerceRaw)) : createSeedCommerce() } catch { commerceMode = 'error' }
  try { production = productionRaw ? validateProductionState(JSON.parse(productionRaw)) : createSeedProduction() } catch { productionMode = 'error' }
  try {
    if (websiteRaw) {
      const loaded = loadWebsiteWorkspace(window.localStorage)
      if (!loaded.ok) websiteMode = 'error'
      else website = loaded.workspace
    } else website = createInitialWorkspace()
  } catch { websiteMode = 'error' }
  return buildOperationalReport({
    mode: 'local',
    allowedProducts: operationalProducts,
    sources: [
      { surface: 'commerce', mode: commerceMode, revision: null, updatedAt: null },
      { surface: 'production', mode: productionMode, revision: production?.revision ?? null, updatedAt: null },
      { surface: 'website', mode: websiteMode, revision: website?.revision ?? null, updatedAt: null },
    ],
    commerce,
    production,
    website,
    now: Date.now(),
  })
}

function normalizedManagedTime(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function managedSource(record: ManagedStateRecord): OperationalSource {
  if (!Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed operational report source is invalid.')
  return { surface: record.surface as OperationalSource['surface'], mode: 'managed', revision: record.version, updatedAt: normalizedManagedTime(record.updated_at) }
}

async function managedOperationalReport() {
  const identity = await currentManagedIdentity()
  if (!identity) return localOperationalReport()
  const bootstrap = await loadManagedBootstrap(identity)
  const allowedProducts: OperationalProduct[] = []
  const sources: OperationalSource[] = []
  let commerce: CommerceState | undefined
  let production: ProductionState | undefined
  let website: WebsiteWorkspace | undefined
  const commerceRecord = bootstrap.states.commerce
  if (commerceRecord) {
    allowedProducts.push('commerce')
    sources.push(managedSource(commerceRecord))
    if (commerceRecord.version > 0) commerce = validateCommerceState(commerceRecord.state)
  }
  const productionRecord = bootstrap.states.production
  if (productionRecord) {
    allowedProducts.push('production')
    sources.push(managedSource(productionRecord))
    if (productionRecord.version > 0) production = validateProductionState(productionRecord.state)
  }
  const websiteRecord = bootstrap.states.website
  if (websiteRecord) {
    allowedProducts.push('website')
    sources.push(managedSource(websiteRecord))
    if (websiteRecord.version > 0) {
      website = restoreWorkspace(websiteRecord.state) ?? undefined
      if (!website) throw new Error('Managed Website report source failed validation.')
    }
  }
  if (commerceRecord) allowedProducts.push('ecommerce')
  if (!allowedProducts.length) throw new Error('Your role has no product read capability in this workspace.')
  return buildOperationalReport({ mode: 'managed', allowedProducts, sources, commerce, production, website, now: Date.now() })
}

function initialView() {
  try { return restoreOperationalReportView(JSON.parse(window.localStorage.getItem(OPERATIONAL_REPORT_VIEW_KEY) ?? 'null'), operationalProducts) } catch { return restoreOperationalReportView(null, operationalProducts) }
}

function saveJsonFile(value: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

type DuplicateDecisionDraft = {
  observedAt: string
  owner: string
  evidence: string
  resolutions: Record<string, SharedMasterDataResolution | ''>
}

const emptyDuplicateDecisionDraft: DuplicateDecisionDraft = { observedAt: '', owner: '', evidence: '', resolutions: {} }

export function ProductHomeToday({ runtimeStatus = 'demo' }: { runtimeStatus?: RuntimeStatus }) {
  const [report, setReport] = useState<OperationalReport | null>(() => runtimeStatus === 'enterprise' || runtimeStatus === 'checking' ? null : localOperationalReport())
  const [view, setView] = useState<OperationalReportView>(initialView)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(runtimeStatus !== 'demo')
  const [duplicateDecisionDraft, setDuplicateDecisionDraft] = useState<DuplicateDecisionDraft>(emptyDuplicateDecisionDraft)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setNotice('')
      if (runtimeStatus === 'checking') setReport(null)
    })
    if (runtimeStatus === 'checking') return () => { active = false }
    void (runtimeStatus === 'enterprise' ? managedOperationalReport() : Promise.resolve(localOperationalReport()))
      .then((next) => {
        if (!active) return
        setReport(next)
        setView((current) => restoreOperationalReportView(current, next.allowedProducts))
      })
      .catch(() => {
        if (!active) return
        setReport(null)
        setNotice('The operational report could not verify its authorized sources. Open the product directly; no sample values were substituted.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [runtimeStatus])

  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (runtimeStatus === 'enterprise') return
      if (event.key === null || [COMMERCE_KEY, PRODUCTION_KEY, WEBSITE_STORAGE_KEY, LEGACY_WEBSITE_STORAGE_KEY].includes(event.key)) {
        setReport(localOperationalReport())
      }
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [runtimeStatus])

  useEffect(() => {
    try { window.localStorage.setItem(OPERATIONAL_REPORT_VIEW_KEY, JSON.stringify(view)) } catch { /* Keep the view for this session. */ }
  }, [view])

  const visibleEntries = useMemo(() => report ? filterOperationalReport(report, view) : [], [report, view])
  const tasks = useMemo(() => {
    if (!report) return []
    const seen = new Set<OperationalProduct>()
    return report.entries.filter((entry) => {
      if (seen.has(entry.product)) return false
      seen.add(entry.product)
      return true
    })
  }, [report])
  const next = tasks[0]
  const activeDuplicateDecision = report?.observedAt === duplicateDecisionDraft.observedAt ? duplicateDecisionDraft : emptyDuplicateDecisionDraft

  function updateDuplicateDecision(update: (current: DuplicateDecisionDraft) => DuplicateDecisionDraft) {
    if (!report) return
    setDuplicateDecisionDraft((current) => update(current.observedAt === report.observedAt ? current : { ...emptyDuplicateDecisionDraft, observedAt: report.observedAt }))
  }

  async function downloadReport() {
    if (!report) return
    setNotice('Sealing the filtered report...')
    try {
      const artifact = await exportOperationalReport(report, view)
      saveJsonFile(artifact, `supermega-operational-report-${report.observedAt.slice(0, 10)}.json`)
      setNotice(`Downloaded ${artifact.entries.length} permission-filtered entries. No customer values or external writes were included.`)
    } catch {
      setNotice('The report could not be sealed. Nothing was downloaded.')
    }
  }

  async function downloadDuplicateReview() {
    if (!report || !report.masterData.duplicateCandidates) return
    setNotice('Sealing the ID-only duplicate review...')
    try {
      const artifact = await exportSharedMasterDataReviewPacket(report)
      saveJsonFile(artifact, `supermega-master-duplicate-review-${report.observedAt.slice(0, 10)}.json`)
      setNotice(`Downloaded ${artifact.candidates.length} duplicate review candidate${artifact.candidates.length === 1 ? '' : 's'}. No names, merge, source mutation, or external write was included.`)
    } catch {
      setNotice('The duplicate review could not be sealed. Nothing was downloaded or changed.')
    }
  }

  async function downloadDuplicateDryRun() {
    if (!report || !report.masterData.duplicateCandidates) return
    setNotice('Validating the human decisions and owner routes...')
    try {
      const reviewPacket = await exportSharedMasterDataReviewPacket(report)
      const plan = await buildSharedMasterDataDryRunPlan(reviewPacket, {
        decidedBy: activeDuplicateDecision.owner,
        evidenceReference: activeDuplicateDecision.evidence,
        decisions: reviewPacket.candidates.map((candidate) => ({ candidateId: candidate.id, resolution: activeDuplicateDecision.resolutions[candidate.id] as SharedMasterDataResolution })),
      })
      saveJsonFile(plan, `supermega-master-data-dry-run-${report.observedAt.slice(0, 10)}.json`)
      setNotice(`Downloaded ${plan.routes.length} owner-routed dry-run action${plan.routes.length === 1 ? '' : 's'}. No source record was changed.`)
    } catch {
      setNotice('Complete every decision, owner, and evidence field. Nothing was downloaded or changed.')
    }
  }

  if (!report || !next) {
    return <section className="product-home-today" aria-label="Today across SuperMega"><div className="product-home-today-head"><div><span className="core-eyebrow">Today</span><h2>{loading ? 'Checking authorized work...' : 'Operational report unavailable'}</h2><p>{notice || 'No verified product source is available yet.'}</p></div><Link className="core-button primary" to="/settings/">Open setup</Link></div></section>
  }

  const attentionCount = report.summary.critical + report.summary.warning + report.summary.action
  return (
    <section className="product-home-today" aria-label="Today across SuperMega">
      <div className="product-home-today-head">
        <div><span className="core-eyebrow">Today · {report.mode === 'managed' ? 'managed records' : report.sources.some((source) => source.mode === 'sample') ? 'local sample' : 'local records'}</span><h2>{next.label}</h2><p>{next.detail} This queue and report are read-only; each product still owns every change.</p></div>
        <Link className="core-button primary" to={next.route}>Open {productLabel[next.product]}</Link>
      </div>
      <div className="product-home-today-grid">
        {tasks.map((entry, index) => (
          <Link data-next={index === 0 ? 'true' : 'false'} key={entry.product} to={entry.route}>
            <span><small>{productLabel[entry.product]} · {entry.severity}</small><strong>{entry.label}</strong><em>{entry.detail}</em></span>
            <b>{entry.count || 'Open'}</b>
          </Link>
        ))}
      </div>
      <details className="product-home-report">
        <summary><span><strong>Operational report</strong><small>{attentionCount} attention · {report.allowedProducts.length} authorized products</small></span><b>Filter and export</b></summary>
        <div className="product-home-report-body">
          <div className="product-home-report-controls">
            <label>Product<select value={view.product} onChange={(event) => setView((current) => ({ ...current, product: event.target.value as OperationalReportView['product'] }))}><option value="all">All authorized</option>{report.allowedProducts.map((product) => <option key={product} value={product}>{productLabel[product]}</option>)}</select></label>
            <label>View<select value={view.urgency} onChange={(event) => setView((current) => ({ ...current, urgency: event.target.value as OperationalReportView['urgency'] }))}><option value="attention">Needs attention</option><option value="critical">Critical only</option><option value="all">All including ready</option></select></label>
            <button className="core-button compact" onClick={() => void downloadReport()} type="button">Download report</button>
            {report.masterData.duplicateCandidates ? <button className="core-button compact" onClick={() => void downloadDuplicateReview()} type="button">Download duplicate review</button> : null}
          </div>
          <div className="product-home-report-list">
            {visibleEntries.length ? visibleEntries.map((entry) => <Link data-severity={entry.severity} key={entry.id} to={entry.route}><span><small>{productLabel[entry.product]} · {entry.id}</small><strong>{entry.label}</strong><em>{entry.detail}</em></span><b>{entry.count || 'Ready'}</b></Link>) : <p>No authorized entries match this saved view.</p>}
          </div>
          <div className="form-row" aria-label="Authorized master data coverage">{report.masterData.dimensions.map((dimension) => <span className={`status-pill ${dimension.status === 'ready' ? 'bounded' : 'pending'}`} key={dimension.id}>{productLabel[dimension.product]} · {dimension.label} {dimension.recordCount}</span>)}</div>
          <p className="product-home-report-source">Master data coverage uses counts only: {report.masterData.totalRecords} authorized records · {report.masterData.attentionDimensions} dimensions need setup or recovery · {report.masterData.duplicateCandidates} duplicate reviews. Customer and record values are excluded; no merge is automatic.</p>
          {report.masterData.duplicateCandidates ? <div className="master-data-review-workflow" aria-label="Resolve duplicate master data">
            <div><strong>Review duplicate records</strong><small>Choose the intended relationship. SuperMega will download a dry-run plan for the owning product; it will not change either record.</small></div>
            {report.masterData.duplicateReview.candidates.map((candidate) => <label key={candidate.id}><span>{candidate.id} · {candidate.recordIds.join(' + ')}</span><select aria-label={`${candidate.id} resolution`} value={activeDuplicateDecision.resolutions[candidate.id] ?? ''} onChange={(event) => updateDuplicateDecision((current) => ({ ...current, resolutions: { ...current.resolutions, [candidate.id]: event.target.value as SharedMasterDataResolution | '' } }))}><option value="">Choose resolution</option>{candidate.kind === 'business_partner' ? <><option value="retain_separate_roles">Keep separate roles</option><option value="link_shared_party">Link one shared party</option></> : <><option value="retain_separate_locations">Keep separate locations</option><option value="merge_in_owner">Merge in owning product</option></>}</select></label>)}
            <div className="form-row"><label><span>Decision owner</span><input autoComplete="name" maxLength={120} onChange={(event) => updateDuplicateDecision((current) => ({ ...current, owner: event.target.value }))} placeholder="Named reviewer" value={activeDuplicateDecision.owner} /></label><label><span>Evidence reference</span><input maxLength={240} onChange={(event) => updateDuplicateDecision((current) => ({ ...current, evidence: event.target.value }))} placeholder="Ticket, file, or meeting note" value={activeDuplicateDecision.evidence} /></label></div>
            <button className="core-button compact" disabled={!activeDuplicateDecision.owner.trim() || !activeDuplicateDecision.evidence.trim() || report.masterData.duplicateReview.candidates.some((candidate) => !activeDuplicateDecision.resolutions[candidate.id])} onClick={() => void downloadDuplicateDryRun()} type="button">Download owner-routed dry run</button>
          </div> : null}
          <p className="product-home-report-source">Sources: {report.sources.map((source) => `${source.surface} ${source.mode}${source.revision === null ? '' : ` r${source.revision}`}`).join(' · ')}. View filters are saved on this device; permissions always come from the managed bootstrap.</p>
          {notice ? <p className="form-notice" role="status">{notice}</p> : null}
        </div>
      </details>
    </section>
  )
}
