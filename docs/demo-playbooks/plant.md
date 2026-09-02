# Plant — client demo playbook

## 1. Client and the 30-second pitch

Who this is for: factories and workshops that plan jobs and record output by shift — the manifest ships internal template packs for `General manufacturing`, `Batch and process`, `Food and beverage`, `Apparel`, and `Assembly`, over the workflow templates `Production control`, `Maintenance and downtime`, and `Quality and traceability`.

The pitch, verbatim from approved copy (eyebrow `Plant operations`):

- `Start with POS-independent Shop Profit Control, then use Plant, Website, and Ecommerce as focused local workflows.`
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

"What do I get free, and what is paid?" — approved framing only: `Free product. Managed intelligence.`, `Run the products free. Add managed company intelligence when the workflow proves value.`, free lane `Operate without a stripped-down plan.` with `No account or model call required`; managed gate `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.` No prices — the public site carries none.

"Who is accountable for a bad entry?" — every change goes through the `Confirm change` gate with a named person, reason, and evidence reference, and the trust line applies: `Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.`

## 5. The close

- Self-serve close: public `/plant/` page, `Start free sample` (`https://app.supermega.dev/settings/?product=plant`), on the supervisor's own phone.
- Assisted close: the landing page's `Request assisted setup` button opens `/contact/?product=plant` with Plant pre-selected in `Starting point`; the form submits with `Send workflow` and confirms with `Request received: ` plus an ID.
- From inside the app: the setup page's "Ask SuperMega to set up Plant" link carries the template, for example `https://supermega.dev/contact/?product=plant&template=production-control&utm_source=app&utm_medium=guided_trial`.
- Managed pilot close: `/contact/?product=guide&source=managed-intelligence` — submit button becomes `Request managed pilot`.
