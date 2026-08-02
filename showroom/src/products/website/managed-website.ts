import type {
  ManagedIdentity,
  ManagedWebsiteCommandResult,
  ManagedWebsiteEvent,
} from '../../core/managed-trial.ts'
import {
  restoreWorkspace,
  type WebsiteWorkspace,
} from './website-model.ts'

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}

function sameWorkspace(left: WebsiteWorkspace, right: WebsiteWorkspace) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right))
}

function sameAuthoritativeInquiryWorkspace(
  confirmed: WebsiteWorkspace,
  planned: WebsiteWorkspace,
  eventType: ManagedWebsiteEvent,
) {
  const confirmedLedger = confirmed.leadLedger
  const plannedLedger = planned.leadLedger
  if (!confirmedLedger || !plannedLedger
    || confirmedLedger.schema !== plannedLedger.schema
    || confirmedLedger.revision !== plannedLedger.revision
    || confirmedLedger.leads.length !== plannedLedger.leads.length) return false
  const withoutLedger = (workspace: WebsiteWorkspace) => {
    const rest: Partial<WebsiteWorkspace> = { ...workspace }
    delete rest.leadLedger
    return rest
  }
  if (JSON.stringify(canonicalValue(withoutLedger(confirmed)))
    !== JSON.stringify(canonicalValue(withoutLedger(planned)))) return false
  let authoritativeTimestampChanges = 0
  for (let index = 0; index < plannedLedger.leads.length; index += 1) {
    const confirmedLead = confirmedLedger.leads[index]
    const plannedLead = plannedLedger.leads[index]
    const normalized = eventType === 'website.inquiry.received' && index === 0
      ? { ...confirmedLead, createdAt: plannedLead.createdAt, updatedAt: plannedLead.updatedAt }
      : { ...confirmedLead, updatedAt: plannedLead.updatedAt }
    if (JSON.stringify(canonicalValue(normalized)) !== JSON.stringify(canonicalValue(plannedLead))) return false
    if (confirmedLead.createdAt !== plannedLead.createdAt) {
      if (eventType !== 'website.inquiry.received' || index !== 0) return false
      authoritativeTimestampChanges += 1
    }
    if (confirmedLead.updatedAt !== plannedLead.updatedAt) authoritativeTimestampChanges += 1
    if (eventType === 'website.inquiry.received' && index === 0
      && confirmedLead.createdAt !== confirmedLead.updatedAt) return false
  }
  return authoritativeTimestampChanges <= (eventType === 'website.inquiry.received' ? 2 : 1)
}

export function sameManagedWebsiteIdentity(
  left: ManagedIdentity,
  right: ManagedIdentity,
) {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
}

export function acceptManagedWebsiteCommand(
  expectedState: WebsiteWorkspace,
  result: ManagedWebsiteCommandResult,
  expected: {
    commandId: string
    eventType: ManagedWebsiteEvent
    priorVersion: number
  },
) {
  if (result.command_id !== expected.commandId
    || result.surface !== 'website'
    || result.event_type !== expected.eventType
    || result.version !== expected.priorVersion + 1
    || typeof result.idempotent_replay !== 'boolean') {
    throw new Error('The company account returned an unrelated Website receipt.')
  }
  const confirmed = restoreWorkspace(result.state)
  const planned = restoreWorkspace(expectedState)
  const stateMatches = confirmed && planned && (
    sameWorkspace(confirmed, planned)
    || (
      (expected.eventType === 'website.inquiry.received'
        || expected.eventType === 'website.inquiry.reviewed')
      && sameAuthoritativeInquiryWorkspace(confirmed, planned, expected.eventType)
    )
  )
  if (!confirmed || !planned || !stateMatches) {
    throw new Error('The company account returned a different Website state.')
  }
  return {
    workspace: confirmed,
    version: result.version,
    replayed: result.idempotent_replay,
  }
}
