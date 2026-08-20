import { lazy, Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import './core-app.css'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { recordBehaviorSignal } from './behavior-trail'
import { activeCommerceTab, commerceTabs } from './commerce-tabs'
import type { ClientSolutionId } from './client-onboarding'
import { clientSetupPath, readProductSetup, type SetupProductId } from './product-setup'

const ProductSystemNavigator = lazy(() => import('./ProductSystemNavigator').then((module) => ({ default: module.ProductSystemNavigator })))
const WorkspaceStatusPanel = lazy(() => import('./WorkspaceStatusPanel').then((m) => ({ default: m.WorkspaceStatusPanel })))

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
const DEFAULT_ENTRY_PRODUCT: ClientSolutionId = 'commerce'
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

// Design phase 2 item 10: the toggle used to render as the raw glyphs ☼/◐, which
// have inconsistent font coverage across platforms (missing or mismatched-weight
// on several Android system fonts). Plain stroke SVGs render identically everywhere
// and pick up the button's own color via currentColor.
function SunIcon() {
  return (
    <svg aria-hidden="true" className="theme-toggle-icon" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.8" />
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
        <path d="M12 2.5v2.6M12 18.9v2.6M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
      </g>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" className="theme-toggle-icon" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M20.2 14.4A8.6 8.6 0 1 1 9.6 3.8a7 7 0 0 0 10.6 10.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
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
    ? [productNavigation[routeProduct], productsNavigation]
    : setupRoute
      ? [setupNavigation, productsNavigation]
      : [productsNavigation]
  const mobileNavigation = routeProduct || setupRoute ? activeNavigation : []
  // Design phase 3 "bottom-nav work modes", Shop slice: on phones the fixed
  // bottom bar carries Shop's four task modes instead of the two-link product
  // nav. Resolution of the active tab is shared with OperationsPage
  // (activeCommerceTab), so the highlight matches the in-page toolbar even
  // during the frame before that page canonicalizes a missing ?tab=.
  const mobileCommerceTab = routeProduct === 'commerce' ? activeCommerceTab(new URLSearchParams(location.search).get('tab')) : null
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#05080d' : '#f6f4ee')
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
        <div className="sidebar-foot">{routeProduct || setupRoute ? <RuntimeBadge status={runtime.status} /> : null}{!accountEntryRoute ? <Link className="account-shell-link signup-shell-link" to="/signup">Free trial</Link> : null}{!accountEntryRoute ? <Link className="account-shell-link" to={companyLoginPath}>Company login</Link> : null}<button aria-label={themeLabel} className="theme-toggle" onClick={toggleTheme} type="button">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}{theme === 'dark' ? 'Light' : 'Dark'}</button></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><strong>{routeName}</strong><span>SuperMega</span></div><div className="topbar-meta">{!accountEntryRoute ? <Link className="account-shell-link mobile-signup-topbar-link" to="/signup">Free trial</Link> : null}{!accountEntryRoute ? <Link aria-label="Company login" className="account-shell-link mobile-account-link" to={companyLoginPath}>Login</Link> : null}<button aria-label={themeLabel} className="theme-toggle mobile-theme-toggle" onClick={toggleTheme} type="button">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</button><RuntimeBadge status={runtime.status} /></div></header>
        {/* Shop's bottom bar is task navigation (all four links share the /shop/
            pathname, so NavLink's pathname-based isActive would mark every tab
            active — the highlight must come from the ?tab= param instead). Every
            other route keeps the existing two-link product nav unchanged. The
            fifth Products item is the only mobile door to /?choose=1 — the
            sidebar is display:none at this breakpoint and the brand link
            redirects to the last product, so removing it strands mobile Shop
            users inside one product. It is a plain Link with no active state:
            on /?choose=1 routeProduct is null and this bar never renders. */}
        {routeProduct === 'commerce'
          ? <nav className="mobile-nav mobile-task-nav" aria-label="Shop task shortcuts">{commerceTabs.map((tab) => <Link aria-current={mobileCommerceTab === tab.id ? 'page' : undefined} className={mobileCommerceTab === tab.id ? 'active' : ''} key={tab.id} replace to={`/shop/?tab=${tab.id}`}>{tab.label}</Link>)}<Link to="/?choose=1">Products</Link></nav>
          : mobileNavigation.length > 0 ? <nav className="mobile-nav" aria-label="Current product navigation">{mobileNavigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}</nav> : null}
        <main id="workspace-main" className={`core-main${routeProduct ? ' has-system-navigator' : ''}${routeProduct === 'ecommerce' ? ' natural-scroll' : ''}`} ref={workspaceMainRef} tabIndex={-1}>
          <div className="core-route-content">
            <RouteErrorBoundary resetKey={location.pathname}><Outlet context={runtime} /></RouteErrorBoundary>
          </div>
          {/* The navigator is its own lazy chunk, so a stale deploy can fail it independently
              of the route. Outside a boundary that failure escapes to the root and unmounts
              the entire shell — the exact blank page the boundary exists to prevent, reached
              by a different door. It is secondary furniture, so its own boundary is enough:
              the route content beside it keeps working. */}
          {routeProduct ? <RouteErrorBoundary resetKey={`nav:${location.pathname}`}><Suspense fallback={null}><ProductSystemNavigator key={`${location.pathname}${location.search}`} managed={runtime.status === 'enterprise'} product={routeProduct} /></Suspense></RouteErrorBoundary> : null}
        </main>
      </div>
    </div>
  )
}

const PRODUCT_SETUP_KEY: Record<string, SetupProductId> = {
  Shop: 'commerce',
  Plant: 'production',
  Website: 'website',
  Ecommerce: 'ecommerce',
}

const STEP_SUGGESTIONS: ReadonlyArray<[SetupProductId, string, string]> = [
  ['commerce', 'Shop', 'build your catalog and complete your first sale'],
  ['ecommerce', 'Ecommerce', 'receive online orders that flow into Shop'],
  ['production', 'Plant', 'link production runs to your Shop stock'],
  ['website', 'Website', 'give your business a public face'],
]

// The chooser is four product tiles; the attention panel underneath them is
// secondary furniture. Its own chunk is small, but it reaches commerce-workspace,
// production-workspace and website-model to build its list, and those pull ~170 KB
// gz -- 65% of everything the chooser downloads (measured:
// hq/strategy/ANDROID-PERFORMANCE-BASELINE.md) -- to show at most six links. Mount
// it only after the browser has drawn the tiles and gone idle, so a visitor who taps
// a product straight away spends the whole pipe on that product instead of on a
// panel they never read. requestIdleCallback and a plain timer race each other and
// the first to fire wins, so a tab that never reports idle -- or a browser with no
// requestIdleCallback at all -- still gets the panel rather than losing it.
//
// The wait is paid once per document, not once per visit. Once the panel has
// mounted, its chunks are in the module registry and a later return to the
// chooser -- via the mobile Products door, say -- costs nothing to render it
// immediately, so making that visit wait again would be a delay that buys
// nothing.
const STATUS_PANEL_MOUNT_DELAY_MS = 1200
let statusPanelChunksLoaded = false

function useMountAfterPaint() {
  const [mounted, setMounted] = useState(statusPanelChunksLoaded)
  useEffect(() => {
    if (statusPanelChunksLoaded) return
    const show = () => {
      statusPanelChunksLoaded = true
      setMounted(true)
    }
    const timer = window.setTimeout(show, STATUS_PANEL_MOUNT_DELAY_MS)
    const idleHandle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(show, { timeout: STATUS_PANEL_MOUNT_DELAY_MS })
      : null
    return () => {
      window.clearTimeout(timer)
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle)
    }
  }, [])
  return mounted
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
    : choosingProduct
      ? <ProductHomePage />
      : <Navigate replace to={productWorkspacePath(lastProduct ?? DEFAULT_ENTRY_PRODUCT)} />
}

export function ProductHomePage() {
  const statusPanelMounted = useMountAfterPaint()
  const productSetups = useMemo(() => {
    if (typeof window === 'undefined') return null
    return {
      commerce: readProductSetup(window.localStorage, 'commerce'),
      production: readProductSetup(window.localStorage, 'production'),
      website: readProductSetup(window.localStorage, 'website'),
      ecommerce: readProductSetup(window.localStorage, 'ecommerce'),
    }
  }, [])
  const anyStarted = productSetups ? Object.values(productSetups).some((s) => s?.startedAt) : false
  const nextSetupStep = (() => {
    if (!productSetups) return null
    return STEP_SUGGESTIONS.find(([id]) => !productSetups[id]?.startedAt) ?? null
  })()
  return (
    <div className="workspace-screen product-home-screen">
      <PageHeading copy="Each product opens as its own working sample. Setup is optional when you are ready to use your business data." eyebrow="Products" title="Switch product" />
      {!anyStarted ? (
        <p className="platform-start-nudge"><strong>New here?</strong> Start with <Link className="platform-start-link" to={clientSetupPath('commerce')}><strong>Shop</strong></Link> — set it up once, and it connects to all other products through one catalog and order flow.</p>
      ) : nextSetupStep ? (
        <p className="platform-start-nudge"><strong>Next:</strong> Set up <Link className="platform-start-link" to={clientSetupPath(nextSetupStep[0])}><strong>{nextSetupStep[1]}</strong></Link> to {nextSetupStep[2]}.</p>
      ) : null}
      <nav aria-label="Choose a SuperMega product" className="product-track-grid">
        {customerProducts.map(([name, job, outcome, path], index) => {
          const setupKey = PRODUCT_SETUP_KEY[name]
          const setup = productSetups?.[setupKey]
          const workspaceName = setup?.startedAt ? setup.workspace : null
          return <Link aria-label={`Open ${name} workspace`} className="product-track-card" data-active={workspaceName ? true : undefined} key={name} to={path}>
              <span aria-hidden="true" className="product-track-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="product-track-copy">
                <small>{job}</small>
                <h2>{name}</h2>
                <p>{outcome}</p>
                {workspaceName ? <span className="product-track-workspace">{workspaceName}</span> : null}
              </span>
              <strong className="product-track-open">Open {name} <span aria-hidden="true">→</span></strong>
            </Link>
        })}
      </nav>
      {statusPanelMounted ? <Suspense fallback={null}><WorkspaceStatusPanel /></Suspense> : null}
      <p className="product-home-note">Your product workspaces stay separate. Opening a sample does not change another product.</p>
    </div>
  )
}
