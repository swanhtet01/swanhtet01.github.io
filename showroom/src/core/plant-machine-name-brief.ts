import type { ProductionState } from './production-workspace.ts'

export type PlantMachineNameBrief = {
  totalMachines: number
  uniqueNames: number
  topNamesByCount: Array<{ name: string; count: number }>
}

export function projectPlantMachineNameBrief(production: ProductionState): PlantMachineNameBrief {
  let totalMachines = 0
  const nameMap = new Map<string, number>()
  for (const machine of production.machines) {
    totalMachines++
    nameMap.set(machine.name, (nameMap.get(machine.name) ?? 0) + 1)
  }
  const topNamesByCount = Array.from(nameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)
  return { totalMachines, uniqueNames: nameMap.size, topNamesByCount }
}
