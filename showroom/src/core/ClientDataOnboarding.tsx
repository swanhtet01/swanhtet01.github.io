import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import {
  CLIENT_IMPORT_MAX_BYTES,
  buildClientImportStagingPackage,
  clientImportChecklist,
  clientImportObject,
  clientImportTemplate,
  createClientImportPreview,
  type ClientImportMapping,
  type ClientImportPreview,
  type ClientDemoProductProgress,
  type ClientSolutionId,
} from './client-onboarding'
import { activateLocalStagingPackage } from './local-client-import'
import {
  ManagedTrialError,
  applyManagedClientImport,
  assertManagedClientImportState,
  buildManagedClientImportProvisioningPlan,
  loadManagedBootstrap,
  loadManagedServiceSchedule,
  managedClientImportActivationContext,
  preflightManagedClientImport,
  sameManagedClientImportState,
  sameManagedIdentity,
  saveManagedServiceSchedule,
  validateManagedClientImport,
  type ManagedClientImportActivationContext,
  type ManagedClientImportActivationResult,
  type ManagedClientImportApplyPreflight,
  type ManagedClientImportPackage,
  type ManagedClientImportProvisioningPlan,
  type ManagedClientImportValidation,
  type ManagedIdentity,
} from './managed-trial'
import { createShopServiceSchedule, type ShopIndustryPackId } from './shop-service-scheduling'
import type { PlantIndustryPackId } from './plant-industry-packs'
import { PlantEquipmentOnboarding } from './PlantEquipmentOnboarding'

type ClientDataOnboardingProps = {
  product: ClientSolutionId
  productName: string
  productSlug: string
  workflowTemplateId: string
  workspace: string
  owner: string
  shopIndustryPackId?: ShopIndustryPackId
  plantIndustryPackId?: PlantIndustryPackId
  managedIdentity: ManagedIdentity | null
  onProgress?: (progress: ClientDemoProductProgress) => void
  initiallyOpen?: boolean
}

type ValidatedImport = {
  activationContext: ManagedClientImportActivationContext
  commandId: string
  contextKey: string
  provisioningPlan: ManagedClientImportProvisioningPlan
  preflight: ManagedClientImportApplyPreflight | null
  receipt: ManagedClientImportValidation
  stagingPackage: ManagedClientImportPackage
}

type AppliedImport = {
  contextKey: string
  receipt: ManagedClientImportActivationResult
  shopPack?: { id: ShopIndustryPackId; version: number }
  plantPack?: { id: PlantIndustryPackId }
}

type LocalAppliedImport = {
  product: 'commerce' | 'production' | 'website' | 'ecommerce'
  contextKey: string
  created: number
  alreadyPresent: number
}

type ImportState = {
  sourceName: string
  sourceText: string
  preview: ClientImportPreview | null
  busy: boolean
  validating: boolean
  preflighting: boolean
  applying: boolean
  applyConfirmed: boolean
  applied: AppliedImport | null
  localApplied: LocalAppliedImport | null
  validation: ValidatedImport | null
  error: string
}

const mappingBasisLabels: Record<string, string> = {
  exact: 'Matched',
  alias: 'Matched',
  ambiguous: 'Choose a column',
  unmapped: 'Not matched',
  reviewed: 'Chosen by you',
  required: 'Required',
  optional: 'Optional',
}

const rowStatusLabels: Record<string, string> = {
  ready: 'Ready',
  already_exists: 'Already there',
  invalid: 'Fix row',
  duplicate: 'Duplicate',
  conflict: 'Conflict',
}

function csvCell(value: string) {
  const safe = value.replace(/"/g, '""')
  return /[",\r\n]/.test(safe) ? `"${safe}"` : safe
}

function emptyImportState(): ImportState {
  return {
    sourceName: '',
    sourceText: '',
    preview: null,
    busy: false,
    validating: false,
    preflighting: false,
    applying: false,
    applyConfirmed: false,
    applied: null,
    localApplied: null,
    validation: null,
    error: '',
  }
}

function importCommandId() {
  const commandId = globalThis.crypto?.randomUUID?.()
  if (!commandId) throw new Error('Secure import confirmation is unavailable in this browser.')
  return commandId
}

function managedImportBase(product: ClientSolutionId, state: Record<string, unknown>) {
  const base = { ...state }
  if (product === 'commerce') delete base.serviceSchedule
  if (product === 'production') {
    delete base.orderExecution
    delete base.orderPortfolio
  }
  return base
}

function validationContextKey(
  product: ClientSolutionId,
  workflowTemplateId: string,
  previewDigest: string,
  workspace: string,
  owner: string,
  managedIdentity: ManagedIdentity | null,
  shopIndustryPackId?: ShopIndustryPackId,
  plantIndustryPackId?: PlantIndustryPackId,
) {
  return JSON.stringify([
    product,
    workflowTemplateId,
    previewDigest,
    workspace,
    owner,
    managedIdentity?.userId ?? '',
    managedIdentity?.workspaceId ?? '',
    shopIndustryPackId ?? '',
    plantIndustryPackId ?? '',
  ])
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function ClientDataOnboarding({ product, productName, productSlug, workflowTemplateId, workspace, owner, shopIndustryPackId, plantIndustryPackId, managedIdentity, onProgress, initiallyOpen = false }: ClientDataOnboardingProps) {
  const object = clientImportObject(product)
  const templateContext = { shopIndustryPackId, plantIndustryPackId }
  const checklist = clientImportChecklist(product, workflowTemplateId, templateContext)
  const requestRef = useRef(0)
  const validationRequestRef = useRef(0)
  const productRef = useRef(product)
  const workflowTemplateRef = useRef(workflowTemplateId)
  const workspaceRef = useRef(workspace)
  const ownerRef = useRef(owner)
  const shopIndustryPackIdRef = useRef(shopIndustryPackId)
  const plantIndustryPackIdRef = useRef(plantIndustryPackId)
  const managedIdentityRef = useRef(managedIdentity)
  const previewRef = useRef<HTMLDivElement>(null)
  const onProgressRef = useRef(onProgress)
  productRef.current = product
  workflowTemplateRef.current = workflowTemplateId
  workspaceRef.current = workspace
  ownerRef.current = owner
  shopIndustryPackIdRef.current = shopIndustryPackId
  plantIndustryPackIdRef.current = plantIndustryPackId
  managedIdentityRef.current = managedIdentity
  onProgressRef.current = onProgress
  const [state, setState] = useState<ImportState>(emptyImportState)
  const currentValidationContext = validationContextKey(
    product,
    workflowTemplateId,
    state.preview?.previewDigest ?? '',
    workspace,
    owner,
    managedIdentity,
    shopIndustryPackId,
    plantIndustryPackId,
  )
  const validationIsCurrent = Boolean(
    managedIdentity
    && state.validation
    && state.validation.contextKey === currentValidationContext,
  )
  const appliedIsCurrent = Boolean(
    managedIdentity
    && state.applied
    && state.applied.contextKey === currentValidationContext,
  )
  const localAppliedIsCurrent = Boolean(
    !managedIdentity
    && state.localApplied
    && state.localApplied.product === product
    && state.localApplied.contextKey === currentValidationContext,
  )
  const localActivationAvailable = !managedIdentity
  const localRecordLabel = product === 'commerce' ? 'Shop items' : product === 'production' ? 'Plant jobs' : product === 'website' ? 'Website pages' : 'Ecommerce display rows'
  const localActionLabel = product === 'commerce' ? 'items to Shop' : product === 'production' ? 'jobs to Plant' : product === 'website' ? 'pages to Website' : 'display rows to Ecommerce'
  const localUseLabel = product === 'commerce' ? 'catalog in a real sale' : product === 'production' ? 'jobs in production control' : product === 'website' ? 'page drafts in the Website editor' : 'reviewed merchandising in the customer storefront'
  const localOpenPath = product === 'commerce' ? '/shop/?tab=counter' : product === 'production' ? '/plant/?tab=production' : product === 'website' ? '/website/' : '/ecommerce/'
  const visibleRows = state.preview
    ? [
        ...state.preview.rows.filter((row) => row.status !== 'ready'),
        ...state.preview.rows.filter((row) => row.status === 'ready'),
      ].slice(0, 12)
    : []
  const matchedFieldCount = state.preview
    ? state.preview.fields.filter((field) => Boolean(state.preview?.mapping[field.id])).length
    : 0
  const mappingNeedsReview = Boolean(state.preview?.fields.some((field) => field.required && !state.preview?.mapping[field.id]))
  const importContextReady = Boolean(workspace.trim() && owner.trim())
  const managedActivation = product === 'commerce'
    ? {
        surface: 'commerce' as const,
        reviewLabel: 'Shop items',
        createdLabel: 'Shop catalog items',
        completedLabel: 'Shop items',
        productLabel: 'Shop',
        resultVerb: 'created',
        progressLabel: 'Creating one revisioned Shop catalog and confirming the durable result…',
        busyLabel: 'Creating catalog…',
        failure: 'The Company Shop catalog was not created. The checked import is still available.',
      }
    : product === 'production'
      ? {
          surface: 'production' as const,
          reviewLabel: 'Plant jobs',
          createdLabel: 'Plant opening jobs',
          completedLabel: 'Plant jobs',
          productLabel: 'Plant',
          resultVerb: 'created',
          progressLabel: 'Creating one Plant opening plan and confirming the durable result…',
          busyLabel: 'Creating plan…',
          failure: 'The Company Plant opening plan was not created. The checked import is still available.',
        }
      : product === 'website'
      ? {
          surface: 'website' as const,
          reviewLabel: 'Website pages',
          createdLabel: 'Website page drafts',
          completedLabel: 'Website drafts',
          productLabel: 'Website',
          resultVerb: 'created',
          progressLabel: 'Creating one Website draft set and confirming the durable result…',
          busyLabel: 'Creating drafts…',
          failure: 'The Company Website drafts were not created. The checked import is still available.',
        }
      : product === 'ecommerce'
        ? {
            surface: 'commerce' as const,
            reviewLabel: 'Ecommerce display rows',
            createdLabel: 'Ecommerce display rows',
            completedLabel: 'Ecommerce display rows',
            productLabel: 'Ecommerce',
            resultVerb: 'applied',
            progressLabel: 'Applying reviewed display details to the saved storefront and confirming the durable result…',
            busyLabel: 'Applying details…',
            failure: 'The Ecommerce display details were not applied. The checked import is still available.',
          }
        : null
  const canPrepareImport = Boolean(state.preview?.readyForStaging && importContextReady && !state.busy && !state.validating && !state.preflighting && !state.applying)
  const canApplyManagedImport = Boolean(
    managedActivation
    && managedIdentity
    && validationIsCurrent
    && state.validation?.receipt.activation.atomic_adapter_ready
    && state.applyConfirmed
    && !state.preflighting
    && !state.applying
    && !appliedIsCurrent,
  )
  const canApplyLocalImport = Boolean(
    localActivationAvailable
    && state.preview?.readyForStaging
    && importContextReady
    && state.applyConfirmed
    && !state.applying
    && !localAppliedIsCurrent,
  )
  const importStageRows = [
    ['Read file', state.preview ? `${state.preview.totals.rows} rows` : state.busy ? 'Reading' : 'Waiting'],
    ['Match columns', state.preview ? mappingNeedsReview ? 'Review' : `${matchedFieldCount}/${state.preview.fields.length}` : 'Auto'],
    ['Check company', appliedIsCurrent || localAppliedIsCurrent ? 'Applied' : validationIsCurrent ? 'Checked' : state.validating ? 'Checking' : managedIdentity ? 'Ready' : localActivationAvailable ? `Local ${productName}` : 'Local file'],
    ['Confirm import', appliedIsCurrent || localAppliedIsCurrent ? 'Done' : state.preflighting ? 'Final check' : state.applying ? 'Writing' : canApplyManagedImport || canApplyLocalImport ? 'Ready' : state.preview?.readyForStaging ? 'Prepare' : 'Locked'],
  ] as const
  const importStageMessage = localAppliedIsCurrent
    ? `${state.localApplied?.created ?? 0} ${localRecordLabel} added; ${state.localApplied?.alreadyPresent ?? 0} were already current.`
    : appliedIsCurrent
    ? `${productName} import is confirmed for this company.`
    : state.preview
      ? mappingNeedsReview
        ? 'Choose the missing required columns. Rows stay read-only until the mapping is clean.'
        : state.preview.readyForStaging
          ? managedIdentity
            ? 'The file is clean. Check it with the company account, then confirm the final import.'
            : `The file is clean. Review it once, then confirm it into this browser's ${productName} demo.`
          : 'Fix the highlighted rows before this can become a clean import.'
      : `Drop in a CSV or try the sample. SuperMega reads, maps, and checks ${object.label.toLowerCase()} before any write.`
  const missingRequiredColumns = state.preview
    ? state.preview.fields.filter((field) => field.required && !state.preview?.mapping[field.id]).length
    : 0
  const importRepairRows = state.preview
    ? [
        ['Missing columns', missingRequiredColumns ? `${missingRequiredColumns} fix` : 'Clear'],
        ['Row fixes', state.preview.totals.issueRows ? `${state.preview.totals.issueRows} rows` : 'None'],
        ['Duplicate keys', state.preview.totals.duplicates ? `${state.preview.totals.duplicates} found` : 'None'],
        ['Ready rows', `${state.preview.totals.ready}/${state.preview.totals.rows}`],
      ] as const
    : []
  const importRepairMessage = state.preview
    ? state.preview.readyForStaging
      ? 'Clean enough to prepare. SuperMega will still ask before anything is written.'
      : missingRequiredColumns
        ? 'Match the required columns first; then row-level fixes become reliable.'
        : state.preview.totals.duplicates
          ? 'Remove or rename duplicate keys so every imported record has one owner.'
          : 'Fix the row messages below; ready rows stay protected while you clean the rest.'
    : ''
  const progressStatus: ClientDemoProductProgress['status'] = appliedIsCurrent || localAppliedIsCurrent
    ? 'applied'
    : validationIsCurrent
      ? 'workspace_checked'
      : state.preview?.readyForStaging
        ? 'data_ready'
        : state.preview
          ? 'needs_fix'
          : 'not_started'

  useEffect(() => {
    onProgressRef.current?.({
      product,
      status: progressStatus,
      rows: state.preview?.totals.rows ?? 0,
      readyRows: state.preview?.totals.ready ?? 0,
      issueRows: state.preview?.totals.issueRows ?? 0,
      updatedAt: null,
    })
  }, [product, progressStatus, state.preview?.totals.issueRows, state.preview?.totals.ready, state.preview?.totals.rows])
  const importCoachAction = appliedIsCurrent
    ? 'Ready to use'
    : state.preflighting
      ? 'Running final check'
      : state.applying
        ? 'Confirming import'
        : canApplyManagedImport
          ? `Import ${state.validation?.stagingPackage.rows.length ?? 0} reviewed rows`
          : validationIsCurrent
            ? 'Approve checked import'
            : state.validating
              ? 'Checking company'
              : state.preview
                ? mappingNeedsReview
                  ? 'Match required columns'
                  : state.preview.totals.duplicates
                    ? 'Fix duplicate keys'
                    : state.preview.totals.issueRows
                      ? 'Fix row issues'
                      : !importContextReady
                        ? 'Add company and owner'
                        : managedIdentity
                          ? 'Check with company'
                          : 'Prepare import file'
                : 'Upload or try sample'
  const importCoachReason = appliedIsCurrent
    ? 'The company import is confirmed and ready to use.'
    : state.preflighting
      ? 'SuperMega is checking this file against the selected company, owner, product, and latest saved records before anything changes.'
      : canApplyManagedImport
        ? 'The company check passed and the review box is ticked.'
        : validationIsCurrent
          ? 'The file passed the company check. Review is still required before records change.'
          : state.preview
            ? state.preview.readyForStaging
              ? 'The file is clean; the next step is a company check or setup file.'
              : importRepairMessage
            : 'Start with a CSV or sample so SuperMega can map columns and inspect rows locally.'
  const importCoachRows = [
    ['Next action', importCoachAction],
    ['Reason', importCoachReason],
    ['Safety', managedIdentity ? 'Company check first' : 'Local file only'],
  ] as const
  const activationHandoffAction = appliedIsCurrent
    ? 'Open company account'
    : canApplyManagedImport
      ? 'Import is ready'
      : validationIsCurrent
        ? 'Review required'
        : state.preview?.readyForStaging
          ? managedIdentity
            ? 'Run company check'
            : 'Download setup file'
          : state.preview
            ? 'Clean package first'
            : 'Prepare first package'
  const activationHandoffReason = appliedIsCurrent
    ? 'This company has a confirmed import receipt.'
    : canApplyManagedImport
      ? 'The file is checked, the product is ready, and the review box is selected.'
      : validationIsCurrent
        ? 'Company check passed with zero records written; review the import before going live.'
        : state.preview?.readyForStaging
          ? managedIdentity
            ? 'The clean file can be checked against the company account before anything changes.'
            : 'Free mode can export the package for support review without sending data from the browser.'
          : state.preview
            ? 'Setup stays locked until required columns, row issues, and duplicate keys are clear.'
            : 'Start with the sample or a CSV so SuperMega can build one clear setup file.'
  const activationHandoffRows = [
    ['Package', state.preview ? `${state.preview.totals.ready}/${state.preview.totals.rows} ready` : 'Waiting'],
    ['Company', importContextReady ? workspace.trim() : 'Missing'],
    ['Owner', importContextReady ? owner.trim() : 'Missing'],
    ['Review', appliedIsCurrent ? 'Receipt ready' : canApplyManagedImport ? 'Approved' : validationIsCurrent ? 'Approve' : state.preview?.readyForStaging ? 'Prepare' : 'Locked'],
  ] as const
  const provisioningPlan = validationIsCurrent ? state.validation?.provisioningPlan : null
  const provisioningPlanRows = provisioningPlan
    ? [
        ['Status', provisioningPlan.status === 'ready_for_owner_review' ? 'Review' : 'Blocked'],
        ['Target', provisioningPlan.target_surface],
        ['Rows', `${provisioningPlan.row_count}`],
        ['Version', `${provisioningPlan.expected_version}`],
        ['Final check', state.validation?.preflight ? 'Company record checked' : 'Runs before import'],
        ['Controls', `${provisioningPlan.required_controls.length}`],
      ] as const
    : []

  useEffect(() => {
    requestRef.current += 1
    validationRequestRef.current += 1
    setState(emptyImportState())
  }, [product, workflowTemplateId])

  useEffect(() => {
    validationRequestRef.current += 1
    setState((current) => ({ ...current, validating: false, preflighting: false, applying: false, applyConfirmed: false, applied: null, localApplied: null, validation: null, error: '' }))
  }, [managedIdentity?.userId, managedIdentity?.workspaceId, owner, workspace])

  async function runPreview(
    sourceName: string,
    sourceText: string,
    mapping?: ClientImportMapping,
    expectedProduct = product,
    expectedWorkflowTemplateId = workflowTemplateId,
  ) {
    if (productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    validationRequestRef.current += 1
    setState((current) => ({ ...current, sourceName, sourceText, busy: true, validating: false, preflighting: false, applying: false, validation: null, error: '' }))
    try {
      const preview = await createClientImportPreview(sourceText, expectedProduct, mapping, sourceName, expectedWorkflowTemplateId)
      if (requestRef.current !== requestId || productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
      setState({ ...emptyImportState(), sourceName, sourceText, preview })
      if (!mapping) window.requestAnimationFrame(() => previewRef.current?.focus())
    } catch (error) {
      if (requestRef.current !== requestId || productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
      setState((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : 'The CSV could not be previewed.' }))
    }
  }

  async function chooseFile(file: File | null) {
    if (!file) return
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv') && file.type !== 'text/csv') {
      setState({ ...emptyImportState(), sourceName: file.name, error: 'Choose a CSV file, not an Excel workbook or another format.' })
      return
    }
    if (file.size > CLIENT_IMPORT_MAX_BYTES) {
      setState({ ...emptyImportState(), sourceName: file.name, error: `Choose a CSV smaller than ${CLIENT_IMPORT_MAX_BYTES / 1024} KB.` })
      return
    }
    validationRequestRef.current += 1
    setState({ ...emptyImportState(), sourceName: file.name, busy: true })
    try {
      const sourceText = await file.text()
      if (requestRef.current !== requestId || productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
      await runPreview(file.name, sourceText, undefined, expectedProduct, expectedWorkflowTemplateId)
    } catch {
      if (requestRef.current !== requestId || productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
      setState({ ...emptyImportState(), sourceName: file.name, error: 'The browser could not read this CSV.' })
    }
  }

  function remap(field: string, header: string) {
    if (!state.preview || !state.sourceText) return
    void runPreview(state.sourceName, state.sourceText, { ...state.preview.mapping, [field]: header })
  }

  function clearPreview() {
    requestRef.current += 1
    validationRequestRef.current += 1
    setState(emptyImportState())
  }

  function downloadTemplate() {
    downloadFile(
      `supermega-${productSlug}-${workflowTemplateId}-${object.id}-sample-v1.csv`,
      `\uFEFF${clientImportTemplate(product, workflowTemplateId, templateContext)}`,
      'text/csv;charset=utf-8',
    )
  }

  function downloadChecklist() {
    const rows = [
      ['field', 'required', 'kind', 'accepted_headers', 'example', 'rule'],
      ...checklist.map((row) => [
        row.field,
        row.required ? 'yes' : 'no',
        row.kind,
        row.acceptedHeaders.join(' | '),
        row.example,
        row.note,
      ]),
    ]
    downloadFile(
      `supermega-${productSlug}-${workflowTemplateId}-${object.id}-data-checklist-v1.csv`,
      `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
      'text/csv;charset=utf-8',
    )
  }

  function previewSample() {
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    void runPreview(
      `supermega-${productSlug}-${expectedWorkflowTemplateId}-${object.id}-sample-v1.csv`,
      clientImportTemplate(expectedProduct, expectedWorkflowTemplateId, templateContext),
      undefined,
      expectedProduct,
      expectedWorkflowTemplateId,
    )
  }

  function currentStagingPackage() {
    if (!state.preview) throw new Error('Preview the CSV before preparing an import file.')
    return buildClientImportStagingPackage(state.preview, {
      workflowTemplateId,
      workspace,
      owner,
      plantIndustryPackId,
    })
  }

  function downloadStagingPackage(stagingPackage: ManagedClientImportPackage) {
    downloadFile(
      `supermega-${productSlug}-${workflowTemplateId}-client-import-staging-v1.json`,
      `${JSON.stringify(stagingPackage, null, 2)}\n`,
      'application/json;charset=utf-8',
    )
  }

  async function validateOrDownloadStagingPackage() {
    if (!state.preview) return
    const expectedIdentity = managedIdentity
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    const expectedWorkspace = workspace
    const expectedOwner = owner
    const expectedShopIndustryPackId = shopIndustryPackId
    const expectedPlantIndustryPackId = plantIndustryPackId
    const expectedPreviewDigest = state.preview.previewDigest
    const expectedContextKey = currentValidationContext
    const validationContextChanged = () => (
      productRef.current !== expectedProduct
      || workflowTemplateRef.current !== expectedWorkflowTemplateId
      || workspaceRef.current !== expectedWorkspace
      || ownerRef.current !== expectedOwner
      || shopIndustryPackIdRef.current !== expectedShopIndustryPackId
      || plantIndustryPackIdRef.current !== expectedPlantIndustryPackId
      || !expectedIdentity
      || !managedIdentityRef.current
      || !sameManagedIdentity(managedIdentityRef.current, expectedIdentity)
    )
    let validationRequestId: number | null = null
    try {
      if (validationIsCurrent && state.validation) {
        downloadStagingPackage(state.validation.stagingPackage)
        setState((current) => ({ ...current, error: '' }))
        return
      }
      const stagingPackage = currentStagingPackage()
      if (!expectedIdentity) {
        downloadStagingPackage(stagingPackage)
        setState((current) => ({ ...current, error: '' }))
        return
      }

      validationRequestId = validationRequestRef.current + 1
      validationRequestRef.current = validationRequestId
      setState((current) => ({ ...current, validating: true, preflighting: false, validation: null, error: '' }))
      const receipt = await validateManagedClientImport(stagingPackage, expectedIdentity)
      if (validationRequestRef.current !== validationRequestId || validationContextChanged()) return
      const activationBootstrap = stagingPackage.product === 'ecommerce'
        ? await loadManagedBootstrap(expectedIdentity)
        : undefined
      if (validationRequestRef.current !== validationRequestId || validationContextChanged()) return
      const activationContext = managedClientImportActivationContext(stagingPackage, activationBootstrap)
      const provisioningPlan = buildManagedClientImportProvisioningPlan(
        stagingPackage,
        receipt,
        expectedIdentity,
        activationContext,
      )
      const commandId = receipt.activation.atomic_adapter_ready ? importCommandId() : ''
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        ? {
            ...current,
            validating: false,
            preflighting: false,
            applying: false,
            applyConfirmed: false,
            applied: null,
            validation: {
              activationContext,
              commandId,
              contextKey: expectedContextKey,
              preflight: null,
              provisioningPlan,
              receipt,
              stagingPackage,
            },
            error: '',
          }
        : current)
    } catch (error) {
      if (validationRequestId !== null
        && (validationRequestRef.current !== validationRequestId || validationContextChanged())) return
      setState((current) => ({
        ...current,
        validating: false,
        preflighting: false,
        validation: null,
        error: error instanceof Error ? error.message : 'The staging package could not be validated.',
      }))
    }
  }

  async function activateLocalImport() {
    if (!canApplyLocalImport || !state.preview || managedIdentity || !localActivationAvailable) return
    const expectedContextKey = currentValidationContext
    const expectedPreviewDigest = state.preview.previewDigest
    const expectedProduct = product
    const expectedLocalProduct: LocalAppliedImport['product'] = product
    const expectedWorkflowTemplateId = workflowTemplateId
    const expectedWorkspace = workspace
    const expectedOwner = owner
    const expectedShopIndustryPackId = shopIndustryPackId
    const expectedPlantIndustryPackId = plantIndustryPackId
    const activationRequestId = validationRequestRef.current + 1
    validationRequestRef.current = activationRequestId
    const contextChanged = () => (
      validationRequestRef.current !== activationRequestId
      || productRef.current !== expectedProduct
      || workflowTemplateRef.current !== expectedWorkflowTemplateId
      || workspaceRef.current !== expectedWorkspace
      || ownerRef.current !== expectedOwner
      || shopIndustryPackIdRef.current !== expectedShopIndustryPackId
      || plantIndustryPackIdRef.current !== expectedPlantIndustryPackId
      || managedIdentityRef.current !== null
    )
    const stagingPackage = currentStagingPackage()
    setState((current) => ({ ...current, applying: true, localApplied: null, error: '' }))
    try {
      const confirmed = await activateLocalStagingPackage(stagingPackage)
      if (contextChanged()) return
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        ? {
            ...current,
            applying: false,
            applyConfirmed: false,
            localApplied: {
              product: expectedLocalProduct,
              contextKey: expectedContextKey,
              created: confirmed.created,
              alreadyPresent: confirmed.alreadyPresent,
            },
            error: '',
          }
        : current)
    } catch (error) {
      if (contextChanged()) return
      setState((current) => ({
        ...current,
        applying: false,
        localApplied: null,
        error: error instanceof Error ? error.message : `The ${productName} company data was not changed.`,
      }))
    }
  }

  async function activateManagedImport() {
    const expectedIdentity = managedIdentity
    const validated = state.validation
    if (!expectedIdentity
      || !managedActivation
      || !validationIsCurrent
      || !validated
      || !validated.receipt.activation.atomic_adapter_ready
      || !state.applyConfirmed
      || state.preflighting
      || state.applying
      || appliedIsCurrent) return
    const expectedContextKey = currentValidationContext
    const expectedPreviewDigest = state.preview?.previewDigest ?? ''
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    const expectedWorkspace = workspace
    const expectedOwner = owner
    const expectedShopIndustryPackId = shopIndustryPackId
    const expectedPlantIndustryPackId = plantIndustryPackId
    const activationRequestId = validationRequestRef.current + 1
    validationRequestRef.current = activationRequestId
    const contextChanged = () => (
      validationRequestRef.current !== activationRequestId
      || productRef.current !== expectedProduct
      || workflowTemplateRef.current !== expectedWorkflowTemplateId
      || workspaceRef.current !== expectedWorkspace
      || ownerRef.current !== expectedOwner
      || shopIndustryPackIdRef.current !== expectedShopIndustryPackId
      || plantIndustryPackIdRef.current !== expectedPlantIndustryPackId
      || !managedIdentityRef.current
      || !sameManagedIdentity(managedIdentityRef.current, expectedIdentity)
    )
    setState((current) => ({
      ...current,
      preflighting: !validated.preflight,
      applying: Boolean(validated.preflight),
      applied: null,
      error: '',
    }))
    try {
      const preflight = validated.preflight ?? await preflightManagedClientImport({
        expectedVersion: validated.activationContext.expectedVersion,
        identity: expectedIdentity,
        stagingPackage: validated.stagingPackage,
        validation: validated.receipt,
      })
      if (contextChanged()) return
      setState((current) => current.validation?.commandId === validated.commandId
        ? {
            ...current,
            preflighting: false,
            applying: true,
            validation: { ...current.validation, preflight },
          }
        : current)
      const receipt = await applyManagedClientImport({
        commandId: validated.commandId,
        expectedVersion: validated.activationContext.expectedVersion,
        identity: expectedIdentity,
        preflight,
        priorState: validated.activationContext.priorState,
        stagingPackage: validated.stagingPackage,
        validation: validated.receipt,
      })
      if (contextChanged()) return
      const bootstrap = await loadManagedBootstrap(expectedIdentity)
      if (contextChanged()) return
      const confirmed = bootstrap.states[managedActivation.surface]
      const confirmedImportState = expectedProduct === 'commerce' || expectedProduct === 'production'
        ? managedImportBase(expectedProduct, confirmed?.state ?? {})
        : confirmed?.state
      if (!confirmed
        || confirmed.version < receipt.result.version
        || confirmed.updated_by !== expectedIdentity.userId
        || !sameManagedClientImportState(confirmedImportState, receipt.result.state)) {
        throw new Error(`${managedActivation.productLabel} accepted the import, but its durable revision could not be confirmed. Retry uses the same command and cannot duplicate it.`)
      }
      await assertManagedClientImportState(
        confirmedImportState,
        validated.stagingPackage,
        validated.receipt.package_digest,
        {
          expectedIdentity,
          priorState: validated.activationContext.priorState,
        },
      )
      let shopPack: AppliedImport['shopPack']
      let plantPack: AppliedImport['plantPack']
      if (expectedProduct === 'commerce') {
        const packId = expectedShopIndustryPackId ?? 'retail'
        const currentSchedule = await loadManagedServiceSchedule(expectedIdentity)
        if (contextChanged()) return
        if (currentSchedule.schedule && currentSchedule.schedule.industryPackId !== packId) {
          throw new Error(`This Company Shop already uses the ${currentSchedule.schedule.industryPackId} pack. Existing appointment evidence was preserved.`)
        }
        const provisioned = currentSchedule.schedule
          ? currentSchedule
          : await saveManagedServiceSchedule({
              commandId: importCommandId(),
              expectedVersion: currentSchedule.version,
              identity: expectedIdentity,
              schedule: createShopServiceSchedule(packId),
            })
        if (contextChanged()) return
        if (!provisioned.schedule || provisioned.schedule.industryPackId !== packId) {
          throw new Error('The Shop catalog was imported, but the selected business pack could not be confirmed.')
        }
        shopPack = { id: packId, version: provisioned.version }
      }
      if (expectedProduct === 'production') {
        if (!expectedPlantIndustryPackId) throw new Error('Choose a Plant industry pack before activation.')
        plantPack = { id: expectedPlantIndustryPackId }
      }
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        && current.validation?.commandId === validated.commandId
        ? {
            ...current,
            preflighting: false,
            applying: false,
            applyConfirmed: false,
            applied: { contextKey: expectedContextKey, receipt, shopPack, plantPack },
            error: '',
          }
        : current)
    } catch (error) {
      if (contextChanged()) return
      const activationNeedsRefresh = error instanceof ManagedTrialError
        && (error.code === 'trial_version_conflict' || error.code === 'trial_invalid_transition')
      setState((current) => ({
        ...current,
        preflighting: false,
        applying: false,
        applyConfirmed: activationNeedsRefresh ? false : current.applyConfirmed,
        applied: null,
        validation: activationNeedsRefresh ? null : current.validation,
        error: activationNeedsRefresh
          ? 'The company account changed after validation, or this import is already current. Review the preview and validate again.'
          : error instanceof Error ? error.message : managedActivation.failure,
      }))
    }
  }

  return (
    <>
    <details className="compact-disclosure catalog-import-disclosure" open={initiallyOpen || undefined}>
      <summary><span>Bring existing data</span><small>Optional for {productName}</small></summary>
      <div className="catalog-import-workspace">
        <div className="catalog-import-intro">
          <div>
            <span className="core-eyebrow">Smart import</span>
            <h3>Import existing {object.label.toLowerCase()}</h3>
            <p>Choose a CSV or try the sample. SuperMega matches columns, shows only the fixes, and asks once before writing.</p>
          </div>
          <div className="catalog-import-file-actions">
            <label htmlFor={`client-import-${product}`}>Choose your CSV<input accept=".csv,text/csv" disabled={state.busy} id={`client-import-${product}`} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void chooseFile(file) }} type="file" /></label>
            <button className="core-button" disabled={state.busy} onClick={previewSample} type="button">Try sample</button>
          </div>
        </div>
        <details className="catalog-import-help">
          <summary><span>Need a template?</span><small>Download the CSV and field guide</small></summary>
          <div className="catalog-import-help-body">
            <div className="catalog-import-template-actions"><button className="core-button" disabled={state.busy} onClick={downloadTemplate} type="button">Download CSV template</button><button className="core-button" disabled={state.busy} onClick={downloadChecklist} type="button">Download field guide</button></div>
            <div aria-label={`${productName} data checklist`} className="catalog-import-checklist">
              <div><strong>{object.label}</strong><small>Up to {object.maximumRows} rows per reviewed import. {object.activationBoundary}</small></div>
              <div className="catalog-import-checklist-grid">
                {checklist.map((row) => <span data-required={row.required ? 'true' : 'false'} key={row.field}><small>{row.required ? 'Required' : 'Optional'} / {row.kind}</small><b>{row.field}</b><em>{row.acceptedHeaders.join(', ')}</em><code>{row.example || '-'}</code></span>)}
              </div>
            </div>
          </div>
        </details>
        <p className="catalog-import-boundary">{localAppliedIsCurrent && state.localApplied
          ? `${state.localApplied.created} ${localRecordLabel} were added and ${state.localApplied.alreadyPresent} were already current. Your source CSV was not retained or sent to AI.`
          : appliedIsCurrent && state.applied
          ? `${state.applied.receipt.activation.row_count} ${managedActivation?.createdLabel ?? 'records'} were imported for this company.${state.applied.shopPack ? ` The ${state.applied.shopPack.id} services and resources are ready in the same company account.` : ''}${state.applied.plantPack ? ` The ${state.applied.plantPack.id} Plant setup pack is bound to the opening plan.` : ''} Your source CSV was not uploaded or sent to AI.`
          : managedIdentity
          ? 'Your CSV stays in this tab. Only prepared rows are checked with your company account; nothing is written until you confirm the import.'
          : `Your CSV stays in this browser. Nothing is sent to AI or added to ${productName} while you review it.`}</p>
        <div aria-label={`${productName} import next step`} className="catalog-import-next-step">
          <div><span className="core-eyebrow">Next</span><strong>{importCoachAction}</strong><small>{importStageMessage}</small></div>
          {state.preview ? <div className="catalog-import-stage-list">
            {importStageRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
          </div> : null}
        </div>
        {state.preview ? <details className="catalog-import-advanced">
          <summary><span>Import details</span><small>Setup checks and review</small></summary>
          <div className="catalog-import-advanced-body">
            <div aria-label={`${productName} setup helper`} className="catalog-import-coach">
              <div><strong>{importCoachAction}</strong><small>{importCoachReason}</small></div>
              <div className="catalog-import-coach-list">
                {importCoachRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
              </div>
            </div>
            <div aria-label={`${productName} setup summary`} className="catalog-import-handoff">
              <div><strong>{activationHandoffAction}</strong><small>{activationHandoffReason}</small></div>
              <div className="catalog-import-handoff-list">
                {activationHandoffRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
              </div>
            </div>
            {provisioningPlan ? <div aria-label={`${productName} company setup plan`} className="catalog-import-handoff">
              <div><strong>{provisioningPlan.next_step}</strong><small className="surface-lead">This panel is the setup plan for your company account: what the import would create, and anything still blocking it. Nothing is created until the owner approves.</small><small>No customer message, payment, website publish, or automation runs from this check.</small></div>
              <div className="catalog-import-handoff-list">
                {provisioningPlanRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
              </div>
            </div> : null}
          </div>
        </details> : null}
        {state.busy ? <p className="form-notice" role="status">Matching columns and checking every row...</p> : null}
        {state.validating ? <p className="form-notice" role="status">Checking the prepared import with your company account...</p> : null}
        {state.preflighting ? <p className="form-notice" role="status">Checking the company, product, file, and latest saved records...</p> : null}
        {state.applying ? <p className="form-notice" role="status">{managedActivation?.progressLabel ?? 'Confirming the import...'}</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.preview ? <div className="catalog-import-preview" ref={previewRef} tabIndex={-1}>
          <div className="catalog-import-source">
            <div><strong>{state.preview.sourceName}</strong><small>{state.preview.totals.rows} rows found, {matchedFieldCount} of {state.preview.fields.length} columns matched</small></div>
            <span className={`status-pill ${appliedIsCurrent || localAppliedIsCurrent || validationIsCurrent || state.preview.readyForStaging ? 'approved' : 'pending'}`}>{appliedIsCurrent || localAppliedIsCurrent ? 'Applied' : validationIsCurrent ? 'Server checked' : state.preview.readyForStaging ? 'Ready to prepare' : 'Review needed'}</span>
          </div>
          {!state.preview.readyForStaging ? <div aria-label={`${productName} import repair queue`} className="catalog-import-repair">
            <div><span className="core-eyebrow">Repair queue</span><strong>{state.preview.readyForStaging ? 'No blocking fixes' : 'Clean this file'}</strong><small>{importRepairMessage}</small></div>
            <div className="catalog-import-repair-list">
              {importRepairRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
            </div>
          </div> : null}
          <details className="catalog-import-mapping-review" open={mappingNeedsReview || undefined}>
            <summary><span>Column matching</span><small>{mappingNeedsReview ? 'Needs your review' : `${matchedFieldCount} of ${state.preview.fields.length} matched`}</small></summary>
            <fieldset className="catalog-import-mapping" disabled={state.busy}>
              <legend>Match spreadsheet columns</legend>
              {state.preview.fields.map((field) => {
                const suggestion = state.preview?.suggestions.find((candidate) => candidate.field === field.id)
                const selected = state.preview?.mapping[field.id] ?? ''
                const basis = suggestion?.header === selected ? suggestion.basis : selected ? 'reviewed' : field.required ? 'required' : 'optional'
                return <label key={field.id}>{field.label}{field.required ? ' *' : ''}<select onChange={(event) => remap(field.id, event.target.value)} value={selected}><option value="">{field.required ? 'Choose column' : 'Do not import'}</option>{state.preview?.headers.map((header) => <option key={header}>{header}</option>)}</select><small>{mappingBasisLabels[basis] ?? basis}</small></label>
              })}
            </fieldset>
          </details>
          {!state.preview.readyForStaging ? <div className="catalog-import-totals">
            <span><strong>{state.preview.totals.rows}</strong><small>Rows</small></span>
            <span data-result="ready"><strong>{state.preview.totals.ready}</strong><small>Ready</small></span>
            <span data-result="issue"><strong>{state.preview.totals.issueRows}</strong><small>Fix first</small></span>
            <span><strong>{state.preview.totals.duplicates}</strong><small>Duplicates</small></span>
          </div> : null}
          {state.preview.fileIssues.length ? <ul className="catalog-import-file-issues">{state.preview.fileIssues.map((issue) => <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>)}</ul> : null}
          <details className="catalog-import-row-review" open={state.preview.totals.issueRows > 0 || undefined}>
            <summary><span>Review rows</span><small>{state.preview.totals.issueRows ? `${state.preview.totals.issueRows} need attention` : 'All rows passed'}</small></summary>
            <div className="catalog-import-table" role="table" aria-label={`${object.label} import preview`}>
              <div className="catalog-import-row catalog-import-head" role="row"><span>Row</span><span>Key</span><span>Status</span><span>What to fix</span></div>
              {visibleRows.map((row) => <div className="catalog-import-row" data-result={row.status} key={row.rowNumber} role="row"><span>{row.rowNumber}</span><strong>{row.key || '-'}</strong><span>{rowStatusLabels[row.status] ?? row.status}</span><small>{row.issues.map((issue) => issue.message).join(' / ') || 'Mapped and checked'}</small></div>)}
            </div>
            {state.preview.rows.length > visibleRows.length ? <p className="panel-copy">Showing {visibleRows.length} of {state.preview.rows.length} checked rows.</p> : null}
          </details>
          {validationIsCurrent && state.validation?.receipt.activation.atomic_adapter_ready && managedActivation && !appliedIsCurrent ? <>
            <label className="website-intake-confirm"><input checked={state.applyConfirmed} disabled={state.preflighting || state.applying} onChange={(event) => setState((current) => ({ ...current, applyConfirmed: event.target.checked, error: '' }))} type="checkbox" /><span>I reviewed all {state.validation.stagingPackage.rows.length} {managedActivation.reviewLabel} and approve this import.</span></label>
            <div className="form-actions"><button className="core-button primary" disabled={!canApplyManagedImport} onClick={() => void activateManagedImport()} type="button">{state.preflighting ? 'Running final check...' : state.applying ? managedActivation.busyLabel : `Import ${state.validation.stagingPackage.rows.length} ${managedActivation.reviewLabel}`}</button></div>
          </> : null}
          {localActivationAvailable && importContextReady && state.preview.readyForStaging && !localAppliedIsCurrent ? <>
            <label className="website-intake-confirm"><input checked={state.applyConfirmed} disabled={state.applying} onChange={(event) => setState((current) => ({ ...current, applyConfirmed: event.target.checked, error: '' }))} type="checkbox" /><span>I reviewed all {state.preview.totals.ready} {localRecordLabel} and approve adding them to this browser's {productName} demo.</span></label>
            <div className="form-actions"><button className="core-button primary" disabled={!canApplyLocalImport} onClick={() => void activateLocalImport()} type="button">{state.applying ? `Adding ${productName.toLowerCase()} records...` : `Add ${state.preview.totals.ready} ${localActionLabel}`}</button></div>
          </> : null}
          <div className="catalog-import-footer">
            <div><strong>{localAppliedIsCurrent && state.localApplied ? `${state.localApplied.created} ${localRecordLabel} added; ${state.localApplied.alreadyPresent} already current.` : appliedIsCurrent && state.applied ? `${state.applied.receipt.activation.row_count} ${managedActivation?.completedLabel ?? 'records'} ${managedActivation?.resultVerb ?? 'created'} in revision ${state.applied.receipt.result.version}.` : validationIsCurrent ? 'Validated for this company.' : state.preview.readyForStaging && !importContextReady ? 'Add company and owner above.' : state.preview.readyForStaging ? localActivationAvailable ? `Ready to add to this ${productName} demo.` : 'Data check passed.' : 'Fix the highlighted rows first.'}</strong><small>{localAppliedIsCurrent
              ? `Open ${productName} to use the imported ${localUseLabel}.`
              : appliedIsCurrent && state.applied
              ? `The ${managedActivation?.productLabel ?? 'product'} import is confirmed.${state.applied.shopPack ? ` ${state.applied.shopPack.id} pack revision ${state.applied.shopPack.version} is ready.` : ''}${state.applied.plantPack ? ` ${state.applied.plantPack.id} Plant setup is ready.` : ''}`
              : validationIsCurrent
              ? state.validation?.preflight ? 'Company record check passed. The reviewed import remains bound to this exact receipt.' : 'Checked successfully. Review and confirm above; SuperMega runs one final company record check before writing.'
              : state.preview.readyForStaging && !importContextReady
                ? 'These details connect the prepared rows to one accountable company.'
              : managedIdentity
                ? 'Ready to check with your company account.'
                : 'Ready to prepare an accountable import file.'}</small>
              {appliedIsCurrent && state.applied ? <details className="catalog-import-technical"><summary>Technical receipt</summary><p>{state.applied.receipt.activation.package_digest.slice(7, 19).toUpperCase()} / revision {state.applied.receipt.result.version} / idempotent command confirmed</p></details> : validationIsCurrent && state.validation ? <details className="catalog-import-technical"><summary>Technical receipt</summary><p>{state.validation.receipt.package_digest.slice(7, 19).toUpperCase()} / {state.validation.preflight ? 'company check retained' : 'zero records written'} / {object.activationBoundary}</p></details> : null}
            </div>
            <div className="form-actions"><button className="core-button" disabled={state.preflighting || state.applying} onClick={clearPreview} type="button">Clear</button>{localAppliedIsCurrent ? <Link className="core-button primary" to={localOpenPath}>Open {productName}</Link> : !localActivationAvailable && !appliedIsCurrent && !(validationIsCurrent && state.validation?.receipt.activation.atomic_adapter_ready && managedActivation) ? <button className="core-button" disabled={!canPrepareImport} onClick={() => void validateOrDownloadStagingPackage()} type="button">{state.validating ? 'Checking...' : !importContextReady ? 'Add company and owner' : validationIsCurrent ? 'Download checked file' : managedIdentity ? 'Check with company' : 'Download prepared file'}</button> : null}</div>
          </div>
        </div> : null}
      </div>
    </details>
    {product === 'production' ? <PlantEquipmentOnboarding managedIdentity={managedIdentity} owner={owner} workspace={workspace} /> : null}
    </>
  )
}
