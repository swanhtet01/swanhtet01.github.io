import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFile(resolve(root, path), 'utf8')
const [runtime, supabaseAuth, cloudRuntime, vercelEntry, portableEntry, trialRuntime, trialStore, commerceRuntime, websiteRuntime, managedTrialClient, coreApp, rolePreflight, foundationMigration, decisionMigration, websiteMigration, hardeningMigration, databaseValidator, databaseActivator, liveVerifier, workflow, requirements, dockerfile, appEnvironment] = await Promise.all([
  read('supermega_runtime/runtime.py'),
  read('supermega_runtime/supabase_auth.py'),
  read('supermega_runtime/cloud_runtime.py'),
  read('api/app.py'),
  read('api_app.py'),
  read('supermega_runtime/trial_runtime.py'),
  read('supermega_runtime/trial_store.py'),
  read('supermega_runtime/commerce_runtime.py'),
  read('supermega_runtime/website_runtime.py'),
  read('showroom/src/core/managed-trial.ts'),
  read('showroom/src/core/CoreApp.tsx'),
  read('supabase/migrations/20260722004500_private_trial_backend_role_preflight.sql'),
  read('supabase/migrations/20260722005134_private_trial_backend_foundation.sql'),
  read('supabase/migrations/20260722142801_private_trial_backend_v2.sql'),
  read('supabase/migrations/20260723094500_private_trial_backend_v3_website.sql'),
  read('supabase/migrations/20260723144500_private_trial_backend_v4_hardening.sql'),
  read('tools/validate_supermega_database_url.py'),
  read('tools/activate_supermega_database.ps1'),
  read('tools/verify_app_release_live.mjs'),
  read('.github/workflows/supermega-app-deploy.yml'),
  read('requirements.txt'),
  read('Dockerfile'),
  read('.env.app.example'),
])
const migration = `${rolePreflight}\n${foundationMigration}\n${decisionMigration}\n${websiteMigration}\n${hardeningMigration}`
const apiSourceEntries = (await readdir(resolve(root, 'api'), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(?:py|js|mjs|cjs)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
const rootPackage = JSON.parse(await read('package.json'))
const rootDependencies = { ...(rootPackage.dependencies || {}), ...(rootPackage.devDependencies || {}) }

const failures = []
const checks = []
const requireContract = (name, condition) => {
  checks.push(name)
  if (!condition) failures.push(name)
}
const expectedHumanCommerceEvents = [
  'commerce.close.saved',
  'commerce.item.created',
  'commerce.order.advanced',
  'commerce.order.cancelled',
  'commerce.order.created',
  'commerce.payment.reconciled',
  'commerce.refund.settled',
  'commerce.stock.received',
  'commerce.website_intake.converted',
  'commerce.workspace.initialized',
]
const humanEventList = (source, start, end) => {
  const contract = source.slice(source.indexOf(start), source.indexOf(end))
  return [...contract.matchAll(/"(commerce\.[^"]+)"/g)].map((match) => match[1]).sort()
}

requireContract('Vercel entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(vercelEntry) && !/serve_solution/.test(vercelEntry))
requireContract('portable entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(portableEntry) && !/serve_solution/.test(portableEntry))
requireContract('API directory exposes exactly one function source', JSON.stringify(apiSourceEntries) === JSON.stringify(['app.py']))
requireContract('legacy Node API dependencies are removed', !['pg', 'playwright'].some((name) => name in rootDependencies))
requireContract('legacy client runtime is unreachable', !/serve_solution|yangon|\bytf\b|\bpos\b/i.test([runtime, vercelEntry, portableEntry].join('\n')))
requireContract('managed store is server-side Postgres', /PostgresTrialStore/.test(runtime) && /SUPERMEGA_DATABASE_URL/.test(runtime))
requireContract('trial writes default fail closed', /SUPERMEGA_TRIAL_WRITES_ENABLED/.test(runtime) && /default: bool = False/.test(runtime))
requireContract('identity is gateway signed', /SUPERMEGA_TRIAL_IDENTITY_SECRET/.test(runtime) && /hmac\.compare_digest/.test(runtime))
requireContract('identity signing secret has a fail-closed entropy floor', /_MIN_IDENTITY_SECRET_BYTES = 32/.test(runtime) && /_MIN_IDENTITY_SECRET_DISTINCT_BYTES/.test(runtime) && /_IDENTITY_SECRET_PLACEHOLDER_MARKERS/.test(runtime) && /_identity_secret_ready/.test(runtime))
requireContract('Supabase identity accepts only a confirmed named-user token', /\/auth\/v1\/user/.test(supabaseAuth) && /_is_publishable_key/.test(supabaseAuth) && /is_anonymous"\) is not False/.test(supabaseAuth) && /actor_kind="human"/.test(runtime))
requireContract('Supabase token verification disables proxy and redirect forwarding', /ProxyHandler\(\{\}\)/.test(supabaseAuth) && /_NoRedirectHandler/.test(supabaseAuth) && /opener\.open/.test(supabaseAuth))
requireContract('identity is rejected from request bodies', /_CLIENT_IDENTITY_FIELDS/.test(trialRuntime) && /client_identity_forbidden/.test(trialRuntime))
requireContract('trial router is mounted', /create_trial_router\(store=store, resolve_principal=resolve_trial_principal\)/.test(runtime))
requireContract('runtime exposes bounded health truth', /"operating_mode": "managed_trial" if not requirements else "isolated_demo"/.test(runtime) && /"browser_service_role_exposed": False/.test(runtime))
requireContract('managed browser auth is readiness gated and cannot accept a secret key', /runtime\.status === 'enterprise' && managedTrialAuthConfigured\(\)/.test(coreApp) && /validPublishableKey/.test(managedTrialClient) && !/VITE_SUPABASE_(?:SERVICE_ROLE|SECRET)/.test(managedTrialClient))
requireContract('managed approval evidence is never persisted in demo storage', /localApprovalsOnly/.test(coreApp) && /persist \? persist\(normalizedState\)/.test(coreApp) && /current\.filter\(\(approval\) => !approval\.managed\)/.test(coreApp))
requireContract('production CORS is bounded', /https:\/\/app\.supermega\.dev,https:\/\/supermega\.dev/.test(runtime) && !/allow_origins=\["\*"\]/.test(runtime))
requireContract('API documentation is not public', /docs_url=None/.test(runtime) && /openapi_url=None/.test(runtime))
requireContract('surface commands use optimistic versions', /expected_version/.test(trialRuntime) && /TrialVersionConflict/.test(trialStore))
requireContract('commands are idempotent', /TrialIdempotencyConflict/.test(trialStore) && /command_fingerprint/.test(migration))
requireContract('company queue is a managed surface', /"company": "company\.write"/.test(trialStore) && /when 'company' then 'company\.write'/.test(migration))
requireContract('Website is an authenticated managed surface', /"website": "website\.write"/.test(trialStore) && /reduce_website_state/.test(runtime) && /WEBSITE_HUMAN_EVENTS/.test(trialRuntime) && /when 'website' then 'website\.write'/.test(websiteMigration) && /saveManagedWebsiteCommand/.test(managedTrialClient) && /validate_website_state/.test(websiteRuntime) && /evidence\["actor"\] == event\["actor"\] == record\[actor_field\]/.test(websiteRuntime) && /exact current ready-page set/.test(websiteRuntime) && /sort_keys=True/.test(websiteRuntime))
requireContract('Website Commerce intake source is transactionally verified with replay-safe retained proof', /commerce\.website_intake\.created/.test(trialRuntime) && /validate_website_snapshot_source/.test(trialRuntime) && /related_surfaces = \("website",\)/.test(trialRuntime) && /state_precondition=state_precondition/.test(trialRuntime) && /_commerce_retains_website_source/.test(trialRuntime) && /_website_fingerprint\(state\) != fingerprint/.test(websiteRuntime) && /not _same_source\(snapshot\["source"\], current_source\)/.test(websiteRuntime) && /locked_surfaces/.test(trialStore) && /for update/i.test(trialStore))
requireContract('consequential Commerce events are human-only in router and store', /COMMERCE_HUMAN_EVENTS/.test(trialRuntime)
  && JSON.stringify(humanEventList(trialStore, 'HUMAN_COMMAND_EVENTS', 'SURFACE_WRITE_CAPABILITIES')) === JSON.stringify(expectedHumanCommerceEvents)
  && JSON.stringify(humanEventList(commerceRuntime, 'COMMERCE_HUMAN_EVENTS', '_ORDER_STATUSES')) === JSON.stringify(expectedHumanCommerceEvents)
  && /TrialHumanApprovalRequired/.test(trialStore))
requireContract('audit events are immutable', /workspace_events_immutable/.test(migration) && /reject_workspace_event_mutation/.test(migration))
requireContract('private schema forces RLS', /create schema if not exists app_private/.test(migration) && /force row level security/gi.test(migration))
requireContract('browser roles have no private schema grant', /revoke all on schema app_private from public, anon, authenticated, service_role/.test(migration))
requireContract('approval transitions are controlled', /pending to approved or declined/.test(migration) && /APPROVAL_DECIDE_CAPABILITY/.test(trialRuntime))
requireContract('approval decisions require trusted human identity', /x-supermega-actor-kind/.test(runtime) && /v2\\n/.test(runtime) && /TrialHumanApprovalRequired/.test(trialStore) && /decided_actor_kind = 'human'/.test(migration) && /app\.actor_kind/.test(migration))
requireContract('approvals require a typed decision packet', /TrialDecisionPacket/.test(trialRuntime) && /TrialDecisionClaim/.test(trialRuntime) && /claim_type: Literal\["fact", "analysis"\]/.test(trialRuntime) && /status == "verified" and not digest/.test(trialStore) && /Every decision claim source_reference must be present in evidence_refs/.test(trialStore) && /DECISION_PACKET_CONTRACT = "decision_packet\.v1"/.test(trialStore) && /proposal_json ->> 'contract' = 'decision_packet\.v1'/.test(migration))
requireContract('approval decisions require a trimmed nonblank note', /note: str = Field\(min_length=1, max_length=500\)/.test(trialRuntime) && /decision note must not be blank/.test(trialRuntime) && /1 <= len\(note_value\) <= 500/.test(trialStore) && /decision_note = btrim\(decision_note\)/.test(decisionMigration) && /char_length\(decision_note\) between 1 and 500/.test(decisionMigration))
requireContract('managed schema contract advances through additive v2, v3, and v4 migrations', /TRIAL_SCHEMA_VERSION = 4/.test(trialStore) && /set schema_version = 2/.test(decisionMigration) && /schema_version = 1/.test(decisionMigration) && /set schema_version = 3/.test(websiteMigration) && /schema_version = 2/.test(websiteMigration) && /set schema_version = 4/.test(hardeningMigration) && /schema version 3/.test(hardeningMigration))
requireContract('managed database role collision is rejected before foundation grants', /pre-existing supermega trial backend role attributes are unsafe/.test(rolePreflight) && /dependency\.refclassid = 'pg_authid'::regclass/.test(rolePreflight) && migration.indexOf('backend_role_preflight') < migration.indexOf('create schema if not exists app_private'))
requireContract('managed database readiness validator targets exact PostgreSQL and schema contracts', /CONTRACT = "supermega_private_trial_database_v4"/.test(databaseValidator) && /EXPECTED_POSTGRES_MAJOR = 17/.test(databaseValidator) && /pg_db_role_setting/.test(databaseValidator) && /SCHEMA_VERSION = 4/.test(databaseValidator) && /complete v4 schema contract/.test(databaseValidator) && /EXPECTED_POLICY_FINGERPRINTS/.test(databaseValidator) && /security_constraints_exact/.test(databaseValidator))
requireContract('Python runtime dependencies are minimal', !/beautifulsoup|google-cloud|sentry|sqlmodel|python-dotenv/i.test(requirements))
requireContract('Cloud Run uses the canonical ASGI entrypoint', /uvicorn api_app:app/.test(dockerfile) && /COPY supermega_runtime \/app\/supermega_runtime/.test(dockerfile) && !/serve_solution/.test(dockerfile))
requireContract('release CI executes every API test', workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && workflow.includes("- 'supermega_runtime/**'"))
requireContract('environment example exposes only canonical server contracts', /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(appEnvironment) && /SUPERMEGA_TRIAL_WRITES_ENABLED=0/.test(appEnvironment) && !/OPENAI_API_KEY|ANTHROPIC|STRIPE|VITE_SUPABASE|SUPERMEGA_APP_PASSWORD/.test(appEnvironment))
requireContract('hosted agent scheduler has bounded jobs and explicit egress', /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(cloudRuntime) && /task_triage/.test(cloudRuntime) && /founder_brief/.test(cloudRuntime) && /ProxyHandler\(\{\}\)/.test(cloudRuntime) && /_NoRedirectHandler/.test(cloudRuntime))
requireContract('hosted agent scheduler reports side effects fail closed', /worker_side_effect_report_required/.test(cloudRuntime) && /worker_reported_unverified/.test(cloudRuntime) && /_MAX_WORKER_RESPONSE_BYTES/.test(cloudRuntime))
requireContract('managed database activation audit is read-only and fail closed', /set transaction read only/i.test(databaseValidator) && /rolbypassrls/i.test(databaseValidator) && /relforcerowsecurity/i.test(databaseValidator) && /mutation_statements_executed": 0/.test(databaseValidator) && /database_connection_or_audit_failed/.test(databaseValidator))
requireContract('managed database runtime is Supavisor transaction-pool safe', /autocommit": False/.test(trialStore) && /prepare_threshold": None/.test(trialStore) && /with connection\.transaction\(\)/.test(trialStore) && /set_config\('app\.workspace_id', %s, true\)/.test(trialStore) && /sslmode/.test(trialStore) && /supermega-trial-runtime/.test(trialStore))
requireContract('managed database runtime revalidates role and TLS per connection', /_assert_runtime_role/.test(trialStore) && /rolbypassrls/.test(trialStore) && /pg_stat_ssl/.test(trialStore) && /"role_ready": readiness\.role_ready/.test(runtime) && /managed_trial_runtime_role_unsafe/.test(liveVerifier))
requireContract('managed database secret handoff is atomic and sensitive', /--force/.test(databaseActivator) && /--sensitive/.test(databaseActivator) && /--project megaos/.test(databaseActivator) && !/vercel env rm/.test(databaseActivator))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_security', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_security', checks: checks.length }, null, 2))
