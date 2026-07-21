const kind = String(process.argv[2] || '').trim()
const expected = kind === 'app'
  ? { id: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', name: 'megaos' }
  : kind === 'public'
    ? { id: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR', name: 'supermega-public' }
    : null

if (!expected) throw new Error('project_kind_must_be_app_or_public')

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
if (process.env.VERIFY_DEPLOYED_STATE === '1') {
  const paths = definitions.map((cron) => cron.path).sort()
  if (kind === 'app') {
    const expectedPaths = ['/api/cron/supermega/agent-queue', '/api/cron/supermega/daily'].sort()
    if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) failures.push('app_cron_contract_wrong')
  } else if (definitions.length !== 0) {
    failures.push('public_project_must_not_run_crons')
  }
  if (paths.some((path) => /(?:ytf|pos)/i.test(path))) failures.push('retired_cron_context_live')
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
  deployedCronsChecked: process.env.VERIFY_DEPLOYED_STATE === '1',
  deployedCronCount: process.env.VERIFY_DEPLOYED_STATE === '1' ? definitions.length : null,
}, null, 2))
