# Autopilot Scheduler Runbook (Windows)

## Objective

Run the SuperMega personal pilot automatically every day and keep fresh artifacts in `pilot-data/`.

## Manual run

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_autopilot.ps1
```

## Register daily scheduled task

Run from elevated PowerShell:

```powershell
$repo = "C:\Users\swann\OneDrive - BDA\swanhtet01.github.io.worktrees\copilot-worktree-2026-03-04T08-10-33"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$repo\tools\run_autopilot.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 06:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "SuperMegaAutopilotDaily" -Action $action -Trigger $trigger -Settings $settings -Description "Runs Mark1 autopilot daily"
```

## Verify

1. Open Task Scheduler and run `SuperMegaAutopilotDaily` once.
2. Confirm updated:
   - `pilot-data/autopilot_status.json`
   - `pilot-data/platform_digest.json`
   - `pilot-data/dqms_weekly_summary.md`

## Notes

- Keep `--skip-drive` enabled until Google Drive publish connectivity is stable.
- Remove `--skip-drive` in `tools/run_autopilot.ps1` once Shared Drive publish is confirmed.
