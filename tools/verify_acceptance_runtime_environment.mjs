import { pathToFileURL } from 'node:url'

// Acceptance-only inspection. This never provisions credentials or changes providers.
export const acceptanceProject = 'twflgmlwfkykgzsxnegc'
export function inspectAcceptanceEnvironment(env, expectedCommit) {
  const failures = []
  const check = (ok, code) => { if (!ok) failures.push(code) }
  check(/^[a-f0-9]{40}$/.test(expectedCommit || ''), 'expected_commit_invalid')
  check(env.SUPERMEGA_RELEASE_COMMIT === expectedCommit, 'release_mismatch')
  check(env.VERCEL_ENV === 'preview', 'preview_only')
  check(env.SUPERMEGA_SUPABASE_PROJECT_REF === acceptanceProject, 'project_mismatch')
  check(env.VITE_SUPABASE_URL === `https://${acceptanceProject}.supabase.co`, 'auth_project_mismatch')
  check(/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY || ''), 'publishable_key_required')
  // Server Auth resolves these aliases before the browser fallback. Reject inherited
  // project credentials even when the VITE configuration looks correct.
  const authUrl = `https://${acceptanceProject}.supabase.co`
  check(['SUPERMEGA_SUPABASE_URL', 'SUPABASE_URL'].every(name =>
    !env[name] || String(env[name]).trim().replace(/\/$/, '') === authUrl), 'server_auth_project_mismatch')
  check(['SUPERMEGA_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'].every(name =>
    !env[name] || String(env[name]).trim() === env.VITE_SUPABASE_PUBLISHABLE_KEY), 'server_auth_key_mismatch')
  check(env.SUPERMEGA_TRIAL_SCHEMA_VERSION === '13' && env.SUPERMEGA_BILLING_SCHEMA_VERSION === '13', 'schema_version_mismatch')
  check(['', 'false'].includes(env.SUPERMEGA_TRIAL_WRITES_ENABLED || ''), 'staging_writes_must_be_disabled')
  check(!env.SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW, 'self_serve_must_be_closed')
  let databaseValid = false
  try {
    const url = new URL(env.SUPERMEGA_DATABASE_URL)
    databaseValid = ['postgres:', 'postgresql:'].includes(url.protocol)
      && /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
      && decodeURIComponent(url.username) === `supermega_trial_login.${acceptanceProject}`
      && Boolean(url.password) && url.port === '6543' && url.pathname === '/postgres' && !url.hash
      && [...url.searchParams.keys()].length === 1
      && ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))
  } catch { /* Never include the connection string in diagnostics. */ }
  check(databaseValid, 'dedicated_acceptance_tls_connection_required')
  return { ok: failures.length === 0, contract: 'supermega.acceptance_staged_environment.v1', failures,
    secret_values_exposed: false, hosted_acceptance: false }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = inspectAcceptanceEnvironment(process.env, process.argv[2])
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
}
