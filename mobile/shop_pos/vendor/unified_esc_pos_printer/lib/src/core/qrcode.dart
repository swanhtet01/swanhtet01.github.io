import 'dart:convert';

import 'commands.dart';

/// QR code module size (1–8).
enum QRSize {
  size1(0x01),
  size2(0x02),
  size3(0x03),
  size4(0x04),
  size5(0x05),
  size6(0x06),
  size7(0x07),
  size8(0x08);

  final int value;

  const QRSize(this.value);
}

/// QR code error correction level.
enum QRCorrection {
  /// Level L: Recovery Capacity 7%
  L(48),

  /// Level M: Recovery Capacity 15%
  M(49),

  /// Level Q: Recovery Capacity 25%
  Q(50),

  /// Level H: Recovery Capacity 30%
  H(51);

  final int value;

  const QRCorrection(this.value);
}

/// Generates native ESC/POS QR code byte sequence (GS ( k commands).
class QRCode {
  QRCode(String text, QRSize size, QRCorrection level) {
    final List<int> textBytes = latin1.encode(text);

    // FN 167 — set module size
    bytes += cQrHeader.codeUnits + [0x03, 0x00, 0x31, 0x43, size.value];

    // FN 169 — set error correction level
    bytes += cQrHeader.codeUnits + [0x03, 0x00, 0x31, 0x45, level.value];

    // FN 180 — store data in symbol storage area
    bytes += cQrHeader.codeUnits +
        [textBytes.length + 3, 0x00, 0x31, 0x50, 0x30] +
        textBytes;

    // FN 181 — print the symbol
    bytes += cQrHeader.codeUnits + [0x03, 0x00, 0x31, 0x51, 0x30];
  }

  List<int> bytes = <int>[];
}
