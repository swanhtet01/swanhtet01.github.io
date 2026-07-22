import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFile(resolve(root, path), 'utf8')
const [runtime, cloudRuntime, vercelEntry, portableEntry, trialRuntime, trialStore, foundationMigration, currentMigration, databaseValidator, databaseActivator, liveVerifier, workflow, requirements, dockerfile, appEnvironment] = await Promise.all([
  read('supermega_runtime/runtime.py'),
  read('supermega_runtime/cloud_runtime.py'),
  read('api/app.py'),
  read('api_app.py'),
  read('supermega_runtime/trial_runtime.py'),
  read('supermega_runtime/trial_store.py'),
  read('supabase/migrations/20260722005134_private_trial_backend_foundation.sql'),
  read('supabase/migrations/20260722142801_private_trial_backend_v2.sql'),
  read('tools/validate_supermega_database_url.py'),
  read('tools/activate_supermega_database.ps1'),
  read('tools/verify_app_release_live.mjs'),
  read('.github/workflows/supermega-app-deploy.yml'),
  read('requirements.txt'),
  read('Dockerfile'),
  read('.env.app.example'),
])
const migration = `${foundationMigration}\n${currentMigration}`
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

requireContract('Vercel entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(vercelEntry) && !/serve_solution/.test(vercelEntry))
requireContract('portable entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(portableEntry) && !/serve_solution/.test(portableEntry))
requireContract('API directory exposes exactly one function source', JSON.stringify(apiSourceEntries) === JSON.stringify(['app.py']))
requireContract('legacy Node API dependencies are removed', !['pg', 'playwright'].some((name) => name in rootDependencies))
requireContract('legacy client runtime is unreachable', !/serve_solution|yangon|\bytf\b|\bpos\b/i.test([runtime, vercelEntry, portableEntry].join('\n')))
requireContract('managed store is server-side Postgres', /PostgresTrialStore/.test(runtime) && /SUPERMEGA_DATABASE_URL/.test(runtime))
requireContract('trial writes default fail closed', /SUPERMEGA_TRIAL_WRITES_ENABLED/.test(runtime) && /default: bool = False/.test(runtime))
requireContract('identity is gateway signed', /SUPERMEGA_TRIAL_IDENTITY_SECRET/.test(runtime) && /hmac\.compare_digest/.test(runtime))
requireContract('identity signing secret has a fail-closed entropy floor', /_MIN_IDENTITY_SECRET_BYTES = 32/.test(runtime) && /_MIN_IDENTITY_SECRET_DISTINCT_BYTES/.test(runtime) && /_IDENTITY_SECRET_PLACEHOLDER_MARKERS/.test(runtime) && /_identity_secret_ready/.test(runtime))
requireContract('identity is rejected from request bodies', /_CLIENT_IDENTITY_FIELDS/.test(trialRuntime) && /client_identity_forbidden/.test(trialRuntime))
requireContract('trial router is mounted', /create_trial_router\(store=store, resolve_principal=resolve_trial_principal\)/.test(runtime))
requireContract('runtime exposes bounded health truth', /"operating_mode": "managed_trial" if not requirements else "isolated_demo"/.test(runtime) && /"browser_service_role_exposed": False/.test(runtime))
requireContract('production CORS is bounded', /https:\/\/app\.supermega\.dev,https:\/\/supermega\.dev/.test(runtime) && !/allow_origins=\["\*"\]/.test(runtime))
requireContract('API documentation is not public', /docs_url=None/.test(runtime) && /openapi_url=None/.test(runtime))
requireContract('surface commands use optimistic versions', /expected_version/.test(trialRuntime) && /TrialVersionConflict/.test(trialStore))
requireContract('commands are idempotent', /TrialIdempotencyConflict/.test(trialStore) && /command_fingerprint/.test(migration))
requireContract('company queue is a managed surface', /"company": "company\.write"/.test(trialStore) && /when 'company' then 'company\.write'/.test(migration))
requireContract('audit events are immutable', /workspace_events_immutable/.test(migration) && /reject_workspace_event_mutation/.test(migration))
requireContract('private schema forces RLS', /create schema if not exists app_private/.test(migration) && /force row level security/gi.test(migration))
requireContract('browser roles have no private schema grant', /revoke all on schema app_private from public, anon, authenticated, service_role/.test(migration))
requireContract('approval transitions are controlled', /pending to approved or declined/.test(migration) && /APPROVAL_DECIDE_CAPABILITY/.test(trialRuntime))
requireContract('approval decisions require trusted human identity', /x-supermega-actor-kind/.test(runtime) && /v2\\n/.test(runtime) && /TrialHumanApprovalRequired/.test(trialStore) && /decided_actor_kind = 'human'/.test(migration) && /app\.actor_kind/.test(migration))
requireContract('approvals require a typed decision packet', /TrialDecisionPacket/.test(trialRuntime) && /TrialDecisionClaim/.test(trialRuntime) && /claim_type: Literal\["fact", "analysis"\]/.test(trialRuntime) && /status == "verified" and not digest/.test(trialStore) && /Every decision claim source_reference must be present in evidence_refs/.test(trialStore) && /DECISION_PACKET_CONTRACT = "decision_packet\.v1"/.test(trialStore) && /proposal_json ->> 'contract' = 'decision_packet\.v1'/.test(migration))
requireContract('approval decisions require a trimmed nonblank note', /note: str = Field\(min_length=1, max_length=500\)/.test(trialRuntime) && /decision note must not be blank/.test(trialRuntime) && /1 <= len\(note_value\) <= 500/.test(trialStore) && /decision_note = btrim\(decision_note\)/.test(currentMigration) && /char_length\(decision_note\) between 1 and 500/.test(currentMigration))
requireContract('managed schema contract advances through an additive v2 migration', /TRIAL_SCHEMA_VERSION = 2/.test(trialStore) && /set schema_version = 2/.test(currentMigration) && /schema_version = 1/.test(currentMigration) && /schema_version = 2/.test(currentMigration))
requireContract('Python runtime dependencies are minimal', !/beautifulsoup|google-cloud|sentry|sqlmodel|python-dotenv/i.test(requirements))
requireContract('Cloud Run uses the canonical ASGI entrypoint', /uvicorn api_app:app/.test(dockerfile) && /COPY supermega_runtime \/app\/supermega_runtime/.test(dockerfile) && !/serve_solution/.test(dockerfile))
requireContract('release CI executes every API test', workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && workflow.includes("- 'supermega_runtime/**'"))
requireContract('environment example exposes only canonical server contracts', /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(appEnvironment) && /SUPERMEGA_TRIAL_WRITES_ENABLED=0/.test(appEnvironment) && !/OPENAI_API_KEY|ANTHROPIC|STRIPE|VITE_SUPABASE|SUPERMEGA_APP_PASSWORD/.test(appEnvironment))
requireContract('hosted agent scheduler has bounded jobs and explicit egress', /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(cloudRuntime) && /task_triage/.test(cloudRuntime) && /founder_brief/.test(cloudRuntime) && /ProxyHandler\(\{\}\)/.test(cloudRuntime) && /_NoRedirectHandler/.test(cloudRuntime))
requireContract('hosted agent scheduler reports side effects fail closed', /worker_side_effect_report_required/.test(cloudRuntime) && /worker_reported_unverified/.test(cloudRuntime) && /_MAX_WORKER_RESPONSE_BYTES/.test(cloudRuntime))
requireContract('managed database activation audit is read-only and fail closed', /set transaction read only/i.test(databaseValidator) && /rolbypassrls/i.test(databaseValidator) && /relforcerowsecurity/i.test(databaseValidator) && /mutation_statements_executed": 0/.test(databaseValidator) && /database_connection_or_audit_failed/.test(databaseValidator))
requireContract('managed database runtime is Supavisor transaction-pool safe', /prepare_threshold": None/.test(trialStore) && /sslmode/.test(trialStore) && /supermega-trial-runtime/.test(trialStore))
requireContract('managed database runtime revalidates role and TLS per connection', /_assert_runtime_role/.test(trialStore) && /rolbypassrls/.test(trialStore) && /pg_stat_ssl/.test(trialStore) && /"role_ready": readiness\.role_ready/.test(runtime) && /managed_trial_runtime_role_unsafe/.test(liveVerifier))
requireContract('managed database secret handoff is atomic and sensitive', /--force/.test(databaseActivator) && /--sensitive/.test(databaseActivator) && /--project megaos/.test(databaseActivator) && !/vercel env rm/.test(databaseActivator))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_security', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_security', checks: checks.length }, null, 2))
