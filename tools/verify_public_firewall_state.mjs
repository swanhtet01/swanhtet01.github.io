const expectedProject = 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'
const expectedRuleName = 'SuperMega contact intake - 5 per 10 minutes'

let raw = ''
for await (const chunk of process.stdin) raw += chunk

let config
try {
  config = JSON.parse(raw)
} catch {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_firewall', failures: ['invalid_firewall_response'] }, null, 2))
  process.exit(1)
}

const failures = []
const rule = Array.isArray(config.rules) ? config.rules.find((candidate) => candidate?.name === expectedRuleName) : null
const conditions = rule?.conditionGroup?.flatMap((group) => group?.conditions || []) || []
const pathCondition = conditions.find((condition) => condition?.type === 'path')
const methodCondition = conditions.find((condition) => condition?.type === 'method')
const rateLimit = rule?.action?.mitigate?.rateLimit

if (config.firewallEnabled !== true) failures.push('firewall_not_enabled')
if (!String(config.projectKey || '').startsWith(`${expectedProject}#`)) failures.push('wrong_project')
if (!rule) failures.push('contact_rate_limit_missing')
if (rule && (rule.active !== true || rule.valid === false)) failures.push('contact_rate_limit_inactive_or_invalid')
if (rule?.action?.mitigate?.action !== 'rate_limit') failures.push('contact_action_not_rate_limit')
if (pathCondition?.op !== 're' || pathCondition?.value !== '^/api/contact-submissions/?$') failures.push('contact_path_scope_wrong')
if (methodCondition?.op !== 'eq' || methodCondition?.value !== 'POST') failures.push('contact_method_scope_wrong')
if (rateLimit?.algo !== 'fixed_window' || rateLimit?.window !== 600 || rateLimit?.limit !== 5) failures.push('contact_rate_window_wrong')
if (JSON.stringify(rateLimit?.keys) !== JSON.stringify(['ip']) || rateLimit?.action !== 'deny') failures.push('contact_rate_key_or_action_wrong')

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_firewall', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_public_firewall',
  project: expectedProject,
  rule: expectedRuleName,
  limit: 5,
  windowSeconds: 600,
  key: 'ip',
}, null, 2))
