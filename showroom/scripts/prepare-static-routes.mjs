import { readFile, realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function main() {
  const rootDir = await realpath(process.cwd())
  const distDir = resolve(rootDir, 'dist')
  const indexHtml = await readFile(resolve(distDir, 'index.html'), 'utf8')

  await writeFile(resolve(distDir, '404.html'), indexHtml, 'utf8')
}

main()
