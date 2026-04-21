export type ManagerReviewRoutine = {
  id: string
  label: string
  timing: string
  goal: string
  steps: string[]
}

export type ManagerMethodCard = {
  id: string
  name: string
  useCase: string
  trigger: string
  output: string
}

export type ManagerTeachingPack = {
  id: string
  audience: string
  title: string
  objective: string
  drills: string[]
}

export const MANAGER_REVIEW_ROUTINES: ManagerReviewRoutine[] = [
  {
    id: 'start-of-shift',
    label: 'Start-of-shift review',
    timing: '10 minutes',
    goal: 'Align the team on today first, not on a long backlog.',
    steps: [
      'Check open blockers in Operations Control.',
      'Confirm receiving holds, approvals, and machine issues that affect the shift.',
      'Assign one owner and one next action for each blocker.',
    ],
  },
  {
    id: 'mid-shift',
    label: 'Mid-shift check',
    timing: '5 minutes',
    goal: 'Catch drift before it becomes downtime or scrap.',
    steps: [
      'Review incident, downtime, and delay signals.',
      'Escalate anything that needs supplier, quality, or maintenance support.',
      'Update the queue instead of passing updates in chat only.',
    ],
  },
  {
    id: 'end-of-day',
    label: 'End-of-day handoff',
    timing: '15 minutes',
    goal: 'Leave a clean handoff with evidence, not verbal memory.',
    steps: [
      'Close completed items and move blocked work into the next owner lane.',
      'Record root cause, containment, and missing evidence for anything still open.',
      'Prepare tomorrow priority list for plant, quality, and maintenance leads.',
    ],
  },
]

export const MANAGER_METHOD_CARDS: ManagerMethodCard[] = [
  {
    id: 'five-w-one-h',
    name: '5W1H',
    useCase: 'Clarify what happened and what the next action should be.',
    trigger: 'Use when the team is confused about scope, owner, or timing.',
    output: 'One precise problem statement and one assigned next move.',
  },
  {
    id: 'ishikawa',
    name: 'Fishbone / Ishikawa',
    useCase: 'Separate likely causes by machine, material, method, man, and measurement.',
    trigger: 'Use when the same defect or delay keeps repeating.',
    output: 'A shortlist of root-cause branches worth testing.',
  },
  {
    id: 'pareto',
    name: 'Pareto',
    useCase: 'Focus the team on the few defects or delays causing most loss.',
    trigger: 'Use when too many issues are open at once.',
    output: 'A ranked list of the top loss drivers.',
  },
  {
    id: 'oee',
    name: 'OEE lens',
    useCase: 'Discuss loss in availability, performance, and quality terms.',
    trigger: 'Use when maintenance and operations need one shared framing.',
    output: 'A clearer view of where production time is being lost.',
  },
  {
    id: 'gap-review',
    name: 'Gap review',
    useCase: 'Compare current condition to target condition with one intervention owner.',
    trigger: 'Use during daily review or weekly management review.',
    output: 'One gap, one owner, one due date, one follow-up check.',
  },
  {
    id: 'standard-work',
    name: 'Standard work',
    useCase: 'Turn repeated manager checks into a routine instead of relying on memory.',
    trigger: 'Use when the same follow-up is missed across shifts.',
    output: 'A stable review routine the next manager can repeat.',
  },
]

export const MANAGER_TEACHING_PACKS: ManagerTeachingPack[] = [
  {
    id: 'plant-team',
    audience: 'Plant managers and line leads',
    title: 'Daily control routine',
    objective: 'Teach managers to run the portal as a shift-control tool, not a reporting burden.',
    drills: [
      'Open Plant Manager and run the start-of-shift review.',
      'Move one live blocker from observation to assigned action.',
      'Record one handoff note before ending the shift.',
    ],
  },
  {
    id: 'quality-team',
    audience: 'Quality managers and QC staff',
    title: 'Structured closeout discipline',
    objective: 'Teach the team to use DQMS methods instead of unstructured notes.',
    drills: [
      'Capture an incident with evidence and target close date.',
      'Use 5W1H to clarify the case before creating CAPA.',
      'Use fishbone only after containment is explicit.',
    ],
  },
  {
    id: 'maintenance-team',
    audience: 'Maintenance leads and supervisors',
    title: 'Downtime and repeat-failure review',
    objective: 'Teach maintenance to connect breakdowns, root cause, and the next preventive move.',
    drills: [
      'Review one downtime item with operations context.',
      'Write the likely repeat-failure cause in plain language.',
      'Assign one preventive action and a verification date.',
    ],
  },
]
