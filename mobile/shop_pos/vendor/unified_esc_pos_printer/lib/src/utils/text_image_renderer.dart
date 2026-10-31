import 'dart:math' show max;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart' show TextStyle;
import 'package:image/image.dart' as img;

/// Renders [text] using Flutter's text engine and returns **one [img.Image]
/// per line of text**.
///
/// This is the recommended function for printing multi-script text on thermal
/// printers because it ensures that each raster (`GS v 0`) block stays small
/// (one line ≈ 30–40 px tall × compressed width), well within the printer's
/// typical 4–8 KB receive buffer.
///
/// For LTR scripts each line image is cropped to its actual text width
/// (rounded to the nearest 8-pixel boundary). RTL lines keep the full
/// [maxWidth] to preserve right-aligned layout.
///
/// Parameters:
/// - [text] — the text to render; may wrap across multiple lines.
/// - [style] — [TextStyle] controlling font size, weight, decoration,
///   etc. When omitted or when [TextStyle.fontSize] is `null`, the font
///   size defaults to **24 pt**. The foreground colour defaults to black.
/// - [maxWidth] — printable dot-width of the paper (default 576 for 80 mm).
/// - [textDirection] — pass [ui.TextDirection.rtl] for Arabic, Hebrew, etc.
///
/// Example:
/// ```dart
/// for (final lineImg in await renderTextLinesAsImages('long korean text…')) {
///   ticket.imageRaster(lineImg);
/// }
/// // With custom style:
/// await ticket.textRaster(
///   '欢迎光临！',
///   style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
/// );
/// ```
Future<List<img.Image>> renderTextLinesAsImages(
  String text, {
  TextStyle? style,
  double maxWidth = 576,
  ui.TextDirection textDirection = ui.TextDirection.ltr,
}) async {
  final double effectiveFontSize = style?.fontSize ?? 24;
  final paragraph = (ui.ParagraphBuilder(
    ui.ParagraphStyle(textDirection: textDirection),
  )
        ..pushStyle(
          ui.TextStyle(
            color: style?.color ?? const ui.Color(0xFF000000),
            fontSize: effectiveFontSize,
            fontWeight: style?.fontWeight,
            fontStyle: style?.fontStyle,
            decoration: style?.decoration,
            decorationColor: style?.decorationColor,
            decorationStyle: style?.decorationStyle,
            decorationThickness: style?.decorationThickness,
            letterSpacing: style?.letterSpacing,
            wordSpacing: style?.wordSpacing,
            height: style?.height,
            locale: style?.locale,
            background: style?.background,
            foreground: style?.foreground,
            shadows: style?.shadows,
            fontFeatures: style?.fontFeatures,
            fontFamily: style?.fontFamily,
            fontFamilyFallback: style?.fontFamilyFallback,
          ),
        )
        ..addText(text))
      .build()
    ..layout(ui.ParagraphConstraints(width: maxWidth));

  final List<ui.LineMetrics> lineMetrics = paragraph.computeLineMetrics();
  if (lineMetrics.isEmpty) return [];

  final double totalHeight = paragraph.height;
  if (totalHeight <= 0) return [];

  // Render the full paragraph once.
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);

  canvas.drawRect(
    ui.Rect.fromLTWH(0, 0, maxWidth, totalHeight),
    ui.Paint()..color = const ui.Color(0xFFFFFFFF),
  );
  canvas.drawParagraph(paragraph, ui.Offset.zero);

  final uiImage = await recorder
      .endRecording()
      .toImage(maxWidth.ceil(), totalHeight.ceil());
  final byteData = await uiImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  final bytes = byteData!.buffer.asUint8List();

  final img.Image fullImage = img.Image.fromBytes(
    width: maxWidth.ceil(),
    height: totalHeight.ceil(),
    bytes: bytes.buffer,
    order: img.ChannelOrder.rgba,
    numChannels: 4,
  );

  // Crop each line into its own image.
  final List<img.Image> result = [];
  for (final line in lineMetrics) {
    final int yTop =
        (line.baseline - line.ascent).floor().clamp(0, fullImage.height - 1);
    final int yBot =
        (line.baseline + line.descent).ceil().clamp(yTop + 1, fullImage.height);

    // LTR: crop to tight content width (reduces raster data by ~60–70%).
    // RTL: keep full width so right-aligned text isn't clipped.
    final int lineW;
    final int cropX;

    if (textDirection == ui.TextDirection.ltr) {
      lineW = max(8, (line.width / 8).ceil() * 8).clamp(1, fullImage.width);
      cropX = 0;
    } else {
      lineW = fullImage.width;
      cropX = 0;
    }

    result.add(
      img.copyCrop(
        fullImage,
        x: cropX,
        y: yTop,
        width: lineW,
        height: yBot - yTop,
      ),
    );
  }

  return result;
}
