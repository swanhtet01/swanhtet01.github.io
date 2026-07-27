import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const kind = String(process.argv[2] || '').trim()
const expected = kind === 'app'
  ? { id: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', name: 'megaos' }
  : kind === 'public'
    ? { id: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR', name: 'supermega-public' }
    : null

if (!expected) throw new Error('project_kind_must_be_app_or_public')

const schedulerAuthority = JSON.parse(await readFile(
  resolve(import.meta.dirname, 'supermega_scheduler_authority.json'),
  'utf8',
))
const verifyDeployedState = process.env.VERIFY_DEPLOYED_STATE === '1'
if (
  schedulerAuthority.contract !== 'supermega.scheduler-authority.v2'
  || schedulerAuthority.authority !== 'vercel'
  || schedulerAuthority.environment !== 'production'
  || schedulerAuthority.project_id !== 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
  || schedulerAuthority.project_name !== 'megaos'
  || schedulerAuthority.activation?.state !== 'dormant'
  || schedulerAuthority.crons?.length !== 0
  || schedulerAuthority.maximum_scheduler_invocations_per_day !== 0
  || schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day !== 25
  || schedulerAuthority.migration?.post_deploy_retiring_crons_allowed !== false
  || schedulerAuthority.retired_authority?.provider !== 'google-cloud-scheduler'
  || schedulerAuthority.retired_authority?.mutation_allowed !== false
) {
  throw new Error('scheduler_authority_contract_invalid')
}

let input = ''
for await (const chunk of process.stdin) input += chunk
const project = JSON.parse(input)
const failures = []

if (project.id !== expected.id) failures.push('wrong_project_id')
if (project.name !== expected.name) failures.push('wrong_project_name')
if (project.gitProviderOptions?.createDeployments !== 'disabled') failures.push('native_git_deployments_not_disabled')
if (project.ssoProtection?.deploymentType !== 'all_except_custom_domains') failures.push('preview_protection_not_standard')

const bypasses = Object.values(project.protectionBypass || {})
if (!bypasses.some((entry) => entry?.scope === 'automation-bypass')) failures.push('automation_preview_bypass_missing')

const definitions = Array.isArray(project.crons?.definitions) ? project.crons.definitions : []
const normalizedCrons = definitions
  .map((cron) => ({ path: String(cron?.path || '').trim(), schedule: String(cron?.schedule || '').trim() }))
  .sort((left, right) => left.path.localeCompare(right.path))
const cronPaths = normalizedCrons.map((cron) => cron.path)
if (new Set(cronPaths).size !== cronPaths.length) failures.push('duplicate_cron_path_live')
if (cronPaths.some((path) => /(?:ytf|pos)/i.test(path))) failures.push('retired_cron_context_live')
if (kind === 'app') {
  const expectedCrons = schedulerAuthority.crons
    .map(({ path, schedule }) => ({ path, schedule }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const retiringCrons = (schedulerAuthority.migration?.preflight_retiring_crons || [])
    .map(({ path, schedule }) => ({ path, schedule }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const exactCurrent = JSON.stringify(normalizedCrons) === JSON.stringify(expectedCrons)
  const exactRetiring = JSON.stringify(normalizedCrons) === JSON.stringify(retiringCrons)
  if (!exactCurrent && (verifyDeployedState || !exactRetiring)) failures.push('app_cron_contract_wrong')
} else if (definitions.length !== 0) {
  failures.push('public_project_must_not_run_crons')
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_vercel_project_state', kind, failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_vercel_project_state',
  kind,
  project: expected.name,
  nativeGitDeployments: 'disabled',
  protectedPreviewAutomation: 'ready',
  schedulerAuthority: kind === 'app' ? schedulerAuthority.authority : 'none',
  schedulerEnvironment: kind === 'app' ? schedulerAuthority.environment : null,
  deployedCronsChecked: true,
  deployedCronCount: definitions.length,
  cronTransitionState: kind === 'app' && definitions.length ? 'retiring' : 'current',
}, null, 2))
