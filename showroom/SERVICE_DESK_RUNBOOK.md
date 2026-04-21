# Service Desk Runbook

Practical operating guide for the current `Spa Service Desk` pilot.

## What it is right now

This is a single-location, local-first front-desk workspace for:

- service checkout
- same-day appointment flow
- expense logging
- end-of-day cash close
- JSON export and import

Current live URL:

- `https://supermega-platform-e8m5xhiho-swanhtet01s-projects.vercel.app/app/service-desk/`

When `supermega.dev` DNS is cut over to Vercel, the target route is:

- `https://supermega.dev/app/service-desk/`

## Best way to use it today

Use it as a one-device spa desk first.

Good fit now:

- one owner or one receptionist
- one laptop or one tablet browser
- one branch
- daily manual close

Not safe to treat as fully production-ready yet:

- multi-user team access
- multi-device sync
- automated backups
- real payment terminal integration
- receipt printing
- accounting export

## 10-minute setup for your sister

1. Open the live service desk route in Chrome, Edge, or Safari on the main front-desk device.
2. In `Business profile`, set the real spa name, location, sector, currency, and opening cash float.
3. In `Services catalog`, add the real treatments, durations, prices, and commission rates.
4. In `Staff roster`, add each therapist and front-desk user.
5. In `Appointment intake`, enter the day bookings that matter.
6. Press `Export snapshot` and save the JSON somewhere safe before real use.

## How she should use it each day

Morning:

1. Open the desk.
2. Check the opening float value.
3. Add or update that day's appointments.

During the day:

1. When a customer arrives, keep the appointment in the room flow.
2. When treatment starts, move the appointment to `In treatment`.
3. When treatment ends, move it to `Needs checkout` or press `Use in checkout`.
4. In `Quick checkout`, confirm services, staff, payment method, discount, tip, and notes.
5. Press `Add checkout`.
6. Log any laundry, supplies, refreshments, marketing, or staff-support spending in `Cash-out log`.

End of day:

1. Read `Cash to count`.
2. Read `Deposit target`.
3. Review `Pending checkout`.
4. Search the `Today ledger` for anything missing or suspicious.
5. Export a snapshot JSON and save it to Drive or another shared backup location.

## Important operating rule

The current pilot saves data in the browser on that device. If she changes browser, clears site data, or uses another device, the records will not follow automatically.

That means:

- pick one main device first
- export a snapshot at least daily
- import that snapshot if moving to another device

## Restore or move to another device

1. On the original device, press `Export snapshot`.
2. Copy the JSON file contents.
3. Open the service desk on the new device.
4. Paste the JSON into `Import snapshot JSON`.
5. Press `Load snapshot`.

## Build it yourselves locally

```powershell
cd showroom
npm ci
npm run dev
```

For production build from this Windows Bash or Codex setup:

```powershell
cd showroom
cmd.exe /c npm run build
```

## Deploy it again

From the repo root:

```powershell
cmd.exe /c "set npm_config_cache=%TEMP%\vercel-npm-cache-codex&& npx vercel deploy --prod -y --scope swanhtet01s-projects"
```

## Framework path currently encoded in the project

UI:

- React 19
- TypeScript
- Vite
- Tailwind CSS

Planned production backend path:

- FastAPI
- Pydantic
- Celery or RQ workers
- Postgres
- n8n for workflow automation

## What needs to be built next before this is a real spa system

Must-have next:

- login and staff permissions
- shared database instead of browser-only storage
- automatic backup
- receipt or invoice output
- multi-day reporting and date filters
- customer history

High-value after that:

- package balances and memberships
- gift cards
- WhatsApp or SMS reminders
- therapist commission reports
- basic stock tracking
- accounting export

AI should come after the shared system is stable:

- booking concierge
- daily close checker
- stock watch assistant

## Recommended rollout order

1. Run this pilot for one real desk on one device.
2. Validate the fields, workflow, and daily close numbers for one week.
3. Add backend auth plus Postgres sync.
4. Add backup, receipt output, and reporting.
5. Then add automations and AI copilots.
