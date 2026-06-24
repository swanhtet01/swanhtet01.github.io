import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { productIntegrationPlaybooks } from '../lib/demoSurfaces'
import { resolveProductAppEntryRoute, resolveProductWorkspaceRoute } from '../lib/demoSurfaces'
import { companyClientSetupContracts } from '../lib/companyGapFixPlan'
import { productActivationPackages } from '../lib/productActivationPackages'
import { PRODUCT_KERNEL } from '../lib/productKernel'
import { PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID } from '../lib/publicProductAliases'

const productGalleries = [
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'],
    headline: 'Client requests, assets, approvals, follow-ups, and weekly reports in one queue.',
    line: 'For agencies that need more delivery capacity without adding another coordinator for every client.',
    setup: 'Send one client inbox thread, project tracker, weekly report example, and approval rule.',
    includes: 'Client intake, missing-asset queue, draft updates, approval follow-up, weekly report, and proof ledger.',
    portalId: 'agency-client-operator',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'],
    headline: 'Requests, files, proof, and next action.',
    line: 'For repeated work that keeps moving through email, Drive, sheets, screenshots, and chat.',
    setup: 'Send an email thread, spreadsheet, folder, screenshots, or the current checklist.',
    includes: 'Source intake, work queue, owner review, approvals, exports, and proof pack.',
    portalId: 'ai-workflow-desk',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agentops-toolbox'],
    headline: 'Quote intake, support triage, document extraction, CRM review, and portal work in one review queue.',
    line: 'For teams that want repetitive back-office work prepared automatically while approvals, proof, and blocked actions stay visible.',
    setup: 'Send one repeated workflow, five source examples, the reviewer, and actions that must stay approval-only.',
    includes: 'Workflow scope, source intake, review queue, approval policy, run ledger, and weekly improvement loop.',
    portalId: 'agentops-toolbox',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'],
    headline: 'Issues, assets, readings, and manager actions.',
    line: 'For factory work that needs QC, maintenance, receiving, assets, and evidence in one operating screen.',
    setup: 'Send an issue log, asset list, QC record, maintenance sheet, meter photo, or manager note.',
    includes: 'Asset map, WCM board, ISO evidence, NCR/CAPA review, maintenance, and manager closeout.',
    portalId: 'operations-digital-twin',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'],
    headline: 'Orders, payment proof, stock, and daily close.',
    line: 'For shops and restaurants that need a simple counter system before a larger ERP.',
    setup: 'Send a menu sheet, payment proof, stock note, shift close, or cash-up process.',
    includes: 'Menu and QR, orders, payment proof, stock notes, shift close, and owner report.',
    portalId: 'restaurant-group-os',
  },
] as const

const contactPackages = {
  'agency-client-operator': 'agency-client-operator',
  'ai-workflow-desk': 'document-extraction-ledger',
  'agentops-toolbox': 'back-office-workflow-desk',
  'operations-digital-twin': 'factory-issues-maintenance-quality',
  'restaurant-group-os': 'restaurant-pos-menu-inventory',
} as const

type ProductPortalId = keyof typeof contactPackages

const publicProductAliases: Record<string, ProductPortalId> = {
  agentops: 'agentops-toolbox',
  'agentops-toolbox': 'agentops-toolbox',
  'ai-agent-operator': 'agentops-toolbox',
  'ai-back-office': 'agentops-toolbox',
  'back-office-operator': 'agentops-toolbox',
  'back-office-workflow-desk': 'agentops-toolbox',
  'agency-client-operator': 'agency-client-operator',
  'build-app-from-workflow': 'ai-workflow-desk',
  'document-extraction-ledger': 'ai-workflow-desk',
  'factory-operations-app': 'operations-digital-twin',
  'factory-issues-maintenance-quality': 'operations-digital-twin',
  'restaurant-pos-inventory': 'restaurant-group-os',
  'restaurant-pos-menu-inventory': 'restaurant-group-os',
}

function contactHref(portalId: keyof typeof contactPackages) {
  return `/contact/?package=${encodeURIComponent(contactPackages[portalId])}`
}

function isProductPortalId(value: string | null): value is ProductPortalId {
  return Boolean(value && value in contactPackages)
}

function resolveProductPortalId(value: string | null) {
  if (isProductPortalId(value)) return value
  return value ? publicProductAliases[value] : undefined
}

const activationStatusByPackage = {
  'agency-client-operator': 'Paid-pilot ready',
  'document-extraction-ledger': 'Workflow-ready setup',
  'back-office-workflow-desk': 'Managed queue ready',
  'factory-issues-maintenance-quality': 'Pilot-ready workflow',
  'restaurant-pos-menu-inventory': 'Shift-ready product',
} as const

export function ProductsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectedProductId = useMemo(() => {
    const value = new URLSearchParams(location.search).get('product')
    return resolveProductPortalId(value) ?? 'agency-client-operator'
  }, [location.search])
  const selectedProduct = productGalleries.find((product) => product.portalId === selectedProductId) ?? productGalleries[0]
  const selectedKernel = PRODUCT_KERNEL.find((product) => product.liveRoute === selectedProduct.route)
  const selectedPlaybook = productIntegrationPlaybooks[selectedProduct.portalId]
  const selectedPackage = contactPackages[selectedProduct.portalId]
  const selectedAppEntryRoute = resolveProductAppEntryRoute(selectedProduct.portalId, selectedProduct.route)
  const selectedWorkspaceRoute = resolveProductWorkspaceRoute(selectedProduct.portalId, selectedProduct.route)
  const selectedActivation = productActivationPackages[selectedProduct.portalId]
  const selectedActivationKitPath = `/site/activation-kits/${selectedActivation.packageId}.md`
  const selectedActivationJsonPath = `/site/activation-kits/${selectedActivation.packageId}.json`
  const selectedInstallKitPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.md` : ''
  const selectedInstallJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.json` : ''
  const selectedInstallGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.goose.md` : ''
  const selectedInstallOpenAiPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.openai-agents.json` : ''
  const selectedInstallN8nPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.n8n.workflow.json` : ''
  const selectedInstallStagehandPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.stagehand.json` : ''
  const selectedInstallLangfusePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.langfuse.json` : ''
  const selectedSampleIntakePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sample-intake-report.md` : ''
  const selectedSampleIntakeJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sample-intake-report.json` : ''
  const selectedBuyerIntakeRoomPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.buyer-intake-room.html` : ''
  const selectedBuyerIntakeRoomJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.buyer-intake-room.json` : ''
  const selectedBuyerIntakeRoomMdPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.buyer-intake-room.md` : ''
  const selectedBuyerIntakeGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.buyer-intake-goose.md` : ''
  const selectedPilotProofPacketPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.pilot-proof-packet.md` : ''
  const selectedPaymentRequestDraftPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.payment-request-draft.md` : ''
  const selectedSalesHandoffPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.md` : ''
  const selectedSalesHandoffJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.json` : ''
  const selectedSalesHandoffCrmPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.crm-draft.csv` : ''
  const selectedSalesHandoffEmailPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.email-draft.md` : ''
  const selectedSalesHandoffStripePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.stripe-checklist.md` : ''
  const selectedSalesHandoffGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.sales-handoff.goose.md` : ''
  const selectedRevenueActivationPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.html` : ''
  const selectedRevenueActivationJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.json` : ''
  const selectedRevenueActivationMdPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.md` : ''
  const selectedRevenueActivationQueuePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.owner-action-queue.csv` : ''
  const selectedRevenueActivationPaymentPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.payment-proof-ledger.csv` : ''
  const selectedRevenueActivationGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/product-install-kits/${selectedActivation.packageId}.revenue-activation.goose.md` : ''
  const selectedSalesSprintPath = `/site/sales-sprints/${selectedActivation.packageId}.md`
  const selectedSalesSprintJsonPath = `/site/sales-sprints/${selectedActivation.packageId}.json`
  const selectedGooseRecipePath = `/site/sales-sprints/${selectedActivation.packageId}.goose.md`
  const selectedFirstWavePacketPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave/${selectedActivation.packageId}.md` : ''
  const selectedFirstWavePacketJsonPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave/${selectedActivation.packageId}.json` : ''
  const selectedFirstWaveApprovalsPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave/${selectedActivation.packageId}.approvals.csv` : ''
  const selectedFirstWaveRuntimePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-runtime/${selectedActivation.packageId}.md` : ''
  const selectedFirstWaveProspectsPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-prospects/${selectedActivation.packageId}.md` : ''
  const selectedFirstWaveProspectsCsvPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-prospects/${selectedActivation.packageId}.prospects.csv` : ''
  const selectedFirstWaveAccountBriefsPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-account-briefs/${selectedActivation.packageId}.md` : ''
  const selectedFirstWaveAccountBriefApprovalsPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-account-briefs/${selectedActivation.packageId}.approvals.csv` : ''
  const selectedFirstWaveAccountBriefGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-account-briefs/${selectedActivation.packageId}.goose.md` : ''
  const selectedFirstWavePilotClosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.md` : ''
  const selectedFirstWavePilotCallScriptPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.call-script.md` : ''
  const selectedFirstWavePilotReplyTrackerPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.reply-tracker.csv` : ''
  const selectedFirstWavePilotPaymentLedgerPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.payment-proof-ledger.csv` : ''
  const selectedFirstWavePilotGoosePath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.goose.md` : ''
  const selectedFirstWavePilotOpenAiPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.openai-agents.json` : ''
  const selectedFirstWavePilotN8nPath =
    selectedActivation.packageId === 'agency-client-operator' ? `/site/first-wave-pilot-close/${selectedActivation.packageId}.n8n.workflow.json` : ''
  const selectedSetupContract =
    companyClientSetupContracts.find((contract) => contract.publicPackage === selectedPackage) ?? companyClientSetupContracts[0]

  useEffect(() => {
    const productPortalId = resolveProductPortalId(location.hash.replace(/^#/, ''))
    if (productPortalId) {
      navigate(`/products/?product=${encodeURIComponent(productPortalId)}`, { replace: true })
    }
  }, [location.hash, navigate])

  return (
    <div className="sm-products-one-page" aria-label="SuperMega product cockpit">
      <aside className="sm-products-selector" aria-label="Products">
        {productGalleries.map((product) => {
          const kernel = PRODUCT_KERNEL.find((item) => item.liveRoute === product.route)
          const active = selectedProduct.portalId === product.portalId
          return (
            <button
              aria-pressed={active}
              className={`sm-products-selector-card ${active ? 'is-active' : ''}`}
              key={product.portalId}
              onClick={() => navigate(`/products/?product=${encodeURIComponent(product.portalId)}`, { replace: true })}
              type="button"
            >
              <span>{kernel?.status === 'proof-route' ? 'Proof route' : 'Ready route'}</span>
              <strong>{product.publicName}</strong>
              <small>{kernel?.readiness ?? 0}% ready</small>
            </button>
          )
        })}
      </aside>

      <section className="sm-products-command" aria-label={`${selectedProduct.publicName} workbench`}>
        <div className="sm-products-command-head">
          <div>
            <p>{selectedProduct.publicName}</p>
            <strong>{selectedProduct.headline}</strong>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--sm-muted)]">{selectedProduct.line}</p>
          </div>
          <div className="sm-products-command-actions">
            <Link className="sm-button-secondary" to={selectedAppEntryRoute}>
              Open app
            </Link>
            {selectedInstallKitPath ? (
              <a className="sm-button-secondary" href={selectedInstallKitPath}>
                Install kit
              </a>
            ) : null}
            {selectedSampleIntakePath ? (
              <a className="sm-button-secondary" href={selectedSampleIntakePath}>
                Sample proof
              </a>
            ) : null}
            {selectedBuyerIntakeRoomPath ? (
              <a className="sm-button-secondary" href={selectedBuyerIntakeRoomPath}>
                Buyer intake
              </a>
            ) : null}
            {selectedSalesHandoffPath ? (
              <a className="sm-button-secondary" href={selectedSalesHandoffPath}>
                Sales handoff
              </a>
            ) : null}
            {selectedRevenueActivationPath ? (
              <a className="sm-button-secondary" href={selectedRevenueActivationPath}>
                Revenue console
              </a>
            ) : null}
            {selectedFirstWaveRuntimePath ? (
              <a className="sm-button-secondary" href={selectedFirstWaveRuntimePath}>
                Runtime kit
              </a>
            ) : null}
            {selectedFirstWavePilotClosePath ? (
              <a className="sm-button-secondary" href={selectedFirstWavePilotClosePath}>
                Close packet
              </a>
            ) : null}
            <Link className="sm-button-primary" to={contactHref(selectedProduct.portalId)}>
              Start setup
            </Link>
          </div>
        </div>

        <div className="sm-products-activation-rail" aria-label="Practical application summary">
          <article>
            <span>Start with</span>
            <strong>{selectedActivation.quickStart}</strong>
          </article>
          <article>
            <span>Application shape</span>
            <strong>{selectedActivation.packageOutcome}</strong>
          </article>
          <article>
            <span>Install package</span>
            <strong>{selectedActivation.pilotPrice.split(',')[0]}</strong>
            <small>{selectedActivation.installTime}</small>
          </article>
        </div>

        <div className="sm-products-command-grid">
          <article className="sm-products-utility-panel sm-products-preview-panel">
            <img alt={`${selectedProduct.publicName} product screen`} src={selectedProduct.mainShot} />
            <div>
              <span>First result</span>
              <strong>{selectedKernel?.firstResult}</strong>
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Modules</span>
            <div className="sm-products-module-list">
              {(selectedKernel?.includedModules ?? []).map((module) => (
                <Link key={module} to={selectedWorkspaceRoute}>
                  {module}
                </Link>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Plug-and-play kit</span>
            <p>{selectedActivation.offer}</p>
            <div className="sm-products-check-list">
              {selectedActivation.includedKit.map((item) => (
                <strong key={item}>{item}</strong>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Automation pipeline</span>
            <div className="sm-products-path-list">
              {selectedActivation.automationPipeline.map((step, index) => (
                <strong key={step}>
                  <small>{index + 1}</small>
                  {step}
                </strong>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Repos and tools to add</span>
            <div className="sm-products-stack-list">
              {selectedActivation.repoStack.map((tool) => (
                <strong key={tool}>{tool}</strong>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Buyer activation packet</span>
            <p>Generated sales, onboarding, runtime, and proof-gate packet for this product.</p>
            <div className="sm-products-packet-actions">
              <a href={selectedActivationKitPath}>Open kit</a>
              <a href={selectedActivationJsonPath}>Machine JSON</a>
            </div>
          </article>

          {selectedInstallKitPath ? (
            <article className="sm-products-utility-panel">
              <span>Installable product skeleton</span>
              <p>Template folder, draft runtime workspace, approval queues, tool policy, and AI-agent manifests for a first client install.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedInstallKitPath}>Install kit</a>
                <a href={selectedInstallJsonPath}>Install JSON</a>
                <a href={selectedInstallGoosePath}>Goose runbook</a>
                <a href={selectedInstallOpenAiPath}>OpenAI manifest</a>
                <a href={selectedInstallN8nPath}>n8n draft</a>
                <a href={selectedInstallStagehandPath}>Stagehand plan</a>
                <a href={selectedInstallLangfusePath}>Langfuse evals</a>
              </div>
            </article>
          ) : null}

          {selectedSampleIntakePath ? (
            <article className="sm-products-utility-panel">
              <span>First sample intake proof</span>
              <p>Redacted workflow sample converted into draft-only queue rows, missing-asset asks, approval gates, and a weekly report draft.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedSampleIntakePath}>Sample intake proof</a>
                <a href={selectedSampleIntakeJsonPath}>Sample JSON</a>
              </div>
            </article>
          ) : null}

          {selectedBuyerIntakeRoomPath ? (
            <article className="sm-products-utility-panel">
              <span>Owner-approved buyer intake room</span>
              <p>Buyer-facing room for one redacted workflow sample, pilot proof packet, and payment request draft. No live sends or payment links.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedBuyerIntakeRoomPath}>Open intake room</a>
                <a href={selectedBuyerIntakeRoomMdPath}>Room markdown</a>
                <a href={selectedBuyerIntakeRoomJsonPath}>Room JSON</a>
                <a href={selectedBuyerIntakeGoosePath}>Goose runbook</a>
                <a href={selectedPilotProofPacketPath}>Pilot proof packet</a>
                <a href={selectedPaymentRequestDraftPath}>Payment request draft</a>
              </div>
            </article>
          ) : null}

          {selectedSalesHandoffPath ? (
            <article className="sm-products-utility-panel">
              <span>Proof-to-sales handoff</span>
              <p>Turns the local pilot proof into draft CRM, owner email, Stripe/payment checklist, and Goose handoff. Owner approval stays required.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedSalesHandoffPath}>Open handoff</a>
                <a href={selectedSalesHandoffJsonPath}>Handoff JSON</a>
                <a href={selectedSalesHandoffCrmPath}>CRM draft row</a>
                <a href={selectedSalesHandoffEmailPath}>Email draft</a>
                <a href={selectedSalesHandoffStripePath}>Payment checklist</a>
                <a href={selectedSalesHandoffGoosePath}>Goose runbook</a>
              </div>
            </article>
          ) : null}

          {selectedRevenueActivationPath ? (
            <article className="sm-products-utility-panel">
              <span>Revenue activation console</span>
              <p>Owner-controlled console for send approval, payment-link creation, payment proof import, and order-room start. No action leaves draft mode here.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedRevenueActivationPath}>Open console</a>
                <a href={selectedRevenueActivationMdPath}>Console markdown</a>
                <a href={selectedRevenueActivationJsonPath}>Console JSON</a>
                <a href={selectedRevenueActivationQueuePath}>Owner action queue</a>
                <a href={selectedRevenueActivationPaymentPath}>Payment ledger</a>
                <a href={selectedRevenueActivationGoosePath}>Goose runbook</a>
              </div>
            </article>
          ) : null}

          <article className="sm-products-utility-panel">
            <span>Owner-approved sales sprint</span>
            <p>Draft outreach, 10-day action path, Goose recipe, and proof ledger fields. External sending stays blocked.</p>
            <div className="sm-products-packet-actions">
              <a href={selectedSalesSprintPath}>Open sprint</a>
              <a href={selectedSalesSprintJsonPath}>Sprint JSON</a>
              <a href={selectedGooseRecipePath}>Goose recipe</a>
            </div>
          </article>

          {selectedFirstWavePacketPath ? (
            <article className="sm-products-utility-panel">
              <span>First-wave execution packet</span>
              <p>20 research slots, 10 owner-review rows, proof ledger template, and agent runtime gates for the first paid-pilot push.</p>
              <div className="sm-products-packet-actions">
                <a href={selectedFirstWavePacketPath}>Open packet</a>
                <a href={selectedFirstWavePacketJsonPath}>Packet JSON</a>
                <a href={selectedFirstWaveApprovalsPath}>Approval CSV</a>
                <a href={selectedFirstWaveRuntimePath}>Runtime kit</a>
                <a href={selectedFirstWaveProspectsPath}>Prospect seeds</a>
                <a href={selectedFirstWaveProspectsCsvPath}>Prospects CSV</a>
                <a href={selectedFirstWaveAccountBriefsPath}>Account briefs</a>
                <a href={selectedFirstWaveAccountBriefApprovalsPath}>Brief approvals</a>
                <a href={selectedFirstWaveAccountBriefGoosePath}>Goose brief runbook</a>
                <a href={selectedFirstWavePilotClosePath}>Close packet</a>
                <a href={selectedFirstWavePilotCallScriptPath}>Call script</a>
                <a href={selectedFirstWavePilotReplyTrackerPath}>Reply tracker</a>
                <a href={selectedFirstWavePilotPaymentLedgerPath}>Payment ledger</a>
                <a href={selectedFirstWavePilotGoosePath}>Goose close runbook</a>
                <a href={selectedFirstWavePilotOpenAiPath}>OpenAI close manifest</a>
                <a href={selectedFirstWavePilotN8nPath}>n8n close draft</a>
              </div>
            </article>
          ) : null}

          <article className="sm-products-utility-panel">
            <span>Setup inputs</span>
            <div className="sm-products-source-grid">
              {selectedSetupContract.firstClientSources.map((source) => (
                <strong key={source}>{source}</strong>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Setup questions</span>
            <div className="sm-products-check-list">
              {selectedSetupContract.setupQuestions.map((question) => (
                <strong key={question}>{question}</strong>
              ))}
            </div>
          </article>

          <article className="sm-products-utility-panel">
            <span>Acceptance test</span>
            <p>{selectedSetupContract.acceptanceTests[0]}</p>
          </article>

          <article className="sm-products-utility-panel">
            <span>Launch blockers</span>
            <div className="sm-products-check-list">
              {selectedSetupContract.launchBlockers.map((item) => (
                <strong key={item}>{item}</strong>
              ))}
            </div>
          </article>
        </div>

        <div className="sm-products-activation-rail" aria-label="Product activation plan">
          <article>
            <span>Live status</span>
            <strong>{activationStatusByPackage[selectedPackage]}</strong>
            <small>{selectedActivation.retainerPath}</small>
          </article>
          <article>
            <span>First proof</span>
            <strong>{selectedActivation.firstWorkflow}</strong>
            <small>{selectedActivation.runtimeWorkspace}</small>
          </article>
          <article>
            <span>Approval boundary</span>
            <strong>{selectedActivation.proofGate}</strong>
            <small>{selectedPlaybook.goLiveGate}</small>
          </article>
        </div>
      </section>
    </div>
  )
}
