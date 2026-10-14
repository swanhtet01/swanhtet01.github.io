// Local synthetic visual QA for the same starter generator and HTML exporter used by Sites.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInitialWorkspace, createWebsitePreviewArtifact } from '../showroom/src/products/website/website-model.ts'
import { applyWebsiteStarterBrief, websiteStarterTemplates } from '../showroom/src/products/website/website-starter.ts'
import { buildWebsiteHtml } from '../showroom/src/products/website/website-export.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = resolve(root, '.tmp/qa-workspaces/sites-visual-starters')
mkdirSync(output, { recursive: true })
const brief = {
  businessName: 'Mingalar Studio · Synthetic QA',
  audience: 'families and local teams',
  offer: 'Thoughtful everyday essentials and services for your next project.',
  proof: 'A sample description for local design review. Replace this with the business’s own verified details.',
  contactHref: '',
  offerings: 'Everyday package | A simple starting option; confirm current details on inquiry.\nConsultation | Discuss your needs and timing before choosing a service.\nCustom project | Share the scope so the team can suggest a next step.',
}
for (const template of websiteStarterTemplates) {
  const workspace = applyWebsiteStarterBrief(createInitialWorkspace(), {
    ...brief, templateId: template.id,
  }, '2026-10-14T00:00:00.000Z')
  const html = buildWebsiteHtml(createWebsitePreviewArtifact(workspace))
  writeFileSync(resolve(output, `${template.id}.html`), html)
}
// Exercise the actual first-use picker and canvas together. No account, API, or publish path.
const { build } = createRequire(resolve(root, 'showroom/package.json'))('esbuild')
await build({
  stdin: {
    resolveDir: resolve(root, 'showroom'),
    loader: 'tsx',
    contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{WebsiteStarterSetup}from'./src/products/website/WebsiteStarterSetup';
import{SitePreview}from'./src/products/website/SitePreview';
import{previewWebsiteStarterBrief}from'./src/products/website/website-starter';
import'./src/core/core-app.css';import'./src/products/website/website-product.css';
function App(){const[brief,setBrief]=useState(null);const site=previewWebsiteStarterBrief(brief??{templateId:'business-presence',businessName:'',audience:'',offer:'',proof:'',contactHref:''});return <main className='website-product qa-starter'><WebsiteStarterSetup onCreate={()=>{}} onPreviewChange={setBrief}/><SitePreview device='desktop' page={site.pages[0]} pages={site.pages} siteName={site.siteName} presentation={site.presentation} onSelectPage={()=>{}}/></main>}
createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  jsx: 'automatic',
  format: 'esm',
  external: ['/fonts/noto-sans-myanmar.woff2'],
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  outfile: resolve(output, 'starter-picker.js'),
})
writeFileSync(resolve(output, 'starter-picker.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'"><title>Sites starter picker · synthetic QA</title><link rel="stylesheet" href="starter-picker.css"><style>body{margin:0}.qa-starter{display:grid;grid-template-columns:minmax(320px,460px) minmax(0,1fr);align-items:start;gap:20px;padding:20px}.qa-starter>.website-editor-panel{height:auto}.qa-starter .website-editor-scroll{overflow:visible}.qa-starter .website-preview-panel{min-width:0}@media(max-width:900px){.qa-starter{grid-template-columns:minmax(0,1fr);padding:12px}}</style><div id="root"></div><script type="module" src="starter-picker.js"></script></html>`)
console.log(JSON.stringify({ synthetic: true, output, designs: websiteStarterTemplates.map((template) => template.id) }))
