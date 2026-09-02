#!/usr/bin/env node
// Plant shift-release browser journey — ONE deterministic end-to-end run at a 390px
// phone viewport against the BUILT app (showroom/dist), driven over raw CDP.
//
// Why this exists: tools/journey_shop_cash_sale.mjs is the repo's first automated
// browser journey (ENTERPRISE-READINESS-SCORECARD §5). This is the second, on a
// different product, so the harness in tools/journey_lib.mjs is proven reusable
// rather than a one-off. It follows docs/demo-playbooks/plant.md §2-§3 (the
// canonical demo script) through to the accountable owner close of a shift:
//
//   1. /settings/?product=plant → type a business name → 'Create Plant and open the job'
//   2. lands on /plant/?tab=production with the guided working sample provisioned
//      (jobs at zero output, every event ACT-DEMO-WORKING-SAMPLE-*, NO shift ever closed)
//   3. 'Start here' → 'Record output' → name the shift, enter good units →
//      'Review good output' → the 'Confirm change' gate → one output_recorded event
//   4. the panel advances to materials → material, lot, quantity →
//      'Review material record' → gate → one material_consumed event
//   5. 'Start here' → 'Clear shift blockers' → 'Review blockers' (the sample's open
//      quality issue blocks owner close, playbook §3.5) → 'Review CAPA' → gate →
//      one issue_resolved event
//   6. 'Start here' → 'Close this shift' → 'Close shift' → 'Prepare shift close file'
//      (the checklist reads Ready) → 'Review shift close' → gate ('Confirm change')
//      → ONE shift_closed event bound to the exact prior revision by digest
//   7. reload on /plant/?tab=control → the close is re-derived from the persisted
//      record ('Shift closed by …', checklist 'Closed', 'Continue production')
//
// The CLAUDE.md rule this journey pins: a GUIDED Plant shift releases no batch and
// closes nothing — sample seeding is identified by actionId prefix (ACT-DEMO-),
// never by actor string. So the journey asserts (a) before any operator action the
// record carries only ACT-DEMO- events and no shift_closed at all, and (b) after
// the operator's four accountable actions, exactly four events carry real generated
// proofs (ACT-<uuid>, the typed supervisor as actor) while the sample's own events
// still carry the ACT-DEMO- prefix, untouched.
//
// Every assertion is on STATE the app persists (the localStorage production record,
// see showroom/src/core/production-workspace.ts) or on rendered text — never on
// pixels. Screenshots are diagnostic output on failure only.
//
// Contract with the environment:
//   - Zero dependencies: Node built-ins + Chromium's DevTools protocol over the
//     built-in WebSocket. The server, browser, CDP client, verified click/type and
//     diagnostics live in tools/journey_lib.mjs, shared with every tools/journey_*.mjs.
//   - Chromium is resolved from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
//     PATH (google-chrome, chromium, ...). Nothing is downloaded; it never runs
//     `playwright install`.
//   - Every run launches a FRESH temporary browser profile, so there is no service
//     worker, no cache and no localStorage from any earlier run; the journey asserts
//     that emptiness before it starts.
//   - Nothing here seeds a record. The only sample data is what the app's own
//     onboarding provisions. Every record the journey creates is made through the
//     real UI with a real generated proof, exactly as a shift supervisor would.
//
// Usage:
//   node tools/journey_plant_shift_release.mjs [--chromium /path/to/chrome] [--out-dir DIR]
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics (screenshot path, page text, stored record summary).

import {
  ACCOUNTABLE_ACTIONS_KEY,
  GUIDED_SAMPLE_PREFIX,
  LAST_OPERATOR_KEY,
  LOCAL_METRICS_KEY,
  PRODUCT_SETUPS_KEY,
  SETUP_KEY,
  WORKING_SAMPLE_PREFIX,
  reportFatal,
  runJourney,
} from './journey_lib.mjs'

const CONTRACT = 'supermega.plant-shift-release-journey.v1'
const LABEL = 'PLANT SHIFT-RELEASE JOURNEY'
const BUSINESS_NAME = 'Journey Test Plant'
const SUPERVISOR = 'Journey supervisor'
const SHIFT_REF = 'Journey Day Shift'
const GOOD_UNITS = 5
const MATERIAL_REF = 'RM-JOURNEY-01'
const MATERIAL_LOT = 'LOT-JOURNEY-01'
const MATERIAL_QUANTITY = '2.5'
const PRODUCTION_KEY = 'supermega.production.workspace.v2'
// A real proof id: uid('ACT') in CoreApp.tsx — never the ACT-DEMO- sample prefix.
const REAL_ACTION_ID = /^ACT-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/

const gateExpr = `(() => {
  const d = document.querySelector('dialog.accountable-action-gate[open]');
  if (!d) return null;
  const inputs = Array.from(d.querySelectorAll('form input'));
  return {
    eyebrow: (d.querySelector('.core-eyebrow') || {}).textContent,
    title: (d.querySelector('#action-confirm-title') || {}).textContent,
    values: inputs.map((i) => i.value),
    readonly: inputs.map((i) => i.readOnly),
  };
})()`

// The 'Shift close' disclosure has no id; it is the <details> whose summary starts
// with that text, exactly how a person finds it.
const shiftCloseDetailsExpr = `Array.from(document.querySelectorAll('details')).find((d) => ((d.querySelector('summary') || {}).textContent || '').trim().startsWith('Shift close'))`

runJourney({
  contract: CONTRACT,
  label: LABEL,
  profilePrefix: 'plant-journey',
  workspaceKey: PRODUCTION_KEY,
  summarizeWorkspace: (state) => ({
    revision: state.revision,
    jobs: state.jobs.map((job) => ({ id: job.id, target: job.target, output: job.output, scrap: job.scrap ?? 0, closed: Boolean(job.closure) })),
    issues: state.issues.map((issue) => ({ id: issue.id, kind: issue.kind, status: issue.status })),
    events: state.events.map((event) => ({ kind: event.kind, actionId: event.actionId, subjectId: event.subjectId, shiftRef: event.shiftRef })),
  }),
}, async (j) => {
  const expected = { sampleActionIds: [], realActionIds: [] }

  // Reads the persisted production record and checks the append-only invariant
  // every time: revision === events.length (production-workspace.ts validate).
  async function readProduction() {
    const state = await j.readJson(PRODUCTION_KEY)
    j.expect(state && state.schema === PRODUCTION_KEY, `${PRODUCTION_KEY} missing or wrong schema`)
    j.expect(state.revision === state.events.length, `revision ${state.revision} does not equal the ${state.events.length} appended events`)
    return state
  }

  // Confirms the open accountable gate as the named supervisor and waits for it to close.
  async function confirmGate(expectedTitle, expectedActorSuggestion) {
    const gate = await j.waitUntil(gateExpr, `the gate "${expectedTitle}"`)
    j.expect(gate.eyebrow === 'Confirm change', `gate eyebrow reads ${JSON.stringify(gate.eyebrow)}, expected "Confirm change"`)
    j.expect(gate.title === expectedTitle, `gate title reads ${JSON.stringify(gate.title)}, expected ${JSON.stringify(expectedTitle)}`)
    j.expect(gate.values[0] === expectedActorSuggestion, `gate name defaults to ${JSON.stringify(gate.values[0])}, expected the role placeholder ${JSON.stringify(expectedActorSuggestion)}`)
    j.expect(gate.values[1] && gate.values[2], 'the gate offered no reason or reference')
    // The name is the accountability: a real person replaces the role placeholder.
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, SUPERVISOR, 'the gate name field')
    const submit = await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    // bi() renders bilingual labels ('Confirm change · အတည်ပြုမည်'); match the English head.
    j.expect(submit.text.startsWith('Confirm change'), `gate submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the gate to close after the change was applied')
    return gate
  }

  // The newest event must be the one the operator just confirmed, with a real proof.
  async function newestRealEvent(kind) {
    const state = await j.waitUntil(`(() => {
      const raw = window.__journey.read(${JSON.stringify(PRODUCTION_KEY)});
      if (!raw) return null;
      const state = JSON.parse(raw);
      return state.events[0] && state.events[0].kind === ${JSON.stringify(kind)} ? state : null;
    })()`, `a ${kind} event at the head of the stored record`)
    j.expect(state.revision === state.events.length, `revision ${state.revision} does not equal the ${state.events.length} appended events`)
    const [event] = state.events
    j.expect(REAL_ACTION_ID.test(event.actionId) && !event.actionId.startsWith(GUIDED_SAMPLE_PREFIX),
      `${kind} was recorded under ${JSON.stringify(event.actionId)} — a real UI action must carry a generated proof, never the guided-sample prefix`)
    j.expect(event.actor === SUPERVISOR, `${kind} actor is ${JSON.stringify(event.actor)}, expected the typed supervisor`)
    j.expect(event.reason && event.evidenceReference && event.createdAt, `${kind} is missing its proof (reason/evidence/capturedAt)`)
    j.expect(event.id === `EVT-${event.actionId}`, `${kind} event id ${event.id} is not derived from its proof`)
    expected.realActionIds.push(event.actionId)
    return { state, event }
  }

  // The Start here status line: the <span> names the record source and the <small>
  // carries the sentence confirming what just happened. Until P3.10 the <small>
  // was display:none below the phone breakpoint (core-app.css .plant-today-source
  // small), so a 390px operator never saw the confirmation and role="alert"
  // announced an empty region. This reads it the way a phone operator does: the
  // text, AND whether it is actually rendered — computed display, visibility and a
  // non-zero box. A DOM-only read would pass on a stylesheet that hides it again.
  function statusNoticeExpr(expectedText) {
    return `(() => {
      const el = document.querySelector('.plant-today-source small');
      if (!el || (el.textContent || '') !== ${JSON.stringify(expectedText)}) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const host = el.parentElement.getBoundingClientRect();
      return { text: el.textContent, role: el.parentElement.getAttribute('role'), display: cs.display, visibility: cs.visibility, textAlign: cs.textAlign,
        width: r.width, height: r.height, top: r.top - host.top, viewport: window.innerWidth };
    })()`
  }

  async function expectVisibleStatusNotice(expectedText, label) {
    const notice = await j.waitUntil(statusNoticeExpr(expectedText), label)
    j.expect(notice.display !== 'none' && notice.visibility !== 'hidden' && notice.width > 0 && notice.height > 0,
      `${label} is in the DOM but not visible at ${notice.viewport}px: ${JSON.stringify({ display: notice.display, visibility: notice.visibility, width: notice.width, height: notice.height })}`)
    j.expect(notice.width <= notice.viewport, `${label} overflows the ${notice.viewport}px viewport at ${notice.width}px wide`)
    j.expect(notice.role === 'status', `the Start here status line is role=${JSON.stringify(notice.role)}, expected "status" while Plant writes are allowed`)
    return notice
  }

  function currentStartHere() {
    return j.evaluate(`(() => {
      const panel = document.querySelector('.plant-today');
      if (!panel) return null;
      const metrics = Object.fromEntries(Array.from(panel.querySelectorAll('.plant-today-metrics span')).map((s) => [(s.querySelector('small') || {}).textContent, (s.querySelector('strong') || {}).textContent]));
      return { step: panel.dataset.step, state: panel.dataset.state, headline: (panel.querySelector('h2') || {}).textContent, reason: (panel.querySelector('.plant-today-priority > p') || {}).textContent, action: (panel.querySelector('.plant-today-priority button') || {}).textContent, metrics };
    })()`)
  }

  await j.step('fresh-origin', async () => {
    await j.navigate('/settings/?product=plant')
    // The app writes housekeeping keys on first paint (theme, local metrics, possibly
    // the pristine Plant seed at revision 0). What proves a fresh origin is that no
    // setup record, no remembered operator and no appended Plant event exist before
    // onboarding — the keys this journey goes on to assert against.
    const fresh = await j.evaluate(`(async () => {
      const raw = window.localStorage.getItem(${JSON.stringify(PRODUCTION_KEY)});
      const production = raw ? JSON.parse(raw) : null;
      return {
        business: [${JSON.stringify(SETUP_KEY)}, ${JSON.stringify(PRODUCT_SETUPS_KEY)}, ${JSON.stringify(LAST_OPERATOR_KEY)}]
          .filter((key) => window.localStorage.getItem(key) !== null),
        productionEvents: production ? production.events.length : 0,
        keys: Object.keys(window.localStorage).sort(),
        workers: (await navigator.serviceWorker.getRegistrations()).length,
        viewport: window.innerWidth,
      };
    })()`)
    j.expect(fresh.business.length === 0, `a fresh profile already carries ${fresh.business.join(', ')} — this run is contaminated by a previous one`)
    j.expect(fresh.productionEvents === 0, `a fresh profile already carries ${fresh.productionEvents} Plant events — this run is contaminated by a previous one`)
    j.expect(fresh.viewport === j.viewport.width, `expected a ${j.viewport.width}px viewport, got ${fresh.viewport}`)
    return { browser: j.browser, profile: j.userDataDir, keysWrittenByFirstPaint: fresh.keys, serviceWorkers: fresh.workers }
  })

  await j.step('setup-name-workspace', async () => {
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await j.type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
    // The submit is disabled until the runtime health probe settles (static host → demo).
    const submit = await j.click('form.product-onboarding-form button[type="submit"]', null, 'the setup submit button')
    j.expect(submit.text === 'Create Plant and open the job', `setup submit reads ${JSON.stringify(submit.text)}, expected "Create Plant and open the job"`)
  })

  await j.step('jobs-open-with-sample', async () => {
    await j.waitUntil(`location.pathname === '/plant/' && new URLSearchParams(location.search).get('tab') === 'production'`, 'navigation to /plant/?tab=production')
    const startHere = await j.waitUntil(`(() => { const p = document.querySelector('.plant-today[data-step="output"]'); return p ? (p.querySelector('h2') || {}).textContent : null; })()`, 'the Start here panel on its first step')
    j.expect(startHere === 'Record first shift output', `Start here reads ${JSON.stringify(startHere)}, expected "Record first shift output" (playbook §3.1)`)
    const source = await j.evaluate(`(document.querySelector('.plant-today-source span') || {}).textContent`)
    j.expect(source === 'Local sample records on this device', `Start here source line reads ${JSON.stringify(source)} (playbook §2.4)`)
    const state = await readProduction()
    j.expect(state.jobs.length >= 1 && state.jobs.every((job) => job.output === 0 && !job.closure && job.target >= GOOD_UNITS),
      `the provisioned jobs are not a fresh sample: ${JSON.stringify(state.jobs.map((job) => [job.id, job.output, job.target]))}`)
    // The guided sample: one job_created per job, every one under the working-sample
    // prefix, and NOTHING else — in particular no shift was ever closed by the sample.
    j.expect(state.events.length === state.jobs.length, `expected one seed event per job, found ${state.events.length} events for ${state.jobs.length} jobs`)
    j.expect(state.events.every((event) => event.kind === 'job_created' && event.actionId.startsWith(WORKING_SAMPLE_PREFIX)),
      `the provisioned record is not the guided working sample: ${JSON.stringify(state.events.map((event) => [event.kind, event.actionId]))}`)
    j.expect(!state.events.some((event) => event.kind === 'shift_closed'), 'the guided sample closed a shift on its own — a guided Plant shift must release nothing')
    const openQuality = state.issues.filter((issue) => issue.status === 'open' && issue.kind === 'quality')
    j.expect(openQuality.length === 1, `expected the sample's one open quality issue (the owner-close blocker), found ${openQuality.length}`)
    expected.sampleActionIds = state.events.map((event) => event.actionId)
    expected.issueId = openQuality[0].id
    expected.revisionAfterSample = state.revision
    return { jobs: state.jobs.map((job) => job.id), sampleEvents: expected.sampleActionIds, blockingIssue: expected.issueId }
  })

  await j.step('record-good-output', async () => {
    const open = await j.click('.plant-today-priority button', 'Record output', 'the Start here primary action')
    j.expect(open.text === 'Record output', `Start here action reads ${JSON.stringify(open.text)}`)
    await j.waitUntil(`Boolean(document.querySelector('.output-panel.is-open #plant-output-form'))`, 'the job output panel')
    const form = await j.waitUntil(`(() => {
      const select = document.querySelector('#plant-output-form select');
      const shift = document.querySelector('#plant-output-form input[name="plant-output-shift-reference"]');
      return select && select.value && shift ? { jobId: select.value, suggestedShift: shift.value, options: select.options.length } : null;
    })()`, 'the output form with a job selected')
    const state = await readProduction()
    j.expect(state.jobs.some((job) => job.id === form.jobId), `the output form selected ${form.jobId}, which is not a stored job`)
    j.expect(form.suggestedShift.endsWith(' Day'), `the suggested shift reference reads ${JSON.stringify(form.suggestedShift)}`)
    expected.outputJobId = form.jobId
    // The supervisor names the shift and enters the count; the app's suggestions are replaced.
    await j.type('#plant-output-form input[name="plant-output-shift-reference"]', null, SHIFT_REF, 'the shift reference')
    await j.type('#plant-output-form input[name="plant-output-quantity"]', null, String(GOOD_UNITS), 'the good units')
    const status = await j.evaluate(`(window.__journey.q('#plant-output-form .form-notice[role="status"]') || {}).textContent`)
    j.expect(status === 'This shift: 0 good · 0 scrap across 0 entries.', `output form status reads ${JSON.stringify(status)}`)
    const review = await j.click('#plant-output-form button[type="submit"]', null, 'Review good output')
    j.expect(review.text === 'Review good output', `output submit reads ${JSON.stringify(review.text)}`)
    await confirmGate(`Record ${GOOD_UNITS} good units for ${form.jobId} · ${SHIFT_REF}`, 'Plant operator')
    const { state: after, event } = await newestRealEvent('output_recorded')
    j.expect(event.subjectId === form.jobId && event.quantity === GOOD_UNITS && event.shiftRef === SHIFT_REF && (event.outputKind ?? 'good') === 'good',
      `output event is ${JSON.stringify({ subjectId: event.subjectId, quantity: event.quantity, shiftRef: event.shiftRef, outputKind: event.outputKind })}`)
    const job = after.jobs.find((candidate) => candidate.id === form.jobId)
    j.expect(job.output === GOOD_UNITS, `${form.jobId} output is ${job.output}, expected ${GOOD_UNITS}`)
    return { jobId: form.jobId, actionId: event.actionId }
  })

  await j.step('record-material-used', async () => {
    // The app advances to materials on its own after good output with no same-shift
    // trace (playbook §3.3): the disclosure opens inside the still-open panel.
    const material = await j.waitUntil(`(() => {
      const details = document.querySelector('.output-panel.is-open details[open]');
      if (!details) return null;
      const select = details.querySelector('form select');
      const shift = details.querySelector('form input[maxlength="80"]');
      const quantity = details.querySelector('form input[step="0.001"]');
      return select && shift && quantity ? { jobId: select.value, shift: shift.value, quantity: quantity.value } : null;
    })()`, 'the materials form to open after the output was recorded')
    const state = await readProduction()
    j.expect(state.jobs.some((job) => job.id === material.jobId), `the materials form selected ${JSON.stringify(material.jobId)}, which is not a stored job`)
    j.expect(material.shift === SHIFT_REF, `the materials form carries shift ${JSON.stringify(material.shift)}, expected ${JSON.stringify(SHIFT_REF)}`)
    expected.materialJobId = material.jobId
    await j.type('.output-panel details[open] form input[placeholder="e.g. Resin A or RM-001"]', null, MATERIAL_REF, 'the Material used field')
    await j.type('.output-panel details[open] form input[placeholder="LOT-24"]', null, MATERIAL_LOT, 'the Lot or batch field')
    await j.type('.output-panel details[open] form input[step="0.001"]', null, MATERIAL_QUANTITY, 'the material Quantity field')
    // The unit select is the one offering 'kg'; the other select in this form is the job.
    const unit = await j.evaluate(`(Array.from(document.querySelectorAll('.output-panel details[open] form select')).find((s) => Array.from(s.options).some((o) => o.value === 'kg')) || {}).value`)
    j.expect(unit === 'kg', `material unit defaults to ${JSON.stringify(unit)}, expected kg`)
    const review = await j.click('.output-panel details[open] form button[type="submit"]', null, 'Review material record')
    j.expect(review.text === 'Review material record', `material submit reads ${JSON.stringify(review.text)}`)
    await confirmGate(`Record ${MATERIAL_QUANTITY} ${unit} ${MATERIAL_REF} · lot ${MATERIAL_LOT} for ${material.jobId}`, 'Plant operator')
    const { event } = await newestRealEvent('material_consumed')
    j.expect(event.subjectId === material.jobId && event.materialRef === MATERIAL_REF && event.materialLot === MATERIAL_LOT
      && event.quantity === Number(MATERIAL_QUANTITY) && event.materialUnit === unit && event.shiftRef === SHIFT_REF,
      `material event is ${JSON.stringify({ subjectId: event.subjectId, materialRef: event.materialRef, materialLot: event.materialLot, quantity: event.quantity, materialUnit: event.materialUnit, shiftRef: event.shiftRef })}`)
    // After a material record the app closes the panel itself (recordMaterialUse's
    // apply) and hands the operator back to Start here, which must now be reachable.
    await j.waitUntil(`!document.querySelector('.output-panel.is-open')`, 'the output panel to close itself after the material record')
    return { jobId: material.jobId, actionId: event.actionId }
  })

  await j.step('clear-owner-close-blocker', async () => {
    const blocked = await j.waitUntil(`(() => { const p = document.querySelector('.plant-today[data-step="problems"]'); return p ? { headline: (p.querySelector('h2') || {}).textContent, reason: (p.querySelector('.plant-today-priority > p') || {}).textContent } : null; })()`, 'Start here to surface the owner-close blocker')
    j.expect(blocked.headline === 'Clear shift blockers', `Start here reads ${JSON.stringify(blocked.headline)}`)
    j.expect(blocked.reason === '1 quality or maintenance blocker must be cleared before owner close.', `Start here reason reads ${JSON.stringify(blocked.reason)}`)
    await j.click('.plant-today-priority button', 'Review blockers', 'Review blockers')
    await j.waitUntil(`new URLSearchParams(location.search).get('tab') === 'control' && Boolean(document.querySelector('.production-issue-launcher .issue-list'))`, 'the Problems tab (playbook §3.5)')
    const issue = await j.evaluate(`(() => {
      const article = document.querySelector('.production-issue-launcher .issue-list article');
      return article ? { id: article.title, button: (article.querySelector('button') || {}).textContent } : null;
    })()`)
    j.expect(issue && issue.id === expected.issueId, `the open problem shown is ${JSON.stringify(issue)}, expected the sample issue ${expected.issueId}`)
    j.expect(issue.button === 'Review CAPA', `the quality problem offers ${JSON.stringify(issue.button)}, expected "Review CAPA"`)
    await j.click('.production-issue-launcher .issue-list article button', 'Review CAPA', 'Review CAPA')
    await confirmGate(`Resolve ${expected.issueId}`, 'Plant supervisor')
    const { state, event } = await newestRealEvent('issue_resolved')
    j.expect(event.subjectId === expected.issueId, `issue_resolved subject is ${event.subjectId}`)
    const resolved = state.issues.find((candidate) => candidate.id === expected.issueId)
    j.expect(resolved.status === 'resolved' && resolved.resolution?.actionId === event.actionId && resolved.resolution?.resolvedBy === SUPERVISOR,
      `issue ${expected.issueId} is ${JSON.stringify(resolved.status)} with resolution ${JSON.stringify(resolved.resolution)}`)
    return { issueId: expected.issueId, actionId: event.actionId }
  })

  await j.step('prepare-shift-close', async () => {
    const ready = await currentStartHere()
    const startHere = await j.waitUntil(`(() => { const p = document.querySelector('.plant-today[data-step="shift-close"]'); return p ? (p.querySelector('h2') || {}).textContent : null; })()`, 'Start here to offer the shift close')
    j.expect(startHere === 'Close this shift', `Start here reads ${JSON.stringify(startHere)} (was ${JSON.stringify(ready)})`)
    await j.click('.plant-today-priority button', 'Close shift', 'Close shift')
    const disclosure = await j.waitUntil(`(() => {
      const d = ${shiftCloseDetailsExpr};
      if (!d || !d.open) return null;
      const input = d.querySelector('form input');
      return input ? { shift: input.value, badge: (d.querySelector('summary span') || {}).textContent } : null;
    })()`, 'the Shift close disclosure to open')
    j.expect(disclosure.shift === SHIFT_REF, `the shift close file names ${JSON.stringify(disclosure.shift)}, expected ${JSON.stringify(SHIFT_REF)}`)
    j.expect(disclosure.badge === 'Build', `shift close badge reads ${JSON.stringify(disclosure.badge)} before the packet is prepared`)
    const prepare = await j.click('details form button[type="submit"]', 'Prepare shift close file', 'Prepare shift close file')
    j.expect(prepare.text === 'Prepare shift close file', `prepare button reads ${JSON.stringify(prepare.text)}`)
    const checklist = await j.waitUntil(`(() => {
      const grid = document.querySelector('.plant-shift-close-grid');
      if (!grid) return null;
      const d = ${shiftCloseDetailsExpr};
      return { rows: Object.fromEntries(Array.from(grid.querySelectorAll('span')).map((s) => [(s.querySelector('small') || {}).textContent, (s.querySelector('strong') || {}).textContent])), badge: (d.querySelector('summary span') || {}).textContent };
    })()`, 'the shift close checklist')
    const wantRows = { Output: `${GOOD_UNITS} good / 1 entries`, Material: '1 traced', Orders: 'No controlled batch', Quality: 'Clear', Urgent: 'Clear', Maintenance: 'Clear' }
    j.expect(JSON.stringify(checklist.rows) === JSON.stringify(wantRows), `shift close checklist reads ${JSON.stringify(checklist.rows)}, expected ${JSON.stringify(wantRows)}`)
    j.expect(checklist.badge === 'Ready', `shift close badge reads ${JSON.stringify(checklist.badge)}, expected Ready`)
    const state = await readProduction()
    expected.revisionBeforeClose = state.revision
    j.expect(state.revision === expected.revisionAfterSample + 3, `expected revision ${expected.revisionAfterSample + 3} before close, found ${state.revision}`)
    // The Start here status line carries the packet notice, and at 390px it must be
    // visible under the source label — not merely present in the DOM (P3.10).
    const notice = await expectVisibleStatusNotice(`Shift packet prepared from Plant revision ${state.revision}. It is ready for accountable owner close review.`, 'the packet notice on the Start here status line')
    return { checklist: checklist.rows, sourceRevision: state.revision, notice: { display: notice.display, width: notice.width, height: notice.height, textAlign: notice.textAlign } }
  })

  await j.step('close-shift', async () => {
    const review = await j.click('details button.core-button.primary', 'Review shift close', 'Review shift close')
    j.expect(review.text === 'Review shift close', `review button reads ${JSON.stringify(review.text)}`)
    const gate = await confirmGate(`Close shift ${SHIFT_REF}`, 'Shift supervisor')
    j.expect(gate.values[2] === `Shift close ${SHIFT_REF} · revision ${expected.revisionBeforeClose}` && gate.readonly[2] === true,
      `the close gate's evidence reference is ${JSON.stringify(gate.values[2])} (readonly ${gate.readonly[2]}), expected the locked revision-bound reference`)
    const { state, event } = await newestRealEvent('shift_closed')
    j.expect(event.subjectId === SHIFT_REF && event.shiftRef === SHIFT_REF, `shift_closed names ${JSON.stringify(event.subjectId)}/${JSON.stringify(event.shiftRef)}`)
    j.expect(event.sourceRevision === expected.revisionBeforeClose && state.revision === expected.revisionBeforeClose + 1,
      `shift_closed is bound to revision ${event.sourceRevision} at revision ${state.revision}, expected ${expected.revisionBeforeClose} → ${expected.revisionBeforeClose + 1}`)
    j.expect(typeof event.sourceDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(event.sourceDigest), `shift_closed source digest is ${JSON.stringify(event.sourceDigest)}`)
    j.expect(event.goodUnits === GOOD_UNITS && event.scrapUnits === 0 && event.outputEntryCount === 1 && event.materialEntryCount === 1,
      `shift_closed totals are ${JSON.stringify({ goodUnits: event.goodUnits, scrapUnits: event.scrapUnits, outputEntryCount: event.outputEntryCount, materialEntryCount: event.materialEntryCount })}`)
    j.expect(event.summary === `Closed shift ${SHIFT_REF} with ${GOOD_UNITS} good, 0 scrap, 1 output entries, 1 material entries`, `shift_closed summary reads ${JSON.stringify(event.summary)}`)
    // The whole record, after the operator's work: four real proofs on top of the
    // untouched sample. Prefix is the only discriminator — never the actor string.
    const real = state.events.filter((candidate) => !candidate.actionId.startsWith(GUIDED_SAMPLE_PREFIX))
    const sample = state.events.filter((candidate) => candidate.actionId.startsWith(GUIDED_SAMPLE_PREFIX))
    j.expect(JSON.stringify(real.map((candidate) => candidate.actionId)) === JSON.stringify([...expected.realActionIds].reverse()),
      `real-proof events are ${JSON.stringify(real.map((candidate) => [candidate.kind, candidate.actionId]))}, expected exactly the four confirmed actions newest first`)
    j.expect(JSON.stringify(sample.map((candidate) => candidate.actionId)) === JSON.stringify(expected.sampleActionIds) && sample.every((candidate) => candidate.kind === 'job_created'),
      `the guided sample's events changed: ${JSON.stringify(sample.map((candidate) => [candidate.kind, candidate.actionId]))}`)
    j.expect(new Set(state.events.map((candidate) => candidate.actionId)).size === state.events.length, 'duplicate action ids in the stored record')
    // The device's own accountable-action ledger and local metrics agree with the record.
    const actions = (await j.readJson(ACCOUNTABLE_ACTIONS_KEY)) || []
    const production = actions.filter((action) => action.domain === 'production')
    j.expect(JSON.stringify(production.map((action) => action.id)) === JSON.stringify([...expected.realActionIds].reverse()) && production.every((action) => action.actor === SUPERVISOR),
      `the accountable-action ledger holds ${JSON.stringify(production.map((action) => [action.id, action.actor]))}`)
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    const count = (action) => (metrics.events || []).filter((entry) => entry.action === action).length
    j.expect(count('output.recorded') === 1 && count('shift.close.confirmed') === 1, `local metrics: output.recorded ×${count('output.recorded')}, shift.close.confirmed ×${count('shift.close.confirmed')}`)
    const operator = await j.readStored(LAST_OPERATOR_KEY)
    j.expect(operator === SUPERVISOR, `last operator is ${JSON.stringify(operator)}, expected ${SUPERVISOR}`)
    // Same status line as in prepare-shift-close: the close confirmation must be
    // rendered where a phone operator can read it, not only present in the DOM.
    const noticed = await expectVisibleStatusNotice(`Close shift ${SHIFT_REF} completed. It was persisted with attributed Plant evidence.`, 'the completion notice on the Start here status line')
    expected.closeActionId = event.actionId
    return { noticed: { display: noticed.display, textAlign: noticed.textAlign, width: noticed.width, height: noticed.height, top: noticed.top, viewport: noticed.viewport }, actionId: event.actionId, sourceRevision: event.sourceRevision, revision: state.revision, realEvents: real.map((candidate) => candidate.kind) }
  })

  await j.step('reload-shows-closed-shift', async () => {
    // A full reload: the close must be re-derived from the persisted record — the
    // app recomputes the handoff from the prior revision and checks its digest
    // (currentProductionShiftCloseEvidence) before it will say "closed".
    await j.navigate('/plant/?tab=control')
    const closed = await j.waitUntil(`(() => {
      const d = ${shiftCloseDetailsExpr};
      if (!d) return null;
      const notice = d.querySelector('.form-notice[role="status"]');
      const text = notice ? notice.innerText : '';
      return text.includes('Shift closed by') ? { badge: (d.querySelector('summary span') || {}).textContent, text } : null;
    })()`, 'the Shift close disclosure to show the persisted close')
    j.expect(closed.badge === 'Closed', `shift close badge reads ${JSON.stringify(closed.badge)} after reload`)
    j.expect(closed.text.startsWith(`Shift closed by ${SUPERVISOR}`), `close notice reads ${JSON.stringify(closed.text)}`)
    j.expect(closed.text.includes(`${SHIFT_REF} | revision ${expected.revisionBeforeClose} | ${GOOD_UNITS} good | 1 material entries | 0 controlled orders | quality clear | WCM clear`),
      `close notice does not carry the persisted totals: ${JSON.stringify(closed.text)}`)
    const startHere = await currentStartHere()
    j.expect(startHere.headline === 'Continue production' && startHere.action === 'Record next output', `Start here after the close reads ${JSON.stringify(startHere)}`)
    j.expect(startHere.reason === `${SHIFT_REF} is closed by ${SUPERVISOR}. Record the next output when production continues.`, `Start here reason reads ${JSON.stringify(startHere.reason)}`)
    j.expect(startHere.metrics['Shift close'] === 'Closed', `Shift close metric reads ${JSON.stringify(startHere.metrics['Shift close'])}`)
    const reviewGone = await j.evaluate(`!window.__journey.q('button', 'Review shift close')`)
    j.expect(reviewGone, 'the shift is closed but "Review shift close" is still offered')
    const state = await readProduction()
    j.expect(state.revision === expected.revisionBeforeClose + 1 && state.events[0].actionId === expected.closeActionId, 'the stored record changed across the reload')
    return { badge: closed.badge, headline: startHere.headline, metrics: startHere.metrics }
  })
}).catch((err) => reportFatal(LABEL, err))
