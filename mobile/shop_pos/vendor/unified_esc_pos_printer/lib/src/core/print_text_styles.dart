import 'enums.dart';

/// Immutable text style configuration for ESC/POS printing.
class PrintTextStyle {
  const PrintTextStyle({
    this.bold = false,
    this.reverse = false,
    this.underline = false,
    this.turn90 = false,
    this.height = TextSize.size1,
    this.width = TextSize.size1,
    this.fontType,
    this.codeTable,
  });

  /// All fields initialised to explicit defaults (including fontA and CP437).
  const PrintTextStyle.defaults({
    this.bold = false,
    this.reverse = false,
    this.underline = false,
    this.turn90 = false,
    this.height = TextSize.size1,
    this.width = TextSize.size1,
    this.fontType = FontType.fontA,
    this.codeTable = 'CP437',
  });

  final bool bold;
  final bool reverse;
  final bool underline;

  /// Rotate text 90° clockwise (if supported by the printer).
  final bool turn90;

  final TextSize height;
  final TextSize width;

  /// Null means "use the printer default / global font".
  final FontType? fontType;

  /// Null means "use the printer default / global code table".
  final String? codeTable;

  PrintTextStyle copyWith({
    bool? bold,
    bool? reverse,
    bool? underline,
    bool? turn90,
    TextSize? height,
    TextSize? width,
    FontType? fontType,
    String? codeTable,
  }) {
    return PrintTextStyle(
      bold: bold ?? this.bold,
      reverse: reverse ?? this.reverse,
      underline: underline ?? this.underline,
      turn90: turn90 ?? this.turn90,
      height: height ?? this.height,
      width: width ?? this.width,
      fontType: fontType ?? this.fontType,
      codeTable: codeTable ?? this.codeTable,
    );
  }
}
