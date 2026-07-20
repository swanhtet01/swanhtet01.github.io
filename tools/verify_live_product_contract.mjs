const base = process.env.SUPERMEGA_PUBLIC_BASE_URL || 'https://supermega.dev'
const appBase = process.env.SUPERMEGA_APP_BASE_URL || 'https://app.supermega.dev'

const checks = [
  { url: `${base}/`, text: 'Custom software at SaaS prices' },
  { url: `${base}/products/`, text: 'Shop' },
  { url: `${base}/ai-agent-solutions/`, text: 'One machine, many tracks' },
  { url: `${base}/demo/`, text: 'app.supermega.dev/commerce-machine' },
  { url: `${appBase}/?demo=shop`, text: null },
  { url: `${appBase}/?demo=plant`, text: null },
]

const templates = ['commerce-inbox', 'knowledge-desk', 'research-monitor']
const failures = []

async function get(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  const body = await response.text()
  return { response, body }
}

for (const check of checks) {
  try {
    const { response, body } = await get(check.url)
    if (response.status !== 200) failures.push(`${check.url}: HTTP ${response.status}`)
    if (check.text && !body.includes(check.text)) failures.push(`${check.url}: missing ${JSON.stringify(check.text)}`)
  } catch (error) {
    failures.push(`${check.url}: ${error.message}`)
  }
}

try {
  const { response, body } = await get(`${base}/site/agent-machine-templates.json`)
  const payload = JSON.parse(body)
  const actual = (payload.templates || []).map((item) => item.id)
  if (response.status !== 200) failures.push(`machine catalog: HTTP ${response.status}`)
  for (const id of templates) {
    if (!actual.includes(id)) failures.push(`machine catalog: missing ${id}`)
    const kit = await get(`${base}/site/agent-templates/${id}.json`)
    if (kit.response.status !== 200) failures.push(`${id} starter kit: HTTP ${kit.response.status}`)
    if (!kit.body.includes('approval_boundary')) failures.push(`${id} starter kit: missing approval boundary`)
  }
} catch (error) {
  failures.push(`machine catalog: ${error.message}`)
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'error', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ status: 'ready', contract: 'live_product_routes', checks: checks.length + templates.length + 1 }, null, 2))
