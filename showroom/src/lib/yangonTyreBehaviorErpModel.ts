export type YangonTyreBehaviorSignal = {
  id: string
  title: string
  observed: string
  erpMove: string
  isoFocus: string
  route: string
}

export type YangonTyreBehaviorRule = {
  id: string
  title: string
  detail: string
}

export const YANGON_TYRE_BEHAVIOR_SIGNALS: YangonTyreBehaviorSignal[] = [
  {
    id: 'daily-conclusion-photos',
    title: 'Daily conclusions are photo-first',
    observed: 'Planning teams post daily conclusions, target snapshots, and defect evidence as image bundles instead of typed ERP rows.',
    erpMove: 'Accept photo, short note, and shift label first. Convert that into structured shift-review and quality records behind the scenes.',
    isoFocus: 'Operation and evidence capture',
    route: '/app/daily-entry',
  },
  {
    id: 'manager-chat-commands',
    title: 'Managers issue work through chat and mention tags',
    observed: 'Consultant and manager instructions are sent as short directives: report today, confirm why, improve this week, attach evidence.',
    erpMove: 'Turn those commands into Action Board items with one owner, one due window, and one next desk instead of leaving them in chat history.',
    isoFocus: 'Responsibility and follow-up',
    route: '/app/action-board',
  },
  {
    id: 'weekly-plan-rhythm',
    title: 'Weekly plans and Saturday reports already exist',
    observed: 'Sections send weekly plans, overtime plans, and named report-back routines to management.',
    erpMove: 'Use the same rhythm as the ERP review cadence so workers do not learn a new calendar just to satisfy the system.',
    isoFocus: 'Performance evaluation',
    route: '/app/plant-manager',
  },
  {
    id: 'machine-checklists',
    title: 'Machine checks are visual and section-based',
    observed: 'Mixers, extruders, curing presses, and utility checks appear as checklists, photos, and line-specific notes.',
    erpMove: 'Treat machine checklists as native maintenance and operations records, then link them to downtime, defects, and release state.',
    isoFocus: 'Operational control and maintenance',
    route: '/app/operations',
  },
  {
    id: 'consultant-knowledge',
    title: 'Critical know-how is still person-dependent',
    observed: 'Problem-solving patterns live in consultants, supervisors, and repeated chat explanations more than in governed systems.',
    erpMove: 'Capture root-cause logic, parameter changes, and countermeasures into DQMS and knowledge control so the method survives the person.',
    isoFocus: 'Knowledge retention and improvement',
    route: '/app/dqms',
  },
  {
    id: 'drive-is-the-repository',
    title: 'Drive folders are the real current repository',
    observed: 'The operation already spans Factory Floor office data, Plant B desktops, sticks, emails, workbooks, and guide documents in Google Drive.',
    erpMove: 'Use Drive as the source registry, not as a side attachment store, then turn those folders into controlled canonical lanes in Data Fabric.',
    isoFocus: 'Documented information and traceability',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_BEHAVIOR_ERP_RULES: YangonTyreBehaviorRule[] = [
  {
    id: 'do-not-force-typing',
    title: 'Do not force long typed forms first',
    detail: 'Start with voice, photo, one-line issue, or checklist capture. Ask for missing fields only after the worker has already submitted the real signal.',
  },
  {
    id: 'mirror-existing-rhythm',
    title: 'Mirror the existing daily and weekly rhythm',
    detail: 'The ERP should follow shift conclusions, weekly plans, and Saturday reports because those habits already exist and already have management attention.',
  },
  {
    id: 'desk-after-capture',
    title: 'Capture first, route second',
    detail: 'Workers should not need to understand every module. The system should classify whether the issue belongs in Operations, DQMS, Approvals, Knowledge, or Plant Manager.',
  },
  {
    id: 'hide-iso-jargon',
    title: 'Hide ISO language from most operators',
    detail: 'Keep ISO structure in the record model, approval gates, and evidence chain, while the user sees plain terms like issue, owner, due, proof, and review.',
  },
  {
    id: 'connect-ops-quality-maintenance',
    title: 'One abnormality should cross desks cleanly',
    detail: 'A defect, line stoppage, supplier variance, or machine leak can touch multiple teams. The ERP should link those records instead of making teams duplicate the same event.',
  },
] as const
