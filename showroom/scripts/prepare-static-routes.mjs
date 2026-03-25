import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const indexFile = resolve(distDir, 'index.html')
const routePaths = [
  'platform',
  'workbench',
  'app',
  'products',
  'solutions',
  'packages',
  'examples',
  'tools',
  'demos',
  'prototypes',
  'try',
  'lead-finder',
  'news-brief',
  'action-board',
  'document-intake',
  'ops-intake',
  'metric-intake',
  'solution-architect',
  'receiving-control',
  'inventory-pulse',
  'workspace',
  'case-studies',
  'dqms',
  'about',
  'contact',
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
