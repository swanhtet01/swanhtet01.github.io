import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import './core-app.css'
import { recordBehaviorSignal } from './behavior-trail'
import type { ClientSolutionId } from './client-onboarding'

const ProductSystemNavigator = lazy(() => import('./ProductSystemNavigator').then((module) => ({ default: module.ProductSystemNavigator })))

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
  requirements: ['Checking company account readiness.'],
  activationSteps: [],
  evidencePlan: [],
  activationManifest: null,
  importProvisioning: null,
}

const LAST_PRODUCT_KEY = 'supermega.last-product.v1'
const productWorkspacePaths: Record<ClientSolutionId, string> = {
  commerce: '/shop/',
  production: '/plant/',
  website: '/website/',
  ecommerce: '/ecommerce/',
}

function isClientSolutionId(value: unknown): value is ClientSolutionId {
  return value === 'commerce' || value === 'production' || value === 'website' || value === 'ecommerce'
}

function productWorkspacePath(product: ClientSolutionId) {
  return productWorkspacePaths[product]
}

function readLastProduct(storage: Pick<Storage, 'getItem'>): ClientSolutionId | null {
  try {
    const product = storage.getItem(LAST_PRODUCT_KEY)
    return isClientSolutionId(product) ? product : null
  } catch {
    return null
  }
}

function rememberLastProduct(storage: Pick<Storage, 'setItem'>, product: ClientSolutionId) {
  try {
    storage.setItem(LAST_PRODUCT_KEY, product)
  } catch {
    // Product memory is optional; the launcher remains available when storage is blocked.
  }
}

type NavigationItem = { to: string; label: string; end?: boolean }

const productsNavigation: NavigationItem = { to: '/?choose=1', label: 'Switch product', end: true }
const productNavigation: Record<ClientSolutionId, NavigationItem> = {
  commerce: { to: '/shop/', label: 'Shop' },
  production: { to: '/plant/', label: 'Plant' },
  website: { to: '/website/', label: 'Website' },
  ecommerce: { to: '/ecommerce/', label: 'Ecommerce' },
}

const THEME_KEY = 'supermega-interface-theme'
const SETUP_KEY = 'supermega.setup.v3'
const setupRequiredFields = ['workspace', 'owner', 'entryPoint', 'currentRecord', 'baseline', 'targetOutcome', 'authorityBoundary', 'acceptanceEvidence'] as const
type InterfaceTheme = 'light' | 'dark'

type LocalSetupReadiness = {
  product: 'commerce' | 'production' | 'website' | 'ecommerce'
  hasCanonicalProduct: boolean
  workspace: string
  currentRecord: string
  acceptanceEvidence: string
  progress: number
  ready: boolean
}

function isStoredSetupProduct(value: unknown): value is LocalSetupReadiness['product'] {
  return value === 'commerce' || value === 'production' || value === 'website' || value === 'ecommerce'
}

function readLocalSetupReadiness(): LocalSetupReadiness {
  try {
    const source = JSON.parse(window.localStorage.getItem(SETUP_KEY) ?? '{}') as Record<string, unknown>
    const field = (name: string) => typeof source[name] === 'string' ? source[name].trim() : ''
    let hasCanonicalProduct = false
    let product: LocalSetupReadiness['product'] = 'commerce'
    if (isStoredSetupProduct(source.product)) {
      hasCanonicalProduct = true
      product = source.product
    }
    const completed = setupRequiredFields.filter((name) => field(name)).length
    const progress = Math.round((completed / setupRequiredFields.length) * 100)
    return {
      product,
      hasCanonicalProduct,
      workspace: field('workspace'),
      currentRecord: field('currentRecord'),
      acceptanceEvidence: field('acceptanceEvidence'),
      progress,
      ready: progress === 100 && Boolean(field('savedAt')),
    }
  } catch {
    return { product: 'commerce', hasCanonicalProduct: false, workspace: '', currentRecord: '', acceptanceEvidence: '', progress: 0, ready: false }
  }
}

function initialInterfaceTheme(): InterfaceTheme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Keep the first-run interface readable even when storage is unavailable.
  }
  return 'light'
}

function productFromPathname(pathname: string): ClientSolutionId | null {
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
        if (!controller.signal.aborted) setRuntime({ ...checkingRuntime, status: 'demo', serviceStatus: 'unavailable', operatingMode: 'isolated_demo', requirements: ['Restore health before company account setup.'] })
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
  return <span className={`runtime-badge ${status}`}><i />{status === 'checking' ? 'Checking' : status === 'enterprise' ? 'Company data' : 'Demo mode'}</span>
}

export function PageHeading({ eyebrow, title, copy, actions }: { eyebrow?: string; title: string; copy: string; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow ? <span className="core-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1><p>{copy}</p></div>{actions ? <div className="heading-actions">{actions}</div> : null}</header>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span>&gt;_</span><p>{children}</p></div>
}

export function CoreLayout() {
  const location = useLocation()
  const runtime = useRuntimeHealth()
  const [theme, setTheme] = useState<InterfaceTheme>(initialInterfaceTheme)
  const workspaceMainRef = useRef<HTMLElement>(null)
  const routeProduct = productFromPathname(location.pathname)
  const customerSettingsRoute = location.pathname.startsWith('/settings/')
  const internalBuilderRoute = location.pathname.startsWith('/internal/client-builder')
  const settingsProduct = customerSettingsRoute ? setupProductFromQuery(new URLSearchParams(location.search).get('product')) : null
  const storedSettingsSetup = customerSettingsRoute || internalBuilderRoute ? readLocalSetupReadiness() : null
  const sensitiveAccountRoute = location.pathname.startsWith('/account/')
  const loginRoute = location.pathname === '/login' || location.pathname === '/login/'
  const accountEntryRoute = loginRoute || sensitiveAccountRoute
  const companyLoginPath = managedLoginPath(routeProduct ?? settingsProduct ?? (storedSettingsSetup?.workspace && storedSettingsSetup.hasCanonicalProduct ? storedSettingsSetup.product : null))
  const setupRoute = customerSettingsRoute || internalBuilderRoute
  const setupNavigation: NavigationItem = internalBuilderRoute
    ? { to: '/internal/client-builder/', label: 'Client builder' }
    : settingsProduct
      ? { to: `${location.pathname}${location.search}`, label: `${productDisplayName(settingsProduct)} setup` }
      : { to: '/settings/#controls', label: 'Recovery' }
  const activeNavigation: NavigationItem[] = routeProduct
    ? [productsNavigation, productNavigation[routeProduct]]
    : setupRoute
      ? [productsNavigation, setupNavigation]
      : [productsNavigation]
  const mobileNavigation = routeProduct || setupRoute ? activeNavigation : []
  const routeName = loginRoute
    ? 'Sign in'
    : sensitiveAccountRoute
      ? (location.pathname.startsWith('/account/recovery') ? 'Account recovery' : 'Account setup')
      : location.pathname.startsWith('/website/')
      ? 'Website'
      : location.pathname.startsWith('/ecommerce/')
      ? 'Ecommerce'
      : location.pathname.startsWith('/vision/')
        ? 'Vision'
      : internalBuilderRoute
        ? 'Client builder'
      : customerSettingsRoute
        ? (settingsProduct ? `${productDisplayName(settingsProduct)} setup` : 'Recovery')
        : location.pathname.startsWith('/shop/')
          ? 'Shop'
          : location.pathname.startsWith('/plant/')
            ? 'Plant'
            : 'Products'
  const navigationClass = (_to: string, isActive: boolean) => isActive ? 'active' : ''

  useEffect(() => {
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.hash, location.pathname, location.search, routeName])

  useEffect(() => {
    if (location.pathname.startsWith('/vision/')) return
    const route = sensitiveAccountRoute ? location.pathname : `${location.pathname}${location.search}${location.hash}`
    const product = routeProduct ?? settingsProduct ?? 'unknown'
    if (routeProduct) rememberLastProduct(window.localStorage, routeProduct)
    recordBehaviorSignal(window.localStorage, {
      event: location.pathname === '/'
        ? 'home_opened'
        : customerSettingsRoute
          ? (settingsProduct ? 'setup_opened' : 'settings_opened')
          : routeProduct
            ? 'product_opened'
            : 'settings_opened',
      product,
      route,
      detail: sensitiveAccountRoute
        ? 'Company account access viewed.'
        : routeProduct
          ? `${productDisplayName(routeProduct)} product viewed.`
          : internalBuilderRoute
            ? 'Internal client builder viewed.'
            : settingsProduct
              ? `${productDisplayName(settingsProduct)} onboarding viewed.`
              : customerSettingsRoute
                ? 'Recovery and activation controls viewed.'
                : 'Product launcher viewed.',
    })
  }, [customerSettingsRoute, internalBuilderRoute, location.hash, location.pathname, location.search, routeProduct, sensitiveAccountRoute, settingsProduct])

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
    <div className={`core-shell theme-${theme}${routeProduct === 'commerce' ? ' shop-product-shell' : ''}${routeProduct === 'production' ? ' plant-shell' : ''}`}>
      <a className="core-skip" href="#workspace-main" onClick={() => requestAnimationFrame(() => workspaceMainRef.current?.focus())}>Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <nav className="core-nav" aria-label="Application">
          {activeNavigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot">{routeProduct || setupRoute ? <RuntimeBadge status={runtime.status} /> : null}{!accountEntryRoute ? <Link className="account-shell-link" to={companyLoginPath}>Company login</Link> : null}<button aria-label={themeLabel} className="theme-toggle" onClick={toggleTheme} type="button"><span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>{theme === 'dark' ? 'Light' : 'Dark'}</button></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><strong>{routeName}</strong><span>SuperMega</span></div><div className="topbar-meta">{!accountEntryRoute ? <Link aria-label="Company login" className="account-shell-link mobile-account-link" to={companyLoginPath}>Login</Link> : null}<button aria-label={themeLabel} className="theme-toggle mobile-theme-toggle" onClick={toggleTheme} type="button"><span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span></button><RuntimeBadge status={runtime.status} /></div></header>
        {mobileNavigation.length > 0 ? <nav className="mobile-nav" aria-label="Current product navigation">{mobileNavigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}</nav> : null}
        <main id="workspace-main" className={`core-main${routeProduct ? ' has-system-navigator' : ''}${routeProduct === 'ecommerce' ? ' natural-scroll' : ''}`} ref={workspaceMainRef} tabIndex={-1}>
          <div className="core-route-content"><Outlet context={runtime} /></div>
          {routeProduct ? <Suspense fallback={null}><ProductSystemNavigator key={`${location.pathname}${location.search}`} product={routeProduct} /></Suspense> : null}
        </main>
      </div>
    </div>
  )
}

const customerProducts = [
  ['Shop', 'Sell and manage stock', 'Counter sales, inventory, orders, and daily close.', '/shop/'],
  ['Plant', 'Run production', 'Jobs, materials, output, quality, and traceability.', '/plant/'],
  ['Website', 'Publish your business', 'Pages, services, inquiries, and launch preview.', '/website/'],
  ['Ecommerce', 'Take online orders', 'Storefront, checkout, delivery, and Shop handoff.', '/ecommerce/'],
] as const

export function ProductHomeEntry({ productDemoPath }: { productDemoPath: (value: string | null) => string | null }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const route = productDemoPath(params.get('demo'))
  const choosingProduct = params.get('choose') === '1'
  const lastProduct = !route && !choosingProduct && typeof window !== 'undefined'
    ? readLastProduct(window.localStorage)
    : null
  return route
    ? <Navigate replace to={route} />
    : lastProduct
      ? <Navigate replace to={productWorkspacePath(lastProduct)} />
      : <ProductHomePage />
}

export function ProductHomePage() {
  return (
    <div className="workspace-screen product-home-screen">
      <PageHeading copy="Pick one workspace. SuperMega remembers it on this device; use Switch product whenever you need another." eyebrow="Products" title="Choose one product" />
      <nav aria-label="Choose a SuperMega product" className="product-track-grid">
        {customerProducts.map(([name, job, outcome, path], index) => (
          <Link aria-label={`Open ${name}`} className="product-track-card" key={name} to={path}>
            <span aria-hidden="true" className="product-track-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="product-track-copy">
              <small>{job}</small>
              <h2>{name}</h2>
              <p>{outcome}</p>
            </span>
            <strong className="product-track-open">Open <span aria-hidden="true">→</span></strong>
          </Link>
        ))}
      </nav>
      <p className="product-home-note">No account or setup is required. Products stay separate and connect only through reviewed handoffs.</p>
    </div>
  )
}
