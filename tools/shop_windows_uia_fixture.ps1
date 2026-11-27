param(
  [Parameter(Mandatory = $true)][string]$ResultPath,
  [Parameter(Mandatory = $true)][string]$Nonce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Nonce -cnotmatch '^[a-f0-9]{32}$') { throw 'fixture_nonce_invalid' }
if (Test-Path -LiteralPath $ResultPath) { throw 'fixture_result_preexists' }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SuperMega harmless UIA fixture'
$form.Name = 'SuperMegaUiaFixture'
$form.ClientSize = [System.Drawing.Size]::new(320, 220)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = [System.Drawing.Point]::new(100, 100)
$form.BackColor = [System.Drawing.Color]::White
$form.TopMost = $true

$button = New-Object System.Windows.Forms.Button
$button.Name = 'InvokeFixture'
$button.Text = 'Invoke fixture'
$button.AccessibleName = 'Invoke fixture'
$button.Location = [System.Drawing.Point]::new(20, 20)
$button.Size = [System.Drawing.Size]::new(150, 48)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Ready'
$status.AccessibleName = 'Ready'
$status.Location = [System.Drawing.Point]::new(185, 33)
$status.Size = [System.Drawing.Size]::new(110, 30)

$red = New-Object System.Windows.Forms.Panel
$red.Location = [System.Drawing.Point]::new(20, 100)
$red.Size = [System.Drawing.Size]::new(80, 80)
$red.BackColor = [System.Drawing.Color]::Red

$blue = New-Object System.Windows.Forms.Panel
$blue.Location = [System.Drawing.Point]::new(120, 100)
$blue.Size = [System.Drawing.Size]::new(80, 80)
$blue.BackColor = [System.Drawing.Color]::Blue

$button.Add_Click({
  [System.IO.File]::WriteAllText($ResultPath, $Nonce, [System.Text.Encoding]::ASCII)
  $status.Text = 'Invoked'
  $status.AccessibleName = 'Invoked'
})

$form.Controls.Add($button)
$form.Controls.Add($status)
$form.Controls.Add($red)
$form.Controls.Add($blue)
$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
