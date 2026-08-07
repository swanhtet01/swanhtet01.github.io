# Generates the per-product 1200x630 social share cards committed at
# tools/public-assets/og-card-<productId>.png, one for each customer product in
# site-manifest.json. The layout reproduces the committed generic og-card.png
# (jade-v2 brand) measured pixel-by-pixel:
#   - #f6f4ee background with the 3px #e5e4de/#d3d3ce ink border
#   - green ">_" mark (Consolas Bold 46px) + "SUPERMEGA" (Segoe UI Bold 36px)
#   - 119x9 accent rule at (72, 246)
#   - headline slot (Segoe UI Bold 66px, ink) -> carries the product name
#   - one-line product description (Segoe UI 31px, muted) under the name
#   - footer "supermega.dev" (Consolas 30px, green) + the brand tagline (muted)
# Regenerate after changing a product name or headline in site-manifest.json,
# then rerun npm run public:prebuilt. The generic og-card.png is not touched.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Path (Join-Path $repoRoot 'site-manifest.json') | ConvertFrom-Json
$assetDir = Join-Path $repoRoot 'tools\public-assets'

function ColorFromHex([string]$hex) {
  $value = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16))
}

$background = ColorFromHex $manifest.brand.colors.background   # #f6f4ee
$ink = ColorFromHex $manifest.brand.colors.ink                 # #17231d
$accent = ColorFromHex $manifest.brand.colors.accent           # #0b745e
$muted = ColorFromHex '#56665d'                                # --muted in the shared page style
$borderOuter = ColorFromHex '#e5e4de'                          # measured from the committed og-card.png
$borderCore = ColorFromHex '#d3d3ce'
$tagline = 'Accountable company software.'

function New-OgCard {
  param([string]$Name, [string]$Headline, [string]$OutPath)

  $bmp = [System.Drawing.Bitmap]::new(1200, 630, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $fmt = [System.Drawing.StringFormat]::GenericTypographic
    $g.Clear($background)

    # Ink border: three nested 1px rectangles matching the committed card's
    # antialiased 2px stroke (rows 0..2 = #e5e4de, #d3d3ce, #e5e4de).
    foreach ($edge in @(@{ Color = $borderOuter; Inset = 0 }, @{ Color = $borderCore; Inset = 1 }, @{ Color = $borderOuter; Inset = 2 })) {
      $pen = [System.Drawing.Pen]::new([System.Drawing.Color]$edge.Color, 1)
      $g.DrawRectangle($pen, [int]$edge.Inset, [int]$edge.Inset, 1199 - 2 * $edge.Inset, 629 - 2 * $edge.Inset)
      $pen.Dispose()
    }

    $accentBrush = [System.Drawing.SolidBrush]::new($accent)
    $inkBrush = [System.Drawing.SolidBrush]::new($ink)
    $mutedBrush = [System.Drawing.SolidBrush]::new($muted)
    $markFont = [System.Drawing.Font]::new('Consolas', 46, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $wordmarkFont = [System.Drawing.Font]::new('Segoe UI', 36, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $nameFont = [System.Drawing.Font]::new('Segoe UI', 66, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $descriptionFont = [System.Drawing.Font]::new('Segoe UI', 31, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $footerFont = [System.Drawing.Font]::new('Consolas', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    try {
      # ">_ SUPERMEGA" mark, same coordinates as the generic card.
      $g.DrawString('>', $markFont, $accentBrush, 73, 82, $fmt)
      $g.DrawString('_', $markFont, $accentBrush, 98, 83, $fmt)
      $g.DrawString('SUPERMEGA', $wordmarkFont, $inkBrush, 135, 86, $fmt)

      # Accent rule.
      $g.FillRectangle($accentBrush, 72, 246, 119, 9)

      # Product name in the generic card's headline slot.
      $g.DrawString($Name, $nameFont, $inkBrush, 73, 296, $fmt)

      # One-line product description.
      $g.DrawString($Headline, $descriptionFont, $mutedBrush, 74, 404, $fmt)

      # Footer: green domain plus the brand tagline.
      $g.DrawString('supermega.dev', $footerFont, $accentBrush, 74, 512, $fmt)
      $domainWidth = $g.MeasureString('supermega.dev', $footerFont, [System.Drawing.PointF]::new(0, 0), $fmt).Width
      $g.DrawString(([char]0x00B7).ToString() + ' ' + $tagline, $footerFont, $mutedBrush, [single](74 + $domainWidth + 17), 512, $fmt)
    } finally {
      foreach ($resource in @($accentBrush, $inkBrush, $mutedBrush, $markFont, $wordmarkFont, $nameFont, $descriptionFont, $footerFont)) { $resource.Dispose() }
    }
  } finally {
    $g.Dispose()
  }
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $bytes = (Get-Item $OutPath).Length
  Write-Output ("wrote {0} ({1} bytes)" -f $OutPath, $bytes)
}

foreach ($product in $manifest.customerProducts) {
  New-OgCard -Name $product.name -Headline $product.headline -OutPath (Join-Path $assetDir ('og-card-' + $product.id + '.png'))
}
