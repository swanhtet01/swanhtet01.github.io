// This is a UI/request availability signal, never workspace or payment authority.
export type ManagedSignupPolicy = { termsVersion: string; termsUrl: string }

export function readManagedSignupPolicy(health: unknown): ManagedSignupPolicy | null {
  if (!health || typeof health !== 'object' || !('status' in health) || health.status !== 'ready'
    || !('authentication' in health) || !health.authentication || typeof health.authentication !== 'object') return null
  const auth = health.authentication as Record<string, unknown>
  const version = auth.self_serve_signup_terms_version
  if (auth.self_serve_signup_open !== true || auth.supabase_user_tokens_ready !== true
    || auth.anonymous_users_allowed !== false || auth.client_asserted_roles_allowed !== false
    || typeof version !== 'string' || version.trim() !== version || !/^v[1-9][0-9]{0,3}$/.test(version)) return null
  const termsUrl = `https://supermega.dev/terms/${version}/`
  return auth.self_serve_signup_terms_url === termsUrl ? { termsVersion: version, termsUrl } : null
}
