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

type ClientDataOnboardingProps = {
  product: ClientSolutionId
  workflowTemplateId: string
  workspace: string
  owner: string
}

type ImportState = {
  sourceName: string
  sourceText: string
  preview: ClientImportPreview | null
  busy: boolean
  error: string
}

const productSlugs: Record<ClientSolutionId, string> = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
}

function emptyImportState(): ImportState {
  return { sourceName: '', sourceText: '', preview: null, busy: false, error: '' }
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

export function ClientDataOnboarding({ product, workflowTemplateId, workspace, owner }: ClientDataOnboardingProps) {
  const object = clientImportObject(product)
  const requestRef = useRef(0)
  const productRef = useRef(product)
  const workflowTemplateRef = useRef(workflowTemplateId)
  productRef.current = product
  workflowTemplateRef.current = workflowTemplateId
  const [state, setState] = useState<ImportState>(emptyImportState)
  const visibleRows = state.preview
    ? [
        ...state.preview.rows.filter((row) => row.status !== 'ready'),
        ...state.preview.rows.filter((row) => row.status === 'ready'),
      ].slice(0, 20)
    : []

  useEffect(() => {
    requestRef.current += 1
    setState(emptyImportState())
  }, [product, workflowTemplateId])

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
    setState((current) => ({ ...current, sourceName, sourceText, busy: true, error: '' }))
    try {
      const preview = await createClientImportPreview(sourceText, expectedProduct, mapping, sourceName, expectedWorkflowTemplateId)
      if (requestRef.current !== requestId || productRef.current !== expectedProduct || workflowTemplateRef.current !== expectedWorkflowTemplateId) return
      setState({ sourceName, sourceText, preview, busy: false, error: '' })
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
    setState({ sourceName: file.name, sourceText: '', preview: null, busy: true, error: '' })
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
    setState(emptyImportState())
  }

  function downloadTemplate() {
    downloadFile(
      `supermega-${productSlugs[product]}-${workflowTemplateId}-${object.id}-v1.csv`,
      `\uFEFF${clientImportTemplate(product, workflowTemplateId)}`,
      'text/csv;charset=utf-8',
    )
  }

  function downloadStagingPackage() {
    if (!state.preview) return
    try {
      const stagingPackage = buildClientImportStagingPackage(state.preview, {
        workflowTemplateId,
        workspace,
        owner,
      })
      downloadFile(
        `supermega-${productSlugs[product]}-${workflowTemplateId}-client-import-staging-v1.json`,
        `${JSON.stringify(stagingPackage, null, 2)}\n`,
        'application/json;charset=utf-8',
      )
      setState((current) => ({ ...current, error: '' }))
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'The staging package could not be created.' }))
    }
  }

  return (
    <details className="compact-disclosure catalog-import-disclosure">
      <summary><span>Bring existing data</span><small>{object.label} · {workflowTemplateId.replaceAll('-', ' ')}</small></summary>
      <div className="catalog-import-workspace">
        <div className="catalog-import-intro">
          <div>
            <span className="core-eyebrow">Optional client onboarding</span>
            <h3>Map, check, then stage</h3>
            <p>{object.description} Smart mapping is local and explainable; ambiguous columns stop for review instead of being guessed.</p>
          </div>
          <div className="catalog-import-file-actions">
            <button className="core-button" onClick={downloadTemplate} type="button">Download template</button>
            <label htmlFor={`client-import-${product}`}>Choose CSV<input accept=".csv,text/csv" disabled={state.busy} id={`client-import-${product}`} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void chooseFile(file) }} type="file" /></label>
          </div>
        </div>
        <p className="catalog-import-boundary">The file stays in this browser tab. It is not uploaded, sent to AI, or applied to a product. {object.activationBoundary}</p>
        {state.busy ? <p className="form-notice" role="status">Checking mappings, required values, duplicates, dates, URLs, and Unicode…</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.preview ? <div className="catalog-import-preview">
          <div className="catalog-import-source">
            <div><strong>{state.preview.sourceName}</strong><small>Preview {state.preview.previewDigest.slice(7, 19).toUpperCase()} · source fingerprint retained</small></div>
            <span className={`status-pill ${state.preview.readyForStaging ? 'approved' : 'pending'}`}>{state.preview.readyForStaging ? 'Ready to stage' : 'Review needed'}</span>
          </div>
          <fieldset className="catalog-import-mapping" disabled={state.busy}>
            <legend>Explainable column mapping</legend>
            {state.preview.fields.map((field) => {
              const suggestion = state.preview?.suggestions.find((candidate) => candidate.field === field.id)
              const selected = state.preview?.mapping[field.id] ?? ''
              const basis = suggestion?.header === selected ? suggestion.basis : selected ? 'reviewed' : field.required ? 'required' : 'optional'
              return <label key={field.id}>{field.label}{field.required ? ' *' : ''}<select onChange={(event) => remap(field.id, event.target.value)} value={selected}><option value="">{field.required ? 'Choose column' : 'Do not import'}</option>{state.preview?.headers.map((header) => <option key={header}>{header}</option>)}</select><small>{basis}</small></label>
            })}
          </fieldset>
          <div className="catalog-import-totals">
            <span><strong>{state.preview.totals.rows}</strong><small>Rows checked</small></span>
            <span data-result="ready"><strong>{state.preview.totals.ready}</strong><small>Ready</small></span>
            <span data-result="issue"><strong>{state.preview.totals.issueRows}</strong><small>Need review</small></span>
            <span><strong>{state.preview.totals.duplicates}</strong><small>Duplicates</small></span>
          </div>
          {state.preview.fileIssues.length ? <ul className="catalog-import-file-issues">{state.preview.fileIssues.map((issue) => <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>)}</ul> : null}
          <div className="catalog-import-table" role="table" aria-label={`${object.label} import preview`}>
            <div className="catalog-import-row catalog-import-head" role="row"><span>Row</span><span>Key</span><span>Status</span><span>Review</span></div>
            {visibleRows.map((row) => <div className="catalog-import-row" data-result={row.status} key={row.rowNumber} role="row"><span>{row.rowNumber}</span><strong>{row.key || '—'}</strong><span>{row.status}</span><small>{row.issues.map((issue) => issue.message).join(' · ') || 'Mapped and validated'}</small></div>)}
          </div>
          {state.preview.rows.length > visibleRows.length ? <p className="panel-copy">Showing the first {visibleRows.length} rows; the staging package retains all {state.preview.rows.length} checked rows.</p> : null}
          <div className="catalog-import-footer">
            <div><strong>{state.preview.readyForStaging ? 'Consistency check passed.' : 'Nothing can be staged yet.'}</strong><small>A staging package records the template, mapping, source digest, owner, and rows. It performs zero product writes.</small></div>
            <div className="form-actions"><button className="core-button" onClick={clearPreview} type="button">Clear</button><button className="core-button primary" disabled={!state.preview.readyForStaging || state.busy} onClick={downloadStagingPackage} type="button">Download staged package</button></div>
          </div>
        </div> : null}
      </div>
    </details>
  )
}
