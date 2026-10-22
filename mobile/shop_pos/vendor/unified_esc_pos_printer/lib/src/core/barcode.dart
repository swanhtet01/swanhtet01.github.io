/// Barcode type identifier used in ESC/POS GS k command.
enum BarcodeType {
  /// UPC-A (Universal Product Code)
  upcA(0),

  /// UPC-E (Universal Product Code - Compact)
  upcE(1),

  /// EAN-13 (JAN-13)
  ean13(2),

  /// EAN-8 (JAN-8)
  ean8(3),

  /// CODE 39
  code39(4),

  /// ITF (Interleaved 2 of 5)
  itf(5),

  /// CODABAR (NW-7)
  codabar(6),

  /// CODE 128
  code128(73);

  final int value;

  const BarcodeType(this.value);
}

/// Position of HRI (human-readable interpretation) text relative to barcode.
enum BarcodeTextPosition {
  none(0),
  above(1),
  below(2),
  both(3);

  final int value;

  const BarcodeTextPosition(this.value);
}

/// Font used for HRI text.
enum BarcodeTextFont {
  fontA(0),
  fontB(1),
  fontC(2),
  fontD(3),
  fontE(4),
  specialA(97),
  specialB(98);

  final int value;

  const BarcodeTextFont(this.value);
}

/// Barcode validation and byte encoding.
class Barcode {
  /// Validates [data] for [type] and returns the ESC/POS byte sequence.
  static List<int> encode(BarcodeType type, String data) {
    return switch (type) {
      BarcodeType.upcA => _encodeUpcA(data),
      BarcodeType.upcE => _encodeUpcE(data),
      BarcodeType.ean13 => _encodeEan13(data),
      BarcodeType.ean8 => _encodeEan8(data),
      BarcodeType.code39 => _encodeCode39(data),
      BarcodeType.itf => _encodeItf(data),
      BarcodeType.codabar => _encodeCodabar(data),
      BarcodeType.code128 => _encodeCode128(data),
    };
  }

  /// UPC-A — 11 or 12 digits (0–9).
  static List<int> _encodeUpcA(String data) {
    final cleaned = data.replaceAll(RegExp(r'[^0-9]'), '');
    if (![11, 12].contains(cleaned.length)) {
      throw ArgumentError(
        'UPC-A requires 11 or 12 digits, got ${cleaned.length}',
      );
    }
    return cleaned.codeUnits;
  }

  /// UPC-E — 6–8, 11, or 12 digits; first digit must be 0 for 7–12 digit codes.
  static List<int> _encodeUpcE(String data) {
    final cleaned = data.replaceAll(RegExp(r'[^0-9]'), '');
    if (![6, 7, 8, 11, 12].contains(cleaned.length)) {
      throw ArgumentError(
        'UPC-E requires 6–8 or 11–12 digits, got ${cleaned.length}',
      );
    }
    if ([7, 8, 11, 12].contains(cleaned.length) && cleaned[0] != '0') {
      throw ArgumentError(
        'UPC-E with ${cleaned.length} digits must start with 0',
      );
    }
    return cleaned.codeUnits;
  }

  /// EAN-13 / JAN-13 — 12 or 13 digits.
  static List<int> _encodeEan13(String data) {
    final cleaned = data.replaceAll(RegExp(r'[^0-9]'), '');
    if (![12, 13].contains(cleaned.length)) {
      throw ArgumentError(
        'EAN-13 requires 12 or 13 digits, got ${cleaned.length}',
      );
    }
    return cleaned.codeUnits;
  }

  /// EAN-8 / JAN-8 — 7 or 8 digits.
  static List<int> _encodeEan8(String data) {
    final cleaned = data.replaceAll(RegExp(r'[^0-9]'), '');
    if (![7, 8].contains(cleaned.length)) {
      throw ArgumentError(
        'EAN-8 requires 7 or 8 digits, got ${cleaned.length}',
      );
    }
    return cleaned.codeUnits;
  }

  /// CODE39 — min 1 char; 0–9, A–Z, space, $, %, *, +, -, ., /
  static List<int> _encodeCode39(String data) {
    if (data.isEmpty) {
      throw ArgumentError('CODE39 requires at least 1 character');
    }
    if (!RegExp(r'^[0-9A-Z \$%\*+\-./]+$').hasMatch(data)) {
      throw ArgumentError(
        r'CODE39 only accepts: 0-9, A-Z, space, $, %, *, +, -, ., /',
      );
    }
    return data.codeUnits;
  }

  /// ITF (Interleaved 2 of 5) — min 2 digits, even count.
  static List<int> _encodeItf(String data) {
    final cleaned = data.replaceAll(RegExp(r'[^0-9]'), '');
    if (cleaned.length < 2) {
      throw ArgumentError('ITF requires at least 2 digits');
    }
    if (cleaned.length.isOdd) {
      throw ArgumentError('ITF requires an even number of digits');
    }
    return cleaned.codeUnits;
  }

  /// CODABAR (NW-7) — min 2 chars; first and last must be A–D or a–d.
  static List<int> _encodeCodabar(String data) {
    if (data.length < 2) {
      throw ArgumentError('CODABAR requires at least 2 characters');
    }
    if (!RegExp(r'^[0-9A-Da-d\$+\-./:]+$').hasMatch(data)) {
      throw ArgumentError(
        r'CODABAR only accepts: 0-9, A-D, a-d, $, +, -, ., /, :',
      );
    }
    final first = data[0];
    final last = data[data.length - 1];
    final isUpperStartStop =
        RegExp(r'^[A-D]$').hasMatch(first) && RegExp(r'^[A-D]$').hasMatch(last);
    final isLowerStartStop =
        RegExp(r'^[a-d]$').hasMatch(first) && RegExp(r'^[a-d]$').hasMatch(last);
    if (!isUpperStartStop && !isLowerStartStop) {
      throw ArgumentError('CODABAR must start and end with A-D or a-d');
    }
    return data.codeUnits;
  }

  /// CODE128 — min 2 chars; prefix with {A, {B, or {C to select code set.
  static List<int> _encodeCode128(String data) {
    if (data.length < 2) {
      throw ArgumentError('CODE128 requires at least 2 characters');
    }
    return data.codeUnits;
  }
}
