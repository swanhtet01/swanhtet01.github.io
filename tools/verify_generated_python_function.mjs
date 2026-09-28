import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

// Structural check only: no imports, provider calls, or environment values logged.
// Contract: Vercel Build Output API primitives and @vercel/python in CLI 56.1.0.
export async function verifyPythonFunction(output = '.vercel/output') {
  const functions = await realpath(resolve(output, 'functions'))
  const inside = (base, target) => {
    const path = relative(base, target)
    return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path)
  }
  const bundle = await realpath(resolve(functions, 'api/app.func'))
  if (!inside(functions, bundle)) throw new Error('app function escapes generated functions directory')
  const file = async name => {
    const path = await realpath(resolve(bundle, name))
    if (!inside(bundle, path)) throw new Error('function file escapes bundle')
    const info = await stat(path)
    if (!info.isFile() || info.size === 0) throw new Error('required function file is empty or not a file')
    return path
  }
  const config = JSON.parse(await readFile(await file('.vc-config.json'), 'utf8'))
  if (!config || !/^python3\.\d+$/.test(config.runtime)) throw new Error('app function requires a versioned Python 3 runtime')
  // The pinned builder emits a module.callable, not a literal filename.
  if (config.handler !== 'vc__handler__python.vc_handler') throw new Error('unexpected Python builder handler; review pinned builder contract')
  await file('vc__handler__python.py')
  return { status: 'PASS', scope: 'generated Python metadata and launcher only', runtime: config.runtime, coldImport: 'NOT RUN', hostedAcceptance: 'NOT RUN' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await verifyPythonFunction(process.argv[2]), null, 2))
  } catch {
    // Do not echo generated metadata, which may contain environment secrets.
    console.error('FAIL: generated app Python function contract; inspect bundle locally without exposing metadata')
    process.exitCode = 1
  }
}
