import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  CLIENT_BUILD_MODULES,
  CLIENT_INDUSTRY_KITS,
  GENERAL_USE_TOOLS,
  buildClientBuildPlan,
  createDefaultClientBuildSpec,
  type ClientBuildSpec,
  type ClientIndustryKitId,
} from '../lib/clientBuildPlanner'

const STORAGE_KEY = 'supermega.clientBuildBrief.v1'

function updateSpec(spec: ClientBuildSpec, patch: Partial<ClientBuildSpec>): ClientBuildSpec {
  return { ...spec, ...patch }
}

function toggleModule(spec: ClientBuildSpec, moduleId: string): ClientBuildSpec {
  const selected = spec.selectedModuleIds.includes(moduleId)
    ? spec.selectedModuleIds.filter((id) => id !== moduleId)
    : [...spec.selectedModuleIds, moduleId]
  return { ...spec, selectedModuleIds: selected }
}

export function ClientBuildPage() {
  const [spec, setSpec] = useState<ClientBuildSpec>(() => createDefaultClientBuildSpec(''))
  const [savedMessage, setSavedMessage] = useState('')
  const plan = useMemo(() => buildClientBuildPlan(spec), [spec])
  const moduleOptions = CLIENT_BUILD_MODULES.filter((module) => module.kit === 'shared' || module.kit === spec.industryKit)

  function saveBrief() {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        spec,
        plan,
      }, null, 2),
    )
    setSavedMessage('Saved client build brief in this browser.')
  }

  async function copyBrief() {
    const brief = JSON.stringify({ spec, plan }, null, 2)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(brief)
      setSavedMessage('Copied build brief JSON.')
      return
    }
    saveBrief()
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Workspace setup"
        title="Turn a client requirement into a first usable workspace."
        description="Choose the industry kit, roles, sources, modules, and review rules. The output becomes the build brief for onboarding, templates, and the first paid sprint."
      />

      <section className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <form className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">1. Capture</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Client spec</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Keep this narrow. One client, one first team, one painful workflow, one first module.
              </p>
            </div>
            <span className="sm-chip text-white">{plan.kit.name}</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Client company
              <input
                className="sm-input"
                onChange={(event) => setSpec((prev) => updateSpec(prev, { company: event.target.value }))}
                placeholder="Company name"
                value={spec.company}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Portal type
              <select
                className="sm-input"
                onChange={(event) =>
                  setSpec((prev) =>
                    updateSpec(prev, {
                      industryKit: event.target.value as ClientIndustryKitId,
                      selectedModuleIds: [],
                    }),
                  )
                }
                value={spec.industryKit}
              >
                {CLIENT_INDUSTRY_KITS.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First roles or team
              <input
                className="sm-input"
                onChange={(event) => setSpec((prev) => updateSpec(prev, { roles: event.target.value }))}
                placeholder="Owner, operations, sales, manager"
                value={spec.roles}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Current systems
              <input
                className="sm-input"
                onChange={(event) => setSpec((prev) => updateSpec(prev, { currentSystems: event.target.value }))}
                placeholder="Gmail, Drive, Sheets, POS, ERP, WhatsApp"
                value={spec.currentSystems}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Source inputs
              <textarea
                className="sm-input min-h-24"
                onChange={(event) => setSpec((prev) => updateSpec(prev, { sourceInputs: event.target.value }))}
                placeholder="Files, folders, emails, reports, screenshots, exports, browser steps"
                value={spec.sourceInputs}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Workflow to replace
              <textarea
                className="sm-input min-h-28"
                onChange={(event) => setSpec((prev) => updateSpec(prev, { workflowPain: event.target.value }))}
                placeholder="What does the client do repeatedly today, who owns it, how often, and what is the done state?"
                value={spec.workflowPain}
              />
            </label>
          </div>

          <div className="mt-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">2. Pick modules</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {moduleOptions.map((module) => (
                <label className="rounded-[1.25rem] border border-white/12 bg-white/[0.04] p-4 text-sm text-[var(--sm-muted)]" key={module.id}>
                  <div className="flex items-start gap-3">
                    <input
                      checked={spec.selectedModuleIds.includes(module.id)}
                      className="mt-1"
                      onChange={() => setSpec((prev) => toggleModule(prev, module.id))}
                      type="checkbox"
                    />
                    <span>
                      <strong className="block text-white">{module.name}</strong>
                      <span className="mt-1 block leading-relaxed">{module.capability}</span>
                      <span className="mt-2 block text-xs uppercase tracking-[0.16em] text-[var(--sm-accent)]">{module.sellAs}</span>
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </form>

        <section className="grid gap-5">
          <div className="sm-proof-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Build output</p>
                <h2 className="mt-2 text-3xl font-bold text-white">{plan.packageName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{plan.kit.promise}</p>
              </div>
              <span className="sm-chip text-white">First team: {plan.firstTeam}</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {plan.recommendedModules.slice(0, 6).map((module) => (
                <div className="sm-manager-rule" key={module.id}>
                  <span className="sm-manager-rule-index">{module.department.slice(0, 2).toUpperCase()}</span>
                  <p>
                    <strong className="block text-white">{module.name}</strong>
                    <span className="text-xs text-[var(--sm-muted)]">{module.kpi} | {module.reviewGate}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Shared shell</p>
              <div className="mt-4 grid gap-3">
                {plan.sharedShellModules.map((module) => (
                  <div className="rounded-[1rem] border border-white/12 bg-white/[0.04] p-3" key={module.id}>
                    <p className="font-semibold text-white">{module.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">{module.capability}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Prepared checks</p>
              <div className="mt-4 grid gap-3">
                {plan.aiWorkcells.map((workcell) => (
                  <div className="rounded-[1rem] border border-white/12 bg-white/[0.04] p-3 text-sm leading-relaxed text-[var(--sm-muted)]" key={workcell}>
                    {workcell}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="sm-proof-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Automation rules</p>
                <h3 className="mt-2 text-2xl font-bold text-white">Controlled review flow, not a generic chatbot.</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  {plan.agentSkillPack.pattern.name}. Every generated workspace gets source scope, allowed tools, review gates, and staged outputs.
                </p>
              </div>
              <span className="sm-chip text-white">{plan.agentSkillPack.skills.length} skills</span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {plan.agentSkillPack.skills.slice(0, 3).map((skill) => (
                <article className="rounded-[1.25rem] border border-white/12 bg-white/[0.04] p-4" key={skill.id}>
                  <p className="font-semibold text-white">{skill.name}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">{skill.summary}</p>
                  <p className="mt-3 text-xs text-[var(--sm-accent)]">Review: {skill.reviewGate}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Review rules</p>
                <div className="mt-3 grid gap-3">
                  {plan.agentSkillPack.commands.slice(0, 4).map((command) => (
                    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3" key={command.id}>
                      <p className="text-sm font-semibold text-white">{command.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">{command.purpose}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Provider lanes</p>
                <div className="mt-3 grid gap-2">
                  {plan.agentSkillPack.connectors.slice(0, 6).map((connector) => (
                    <div className="flex items-center justify-between gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs" key={connector.id}>
                      <span className="font-semibold text-white">{connector.name}</span>
                      <span className="text-[var(--sm-muted)]">{connector.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Build steps</p>
              <div className="mt-4 grid gap-3">
                {plan.buildSteps.map((step, index) => (
                  <div className="sm-manager-rule" key={step}>
                    <span className="sm-manager-rule-index">{index + 1}</span>
                    <p className="text-sm text-white/90">{step}</p>
                  </div>
                ))}
              </div>
              {plan.risks.length ? (
                <div className="mt-5 rounded-[1rem] border border-amber-300/30 bg-amber-200/10 p-4 text-sm leading-relaxed text-amber-100">
                  {plan.risks.join(' ')}
                </div>
              ) : null}
            </section>

            <section className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Sellable tools</p>
              <div className="mt-4 grid gap-3">
                {GENERAL_USE_TOOLS.slice(0, 5).map((tool) => (
                  <Link className="rounded-[1rem] border border-white/12 bg-white/[0.04] p-3 transition hover:border-white/24" key={tool.id} to={tool.route}>
                    <p className="font-semibold text-white">{tool.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">{tool.sellAs}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="sm-calm-surface flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Use this brief to create the workspace and first module.</p>
              {savedMessage ? <p className="mt-1 text-xs text-[var(--sm-muted)]">{savedMessage}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="sm-button-secondary" onClick={copyBrief} type="button">
                Copy JSON
              </button>
              <button className="sm-button-secondary" onClick={saveBrief} type="button">
                Save brief
              </button>
              <Link className="sm-button-primary" to="/signup">
                Create workspace
              </Link>
              <Link className="sm-button-secondary" to="/app/portal-factory">
                Workspace templates
              </Link>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
