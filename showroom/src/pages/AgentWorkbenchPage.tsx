import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { AGENT_COMMAND_LIBRARY, AGENT_TEMPLATE_LIBRARY, SUPERMEGA_AGENT_REFERENCE_PATTERN } from '../lib/agentSkillLibrary'
import {
  AGENT_WORKBENCH_AUTONOMY_LADDER,
  AGENT_WORKBENCH_GATES,
  AGENT_WORKBENCH_OPERATING_LOOP,
  AGENT_WORKBENCH_PRINCIPLES,
  AGENT_WORKBENCH_PROJECTS,
  AGENT_WORKBENCH_ROLES,
  AGENT_WORKBENCH_STACK_DECISIONS,
  AGENT_WORKBENCH_TASKS,
  CLOUD_RUNTIME_LANES,
  type AgentTaskStatus,
} from '../lib/agentWorkbenchModel'
import {
  executeAgentPatch,
  getBuildMachineControl,
  listAgentRuns,
  promoteAgentWorkbenchRun,
  proposeAgentImplementation,
  runAgentWorkbenchCommand,
  runAgentWorkbenchFullLoop,
  runBuildMachineGate,
  type AgentRunRow,
  type BuildMachineControl,
} from '../lib/workspaceApi'

type WorkbenchCommand = (typeof AGENT_COMMAND_LIBRARY)[number]

const statusTone: Record<AgentTaskStatus, string> = {
  queued: 'border-white/10 bg-white/5 text-white',
  running: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
  review: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
  approved: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
  blocked: 'border-rose-300/30 bg-rose-400/10 text-rose-100',
  deployed: 'border-violet-300/30 bg-violet-400/10 text-violet-100',
}

function statusLabel(status: AgentTaskStatus) {
  return status
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function clientSafeText(value: unknown, fallback = '') {
  return String(value || fallback)
    .replace(/\bAgent Workbench\b/gi, 'Work Review')
    .replace(/\bAgent Ops\b/gi, 'Automation Review')
    .replace(/\bAgentic Workflow Studio\b/gi, 'Workflow Studio')
    .replace(/\bManaged agent teams\b/gi, 'Managed review lanes')
    .replace(/\bSkill OS\b/gi, 'Work Rules')
    .replace(/\bAI crews\b/gi, 'Review lanes')
    .replace(/\bAI workforce\b/gi, 'Automation support')
    .replace(/\bAI\b/g, 'automation')
    .replace(/\bagents\b/gi, 'review lanes')
    .replace(/\bagent\b/gi, 'review lane')
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value || 0)
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length) : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function runArtifact(row: AgentRunRow) {
  return asRecord(asRecord(row.result).artifact)
}

function runExecutionPacket(row?: AgentRunRow) {
  if (!row) return {}
  return asRecord(asRecord(row.result).execution_packet)
}

function runImplementationProposal(row?: AgentRunRow) {
  if (!row) return {}
  return asRecord(asRecord(row.result).implementation_proposal)
}

function runPatchExecution(row?: AgentRunRow) {
  if (!row) return {}
  return asRecord(asRecord(row.result).patch_execution)
}

function runDeliveryPipeline(row?: AgentRunRow) {
  if (!row) return []
  return asArray(runArtifact(row).delivery_pipeline)
}

function runReadiness(row?: AgentRunRow) {
  if (!row) return {}
  return asRecord(runArtifact(row).readiness)
}

function recommendedCommandForProject(project: (typeof AGENT_WORKBENCH_PROJECTS)[number] | undefined) {
  const hint = `${project?.previewRoute ?? ''} ${project?.firstProduct ?? ''} ${project?.firstScreen ?? ''}`.toLowerCase()
  if (hint.includes('restaurant') || hint.includes('menu') || hint.includes('pos')) {
    return AGENT_COMMAND_LIBRARY.find((command) => command.id === 'menu-import') ?? AGENT_COMMAND_LIBRARY[0]
  }
  if (hint.includes('industrial') || hint.includes('plant') || hint.includes('dqms') || hint.includes('quality')) {
    return AGENT_COMMAND_LIBRARY.find((command) => command.id === 'draft-capa') ?? AGENT_COMMAND_LIBRARY[0]
  }
  if (hint.includes('revenue') || hint.includes('lead') || hint.includes('prospect')) {
    return AGENT_COMMAND_LIBRARY.find((command) => command.id === 'map-sources') ?? AGENT_COMMAND_LIBRARY[0]
  }
  return AGENT_COMMAND_LIBRARY.find((command) => command.id === 'intake-to-manifest') ?? AGENT_COMMAND_LIBRARY[0]
}

export function AgentWorkbenchPage() {
  const [activeProjectId, setActiveProjectId] = useState(AGENT_WORKBENCH_PROJECTS[0]?.id ?? '')
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const [builderRuns, setBuilderRuns] = useState<AgentRunRow[]>([])
  const [implementationRuns, setImplementationRuns] = useState<AgentRunRow[]>([])
  const [patchRuns, setPatchRuns] = useState<AgentRunRow[]>([])
  const [runsStatus, setRunsStatus] = useState('Loading command run evidence...')
  const [runningCommandId, setRunningCommandId] = useState('')
  const [runningFullLoop, setRunningFullLoop] = useState(false)
  const [promotingRunId, setPromotingRunId] = useState('')
  const [proposingRunId, setProposingRunId] = useState('')
  const [patchingRunId, setPatchingRunId] = useState('')
  const [buildMachine, setBuildMachine] = useState<BuildMachineControl | null>(null)
  const [runningBuildMachine, setRunningBuildMachine] = useState(false)
  const activeProject = AGENT_WORKBENCH_PROJECTS.find((project) => project.id === activeProjectId) ?? AGENT_WORKBENCH_PROJECTS[0]
  const recommendedCommand = recommendedCommandForProject(activeProject)
  const taskCounts = useMemo(() => {
    return AGENT_WORKBENCH_TASKS.reduce(
      (counts, task) => {
        counts[task.status] = (counts[task.status] ?? 0) + 1
        return counts
      },
      {} as Record<AgentTaskStatus, number>,
    )
  }, [])
  const activeTasks = AGENT_WORKBENCH_TASKS.filter((task) => task.projectId === activeProject?.id)
  const roleById = new Map(AGENT_WORKBENCH_ROLES.map((role) => [role.id, role]))
  const latestRun = agentRuns[0]
  const latestBuilderRun = builderRuns[0]
  const latestBuilderPacket = runExecutionPacket(latestBuilderRun)
  const latestBuilderTargetFiles = asStringArray(latestBuilderPacket.target_files)
  const latestBuilderQaCommands = asStringArray(latestBuilderPacket.qa_commands)
  const latestImplementationRun = implementationRuns[0]
  const latestImplementationProposal = runImplementationProposal(latestImplementationRun)
  const latestImplementationChangePlan = asArray(latestImplementationProposal.change_plan)
  const latestImplementationAcceptance = asStringArray(latestImplementationProposal.acceptance_criteria)
  const latestPatchRun = patchRuns[0]
  const latestPatchExecution = runPatchExecution(latestPatchRun)
  const latestPatchIntents = asArray(latestPatchExecution.patch_intents)
  const latestPatchTargetFiles = asStringArray(latestPatchExecution.target_files)
  const buildMachineCommands = buildMachine?.commands ?? []
  const buildMachineRuns = buildMachine?.runs?.rows ?? []
  const latestBuildMachine = asRecord(asRecord(buildMachineRuns[0]?.result).build_machine)
  const latestBuildMachineCommands = asArray(latestBuildMachine.commands)
  const latestPipeline = runDeliveryPipeline(latestRun)
  const latestReadiness = runReadiness(latestRun)
  const latestReadinessScore = asNumber(latestReadiness.score)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listAgentRuns(8, 'agent_workbench_command'),
      listAgentRuns(5, 'agent_builder_execution'),
      listAgentRuns(5, 'agent_implementation_proposal'),
      listAgentRuns(5, 'agent_patch_execution'),
      getBuildMachineControl().catch(() => null),
    ])
      .then(([commandPayload, builderPayload, implementationPayload, patchPayload, buildMachinePayload]) => {
        if (cancelled) return
        const commandRows = commandPayload.rows ?? []
        const builderRows = builderPayload.rows ?? []
        const implementationRows = implementationPayload.rows ?? []
        const patchRows = patchPayload.rows ?? []
        setAgentRuns(commandRows)
        setBuilderRuns(builderRows)
        setImplementationRuns(implementationRows)
        setPatchRuns(patchRows)
        if (buildMachinePayload) {
          setBuildMachine(buildMachinePayload)
        }
        setRunsStatus(
          commandRows.length
            ? `${commandRows.length} commands, ${builderRows.length} builders, ${implementationRows.length} proposals, and ${patchRows.length} patch executions loaded.`
            : 'No workbench command has run yet.',
        )
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setRunsStatus(error instanceof Error ? error.message : 'Could not load agent runs.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRunCommand(command: WorkbenchCommand) {
    if (!activeProject) return
    setRunningCommandId(command.id)
    setRunsStatus(`Running ${command.label} on ${activeProject.client}...`)
    try {
      const payload = await runAgentWorkbenchCommand({
        command_id: command.id,
        project_id: activeProject.id,
        command: command as unknown as Record<string, unknown>,
        project: activeProject as unknown as Record<string, unknown>,
      })
      const row = payload.row
      if (row) {
        setAgentRuns((current) => [row, ...current.filter((item) => item.run_id !== row.run_id)].slice(0, 8))
      }
      const artifact = asRecord(payload.artifact)
      const artifactId = asText(artifact.artifact_id)
      setRunsStatus(artifactId ? `Created ${artifactId}. Review task is queued.` : payload.next_step || 'Agent command completed.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Agent command failed.')
    } finally {
      setRunningCommandId('')
    }
  }

  async function handleRunFullLoop() {
    if (!activeProject || !recommendedCommand) return
    setRunningFullLoop(true)
    setRunsStatus(`Running full build loop for ${activeProject.client}...`)
    try {
      const payload = await runAgentWorkbenchFullLoop({
        command_id: recommendedCommand.id,
        project_id: activeProject.id,
        command: recommendedCommand as unknown as Record<string, unknown>,
        project: activeProject as unknown as Record<string, unknown>,
        notes: 'One-click Agent Workbench loop from UI: command, builder, implementation proposal, and controlled patch execution.',
      })
      const rows = payload.rows ?? []
      const commandRow = rows.find((row) => row.job_type === 'agent_workbench_command')
      const builderRow = rows.find((row) => row.job_type === 'agent_builder_execution')
      const proposalRow = rows.find((row) => row.job_type === 'agent_implementation_proposal')
      const patchRow = rows.find((row) => row.job_type === 'agent_patch_execution') ?? payload.row
      if (commandRow) setAgentRuns((current) => [commandRow, ...current.filter((item) => item.run_id !== commandRow.run_id)].slice(0, 8))
      if (builderRow) setBuilderRuns((current) => [builderRow, ...current.filter((item) => item.run_id !== builderRow.run_id)].slice(0, 5))
      if (proposalRow) setImplementationRuns((current) => [proposalRow, ...current.filter((item) => item.run_id !== proposalRow.run_id)].slice(0, 5))
      if (patchRow) setPatchRuns((current) => [patchRow, ...current.filter((item) => item.run_id !== patchRow.run_id)].slice(0, 5))
      const execution = asRecord(payload.patch_execution)
      const executionId = asText(execution.execution_id)
      setRunsStatus(executionId ? `Full build loop created ${executionId}. Review patch scope and run QA before release.` : payload.next_step || 'Full build loop completed.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Full build loop failed.')
    } finally {
      setRunningFullLoop(false)
    }
  }

  async function handlePromoteRun(row: AgentRunRow) {
    setPromotingRunId(row.run_id)
    setRunsStatus(`Promoting ${row.run_id} into a builder packet...`)
    try {
      const payload = await promoteAgentWorkbenchRun({
        run_id: row.run_id,
        notes: 'Promoted from Agent Workbench UI for scoped builder, QA, release, and handoff tasks.',
      })
      const nextRow = payload.row
      if (nextRow) {
        setBuilderRuns((current) => [nextRow, ...current.filter((item) => item.run_id !== nextRow.run_id)].slice(0, 5))
      }
      const packet = asRecord(payload.execution_packet)
      const packetId = asText(packet.packet_id)
      setRunsStatus(packetId ? `Created builder packet ${packetId}. QA and release tasks are queued.` : payload.next_step || 'Builder promotion completed.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Builder promotion failed.')
    } finally {
      setPromotingRunId('')
    }
  }

  async function handleProposeImplementation(row: AgentRunRow) {
    setProposingRunId(row.run_id)
    setRunsStatus(`Creating implementation proposal from ${row.run_id}...`)
    try {
      const payload = await proposeAgentImplementation({
        run_id: row.run_id,
        notes: 'Created from Agent Workbench UI to convert builder packet into scoped patch, QA, proof, and learning tasks.',
      })
      const nextRow = payload.row
      if (nextRow) {
        setImplementationRuns((current) => [nextRow, ...current.filter((item) => item.run_id !== nextRow.run_id)].slice(0, 5))
      }
      const proposal = asRecord(payload.implementation_proposal)
      const proposalId = asText(proposal.proposal_id)
      setRunsStatus(proposalId ? `Created implementation proposal ${proposalId}. Patch, QA, proof, and learning tasks are queued.` : payload.next_step || 'Implementation proposal completed.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Implementation proposal failed.')
    } finally {
      setProposingRunId('')
    }
  }

  async function handleExecutePatch(row: AgentRunRow) {
    setPatchingRunId(row.run_id)
    setRunsStatus(`Creating controlled patch execution from ${row.run_id}...`)
    try {
      const payload = await executeAgentPatch({
        run_id: row.run_id,
        notes: 'Created from Agent Workbench UI to convert implementation proposal into bounded patch intents, QA proof, rollback, and release tasks.',
      })
      const nextRow = payload.row
      if (nextRow) {
        setPatchRuns((current) => [nextRow, ...current.filter((item) => item.run_id !== nextRow.run_id)].slice(0, 5))
      }
      const execution = asRecord(payload.patch_execution)
      const executionId = asText(execution.execution_id)
      setRunsStatus(executionId ? `Created patch execution ${executionId}. Patch, QA, proof, release, and learning tasks are queued.` : payload.next_step || 'Patch execution created.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Patch execution failed.')
    } finally {
      setPatchingRunId('')
    }
  }

  async function handleRunBuildMachine() {
    setRunningBuildMachine(true)
    setRunsStatus('Planning the Build Machine gate...')
    try {
      const payload = await runBuildMachineGate({
        source_run_id: latestPatchRun?.run_id ?? '',
        command_ids: buildMachine?.default_command_ids ?? [],
        mode: 'plan',
        dry_run: true,
        create_tasks: true,
        notes: 'UI requested safe Build Machine gate: plan allowed checks, create proof tasks, keep release gated.',
      })
      if (payload.control) {
        setBuildMachine(payload.control)
      } else {
        setBuildMachine(await getBuildMachineControl())
      }
      const machine = asRecord(payload.build_machine)
      const machineRunId = asText(machine.run_id)
      setRunsStatus(machineRunId ? `Build Machine gate ${machineRunId} planned. Review proof tasks before release.` : payload.next_step || 'Build Machine gate planned.')
    } catch (error) {
      setRunsStatus(error instanceof Error ? error.message : 'Build Machine gate failed.')
    } finally {
      setRunningBuildMachine(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Build Review"
        title="Build client software with one controlled delivery loop."
        description="Clients see useful modules. Operators capture the workflow, plan one screen, run prepared checks, verify evidence, and keep every risky action behind approval."
      />

      <section className="rounded-[2rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.52)] backdrop-blur md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Automation policy</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-5xl">One delivery system, not a pile of frameworks.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Use deterministic software for predictable work. Use prepared checks only where messy files, synthesis, coding, or review creates real leverage.
            </p>
          </div>
          <div className="grid min-w-[14rem] grid-cols-3 gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-center">
            <div>
              <p className="text-2xl font-black text-slate-950">{AGENT_WORKBENCH_OPERATING_LOOP.length}</p>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-500">steps</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-950">{AGENT_WORKBENCH_STACK_DECISIONS.length}</p>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-500">lanes</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-950">{AGENT_WORKBENCH_AUTONOMY_LADDER.length}</p>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-500">gates</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {AGENT_WORKBENCH_OPERATING_LOOP.map((step, index) => (
            <article className="rounded-3xl border border-slate-200 bg-white p-4" key={step.id}>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">{index + 1}</span>
              <h3 className="mt-4 text-lg font-black text-slate-950">{step.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.output}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-teal-700">{clientSafeText(step.defaultAgent)}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Framework map</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">What we integrate, and where it belongs.</h3>
              </div>
              <Link className="sm-button-secondary !px-4 !py-2 text-xs" to="/app/meta-ops">
                Open Meta Ops
              </Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {AGENT_WORKBENCH_STACK_DECISIONS.slice(0, 10).map((item) => (
                <article className="rounded-3xl border border-slate-200 bg-white p-4" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-950">{item.name}</h4>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-600">{item.lane}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{clientSafeText(item.supermegaIntegration)}</p>
                  <a className="mt-3 inline-flex text-sm font-bold text-teal-700" href={item.sourceUrl} rel="noreferrer" target="_blank">
                    {clientSafeText(item.sourceLabel)}
                  </a>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Autonomy ladder</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Automation earns permissions.</h3>
            <div className="mt-4 space-y-3">
              {AGENT_WORKBENCH_AUTONOMY_LADDER.map((level) => (
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3" key={level.id}>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{level.level}</span>
                    <strong className="text-sm text-slate-950">{level.name}</strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{level.unlockCondition}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Executable workflow</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Run the next useful step.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--sm-muted)]">
              Every run is stored with evidence, creates a review task, and updates the workspace learning snapshot. No external write happens from this screen.
            </p>
          </div>
          <span className="sm-chip text-white">{runsStatus}</span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr,1fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Active packet</p>
            <h3 className="mt-2 text-lg font-semibold text-white">{activeProject?.firstProduct ?? 'No packet selected'}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{activeProject?.client}</p>
            <p className="mt-3 text-sm leading-6 text-white">{activeProject?.valuePromise}</p>
            <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Recommended loop</p>
              <p className="mt-2 text-sm font-semibold text-white">{recommendedCommand?.label ?? 'Intake to manifest'}</p>
              <p className="mt-1 font-mono text-xs text-cyan-50/75">{recommendedCommand?.command ?? '/supermega-intake-to-manifest'}</p>
              <button className="mt-4 sm-button-primary !px-4 !py-2 text-xs" disabled={runningFullLoop || !activeProject} onClick={() => void handleRunFullLoop()} type="button">
                {runningFullLoop ? 'Running full build loop...' : 'Run full build loop'}
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Latest command evidence</p>
              <Link className="text-sm font-semibold text-[var(--sm-accent)]" to="/app/queue">
                Open queue
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {agentRuns.slice(0, 3).map((row) => {
                const artifact = runArtifact(row)
                return (
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4" key={row.run_id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-mono text-xs text-white">{asText(artifact.artifact_id) || row.run_id}</p>
                      <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                        {row.status || 'ready'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{row.summary || asText(artifact.artifact_type) || 'Command run recorded.'}</p>
                    <button
                      className="mt-4 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={promotingRunId === row.run_id || !asText(artifact.artifact_id)}
                      onClick={() => handlePromoteRun(row)}
                      type="button"
                    >
                      {promotingRunId === row.run_id ? 'Promoting...' : 'Promote to builder'}
                    </button>
                  </article>
                )
              })}
              {!agentRuns.length ? <p className="text-sm leading-6 text-[var(--sm-muted)]">Run a command below to create the first artifact and review task.</p> : null}
            </div>
          </div>
        </div>
        {latestPipeline.length ? (
          <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Delivery loop</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Manifest to build to QA to approval.</h3>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                {latestReadinessScore || 0}/100 {asText(latestReadiness.status) || 'scored'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-5">
              {latestPipeline.map((stage) => (
                <article className="rounded-2xl border border-white/10 bg-white/5 p-4" key={asText(stage.stage) || asText(stage.label)}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{asText(stage.status) || 'queued'}</p>
                  <h4 className="mt-2 text-sm font-semibold text-white">{clientSafeText(stage.label, 'Review stage')}</h4>
                  <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">{asText(stage.owner)}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {latestBuilderRun ? (
          <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/70">Builder execution packet</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{asText(latestBuilderPacket.packet_id) || latestBuilderRun.run_id}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/75">
                  {latestBuilderRun.summary || 'Scoped files, QA commands, release gate, and client handoff are ready.'}
                </p>
              </div>
              <span className="rounded-full border border-cyan-200/30 bg-cyan-100/10 px-4 py-2 text-sm font-semibold text-cyan-50">
                {asText(latestBuilderPacket.status) || latestBuilderRun.status}
              </span>
            </div>
            <button
              className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={proposingRunId === latestBuilderRun.run_id || !asText(latestBuilderPacket.packet_id)}
              onClick={() => handleProposeImplementation(latestBuilderRun)}
              type="button"
            >
              {proposingRunId === latestBuilderRun.run_id ? 'Creating proposal...' : 'Create implementation proposal'}
            </button>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">Route</p>
                <p className="mt-2 font-mono text-sm text-white">{asText(latestBuilderPacket.route) || '/app/agent-workbench'}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">Scoped files</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestBuilderTargetFiles.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">QA checks</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestBuilderQaCommands.length}</p>
              </article>
            </div>
          </div>
        ) : null}
        {latestImplementationRun ? (
          <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">Implementation proposal</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{asText(latestImplementationProposal.proposal_id) || latestImplementationRun.run_id}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">
                  {clientSafeText(latestImplementationRun.summary, 'The system translated the build packet into patch scope, acceptance checks, proof requirements, and learning updates.')}
                </p>
              </div>
              <span className="rounded-full border border-emerald-200/30 bg-emerald-100/10 px-4 py-2 text-sm font-semibold text-emerald-50">
                {asText(latestImplementationProposal.status) || latestImplementationRun.status}
              </span>
            </div>
            <button
              className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={patchingRunId === latestImplementationRun.run_id || !asText(latestImplementationProposal.proposal_id)}
              onClick={() => handleExecutePatch(latestImplementationRun)}
              type="button"
            >
              {patchingRunId === latestImplementationRun.run_id ? 'Creating patch...' : 'Create patch execution'}
            </button>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Route family</p>
                <p className="mt-2 text-sm font-semibold text-white">{asText(latestImplementationProposal.route_family) || 'agent-workbench'}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Change plan</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestImplementationChangePlan.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Acceptance</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestImplementationAcceptance.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Source packet</p>
                <p className="mt-2 font-mono text-xs text-white">{asText(latestImplementationProposal.source_packet_id) || 'pending'}</p>
              </article>
            </div>
          </div>
        ) : null}
        {latestPatchRun ? (
          <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-100/70">Controlled patch execution</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{asText(latestPatchExecution.execution_id) || latestPatchRun.run_id}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/75">
                  {clientSafeText(latestPatchRun.summary, 'The system created bounded patch intents with QA proof, rollback policy, release gate, and learning tasks.')}
                </p>
              </div>
              <span className="rounded-full border border-amber-200/30 bg-amber-100/10 px-4 py-2 text-sm font-semibold text-amber-50">
                {asText(latestPatchExecution.status) || latestPatchRun.status}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-100/70">Patch intents</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestPatchIntents.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-100/70">Allowed files</p>
                <p className="mt-2 text-2xl font-semibold text-white">{latestPatchTargetFiles.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-100/70">Route</p>
                <p className="mt-2 font-mono text-sm text-white">{asText(latestPatchExecution.route) || '/app/agent-workbench'}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-100/70">Human gate</p>
                <p className="mt-2 text-sm font-semibold text-white">{asText(asRecord(latestPatchExecution.autonomy_contract).human_gate) || 'Founder'}</p>
              </article>
            </div>
          </div>
        ) : null}
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Build Machine</p>
              <h3 className="mt-2 text-lg font-semibold text-white">QA gate before release.</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sm-muted)]">
                This turns an approved patch packet into named checks, proof tasks, and a release blocker. It does not deploy or contact a client by itself.
              </p>
            </div>
            <button
              className="sm-button-primary !px-4 !py-2 text-xs"
              disabled={runningBuildMachine}
              onClick={() => void handleRunBuildMachine()}
              type="button"
            >
              {runningBuildMachine ? 'Planning gate...' : 'Plan QA gate'}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Mode</p>
              <p className="mt-2 text-sm font-semibold text-white">{buildMachine?.operator?.execution_enabled ? 'Execution enabled' : 'Safe planning'}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Allowed checks</p>
              <p className="mt-2 text-2xl font-semibold text-white">{buildMachineCommands.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Open gate tasks</p>
              <p className="mt-2 text-2xl font-semibold text-white">{buildMachine?.tasks?.count ?? 0}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Latest gate</p>
              <p className="mt-2 font-mono text-xs text-white">{asText(latestBuildMachine.run_id) || 'not run'}</p>
            </article>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {(latestBuildMachineCommands.length ? latestBuildMachineCommands : buildMachineCommands.slice(0, 3).map((command) => command as unknown as Record<string, unknown>)).map((command) => (
              <article className="rounded-2xl border border-white/10 bg-black/20 p-4" key={asText(command.id) || asText(command.label)}>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-white">{asText(command.label) || asText(command.id)}</h4>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-[var(--sm-muted)]">
                    {asText(command.status) || asText(command.kind) || 'qa'}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[0.7rem] leading-5 text-[var(--sm-muted)]">{asText(command.command) || 'allowlisted command'}</p>
                {asText(command.error) ? <p className="mt-2 text-xs leading-5 text-rose-100">{asText(command.error)}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Project factory</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-semibold text-white lg:text-5xl">The project is the source of truth, not the chat.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sm-muted)]">
              Clients send rough workflow input. SuperMega converts it into a project packet, assigns review roles, creates task definitions of done, and keeps every external consequence behind human approval.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/revenue/pipeline">
                Open lead pipeline
              </Link>
              <Link className="sm-button-secondary" to="/app/factory">
                Build Studio
              </Link>
              <Link className="sm-button-secondary" to="/app/cloud">
                Cloud release
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/offers">
                Offer system
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Projects', AGENT_WORKBENCH_PROJECTS.length, 'client packets'],
              ['Review roles', AGENT_WORKBENCH_ROLES.length, 'scoped workers'],
              ['Tasks', AGENT_WORKBENCH_TASKS.length, 'assigned units'],
              ['In review', taskCounts.review ?? 0, 'needs approval'],
              ['Blocked', taskCounts.blocked ?? 0, 'needs input'],
              ['Cloud lanes', CLOUD_RUNTIME_LANES.length, 'runtime paths'],
            ].map(([label, value, detail]) => (
              <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={String(label)}>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{label}</p>
                <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {AGENT_WORKBENCH_PRINCIPLES.map((principle, index) => (
          <article className="sm-surface p-5" key={principle}>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Rule {index + 1}</p>
            <p className="mt-3 text-sm leading-6 text-white">{principle}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.04fr,0.96fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Work Rules</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Automation is packaged as rules, not vague chat work.</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--sm-muted)]">
            {clientSafeText(SUPERMEGA_AGENT_REFERENCE_PATTERN.source)}. The SuperMega version uses reader, orchestrator, critic, and resolver lanes with source scope, tool policy, and human review.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {SUPERMEGA_AGENT_REFERENCE_PATTERN.layers.slice(0, 4).map((layer, index) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white" key={layer}>
                <span className="mb-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs text-[var(--sm-muted)]">Layer {index + 1}</span>
                <p>{clientSafeText(layer)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Reusable commands</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">One command becomes a repeatable module build.</h2>
          <div className="mt-5 space-y-3">
            {AGENT_COMMAND_LIBRARY.slice(0, 5).map((command) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={command.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-white">{command.command}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{command.label}</p>
                  </div>
                  <button className="sm-button-secondary !px-4 !py-2 text-xs" disabled={runningCommandId === command.id} onClick={() => void handleRunCommand(command)} type="button">
                    {runningCommandId === command.id ? 'Running' : 'Run'}
                  </button>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{command.output}</p>
                <p className="mt-2 text-xs text-amber-100">Gate: {command.reviewPolicy}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Managed review lanes</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Each workspace type gets an explicit team and artifact.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/client-build">
            Build client pack
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {AGENT_TEMPLATE_LIBRARY.slice(0, 6).map((team) => (
            <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={team.id}>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{team.industryKits.join(' / ')}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{clientSafeText(team.name)}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{clientSafeText(team.mission)}</p>
              <p className="mt-3 text-sm text-[var(--sm-accent)]">Artifact: {team.outputArtifact}</p>
              <p className="mt-2 text-sm text-white">Handoff: {clientSafeText(team.handoff)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr,1.08fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Client project packets</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Pick the live client context.</h2>
            </div>
            <span className="sm-chip text-white">{AGENT_WORKBENCH_PROJECTS.length} packets</span>
          </div>
          <div className="mt-5 space-y-3">
            {AGENT_WORKBENCH_PROJECTS.map((project) => (
              <button
                className={`w-full rounded-3xl border p-5 text-left transition ${
                  project.id === activeProject?.id ? 'border-[var(--sm-accent)] bg-[var(--sm-accent)]/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
                key={project.id}
                onClick={() => setActiveProjectId(project.id)}
                type="button"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{project.situation}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{project.client}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{project.valuePromise}</p>
              </button>
            ))}
          </div>
        </article>

        {activeProject ? (
          <article className="sm-surface-deep p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Active packet</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{activeProject.firstProduct}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--sm-muted)]">{activeProject.operatorPrompt}</p>
              </div>
              <Link className="sm-button-secondary" to={activeProject.previewRoute}>
                Open first screen
              </Link>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">First screen</p>
                <p className="mt-3 text-sm leading-6 text-white">{activeProject.firstScreen}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Approval owner</p>
                <p className="mt-3 text-sm leading-6 text-white">{activeProject.approvalOwner}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Source inputs</p>
                <p className="mt-3 text-sm leading-6 text-white">{activeProject.sourceInputs.join(', ')}</p>
              </div>
            </div>
          </article>
        ) : null}
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Task board</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Prepared work is scoped, inspectable, and approval-gated.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/process">
            Process control
          </Link>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-5">
          {activeTasks.map((task) => {
            const role = roleById.get(task.agentId)
            return (
              <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={task.id}>
                <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[task.status]}`}>{statusLabel(task.status)}</div>
                <h3 className="mt-4 text-lg font-semibold text-white">{task.title}</h3>
                <p className="mt-2 text-sm text-[var(--sm-accent)]">{clientSafeText(role?.name ?? task.agentId)}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{task.outputArtifact}</p>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Done when</p>
                  <ul className="mt-2 space-y-2 text-sm text-white">
                    {task.definitionOfDone.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <p className="mt-4 text-sm text-amber-100">{task.approvalGate}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr,0.92fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Cloud runtime lanes</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Where autonomous work runs after approval.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/cloud">
              Open cloud
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {CLOUD_RUNTIME_LANES.map((lane) => (
              <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={lane.id}>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{lane.trigger}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{lane.name}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{lane.cloudWorker}</p>
                <p className="mt-3 text-sm text-white">Surface: {lane.commandSurface}</p>
                <p className="mt-2 text-sm text-white">Evidence: {lane.evidence}</p>
                <p className="mt-2 text-sm text-amber-100">Gate: {lane.humanGate}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Review team</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">A full team, but every role is bounded.</h2>
          <div className="mt-5 space-y-4">
            {AGENT_WORKBENCH_ROLES.map((role) => (
              <details className="rounded-3xl border border-white/10 bg-white/5 p-5" key={role.id}>
                <summary className="cursor-pointer font-semibold text-white">{clientSafeText(role.name)}</summary>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{clientSafeText(role.mission)}</p>
                <p className="mt-3 text-sm text-white">Owns: {role.owns.join(', ')}</p>
                <p className="mt-2 text-sm text-emerald-100">Allowed: {role.allowedActions.join(', ')}</p>
                <p className="mt-2 text-sm text-rose-100">Blocked: {role.blockedActions.join(', ')}</p>
              </details>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Approval gates</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">The founder prompt remains the control layer.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/approvals">
            Approval queue
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {AGENT_WORKBENCH_GATES.map((gate) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={gate.id}>
              <h3 className="text-lg font-semibold text-white">{gate.name}</h3>
              <p className="mt-3 text-sm text-rose-100">Blocks: {gate.blocks}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Evidence: {gate.requiredEvidence.join(', ')}</p>
              <p className="mt-3 text-sm text-emerald-100">Unlocks: {gate.unlocks}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
