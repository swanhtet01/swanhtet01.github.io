import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';

const connectedPlatformSecurityChannel =
    'dev.supermega.supermega_shop/connected_security_v1';

class ConnectedPlatformSecurityException implements Exception {
  const ConnectedPlatformSecurityException(this.code);

  final String code;

  @override
  String toString() => 'ConnectedPlatformSecurityException($code)';
}

/// Public identity retained by Dart. Secret signing and at-rest key operations
/// remain behind [ConnectedPlatformSecurity].
class ConnectedPlatformIdentity {
  ConnectedPlatformIdentity({
    required this.alias,
    required this.keyId,
    required this.algorithm,
    required this.publicKeyBase64,
    required this.publicKeyFingerprintSha256,
    required this.tlsCertificateFingerprintSha256,
    required this.sealedTlsMaterialId,
  }) {
    _validateToken(alias, 'alias');
    _validateToken(keyId, 'key_id');
    _validateToken(sealedTlsMaterialId, 'sealed_tls_material_id');
    if (algorithm != 'ed25519') {
      throw const ConnectedPlatformSecurityException(
        'platform_key_algorithm_unsupported',
      );
    }
    final publicKey = _decodeBase64(publicKeyBase64, 'public_key');
    if (publicKey.length != 32) {
      throw const ConnectedPlatformSecurityException(
        'platform_public_key_invalid',
      );
    }
    _validateDigest(
      publicKeyFingerprintSha256,
      'public_key_fingerprint_sha256',
    );
    _validateDigest(
      tlsCertificateFingerprintSha256,
      'tls_certificate_fingerprint_sha256',
    );
    final actual = crypto.sha256.convert(publicKey).toString();
    if (actual != publicKeyFingerprintSha256) {
      throw const ConnectedPlatformSecurityException(
        'platform_public_key_fingerprint_mismatch',
      );
    }
  }

  final String alias;
  final String keyId;
  final String algorithm;
  final String publicKeyBase64;
  final String publicKeyFingerprintSha256;
  final String tlsCertificateFingerprintSha256;
  final String sealedTlsMaterialId;

  factory ConnectedPlatformIdentity.fromJson(Object? value) {
    if (value is! Map) {
      throw const ConnectedPlatformSecurityException(
        'platform_identity_invalid',
      );
    }
    final map = value.map((key, item) => MapEntry(key.toString(), item));
    const requiredKeys = <String>{
      'schema',
      'alias',
      'keyId',
      'algorithm',
      'publicKeyBase64',
      'publicKeyFingerprintSha256',
      'tlsCertificateFingerprintSha256',
      'sealedTlsMaterialId',
    };
    if (map.keys.toSet().difference(requiredKeys).isNotEmpty ||
        requiredKeys.difference(map.keys.toSet()).isNotEmpty ||
        map['schema'] != 'supermega.connected-platform-identity.v1') {
      throw const ConnectedPlatformSecurityException(
        'platform_identity_invalid',
      );
    }
    String field(String key) {
      final item = map[key];
      if (item is! String) {
        throw const ConnectedPlatformSecurityException(
          'platform_identity_invalid',
        );
      }
      return item;
    }

    return ConnectedPlatformIdentity(
      alias: field('alias'),
      keyId: field('keyId'),
      algorithm: field('algorithm'),
      publicKeyBase64: field('publicKeyBase64'),
      publicKeyFingerprintSha256: field('publicKeyFingerprintSha256'),
      tlsCertificateFingerprintSha256: field('tlsCertificateFingerprintSha256'),
      sealedTlsMaterialId: field('sealedTlsMaterialId'),
    );
  }

  bool matches(ConnectedPlatformIdentity expected) =>
      alias == expected.alias &&
      keyId == expected.keyId &&
      algorithm == expected.algorithm &&
      publicKeyBase64 == expected.publicKeyBase64 &&
      publicKeyFingerprintSha256 == expected.publicKeyFingerprintSha256 &&
      tlsCertificateFingerprintSha256 ==
          expected.tlsCertificateFingerprintSha256 &&
      sealedTlsMaterialId == expected.sealedTlsMaterialId;

  @override
  String toString() =>
      'ConnectedPlatformIdentity(alias: $alias, keyId: $keyId, '
      'algorithm: $algorithm, publicKeyFingerprintSha256: '
      '$publicKeyFingerprintSha256, tlsCertificateFingerprintSha256: '
      '$tlsCertificateFingerprintSha256, sealedTlsMaterialId: '
      '$sealedTlsMaterialId)';
}

/// Ephemeral TLS bytes required by Dart's current `HttpServer` adapter.
///
/// Android Keystore or Windows DPAPI can protect these bytes at rest, but the
/// current Dart TLS server necessarily exposes them to the coordinator process
/// while it is running. A production review must accept that boundary or move
/// TLS termination into a native non-exportable-key implementation.
class ConnectedEphemeralTlsIdentity {
  ConnectedEphemeralTlsIdentity({
    required Uint8List certificatePem,
    required Uint8List privateKeyPem,
    required this.certificateFingerprintSha256,
  }) : certificatePem = Uint8List.fromList(certificatePem),
       privateKeyPem = Uint8List.fromList(privateKeyPem) {
    if (this.certificatePem.isEmpty || this.privateKeyPem.isEmpty) {
      throw const ConnectedPlatformSecurityException(
        'platform_tls_material_invalid',
      );
    }
    _validateDigest(
      certificateFingerprintSha256,
      'tls_certificate_fingerprint_sha256',
    );
  }

  final Uint8List certificatePem;
  final Uint8List privateKeyPem;
  final String certificateFingerprintSha256;
  bool _disposed = false;

  bool get isDisposed => _disposed;

  void dispose() {
    certificatePem.fillRange(0, certificatePem.length, 0);
    privateKeyPem.fillRange(0, privateKeyPem.length, 0);
    _disposed = true;
  }

  @override
  String toString() =>
      'ConnectedEphemeralTlsIdentity(certificateFingerprintSha256: '
      '$certificateFingerprintSha256, disposed: $_disposed)';
}

abstract interface class ConnectedPlatformSecurity {
  Future<ConnectedPlatformIdentity> loadIdentity({required String alias});

  Future<Uint8List> sign({required String alias, required Uint8List payload});

  Future<ConnectedEphemeralTlsIdentity> openTlsIdentity({
    required String alias,
    required String sealedTlsMaterialId,
  });

  Future<void> deleteIdentity({required String alias});
}

class UnavailableConnectedPlatformSecurity
    implements ConnectedPlatformSecurity {
  const UnavailableConnectedPlatformSecurity();

  Never _unavailable() => throw const ConnectedPlatformSecurityException(
    'platform_security_unavailable',
  );

  @override
  Future<void> deleteIdentity({required String alias}) async => _unavailable();

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async => _unavailable();

  @override
  Future<ConnectedEphemeralTlsIdentity> openTlsIdentity({
    required String alias,
    required String sealedTlsMaterialId,
  }) async => _unavailable();

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async => _unavailable();
}

/// Dart side of the versioned native security channel. Native adapters do not
/// exist yet; therefore production composition must keep using the unavailable
/// implementation until installed-device review proves the platform boundary.
class MethodChannelConnectedPlatformSecurity
    implements ConnectedPlatformSecurity {
  MethodChannelConnectedPlatformSecurity({MethodChannel? channel})
    : _channel =
          channel ?? const MethodChannel(connectedPlatformSecurityChannel);

  final MethodChannel _channel;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async {
    _validateToken(alias, 'alias');
    try {
      final value = await _channel.invokeMethod<Object?>('loadIdentity', {
        'schema': 'supermega.connected-platform-request.v1',
        'alias': alias,
      });
      return ConnectedPlatformIdentity.fromJson(value);
    } on ConnectedPlatformSecurityException {
      rethrow;
    } on PlatformException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_operation_failed',
      );
    } on MissingPluginException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_unavailable',
      );
    }
  }

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async {
    _validateToken(alias, 'alias');
    if (payload.isEmpty || payload.length > 1024 * 1024) {
      throw const ConnectedPlatformSecurityException(
        'platform_signing_payload_invalid',
      );
    }
    try {
      final value = await _channel.invokeMethod<Object?>('sign', {
        'schema': 'supermega.connected-platform-sign-request.v1',
        'alias': alias,
        'payload': payload,
      });
      if (value is! Uint8List || value.length != 64) {
        throw const ConnectedPlatformSecurityException(
          'platform_signature_invalid',
        );
      }
      return Uint8List.fromList(value);
    } on ConnectedPlatformSecurityException {
      rethrow;
    } on PlatformException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_operation_failed',
      );
    } on MissingPluginException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_unavailable',
      );
    }
  }

  @override
  Future<ConnectedEphemeralTlsIdentity> openTlsIdentity({
    required String alias,
    required String sealedTlsMaterialId,
  }) async {
    _validateToken(alias, 'alias');
    _validateToken(sealedTlsMaterialId, 'sealed_tls_material_id');
    try {
      final value = await _channel.invokeMethod<Object?>('openTlsIdentity', {
        'schema': 'supermega.connected-platform-tls-request.v1',
        'alias': alias,
        'sealedTlsMaterialId': sealedTlsMaterialId,
      });
      if (value is! Map) {
        throw const ConnectedPlatformSecurityException(
          'platform_tls_material_invalid',
        );
      }
      final map = value.map((key, item) => MapEntry(key.toString(), item));
      const keys = <String>{
        'schema',
        'certificatePem',
        'privateKeyPem',
        'certificateFingerprintSha256',
      };
      if (map.keys.toSet().difference(keys).isNotEmpty ||
          keys.difference(map.keys.toSet()).isNotEmpty ||
          map['schema'] != 'supermega.connected-platform-tls-identity.v1' ||
          map['certificatePem'] is! Uint8List ||
          map['privateKeyPem'] is! Uint8List ||
          map['certificateFingerprintSha256'] is! String) {
        throw const ConnectedPlatformSecurityException(
          'platform_tls_material_invalid',
        );
      }
      return ConnectedEphemeralTlsIdentity(
        certificatePem: map['certificatePem']! as Uint8List,
        privateKeyPem: map['privateKeyPem']! as Uint8List,
        certificateFingerprintSha256:
            map['certificateFingerprintSha256']! as String,
      );
    } on ConnectedPlatformSecurityException {
      rethrow;
    } on PlatformException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_operation_failed',
      );
    } on MissingPluginException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_unavailable',
      );
    }
  }

  @override
  Future<void> deleteIdentity({required String alias}) async {
    _validateToken(alias, 'alias');
    try {
      final result = await _channel.invokeMethod<Object?>('deleteIdentity', {
        'schema': 'supermega.connected-platform-request.v1',
        'alias': alias,
      });
      if (result != true) {
        throw const ConnectedPlatformSecurityException(
          'platform_identity_delete_unconfirmed',
        );
      }
    } on ConnectedPlatformSecurityException {
      rethrow;
    } on PlatformException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_operation_failed',
      );
    } on MissingPluginException {
      throw const ConnectedPlatformSecurityException(
        'platform_security_unavailable',
      );
    }
  }
}

void _validateToken(String value, String field) {
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(value)) {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
}

void _validateDigest(String value, String field) {
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
}

Uint8List _decodeBase64(String value, String field) {
  try {
    final decoded = base64Decode(value);
    if (base64Encode(decoded) != value) {
      throw const FormatException();
    }
    return Uint8List.fromList(decoded);
  } on FormatException {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
}
