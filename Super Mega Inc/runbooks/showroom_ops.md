# SuperMega Showroom Operations Runbook

## Purpose

Run `supermega.dev` as a conversion-focused public showroom with measurable pipeline outcomes.

## Daily cadence

1. Check domain and site health report.
2. Review incoming leads and update tracker stage.
3. Publish one proof artifact or case study improvement per day.
4. Send proposals for all discovery-complete leads within 24 hours.

## Build and preview

```powershell
cd showroom
npm ci
npm run build
npm run preview
```

## Deployment path

- GitHub Actions workflow: `.github/workflows/showroom-pages.yml`
- Build source: `showroom/`
- Artifact: `showroom/dist`

## Lead capture operations

- Primary route: `/contact`
- If `VITE_LEAD_ENDPOINT` is set:
  - form submits JSON to endpoint
- If endpoint is not set:
  - form falls back to email compose flow with lead payload

## Pipeline stages (minimum)

- New Lead
- Qualified
- Discovery Done
- Proposal Sent
- Won/Lost

## Weekly reporting

Track these metrics every week:

- Visitors to contact page
- Lead submissions
- Discovery calls completed
- Proposals sent
- Win rate
- Median time from lead to proposal
