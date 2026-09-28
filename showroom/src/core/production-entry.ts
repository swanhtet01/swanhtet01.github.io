// Public application hosts never open a browser-only workspace as an auth fallback.
export function productionEntryDecision(hostname: string, accountRoute: boolean, access: string): 'continue' | 'checking' | 'login' {
  if (!['app.supermega.dev', 'megaos.vercel.app'].includes(hostname) || accountRoute || access === 'ready') return 'continue'
  return access === 'checking' ? 'checking' : 'login'
}
