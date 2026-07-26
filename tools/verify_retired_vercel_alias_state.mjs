const retiredAliases = process.argv.slice(2)
  .map((value) => String(value || '').trim().toLowerCase())
  .filter(Boolean)

if (!retiredAliases.length || new Set(retiredAliases).size !== retiredAliases.length) {
  throw new Error('retired_alias_list_invalid')
}

let input = ''
for await (const chunk of process.stdin) input += chunk

let payload
try {
  payload = JSON.parse(input)
} catch {
  throw new Error('retired_alias_state_invalid')
}

if (!payload || typeof payload !== 'object' || !Array.isArray(payload.aliases)) {
  throw new Error('retired_alias_state_invalid')
}

const actualAliases = payload.aliases.map((entry) => {
  if (!entry || typeof entry !== 'object' || typeof entry.alias !== 'string' || !entry.alias.trim()) {
    throw new Error('retired_alias_state_invalid')
  }
  return entry.alias.trim().toLowerCase()
})
const liveRetiredAliases = retiredAliases.filter((alias) => actualAliases.includes(alias))
const failures = liveRetiredAliases.length ? ['retired_alias_still_live'] : []
const result = {
  ok: failures.length === 0,
  contract: 'supermega_retired_vercel_alias_state',
  retiredAliases,
  liveRetiredAliases,
  failures,
}

const output = JSON.stringify(result, null, 2)
if (failures.length) {
  console.error(output)
  process.exit(1)
}
console.log(output)
