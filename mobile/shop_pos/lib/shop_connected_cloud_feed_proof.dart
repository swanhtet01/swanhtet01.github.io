import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

import 'shop_connected_site_cloud_feed_contract.dart';
import 'shop_connected_site_contracts.dart';

/// A server signature over the exact cloud page and request, not a TLS log or
/// an issuer key accepted from the response. No production key is installed.
class ConnectedCloudFeedProofV1 {
  const ConnectedCloudFeedProofV1._({
    required this.canonicalBytes,
    required this.unsignedBytes,
    required this.proofDigest,
    required this.issuerKeyId,
    required this.signatureBytes,
  });

  final String canonicalBytes;
  final String unsignedBytes;
  final String proofDigest;
  final String issuerKeyId;
  final List<int> signatureBytes;

  static ConnectedCloudFeedProofV1 parse({
    required String canonicalBytes,
    required ConnectedSiteRetailFeedPageV1 page,
    required ConnectedSiteRetailFeedExpectation expected,
    required String requestNonce,
    required String actorRole,
    required int trustedNowMillis,
  }) {
    if (canonicalBytes.length > 4096 ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(requestNonce) ||
        !const {'owner', 'manager'}.contains(actorRole) ||
        trustedNowMillis <= 0) {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    Object? decoded;
    try {
      decoded = jsonDecode(canonicalBytes);
      if (canonicalConnectedSiteJson(decoded) != canonicalBytes) {
        throw const FormatException('connected_cloud_feed_proof_invalid');
      }
    } on Object {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    final proof = Map<String, Object?>.from(decoded);
    const keys = <String>{
      'contract',
      'protocolVersion',
      'issuerKeyId',
      'issuedAtMillis',
      'expiresAtMillis',
      'workspaceId',
      'siteId',
      'actorId',
      'actorRole',
      'deviceId',
      'authorityGeneration',
      'revocationGeneration',
      'authorityPayloadDigest',
      'leaseDigest',
      'requestDigest',
      'requestNonce',
      'afterSequence',
      'priorEventDigest',
      'nextSequence',
      'nextEventDigest',
      'pageDigest',
      'signature',
    };
    final issued = proof['issuedAtMillis'];
    final expires = proof['expiresAtMillis'];
    final issuer = proof['issuerKeyId'];
    final signature = proof['signature'];
    if (proof.keys.toSet().length != keys.length ||
        !proof.keys.toSet().containsAll(keys) ||
        proof['contract'] != 'supermega.connected-cloud-feed-proof.v1' ||
        proof['protocolVersion'] != connectedSiteProtocolVersion ||
        issuer is! String ||
        !RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$').hasMatch(issuer) ||
        issued is! int ||
        expires is! int ||
        issued <= 0 ||
        expires - issued < 1 ||
        expires - issued > 300000 ||
        trustedNowMillis < issued ||
        trustedNowMillis > expires ||
        proof['workspaceId'] != expected.workspaceId ||
        proof['siteId'] != expected.siteId ||
        proof['actorId'] != expected.actorId ||
        proof['actorRole'] != actorRole ||
        proof['deviceId'] != expected.deviceId ||
        proof['authorityGeneration'] != expected.authorityGeneration ||
        proof['revocationGeneration'] != expected.revocationGeneration ||
        proof['authorityPayloadDigest'] != expected.authorityPayloadDigest ||
        proof['leaseDigest'] != expected.leaseDigest ||
        proof['requestDigest'] != expected.requestDigest ||
        proof['requestNonce'] != requestNonce ||
        proof['afterSequence'] != expected.afterSequence ||
        proof['priorEventDigest'] != expected.priorEventDigest ||
        proof['nextSequence'] != page.nextSequence ||
        proof['nextEventDigest'] != page.nextEventDigest ||
        proof['pageDigest'] != page.pageDigest ||
        signature is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature)) {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    late final List<int> signatureBytes;
    try {
      signatureBytes = base64Url.decode('$signature==');
    } on FormatException {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    if (signatureBytes.length != 64 ||
        base64Url.encode(signatureBytes).replaceAll('=', '') != signature) {
      throw const FormatException('connected_cloud_feed_proof_invalid');
    }
    final unsigned = Map<String, Object?>.from(proof)..remove('signature');
    return ConnectedCloudFeedProofV1._(
      canonicalBytes: canonicalBytes,
      unsignedBytes: canonicalConnectedSiteJson(unsigned),
      proofDigest: connectedSiteSha256(proof),
      issuerKeyId: issuer,
      signatureBytes: List<int>.unmodifiable(signatureBytes),
    );
  }
}

/// No ambient or response-supplied trust root. Empty pins fail closed.
class ConnectedCloudFeedPinnedIssuerVerifier {
  ConnectedCloudFeedPinnedIssuerVerifier(Map<String, List<int>> trustedKeys)
    : _keys = Map<String, List<int>>.unmodifiable({
        for (final entry in trustedKeys.entries)
          if (RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$').hasMatch(entry.key) &&
              entry.value.length == 32)
            entry.key: List<int>.unmodifiable(entry.value),
      }) {
    if (_keys.length != trustedKeys.length) {
      throw const FormatException('connected_cloud_feed_issuer_pin_invalid');
    }
  }

  final Map<String, List<int>> _keys;

  Future<void> verify(ConnectedCloudFeedProofV1 proof) async {
    verifySync(proof);
  }

  /// The same raw Ed25519 check can be used by the synchronous backup reader.
  /// This never accepts an issuer key from the signed response or database.
  void verifySync(ConnectedCloudFeedProofV1 proof) {
    final key = _keys[proof.issuerKeyId];
    if (key == null) {
      throw StateError('connected_cloud_feed_issuer_unavailable');
    }
    final valid = JWTAlgorithm.EdDSA.verify(
      EdDSAPublicKey(key),
      Uint8List.fromList(utf8.encode(proof.unsignedBytes)),
      Uint8List.fromList(proof.signatureBytes),
    );
    if (!valid) {
      throw const FormatException('connected_cloud_feed_signature_invalid');
    }
  }
}
