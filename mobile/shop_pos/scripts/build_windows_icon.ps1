param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$OutputPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'windows\runner\resources\app_icon.ico')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Flutter creates a default Windows icon in its generated runner. Keep the
# generated icon aligned with the pinned public favicon instead.
$source = Join-Path $ProjectRoot 'kernel\public\favicon.svg'
$svg = Get-Content -LiteralPath $source -Raw
if ($svg -notmatch 'viewBox="0 0 64 64"' -or
    $svg -notmatch '<rect width="64" height="64" rx="12" fill="#07111f"' -or
    $svg -notmatch '<rect x="1" y="1" width="62" height="62" rx="11" fill="none" stroke="#3B82F6" stroke-opacity="\.5" stroke-width="2"' -or
    $svg -notmatch 'M16 20l13 12-13 12M33 44h15' -or
    $svg -notmatch 'stroke="#3B82F6" stroke-width="6"') {
  throw "Unexpected SuperMega favicon geometry or color: $source"
}

Add-Type -AssemblyName System.Drawing
function New-RoundedRectPath {
  param([single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius)
  $diameter = [single](2 * $Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc([System.Drawing.RectangleF]::new($X, $Y, $diameter, $diameter), 180, 90)
  $path.AddArc([System.Drawing.RectangleF]::new($X + $Width - $diameter, $Y, $diameter, $diameter), 270, 90)
  $path.AddArc([System.Drawing.RectangleF]::new($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter), 0, 90)
  $path.AddArc([System.Drawing.RectangleF]::new($X, $Y + $Height - $diameter, $diameter, $diameter), 90, 90)
  $path.CloseFigure()
  return $path
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = [System.Collections.Generic.List[byte[]]]::new()

foreach ($size in $sizes) {
  $scale = [single]($size / 64.0)
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $pen = [System.Drawing.Pen]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#3B82F6'),
    [single](6 * $scale)
  )
  $border = [System.Drawing.Pen]::new(
    [System.Drawing.Color]::FromArgb(128, 59, 130, 246),
    [single](2 * $scale)
  )
  $background = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#07111f')
  )
  $tile = New-RoundedRectPath 0 0 $size $size ([single](12 * $scale))
  $outline = New-RoundedRectPath $scale $scale ([single](62 * $scale)) ([single](62 * $scale)) ([single](11 * $scale))
  $stream = [System.IO.MemoryStream]::new()
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.FillPath($background, $tile)
    $graphics.DrawPath($border, $outline)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $points = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new([single](16 * $scale), [single](20 * $scale)),
      [System.Drawing.PointF]::new([single](29 * $scale), [single](32 * $scale)),
      [System.Drawing.PointF]::new([single](16 * $scale), [single](44 * $scale))
    )
    $graphics.DrawLines($pen, $points)
    $graphics.DrawLine(
      $pen,
      [single](33 * $scale), [single](44 * $scale),
      [single](48 * $scale), [single](44 * $scale)
    )
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $images.Add($stream.ToArray())
  } finally {
    $stream.Dispose()
    $outline.Dispose()
    $tile.Dispose()
    $background.Dispose()
    $border.Dispose()
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
