import 'dart:convert';

import 'shop_connected_device_profile_v2.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_enrollment_store.dart';

/// Historical owner pins are purpose-scoped to enrollment. They do not grant
/// a feed, lease, or current write. Product pins remain deliberately empty.
final class ShopV42EnrollmentTrustSource {
  const ShopV42EnrollmentTrustSource._(this.ownerIssuerKeys);

  factory ShopV42EnrollmentTrustSource.production() =>
      const ShopV42EnrollmentTrustSource._({});

  factory ShopV42EnrollmentTrustSource.testOnly(Map<String, List<int>> keys) {
    if (const bool.fromEnvironment('dart.vm.product')) {
      throw UnsupportedError('Fixture enrollment pins are unavailable.');
    }
    return ShopV42EnrollmentTrustSource._(
      Map.unmodifiable({
        for (final entry in keys.entries)
          entry.key: List<int>.unmodifiable(entry.value),
      }),
    );
  }

  final Map<String, List<int>> ownerIssuerKeys;
}

/// Complete historical v2 row binding. This never grants current authority:
/// enrollment and command admission must recheck revocation, lease and time.
bool shopConnectedEnrollmentRowsValidV42({
  required Iterable<Map<String, Object?>> pairingNonces,
  required Iterable<Map<String, Object?>> v1Pending,
  required Iterable<Map<String, Object?>> v1Evidence,
  required Iterable<Map<String, Object?>> v2Pending,
  required Iterable<Map<String, Object?>> v2Evidence,
  required Iterable<Map<String, Object?>> deviceProfiles,
  required Iterable<Map<String, Object?>> devices,
  required Map<String, List<int>> pinnedOwnerIssuerKeys,
}) {
  try {
    final pending = v2Pending.toList(growable: false);
    final evidence = v2Evidence.toList(growable: false);
    final profiles = deviceProfiles.toList(growable: false);
    final oldPendingRows = v1Pending.toList(growable: false);
    final allDevices = devices.toList(growable: false);
    // v23 devices can predate v25 pending evidence. Keep those historical
    // records readable; they cannot become v2 without an explicit profile.
    if (pending.isEmpty && evidence.isEmpty && profiles.isEmpty) return true;
    if (pinnedOwnerIssuerKeys.isEmpty) return false;
    final nonceRows = {for (final row in pairingNonces) row['nonce']: row};
    final oldFingerprints = {
      for (final row in oldPendingRows) row['client_fingerprint'],
    };
    final oldNonces = {for (final row in oldPendingRows) row['nonce']};
    final oldEvidenceFingerprints = {
      for (final row in v1Evidence) row['client_fingerprint'],
    };
    final deviceRows = {for (final row in allDevices) row['device_id']: row};
    final byFingerprint = <String, Map<String, Object?>>{};
    final usedNonces = <Object?>{};
    final usedKeyIds = <Object?>{};
    for (final row in pending) {
      final fp = row['client_fingerprint'];
      final key = row['public_key'];
      final nonce = nonceRows[row['nonce']];
      if (fp is! String ||
          key is! List<int> ||
          byFingerprint.containsKey(fp) ||
          oldFingerprints.contains(fp) ||
          oldEvidenceFingerprints.contains(fp) ||
          oldNonces.contains(row['nonce']) ||
          !usedNonces.add(row['nonce']) ||
          !usedKeyIds.add(row['signing_key_id']) ||
          nonce == null ||
          nonce['consumed_at_millis'] != row['observed_at_millis'] ||
          nonce['tenant_id'] != row['tenant_id'] ||
          nonce['site_id'] != row['site_id'] ||
          nonce['coordinator_device_id'] != row['coordinator_device_id']) {
        return false;
      }
      final publicKey = base64Url.encode(key).replaceAll('=', '');
      requireConnectedP256DevicePublicKeyV2(
        publicKeyBase64Url: publicKey,
        fingerprintSha256: fp,
      );
      final claimJson = row['claim_json'];
      final signature = row['possession_signature'];
      if (claimJson is! String || signature is! String) return false;
      final claim = jsonDecode(claimJson);
      if (claim is! Map<String, dynamic> ||
          canonicalConnectedSiteJson(claim) != claimJson ||
          claim.length != 11 ||
          claim['schema'] != 'supermega.shop.pairing-claim.v2' ||
          claim['tenantId'] != row['tenant_id'] ||
          claim['siteId'] != row['site_id'] ||
          claim['coordinatorDeviceId'] != row['coordinator_device_id'] ||
          claim['nonce'] != row['nonce'] ||
          claim['expiresAtMillis'] != nonce['expires_at_millis'] ||
          claim['observedAtMillis'] != row['observed_at_millis'] ||
          claim['signingProfile'] != row['signing_profile'] ||
          claim['signingKeyId'] != row['signing_key_id'] ||
          claim['publicKeyBase64Url'] != publicKey ||
          claim['clientFingerprint'] != fp ||
          !verifyConnectedP256DeviceSignatureV2(
            publicKeyBase64Url: publicKey,
            fingerprintSha256: fp,
            signatureBase64Url: signature,
            canonicalMessageBytes: utf8.encode(claimJson),
          )) {
        return false;
      }
      byFingerprint[fp] = row;
    }
    final approvals = <String, Map<String, Object?>>{};
    final revocations = <String, Map<String, Object?>>{};
    for (final row in evidence) {
      final fp = row['client_fingerprint'];
      final paired = byFingerprint[fp];
      final key = row['public_key'];
      final raw = row['evidence_json'];
      if (fp is! String ||
          paired == null ||
          key is! List<int> ||
          raw is! String ||
          paired['tenant_id'] != row['tenant_id'] ||
          paired['site_id'] != row['site_id'] ||
          paired['coordinator_device_id'] != row['coordinator_device_id'] ||
          paired['signing_profile'] != row['signing_profile'] ||
          paired['signing_key_id'] != row['signing_key_id'] ||
          !_equalBytes(paired['public_key'] as List<int>, key) ||
          row['observed_at_millis'] is! int ||
          (row['observed_at_millis'] as int) <
              (paired['observed_at_millis'] as int)) {
        return false;
      }
      final action = switch (row['action']) {
        'approve' => ShopOwnerEnrollmentAction.approve,
        'revoke' => ShopOwnerEnrollmentAction.revoke,
        _ => null,
      };
      if (action == null) return false;
      final target = action == ShopOwnerEnrollmentAction.approve
          ? approvals
          : revocations;
      if (target.containsKey(fp)) return false;
      final verified = verifyRetainedOwnerEnrollmentV2Sync(
        expectedAction: action,
        canonicalEvidenceJson: raw,
        expectedEvidenceDigest: row['evidence_digest'] as String,
        tenantId: row['tenant_id'] as String,
        siteId: row['site_id'] as String,
        coordinatorDeviceId: row['coordinator_device_id'] as String,
        deviceId: row['device_id'] as String,
        signingKeyId: row['signing_key_id'] as String,
        publicKeyBase64Url: base64Url.encode(key).replaceAll('=', ''),
        clientFingerprint: fp,
        sessionGeneration: row['session_generation'] as int,
        trustedAtMillis: row['observed_at_millis'] as int,
        pinnedOwnerIssuerKeys: pinnedOwnerIssuerKeys,
      );
      if (verified.authorityKeyId != row['authority_key_id']) return false;
      target[fp] = row;
    }
    final seenDevices = <Object?>{};
    for (final profile in profiles) {
      final fp = profile['client_fingerprint'];
      final paired = byFingerprint[fp];
      final approval = approvals[fp];
      final revoke = revocations[fp];
      final device = deviceRows[profile['device_id']];
      if (fp is! String ||
          paired == null ||
          approval == null ||
          device == null ||
          !seenDevices.add(profile['device_id']) ||
          profile['approval_digest'] != approval['evidence_digest'] ||
          profile['device_id'] != approval['device_id'] ||
          profile['tenant_id'] != paired['tenant_id'] ||
          profile['site_id'] != paired['site_id'] ||
          profile['signing_profile'] != paired['signing_profile'] ||
          profile['signing_key_id'] != paired['signing_key_id'] ||
          !_equalBytes(
            profile['public_key'] as List<int>,
            paired['public_key'] as List<int>,
          ) ||
          device['tenant_id'] != paired['tenant_id'] ||
          device['site_id'] != paired['site_id'] ||
          device['public_key_fingerprint'] != fp ||
          device['enrolled_at_millis'] != approval['observed_at_millis']) {
        return false;
      }
      if (revoke == null) {
        if (device['state'] != 'active' ||
            device['revoked_at_millis'] != null ||
            device['session_generation'] != approval['session_generation']) {
          return false;
        }
      } else if (revoke['device_id'] != approval['device_id'] ||
          (revoke['session_generation'] as int) <=
              (approval['session_generation'] as int) ||
          (revoke['observed_at_millis'] as int) <
              (approval['observed_at_millis'] as int) ||
          device['state'] != 'revoked' ||
          device['revoked_at_millis'] != revoke['observed_at_millis'] ||
          device['session_generation'] != revoke['session_generation']) {
        return false;
      }
    }
    return approvals.length == profiles.length &&
        revocations.keys.every(approvals.containsKey) &&
        profiles.length <= pending.length;
  } on Object {
    return false;
  }
}

bool _equalBytes(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) {
    difference |= left[i] ^ right[i];
  }
  return difference == 0;
}
