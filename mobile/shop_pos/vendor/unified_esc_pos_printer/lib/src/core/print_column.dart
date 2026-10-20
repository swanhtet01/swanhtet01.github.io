import 'dart:typed_data' show Uint8List;

import 'enums.dart';
import 'print_text_styles.dart';

/// A single column in a [row] print call.
///
/// Columns are sized proportionally using [flex] — the ratio of one column's
/// width relative to the total. Any positive integers work; the generator
/// converts them to pixel positions automatically.
///
/// ```dart
/// // Three equal columns
/// row([
///   PrintColumn(text: 'Left',   flex: 1),
///   PrintColumn(text: 'Center', flex: 1),
///   PrintColumn(text: 'Right',  flex: 1),
/// ]);
///
/// // 1:2 ratio
/// row([
///   PrintColumn(text: 'Item',        flex: 1),
///   PrintColumn(text: 'Description', flex: 2),
/// ]);
/// ```
///
/// Provide either [text] (plain string) or [textEncoded] (pre-encoded bytes),
/// not both.
///
/// [style] is applied per column (bold, underline, size, etc.). Bold in a
/// row is reinforced with a CR overstrike because many printers ignore
/// mid-line `ESC E`. For Flutter `TextStyle` / multi-script columns, use
/// `rowRaster` instead.
class PrintColumn {
  PrintColumn({
    this.text = '',
    this.textEncoded,
    this.flex = 1,
    this.align = PrintAlign.left,
    this.style = const PrintTextStyle(),
  }) {
    if (flex < 1) {
      throw ArgumentError.value(flex, 'flex', 'Column flex must be ≥ 1');
    }

    if (text.isNotEmpty && textEncoded != null && textEncoded!.isNotEmpty) {
      throw ArgumentError('Provide either text or textEncoded, not both');
    }
  }

  String text;
  Uint8List? textEncoded;
  int flex;
  PrintAlign align;
  PrintTextStyle style;
}
