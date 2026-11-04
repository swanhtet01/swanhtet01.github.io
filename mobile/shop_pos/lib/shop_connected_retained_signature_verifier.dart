import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

/// Synchronous Ed25519 check for already-parsed canonical retained bytes.
/// This verifies only the signature; callers must independently validate the
/// object grammar, scope, issuer generation, chain, and current authority.
/// Empty production pins fail closed.
bool verifyPinnedRetainedEd25519Sync({
  required String canonicalSigningBytes,
  required String signature,
  required String keyId,
  required Map<String, List<int>> pinnedKeys,
}) {
  final key = pinnedKeys[keyId];
  if (key == null ||
      key.length != 32 ||
      !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature)) {
    return false;
  }
  try {
    final signatureBytes = base64Url.decode('$signature==');
    return signatureBytes.length == 64 &&
        base64Url.encode(signatureBytes).replaceAll('=', '') == signature &&
        JWTAlgorithm.EdDSA.verify(
          EdDSAPublicKey(key),
          Uint8List.fromList(utf8.encode(canonicalSigningBytes)),
          Uint8List.fromList(signatureBytes),
        );
  } on Object {
    return false;
  }
}
