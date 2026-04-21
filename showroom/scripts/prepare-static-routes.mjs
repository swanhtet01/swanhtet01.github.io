import { copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const routePaths = [
  'platform',
  'agents',
  'factory',
  'solutions',
  'products',
  'demo-center',
  'packages',
  'pricing',
  'plans',
  'implementation',
  'how-it-works',
  'products/find-clients',
  'products/company-list',
  'products/receiving-control',
  'products/sales-system',
  'products/operations-inbox',
  'products/industrial-dqms',
  'products/manager-operating-system',
  'products/client-portal',
  'products/supplier-portal',
  'products/support-service-desk',
  'products/spa-service-desk',
  'products/commerce-back-office',
  'products/decision-journal',
  'products/document-intelligence',
  'products/approval-policy-engine',
  'products/founder-brief',
  'products/director-command-center',
  'products/knowledge-graph',
  'products/agent-runtime',
  'products/tenant-control-plane',
  'products/data-science-studio',
  'find-companies',
  'lead-finder',
  'company-list',
  'saved-companies',
  'task-list',
  'daily-tasks',
  'receiving',
  'receiving-log',
  'action-os',
  'workspace',
  'contact',
  'book',
  'login',
  'signup',
  'clients/yangon-tyre',
  'ytf',
  'app',
  'app/start',
  'app/portal',
  'app/onboarding',
  'app/adoption-command',
  'app/pilot',
  'app/meta',
  'app/cloud',
  'app/supermega-dev',
  'app/model-ops',
  'app/agent-space',
  'app/adoption',
  'app/workbench',
  'app/insights',
  'app/director',
  'app/plant-manager',
  'app/manager-system',
  'app/operations',
  'app/dqms',
  'app/maintenance',
  'app/actions',
  'app/workforce',
  'app/revenue',
  'app/revenue/pipeline',
  'app/revenue/prospecting',
  'app/sales',
  'app/leads',
  'app/leads/advanced',
  'app/decisions',
  'app/approvals',
  'app/exceptions',
  'app/intake',
  'app/receiving',
  'app/inventory',
  'app/news',
  'app/runtime',
  'app/teams',
  'app/action-board',
  'app/service-desk',
  'app/documents',
  'app/lab',
  'app/architect',
  'app/foundry',
  'app/factory',
  'app/product-ops',
  'app/platform-admin',
  'app/tenant-admin',
  'app/security',
  'app/connectors',
  'app/knowledge',
  'app/policies',
]

const siteFilesToBundle = [
  'company-list-live.png',
  'find-clients-live.png',
  'receiving-control-live.png',
  'client-portal.svg',
  'control-room.svg',
  'founder-brief.svg',
  'ops-desk.svg',
  'spa-service-desk.svg',
  'sales-desk.svg',
  'supermega-qr.svg',
]

const rootPublicFilesToBundle = ['favicon.svg', 'favicon-32.png', 'favicon-192.png', 'favicon-512.png', 'apple-touch-icon.png', 'site.webmanifest']

async function main() {
  const rootDir = await realpath(process.cwd())
  const distDir = resolve(rootDir, 'dist')
  const apiStaticDir = resolve(rootDir, '..', 'api-static')
  const apiStaticStageDir = await mkdtemp(resolve(rootDir, '..', 'api-static-staging-'))
  const publicSiteDir = resolve(rootDir, 'public', 'site')
  const bundledSiteDir = resolve(apiStaticStageDir, 'site')
  const indexFile = resolve(distDir, 'index.html')
  const indexHtml = await readFile(indexFile, 'utf8')
  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')

  for (const routePath of routePaths) {
    const routeDir = resolve(distDir, routePath)
    await mkdir(routeDir, { recursive: true })
    await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
  }

  try {
    await writeFile(resolve(apiStaticStageDir, 'index.html'), indexHtml, 'utf8')
    await writeFile(resolve(apiStaticStageDir, '404.html'), indexHtml, 'utf8')
    await cp(resolve(distDir, 'assets'), resolve(apiStaticStageDir, 'assets'), { recursive: true })
    for (const filename of rootPublicFilesToBundle) {
      await copyFile(resolve(rootDir, 'public', filename), resolve(apiStaticStageDir, filename))
    }
    await mkdir(bundledSiteDir, { recursive: true })

    for (const filename of siteFilesToBundle) {
      await copyFile(resolve(publicSiteDir, filename), resolve(bundledSiteDir, filename))
    }

    for (const routePath of routePaths) {
      const routeDir = resolve(apiStaticStageDir, routePath)
      await mkdir(routeDir, { recursive: true })
      await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
    }

    await rm(apiStaticDir, { recursive: true, force: true })
    await cp(apiStaticStageDir, apiStaticDir, { recursive: true })
    await rm(apiStaticStageDir, { recursive: true, force: true })
  } catch (error) {
    await rm(apiStaticStageDir, { recursive: true, force: true })
    throw error
  }
}

main()
