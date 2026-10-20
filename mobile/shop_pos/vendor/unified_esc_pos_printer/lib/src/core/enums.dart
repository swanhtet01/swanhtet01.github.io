enum PrintAlign { left, center, right }

enum PrintCutMode { full, partial }

enum FontType { fontA, fontB }

enum CashDrawer { pin2, pin5 }

/// Choose image printing mode.
///
/// - [bitImageRaster]: GS v 0 (obsolete but widely supported)
/// - [graphics]: GS ( L (modern format)
enum PrintImageMode { bitImageRaster, graphics }

/// Character height/width scale multiplier (1–8×).
enum TextSize {
  size1(1),
  size2(2),
  size3(3),
  size4(4),
  size5(5),
  size6(6),
  size7(7),
  size8(8);

  final int value;

  const TextSize(this.value);

  /// Encode height + width into a single GS ! byte.
  static int decSize(TextSize height, TextSize width) {
    return 16 * (width.value - 1) + (height.value - 1);
  }
}

/// Paper size, width in dots.
enum PaperSize {
  mm58(value: 1, widthMM: 58, widthPixels: 384),
  mm72(value: 2, widthMM: 72, widthPixels: 512),
  mm80(value: 3, widthMM: 80, widthPixels: 576);

  final int value;
  final int widthMM;
  final int widthPixels;

  const PaperSize({
    required this.value,
    required this.widthMM,
    required this.widthPixels,
  });

  /// Calculate characters per line for a given font
  /// Default Font (Font A): ~42-48 chars on 80mm
  /// Condensed Font (Font B): ~56-64 chars on 80mm
  int charsPerLine(FontType? fontType) {
    if (fontType == FontType.fontB) {
      // Font B is smaller, fits more characters
      return (widthPixels / 9).floor();
    } else {
      // Font A is default size
      return (widthPixels / 12).floor();
    }
  }

  @override
  String toString() => '${widthMM}mm (${widthPixels}px)';
}

/// Beep duration for the ESC B command.
enum BeepDuration {
  beep50ms(1),
  beep100ms(2),
  beep150ms(3),
  beep200ms(4),
  beep250ms(5),
  beep300ms(6),
  beep350ms(7),
  beep400ms(8),
  beep450ms(9);

  final int value;

  const BeepDuration(this.value);
}
