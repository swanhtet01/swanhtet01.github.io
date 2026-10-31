param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$OutputPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'windows\runner\resources\app_icon.ico')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Flutter creates a default Windows icon in its generated runner. Use the
# same unboxed mark as the Android, iPad, and public Shop surfaces.
$source = Join-Path $ProjectRoot 'mobile\shop_pos\assets\supermega-mark.svg'
$svg = Get-Content -LiteralPath $source -Raw
if ($svg -notmatch 'viewBox="0 0 72 44"' -or
    $svg -notmatch 'M10 9 26 22 10 35M35 35h27' -or
    $svg -notmatch 'stroke="#2563eb"') {
  throw "Unexpected SuperMega favicon geometry or color: $source"
}

Add-Type -AssemblyName System.Drawing
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = [System.Collections.Generic.List[byte[]]]::new()

foreach ($size in $sizes) {
  $scale = [single]($size / 72.0)
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $pen = [System.Drawing.Pen]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#2563eb'),
    [single](6 * $scale)
  )
  $stream = [System.IO.MemoryStream]::new()
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
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
    $graphics.DrawLine(
      $pen,
      [single](35 * $scale), [single](49 * $scale),
      [single](62 * $scale), [single](49 * $scale)
    )
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $images.Add($stream.ToArray())
  } finally {
    $stream.Dispose()
    $pen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

# ICO directory entries may contain PNG payloads on supported Windows builds.
# Keep all common shell/taskbar sizes so Windows does not magnify a tiny glyph.
$ico = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($ico)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$sizes.Count)
  $offset = [uint32](6 + 16 * $sizes.Count)
  for ($index = 0; $index -lt $sizes.Count; $index++) {
    $size = $sizes[$index]
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$index].Length)
    $writer.Write($offset)
    $offset += [uint32]$images[$index].Length
  }
  foreach ($bytes in $images) { $writer.Write($bytes) }
  $writer.Flush()
  $destination = Split-Path -Path $OutputPath -Parent
  if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "The generated Windows runner resources are missing: $destination"
  }
  [System.IO.File]::WriteAllBytes($OutputPath, $ico.ToArray())
} finally {
  $writer.Dispose()
  $ico.Dispose()
}

$icon = [System.Drawing.Icon]::new($OutputPath)
try {
  if ($icon.Width -lt 16 -or $icon.Height -lt 16) {
    throw 'The Windows launcher icon could not be read back.'
  }
} finally {
  $icon.Dispose()
}
Write-Output "Windows SuperMega launcher: $OutputPath"
