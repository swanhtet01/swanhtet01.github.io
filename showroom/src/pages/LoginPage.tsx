import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { buildProofLoginHref, productDemoSurfaces, productFocusLanes } from '../lib/demoSurfaces'
import { isPosAuthHost } from '../lib/posAuth'
import { resolveTenantLandingRoute } from '../lib/tenantRoleExperience'
import {
  appHref,
  demoLoginWorkspace,
  getWorkspaceSession,
  loginWorkspace,
  needsLiveAppHandoff,
  publicShellOnly,
} from '../lib/workspaceApi'
import { getTenantConfig, type TenantConfig } from '../lib/tenantConfig'

type WorkspaceOption = {
  slug?: string
  name?: string
  role?: string
}

type ProductDemoSurface = (typeof productDemoSurfaces)[number] | (typeof productFocusLanes)[number]

const DEMO_WORKSPACE_SLUG = 'supermega-demo'
const CLIENT_DEMO_PORTAL_IDS = new Set(['easy-erp', 'ai-workflow-desk', 'operations-digital-twin', 'restaurant-group-os'])
const CLIENT_DEMO_APP_ROUTES = new Set([
  '/app/start',
  '/app/custom-workflow',
  '/app/factory-operations',
  '/app/restaurant-pos',
  '/app/ai-workflow-desk',
  '/app/operations-twin',
  '/app/restaurant-os',
])
const POS_DEMO_PORTAL_ID = 'restaurant-group-os'
const POS_DEMO_ROUTES = new Set(['/app/restaurant-pos', '/app/restaurant-os'])

function resolveDemoLoginPortalId(demo: ProductDemoSurface) {
  if (demo.portalId === 'agentops-toolbox') {
    return 'ai-workflow-desk'
  }
  return demo.portalId
}

function resolveDemoNavigateRoute(demo: ProductDemoSurface) {
  if (demo.portalId === 'agentops-toolbox') {
    return '/app/start'
  }
  return demo.to as string
}

function normalizeWorkspaceOptions(options: WorkspaceOption[]) {
  return options.filter((item): item is Required<Pick<WorkspaceOption, 'slug'>> & WorkspaceOption => Boolean(item.slug))
}

function sanitizeNextRoute(nextRoute: string | null) {
  const requestedRoute = String(nextRoute ?? '').trim()
  if (!requestedRoute || requestedRoute === '/app') {
    return '/app/start'
  }
  if (!requestedRoute.startsWith('/app/') || requestedRoute.startsWith('//') || requestedRoute.includes('\\') || requestedRoute.includes('&')) {
    return '/app/start'
  }
  return requestedRoute
}

function isPosProofRequest(nextRoute: string, proofParam: string | null | undefined) {
  const normalizedProof = String(proofParam || '').trim().toLowerCase()
  return normalizedProof === POS_DEMO_PORTAL_ID || POS_DEMO_ROUTES.has(nextRoute)
}

function resolvePostLoginRoute(nextRoute: string, tenantKey: TenantConfig['key'], role?: string | null) {
  if (tenantKey === 'ytf-plant-a') {
    const ytfShellRoutes = new Set(['/app', '/app/start', '/app/portal', '/app/manager-system'])
    if (ytfShellRoutes.has(nextRoute)) {
      return resolveTenantLandingRoute(tenantKey, role)
    }
  }

  if (nextRoute && nextRoute.startsWith('/app/') && !nextRoute.startsWith('//') && !nextRoute.includes('\\')) {
    return nextRoute
  }
  return resolveTenantLandingRoute(tenantKey, role)
}

function isDemoSession(session?: { workspace_slug?: string; workspace_name?: string; display_name?: string; username?: string; workspace_plan?: string } | null) {
  const text = [
    session?.workspace_slug,
    session?.workspace_name,
    session?.display_name,
    session?.username,
    session?.workspace_plan,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes(DEMO_WORKSPACE_SLUG) || text.includes('demo workspace')
}

function resolveLoginDestination(nextRoute: string, tenantKey: TenantConfig['key'], role?: string | null, session?: Parameters<typeof isDemoSession>[0]) {
  if (tenantKey !== 'ytf-plant-a' && isDemoSession(session) && !CLIENT_DEMO_APP_ROUTES.has(nextRoute)) {
    return '/app/start'
  }

  return resolvePostLoginRoute(nextRoute, tenantKey, role)
}

async function getWorkspaceSessionWithTimeout(timeoutMs = 1600) {
  return await Promise.race([
    getWorkspaceSession(),
    new Promise<Awaited<ReturnType<typeof getWorkspaceSession>>>((resolve) => {
      window.setTimeout(() => resolve({ authenticated: false, auth_required: true, session: null, workspaces: [] }), timeoutMs)
    }),
  ])
}

async function runDemoLoginWithTimeout(demo: ProductDemoSurface, timeoutMs = 12000) {
  return await Promise.race([
    demoLoginWorkspace(demo.portalId, DEMO_WORKSPACE_SLUG),
    new Promise<Awaited<ReturnType<typeof demoLoginWorkspace>>>((_, reject) => {
      window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    }),
  ])
}

function MinimalAppHandoff({ href }: { href: string }) {
  return (
    <div className="sm-public-handoff mx-auto grid min-h-[72vh] w-full place-items-center px-4 py-10">
      <section className="sm-public-handoff-card">
        <p className="sm-public-handoff-kicker">SUPERMEGA App</p>
        <h1>Sign in once.</h1>
        <p className="sm-public-handoff-copy">Use the app host for product apps, client accounts, and team access.</p>
        <a className="sm-button-primary" href={href}>
          Open app
        </a>
      </section>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const tenantConfig = useMemo(() => getTenantConfig(), [])
  const hostIsPrivateTenant =
    typeof window !== 'undefined' &&
    /(^|[.-])ytf([.-]|$)|ytf-plant-a/i.test(window.location.hostname.trim().toLowerCase())
  const next = sanitizeNextRoute(searchParams.get('next'))
  const tenantParam = searchParams.get('tenant')?.trim().toLowerCase()
  const proofParam = searchParams.get('proof')?.trim() || searchParams.get('demo')?.trim()
  const isPrivateTenant = tenantConfig.key === 'ytf-plant-a' || hostIsPrivateTenant || tenantParam === 'ytf' || tenantParam === 'ytf-plant-a'
  const tenantKey = isPrivateTenant ? 'ytf-plant-a' : 'default'
  const posProofRequest = !isPrivateTenant && isPosProofRequest(next, proofParam)
  const posProofHref = buildProofLoginHref(POS_DEMO_PORTAL_ID, '/app/restaurant-pos')
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()
  const autoDemoOption = useMemo(
    () =>
      isPrivateTenant
        ? null
        : (productDemoSurfaces.find((item) => CLIENT_DEMO_PORTAL_IDS.has(item.portalId) && item.portalId === proofParam) ?? null),
    [proofParam, isPrivateTenant],
  )
  const autoDemoStartedRef = useRef(false)
  const manualDemoNavigationRef = useRef(false)
  const privateTenantLoginPath = `/login?tenant=ytf&next=${encodeURIComponent(next)}`
  const liveLoginHref = isPrivateTenant
    ? appHref(privateTenantLoginPath, privateTenantLoginPath)
    : appHref(`/login?next=${encodeURIComponent(next)}`, '/intake')
  const initialLoading = isPrivateTenant && !(handoffToApp || shellOnly || Boolean(autoDemoOption))

  const [loading, setLoading] = useState(initialLoading)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState('')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(true)
  const [sessionRole, setSessionRole] = useState<string | null>(null)
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([])
  const [demoLoadingPortalId, setDemoLoadingPortalId] = useState('')

  const normalizedWorkspaceOptions = useMemo(() => normalizeWorkspaceOptions(workspaceOptions), [workspaceOptions])
  const clientDemoOptions = useMemo(
    () => (isPrivateTenant ? [] : productFocusLanes.filter((demo) => demo.portalId !== 'spa-service-desk')),
    [isPrivateTenant],
  )
  const defaultWorkspaceSlug = normalizedWorkspaceOptions[0]?.slug || ''
  const activeWorkspaceSlug = workspaceSlug || defaultWorkspaceSlug
  const showWorkspacePicker = normalizedWorkspaceOptions.length > 1
  const backgroundOpening = loading && isPrivateTenant
  const isOpening = submitting || backgroundOpening || Boolean(demoLoadingPortalId)
  const loginEyebrow = isPrivateTenant ? 'YTF / Yangon Tyre private ERP' : 'app.supermega.dev'
  const loginTitle = isPrivateTenant ? 'Open private app.' : 'Open your product workspace.'
  const loginCopy = isPrivateTenant
    ? 'Sign in with your assigned account. The account decides Plant A, Plant B, admin, or CEO access.'
    : 'Open your live product workspace — DeskPOS, Factory Operations, or Custom Portal. Private client accounts open after approval.'
  const posHost = isPosAuthHost()

  useEffect(() => {
    if (!posHost || isPrivateTenant) {
      return
    }
    navigate('/pos/login', { replace: true })
  }, [isPrivateTenant, navigate, posHost])

  useEffect(() => {
    if (!posProofRequest) {
      return
    }
    if (typeof window === 'undefined') {
      navigate('/login?next=/app/start', { replace: true })
      return
    }
    window.location.replace(posProofHref)
  }, [navigate, posProofHref, posProofRequest])

  useEffect(() => {
    if (!handoffToApp || typeof window === 'undefined') {
      return
    }

    window.location.replace(liveLoginHref)
  }, [handoffToApp, liveLoginHref])

  useEffect(() => {
    if (handoffToApp || shellOnly || !autoDemoOption || autoDemoStartedRef.current) {
      return
    }

    autoDemoStartedRef.current = true
    window.setTimeout(() => {
      setLoading(false)
      setSubmitting(true)
      setError('')
    }, 0)

    runDemoLoginWithTimeout(autoDemoOption)
      .then((payload) => {
        if (!payload.authenticated) {
          setError('Selected app is not available yet. Try signing in below.')
          return
        }
        navigate(autoDemoOption.to)
      })
      .catch(() => {
        setError('Selected app took too long to open. Try signing in below.')
      })
      .finally(() => {
        setSubmitting(false)
      })
  }, [autoDemoOption, handoffToApp, navigate, shellOnly])

  useEffect(() => {
    if (handoffToApp || shellOnly) {
      window.setTimeout(() => setLoading(false), 0)
      return
    }

    if (autoDemoOption) {
      window.setTimeout(() => setLoading(false), 0)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const session = await getWorkspaceSessionWithTimeout()
        if (cancelled) {
          return
        }

        setAuthRequired(session.auth_required !== false)
        setSessionRole(session.session?.role ?? null)
        setWorkspaceOptions(session.workspaces ?? [])

        const nextWorkspaceSlug =
          session.session?.workspace_slug ||
          session.workspaces?.[0]?.slug ||
          ''
        if (nextWorkspaceSlug) {
          setWorkspaceSlug((current) => current || nextWorkspaceSlug)
        }

        if (session.authenticated) {
          if (manualDemoNavigationRef.current || isPrivateTenant) {
            return
          }
          navigate(resolveLoginDestination(next, tenantKey, session.session?.role, session.session), { replace: true })
        }
      } catch {
        // Keep the entry screen calm. Failed background session checks should not look like a failed login.
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [autoDemoOption, handoffToApp, isPrivateTenant, navigate, next, shellOnly, tenantKey])

  useEffect(() => {
    if (loading || handoffToApp || shellOnly || authRequired || isPrivateTenant) {
      return
    }

    navigate(resolvePostLoginRoute(next, tenantKey, sessionRole), { replace: true })
  }, [authRequired, handoffToApp, isPrivateTenant, loading, navigate, next, sessionRole, shellOnly, tenantKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const payload = await loginWorkspace(username.trim(), password, activeWorkspaceSlug)
      if (payload.authenticated) {
        navigate(resolveLoginDestination(next, tenantKey, payload.session?.role, payload.session), { replace: true })
        return
      }
      setError('Sign-in failed. Check the username, password, and account.')
    } catch {
      setError(`Sign-in failed. Check the credentials or try again from ${isPrivateTenant ? 'the private app link' : 'app.supermega.dev'}.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemoOpen(demo: ProductDemoSurface) {
    manualDemoNavigationRef.current = true
    setDemoLoadingPortalId(demo.portalId)
    setError('')

    try {
      if (demo.portalId === POS_DEMO_PORTAL_ID) {
        if (typeof window !== 'undefined') {
          window.location.assign(posProofHref)
        }
        return
      }
      const demoLoginTarget = {
        ...demo,
        portalId: resolveDemoLoginPortalId(demo),
      } as ProductDemoSurface
      const payload = await runDemoLoginWithTimeout(demoLoginTarget)
      if (!payload.authenticated) {
        manualDemoNavigationRef.current = false
        setError('Product workspace access is not enabled on this host yet. Use your assigned app credentials.')
        return
      }
      navigate(resolveDemoNavigateRoute(demo))
    } catch {
      manualDemoNavigationRef.current = false
      setError('Product workspace took too long to open. Use your assigned app credentials or retry from the direct product host.')
    } finally {
      setDemoLoadingPortalId('')
    }
  }

  if (handoffToApp || shellOnly) {
    return <MinimalAppHandoff href={liveLoginHref} />
  }

  if (posHost && !isPrivateTenant) {
    return null
  }

  return (
    <div className="sm-clean-login">
      <section className="sm-clean-login-card">
        <div className="sm-clean-login-copy">
          <p className="sm-kicker text-[var(--sm-accent)]">{loginEyebrow}</p>
          <h1>{loginTitle}</h1>
          <p>{loginCopy}</p>
          {!isPrivateTenant ? (
            <aside className="sm-clean-demo-panel" aria-label="Product proof workspaces">
              <span className="sm-status-pill">Product workspaces</span>
              <h2>Choose one product.</h2>
              <p className="sm-clean-demo-account">Shared product proof. Do not enter client data here. Private client accounts use the sign-in form.</p>
              <div className="sm-clean-demo-grid">
                {clientDemoOptions.map((demo) => (
                  <button
                    className="sm-clean-demo-card"
                    disabled={isOpening}
                    key={`${demo.portalId}-${demo.label}`}
                    onClick={() => void handleDemoOpen(demo)}
                    type="button"
                  >
                    {'shot' in demo && demo.shot ? <img alt="" aria-hidden="true" src={demo.shot} /> : null}
                    <span>{demo.badge}</span>
                    <strong>{demo.label}</strong>
                    <small>{demo.portalId === POS_DEMO_PORTAL_ID ? `${demo.detail} Opens on pos.supermega.dev.` : demo.detail}</small>
                  </button>
                ))}
              </div>
            </aside>
          ) : (
            <p className="sm-clean-login-gate">Private app. The username decides Admin, CEO, Plant A, Plant B, or manager access.</p>
          )}
        </div>

        <form className="sm-clean-login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              className="sm-input"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              value={username}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              className="sm-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
          </label>

          {showWorkspacePicker ? (
            <label>
              <span>Account</span>
              <select className="sm-input" onChange={(event) => setWorkspaceSlug(event.target.value)} value={activeWorkspaceSlug}>
                {normalizedWorkspaceOptions.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name || item.slug}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? <div className="sm-clean-login-error">{error}</div> : null}

          <button className="sm-button-primary" disabled={isOpening} type="submit">
            {demoLoadingPortalId ? 'Opening product...' : submitting || backgroundOpening ? 'Opening...' : authRequired ? 'Sign in' : 'Open app'}
          </button>
        </form>

        <p className="sm-clean-login-help">
          Need access? <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
        </p>
      </section>
    </div>
  )
}
