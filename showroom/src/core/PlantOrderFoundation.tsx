import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import {
  PLANT_ORDER_ADDITIONAL_MATERIAL_MAX,
  applyPlantOrderPlan,
  buildPlantOrderPlan,
  checkPlantOrderAvailability,
  createEmptyPlantOrderState,
  inspectPlantOrderOutput,
  issuePlantOrderMaterial,
  loadPlantOrderWorkspace,
  mutatePlantOrderWorkspace,
  parsePlantOrderMaterialPaste,
  parsePlantOrderQuantityMilli,
  plantOrderEvidenceDigest,
  projectPlantOrder,
  recordPlantOrderOutput,
  releasePlantOrder,
  releasePlantOrderBatch,
  validatePlantOrderState,
  type PlantOrderProof,
  type PlantOrderMaterial,
  type PlantOrderPlan,
  type PlantOrderState,
  type PlantOrderTransition,
  type PlantOrderTransitionResult,
} from './plant-order-foundation'
import { validateProductionState, type ProductionJob, type ProductionState } from './production-workspace'


type PlantOrderFoundationProps = {
  actor: string
  disabled: boolean
  jobs: ProductionJob[]
  managedState?: PlantOrderState | null
  onManagedCommand?: (
    eventType: 'production.order_execution.recorded',
    commandId: string,
    proof: PlantOrderProof,
    transition: (state: ProductionState) => ProductionState | null,
  ) => Promise<void>
  scope: string
}

type ReviewedTransition = {
  commandId: string
  title: string
  summary: string
  boundary: string
  proof: PlantOrderProof
  apply: PlantOrderTransition
}

type SetupDraft = {
  jobId: string
  outputBatchId: string
  materialId: string
  materialName: string
  materialUnit: PlantOrderMaterial['unit']
  quantityPerUnit: string
  additionalMaterials: string
  workCentreId: string
  workCentreName: string
  minutesPerUnit: string
}

type AvailabilityDraft = {
  materials: Record<string, { inputLotId: string; availableQuantity: string }>
  workCentres: Record<string, string>
}

const setupMaterialUnits: PlantOrderMaterial['unit'][] = ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm']

const browserLocks = () => typeof navigator !== 'undefined'
  ? navigator.locks as unknown as Parameters<typeof mutatePlantOrderWorkspace>[3]
  : null

function commandId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().toUpperCase()
    : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return `${prefix}-${random}`
}

function managedCommandId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''
}

function proof(actor: string, label: string): PlantOrderProof {
  const actionId = commandId('ACT')
  return {
    actionId,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Plant supervisor',
    reason: `Review and record ${label}.`,
    evidenceReference: `PLANT-EXECUTION:${actionId}`,
  }
}

function jobSnapshot(scope: string, job: ProductionJob) {
  return {
    scope,
    job: {
      id: job.id,
      product: job.product,
      target: job.target,
      output: job.output,
      scrap: job.scrap ?? 0,
      qualityHoldActionId: job.qualityHold?.actionId ?? null,
      closureActionId: job.closure?.actionId ?? null,
    },
  }
}

function remaining(job: ProductionJob) {
  return job.target - job.output - (job.scrap ?? 0)
}

function formatMilli(value: number) {
  return (value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function milliInputValue(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('The required quantity exceeds the supported range.')
  const whole = Math.floor(value / 1_000)
  const fraction = String(value % 1_000).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function defaultSetup(job?: ProductionJob): SetupDraft {
  const suffix = job?.id.replace(/^JOB-/, '') ?? '001'
  return {
    jobId: job?.id ?? '',
    outputBatchId: `BATCH-${suffix}`,
    materialId: 'MAT-PRIMARY-001',
    materialName: 'Primary material',
    materialUnit: 'pcs',
    quantityPerUnit: '1',
    additionalMaterials: '',
    workCentreId: 'WC-ASSEMBLY-01',
    workCentreName: 'Assembly',
    minutesPerUnit: '1',
  }
}

function availabilityDefaultsForPlan(plan: PlantOrderPlan): AvailabilityDraft {
  const requiredMinutes = new Map(plan.workCentres.map((centre) => [centre.workCentreId, 0]))
  plan.routing.forEach((operation) => {
    const next = (requiredMinutes.get(operation.workCentreId) ?? 0) + operation.minutesPerUnitMilli * plan.job.targetQuantity
    if (!Number.isSafeInteger(next)) throw new Error(`The required capacity for ${operation.workCentreId} exceeds the supported range.`)
    requiredMinutes.set(operation.workCentreId, next)
  })
  return {
    materials: Object.fromEntries(plan.materials.map((material) => [material.materialId, {
      inputLotId: `LOT-${material.materialId.replace(/^MAT-/, '')}`,
      availableQuantity: milliInputValue(material.quantityPerUnitMilli * plan.job.targetQuantity),
    }])),
    workCentres: Object.fromEntries(plan.workCentres.map((centre) => [
      centre.workCentreId,
      String(Math.ceil((requiredMinutes.get(centre.workCentreId) ?? 0) / 1_000)),
    ])),
  }
}

function availabilityDefaults(state: PlantOrderState) {
  const plan = projectPlantOrder(state).plan
  return plan ? availabilityDefaultsForPlan(plan) : { materials: {}, workCentres: {} }
}

function loadState(scope: string) {
  if (typeof localStorage === 'undefined') return { state: createEmptyPlantOrderState(), error: '' }
  const snapshot = loadPlantOrderWorkspace(localStorage, scope)
  return { state: snapshot.state, error: snapshot.error }
}

function loadManagedState(value: PlantOrderState | null) {
  try {
    return { state: validatePlantOrderState(value ?? createEmptyPlantOrderState()), error: '' }
  } catch (error) {
    return { state: createEmptyPlantOrderState(), error: error instanceof Error ? error.message : 'Managed Plant execution could not be validated.' }
  }
}

const statusCopy = {
  unplanned: 'Set up execution',
  planned: 'Check availability',
  shortfall: 'Resolve shortfall',
  ready: 'Release order',
  released: 'Issue material',
  in_process: 'Continue execution',
  inspection_due: 'Inspect batch',
  quality_hold: 'Quality hold',
  ready_to_release: 'Release batch',
  released_to_stock: 'Batch released',
} as const

export function PlantOrderFoundation({ actor, disabled, jobs, managedState, onManagedCommand, scope }: PlantOrderFoundationProps) {
  const managed = managedState !== undefined
  const activeJobs = jobs.filter((job) => !job.closure && !job.qualityHold && remaining(job) > 0)
  const [initial] = useState(() => managed
    ? loadManagedState(managedState ?? null)
    : loadState(scope))
  const [state, setState] = useState<PlantOrderState>(initial.state)
  const [error, setError] = useState(initial.error)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupDraft, setSetupDraft] = useState(() => defaultSetup(activeJobs[0]))
  const [availabilityDraft, setAvailabilityDraft] = useState(() => availabilityDefaults(initial.state))
  const [inspectionDraft, setInspectionDraft] = useState({ result: 'pass' as 'pass' | 'fail', rejected: '0' })
  const [review, setReview] = useState<ReviewedTransition | null>(null)
  const setupDialogRef = useRef<HTMLDialogElement>(null)
  const setupTriggerRef = useRef<HTMLButtonElement>(null)
  const reviewDialogRef = useRef<HTMLDialogElement>(null)
  const projection = useMemo(() => projectPlantOrder(state), [state])
  const selectedSetupJob = activeJobs.find((job) => job.id === setupDraft.jobId) ?? activeJobs[0]
  const boundJob = projection.plan ? jobs.find((job) => job.id === projection.plan?.job.jobId) : undefined
  const bindingCurrent = Boolean(!projection.plan || (boundJob && plantOrderEvidenceDigest(jobSnapshot(scope, boundJob)) === projection.plan.sourceDigest))
  const controlsDisabled = disabled || busy || Boolean(review) || (!bindingCurrent && projection.status !== 'released_to_stock')
  const nextMaterial = projection.materials.find((material) => material.remainingToIssueMilli > 0)
  const outputRemaining = projection.metrics.targetQuantity - projection.totalOutput
  const inspectedQuantity = projection.totalOutput
  const rejected = /^\d+$/.test(inspectionDraft.rejected) ? Number(inspectionDraft.rejected) : Number.NaN
  const inspectionValid = Number.isSafeInteger(rejected) && rejected >= 0 && rejected <= inspectedQuantity
    && (inspectionDraft.result === 'pass' ? rejected === 0 : rejected > 0)

  useEffect(() => {
    const dialog = setupDialogRef.current
    if (!dialog) return
    if (setupOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!setupOpen && dialog.open) dialog.close()
  }, [setupOpen])

  useEffect(() => {
    const dialog = reviewDialogRef.current
    if (!dialog) return
    if (review && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-plant-review-primary]')?.focus())
    }
    if (!review && dialog.open) dialog.close()
  }, [review])

  function stage(next: Omit<ReviewedTransition, 'commandId'>) {
    setError('')
    setSetupOpen(false)
    setReview({ ...next, commandId: managedCommandId() })
    setNotice('Review this one change. Nothing has been written yet.')
  }

  async function mutateManaged(reviewed: ReviewedTransition) {
    if (!onManagedCommand || !reviewed.commandId) throw new Error('Managed Plant command identity is unavailable.')
    let applied: PlantOrderTransitionResult | null = null
    await onManagedCommand(
      'production.order_execution.recorded',
      reviewed.commandId,
      reviewed.proof,
      (current) => {
        const currentExecution = validatePlantOrderState(current.orderExecution ?? createEmptyPlantOrderState())
        const result = reviewed.apply(currentExecution)
        applied = result
        if (result.replayed) return current
        return validateProductionState({ ...current, orderExecution: result.state })
      },
    )
    if (!applied) throw new Error('The managed Plant execution transition did not run.')
    return applied
  }

  async function confirmReview() {
    if (!review) return
    setBusy(true); setError('')
    try {
      const result = managed
        ? await mutateManaged(review)
        : typeof localStorage !== 'undefined'
          ? await mutatePlantOrderWorkspace(scope, review.apply, localStorage, browserLocks())
          : null
      if (!result) throw new Error(managed ? 'Managed Plant command identity is unavailable.' : 'Browser storage is unavailable.')
      if ('error' in result) { setError(result.error); return }
      const accepted: PlantOrderTransitionResult = 'ok' in result
        ? { state: result.state, replayed: result.replayed }
        : result
      setState(accepted.state); setReview(null); setSetupOpen(false)
      setNotice(accepted.replayed ? 'The exact command was already recorded.' : `${review.title} recorded with attributed evidence.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Plant execution was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  function closeSetup() {
    setSetupOpen(false)
    requestAnimationFrame(() => setupTriggerRef.current?.focus())
  }

  function editReview() {
    const editsSetup = projection.status === 'unplanned'
    if (reviewDialogRef.current?.open) reviewDialogRef.current.close()
    setReview(null)
    if (editsSetup) setSetupOpen(true)
  }

  function reviewSetup(event: FormEvent) {
    event.preventDefault()
    if (!selectedSetupJob) return setError('Add or choose one active Plant job first.')
    try {
      const quantityPerUnitMilli = parsePlantOrderQuantityMilli(setupDraft.quantityPerUnit); const minutesPerUnitMilli = parsePlantOrderQuantityMilli(setupDraft.minutesPerUnit)
      if (!quantityPerUnitMilli || !minutesPerUnitMilli) throw new Error('Material and work-centre rates must be positive numbers with up to three decimals.')
      const primaryMaterial: PlantOrderMaterial = {
        materialId: setupDraft.materialId.trim().toUpperCase(),
        name: setupDraft.materialName.trim(),
        unit: setupDraft.materialUnit,
        quantityPerUnitMilli,
      }
      const materials = [primaryMaterial, ...parsePlantOrderMaterialPaste(setupDraft.additionalMaterials)]
        .sort((left, right) => left.materialId < right.materialId ? -1 : left.materialId > right.materialId ? 1 : 0)
      if (new Set(materials.map((material) => material.materialId)).size !== materials.length) throw new Error('Each BOM material ID must be unique, including the primary material.')
      const targetQuantity = remaining(selectedSetupJob); const expectedHeadDigest = state.headDigest
      const sourceDigest = plantOrderEvidenceDigest(jobSnapshot(scope, selectedSetupJob))
      const plan = buildPlantOrderPlan({
        planId: commandId('PLN'), sourceDigest,
        job: { jobId: selectedSetupJob.id, product: selectedSetupJob.product, targetQuantity, outputBatchId: setupDraft.outputBatchId.trim().toUpperCase() },
        materials,
        workCentres: [{ workCentreId: setupDraft.workCentreId.trim().toUpperCase(), name: setupDraft.workCentreName.trim() }],
        routing: [{ operationId: `OP-${setupDraft.workCentreId.trim().toUpperCase().replace(/^WC-/, '')}-10`, sequence: 1, name: setupDraft.workCentreName.trim(), workCentreId: setupDraft.workCentreId.trim().toUpperCase(), minutesPerUnitMilli }],
      })
      setAvailabilityDraft(availabilityDefaultsForPlan(plan))
      const actionProof = proof(actor, 'the reviewed BOM and routing')
      stage({
        title: 'Execution plan',
        summary: `${selectedSetupJob.id} · ${targetQuantity.toLocaleString()} remaining · ${materials.length} ${materials.length === 1 ? 'material' : 'materials'} · 1 operation`,
        boundary: 'Creates an immutable execution package. It does not schedule staff, move stock, post accounting, or control equipment.',
        proof: actionProof,
        apply: (current) => applyPlantOrderPlan(current, plan, actionProof, expectedHeadDigest),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Execution plan could not be prepared.')
    }
  }

  function reviewAvailability(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan) return
    try {
      const materials = projection.materials.map((material) => {
        const draft = availabilityDraft.materials[material.materialId]
        const inputLotId = draft?.inputLotId.trim().toUpperCase() ?? ''
        const availableQuantityMilli = draft ? parsePlantOrderQuantityMilli(draft.availableQuantity, true) : null
        if (!/^LOT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(inputLotId) || availableQuantityMilli === null) {
          throw new Error(`Enter a canonical lot ID and observed quantity for ${material.materialId}. Quantity may be zero.`)
        }
        return { materialId: material.materialId, inputLotId, availableQuantityMilli }
      })
      const workCentres = projection.plan.workCentres.map((centre) => {
        const rawAvailableMinutes = availabilityDraft.workCentres[centre.workCentreId] ?? ''
        const availableMinutes = /^\d+$/.test(rawAvailableMinutes) ? Number(rawAvailableMinutes) : Number.NaN
        if (!Number.isSafeInteger(availableMinutes) || availableMinutes < 0) throw new Error(`Enter whole available minutes for ${centre.workCentreId}.`)
        return { workCentreId: centre.workCentreId, availableMinutes }
      })
      const checkId = commandId('CHK'); const expectedHeadDigest = state.headDigest
      const sourceDigest = plantOrderEvidenceDigest({ materials, workCentres }); const actionProof = proof(actor, 'material and work-centre availability')
      stage({
        title: 'Availability check',
        summary: `${materials.length} material ${materials.length === 1 ? 'lot' : 'lots'} · ${workCentres.length} work ${workCentres.length === 1 ? 'centre' : 'centres'}`,
        boundary: 'Records a reviewed snapshot only. A shortfall blocks order release; no purchase, reservation, or dispatch occurs.',
        proof: actionProof,
        apply: (current) => checkPlantOrderAvailability(current, { checkId, sourceDigest, materials, workCentres, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Availability could not be prepared for review.')
    }
  }

  function updateMaterialAvailability(materialId: string, patch: Partial<AvailabilityDraft['materials'][string]>) {
    setAvailabilityDraft((current) => {
      const existing = current.materials[materialId] ?? { inputLotId: '', availableQuantity: '' }
      return { ...current, materials: { ...current.materials, [materialId]: { ...existing, ...patch } } }
    })
  }

  function updateWorkCentreAvailability(workCentreId: string, availableMinutes: string) {
    setAvailabilityDraft((current) => ({ ...current, workCentres: { ...current.workCentres, [workCentreId]: availableMinutes } }))
  }

  function reviewOrderRelease() {
    if (!projection.latestAvailability) return
    const releaseId = commandId('REL'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'human production-order release')
    stage({ title: 'Order release', summary: `${projection.plan?.job.jobId} · materials and capacity passed`, boundary: 'Authorizes the recorded work package only. It sends no machine command and makes no inventory or accounting entry.', proof: actionProof, apply: (current) => releasePlantOrder(current, { releaseId, availabilityCheckId: projection.latestAvailability!.checkId, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewMaterialIssue() {
    if (!nextMaterial?.inputLotId) return
    const issueId = commandId('ISSUE'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, `issue of ${nextMaterial.materialId}`)
    stage({ title: 'Material issue', summary: `${formatMilli(nextMaterial.remainingToIssueMilli)} ${nextMaterial.unit} · ${nextMaterial.inputLotId}`, boundary: 'Creates job genealogy evidence only. It does not change purchasing, warehouse, costing, or accounting balances.', proof: actionProof, apply: (current) => issuePlantOrderMaterial(current, { issueId, materialId: nextMaterial.materialId, inputLotId: nextMaterial.inputLotId!, quantityMilli: nextMaterial.remainingToIssueMilli, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewOutput() {
    if (!projection.plan || outputRemaining < 1) return
    const outputId = commandId('OUT'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'produced output quantity')
    stage({ title: 'Batch output', summary: `${outputRemaining.toLocaleString()} units · ${projection.plan.job.outputBatchId}`, boundary: 'Records this execution package output. The existing Plant output ledger and Shop receipt remain separate reviewed steps.', proof: actionProof, apply: (current) => recordPlantOrderOutput(current, { outputId, outputBatchId: projection.plan!.job.outputBatchId, quantity: outputRemaining, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewInspection(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan || !inspectionValid || inspectedQuantity < 1) return
    const inspectionId = commandId('INSP'); const expectedHeadDigest = state.headDigest; const acceptedQuantity = inspectedQuantity - rejected
    const actionProof = proof(actor, inspectionDraft.result === 'pass' ? 'passing batch inspection' : 'failed batch inspection and quality hold')
    stage({ title: inspectionDraft.result === 'pass' ? 'Passing inspection' : 'Quality hold', summary: `${inspectedQuantity.toLocaleString()} inspected · ${acceptedQuantity.toLocaleString()} accepted · ${rejected.toLocaleString()} rejected`, boundary: inspectionDraft.result === 'pass' ? 'Acceptance remains separate from final human batch release.' : 'A failed inspection blocks more issue and output until a later passing reinspection.', proof: actionProof, apply: (current) => inspectPlantOrderOutput(current, { inspectionId, outputBatchId: projection.plan!.job.outputBatchId, inspectedQuantity, acceptedQuantity, rejectedQuantity: rejected, result: inspectionDraft.result, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewBatchRelease() {
    if (!projection.plan || !projection.latestInspection) return
    const qualityReleaseId = commandId('QREL'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'human batch release')
    stage({ title: 'Batch release', summary: `${projection.plan.job.outputBatchId} · ${projection.totalOutput.toLocaleString()} accepted units`, boundary: 'Records human quality release only. Shop receipt, delivery, costing, and accounting are not posted automatically.', proof: actionProof, apply: (current) => releasePlantOrderBatch(current, { qualityReleaseId, outputBatchId: projection.plan!.job.outputBatchId, inspectionId: projection.latestInspection!.id, proof: actionProof, expectedHeadDigest }) })
  }

  return <>
    <section aria-labelledby="plant-execution-title" className="catalog-onboarding-bridge plant-execution-foundation">
      <div>
        <span className="core-eyebrow">Execution control</span>
        <h3 id="plant-execution-title">{projection.plan ? `${projection.plan.job.jobId} · ${statusCopy[projection.status]}` : 'Run one controlled batch'}</h3>
        <p>{projection.plan ? `${projection.totalOutput.toLocaleString()} / ${projection.metrics.targetQuantity.toLocaleString()} output · ${projection.genealogy.length} traced input ${projection.genealogy.length === 1 ? 'lot' : 'lots'} · revision ${projection.revision}` : 'Turn an active job into one reviewed BOM, routing, material, output, inspection, and release chain.'}</p>
      </div>
      {!projection.plan ? <button aria-controls="plant-execution-setup" aria-expanded={setupOpen} className="core-button primary" disabled={disabled} onClick={() => { setSetupOpen(true); setReview(null) }} ref={setupTriggerRef} type="button">Set up batch</button> : null}
      {projection.plan ? <span className={`status-pill ${projection.status === 'quality_hold' || projection.status === 'shortfall' ? 'pending' : 'bounded'}`}>{statusCopy[projection.status]}</span> : null}

      {projection.plan && (projection.status === 'planned' || projection.status === 'shortfall') ? <form className="core-form compact-form" onSubmit={reviewAvailability}>
        <div aria-label="Material and capacity availability" className="plant-availability-fields">
          <section aria-label="Material lots" className="plant-availability-group">
            {projection.materials.map((material) => {
              const draft = availabilityDraft.materials[material.materialId] ?? { inputLotId: '', availableQuantity: '' }
              return <div className="plant-availability-item" key={material.materialId}>
                <div><strong>{material.name}</strong><small>{material.materialId} · need {formatMilli(material.requiredQuantityMilli)} {material.unit}</small></div>
                <div className="form-row"><label>Input lot<input disabled={controlsDisabled} maxLength={80} onChange={(event) => updateMaterialAvailability(material.materialId, { inputLotId: event.target.value })} required value={draft.inputLotId} /></label><label>Available {material.unit}<input disabled={controlsDisabled} inputMode="decimal" min="0" onChange={(event) => updateMaterialAvailability(material.materialId, { availableQuantity: event.target.value })} required step="0.001" type="number" value={draft.availableQuantity} /></label></div>
              </div>
            })}
          </section>
          <section aria-label="Work-centre capacity" className="plant-availability-group">
            {projection.plan.workCentres.map((centre) => <div className="plant-availability-item" key={centre.workCentreId}>
              <div><strong>{centre.name}</strong><small>{centre.workCentreId}</small></div>
              <label>Available whole minutes<input disabled={controlsDisabled} min="0" onChange={(event) => updateWorkCentreAvailability(centre.workCentreId, event.target.value)} required step="1" type="number" value={availabilityDraft.workCentres[centre.workCentreId] ?? ''} /></label>
            </div>)}
          </section>
        </div>
        {projection.status === 'shortfall' ? <p className="form-notice warning-text" role="alert">{projection.latestAvailability?.shortfalls.map((row) => `${row.subjectId}: need ${formatMilli(row.required)}, have ${formatMilli(row.available)}`).join(' · ')}</p> : null}
        <button className="core-button primary" disabled={controlsDisabled} type="submit">Review availability</button>
      </form> : null}

      {projection.status === 'ready' ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewOrderRelease} type="button">Review order release</button> : null}
      {(projection.status === 'released' || projection.status === 'in_process') && nextMaterial ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewMaterialIssue} type="button">Review material issue</button> : null}
      {projection.status === 'in_process' && !nextMaterial && outputRemaining > 0 ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewOutput} type="button">Review batch output</button> : null}
      {(projection.status === 'inspection_due' || projection.status === 'quality_hold') ? <form className="core-form compact-form" onSubmit={reviewInspection}>
        <div className="form-row"><label>Inspection result<select disabled={controlsDisabled} onChange={(event) => { const result = event.target.value as 'pass' | 'fail'; setInspectionDraft({ result, rejected: result === 'pass' ? '0' : '1' }) }} value={inspectionDraft.result}><option value="pass">Pass</option><option value="fail">Fail and hold</option></select></label><label>Rejected units<input disabled={controlsDisabled} max={inspectedQuantity} min="0" onChange={(event) => setInspectionDraft((current) => ({ ...current, rejected: event.target.value }))} required step="1" type="number" value={inspectionDraft.rejected} /></label></div>
        <button className="core-button primary" disabled={controlsDisabled || !inspectionValid} type="submit">Review inspection</button>
      </form> : null}
      {projection.status === 'ready_to_release' ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewBatchRelease} type="button">Review batch release</button> : null}
      {projection.status === 'released_to_stock' ? <div className="stock-receipt-preview" role="status"><small>Human-released batch</small><strong>{projection.plan?.job.outputBatchId} · {projection.metrics.acceptedQuantity.toLocaleString()} accepted</strong></div> : null}

      {!bindingCurrent && projection.status !== 'released_to_stock' ? <p className="form-notice warning-text" role="alert">The bound Plant job changed after this execution plan was reviewed. This chain is paused; reconcile the job snapshot before continuing.</p> : null}
      {projection.genealogy.length ? <details className="compact-disclosure production-history"><summary>Batch genealogy <span>{projection.genealogy.length}</span></summary><div className="issue-list">{projection.genealogy.map((row) => <article key={row.materialId}><span aria-hidden="true" className="issue-mark resolved">LOT</span><div><strong>{row.inputLotId} → {row.outputBatchId}</strong><small>{row.materialId} · {formatMilli(row.issuedQuantityMilli)} {row.unit}</small></div></article>)}</div></details> : null}
      <p aria-live="polite" className="form-notice">{error || notice || (projection.status === 'released_to_stock' ? 'Batch release is recorded. Post Shop receipt, costing, and accounting only through their own reviewed controls.' : `${managed ? 'Managed' : 'Local'} execution evidence only. No machine command, external send, inventory posting, payment, or accounting action occurs.`)}</p>
    </section>

    <dialog aria-labelledby="plant-execution-setup-title" className="production-issue-dialog" id="plant-execution-setup" onCancel={(event) => { event.preventDefault(); closeSetup() }} ref={setupDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Plant execution</span><h2 id="plant-execution-setup-title">Set up controlled batch</h2></div><button aria-label="Close batch setup" className="text-link" onClick={closeSetup} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {!projection.plan ? <form autoComplete="off" className="core-form" onSubmit={reviewSetup}>
        <label>Active job<select disabled={disabled || Boolean(review)} onChange={(event) => { const job = activeJobs.find((candidate) => candidate.id === event.target.value); setSetupDraft(defaultSetup(job)) }} value={selectedSetupJob?.id ?? ''}>{activeJobs.length ? activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {remaining(job).toLocaleString()} left</option>) : <option value="">No active jobs</option>}</select></label>
        <label>Output batch ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, outputBatchId: event.target.value }))} required value={setupDraft.outputBatchId} /></label>
        <details className="compact-disclosure production-history">
          <summary>Customize material and routing <span>Up to {PLANT_ORDER_ADDITIONAL_MATERIAL_MAX + 1} materials · 1 operation</span></summary>
          <div className="core-form compact-form">
            <div className="form-row"><label>Material ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, materialId: event.target.value }))} required value={setupDraft.materialId} /></label><label>Material name<input disabled={disabled || Boolean(review)} maxLength={180} onChange={(event) => setSetupDraft((current) => ({ ...current, materialName: event.target.value }))} required value={setupDraft.materialName} /></label></div>
            <div className="form-row"><label>Material unit<select disabled={disabled || Boolean(review)} onChange={(event) => setSetupDraft((current) => ({ ...current, materialUnit: event.target.value as PlantOrderMaterial['unit'] }))} value={setupDraft.materialUnit}>{setupMaterialUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><label>Per output unit<input disabled={disabled || Boolean(review)} inputMode="decimal" min="0.001" onChange={(event) => setSetupDraft((current) => ({ ...current, quantityPerUnit: event.target.value }))} required step="0.001" type="number" value={setupDraft.quantityPerUnit} /></label></div>
            <label>Additional BOM materials (optional)<textarea disabled={disabled || Boolean(review)} maxLength={16_000} onChange={(event) => setSetupDraft((current) => ({ ...current, additionalMaterials: event.target.value }))} placeholder="MAT-RUBBER-01 | Natural rubber | kg | 1.5" rows={4} value={setupDraft.additionalMaterials} /><small>One row per line: material ID | name | unit | quantity per output unit. Add up to {PLANT_ORDER_ADDITIONAL_MATERIAL_MAX}.</small></label>
            <div className="form-row"><label>Work centre ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, workCentreId: event.target.value }))} required value={setupDraft.workCentreId} /></label><label>Work centre name<input disabled={disabled || Boolean(review)} maxLength={180} onChange={(event) => setSetupDraft((current) => ({ ...current, workCentreName: event.target.value }))} required value={setupDraft.workCentreName} /></label></div>
            <label>Minutes per output unit<input disabled={disabled || Boolean(review)} inputMode="decimal" min="0.001" onChange={(event) => setSetupDraft((current) => ({ ...current, minutesPerUnit: event.target.value }))} required step="0.001" type="number" value={setupDraft.minutesPerUnit} /></label>
          </div>
        </details>
        <p className="panel-copy">One material and one operation are prefilled. Paste up to {PLANT_ORDER_ADDITIONAL_MATERIAL_MAX} more BOM rows only when this batch needs them. No stock, staff, machine, costing, or accounting action occurs.</p>
        <div className="form-actions"><button className="core-button" onClick={closeSetup} type="button">Cancel</button><button className="core-button primary" disabled={disabled || Boolean(review) || !selectedSetupJob} type="submit">Review execution plan</button></div>
      </form> : null}
    </dialog>

    <dialog aria-labelledby="plant-execution-review-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); editReview() }} ref={reviewDialogRef}>
      {review ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Accountable review</span><h2 id="plant-execution-review-title">{review.title}</h2></div><button aria-label={`Edit ${review.title.toLowerCase()}`} className="text-link" disabled={busy} onClick={editReview} style={{ minHeight: 44, minWidth: 44 }} type="button">Edit</button></div>
        <div className="stock-receipt-preview plant-execution-review" role="status"><small>{review.title} ready</small><strong>{review.summary}</strong></div>
        <p className="panel-copy">{review.boundary}</p>
        <p className="panel-copy">Nothing changes until this one action is confirmed.</p>
        <div className="form-actions"><button className="core-button" disabled={busy} onClick={editReview} type="button">Back</button><button className="core-button primary" data-plant-review-primary disabled={busy} onClick={() => void confirmReview()} type="button">{busy ? 'Recording…' : `Confirm ${review.title.toLowerCase()}`}</button></div>
      </> : null}
    </dialog>
  </>
}
