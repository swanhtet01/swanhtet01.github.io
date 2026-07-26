import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const schedulerAuthority = JSON.parse(readFileSync('tools/supermega_scheduler_authority.json', 'utf8'))
const activationPlanCrons = schedulerAuthority.activation_plan?.crons?.map(({ path, schedule }) => ({ path, schedule })) || []
const retiringCrons = schedulerAuthority.migration?.preflight_retiring_crons?.map(({ path, schedule }) => ({ path, schedule })) || []
if (
  schedulerAuthority.contract !== 'supermega.scheduler-authority.v2'
  || schedulerAuthority.authority !== 'vercel'
  || schedulerAuthority.environment !== 'production'
  || schedulerAuthority.team_id !== 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'
  || schedulerAuthority.project_id !== 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
  || schedulerAuthority.project_name !== 'megaos'
  || schedulerAuthority.activation?.state !== 'dormant'
  || schedulerAuthority.activation?.runtime_environment_key !== 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED'
  || schedulerAuthority.activation?.enabled_value !== '1'
  || !Array.isArray(schedulerAuthority.activation?.required_evidence)
  || schedulerAuthority.activation.required_evidence.length !== 5
  || !Array.isArray(schedulerAuthority.crons)
  || schedulerAuthority.crons.length !== 0
  || schedulerAuthority.maximum_scheduler_invocations_per_day !== 0
  || JSON.stringify(activationPlanCrons) !== JSON.stringify([
    { path: '/api/cron/supermega/agent-queue', schedule: '5 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ])
  || schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day !== 25
  || JSON.stringify(retiringCrons) !== JSON.stringify([
    { path: '/api/cron/supermega/agent-queue', schedule: '*/15 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ])
  || schedulerAuthority.migration?.post_deploy_retiring_crons_allowed !== false
  || schedulerAuthority.worker_dispatch?.mode !== 'enqueue-on-demand'
  || schedulerAuthority.worker_dispatch?.polling_allowed !== false
  || schedulerAuthority.retired_authority?.provider !== 'google-cloud-scheduler'
  || schedulerAuthority.retired_authority?.mutation_allowed !== false
) {
  throw new Error('supermega_scheduler_authority_invalid')
}
const canonicalCrons = schedulerAuthority.crons.map(({ path, schedule }) => ({ path, schedule }))

const appProjectLink = {
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
  orgId: 'team_wI4l7ZgSxcEztQPSlCCYVeJ5',
  projectName: 'megaos',
  settings: {
    framework: null,
    devCommand: null,
    installCommand: null,
    buildCommand: null,
    outputDirectory: null,
    rootDirectory: null,
    directoryListing: false,
    nodeVersion: '22.x',
  },
}

mkdirSync('.vercel', { recursive: true })
writeFileSync('.vercel/project.json', `${JSON.stringify(appProjectLink, null, 2)}\n`)

const appConfig = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  version: 2,
  git: {
    deploymentEnabled: false,
  },
  functions: {
    'api/app.py': {
      includeFiles: 'supermega_runtime/**',
      excludeFiles: '{tests/**,showroom/**,api-static/**,tools/**,mark1_pilot/**,pilot-data/**,node_modules/**,assets/**,supabase/**,ytf-dqms/**,hyper_unicorn/**,venv/**,**/__pycache__/**,**/*.pyc}',
    },
  },
  installCommand: 'npm --prefix showroom ci',
  buildCommand: 'npm run app:build',
  outputDirectory: 'showroom/dist',
  routes: [
    { src: '/api/(.*)', dest: '/api/app.py' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
  crons: canonicalCrons,
}

writeFileSync('vercel.json', `${JSON.stringify(appConfig, null, 2)}\n`)

const generatedIgnore = [
  '.git',
  '.codex',
  '.env*',
  '!.env.app.example',
  '.local',
  '.venv',
  '.venv-linux',
  '.vercel/.env*',
  '.vercel/*.local',
  '.vercel/python',
  '.vercel/prebuilt-filemap-snapshot',
  '.vercel/output.disabled-*',
  'artifacts',
  'agent_os',
  'api-static',
  'app',
  'config',
  'data',
  'docs',
  'kernel',
  'mark1_pilot',
  'node_modules',
  'pilot-data',
  'public',
  'showroom/dist',
  'showroom/node_modules',
  'Super Mega Inc',
  'tests',
  'tmp',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.db-shm',
  '**/*.db-wal',
]
const existingIgnore = existsSync('.vercelignore')
  ? readFileSync('.vercelignore', 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  : []
const requiredBuildInputs = new Set(['.github', 'supabase'])
const nextIgnore = [...new Set([...existingIgnore, ...generatedIgnore])]
  .filter((line) => !requiredBuildInputs.has(line))
writeFileSync('.vercelignore', `${nextIgnore.join('\n')}\n`)

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_app_vercel',
  project: appProjectLink.projectName,
  schedulerAuthority: schedulerAuthority.authority,
  schedulerActivation: schedulerAuthority.activation.state,
  crons: appConfig.crons,
}))
