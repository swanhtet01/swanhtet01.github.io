import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const routePaths = [
  'platform',
  'agents',
  'factory',
  'solutions',
  'products',
  'products/find-clients',
  'products/company-list',
  'products/receiving-control',
  'products/sales-system',
  'products/operations-inbox',
  'products/client-portal',
  'products/supplier-portal',
  'products/support-service-desk',
  'products/commerce-back-office',
  'products/decision-journal',
  'products/document-intelligence',
  'products/approval-policy-engine',
  'products/founder-brief',
  'products/director-command-center',
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
  'app/insights',
  'app/director',
  'app/actions',
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
  'app/documents',
  'app/architect',
  'app/factory',
  'app/product-ops',
  'app/platform-admin',
  'app/tenant-admin',
  'app/security',
  'app/connectors',
  'app/knowledge',
  'app/policies',
]

async function main() {
  const rootDir = await realpath(process.cwd())
  const distDir = resolve(rootDir, 'dist')
  const indexFile = resolve(distDir, 'index.html')
  const indexHtml = await readFile(indexFile, 'utf8')
  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')

  for (const routePath of routePaths) {
    const routeDir = resolve(distDir, routePath)
    await mkdir(routeDir, { recursive: true })
    await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
  }
}

main()
