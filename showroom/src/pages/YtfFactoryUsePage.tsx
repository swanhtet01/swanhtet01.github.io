import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  YTF_DAILY_CLOSE_ITEMS,
  YTF_DEPARTMENT_SCORECARDS,
  YTF_DISPLAY_DENSITY_STORAGE_KEY,
  YTF_FACTORY_PROCESS_AREAS,
  YTF_FIRST_DAY_USAGE_STEPS,
  YTF_LANGUAGE_MODE_STORAGE_KEY,
  YTF_NEXT_MODULES,
  YTF_OPERATING_SEPARATION_LANES,
  YTF_ROLE_KPI_PACKS,
  YTF_USE_ROLE_WORKFLOWS,
  resolveYtfUseRoleId,
  translateYtfUse,
  type YtfDisplayDensity,
  type YtfLanguageMode,
  type YtfUseRoleId,
} from '../lib/ytfFactoryUseModel'
import { YTF_ROLE_SPLIT_ACCOUNTS, YTF_STARTER_WORKSPACE_ACCOUNTS } from '../lib/ytfPlantATeamModel'
import {
  getWorkspaceSession,
  getYtfDashboardSummary,
  getYtfPipelineStats,
  loadCachedWorkspaceSession,
  type WorkspaceSessionPayload,
  type YtfDashboardSummaryResult,
} from '../lib/workspaceApi'
import { getVerifiedYtfDashboardFallback } from '../lib/ytfVerifiedSnapshot'

type SessionState = WorkspaceSessionPayload['session']

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value: unknown) {
  return numberValue(value).toLocaleString()
}

function compactTime(value?: string | null) {
  if (!value) return 'No timestamp'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 1800) {
  return await Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

function buildExportPayload(
  roleId: YtfUseRoleId,
  languageMode: YtfLanguageMode,
  displayDensity: YtfDisplayDensity,
  summary: YtfDashboardSummaryResult | null,
) {
  const workflow = YTF_USE_ROLE_WORKFLOWS[roleId]
  const pipeline = summary?.pipeline_stats

  return {
    exported_at: new Date().toISOString(),
    tenant: 'ytf-plant-a',
    role: workflow,
    settings: {
      language_mode: languageMode,
      display_density: displayDensity,
      default_route: workflow.primaryRoute,
      privacy_rule: 'Managers see daily work, actions, and confirmed metrics only.',
    },
    live_snapshot: {
      source_records: numberValue(pipeline?.source_records?.count),
      plant_a_records: numberValue(pipeline?.source_records?.by_plant?.['Floor A']),
      plant_b_records: numberValue(pipeline?.source_records?.by_plant?.['Floor B']),
      shared_company_records: numberValue(pipeline?.source_records?.by_plant?.Company),
      mixed_plant_records: numberValue(pipeline?.source_records?.by_plant?.['Floor A/B']),
      changed_records: numberValue(pipeline?.source_changes?.event_count),
      review_tasks: numberValue(
        pipeline?.source_changes?.promoted_task_count ?? pipeline?.source_changes?.task_promotion?.review_task_count,
      ),
      kpi_candidates: numberValue(
        pipeline?.source_records?.kpi_candidate_count ?? pipeline?.workbooks?.metric_candidate_count,
      ),
      knowledge_chunks: numberValue(summary?.knowledge_status?.summary?.chunk_count ?? pipeline?.knowledge?.chunk_count),
      gmail_ready: `${formatCount(pipeline?.communications?.gmail_ready_count)}/${formatCount(pipeline?.communications?.gmail_source_count)}`,
      chat_ready: `${formatCount(pipeline?.communications?.bot_ready_count)}/${formatCount(pipeline?.communications?.bot_source_count)}`,
      generated_at: summary?.generated_at ?? null,
    },
    role_kpi_packs: YTF_ROLE_KPI_PACKS,
    plant_a_process_areas: YTF_FACTORY_PROCESS_AREAS,
    daily_close_items: YTF_DAILY_CLOSE_ITEMS,
    department_scorecards: YTF_DEPARTMENT_SCORECARDS,
    first_day_usage_steps: YTF_FIRST_DAY_USAGE_STEPS,
    operating_separation_lanes: YTF_OPERATING_SEPARATION_LANES,
    next_modules: YTF_NEXT_MODULES,
    human_confirmation_rule: 'AI output is draft only until a manager confirms the owner, source, scope, and next action.',
  }
}

function buildTeamManualText(
  summary: YtfDashboardSummaryResult | null,
  roleId: YtfUseRoleId,
  languageMode: YtfLanguageMode,
  displayDensity: YtfDisplayDensity,
) {
  const payload = buildExportPayload(roleId, languageMode, displayDensity, summary)
  const lines = [
    '# Factory Client Floor A - YTF Portal Team Manual',
    '',
    'Use only https://ytf.supermega.dev for Factory Client work.',
    'If another host or generic workspace appears, log out and open ytf.supermega.dev again.',
    '',
    '## Login Accounts',
    '- ytf-admin: system setup, data pipeline, email/chat connectors, exports, and privacy checks.',
    '- ytf-plant-manager: daily plant review, KPI/CAPA confirmation, and cross-team visibility.',
    '- ytf-manager: shared manager entry account for the first rollout.',
    '- Next split accounts: ytf-operations, ytf-maintenance, ytf-quality, ytf-admin-planning, ytf-sales.',
    '- Password: use the YTF rollout password given by the rollout owner. Do not share it outside the rollout team.',
    '',
    '## Daily Manager Workflow',
    '1. Open Entry on the phone.',
    '2. Choose the closest pack: production, maintenance, quality, admin/planning, or sales/inventory.',
    '3. Enter one fact only: what happened, owner/team, due date, and severity.',
    '4. For section boards, choose Whiteboard, photo the board, type the visible numbers, and let the system draft KPI candidates.',
    '5. Attach a photo or evidence note when the issue is abnormal, repeated, or needs confirmation.',
    '6. Save once. The record becomes an Action Board item, KPI candidate, quality item, or document record.',
    '',
    '## Plant Manager Workflow',
    '1. Open Plant first.',
    '2. Review high, overdue, follow-up, and evidence-backed items.',
    '3. Confirm KPI/CAPA/ISO drafts only when owner, source, scope, and evidence are clear.',
    '4. Close the action or send it back for more evidence.',
    '5. Turn repeated problems into training, SOP, maintenance, or CAPA follow-up.',
    '',
    '## Data Workflow',
    `- Operating records: ${payload.live_snapshot.source_records}`,
    `- Floor A records: ${payload.live_snapshot.plant_a_records}`,
    `- Floor B records: ${payload.live_snapshot.plant_b_records}`,
    `- Shared company records: ${payload.live_snapshot.shared_company_records}`,
    `- Mixed Floor A/B records needing review: ${payload.live_snapshot.mixed_plant_records}`,
    `- Changed records: ${payload.live_snapshot.changed_records}`,
    `- Review tasks: ${payload.live_snapshot.review_tasks}`,
    `- KPI candidates: ${payload.live_snapshot.kpi_candidates}`,
    `- Evidence-search chunks: ${payload.live_snapshot.knowledge_chunks}`,
    `- Gmail/chat readiness: ${payload.live_snapshot.gmail_ready}; ${payload.live_snapshot.chat_ready}`,
    '- Managers see daily work, actions, and confirmed metrics only.',
    '- Admin sees connector health and source freshness.',
    '- Plant Manager sees evidence-backed actions and KPI candidates.',
    '- Floor A and Floor B must stay separated by plant, product family, machine, source, and KPI scope.',
    '- Mixed Floor A/B and shared company records need Plant Manager/Admin review before becoming official KPI history.',
    '',
    '## Databases and Access',
    '- Operating database: manager entries, action items, whiteboard captures, owners, status, daily close, and work history. Managers write here first.',
    '- Operations data: production, quality, stock, sales, purchasing, maintenance, and manager entries stay separated by Floor And role.',
    '- Knowledge/archive memory: layouts, SOPs, ISO docs, manuals, supplier docs, and historical files as searchable AI context. Admin controls sensitive lanes.',
    '- KPI/feature mart: clean KPI rows and trends for output, reject, WIP, downtime, defects, stock, sales, finance, and planning.',
    '- Rollout config: reusable feature checklist, role templates, permission matrix, and deployment checklist for scaling the same system to other plants or clients.',
    '',
    '## Invisible ISO Rule',
    '- Daily entry creates evidence.',
    '- Action Board creates owner, due date, status, and evidence trail.',
    '- 5W1H, CAPA, SOP, training, and KPI notes are drafted for manager review.',
    '- Manager confirmation makes the record trusted.',
    '',
    '## First Week Rollout',
    '- Day 1: use ytf-manager for all managers and capture only production/quality/maintenance exceptions.',
    '- Day 2: Plant Manager reviews Action Board and sends back unclear entries.',
    '- Day 3: split maintenance and quality into their own accounts if the shared account is too noisy.',
    '- Day 4: use Whiteboard mode for output, reject, WIP, downtime, and stock movement; Plant Manager confirms the KPI candidates.',
    '- Day 5: keep only the first stable KPI pack and send noisy candidates back.',
    '',
  ]

  return lines.join('\n')
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function YtfFactoryUsePage() {
  const [session, setSession] = useState<SessionState | null>(() => loadCachedWorkspaceSession()?.session ?? null)
  const [summary, setSummary] = useState<YtfDashboardSummaryResult | null>(() => getVerifiedYtfDashboardFallback())
  const [activeRole, setActiveRole] = useState<YtfUseRoleId>(() => resolveYtfUseRoleId(loadCachedWorkspaceSession()?.session?.role))
  const [languageMode, setLanguageMode] = useState<YtfLanguageMode>(() => {
    if (typeof window === 'undefined') return 'en'
    const saved = window.localStorage.getItem(YTF_LANGUAGE_MODE_STORAGE_KEY)
    return saved === 'my' || saved === 'both' || saved === 'en' ? saved : 'en'
  })
  const [displayDensity, setDisplayDensity] = useState<YtfDisplayDensity>(() => {
    if (typeof window === 'undefined') return 'simple'
    const saved = window.localStorage.getItem(YTF_DISPLAY_DENSITY_STORAGE_KEY)
    return saved === 'full' || saved === 'simple' ? saved : 'simple'
  })
  const [error, setError] = useState('')

  function saveLanguageMode(nextMode: YtfLanguageMode) {
    setLanguageMode(nextMode)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(YTF_LANGUAGE_MODE_STORAGE_KEY, nextMode)
    }
  }

  function saveDisplayDensity(nextDensity: YtfDisplayDensity) {
    setDisplayDensity(nextDensity)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(YTF_DISPLAY_DENSITY_STORAGE_KEY, nextDensity)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [nextSession, nextSummary, nextPipelineStats] = await Promise.all([
          withTimeout(getWorkspaceSession(), loadCachedWorkspaceSession() ?? null, 1200),
          withTimeout(getYtfDashboardSummary({ compact: true }), getVerifiedYtfDashboardFallback(), 1800),
          withTimeout(getYtfPipelineStats(), getVerifiedYtfDashboardFallback().pipeline_stats ?? null, 1800),
        ])

        if (cancelled) return
        const resolvedSession = nextSession?.session ?? null
        const hydratedSummary =
          nextSummary || nextPipelineStats
            ? {
                ...(nextSummary ?? {}),
                status: nextSummary?.status ?? nextPipelineStats?.status,
                generated_at: nextSummary?.generated_at ?? new Date().toISOString(),
                pipeline_stats: nextSummary?.pipeline_stats ?? nextPipelineStats ?? undefined,
              }
            : null
        setSession(resolvedSession)
        setSummary(hydratedSummary)
        setActiveRole(resolveYtfUseRoleId(resolvedSession?.role))
        setError('')
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load live usage data.')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const workflow = YTF_USE_ROLE_WORKFLOWS[activeRole]
  const pipeline = summary?.pipeline_stats
  const pipelineLoaded = Boolean(pipeline)
  const snapshot = useMemo(
    () => [
      {
        label: 'Daily close',
        value: pipelineLoaded ? 'Open' : 'Checking',
        detail: pipelineLoaded ? 'Enter output, rejects, downtime, stock movement, and notes.' : 'Loading today status.',
        route: '/app/daily-entry?mode=daily_routine',
      },
      {
        label: 'Needs review',
        value: pipelineLoaded
          ? `${formatCount(pipeline?.source_changes?.promoted_task_count ?? pipeline?.source_changes?.task_promotion?.review_task_count)} tasks`
          : 'Checking',
        detail: pipelineLoaded
          ? 'Confirm real production, quality, stock, sales, and abnormality items.'
          : 'Loading review state.',
        route: '/app/action-board',
      },
      {
        label: 'Board photo',
        value: 'Ready',
        detail: 'Upload whiteboard photo or type visible numbers for the plant.',
        route: '/app/daily-entry?mode=whiteboard_snapshot',
      },
      {
        label: '5W1H',
        value: 'Ready',
        detail: 'Use this for abnormality reason, containment, owner, and follow-up.',
        route: '/app/daily-entry?mode=normal_abnormal&condition=abnormal',
      },
    ],
    [pipeline, pipelineLoaded],
  )
  const commsStatus = `${formatCount(pipeline?.communications?.gmail_ready_count)}/${formatCount(pipeline?.communications?.gmail_source_count)} Gmail / ${formatCount(pipeline?.communications?.bot_ready_count)}/${formatCount(pipeline?.communications?.bot_source_count)} chat`
  const refreshStatus = pipeline?.refresh_loop?.status || summary?.status || 'checking'
  const latestRefresh = pipeline?.refresh_loop?.latest_at || summary?.generated_at
  const roleCloseItems = useMemo(() => {
    if (activeRole === 'admin') {
      return YTF_DAILY_CLOSE_ITEMS.filter((item) => ['production-close', 'quality-close', 'maintenance-close'].includes(item.id))
    }
    return YTF_DAILY_CLOSE_ITEMS
  }, [activeRole])
  const roleLanes = useMemo(() => {
    if (activeRole === 'admin') return YTF_OPERATING_SEPARATION_LANES.filter((lane) => lane.account === 'ytf-admin' || lane.id === 'head-office')
    if (activeRole === 'plant_manager') {
      return YTF_OPERATING_SEPARATION_LANES.filter((lane) => ['plant-manager-office', 'plant-a-production', 'plant-a-qc', 'plant-a-maintenance'].includes(lane.id))
    }
    return YTF_OPERATING_SEPARATION_LANES.filter((lane) => !['tenant-admin', 'head-office'].includes(lane.id))
  }, [activeRole])
  const roleScorecards = useMemo(() => {
    if (activeRole === 'admin') return YTF_DEPARTMENT_SCORECARDS
    if (activeRole === 'plant_manager') {
      return YTF_DEPARTMENT_SCORECARDS.filter((card) => card.id !== 'head-office')
    }
    return YTF_DEPARTMENT_SCORECARDS.filter((card) => !['head-office'].includes(card.id))
  }, [activeRole])
  const nextModules = useMemo(() => YTF_NEXT_MODULES.filter((item) => item.status !== 'later').slice(0, 5), [])
  const showFull = displayDensity === 'full'
  const accountRows = showFull ? [...YTF_STARTER_WORKSPACE_ACCOUNTS, ...YTF_ROLE_SPLIT_ACCOUNTS] : YTF_STARTER_WORKSPACE_ACCOUNTS
  const visibleKpiPacks = showFull ? YTF_ROLE_KPI_PACKS : YTF_ROLE_KPI_PACKS.slice(0, 5)
  const reviewTaskCount = numberValue(
    pipeline?.source_changes?.promoted_task_count ?? pipeline?.source_changes?.task_promotion?.review_task_count,
  )
  const factoryFlowRows = [
    {
      label: '1. Capture',
      title: 'Manager enters one fact.',
      detail: 'Short note, owner, due date, optional photo, or Whiteboard numbers for KPI candidates.',
      route: '/app/daily-entry',
    },
    {
      label: '2. Route',
      title: 'Action Board owns follow-up.',
      detail: 'Open, follow-up, done, or plant review. No parallel chat tracker.',
      route: '/app/action-board',
    },
    {
      label: '3. Confirm',
      title: 'Plant Manager confirms truth.',
      detail: 'Confirms KPI, CAPA, hold/release, maintenance, or SOP candidate.',
      route: '/app/plant-manager',
    },
    {
      label: '4. Learn',
      title: 'Data updates dashboards and evidence search.',
      detail: 'New operating updates become review tasks and KPI candidates.',
      route: '/app/data-quality',
    },
  ]
  const dataSourceRows = [
    {
      label: 'Operations',
      value: latestRefresh ? compactTime(latestRefresh) : 'Today',
      detail: 'Production, stock, quality, sales, purchasing, and manager entries become role dashboards.',
      route: '/app/live-data?view=kpi',
    },
    {
      label: 'Team messages',
      value: activeRole === 'admin' ? commsStatus : 'Actions only',
      detail: activeRole === 'admin' ? 'Admin connects official channels. Managers see assigned work.' : 'Managers see assigned work, not raw inbox setup.',
      route: '/app/email',
    },
    {
      label: 'Manager entry',
      value: `${formatCount(reviewTaskCount)} review tasks`,
      detail: 'Daily entry, whiteboard snapshot, DQMS, maintenance, documents, and training follow-up.',
      route: '/app/action-board',
    },
  ]
  const teamManualSteps = [
    {
      label: 'Start here',
      title: 'Use ytf.supermega.dev only.',
      detail: 'If a generic workspace appears, log out and open the private YTF host again.',
      route: '/app/use',
    },
    {
      label: 'Manager',
      title: 'Enter one real update.',
      detail: 'One issue or board snapshot, one owner/team, one due date, one evidence photo when needed.',
      route: '/app/daily-entry',
    },
    {
      label: 'Plant Manager',
      title: 'Confirm truth, not noise.',
      detail: 'Only promote KPI/CAPA/ISO drafts with source, owner, scope, and evidence.',
      route: '/app/plant-manager',
    },
    {
      label: 'Admin',
      title: 'Keep data and cloud healthy.',
      detail: 'Check database, cron, Drive, Gmail/chat, privacy, and export readiness.',
      route: '/app/system',
    },
  ]

  return (
    <div className="sm-ytf-simple-page sm-ytf-use-page">
      <section className="sm-ytf-hero-row sm-ytf-hero-compact">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">How to use YTF</p>
          <h1>{translateYtfUse(languageMode, 'One loop for every manager.', 'မန်နေဂျာတိုင်းအတွက် လုပ်ငန်းစဉ်တစ်ခုတည်း။')}</h1>
          <p>{translateYtfUse(languageMode, 'Enter once. Add evidence. Review.', 'တစ်ခါထည့်၊ သက်သေတင်၊ ပြန်စစ်။')}</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{session?.display_name || workflow.account}</span>
          <span>{workflow.title}</span>
          <span>{refreshStatus}</span>
        </div>
      </section>

      {error ? <section className="sm-ytf-alert">{error}</section> : null}

      <section className="sm-ytf-metric-strip" aria-label="Transformed YTF data status">
        {snapshot.map((item) => (
          <Link key={item.label} to={item.route}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </Link>
        ))}
      </section>

      <section className="sm-ytf-panel sm-ytf-use-map">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Factory workflow</p>
            <h2>How the ERP works today.</h2>
          </div>
          <span className="sm-status-pill">Drafts need manager review</span>
        </div>
        <div className="sm-ytf-flow-grid">
          {factoryFlowRows.map((row) => (
            <Link className="sm-ytf-flow-card" key={row.label} to={row.route}>
              <span>{row.label}</span>
              <strong>{row.title}</strong>
              <small>{row.detail}</small>
            </Link>
          ))}
        </div>
        <div className="sm-ytf-source-summary">
          {dataSourceRows.map((row) => (
            <Link className="sm-ytf-source-row" key={row.label} to={row.route}>
              <span>
                <strong>{row.label}</strong>
                <small>{row.detail}</small>
              </span>
              <em>{row.value}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel sm-ytf-manual-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Team manual</p>
            <h2>Give this to the Factory Client team.</h2>
          </div>
          <button
            className="sm-button-secondary"
            onClick={() =>
              downloadText(
                `ytf-team-manual-${activeRole}.md`,
                buildTeamManualText(summary, activeRole, languageMode, displayDensity),
              )
            }
            type="button"
          >
            Download manual
          </button>
        </div>
        <div className="sm-ytf-flow-grid sm-ytf-manual-grid">
          {teamManualSteps.map((step) => (
            <Link className="sm-ytf-flow-card" key={step.label} to={step.route}>
              <span>{step.label}</span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-settings-bar" aria-label="YTF display settings">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Settings</p>
          <h2>{translateYtfUse(languageMode, 'Keep it simple on every phone.', 'ဖုန်းတိုင်းမှာ ရိုးရှင်းအောင်ထားပါ။')}</h2>
        </div>
        <div className="sm-ytf-toggle-row" role="group" aria-label="Language mode">
          {[
            { id: 'en', label: 'English' },
            { id: 'my', label: 'မြန်မာ' },
            { id: 'both', label: 'Both' },
          ].map((item) => (
            <button
              className={`sm-ytf-toggle ${languageMode === item.id ? 'is-active' : ''}`.trim()}
              key={item.id}
              onClick={() => saveLanguageMode(item.id as YtfLanguageMode)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="sm-ytf-toggle-row" role="group" aria-label="Screen detail">
          {[
            { id: 'simple', label: 'Simple' },
            { id: 'full', label: 'Full' },
          ].map((item) => (
            <button
              className={`sm-ytf-toggle ${displayDensity === item.id ? 'is-active' : ''}`.trim()}
              key={item.id}
              onClick={() => saveDisplayDensity(item.id as YtfDisplayDensity)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {showFull ? (
      <section className="sm-ytf-action-grid sm-ytf-action-grid-three" aria-label="Choose role workflow">
        {(Object.values(YTF_USE_ROLE_WORKFLOWS) as Array<(typeof YTF_USE_ROLE_WORKFLOWS)[YtfUseRoleId]>).map((role) => (
          <button
            className={`sm-ytf-action-tile ${role.id === activeRole ? 'is-primary' : ''}`.trim()}
            key={role.id}
            onClick={() => setActiveRole(role.id)}
            type="button"
          >
            <span>
              <strong>{role.title}</strong>
              <small>{role.summary}</small>
            </span>
            <span className="sm-ytf-action-arrow">{role.account}</span>
          </button>
        ))}
      </section>
      ) : null}

      {showFull ? (
      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Department scorecards</p>
            <h2>{translateYtfUse(languageMode, 'Use office, department, and workflow as the split.', 'ရုံး၊ ဌာန၊ workflow အလိုက် ခွဲသုံးပါ။')}</h2>
          </div>
          <span className="sm-status-pill">{roleScorecards.length} active</span>
        </div>
        <div className="sm-ytf-dept-score-grid">
          {roleScorecards.map((card) => (
            <Link className="sm-ytf-scorecard" key={card.id} to={card.route}>
              <span>{card.office}</span>
              <strong>{card.department}</strong>
              <small>{translateYtfUse(languageMode, card.managerQuestion.en, card.managerQuestion.my)}</small>
              <div>
                <b>{card.todayKpi}</b>
                <em>{card.account}</em>
              </div>
              <p>{card.dailyClose}</p>
            </Link>
          ))}
        </div>
      </section>
      ) : null}

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{translateYtfUse(languageMode, 'Use today', 'ဒီနေ့သုံးရန်')}</p>
            <h2>{translateYtfUse(languageMode, 'Three account types. One daily habit.', 'Account သုံးမျိုး၊ နေ့စဉ်အလေ့အကျင့်တစ်ခု။')}</h2>
          </div>
          <Link className="sm-button-secondary" to={workflow.primaryRoute}>
            {workflow.primaryLabel}
          </Link>
        </div>
        <div className="sm-ytf-card-grid sm-ytf-action-grid-three">
          {YTF_FIRST_DAY_USAGE_STEPS.map((step) => (
            <Link className="sm-ytf-mini-card sm-ytf-use-today-card" key={step.id} to={step.route}>
              <span>{step.account}</span>
              <strong>{translateYtfUse(languageMode, step.title.en, step.title.my)}</strong>
              <small>{translateYtfUse(languageMode, step.detail.en, step.detail.my)}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel sm-ytf-account-guide">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Accounts</p>
            <h2>Use these YTF usernames.</h2>
          </div>
          <span className="sm-status-pill">password: rollout owner provides</span>
        </div>
        <div className="sm-ytf-account-grid">
          {accountRows.map((account) => (
            <Link className="sm-ytf-account-card" key={account.username} to={account.primaryRoute}>
              <span>{account.username}</span>
              <strong>{account.label}</strong>
              <small>{account.summary}</small>
            </Link>
          ))}
        </div>
        {!showFull ? <p className="sm-ytf-muted">Full mode shows operations, maintenance, quality, admin/planning, and sales split accounts.</p> : null}
      </section>

      <section className="sm-ytf-panel sm-ytf-kpi-owner-guide">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role KPIs</p>
            <h2>What each team enters and where it shows.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/data-quality">
            KPI review
          </Link>
        </div>
        <div className="sm-ytf-kpi-owner-list">
          {visibleKpiPacks.map((pack) => (
            <Link className="sm-ytf-kpi-owner-row" key={pack.id} to={pack.route}>
              <span>
                <strong>{pack.role}</strong>
                <small>{pack.entry}</small>
              </span>
              <span>
                <b>{pack.kpis.slice(0, 3).join(' / ')}</b>
                <em>{pack.shownAt}</em>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {showFull ? (
      <section className="sm-ytf-panel sm-ytf-use-workflow">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{workflow.account}</p>
            <h2>{workflow.title} workflow.</h2>
          </div>
          <Link className="sm-button-primary" to={workflow.primaryRoute}>
            {workflow.primaryLabel}
          </Link>
        </div>
        <div className="sm-ytf-use-columns">
          <div className="sm-ytf-use-steps">
            {workflow.dailyLoop.map((step, index) => (
              <div className="sm-ytf-use-step" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <div className="sm-ytf-compact-list">
            {workflow.screens.map((screen) => (
              <Link className="sm-ytf-list-row" key={screen.route} to={screen.route}>
                <span>
                  <strong>{screen.label}</strong>
                  <small>{screen.job}</small>
                </span>
                <em>Open</em>
              </Link>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {showFull ? (
      <>
      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{translateYtfUse(languageMode, 'Office / Department / Workflow', 'ရုံး / ဌာန / လုပ်ငန်းစဉ်')}</p>
            <h2>{translateYtfUse(languageMode, 'Separate work by where it happens.', 'အလုပ်ဖြစ်တဲ့နေရာအလိုက် ခွဲပါ။')}</h2>
          </div>
          <span className="sm-status-pill">{roleLanes.length} lanes</span>
        </div>
        <div className="sm-ytf-lane-grid">
          {roleLanes.map((lane) => (
            <Link className="sm-ytf-lane-card" key={lane.id} to={lane.route}>
              <span>{lane.office}</span>
              <strong>{lane.department}</strong>
              <small>{lane.workflow}</small>
              <p>{translateYtfUse(languageMode, lane.firstAction.en, lane.firstAction.my)}</p>
              <em>{translateYtfUse(languageMode, lane.dataOutput.en, lane.dataOutput.my)}</em>
              <b>{lane.account}</b>
            </Link>
          ))}
        </div>
      </section>
      </>
      ) : null}

      {showFull ? (
      <section className="sm-ytf-panel sm-ytf-next-modules">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next modules</p>
            <h2>Turn on only what improves daily use.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/system">
            Admin setup
          </Link>
        </div>
        <div className="sm-ytf-module-list">
          {nextModules.map((item) => (
            <Link className="sm-ytf-module-row" key={item.id} to={item.route}>
              <span>{item.status}</span>
              <strong>{item.title}</strong>
              <small>{item.why}</small>
              <em>{item.owner}</em>
            </Link>
          ))}
        </div>
      </section>
      ) : null}

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Daily close</p>
            <h2>What must be entered before the day ends.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/daily-entry">
            Enter
          </Link>
        </div>
        <div className="sm-ytf-card-grid sm-ytf-daily-close-grid">
          {roleCloseItems.slice(0, showFull ? roleCloseItems.length : 3).map((item) => (
            <Link className="sm-ytf-mini-card sm-ytf-close-card" key={item.id} to={item.route}>
              <span>{item.team}</span>
              <strong>{item.kpi}</strong>
              <small>{item.mustEnter}</small>
              <em>{item.sourceHint}</em>
            </Link>
          ))}
        </div>
        {!showFull ? <p className="sm-ytf-muted">Full mode shows planning and sales/inventory closeout too.</p> : null}
      </section>

      {showFull ? (
      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Floor A map</p>
            <h2>Tap the area, then enter the fact.</h2>
          </div>
          <span className="sm-status-pill">Yangon / bias nylon</span>
        </div>
        <div className="sm-ytf-card-grid sm-ytf-card-grid-four sm-ytf-process-grid">
          {YTF_FACTORY_PROCESS_AREAS.map((area) => (
            <Link className="sm-ytf-mini-card sm-ytf-process-card" key={area.id} to={area.route}>
              <span>{area.pack}</span>
              <strong>{area.label}</strong>
              <small>{area.enter}</small>
              <em>{area.dailyQuestion}</em>
            </Link>
          ))}
        </div>
      </section>
      ) : null}

      {showFull ? (
      <div className="sm-ytf-full-details">
      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role KPIs and entry packs</p>
            <h2>What each team enters and sees.</h2>
          </div>
          <span className="sm-status-pill">{commsStatus}</span>
        </div>
        <div className="sm-ytf-card-grid sm-ytf-role-kpi-grid">
          {YTF_ROLE_KPI_PACKS.map((pack) => (
            <Link className="sm-ytf-mini-card sm-ytf-kpi-pack-card" key={pack.id} to={pack.route}>
              <span>{pack.role}</span>
              <strong>{pack.kpis.slice(0, 2).join(' / ')}</strong>
              <small>{pack.entry}</small>
              <em>{pack.shownAt}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Invisible ISO</p>
              <h2>ISO happens behind the work.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/dqms">
              DQMS
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {['Daily entry becomes the work record.', '5W1H, CAPA, SOP, or training notes are prepared for review.', 'Plant Manager confirms truth before it becomes trusted.', 'Every KPI/action keeps owner, due date, and status.'].map((item) => (
              <div className="sm-ytf-list-row" key={item}>
                <span>
                  <strong>{item}</strong>
                  <small>ISO-ready, but not paperwork-heavy.</small>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">YTF setup export</p>
              <h2>Save the current rollout pack.</h2>
            </div>
            <button
              className="sm-button-secondary"
              onClick={() => downloadJson(`ytf-factory-os-${activeRole}.json`, buildExportPayload(activeRole, languageMode, displayDensity, summary))}
              type="button"
            >
              Export
            </button>
          </div>
          <div className="sm-ytf-compact-list">
            {[
              'Role homes and usernames',
              'Daily entry and whiteboard modes',
              'KPI candidates and ISO truth rules',
              'Current transformed data counts',
            ].map((item) => (
              <div className="sm-ytf-list-row" key={item}>
                <span>
                  <strong>{item}</strong>
                  <small>Included in the YTF export for training and rollout review.</small>
                </span>
              </div>
            ))}
          </div>
          <p className="sm-ytf-muted">Latest refresh: {compactTime(latestRefresh)}. AI suggestions stay draft until a manager confirms.</p>
        </article>
      </section>
      </div>
      ) : null}
    </div>
  )
}
