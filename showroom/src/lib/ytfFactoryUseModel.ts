export type YtfUseRoleId = 'admin' | 'plant_manager' | 'manager'

export type YtfLanguageMode = 'en' | 'my' | 'both'

export type YtfDisplayDensity = 'simple' | 'full'

export const YTF_LANGUAGE_MODE_STORAGE_KEY = 'ytf.languageMode.v1'

export const YTF_DISPLAY_DENSITY_STORAGE_KEY = 'ytf.displayDensity.v1'

export type YtfTranslatedText = {
  en: string
  my: string
}

export type YtfUseScreen = {
  label: string
  route: string
  job: string
}

export type YtfUseKpiPack = {
  id: string
  role: string
  entry: string
  kpis: string[]
  shownAt: string
  iso: string
  route: string
}

export type YtfFactoryProcessArea = {
  id: string
  label: string
  plant: 'Factory Floor' | 'Plant B / future' | 'Commercial'
  route: string
  pack: string
  enter: string
  proof: string
  dailyQuestion: string
  sourceHint: string
}

export type YtfDailyCloseItem = {
  id: string
  team: string
  route: string
  mustEnter: string
  kpi: string
  iso: string
  sourceHint: string
}

export type YtfUseRoleWorkflow = {
  id: YtfUseRoleId
  account: string
  title: string
  summary: string
  primaryRoute: string
  primaryLabel: string
  screens: YtfUseScreen[]
  dailyLoop: string[]
  dataShown: string[]
  aiActions: string[]
}

export type YtfOperatingSeparationLane = {
  id: string
  office: string
  department: string
  workflow: string
  account: string
  route: string
  firstAction: YtfTranslatedText
  dataOutput: YtfTranslatedText
  setting: string
}

export type YtfNextModule = {
  id: string
  status: 'live' | 'next' | 'later'
  title: string
  route: string
  why: string
  owner: string
}

export type YtfFirstDayUsageStep = {
  id: string
  title: YtfTranslatedText
  detail: YtfTranslatedText
  route: string
  account: string
}

export type YtfDepartmentScorecard = {
  id: string
  office: string
  department: string
  account: string
  route: string
  todayKpi: string
  dailyClose: string
  reviewScreen: string
  sourceBoundary: string
  managerQuestion: YtfTranslatedText
  hiddenIso: string[]
  nextModule: string
}

export function translateYtfUse(mode: YtfLanguageMode, english: string, burmese: string) {
  const safeBurmese = /(?:á€|â|Â)/.test(burmese) ? '' : burmese
  if (mode === 'my') return safeBurmese || english
  if (mode === 'both') return safeBurmese ? `${english} / ${safeBurmese}` : english
  return english
}

export const YTF_USE_ROLE_WORKFLOWS: Record<YtfUseRoleId, YtfUseRoleWorkflow> = {
  manager: {
    id: 'manager',
    account: 'ytf-manager',
    title: 'Manager',
    summary: 'Capture today once: issue, owner, due time, metric, and evidence.',
    primaryRoute: '/app/daily-entry',
    primaryLabel: 'New entry',
    screens: [
      { label: 'Entry', route: '/app/daily-entry', job: 'Submit one short update or photo.' },
      { label: 'Actions', route: '/app/action-board', job: 'See what is waiting for the team.' },
      { label: 'Docs', route: '/app/documents', job: 'Attach evidence without exposing raw folder links.' },
    ],
    dailyLoop: [
      'Open Entry on phone.',
      'Pick the closest pack: production, maintenance, quality, admin, or sales.',
      'Add one note, one owner, one due time, and one photo or evidence note.',
      'Check Actions only if the work needs follow-up.',
    ],
    dataShown: [
      'Open actions for the manager team.',
      'Latest KPI values needing capture.',
      'Only transformed operating signals relevant to the role.',
    ],
    aiActions: ['Clean messy note', 'Suggest issue type', 'Ask missing evidence', 'Draft root-cause note'],
  },
  plant_manager: {
    id: 'plant_manager',
    account: 'ytf-plant-manager',
    title: 'Plant Manager',
    summary: 'Review cross-team plant risk, publish KPI truth, and keep work visible.',
    primaryRoute: '/app/plant-manager',
    primaryLabel: 'Plant review',
    screens: [
      { label: 'Plant', route: '/app/plant-manager', job: 'Daily plant review and cross-team closure.' },
      { label: 'Actions', route: '/app/action-board', job: 'Owner, due date, status, and evidence.' },
      { label: 'Data', route: '/app/data-quality', job: 'Confirm KPI candidates and route unclear items.' },
    ],
    dailyLoop: [
      'Open Plant first.',
      'Review overdue, high severity, and evidence-backed actions.',
      'Publish only KPIs with owner, record, and evidence.',
      'Turn repeated issues into root-cause follow-up, maintenance, training, or work-standard updates.',
    ],
    dataShown: [
      'Changed operating records converted to review tasks.',
      'Trusted KPI definitions and latest values.',
      'Quality, maintenance, production, inventory, and admin risk.',
    ],
    aiActions: ['Summarize today', 'Draft 5W1H', 'Detect repeated issue', 'Create root-cause follow-up'],
  },
  admin: {
    id: 'admin',
    account: 'ytf-admin',
    title: 'Admin',
    summary: 'Keep the private tenant, data pipeline, users, exports, and AI workers healthy.',
    primaryRoute: '/app/system',
    primaryLabel: 'System status',
    screens: [
      { label: 'System', route: '/app/system', job: 'Cloud jobs, database, source health, and release posture.' },
      { label: 'Data', route: '/app/live-data', job: 'Transformed source records and evidence search.' },
      { label: 'Email', route: '/app/email', job: 'Admin-only Gmail/chat source lanes.' },
    ],
    dailyLoop: [
      'Check System after deployment or source changes.',
      'Confirm Drive, Gmail, scheduled jobs, database, and knowledge index are healthy.',
      'Export a YTF rollout packet when the training or setup changes.',
      'Keep private tenant data out of public SuperMega surfaces.',
    ],
    dataShown: [
      'Source freshness, source counts, and extraction posture.',
      'Gmail/chat connector readiness and manual drops.',
      'YTF rollout readiness and privacy status.',
    ],
    aiActions: ['Run health brief', 'Generate export packet', 'Summarize source changes', 'Queue agent review'],
  },
}

export const YTF_ROLE_KPI_PACKS: YtfUseKpiPack[] = [
  {
    id: 'operations',
    role: 'Operations / Production',
    entry: 'Mixing, tyre building, curing, output, rejects, WIP, manpower, and line blockers.',
    kpis: ['Daily output by section', 'Plan vs actual', 'Rejects and hold WIP', 'Curing press downtime', 'Shift carryover'],
    shownAt: 'Manager Entry, Action Board, Plant Review, Data Quality',
    iso: 'Production control, traceability evidence, nonconformity starter, management review input.',
    route: '/app/daily-entry?pack=production-flow',
  },
  {
    id: 'maintenance',
    role: 'Maintenance / Utility',
    entry: 'Machine, downtime minutes, cause, part blocker, next repair action, photo.',
    kpis: ['Downtime minutes by asset', 'Repeat failure count', 'PM completion', 'Parts blocker age', 'Utility interruption'],
    shownAt: 'Maintenance, Action Board, Plant Review, repeat-issue follow-up',
    iso: 'Maintenance records, corrective action, infrastructure control.',
    route: '/app/daily-entry?pack=reliability-utility',
  },
  {
    id: 'quality',
    role: 'Quality / QC',
    entry: 'Defect, claim, hold, batch/product, containment, evidence photo or file.',
    kpis: ['Claim/defect count', 'Hold and release count', 'Fix age', 'Containment status', 'Inspection finding'],
    shownAt: 'Quality, Action Board, Plant Review, KPI Review',
    iso: 'Nonconformity, containment, root cause, fix record, release evidence.',
    route: '/app/daily-entry?pack=quality',
  },
  {
    id: 'admin-planning',
    role: 'Admin / HR / Planning',
    entry: 'OT, attendance gap, plan change, training follow-up, document update.',
    kpis: ['OT hours', 'Manpower gap', 'Training acknowledgement', 'Document revisions', 'Tomorrow plan'],
    shownAt: 'Documents, Action Board, Plant Review, Management Review',
    iso: 'Document control, competence/training, management review evidence.',
    route: '/app/daily-entry?pack=admin-planning',
  },
  {
    id: 'sales-inventory',
    role: 'Sales / Inventory',
    entry: 'Stock movement, showroom issue, dealer follow-up, collection or customer signal.',
    kpis: ['Stock movement', 'Dealer follow-up aging', 'Collection issue', 'Showroom signal', 'Production demand signal'],
    shownAt: 'Sales, Action Board, Plant Review when factory plan is affected',
    iso: 'Customer communication, order/stock evidence, risk handoff.',
    route: '/app/daily-entry?pack=sales-inventory',
  },
]

export const YTF_FACTORY_PROCESS_AREAS: YtfFactoryProcessArea[] = [
  {
    id: 'mixing',
    label: '01 Mixing',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=production-flow&mode=whiteboard_snapshot',
    pack: 'Production',
    enter: 'Compound batch, output, reject/hold, recipe or raw-material issue.',
    proof: 'Board photo plus production record reference.',
    dailyQuestion: 'Did mixing hit plan without hold batch or missing compound?',
    sourceHint: 'Factory Floor production records.',
  },
  {
    id: 'component-flow',
    label: 'Rubberizing / extrusion / cutting',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=production-flow&mode=shift_handoff',
    pack: 'Production',
    enter: 'Line output, dimensional issue, material issue, scrap, and handoff.',
    proof: 'Photo of board, line note, or sheet row.',
    dailyQuestion: 'Which component flow became the bottleneck today?',
    sourceHint: 'Factory Floor production-office data.',
  },
  {
    id: 'tyre-building',
    label: 'Tyre building',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=production-flow&mode=shift_handoff',
    pack: 'Production',
    enter: 'Builder/team output, green tyre WIP, defect, machine/line issue.',
    proof: 'Photo, WIP count, or production sheet reference.',
    dailyQuestion: 'What green-tyre WIP or building defect needs review?',
    sourceHint: 'Factory Floor production records / manager entry.',
  },
  {
    id: 'curing-07',
    label: '07 Curing press',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=production-flow&mode=maintenance_issue',
    pack: 'Production + maintenance',
    enter: 'Press, mold/product, downtime minutes, cure issue, next repair.',
    proof: 'Press photo, board photo, maintenance note.',
    dailyQuestion: 'Did curing press 07 create downtime, reject, or carryover?',
    sourceHint: 'Manager entry, maintenance records, production office data.',
  },
  {
    id: 'qc-inspection',
    label: 'QC / inspection / claim',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=quality&mode=quality_incident',
    pack: 'Quality',
    enter: 'Defect, claim, hold/release, batch/product, containment.',
    proof: 'Claim record, defect photo, lab reference.',
    dailyQuestion: 'What must stay on hold or needs root-cause follow-up?',
    sourceHint: 'QC folder / Claim Tyre / quality records.',
  },
  {
    id: 'maintenance-utility',
    label: 'Maintenance / utility',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=reliability-utility&mode=maintenance_issue',
    pack: 'Maintenance',
    enter: 'Asset, downtime, cause, part blocker, next repair or PM follow-up.',
    proof: 'Machine photo, spare reference, repair note.',
    dailyQuestion: 'Which repeat failure or utility risk must not be forgotten?',
    sourceHint: 'Maintenance entry, Factory Floor production office data.',
  },
  {
    id: 'admin-planning',
    label: 'Admin / planning / HR',
    plant: 'Factory Floor',
    route: '/app/daily-entry?pack=admin-planning&mode=document_control',
    pack: 'Admin',
    enter: 'OT, manpower, plan change, training, SOP/form change.',
    proof: 'OT sheet, document screenshot, training evidence.',
    dailyQuestion: 'What plan, document, or training item affects tomorrow?',
    sourceHint: 'Factory Floor OT and training records.',
  },
  {
    id: 'sales-inventory',
    label: 'Sales / inventory / showroom',
    plant: 'Commercial',
    route: '/app/daily-entry?pack=sales-inventory&mode=kpi_snapshot',
    pack: 'Sales + stock',
    enter: 'Stock movement, dealer/customer issue, showroom money or follow-up.',
    proof: 'Stock sheet, Viber export, showroom document/photo.',
    dailyQuestion: 'What stock or customer signal changes the factory plan?',
    sourceHint: 'Tyre Sales and Inventory / Showroom PC lane.',
  },
]

export const YTF_DAILY_CLOSE_ITEMS: YtfDailyCloseItem[] = [
  {
    id: 'production-close',
    team: 'Production close',
    route: '/app/daily-entry?pack=production-flow',
    mustEnter: 'Section output, rejects/hold WIP, plan miss, top blocker.',
    kpi: 'Output / reject / WIP',
    iso: 'Production control and traceability evidence.',
    sourceHint: 'Tyre Production sheets and whiteboard photos.',
  },
  {
    id: 'quality-close',
    team: 'Quality close',
    route: '/app/daily-entry?pack=quality',
    mustEnter: 'Claims, defects, holds, containment owner, photo or evidence note.',
    kpi: 'Claims / defects / holds',
    iso: 'Nonconformity, containment, fix-record starter.',
    sourceHint: 'QC Claim Tyre folders and quality records.',
  },
  {
    id: 'maintenance-close',
    team: 'Maintenance close',
    route: '/app/daily-entry?pack=reliability-utility',
    mustEnter: 'Asset, downtime minutes, repair status, spare blocker.',
    kpi: 'Downtime / repeat failure',
    iso: 'Maintenance record and corrective action evidence.',
    sourceHint: 'Maintenance entries and machine evidence photos.',
  },
  {
    id: 'planning-close',
    team: 'Planning / admin close',
    route: '/app/daily-entry?pack=admin-planning',
    mustEnter: 'OT, manpower gap, tomorrow plan, document/training changes.',
    kpi: 'OT + plan',
    iso: 'Document control, competence, management review input.',
    sourceHint: 'OT Record, ISO folders, admin mirrored docs.',
  },
  {
    id: 'sales-inventory-close',
    team: 'Sales / inventory close',
    route: '/app/daily-entry?pack=sales-inventory',
    mustEnter: 'Stock movement, dealer follow-up, collection or showroom issue.',
    kpi: 'Stock movement',
    iso: 'Customer communication and planning handoff evidence.',
    sourceHint: 'Tyre Sales and Inventory and Showroom PC lane.',
  },
]

export const YTF_FIRST_DAY_USAGE_STEPS: YtfFirstDayUsageStep[] = [
  {
    id: 'manager-entry',
    title: { en: 'Manager: enter one fact', my: 'မန်နေဂျာ - အချက်တစ်ခုထည့်ပါ' },
    detail: {
      en: 'Open Entry, choose the closest section, attach one photo if needed, then save.',
      my: 'Entry ဖွင့်၊ အနီးစပ်ဆုံး အပိုင်းရွေး၊ လိုရင် ဓာတ်ပုံတစ်ပုံထည့်ပြီး သိမ်းပါ။',
    },
    route: '/app/daily-entry',
    account: 'ytf-manager',
  },
  {
    id: 'plant-review',
    title: { en: 'Plant Manager: review and publish', my: 'စက်ရုံမန်နေဂျာ - စစ်ပြီး အတည်ပြုပါ' },
    detail: {
      en: 'Open Plant, check Actions and Data, then publish only evidence-backed KPI or root-cause drafts.',
      my: 'Plant ဖွင့်၊ Actions နဲ့ Data Quality စစ်၊ သက်သေရှိတဲ့ KPI/CAPA draft ကိုပဲ အတည်ပြုပါ။',
    },
    route: '/app/plant-manager',
    account: 'ytf-plant-manager',
  },
  {
    id: 'admin-control',
    title: { en: 'Admin: keep data and cloud healthy', my: 'Admin - Data နဲ့ Cloud ကို စစ်ပါ' },
    detail: {
      en: 'Open System, confirm database, scheduled jobs, business records, messages, exports, and privacy gates.',
      my: 'System ဖွင့်၊ database, scheduled jobs, Drive, Gmail, export နဲ့ privacy gate တွေ စစ်ပါ။',
    },
    route: '/app/system',
    account: 'ytf-admin',
  },
]

export const YTF_OPERATING_SEPARATION_LANES: YtfOperatingSeparationLane[] = [
  {
    id: 'plant-a-production',
    office: 'Factory Floor production office',
    department: 'Production flow',
    workflow: 'Daily close and shift exceptions',
    account: 'ytf-operations',
    route: '/app/daily-entry?pack=production-flow',
    firstAction: {
      en: 'Enter output, rejects, WIP, downtime, and the top blocker once per shift.',
      my: 'Shift တစ်ကြိမ် output, reject, WIP, downtime နဲ့ အဓိက blocker ထည့်ပါ။',
    },
    dataOutput: {
      en: 'Production close, plan miss, bottleneck, and KPI candidates.',
      my: 'Production close, plan miss, bottleneck နဲ့ KPI candidate ထွက်မယ်။',
    },
    setting: 'Phone-first / Burmese + English / photo for abnormal issue',
  },
  {
    id: 'plant-a-qc',
    office: 'Factory Floor QC desk',
    department: 'Quality / QC',
    workflow: 'Defect, claim, hold, and root-cause starter',
    account: 'ytf-quality',
    route: '/app/daily-entry?pack=quality',
    firstAction: {
      en: 'Log claim, defect, hold, product, batch, containment, and evidence.',
      my: 'Claim, defect, hold, product, batch, containment နဲ့ သက်သေ ထည့်ပါ။',
    },
    dataOutput: {
      en: 'Quality case, containment task, root-cause draft, and quality KPI.',
      my: 'DQMS case, containment task, CAPA draft နဲ့ quality KPI ထွက်မယ်။',
    },
    setting: 'Evidence required / Factory Floor only unless explicitly tagged Plant B',
  },
  {
    id: 'plant-a-maintenance',
    office: 'Factory Floor maintenance and utility',
    department: 'Maintenance / Utility',
    workflow: 'Downtime, repair, PM, and spare blocker',
    account: 'ytf-maintenance',
    route: '/app/daily-entry?pack=reliability-utility',
    firstAction: {
      en: 'Enter machine, downtime minutes, cause, next repair action, and part blocker.',
      my: 'စက်နာမည်, downtime minute, cause, repair action နဲ့ part blocker ထည့်ပါ။',
    },
    dataOutput: {
      en: 'Downtime by asset, repeat failure, PM gap, and maintenance action.',
      my: 'Asset အလိုက် downtime, repeat failure, PM gap နဲ့ action ထွက်မယ်။',
    },
    setting: 'Machine-first / recurring issue triggers root-cause follow-up',
  },
  {
    id: 'plant-a-admin-planning',
    office: 'Factory Floor admin and planning',
    department: 'Admin / HR / Planning',
    workflow: 'OT, manpower, training, plan change, document control',
    account: 'ytf-admin-planning',
    route: '/app/daily-entry?pack=admin-planning',
    firstAction: {
      en: 'Enter OT, manpower gap, tomorrow plan, training, or document change.',
      my: 'OT, manpower gap, tomorrow plan, training သို့ document change ထည့်ပါ။',
    },
    dataOutput: {
      en: 'Manpower risk, OT trend, training acknowledgement, document-control task.',
      my: 'Manpower risk, OT trend, training acknowledgement နဲ့ document task ထွက်မယ်။',
    },
    setting: 'Document-control and training records stay behind the simple form',
  },
  {
    id: 'showroom-sales',
    office: 'Showroom / sales PC',
    department: 'Sales / Inventory',
    workflow: 'Stock, dealer, collection, and showroom signal',
    account: 'ytf-sales',
    route: '/app/daily-entry?pack=sales-inventory',
    firstAction: {
      en: 'Enter stock movement, dealer follow-up, collection issue, or customer signal.',
      my: 'Stock movement, dealer follow-up, collection issue သို့ customer signal ထည့်ပါ။',
    },
    dataOutput: {
      en: 'Stock pressure, dealer aging, demand signal, and factory-plan handoff.',
      my: 'Stock pressure, dealer aging, demand signal နဲ့ factory plan handoff ထွက်မယ်။',
    },
    setting: 'Commercial data visible only to sales, Plant Manager, and Admin scopes',
  },
  {
    id: 'head-office',
    office: 'Head office',
    department: 'Finance / Supply chain',
    workflow: 'PO, supplier, finance, export, and decision evidence',
    account: 'ytf-admin',
    route: '/app/live-data',
    firstAction: {
      en: 'Review changed finance or supplier files, then convert real issues into actions.',
      my: 'Finance သို့ supplier file ပြောင်းလဲမှု စစ်ပြီး issue ကို action ပြောင်းပါ။',
    },
    dataOutput: {
      en: 'Supplier exposure, purchase follow-up, decision queue, and leadership brief.',
      my: 'Supplier exposure, purchase follow-up, decision queue နဲ့ leadership brief ထွက်မယ်။',
    },
    setting: 'Admin-only source visibility; managers see transformed outputs, not raw Drive links',
  },
  {
    id: 'plant-manager-office',
    office: 'Plant Manager office',
    department: 'Plant review',
    workflow: 'Publish KPI, close root-cause follow-up, and unblock departments',
    account: 'ytf-plant-manager',
    route: '/app/plant-manager',
    firstAction: {
      en: 'Open Plant, review overdue/high/evidence-backed items, then publish or send back.',
      my: 'Plant ဖွင့်၊ overdue/high/evidence-backed items စစ်ပြီး publish သို့ send back လုပ်ပါ။',
    },
    dataOutput: {
      en: 'Official KPI, closed action, root-cause decision, and management-review input.',
      my: 'Official KPI, closed action, CAPA decision နဲ့ management review input ထွက်မယ်။',
    },
    setting: 'Human truth check for every AI-generated ISO or KPI output',
  },
  {
    id: 'tenant-admin',
    office: 'Tenant admin',
    department: 'System / Data / Email',
    workflow: 'Users, roles, connector health, exports, and cloud jobs',
    account: 'ytf-admin',
    route: '/app/system',
    firstAction: {
      en: 'Check cloud health, privacy, Drive/Gmail status, scheduled jobs, and exports.',
      my: 'Cloud health, privacy, Drive/Gmail status, scheduled jobs နဲ့ exports စစ်ပါ။',
    },
    dataOutput: {
      en: 'YTF export, data-freshness status, and rollout checklist.',
      my: 'YTF export, data freshness status နဲ့ rollout checklist ထွက်မယ်။',
    },
    setting: 'Admin has setup controls; factory users should not need this page',
  },
]

export const YTF_DEPARTMENT_SCORECARDS: YtfDepartmentScorecard[] = [
  {
    id: 'production-flow',
    office: 'Factory Floor production office',
    department: 'Production',
    account: 'ytf-operations',
    route: '/app/daily-entry?pack=production-flow',
    todayKpi: 'Output / reject / WIP / top blocker',
    dailyClose: 'Section totals, abnormal issue, evidence photo, and tomorrow carryover.',
    reviewScreen: 'Plant Manager + Action Board',
    sourceBoundary: 'Factory Floor Yangon / bias nylon only. Keep Plant B Bilin out unless explicitly tagged.',
    managerQuestion: {
      en: 'Did today hit plan, and what blocked the next section?',
      my: 'ဒီနေ့ plan ပြည့်လား၊ နောက်အဆင့်ကို ဘာက ပိတ်နေလဲ?',
    },
    hiddenIso: ['production control', 'traceability', 'nonconformity starter'],
    nextModule: 'Daily Close Board',
  },
  {
    id: 'quality-qc',
    office: 'Factory Floor QC desk',
    department: 'Quality / QC',
    account: 'ytf-quality',
    route: '/app/daily-entry?pack=quality',
    todayKpi: 'Defects / claims / holds / fix age',
    dailyClose: 'Defect or claim, containment owner, product/batch, and evidence.',
    reviewScreen: 'Quality + Plant Manager',
    sourceBoundary: 'Show only quality outputs and reviewed evidence, not raw folder links.',
    managerQuestion: {
      en: 'What must stay on hold, and what evidence proves containment?',
      my: 'ဘယ်ဟာ hold ထားရမလဲ၊ containment ကို ဘာသက်သေပြလဲ?',
    },
    hiddenIso: ['nonconformity', 'containment', 'root cause', 'release authority'],
    nextModule: 'Calibration and Gauge Control',
  },
  {
    id: 'maintenance-utility',
    office: 'Factory Floor maintenance and utility',
    department: 'Maintenance / Utility',
    account: 'ytf-maintenance',
    route: '/app/daily-entry?pack=reliability-utility',
    todayKpi: 'Downtime / repeat failure / PM gap / parts blocker',
    dailyClose: 'Machine, minutes lost, cause, next repair, part blocker, and photo.',
    reviewScreen: 'Maintenance + Action Board',
    sourceBoundary: 'Machine-first evidence. Repeated issue becomes root-cause follow-up.',
    managerQuestion: {
      en: 'Which machine can stop output again if we do nothing?',
      my: 'ဘာမှမလုပ်ရင် ဘယ်စက်က production ကို ထပ်ရပ်စေနိုင်လဲ?',
    },
    hiddenIso: ['infrastructure control', 'maintenance record', 'corrective action'],
    nextModule: 'Preventive Maintenance Calendar',
  },
  {
    id: 'admin-planning',
    office: 'Factory Floor admin and planning',
    department: 'Admin / HR / Planning',
    account: 'ytf-admin-planning',
    route: '/app/daily-entry?pack=admin-planning',
    todayKpi: 'OT / manpower gap / training / document change',
    dailyClose: 'Overtime, attendance gap, tomorrow plan, SOP/form change, or training evidence.',
    reviewScreen: 'Documents + Plant Manager',
    sourceBoundary: 'Planning and document-control outputs only; sensitive HR files stay admin-scoped.',
    managerQuestion: {
      en: 'What people, training, or document issue will affect tomorrow?',
      my: 'မနက်ဖြန်ကို လူ၊ training၊ document အကြောင်း ဘာက သက်ရောက်မလဲ?',
    },
    hiddenIso: ['document control', 'competence', 'training acknowledgement'],
    nextModule: 'Training Acknowledgement',
  },
  {
    id: 'sales-inventory',
    office: 'Showroom / sales PC',
    department: 'Sales / Inventory',
    account: 'ytf-sales',
    route: '/app/daily-entry?pack=sales-inventory',
    todayKpi: 'Stock movement / dealer aging / collection issue',
    dailyClose: 'Stock movement, customer signal, dealer follow-up, showroom issue, or collection risk.',
    reviewScreen: 'Sales + Plant Manager when factory plan changes',
    sourceBoundary: 'Commercial outputs only. Raw money/account files stay sales/admin-scoped.',
    managerQuestion: {
      en: 'What sales or stock signal should change the factory plan?',
      my: 'ဘယ် sales/stock signal က factory plan ကို ပြောင်းသင့်လဲ?',
    },
    hiddenIso: ['customer communication', 'planning handoff', 'stock evidence'],
    nextModule: 'Dealer and Stock Pulse',
  },
  {
    id: 'head-office',
    office: 'Head office',
    department: 'Finance / Supply chain',
    account: 'ytf-admin',
    route: '/app/live-data',
    todayKpi: 'PO / supplier / finance / export decision',
    dailyClose: 'Changed PO, supplier document, finance sheet, export issue, or decision blocker.',
    reviewScreen: 'Admin Data + Decisions',
    sourceBoundary: 'Admin and leadership only. Managers see assigned tasks, not source folders.',
    managerQuestion: {
      en: 'Which file change creates a supplier, cash, or operating decision?',
      my: 'ဘယ် file change က supplier, cash, operating decision ဖြစ်စေလဲ?',
    },
    hiddenIso: ['supplier control', 'decision trace', 'management review'],
    nextModule: 'Supplier / PO / Receiving Lane',
  },
]

export const YTF_NEXT_MODULES: YtfNextModule[] = [
  {
    id: 'daily-close-board',
    status: 'next',
    title: 'Daily Close Board',
    route: '/app/daily-entry',
    why: 'One compact closeout screen for production, quality, maintenance, planning, and sales before the day ends.',
    owner: 'Plant Manager',
  },
  {
    id: 'whiteboard-ocr-review',
    status: 'next',
    title: 'Board Photo Review',
    route: '/app/data-quality',
    why: 'Managers upload board photos; the system reads numbers as KPI candidates; Plant Manager confirms truth.',
    owner: 'Production + Data',
  },
  {
    id: 'department-scorecards',
    status: 'next',
    title: 'Department Scorecards',
    route: '/app/plant-manager',
    why: 'Each department sees only its KPI, actions, overdue evidence, and repeated issue pattern.',
    owner: 'Plant Manager',
  },
  {
    id: 'training-acknowledgement',
    status: 'next',
    title: 'Training Acknowledgement',
    route: '/app/daily-entry?pack=admin-planning&mode=training_followup',
    why: 'Turns SOP changes and repeated mistakes into simple manager coaching records.',
    owner: 'Admin / Planning',
  },
  {
    id: 'calibration-gauge-control',
    status: 'later',
    title: 'Calibration and Gauge Control',
    route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    why: 'QC tools, gauges, lab checks, and release authority need their own controlled evidence lane.',
    owner: 'Quality',
  },
  {
    id: 'supplier-po-lane',
    status: 'later',
    title: 'Supplier / PO / Receiving Lane',
    route: '/app/receiving',
    why: 'Supplier documents, quantity mismatch, GRN, PI/PO, and finance decisions should become one follow-up chain.',
    owner: 'Head office + Receiving',
  },
  {
    id: 'plant-b-separation',
    status: 'later',
    title: 'Plant B Separation',
    route: '/app/live-data',
    why: 'Factory Floor and Plant B must stay separated by source, product, machine, and KPI scope before deeper analytics.',
    owner: 'Admin',
  },
  {
    id: 'chat-import-lane',
    status: 'later',
    title: 'Viber / LINE / WeChat Import Lane',
    route: '/app/email',
    why: 'Chat updates should become evidence-backed tasks, not hidden decisions inside phone threads.',
    owner: 'Admin',
  },
]

export const YTF_FACTORY_OS_TEMPLATE_LAYERS = [
  {
    label: '1. Source map',
    detail: 'Connect Drive, Sheets, Gmail, chat exports, forms, photos, and ERP exports.',
  },
  {
    label: '2. Role packs',
    detail: 'Give each role one phone-first entry pack and one review screen.',
  },
  {
    label: '3. ISO engine',
    detail: 'Build work-standard evidence behind the work: 5W1H, root cause, document control, training, audit, KPI review.',
  },
  {
    label: '4. Data fabric',
    detail: 'Transform raw source changes into records, KPI candidates, knowledge chunks, and action items.',
  },
  {
    label: '5. AI workforce',
    detail: 'Agents draft summaries, detect gaps, prepare root-cause follow-up, and hand work to humans for confirmation.',
  },
]

export function resolveYtfUseRoleId(role?: string | null): YtfUseRoleId {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (['admin', 'tenant_admin', 'platform_admin', 'ceo'].includes(normalized)) return 'admin'
  if (['plant_manager', 'director', 'quality_manager'].includes(normalized)) return 'plant_manager'
  return 'manager'
}
