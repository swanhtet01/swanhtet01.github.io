import type { ProductionState } from './production-workspace.ts'

type MachineState = 'running' | 'attention' | 'stopped'

export type MachineStateTransition = {
  from: MachineState
  to: MachineState
  count: number
}

export type MachineTransitionRecord = {
  machineId: string
  transitionCount: number
  stoppedCount: number
}

export type PlantMachineTransitionSummary = {
  totalTransitions: number
  toStoppedCount: number
  toAttentionCount: number
  toRunningCount: number
  byTransition: MachineStateTransition[]
  byMachine: MachineTransitionRecord[]
}

export function projectPlantMachineTransitionSummary(
  production: ProductionState,
): PlantMachineTransitionSummary {
  const transitionMap = new Map<string, number>()
  const machineMap = new Map<string, { transitionCount: number; stoppedCount: number }>()
  let totalTransitions = 0
  let toStoppedCount = 0
  let toAttentionCount = 0
  let toRunningCount = 0

  for (const event of production.events) {
    if (event.kind !== 'machine_state_changed') continue
    const from = event.fromState as MachineState
    const to = event.toState as MachineState
    if (!from || !to) continue

    totalTransitions++
    if (to === 'stopped') toStoppedCount++
    else if (to === 'attention') toAttentionCount++
    else if (to === 'running') toRunningCount++

    const key = `${from}→${to}`
    transitionMap.set(key, (transitionMap.get(key) ?? 0) + 1)

    const machineId = event.subjectId
    const entry = machineMap.get(machineId) ?? { transitionCount: 0, stoppedCount: 0 }
    entry.transitionCount++
    if (to === 'stopped') entry.stoppedCount++
    machineMap.set(machineId, entry)
  }

  const byTransition: MachineStateTransition[] = Array.from(transitionMap.entries())
    .map((entry) => {
      const [pair, count] = entry
      const [from, to] = pair.split('→') as [MachineState, MachineState]
      return { from, to, count }
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

  const byMachine: MachineTransitionRecord[] = Array.from(machineMap.entries())
    .map(([machineId, { transitionCount, stoppedCount }]) => ({ machineId, transitionCount, stoppedCount }))
    .sort((a, b) => b.transitionCount - a.transitionCount || a.machineId.localeCompare(b.machineId))

  return {
    totalTransitions,
    toStoppedCount,
    toAttentionCount,
    toRunningCount,
    byTransition,
    byMachine,
  }
}
