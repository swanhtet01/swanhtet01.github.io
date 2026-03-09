# Mark 1 Strategic TODO

> Mandate: build Swan's personal AI operating system first. The primary environment is Swan's own data and workflows. Future client or industry solutions must be derived from the pilot only after the pilot is stable.

| Priority | Workstream | Owner Pod | Status | Outcome |
| --- | --- | --- | --- | --- |
| P0 | **Personal Pilot Reframe** | Architecture Pod | COMPLETE | Core repo docs now define the system as a single-tenant personal pilot instead of a generic DQMS/manufacturing product. |
| P0 | **Data Estate Inventory** | Knowledge Pod | COMPLETE | Local Yangon Tyre corpus confirmed, shared Drive root validated via service account, and Gmail is now connected for Yangon Tyre-focused query profiles. |
| P0 | **Manus Asset Assimilation** | Knowledge Pod | COMPLETE | Manus and keystore archives are cataloged into `Super Mega Inc/manus_catalog/` with classification, relevance score, and action (`import/reference/quarantine`). |
| P0 | **SuperMega Showroom Rebuild** | Product Pod | IN_PROGRESS | React + TypeScript + Tailwind showroom is implemented in `showroom/` with decision-locked IA and conversion CTAs. |
| P0 | **Domain Cutover + Monitoring** | Platform Pod | IN_PROGRESS | GitHub Pages deploy workflow and domain health workflow/scripts are in place; DNS/TLS cutover still required in provider settings. |
| P0 | **Ingestion Pipeline V1** | Data Systems Pod | TODO | Build reliable ingestion for local files, synced drives, spreadsheets, PDFs, docs, and exported email/web content. |
| P0 | **Grounded Search and Memory** | Retrieval Pod | IN_PROGRESS | Local SQLite full-text indexing is being added over the Yangon Tyre mirror to enable grounded retrieval before heavier memory layers. |
| P0 | **Multi-scale Briefing** | Executive Pod | IN_PROGRESS | Every important query should generate director view, operational readout, granular evidence, and next-action planning from the same sources. |
| P0 | **Daily Briefing Agent** | Executive Pod | IN_PROGRESS | Gmail and local file evidence can now feed grounded daily and weekly briefs once the recurring summary flow is wired. |
| P0 | **Autopilot Execution Cadence** | Executive Pod | IN_PROGRESS | `autopilot-run` command and scheduler runbook are added; next is production scheduling and reliability tuning of Drive publish. |
| P0 | **Personal Dashboard Surface** | Executive Pod | IN_PROGRESS | The latest Swan Intelligence Hub now renders as a stable local site folder and combines internal email, local evidence packs, and curated external watch sources. |
| P1 | **DQMS Foundation Layer** | Quality Pod | COMPLETE | DQMS starter registers and weekly summary outputs are generated through `dqms-sync` and surfaced in platform dashboard snapshots. |
| P1 | **Writer and Research Agents** | Knowledge Work Pod | TODO | Add drafting, synthesis, comparison, and deep-research flows over Swan's own data and selected web sources. |
| P1 | **Browser Automation Layer** | Operator Pod | TODO | Add browser workers only for workflows that cannot be done through APIs or direct file/database access. |
| P1 | **Coding Workspace Integration** | Dev Pod | TODO | Connect the pilot memory and task system to Mark 1 coding workflows so the machine can improve its own repo. |
| P1 | **Model Router Hardening** | Model Ops Pod | TODO | Keep a simple provider router for Gemini, Claude, and optional OpenAI workloads with cost and latency telemetry. |
| P1 | **Workspace Publishing** | Platform Pod | IN_PROGRESS | Local publish works, Shared Drive publish works, and the next step is scheduled recurring execution and role-specific artifact delivery. |
| P2 | **Template Extraction** | Platform Pod | TODO | After the pilot is stable, extract reusable patterns into optional client or industry templates. |
| P0 | **Secret Hygiene** | Security Pod | IN_PROGRESS | Quarantine policy and rotation checklist are documented; API/OAuth key rotation execution remains pending. |

## Immediate Directives

1. Build the data inventory before adding more agents.
2. Prefer API and file-native integrations before browser or desktop automation.
3. Keep the system single-tenant until the memory and retrieval layer is reliable.
4. Treat manufacturing assets as legacy demos, not roadmap drivers.
5. Rotate any credentials that were exposed in screenshots or notes.

## Notes

- Swan is the pilot company and the first client.
- The product is a personal operating layer over Swan's own data estate.
- Track 2 explicitly includes ERP + DQMS + plant-manager workflows for Yangon Tyre leadership.
- Client-facing templates can come later, but only after the personal pilot proves the architecture.
