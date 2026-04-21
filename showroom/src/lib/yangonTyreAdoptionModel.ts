export type YangonTyreAdoptionPrinciple = {
  title: string
  detail: string
}

export type YangonTyreRolePlaybook = {
  id: string
  role: string
  home: string
  route: string
  frequency: string
  mustCapture: string[]
  usefulOutputs: string[]
  managerCadence: string
  changeMoves: string[]
}

export type YangonTyreInsightCadence = {
  id: string
  title: string
  owner: string
  cadence: string
  inputs: string[]
  outputs: string[]
  why: string
}

export type YangonTyreRolloutWave = {
  id: string
  title: string
  outcome: string
  moves: string[]
}

export type YangonTyreAdoptionMetric = {
  name: string
  target: string
  why: string
}

export const YANGON_TYRE_ADOPTION_DIALECTIC = {
  thesis:
    'The portal only becomes real when every role sees it as the shortest path to enter work, review it, and act on the next decision.',
  antithesis:
    'If managers still review from chat, side spreadsheets, or memory, staff will treat data entry as extra reporting instead of part of the operating job.',
  synthesis:
    'Adoption Command scores role usage, writeback quality, review rituals, and agent reinforcement so the Yangon Tyre platform becomes the actual operating system.',
} as const

export const YANGON_TYRE_ADOPTION_PRINCIPLES: YangonTyreAdoptionPrinciple[] = [
  {
    title: 'Capture at the source',
    detail: 'Operators and staff should enter the issue when it happens in receiving, DQMS, maintenance, sales, or approvals instead of rebuilding the story later in chat or spreadsheets.',
  },
  {
    title: 'Keep one record per issue',
    detail: 'Every GRN problem, batch deviation, breakdown, supplier gap, or dealer follow-up should live on one portal record with the owner, due date, and evidence attached.',
  },
  {
    title: 'Make entry useful immediately',
    detail: 'A good entry should create a queue item, escalation, insight, or briefing output the same day so staff see value and not just extra reporting work.',
  },
  {
    title: 'Managers must review inside the portal',
    detail: 'If supervisors continue to run the real review in chat groups or oral meetings, staff will treat the portal as optional. The management ritual has to happen here.',
  },
  {
    title: 'Start with short forms',
    detail: 'Do not force full ERP-style typing on day one. Make the first version minimal and mandatory, then expand only after the team is using it every shift and every day.',
  },
]

export const YANGON_TYRE_ROLE_PLAYBOOKS: YangonTyreRolePlaybook[] = [
  {
    id: 'receiving',
    role: 'Receiving clerk',
    home: 'Receiving Control',
    route: '/app/receiving',
    frequency: 'Every receipt, hold, mismatch, or missing document',
    mustCapture: ['GRN or batch', 'variance or hold reason', 'supplier note', 'photo or document link', 'owner and next action'],
    usefulOutputs: ['supplier chase queue', 'inventory variance view', 'release or hold signal'],
    managerCadence: 'Plant manager reviews open receiving records before shift close and at the next morning review.',
    changeMoves: ['Replace free-text Viber updates with one receiving record', 'Do not allow unlabeled material issues to stay in chat only'],
  },
  {
    id: 'plant',
    role: 'Plant manager',
    home: 'Operations Control',
    route: '/app/operations',
    frequency: 'Each shift handoff, major blocker, and cross-team escalation',
    mustCapture: ['issue summary', 'line or stage', 'owner', 'due date', 'countermeasure note'],
    usefulOutputs: ['shift priority queue', 'repeat blocker watch', 'daily plant review brief'],
    managerCadence: 'Run the shift review from the operations desk and close the meeting by updating owners and due dates live.',
    changeMoves: ['No separate whiteboard or side spreadsheet for blocker tracking', 'Use portal tasks as the official source for shift carryover'],
  },
  {
    id: 'quality',
    role: 'Quality manager',
    home: 'DQMS and Quality Lab',
    route: '/app/dqms',
    frequency: 'Every incident, containment action, CAPA, and major defect cluster',
    mustCapture: ['incident summary', 'batch or lot', 'containment', '5W1H or fishbone path', 'CAPA owner', 'closeout evidence'],
    usefulOutputs: ['defect pareto', 'B+R trend review', 'batch containment history', 'root-cause learning'],
    managerCadence: 'Quality review uses the DQMS incident list and CAPA ageing as the live agenda.',
    changeMoves: ['Do not close incidents without evidence', 'Publish major root causes back into the knowledge vault'],
  },
  {
    id: 'maintenance',
    role: 'Maintenance lead',
    home: 'Maintenance and Reliability',
    route: '/app/maintenance',
    frequency: 'Every breakdown, PM exception, and repeat failure',
    mustCapture: ['asset or machine', 'downtime minutes', 'problem summary', 'next maintenance action', 'spare-part blocker'],
    usefulOutputs: ['downtime heatmap', 'repeat failure ranking', 'spare-part risk view'],
    managerCadence: 'Review yesterday downtime and repeat-failure items in the maintenance desk before starting the next workday.',
    changeMoves: ['Make downtime entry mandatory before job close', 'Flag repeat failures across shifts instead of treating them as isolated events'],
  },
  {
    id: 'procurement',
    role: 'Procurement lead',
    home: 'Supplier and Approval Control',
    route: '/app/approvals',
    frequency: 'Every supplier discrepancy, missing evidence case, or delayed response',
    mustCapture: ['supplier', 'shipment or PO', 'missing evidence', 'financial or production impact', 'required reply'],
    usefulOutputs: ['aged supplier debt', 'approval queue', 'plant-blocking supplier exposure'],
    managerCadence: 'Procurement uses the approvals queue as the official recovery list in the supplier follow-up meeting.',
    changeMoves: ['Stop forwarding long email chains without record ownership', 'Every major discrepancy must tie back to a shipment, PO, or GRN'],
  },
  {
    id: 'sales',
    role: 'Sales lead',
    home: 'Sales and Dealer Control',
    route: '/app/revenue',
    frequency: 'Every dealer visit, quote follow-up, or commercial risk change',
    mustCapture: ['account stage', 'visit note', 'quote or follow-up status', 'credit risk note', 'next action'],
    usefulOutputs: ['dealer pipeline', 'visit plan follow-through', 'director revenue brief'],
    managerCadence: 'Weekly commercial meeting should open the sales desk first, not a separate slide deck.',
    changeMoves: ['Require next action on every customer contact', 'Link Gmail and visit notes back to the account record'],
  },
  {
    id: 'director',
    role: 'CEO / director',
    home: 'CEO Command Center',
    route: '/app/director',
    frequency: 'Daily review and every major cross-functional decision',
    mustCapture: ['decision note', 'priority shift', 'owner', 'due date', 'linked source record'],
    usefulOutputs: ['daily brief', 'decision memory', 'cross-module priority reset'],
    managerCadence: 'Leadership review should finish with live decisions entered in the command center.',
    changeMoves: ['Do not leave key management instructions in voice notes only', 'Use the portal as the official review surface for daily risk'],
  },
  {
    id: 'admin',
    role: 'Tenant admin',
    home: 'Admin and Connector Control',
    route: '/app/platform-admin',
    frequency: 'Daily connector review and weekly role or rollout review',
    mustCapture: ['connector issues', 'access changes', 'module gaps', 'rollout blockers', 'training needs'],
    usefulOutputs: ['adoption scorecard', 'connector freshness view', 'rollout gap list'],
    managerCadence: 'Admin reviews stale connectors, stale queues, and low-usage surfaces every week with management.',
    changeMoves: ['Measure usage by role, not only system uptime', 'Push fixes into the hardest-to-use screen first'],
  },
]

export const YANGON_TYRE_INSIGHT_CADENCES: YangonTyreInsightCadence[] = [
  {
    id: 'shift-review',
    title: 'Shift review loop',
    owner: 'Plant manager',
    cadence: 'Every shift',
    inputs: ['operations queue', 'receiving holds', 'breakdowns', 'quality exceptions'],
    outputs: ['next-shift priorities', 'carryover list', 'escalation tags'],
    why: 'The portal becomes useful when the shift handoff depends on the data entered during the shift.',
  },
  {
    id: 'daily-brief',
    title: 'Daily director brief',
    owner: 'Director + tenant admin',
    cadence: 'Daily',
    inputs: ['approvals', 'exceptions', 'quality debt', 'sales follow-up', 'connector posture'],
    outputs: ['leadership brief', 'priority resets', 'decision tasks'],
    why: 'Management should consume the same system staff are asked to update.',
  },
  {
    id: 'quality-board',
    title: 'Weekly quality and B+R review',
    owner: 'Quality manager',
    cadence: 'Weekly',
    inputs: ['incident register', 'CAPA age', 'defect clusters', 'batch or process links'],
    outputs: ['defect pareto', 'CAPA escalation', 'root-cause focus list'],
    why: 'Quality entry becomes trusted when staff see it used in weekly technical review.',
  },
  {
    id: 'supplier-review',
    title: 'Weekly supplier recovery review',
    owner: 'Procurement lead',
    cadence: 'Weekly',
    inputs: ['missing documents', 'open discrepancies', 'slow replies', 'approval debt'],
    outputs: ['recovery queue', 'supplier escalations', 'financial exposure flags'],
    why: 'Procurement work stops disappearing in email threads when the meeting runs from the queue.',
  },
  {
    id: 'monthly-intelligence',
    title: 'Monthly operating intelligence cycle',
    owner: 'Director + plant manager + admin',
    cadence: 'Monthly',
    inputs: ['cleaned metrics', 'B+R trend', 'downtime trend', 'sales movement', 'supplier ageing'],
    outputs: ['gap analysis pack', 'focus project list', 'module roadmap reset'],
    why: 'This is the bridge from raw entry discipline to AI-native insights and planning.',
  },
]

export const YANGON_TYRE_ROLLOUT_WAVES: YangonTyreRolloutWave[] = [
  {
    id: 'wave-1',
    title: 'Wave 1: Mandatory operating capture',
    outcome: 'Receiving, operations, DQMS, and maintenance become the official place to log work.',
    moves: ['Short mandatory forms only', 'Supervisor review in the portal', 'No off-system issue closeout'],
  },
  {
    id: 'wave-2',
    title: 'Wave 2: Manager review and scorecards',
    outcome: 'Daily and weekly meetings pull from portal queues, ageing, and KPI views.',
    moves: ['Publish adoption scorecards', 'Track stale records by owner', 'Review open items by cadence'],
  },
  {
    id: 'wave-3',
    title: 'Wave 3: Insight and agent assist',
    outcome: 'Clean data powers briefs, anomaly alerts, traceability, and AI-assisted follow-up.',
    moves: ['Turn connectors on for Gmail, Drive, ERP, and shopfloor logs', 'Deploy insight loops', 'Add bounded agent drafting and watch functions'],
  },
]

export const YANGON_TYRE_ADOPTION_METRICS: YangonTyreAdoptionMetric[] = [
  {
    name: 'Entry completeness',
    target: '95%+ of required records have owner, due date, and evidence link',
    why: 'Without complete records, the queue is not reliable enough for management use.',
  },
  {
    name: 'Same-day review rate',
    target: '90%+ of high-severity items reviewed the same day',
    why: 'Fast review proves the portal matters operationally.',
  },
  {
    name: 'Aged open items',
    target: 'Less than 5% of critical items older than agreed SLA',
    why: 'This shows whether entry is turning into action rather than backlog.',
  },
  {
    name: 'Insight freshness',
    target: 'Daily leadership brief and weekly quality review generated from current data',
    why: 'The system only becomes strategic once the data produces live insight outputs.',
  },
  {
    name: 'Duplicate reporting reduction',
    target: 'Eliminate parallel chat-only and spreadsheet-only issue tracking for core workflows',
    why: 'The portal must replace duplicate systems, not become a fourth place to update.',
  },
]
