import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'shop_connected_platform_security.dart';

/// A device-bound public trust snapshot. This does not authorize a feed write:
/// the database must recheck the current signed lease, revocation and time
/// inside its own transaction before replay or commit.
final class ConnectedCloudFeedDeviceTrust {
  ConnectedCloudFeedDeviceTrust._({
    required this.signingKeyId,
    required this.publicKeyFingerprintSha256,
    required Map<String, List<int>> feedIssuerKeys,
  }) : feedIssuerKeys = Map.unmodifiable({
         for (final entry in feedIssuerKeys.entries)
           entry.key: List<int>.unmodifiable(entry.value),
       });

  final String signingKeyId;
  final String publicKeyFingerprintSha256;
  final Map<String, List<int>> feedIssuerKeys;
}

/// Source-reviewed issuer pins must be supplied by the application build,
/// never by the HTTP reply, QR pairing payload or local database. This seam is
/// disabled until the owner approves a real issuer registry and native custody.
final class ConnectedCloudFeedProductionTrustSource {
  ConnectedCloudFeedProductionTrustSource({
    ConnectedPlatformSecurity platformSecurity =
        const UnavailableConnectedPlatformSecurity(),
    bool runtimeEnabled = false,
  }) : this._(
         platformSecurity: platformSecurity,
         runtimeEnabled: runtimeEnabled,
         reviewedFeedIssuerKeys: _sourcePinnedFeedIssuerKeys,
       );

  static const Map<String, List<int>> _sourcePinnedFeedIssuerKeys = {};

  /// Synthetic pins cannot enter product AOT, even if a caller enables the
  /// source seam. The actual product issuer registry requires separate review.
  factory ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys({
    required ConnectedPlatformSecurity platformSecurity,
    required Map<String, List<int>> issuerKeys,
  }) {
    if (const bool.fromEnvironment('dart.vm.product')) {
      throw UnsupportedError('Fixture feed issuer pins are unavailable.');
    }
    return ConnectedCloudFeedProductionTrustSource._(
      platformSecurity: platformSecurity,
      runtimeEnabled: true,
      reviewedFeedIssuerKeys: issuerKeys,
    );
  }

  ConnectedCloudFeedProductionTrustSource._({
    required this.platformSecurity,
    required this.runtimeEnabled,
    required Map<String, List<int>> reviewedFeedIssuerKeys,
  }) : reviewedFeedIssuerKeys = Map.unmodifiable({
         for (final entry in reviewedFeedIssuerKeys.entries)
           entry.key: List<int>.unmodifiable(entry.value),
       });

  final ConnectedPlatformSecurity platformSecurity;
  final Map<String, List<int>> reviewedFeedIssuerKeys;
  final bool runtimeEnabled;

  Future<ConnectedCloudFeedDeviceTrust> load({
    required String alias,
    required String expectedSigningKeyId,
    required String expectedFingerprintSha256,
  }) async {
    if (!runtimeEnabled || reviewedFeedIssuerKeys.isEmpty) {
      throw StateError('Cloud-feed production trust unavailable.');
    }
    if (alias.isEmpty ||
        expectedSigningKeyId.isEmpty ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(expectedFingerprintSha256) ||
        reviewedFeedIssuerKeys.entries.any(
          (entry) =>
              !RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$').hasMatch(entry.key) ||
              entry.value.length != 32,
        )) {
      throw const FormatException('connected_cloud_feed_trust_invalid');
    }
    final identity = await platformSecurity.loadIdentity(alias: alias);
    if (identity.alias != alias ||
        identity.keyId != expectedSigningKeyId ||
        identity.publicKeyFingerprintSha256 != expectedFingerprintSha256 ||
        base64.decode(identity.publicKeyBase64).length != 32) {
      throw StateError('Cloud-feed platform identity changed.');
    }
    final random = Random.secure();
    final nonce = Uint8List.fromList(
      List<int>.generate(32, (_) => random.nextInt(256)),
    );
    final challenge = Uint8List.fromList([
      ...utf8.encode('supermega.connected-cloud-feed-key-possession.v1'),
      0,
      ...utf8.encode(alias),
      0,
      ...nonce,
    ]);
    final signature = await platformSecurity.sign(
      alias: alias,
      payload: challenge,
    );
    final verified = await Ed25519().verify(
      challenge,
      signature: Signature(
        signature,
        publicKey: SimplePublicKey(
          base64.decode(identity.publicKeyBase64),
          type: KeyPairType.ed25519,
        ),
      ),
    );
    if (!verified) {
      throw StateError('Cloud-feed platform key possession failed.');
    }
    return ConnectedCloudFeedDeviceTrust._(
      signingKeyId: identity.keyId,
      publicKeyFingerprintSha256: identity.publicKeyFingerprintSha256,
      feedIssuerKeys: reviewedFeedIssuerKeys,
    );
  }
}
