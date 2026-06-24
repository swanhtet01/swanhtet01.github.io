export type PlantManagerSop = {
  id: string
  label: string
  title: string
  goal: string
  trigger: string
  ownerRoles: string[]
  primaryRoute: string
  primaryLabel: string
  cadence: string
  steps: string[]
  evidence: string[]
  hiddenControl: string
  escalation: string
}

export type PlantManagerModule = {
  id: string
  name: string
  route: string
  cadence: string
  whyItMatters: string
  useWhen: string
}

export type PlantManagerCaptureMode = {
  id: string
  name: string
  recommendation: 'Primary' | 'Fallback'
  whenToUse: string
  flow: string[]
  note: string
}

export type PlantOperatingRoleCell = {
  id: string
  title: string
  route: string
  responsibility: string
  startsWith: string
  handsTo: string
  evidence: string[]
}

export type PlantOperatingLoop = {
  id: string
  title: string
  cadence: string
  question: string
  route: string
  steps: string[]
}

export type PlantOperatingArchitectureTile = {
  id: string
  label: string
  title: string
  route: string
  summary: string
  points: string[]
}

export type PlantEnterpriseModule = {
  id: string
  title: string
  route: string
  layer: 'Core' | 'Commercial' | 'Control'
  purpose: string
  sourceInputs: string[]
}

export const PLANT_MANAGER_CORE_SOPS: PlantManagerSop[] = [
  {
    id: 'shift-start',
    label: 'SOP 1',
    title: 'Start-of-shift command review',
    goal: 'Start the shift with the top blockers, the right owner, and no confusion about priorities.',
    trigger: 'At the beginning of every shift.',
    ownerRoles: ['Plant Manager', 'Shift Supervisor', 'Operations Lead'],
    primaryRoute: '/app/plant-manager',
    primaryLabel: 'Plant Manager',
    cadence: 'Every shift',
    steps: [
      'Open Plant Manager and review the current blockers.',
      'Pick the one issue that can damage today’s flow, quality, or shipment.',
      'Assign one owner and decide which desk owns the work next.',
      'If the update is messy, send it through Action Board before opening the desk.',
    ],
    evidence: ['Top blocker selected', 'Named owner', 'Due window', 'Owning desk chosen'],
    hiddenControl: 'Management review logic is happening here without forcing ISO language on the floor.',
    escalation: 'Escalate to Director only if today’s output, safety, or customer release is at risk.',
  },
  {
    id: 'mixed-update-triage',
    label: 'SOP 2',
    title: 'Mixed update triage',
    goal: 'Turn messy notes, chats, and voice updates into a usable action board.',
    trigger: 'Whenever updates arrive in mixed or unclear form.',
    ownerRoles: ['Plant Manager', 'Supervisor', 'Admin Coordinator'],
    primaryRoute: '/app/action-board',
    primaryLabel: 'Action Board',
    cadence: 'As needed, usually several times per day',
    steps: [
      'Paste one issue per line into Action Board.',
      'Review the suggested owner, due window, and next move.',
      'Correct anything unclear before the issue spreads into more meetings or chat.',
      'Open the correct desk only after the owner and timing are clear.',
    ],
    evidence: ['Action lanes populated', 'Owner confirmed', 'Due window visible'],
    hiddenControl: 'This is the invisible assignment and escalation layer that keeps follow-up auditable.',
    escalation: 'Escalate only when the issue cannot be assigned to one team or one shift window.',
  },
  {
    id: 'production-deviation',
    label: 'SOP 3',
    title: 'Production deviation response',
    goal: 'Contain production loss quickly and keep the next move inside the operations desk.',
    trigger: 'Any missed plan, shift drift, stoppage, shortage, or output interruption.',
    ownerRoles: ['Plant Manager', 'Operations Lead', 'Shift Supervisor'],
    primaryRoute: '/app/operations',
    primaryLabel: 'Operations',
    cadence: 'Every live deviation',
    steps: [
      'Open Operations and log the deviation or blocker.',
      'State the current condition in plain language using 5W1H logic.',
      'Assign the next intervention owner and due window.',
      'If another function owns the fix, route it there immediately instead of carrying it verbally.',
    ],
    evidence: ['Current condition', 'Immediate containment', 'Next owner', 'Review time'],
    hiddenControl: 'This is standard-work and gap-control discipline in operating form.',
    escalation: 'Escalate if the deviation threatens daily plan achievement or causes cross-shift carryover.',
  },
  {
    id: 'quality-incident',
    label: 'SOP 4',
    title: 'Quality incident containment',
    goal: 'Stop escape, capture the facts, and move the case into structured DQMS follow-up.',
    trigger: 'Any defect, hold, customer complaint, or release-risk situation.',
    ownerRoles: ['Quality Manager', 'Plant Manager', 'QC Lead'],
    primaryRoute: '/app/dqms',
    primaryLabel: 'DQMS',
    cadence: 'Every incident',
    steps: [
      'Open DQMS and capture the incident immediately.',
      'State the containment decision first: hold, inspect, sort, or release block.',
      'Attach the best evidence available now: photo, batch, machine, shift, or lot.',
      'Decide whether CAPA is required after containment is explicit.',
    ],
    evidence: ['Containment status', 'Evidence attached', 'Batch or lot context', 'Next review'],
    hiddenControl: 'This is NCR, CAPA, and release discipline hidden behind a short quality routine.',
    escalation: 'Escalate to Director if shipment, customer impact, or repeated defect risk exists.',
  },
  {
    id: 'breakdown-response',
    label: 'SOP 5',
    title: 'Breakdown and repeat-failure response',
    goal: 'Restore safely, capture likely cause, and prevent the same failure from repeating.',
    trigger: 'Any breakdown, major stoppage, or repeat equipment issue.',
    ownerRoles: ['Maintenance Lead', 'Plant Manager', 'Operations Lead'],
    primaryRoute: '/app/maintenance',
    primaryLabel: 'Maintenance',
    cadence: 'Every breakdown and every repeat failure',
    steps: [
      'Open Maintenance and log the stop with affected machine and shift.',
      'Record the likely cause in plain language first, not a long technical note.',
      'Assign the repair owner and the preventive follow-up owner separately if needed.',
      'Review whether operations needs a temporary workaround before restart.',
    ],
    evidence: ['Machine', 'Downtime context', 'Likely cause', 'Preventive action', 'Verification date'],
    hiddenControl: 'This is reliability review and root-cause discipline without a paper worksheet.',
    escalation: 'Escalate when the same machine or failure pattern repeats or threatens plan delivery.',
  },
  {
    id: 'receiving-variance',
    label: 'SOP 6',
    title: 'Receiving variance and inbound hold',
    goal: 'Stop bad or unclear inbound material from contaminating production or stock records.',
    trigger: 'Any GRN mismatch, shortage, spec issue, or document gap on inbound material.',
    ownerRoles: ['Receiving Clerk', 'Procurement Lead', 'Plant Manager'],
    primaryRoute: '/app/receiving',
    primaryLabel: 'Receiving',
    cadence: 'Every inbound exception',
    steps: [
      'Open Receiving and log the inbound variance immediately.',
      'State whether the material is usable, blocked, or needs supplier clarification.',
      'Attach the supplier, batch, and quantity facts available now.',
      'Assign the owner for supplier follow-up and the next review time.',
    ],
    evidence: ['Supplier', 'Quantity or document gap', 'Hold decision', 'Follow-up owner'],
    hiddenControl: 'This is supplier-quality and traceability discipline in a short inbound workflow.',
    escalation: 'Escalate when the variance threatens production continuity or customer commitment.',
  },
  {
    id: 'shift-handoff',
    label: 'SOP 7',
    title: 'End-of-shift handoff',
    goal: 'Leave the next shift with facts, not memory.',
    trigger: 'Before the end of every shift.',
    ownerRoles: ['Shift Supervisor', 'Plant Manager', 'Department Lead'],
    primaryRoute: '/app/daily-entry',
    primaryLabel: 'Daily Entry',
    cadence: 'Every shift',
    steps: [
      'Open Daily Entry and record the shift handoff.',
      'State what is still open, what changed, and what must be checked first next shift.',
      'Attach or reference the issue desk if the problem already lives in Operations, DQMS, Maintenance, or Receiving.',
      'End with one next owner, not a vague team instruction.',
    ],
    evidence: ['Open items', 'Next owner', 'First next-shift check', 'Linked desk if needed'],
    hiddenControl: 'This is controlled handoff and continuity without a long written report.',
    escalation: 'Escalate only when the next shift cannot act without management intervention.',
  },
  {
    id: 'daily-review',
    label: 'SOP 8',
    title: 'Daily management review',
    goal: 'Close the day with one decision set for tomorrow rather than scattered unresolved issues.',
    trigger: 'At the end of the day or before the next plan-setting review.',
    ownerRoles: ['Plant Manager', 'Director', 'Quality Manager', 'Maintenance Lead'],
    primaryRoute: '/app/plant-manager',
    primaryLabel: 'Plant Manager',
    cadence: 'Daily',
    steps: [
      'Open Plant Manager and review the open action pattern.',
      'Decide the top repeat loss, the top quality risk, and the top next-day intervention.',
      'If needed, open Data Fabric only for supporting evidence, not as the first screen.',
      'Record the next-day focus so tomorrow begins with one clear management instruction.',
    ],
    evidence: ['Top loss', 'Top risk', 'Next-day focus', 'Named intervention owner'],
    hiddenControl: 'This is management review compressed into a short operational discipline.',
    escalation: 'Escalate to Director when the pattern points to capital, supplier, policy, or structural process change.',
  },
]

export const PLANT_MANAGER_VALUE_MODULES: PlantManagerModule[] = [
  {
    id: 'plant-manager',
    name: 'Plant Manager',
    route: '/app/plant-manager',
    cadence: 'Start and end of day',
    whyItMatters: 'Keeps the day small: review, choose the issue, open one desk.',
    useWhen: 'Use first when deciding where management attention should go.',
  },
  {
    id: 'action-board',
    name: 'Action Board',
    route: '/app/action-board',
    cadence: 'Whenever updates are messy',
    whyItMatters: 'Stops chat chaos and meeting sprawl by forcing one owner and one next move.',
    useWhen: 'Use before another meeting or when mixed notes arrive from many teams.',
  },
  {
    id: 'daily-entry',
    name: 'Daily Entry',
    route: '/app/daily-entry',
    cadence: 'Every shift',
    whyItMatters: 'Gives supervisors one simple screen to record what happened.',
    useWhen: 'Use for shift handoff, KPI snapshot, receiving note, maintenance issue, and quality note.',
  },
  {
    id: 'operations',
    name: 'Operations',
    route: '/app/operations',
    cadence: 'Live during the shift',
    whyItMatters: 'Makes production blockers, handoff, and execution drift visible in one desk.',
    useWhen: 'Use for plan misses, output drift, line blockers, and cross-shift production issues.',
  },
  {
    id: 'dqms',
    name: 'DQMS',
    route: '/app/dqms',
    cadence: 'Per incident',
    whyItMatters: 'Turns quality issues into containment, evidence, and closeout instead of side notes.',
    useWhen: 'Use for defects, customer complaints, release holds, and CAPA work.',
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    route: '/app/maintenance',
    cadence: 'Per stop and daily review',
    whyItMatters: 'Connects downtime to cause, owner, and preventive follow-up.',
    useWhen: 'Use for breakdowns, repeat failures, PM gaps, and restart reviews.',
  },
  {
    id: 'receiving',
    name: 'Receiving',
    route: '/app/receiving',
    cadence: 'Per inbound exception',
    whyItMatters: 'Protects the plant from bad GRN, bad material, and supplier document gaps.',
    useWhen: 'Use when inbound stock or documents do not match what production expects.',
  },
  {
    id: 'data-fabric',
    name: 'Data Fabric',
    route: '/app/data-fabric',
    cadence: 'Daily review or weekly',
    whyItMatters: 'Shows whether the evidence chain is complete and where source gaps still exist.',
    useWhen: 'Use after the daily review, not as the first manager screen.',
  },
]

export const PLANT_MANAGER_CAPTURE_MODES: PlantManagerCaptureMode[] = [
  {
    id: 'portal-native',
    name: 'Portal-native entry',
    recommendation: 'Primary',
    whenToUse: 'For manager and supervisor use whenever the portal is reachable.',
    flow: ['Open Daily Entry or Action Board', 'Save the record', 'Open the owning desk if follow-up is needed'],
    note: 'This should be the default because it keeps writeback, evidence, and review on the same system.',
  },
  {
    id: 'appsheet-bridge',
    name: 'AppSheet quick form',
    recommendation: 'Fallback',
    whenToUse: 'For line-side phone entry when the custom portal is too heavy for the device or rollout stage.',
    flow: ['Open the lightweight form', 'Submit the incident or handoff', 'Route the record back into Action Board or Daily Entry review'],
    note: 'Useful as a rollout bridge, but the core review and management logic should stay in the portal.',
  },
  {
    id: 'google-form-bridge',
    name: 'Google Form fallback',
    recommendation: 'Fallback',
    whenToUse: 'For the fastest low-friction capture when training is still weak or devices are shared.',
    flow: ['Submit the short form', 'Promote it into the portal review queue', 'Manager verifies and routes it into the right desk'],
    note: 'Good for emergency simplicity, but should not replace the working desks.',
  },
  {
    id: 'voice-to-board',
    name: 'Voice note to Action Board',
    recommendation: 'Primary',
    whenToUse: 'For managers and supervisors who report better by speaking than typing.',
    flow: ['Capture a short voice note', 'Transcribe it', 'Paste it into Action Board', 'Assign owner and next move'],
    note: 'This is the best invisible-ISO bridge for teams that dislike long forms.',
  },
]

export const PLANT_OPERATING_SYSTEM_PRINCIPLES = [
  'One issue, one owner, one next move.',
  'Capture at the source, then route it once.',
  'Portal first. AppSheet and Google Forms only bridge the rollout.',
  'Evidence follows the work so review is easy later.',
] as const

export const PLANT_OPERATING_ROLE_CELLS: PlantOperatingRoleCell[] = [
  {
    id: 'plant-manager',
    title: 'Plant Manager',
    route: '/app/plant-manager',
    responsibility: 'Choose the top blocker, direct the next move, and keep the day small.',
    startsWith: 'Start in Plant OS for review and daily focus.',
    handsTo: 'Operations, DQMS, Maintenance, or Receiving depending on the issue.',
    evidence: ['Top blocker', 'Named owner', 'Due window'],
  },
  {
    id: 'shift-supervisor',
    title: 'Shift Supervisor',
    route: '/app/daily-entry',
    responsibility: 'Record what changed on the shift without writing a long report.',
    startsWith: 'Start in Daily Entry for handoff, KPI, and issue capture.',
    handsTo: 'Action Board when the update is mixed or unclear.',
    evidence: ['Shift handoff', 'KPI snapshot', 'Open issue'],
  },
  {
    id: 'quality-manager',
    title: 'Quality Manager',
    route: '/app/dqms',
    responsibility: 'Contain incidents, hold risk, and close the loop with evidence.',
    startsWith: 'Start in DQMS for defects, holds, complaints, and CAPA.',
    handsTo: 'Plant Manager when shipment, customer, or repeat-risk exposure exists.',
    evidence: ['Containment', 'Lot or batch', 'Next review'],
  },
  {
    id: 'maintenance-lead',
    title: 'Maintenance Lead',
    route: '/app/maintenance',
    responsibility: 'Restore flow fast and stop repeat failures from returning.',
    startsWith: 'Start in Maintenance for stops, PM gaps, and repeat-failure review.',
    handsTo: 'Operations when restart or workaround must be coordinated on shift.',
    evidence: ['Machine', 'Likely cause', 'Preventive action'],
  },
  {
    id: 'receiving-stores',
    title: 'Stores and Receiving',
    route: '/app/receiving',
    responsibility: 'Stop bad or unclear inbound material before it contaminates the plant.',
    startsWith: 'Start in Receiving for GRN mismatches, shortages, and hold decisions.',
    handsTo: 'Procurement or Plant Manager when supplier or release follow-up is needed.',
    evidence: ['Supplier', 'Quantity gap', 'Hold decision'],
  },
  {
    id: 'admin-showroom-head-office',
    title: 'Admin, showroom, and head office',
    route: '/app/action-board',
    responsibility: 'Push external requests, finance notes, and commercial changes into the same control loop.',
    startsWith: 'Start in Action Board when the update arrives through email, Drive, chat, or voice.',
    handsTo: 'Plant, commercial, or approval desk after the owner is clear.',
    evidence: ['Issue line', 'Owner', 'Due window'],
  },
]

export const PLANT_OPERATING_LOOPS: PlantOperatingLoop[] = [
  {
    id: 'capture',
    title: 'Capture',
    cadence: 'Live on the shift',
    question: 'What changed?',
    route: '/app/daily-entry',
    steps: ['Use Daily Entry for short structured capture.', 'Record the fact first, not the analysis.', 'Link the issue desk only when follow-up is needed.'],
  },
  {
    id: 'clarify',
    title: 'Clarify',
    cadence: 'When updates are messy',
    question: 'Who owns it next?',
    route: '/app/action-board',
    steps: ['Paste one issue per line into Action Board.', 'Confirm one owner and one due window.', 'Do not open another meeting until the route is clear.'],
  },
  {
    id: 'work',
    title: 'Work',
    cadence: 'Inside the day',
    question: 'Which desk closes it?',
    route: '/app/operations',
    steps: ['Open the owning desk only after routing is clear.', 'Keep the evidence with the live case.', 'Use Operations, DQMS, Maintenance, or Receiving based on the problem.'],
  },
  {
    id: 'review',
    title: 'Review',
    cadence: 'End of shift and end of day',
    question: 'What repeats tomorrow if we ignore it?',
    route: '/app/plant-manager',
    steps: ['Review the top blocker and repeat loss.', 'Choose one next-day intervention.', 'Use Data Fabric only as supporting evidence, not the first screen.'],
  },
]

export const PLANT_OPERATING_ARCHITECTURE: PlantOperatingArchitectureTile[] = [
  {
    id: 'capture-layer',
    label: 'Layer 1',
    title: 'Capture layer',
    route: '/app/daily-entry',
    summary: 'Simple entry for supervisors and managers.',
    points: ['Shift handoff', 'Quality incident', 'Maintenance issue', 'Receiving hold', 'KPI snapshot'],
  },
  {
    id: 'routing-layer',
    label: 'Layer 2',
    title: 'Routing layer',
    route: '/app/action-board',
    summary: 'Action Board turns messy updates into one owner and one next move.',
    points: ['Voice note to board', 'Email to issue line', 'Owner assignment', 'Due-window control'],
  },
  {
    id: 'desk-layer',
    label: 'Layer 3',
    title: 'Owning desks',
    route: '/app/operations',
    summary: 'Work closes in the desk that owns the issue, not in chat.',
    points: ['Operations', 'DQMS', 'Maintenance', 'Receiving', 'Approvals'],
  },
  {
    id: 'review-layer',
    label: 'Layer 4',
    title: 'Review and learning',
    route: '/app/plant-manager',
    summary: 'Managers review patterns, train routines, and improve the plant with live evidence.',
    points: ['Plant Manager', 'Manager SOPs', 'Data Fabric', 'Invisible ISO'],
  },
]

export const PLANT_ENTERPRISE_MODULES: PlantEnterpriseModule[] = [
  {
    id: 'plant-os',
    title: 'Plant OS',
    route: '/app/plant-manager',
    layer: 'Core',
    purpose: 'Manager home for daily review, top blocker choice, and next-step control.',
    sourceInputs: ['Daily Entry', 'Action Board', 'Operations', 'DQMS', 'Maintenance', 'Receiving'],
  },
  {
    id: 'production-execution',
    title: 'Production execution',
    route: '/app/operations',
    layer: 'Core',
    purpose: 'Run shift flow, plan misses, blockers, and cross-team handoff.',
    sourceInputs: ['Shift notes', 'KPI rows', 'Machine stops', 'Material blockers'],
  },
  {
    id: 'quality-release',
    title: 'Quality and release',
    route: '/app/dqms',
    layer: 'Core',
    purpose: 'Contain defects, manage holds, close CAPA, and keep release evidence linked.',
    sourceInputs: ['QC incidents', 'Photos', 'Batch context', 'Complaint notes'],
  },
  {
    id: 'maintenance-reliability',
    title: 'Maintenance and reliability',
    route: '/app/maintenance',
    layer: 'Core',
    purpose: 'Capture downtime, likely cause, repair owner, and repeat-failure prevention.',
    sourceInputs: ['Breakdowns', 'PM gaps', 'Repeat failures', 'Restart checks'],
  },
  {
    id: 'stores-receiving',
    title: 'Stores and receiving',
    route: '/app/receiving',
    layer: 'Core',
    purpose: 'Control inbound variance, GRN mismatch, supplier packet gaps, and release decisions.',
    sourceInputs: ['GRN records', 'COA packets', 'Supplier docs', 'Inbound holds'],
  },
  {
    id: 'supplier-approval',
    title: 'Supplier and approval control',
    route: '/app/approvals',
    layer: 'Control',
    purpose: 'Handle supplier recovery, release approvals, finance thresholds, and exception decisions.',
    sourceInputs: ['Approval cases', 'Supplier follow-up', 'Financial exposure', 'Escalations'],
  },
  {
    id: 'sales-accounts',
    title: 'Sales and accounts',
    route: '/app/revenue',
    layer: 'Commercial',
    purpose: 'Bring showroom, dealer, account, and collection work into the same operating system.',
    sourceInputs: ['Showroom Drive', 'Dealer follow-up', 'Invoice context', 'Collection status'],
  },
  {
    id: 'document-control',
    title: 'Document and government control',
    route: '/app/documents',
    layer: 'Control',
    purpose: 'Keep SOPs, supplier docs, finance files, and government records on linked cases instead of scattered folders.',
    sourceInputs: ['Drive files', 'Supplier packets', 'Government docs', 'Controlled records'],
  },
  {
    id: 'data-fabric',
    title: 'Data fabric and learning database',
    route: '/app/data-fabric',
    layer: 'Control',
    purpose: 'Normalize source data, build marts, track lineage, and support manager review with live evidence.',
    sourceInputs: ['Drive', 'Gmail', 'Writeback lanes', 'Connector events', 'Feature marts'],
  },
  {
    id: 'workforce-sop',
    title: 'Workforce and SOP control',
    route: '/app/workforce',
    layer: 'Control',
    purpose: 'Train managers, manage role routines, and keep adoption connected to actual work.',
    sourceInputs: ['Manager SOPs', 'Adoption signals', 'Pilot notes', 'Role coverage'],
  },
]
