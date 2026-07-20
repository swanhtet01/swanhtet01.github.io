export type SupermegaHostSurface = 'public-site' | 'shared-app' | 'ytf-client' | 'local' | 'preview'

export const supermegaRootDomain = 'supermega.dev'
export const supermegaPublicHost = 'supermega.dev'
export const supermegaWwwHost = 'www.supermega.dev'
export const supermegaAppHost = 'app.supermega.dev'
export const supermegaPosHost = 'pos.supermega.dev'
export const supermegaYtfHost = 'ytf.supermega.dev'
export const canonicalSupermegaAppBase = `https://${supermegaAppHost}`

export function normalizeHostname(hostname?: string | null) {
  return String(hostname ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
}

export function currentHostname() {
  if (typeof window === 'undefined') return ''
  return normalizeHostname(window.location.hostname)
}

export function isLocalDevHost(hostname = currentHostname()) {
  const normalized = normalizeHostname(hostname)
  return normalized === 'localhost' || normalized === '127.0.0.1'
}

export function isPublicMarketingHost(hostname = currentHostname()) {
  const normalized = normalizeHostname(hostname)
  return normalized === supermegaPublicHost || normalized === supermegaWwwHost
}

export function isSharedAppHost(hostname = currentHostname()) {
  const normalized = normalizeHostname(hostname)
  return normalized === supermegaAppHost || normalized === `www.${supermegaAppHost}` || normalized === supermegaPosHost || normalized === `www.${supermegaPosHost}`
}

export function isYtfClientHost(hostname = currentHostname()) {
  const normalized = normalizeHostname(hostname)
  return normalized === supermegaYtfHost || normalized === `www.${supermegaYtfHost}` || normalized === 'ytf-plant-a.supermega.dev'
}

export function isWorkspaceRuntimeHost(hostname = currentHostname()) {
  return isSharedAppHost(hostname) || isYtfClientHost(hostname) || normalizeHostname(hostname).startsWith('ytf.')
}

export function getSupermegaHostSurface(hostname = currentHostname()): SupermegaHostSurface {
  if (isLocalDevHost(hostname)) return 'local'
  if (isYtfClientHost(hostname)) return 'ytf-client'
  if (isSharedAppHost(hostname)) return 'shared-app'
  if (isPublicMarketingHost(hostname)) return 'public-site'
  return 'preview'
}
