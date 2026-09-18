# Plant — client demo playbook

## 1. Client and the 30-second pitch

Who this is for: factories and workshops that plan jobs and record output by shift — the manifest ships internal template packs for `General manufacturing`, `Batch and process`, `Food and beverage`, `Apparel`, and `Assembly`, over the workflow templates `Production control`, `Maintenance and downtime`, and `Quality and traceability`.

The pitch, verbatim from approved copy (eyebrow `Plant operations`):

- `Start with POS-independent Shop Profit Control, with Ecommerce requests and Website delivery as connected workflows.`
- `Plan jobs, record output, and close shifts.`
- `Use the working Plant sample for jobs, output, material trace, quality holds, maintenance, problems, and shift close. Machine control and live production writes stay behind review.`

## 2. Pre-demo setup

1. Open `https://app.supermega.dev/settings/?product=plant` — the same destination as the `Start free sample` button on the public `/plant/` landing page.
2. Under `Name your workspace`, enter the client's name in `Business name`.
3. Press `Create Plant and open the job`. The app provisions a scheduled job, materials, and line, and opens `/plant/?tab=production`. The stated first result is `Run a sample production job`.
4. Confirm the sidebar badge reads `Demo mode` and the `Start here` panel names the loaded industry working sample (source line: `Local sample records on this device`).

## 3. Demo script

1. Start on the `Jobs` tab (`/plant/?tab=production`). The `Start here` panel shows the next real step — on a fresh sample the headline is `Record first shift output` — with one primary button.
2. Press the primary action (`Record output`). Walk the client through confirming good output against the active job's target.
3. The panel advances to materials: headline `Record materials used`. Record the shift's material usage — this is the trace the owner reviews later.
4. Point at the metrics row: `Active jobs`, `Shift output`, `Problems & quality`, `Maintenance`, `Materials used`, `Shift close` — one glance tells a supervisor what is open.
5. Open the `Problems` tab (`/plant/?tab=control`) — quality, equipment, downtime, and maintenance containment. Show that open problems block the owner close, which is the accountability argument.
6. Return to `Jobs`. With output and materials recorded and gates clear, the panel offers `Close this shift`; press `Close shift`. The accountable gate opens (`Confirm change`) asking for the responsible name, reason, and evidence reference — read it aloud.
7. Confirm the close and show the recorded shift evidence, then `Plan next job` as the natural next-morning step.

## 4. Objection handling: the boundary

"Can this touch my machines or live production?" — approved copy answers directly: `Machine control and live production writes stay behind review.` The on-screen notice repeats it: `Every production, quality, material, maintenance, and equipment-status change still requires accountable review.`

"Where does the demo data live?" — the panel's source line says `Local sample records on this device`, and setup says `Stays on this device. Nothing is sent or published.`

"What do I get free, and what is paid?" — current public framing: `Explore local examples free. Assisted setup and ongoing service are scoped separately. A sample or submitted brief is not a live business account.` Agree a reviewed quote before paid preparation; do not infer a managed entitlement. The activation gate remains: `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.`

"Who is accountable for a bad entry?" — every change goes through the `Confirm change` gate with a named person, reason, and evidence reference, and the trust line applies: `Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.`

## 5. The close

- Self-serve close: public `/plant/` page, `Start free sample` (`https://app.supermega.dev/settings/?product=plant`), on the supervisor's own phone.
- Retained compatibility route: the historical `Request assisted setup` target is `/contact/?product=plant`. Plant is not in the current public product selector; do not promise Plant pre-selection or sell this retained sample as an active offering. For an explicitly requested enquiry, use `Help me choose` under `What do you need?` and submit with `Request setup` only with authorization; a `Request received: ` ID confirms the brief, not Plant activation.
- From inside the app: the setup page's "Ask SuperMega to set up Plant" link carries the template, for example `https://supermega.dev/contact/?product=plant&template=production-control&utm_source=app&utm_medium=guided_trial`.
- Existing-workspace assistance: `/contact/?product=guide&source=assisted-setup` — submit with `Request setup` only after authorization. Plant is not a current acquisition offer; any retained-workspace support requires an explicitly agreed scope, not automatic managed activation.
