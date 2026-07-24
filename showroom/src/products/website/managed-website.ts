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
    throw new Error('The managed workspace returned an unrelated Website receipt.')
  }
  const confirmed = restoreWorkspace(result.state)
  const planned = restoreWorkspace(expectedState)
  if (!confirmed || !planned || !sameWorkspace(confirmed, planned)) {
    throw new Error('The managed workspace returned a different Website state.')
  }
  return {
    workspace: confirmed,
    version: result.version,
    replayed: result.idempotent_replay,
  }
}
