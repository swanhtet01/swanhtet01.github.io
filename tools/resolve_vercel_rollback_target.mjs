const expectedAlias = String(process.argv[2] || '').trim().toLowerCase()

function fail(reason) {
  console.error(`vercel_rollback_target_invalid:${reason}`)
  process.exit(1)
}

if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(expectedAlias)) fail('alias')

let input = ''
for await (const chunk of process.stdin) input += chunk

let deployment
try {
  deployment = JSON.parse(input)
} catch {
  fail('json')
}

const aliases = Array.isArray(deployment.aliases)
  ? deployment.aliases.map((alias) => String(alias).toLowerCase())
  : []
const deploymentHost = String(deployment.url || '')
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '')

if (!String(deployment.id || '').startsWith('dpl_')) fail('id')
if (deployment.target !== 'production') fail('target')
if (deployment.readyState !== 'READY') fail('state')
if (!aliases.includes(expectedAlias)) fail('live_alias')
if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(deploymentHost)) fail('url')

process.stdout.write(`https://${deploymentHost}`)
