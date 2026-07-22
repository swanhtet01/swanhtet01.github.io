import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const routePaths = ['work', 'operations', 'operations/commerce', 'operations/production', 'products/website', 'products/ecommerce', 'settings']

async function main() {
  const rootDir = await realpath(process.cwd())
  const distDir = resolve(rootDir, 'dist')
  const indexHtml = await readFile(resolve(distDir, 'index.html'), 'utf8')

  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')
  for (const routePath of routePaths) {
    const routeDir = resolve(distDir, routePath)
    await mkdir(routeDir, { recursive: true })
    await writeFile(resolve(routeDir, 'index.html'), indexHtml, 'utf8')
  }
}

main()
