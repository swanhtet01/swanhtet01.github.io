import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

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
  crons: [
    { path: '/api/cron/supermega/agent-queue', schedule: '*/15 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ],
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

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_vercel', project: appProjectLink.projectName, crons: appConfig.crons.map((cron) => cron.path) }))
