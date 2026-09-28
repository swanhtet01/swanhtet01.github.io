import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-entry')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Link} from 'react-router';
import './src/core/core-app.css';
const deny=()=>{throw new DOMException('Synthetic storage denial','SecurityError')};
Object.defineProperty(window,'localStorage',{get:deny});
Object.defineProperty(window,'sessionStorage',{get:deny});
Object.defineProperty(window,'indexedDB',{get:deny});
window.fetch=async()=>{throw Error('Fixture network denied')};
const report=text=>{document.getElementById('evidence').textContent=text};
window.addEventListener('error',event=>report('FAIL: '+event.message));
window.addEventListener('unhandledrejection',event=>report('FAIL: '+String(event.reason)));
class Boundary extends React.Component {state={failed:false};static getDerivedStateFromError(){return {failed:true}}componentDidCatch(error){report('FAIL: '+error.message)}render(){return this.state.failed?<p>Entry render failed</p>:this.props.children}}
try {
 const {CoreLayout,ProductHomeEntry}=await import('./src/core/CoreShell');
 const {ManagedLoginPage}=await import('./src/core/ManagedLoginPage');
 createRoot(document.getElementById('root')).render(<Boundary><MemoryRouter initialEntries={['/login']}><nav aria-label="Fixture routes"><Link to="/login">Test login</Link><Link to="/?choose=1">Test chooser</Link><Link to="/">Test root</Link></nav><Routes><Route element={<CoreLayout/>}><Route path="login" element={<ManagedLoginPage/>}/><Route index element={<ProductHomeEntry productDemoPath={()=>null}/>}/></Route></Routes></MemoryRouter></Boundary>);
 report('Storage denied; network blocked; actual shell and entry components loaded.');
} catch(error) {report('FAIL: '+error.message)}
` }, jsx:'automatic',bundle:true,format:'esm',target:'es2022',define:{'import.meta.env':'{}'},outfile:resolve(out,'fixture.js') })
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'"><title>Isolated account entry acceptance</title><link rel="stylesheet" href="fixture.css"><output id="evidence"></output><div id="root"></div><script type="module" src="fixture.js"></script>`)
console.log('Built /__qa-entry/. All browser storage denied; no databases created. Remove three generated assets after review.')
