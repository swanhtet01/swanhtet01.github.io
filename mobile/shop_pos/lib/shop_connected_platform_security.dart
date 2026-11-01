import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

const connectedPlatformSecurityChannel =
    'dev.supermega.supermega_shop/connected_security_v1';

const _prepareRequestSchema = 'supermega.connected-platform-prepare-request.v1';
const _enrollmentRequestSchema =
    'supermega.connected-platform-enrollment-request.v1';
const _completeRequestSchema =
    'supermega.connected-platform-complete-request.v1';
const _enrollmentBundleSchema =
    'supermega.connected-platform-enrollment-bundle.v1';
const _abortRequestSchema = 'supermega.connected-platform-abort-request.v1';
const _maxCertificateChainBytes = 64 * 1024;

class ConnectedPlatformSecurityException implements Exception {
  const ConnectedPlatformSecurityException(this.code);

  final String code;

  @override
  String toString() => 'ConnectedPlatformSecurityException($code)';
}

/// Public, canonical request produced after native key generation.
///
/// The signing private key never leaves platform custody. The TLS private key
/// is generated locally and sealed before this request is returned; only its
/// SPKI is included for certificate issuance.
class ConnectedPlatformEnrollmentRequest {
  ConnectedPlatformEnrollmentRequest({
    required this.alias,
    required this.workspaceId,
    required this.siteId,
    required this.deviceId,
    required this.sessionGeneration,
    required this.signingKeyId,
    required this.signingAlgorithm,
    required this.signingPublicKeyBase64,
    required this.signingPublicKeyFingerprintSha256,
    required this.tlsKeyId,
    required this.tlsAlgorithm,
    required this.tlsPublicKeySpkiBase64,
    required this.tlsPublicKeyFingerprintSha256,
    required this.sealedTlsMaterialId,
    required this.nonceBase64Url,
    required this.createdAt,
    required this.requestDigest,
  }) {
    _validateToken(alias, 'alias');
    _validateToken(workspaceId, 'workspace_id');
    _validateToken(siteId, 'site_id');
    _validateToken(deviceId, 'device_id');
    _validateToken(signingKeyId, 'signing_key_id');
    _validateToken(tlsKeyId, 'tls_key_id');
    _validateToken(sealedTlsMaterialId, 'sealed_tls_material_id');
    if (sessionGeneration < 1) {
      throw const ConnectedPlatformSecurityException(
        'platform_session_generation_invalid',
      );
    }
    if (signingAlgorithm != 'ed25519' || tlsAlgorithm != 'ecdsa-p256') {
      throw const ConnectedPlatformSecurityException(
        'platform_key_algorithm_unsupported',
      );
    }
    final signingKey = _decodeBase64(signingPublicKeyBase64, 'public_key');
    if (signingKey.length != 32) {
      throw const ConnectedPlatformSecurityException(
        'platform_public_key_invalid',
      );
    }
    final tlsSpki = _decodeBase64(
      tlsPublicKeySpkiBase64,
      'tls_public_key_spki',
    );
    if (tlsSpki.length < 64 || tlsSpki.length > 512) {
      throw const ConnectedPlatformSecurityException(
        'platform_tls_public_key_invalid',
      );
    }
    _validateDigest(
      signingPublicKeyFingerprintSha256,
      'public_key_fingerprint_sha256',
    );
    _validateDigest(
      tlsPublicKeyFingerprintSha256,
      'tls_public_key_fingerprint_sha256',
    );
    _validateDigest(requestDigest, 'request_digest');
    if (crypto.sha256.convert(signingKey).toString() !=
            signingPublicKeyFingerprintSha256 ||
        crypto.sha256.convert(tlsSpki).toString() !=
            tlsPublicKeyFingerprintSha256) {
      throw const ConnectedPlatformSecurityException(
        'platform_public_key_fingerprint_mismatch',
      );
    }
    _decodeBase64UrlNoPadding(nonceBase64Url, 'enrollment_nonce', 32);
    _validateUtcTimestamp(createdAt, 'created_at');
    if (connectedSiteSha256(signingPayload) != requestDigest) {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_request_digest_mismatch',
      );
    }
  }

  final String alias;
  final String workspaceId;
  final String siteId;
  final String deviceId;
  final int sessionGeneration;
  final String signingKeyId;
  final String signingAlgorithm;
  final String signingPublicKeyBase64;
  final String signingPublicKeyFingerprintSha256;
  final String tlsKeyId;
  final String tlsAlgorithm;
  final String tlsPublicKeySpkiBase64;
  final String tlsPublicKeyFingerprintSha256;
  final String sealedTlsMaterialId;
  final String nonceBase64Url;
  final String createdAt;
  final String requestDigest;

  Map<String, Object> get signingPayload => <String, Object>{
    'schema': _enrollmentRequestSchema,
    'alias': alias,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'deviceId': deviceId,
    'sessionGeneration': sessionGeneration,
    'signingKeyId': signingKeyId,
    'signingAlgorithm': signingAlgorithm,
    'signingPublicKeyBase64': signingPublicKeyBase64,
    'signingPublicKeyFingerprintSha256': signingPublicKeyFingerprintSha256,
    'tlsKeyId': tlsKeyId,
    'tlsAlgorithm': tlsAlgorithm,
    'tlsPublicKeySpkiBase64': tlsPublicKeySpkiBase64,
    'tlsPublicKeyFingerprintSha256': tlsPublicKeyFingerprintSha256,
    'sealedTlsMaterialId': sealedTlsMaterialId,
    'nonceBase64Url': nonceBase64Url,
    'createdAt': createdAt,
  };

  factory ConnectedPlatformEnrollmentRequest.fromJson(Object? value) {
    final map = _exactStringMap(value, <String>{
      ..._enrollmentRequestKeys,
      'requestDigest',
    }, 'platform_enrollment_request_invalid');
    if (map['schema'] != _enrollmentRequestSchema) {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_request_invalid',
      );
    }
    String text(String key) =>
        _requiredString(map, key, 'platform_enrollment_request_invalid');
    final generation = map['sessionGeneration'];
    if (generation is! int) {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_request_invalid',
      );
    }
    return ConnectedPlatformEnrollmentRequest(
      alias: text('alias'),
      workspaceId: text('workspaceId'),
      siteId: text('siteId'),
      deviceId: text('deviceId'),
      sessionGeneration: generation,
      signingKeyId: text('signingKeyId'),
      signingAlgorithm: text('signingAlgorithm'),
      signingPublicKeyBase64: text('signingPublicKeyBase64'),
      signingPublicKeyFingerprintSha256: text(
        'signingPublicKeyFingerprintSha256',
      ),
      tlsKeyId: text('tlsKeyId'),
      tlsAlgorithm: text('tlsAlgorithm'),
      tlsPublicKeySpkiBase64: text('tlsPublicKeySpkiBase64'),
      tlsPublicKeyFingerprintSha256: text('tlsPublicKeyFingerprintSha256'),
      sealedTlsMaterialId: text('sealedTlsMaterialId'),
      nonceBase64Url: text('nonceBase64Url'),
      createdAt: text('createdAt'),
      requestDigest: text('requestDigest'),
    );
  }
}

const _enrollmentRequestKeys = <String>{
  'schema',
  'alias',
  'workspaceId',
  'siteId',
  'deviceId',
  'sessionGeneration',
  'signingKeyId',
  'signingAlgorithm',
  'signingPublicKeyBase64',
  'signingPublicKeyFingerprintSha256',
  'tlsKeyId',
  'tlsAlgorithm',
  'tlsPublicKeySpkiBase64',
  'tlsPublicKeyFingerprintSha256',
  'sealedTlsMaterialId',
  'nonceBase64Url',
  'createdAt',
};

/// Consumed issuer response. [dispose] wipes the mutable certificate bytes.
/// Calling [completeIdentityEnrollment] always disposes this object, including
/// validation, channel, and response failures.
class ConnectedPlatformEnrollmentBundle {
  ConnectedPlatformEnrollmentBundle({
    required this.requestDigest,
    required this.alias,
    required this.workspaceId,
    required this.siteId,
    required this.deviceId,
    required this.sessionGeneration,
    required this.signingKeyId,
    required this.signingPublicKeyFingerprintSha256,
    required this.tlsKeyId,
    required this.tlsPublicKeyFingerprintSha256,
    required this.sealedTlsMaterialId,
    required this.nonceBase64Url,
    required this.issuerKeyId,
    required this.certificateChainPem,
    required this.certificateChainSha256,
    required this.tlsCertificateFingerprintSha256,
    required this.issuedAt,
    required this.expiresAt,
    required this.signatureAlgorithm,
    required this.issuerSignatureBase64Url,
  }) {
    try {
      validate();
    } catch (_) {
      dispose();
      rethrow;
    }
  }

  final String requestDigest;
  final String alias;
  final String workspaceId;
  final String siteId;
  final String deviceId;
  final int sessionGeneration;
  final String signingKeyId;
  final String signingPublicKeyFingerprintSha256;
  final String tlsKeyId;
  final String tlsPublicKeyFingerprintSha256;
  final String sealedTlsMaterialId;
  final String nonceBase64Url;
  final String issuerKeyId;
  final Uint8List certificateChainPem;
  final String certificateChainSha256;
  final String tlsCertificateFingerprintSha256;
  final String issuedAt;
  final String expiresAt;
  final String signatureAlgorithm;
  final String issuerSignatureBase64Url;
  bool _disposed = false;

  bool get isDisposed => _disposed;

  factory ConnectedPlatformEnrollmentBundle.fromJson(Object? value) {
    Uint8List? certificateBytes =
        value is Map && value['certificateChainPem'] is Uint8List
        ? value['certificateChainPem']! as Uint8List
        : null;
    try {
      final map = _exactStringMap(value, const <String>{
        'schema',
        'requestDigest',
        'alias',
        'workspaceId',
        'siteId',
        'deviceId',
        'sessionGeneration',
        'signingKeyId',
        'signingPublicKeyFingerprintSha256',
        'tlsKeyId',
        'tlsPublicKeyFingerprintSha256',
        'sealedTlsMaterialId',
        'nonceBase64Url',
        'issuerKeyId',
        'certificateChainPem',
        'certificateChainSha256',
        'tlsCertificateFingerprintSha256',
        'issuedAt',
        'expiresAt',
        'signatureAlgorithm',
        'issuerSignatureBase64Url',
      }, 'platform_enrollment_bundle_invalid');
      if (map['schema'] != _enrollmentBundleSchema ||
          map['certificateChainPem'] is! Uint8List ||
          map['sessionGeneration'] is! int) {
        throw const ConnectedPlatformSecurityException(
          'platform_enrollment_bundle_invalid',
        );
      }
      certificateBytes = map['certificateChainPem']! as Uint8List;
      String text(String key) =>
          _requiredString(map, key, 'platform_enrollment_bundle_invalid');
      return ConnectedPlatformEnrollmentBundle(
        requestDigest: text('requestDigest'),
        alias: text('alias'),
        workspaceId: text('workspaceId'),
        siteId: text('siteId'),
        deviceId: text('deviceId'),
        sessionGeneration: map['sessionGeneration']! as int,
        signingKeyId: text('signingKeyId'),
        signingPublicKeyFingerprintSha256: text(
          'signingPublicKeyFingerprintSha256',
        ),
        tlsKeyId: text('tlsKeyId'),
        tlsPublicKeyFingerprintSha256: text('tlsPublicKeyFingerprintSha256'),
        sealedTlsMaterialId: text('sealedTlsMaterialId'),
        nonceBase64Url: text('nonceBase64Url'),
        issuerKeyId: text('issuerKeyId'),
        certificateChainPem: certificateBytes,
        certificateChainSha256: text('certificateChainSha256'),
        tlsCertificateFingerprintSha256: text(
          'tlsCertificateFingerprintSha256',
        ),
        issuedAt: text('issuedAt'),
        expiresAt: text('expiresAt'),
        signatureAlgorithm: text('signatureAlgorithm'),
        issuerSignatureBase64Url: text('issuerSignatureBase64Url'),
      );
    } catch (_) {
      certificateBytes?.fillRange(0, certificateBytes.length, 0);
      rethrow;
    }
  }

  Map<String, Object> get signingPayload => <String, Object>{
    'schema': _enrollmentBundleSchema,
    'requestDigest': requestDigest,
    'alias': alias,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'deviceId': deviceId,
    'sessionGeneration': sessionGeneration,
    'signingKeyId': signingKeyId,
    'signingPublicKeyFingerprintSha256': signingPublicKeyFingerprintSha256,
    'tlsKeyId': tlsKeyId,
    'tlsPublicKeyFingerprintSha256': tlsPublicKeyFingerprintSha256,
    'sealedTlsMaterialId': sealedTlsMaterialId,
    'nonceBase64Url': nonceBase64Url,
    'issuerKeyId': issuerKeyId,
    'certificateChainSha256': certificateChainSha256,
    'tlsCertificateFingerprintSha256': tlsCertificateFingerprintSha256,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
    'signatureAlgorithm': signatureAlgorithm,
  };

  Map<String, Object> toChannelArguments() {
    validate();
    return <String, Object>{
      ...signingPayload,
      'schema': _completeRequestSchema,
      'enrollmentSchema': _enrollmentBundleSchema,
      'certificateChainPem': certificateChainPem,
      'issuerSignatureBase64Url': issuerSignatureBase64Url,
    };
  }

  void validate() {
    if (_disposed) {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_bundle_disposed',
      );
    }
    _validateDigest(requestDigest, 'request_digest');
    _validateToken(alias, 'alias');
    _validateToken(workspaceId, 'workspace_id');
    _validateToken(siteId, 'site_id');
    _validateToken(deviceId, 'device_id');
    _validateToken(signingKeyId, 'signing_key_id');
    _validateToken(tlsKeyId, 'tls_key_id');
    _validateToken(sealedTlsMaterialId, 'sealed_tls_material_id');
    _validateToken(issuerKeyId, 'issuer_key_id');
    if (sessionGeneration < 1 || signatureAlgorithm != 'ed25519') {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_bundle_invalid',
      );
    }
    _validateDigest(
      signingPublicKeyFingerprintSha256,
      'public_key_fingerprint_sha256',
    );
    _validateDigest(
      tlsPublicKeyFingerprintSha256,
      'tls_public_key_fingerprint_sha256',
    );
    _validateDigest(certificateChainSha256, 'certificate_chain_sha256');
    _validateDigest(
      tlsCertificateFingerprintSha256,
      'tls_certificate_fingerprint_sha256',
    );
    _decodeBase64UrlNoPadding(nonceBase64Url, 'enrollment_nonce', 32);
    _decodeBase64UrlNoPadding(issuerSignatureBase64Url, 'issuer_signature', 64);
    final issued = _validateUtcTimestamp(issuedAt, 'issued_at');
    final expires = _validateUtcTimestamp(expiresAt, 'expires_at');
    if (!expires.isAfter(issued) ||
        expires.difference(issued) > const Duration(days: 400)) {
      throw const ConnectedPlatformSecurityException(
        'platform_enrollment_validity_invalid',
      );
    }
    if (certificateChainPem.isEmpty ||
        certificateChainPem.length > _maxCertificateChainBytes ||
        crypto.sha256.convert(certificateChainPem).toString() !=
            certificateChainSha256) {
      throw const ConnectedPlatformSecurityException(
        'platform_certificate_chain_invalid',
      );
    }
    String certificateText;
    try {
      certificateText = ascii.decode(certificateChainPem);
    } on FormatException {
      throw const ConnectedPlatformSecurityException(
        'platform_certificate_chain_invalid',
      );
    }
    if (!certificateText.contains('-----BEGIN CERTIFICATE-----') ||
        !certificateText.contains('-----END CERTIFICATE-----') ||
        certificateText.contains('PRIVATE KEY')) {
      throw const ConnectedPlatformSecurityException(
        'platform_certificate_chain_invalid',
      );
    }
  }

  void dispose() {
    certificateChainPem.fillRange(0, certificateChainPem.length, 0);
    _disposed = true;
  }
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
    required this.certificatePem,
    required this.privateKeyPem,
    required this.certificateFingerprintSha256,
  }) {
    try {
      if (certificatePem.isEmpty || privateKeyPem.isEmpty) {
        throw const ConnectedPlatformSecurityException(
          'platform_tls_material_invalid',
        );
      }
      _validateDigest(
        certificateFingerprintSha256,
        'tls_certificate_fingerprint_sha256',
      );
    } catch (_) {
      dispose();
      rethrow;
    }
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
  Future<ConnectedPlatformEnrollmentRequest> prepareIdentity({
    required String alias,
    required String workspaceId,
    required String siteId,
    required String deviceId,
    required int sessionGeneration,
  });

  Future<ConnectedPlatformIdentity> completeIdentityEnrollment({
    required ConnectedPlatformEnrollmentBundle bundle,
  });

  Future<void> abortIdentity({
    required String alias,
    required String requestDigest,
  });

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
  Future<void> abortIdentity({
    required String alias,
    required String requestDigest,
  }) async => _unavailable();

  @override
  Future<ConnectedPlatformIdentity> completeIdentityEnrollment({
    required ConnectedPlatformEnrollmentBundle bundle,
  }) async {
    bundle.dispose();
    return _unavailable();
  }

  @override
  Future<void> deleteIdentity({required String alias}) async => _unavailable();

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async => _unavailable();

  @override
  Future<ConnectedPlatformEnrollmentRequest> prepareIdentity({
    required String alias,
    required String workspaceId,
    required String siteId,
    required String deviceId,
    required int sessionGeneration,
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
  Future<ConnectedPlatformEnrollmentRequest> prepareIdentity({
    required String alias,
    required String workspaceId,
    required String siteId,
    required String deviceId,
    required int sessionGeneration,
  }) async {
    _validateToken(alias, 'alias');
    _validateToken(workspaceId, 'workspace_id');
    _validateToken(siteId, 'site_id');
    _validateToken(deviceId, 'device_id');
    if (sessionGeneration < 1) {
      throw const ConnectedPlatformSecurityException(
        'platform_session_generation_invalid',
      );
    }
    try {
      final value = await _channel.invokeMethod<Object?>('prepareIdentity', {
        'schema': _prepareRequestSchema,
        'alias': alias,
        'workspaceId': workspaceId,
        'siteId': siteId,
        'deviceId': deviceId,
        'sessionGeneration': sessionGeneration,
      });
      final request = ConnectedPlatformEnrollmentRequest.fromJson(value);
      if (request.alias != alias ||
          request.workspaceId != workspaceId ||
          request.siteId != siteId ||
          request.deviceId != deviceId ||
          request.sessionGeneration != sessionGeneration) {
        throw const ConnectedPlatformSecurityException(
          'platform_enrollment_request_binding_mismatch',
        );
      }
      return request;
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
  Future<ConnectedPlatformIdentity> completeIdentityEnrollment({
    required ConnectedPlatformEnrollmentBundle bundle,
  }) async {
    try {
      bundle.validate();
      final value = await _channel.invokeMethod<Object?>(
        'completeIdentityEnrollment',
        bundle.toChannelArguments(),
      );
      final identity = ConnectedPlatformIdentity.fromJson(value);
      if (identity.alias != bundle.alias ||
          identity.keyId != bundle.signingKeyId ||
          identity.publicKeyFingerprintSha256 !=
              bundle.signingPublicKeyFingerprintSha256 ||
          identity.tlsCertificateFingerprintSha256 !=
              bundle.tlsCertificateFingerprintSha256 ||
          identity.sealedTlsMaterialId != bundle.sealedTlsMaterialId) {
        throw const ConnectedPlatformSecurityException(
          'platform_identity_enrollment_mismatch',
        );
      }
      return identity;
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
    } finally {
      bundle.dispose();
    }
  }

  @override
  Future<void> abortIdentity({
    required String alias,
    required String requestDigest,
  }) async {
    _validateToken(alias, 'alias');
    _validateDigest(requestDigest, 'request_digest');
    try {
      final result = await _channel.invokeMethod<Object?>('abortIdentity', {
        'schema': _abortRequestSchema,
        'alias': alias,
        'requestDigest': requestDigest,
      });
      if (result != true) {
        throw const ConnectedPlatformSecurityException(
          'platform_identity_abort_unconfirmed',
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
      return parseConnectedPlatformTlsIdentity(value);
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

ConnectedEphemeralTlsIdentity parseConnectedPlatformTlsIdentity(Object? value) {
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
  final certificatePem = map['certificatePem'];
  final privateKeyPem = map['privateKeyPem'];
  if (map.keys.toSet().difference(keys).isNotEmpty ||
      keys.difference(map.keys.toSet()).isNotEmpty ||
      map['schema'] != 'supermega.connected-platform-tls-identity.v1' ||
      certificatePem is! Uint8List ||
      privateKeyPem is! Uint8List ||
      map['certificateFingerprintSha256'] is! String) {
    _zeroIfBytes(certificatePem);
    _zeroIfBytes(privateKeyPem);
    throw const ConnectedPlatformSecurityException(
      'platform_tls_material_invalid',
    );
  }
  return ConnectedEphemeralTlsIdentity(
    certificatePem: certificatePem,
    privateKeyPem: privateKeyPem,
    certificateFingerprintSha256:
        map['certificateFingerprintSha256']! as String,
  );
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

Map<String, Object?> _exactStringMap(
  Object? value,
  Set<String> keys,
  String error,
) {
  if (value is! Map || value.keys.any((key) => key is! String)) {
    throw ConnectedPlatformSecurityException(error);
  }
  final map = value.map((key, item) => MapEntry(key as String, item));
  if (map.keys.toSet().difference(keys).isNotEmpty ||
      keys.difference(map.keys.toSet()).isNotEmpty) {
    throw ConnectedPlatformSecurityException(error);
  }
  return map;
}

String _requiredString(Map<String, Object?> map, String key, String error) {
  final value = map[key];
  if (value is! String) throw ConnectedPlatformSecurityException(error);
  return value;
}

DateTime _validateUtcTimestamp(String value, String field) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?Z$')
      .hasMatch(value)) {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null || !parsed.isUtc) {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
  return parsed;
}

Uint8List _decodeBase64UrlNoPadding(
  String value,
  String field,
  int expectedLength,
) {
  try {
    if (value.isEmpty ||
        value.contains('=') ||
        !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value)) {
      throw const FormatException();
    }
    final decoded = base64Url.decode(base64Url.normalize(value));
    if (decoded.length != expectedLength ||
        base64UrlEncode(decoded).replaceAll('=', '') != value) {
      throw const FormatException();
    }
    return Uint8List.fromList(decoded);
  } on FormatException {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
}

Uint8List _decodeBase64(String value, String field) {
  try {
    if (value.isEmpty || value.length > 4096) throw const FormatException();
    final decoded = base64Decode(value);
    if (base64Encode(decoded) != value) {
      throw const FormatException();
    }
    return Uint8List.fromList(decoded);
  } on FormatException {
    throw ConnectedPlatformSecurityException('platform_${field}_invalid');
  }
}

void _zeroIfBytes(Object? value) {
  if (value is Uint8List) value.fillRange(0, value.length, 0);
}
