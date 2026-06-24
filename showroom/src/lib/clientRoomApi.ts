import { workspaceFetch } from './workspaceApi'

export type ClientRoomMetric = {
  label: string
  value: string
  detail: string
}

export type ClientRoomPerson = {
  role: string
  name: string
  focus: string
  state: string
}

export type ClientRoomSourceRequest = {
  title: string
  owner: string
  status: string
  detail: string
}

export type ClientRoomDecision = {
  title: string
  decision: string
  state: string
}

export type ClientRoomPayload = {
  status: string
  generated_at?: string
  source?: 'live' | 'demo'
  workspace?: {
    slug?: string
    name?: string
  }
  metrics?: ClientRoomMetric[]
  people?: ClientRoomPerson[]
  source_requests?: ClientRoomSourceRequest[]
  decisions?: ClientRoomDecision[]
  handoff?: string[]
}

export async function loadClientRoom(): Promise<ClientRoomPayload> {
  return workspaceFetch<ClientRoomPayload>('/api/client-room', { timeoutMs: 12000 })
}
