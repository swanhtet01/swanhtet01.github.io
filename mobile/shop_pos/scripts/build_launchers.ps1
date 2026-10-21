param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Keep native launchers in step with the existing square-free SuperMega mark.
# The path below is the two-stroke terminal glyph in kernel/public/favicon.svg.
$source = Join-Path $ProjectRoot 'kernel\public\favicon.svg'
$svg = Get-Content -LiteralPath $source -Raw
if ($svg -notmatch 'viewBox="0 0 72 44"' -or
    $svg -notmatch 'M10 9 26 22 10 35M35 35h27' -or
    $svg -notmatch 'stroke="#2563eb"') {
  throw "Unexpected SuperMega favicon geometry or color: $source"
}

Add-Type -AssemblyName System.Drawing
function Save-TerminalMark([int]$size, [string]$output, [bool]$opaque) {
  $scale = [single]($size / 72.0)
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#2563eb'), [single](6 * $scale))
  try {
    $graphics.Clear($(if ($opaque) { [System.Drawing.Color]::White } else { [System.Drawing.Color]::Transparent }))
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $points = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new([single](10 * $scale), [single](23 * $scale)),
      [System.Drawing.PointF]::new([single](26 * $scale), [single](36 * $scale)),
      [System.Drawing.PointF]::new([single](10 * $scale), [single](49 * $scale))
    )
    $graphics.DrawLines($pen, $points)
    $graphics.DrawLine($pen, [single](35 * $scale), [single](49 * $scale), [single](62 * $scale), [single](49 * $scale))
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $pen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$androidSizes = [ordered]@{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($density in $androidSizes.Keys) {
  $size = [int]$androidSizes[$density]
  $output = Join-Path $ProjectRoot "mobile\shop_pos\android\app\src\main\res\mipmap-$density\ic_launcher.png"
  Save-TerminalMark $size $output $false
  Write-Output "Android $density $size $output"
}

# Apple launch icons must be opaque. The white field avoids the rejected dark
# tile treatment while retaining the same mark used by the app favicon.
$iconSet = Join-Path $ProjectRoot 'mobile\shop_pos\ios\Runner\Assets.xcassets\AppIcon.appiconset'
$contents = Get-Content -LiteralPath (Join-Path $iconSet 'Contents.json') -Raw | ConvertFrom-Json
foreach ($entry in $contents.images) {
  $logicalSize = [double](($entry.size -split 'x')[0])
  $multiplier = [int]($entry.scale -replace 'x$', '')
  $size = [int]($logicalSize * $multiplier)
  $output = Join-Path $iconSet $entry.filename
  Save-TerminalMark $size $output $true
  Write-Output "iOS $($entry.idiom) $size $output"
}
