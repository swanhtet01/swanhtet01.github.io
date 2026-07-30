import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router'

import './core-app.css'
import { recordBehaviorSignal } from './behavior-trail'

const ProductHomeReadiness = lazy(() => import('./ProductHomeReadiness').then((module) => ({ default: module.ProductHomeReadiness })))

type RuntimeStatus = 'checking' | 'enterprise' | 'demo'

type RuntimeActivationStep = {
  id: string
  label: string
  ready: boolean
  action: string
}

type RuntimeEvidencePlanItem = {
  id: string
  label: string
  ready: boolean
  proof: string
  verifier: string
}

type RuntimeActivationManifest = {
  contract: string
  mode: string
  ready_percent: number
  next_action: string
  blocked_gate_ids: string[]
  proof_commands: Record<string, string>
  safe_enable: string[]
  automation_boundary: string
  secret_values_exposed: boolean
}

type RuntimeImportProvisioningCheck = {
  id: string
  label: string
  ready: boolean
  action: string
}

type RuntimeImportProvisioning = {
  contract: string
  status: string
  ready: boolean
  checks: RuntimeImportProvisioningCheck[]
  forbidden_until_ready: string[]
  next_action: string
  secret_values_exposed: boolean
}

export type RuntimeHealth = {
  status: RuntimeStatus
  serviceStatus: string
  operatingMode: string
  enterpriseDbReady: boolean
  authReady: boolean
  auditReady: boolean
  writesReady: boolean
  coverageScore: number
  requirements: string[]
  activationSteps: RuntimeActivationStep[]
  evidencePlan: RuntimeEvidencePlanItem[]
  activationManifest: RuntimeActivationManifest | null
  importProvisioning: RuntimeImportProvisioning | null
}

const checkingRuntime: RuntimeHealth = {
  status: 'checking',
  serviceStatus: 'checking',
  operatingMode: 'unknown',
  enterpriseDbReady: false,
  authReady: false,
  auditReady: false,
  writesReady: false,
  coverageScore: 0,
  requirements: ['Checking managed activation.'],
  activationSteps: [],
  evidencePlan: [],
  activationManifest: null,
  importProvisioning: null,
}

const navigation = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop/', label: 'Shop' },
  { to: '/plant/', label: 'Plant' },
  { to: '/website/', label: 'Website' },
  { to: '/ecommerce/', label: 'Ecommerce' },
  { to: '/settings/', label: 'Settings' },
] as const

const THEME_KEY = 'supermega-interface-theme'
const SETUP_KEY = 'supermega.setup.v3'
const setupRequiredFields = ['workspace', 'owner', 'entryPoint', 'currentRecord', 'baseline', 'targetOutcome', 'authorityBoundary', 'acceptanceEvidence'] as const
type InterfaceTheme = 'light' | 'dark'

type LocalSetupReadiness = {
  product: 'commerce' | 'production' | 'website' | 'ecommerce'
  workspace: string
  currentRecord: string
  acceptanceEvidence: string
  progress: number
  ready: boolean
}

function readLocalSetupReadiness(): LocalSetupReadiness {
  try {
    const source = JSON.parse(window.localStorage.getItem(SETUP_KEY) ?? '{}') as Record<string, unknown>
    const field = (name: string) => typeof source[name] === 'string' ? source[name].trim() : ''
    const product = source.product === 'production' || source.product === 'website' || source.product === 'ecommerce'
      ? source.product
      : 'commerce'
    const completed = setupRequiredFields.filter((name) => field(name)).length
    const progress = Math.round((completed / setupRequiredFields.length) * 100)
    return {
      product,
      workspace: field('workspace'),
      currentRecord: field('currentRecord'),
      acceptanceEvidence: field('acceptanceEvidence'),
      progress,
      ready: progress === 100 && Boolean(field('savedAt')),
    }
  } catch {
    return { product: 'commerce', workspace: '', currentRecord: '', acceptanceEvidence: '', progress: 0, ready: false }
  }
}

function initialInterfaceTheme(): InterfaceTheme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Fall back to the browser theme below.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function productFromPathname(pathname: string) {
  if (pathname.startsWith('/shop/')) return 'commerce'
  if (pathname.startsWith('/plant/')) return 'production'
  if (pathname.startsWith('/website/')) return 'website'
  if (pathname.startsWith('/ecommerce/')) return 'ecommerce'
  return null
}

function productDisplayName(product: string) {
  if (product === 'commerce') return 'Shop'
  if (product === 'production') return 'Plant'
  if (product === 'website') return 'Website'
  if (product === 'ecommerce') return 'Ecommerce'
  return 'SuperMega'
}

function setupProductFromQuery(value: string | null) {
  if (value === 'commerce' || value === 'production' || value === 'website' || value === 'ecommerce') return value
  if (value === 'shop' || value === 'retail') return 'commerce'
  if (value === 'plant' || value === 'factory') return 'production'
  return null
}

function managedLoginPath(product: string | null) {
  const slug = product === 'commerce' ? 'shop' : product === 'production' ? 'plant' : product === 'website' || product === 'ecommerce' ? product : null
  return slug ? `/login?product=${slug}` : '/login'
}

function useRuntimeHealth() {
  const [runtime, setRuntime] = useState<RuntimeHealth>(checkingRuntime)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.includes('application/json')) throw new Error('health_unavailable')
        const body = (await response.json()) as {
          status?: string
          operating_mode?: string
          enterprise_db_ready?: boolean
          security_ready?: boolean
          coverage_score?: number
          authentication?: { trusted_gateway_ready?: boolean; supabase_user_tokens_ready?: boolean }
          trial_backend?: { audit_ready?: boolean; write_enabled?: boolean }
          enterprise_activation?: { requirements?: string[]; steps?: RuntimeActivationStep[]; evidence_plan?: RuntimeEvidencePlanItem[]; manifest?: RuntimeActivationManifest; import_provisioning?: RuntimeImportProvisioning }
        }
        const requirements = Array.isArray(body.enterprise_activation?.requirements) ? body.enterprise_activation.requirements : []
        const activationSteps = Array.isArray(body.enterprise_activation?.steps)
          ? body.enterprise_activation.steps.filter((step) => typeof step.id === 'string' && typeof step.label === 'string' && typeof step.ready === 'boolean' && typeof step.action === 'string')
          : []
        const evidencePlan = Array.isArray(body.enterprise_activation?.evidence_plan)
          ? body.enterprise_activation.evidence_plan.filter((item) => typeof item.id === 'string' && typeof item.label === 'string' && typeof item.ready === 'boolean' && typeof item.proof === 'string' && typeof item.verifier === 'string')
          : []
        const manifest = body.enterprise_activation?.manifest
        const activationManifest = manifest
          && manifest.contract === 'supermega.activation_manifest.v1'
          && typeof manifest.mode === 'string'
          && typeof manifest.ready_percent === 'number'
          && typeof manifest.next_action === 'string'
          && Array.isArray(manifest.blocked_gate_ids)
          && Array.isArray(manifest.safe_enable)
          && typeof manifest.proof_commands === 'object'
          && manifest.secret_values_exposed === false
          ? manifest
          : null
        const importProvisioning = body.enterprise_activation?.import_provisioning
        const managedImportProvisioning = importProvisioning
          && importProvisioning.contract === 'supermega.import_provisioning_readiness.v1'
          && typeof importProvisioning.status === 'string'
          && typeof importProvisioning.ready === 'boolean'
          && Array.isArray(importProvisioning.checks)
          && Array.isArray(importProvisioning.forbidden_until_ready)
          && typeof importProvisioning.next_action === 'string'
          && importProvisioning.secret_values_exposed === false
          ? {
            ...importProvisioning,
            checks: importProvisioning.checks.filter((check) => typeof check.id === 'string' && typeof check.label === 'string' && typeof check.ready === 'boolean' && typeof check.action === 'string'),
            forbidden_until_ready: importProvisioning.forbidden_until_ready.filter((action) => typeof action === 'string'),
          }
          : null
        const authReady = Boolean(body.authentication?.trusted_gateway_ready || body.authentication?.supabase_user_tokens_ready)
        const auditReady = body.trial_backend?.audit_ready === true
        const writesReady = body.trial_backend?.write_enabled === true
        const enterpriseReady = body.status === 'ready'
          && body.operating_mode === 'managed_trial'
          && body.enterprise_db_ready === true
          && authReady
          && auditReady
          && body.security_ready === true
          && writesReady
          && requirements.length === 0
        setRuntime({
          status: enterpriseReady ? 'enterprise' : 'demo',
          serviceStatus: body.status ?? 'unknown',
          operatingMode: body.operating_mode ?? 'unknown',
          enterpriseDbReady: body.enterprise_db_ready === true,
          authReady,
          auditReady,
          writesReady,
          coverageScore: Number.isFinite(body.coverage_score) ? Number(body.coverage_score) : 0,
          requirements,
          activationSteps,
          evidencePlan,
          activationManifest,
          importProvisioning: managedImportProvisioning,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRuntime({ ...checkingRuntime, status: 'demo', serviceStatus: 'unavailable', operatingMode: 'isolated_demo', requirements: ['Restore health before managed activation.'] })
      })
    return () => controller.abort()
  }, [])

  return runtime
}

function Brand() {
  return (
    <Link className="core-brand" to="/" aria-label="SuperMega app home">
      <span className="core-brand-mark" aria-hidden="true">&gt;_</span>
      <span className="core-brand-name">SUPERMEGA</span>
    </Link>
  )
}

export function RuntimeBadge({ status }: { status: RuntimeStatus }) {
  return <span className={`runtime-badge ${status}`}><i />{status === 'checking' ? 'Checking' : status === 'enterprise' ? 'Managed' : 'Sample workspace'}</span>
}

export function PageHeading({ eyebrow, title, copy, actions }: { eyebrow?: string; title: string; copy: string; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow ? <span className="core-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1><p>{copy}</p></div>{actions ? <div className="heading-actions">{actions}</div> : null}</header>
}

export function CoreLayout() {
  const location = useLocation()
  const runtime = useRuntimeHealth()
  const [theme, setTheme] = useState<InterfaceTheme>(initialInterfaceTheme)
  const workspaceMainRef = useRef<HTMLElement>(null)
  const routeProduct = productFromPathname(location.pathname)
  const settingsProduct = location.pathname.startsWith('/settings/') ? setupProductFromQuery(new URLSearchParams(location.search).get('product')) : null
  const sensitiveAccountRoute = location.pathname.startsWith('/account/')
  const loginRoute = location.pathname === '/login' || location.pathname === '/login/'
  const accountEntryRoute = loginRoute || sensitiveAccountRoute
  const companyLoginPath = managedLoginPath(routeProduct ?? settingsProduct)
  const routeName = loginRoute
    ? 'Sign in'
    : sensitiveAccountRoute
      ? (location.pathname.startsWith('/account/recovery') ? 'Account recovery' : 'Account setup')
      : location.pathname.startsWith('/website/')
      ? 'Website'
      : location.pathname.startsWith('/ecommerce/')
      ? 'Ecommerce'
      : location.pathname.startsWith('/settings/')
        ? 'Workspace'
        : location.pathname.startsWith('/shop/')
          ? 'Shop'
          : location.pathname.startsWith('/plant/')
            ? 'Plant'
            : navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Home'
  const navigationClass = (_to: string, isActive: boolean) => isActive ? 'active' : ''

  useEffect(() => {
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.search, routeName])

  useEffect(() => {
    const route = sensitiveAccountRoute ? location.pathname : `${location.pathname}${location.search}`
    const product = routeProduct ?? settingsProduct ?? 'unknown'
    recordBehaviorSignal(window.localStorage, {
      event: location.pathname === '/'
        ? 'home_opened'
        : location.pathname.startsWith('/settings/')
          ? (settingsProduct ? 'setup_opened' : 'settings_opened')
          : routeProduct
            ? 'product_opened'
            : 'settings_opened',
      product,
      route,
      detail: sensitiveAccountRoute ? 'Managed account access viewed.' : routeProduct ? `${productDisplayName(routeProduct)} workspace viewed.` : location.pathname.startsWith('/settings/') ? 'Setup and activation controls viewed.' : 'Product launcher viewed.',
    })
  }, [location.pathname, location.search, routeProduct, sensitiveAccountRoute, settingsProduct])

  useEffect(() => {
    document.documentElement.dataset.supermegaTheme = theme
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Theme remains active for this session when local storage is unavailable.
    }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')
  const themeLabel = theme === 'dark' ? 'Use light theme' : 'Use dark theme'

  return (
    <div className={`core-shell theme-${theme}${theme === 'dark' ? ' shop-shell' : ''}${routeProduct === 'production' ? ' plant-shell' : ''}`}>
      <a className="core-skip" href="#workspace-main" onClick={() => requestAnimationFrame(() => workspaceMainRef.current?.focus())}>Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <nav className="core-nav" aria-label="Application">
          {navigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={'end' in item ? item.end : undefined} key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot"><RuntimeBadge status={runtime.status} />{!accountEntryRoute ? <Link className="account-shell-link" to={companyLoginPath}>Company sign in</Link> : null}<button aria-label={themeLabel} className="theme-toggle" onClick={toggleTheme} type="button"><span aria-hidden="true">{theme === 'dark' ? '*' : 'o'}</span>{theme === 'dark' ? 'Light' : 'Dark'}</button></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><strong>{routeName}</strong><span>SuperMega</span></div><div className="topbar-meta">{!accountEntryRoute ? <Link aria-label="Company sign in" className="account-shell-link mobile-account-link" to={companyLoginPath}>Sign in</Link> : null}<button aria-label={themeLabel} className="theme-toggle mobile-theme-toggle" onClick={toggleTheme} type="button"><span aria-hidden="true">{theme === 'dark' ? '*' : 'o'}</span></button><RuntimeBadge status={runtime.status} /></div></header>
        <nav className="mobile-nav" aria-label="Mobile application">{navigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={'end' in item ? item.end : undefined} key={item.to} to={item.to}>{item.label}</NavLink>)}</nav>
        <main id="workspace-main" className={`core-main${routeProduct === 'ecommerce' ? ' natural-scroll' : ''}`} ref={workspaceMainRef} tabIndex={-1}>
          <div className="core-route-content"><Outlet context={runtime} /></div>
        </main>
      </div>
    </div>
  )
}

const customerTracks = [
  ['Shop', 'Retail, showroom, social selling.', 'Sell, reserve, review requests.', '/shop/?tab=counter', '/settings/?product=commerce'],
  ['Plant', 'Factory, workshop, service floor.', 'Plan, record, hand off shifts.', '/plant/?tab=production', '/settings/?product=production'],
  ['Website', 'Company site and proof catalog.', 'Create pages, offers, leads.', '/website/', '/settings/?product=website'],
  ['Ecommerce', 'Online ordering and delivery.', 'Build storefronts and Shop handoff.', '/ecommerce/', '/settings/?product=ecommerce'],
] as const

export function ProductHomePage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [setup] = useState(readLocalSetupReadiness)
  const activationCoverage = runtime.activationManifest?.ready_percent ?? runtime.coverageScore
  const hostedReady = runtime.operatingMode === 'managed_trial' && runtime.writesReady && runtime.requirements.length === 0
  const nextHostedAction = runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? 'Managed activation proof is still required.'
  const setupProductName = productDisplayName(setup.product)
  const autopilotRows = [
    ['Track', setup.workspace ? setupProductName : 'Pick one product', setup.workspace || 'Shop, Plant, Website, or Ecommerce.'],
    ['Data', setup.currentRecord ? 'First source named' : 'Local first', setup.currentRecord || 'Upload, paste, or describe one real record.'],
    ['Proof', setup.acceptanceEvidence ? 'Acceptance proof named' : 'Evidence before premium', setup.acceptanceEvidence || 'Define what proves the workflow works.'],
    ['AI context', setup.ready ? 'Ready for managed import' : 'Locked until approval', setup.ready ? 'Approved setup can now be exported for managed review.' : 'Premium can learn from approved data, roles, and audit.'],
  ] as const

  return (
    <div className="workspace-screen product-home-screen">
      <PageHeading copy="Use a local workspace first. Activate managed data and AI when ready." eyebrow="Products" title="Choose a product. Run work." />
      <section className="product-home-operating-model" aria-label="SuperMega operating model">
        <div>
          <span className="core-eyebrow">Free workspace</span>
          <strong>Sample data, imports, review, and evidence.</strong>
        </div>
        <div>
          <span className="core-eyebrow">Premium activation</span>
          <strong>Managed data, AI context, roles, audit, and writes.</strong>
        </div>
        <Link className="core-button primary" to="/settings/">Check readiness</Link>
      </section>
      <section className="product-home-autopilot" aria-label="AI operating plan">
        <div className="product-home-autopilot-head">
          <div>
            <span className="core-eyebrow">AI operating plan</span>
            <h2>Recommended next move</h2>
            <p>Choose a product, bring in real records, then export evidence for managed activation. No external send, publish, payment, or production write runs from this screen.</p>
          </div>
          <Link className="core-button primary" to={setup.ready ? '/settings/#controls' : '/settings/'}>{setup.ready ? 'Export evidence' : 'Check readiness'}</Link>
        </div>
        <div className="product-home-autopilot-grid">
          {autopilotRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}
        </div>
      </section>
      <Suspense fallback={<p className="form-notice" role="status">Loading launch readiness...</p>}>
        <ProductHomeReadiness activationCoverage={activationCoverage} hostedReady={hostedReady} nextHostedAction={nextHostedAction} progress={setup.progress} ready={setup.ready} />
      </Suspense>
      <nav aria-label="Business tracks" className="product-track-grid">
        {customerTracks.map(([name, fit, outcome, path, setupPath]) => (
          <article className="product-track-card" key={name}>
            <div>
              <span className="core-eyebrow">{fit}</span>
              <h2>{name}</h2>
              <p>{outcome}</p>
            </div>
            <div className="product-track-actions">
              <Link to={path}>Open product</Link>
              <Link to={setupPath}>Set up product</Link>
            </div>
          </article>
        ))}
      </nav>
    </div>
  )
}
