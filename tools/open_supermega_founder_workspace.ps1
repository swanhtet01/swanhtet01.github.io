param()

$Root = 'C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1'
$OpsHub = Join-Path $Root 'Super Mega Inc\ops\index.html'
$OpenHubScript = Join-Path $Root 'tools\open_supermega_ops_hub.ps1'

if (Test-Path $OpenHubScript) {
  powershell -ExecutionPolicy Bypass -File $OpenHubScript | Out-Null
}

Start-Process 'https://app.supermega.dev/app/director'
Start-Process 'https://app.supermega.dev/app/teams'
Start-Process 'https://app.supermega.dev/app/sales'

if (Test-Path $OpsHub) {
  Start-Process $OpsHub
}
