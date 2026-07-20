function sanitizeHost(value) {
  const host = String(value || '').trim()
  // Restrict to supermega.dev subdomains only — prevents open redirect
  if (host === 'supermega.dev' || host.endsWith('.supermega.dev') || /^localhost(:\d+)?$/i.test(host)) {
    return host
  }
  return 'app.supermega.dev'
}

function nextPathFor(pathname, search) {
  const path = String(pathname || '/app/start')
  const query = String(search || '')

  if (path === '/app') {
    return '/app/start'
  }

  if (path.startsWith('/app/')) {
    return `${path}${query}`
  }

  if (path === '/clients' || path.startsWith('/clients/')) {
    return '/app/start?source=public_client_link'
  }

  return '/app/start'
}

module.exports = function handler(req, res) {
  const requestUrl = new URL(req.url || '/app/start', `https://${req.headers.host || 'supermega.dev'}`)
  const protocol = process.env.SUPERMEGA_APP_PROTOCOL === 'http' ? 'http' : 'https'
  const host = sanitizeHost(process.env.SUPERMEGA_APP_HOST || 'app.supermega.dev')
  const next = nextPathFor(requestUrl.pathname, requestUrl.search)
  const location = `${protocol}://${host}/login?next=${encodeURIComponent(next)}`

  res.statusCode = 307
  res.setHeader('Location', location)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(`Redirecting to ${location}`)
}
