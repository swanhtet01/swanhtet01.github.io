function validSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
  } catch {
    return false
  }
}

function decodeLegacyKeyRole(value: string) {
  try {
    const parts = value.split('.')
    if (parts.length !== 3) return ''
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(window.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: string }
    return decoded.role ?? ''
  } catch {
    return ''
  }
}

function validPublishableKey(value: string) {
  if (value.startsWith('sb_publishable_')) return value.length >= 24
  return decodeLegacyKeyRole(value) === 'anon'
}

export function managedAuthConfigurationValid(url: string, key: string) {
  return validSupabaseUrl(url) && validPublishableKey(key)
}

export function managedTrialAuthConfigured() {
  const env = import.meta.env ?? {}
  return managedAuthConfigurationValid(
    String(env.VITE_SUPABASE_URL ?? '').trim(),
    String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  )
}
