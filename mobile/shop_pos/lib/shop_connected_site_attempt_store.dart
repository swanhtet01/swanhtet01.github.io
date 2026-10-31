import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_database.dart';
import 'shop_site_coordinator.dart';

abstract interface class ConnectedCoordinatorApprovalVerifier {
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  });
}

class UnavailableConnectedCoordinatorApprovalVerifier
    implements ConnectedCoordinatorApprovalVerifier {
  const UnavailableConnectedCoordinatorApprovalVerifier();
  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async => false;
}

class ConnectedCoordinatorApprovalV1 {
  const ConnectedCoordinatorApprovalV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.pairingDigest,
    required this.enrollmentEvidenceDigest,
    required this.clientDeviceId,
    required this.clientFingerprint,
    required this.clientSigningKeyId,
    required this.address,
    required this.port,
    required this.certificateSha256,
    required this.approvalGeneration,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
    required this.authorityKeyId,
    required this.authoritySignature,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String pairingDigest;
  final String enrollmentEvidenceDigest;
  final String clientDeviceId;
  final String clientFingerprint;
  final String clientSigningKeyId;
  final String address;
  final int port;
  final String certificateSha256;
  final int approvalGeneration;
  final int issuedAtMillis;
  final int expiresAtMillis;
  final String authorityKeyId;
  final String authoritySignature;

  Map<String, Object> get evidence => {
    'schema': 'supermega.connected-site.coordinator-approval.v1',
    'action': 'approve',
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'pairingDigest': pairingDigest,
    'enrollmentEvidenceDigest': enrollmentEvidenceDigest,
    'clientDeviceId': clientDeviceId,
    'clientFingerprint': clientFingerprint,
    'clientSigningKeyId': clientSigningKeyId,
    'address': address,
    'port': port,
    'certificateSha256': certificateSha256,
    'approvalGeneration': approvalGeneration,
    'issuedAtMillis': issuedAtMillis,
    'expiresAtMillis': expiresAtMillis,
    'authorityKeyId': authorityKeyId,
  };
  String get canonicalEvidence => canonicalConnectedSiteJson(evidence);
  String get bindingDigest => connectedSiteSha256(evidence);
}

class ConnectedCoordinatorRevocationV1 {
  const ConnectedCoordinatorRevocationV1({
    required this.targetBindingDigest,
    required this.workspaceId,
    required this.siteId,
    required this.clientDeviceId,
    required this.approvalGeneration,
    required this.issuedAtMillis,
    required this.authorityKeyId,
    required this.authoritySignature,
  });
  final String targetBindingDigest;
  final String workspaceId;
  final String siteId;
  final String clientDeviceId;
  final int approvalGeneration;
  final int issuedAtMillis;
  final String authorityKeyId;
  final String authoritySignature;
  Map<String, Object> get evidence => {
    'schema': 'supermega.connected-site.coordinator-approval.v1',
    'action': 'revoke',
    'targetBindingDigest': targetBindingDigest,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'clientDeviceId': clientDeviceId,
    'approvalGeneration': approvalGeneration,
    'issuedAtMillis': issuedAtMillis,
    'authorityKeyId': authorityKeyId,
  };
  String get canonicalEvidence => canonicalConnectedSiteJson(evidence);
  String get evidenceDigest =>
      crypto.sha256.convert(utf8.encode(canonicalEvidence)).toString();
}

class PreparedConnectedCommandV28 {
  const PreparedConnectedCommandV28({
    required this.commandId,
    required this.commandJson,
    required this.bodySha256,
    this.terminalAcknowledgement,
  });
  final String commandId;
  final String commandJson;
  final String bodySha256;
  final SiteCommandAckV1? terminalAcknowledgement;
}

class ShopConnectedSiteAttemptStore {
  ShopConnectedSiteAttemptStore({
    required this.database,
    this.approvalVerifier =
        const UnavailableConnectedCoordinatorApprovalVerifier(),
    this.runtimeEnabled = false,
    DateTime Function()? now,
  }) : now = now ?? (() => DateTime.now().toUtc());

  final ShopDatabase database;
  final ConnectedCoordinatorApprovalVerifier approvalVerifier;
  final bool runtimeEnabled;
  final DateTime Function() now;

  Future<String> importApproval(ConnectedCoordinatorApprovalV1 approval) async {
    _requireEnabled();
    final evidence = approval.canonicalEvidence;
    if (!_approvalShapeValid(approval) ||
        !await approvalVerifier.verify(
          authorityKeyId: approval.authorityKeyId,
          canonicalEvidence: evidence,
          signature: approval.authoritySignature,
        )) {
      throw StateError('connected_coordinator_approval_rejected');
    }
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT evidence_json, authority_signature FROM '
            'shop_site_coordinator_bindings WHERE binding_digest = ?',
            variables: [Variable.withString(approval.bindingDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('evidence_json') != evidence ||
            existing.read<String>('authority_signature') !=
                approval.authoritySignature) {
          throw StateError('connected_coordinator_approval_substituted');
        }
        return;
      }
      final enrollment = await database
          .customSelect(
            'SELECT 1 FROM shop_site_enrollment_evidence WHERE '
            'evidence_digest = ? AND action = ? AND tenant_id = ? AND site_id = ? '
            'AND coordinator_device_id = ? AND device_id = ? '
            'AND client_fingerprint = ? LIMIT 1',
            variables: [
              Variable.withString(approval.enrollmentEvidenceDigest),
              Variable.withString('approve'),
              Variable.withString(approval.workspaceId),
              Variable.withString(approval.siteId),
              Variable.withString(approval.coordinatorDeviceId),
              Variable.withString(approval.clientDeviceId),
              Variable.withString(approval.clientFingerprint),
            ],
          )
          .getSingleOrNull();
      if (enrollment == null) {
        throw StateError('connected_owner_enrollment_evidence_missing');
      }
      final priorGeneration = await database
          .customSelect(
            'SELECT MAX(approval_generation) AS generation FROM ('
            'SELECT approval_generation FROM shop_site_coordinator_bindings '
            'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ? '
            'UNION ALL SELECT approval_generation FROM '
            'shop_site_coordinator_binding_revocations WHERE workspace_id = ? '
            'AND site_id = ? AND client_device_id = ?)',
            variables: [
              Variable.withString(approval.workspaceId),
              Variable.withString(approval.siteId),
              Variable.withString(approval.clientDeviceId),
              Variable.withString(approval.workspaceId),
              Variable.withString(approval.siteId),
              Variable.withString(approval.clientDeviceId),
            ],
          )
          .getSingle();
      final prior = priorGeneration.readNullable<int>('generation') ?? 0;
      if (approval.approvalGeneration != prior + 1) {
        throw StateError('connected_coordinator_approval_generation_rejected');
      }
      await database.customStatement(
        'INSERT INTO shop_site_coordinator_bindings ('
        'binding_digest, action, workspace_id, site_id, coordinator_device_id, '
        'pairing_digest, enrollment_evidence_digest, client_device_id, '
        'client_fingerprint, client_signing_key_id, address, port, '
        'certificate_sha256, protocol_version, approval_generation, '
        'issued_at_millis, expires_at_millis, authority_key_id, evidence_json, '
        'evidence_digest, authority_signature, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          approval.bindingDigest,
          'approve',
          approval.workspaceId,
          approval.siteId,
          approval.coordinatorDeviceId,
          approval.pairingDigest,
          approval.enrollmentEvidenceDigest,
          approval.clientDeviceId,
          approval.clientFingerprint,
          approval.clientSigningKeyId,
          approval.address,
          approval.port,
          approval.certificateSha256,
          connectedSiteProtocolVersion,
          approval.approvalGeneration,
          approval.issuedAtMillis,
          approval.expiresAtMillis,
          approval.authorityKeyId,
          evidence,
          _sha(evidence),
          approval.authoritySignature,
          now().millisecondsSinceEpoch,
        ],
      );
      await database.verifyConnectedAttemptEvidence();
    });
    return approval.bindingDigest;
  }

  Future<String> revoke(ConnectedCoordinatorRevocationV1 revocation) async {
    _requireEnabled();
    final evidence = revocation.canonicalEvidence;
    if (revocation.issuedAtMillis <= 0 ||
        revocation.issuedAtMillis > now().millisecondsSinceEpoch + 1000 ||
        !await approvalVerifier.verify(
          authorityKeyId: revocation.authorityKeyId,
          canonicalEvidence: evidence,
          signature: revocation.authoritySignature,
        )) {
      throw StateError('connected_coordinator_revocation_rejected');
    }
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT evidence_json, authority_signature FROM '
            'shop_site_coordinator_binding_revocations WHERE evidence_digest = ?',
            variables: [Variable.withString(revocation.evidenceDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('evidence_json') != evidence ||
            existing.read<String>('authority_signature') !=
                revocation.authoritySignature) {
          throw StateError('connected_coordinator_revocation_substituted');
        }
        return;
      }
      final target = await database
          .customSelect(
            'SELECT * FROM shop_site_coordinator_bindings WHERE binding_digest = ?',
            variables: [Variable.withString(revocation.targetBindingDigest)],
          )
          .getSingleOrNull();
      final latest = await database
          .customSelect(
            'SELECT action, binding_digest, approval_generation, issued_at_millis FROM ('
            "SELECT action, binding_digest, approval_generation, issued_at_millis FROM shop_site_coordinator_bindings "
            'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ? '
            'UNION ALL SELECT action, target_binding_digest AS binding_digest, '
            'approval_generation, issued_at_millis FROM shop_site_coordinator_binding_revocations '
            'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ?) '
            'ORDER BY approval_generation DESC LIMIT 1',
            variables: [
              Variable.withString(revocation.workspaceId),
              Variable.withString(revocation.siteId),
              Variable.withString(revocation.clientDeviceId),
              Variable.withString(revocation.workspaceId),
              Variable.withString(revocation.siteId),
              Variable.withString(revocation.clientDeviceId),
            ],
          )
          .getSingleOrNull();
      if (target == null ||
          target.read<String>('workspace_id') != revocation.workspaceId ||
          target.read<String>('site_id') != revocation.siteId ||
          target.read<String>('client_device_id') !=
              revocation.clientDeviceId ||
          latest == null ||
          latest.read<String>('action') != 'approve' ||
          latest.read<String>('binding_digest') !=
              revocation.targetBindingDigest ||
          revocation.approvalGeneration !=
              latest.read<int>('approval_generation') + 1 ||
          revocation.issuedAtMillis < latest.read<int>('issued_at_millis')) {
        throw StateError('connected_coordinator_revocation_chain_rejected');
      }
      await database.customStatement(
        'INSERT INTO shop_site_coordinator_binding_revocations ('
        'evidence_digest, action, target_binding_digest, workspace_id, site_id, '
        'client_device_id, approval_generation, issued_at_millis, '
        'authority_key_id, evidence_json, authority_signature, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          revocation.evidenceDigest,
          'revoke',
          revocation.targetBindingDigest,
          revocation.workspaceId,
          revocation.siteId,
          revocation.clientDeviceId,
          revocation.approvalGeneration,
          revocation.issuedAtMillis,
          revocation.authorityKeyId,
          evidence,
          revocation.authoritySignature,
          now().millisecondsSinceEpoch,
        ],
      );
      await database.verifyConnectedAttemptEvidence();
    });
    return revocation.evidenceDigest;
  }

  Future<PreparedConnectedCommandV28> prepare({
    required SiteCommandV1 command,
    required String bindingDigest,
    required String clientFingerprint,
  }) async {
    _requireEnabled();
    final commandJson = canonicalConnectedSiteJson(command.toJson());
    final bodySha256 = _sha(commandJson);
    return database.transaction(() async {
      final binding = await database
          .customSelect(
            'SELECT * FROM shop_site_coordinator_bindings WHERE binding_digest = ?',
            variables: [Variable.withString(bindingDigest)],
          )
          .getSingleOrNull();
      final latest = binding == null
          ? null
          : await database
                .customSelect(
                  'SELECT action, binding_digest FROM ('
                  'SELECT action, binding_digest, approval_generation FROM '
                  'shop_site_coordinator_bindings WHERE workspace_id = ? '
                  'AND site_id = ? AND client_device_id = ? UNION ALL '
                  'SELECT action, target_binding_digest AS binding_digest, '
                  'approval_generation FROM shop_site_coordinator_binding_revocations '
                  'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ?) '
                  'ORDER BY approval_generation DESC LIMIT 1',
                  variables: [
                    Variable.withString(command.workspaceId),
                    Variable.withString(command.siteId),
                    Variable.withString(command.deviceId),
                    Variable.withString(command.workspaceId),
                    Variable.withString(command.siteId),
                    Variable.withString(command.deviceId),
                  ],
                )
                .getSingleOrNull();
      final activeEnrollment = binding == null
          ? null
          : await database
                .customSelect(
                  'SELECT 1 FROM shop_site_enrollment_evidence evidence '
                  'JOIN shop_site_devices device ON device.device_id = evidence.device_id '
                  'WHERE evidence.evidence_digest = ? AND evidence.action = ? '
                  'AND evidence.tenant_id = ? AND evidence.site_id = ? '
                  'AND evidence.device_id = ? AND evidence.client_fingerprint = ? '
                  "AND device.state = 'active' LIMIT 1",
                  variables: [
                    Variable.withString(
                      binding.read<String>('enrollment_evidence_digest'),
                    ),
                    const Variable<String>('approve'),
                    Variable.withString(command.workspaceId),
                    Variable.withString(command.siteId),
                    Variable.withString(command.deviceId),
                    Variable.withString(clientFingerprint),
                  ],
                )
                .getSingleOrNull();
      if (binding == null ||
          latest == null ||
          activeEnrollment == null ||
          latest.read<String>('action') != 'approve' ||
          latest.read<String>('binding_digest') != bindingDigest ||
          binding.read<String>('workspace_id') != command.workspaceId ||
          binding.read<String>('site_id') != command.siteId ||
          binding.read<String>('client_device_id') != command.deviceId ||
          binding.read<String>('client_fingerprint') != clientFingerprint ||
          binding.read<String>('client_signing_key_id') !=
              command.signingKeyId ||
          binding.read<int>('expires_at_millis') <=
              now().millisecondsSinceEpoch ||
          !await approvalVerifier.verify(
            authorityKeyId: binding.read<String>('authority_key_id'),
            canonicalEvidence: binding.read<String>('evidence_json'),
            signature: binding.read<String>('authority_signature'),
          )) {
        throw StateError('connected_command_binding_rejected');
      }
      final existing = await database
          .customSelect(
            'SELECT * FROM shop_site_command_attempts WHERE command_id = ?',
            variables: [Variable.withString(command.commandId)],
          )
          .getSingleOrNull();
      if (existing == null) {
        await database.customStatement(
          'INSERT INTO shop_site_command_attempts (command_id, binding_digest, '
          'workspace_id, site_id, device_id, signing_key_id, command_digest, '
          'command_json, body_sha256, prepared_at_millis) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            command.commandId,
            bindingDigest,
            command.workspaceId,
            command.siteId,
            command.deviceId,
            command.signingKeyId,
            command.commandDigest,
            commandJson,
            bodySha256,
            now().millisecondsSinceEpoch,
          ],
        );
      } else if (existing.read<String>('binding_digest') != bindingDigest ||
          existing.read<String>('command_json') != commandJson ||
          existing.read<String>('body_sha256') != bodySha256) {
        throw StateError('connected_command_attempt_substituted');
      }
      await database.verifyConnectedAttemptEvidence();
      final result = await database
          .customSelect(
            'SELECT ack_json FROM shop_site_command_results WHERE command_id = ?',
            variables: [Variable.withString(command.commandId)],
          )
          .getSingleOrNull();
      return PreparedConnectedCommandV28(
        commandId: command.commandId,
        commandJson: commandJson,
        bodySha256: bodySha256,
        terminalAcknowledgement: result == null
            ? null
            : SiteCommandAckV1.fromJson(
                jsonDecode(result.read<String>('ack_json')),
              ),
      );
    });
  }

  Future<int> beginTransmission({
    required String commandId,
    required CoordinatorRequestProof proof,
    required String requestSignature,
  }) async {
    _requireEnabled();
    return database.transaction(() async {
      final attempt = await database
          .customSelect(
            'SELECT attempt.*, binding.coordinator_device_id, '
            'binding.client_fingerprint, binding.expires_at_millis, '
            'binding.authority_key_id, binding.evidence_json, '
            'binding.authority_signature, binding.enrollment_evidence_digest '
            'FROM shop_site_command_attempts attempt '
            'JOIN shop_site_coordinator_bindings binding '
            'ON binding.binding_digest = attempt.binding_digest '
            'WHERE attempt.command_id = ?',
            variables: [Variable.withString(commandId)],
          )
          .getSingleOrNull();
      final latest = attempt == null
          ? null
          : await database
                .customSelect(
                  'SELECT action, binding_digest FROM ('
                  'SELECT action, binding_digest, approval_generation FROM '
                  'shop_site_coordinator_bindings WHERE workspace_id = ? '
                  'AND site_id = ? AND client_device_id = ? UNION ALL '
                  'SELECT action, target_binding_digest AS binding_digest, '
                  'approval_generation FROM shop_site_coordinator_binding_revocations '
                  'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ?) '
                  'ORDER BY approval_generation DESC LIMIT 1',
                  variables: [
                    Variable.withString(attempt.read<String>('workspace_id')),
                    Variable.withString(attempt.read<String>('site_id')),
                    Variable.withString(attempt.read<String>('device_id')),
                    Variable.withString(attempt.read<String>('workspace_id')),
                    Variable.withString(attempt.read<String>('site_id')),
                    Variable.withString(attempt.read<String>('device_id')),
                  ],
                )
                .getSingleOrNull();
      final activeEnrollment = attempt == null
          ? null
          : await database
                .customSelect(
                  'SELECT 1 FROM shop_site_enrollment_evidence evidence '
                  'JOIN shop_site_devices device ON device.device_id = evidence.device_id '
                  'WHERE evidence.evidence_digest = ? AND evidence.action = ? '
                  'AND evidence.tenant_id = ? AND evidence.site_id = ? '
                  'AND evidence.device_id = ? AND evidence.client_fingerprint = ? '
                  "AND device.state = 'active' LIMIT 1",
                  variables: [
                    Variable.withString(
                      attempt.read<String>('enrollment_evidence_digest'),
                    ),
                    Variable.withString('approve'),
                    Variable.withString(attempt.read<String>('workspace_id')),
                    Variable.withString(attempt.read<String>('site_id')),
                    Variable.withString(attempt.read<String>('device_id')),
                    Variable.withString(
                      attempt.read<String>('client_fingerprint'),
                    ),
                  ],
                )
                .getSingleOrNull();
      final terminal = await database
          .customSelect(
            'SELECT 1 FROM shop_site_command_results WHERE command_id = ?',
            variables: [Variable.withString(commandId)],
          )
          .getSingleOrNull();
      final observedAt = now().toUtc();
      final proofAge = observedAt.difference(proof.issuedAt.toUtc()).abs();
      if (attempt == null ||
          terminal != null ||
          latest == null ||
          latest.read<String>('action') != 'approve' ||
          latest.read<String>('binding_digest') !=
              attempt.read<String>('binding_digest') ||
          activeEnrollment == null ||
          proofAge > const Duration(minutes: 2) ||
          !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{21,127}$')
              .hasMatch(proof.nonce) ||
          !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(requestSignature) ||
          proof.signature != requestSignature ||
          attempt.read<int>('expires_at_millis') <=
              now().millisecondsSinceEpoch ||
          !await approvalVerifier.verify(
            authorityKeyId: attempt.read<String>('authority_key_id'),
            canonicalEvidence: attempt.read<String>('evidence_json'),
            signature: attempt.read<String>('authority_signature'),
          ) ||
          proof.workspaceId != attempt.read<String>('workspace_id') ||
          proof.siteId != attempt.read<String>('site_id') ||
          proof.coordinatorDeviceId !=
              attempt.read<String>('coordinator_device_id') ||
          proof.clientFingerprint !=
              attempt.read<String>('client_fingerprint') ||
          proof.claimedDeviceId != attempt.read<String>('device_id') ||
          proof.method != 'POST' ||
          proof.canonicalTarget != '/v1/commands' ||
          proof.bodySha256 != attempt.read<String>('body_sha256')) {
        throw StateError('connected_transmission_binding_rejected');
      }
      final count = await database
          .customSelect(
            'SELECT COUNT(*) AS count FROM shop_site_command_transmissions '
            'WHERE command_id = ?',
            variables: [Variable.withString(commandId)],
          )
          .getSingle();
      final sequence = count.read<int>('count') + 1;
      final proofJson = canonicalConnectedSiteJson(proof.signingPayload);
      await database.customStatement(
        'INSERT INTO shop_site_command_transmissions (command_id, '
        'transmission_sequence, request_nonce, issued_at_millis, method, '
        'canonical_target, proof_json, proof_digest, request_signature, '
        'body_sha256, started_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          commandId,
          sequence,
          proof.nonce,
          proof.issuedAt.millisecondsSinceEpoch,
          proof.method,
          proof.canonicalTarget,
          proofJson,
          connectedSiteSha256(proof.signingPayload),
          requestSignature,
          proof.bodySha256,
          now().millisecondsSinceEpoch,
        ],
      );
      await database.verifyConnectedAttemptEvidence();
      return sequence;
    });
  }

  Future<SiteCommandAckV1> recordTerminal({
    required String commandId,
    required int transmissionSequence,
    required SiteCommandAckV1 acknowledgement,
  }) async {
    _requireEnabled();
    final ackJson = canonicalConnectedSiteJson(acknowledgement.toJson());
    await database.transaction(() async {
      final attempt = await database
          .customSelect(
            'SELECT command_digest FROM shop_site_command_attempts '
            'WHERE command_id = ?',
            variables: [Variable.withString(commandId)],
          )
          .getSingleOrNull();
      if (attempt == null ||
          acknowledgement.commandId != commandId ||
          acknowledgement.commandDigest !=
              attempt.read<String>('command_digest')) {
        throw StateError('connected_command_ack_rejected');
      }
      final existing = await database
          .customSelect(
            'SELECT ack_json FROM shop_site_command_results WHERE command_id = ?',
            variables: [Variable.withString(commandId)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('ack_json') != ackJson) {
          throw StateError('connected_command_ack_substituted');
        }
        return;
      }
      final acknowledged =
          acknowledgement.state == SiteCommandAckState.accepted ||
          acknowledgement.state == SiteCommandAckState.replayed;
      await database.customStatement(
        'INSERT INTO shop_site_command_results (command_id, '
        'transmission_sequence, result_kind, ack_state, ack_json, ack_digest, '
        'completed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          commandId,
          transmissionSequence,
          acknowledged ? 'acknowledged' : 'rejected',
          acknowledgement.state.name,
          ackJson,
          connectedSiteSha256(acknowledgement.toJson()),
          now().millisecondsSinceEpoch,
        ],
      );
      await database.verifyConnectedAttemptEvidence();
    });
    return acknowledgement;
  }

  Future<List<PreparedConnectedCommandV28>> recoverUnresolved({
    required String bindingDigest,
  }) async {
    _requireEnabled();
    await database.verifyConnectedAttemptEvidence();
    final rows = await database
        .customSelect(
          'SELECT attempt.* FROM shop_site_command_attempts attempt '
          'LEFT JOIN shop_site_command_results result '
          'ON result.command_id = attempt.command_id '
          'WHERE attempt.binding_digest = ? AND result.command_id IS NULL '
          'ORDER BY attempt.prepared_at_millis, attempt.command_id',
          variables: [Variable.withString(bindingDigest)],
        )
        .get();
    return rows
        .map(
          (row) => PreparedConnectedCommandV28(
            commandId: row.read<String>('command_id'),
            commandJson: row.read<String>('command_json'),
            bodySha256: row.read<String>('body_sha256'),
          ),
        )
        .toList(growable: false);
  }

  bool _approvalShapeValid(ConnectedCoordinatorApprovalV1 value) =>
      value.approvalGeneration > 0 &&
      value.issuedAtMillis <= now().millisecondsSinceEpoch + 1000 &&
      value.expiresAtMillis > value.issuedAtMillis &&
      value.expiresAtMillis - value.issuedAtMillis <=
          const Duration(days: 7).inMilliseconds &&
      value.expiresAtMillis > now().millisecondsSinceEpoch &&
      _isPrivateNumericAddress(value.address) &&
      value.port >= 1 &&
      value.port <= 65535 &&
      [
        value.pairingDigest,
        value.enrollmentEvidenceDigest,
        value.clientFingerprint,
        value.certificateSha256,
      ].every((item) => RegExp(r'^[0-9a-f]{64}$').hasMatch(item));

  bool _isPrivateNumericAddress(String value) {
    if (value.contains('%')) return false;
    final parsed = InternetAddress.tryParse(value);
    if (parsed == null) return false;
    final bytes = parsed.rawAddress;
    if (bytes.length == 4) {
      return bytes[0] == 10 ||
          (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
          (bytes[0] == 192 && bytes[1] == 168);
    }
    return bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
  }

  String _sha(String value) =>
      crypto.sha256.convert(utf8.encode(value)).toString();

  void _requireEnabled() {
    if (!runtimeEnabled) {
      throw StateError('connected_site_attempt_store_disabled');
    }
  }
}
