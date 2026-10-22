import 'package:flutter_test/flutter_test.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

/// Count occurrences of the ESC a (select justification) command: 0x1B 0x61.
int countAlignCmds(List<int> bytes) {
  int n = 0;
  for (int i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] == 0x1B && bytes[i + 1] == 0x61) n++;
  }
  return n;
}

/// Index of the first LF (0x0A) in the byte stream, or -1.
int firstLf(List<int> bytes) => bytes.indexOf(0x0A);

void main() {
  late Generator gen;

  setUpAll(() async {
    final profile = await CapabilityProfile.load(
      jsonString:
          '{"profiles":{"default":{"vendor":"Generic","name":"Generic",'
          '"description":"Generic","codePages":{"0":"CP437"}}}}',
    );
    gen = Generator(PaperSize.mm80, profile);
  });

  test('row emits ESC a only once, at the start of the line (issue #10)', () {
    final bytes = gen.row([
      PrintColumn(text: 'Item', flex: 6),
      PrintColumn(text: 'Qty', flex: 2),
      PrintColumn(text: 'Price', flex: 4),
    ]);

    // Exactly one justification command for the whole row — no mid-line ESC a.
    expect(countAlignCmds(bytes), 1,
        reason: 'row() must not re-issue ESC a per column');

    // The single ESC a must be the first style command (line start), before
    // any printable text or line feed.
    final escAIdx = bytes.indexOf(0x1B); // first ESC ... should be ESC a
    expect(bytes[escAIdx + 1], 0x61, reason: 'first command should be ESC a');

    // Only one LF for the row, and it is the final byte.
    expect(firstLf(bytes), bytes.length - 1);
    expect(bytes.where((b) => b == 0x0A).length, 1);
  });

  test('mixed-alignment row still emits a single justification command', () {
    final bytes = gen.row([
      PrintColumn(text: 'Item', flex: 2),
      PrintColumn(text: r'$3.50', flex: 1, align: PrintAlign.right),
    ]);
    expect(countAlignCmds(bytes), 1);
  });

  test('bold column emits ESC E on and CR overstrike (issue #23)', () {
    final bytes = gen.row([
      PrintColumn(text: 'Label', flex: 7),
      PrintColumn(
        text: 'BOLD',
        flex: 3,
        align: PrintAlign.right,
        style: const PrintTextStyle(bold: true),
      ),
    ]);

    // ESC E \x01 must appear for the bold column.
    var boldOnCount = 0;
    for (var i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] == 0x1B && bytes[i + 1] == 0x45 && bytes[i + 2] == 0x01) {
        boldOnCount++;
      }
    }
    expect(boldOnCount, greaterThanOrEqualTo(1),
        reason: 'row() must emit ESC E 1 for bold PrintColumn.style');

    // CR overstrike reinforces mid-line bold on clone printers.
    expect(bytes.contains(0x0D), isTrue,
        reason: 'bold positioned text must emit CR for overstrike');

    // Still a single-line row: one ESC a, one LF at the end.
    expect(countAlignCmds(bytes), 1);
    expect(bytes.where((b) => b == 0x0A).length, 1);
    expect(firstLf(bytes), bytes.length - 1);

    // "BOLD" appears twice (print + overstrike).
    final boldAscii = 'BOLD'.codeUnits;
    var occurrences = 0;
    for (var i = 0; i <= bytes.length - boldAscii.length; i++) {
      var match = true;
      for (var j = 0; j < boldAscii.length; j++) {
        if (bytes[i + j] != boldAscii[j]) {
          match = false;
          break;
        }
      }
      if (match) occurrences++;
    }
    expect(occurrences, 2,
        reason: 'bold column text must be printed twice for overstrike');
  });
}
