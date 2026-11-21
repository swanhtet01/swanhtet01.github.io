const EXPECTED_PGLITE_PREFIX = `import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const loadPGlite = async () => {
  try {
    return (await import('@electric-sql/pglite')).PGlite
  } catch (error) {
    const moduleRoot = process.env.SUPERMEGA_NODE_MODULES
    if (!moduleRoot) throw error
    return createRequire(resolve(moduleRoot, 'package.json'))('@electric-sql/pglite').PGlite
  }
}
const PGlite = await loadPGlite()
`

export function hasPGliteRuntimeContract(source) {
  if (typeof source !== 'string') return false
  return source.replace(/\r\n?/g, '\n').startsWith(EXPECTED_PGLITE_PREFIX)
}
