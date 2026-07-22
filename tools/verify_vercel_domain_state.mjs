const kind = String(process.argv[2] || '').trim()
const expected = kind === 'app'
  ? ['app.supermega.dev']
  : kind === 'public'
    ? ['supermega.dev', 'www.supermega.dev']
    : null

if (!expected) throw new Error('domain_kind_must_be_app_or_public')

let input = ''
for await (const chunk of process.stdin) input += chunk

const payload = JSON.parse(input)
const domains = Array.isArray(payload?.domains)
  ? payload.domains.map((entry) => String(entry?.name || '').trim().toLowerCase()).filter(Boolean)
  : []
const supermegaDomains = [...new Set(domains.filter((name) => name === 'supermega.dev' || name.endsWith('.supermega.dev')))].sort()
const expectedDomains = [...expected].sort()
const failures = []

if (JSON.stringify(supermegaDomains) !== JSON.stringify(expectedDomains)) failures.push('canonical_domain_ownership_wrong')

const result = {
  ok: failures.length === 0,
  contract: 'supermega_vercel_domain_state',
  kind,
  expectedDomains,
  actualDomains: supermegaDomains,
  failures,
}

const output = JSON.stringify(result, null, 2)
if (failures.length) {
  console.error(output)
  process.exit(1)
}
console.log(output)
