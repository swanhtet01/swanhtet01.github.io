import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';

import 'shop_connected_trusted_time_contract.dart';

class ConnectedTrustedTimePinnedAuthorityKey {
  ConnectedTrustedTimePinnedAuthorityKey({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.authorityKeyId,
    required this.authorityKeyGeneration,
    required List<int> publicKey,
  }) : publicKey = List<int>.unmodifiable(publicKey),
       authorityKeyFingerprint = crypto.sha256.convert(publicKey).toString() {
    if (publicKey.length != 32 ||
        coordinatorBindingGeneration < 1 ||
        authorityKeyGeneration < 1) {
      throw const FormatException('trusted-time pinned authority key');
    }
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
  final String authorityKeyId;
  final int authorityKeyGeneration;
  final List<int> publicKey;
  final String authorityKeyFingerprint;

  String get _identity => [
    workspaceId,
    siteId,
    coordinatorDeviceId,
    coordinatorBindingDigest,
    coordinatorBindingGeneration,
    authorityKeyId,
    authorityKeyGeneration,
  ].join('\u0000');

  bool matchesApproval(ConnectedTrustedTimeAuthorityApprovalV1 approval) =>
      workspaceId == approval.workspaceId &&
      siteId == approval.siteId &&
      coordinatorDeviceId == approval.coordinatorDeviceId &&
      coordinatorBindingDigest == approval.coordinatorBindingDigest &&
      coordinatorBindingGeneration == approval.coordinatorBindingGeneration &&
      authorityKeyId == approval.authorityKeyId &&
      authorityKeyFingerprint == approval.authorityKeyFingerprint &&
      authorityKeyGeneration == approval.authorityKeyGeneration;
}

/// Verifies retained trusted-time evidence against caller-supplied,
/// source-reviewed Ed25519 key rings.
///
/// This class supplies no production keys and makes no freshness or replay
/// decision. Durable one-shot consumption and platform-clock validation are
/// separate, fail-closed gates.
class PinnedEd25519ConnectedTrustedTimeAuthorityVerifier
    implements ConnectedTrustedTimeAuthorityVerifier {
  PinnedEd25519ConnectedTrustedTimeAuthorityVerifier({
    required Map<String, List<int>> ownerPublicKeys,
    required Iterable<ConnectedTrustedTimePinnedAuthorityKey> authorityKeys,
  }) : _ownerPublicKeys = Map.unmodifiable(
         ownerPublicKeys.map((key, value) {
           if (value.length != 32) {
             throw const FormatException('trusted-time owner key');
           }
           return MapEntry(key, List<int>.unmodifiable(value));
         }),
       ),
       _authorityKeys = _indexAuthorityKeys(authorityKeys);

  final Map<String, List<int>> _ownerPublicKeys;
  final Map<String, ConnectedTrustedTimePinnedAuthorityKey> _authorityKeys;
  final Ed25519 _algorithm = Ed25519();

  @override
  Future<bool> verifyApproval(
    ConnectedTrustedTimeAuthorityApprovalV1 approval,
  ) async {
    final ownerKey = _ownerPublicKeys[approval.ownerAuthorityKeyId];
    final authorityKey = _authorityKeys[_approvalIdentity(approval)];
    if (ownerKey == null ||
        authorityKey == null ||
        !authorityKey.matchesApproval(approval)) {
      return false;
    }
    return _verify(
      message: utf8.encode(approval.canonicalEvidence),
      signature: approval.ownerAuthoritySignature,
      publicKey: ownerKey,
    );
  }

  @override
  Future<bool> verifyObservation({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  }) async {
    if (!await verifyApproval(approval)) return false;
    final challenge = observation.challenge;
    if (challenge.workspaceId != approval.workspaceId ||
        challenge.siteId != approval.siteId ||
        challenge.coordinatorDeviceId != approval.coordinatorDeviceId ||
        challenge.coordinatorBindingDigest !=
            approval.coordinatorBindingDigest ||
        challenge.coordinatorBindingGeneration !=
            approval.coordinatorBindingGeneration ||
        observation.authorityKeyId != approval.authorityKeyId ||
        observation.authorityKeyFingerprint !=
            approval.authorityKeyFingerprint ||
        observation.authorityKeyGeneration != approval.authorityKeyGeneration ||
        observation.observedAtMillis < approval.issuedAtMillis ||
        observation.validUntilMillis > approval.expiresAtMillis) {
      return false;
    }
    final authorityKey = _authorityKeys[_approvalIdentity(approval)];
    if (authorityKey == null) return false;
    return _verify(
      message: utf8.encode(observation.canonicalSignedPayload),
      signature: observation.authoritySignature,
      publicKey: authorityKey.publicKey,
    );
  }

  Future<bool> _verify({
    required List<int> message,
    required String signature,
    required List<int> publicKey,
  }) async {
    try {
      final signatureBytes = base64Url.decode(base64Url.normalize(signature));
      if (signatureBytes.length != 64 ||
          base64UrlEncode(signatureBytes).replaceAll('=', '') != signature) {
        return false;
      }
      return await _algorithm.verify(
        message,
        signature: Signature(
          signatureBytes,
          publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
        ),
      );
    } on FormatException {
      return false;
    }
  }
}

Map<String, ConnectedTrustedTimePinnedAuthorityKey> _indexAuthorityKeys(
  Iterable<ConnectedTrustedTimePinnedAuthorityKey> keys,
) {
  final result = <String, ConnectedTrustedTimePinnedAuthorityKey>{};
  for (final key in keys) {
    if (result.containsKey(key._identity)) {
      throw const FormatException('duplicate trusted-time authority key');
    }
    result[key._identity] = key;
  }
  return Map.unmodifiable(result);
}

String _approvalIdentity(ConnectedTrustedTimeAuthorityApprovalV1 approval) => [
  approval.workspaceId,
  approval.siteId,
  approval.coordinatorDeviceId,
  approval.coordinatorBindingDigest,
  approval.coordinatorBindingGeneration,
  approval.authorityKeyId,
  approval.authorityKeyGeneration,
].join('\u0000');
