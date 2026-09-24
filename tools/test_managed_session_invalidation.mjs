import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const result = await build({entryPoints:['showroom/src/core/managed-session-invalidation.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'})
const { watchManagedSessionStorage } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'))
for (const key of ['supermega.auth.session.v1', 'supermega.managed.workspace.v1', null]) {
  let listener, count = 0
  const storage = {}
  const target = {localStorage:storage,addEventListener:(name,fn)=>{assert.equal(name,'storage');listener=fn},removeEventListener:(name,fn)=>{assert.equal(name,'storage');assert.equal(fn,listener);listener=null}}
  const stop = watchManagedSessionStorage(target,()=>count++)
  listener({key,storageArea:{}})
  listener({key:'unrelated-draft',storageArea:storage})
  assert.equal(count,0)
  const event = {key,storageArea:storage,get oldValue(){throw Error('must not read credentials')},get newValue(){throw Error('must not read credentials')}}
  listener(event); listener(event)
  assert.equal(count,1)
  stop(); assert.equal(listener,null)
}
const shell = readFileSync('showroom/src/core/CoreShell.tsx','utf8')
assert.ok(shell.includes('useEffect(() => watchManagedSessionStorage(window, () => setSessionChanged(true)), [])'))
assert.ok(shell.indexOf('if (sessionChanged) return <PortalAccessPanel') < shell.indexOf('<div className={`core-shell'))
console.log('PASS: session/workspace/clear invalidation, no credential reads, cleanup, shell boundary')
