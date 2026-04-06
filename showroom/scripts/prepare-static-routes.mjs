import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const indexFile = resolve(distDir, 'index.html')
const routePaths = [
  'systems',
  'products',
  'find-companies',
  'saved-companies',
  'company-list',
  'daily-tasks',
  'task-list',
  'receiving',
  'receiving-log',
  'lead-finder',
  'workspace',
  'action-os',
  'app',
  'app/insights',
  'app/director',
  'app/actions',
  'app/decisions',
  'app/approvals',
  'app/exceptions',
  'app/leads',
  'app/intake',
  'app/receiving',
  'app/inventory',
  'app/news',
  'app/action-board',
  'app/documents',
  'app/architect',
  'login',
  'contact',
  'book',
  'signup',
]

async function main() {
  const indexHtml = await readFile(indexFile, 'utf8')
  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')

  for (const routePath of routePaths) {
    const routeDir = resolve(distDir, routePath)
    await mkdir(routeDir, { recursive: true })
    await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
  }
}

main()
