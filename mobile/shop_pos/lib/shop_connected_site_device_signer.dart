import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'shop_connected_platform_security.dart';
import 'shop_connected_site_client.dart';

/// Explicit bridge from a retained public platform identity to non-exportable
/// Android/Windows signing custody.
///
/// This adapter does not discover identities, create keys, or enable the LAN
/// client. Callers must supply the exact enrolled identity and device ID. The
/// identity is reloaded on both sides of every signature so deleting/recreating
/// an alias or substituting a native key cannot silently change authority.
class ConnectedPlatformDeviceSigner implements ConnectedSiteDeviceSigner {
  ConnectedPlatformDeviceSigner({
    required this.identity,
    required String deviceId,
    required this.platformSecurity,
  }) : deviceId = _requireDeviceId(deviceId),
       _publicKey = _decodePublicKey(identity.publicKeyBase64);

  final ConnectedPlatformIdentity identity;
  @override
  final String deviceId;
  final ConnectedPlatformSecurity platformSecurity;
  final Uint8List _publicKey;

  @override
  String get clientFingerprint => identity.publicKeyFingerprintSha256;

  @override
  String get signingKeyId => identity.publicKeyFingerprintSha256;

  @override
  String get publicKeyBase64Url =>
      base64UrlEncode(_publicKey).replaceAll('=', '');

  @override
  Future<String> sign(List<int> message) async {
    final snapshot = List<int>.of(message);
    if (snapshot.any((value) => value < 0 || value > 255)) {
      snapshot.fillRange(0, snapshot.length, 0);
      throw const ConnectedPlatformSecurityException(
        'platform_signing_payload_invalid',
      );
    }
    final verificationPayload = Uint8List.fromList(snapshot);
    Uint8List? platformPayload;
    Uint8List? signature;
    try {
      final before = await platformSecurity.loadIdentity(alias: identity.alias);
      _requireExactIdentity(before);
      platformPayload = Uint8List.fromList(verificationPayload);
      signature = await platformSecurity.sign(
        alias: identity.alias,
        payload: platformPayload,
      );
      final after = await platformSecurity.loadIdentity(alias: identity.alias);
      _requireExactIdentity(after);
      if (signature.length != 64) {
        throw const ConnectedPlatformSecurityException(
          'platform_signature_invalid',
        );
      }
      final valid = await Ed25519().verify(
        verificationPayload,
        signature: Signature(
          signature,
          publicKey: SimplePublicKey(_publicKey, type: KeyPairType.ed25519),
        ),
      );
      if (!valid) {
        throw const ConnectedPlatformSecurityException(
          'platform_signature_identity_mismatch',
        );
      }
      return base64UrlEncode(signature).replaceAll('=', '');
    } finally {
      snapshot.fillRange(0, snapshot.length, 0);
      verificationPayload.fillRange(0, verificationPayload.length, 0);
      platformPayload?.fillRange(0, platformPayload.length, 0);
      signature?.fillRange(0, signature.length, 0);
    }
  }

  void _requireExactIdentity(ConnectedPlatformIdentity observed) {
    if (!observed.matches(identity)) {
      throw const ConnectedPlatformSecurityException(
        'platform_signing_identity_substituted',
      );
    }
  }

  static String _requireDeviceId(String value) {
    if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(value)) {
      throw ArgumentError.value(value, 'deviceId', 'invalid device id');
    }
    return value;
  }

  static Uint8List _decodePublicKey(String value) {
    try {
      final decoded = base64Decode(value);
      if (decoded.length != 32 || base64Encode(decoded) != value) {
        throw const FormatException();
      }
      return Uint8List.fromList(decoded);
    } on FormatException {
      throw const ConnectedPlatformSecurityException(
        'platform_public_key_invalid',
      );
    }
  }
}
