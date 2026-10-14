// Local synthetic visual QA for the same starter generator and HTML exporter used by Sites.
import { mkdirSync, writeFileSync } from 'node:fs'
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
console.log(JSON.stringify({ synthetic: true, output, designs: websiteStarterTemplates.map((template) => template.id) }))
