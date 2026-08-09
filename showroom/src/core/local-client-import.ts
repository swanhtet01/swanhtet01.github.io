import {
  clientDemoPreparationConfirmationMatches,
  restoreClientDemoPreparationArtifact,
  type ClientSolutionId,
} from './client-onboarding.ts'
import {
  commerceBusinessCatalogItems,
  commerceWorkspaceIsPristineDemo,
  createEmptyCommerce,
  importCommerceCatalog,
  mutateCommerceWorkspace,
  type CommerceCatalogImportResult,
  type CommerceItem,
  type CommerceStorefrontMerchandising,
} from './commerce-workspace.ts'
import {
  importProductionJobs,
  mutateProductionWorkspace,
  type ProductionJob,
  type ProductionJobsImportResult,
} from './production-workspace.ts'
import {
  activateLocalWebsitePageDrafts,
  type WebsitePageDraftsImportResult,
  type WebsitePageImportDraft,
} from '../products/website/website-model.ts'
import {
  activateLocalEcommerceWorkingSample,
  activateLocalEcommerceMerchandising,
  type LocalEcommerceMerchandisingImport,
} from '../products/ecommerce/local-merchandising-import.ts'
import { plantImportDueAt, type ManagedClientImportPackage } from './managed-trial.ts'

export type LocalClientDemoProductInstall = {
  product: ClientSolutionId
  created: number
  alreadyPresent: number
}

type LocalClientDemoActivationOptions = {
  replaceExistingEcommerceDraft?: boolean
  replacePristineCommerceDemo?: boolean
}

const localProductLabels: Record<ClientSolutionId, string> = {
  commerce: 'Shop',
  production: 'Plant',
  website: 'Website',
  ecommerce: 'Ecommerce',
}

const localClientDemoInstallSequence: readonly ClientSolutionId[] = ['commerce', 'production', 'website', 'ecommerce']

export { activateLocalEcommerceWorkingSample }

export async function preparedLocalClientDemoInstallOrder(artifactValue: unknown): Promise<ClientSolutionId[]> {
  const artifact = await restoreClientDemoPreparationArtifact(artifactValue)
  if (!artifact) throw new Error('The private client package is invalid or has changed. Load it again.')
  const included = new Set(artifact.products.map((product) => product.product))
  return localClientDemoInstallSequence.filter((product) => included.has(product))
}

export async function activateLocalStagingPackage(
  stagingPackage: ManagedClientImportPackage,
  options: LocalClientDemoActivationOptions = {},
): Promise<LocalClientDemoProductInstall> {
  const capturedAt = new Date().toISOString()
  let activation: CommerceCatalogImportResult | ProductionJobsImportResult | WebsitePageDraftsImportResult | LocalEcommerceMerchandisingImport | null = null
  let mutationOk: boolean
  let mutationError = ''
  if (stagingPackage.product === 'commerce') {
    const result = await mutateCommerceWorkspace((current) => {
      const businessItems = commerceBusinessCatalogItems(current)
      if (options.replacePristineCommerceDemo && current.items.length > 0 && businessItems.length === 0 && !commerceWorkspaceIsPristineDemo(current)) {
        mutationError = 'This Shop demo already has activity. Existing records were preserved; reset the demo before replacing it with client products.'
        return null
      }
      const importBase = options.replacePristineCommerceDemo && commerceWorkspaceIsPristineDemo(current)
        ? createEmptyCommerce()
        : current
      const items: CommerceItem[] = stagingPackage.rows.map((row) => ({
        sku: row.values.sku,
        name: row.values.name,
        onHand: Number(row.values.onHand),
        reorderAt: Number(row.values.reorderAt),
        price: Number(row.values.price),
      }))
      activation = importCommerceCatalog(importBase, {
        items,
        sourceDigest: stagingPackage.source.previewDigest,
        capturedAt,
        actor: stagingPackage.owner.trim(),
      })
      return activation?.state ?? null
    })
    mutationOk = result.ok
    mutationError = result.ok ? '' : mutationError || result.error
  } else if (stagingPackage.product === 'production') {
    const result = await mutateProductionWorkspace((current) => {
      const jobs: ProductionJob[] = stagingPackage.rows.map((row) => ({
        id: row.values.jobCode,
        line: row.values.line,
        product: row.values.productName,
        target: Number(row.values.targetQuantity),
        output: 0,
        owner: stagingPackage.owner.trim(),
        priority: 'normal',
        dueAt: plantImportDueAt(row.values.dueDate),
      }))
      activation = importProductionJobs(current, {
        jobs,
        sourceDigest: stagingPackage.source.previewDigest,
        capturedAt,
        actor: stagingPackage.owner.trim(),
      })
      return activation?.state ?? null
    })
    mutationOk = result.ok
    mutationError = result.ok ? '' : result.error
  } else if (stagingPackage.product === 'website') {
    const pages: WebsitePageImportDraft[] = stagingPackage.rows.map((row) => ({
      slug: row.values.slug,
      title: row.values.title,
      headline: row.values.headline,
      body: row.values.body,
      contactUrl: row.values.contactUrl,
    }))
    const result = await activateLocalWebsitePageDrafts({
      siteName: stagingPackage.workspace.trim(),
      pages,
      sourceDigest: stagingPackage.source.previewDigest,
      capturedAt,
    })
    activation = result.ok ? result.import : null
    mutationOk = result.ok
    mutationError = result.ok ? '' : result.error
  } else {
    const rows: CommerceStorefrontMerchandising[] = stagingPackage.rows.map((row) => ({
      sku: row.values.sku,
      featured: row.values.featured === 'true',
      collection: row.values.collection,
      displayName: row.values.displayName,
      note: row.values.note,
    }))
    activation = await activateLocalEcommerceMerchandising({
      storeName: stagingPackage.workspace.trim(),
      rows,
      sourceDigest: stagingPackage.source.previewDigest,
    }, { replaceExistingDraft: options.replaceExistingEcommerceDraft })
    mutationOk = true
  }
  if (!mutationOk || !activation) throw new Error(mutationOk ? `The ${localProductLabels[stagingPackage.product]} import could not be confirmed.` : mutationError)
  return {
    product: stagingPackage.product,
    created: activation.created,
    alreadyPresent: activation.alreadyPresent,
  }
}

export async function applyPreparedLocalClientDemoProduct(
  artifactValue: unknown,
  product: ClientSolutionId,
  founderConfirmation: string,
): Promise<LocalClientDemoProductInstall> {
  const artifact = await restoreClientDemoPreparationArtifact(artifactValue)
  if (!artifact) throw new Error('The private client package is invalid or has changed. Load it again.')
  if (!clientDemoPreparationConfirmationMatches(artifact, founderConfirmation)) {
    throw new Error('Paste the exact founder approval phrase before installing client data.')
  }
  const preparedProduct = artifact.products.find((entry) => entry.product === product)
  if (!preparedProduct) throw new Error('This product is not included in the private client package.')
  return activateLocalStagingPackage(preparedProduct.stagingPackage, {
    replaceExistingEcommerceDraft: product === 'ecommerce',
  })
}
