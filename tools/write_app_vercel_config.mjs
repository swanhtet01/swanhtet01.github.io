import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const appProjectName = 'megaos'
const appProjectId = 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
const appOrgId = 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'
const projectLinkPath = '.vercel/project.json'
const appProjectLink = {
  projectId: appProjectId,
  orgId: appOrgId,
  projectName: appProjectName,
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
writeFileSync(projectLinkPath, `${JSON.stringify(appProjectLink, null, 2)}\n`)

const pythonExcludeFiles = [
  '.git/**',
  '.codex/**',
  '.env*',
  '.local/**',
  '.venv/**',
  '.venv-linux/**',
  '.vercel/**',
  '.vercel_python_packages/**',
  '.tmp-vercel-public-check/**',
  '.ytf-deploy-hidden/**',
  '_uv/**',
  'artifacts/**',
  'assets/**',
  'api-static/site/shots/*.png',
  'api-static/site/shots/**',
  'api-static/site/*-live.png',
  'api-static/site/homepage-shot.png',
  'api-static/site/company-list-live.png',
  'api-static/site/find-clients-live.png',
  'api-static/site/receiving-control-live.png',
  'api-static/site/yangon-tyre-live.png',
  'command-center/**',
  'docs/**',
  'hyper_unicorn/**',
  'jarvis/**',
  'mark1-cli/**',
  'mark1-mcp/**',
  'mark1_pilot/out/**',
  'node_modules/**',
  'pilot-data/**',
  'pilot-data/*.db',
  'pilot-data/**/*.db',
  'pilot-data/*.sqlite',
  'pilot-data/**/*.sqlite',
  'pilot-data/*.sqlite3',
  'pilot-data/**/*.sqlite3',
  'pilot-data/*.log',
  'pilot-data/**/*.log',
  'pilot-data/output/**',
  'showroom/dist/**',
  'showroom/node_modules/**',
  'showroom/public/**',
  'showroom/apps/**/node_modules/**',
  'Super Mega Inc/ops/**',
  'swan-infrastructure/**',
  'tmp/**',
  'venv/**',
  'ytf-dqms/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.db-shm',
  '**/*.db-wal',
  '**/googleapiclient/discovery_cache/documents/**',
  '*.ytf-deploy-hidden*',
]

const pilotDataRuntimeFallbacks = [
]

const appCrons = [
  {
    path: '/api/cron/supermega/agent-queue',
    schedule: '*/15 * * * *',
  },
  {
    path: '/api/cron/supermega/daily',
    schedule: '45 0 * * *',
  },
  {
    path: '/api/cron/ytf/agent-queue',
    schedule: '*/15 * * * *',
  },
  {
    path: '/api/cron/ytf/source-records',
    schedule: '5 * * * *',
  },
  {
    path: '/api/cron/ytf/communications-sync',
    schedule: '20 * * * *',
  },
  {
    path: '/api/cron/ytf/data-manager',
    schedule: '35 */2 * * *',
  },
  {
    path: '/api/cron/ytf/knowledge-vector',
    schedule: '50 */2 * * *',
  },
  {
    path: '/api/cron/ytf/owner-brief',
    schedule: '30 1 * * 1-6',
  },
  {
    path: '/api/cron/ytf/evaluation',
    schedule: '0 13 * * *',
  },
  {
    path: '/api/cron/ytf/full-refresh',
    schedule: '10 18 * * *',
  },
]

const appConfig = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  version: 2,
  functions: {
    'api/app.py': {
      excludeFiles: '{.git/**,docs/**,pilot-data/**,node_modules/**,showroom/**,assets/**,tmp/**,artifacts/**,**/__pycache__/**,**/*.pyc}',
    },
  },
  buildCommand: 'npm run build',
  outputDirectory: 'showroom/dist',
  routes: [
    {
      src: '/api/(.*)',
      dest: '/api/app.py',
    },
    {
      src: '/pos/login/?',
      dest: '/pos-login.html',
    },
    {
      handle: 'filesystem',
    },
    {
      src: '/(.*)',
      dest: '/index.html',
    },
  ],
  crons: appCrons,
}

writeFileSync('vercel.json', `${JSON.stringify(appConfig, null, 2)}\n`)

const ignoredForPublicOnly = new Set(['api_app.py', 'requirements.txt', 'assets'])
const ignoredForPrebuiltAppDeploy = new Set(['.vercel', '.vercel/**'])
const appOnlyIgnore = [
  '.vercel/.env*',
  '.vercel/*.local',
  '.vercel/project.json',
  '.vercel/README.txt',
  '.vercel/python',
  '.vercel/python/**',
  '.vercel/prebuilt-filemap-snapshot',
  '.vercel/prebuilt-filemap-snapshot/**',
  '.vercel/output.disabled-*',
  '.vercel/output.disabled-*/**',
  '.vercel/output_stale_*',
  '.vercel/output_stale_*/**',
  '.vercel/output.windows-prebuilt-bad-*',
  '.vercel/output.windows-prebuilt-bad-*/**',
  '.vercel/ytf*.local',
  '.vercel/ytf_starter_password.local',
]
const existingIgnore = readFileSync('.vercelignore', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !ignoredForPublicOnly.has(line))
  .filter((line) => !ignoredForPrebuiltAppDeploy.has(line))

const nextIgnore = [...new Set([...existingIgnore, ...appOnlyIgnore])]

writeFileSync('.vercelignore', `${nextIgnore.join('\n')}\n`)
console.log('Wrote full app vercel.json and app-mode .vercelignore')
