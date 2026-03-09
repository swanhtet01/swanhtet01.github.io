# Your Live Solution (Yangon Tyre)

This is your active AI-native management system for Yangon Tyre.

## Where it is

- Main dashboard: `swan-intelligence-hub/index.html`
- Director brief: `pilot-data/pilot_solution.md`
- DQMS report: `pilot-data/dqms_weekly_summary.md`
- ERP change register: `pilot-data/erp_change_register.md`

## How to use (daily)

Run this one command:

```powershell
.\tools\run_solution.ps1 -SkipDrive
```

It will:

1. run the full pipeline (ERP + DQMS + platform + director brief)
2. refresh your outputs
3. open the dashboard and brief

## Value to you now

- You get one place to see operational signals from Yangon Tyre files.
- Quality/DQMS issues are turned into trackable incidents and CAPA actions.
- File updates are tracked and translated into management actions.
- Director brief gives prioritized decisions instead of raw documents.

## Current limitation

- Gmail user token is still missing, so email signals are reduced.
- After token is completed, supplier/internal/quality email signals flow into the same system.

To complete token quickly after Google sign-in callback:

```powershell
.\tools\gmail_finish.ps1
```

(It reads callback URL from clipboard, or pass `-CallbackUrl` explicitly.)
