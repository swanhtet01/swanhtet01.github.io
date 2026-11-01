import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_staff_authorization.dart';

const shopOfflineStaffLeaseContract = 'supermega.shop.offline-staff-lease.v1';
const shopOfflineStaffLeaseMaximumValidity = Duration(days: 7);
const shopOfflineStaffLeaseDefaultClockSkew = Duration(minutes: 5);

final _keyIdPattern = RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$');
final _digestPattern = RegExp(r'^[0-9a-f]{64}$');
final _signaturePattern = RegExp(r'^[A-Za-z0-9_-]{86}$');

/// Context known independently by the enrolled device.
///
/// Callers must source this from the immutable local workspace/device binding,
/// not from the lease being checked.
class ShopOfflineStaffLeaseExpectedBinding {
  const ShopOfflineStaffLeaseExpectedBinding({
    required this.tenantId,
    required this.siteId,
    required this.deviceId,
    required this.sessionGeneration,
    required this.revocationGeneration,
    required this.requiredCapability,
  });

  final String tenantId;
  final String siteId;
  final String deviceId;
  final int sessionGeneration;
  final int revocationGeneration;
  final ShopStaffCapability requiredCapability;
}

class VerifiedShopOfflineStaffLease {
  const VerifiedShopOfflineStaffLease({
    required this.leaseId,
    required this.tenantId,
    required this.siteId,
    required this.actorId,
    required this.role,
    required this.capabilities,
    required this.deviceId,
    required this.sessionGeneration,
    required this.revocationGeneration,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
    required this.keyId,
    required this.payloadDigest,
  });

  final String leaseId;
  final String tenantId;
  final String siteId;
  final String actorId;
  final ShopStaffRole role;
  final Set<ShopStaffCapability> capabilities;
  final String deviceId;
  final int sessionGeneration;
  final int revocationGeneration;
  final int issuedAtMillis;
  final int expiresAtMillis;
  final String keyId;
  final String payloadDigest;
}

abstract interface class ShopOfflineStaffLeaseSignatureVerifier {
  Future<bool> verify({
    required String keyId,
    required List<int> message,
    required String signature,
  });
}

/// Default production posture until a reviewed issuer and source-pinned key
/// ring are wired by the managed identity adapter.
class ShopOfflineStaffLeaseSignatureUnavailable
    implements ShopOfflineStaffLeaseSignatureVerifier {
  const ShopOfflineStaffLeaseSignatureUnavailable();

  @override
  Future<bool> verify({
    required String keyId,
    required List<int> message,
    required String signature,
  }) async => false;
}

/// Ed25519 verifier for a caller-supplied, source-reviewed public key ring.
///
/// The app intentionally supplies no production keys here. Unknown keys and
/// malformed encodings fail closed.
class PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier
    implements ShopOfflineStaffLeaseSignatureVerifier {
  PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier({
    required Map<String, List<int>> publicKeys,
  }) : _publicKeys = Map.unmodifiable(
         publicKeys.map(
           (key, value) => MapEntry(key, List<int>.unmodifiable(value)),
         ),
       );

  final Map<String, List<int>> _publicKeys;
  final Ed25519 _algorithm = Ed25519();

  @override
  Future<bool> verify({
    required String keyId,
    required List<int> message,
    required String signature,
  }) async {
    final publicKey = _publicKeys[keyId];
    if (publicKey == null ||
        publicKey.length != 32 ||
        !_keyIdPattern.hasMatch(keyId) ||
        !_signaturePattern.hasMatch(signature)) {
      return false;
    }
    try {
      final signatureBytes = _decodeBase64Url(signature, expectedLength: 64);
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

class ShopOfflineStaffLeaseVerifier {
  const ShopOfflineStaffLeaseVerifier({
    this.signatureVerifier = const ShopOfflineStaffLeaseSignatureUnavailable(),
    this.maximumClockSkew = shopOfflineStaffLeaseDefaultClockSkew,
  });

  final ShopOfflineStaffLeaseSignatureVerifier signatureVerifier;
  final Duration maximumClockSkew;

  Future<VerifiedShopOfflineStaffLease> verify({
    required OfflineStaffLeaseV1 lease,
    required ShopOfflineStaffLeaseExpectedBinding expected,
    required int nowMillis,
  }) async {
    _validateShape(lease);
    if (maximumClockSkew.isNegative) {
      _deny('shop_offline_staff_lease_clock_policy_invalid');
    }

    final role = _parseRole(lease.role);
    final capabilities = _parseCapabilities(lease.capabilities);
    if (capabilities.any(
      (capability) => !ShopStaffRolePolicy.allows(role, capability),
    )) {
      _deny('shop_offline_staff_lease_role_capability_mismatch');
    }
    if (!capabilities.contains(expected.requiredCapability)) {
      _deny('shop_offline_staff_lease_capability_denied');
    }
    if (lease.tenantId != expected.tenantId ||
        lease.siteId != expected.siteId ||
        lease.deviceId != expected.deviceId) {
      _deny('shop_offline_staff_lease_binding_mismatch');
    }
    if (lease.sessionGeneration != expected.sessionGeneration) {
      _deny('shop_offline_staff_lease_session_generation_mismatch');
    }
    if (lease.revocationGeneration != expected.revocationGeneration) {
      _deny('shop_offline_staff_lease_revocation_generation_mismatch');
    }

    final validityMillis = lease.expiresAtMillis - lease.issuedAtMillis;
    if (validityMillis <= 0 ||
        validityMillis > shopOfflineStaffLeaseMaximumValidity.inMilliseconds) {
      _deny('shop_offline_staff_lease_validity_invalid');
    }
    if (lease.issuedAtMillis > nowMillis + maximumClockSkew.inMilliseconds) {
      _deny('shop_offline_staff_lease_not_yet_valid');
    }
    if (nowMillis >= lease.expiresAtMillis) {
      _deny('shop_offline_staff_lease_expired');
    }

    final expectedDigest = shopOfflineStaffLeasePayloadDigest(lease);
    if (!_constantTimeTextEquals(lease.payloadDigest, expectedDigest)) {
      _deny('shop_offline_staff_lease_digest_mismatch');
    }
    final signatureValid = await signatureVerifier.verify(
      keyId: lease.keyId,
      message: utf8.encode(canonicalConnectedSiteJson(lease.unsignedPayload)),
      signature: lease.signature,
    );
    if (!signatureValid) {
      _deny('shop_offline_staff_lease_signature_invalid');
    }

    return VerifiedShopOfflineStaffLease(
      leaseId: lease.leaseId,
      tenantId: lease.tenantId,
      siteId: lease.siteId,
      actorId: lease.actorId,
      role: role,
      capabilities: Set.unmodifiable(capabilities),
      deviceId: lease.deviceId,
      sessionGeneration: lease.sessionGeneration,
      revocationGeneration: lease.revocationGeneration,
      issuedAtMillis: lease.issuedAtMillis,
      expiresAtMillis: lease.expiresAtMillis,
      keyId: lease.keyId,
      payloadDigest: lease.payloadDigest,
    );
  }
}

String shopOfflineStaffLeasePayloadDigest(OfflineStaffLeaseV1 lease) =>
    connectedSiteSha256(lease.unsignedPayload);

void _validateShape(OfflineStaffLeaseV1 lease) {
  if (!_keyIdPattern.hasMatch(lease.keyId) ||
      !_digestPattern.hasMatch(lease.payloadDigest) ||
      !_signaturePattern.hasMatch(lease.signature) ||
      lease.sessionGeneration < 0 ||
      lease.revocationGeneration < 0 ||
      lease.issuedAtMillis < 0 ||
      lease.expiresAtMillis < 0 ||
      lease.capabilities.isEmpty) {
    _deny('shop_offline_staff_lease_shape_invalid');
  }
  final sorted = [...lease.capabilities]..sort();
  if (sorted.toSet().length != sorted.length ||
      !_sameStrings(lease.capabilities, sorted)) {
    _deny('shop_offline_staff_lease_capabilities_noncanonical');
  }
}

ShopStaffRole _parseRole(String value) {
  for (final role in ShopStaffRole.values) {
    if (role.name == value) return role;
  }
  _deny('shop_offline_staff_lease_role_invalid');
}

Set<ShopStaffCapability> _parseCapabilities(List<String> values) {
  final parsed = <ShopStaffCapability>{};
  for (final value in values) {
    ShopStaffCapability? matched;
    for (final capability in ShopStaffCapability.values) {
      if (capability.name == value) {
        matched = capability;
        break;
      }
    }
    if (matched == null) {
      _deny('shop_offline_staff_lease_capability_invalid');
    }
    parsed.add(matched);
  }
  return parsed;
}

bool _sameStrings(List<String> left, List<String> right) {
  if (left.length != right.length) return false;
  for (var index = 0; index < left.length; index++) {
    if (left[index] != right[index]) return false;
  }
  return true;
}

bool _constantTimeTextEquals(String actual, String expected) {
  if (actual.length != expected.length) return false;
  var difference = 0;
  for (var index = 0; index < expected.length; index++) {
    difference |= expected.codeUnitAt(index) ^ actual.codeUnitAt(index);
  }
  return difference == 0;
}

List<int> _decodeBase64Url(String value, {required int expectedLength}) {
  if (!_signaturePattern.hasMatch(value)) {
    throw const FormatException('Non-canonical base64url.');
  }
  final bytes = base64Url.decode('$value==');
  if (bytes.length != expectedLength ||
      base64Url.encode(bytes).replaceAll('=', '') != value) {
    throw const FormatException('Non-canonical base64url.');
  }
  return bytes;
}

Never _deny(String code) => throw ShopOfflineStaffLeaseException(code);

class ShopOfflineStaffLeaseException implements Exception {
  const ShopOfflineStaffLeaseException(this.code);

  final String code;

  @override
  String toString() => code;
}
