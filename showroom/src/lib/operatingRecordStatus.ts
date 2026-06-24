export type LinkedActionPayload = {
  saved_count?: number
}

export type LinkedTaskPayload = {
  saved_count?: number
  saved_task_ids?: string[]
}

export type OperatingRecordSavePayload = {
  message?: string
  linked_action?: LinkedActionPayload | null
  linked_tasks?: LinkedTaskPayload | null
}

export function linkedFollowUpCount(payload: OperatingRecordSavePayload | null | undefined) {
  return (payload?.linked_tasks?.saved_count ?? 0) || (payload?.linked_action?.saved_count ?? 0)
}

export function operatingRecordSavedMessage(payload: OperatingRecordSavePayload | null | undefined, fallback: string) {
  const followUps = linkedFollowUpCount(payload)
  const base = payload?.message || fallback
  if (!followUps) return base
  return `${base} ${followUps} follow-up${followUps === 1 ? '' : 's'} opened on the Action Board.`
}

export function operatingRecordFailureMessage(recordName: string) {
  return `${recordName} could not be saved to the live operating record. Keep the note, check API/database health, and retry from Daily Entry or this module.`
}

export const OPERATING_RECORD_LOOP = [
  {
    label: 'Capture',
    detail: 'Save one fact, photo, issue, receiving gap, CAPA, or maintenance note.',
  },
  {
    label: 'Route',
    detail: 'Open the follow-up on Action Board with owner, priority, due window, and evidence.',
  },
  {
    label: 'Review',
    detail: 'Manager approves the action, KPI signal, or writeback before it becomes official.',
  },
] as const
