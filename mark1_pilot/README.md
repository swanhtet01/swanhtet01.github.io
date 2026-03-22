# Mark 1 Pilot

This package is the useful v1 scaffold for Swan's personal pilot.

Initial scope:

- Yangon Tyre document corpus from the local mirror or shared Google Drive folder
- Gmail as the second source once user OAuth is configured
- local inventory and connector validation before any heavier agent runtime

## Why this exists

The older repo has a lot of demo and prototype code, but much of it assumes tools that are not present on this machine, especially `rclone` and `manus-mcp-cli`.

This pilot package starts from what is actually true right now:

- the local `Yangon Tyre` folder exists and contains a real working corpus
- the shared Google Drive folder is reachable through the service account
- Gmail is important, but it requires user OAuth
- secrets should be referenced by file path or env var, not pasted into docs or screenshots

## Files

- `cli.py` - command line entry point
- `config.py` - config loader for the pilot
- `inventory.py` - local source inventory and markdown/json report generation
- `review.py` - operational review generator
- `graph.py` - minimal LangGraph scaffold
- `input_center.py` - structured team-input templates and snapshot summarization
- `erp.py` - ERP-style file change tracking and focus-file monitoring
- `coverage.py` - data coverage scorecard and collection-action generator
- `connectors/google_drive.py` - optional Drive API probe plus Google Sheets input-center integration
- `connectors/gmail.py` - optional Gmail API probe

## Run

Preferred (Windows): use the helper wrapper so it can fall back across available Python executables.

```powershell
.\tools\pilot.ps1 inventory --config .\config.example.json
```

This wrapper is especially useful when `python` or `py` aliases are not available.

Use the local virtual environment already present on this machine:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli inventory --config .\config.example.json
```

To list setup profiles defined in your config:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli config-profiles --config .\config.example.json
```

To create a reusable profile overlay for a new setup/client:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli config-profile-create --config .\config.example.json --profile my_new_client --from-profile smb_template
```

Outputs are written to `pilot-data/`, which is ignored by git.

To snapshot the shared Yangon Tyre Drive structure:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli drive-map --config .\config.example.json --max-depth 2
```

To list shared drives visible to the configured service account (use this to get the new Shared Drive ID):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli drive-shared-list --config .\config.example.json
```

To test a specific folder/shared-drive ID without editing config first:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli drive-map --config .\config.example.json --folder-id YOUR_SHARED_DRIVE_OR_FOLDER_ID --max-depth 2
```

To build a canonical Manus archive catalog with import/reference/quarantine actions:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli manus-catalog --config .\config.example.json --zip-path "C:\Users\swann\Downloads\supermega_manus-20260304T080146Z-1-001.zip" --zip-path "C:\Users\swann\Downloads\keystore-20260309T135435Z-1-001.zip"
```

That command writes:

- `Super Mega Inc/manus_catalog/manus_assets_index.json`
- `Super Mega Inc/manus_catalog/manus_assets_index.md`

Each archive entry is assigned:

- `category`
- `relevance_score`
- `action` (`import`, `reference`, or `quarantine`)

To bootstrap Gmail OAuth and save a token file:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-auth --config .\config.example.json --host 127.0.0.1 --port 8765
```

To validate the Gmail client/token setup and write a diagnostics file:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-check --config .\config.example.json --host 127.0.0.1 --port 8765
```

To write a local Gmail setup guide for the current JSON file:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-setup --config .\config.example.json --host 127.0.0.1 --port 8765
```

If the local browser callback flow is inconvenient, use the manual two-step flow:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-auth-start --config .\config.example.json
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-auth-finish --config .\config.example.json --callback-url "PASTE_THE_FULL_CALLBACK_URL_HERE"
```

To preview Yangon Tyre-relevant email profiles:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-preview --config .\config.example.json --profile internal_ytf --max-results 10
```

To turn a Gmail profile into a decision-oriented brief:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli gmail-brief --config .\config.example.json --profile supplier_kiic --max-results 10 --title "KIIC Email Brief"
```

Current built-in profiles:

- `internal_ytf`
- `supplier_kiic`
- `supplier_junky`
- `supplier_forwarded`
- `quality_watch`
- `relevant_all`

To build a local full-text index over the Yangon Tyre mirror:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli search-index --config .\config.example.json
```

To build a faster targeted index over the most useful folders first:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli search-index --config .\config.example.json --top-level kcm --top-level sales --top-level strategy --top-level production
```

To query the index:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli search-query --config .\config.example.json --query KIIC --top-k 10
```

To generate a more useful decision-oriented brief from the same evidence:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli brief-query --config .\config.example.json --query cash --top-k 5 --title "Cash Evidence Brief"
```

To sync ERP-style file activity tracking (local mirror + Google Drive change registers + watchlist alerts):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli erp-sync --config .\config.example.json
```

ERP outputs written to `pilot-data/`:

- `erp_snapshot.json`
- `erp_change_register.json`
- `erp_change_register.md`
- `erp_drive_snapshot.json`
- `erp_drive_change_register.json`
- `erp_drive_change_register.md`
- `erp_sync_status.json`

To track a specific set of critical files/folders (exact files or wildcard patterns):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli erp-focus --config .\config.example.json --focus "**/*invoice*" --focus "kcm/**"
```

You can also place one term per line in `pilot-data/erp_focus_terms.txt` (or set `erp.focus_terms` in config) and run:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli erp-focus --config .\config.example.json
```

Starter template: `mark1_pilot/erp_focus_terms.example.txt`

This writes:

- `erp_focus_report.json`
- `erp_focus_report.md`



To bootstrap structured Google Sheets for team updates (operations, quality, procurement, sales):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli input-center-setup --config .\config.example.json
```

To sync the latest rows from those sheets into the dashboard pipeline:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli input-center-sync --config .\config.example.json
```

This writes:

- `input_center_registry.json`
- `input_center_snapshot.json`
- `input_center_snapshot.md`
- `input_center_sync_status.json`

To build the combined personal platform digest and dashboard:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli platform-digest --config .\config.example.json --email-max-results 12
```

To build a more personal "pilot solution" brief with prioritized actions from your email + Drive signals:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli pilot-solution --config .\config.example.json --email-max-results 12
```

To generate a data coverage scorecard (what is missing, what to collect, and next actions):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli coverage-report --config .\config.example.json
```

To generate a one-page execution recap across the 3 active tracks (website, YTF pilot, SuperMega productization):

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli execution-review --config .\config.example.json
```

That command writes:

- `data_coverage_report.json`
- `data_coverage_report.md`

That command writes:

- `pilot_solution.json`
- `pilot_solution.md`

That command writes:

- `platform_digest.json`
- `platform_digest.md`
- `platform_dashboard.html`

It also mirrors the latest dashboard into a stable local site folder:

- `swan-intelligence-hub/index.html`
- `swan-intelligence-hub/latest.md`
- `swan-intelligence-hub/latest.json`

To rebuild the latest dashboard and attempt a Google Drive or Workspace publish:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli platform-publish --config .\config.example.json --email-max-results 12
```

To publish against a specific Shared Drive or folder ID immediately:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli platform-publish --config .\config.example.json --folder-id YOUR_SHARED_DRIVE_OR_FOLDER_ID --email-max-results 12
```

You can also set `platform.publish.drive_folder_id` in `config.example.json` so publish uses a dedicated Shared Drive target by default.

The dashboard combines:

- Yangon Tyre Gmail watch profiles
- local file evidence packs
- external public sources such as GNLM, Eleven Myanmar, and MRPPA market signals
- a manual watchlist for harder sources such as Facebook pages that need browser or export-based capture

To generate DQMS starter registers from quality emails + quality search evidence:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli dqms-sync --config .\config.example.json --max-email-results 25 --search-top-k 25
```

If Gmail OAuth token is not available, expired, or revoked, `dqms-sync` now runs in a degraded mode (`ready_with_email_gap`) and still builds quality registers from local evidence.

To regenerate the weekly DQMS summary from saved register files:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli dqms-report --config .\config.example.json
```

To run the autonomous daily pipeline in one command:

```powershell
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli autopilot-run --config .\config.example.json --skip-drive --run-domain-check
```

To run repeated autonomous loops (example: hourly, unlimited):

```powershell
.\tools\autopilot_loop.ps1 -Config .\config.example.json -IntervalMinutes 60 -MaxRuns 0 -SkipDrive
```

To run everything in one command and get a simple operator output bundle:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipDrive
```

To switch between tenant/client setups, use profile overlays from `config.example.json`:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Profile smb_template -SkipDrive
```

You can also set the profile once for direct CLI usage:

```powershell
$env:MARK1_PROFILE = "smb_template"
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli autopilot-run --config .\config.example.json --skip-drive
```

By default this includes a live website domain check. Skip that check if you only want faster local pipeline runs:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipDrive -SkipDomainCheck
```

To serve the latest dashboard and status API for phone/laptop access:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipRun -Serve -BindHost 0.0.0.0 -Port 8787
```

Autopilot output artifacts:

- `autopilot_status.json`
- `autopilot_status.md`
- `erp_snapshot.json`
- `erp_change_register.json`
- `erp_change_register.md`
- `pilot_solution.json`
- `pilot_solution.md`
- `erp_focus_report.json`
- `erp_focus_report.md`
- `data_coverage_report.json`
- `data_coverage_report.md`
- `execution_review.json`
- `execution_review.md`
- `TODAY.json`
- `TODAY.md`

Use these flags when needed:

- `--rebuild-search-index`
- `--skip-dqms`
- `--skip-input-center`
- `--skip-platform-publish`
- `--run-manus-catalog`

DQMS outputs written to `pilot-data/`:

- `dqms_incidents.json`
- `dqms_capa_actions.json`
- `dqms_supplier_nonconformance.json`
- `dqms_weekly_summary.md`

The platform digest/dashboard will include a DQMS snapshot when these files exist.

The local search index uses SQLite FTS and extracts content from `.docx`, `.xlsx`, `.pdf`, and plain-text files when dependencies are installed.

## Auth notes

### Google Drive

Two practical modes:

- `local_mirror`: use the synced local `Yangon Tyre` folder
- `google_drive_api`: use a service account, but only if the target folder is actually shared to that service account or domain-wide access exists

The source-data folder ID is in `sources.drive.google_drive_folder_id`. For publish targets, use `platform.publish.drive_folder_id` so you can keep source and publish destinations separate.

For publishing:

- the current service account can read the shared Yangon Tyre folder
- publishing new files into a normal shared My Drive folder can fail because service accounts do not have storage quota
- publishing to a true Shared Drive with `Content manager` access is the recommended fix
- if needed, use a separate user OAuth Drive publisher

### Gmail

Use user OAuth for Gmail.

The service account JSON is not enough for a normal personal Gmail mailbox.

It is normal to keep Gmail OAuth on `swannyhtet@gmail.com` while using a Workspace-owned Shared Drive under `swanhtet@supermega.dev`.

Your current setup can work in one of two ways:

- easiest: create a new `Desktop app` OAuth client and use that JSON
- acceptable fallback: keep the `Web application` client, but add the exact redirect URI `http://127.0.0.1:8765/` and redownload the JSON

Expected files:

- `GMAIL_OAUTH_CLIENT_JSON`
- `GMAIL_OAUTH_TOKEN_JSON`

If the OAuth client JSON is a `web` client without the exact loopback redirect URI expected by the local auth flow, token bootstrap will fail. Run `gmail-setup` to generate a concrete local guide and `gmail-check` to validate the current JSON.

If Google shows `403 access_denied` and says the app is still being tested, add the exact Google account you are signing in with under `Google Auth Platform -> Audience -> Test users`, then retry the auth flow.

## Output style

The pilot should not stop at raw search results.

Use the `brief-query` command when you want a decision-ready output that includes:

- director view
- operational readout
- granular evidence
- planning output

## LangGraph

`graph.py` is intentionally small. The graph should sit on top of stable source inventory and retrieval, not replace them.
