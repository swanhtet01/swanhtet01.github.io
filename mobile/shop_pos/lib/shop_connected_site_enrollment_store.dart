import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_device_profile_v2.dart';
import 'shop_connected_retained_signature_verifier.dart';
import 'shop_database.dart';
import 'shop_site_coordinator.dart';

enum ShopOwnerEnrollmentAction { approve, revoke }

/// Retained owner-authority evidence. This value is not self-authenticating;
/// callers must inject a verifier backed by the real cloud/owner issuer.
class ShopOwnerEnrollmentEvidenceV1 {
  ShopOwnerEnrollmentEvidenceV1({
    required this.action,
    required this.tenantId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.deviceId,
    required this.clientFingerprint,
    required this.sessionGeneration,
    required this.observedAtMillis,
    required this.authorityKeyId,
    required this.signature,
    required String evidenceDigest,
  }) : evidenceDigest = evidenceDigest.toLowerCase() {
    if (!_id.hasMatch(tenantId) ||
        !_id.hasMatch(siteId) ||
        !_id.hasMatch(coordinatorDeviceId) ||
        !_id.hasMatch(deviceId) ||
        !_id.hasMatch(authorityKeyId) ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(this.evidenceDigest) ||
        sessionGeneration < 0 ||
        observedAtMillis <= 0 ||
        signature.length != 86 ||
        !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature) ||
        connectedSiteSha256(signingPayload) != this.evidenceDigest) {
      throw const FormatException('owner_enrollment_evidence_invalid');
    }
  }

  static final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
  static final _digest = RegExp(r'^[0-9a-f]{64}$');

  final ShopOwnerEnrollmentAction action;
  final String tenantId;
  final String siteId;
  final String coordinatorDeviceId;
  final String deviceId;
  final String clientFingerprint;
  final int sessionGeneration;
  final int observedAtMillis;
  final String authorityKeyId;
  final String signature;
  final String evidenceDigest;

  Map<String, Object> get signingPayload => {
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': action.name,
    'tenantId': tenantId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'deviceId': deviceId,
    'clientFingerprint': clientFingerprint,
    'sessionGeneration': sessionGeneration,
    'observedAtMillis': observedAtMillis,
    'authorityKeyId': authorityKeyId,
  };

  Map<String, Object> toJson() => {
    ...signingPayload,
    'signature': signature,
    'evidenceDigest': evidenceDigest,
  };
}

/// Historical owner-enrollment signature check for a retained cloud page.
/// The caller must separately prove this is the latest approval for the
/// device at the sample time, with no later revocation or key substitution.
ShopOwnerEnrollmentEvidenceV1 verifyRetainedEnrollmentApprovalSync({
  required String canonicalEvidenceJson,
  required String expectedEvidenceDigest,
  required String tenantId,
  required String siteId,
  required String coordinatorDeviceId,
  required String deviceId,
  required String clientFingerprint,
  required int sessionGeneration,
  required int trustedAtMillis,
  required Map<String, List<int>> pinnedOwnerIssuerKeys,
}) {
  Never invalid() =>
      throw const FormatException('retained_owner_enrollment_invalid');
  final Object? decoded;
  try {
    decoded = jsonDecode(canonicalEvidenceJson);
  } on FormatException {
    invalid();
  }
  const keys = <String>{
    'schema',
    'action',
    'tenantId',
    'siteId',
    'coordinatorDeviceId',
    'deviceId',
    'clientFingerprint',
    'sessionGeneration',
    'observedAtMillis',
    'authorityKeyId',
    'signature',
    'evidenceDigest',
  };
  if (decoded is! Map<String, dynamic> ||
      decoded.keys.toSet().difference(keys).isNotEmpty ||
      decoded.length != keys.length ||
      canonicalConnectedSiteJson(decoded) != canonicalEvidenceJson ||
      decoded['schema'] != 'supermega.shop.owner-enrollment-evidence.v1' ||
      decoded['action'] != 'approve' ||
      decoded['tenantId'] != tenantId ||
      decoded['siteId'] != siteId ||
      decoded['coordinatorDeviceId'] != coordinatorDeviceId ||
      decoded['deviceId'] != deviceId ||
      decoded['clientFingerprint'] != clientFingerprint ||
      decoded['sessionGeneration'] != sessionGeneration ||
      decoded['observedAtMillis'] is! int ||
      (decoded['observedAtMillis'] as int) > trustedAtMillis ||
      decoded['evidenceDigest'] != expectedEvidenceDigest ||
      decoded['authorityKeyId'] is! String ||
      decoded['signature'] is! String) {
    invalid();
  }
  final evidence = ShopOwnerEnrollmentEvidenceV1(
    action: ShopOwnerEnrollmentAction.approve,
    tenantId: tenantId,
    siteId: siteId,
    coordinatorDeviceId: coordinatorDeviceId,
    deviceId: deviceId,
    clientFingerprint: clientFingerprint,
    sessionGeneration: sessionGeneration,
    observedAtMillis: decoded['observedAtMillis'] as int,
    authorityKeyId: decoded['authorityKeyId'] as String,
    signature: decoded['signature'] as String,
    evidenceDigest: expectedEvidenceDigest,
  );
  if (!verifyPinnedRetainedEd25519Sync(
    canonicalSigningBytes: canonicalConnectedSiteJson(evidence.signingPayload),
    signature: evidence.signature,
    keyId: evidence.authorityKeyId,
    pinnedKeys: pinnedOwnerIssuerKeys,
  )) {
    invalid();
  }
  return evidence;
}

abstract interface class ShopOwnerEnrollmentEvidenceVerifier {
  Future<bool> verify(ShopOwnerEnrollmentEvidenceV1 evidence);
}

/// Explicit owner-signed Windows approval. It is not accepted by the v1 store
/// or coordinator until an additive, verified schema and CNG custody exist.
/// In particular a v1 fingerprint-only approval cannot be promoted to v2.
class ShopOwnerEnrollmentEvidenceV2 {
  ShopOwnerEnrollmentEvidenceV2({
    required this.action,
    required this.tenantId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.deviceId,
    required this.signingKeyId,
    required this.publicKeyBase64Url,
    required this.clientFingerprint,
    required this.sessionGeneration,
    required this.observedAtMillis,
    required this.authorityKeyId,
    required this.signature,
    required this.evidenceDigest,
  }) {
    if (!ShopOwnerEnrollmentEvidenceV1._id.hasMatch(tenantId) ||
        !ShopOwnerEnrollmentEvidenceV1._id.hasMatch(siteId) ||
        !ShopOwnerEnrollmentEvidenceV1._id.hasMatch(coordinatorDeviceId) ||
        !ShopOwnerEnrollmentEvidenceV1._id.hasMatch(deviceId) ||
        !ShopOwnerEnrollmentEvidenceV1._id.hasMatch(signingKeyId) ||
        !ShopOwnerEnrollmentEvidenceV1._id.hasMatch(authorityKeyId) ||
        sessionGeneration < 0 ||
        observedAtMillis <= 0 ||
        !ShopOwnerEnrollmentEvidenceV1._digest.hasMatch(evidenceDigest) ||
        !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature) ||
        connectedSiteSha256(signingPayload) != evidenceDigest) {
      throw const FormatException('owner_enrollment_v2_invalid');
    }
    requireConnectedP256DevicePublicKeyV2(
      publicKeyBase64Url: publicKeyBase64Url,
      fingerprintSha256: clientFingerprint,
    );
  }

  final ShopOwnerEnrollmentAction action;
  final String tenantId;
  final String siteId;
  final String coordinatorDeviceId;
  final String deviceId;
  final String signingKeyId;
  final String publicKeyBase64Url;
  final String clientFingerprint;
  final int sessionGeneration;
  final int observedAtMillis;
  final String authorityKeyId;
  final String signature;
  final String evidenceDigest;

  Map<String, Object> get signingPayload => {
    'schema': 'supermega.shop.owner-enrollment-evidence.v2',
    'action': action.name,
    'tenantId': tenantId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'deviceId': deviceId,
    'signingProfile': connectedP256DeviceProfileV2,
    'signingKeyId': signingKeyId,
    'publicKeyBase64Url': publicKeyBase64Url,
    'clientFingerprint': clientFingerprint,
    'sessionGeneration': sessionGeneration,
    'observedAtMillis': observedAtMillis,
    'authorityKeyId': authorityKeyId,
  };

  Map<String, Object> toJson() => {
    ...signingPayload,
    'signature': signature,
    'evidenceDigest': evidenceDigest,
  };
}

/// Historical authenticity only; this can verify either an approval or its
/// separately signed revocation. The current chain/head and revocation must be
/// checked again at admission. Ed25519 issuer keys are pinned independently.
ShopOwnerEnrollmentEvidenceV2 verifyRetainedOwnerEnrollmentV2Sync({
  ShopOwnerEnrollmentAction expectedAction = ShopOwnerEnrollmentAction.approve,
  required String canonicalEvidenceJson,
  required String expectedEvidenceDigest,
  required String tenantId,
  required String siteId,
  required String coordinatorDeviceId,
  required String deviceId,
  required String signingKeyId,
  required String publicKeyBase64Url,
  required String clientFingerprint,
  required int sessionGeneration,
  required int trustedAtMillis,
  required Map<String, List<int>> pinnedOwnerIssuerKeys,
}) {
  Never invalid() =>
      throw const FormatException('retained_owner_enrollment_v2_invalid');
  final Object? decoded;
  try {
    decoded = jsonDecode(canonicalEvidenceJson);
  } on FormatException {
    invalid();
  }
  if (decoded is! Map<String, dynamic> ||
      canonicalConnectedSiteJson(decoded) != canonicalEvidenceJson ||
      decoded.length != 15 ||
      decoded['schema'] != 'supermega.shop.owner-enrollment-evidence.v2' ||
      decoded['action'] != expectedAction.name ||
      decoded['signingProfile'] != connectedP256DeviceProfileV2 ||
      decoded['tenantId'] != tenantId ||
      decoded['siteId'] != siteId ||
      decoded['coordinatorDeviceId'] != coordinatorDeviceId ||
      decoded['deviceId'] != deviceId ||
      decoded['signingKeyId'] != signingKeyId ||
      decoded['publicKeyBase64Url'] != publicKeyBase64Url ||
      decoded['clientFingerprint'] != clientFingerprint ||
      decoded['sessionGeneration'] != sessionGeneration ||
      decoded['observedAtMillis'] is! int ||
      (decoded['observedAtMillis'] as int) > trustedAtMillis ||
      decoded['authorityKeyId'] is! String ||
      decoded['signature'] is! String ||
      decoded['evidenceDigest'] != expectedEvidenceDigest) {
    invalid();
  }
  final evidence = ShopOwnerEnrollmentEvidenceV2(
    action: expectedAction,
    tenantId: tenantId,
    siteId: siteId,
    coordinatorDeviceId: coordinatorDeviceId,
    deviceId: deviceId,
    signingKeyId: signingKeyId,
    publicKeyBase64Url: publicKeyBase64Url,
    clientFingerprint: clientFingerprint,
    sessionGeneration: sessionGeneration,
    observedAtMillis: decoded['observedAtMillis'] as int,
    authorityKeyId: decoded['authorityKeyId'] as String,
    signature: decoded['signature'] as String,
    evidenceDigest: expectedEvidenceDigest,
  );
  if (!verifyPinnedRetainedEd25519Sync(
    canonicalSigningBytes: canonicalConnectedSiteJson(evidence.signingPayload),
    signature: evidence.signature,
    keyId: evidence.authorityKeyId,
    pinnedKeys: pinnedOwnerIssuerKeys,
  )) {
    invalid();
  }
  return evidence;
}

class ShopConnectedSiteEnrollmentStore
    implements
        PairingNonceStore,
        CoordinatorClientKeyStore,
        CoordinatorRequestNonceStore,
        CoordinatorDeviceEnrollmentAuthorizer {
  ShopConnectedSiteEnrollmentStore({
    required this.database,
    required this.nowMillis,
  });

  final ShopDatabase database;
  final int Function() nowMillis;

  Future<void> registerPairingNonce({
    required String tenantId,
    required String siteId,
    required String coordinatorDeviceId,
    required String nonce,
    required int issuedAtMillis,
    required int expiresAtMillis,
  }) async {
    if (issuedAtMillis <= 0 || expiresAtMillis <= issuedAtMillis) {
      throw const FormatException('pairing_nonce_time_invalid');
    }
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT * FROM shop_site_pairing_nonces WHERE nonce = ?',
            variables: [Variable<String>(nonce)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('tenant_id') != tenantId ||
            existing.read<String>('site_id') != siteId ||
            existing.read<String>('coordinator_device_id') !=
                coordinatorDeviceId ||
            existing.read<int>('issued_at_millis') != issuedAtMillis ||
            existing.read<int>('expires_at_millis') != expiresAtMillis) {
          throw StateError('pairing_nonce_rebound');
        }
        return;
      }
      await database.customInsert(
        'INSERT INTO shop_site_pairing_nonces '
        '(nonce, tenant_id, site_id, coordinator_device_id, '
        'issued_at_millis, expires_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(nonce),
          Variable<String>(tenantId),
          Variable<String>(siteId),
          Variable<String>(coordinatorDeviceId),
          Variable<int>(issuedAtMillis),
          Variable<int>(expiresAtMillis),
        ],
      );
    });
  }

  @override
  Future<bool> consumeAndCreatePending(PairingNonceClaim claim) async {
    try {
      final publicKey = base64Url.decode(
        base64Url.normalize(claim.clientPublicKey),
      );
      final observedAtMillis = claim.observedAt.millisecondsSinceEpoch;
      final clockDelta = (nowMillis() - observedAtMillis).abs();
      if (publicKey.length != 32 ||
          clockDelta > const Duration(seconds: 1).inMilliseconds) {
        return false;
      }
      return await database.transaction(() async {
        final registered = await database
            .customSelect(
              'SELECT consumed_at_millis FROM shop_site_pairing_nonces '
              'WHERE nonce = ? AND tenant_id = ? AND site_id = ? '
              'AND coordinator_device_id = ? AND expires_at_millis = ? '
              'AND issued_at_millis <= ? AND expires_at_millis > ?',
              variables: [
                Variable<String>(claim.nonce),
                Variable<String>(claim.workspaceId),
                Variable<String>(claim.siteId),
                Variable<String>(claim.coordinatorDeviceId),
                Variable<int>(claim.expiresAt.millisecondsSinceEpoch),
                Variable<int>(observedAtMillis),
                Variable<int>(observedAtMillis),
              ],
            )
            .getSingleOrNull();
        if (registered == null) return false;
        if (registered.readNullable<int>('consumed_at_millis') != null) {
          final pending = await database
              .customSelect(
                'SELECT pending.public_key, pending.key_algorithm, '
                'device.device_id AS bound_device_id '
                'FROM shop_site_pending_enrollments pending '
                'LEFT JOIN shop_site_devices device ON '
                'device.public_key_fingerprint = pending.client_fingerprint '
                'WHERE pending.client_fingerprint = ? AND pending.nonce = ? '
                'AND pending.tenant_id = ? AND pending.site_id = ? '
                'AND pending.coordinator_device_id = ?',
                variables: [
                  Variable<String>(claim.clientFingerprint),
                  Variable<String>(claim.nonce),
                  Variable<String>(claim.workspaceId),
                  Variable<String>(claim.siteId),
                  Variable<String>(claim.coordinatorDeviceId),
                ],
              )
              .getSingleOrNull();
          return pending != null &&
              pending.readNullable<String>('bound_device_id') == null &&
              pending.read<String>('key_algorithm') == claim.keyAlgorithm &&
              _bytesEqual(pending.read<Uint8List>('public_key'), publicKey);
        }
        final updated = await database.customUpdate(
          'UPDATE shop_site_pairing_nonces SET consumed_at_millis = ? '
          'WHERE nonce = ? AND tenant_id = ? AND site_id = ? '
          'AND coordinator_device_id = ? AND expires_at_millis = ? '
          'AND consumed_at_millis IS NULL AND issued_at_millis <= ? '
          'AND expires_at_millis > ?',
          variables: [
            Variable<int>(observedAtMillis),
            Variable<String>(claim.nonce),
            Variable<String>(claim.workspaceId),
            Variable<String>(claim.siteId),
            Variable<String>(claim.coordinatorDeviceId),
            Variable<int>(claim.expiresAt.millisecondsSinceEpoch),
            Variable<int>(observedAtMillis),
            Variable<int>(observedAtMillis),
          ],
        );
        if (updated != 1) return false;
        await database.customInsert(
          'INSERT INTO shop_site_pending_enrollments '
          '(client_fingerprint, nonce, tenant_id, site_id, '
          'coordinator_device_id, public_key, key_algorithm, '
          'observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          variables: [
            Variable<String>(claim.clientFingerprint),
            Variable<String>(claim.nonce),
            Variable<String>(claim.workspaceId),
            Variable<String>(claim.siteId),
            Variable<String>(claim.coordinatorDeviceId),
            Variable<Uint8List>(Uint8List.fromList(publicKey)),
            Variable<String>(claim.keyAlgorithm),
            Variable<int>(observedAtMillis),
          ],
        );
        return true;
      });
    } on Object {
      return false;
    }
  }

  static bool _bytesEqual(List<int> left, List<int> right) {
    if (left.length != right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference == 0;
  }

  Future<void> importOwnerEvidence(
    ShopOwnerEnrollmentEvidenceV1 evidence, {
    required ShopOwnerEnrollmentEvidenceVerifier verifier,
  }) async {
    if (!await verifier.verify(evidence)) {
      throw StateError('owner_enrollment_evidence_unverified');
    }
    if (evidence.observedAtMillis > nowMillis() + 1000) {
      throw StateError('owner_enrollment_evidence_from_future');
    }
    final encoded = canonicalConnectedSiteJson(evidence.toJson());
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT evidence_json FROM shop_site_enrollment_evidence '
            'WHERE evidence_digest = ?',
            variables: [Variable<String>(evidence.evidenceDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('evidence_json') != encoded) {
          throw StateError('owner_enrollment_evidence_digest_reused');
        }
        return;
      }
      if (evidence.action == ShopOwnerEnrollmentAction.approve) {
        final pending = await database
            .customSelect(
              'SELECT observed_at_millis FROM shop_site_pending_enrollments '
              'WHERE client_fingerprint = ? AND tenant_id = ? AND site_id = ? '
              'AND coordinator_device_id = ?',
              variables: [
                Variable<String>(evidence.clientFingerprint),
                Variable<String>(evidence.tenantId),
                Variable<String>(evidence.siteId),
                Variable<String>(evidence.coordinatorDeviceId),
              ],
            )
            .getSingleOrNull();
        if (pending == null ||
            evidence.observedAtMillis <
                pending.read<int>('observed_at_millis')) {
          throw StateError('pending_enrollment_missing');
        }
        final priorBinding = await database
            .customSelect(
              'SELECT 1 FROM shop_site_devices WHERE '
              'public_key_fingerprint = ? OR device_id = ? LIMIT 1',
              variables: [
                Variable<String>(evidence.clientFingerprint),
                Variable<String>(evidence.deviceId),
              ],
            )
            .getSingleOrNull();
        if (priorBinding != null) {
          throw StateError('enrollment_key_already_bound');
        }
        await database.customInsert(
          'INSERT INTO shop_site_devices '
          '(device_id, tenant_id, site_id, public_key_fingerprint, '
          'session_generation, state, enrolled_at_millis) '
          "VALUES (?, ?, ?, ?, ?, 'active', ?)",
          variables: [
            Variable<String>(evidence.deviceId),
            Variable<String>(evidence.tenantId),
            Variable<String>(evidence.siteId),
            Variable<String>(evidence.clientFingerprint),
            Variable<int>(evidence.sessionGeneration),
            Variable<int>(evidence.observedAtMillis),
          ],
        );
      } else {
        final changed = await database.customUpdate(
          'UPDATE shop_site_devices SET state = ?, revoked_at_millis = ?, '
          'session_generation = ? WHERE device_id = ? AND tenant_id = ? '
          'AND site_id = ? AND public_key_fingerprint = ? AND state = ? '
          'AND session_generation <= ?',
          variables: [
            const Variable<String>('revoked'),
            Variable<int>(evidence.observedAtMillis),
            Variable<int>(evidence.sessionGeneration),
            Variable<String>(evidence.deviceId),
            Variable<String>(evidence.tenantId),
            Variable<String>(evidence.siteId),
            Variable<String>(evidence.clientFingerprint),
            const Variable<String>('active'),
            Variable<int>(evidence.sessionGeneration),
          ],
        );
        if (changed != 1) throw StateError('active_enrollment_missing');
      }
      await database.customInsert(
        'INSERT INTO shop_site_enrollment_evidence '
        '(evidence_digest, action, tenant_id, site_id, '
        'coordinator_device_id, device_id, client_fingerprint, '
        'session_generation, observed_at_millis, authority_key_id, '
        'evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(evidence.evidenceDigest),
          Variable<String>(evidence.action.name),
          Variable<String>(evidence.tenantId),
          Variable<String>(evidence.siteId),
          Variable<String>(evidence.coordinatorDeviceId),
          Variable<String>(evidence.deviceId),
          Variable<String>(evidence.clientFingerprint),
          Variable<int>(evidence.sessionGeneration),
          Variable<int>(evidence.observedAtMillis),
          Variable<String>(evidence.authorityKeyId),
          Variable<String>(encoded),
        ],
      );
    });
  }

  @override
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  }) async {
    final row = await database
        .customSelect(
          'SELECT device.state FROM shop_site_devices device '
          'JOIN shop_site_pending_enrollments pending '
          'ON pending.client_fingerprint = device.public_key_fingerprint '
          'AND pending.tenant_id = device.tenant_id '
          'AND pending.site_id = device.site_id '
          'WHERE device.device_id = ? AND device.tenant_id = ? '
          'AND device.site_id = ? AND pending.coordinator_device_id = ? '
          'AND device.public_key_fingerprint = ?',
          variables: [
            Variable<String>(deviceId),
            Variable<String>(workspaceId),
            Variable<String>(siteId),
            Variable<String>(coordinatorDeviceId),
            Variable<String>(clientFingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null) return CoordinatorDeviceEnrollmentState.pending;
    return row.read<String>('state') == 'active'
        ? CoordinatorDeviceEnrollmentState.approved
        : CoordinatorDeviceEnrollmentState.revoked;
  }

  @override
  Future<EnrolledCoordinatorClientV1?> find({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String fingerprint,
  }) async {
    final row = await database
        .customSelect(
          'SELECT device.state, pending.public_key, pending.key_algorithm '
          'FROM shop_site_devices device JOIN shop_site_pending_enrollments pending '
          'ON pending.client_fingerprint = device.public_key_fingerprint '
          'AND pending.tenant_id = device.tenant_id '
          'AND pending.site_id = device.site_id '
          'WHERE device.device_id = ? AND device.tenant_id = ? '
          'AND device.site_id = ? AND pending.coordinator_device_id = ? '
          'AND device.public_key_fingerprint = ?',
          variables: [
            Variable<String>(deviceId),
            Variable<String>(workspaceId),
            Variable<String>(siteId),
            Variable<String>(coordinatorDeviceId),
            Variable<String>(fingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null || row.read<String>('key_algorithm') != 'ed25519') {
      return null;
    }
    final publicKey = row.read<Uint8List>('public_key');
    if (crypto.sha256.convert(publicKey).toString() != fingerprint) return null;
    return EnrolledCoordinatorClientV1(
      workspaceId: workspaceId,
      siteId: siteId,
      coordinatorDeviceId: coordinatorDeviceId,
      deviceId: deviceId,
      fingerprint: fingerprint,
      signingKeyId: fingerprint,
      publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
      active: row.read<String>('state') == 'active',
    );
  }

  @override
  Future<bool> consume({
    required String clientFingerprint,
    required String nonce,
    required DateTime expiresAt,
  }) async {
    final observedAt = nowMillis();
    if (observedAt <= 0 || observedAt >= expiresAt.millisecondsSinceEpoch) {
      return false;
    }
    try {
      return await database.transaction(() async {
        final active = await database
            .customSelect(
              'SELECT 1 FROM shop_site_devices WHERE public_key_fingerprint = ? '
              "AND state = 'active'",
              variables: [Variable<String>(clientFingerprint)],
            )
            .getSingleOrNull();
        if (active == null) return false;
        await database.customInsert(
          'INSERT INTO shop_site_request_nonces '
          '(client_fingerprint, nonce, expires_at_millis, consumed_at_millis) '
          'VALUES (?, ?, ?, ?)',
          variables: [
            Variable<String>(clientFingerprint),
            Variable<String>(nonce),
            Variable<int>(expiresAt.millisecondsSinceEpoch),
            Variable<int>(observedAt),
          ],
        );
        return true;
      });
    } on Object {
      return false;
    }
  }

  Future<CoordinatorLeaseMaterial?> findLease({
    required String workspaceId,
    required String siteId,
    required String deviceId,
    String? leaseDigest,
  }) async {
    final row = await database
        .customSelect(
          'SELECT lease.*, device.session_generation AS current_session_generation, '
          'observation.generation AS current_revocation_generation '
          'FROM shop_site_offline_leases lease '
          'JOIN shop_site_devices device ON device.device_id = lease.device_id '
          'JOIN shop_site_revocation_observations observation '
          'ON observation.tenant_id = lease.tenant_id '
          'AND observation.site_id = lease.site_id '
          'WHERE lease.tenant_id = ? AND lease.site_id = ? '
          'AND lease.device_id = ? '
          '${leaseDigest == null ? '' : 'AND lease.payload_digest = ? '} '
          'ORDER BY lease.issued_at_millis DESC LIMIT 1',
          variables: [
            Variable<String>(workspaceId),
            Variable<String>(siteId),
            Variable<String>(deviceId),
            if (leaseDigest != null) Variable<String>(leaseDigest),
          ],
        )
        .getSingleOrNull();
    if (row == null) return null;
    final capabilities = (jsonDecode(
      row.read<String>('capabilities_json'),
    ) as List).cast<String>();
    return CoordinatorLeaseMaterial(
      lease: OfflineStaffLeaseV1(
        leaseId: row.read<String>('lease_id'),
        workspaceId: row.read<String>('tenant_id'),
        siteId: row.read<String>('site_id'),
        actorId: row.read<String>('actor_id'),
        role: row.read<String>('actor_role'),
        capabilities: capabilities,
        deviceId: row.read<String>('device_id'),
        sessionGeneration: row.read<int>('session_generation'),
        revocationGeneration: row.read<int>('revocation_generation'),
        issuedAt: DateTime.fromMillisecondsSinceEpoch(
          row.read<int>('issued_at_millis'),
          isUtc: true,
        ).toIso8601String(),
        expiresAt: DateTime.fromMillisecondsSinceEpoch(
          row.read<int>('expires_at_millis'),
          isUtc: true,
        ).toIso8601String(),
        issuerKeyId: row.read<String>('key_id'),
        payloadDigest: row.read<String>('payload_digest'),
        signature: row.read<String>('signature'),
      ),
      sessionGeneration: row.read<int>('current_session_generation'),
      revocationGeneration: row.read<int>('current_revocation_generation'),
    );
  }
}

class ShopConnectedSiteLeaseSource implements CoordinatorLeaseSource {
  const ShopConnectedSiteLeaseSource(this.store);

  final ShopConnectedSiteEnrollmentStore store;

  @override
  Future<CoordinatorLeaseMaterial?> find({
    required String workspaceId,
    required String siteId,
    required String deviceId,
    String? leaseDigest,
  }) => store.findLease(
    workspaceId: workspaceId,
    siteId: siteId,
    deviceId: deviceId,
    leaseDigest: leaseDigest,
  );
}
