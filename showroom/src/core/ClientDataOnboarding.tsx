import { useEffect, useRef, useState } from 'react'

import {
  CLIENT_IMPORT_MAX_BYTES,
  buildClientImportStagingPackage,
  clientImportObject,
  clientImportTemplate,
  createClientImportPreview,
  type ClientImportMapping,
  type ClientImportPreview,
  type ClientSolutionId,
} from './client-onboarding'
import {
  ManagedTrialError,
  applyManagedClientImport,
  assertManagedClientImportState,
  loadManagedBootstrap,
  managedClientImportActivationContext,
  sameManagedClientImportState,
  sameManagedIdentity,
  validateManagedClientImport,
  type ManagedClientImportActivationContext,
  type ManagedClientImportActivationResult,
  type ManagedClientImportPackage,
  type ManagedClientImportValidation,
  type ManagedIdentity,
} from './managed-trial'

type ClientDataOnboardingProps = {
  product: ClientSolutionId
  productName: string
  productSlug: string
  workflowTemplateId: string
  workspace: string
  owner: string
  managedIdentity: ManagedIdentity | null
}

type ValidatedImport = {
  activationContext: ManagedClientImportActivationContext
  commandId: string
  contextKey: string
  receipt: ManagedClientImportValidation
  stagingPackage: ManagedClientImportPackage
}

type AppliedImport = {
  contextKey: string
  receipt: ManagedClientImportActivationResult
}

type ImportState = {
  sourceName: string
  sourceText: string
  preview: ClientImportPreview | null
  busy: boolean
  validating: boolean
  applying: boolean
  applyConfirmed: boolean
  applied: AppliedImport | null
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

function emptyImportState(): ImportState {
  return {
    sourceName: '',
    sourceText: '',
    preview: null,
    busy: false,
    validating: false,
    applying: false,
    applyConfirmed: false,
    applied: null,
    validation: null,
    error: '',
  }
}

function importCommandId() {
  const commandId = globalThis.crypto?.randomUUID?.()
  if (!commandId) throw new Error('Secure import confirmation is unavailable in this browser.')
  return commandId
}

function validationContextKey(
  product: ClientSolutionId,
  workflowTemplateId: string,
  previewDigest: string,
  workspace: string,
  owner: string,
  managedIdentity: ManagedIdentity | null,
) {
  return JSON.stringify([
    product,
    workflowTemplateId,
    previewDigest,
    workspace,
    owner,
    managedIdentity?.userId ?? '',
    managedIdentity?.workspaceId ?? '',
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

export function ClientDataOnboarding({ product, productName, productSlug, workflowTemplateId, workspace, owner, managedIdentity }: ClientDataOnboardingProps) {
  const object = clientImportObject(product)
  const requestRef = useRef(0)
  const validationRequestRef = useRef(0)
  const productRef = useRef(product)
  const workflowTemplateRef = useRef(workflowTemplateId)
  const workspaceRef = useRef(workspace)
  const ownerRef = useRef(owner)
  const managedIdentityRef = useRef(managedIdentity)
  const previewRef = useRef<HTMLDivElement>(null)
  productRef.current = product
  workflowTemplateRef.current = workflowTemplateId
  workspaceRef.current = workspace
  ownerRef.current = owner
  managedIdentityRef.current = managedIdentity
  const [state, setState] = useState<ImportState>(emptyImportState)
  const currentValidationContext = validationContextKey(
    product,
    workflowTemplateId,
    state.preview?.previewDigest ?? '',
    workspace,
    owner,
    managedIdentity,
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
        failure: 'The managed Shop catalog was not created. The checked import is still available.',
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
          failure: 'The managed Plant opening plan was not created. The checked import is still available.',
        }
      : product === 'website'
      ? {
          surface: 'website' as const,
          reviewLabel: 'Website pages',
          createdLabel: 'Website page drafts',
          completedLabel: 'Website drafts',
          productLabel: 'Website',
          resultVerb: 'created',
          progressLabel: 'Creating one revisioned Website draft workspace and confirming the durable result…',
          busyLabel: 'Creating drafts…',
          failure: 'The managed Website drafts were not created. The checked import is still available.',
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
  const canPrepareImport = Boolean(state.preview?.readyForStaging && importContextReady && !state.busy && !state.validating && !state.applying)
  const canApplyManagedImport = Boolean(
    managedActivation
    && managedIdentity
    && validationIsCurrent
    && state.validation?.receipt.activation.atomic_adapter_ready
    && state.applyConfirmed
    && !state.applying
    && !appliedIsCurrent,
  )
  const importStageRows = [
    ['Read file', state.preview ? `${state.preview.totals.rows} rows` : state.busy ? 'Reading' : 'Waiting'],
    ['Match columns', state.preview ? mappingNeedsReview ? 'Review' : `${matchedFieldCount}/${state.preview.fields.length}` : 'Auto'],
    ['Check workspace', appliedIsCurrent ? 'Applied' : validationIsCurrent ? 'Checked' : state.validating ? 'Checking' : managedIdentity ? 'Ready' : 'Local file'],
    ['Confirm import', appliedIsCurrent ? 'Done' : state.applying ? 'Writing' : canApplyManagedImport ? 'Ready' : state.preview?.readyForStaging ? 'Prepare' : 'Locked'],
  ] as const
  const importStageMessage = appliedIsCurrent
    ? `${productName} import is confirmed in ${managedIdentity?.workspaceId}.`
    : state.preview
      ? mappingNeedsReview
        ? 'Choose the missing required columns. Rows stay read-only until the mapping is clean.'
        : state.preview.readyForStaging
          ? managedIdentity
            ? 'The file is clean. Check it with the workspace, then confirm the final import.'
            : 'The file is clean. Download the prepared import file or connect a managed workspace.'
          : 'Fix the highlighted rows before this can become a managed import.'
      : `Drop in a CSV or try the sample. SuperMega reads, maps, and checks ${object.label.toLowerCase()} before any write.`

  useEffect(() => {
    requestRef.current += 1
    validationRequestRef.current += 1
    setState(emptyImportState())
  }, [product, workflowTemplateId])

  useEffect(() => {
    validationRequestRef.current += 1
    setState((current) => ({ ...current, validating: false, applying: false, applyConfirmed: false, applied: null, validation: null, error: '' }))
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
    setState((current) => ({ ...current, sourceName, sourceText, busy: true, validating: false, validation: null, error: '' }))
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
      `\uFEFF${clientImportTemplate(product, workflowTemplateId)}`,
      'text/csv;charset=utf-8',
    )
  }

  function previewSample() {
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    void runPreview(
      `supermega-${productSlug}-${expectedWorkflowTemplateId}-${object.id}-sample-v1.csv`,
      clientImportTemplate(expectedProduct, expectedWorkflowTemplateId),
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
    const expectedPreviewDigest = state.preview.previewDigest
    const expectedContextKey = currentValidationContext
    const validationContextChanged = () => (
      productRef.current !== expectedProduct
      || workflowTemplateRef.current !== expectedWorkflowTemplateId
      || workspaceRef.current !== expectedWorkspace
      || ownerRef.current !== expectedOwner
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
      setState((current) => ({ ...current, validating: true, validation: null, error: '' }))
      const receipt = await validateManagedClientImport(stagingPackage, expectedIdentity)
      if (validationRequestRef.current !== validationRequestId || validationContextChanged()) return
      const activationBootstrap = stagingPackage.product === 'ecommerce'
        ? await loadManagedBootstrap(expectedIdentity)
        : undefined
      if (validationRequestRef.current !== validationRequestId || validationContextChanged()) return
      const activationContext = managedClientImportActivationContext(stagingPackage, activationBootstrap)
      const commandId = receipt.activation.atomic_adapter_ready ? importCommandId() : ''
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        ? {
            ...current,
            validating: false,
            applying: false,
            applyConfirmed: false,
            applied: null,
            validation: {
              activationContext,
              commandId,
              contextKey: expectedContextKey,
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
        validation: null,
        error: error instanceof Error ? error.message : 'The staging package could not be validated.',
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
      || state.applying
      || appliedIsCurrent) return
    const expectedContextKey = currentValidationContext
    const expectedPreviewDigest = state.preview?.previewDigest ?? ''
    const activationRequestId = validationRequestRef.current + 1
    validationRequestRef.current = activationRequestId
    const contextChanged = () => (
      validationRequestRef.current !== activationRequestId
      || !managedIdentityRef.current
      || !sameManagedIdentity(managedIdentityRef.current, expectedIdentity)
    )
    setState((current) => ({ ...current, applying: true, applied: null, error: '' }))
    try {
      const receipt = await applyManagedClientImport({
        commandId: validated.commandId,
        expectedVersion: validated.activationContext.expectedVersion,
        identity: expectedIdentity,
        priorState: validated.activationContext.priorState,
        stagingPackage: validated.stagingPackage,
        validation: validated.receipt,
      })
      if (contextChanged()) return
      const bootstrap = await loadManagedBootstrap(expectedIdentity)
      if (contextChanged()) return
      const confirmed = bootstrap.states[managedActivation.surface]
      if (!confirmed
        || confirmed.version !== receipt.result.version
        || confirmed.updated_by !== expectedIdentity.userId
        || !sameManagedClientImportState(confirmed.state, receipt.result.state)) {
        throw new Error(`${managedActivation.productLabel} accepted the import, but its durable revision could not be confirmed. Retry uses the same command and cannot duplicate it.`)
      }
      await assertManagedClientImportState(
        confirmed.state,
        validated.stagingPackage,
        validated.receipt.package_digest,
        {
          expectedIdentity,
          priorState: validated.activationContext.priorState,
        },
      )
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        && current.validation?.commandId === validated.commandId
        ? {
            ...current,
            applying: false,
            applyConfirmed: false,
            applied: { contextKey: expectedContextKey, receipt },
            error: '',
          }
        : current)
    } catch (error) {
      if (contextChanged()) return
      const ecommerceNeedsRefresh = validated.stagingPackage.product === 'ecommerce'
        && error instanceof ManagedTrialError
        && (error.code === 'trial_version_conflict' || error.code === 'trial_invalid_transition')
      setState((current) => ({
        ...current,
        applying: false,
        applyConfirmed: ecommerceNeedsRefresh ? false : current.applyConfirmed,
        applied: null,
        validation: ecommerceNeedsRefresh ? null : current.validation,
        error: ecommerceNeedsRefresh
          ? 'Shop or Ecommerce changed after this validation, or these display details are already current. Review the preview and validate again.'
          : error instanceof Error ? error.message : managedActivation.failure,
      }))
    }
  }

  return (
    <details className="compact-disclosure catalog-import-disclosure">
      <summary><span>Bring existing data</span><small>Optional for {productName}</small></summary>
      <div className="catalog-import-workspace">
        <div className="catalog-import-intro">
          <div>
            <span className="core-eyebrow">Smart import</span>
            <h3>Upload a CSV</h3>
            <p>{object.description} SuperMega matches clear columns and asks before using anything uncertain.</p>
          </div>
          <div className="catalog-import-file-actions">
            <label htmlFor={`client-import-${product}`}>Choose your CSV<input accept=".csv,text/csv" disabled={state.busy} id={`client-import-${product}`} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void chooseFile(file) }} type="file" /></label>
            <div className="catalog-import-template-actions"><button className="core-button" disabled={state.busy} onClick={previewSample} type="button">Try sample</button><button className="core-button" disabled={state.busy} onClick={downloadTemplate} type="button">Download template</button></div>
          </div>
        </div>
        <p className="catalog-import-boundary">{appliedIsCurrent && state.applied
          ? `${state.applied.receipt.activation.row_count} ${managedActivation?.createdLabel ?? 'records'} were imported into ${managedIdentity?.workspaceId}. Your source CSV was not uploaded or sent to AI.`
          : managedIdentity
          ? `Your CSV stays in this tab. Only prepared rows are checked with ${managedIdentity.workspaceId}; nothing is written until you confirm the import.`
          : `Your CSV stays in this browser. Nothing is sent to AI or added to ${productName} while you review it.`}</p>
        <div aria-label={`${productName} import autopilot`} className="catalog-import-autopilot">
          <div><strong>Import autopilot</strong><small>{importStageMessage}</small></div>
          <div className="catalog-import-stage-list">
            {importStageRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
          </div>
        </div>
        {state.busy ? <p className="form-notice" role="status">Matching columns and checking every row...</p> : null}
        {state.validating ? <p className="form-notice" role="status">Checking the prepared import with your workspace...</p> : null}
        {state.applying ? <p className="form-notice" role="status">{managedActivation?.progressLabel ?? 'Confirming the import...'}</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.preview ? <div className="catalog-import-preview" ref={previewRef} tabIndex={-1}>
          <div className="catalog-import-source">
            <div><strong>{state.preview.sourceName}</strong><small>{state.preview.totals.rows} rows found, {matchedFieldCount} of {state.preview.fields.length} columns matched</small></div>
            <span className={`status-pill ${appliedIsCurrent || validationIsCurrent || state.preview.readyForStaging ? 'approved' : 'pending'}`}>{appliedIsCurrent ? 'Applied' : validationIsCurrent ? 'Server checked' : state.preview.readyForStaging ? 'Ready to prepare' : 'Review needed'}</span>
          </div>
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
          <div className="catalog-import-totals">
            <span><strong>{state.preview.totals.rows}</strong><small>Rows</small></span>
            <span data-result="ready"><strong>{state.preview.totals.ready}</strong><small>Ready</small></span>
            <span data-result="issue"><strong>{state.preview.totals.issueRows}</strong><small>Fix first</small></span>
            <span><strong>{state.preview.totals.duplicates}</strong><small>Duplicates</small></span>
          </div>
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
            <label className="website-intake-confirm"><input checked={state.applyConfirmed} disabled={state.applying} onChange={(event) => setState((current) => ({ ...current, applyConfirmed: event.target.checked, error: '' }))} type="checkbox" /><span>I reviewed all {state.validation.stagingPackage.rows.length} {managedActivation.reviewLabel} and approve this import.</span></label>
            <div className="form-actions"><button className="core-button primary" disabled={!canApplyManagedImport} onClick={() => void activateManagedImport()} type="button">{state.applying ? managedActivation.busyLabel : `Import ${state.validation.stagingPackage.rows.length} ${managedActivation.reviewLabel}`}</button></div>
          </> : null}
          <div className="catalog-import-footer">
            <div><strong>{appliedIsCurrent && state.applied ? `${state.applied.receipt.activation.row_count} ${managedActivation?.completedLabel ?? 'records'} ${managedActivation?.resultVerb ?? 'created'} in revision ${state.applied.receipt.result.version}.` : validationIsCurrent ? `Validated by ${managedIdentity?.workspaceId}.` : state.preview.readyForStaging && !importContextReady ? 'Add workspace and owner above.' : state.preview.readyForStaging ? 'Data check passed.' : 'Fix the highlighted rows first.'}</strong><small>{appliedIsCurrent && state.applied
              ? `The ${managedActivation?.productLabel ?? 'product'} import is confirmed.`
              : validationIsCurrent
              ? 'Checked successfully. Review and confirm above before records are written.'
              : state.preview.readyForStaging && !importContextReady
                ? 'These details connect the prepared rows to one accountable client workspace.'
              : managedIdentity
                ? 'Ready to check with your workspace.'
                : 'Ready to prepare an accountable import file.'}</small>
              {appliedIsCurrent && state.applied ? <details className="catalog-import-technical"><summary>Technical receipt</summary><p>{state.applied.receipt.activation.package_digest.slice(7, 19).toUpperCase()} / revision {state.applied.receipt.result.version} / idempotent command confirmed</p></details> : validationIsCurrent && state.validation ? <details className="catalog-import-technical"><summary>Technical receipt</summary><p>{state.validation.receipt.package_digest.slice(7, 19).toUpperCase()} / zero records written / {object.activationBoundary}</p></details> : null}
            </div>
            <div className="form-actions"><button className="core-button" disabled={state.applying} onClick={clearPreview} type="button">Clear</button>{!appliedIsCurrent && !(validationIsCurrent && state.validation?.receipt.activation.atomic_adapter_ready && managedActivation) ? <button className="core-button primary" disabled={!canPrepareImport} onClick={() => void validateOrDownloadStagingPackage()} type="button">{state.validating ? 'Checking...' : !importContextReady ? 'Add workspace and owner' : validationIsCurrent ? 'Download checked file' : managedIdentity ? 'Check with workspace' : 'Prepare import file'}</button> : null}</div>
          </div>
        </div> : null}
      </div>
    </details>
  )
}
