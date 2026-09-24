import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const result = spawnSync('python', ['-X','utf8','-c', `
import json
from copy import deepcopy
from unittest.mock import patch
import tests.test_commerce_runtime as tests
original=tests.apply_event
samples={}
def capture(*a,**k):
 r=original(*a,**k); s=r.get('serviceSchedule',{})
 if s.get('revision') == 4 or (s.get('revision') in (7,8) and len(s.get('packageLedger',[]))==2): samples.setdefault(str(s['revision']),deepcopy(r))
 return r
with patch.object(tests,'apply_event',capture):
 tests.CommerceRuntimeTests('test_service_schedule_is_versioned_inside_commerce_and_fails_closed').test_service_schedule_is_versioned_inside_commerce_and_fails_closed()
print(json.dumps(samples))
`], { encoding:'utf8' })
if(result.status !== 0) throw new Error(result.stderr)
const samples = JSON.parse(result.stdout)
const failWrites = process.argv.includes('--fail-writes')
const mode = process.argv.includes('--setup') ? 'setup' : 'redeem'
const fixture = samples[mode === 'setup' ? '4' : '7']
const at = samples['8'].serviceSchedule.events.at(-1).happenedAt
const out = resolve('showroom/dist/__qa-spa')
mkdirSync(out,{recursive:true})
await build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router';
import {ShopServiceSchedule} from './src/core/ShopServiceSchedule';
import {SHOP_SERVICE_SCHEDULE_STORAGE_KEY} from './src/core/shop-service-scheduling';
import './src/core/core-app.css';
const fixture=${JSON.stringify(fixture)};
const NativeDate=Date; const fixed=NativeDate.parse(${JSON.stringify(at)});
window.Date=class extends NativeDate { constructor(...args:any[]){ if(args.length) super(...args as [any]); else super(fixed); } static now(){return fixed;} } as DateConstructor;
const values=new Map([[SHOP_SERVICE_SCHEDULE_STORAGE_KEY,JSON.stringify(fixture.serviceSchedule)]]);
const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(${failWrites}) throw new Error('Synthetic storage failure'); values.set(k,String(v))},removeItem:(k:string)=>values.delete(k),clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size}};
Object.defineProperty(window,'localStorage',{value:storage});
createRoot(document.getElementById('root')!).render(<MemoryRouter><p role="status">Synthetic QA · memory only · reload resets · no managed connection</p><ShopServiceSchedule initiallyOpen commerce={fixture} actor="Synthetic QA" /></MemoryRouter>);
`},jsx:'automatic',bundle:true,format:'esm',outfile:resolve(out,'fixture.js'),plugins:[{name:'offline-managed',setup(b){b.onResolve({filter:/^\.\/managed-trial$/},()=>({path:'managed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export class ManagedTrialError extends Error{}; export async function currentManagedIdentity(){return null}; export async function loadManagedServiceSchedule(){throw Error('QA blocked')}; export async function saveManagedServiceSchedule(){throw Error('QA blocked')};`,loader:'js'}))}}]})
writeFileSync(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><title>Synthetic Spa QA</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Synthetic fixture built at /__qa-spa/; memory-only storage, fixed fixture time, managed API stubbed, connect-src none.')

