import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const verifier = resolve(import.meta.dirname, 'verify_vercel_project_state.mjs')
const appCrons = [
  { path: '/api/cron/supermega/agent-queue', schedule: '*/15 * * * *' },
  { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
]
const project = (kind, patch = {}) => ({
  id: kind === 'app' ? 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG' : 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
  name: kind === 'app' ? 'megaos' : 'supermega-public',
  gitProviderOptions: { createDeployments: 'disabled' },
  ssoProtection: { deploymentType: 'all_except_custom_domains' },
  protectionBypass: { release: { scope: 'automation-bypass' } },
  crons: { definitions: kind === 'app' ? appCrons : [] },
  ...patch,
})

function run(kind, payload) {
  return spawnSync(process.execPath, [verifier, kind], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  })
}

function parse(result) {
  return JSON.parse(result.status === 0 ? result.stdout : result.stderr)
}

const validApp = run('app', project('app'))
if (validApp.status !== 0
  || parse(validApp).schedulerAuthority !== 'vercel'
  || parse(validApp).deployedCronCount !== 2) throw new Error('valid_app_project_rejected')

const validPublic = run('public', project('public'))
if (validPublic.status !== 0 || parse(validPublic).deployedCronCount !== 0) throw new Error('valid_public_project_rejected')

const wrongSchedule = run('app', project('app', {
  crons: { definitions: appCrons.map((cron, index) => index === 0 ? { ...cron, schedule: '* * * * *' } : cron) },
}))
if (wrongSchedule.status === 0 || !parse(wrongSchedule).failures.includes('app_cron_contract_wrong')) {
  throw new Error('high_frequency_cron_allowed')
}

const duplicateCron = run('app', project('app', {
  crons: { definitions: [...appCrons, appCrons[0]] },
}))
if (duplicateCron.status === 0 || !parse(duplicateCron).failures.includes('duplicate_cron_path_live')) {
  throw new Error('duplicate_cron_allowed')
}

const retiredCron = run('app', project('app', {
  crons: { definitions: [...appCrons, { path: '/api/cron/pos/daily', schedule: '0 0 * * *' }] },
}))
if (retiredCron.status === 0 || !parse(retiredCron).failures.includes('retired_cron_context_live')) {
  throw new Error('retired_cron_allowed')
}

const publicCron = run('public', project('public', {
  crons: { definitions: [{ path: '/api/cron/daily', schedule: '0 0 * * *' }] },
}))
if (publicCron.status === 0 || !parse(publicCron).failures.includes('public_project_must_not_run_crons')) {
  throw new Error('public_cron_allowed')
}

const wrongProject = run('app', project('app', { id: 'prj_wrong' }))
if (wrongProject.status === 0 || !parse(wrongProject).failures.includes('wrong_project_id')) throw new Error('wrong_project_allowed')

const nativeGit = run('app', project('app', { gitProviderOptions: { createDeployments: 'enabled' } }))
if (nativeGit.status === 0 || !parse(nativeGit).failures.includes('native_git_deployments_not_disabled')) {
  throw new Error('native_git_deployments_allowed')
}

const missingBypass = run('app', project('app', { protectionBypass: {} }))
if (missingBypass.status === 0 || !parse(missingBypass).failures.includes('automation_preview_bypass_missing')) {
  throw new Error('missing_automation_bypass_allowed')
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_vercel_project_state_tests', checks: 9 }, null, 2))
