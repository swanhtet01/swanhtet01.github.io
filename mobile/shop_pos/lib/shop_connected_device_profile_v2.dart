import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:pointycastle/pointycastle.dart';

/// Default-off Windows device profile. This verifies public signatures only;
/// enrollment, CNG custody and product activation are separate gates.
const connectedP256DeviceProfileV2 = 'p256-sha256-v2';
final _p256Order = BigInt.parse(
  'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
  radix: 16,
);
final _p256Prime = BigInt.parse(
  'ffffffff00000001000000000000000000000000ffffffffffffffffffffffff',
  radix: 16,
);
final _p256B = BigInt.parse(
  '5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b',
  radix: 16,
);

BigInt _coordinate(Uint8List bytes) => BigInt.parse(
  bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join(),
  radix: 16,
);

Uint8List _decodeCanonical(String value, int length) {
  if (!RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value)) {
    throw const FormatException('connected_device_v2_encoding');
  }
  try {
    final bytes = Uint8List.fromList(
      base64Url.decode(value.padRight((value.length + 3) ~/ 4 * 4, '=')),
    );
    if (bytes.length != length ||
        base64Url.encode(bytes).replaceAll('=', '') != value) {
      throw const FormatException('connected_device_v2_encoding');
    }
    return bytes;
  } on FormatException {
    throw const FormatException('connected_device_v2_encoding');
  }
}

/// SEC1 uncompressed P-256 point plus fixed P1363 low-S signature.
/// The signer must hash the exact canonical message once with SHA-256.
bool verifyConnectedP256DeviceSignatureV2({
  required String publicKeyBase64Url,
  required String fingerprintSha256,
  required String signatureBase64Url,
  required List<int> canonicalMessageBytes,
}) {
  final point = _decodeCanonical(publicKeyBase64Url, 65);
  final signature = _decodeCanonical(signatureBase64Url, 64);
  if (point.first != 4 ||
      !RegExp(r'^[0-9a-f]{64}$').hasMatch(fingerprintSha256) ||
      crypto.sha256.convert(point).toString() != fingerprintSha256 ||
      canonicalMessageBytes.any((value) => value < 0 || value > 255)) {
    throw const FormatException('connected_device_v2_key_binding');
  }
  // PointyCastle decodes SEC1 bytes but does not check the curve equation.
  // Validate both field coordinates before constructing its public key.
  final x = _coordinate(Uint8List.sublistView(point, 1, 33));
  final y = _coordinate(Uint8List.sublistView(point, 33, 65));
  if (x >= _p256Prime ||
      y >= _p256Prime ||
      (y * y - x * x * x + BigInt.from(3) * x - _p256B) % _p256Prime !=
          BigInt.zero) {
    throw const FormatException('connected_device_v2_public_key_invalid');
  }
  final r = BigInt.parse(
    signature
        .sublist(0, 32)
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join(),
    radix: 16,
  );
  final s = BigInt.parse(
    signature
        .sublist(32)
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join(),
    radix: 16,
  );
  if (r < BigInt.one ||
      r >= _p256Order ||
      s < BigInt.one ||
      s > _p256Order ~/ BigInt.two) {
    throw const FormatException('connected_device_v2_signature_canonicality');
  }
  final domain = ECDomainParameters('secp256r1');
  final decodedPoint = domain.curve.decodePoint(point);
  if (decodedPoint == null) {
    throw const FormatException('connected_device_v2_public_key_invalid');
  }
  final signer = Signer('SHA-256/ECDSA')
    ..init(false, PublicKeyParameter(ECPublicKey(decodedPoint, domain)));
  return signer.verifySignature(
    Uint8List.fromList(canonicalMessageBytes),
    ECSignature(r, s),
  );
}
