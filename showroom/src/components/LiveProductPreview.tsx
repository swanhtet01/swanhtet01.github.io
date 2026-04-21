import type { ReactNode } from 'react'

import type { LivePreviewVariant } from '../lib/liveProductPreviewModel'

type LiveProductPreviewProps = {
  variant: LivePreviewVariant
  className?: string
  compact?: boolean
}

type PreviewFrameProps = {
  title: string
  subtitle: string
  status: string
  children: ReactNode
  className?: string
  compact?: boolean
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function PreviewFrame({ title, subtitle, status, children, className, compact }: PreviewFrameProps) {
  return (
    <div className={joinClassNames('sm-live-preview', compact && 'sm-live-preview-compact', className)}>
      <div className="sm-live-preview-bar">
        <div className="sm-live-preview-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="sm-live-preview-heading">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <span className="sm-live-preview-status">{status}</span>
      </div>
      <div className="sm-live-preview-body">{children}</div>
    </div>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm-live-preview-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PreviewActions({ items }: { items: string[] }) {
  return (
    <div className="sm-live-preview-actions">
      {items.map((item) => (
        <span className="sm-live-preview-action" key={item}>
          {item}
        </span>
      ))}
    </div>
  )
}

function PreviewRow({ title, meta, state, note }: { title: string; meta: string; state: string; note?: string }) {
  return (
    <div className="sm-live-preview-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <div className="sm-live-preview-row-tail">
        <span className="sm-live-preview-pill">{state}</span>
        {note ? <small>{note}</small> : null}
      </div>
    </div>
  )
}

function PreviewTask({ title, owner, due }: { title: string; owner: string; due: string }) {
  return (
    <div className="sm-live-preview-task">
      <strong>{title}</strong>
      <span>
        {owner} | {due}
      </span>
    </div>
  )
}

function PortalPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={joinClassNames('sm-live-preview-portal', className)} compact={compact} status="Platform view" subtitle="SUPERMEGA.dev modules, data, and agent jobs" title="SM Portal">
      <div className="sm-live-preview-shell">
        <aside className="sm-live-preview-rail">
          {['Sales Desk', 'Company List', 'Receiving Control', 'Decision Journal'].map((item, index) => (
            <div className={joinClassNames('sm-live-preview-rail-item', index === 0 && 'is-active')} key={item}>
              {item}
            </div>
          ))}
        </aside>

        <div className="sm-live-preview-stack">
          <div className="sm-live-preview-metrics-grid">
            <PreviewMetric label="Live desk" value="Sales" />
            <PreviewMetric label="Queue owner" value="Growth" />
            <PreviewMetric label="Agent loop" value="Running" />
          </div>
          <PreviewActions items={['New account', 'Import sheet', 'Sync Gmail']} />

          <div className="sm-live-preview-split">
            <section className="sm-live-preview-pane">
              <p className="sm-live-preview-label">Company memory</p>
              <PreviewRow meta="distributor | dubai | phone + site" state="saved" title="Atlas Trade Group" />
              <PreviewRow meta="importer | london | gmail + web form" note="needs reply" state="outreach" title="Northline Auto" />
              <PreviewRow meta="dealer | johannesburg | website + linkedin" state="qualified" title="Peak Mobility" />
            </section>

            <section className="sm-live-preview-pane">
              <p className="sm-live-preview-label">Agent runtime</p>
              <PreviewTask due="09:00" owner="Revenue Scout" title="Reran regional distributor search" />
              <PreviewTask due="09:20" owner="List Clerk" title="Cleaned imported expo leads" />
              <PreviewTask due="10:00" owner="Founder Brief" title="Queued the daily review for leadership" />
            </section>
          </div>
        </div>
      </div>
    </PreviewFrame>
  )
}

function FounderBriefPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Daily brief" subtitle="Leadership review from live queues" title="Founder Brief">
      <PreviewActions items={['Daily brief', 'Risk watch', 'Escalations']} />
      <div className="sm-live-preview-brief">
        <div className="sm-live-preview-brief-line">
          <span>Urgent today</span>
          <strong>Inbound batch hold still waiting on customs release.</strong>
        </div>
        <div className="sm-live-preview-brief-line">
          <span>Sales movement</span>
          <strong>3 new companies saved. 2 follow-ups need owner review.</strong>
        </div>
        <div className="sm-live-preview-brief-line">
          <span>Ops risk</span>
          <strong>One GRN mismatch stayed open overnight.</strong>
        </div>
      </div>
    </PreviewFrame>
  )
}

function YangonTyrePortalPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame
      className={joinClassNames('sm-live-preview-portal', className)}
      compact={compact}
      status="Tenant pattern"
      subtitle="ytf.supermega.dev | roles, data, agents, and factory control"
      title="Yangon Tyre OS"
    >
      <div className="sm-live-preview-shell">
        <aside className="sm-live-preview-rail">
          {['CEO', 'Sales', 'Operations', 'DQMS', 'Maintenance', 'Connectors'].map((item, index) => (
            <div className={joinClassNames('sm-live-preview-rail-item', index === 2 && 'is-active')} key={item}>
              {item}
            </div>
          ))}
        </aside>

        <div className="sm-live-preview-stack">
          <div className="sm-live-preview-metrics-grid">
            <PreviewMetric label="B+R watch" value="2.4%" />
            <PreviewMetric label="Open blockers" value="07" />
            <PreviewMetric label="Supplier chase" value="05" />
          </div>
          <PreviewActions items={['Log issue', 'Open CAPA', 'Review connectors']} />

          <div className="sm-live-preview-split">
            <section className="sm-live-preview-pane">
              <p className="sm-live-preview-label">Shift control</p>
              <PreviewRow meta="mixing batch genealogy linked" state="stable" title="Compound release queue" />
              <PreviewRow meta="undercure spike on line 2" note="quality owner" state="review" title="Curing deviation" />
              <PreviewRow meta="PO docs still incomplete" state="supplier" title="Inbound discrepancy" />
            </section>

            <section className="sm-live-preview-pane">
              <p className="sm-live-preview-label">Agent cells</p>
              <PreviewTask due="08:45" owner="Intake Router" title="Classified new Gmail, Drive, and chat signals" />
              <PreviewTask due="09:10" owner="Quality Watch" title="Prepared CAPA starter for sidewall crack cluster" />
              <PreviewTask due="09:30" owner="Executive Brief" title="Queued CEO summary with plant and sales risk" />
            </section>
          </div>

          <div className="sm-live-preview-footer">
            <span>Factory truth, commercial history, connector health, and AI work all run on the same tenant.</span>
          </div>
        </div>
      </div>
    </PreviewFrame>
  )
}

function SalesSetupPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Product view" subtitle="Find Companies + Company List" title="Distributor Sales Desk">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Search" value="Middle East tyre distributors" />
        <PreviewMetric label="Saved" value="05 shortlist" />
        <PreviewMetric label="Open" value="03 follow-ups" />
      </div>
      <PreviewActions items={['Run search', 'Keep shortlist', 'Copy outreach']} />

      <div className="sm-live-preview-pane">
        <p className="sm-live-preview-label">Lead queue</p>
        <PreviewRow meta="website + phone + fit reasons" state="saved" title="Summit Fleet Supply" />
        <PreviewRow meta="directory listing + mobile number" note="copy outreach" state="outreach" title="Meridian Auto Parts" />
        <PreviewRow meta="maps listing + website" state="qualified" title="Northstar Wheels" />
      </div>

      <div className="sm-live-preview-footer">
        <span>Next action: send first outreach and push qualified leads into discovery.</span>
      </div>
    </PreviewFrame>
  )
}

function ServiceDeskPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Operator wedge" subtitle="Front desk POS + daily close" title="Spa Service Desk">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Checkouts" value="6 today" />
        <PreviewMetric label="Cash on hand" value="THB 5.8k" />
        <PreviewMetric label="Pending" value="1 checkout" />
      </div>
      <PreviewActions items={['Add checkout', 'Log expense', 'Close day']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Reception desk</p>
          <PreviewRow meta="signature package | room 2 | Mya" state="needs close" title="Alicia T." />
          <PreviewRow meta="glow facial + serum | card" note="member upsell" state="paid" title="Mina K." />
          <PreviewRow meta="walk-in foot reset | cash" state="queued" title="Walk-in guest" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">AI support</p>
          <PreviewTask due="17:30" owner="Daily Close Clerk" title="Drafted till count and deposit target" />
          <PreviewTask due="18:00" owner="Booking Concierge" title="Prepared tomorrow reminder list" />
          <PreviewTask due="18:30" owner="Stock Watch" title="Flagged low aroma oil inventory" />
        </section>
      </div>
    </PreviewFrame>
  )
}

function CompanyCleanupPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Product view" subtitle="Imported rows + follow-up cleanup" title="List Cleanup Desk">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Imported" value="128 rows" />
        <PreviewMetric label="Merged" value="24 duplicates" />
        <PreviewMetric label="Next" value="18 tasks" />
      </div>
      <PreviewActions items={['Import CSV', 'Merge duplicates', 'Assign owner']} />

      <div className="sm-live-preview-pane">
        <p className="sm-live-preview-label">Source cleanup</p>
        <PreviewRow meta="Excel export | contact recovered" state="kept" title="Apex Distribution Co." />
        <PreviewRow meta="form capture | duplicate merged" note="owner assigned" state="merged" title="Silver Lotus Imports" />
        <PreviewRow meta="chat note | website missing" state="review" title="Global Parts Link" />
      </div>

      <div className="sm-live-preview-footer">
        <span>Next action: clean the kept rows, assign the owner, and open the task queue.</span>
      </div>
    </PreviewFrame>
  )
}

function ReceivingControlPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Product view" subtitle="Receiving log + exception queue" title="Receiving Control">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Open issues" value="04" />
        <PreviewMetric label="High priority" value="02" />
        <PreviewMetric label="Next review" value="15:30" />
      </div>
      <PreviewActions items={['Log receipt', 'Open supplier chase', 'Escalate hold']} />

      <div className="sm-live-preview-pane">
        <p className="sm-live-preview-label">Exception queue</p>
        <PreviewRow meta="truck 18 | customs document missing" state="hold" title="Compound batch receipt" />
        <PreviewRow meta="PO 44-81 | quantity variance 12 units" note="procurement owner" state="investigate" title="Fleet tyre delivery" />
        <PreviewRow meta="GRN pending | supplier follow-up sent" state="waiting" title="Rubber additive intake" />
      </div>

      <div className="sm-live-preview-footer">
        <span>Next action: close the GRN gap, release the hold, and keep the queue short.</span>
      </div>
    </PreviewFrame>
  )
}

function IndustrialDqmsPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Quality desk" subtitle="Industrial DQMS + gap-analysis methods" title="Industrial DQMS">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Open CAPA" value="06" />
        <PreviewMetric label="Defect drift" value="+0.8%" />
        <PreviewMetric label="Manager review" value="16:00" />
      </div>
      <PreviewActions items={['Open fishbone', 'Review KPI gap', 'Assign countermeasure']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Quality cases</p>
          <PreviewRow meta="sidewall crack | curing line 2" state="contain" title="Defect cluster review" />
          <PreviewRow meta="compound batch genealogy linked" note="owner assigned" state="capa" title="Batch variance investigation" />
          <PreviewRow meta="downtime + scrap signal" state="fishbone" title="Repeat failure analysis" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Methods and actions</p>
          <PreviewTask due="10:30" owner="Quality Architect" title="Drafted 5W1H and Ishikawa starter" />
          <PreviewTask due="13:00" owner="Plant Manager" title="Review containment and responsible owner" />
          <PreviewTask due="16:00" owner="Director" title="Close KPI gap review with countermeasure" />
        </section>
      </div>
    </PreviewFrame>
  )
}

function KnowledgeGraphPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Shared memory" subtitle="Documents, entities, relations, and provenance" title="Knowledge Graph">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Docs indexed" value="1,284" />
        <PreviewMetric label="Entity links" value="8.7k" />
        <PreviewMetric label="Needs review" value="14" />
      </div>
      <PreviewActions items={['Open canon', 'Review entities', 'Repair provenance']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Canonical records</p>
          <PreviewRow meta="supplier | docs + approvals + incidents" state="linked" title="Golden Road Rubber" />
          <PreviewRow meta="plant batch | genealogy + CAPA + lab" state="provenance" title="BATCH-C2404-18" />
          <PreviewRow meta="dealer account | mail + quote + visit notes" state="memory" title="Delta Truck Centre" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Graph repair loop</p>
          <PreviewTask due="09:15" owner="Memory Curator" title="Resolved duplicate supplier entity pair" />
          <PreviewTask due="11:00" owner="Operator Review" title="Approved document canon promotion" />
          <PreviewTask due="14:00" owner="Knowledge Curator" title="Published new relation pack for incidents" />
        </section>
      </div>
    </PreviewFrame>
  )
}

function AgentRuntimePreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Governed automation" subtitle="Jobs, reviews, and runtime posture" title="Agent Runtime">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Core loops" value="11 running" />
        <PreviewMetric label="Pending review" value="03" />
        <PreviewMetric label="Stale jobs" value="01" />
      </div>
      <PreviewActions items={['Run cycle', 'Inspect job', 'Review gate']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Run board</p>
          <PreviewRow meta="task triage | ytf-plant-a" state="done" title="Inbox routing cycle" />
          <PreviewRow meta="ops watch | ytf-plant-a" note="needs retry" state="warning" title="Exception sweep" />
          <PreviewRow meta="founder brief | supermega-core" state="queued" title="Executive review pack" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Guardrails</p>
          <PreviewTask due="Now" owner="Runtime Orchestrator" title="Block unsafe write outside approval gate" />
          <PreviewTask due="12:00" owner="Platform Admin" title="Review autonomy score drift" />
          <PreviewTask due="16:00" owner="Tenant Operator" title="Confirm rollout-safe job bundle" />
        </section>
      </div>
    </PreviewFrame>
  )
}

function TenantControlPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Launch control" subtitle="Roles, rollout, connectors, and domains" title="Tenant Control Plane">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Live tenant" value="Yangon Tyre" />
        <PreviewMetric label="Open rollout" value="06 tasks" />
        <PreviewMetric label="Roles scoped" value="sales / ops / qc / ceo" />
      </div>
      <PreviewActions items={['Open rollout', 'Review roles', 'Check connectors']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Launch pack</p>
          <PreviewRow meta="wedge product | receiving control" state="active" title="Tenant rollout lane" />
          <PreviewRow meta="connector map | Gmail, Drive, ERP" note="review gates set" state="ready" title="Source posture" />
          <PreviewRow meta="domain + role model + modules" state="approved" title="Workspace contract" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Next actions</p>
          <PreviewTask due="Today" owner="Tenant Operator" title="Close open launch blockers" />
          <PreviewTask due="Today" owner="Admin" title="Review connector scopes and write rules" />
          <PreviewTask due="Tomorrow" owner="Implementation Lead" title="Prepare next module rollout lane" />
        </section>
      </div>
    </PreviewFrame>
  )
}

function DataSciencePreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Operating intelligence" subtitle="Forecasts, anomalies, and scenario scoring" title="Data Science Studio">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Forecast risk" value="Medium" />
        <PreviewMetric label="Anomalies" value="04" />
        <PreviewMetric label="Next action" value="09 queued" />
      </div>
      <PreviewActions items={['Refresh feature mart', 'Review anomaly', 'Score scenario']} />

      <div className="sm-live-preview-split">
        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Feature mart</p>
          <PreviewRow meta="sales + ops + quality + approvals" state="fresh" title="Unified operating dataset" />
          <PreviewRow meta="downtime, scrap, and supplier lag" state="modeled" title="Plant risk factors" />
          <PreviewRow meta="pipeline and collections drift" note="ceo review" state="scored" title="Commercial risk score" />
        </section>

        <section className="sm-live-preview-pane">
          <p className="sm-live-preview-label">Decision loop</p>
          <PreviewTask due="11:00" owner="Forecast Analyst" title="Refresh weekly throughput forecast" />
          <PreviewTask due="13:30" owner="Director" title="Review anomaly cluster and intervention" />
          <PreviewTask due="17:00" owner="Ops Watch" title="Push next-best-action into queue owners" />
        </section>
      </div>
    </PreviewFrame>
  )
}

export function LiveProductPreview({ variant, className, compact = false }: LiveProductPreviewProps) {
  if (variant === 'portal') {
    return <PortalPreview className={className} compact={compact} />
  }
  if (variant === 'ytf-portal') {
    return <YangonTyrePortalPreview className={className} compact={compact} />
  }
  if (variant === 'founder-brief') {
    return <FounderBriefPreview className={className} compact={compact} />
  }
  if (variant === 'service-desk') {
    return <ServiceDeskPreview className={className} compact={compact} />
  }
  if (variant === 'company-cleanup') {
    return <CompanyCleanupPreview className={className} compact={compact} />
  }
  if (variant === 'receiving-control') {
    return <ReceivingControlPreview className={className} compact={compact} />
  }
  if (variant === 'industrial-dqms') {
    return <IndustrialDqmsPreview className={className} compact={compact} />
  }
  if (variant === 'knowledge-graph') {
    return <KnowledgeGraphPreview className={className} compact={compact} />
  }
  if (variant === 'agent-runtime') {
    return <AgentRuntimePreview className={className} compact={compact} />
  }
  if (variant === 'tenant-control') {
    return <TenantControlPreview className={className} compact={compact} />
  }
  if (variant === 'data-science') {
    return <DataSciencePreview className={className} compact={compact} />
  }
  return <SalesSetupPreview className={className} compact={compact} />
}
