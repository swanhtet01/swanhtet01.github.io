import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REHEARSAL_CONTRACT = 'supermega.client_launch_rehearsal.v1'
const VALIDATION_BATCH_CONTRACT = 'supermega.client_launch_validation_batch.v1'
const COMPANY = Object.freeze({
  workspace: 'Shwe Pyi Foods synthetic rehearsal',
  owner: 'Synthetic operations owner',
  evidenceKind: 'synthetic_fixture',
})
const PRODUCT_ORDER = Object.freeze(['commerce', 'production', 'website', 'ecommerce'])
const PRODUCT_LABELS = Object.freeze({
  commerce: 'Shop',
  production: 'Plant',
  website: 'Website',
  ecommerce: 'Ecommerce',
})
const SELECTED_LAUNCH_PROFILES = Object.freeze({
  commerce: 'social-commerce',
  production: 'production-control',
  website: 'business-presence',
  ecommerce: 'social-storefront',
})
const REHEARSAL_PLANNING_DATE = '2026-07-30'
const INVALID_SOURCE_REPLACEMENTS = Object.freeze({
  commerce: [',24,', ',-1,'],
  production: [',2026-08-13,', ',2026-02-30,'],
  website: [',https://example.com/contact', ',javascript:alert(1)'],
  ecommerce: [',true,', ',yes,'],
})


function invariant(condition, message) {
  if (!condition) throw new Error(message)
}


function pythonExecutable() {
  if (process.env.SUPERMEGA_PYTHON?.trim()) return process.env.SUPERMEGA_PYTHON.trim()
  const local = process.platform === 'win32'
    ? resolve(ROOT, '.venv', 'Scripts', 'python.exe')
    : resolve(ROOT, '.venv', 'bin', 'python')
  if (existsSync(local)) return local
  return process.platform === 'win32' ? 'python' : 'python3'
}


function replaceFirst(value, before, after, label) {
  const position = value.indexOf(before)
  invariant(position >= 0, `The ${label} recovery fixture no longer matches its canonical template.`)
  return `${value.slice(0, position)}${after}${value.slice(position + before.length)}`
}


function genericSource(csvText, fields) {
  const normalized = csvText.replaceAll('\r\n', '\n')
  const lines = normalized.split('\n')
  invariant(lines.length >= 3, 'A workflow template must include a header and data rows.')
  const headers = fields.map((_, index) => `Source ${index + 1}`)
  return {
    csv: [headers.join(','), ...lines.slice(1)].join('\r\n'),
    headers,
    mapping: Object.fromEntries(fields.map((field, index) => [field.id, headers[index]])),
  }
}


function expectDenied(action, reason) {
  let denied = false
  try {
    action()
  } catch {
    denied = true
  }
  invariant(denied, reason)
  return 1
}


function serverValidate(packages) {
  const validation = spawnSync(
    pythonExecutable(),
    [resolve(ROOT, 'tools', 'validate_client_launch_packages.py')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify({ contract: VALIDATION_BATCH_CONTRACT, packages }),
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  )
  let response
  try {
    response = JSON.parse(validation.stdout || '{}')
  } catch {
    throw new Error('The trusted client launch validator returned invalid JSON.')
  }
  invariant(validation.status === 0 && response.ok === true, response.error || 'Trusted client launch validation failed.')
  return response
}


async function buildRehearsal() {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'site-manifest.json'), 'utf8'))
  const model = await import(`${pathToFileURL(resolve(ROOT, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?client-launch=${Date.now()}`)
  const manifestProfiles = new Map(
    manifest.customerProducts.map((product) => [
      product.runtimeId,
      product.templates.map((template) => template.id),
    ]),
  )
  invariant(
    JSON.stringify([...manifestProfiles.keys()]) === JSON.stringify(PRODUCT_ORDER),
    'The canonical four-product order changed.',
  )

  const packages = []
  const profileEvidence = []
  let detectedIssues = 0
  let deniedStagingAttempts = 0
  let manualMappingDecisions = 0
  let sourceValueCorrections = 0
  let exactFirstPassProfiles = 0
  let recoveredProfiles = 0

  for (const product of PRODUCT_ORDER) {
    const profileIds = model.clientImportWorkflowTemplateIds(product)
    invariant(
      JSON.stringify(profileIds) === JSON.stringify(manifestProfiles.get(product)),
      `${PRODUCT_LABELS[product]} workflow profiles drifted from the manifest.`,
    )
    for (const profileId of profileIds) {
      const source = model.clientImportTemplate(product, profileId, { planningDate: REHEARSAL_PLANNING_DATE })
      const sourceName = `${profileId}.csv`
      const selected = SELECTED_LAUNCH_PROFILES[product] === profileId
      let preview
      let correctionMode = 'automatic_exact_or_alias'

      if (selected) {
        const object = model.clientImportObject(product)
        const generic = genericSource(source, object.fields)
        const [validValue, invalidValue] = INVALID_SOURCE_REPLACEMENTS[product]
        const invalidSource = replaceFirst(generic.csv, validValue, invalidValue, `${product}/${profileId}`)
        const unmapped = await model.createClientImportPreview(invalidSource, product, undefined, sourceName, profileId, REHEARSAL_PLANNING_DATE)
        invariant(!unmapped.readyForStaging && unmapped.fileIssues.length > 0, `${profileId} did not require source mapping recovery.`)
        detectedIssues += unmapped.fileIssues.length + unmapped.rows.flatMap((row) => row.issues).length
        deniedStagingAttempts += expectDenied(
          () => model.buildClientImportStagingPackage(unmapped, { workflowTemplateId: profileId, ...COMPANY }),
          `${profileId} staged before its mapping was recovered.`,
        )

        const invalidMapped = await model.createClientImportPreview(invalidSource, product, generic.mapping, sourceName, profileId, REHEARSAL_PLANNING_DATE)
        invariant(!invalidMapped.readyForStaging && invalidMapped.totals.invalid > 0, `${profileId} did not surface its invalid source value.`)
        detectedIssues += invalidMapped.rows.flatMap((row) => row.issues).length
        deniedStagingAttempts += expectDenied(
          () => model.buildClientImportStagingPackage(invalidMapped, { workflowTemplateId: profileId, ...COMPANY }),
          `${profileId} staged before its invalid value was corrected.`,
        )

        preview = await model.createClientImportPreview(generic.csv, product, generic.mapping, sourceName, profileId, REHEARSAL_PLANNING_DATE)
        manualMappingDecisions += object.fields.length
        sourceValueCorrections += 1
        recoveredProfiles += 1
        correctionMode = 'manual_mapping_and_value_recovery'
      } else {
        preview = await model.createClientImportPreview(source, product, undefined, sourceName, profileId, REHEARSAL_PLANNING_DATE)
        exactFirstPassProfiles += 1
      }

      invariant(preview.readyForStaging && preview.totals.ready === preview.totals.rows, `${profileId} was not ready after review.`)
      const staged = model.buildClientImportStagingPackage(preview, { workflowTemplateId: profileId, ...COMPANY })
      invariant(staged.controls.externalWritesPerformed === false, `${profileId} claimed an external write.`)
      invariant(staged.controls.activationStatus === 'staged_not_applied', `${profileId} claimed activation.`)
      packages.push(staged)
      profileEvidence.push({
        product: PRODUCT_LABELS[product],
        runtimeProduct: product,
        profileId,
        selectedLaunchProfile: selected,
        correctionMode,
        rowCount: preview.totals.rows,
        previewDigest: preview.previewDigest,
      })
    }
  }

  for (const product of PRODUCT_ORDER) {
    const selectedPackage = packages.find((item) => (
      item.product === product && item.workflowTemplateId === SELECTED_LAUNCH_PROFILES[product]
    ))
    const alternativeProfile = manifestProfiles.get(product).find((profileId) => profileId !== SELECTED_LAUNCH_PROFILES[product])
    invariant(selectedPackage && alternativeProfile, `${PRODUCT_LABELS[product]} selected launch profile is missing.`)
    const selectedEvidence = profileEvidence.find((item) => (
      item.runtimeProduct === product && item.profileId === SELECTED_LAUNCH_PROFILES[product]
    ))
    const selectedSource = model.clientImportTemplate(product, SELECTED_LAUNCH_PROFILES[product], { planningDate: REHEARSAL_PLANNING_DATE })
    const selectedObject = model.clientImportObject(product)
    const generic = genericSource(selectedSource, selectedObject.fields)
    const selectedPreview = await model.createClientImportPreview(
      generic.csv,
      product,
      generic.mapping,
      `${SELECTED_LAUNCH_PROFILES[product]}.csv`,
      SELECTED_LAUNCH_PROFILES[product],
      REHEARSAL_PLANNING_DATE,
    )
    invariant(selectedEvidence && selectedPreview.previewDigest === selectedEvidence.previewDigest, `${PRODUCT_LABELS[product]} recovery was not deterministic.`)
    deniedStagingAttempts += expectDenied(
      () => model.buildClientImportStagingPackage(selectedPreview, { workflowTemplateId: alternativeProfile, ...COMPANY }),
      `${PRODUCT_LABELS[product]} accepted a stale workflow context.`,
    )
  }

  invariant(packages.length === 12, 'The client launch rehearsal did not produce all 12 packages.')
  invariant(new Set(profileEvidence.map((item) => item.previewDigest)).size === 12, 'Preview identity is not unique per workflow profile.')

  const server = serverValidate(packages)
  invariant(server.package_count === 12 && server.results.length === 12, 'The trusted validator did not return all packages.')
  invariant(server.profile_coverage_complete === true, 'The trusted validator did not confirm exact profile coverage.')
  invariant(server.single_workspace_context === true, 'The trusted validator did not confirm one company context.')
  invariant(new Set(server.results.map((item) => item.package_digest)).size === 12, 'Trusted package identity is not unique per workflow profile.')
  invariant(server.results.every((item) => (
    item.status === 'valid'
    && item.activation.status === 'not_applied'
    && item.activation.human_approval_required === true
    && item.activation.atomic_adapter_ready === ['commerce', 'production', 'website', 'ecommerce'].includes(item.product)
    && item.activation.external_writes_performed === false
  )), 'A trusted validation result exposed the wrong adapter or crossed the activation boundary.')

  const selectedPackages = Object.fromEntries(PRODUCT_ORDER.map((product) => [
    product,
    packages.find((item) => item.product === product && item.workflowTemplateId === SELECTED_LAUNCH_PROFILES[product]),
  ]))
  const shopSkus = new Set(selectedPackages.commerce.rows.map((row) => row.values.sku))
  const ecommerceSkus = selectedPackages.ecommerce.rows.map((row) => row.values.sku)
  const crossProductChecks = {
    ecommerceSkusExistInSelectedShopCatalog: ecommerceSkus.every((sku) => shopSkus.has(sku)),
    websiteHasHomePage: selectedPackages.website.rows.some((row) => row.values.slug === 'home'),
    plantJobsHaveProductionLines: selectedPackages.production.rows.every((row) => Boolean(row.values.line)),
    oneWorkspaceAndOwnerAcrossPackages: packages.every((item) => (
      item.workspace === COMPANY.workspace && item.owner === COMPANY.owner
    )),
  }
  invariant(Object.values(crossProductChecks).every(Boolean), 'The selected four-product launch path is not internally consistent.')

  const stagedRows = profileEvidence.reduce((total, item) => total + item.rowCount, 0)
  return {
    ok: true,
    contract: REHEARSAL_CONTRACT,
    company: COMPANY,
    selectedLaunchProfiles: SELECTED_LAUNCH_PROFILES,
    crossProductChecks,
    serverValidation: {
      profileCoverageComplete: server.profile_coverage_complete,
      singleWorkspaceContext: server.single_workspace_context,
    },
    metrics: {
      productCount: PRODUCT_ORDER.length,
      workflowProfileCount: profileEvidence.length,
      stagedRows,
      exactFirstPassProfiles,
      recoveredProfiles,
      detectedIssues,
      manualMappingDecisions,
      sourceValueCorrections,
      deniedStagingAttempts,
      humanReviewsRequired: server.results.filter((item) => item.activation.human_approval_required).length,
      serverValidatedPackages: server.results.length,
      uniquePreviewDigests: new Set(profileEvidence.map((item) => item.previewDigest)).size,
      uniquePackageDigests: new Set(server.results.map((item) => item.package_digest)).size,
    },
    authority: {
      activationStatus: 'not_applied',
      productWritesPerformed: false,
      hostedWritesPerformed: false,
      connectorCallsPerformed: false,
      modelCallsPerformed: false,
    },
    profiles: profileEvidence.map((item, index) => ({
      ...item,
      packageDigest: server.results[index].package_digest,
      serverStatus: server.results[index].status,
    })),
  }
}


try {
  console.log(JSON.stringify(await buildRehearsal(), null, 2))
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    contract: REHEARSAL_CONTRACT,
    error: error instanceof Error ? error.message : 'Client launch rehearsal failed.',
  }))
  process.exit(1)
}
