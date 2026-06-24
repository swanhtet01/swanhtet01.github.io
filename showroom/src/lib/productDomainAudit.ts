export type ProductDomainSurface = {
  host: 'supermega.dev' | 'app.supermega.dev' | 'pos.supermega.dev'
  role: string
  clientExpectation: string
  currentProof: string
  improvement: string
}

export type ProductSetupAudit = {
  productId: string
  productName: string
  surface: string
  buyerJob: string
  currentProof: string
  setupFriction: string[]
  incumbentPatternsToCopy: string[]
  improvements: string[]
  setupSpeedMoves: string[]
  integrationContract: string[]
  status: 'sellable pilot' | 'setup layer' | 'product proof' | 'internal enablement'
  maturityScore: number
}

export const productDomainSurfaces: ProductDomainSurface[] = [
  {
    host: 'supermega.dev',
    role: 'Public product and intake site',
    clientExpectation: 'Understand the products, send one real source, and approve scope before accounts or data connections exist.',
    currentProof: 'Products, contact, pricing, intake, and proof routes already point buyers toward source-first setup.',
    improvement: 'Make every product CTA request setup, show the 48-hour path, and keep private client work out of public pages.',
  },
  {
    host: 'app.supermega.dev',
    role: 'Approved client workspace hub',
    clientExpectation: 'Open the private app only after scope, price, roles, data access, and safety boundary are approved.',
    currentProof: 'The login hub is live and private routes hand off there after approval.',
    improvement: 'Add a client setup checklist, role preview, connector scope packet, and workspace acceptance state before go-live.',
  },
  {
    host: 'pos.supermega.dev',
    role: 'Restaurant POS proof host',
    clientExpectation: 'Try the counter, menu, payment proof, stock, shift close, and owner report flow without confusing it with the private client hub.',
    currentProof: 'The POS proof host is live and separate from the public sales site and approved app hub.',
    improvement: 'Add setup sample data, payment-provider boundary copy, daily-close checklist, and a link back to source-first setup.',
  },
]

export const productSetupSpeedContract = [
  {
    label: 'Day 0',
    title: 'Send one source',
    detail: 'Client sends a file, screenshot, sheet, export, menu, payment proof, issue log, device note, or repeated task.',
    approvalGate: 'No account, connector, charge, or data write before scope approval.',
  },
  {
    label: '48 hours',
    title: 'Receive first app map',
    detail: 'SuperMega replies with the recommended product, first screen, source map, missing fields, price range, and safety boundary.',
    approvalGate: 'Client approves product path, owner, data boundary, timeline, and first acceptance test.',
  },
  {
    label: '7 days',
    title: 'Use first private workspace',
    detail: 'Approved clients get the first usable app route, role setup, source register, proof pack, and next-module checklist.',
    approvalGate: 'External sends, record writes, payments, ERP updates, and automation stay review-gated.',
  },
] as const

export const productDomainSetupAudit: ProductSetupAudit[] = [
  {
    productId: 'ai-workflow-desk',
    productName: 'Back Office Workflow Desk',
    surface: 'supermega.dev/products -> app.supermega.dev/app/custom-workflow',
    buyerJob: 'Replace one messy workflow with a daily work queue that has source, owner, proof, status, and next action.',
    currentProof: 'Product screenshots, source intake, work queue, owner review, proof pack, and contact routing are visible.',
    setupFriction: [
      'Buyer can still be pushed toward login before knowing the setup path.',
      'Source schema, connector scope, and acceptance packet need to be packaged as one client-ready checklist.',
      'Agent simulation, writeback limits, and approval ledger need to be more visible before autonomy is sold.',
    ],
    incumbentPatternsToCopy: [
      'Retool-style components, integrations, permissions, and cloud/self-host clarity.',
      'Zapier-style forms and automation-ready submissions.',
      'Airtable-style shared data, interfaces, and templates for non-technical operators.',
    ],
    improvements: [
      'Make request setup the primary public CTA and reserve app login for approved clients.',
      'Add source-schema builder, duplicate/stale flags, field map, and acceptance packet export.',
      'Add simulation ledger for read, draft, send, update, blocked, and approval-required actions.',
      'Add connector scope cards for Drive, Sheets/CSV, Gmail exports, REST API, and webhook intake.',
    ],
    setupSpeedMoves: [
      'Ask for five source examples instead of asking the buyer to choose tools.',
      'Return first screen, owner queue, missing-source list, and price range within 48 hours.',
      'Ship one private route with role preview, sample data, and proof pack before expanding modules.',
    ],
    integrationContract: [
      'Source system and field map',
      'Read/write boundary and rollback rule',
      'Human approval owner for external sends and record writes',
      'QA replay and proof export before handoff',
    ],
    status: 'sellable pilot',
    maturityScore: 82,
  },
  {
    productId: 'operations-digital-twin',
    productName: 'Factory Operations App',
    surface: 'supermega.dev/products -> app.supermega.dev/app/factory-operations',
    buyerJob: 'Give plant managers one control surface for issues, assets, readings, CAPA, maintenance, receiving, and evidence.',
    currentProof: 'Factory product screenshots show WCM board, assets, ISO evidence, manager actions, and source packets.',
    setupFriction: [
      'Factory buyers expect work orders, assets, barcode/QR, CAPA, maintenance metrics, and mobile evidence.',
      'Hardware and ERP writeback must be explicitly separated from first source-proof setup.',
      'Operator mobile capture needs proof that text, camera upload, and review states work under factory conditions.',
    ],
    incumbentPatternsToCopy: [
      'Tulip-style app suites, PDF/SOP-to-app setup, device connectivity, and real-time dashboards.',
      'Odoo-style integrated manufacturing, inventory, quality, maintenance, and POS ecosystem narrative.',
      'MaintainX-style assets, work orders, inspections, parts, and preventive maintenance language.',
    ],
    improvements: [
      'Add asset, work-order, inspection, CAPA, downtime, repeat-fault, and closeout entities.',
      'Add QR/barcode asset scan, mobile photo proof, and operator issue intake.',
      'Add ISO evidence export, 5W1H review, manager signoff, and source-to-closeout audit trail.',
      'Add planned-versus-reactive work, repeat fault, downtime reason, and maintenance reliability views.',
    ],
    setupSpeedMoves: [
      'Start from one issue log, maintenance sheet, QC record, receiving file, or meter reading export.',
      'Return the first daily plant-control screen and excluded writeback list within 48 hours.',
      'Pilot one asset lane or issue class before selling broader MES replacement.',
    ],
    integrationContract: [
      'Asset and machine register import rules',
      'Work-order and CAPA status schema',
      'ERP export/read-only boundary',
      'Hardware, meter, and safety qualification boundary',
    ],
    status: 'sellable pilot',
    maturityScore: 78,
  },
  {
    productId: 'restaurant-group-os',
    productName: 'Restaurant POS + Inventory',
    surface: 'supermega.dev/products -> pos.supermega.dev proof -> app.supermega.dev/app/restaurant-pos',
    buyerJob: 'Help a restaurant or shop manage menu, QR handoff, orders, payment proof, stock, shift close, and owner reporting.',
    currentProof: 'Restaurant product screenshots and the separate POS proof host show a concrete counter workflow.',
    setupFriction: [
      'Payment provider, receipt hardware, refunds, taxes, and accounting exports must not be implied before contract.',
      'Staff speed requires menu, modifier, stock, cash-up, and shift actions to be obvious on mobile.',
      'The public POS proof host needs a clearer bridge from proof route to setup request.',
    ],
    incumbentPatternsToCopy: [
      'Square-style online ordering, POS, kitchen, inventory, staff, and live reporting story.',
      'Toast-style branded ordering setup, test order, approved integrations, and restaurant hardware expectations.',
      'Odoo-style integrated POS, inventory, accounting, and app ecosystem language.',
    ],
    improvements: [
      'Add menu item, modifier, availability, QR publish review, and branch price approval.',
      'Add payment proof reconciliation, cash-up variance, settlement status, receipt/export boundary, and manager signoff.',
      'Add stock decrement, low-stock alert, supplier note, prep/waste note, shift handover, and owner digest.',
      'Add POS proof setup banner that routes buyers back to source-first contact.',
    ],
    setupSpeedMoves: [
      'Start from one menu PDF/photo, item spreadsheet, payment screenshot habit, or daily close sheet.',
      'Return the first counter flow, cash-up checklist, and payment boundary within 48 hours.',
      'Run one proof day close before payment-provider or receipt hardware integration.',
    ],
    integrationContract: [
      'Menu, modifier, item availability, and QR publish rules',
      'Payment-provider and receipt hardware boundary',
      'Inventory decrement, supplier note, and daily close export',
      'Manager approval for settlement, refund, cash variance, and price changes',
    ],
    status: 'product proof',
    maturityScore: 76,
  },
  {
    productId: 'source-intake',
    productName: 'Document Extraction Ledger',
    surface: 'supermega.dev/contact -> app.supermega.dev source register',
    buyerJob: 'Turn messy files, links, photos, exports, and notes into reviewable records with owner decisions.',
    currentProof: 'Contact page already accepts uploads, links, notes, and product routing without account creation.',
    setupFriction: [
      'Needs confidence, duplicate, stale-source, and missing-field states visible in every downstream product.',
      'Needs export register and rollback rules before clients trust cleaned outputs.',
      'Needs clear support for upload-first setup before OAuth or service-account connection.',
    ],
    incumbentPatternsToCopy: [
      'Zapier Forms-style submission-to-workflow handoff.',
      'Document AI-style confidence and review queue.',
      'Data room-style source provenance and export register.',
    ],
    improvements: [
      'Add source quality scoring, duplicate detection, and missing-field dashboard.',
      'Add review queues by product path and owner.',
      'Add export packet with source, confidence, reviewer, and next action.',
    ],
    setupSpeedMoves: [
      'Treat upload or link as the default first integration.',
      'Return a field map and missing-source checklist within 48 hours.',
      'Convert the accepted source schema into the first app route.',
    ],
    integrationContract: ['Source type', 'Owner', 'Confidence field', 'Review rule', 'Export destination'],
    status: 'setup layer',
    maturityScore: 80,
  },
  {
    productId: 'portal-factory',
    productName: 'Internal Setup and Portal Factory',
    surface: 'app.supermega.dev internal setup',
    buyerJob: 'Convert approved scope into roles, modules, routes, source inputs, acceptance tests, and go-live checks.',
    currentProof: 'Internal setup and portal-factory concepts exist, but the client-facing checklist needs to become explicit.',
    setupFriction: [
      'Setup state can be hidden inside implementation instead of a buyer-readable sequence.',
      'Go-live gates must be visible before connectors, automations, or private workspace access are enabled.',
      'Pricing, acceptance, and safety boundary need one shared packet.',
    ],
    incumbentPatternsToCopy: [
      'Retool-style governance, permissions, and deployment modes.',
      'OpenAI production-systems habit of codebase tours, modernization, workflows, and QA loops.',
      'Agentic security training that treats browser, shell, memory, tools, and multi-agent chains as attack surfaces.',
    ],
    improvements: [
      'Add client setup state: source received, scope mapped, access approved, build started, QA passed, workspace live.',
      'Add acceptance checklist per product route.',
      'Add connector consent, role matrix, and go-live rollback note.',
    ],
    setupSpeedMoves: [
      'Use one setup packet for every product.',
      'Expose setup status on the client handoff page.',
      'Attach route, screenshot, source, acceptance test, and owner signoff before launch.',
    ],
    integrationContract: ['Role matrix', 'Module map', 'Connector consent', 'QA route list', 'Rollback owner'],
    status: 'internal enablement',
    maturityScore: 74,
  },
  {
    productId: 'agentic-integration-studio',
    productName: 'Integration Studio',
    surface: 'app.supermega.dev integration workbench',
    buyerJob: 'Turn external tools, open-source projects, APIs, and agent abilities into governed pilots with proof and guardrails.',
    currentProof: 'Open-source radar and integration-studio artifacts exist as operating records.',
    setupFriction: [
      'External tools can create security and maintenance burden if added before a product acceptance test.',
      'Clients need to approve scopes, credentials, rate limits, and data retention before integration.',
      'Agent tool access needs drills before browser, file, or writeback autonomy.',
    ],
    incumbentPatternsToCopy: [
      'Retool-style integration marketplace breadth.',
      'Toast/Square-style partner ecosystem clarity.',
      'MCP-style scoped consent, exact permission boundaries, and tool allowlists.',
    ],
    improvements: [
      'Add integration scorecard: value, risk, scope, auth, data, cost, maintenance, and fallback.',
      'Add per-client connector registry and consent record.',
      'Add tool-use evals, prompt-injection tests, and audit logs before agent action.',
    ],
    setupSpeedMoves: [
      'Use manual upload first unless a connector materially improves the first proof.',
      'Pilot one connector per product path with a rollback rule.',
      'Promote integrations only after acceptance tests and trace logs pass.',
    ],
    integrationContract: ['Auth type', 'Scopes', 'Rate limits', 'Data retention', 'Fallback export', 'Owner approval'],
    status: 'internal enablement',
    maturityScore: 72,
  },
]

export const productDomainResearchSources = [
  {
    name: 'Retool',
    url: 'https://retool.com/build-enterprise-apps/apps',
    lesson: 'Sell fast internal apps with components, integrations, permissions, and cloud or self-host deployment clarity.',
  },
  {
    name: 'Zapier Forms',
    url: 'https://zapier.com/forms',
    lesson: 'Make every intake submission immediately automation-ready and connected to downstream systems.',
  },
  {
    name: 'Tulip',
    url: 'https://tulip.co/platform/',
    lesson: 'Use templates, app suites, device connectivity, AI assistance, and frontline dashboards to shorten manufacturing setup.',
  },
  {
    name: 'Square for Restaurants',
    url: 'https://squareup.com/us/en/point-of-sale/restaurants',
    lesson: 'Restaurant setup must make POS, online ordering, kitchen routing, team tools, and live reporting understandable.',
  },
  {
    name: 'Toast Online Ordering',
    url: 'https://support.toasttab.com/en/article/Getting-Started-Online-Ordering',
    lesson: 'Operational setup should end with a successful test order or equivalent proof that the flow works.',
  },
  {
    name: 'OpenAI Codex production systems',
    url: 'https://developers.openai.com/codex/use-cases/collections/production-systems',
    lesson: 'Production agents need codebase tours, modernization, workflows, and QA loops around real repositories.',
  },
  {
    name: 'GitHub Secure Code Game for agentic AI',
    url: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    lesson: 'Agentic systems that browse, call APIs, coordinate, and use tools need security drills before broad autonomy.',
  },
] as const

export const privateClientProofBoundary =
  'Private client proofs can inform internal delivery patterns, but public products must stay generic unless explicit reuse is approved.'
