import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { companyClientSetupContracts } from '../lib/companyGapFixPlan'
import { productActivationPackages, type PublicProductPortalId } from '../lib/productActivationPackages'

const PACKAGE_LABELS: Record<string, string> = {
  'ai-workflow-desk': 'Workflow Desk Deployment Sprint',
  'workflow-desk-sprint': 'Workflow Desk Deployment Sprint',
  'workflow-app-sprint': 'Workflow Desk Deployment Sprint',
  'custom-app-sprint': 'Workflow Desk Deployment Sprint',
  'first-workflow': 'Workflow Desk Deployment Sprint',
  'workflow': 'Workflow Desk Deployment Sprint',
  'build-app-from-workflow': 'Workflow Desk Deployment Sprint',
  'source-intake': 'Document Extraction Ledger',
  'document-intake-data-cleanroom': 'Document Extraction Ledger',
  'document-extraction-ledger': 'Document Extraction Ledger',
  'data-cleanup': 'Document Extraction Ledger',
  'clean-records-room': 'Document Extraction Ledger',
  'agency-client-operator': 'Agency Client Operator',
  'agency-operator': 'Agency Client Operator',
  'client-operator': 'Agency Client Operator',
  agentops: 'Back Office Workflow Desk',
  'agentops-toolbox': 'Back Office Workflow Desk',
  'back-office-workflow-desk': 'Back Office Workflow Desk',
  'ai-agent-operator': 'Back Office Workflow Desk',
  'ai-back-office': 'Back Office Workflow Desk',
  'back-office-operator': 'Back Office Workflow Desk',
  'managed-agent-ops': 'Back Office Workflow Desk',
  'easy-erp': 'Factory Operations App',
  'industrial-plant-os': 'Factory Operations App',
  'factory-desk': 'Factory Operations App',
  'factory': 'Factory Operations App',
  'factory-issues-maintenance-quality': 'Factory Operations App',
  'operations-digital-twin': 'Factory Operations App',
  'operations-twin': 'Factory Operations App',
  'smart-meter-twin': 'Factory Operations App',
  'digital-twin': 'Factory Operations App',
  'restaurant-pos-desk': 'Restaurant POS + Inventory',
  'restaurant-group-os': 'Restaurant POS + Inventory',
  'restaurant-desk': 'Restaurant POS + Inventory',
  'counter': 'Restaurant POS + Inventory',
  'restaurant-pos-menu-inventory': 'Restaurant POS + Inventory',
  'service-desk-pos': 'Restaurant POS + Inventory',
  'service-business-os': 'Restaurant POS + Inventory',
  'managed-workflow-retainer': 'Managed Workflow Desk',
}

const PUBLIC_CONTACT_FLOW_CONTRACT = 'ContactPage'

const PACKAGE_TO_PORTAL_ID: Record<string, PublicProductPortalId> = {
  'agency-client-operator': 'agency-client-operator',
  'document-extraction-ledger': 'ai-workflow-desk',
  'back-office-workflow-desk': 'agentops-toolbox',
  'factory-issues-maintenance-quality': 'operations-digital-twin',
  'restaurant-pos-menu-inventory': 'restaurant-group-os',
}

function requestedPackageFromSearch(search: string) {
  const params = new URLSearchParams(search)
  const key = params.get('package')?.trim() || params.get('wedge')?.trim() || params.get('tool')?.trim() || ''
  return PACKAGE_LABELS[key] ?? 'Back Office Workflow Desk'
}

function requestedPackageKeyFromSearch(search: string) {
  const params = new URLSearchParams(search)
  const key = params.get('package')?.trim() || params.get('wedge')?.trim() || params.get('tool')?.trim() || ''
  return PACKAGE_LABELS[key] ? key : 'back-office-workflow-desk'
}

export function ContactPage() {
  const location = useLocation()
  const requestedPackageKey = useMemo(() => requestedPackageKeyFromSearch(location.search), [location.search])
  const requestedPackage = useMemo(() => requestedPackageFromSearch(location.search), [location.search])
  const setupContract = useMemo(
    () =>
      companyClientSetupContracts.find((contract) => contract.publicPackage === requestedPackageKey || contract.productName === requestedPackage) ??
      companyClientSetupContracts[0],
    [requestedPackage, requestedPackageKey],
  )
  const pagePath = `${location.pathname}${location.search}`
  const [sourceFiles, setSourceFiles] = useState<string[]>([])
  const sourceFileSummary = sourceFiles.length ? sourceFiles.join('; ') : ''
  const sourceRequirements = setupContract.firstClientSources.join(' | ')
  const setupQuestions = setupContract.setupQuestions.join(' | ')
  const integrationOptions = setupContract.integrationOptions.join(' | ')
  const activationPackage = productActivationPackages[PACKAGE_TO_PORTAL_ID[setupContract.publicPackage] ?? 'agentops-toolbox']
  const activationKitPath = `/site/activation-kits/${activationPackage.packageId}.md`
  const activationJsonPath = `/site/activation-kits/${activationPackage.packageId}.json`
  const salesSprintPath = `/site/sales-sprints/${activationPackage.packageId}.md`
  const gooseRecipePath = `/site/sales-sprints/${activationPackage.packageId}.goose.md`
  const firstWavePacketPath = activationPackage.packageId === 'agency-client-operator' ? `/site/first-wave/${activationPackage.packageId}.md` : ''
  const firstWavePacketJsonPath =
    activationPackage.packageId === 'agency-client-operator' ? `/site/first-wave/${activationPackage.packageId}.json` : ''
  const firstWaveApprovalCsvPath =
    activationPackage.packageId === 'agency-client-operator' ? `/site/first-wave/${activationPackage.packageId}.approvals.csv` : ''

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero is-contact" aria-label="Contact SuperMega">
        <div>
          <h1>Send one workflow.</h1>
          <p>Send the source your team already uses.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid sm-contact-tight" aria-label="Contact form">
        <form action="/api/contact-submissions" className="sm-simple-form" encType="multipart/form-data" method="post">
          <div className="sm-simple-fields">
            <input name="workflow" type="hidden" value="First useful build" />
            <input name="first_output" type="hidden" value={requestedPackage} />
            <input name="requested_package" type="hidden" value={requestedPackage} />
            <input name="public_package" type="hidden" value={setupContract.publicPackage} />
            <input name="product_area" type="hidden" value={requestedPackage} />
            <input name="team" type="hidden" value="Owner or first operating team" />
            <input name="data" type="hidden" value={[sourceFileSummary, requestedPackage].filter(Boolean).join(' | ')} />
            <input name="urgency" type="hidden" value="This week" />
            <input name="page_path" type="hidden" value={pagePath} />
            <input name="routing_flow" type="hidden" value={PUBLIC_CONTACT_FLOW_CONTRACT} />
            <input name="source_url" type="hidden" value={`https://supermega.dev${pagePath}`} />
            <input name="referrer" type="hidden" value="" />
            <input name="utm_source" type="hidden" value="" />
            <input name="utm_medium" type="hidden" value="" />
            <input name="utm_campaign" type="hidden" value="" />
            <input name="utm_content" type="hidden" value="" />
            <input name="utm_term" type="hidden" value="" />
            <input name="access_policy" type="hidden" value="approval_required" />
            <input name="workspace_status" type="hidden" value="not_created_until_approved" />
            <input name="management_owner" type="hidden" value="swanhtet@supermega.dev" />
            <input name="source_file_names" type="hidden" value={sourceFileSummary} />
            <input name="source_file_count" type="hidden" value={String(sourceFiles.length)} />
            <input name="source_requirements" type="hidden" value={sourceRequirements} />
            <input name="setup_questions" type="hidden" value={setupQuestions} />
            <input name="integration_options" type="hidden" value={integrationOptions} />
            <input name="activation_package_id" type="hidden" value={activationPackage.packageId} />
            <input name="activation_offer" type="hidden" value={activationPackage.offer} />
            <input name="activation_pilot_price" type="hidden" value={activationPackage.pilotPrice} />
            <input name="activation_runtime_workspace" type="hidden" value={activationPackage.runtimeWorkspace} />
            <input name="activation_repo_stack" type="hidden" value={activationPackage.repoStack.join(' | ')} />
            <input name="activation_pipeline" type="hidden" value={activationPackage.automationPipeline.join(' | ')} />
            <input name="activation_kit_url" type="hidden" value={`https://supermega.dev${activationKitPath}`} />
            <input name="activation_machine_json_url" type="hidden" value={`https://supermega.dev${activationJsonPath}`} />
            <input name="sales_sprint_url" type="hidden" value={`https://supermega.dev${salesSprintPath}`} />
            <input name="goose_recipe_url" type="hidden" value={`https://supermega.dev${gooseRecipePath}`} />
            <input name="first_wave_packet_url" type="hidden" value={firstWavePacketPath ? `https://supermega.dev${firstWavePacketPath}` : ''} />
            <input
              name="first_wave_machine_json_url"
              type="hidden"
              value={firstWavePacketJsonPath ? `https://supermega.dev${firstWavePacketJsonPath}` : ''}
            />
            <input
              name="first_wave_approval_csv_url"
              type="hidden"
              value={firstWaveApprovalCsvPath ? `https://supermega.dev${firstWaveApprovalCsvPath}` : ''}
            />
            <input name="first_proof_target" type="hidden" value={setupContract.firstProofTarget} />
            <input name="acceptance_tests" type="hidden" value={setupContract.acceptanceTests.join(' | ')} />
            <input name="launch_blockers" type="hidden" value={setupContract.launchBlockers.join(' | ')} />
            <input name="automation_boundary" type="hidden" value={setupContract.automationBoundary} />

            <label>
              <span>Name</span>
              <input className="sm-input" name="name" required />
            </label>
            <label>
              <span>Work email</span>
              <input className="sm-input" name="email" required type="email" />
            </label>
            <label>
              <span>Company</span>
              <input className="sm-input" name="company" required />
            </label>
            <label>
              <span>Phone / WhatsApp</span>
              <input className="sm-input" name="phone" type="tel" />
            </label>

            <div className="sm-simple-wide sm-selected-package" aria-label="Selected product path">
              <span>Selected</span>
              <strong>{requestedPackage}</strong>
              <small>{activationPackage.pilotPrice}</small>
              <a href={activationKitPath}>Open activation kit</a>
              <a href={salesSprintPath}>Open sales sprint</a>
              {firstWavePacketPath ? <a href={firstWavePacketPath}>Open first-wave packet</a> : null}
            </div>

            <div className="sm-simple-wide sm-setup-contract" aria-label="Setup contract">
              <div>
                <span>Send first</span>
                <ul>
                  {setupContract.firstClientSources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span>First proof</span>
                <p>{setupContract.acceptanceTests[0]}</p>
              </div>
              <div>
                <span>Install plan</span>
                <p>{activationPackage.installTime}</p>
              </div>
              <div>
                <span>Needed before go-live</span>
                <ul>
                  {setupContract.launchBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            </div>

            <label className="sm-simple-wide">
              <span>Upload source files</span>
              <input
                className="sm-input sm-file-input"
                multiple
                name="source_files"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []).map((file) => `${file.name} (${Math.ceil(file.size / 1024)} KB)`)
                  setSourceFiles(files)
                }}
                type="file"
              />
              {sourceFiles.length ? (
                <div className="sm-upload-list" aria-live="polite">
                  {sourceFiles.map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                </div>
              ) : null}
            </label>

            <label className="sm-simple-wide">
              <span>Paste links or notes</span>
              <textarea
                className="sm-input"
                name="source_links"
                placeholder={`Attach or link: ${setupContract.firstClientSources.join(', ')}.`}
              />
            </label>

            <label className="sm-simple-wide">
              <span>Goal / acceptance</span>
              <textarea
                className="sm-input"
                name="goal"
                placeholder={setupContract.setupQuestions.join(' ')}
                required
              />
            </label>
            <input aria-hidden="true" className="hidden" name="website" tabIndex={-1} />
          </div>

          <div className="sm-simple-action-row">
            <button className="sm-button-primary" type="submit">
              Send request
            </button>
            <a className="sm-link" href="/#products">
              Products
            </a>
          </div>

          <p className="sm-simple-status">No auto account. No data connection before approval.</p>
        </form>
      </section>
    </div>
  )
}
