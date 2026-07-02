/*
 * app-login.proposed.tsx — CAPSULE FORGE re-skin proposal (NON-DESTRUCTIVE)
 * ---------------------------------------------------------------------------
 * This is a PROPOSAL. It does NOT overwrite the live LoginPage.
 * Source of truth: showroom/src/pages/LoginPage.tsx
 *   (product-grid "Open your product workspace." version lives on branch
 *    codex/ytf-manager-pipeline-live @ de5a0bd7d — this proposal re-skins THAT
 *    structure: same fields, same product workspace cards, same routes/props.)
 *
 * Brand: Capsule Forge (design-workshop locked, 91/100).
 *   Cream #F7F4EC (page canvas) · Paper #FFFDF8 (card surfaces) · Ink #2A241C
 *   Forge Charcoal #181410 (dark ground) · Saiyan Gold #E9B949 (through-line +
 *   aura; gold TEXT on light uses #B8892E for AA) · Ki Orange #F26419 (the ONE
 *   "Deploy" CTA, action-only) · Clay #C2603F (connective; dark #D97757).
 *   Type: Clash Display / Space Grotesk (wordmark + H1 only) -> Fraunces
 *   (editorial subheads) -> Inter (body/UI, tabular-nums). Myanmar: Noto Sans
 *   Myanmar / Padauk.
 *   Signature motif THE CAPSULE: two-tone rounded pill, gold top band, seam
 *   line, one offset gold press node. Logo container, button shape, card frame.
 *   Rationed GOLD AURA = its charged state, fired on ONE action per viewport
 *   only, dropped under prefers-reduced-motion.
 *   Doctrine: 95% calm / 5% charged.
 *
 * SELF-CONTAINED: all styling is scoped inline in <CapsuleForgeLoginStyles/>.
 * No dependency on index.css sm-* classes, no external stylesheet, no font
 * CDN. Behavior, fields, product cards, routes, and props are preserved from
 * the original LoginPage.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../../showroom/src/components/PageIntro'
import {
  appHref,
  getWorkspaceSession,
  loginWorkspace,
  needsLiveAppHandoff,
  publicShellOnly,
  workspaceAppBase,
} from '../../showroom/src/lib/workspaceApi'
import { getTenantBrandLabel, getTenantConfig, getTenantLabel } from '../../showroom/src/lib/tenantConfig'
import { buildProofLoginHref, productDemoSurfaces } from '../../showroom/src/lib/demoSurfaces'

/*
 * Product workspace tiles — same five public products, same portalId->route
 * mapping and the same buildProofLoginHref() the product-grid LoginPage uses,
 * so routes/props are identical. Labels come from data (demoSurfaces), not
 * hardcoded copy: Agency Client Operator, Document Extraction Ledger, Back
 * Office Workflow Desk, Factory Operations App, Restaurant POS + Inventory.
 */
const PUBLIC_PRODUCT_PORTAL_IDS = [
  'agency-client-operator',
  'ai-workflow-desk',
  'agentops-toolbox',
  'operations-digital-twin',
  'restaurant-group-os',
] as const

const clientDemoOptions = PUBLIC_PRODUCT_PORTAL_IDS.map((portalId) => {
  const surface = productDemoSurfaces.find((entry) => entry.portalId === portalId)
  return {
    portalId,
    label: surface?.label ?? portalId,
    detail: surface?.detail ?? '',
    badge: surface?.badge ?? 'Product',
    modules: surface?.modules ?? [],
    to: surface?.to ?? '/app/start',
  }
})

const defaultUseCases = ['Saved workspace and queues', 'Approvals and exceptions', 'Director and agent views'] as const
const clientUseCases = ['Role-based enterprise login', 'Sales, plant, DQMS, maintenance, and CEO homes', 'Connector-scoped data and AI review'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key !== 'default'
  const next = new URLSearchParams(location.search).get('next') || (isClientTenant ? '/app/portal' : '/app/actions')
  const tenantLabel = getTenantLabel(tenant) || tenant.defaultCompany || 'workspace'

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState(tenant.defaultWorkspaceSlug ?? '')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(true)
  const [usesDefaultCredentials, setUsesDefaultCredentials] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ slug?: string; name?: string; role?: string }>>([])
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()
  const useCases = isClientTenant ? clientUseCases : defaultUseCases

  const loginTitle = isClientTenant ? `Open the ${tenantLabel} enterprise portal.` : 'Open your product workspace.'
  const loginEyebrow = isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const session = await getWorkspaceSession()
        if (cancelled) {
          return
        }
        setAuthRequired(session.auth_required !== false)
        setUsesDefaultCredentials(Boolean(session.uses_default_credentials))
        setWorkspaceOptions(session.workspaces ?? [])
        if (!workspaceSlug && session.workspaces?.length === 1) {
          setWorkspaceSlug(session.workspaces[0].slug ?? '')
        }
        if (session.authenticated) {
          navigate(next, { replace: true })
          return
        }
      } catch {
        if (!cancelled) {
          setError('The app host is not responding yet. Login works only on the live app backend.')
        }
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
  }, [navigate, next, workspaceSlug])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = await loginWorkspace(username, password, workspaceSlug)
      if (payload.authenticated) {
        navigate(next, { replace: true })
        return
      }
      setError('Login failed.')
    } catch {
      setError('Login failed. Check the username and password or use the live app host.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="cf-login-root">
      <CapsuleForgeLoginStyles />

      {/* Charcoal ground so the rationed gold aura reads hot. */}
      <div className="cf-forge-ground" aria-hidden="true" />

      <div className="cf-login-shell">
        {/* Wordmark lockup — the power-up rendered in the logotype. */}
        <header className="cf-wordmark-lockup">
          <span className="cf-capsule-mark" aria-hidden="true">
            <span className="cf-capsule-mark-top" />
            <span className="cf-capsule-mark-seam" />
            <span className="cf-capsule-mark-node" />
          </span>
          <span className="cf-wordmark">
            <span className="cf-wordmark-super">SUPER</span>
            <span className="cf-wordmark-mega">MEGA</span>
            <span className="cf-wordmark-dev">.dev</span>
          </span>
          <span className="cf-wordmark-tag">Capsule Forge</span>
        </header>

        <PageIntro
          eyebrow={loginEyebrow}
          title={loginTitle}
          description={
            isClientTenant
              ? `Use this for role-based access to sales, operations, manufacturing, DQMS, maintenance, approvals, and director review inside ${tenantLabel}.`
              : 'Choose one product workspace, then sign in. One login opens the correct company, role, and modules.'
          }
        />

        {shellOnly ? (
          <section className="cf-two-col">
            <aside className="cf-panel cf-panel-dark">
              <p className="cf-kicker">What is live here</p>
              <div className="cf-chip-stack">
                {useCases.map((item) => (
                  <div className="cf-chip" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </aside>
            <section className="cf-panel cf-panel-paper">
              <p className="cf-body-muted">
                {isClientTenant
                  ? 'This host shows the Factory Client portal shell, but the saved enterprise workspace app is not deployed on this domain yet.'
                  : 'This host is the public site only. The saved workspace app is not deployed on this domain yet.'}
              </p>
              <div className="cf-action-row">
                <Link className="cf-btn cf-btn-solid" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                  {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
                </Link>
                <Link className="cf-btn cf-btn-ghost" to="/contact">
                  Start rollout
                </Link>
              </div>
            </section>
          </section>
        ) : handoffToApp ? (
          <section className="cf-two-col">
            <aside className="cf-panel cf-panel-dark">
              <p className="cf-kicker">Use this for</p>
              <div className="cf-chip-stack">
                {useCases.map((item) => (
                  <div className="cf-chip" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </aside>
            <section className="cf-panel cf-panel-paper">
              <p className="cf-body-muted">
                {isClientTenant
                  ? 'The Factory Client enterprise workspace is on the live app host. Use that login to enter the tenant with role-based homes and connector-scoped data.'
                  : 'The saved workspace app is on the live app host, not this static site.'}
              </p>
              <div className="cf-action-row">
                {/* The ONE Ki-orange Deploy CTA carries the rationed gold aura. */}
                <a className="cf-btn cf-btn-deploy cf-charged" href={appHref('/login/')}>
                  {isClientTenant ? 'Open enterprise portal' : 'Open workspace'}
                </a>
                <a className="cf-btn cf-btn-solid" href={appHref('/signup/')}>
                  Create workspace
                </a>
                <Link className="cf-btn cf-btn-ghost" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                  {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
                </Link>
              </div>
              <div className="cf-note">Live app host: {workspaceAppBase}</div>
            </section>
          </section>
        ) : (
          <section className="cf-two-col cf-two-col-wide">
            {/* LEFT: product workspace tiles — capsule-frame + gold latch each. */}
            <aside className="cf-panel cf-panel-dark cf-demo-panel">
              <p className="cf-kicker">Choose one product workspace</p>
              <p className="cf-demo-intro">
                Each tile opens the same signed-in app on the correct route. Sign in once on the right.
              </p>
              <div className="cf-demo-grid" role="list">
                {clientDemoOptions.map((option) => (
                  <a
                    key={option.portalId}
                    className="cf-demo-card"
                    role="listitem"
                    href={buildProofLoginHref(option.portalId, option.to)}
                  >
                    {/* Gold top-latch: seam + press node — the capsule signature. */}
                    <span className="cf-latch" aria-hidden="true">
                      <span className="cf-latch-band" />
                      <span className="cf-latch-node" />
                    </span>
                    <span className="cf-demo-badge">{option.badge}</span>
                    <span className="cf-demo-label">{option.label}</span>
                    {option.detail ? <span className="cf-demo-detail">{option.detail}</span> : null}
                    {option.modules.length ? (
                      <span className="cf-demo-modules">
                        {option.modules.map((mod) => (
                          <span className="cf-demo-module" key={mod}>
                            {mod}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            </aside>

            {/* RIGHT: sign-in card — paper surface, gold top-latch, Deploy CTA. */}
            <form className="cf-panel cf-panel-paper cf-login-card" onSubmit={handleSubmit}>
              {/* Gold top-latch on the card: seam + offset press node. */}
              <span className="cf-latch cf-latch-card" aria-hidden="true">
                <span className="cf-latch-band" />
                <span className="cf-latch-node" />
              </span>

              {isClientTenant ? (
                <div className="cf-pill-row">
                  <span className="cf-status-pill">Enterprise login</span>
                  <span className="cf-status-pill">Role landing</span>
                  <span className="cf-status-pill">Connector scope</span>
                </div>
              ) : null}

              <p className="cf-card-eyebrow">Sign in</p>

              <div className="cf-field-stack">
                <label className="cf-field" htmlFor="cf-username">
                  <span className="cf-field-label">Username</span>
                  <input
                    id="cf-username"
                    className="cf-input"
                    autoComplete="username"
                    onChange={(event) => setUsername(event.target.value)}
                    value={username}
                  />
                </label>
                <label className="cf-field" htmlFor="cf-password">
                  <span className="cf-field-label">Password</span>
                  <input
                    id="cf-password"
                    className="cf-input"
                    type="password"
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                    value={password}
                  />
                </label>
                <label className="cf-field" htmlFor="cf-workspace">
                  <span className="cf-field-label">Workspace</span>
                  <input
                    id="cf-workspace"
                    className="cf-input"
                    onChange={(event) => setWorkspaceSlug(event.target.value)}
                    placeholder={
                      workspaceOptions[0]?.slug
                        ? `Default: ${workspaceOptions[0].slug}`
                        : tenant.defaultWorkspaceSlug
                          ? `Default: ${tenant.defaultWorkspaceSlug}`
                          : 'Leave blank for default workspace'
                    }
                    value={workspaceSlug}
                  />
                </label>
              </div>

              <div className="cf-action-row cf-action-row-form">
                {/* The ONE charged element in this viewport: Ki-orange Deploy
                    button wearing the rationed gold aura. Aura drops under
                    prefers-reduced-motion (see stylesheet). */}
                <button className="cf-btn cf-btn-deploy cf-charged" disabled={loading || submitting} type="submit">
                  {submitting ? 'Opening...' : isClientTenant ? 'Open enterprise portal' : 'Open workspace'}
                </button>
                <Link className="cf-btn cf-btn-solid" to="/signup">
                  Create workspace
                </Link>
                <Link className="cf-btn cf-btn-ghost" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                  {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
                </Link>
              </div>

              {!authRequired ? (
                <div className="cf-note">Local sign-in bypass is enabled on this host, so the app should open directly.</div>
              ) : null}
              {usesDefaultCredentials ? (
                <div className="cf-note">
                  This host is still using temporary credentials. Replace them before sharing the workspace more widely.
                </div>
              ) : null}
              {workspaceOptions.length ? (
                <div className="cf-note">
                  Available workspaces: {workspaceOptions.map((item) => `${item.name || item.slug} (${item.role || 'member'})`).join(' / ')}
                </div>
              ) : null}
              {isClientTenant ? (
                <div className="cf-note">
                  Default tenant: {tenant.defaultWorkspaceSlug || 'ytf-plant-a'}. Use the workspace field only if you need to switch to another
                  Factory Client workspace slug.
                </div>
              ) : null}
              {error ? (
                <div className="cf-note cf-note-error" role="alert">
                  {error}
                </div>
              ) : null}

              <p className="cf-help">
                Need access?{' '}
                <a className="cf-link" href="mailto:hello@supermega.dev">
                  hello@supermega.dev
                </a>
              </p>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}

/*
 * Scoped Capsule Forge stylesheet. All rules are namespaced under .cf-login-root
 * so this proposal is self-contained and cannot leak into the global sm-* system.
 * Design tokens are declared locally (mirroring the locked brand tokens).
 */
function CapsuleForgeLoginStyles() {
  return (
    <style>{`
.cf-login-root {
  /* --- Capsule Forge locked tokens (scoped) --- */
  --cf-cream: #F7F4EC;
  --cf-paper: #FFFDF8;
  --cf-ink: #2A241C;
  --cf-ink-soft: #6B6152;
  --cf-charcoal: #181410;
  --cf-charcoal-soft: #221C16;
  --cf-gold: #E9B949;
  --cf-gold-band-hi: #F2C75A;
  --cf-gold-text-aa: #B8892E; /* gold TEXT on light must use this for AA */
  --cf-ki: #F26419;
  --cf-ki-deep: #D9530E;
  --cf-clay: #C2603F;
  --cf-clay-dark: #D97757;

  /* Type ladder. Clash Display + Space Grotesk (display), Fraunces (subhead),
     Inter (body/UI). No webfont fetch — system-safe stacks with the named
     fallbacks first so a host that has the faces uses them. */
  --cf-display: 'Clash Display', 'Space Grotesk', 'Space Grotesk Variable', 'Segoe UI', system-ui, sans-serif;
  --cf-subhead: 'Fraunces', 'Fraunces 72', Georgia, 'Times New Roman', serif;
  --cf-body: 'Inter', 'Inter Variable', system-ui, 'Segoe UI', Roboto, Arial, sans-serif;

  /* THE CAPSULE gold aura — the charged state. */
  --cf-aura: 0 0 0 1px var(--cf-gold), 0 8px 40px rgba(233, 185, 73, 0.28);

  position: relative;
  min-height: 100%;
  color: var(--cf-cream);
  font-family: var(--cf-body);
  font-feature-settings: 'ss01' on;
  -webkit-font-smoothing: antialiased;
}

.cf-login-root :lang(my),
.cf-login-root [lang='my'] {
  font-family: 'Noto Sans Myanmar', 'Padauk', var(--cf-body);
}

/* Charcoal forge ground, edge-to-edge, with a faint gold ember low-center. */
.cf-forge-ground {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(120% 80% at 50% 118%, rgba(233, 185, 73, 0.10), transparent 60%),
    radial-gradient(90% 60% at 50% -20%, rgba(194, 96, 63, 0.10), transparent 55%),
    var(--cf-charcoal);
  pointer-events: none;
}

.cf-login-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 40px 24px 64px;
}

/* --- Wordmark lockup — the power-up in the logotype --- */
.cf-wordmark-lockup {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

/* Capsule logo container: two-tone rounded pill, gold top band, seam, node. */
.cf-capsule-mark {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--cf-charcoal-soft);
  box-shadow: inset 0 0 0 1px rgba(233, 185, 73, 0.35);
  overflow: hidden;
  flex: 0 0 auto;
}
.cf-capsule-mark-top {
  position: absolute;
  inset: 0 0 58% 0; /* ~42% height gold top band */
  background: linear-gradient(180deg, var(--cf-gold-band-hi), var(--cf-gold));
  border-radius: 999px 999px 40% 40%;
}
.cf-capsule-mark-seam {
  position: absolute;
  left: 14%;
  right: 14%;
  top: 42%;
  height: 1px;
  background: rgba(24, 20, 16, 0.55);
}
.cf-capsule-mark-node {
  position: absolute;
  right: 24%;
  top: 21%;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--cf-charcoal);
  box-shadow: 0 0 0 1.5px rgba(24, 20, 16, 0.25);
}

.cf-wordmark {
  font-family: var(--cf-display);
  font-size: 1.5rem;
  letter-spacing: 0.01em;
  line-height: 1;
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  color: var(--cf-cream);
  font-style: normal; /* upright never italic */
}
.cf-wordmark-super { font-weight: 500; }
.cf-wordmark-mega {
  font-weight: 800;
  color: var(--cf-gold);
  text-shadow: 0 0 18px rgba(233, 185, 73, 0.35); /* gold underglow */
}
.cf-wordmark-dev {
  font-weight: 600;
  color: var(--cf-gold);
  text-transform: lowercase;
}
.cf-wordmark-tag {
  font-family: var(--cf-subhead);
  font-style: italic;
  font-size: 0.9rem;
  color: rgba(247, 244, 236, 0.62);
  margin-left: 4px;
}

/* --- Panels --- */
.cf-two-col {
  display: grid;
  gap: 22px;
}
@media (min-width: 900px) {
  .cf-two-col { grid-template-columns: 0.76fr 1.24fr; align-items: start; }
  .cf-two-col-wide { grid-template-columns: 1fr 0.92fr; }
}

.cf-panel {
  position: relative;
  border-radius: 22px;
  padding: 26px;
}
.cf-panel-dark {
  background: linear-gradient(180deg, var(--cf-charcoal-soft), #1B160F);
  border: 1px solid rgba(233, 185, 73, 0.16);
  color: rgba(247, 244, 236, 0.9);
}
.cf-panel-paper {
  background: var(--cf-paper);
  border: 1px solid rgba(42, 36, 28, 0.10);
  color: var(--cf-ink);
  box-shadow: 0 18px 50px rgba(24, 20, 16, 0.42);
}

/* Sign-in card carries the gold top-latch; extra top room for the latch. */
.cf-login-card { padding-top: 34px; }
.cf-demo-panel { padding-top: 26px; }

/* --- THE CAPSULE latch: gold seam band + one offset press node --- */
.cf-latch {
  position: absolute;
  top: 0;
  left: 22px;
  right: 22px;
  height: 8px;
  pointer-events: none;
}
.cf-latch-card { left: 26px; right: 26px; height: 9px; }
.cf-latch-band {
  position: absolute;
  inset: 0 0 auto 0;
  height: 6px;
  border-radius: 0 0 999px 999px;
  background: linear-gradient(180deg, var(--cf-gold-band-hi), var(--cf-gold));
  box-shadow: 0 1px 0 rgba(24, 20, 16, 0.18);
}
.cf-latch-node {
  position: absolute;
  top: 2px;
  left: 26%;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--cf-gold);
  box-shadow: 0 0 0 2px var(--cf-paper), 0 0 10px rgba(233, 185, 73, 0.55);
}
.cf-panel-dark .cf-latch-node { box-shadow: 0 0 0 2px #1B160F, 0 0 10px rgba(233, 185, 73, 0.55); }

/* --- Kickers / eyebrows / copy --- */
.cf-kicker {
  font-family: var(--cf-body);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cf-gold);
  margin: 0 0 14px;
}
.cf-card-eyebrow {
  font-family: var(--cf-subhead);
  font-style: italic;
  font-size: 1.05rem;
  color: var(--cf-gold-text-aa); /* AA-safe gold text on paper */
  margin: 2px 0 16px;
}
.cf-body-muted {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--cf-ink-soft);
  margin: 0;
}
.cf-panel-dark .cf-body-muted { color: rgba(247, 244, 236, 0.72); }

.cf-demo-intro {
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(247, 244, 236, 0.68);
  margin: 0 0 18px;
}

/* --- Chips / pills --- */
.cf-chip-stack { display: grid; gap: 10px; }
.cf-chip {
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 0.86rem;
  background: rgba(233, 185, 73, 0.08);
  border: 1px solid rgba(233, 185, 73, 0.22);
  color: rgba(247, 244, 236, 0.92);
}
.cf-pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.cf-status-pill {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 5px 11px;
  border-radius: 999px;
  color: var(--cf-gold-text-aa);
  background: rgba(233, 185, 73, 0.12);
  border: 1px solid rgba(184, 137, 46, 0.35);
}

/* --- Product workspace tiles (capsule-frame cards) --- */
.cf-demo-grid { display: grid; gap: 12px; }
@media (min-width: 560px) {
  .cf-demo-grid { grid-template-columns: 1fr 1fr; }
}
.cf-demo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 22px 16px 16px;
  border-radius: 18px;
  background: var(--cf-paper);
  border: 1px solid rgba(42, 36, 28, 0.12);
  color: var(--cf-ink);
  text-decoration: none;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}
.cf-demo-card:hover {
  transform: translateY(-2px);
  border-color: rgba(233, 185, 73, 0.55);
  box-shadow: 0 10px 26px rgba(24, 20, 16, 0.45);
}
.cf-demo-card:focus-visible {
  outline: none;
  box-shadow: var(--cf-aura); /* charged only on keyboard focus of a real target */
  border-color: var(--cf-gold);
}
.cf-demo-badge {
  align-self: flex-start;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cf-clay);
}
.cf-demo-label {
  font-family: var(--cf-subhead);
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--cf-ink);
}
.cf-demo-detail {
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--cf-ink-soft);
}
.cf-demo-modules { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.cf-demo-module {
  font-size: 0.7rem;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(42, 36, 28, 0.06);
  border: 1px solid rgba(42, 36, 28, 0.10);
  color: var(--cf-ink-soft);
  font-variant-numeric: tabular-nums;
}

/* --- Form fields --- */
.cf-field-stack { display: grid; gap: 16px; }
.cf-field { display: grid; gap: 7px; }
.cf-field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--cf-ink);
}
.cf-input {
  font-family: var(--cf-body);
  font-size: 0.95rem;
  color: var(--cf-ink);
  background: var(--cf-cream);
  border: 1px solid rgba(42, 36, 28, 0.18);
  border-radius: 12px;
  padding: 11px 14px;
  transition: border-color 120ms ease, box-shadow 120ms ease;
  font-variant-numeric: tabular-nums;
}
.cf-input::placeholder { color: rgba(107, 97, 82, 0.7); }
.cf-input:focus {
  outline: none;
  border-color: var(--cf-gold);
  box-shadow: 0 0 0 3px rgba(233, 185, 73, 0.28);
}

/* --- Buttons — all capsule-shaped (border-radius: 999px) --- */
.cf-action-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }
.cf-action-row-form { margin-top: 24px; }
.cf-btn {
  font-family: var(--cf-body);
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 11px 20px;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.cf-btn:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: 2px;
}

/* The ONE "Deploy" CTA — Ki Orange, action-only, wears the rationed aura. */
.cf-btn-deploy {
  background: linear-gradient(180deg, var(--cf-ki), var(--cf-ki-deep));
  color: #FFF7F0;
  border-color: var(--cf-ki-deep);
}
.cf-btn-deploy:hover:not(:disabled) { transform: translateY(-1px); }
.cf-btn-deploy:disabled { opacity: 0.55; cursor: not-allowed; }
/* Charged state: the gold aura fires only on this element. */
.cf-charged { box-shadow: var(--cf-aura); }

/* Solid = clay connective; ghost = quiet outline. */
.cf-btn-solid {
  background: var(--cf-clay);
  color: #FFF7F0;
  border-color: rgba(24, 20, 16, 0.12);
}
.cf-btn-solid:hover { transform: translateY(-1px); background: #B4593A; }
.cf-btn-ghost {
  background: transparent;
  color: var(--cf-ink);
  border-color: rgba(42, 36, 28, 0.28);
}
.cf-panel-dark .cf-btn-ghost { color: var(--cf-cream); border-color: rgba(247, 244, 236, 0.3); }
.cf-btn-ghost:hover { border-color: var(--cf-gold); }

/* --- Notes / links --- */
.cf-note {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.82rem;
  line-height: 1.45;
  background: rgba(233, 185, 73, 0.08);
  border: 1px solid rgba(184, 137, 46, 0.28);
  color: var(--cf-ink-soft);
}
.cf-note-error {
  background: rgba(217, 87, 55, 0.10);
  border-color: rgba(194, 96, 63, 0.45);
  color: #8A3A22;
}
.cf-help {
  margin-top: 18px;
  font-size: 0.85rem;
  color: var(--cf-ink-soft);
}
.cf-link {
  color: var(--cf-gold-text-aa); /* AA-safe gold link text on paper */
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cf-link:hover { color: var(--cf-clay); }

/* --- Reduced motion: drop the aura + transitions (doctrine + a11y) --- */
@media (prefers-reduced-motion: reduce) {
  .cf-login-root * {
    transition: none !important;
    animation: none !important;
  }
  .cf-charged { box-shadow: 0 0 0 1px var(--cf-gold); } /* keep the ring, drop the glow bloom */
  .cf-demo-card:hover { transform: none; }
  .cf-btn-deploy:hover:not(:disabled),
  .cf-btn-solid:hover { transform: none; }
}
`}</style>
  )
}
