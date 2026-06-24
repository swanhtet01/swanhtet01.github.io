export type YtfWcmPillarId =
  | 'safety'
  | 'cost_deployment'
  | 'focused_improvement'
  | 'workplace_organization'
  | 'professional_maintenance'
  | 'quality_control'
  | 'logistics_customer'
  | 'early_equipment'
  | 'people_development'
  | 'environment_energy'

export type YtfWcmPillar = {
  id: YtfWcmPillarId
  label: string
  shortLabel: string
  focus: string
  action: string
  keywords: RegExp[]
}

const DEFAULT_WCM_ID: YtfWcmPillarId = 'focused_improvement'

export const YTF_WCM_PILLARS: YtfWcmPillar[] = [
  {
    id: 'safety',
    label: 'Safety',
    shortLabel: 'Safety',
    focus: 'Unsafe condition, injury risk, fire, forklift, PPE, or emergency control.',
    action: 'Remove the unsafe condition, record evidence, and prevent repeat.',
    keywords: [/safety|unsafe|injur|accident|ppe|forklift|fire|emergency|near miss/],
  },
  {
    id: 'cost_deployment',
    label: 'Cost Deployment',
    shortLabel: 'Cost',
    focus: 'Loss, waste, overtime, cost variance, scrap value, payment, or expense.',
    action: 'Turn the loss into one owner, cause, and reduction target.',
    keywords: [/cost|loss|waste|scrap|variance|overtime|\bot\b|amount|expense|price|payment|mmk/],
  },
  {
    id: 'focused_improvement',
    label: 'Focused Improvement',
    shortLabel: 'Improvement',
    focus: 'Output, OEE, yield, downtime, plan gap, daily routine, or abnormal condition.',
    action: 'Compare plan versus actual and pick one improvement.',
    keywords: [/output|production|oee|yield|efficiency|line|routine|5w1h|abnormal|normal|plan|wip|reject/],
  },
  {
    id: 'workplace_organization',
    label: 'Autonomous Maintenance / 5S',
    shortLabel: '5S',
    focus: 'Sort, set, shine, standard, sustain, visible condition, or workplace discipline.',
    action: 'Fix the visible standard and take evidence.',
    keywords: [/5s|sort|shine|clean|label|standard|workplace|red tag|tool|floor|routine check/],
  },
  {
    id: 'professional_maintenance',
    label: 'Professional Maintenance',
    shortLabel: 'Maintenance',
    focus: 'Machine, utility, breakdown, repair, spare part, PM, mold, or repeated downtime.',
    action: 'Log asset, downtime, cause, and next preventive action.',
    keywords: [/maintenance|machine|press|breakdown|repair|utility|spare|pm\b|mold|mould|boiler|compressor|downtime/],
  },
  {
    id: 'quality_control',
    label: 'Quality Control',
    shortLabel: 'Quality',
    focus: 'Claim, defect, hold, CAPA, QC, inspection, release, nonconformity, or customer issue.',
    action: 'Contain, define cause, and standardize prevention.',
    keywords: [/quality|qc\b|claim|defect|hold|capa|inspection|release|nonconform|reject|customer complaint/],
  },
  {
    id: 'logistics_customer',
    label: 'Logistics and Customer Service',
    shortLabel: 'Logistics',
    focus: 'Stock, warehouse, sales balance, supplier, receiving, GRN, dealer, or delivery movement.',
    action: 'Confirm quantity, location, owner, and next movement.',
    keywords: [/stock|inventory|sales|dealer|customer|dispatch|delivery|warehouse|receiving|supplier|grn|coa|showroom|purchase/],
  },
  {
    id: 'early_equipment',
    label: 'Early Equipment Management',
    shortLabel: 'Equipment',
    focus: 'New machine, project, layout, installation, commissioning, or handover readiness.',
    action: 'Capture requirement, risk, and handover standard.',
    keywords: [/new machine|installation|commission|layout|project|equipment|startup|handover/],
  },
  {
    id: 'people_development',
    label: 'People Development',
    shortLabel: 'People',
    focus: 'Training, attendance, skill gap, manager coaching, HR, or operator capability.',
    action: 'Assign one skill gap and confirm learning evidence.',
    keywords: [/training|skill|competence|hr\b|attendance|operator|manager|coaching|people|employee/],
  },
  {
    id: 'environment_energy',
    label: 'Environment and Energy',
    shortLabel: 'Energy',
    focus: 'Energy, steam, water, air, fuel, environment, wastewater, emission, or utility usage.',
    action: 'Measure usage or abnormality and assign containment.',
    keywords: [/energy|electric|steam|water|air|emission|wastewater|environment|power|fuel|utility usage/],
  },
]

function textOf(...parts: unknown[]): string {
  return parts
    .flatMap((part) => {
      if (Array.isArray(part)) return part
      if (part && typeof part === 'object') return Object.values(part as Record<string, unknown>)
      return [part]
    })
    .map((part) => String(part ?? '').toLowerCase())
    .join(' ')
}

export function inferYtfWcmPillar(...parts: unknown[]): YtfWcmPillar {
  const text = textOf(...parts)
  const ranked = YTF_WCM_PILLARS.map((pillar) => ({
    pillar,
    score: pillar.keywords.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score)
  return ranked.find((item) => item.score > 0)?.pillar ?? YTF_WCM_PILLARS.find((pillar) => pillar.id === DEFAULT_WCM_ID)!
}

export function ytfWcmMetricLens(...parts: unknown[]) {
  const pillar = inferYtfWcmPillar(...parts)
  return {
    pillar,
    label: pillar.shortLabel,
    action: pillar.action,
  }
}

export function ytfWcmTaskLens(...parts: unknown[]) {
  return ytfWcmMetricLens(...parts)
}

export function ytfWcmEntryLens(mode: string, section: string) {
  if (mode === 'five_s_check') return ytfWcmMetricLens('5S workplace organization', section)
  if (mode === 'quality_incident') return ytfWcmMetricLens('quality defect CAPA QC', section)
  if (mode === 'maintenance_issue') return ytfWcmMetricLens('maintenance breakdown downtime machine', section)
  if (mode === 'receiving_hold') return ytfWcmMetricLens('receiving supplier GRN warehouse', section)
  if (mode === 'whiteboard_snapshot') return ytfWcmMetricLens('whiteboard KPI daily output stock quality', section)
  if (mode === 'training_followup') return ytfWcmMetricLens('training people skill manager', section)
  if (mode === 'normal_abnormal') return ytfWcmMetricLens('normal abnormal focused improvement', section)
  if (mode === 'daily_routine') return ytfWcmMetricLens('daily routine 5W1H focused improvement', section)
  return ytfWcmMetricLens(mode, section)
}
