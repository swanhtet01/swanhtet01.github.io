import { useMemo, useState } from 'react'

const workflowTemplates = [
  {
    id: 'lead-desk',
    label: 'Quote intake ledger',
    replaces: 'Requests, attachments, and missing fields',
    setup: 'Inbound request, supporting files, owner review, export pack.',
    sources: ['Gmail', 'CRM CSV', 'Drive quotes'],
    queue: [
      ['New quote request', 'Sales', 'Map requested fields', 'review'],
      ['Attachment missing', 'Owner', 'Request source', 'needs owner'],
      ['Ready for export', 'AI', 'Prepare reviewed row', 'ready'],
    ],
    ai: ['classify request', 'extract fields', 'detect missing files', 'prepare export'],
  },
  {
    id: 'support-desk',
    label: 'Support evidence desk',
    replaces: 'Ticket threads, screenshots, and policy checks',
    setup: 'Tickets, screenshots, policy rules, manager review.',
    sources: ['Support export', 'Screenshots', 'Policy doc'],
    queue: [
      ['Refund request', 'Support', 'Extract claim data', 'review'],
      ['Bug report', 'Product', 'Build evidence row', 'needs proof'],
      ['VIP complaint', 'Owner', 'Flag blocked action', 'needs owner'],
    ],
    ai: ['summarize thread', 'extract policy fields', 'tag risk', 'build proof pack'],
  },
  {
    id: 'finance-desk',
    label: 'Invoice review ledger',
    replaces: 'Invoices, payments, and mismatch checks',
    setup: 'Invoices, payments, mismatch review, export proof.',
    sources: ['Bank CSV', 'Stripe CSV', 'Invoice folder'],
    queue: [
      ['Payment mismatch', 'Finance', 'Match receipt', 'needs proof'],
      ['Invoice missing', 'Ops', 'Request source', 'open'],
      ['Daily close', 'Owner', 'Export pack', 'ready'],
    ],
    ai: ['match records', 'flag variance', 'draft request', 'prepare export'],
  },
  {
    id: 'ops-desk',
    label: 'Ops request ledger',
    replaces: 'Requests, files, and approval history',
    setup: 'Requests, files, approval state, release checklist.',
    sources: ['Form export', 'Drive folder', 'Task board'],
    queue: [
      ['Vendor request', 'Ops', 'Approve scope', 'needs owner'],
      ['Policy update', 'Admin', 'Attach source', 'needs proof'],
      ['Release task', 'AI', 'Checklist', 'ready'],
    ],
    ai: ['map workflow', 'assign owner', 'check source', 'write release note'],
  },
] as const

const sourceConnectors = [
  ['Gmail / Outlook', 'email threads and attachments'],
  ['Drive / SharePoint', 'folders, PDFs, photos, docs'],
  ['Sheets / CSV', 'exports, lists, ledgers'],
  ['Slack / WhatsApp export', 'chat handoffs and screenshots'],
  ['CRM / ticket export', 'HubSpot, Salesforce, Zendesk, Intercom CSV'],
  ['Finance export', 'Stripe, QuickBooks, bank CSV'],
] as const

const setupSteps = [
  ['1', 'Pick template', 'Choose the workflow shape that matches the source files.'],
  ['2', 'Add source', 'Upload or link five real samples.'],
  ['3', 'Map fields', 'AI extracts entities, statuses, owners, and risks.'],
  ['4', 'Set gate', 'Approve before email, billing, claims, or writeback.'],
  ['5', 'Launch desk', 'Queue, proof pack, owner report, and QA checks.'],
] as const

const aiModules = [
  ['Source mapper', 'turns messy input into typed records'],
  ['Workflow compiler', 'creates steps, owners, statuses, and gates'],
  ['Agent runbook', 'drafts work without external consequences'],
  ['Eval harness', 'checks outputs against accepted examples'],
  ['Permission guard', 'blocks browser, file, and writeback actions'],
  ['Proof pack', 'shows sources, decisions, checks, and ROI'],
] as const

type WorkflowTemplateId = (typeof workflowTemplates)[number]['id']
type SourceConnectorLabel = (typeof sourceConnectors)[number][0]

export function AiWorkflowDeskAppPage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<WorkflowTemplateId>('lead-desk')
  const [selectedSource, setSelectedSource] = useState<SourceConnectorLabel>(sourceConnectors[0][0])
  const [operatorNote, setOperatorNote] = useState('Setup needs one real source sample')
  const selectedTemplate = useMemo(
    () => workflowTemplates.find((template) => template.id === selectedTemplateId) ?? workflowTemplates[0],
    [selectedTemplateId],
  )
  const selectedSourceDetail = sourceConnectors.find(([label]) => label === selectedSource)?.[1] ?? sourceConnectors[0][1]
  const readiness = [
    ['Templates', String(workflowTemplates.length)],
    ['Sources', String(sourceConnectors.length)],
    ['AI modules', String(aiModules.length)],
    ['Gate', 'human approve'],
  ] as const

  return (
    <div className="sm-product-app-screen sm-workflow-desk-screen">
      <section className="sm-product-app-topline sm-workflow-desk-topline" aria-label="Document Extraction Ledger status">
        <div>
          <p>Document Extraction Ledger</p>
          <strong>{selectedTemplate.label}</strong>
          <small>{selectedTemplate.replaces}</small>
        </div>
        <span>{operatorNote}</span>
      </section>

      <section className="sm-workflow-desk-grid" aria-label="Document Extraction Ledger setup">
        <article className="sm-product-app-panel sm-workflow-template-panel">
          <div className="sm-product-app-panel-head">
            <span>Setup template</span>
            <strong>plug in</strong>
          </div>
          <div className="sm-workflow-template-list">
            {workflowTemplates.map((template) => (
              <button
                className={`sm-workflow-template-button ${selectedTemplate.id === template.id ? 'is-active' : ''}`}
                key={template.id}
                onClick={() => {
                  setSelectedTemplateId(template.id)
                  setOperatorNote(`${template.label} selected`)
                }}
                type="button"
              >
                <strong>{template.label}</strong>
                <span>{template.replaces}</span>
                <small>{template.setup}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="sm-product-app-panel sm-workflow-build-panel">
          <div className="sm-product-app-panel-head">
            <span>Install plan</span>
            <strong>5 steps</strong>
          </div>
          <div className="sm-workflow-setup-steps">
            {setupSteps.map(([number, label, detail]) => (
              <div key={label}>
                <b>{number}</b>
                <span>{label}</span>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <div className="sm-workflow-action-box">
            <span>Selected source</span>
            <strong>{selectedSource}</strong>
            <p>{selectedSourceDetail}. First launch stays upload-first until account access is approved.</p>
            <div className="sm-product-app-actions">
              <button className="sm-button-primary" onClick={() => setOperatorNote(`Setup plan generated for ${selectedTemplate.label}`)} type="button">
                Build setup plan
              </button>
              <button className="sm-button-secondary" onClick={() => setOperatorNote(`First queue created from ${selectedSource}`)} type="button">
                Create queue
              </button>
              <button className="sm-button-secondary" onClick={() => setOperatorNote('Guardrails checked: approval gate active')} type="button">
                Run checks
              </button>
            </div>
          </div>
        </article>

        <article className="sm-product-app-panel sm-workflow-source-panel">
          <div className="sm-product-app-panel-head">
            <span>Sources</span>
            <strong>approved only</strong>
          </div>
          <div className="sm-workflow-source-grid">
            {sourceConnectors.map(([label, detail]) => (
              <button
                className={`sm-workflow-source-button ${selectedSource === label ? 'is-active' : ''}`}
                key={label}
                onClick={() => {
                  setSelectedSource(label)
                  setOperatorNote(`${label} source selected`)
                }}
                type="button"
              >
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <div className="sm-workflow-ai-stack">
            {aiModules.map(([label, detail]) => (
              <p key={label}>
                <span>{label}</span>
                <small>{detail}</small>
              </p>
            ))}
          </div>
        </article>

        <article className="sm-product-app-panel sm-workflow-queue-panel">
          <div className="sm-product-app-panel-head">
            <span>First queue</span>
            <strong>{selectedTemplate.queue.length} items</strong>
          </div>
          <div className="sm-workflow-queue-list">
            {selectedTemplate.queue.map(([title, owner, next, state]) => (
              <button
                className="sm-product-app-row"
                key={title}
                onClick={() => setOperatorNote(`${title}: ${next}`)}
                type="button"
              >
                <strong>{title}</strong>
                <span>{owner} / {state}</span>
                <small>{next}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="sm-product-app-panel sm-product-proof-strip sm-workflow-proof-strip" aria-label="Document Extraction Ledger readiness">
          {readiness.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </article>
      </section>
    </div>
  )
}
