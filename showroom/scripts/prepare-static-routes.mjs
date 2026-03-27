import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const indexFile = resolve(distDir, 'index.html')
const routePaths = [
  'platform',
  'app',
  'app/director',
  'app/actions',
  'app/decisions',
  'app/exceptions',
  'app/leads',
  'app/intake',
  'app/receiving',
  'app/inventory',
  'app/news',
  'app/action-board',
  'app/documents',
  'app/architect',
  'products',
  'solutions',
  'packages',
  'lead-finder',
  'login',
  'contact',
  'book',
  'workbench',
  'workspace',
  'ops-intake',
  'metric-intake',
  'receiving-control',
  'inventory-pulse',
  'news-brief',
  'action-board',
  'document-intake',
  'solution-architect',
  'examples',
  'tools',
  'demos',
  'prototypes',
  'try',
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
