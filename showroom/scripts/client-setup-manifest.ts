import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { activeProductContracts } from '../src/core/product-visibility.ts'

type Manifest = Omit<Parameters<typeof activeProductContracts>[0], 'customerProducts'> & {
  customerProducts: Array<{ id: string; runtimeId: string; name: string; status: string; headline: string; templates: unknown[] }>
}

// A build representation, not another source of truth. Retained identities stay intact.
export function projectClientSetupManifest(source: Manifest) {
  activeProductContracts(source)
  return {
    productVisibility: source.productVisibility,
    customerProducts: source.customerProducts.map(({ id, runtimeId, name, status, headline, templates }) => {
      if (![name, status, headline].every(value => typeof value === 'string') || !Array.isArray(templates)) {
        throw new Error('client_setup_manifest_invalid')
      }
      const clientTemplates = templates.map(value => {
        if (!value || typeof value !== 'object') throw new Error('client_setup_template_invalid')
        const { id, name, outcome, workflow, entryPoints, metric } = value as Record<string, unknown>
        if (![id, name, outcome, metric].every(field => typeof field === 'string')
          || !Array.isArray(workflow) || !workflow.every(field => typeof field === 'string')
          || !Array.isArray(entryPoints) || !entryPoints.every(field => typeof field === 'string')) {
          throw new Error('client_setup_template_invalid')
        }
        return { id, name, outcome, workflow, entryPoints, metric }
      })
      return { id, runtimeId, name, status, headline, templates: clientTemplates }
    }),
  }
}

export function clientSetupManifestPlugin(projectRoot: string): Plugin {
  const manifestPath = resolve(projectRoot, '../site-manifest.json')
  const consumerPath = resolve(projectRoot, 'src/core/product-setup.ts')
  return {
    name: 'supermega-client-setup-manifest',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || resolve(dirname(importer), source) !== manifestPath) return null
      if (resolve(importer) !== consumerPath) throw new Error('client_setup_manifest_unreviewed_consumer')
      return manifestPath
    },
    load(id) {
      if (resolve(id) !== manifestPath) return null
      this.addWatchFile(manifestPath)
      return JSON.stringify(projectClientSetupManifest(JSON.parse(readFileSync(manifestPath, 'utf8'))))
    },
  }
}
