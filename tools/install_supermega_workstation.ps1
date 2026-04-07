param(
  [string]$BaseUrl = "https://supermega-app-453184845544.asia-southeast1.run.app",
  [string]$PublicUrl = "https://supermega.dev",
  [string]$PythonPath = "",
  [string]$OutputDir = "",
  [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command -Name "Register-ScheduledTask"
Require-Command -Name "New-ScheduledTaskAction"
Require-Command -Name "New-ScheduledTaskTrigger"

$cycleScript = Join-Path $PSScriptRoot "run_supermega_workstation_cycle.ps1"
$outputRoot = if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  Join-Path (Split-Path -Parent $PSScriptRoot) "pilot-data\ops"
} else {
  $OutputDir
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$baseArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", ('"{0}"' -f $cycleScript),
  "-BaseUrl", ('"{0}"' -f $BaseUrl),
  "-PublicUrl", ('"{0}"' -f $PublicUrl),
  "-OutputDir", ('"{0}"' -f $outputRoot)
)
if (-not [string]::IsNullOrWhiteSpace($PythonPath)) {
  $baseArgs += @("-PythonPath", ('"{0}"' -f $PythonPath))
}

$cycleAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($baseArgs -join " ")
$dailyAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (($baseArgs + "-Daily") -join " ")

$cycleTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At 8:00AM

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$userId = if ([string]::IsNullOrWhiteSpace($env:USERDOMAIN)) {
  $env:USERNAME
} else {
  "{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME
}

Register-ScheduledTask -TaskName "SuperMega Workstation Cycle" -Action $cycleAction -Trigger $cycleTrigger -Settings $settings -User $userId -Force | Out-Null
Register-ScheduledTask -TaskName "SuperMega Founder Daily" -Action $dailyAction -Trigger $dailyTrigger -Settings $settings -User $userId -Force | Out-Null

if ($RunNow) {
  $runNowArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $cycleScript,
    "-BaseUrl", $BaseUrl,
    "-PublicUrl", $PublicUrl,
    "-OutputDir", $outputRoot
  )
  if (-not [string]::IsNullOrWhiteSpace($PythonPath)) {
    $runNowArgs += @("-PythonPath", $PythonPath)
  }
  & powershell.exe @runNowArgs | Out-Null
}

@{
  status = "ready"
  output_dir = $outputRoot
  tasks = @(
    [ordered]@{ name = "SuperMega Workstation Cycle"; cadence = "every 2 hours" },
    [ordered]@{ name = "SuperMega Founder Daily"; cadence = "daily at 08:00" }
  )
} | ConvertTo-Json -Depth 5
