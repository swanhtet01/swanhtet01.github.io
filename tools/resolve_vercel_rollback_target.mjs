const mode = String(process.argv[2] || '').trim().toLowerCase()

function fail(reason) {
  console.error(`vercel_rollback_target_invalid:${reason}`)
  process.exit(1)
}

function normalizeHostname(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return ''
    return url.hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isDomain(hostname) {
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(hostname)
}

function isVercelDeployment(hostname) {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(hostname)
}

let input = ''
for await (const chunk of process.stdin) input += chunk

let state
try {
  state = JSON.parse(input)
} catch {
  fail('json')
}

if (mode === 'alias') {
  const expectedAlias = normalizeHostname(process.argv[3])
  const expectedProjectId = String(process.argv[4] || '').trim()
  if (!isDomain(expectedAlias)) fail('alias_argument')
  if (!/^prj_[a-z0-9]+$/i.test(expectedProjectId)) fail('project_argument')

  const liveAlias = normalizeHostname(state.alias)
  const deploymentId = String(state.deploymentId || '')
  const nestedDeploymentId = String(state.deployment?.id || '')
  const deploymentHost = normalizeHostname(state.deployment?.url)

  if (liveAlias !== expectedAlias) fail('live_alias')
  if (state.projectId !== expectedProjectId) fail('project')
  if (state.redirect) fail('redirect')
  if (!/^dpl_[a-z0-9]+$/i.test(deploymentId)) fail('id')
  if (nestedDeploymentId !== deploymentId) fail('deployment_identity')
  if (!isVercelDeployment(deploymentHost)) fail('url')

  process.stdout.write(`https://${deploymentHost} ${deploymentId}`)
} else if (mode === 'deployment') {
  const expectedDeploymentHost = normalizeHostname(process.argv[3])
  const expectedDeploymentId = String(process.argv[4] || '').trim()
  const inspectedDeploymentHost = normalizeHostname(state.url)
  if (!isVercelDeployment(expectedDeploymentHost)) fail('url_argument')
  if (!/^dpl_[a-z0-9]+$/i.test(expectedDeploymentId)) fail('id_argument')
  if (state.id !== expectedDeploymentId) fail('deployment_identity')
  if (state.target !== 'production') fail('target')
  if (state.readyState !== 'READY') fail('state')
  if (inspectedDeploymentHost !== expectedDeploymentHost) fail('deployment_url')

  process.stdout.write(`https://${inspectedDeploymentHost}`)
} else {
  fail('mode')
}
