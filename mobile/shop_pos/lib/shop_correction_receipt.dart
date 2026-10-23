import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';

const shopCorrectionAuthorizationReceiptContract =
    'supermega.shop.correction-authorization-receipt.v2';
const shopLegacyCorrectionAuthorizationReceiptContract =
    'supermega.shop.correction-authorization-receipt.v1';
const shopCorrectionAuthorizationSignatureContract =
    'supermega.shop.correction-authorization-signature.v1';

/// Reviewed production public pins ship in source before the server switches
/// to their matching private key. An empty ring keeps correction fail-closed.
const shopCorrectionReceiptProductionPublicKeys = <String, String>{};

final _keyIdPattern = RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$');
final _digestPattern = RegExp(r'^[0-9a-f]{64}$');
final _signaturePattern = RegExp(r'^[A-Za-z0-9_-]{86}$');

String _receiptDigest({
  required String contract,
  required String source,
  required String receiptId,
  required String workspaceId,
  required String actorId,
  required String actorLabel,
  required String actorRole,
  required String capability,
  required String commandDigest,
  required int issuedAtMillis,
  required int expiresAtMillis,
}) {
  final projection = jsonEncode(<String, Object>{
    'source': source,
    'receiptId': receiptId,
    'workspaceId': workspaceId,
    'actorId': actorId,
    'actorLabel': actorLabel,
    'actorRole': actorRole,
    'capability': capability,
    'commandDigest': commandDigest,
    'issuedAtMillis': issuedAtMillis,
    'expiresAtMillis': expiresAtMillis,
  });
  return crypto.sha256
      .convert(utf8.encode('$contract\n$projection'))
      .toString();
}

/// Digest of the v2 receipt fields. This is signed by the server; by itself it
/// remains an integrity checksum and is never authorization.
String shopCorrectionAuthorizationReceiptDigest({
  required String source,
  required String receiptId,
  required String workspaceId,
  required String actorId,
  required String actorLabel,
  required String actorRole,
  required String capability,
  required String commandDigest,
  required int issuedAtMillis,
  required int expiresAtMillis,
}) => _receiptDigest(
  contract: shopCorrectionAuthorizationReceiptContract,
  source: source,
  receiptId: receiptId,
  workspaceId: workspaceId,
  actorId: actorId,
  actorLabel: actorLabel,
  actorRole: actorRole,
  capability: capability,
  commandDigest: commandDigest,
  issuedAtMillis: issuedAtMillis,
  expiresAtMillis: expiresAtMillis,
);

String shopLegacyCorrectionAuthorizationReceiptDigestV1({
  required String source,
  required String receiptId,
  required String workspaceId,
  required String actorId,
  required String actorLabel,
  required String actorRole,
  required String capability,
  required String commandDigest,
  required int issuedAtMillis,
  required int expiresAtMillis,
}) => _receiptDigest(
  contract: shopLegacyCorrectionAuthorizationReceiptContract,
  source: source,
  receiptId: receiptId,
  workspaceId: workspaceId,
  actorId: actorId,
  actorLabel: actorLabel,
  actorRole: actorRole,
  capability: capability,
  commandDigest: commandDigest,
  issuedAtMillis: issuedAtMillis,
  expiresAtMillis: expiresAtMillis,
);

bool shopCorrectionAuthorizationReceiptDigestMatches({
  required String receiptDigest,
  required String source,
  required String receiptId,
  required String workspaceId,
  required String actorId,
  required String actorLabel,
  required String actorRole,
  required String capability,
  required String commandDigest,
  required int issuedAtMillis,
  required int expiresAtMillis,
}) => _constantTimeTextEquals(
  receiptDigest,
  shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    commandDigest: commandDigest,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  ),
);

bool shopLegacyCorrectionAuthorizationReceiptDigestMatchesV1({
  required String receiptDigest,
  required String source,
  required String receiptId,
  required String workspaceId,
  required String actorId,
  required String actorLabel,
  required String actorRole,
  required String capability,
  required String commandDigest,
  required int issuedAtMillis,
  required int expiresAtMillis,
}) => _constantTimeTextEquals(
  receiptDigest,
  shopLegacyCorrectionAuthorizationReceiptDigestV1(
    source: source,
    receiptId: receiptId,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    commandDigest: commandDigest,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  ),
);

bool _constantTimeTextEquals(String actual, String expected) {
  if (actual.length != expected.length) return false;
  var difference = 0;
  for (var index = 0; index < expected.length; index++) {
    difference |= expected.codeUnitAt(index) ^ actual.codeUnitAt(index);
  }
  return difference == 0;
}

String shopCorrectionAuthorizationSignatureMessage({
  required String keyId,
  required String receiptDigest,
}) => '$shopCorrectionAuthorizationSignatureContract\n$keyId\n$receiptDigest';

class ShopCorrectionAuthorization {
  const ShopCorrectionAuthorization({
    required this.receiptId,
    required this.receiptDigest,
    required this.workspaceId,
    required this.actorId,
    required this.actorLabel,
    required this.actorRole,
    required this.capability,
    required this.source,
    required this.commandDigest,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
    required this.keyId,
    required this.signature,
  });

  final String receiptId;
  final String receiptDigest;
  final String workspaceId;
  final String actorId;
  final String actorLabel;
  final String actorRole;
  final String capability;
  final String source;
  final String commandDigest;
  final int issuedAtMillis;
  final int expiresAtMillis;
  final String keyId;
  final String signature;
}

class ShopCorrectionReceiptVerifier {
  ShopCorrectionReceiptVerifier(Map<String, String> publicKeys)
    : _publicKeys = Map.unmodifiable(Map.of(publicKeys));

  factory ShopCorrectionReceiptVerifier.production() =>
      ShopCorrectionReceiptVerifier(shopCorrectionReceiptProductionPublicKeys);

  final Map<String, String> _publicKeys;
  final Ed25519 _algorithm = Ed25519();

  bool get hasPinnedKeys {
    if (_publicKeys.isEmpty) return false;
    try {
      for (final entry in _publicKeys.entries) {
        if (!_keyIdPattern.hasMatch(entry.key)) return false;
        _decodeBase64Url(entry.value, expectedLength: 32);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> verify(ShopCorrectionAuthorization authorization) async {
    if (!_keyIdPattern.hasMatch(authorization.keyId) ||
        !_digestPattern.hasMatch(authorization.receiptDigest) ||
        !_signaturePattern.hasMatch(authorization.signature) ||
        !shopCorrectionAuthorizationReceiptDigestMatches(
          receiptDigest: authorization.receiptDigest,
          source: authorization.source,
          receiptId: authorization.receiptId,
          workspaceId: authorization.workspaceId,
          actorId: authorization.actorId,
          actorLabel: authorization.actorLabel,
          actorRole: authorization.actorRole,
          capability: authorization.capability,
          commandDigest: authorization.commandDigest,
          issuedAtMillis: authorization.issuedAtMillis,
          expiresAtMillis: authorization.expiresAtMillis,
        )) {
      return false;
    }
    final encodedPublicKey = _publicKeys[authorization.keyId];
    if (encodedPublicKey == null) return false;
    try {
      final publicKeyBytes = _decodeBase64Url(
        encodedPublicKey,
        expectedLength: 32,
      );
      final signatureBytes = _decodeBase64Url(
        authorization.signature,
        expectedLength: 64,
      );
      return await _algorithm.verify(
        utf8.encode(
          shopCorrectionAuthorizationSignatureMessage(
            keyId: authorization.keyId,
            receiptDigest: authorization.receiptDigest,
          ),
        ),
        signature: Signature(
          signatureBytes,
          publicKey: SimplePublicKey(publicKeyBytes, type: KeyPairType.ed25519),
        ),
      );
    } catch (_) {
      return false;
    }
  }
}

List<int> _decodeBase64Url(String value, {required int expectedLength}) {
  if (value.contains('=')) throw const FormatException('Padding rejected.');
  final decoded = base64Url.decode(
    value.padRight((value.length + 3) ~/ 4 * 4, '='),
  );
  if (decoded.length != expectedLength ||
      base64Url.encode(decoded).replaceAll('=', '') != value) {
    throw const FormatException('Non-canonical base64url.');
  }
  return decoded;
}
