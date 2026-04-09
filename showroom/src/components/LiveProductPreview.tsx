import type { ReactNode } from 'react'

type LivePreviewVariant = 'portal' | 'founder-brief' | 'sales-setup' | 'company-cleanup' | 'receiving-control'

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
    <PreviewFrame className={joinClassNames('sm-live-preview-portal', className)} compact={compact} status="Live workspace" subtitle="SUPERMEGA.dev modules, data, and agent jobs" title="SM Portal">
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

function SalesSetupPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Live module" subtitle="Find Companies + Company List" title="Distributor Sales Desk">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Search" value="Middle East tyre distributors" />
        <PreviewMetric label="Saved" value="05 shortlist" />
        <PreviewMetric label="Open" value="03 follow-ups" />
      </div>

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

function CompanyCleanupPreview({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <PreviewFrame className={className} compact={compact} status="Live module" subtitle="Imported rows + follow-up cleanup" title="List Cleanup Desk">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Imported" value="128 rows" />
        <PreviewMetric label="Merged" value="24 duplicates" />
        <PreviewMetric label="Next" value="18 tasks" />
      </div>

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
    <PreviewFrame className={className} compact={compact} status="Live module" subtitle="Receiving log + exception queue" title="Receiving Control">
      <div className="sm-live-preview-metrics-grid">
        <PreviewMetric label="Open issues" value="04" />
        <PreviewMetric label="High priority" value="02" />
        <PreviewMetric label="Next review" value="15:30" />
      </div>

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

export function LiveProductPreview({ variant, className, compact = false }: LiveProductPreviewProps) {
  if (variant === 'portal') {
    return <PortalPreview className={className} compact={compact} />
  }
  if (variant === 'founder-brief') {
    return <FounderBriefPreview className={className} compact={compact} />
  }
  if (variant === 'company-cleanup') {
    return <CompanyCleanupPreview className={className} compact={compact} />
  }
  if (variant === 'receiving-control') {
    return <ReceivingControlPreview className={className} compact={compact} />
  }
  return <SalesSetupPreview className={className} compact={compact} />
}
