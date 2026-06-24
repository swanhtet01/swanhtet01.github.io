import { getSeedAdoptionCommandDataset, loadAdoptionCommandDataset, type AdoptionCommandDataset } from './adoptionCommandApi'
import { loadRuntimeControlDataset, type RuntimeControlDataset } from './runtimeControlApi'
import { loadWorkforceRegistry, type WorkforceRegistryPayload } from './workforceCommandApi'
import { checkWorkspaceHealth, createWorkspaceTasks, listWorkspaceTasks, workspaceFetch, type WorkspaceTaskRow } from './workspaceApi'

type RecordLike = Record<string, unknown>

function asRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' ? (value as RecordLike) : {}
}

function asString(value: unknown) {
  return String(value ?? '').trim()
}

export type PilotCommandSource = 'seed' | 'live'

export type PilotFeedbackRow = {
  feedbackId: string
  createdAt: string | null
  source: string
  surface: string
  category: string
  priority: string
  status: string
  note: string
}

export type PilotScenario = {
  id: string
  title: string
  role: string
  route: string
  home: string
  status: string
  priority: string
  objective: string
  whyNow: string
  mustCapture: string[]
  usefulOutputs: string[]
  watchFor: string[]
  suggestedOwner: string
  queueSignal: string
  noteStarter: string
}

export type PilotFollowUpTask = {
  taskId: string
  title: string
  owner: string
  priority: string
  status: string
  due: string | null
  updatedAt: string | null
}

export type PilotCommandDataset = {
  source: PilotCommandSource
  updatedAt: string | null
  summary: {
    readinessScore: number
    scenarioCount: number
    attentionScenarioCount: number
    openBugCount: number
    highPriorityBugCount: number
    followUpTaskCount: number
    connectorAttentionCount: number
  }
  guidance: {
    headline: string
    steps: string[]
    evidenceRules: string[]
  }
  scenarios: PilotScenario[]
  feedbackRows: PilotFeedbackRow[]
  followUpTasks: PilotFollowUpTask[]
  nextMoves: string[]
}

export type SavePilotFeedbackInput = {
  surface: string
  category: string
  priority: string
  status?: string
  note: string
  createTask?: boolean
  taskOwner?: string
  taskDue?: string
}

function normalizePilotFeedbackRow(value: unknown): PilotFeedbackRow {
  const record = asRecord(value)
  return {
    feedbackId: asString(record.feedback_id),
    createdAt: asString(record.created_at) || null,
    source: asString(record.source),
    surface: asString(record.surface),
    category: asString(record.category),
    priority: asString(record.priority),
    status: asString(record.status),
    note: asString(record.note),
  }
}

function matchesPilotTask(row: WorkspaceTaskRow) {
  return asString(row.template) === 'pilot_command_bug' || asString(row.notes).includes('[pilot_command]')
}

function normalizePilotTask(row: WorkspaceTaskRow): PilotFollowUpTask {
  return {
    taskId: asString(row.task_id),
    title: asString(row.title),
    owner: asString(row.owner),
    priority: asString(row.priority),
    status: asString(row.status),
    due: asString(row.due) || null,
    updatedAt: asString(row.updated_at) || null,
  }
}

function derivePilotScenarios(adoption: AdoptionCommandDataset, workforce: WorkforceRegistryPayload, runtime: RuntimeControlDataset): PilotScenario[] {
  const assignmentBoard = workforce.live.assignmentBoard
  const attentionConnectors = runtime.connectors.filter((connector) => {
    const status = asString(connector.status).toLowerCase()
    return status && status !== 'healthy' && status !== 'live' && status !== 'ready'
  })

  return [...adoption.rolePacks]
    .sort((left, right) => {
      const leftPenalty = left.status === 'Healthy' ? 0 : 1
      const rightPenalty = right.status === 'Healthy' ? 0 : 1
      if (leftPenalty !== rightPenalty) {
        return rightPenalty - leftPenalty
      }
      return left.adoptionScore - right.adoptionScore
    })
    .slice(0, 6)
    .map((pack) => {
      const matchingAssignments = assignmentBoard.filter((item) => item.route === pack.route || item.suggestedRole === pack.role)
      const queueSignal = matchingAssignments[0]?.nextAction || matchingAssignments[0]?.reason || 'No current queue signal is attached to this lane.'
      const connectorSignals = attentionConnectors
        .filter((item) => item.workspace.includes(pack.route.split('/').pop() ?? '') || item.outputs.some((output) => output.toLowerCase().includes(pack.role.toLowerCase())))
        .slice(0, 2)
        .map((item) => `${item.name}: ${item.nextAutomation}`)

      const watchFor = [
        ...pack.blockers.slice(0, 2),
        ...connectorSignals,
        pack.nextEscalation,
      ].filter(Boolean)

      return {
        id: pack.id,
        title: `Use ${pack.home} as the ${pack.role} lane`,
        role: pack.role,
        route: pack.route,
        home: pack.home,
        status: pack.status,
        priority: pack.adoptionScore < 70 || pack.status !== 'Healthy' ? 'high' : 'medium',
        objective: `Enter ${pack.mustCapture.slice(0, 2).join(' and ')} and confirm the lane produces ${pack.usefulOutputs[0] ?? 'the next useful output'}.`,
        whyNow: pack.changeMoves[0] ?? pack.managerCadence,
        mustCapture: pack.mustCapture,
        usefulOutputs: pack.usefulOutputs,
        watchFor,
        suggestedOwner: matchingAssignments[0]?.suggestedOwner || pack.role,
        queueSignal,
        noteStarter: `Route tested: ${pack.route}\nRole: ${pack.role}\nExpected output: ${pack.usefulOutputs[0] ?? 'next move'}\nObserved issue: `,
      }
    })
}

function buildFallbackDataset(): PilotCommandDataset {
  const adoption = getSeedAdoptionCommandDataset()
  return {
    source: 'seed',
    updatedAt: null,
    summary: {
      readinessScore: 62,
      scenarioCount: Math.min(adoption.rolePacks.length, 6),
      attentionScenarioCount: Math.min(adoption.rolePacks.length, 6),
      openBugCount: 0,
      highPriorityBugCount: 0,
      followUpTaskCount: 0,
      connectorAttentionCount: 0,
    },
    guidance: {
      headline: 'Use one lane at a time, record friction immediately, and convert repeat friction into tracked work.',
      steps: [
        'Open the lane you actually use for your role and complete one real entry or review cycle.',
        'If anything is confusing, missing, slow, or wrong, log it from the same desk instead of keeping it in chat.',
        'Create a follow-up task when the issue should be fixed or assigned, not just remembered.',
      ],
      evidenceRules: [
        'Write what you tried, what you expected, and what actually happened.',
        'Name the route, role, and data that were involved.',
        'Treat repeated manual workaround as a product bug, not a user failure.',
      ],
    },
    scenarios: adoption.rolePacks.slice(0, 6).map((pack) => ({
      id: pack.id,
      title: `Use ${pack.home} as the ${pack.role} lane`,
      role: pack.role,
      route: pack.route,
      home: pack.home,
      status: pack.status,
      priority: 'medium',
      objective: `Enter ${pack.mustCapture.slice(0, 2).join(' and ')} and confirm the lane returns the next move.`,
      whyNow: pack.changeMoves[0] ?? pack.managerCadence,
      mustCapture: pack.mustCapture,
      usefulOutputs: pack.usefulOutputs,
      watchFor: pack.blockers,
      suggestedOwner: pack.role,
      queueSignal: 'Live queue signals will appear once the workspace API is available.',
      noteStarter: `Route tested: ${pack.route}\nRole: ${pack.role}\nObserved issue: `,
    })),
    feedbackRows: [],
    followUpTasks: [],
    nextMoves: adoption.bigPicture.nextBuilds,
  }
}

export async function loadPilotCommandDataset(): Promise<PilotCommandDataset> {
  const fallback = buildFallbackDataset()
  const health = await checkWorkspaceHealth()

  if (!health.ready) {
    return fallback
  }

  try {
    const [adoption, workforce, runtime, feedbackPayload, taskPayload] = await Promise.all([
      loadAdoptionCommandDataset(),
      loadWorkforceRegistry(),
      loadRuntimeControlDataset(),
      workspaceFetch<{ rows?: unknown[] }>('/api/product-feedback?source=pilot_command&limit=24'),
      listWorkspaceTasks(undefined, 200),
    ])

    const feedbackRows = (feedbackPayload.rows ?? []).map((row) => normalizePilotFeedbackRow(row))
    const followUpTasks = (taskPayload.rows ?? []).filter(matchesPilotTask).slice(0, 12).map(normalizePilotTask)
    const scenarios = derivePilotScenarios(adoption, workforce, runtime)
    const openBugCount = feedbackRows.filter((row) => {
      const status = row.status.toLowerCase()
      return status === 'open' || status === 'review'
    }).length
    const highPriorityBugCount = feedbackRows.filter((row) => row.priority.toLowerCase() === 'high').length
    const connectorAttentionCount = runtime.connectors.filter((connector) => {
      const status = asString(connector.status).toLowerCase()
      return status && status !== 'healthy' && status !== 'live' && status !== 'ready'
    }).length
    const attentionScenarioCount = scenarios.filter((scenario) => scenario.priority === 'high' || scenario.status !== 'Healthy').length
    const readinessScore = Math.max(
      35,
      Math.min(
        99,
        Math.round(
          adoption.summary.overallScore * 0.55 +
            workforce.summary.coverageScore * 0.25 +
            Math.max(0, 100 - openBugCount * 6 - connectorAttentionCount * 4) * 0.2,
        ),
      ),
    )

    return {
      source: 'live',
      updatedAt: workforce.updatedAt ?? runtime.updatedAt ?? adoption.updatedAt,
      summary: {
        readinessScore,
        scenarioCount: scenarios.length,
        attentionScenarioCount,
        openBugCount,
        highPriorityBugCount,
        followUpTaskCount: followUpTasks.length,
        connectorAttentionCount,
      },
      guidance: {
        headline: 'Staff should use this desk to test the real lane, capture the exact friction, and push only real issues into the backlog.',
        steps: [
          'Pick the scenario that matches your role or the route you are about to use.',
          'Open the lane, complete one real task or data-entry cycle, then come back and log what broke or confused you.',
          'Save the note and create a follow-up task if the issue needs fixing, training, or manager review.',
        ],
        evidenceRules: [
          'Always include the route, the data you entered or reviewed, and the exact missing or wrong behavior.',
          'If the issue blocks work, mark it high priority and create a follow-up task.',
          'If the same workaround keeps happening, log it as a bug even if the team can still finish the work.',
        ],
      },
      scenarios,
      feedbackRows,
      followUpTasks,
      nextMoves: [
        ...adoption.bigPicture.nextBuilds,
        ...runtime.bigPicture.nextBuilds,
        ...workforce.live.nextMoves,
      ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index).slice(0, 6),
    }
  } catch {
    return fallback
  }
}

export async function savePilotFeedback(input: SavePilotFeedbackInput) {
  const note = asString(input.note)
  if (!note) {
    throw new Error('A useful bug note is required before saving.')
  }

  const feedbackPayload = await workspaceFetch<{
    status?: string
    message?: string
    row?: unknown
    rows?: unknown[]
  }>('/api/product-feedback', {
    method: 'POST',
    body: JSON.stringify({
      source: 'pilot_command',
      surface: input.surface,
      category: input.category,
      priority: input.priority,
      status: input.status ?? 'open',
      note,
    }),
  })

  let taskPayload:
    | {
        status?: string
        saved_count?: number
        saved_task_ids?: string[]
        rows?: WorkspaceTaskRow[]
      }
    | null = null

  if (input.createTask) {
    taskPayload = await createWorkspaceTasks([
      {
        title: `Pilot follow-up: ${asString(input.surface) || 'workflow bug'}`,
        owner: asString(input.taskOwner) || 'manager',
        priority: asString(input.priority) || 'medium',
        due: asString(input.taskDue),
        status: 'open',
        template: 'pilot_command_bug',
        notes: `[pilot_command]\nSurface: ${asString(input.surface)}\nCategory: ${asString(input.category)}\n${note}`,
      },
    ])
  }

  return {
    feedbackMessage: asString(feedbackPayload.message) || 'Pilot note saved.',
    feedbackRows: (feedbackPayload.rows ?? []).map((row) => normalizePilotFeedbackRow(row)).filter((row) => row.source === 'pilot_command'),
    taskPayload,
  }
}
