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
  applyManagedClientImport,
  assertManagedClientImportState,
  loadManagedBootstrap,
  sameManagedIdentity,
  validateManagedClientImport,
  type ManagedClientImportActivationResult,
  type ManagedClientImportPackage,
  type ManagedClientImportValidation,
  type ManagedIdentity,
} from './managed-trial'

type ClientDataOnboardingProps = {
  product: ClientSolutionId
  workflowTemplateId: string
  workspace: string
  owner: string
  managedIdentity: ManagedIdentity | null
}

type ValidatedImport = {
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

const productSlugs: Record<ClientSolutionId, string> = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
}

const productNames: Record<ClientSolutionId, string> = {
  commerce: 'Shop',
  production: 'Plant',
  website: 'Website',
  ecommerce: 'Ecommerce',
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

export function ClientDataOnboarding({ product, workflowTemplateId, workspace, owner, managedIdentity }: ClientDataOnboardingProps) {
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
      ].slice(0, 20)
    : []
  const importContextReady = Boolean(workspace.trim() && owner.trim())
  const managedActivation = product === 'commerce'
    ? {
        surface: 'commerce' as const,
        reviewLabel: 'Shop items',
        createdLabel: 'Shop catalog items',
        completedLabel: 'Shop items',
        productLabel: 'Shop',
        progressLabel: 'Creating one revisioned Shop catalog and confirming the durable result…',
        busyLabel: 'Creating catalog…',
        actionLabel: 'Create Shop catalog',
        failure: 'The managed Shop catalog was not created. The checked import is still available.',
      }
    : product === 'production'
      ? {
          surface: 'production' as const,
          reviewLabel: 'Plant jobs',
          createdLabel: 'Plant opening jobs',
          completedLabel: 'Plant jobs',
          productLabel: 'Plant',
          progressLabel: 'Creating one Plant opening plan and confirming the durable resultâ€¦',
          busyLabel: 'Creating planâ€¦',
          actionLabel: 'Create Plant opening plan',
          failure: 'The managed Plant opening plan was not created. The checked import is still available.',
        }
      : product === 'website'
      ? {
          surface: 'website' as const,
          reviewLabel: 'Website pages',
          createdLabel: 'Website page drafts',
          completedLabel: 'Website drafts',
          productLabel: 'Website',
          progressLabel: 'Creating one revisioned Website draft workspace and confirming the durable result…',
          busyLabel: 'Creating drafts…',
          actionLabel: 'Create Website drafts',
          failure: 'The managed Website drafts were not created. The checked import is still available.',
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
      `supermega-${productSlugs[product]}-${workflowTemplateId}-${object.id}-sample-v1.csv`,
      `\uFEFF${clientImportTemplate(product, workflowTemplateId)}`,
      'text/csv;charset=utf-8',
    )
  }

  function previewSample() {
    const expectedProduct = product
    const expectedWorkflowTemplateId = workflowTemplateId
    void runPreview(
      `supermega-${productSlugs[expectedProduct]}-${expectedWorkflowTemplateId}-${object.id}-sample-v1.csv`,
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
      `supermega-${productSlugs[product]}-${workflowTemplateId}-client-import-staging-v1.json`,
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
      const commandId = receipt.activation.atomic_adapter_ready ? importCommandId() : ''
      setState((current) => current.preview?.previewDigest === expectedPreviewDigest
        ? {
            ...current,
            validating: false,
            applying: false,
            applyConfirmed: false,
            applied: null,
            validation: {
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
        expectedVersion: 0,
        identity: expectedIdentity,
        stagingPackage: validated.stagingPackage,
        validation: validated.receipt,
      })
      if (contextChanged()) return
      const bootstrap = await loadManagedBootstrap(expectedIdentity)
      if (contextChanged()) return
      const confirmed = bootstrap.states[managedActivation.surface]
      if (!confirmed
        || confirmed.version !== receipt.result.version
        || confirmed.updated_by !== expectedIdentity.userId) {
        throw new Error(`${managedActivation.productLabel} accepted the import, but its durable revision could not be confirmed. Retry uses the same command and cannot duplicate it.`)
      }
      assertManagedClientImportState(
        confirmed.state,
        validated.stagingPackage,
        validated.receipt.package_digest,
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
      setState((current) => ({
        ...current,
        applying: false,
        applied: null,
        error: error instanceof Error ? error.message : managedActivation.failure,
      }))
    }
  }

  return (
    <details className="compact-disclosure catalog-import-disclosure">
      <summary><span>Import data (optional)</span><small>{object.label} · {workflowTemplateId.replaceAll('-', ' ')}</small></summary>
      <div className="catalog-import-workspace">
        <div className="catalog-import-intro">
          <div>
            <span className="core-eyebrow">Existing data</span>
            <h3>Try a sample or upload CSV</h3>
            <p>{object.description} Clear columns match automatically; ambiguous columns wait for your choice instead of being guessed.</p>
          </div>
          <div className="catalog-import-file-actions">
            <div className="catalog-import-template-actions"><button className="core-button primary" disabled={state.busy} onClick={previewSample} type="button">Preview sample data</button><button className="core-button" disabled={state.busy} onClick={downloadTemplate} type="button">Download sample CSV</button></div>
            <label htmlFor={`client-import-${product}`}>Upload your CSV<input accept=".csv,text/csv" disabled={state.busy} id={`client-import-${product}`} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void chooseFile(file) }} type="file" /></label>
          </div>
        </div>
        <p className="catalog-import-boundary">{appliedIsCurrent && state.applied
          ? `The exact checked package created ${state.applied.receipt.activation.row_count} ${managedActivation?.createdLabel ?? 'product records'} in ${managedIdentity?.workspaceId}. The source CSV was not uploaded or sent to AI. `
          : managedIdentity
          ? `The source CSV stays in this tab. Only the checked import package is sent to ${managedIdentity.workspaceId} for validation; nothing is sent to AI or added to a product before your final confirmation. `
          : `The CSV stays in this browser. Nothing is sent to AI or added to ${productNames[product]} while you preview it. `}{appliedIsCurrent ? '' : object.activationBoundary}</p>
        {state.busy ? <p className="form-notice" role="status">Checking columns, required values, duplicates, dates, URLs, and Unicode…</p> : null}
        {state.validating ? <p className="form-notice" role="status">Validating the exact package with the authenticated workspace…</p> : null}
        {state.applying ? <p className="form-notice" role="status">{managedActivation?.progressLabel ?? 'Confirming the durable import result…'}</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.preview ? <div className="catalog-import-preview" ref={previewRef} tabIndex={-1}>
          <div className="catalog-import-source">
            <div><strong>{state.preview.sourceName}</strong><small>Preview {state.preview.previewDigest.slice(7, 19).toUpperCase()} · source fingerprint retained</small></div>
            <span className={`status-pill ${appliedIsCurrent || validationIsCurrent || state.preview.readyForStaging ? 'approved' : 'pending'}`}>{appliedIsCurrent ? 'Applied' : validationIsCurrent ? 'Server checked' : state.preview.readyForStaging ? 'Ready to prepare' : 'Review needed'}</span>
          </div>
          <fieldset className="catalog-import-mapping" disabled={state.busy}>
            <legend>Match spreadsheet columns</legend>
            {state.preview.fields.map((field) => {
              const suggestion = state.preview?.suggestions.find((candidate) => candidate.field === field.id)
              const selected = state.preview?.mapping[field.id] ?? ''
              const basis = suggestion?.header === selected ? suggestion.basis : selected ? 'reviewed' : field.required ? 'required' : 'optional'
              return <label key={field.id}>{field.label}{field.required ? ' *' : ''}<select onChange={(event) => remap(field.id, event.target.value)} value={selected}><option value="">{field.required ? 'Choose column' : 'Do not import'}</option>{state.preview?.headers.map((header) => <option key={header}>{header}</option>)}</select><small>{mappingBasisLabels[basis] ?? basis}</small></label>
            })}
          </fieldset>
          <div className="catalog-import-totals">
            <span><strong>{state.preview.totals.rows}</strong><small>Rows</small></span>
            <span data-result="ready"><strong>{state.preview.totals.ready}</strong><small>Ready</small></span>
            <span data-result="issue"><strong>{state.preview.totals.issueRows}</strong><small>Fix first</small></span>
            <span><strong>{state.preview.totals.duplicates}</strong><small>Duplicates</small></span>
          </div>
          {state.preview.fileIssues.length ? <ul className="catalog-import-file-issues">{state.preview.fileIssues.map((issue) => <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>)}</ul> : null}
          <div className="catalog-import-table" role="table" aria-label={`${object.label} import preview`}>
            <div className="catalog-import-row catalog-import-head" role="row"><span>Row</span><span>Key</span><span>Status</span><span>What to fix</span></div>
            {visibleRows.map((row) => <div className="catalog-import-row" data-result={row.status} key={row.rowNumber} role="row"><span>{row.rowNumber}</span><strong>{row.key || '—'}</strong><span>{rowStatusLabels[row.status] ?? row.status}</span><small>{row.issues.map((issue) => issue.message).join(' · ') || 'Mapped and checked'}</small></div>)}
          </div>
          {state.preview.rows.length > visibleRows.length ? <p className="panel-copy">Showing the first {visibleRows.length} rows; the staging package retains all {state.preview.rows.length} checked rows.</p> : null}
          {validationIsCurrent && state.validation?.receipt.activation.atomic_adapter_ready && managedActivation && !appliedIsCurrent ? <>
            <label className="website-intake-confirm"><input checked={state.applyConfirmed} disabled={state.applying} onChange={(event) => setState((current) => ({ ...current, applyConfirmed: event.target.checked, error: '' }))} type="checkbox" /><span>I reviewed all {state.validation.stagingPackage.rows.length} {managedActivation.reviewLabel} and validation receipt {state.validation.receipt.package_digest.slice(7, 19).toUpperCase()}.</span></label>
            <div className="form-actions"><button className="core-button primary" disabled={!canApplyManagedImport} onClick={() => void activateManagedImport()} type="button">{state.applying ? managedActivation.busyLabel : managedActivation.actionLabel}</button></div>
          </> : null}
          <div className="catalog-import-footer">
            <div><strong>{appliedIsCurrent && state.applied ? `${state.applied.receipt.activation.row_count} ${managedActivation?.completedLabel ?? 'records'} created in revision ${state.applied.receipt.result.version}.` : validationIsCurrent ? `Validated by ${managedIdentity?.workspaceId}.` : state.preview.readyForStaging && !importContextReady ? 'Add workspace and owner above.' : state.preview.readyForStaging ? 'Data check passed.' : 'Fix the highlighted rows first.'}</strong><small>{appliedIsCurrent && state.applied
              ? `Receipt ${state.applied.receipt.activation.package_digest.slice(7, 19).toUpperCase()} · durable ${managedActivation?.productLabel ?? 'product'} state confirmed with one idempotent command.`
              : validationIsCurrent && state.validation
              ? `Receipt ${state.validation.receipt.package_digest.slice(7, 19).toUpperCase()} · zero product records were written; ${managedActivation?.productLabel ?? 'product'} creation waits for the separate review above.`
              : state.preview.readyForStaging && !importContextReady
                ? 'These details bind the checked rows to one accountable client workspace before download.'
              : managedIdentity
                ? 'The exact template, mapping, checked rows, owner, and workspace label must pass the tenant API before download.'
                : 'The checked import records its template, mapping, source fingerprint, owner, and rows. It performs zero product writes.'}</small></div>
            <div className="form-actions"><button className="core-button" disabled={state.applying} onClick={clearPreview} type="button">Clear</button>{!appliedIsCurrent && !(validationIsCurrent && state.validation?.receipt.activation.atomic_adapter_ready && managedActivation) ? <button className="core-button primary" disabled={!canPrepareImport} onClick={() => void validateOrDownloadStagingPackage()} type="button">{state.validating ? 'Validating…' : !importContextReady ? 'Add workspace and owner' : validationIsCurrent ? 'Download validated import' : managedIdentity ? 'Validate import' : 'Download checked import'}</button> : null}</div>
          </div>
        </div> : null}
      </div>
    </details>
  )
}
