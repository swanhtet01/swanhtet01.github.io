import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getWorkspaceSession, loginWorkspace } from '../lib/workspaceApi'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const next = new URLSearchParams(location.search).get('next') || '/app/actions'

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState('')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(true)
  const [usesDefaultCredentials, setUsesDefaultCredentials] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ slug?: string; name?: string; role?: string }>>([])

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
    <div className="space-y-8">
      <PageIntro
        eyebrow="Client login"
        title="Sign in to the workspace."
        description="Use login only for the saved app. If you are new, create a workspace first."
      />

      <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Use this for</p>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-white">Saved lead pipeline</div>
            <div className="sm-chip text-white">Action board and exceptions</div>
            <div className="sm-chip text-white">Director and manager views</div>
          </div>
        </aside>
        <form className="sm-surface p-6" onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Username
              <input className="sm-input" onChange={(event) => setUsername(event.target.value)} value={username} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Password
              <input className="sm-input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Workspace
              <input
                className="sm-input"
                onChange={(event) => setWorkspaceSlug(event.target.value)}
                placeholder={workspaceOptions[0]?.slug ? `Default: ${workspaceOptions[0].slug}` : 'Leave blank for default workspace'}
                value={workspaceSlug}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={loading || submitting} type="submit">
              {submitting ? 'Signing in...' : 'Login'}
            </button>
            <Link className="sm-button-accent" to="/signup">
              Create workspace
            </Link>
            <Link className="sm-button-secondary" to="/lead-finder">
              Try Lead Finder
            </Link>
          </div>

          {!authRequired ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">Auth is off on this host, so the app should open directly.</div> : null}
          {usesDefaultCredentials ? (
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              This host is still using the default demo credentials. Change `SUPERMEGA_APP_USERNAME` and `SUPERMEGA_APP_PASSWORD` before sharing it widely.
            </div>
          ) : null}
          {workspaceOptions.length ? (
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              Available workspaces: {workspaceOptions.map((item) => `${item.name || item.slug} (${item.role || 'member'})`).join(' / ')}
            </div>
          ) : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </form>
      </section>
    </div>
  )
}
