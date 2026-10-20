import 'package:flutter_test/flutter_test.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

void main() {
  group('Generator — beep()', () {
    late Generator gen;

    setUpAll(() async {
      final profile = await CapabilityProfile.load(
        jsonString:
            '{"profiles":{"default":{"vendor":"Generic","name":"Generic",'
            '"description":"Generic ESC/POS","codePages":{"0":"CP437"}}}}',
      );
      gen = Generator(PaperSize.mm80, profile);
    });

    test('n=1 emits one ESC B packet', () {
      final bytes = gen.beep(n: 1, duration: BeepDuration.beep100ms);
      // ESC B <count> <duration>  =  0x1B 0x42 0x01 0x02
      expect(bytes.length, 4);
      expect(bytes[0], 0x1B);
      expect(bytes[1], 0x42); // 'B'
      expect(bytes[2], 1); // count
      expect(bytes[3], 2); // PosBeepDuration.beep100ms.value
    });

    test('n=10 emits two ESC B packets (9 + 1)', () {
      final bytes = gen.beep(n: 10, duration: BeepDuration.beep50ms);
      // 9 beeps: 4 bytes; 1 beep: 4 bytes → total 8 bytes
      expect(bytes.length, 8);
      expect(bytes[2], 9); // first packet count
      expect(bytes[6], 1); // second packet count
    });

    test('n=0 returns empty list', () {
      expect(gen.beep(n: 0), isEmpty);
    });
  });

  group('Generator — drawer()', () {
    late Generator gen;

    setUpAll(() async {
      final profile = await CapabilityProfile.load(
        jsonString:
            '{"profiles":{"default":{"vendor":"Generic","name":"Generic",'
            '"description":"Generic","codePages":{"0":"CP437"}}}}',
      );
      gen = Generator(PaperSize.mm80, profile);
    });

    test('pin2 emits correct bytes', () {
      final bytes = gen.drawer(pin: CashDrawer.pin2);
      // ESC p 0 3 0  →  0x1B 0x70 0x30 0x33 0x30
      expect(bytes.contains(0x70), isTrue); // 'p'
    });
  });

  group('Ticket', () {
    late Ticket ticket;

    setUpAll(() async {
      final profile = await CapabilityProfile.load(
        jsonString:
            '{"profiles":{"default":{"vendor":"Generic","name":"Generic",'
            '"description":"Generic","codePages":{"0":"CP437"}}}}',
      );
      ticket = Ticket(PaperSize.mm80, profile);
    });

    test('bytes returns unmodifiable list', () {
      ticket.reset();
      expect(() => ticket.bytes.add(0), throwsUnsupportedError);
    });

    test('clear empties the buffer', () {
      ticket.reset();
      expect(ticket.bytes, isNotEmpty);
      ticket.clear();
      expect(ticket.bytes, isEmpty);
    });

    test('text appends bytes', () {
      ticket.clear();
      ticket.text('Hello');
      expect(ticket.bytes, isNotEmpty);
    });

    test('cut appends the cut command', () {
      ticket.clear();
      ticket.cut();
      expect(ticket.bytes, isNotEmpty);
    });

    test('cut with linesBefore prepends feed lines', () {
      ticket.clear();
      ticket.cut();
      final int cutOnly = ticket.bytes.length;

      ticket.clear();
      ticket.cut(linesBefore: 5);
      expect(ticket.bytes.length, greaterThan(cutOnly));
    });
  });
}
