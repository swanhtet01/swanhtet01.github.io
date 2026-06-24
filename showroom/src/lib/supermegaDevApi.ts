import { workspaceFetch, type PlatformControlPlanePayload, type WorkspaceDomainRow } from './workspaceApi'

export type SupermegaControlCheck = {
  target?: string
  status?: string
  detail?: string
  meta?: Record<string, unknown>
}

export type SupermegaDomainReport = {
  checked_at?: string
  domain?: string
  overall_status?: string
  check_count?: number
  failure_count?: number
  optional_failure_count?: number
  failures?: SupermegaControlCheck[]
  optional_failures?: SupermegaControlCheck[]
  all_failures?: SupermegaControlCheck[]
  checks?: SupermegaControlCheck[]
}

export type SupermegaResourceRow = {
  id: string
  label: string
  category: string
  path: string
  exists: boolean
  updated_at?: string | null
  detail: string
}

export type SupermegaCommandRow = {
  id: string
  label: string
  kind: string
  command: string
  detail: string
}

export type SupermegaMachineSection = {
  id: string
  name: string
  route: string
  summary: string
  signals: string[]
}

export type SupermegaTopologyRow = WorkspaceDomainRow & {
  name?: string
  summary?: string
  managed_by?: string[]
}

export type SupermegaTopologyPayload = {
  resource_id?: string
  root_domain?: string
  shared_app_host?: string
  summary?: {
    count?: number
    ready_count?: number
    attention_count?: number
    blocker_count?: number
  }
  rows?: SupermegaTopologyRow[]
}

export type SupermegaCoreTeamRow = {
  member_id?: string
  name?: string
  role?: string
  status?: string
  home_route?: string
  capability_focus?: string[]
  assigned_open_task_count?: number
  assigned_high_priority_task_count?: number
  linked_programs?: string[]
  linked_data_domains?: string[]
  next_move?: string
}

export type SupermegaAssignmentRow = {
  id?: string
  title?: string
  priority?: string
  status?: string
  route?: string
  current_owner?: string
  suggested_owner?: string
  suggested_role?: string
  due?: string | null
  data_signals?: string[]
  reason?: string
  next_action?: string
}

export type SupermegaReviewCycleRow = {
  id?: string
  name?: string
  cadence?: string
  status?: string
  route?: string
  owner_role?: string
  queue_count?: number
  data_signals?: string[]
  focus?: string[]
  next_move?: string
}

export type SupermegaAutomationLaneRow = {
  id?: string
  name?: string
  cadence?: string
  status?: string
  route?: string
  mode?: string
  source_systems?: string[]
  latest_run_at?: string | null
  queue_signal?: string
  next_move?: string
}

export type SupermegaDataLinkRow = {
  id?: string
  name?: string
  status?: string
  route?: string
  source_type?: string
  evidence_count?: number
  consumers?: string[]
  next_automation?: string
}

export type SupermegaDevControlPayload = {
  status?: string
  generated_at?: string
  workspace?: PlatformControlPlanePayload['workspace']
  machine?: {
    repo_root?: string
    root_domain?: string
    shared_app_host?: string
    site_root?: string
    service_entrypoint?: string
    public_routes?: string[]
    app_routes?: string[]
    sections?: SupermegaMachineSection[]
  }
  platform?: {
    profile?: PlatformControlPlanePayload['profile']
    modules?: PlatformControlPlanePayload['modules']
    members?: PlatformControlPlanePayload['members']
    domains?: PlatformControlPlanePayload['domains']
    audit_events?: PlatformControlPlanePayload['audit_events']
  }
  cloud?: {
    preferred_workforce_mode?: string
    summary?: {
      ready_count?: number
      attention_count?: number
      blocker_count?: number
      coverage_score?: number
      stale_job_count?: number
      queue_ready?: boolean
      deploy_ready?: boolean
    }
    topology?: SupermegaTopologyPayload | null
    jobs?: Array<{
      jobType?: string
      name?: string
      cadence?: string
      status?: string
      lastRunAt?: string | null
      detail?: string
    }>
    next_moves?: string[]
  }
  workforce?: {
    summary?: {
      core_team_count?: number
      assignment_count?: number
      review_cycle_count?: number
      automation_lane_count?: number
      data_link_count?: number
      open_task_count?: number
      active_playbook_count?: number
      coverage_score?: number
      enabled_module_count?: number
    }
    preferred_workforce_mode?: string
    core_team?: SupermegaCoreTeamRow[]
    assignment_board?: SupermegaAssignmentRow[]
    review_cycles?: SupermegaReviewCycleRow[]
    automation_lanes?: SupermegaAutomationLaneRow[]
    data_links?: SupermegaDataLinkRow[]
    supervisor?: {
      status?: string
      cycle_count?: number
      last_finished_at?: string
      interval_minutes?: number
    }
    next_moves?: string[]
  }
  domains?: {
    root_report?: SupermegaDomainReport | null
    shared_app_domain?: WorkspaceDomainRow | null
    workspace_rows?: WorkspaceDomainRow[]
    topology_summary?: {
      count?: number
      ready_count?: number
      attention_count?: number
      blocker_count?: number
    }
  }
  deployment?: {
    preview_ready?: boolean
    vercel_cli_available?: boolean
    scripts?: SupermegaResourceRow[]
    commands?: SupermegaCommandRow[]
  }
  smoke?: {
    ready?: boolean
    public_routes?: string[]
    app_routes?: string[]
    scripts?: SupermegaResourceRow[]
    commands?: SupermegaCommandRow[]
  }
  resources?: {
    code?: SupermegaResourceRow[]
    data?: SupermegaResourceRow[]
    instructions?: SupermegaResourceRow[]
  }
  commands?: SupermegaCommandRow[]
}

export async function getSupermegaDevControl() {
  return workspaceFetch<SupermegaDevControlPayload>('/api/supermega-dev/control')
}
