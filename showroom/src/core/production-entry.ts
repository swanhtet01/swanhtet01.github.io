// Every application entry requires managed access, including local addresses.
// Account routes remain reachable so an unauthenticated user can sign in or recover.
export function productionEntryDecision(hostname: string, accountRoute: boolean, access: string): 'continue' | 'checking' | 'login' {
  if (accountRoute || access === 'ready') return 'continue'
  if (!hostname.trim()) return 'login'
  return access === 'checking' ? 'checking' : 'login'
}
