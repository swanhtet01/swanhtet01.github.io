// Parse into explicit fields: pg connection-string SSL options must not override verification.
export function postgresPoolConfig(connectionString, ca = '') {
  let url
  try { url = new URL(connectionString) } catch { throw new Error('postgres_connection_invalid') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) throw new Error('postgres_connection_invalid')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const local = ['localhost', '127.0.0.1', '::1'].includes(host)
  const seen = new Set()
  for (const [key] of url.searchParams) {
    if (!['sslmode', 'application_name'].includes(key) || seen.has(key)) throw new Error('postgres_connection_option_unsupported')
    seen.add(key)
  }
  const mode = url.searchParams.get('sslmode')
  if (mode && !['require', 'verify-full', ...(local ? ['disable'] : [])].includes(mode)) throw new Error('postgres_tls_verification_required')
  if (ca && (typeof ca !== 'string' || !ca.includes('-----BEGIN CERTIFICATE-----'))) throw new Error('postgres_ca_invalid')
  let user, password, database
  try {
    user = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
    database = decodeURIComponent(url.pathname.slice(1))
  } catch { throw new Error('postgres_connection_invalid') }
  if (!user || !database) throw new Error('postgres_connection_invalid')
  return {
    host, port: Number(url.port || 5432), user, password, database,
    ssl: local && (!mode || mode === 'disable') ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    ...(url.searchParams.has('application_name') ? { application_name: url.searchParams.get('application_name') } : {}),
    max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
  }
}
