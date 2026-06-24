import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const baseRoutePaths = [
  'platform',
  'factory',
  'solutions',
  'products',
  'agentops',
  'ai-back-office',
  'tools',
  'value',
  'try',
  'free-tools',
  'demo',
  'demos',
  'sprint',
  'products/ai-workflow-desk',
  'products/agentops-toolbox',
  'products/ai-back-office',
  'products/back-office-operator',
  'products/workdesk',
  'products/factorydesk',
  'products/storedesk',
  'products/operations-digital-twin',
  'products/industrial-plant-os',
  'products/restaurant-pos-desk',
  'products/service-desk-pos',
  'case-study',
  'modules',
  'portal-types',
  'demo-center',
  'enterprise-demo',
  'packages',
  'pricing',
  'plans',
  'start',
  'intake',
  'implementation',
  'how-it-works',
  'proof',
  'portfolio',
  'find-companies',
  'company-list',
  'task-list',
  'receiving-log',
  'contact',
  'c/umfcci-ai-20260511',
  'book',
  'login',
  'signup',
  'menu',
  'menu/sample',
  'setup',
  'get-started',
  'app',
  'app/start',
  'app/portal',
  'app/use',
  'app/overview',
  'app/plant-a',
  'app/erp',
  'app/system',
  'app/daily-entry',
  'app/onboarding',
  'app/adoption-command',
  'app/pilot',
  'app/data-fabric',
  'app/live-data',
  'app/ai-stack',
  'app/change-monitor',
  'app/data-quality',
  'app/evaluation',
  'app/owner-brief',
  'app/meta',
  'app/meta-ops',
  'app/meta-tools',
  'app/open-source-radar',
  'app/general-use-tools',
  'app/integration-studio',
  'app/tool-integration',
  'app/infrastructure',
  'app/process',
  'app/process-organizer',
  'app/cloud',
  'app/supermega-dev',
  'app/founder-machine',
  'app/market-intel',
  'app/prototype-forge',
  'app/model-ops',
  'app/agent-space',
  'app/custom-workflow',
  'app/workdesk',
  'app/ai-workflow-desk',
  'app/client-room',
  'app/cloud-agent-army',
  'app/agent-workbench',
  'app/adoption',
  'app/workbench',
  'app/insights',
  'app/director',
  'app/plant-manager',
  'app/manager-system',
  'app/daily-brief',
  'app/simple-tools',
  'app/plant-os',
  'app/industrial-os',
  'app/factory-operations',
  'app/factorydesk',
  'app/operations-twin',
  'app/digital-twin',
  'app/plantos-template',
  'app/manager-sops',
  'app/invisible-iso',
  'app/operations',
  'app/attendance-payroll',
  'app/dqms',
  'app/maintenance',
  'app/actions',
  'app/workforce',
  'app/revenue',
  'app/revenue/offers',
  'app/revenue/growth',
  'app/revenue/pipeline',
  'app/revenue/prospecting',
  'app/sales',
  'app/sales/offers',
  'app/commercial',
  'app/sales/growth',
  'app/sales/pipeline',
  'app/sales/prospecting',
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
  'app/work',
  'app/action-board',
  'app/service-desk',
  'app/restaurant-pos',
  'app/storedesk',
  'app/restaurant-os',
  'app/documents',
  'app/lab',
  'app/architect',
  'app/foundry',
  'app/client-build',
  'app/client-signup',
  'app/factory',
  'app/build-studio',
  'app/portal-factory',
  'app/product-ops',
  'app/platform-admin',
  'app/tenant-admin',
  'app/security',
  'app/connectors',
  'app/email',
  'app/knowledge',
  'app/policies',
]

const rootPublicFilesToBundle = ['favicon.svg', 'favicon-32.png', 'favicon-192.png', 'favicon-512.png', 'apple-touch-icon.png', 'site.webmanifest', 'robots.txt']

function uniqueRoutePaths(paths) {
  return Array.from(new Set(paths.map((routePath) => String(routePath || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean))).sort()
}

function extractExportBlock(source, exportName) {
  const start = source.indexOf(`export const ${exportName}`)
  if (start < 0) {
    return ''
  }
  const nextExport = source.indexOf('\nexport ', start + 1)
  return source.slice(start, nextExport > start ? nextExport : source.length)
}

function extractProductRoutesFromSource(source, exportName) {
  const block = extractExportBlock(source, exportName)
  const ids = []
  for (const match of block.matchAll(/\b(?:id|slug):\s*['"]([^'"]+)['"]/g)) {
    const id = String(match[1] || '').trim()
    if (id) {
      ids.push(`products/${id}`)
    }
  }
  return ids
}

async function loadCatalogProductRoutes(rootDir) {
  const sources = [
    { file: resolve(rootDir, 'src', 'lib', 'softwareCatalog.ts'), exportName: 'SOFTWARE_MODULE_DETAILS' },
    { file: resolve(rootDir, 'src', 'lib', 'salesControl.ts'), exportName: 'STARTER_PACK_DETAILS' },
  ]
  const routes = []
  for (const source of sources) {
    try {
      routes.push(...extractProductRoutesFromSource(await readFile(source.file, 'utf8'), source.exportName))
    } catch {
      // Keep static export resilient if a catalog file is unavailable during a partial build.
    }
  }
  return uniqueRoutePaths(routes)
}

async function copyTree(source, destination) {
  const sourceStat = await stat(source)
  if (!sourceStat.isDirectory()) {
    await mkdir(dirname(destination), { recursive: true })
    await copyFileWithRetry(source, destination)
    return
  }

  await mkdir(destination, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = resolve(source, entry.name)
    const destinationPath = resolve(destination, entry.name)
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      await mkdir(dirname(destinationPath), { recursive: true })
      await copyFileWithRetry(sourcePath, destinationPath)
    }
  }
}

async function copyTreeIfPresent(source, destination) {
  try {
    await copyTree(source, destination)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}

async function copyFileWithRetry(source, destination, attempts = 5) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await copyFile(source, destination)
      return
    } catch (error) {
      lastError = error
      if (!['ENOENT', 'EPERM', 'EBUSY'].includes(error?.code) || attempt === attempts) {
        throw error
      }
      await delay(120 * attempt)
    }
  }
  throw lastError
}

async function main() {
  const rootDir = await realpath(process.cwd())
  const routePaths = uniqueRoutePaths([...baseRoutePaths, ...(await loadCatalogProductRoutes(rootDir))])
  const distDir = resolve(rootDir, 'dist')
  const apiStaticDir = resolve(rootDir, '..', 'api-static')
  const apiStaticStageDir = await mkdtemp(resolve(rootDir, '..', 'api-static-staging-'))
  const publicSiteDir = resolve(rootDir, 'public', 'site')
  const bundledSiteDir = resolve(apiStaticStageDir, 'site')
  const indexFile = resolve(distDir, 'index.html')
  const indexHtml = await readFile(indexFile, 'utf8')
  const nestedShowroomDir = resolve(distDir, 'showroom')
  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')
  await rm(nestedShowroomDir, { recursive: true, force: true })
  await mkdir(nestedShowroomDir, { recursive: true })
  await writeFile(resolve(nestedShowroomDir, 'index.html'), indexHtml, 'utf8')

  for (const routePath of routePaths) {
    const routeDir = resolve(distDir, routePath)
    await mkdir(routeDir, { recursive: true })
    await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
    const nestedRouteDir = resolve(nestedShowroomDir, routePath)
    await mkdir(nestedRouteDir, { recursive: true })
    await writeFile(resolve(nestedRouteDir, 'index.html'), indexHtml, 'utf8')
  }

  try {
    await writeFile(resolve(apiStaticStageDir, 'index.html'), indexHtml, 'utf8')
    await writeFile(resolve(apiStaticStageDir, '404.html'), indexHtml, 'utf8')
    await copyTree(resolve(distDir, 'assets'), resolve(apiStaticStageDir, 'assets'))
    await copyTreeIfPresent(resolve(distDir, 'brand'), resolve(apiStaticStageDir, 'brand'))
    await copyTreeIfPresent(resolve(distDir, 'social'), resolve(apiStaticStageDir, 'social'))
    for (const filename of rootPublicFilesToBundle) {
      await copyFileWithRetry(resolve(rootDir, 'public', filename), resolve(apiStaticStageDir, filename))
    }
    await copyTree(publicSiteDir, bundledSiteDir)

    for (const routePath of routePaths) {
      const routeDir = resolve(apiStaticStageDir, routePath)
      await mkdir(routeDir, { recursive: true })
      await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
    }

    await rm(apiStaticDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
    await mkdir(apiStaticDir, { recursive: true })
    await copyFileWithRetry(resolve(apiStaticStageDir, 'index.html'), resolve(apiStaticDir, 'index.html'))
    await copyFileWithRetry(resolve(apiStaticStageDir, '404.html'), resolve(apiStaticDir, '404.html'))
    await copyTree(resolve(apiStaticStageDir, 'assets'), resolve(apiStaticDir, 'assets'))
    await copyTreeIfPresent(resolve(apiStaticStageDir, 'brand'), resolve(apiStaticDir, 'brand'))
    await copyTree(resolve(apiStaticStageDir, 'social'), resolve(apiStaticDir, 'social'))
    await copyTree(resolve(apiStaticStageDir, 'site'), resolve(apiStaticDir, 'site'))
    for (const filename of rootPublicFilesToBundle) {
      await copyFileWithRetry(resolve(apiStaticStageDir, filename), resolve(apiStaticDir, filename))
    }
    for (const routePath of routePaths) {
      const routeDir = resolve(apiStaticDir, routePath)
      await mkdir(routeDir, { recursive: true })
      await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
    }
    await rm(apiStaticStageDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
  } catch (error) {
    await rm(apiStaticStageDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
    throw error
  }
}

main()
