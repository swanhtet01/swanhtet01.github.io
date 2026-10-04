const localApplicationHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

function isLocalApplicationHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return localApplicationHosts.has(normalized) || normalized.endsWith('.localhost')
}

// Every hosted application entry requires managed access. Only an explicitly local
// engineering host may open the browser-only workspace, so preview aliases and new
// custom domains cannot silently become public demo workspaces.
export function productionEntryDecision(hostname: string, accountRoute: boolean, access: string): 'continue' | 'checking' | 'login' {
  if (isLocalApplicationHost(hostname) || accountRoute || access === 'ready') return 'continue'
  return access === 'checking' ? 'checking' : 'login'
}
