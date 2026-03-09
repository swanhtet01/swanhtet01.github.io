# SuperMega Program Tracks

## Track 1: Public Website (`supermega.dev`)

- Repo: this repository (`swanhtet01.github.io...`)
- Website app path: `showroom/`
- Deployment workflow: `.github/workflows/showroom-pages.yml`
- Current status:
  - DNS and TXT verification configured
  - Waiting for GitHub Pages repo-level configuration and HTTPS cutover completion

## Track 2: Personal ERP Pilot (Yangon Tyre)

- Runtime package: `mark1_pilot/`
- Data sources:
  - Gmail profiles (internal + supplier + quality)
  - Local Yangon Tyre Drive mirror
  - Shared Drive publish target
- Product direction:
  - AI-native management copilot for director and plant-manager workflows
  - ERP-like operational visibility (sales, cash, procurement, production)
  - DQMS quality control (incidents, supplier nonconformance, CAPA)
  - role-based outputs for managers and fellow directors
- Core outputs:
  - `platform_digest.*`
  - `dqms_*`
  - `erp_snapshot.json`
  - `erp_change_register.*`
  - `pilot_solution.*`
- Current status:
  - Operational and running with cross-platform command wrapper
  - Daily autopilot available via `autopilot-run`

## Track 3: SuperMega Company R&D and Commercialization

- Public packaging:
  - `showroom/` messaging and package structure
  - sales collateral in `Super Mega Inc/sales/`
- Internal execution:
  - runbooks in `Super Mega Inc/runbooks/`
  - daily autopilot + artifact cadence
- Productization goals:
  - convert pilot modules into reusable offers
  - separate single-tenant pilot operations from reusable templates
