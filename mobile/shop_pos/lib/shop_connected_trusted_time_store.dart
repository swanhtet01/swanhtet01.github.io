import 'dart:math';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_trusted_time_contract.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_database.dart';

class ConnectedTrustedTimeCapability {
  ConnectedTrustedTimeCapability._(this.requestDigest, this._secret);
  final String requestDigest;
  final List<int> _secret;
  void _erase() => _secret.fillRange(0, _secret.length, 0);
}

class ConnectedTrustedTimeAccepted {
  const ConnectedTrustedTimeAccepted({
    required this.acceptanceDigest,
    required this.effectiveAtMillis,
    required this.validUntilMillis,
  });
  final String acceptanceDigest;
  final int effectiveAtMillis;
  final int validUntilMillis;
}

/// Durable one-shot trusted-time evidence store.
///
/// Persisted heads are audit evidence only. This process exposes effective
/// time only for an acceptance it completed itself on the current boot.
class ShopConnectedTrustedTimeStore {
  ShopConnectedTrustedTimeStore({
    required this.database,
    required this.clock,
    required this.verifier,
  });

  final ShopDatabase database;
  final ConnectedTrustedTimePlatformClock clock;
  final ConnectedTrustedTimeAuthorityVerifier verifier;
  final Map<String, ConnectedTrustedTimeCapability> _active = {};
  final Map<String, _LiveAcceptance> _live = {};

  Future<ConnectedTrustedTimeCapability> retainChallenge({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeChallengeV1 challenge,
  }) async {
    if (!await verifier.verifyApproval(approval) ||
        approval.workspaceId != challenge.workspaceId ||
        approval.siteId != challenge.siteId ||
        approval.coordinatorDeviceId != challenge.coordinatorDeviceId ||
        approval.coordinatorBindingDigest !=
            challenge.coordinatorBindingDigest ||
        approval.coordinatorBindingGeneration !=
            challenge.coordinatorBindingGeneration) {
      throw StateError('connected_trusted_time_approval_invalid');
    }
    final boot = await clock.bootSessionId();
    final monotonic = await clock.monotonicMillis();
    if (boot != challenge.bootSessionId ||
        monotonic < challenge.startedMonotonicMillis ||
        monotonic - challenge.startedMonotonicMillis > 30000) {
      throw StateError('connected_trusted_time_challenge_stale');
    }
    final secret = List<int>.generate(32, (_) => Random.secure().nextInt(256));
    final capability = ConnectedTrustedTimeCapability._(
      challenge.requestDigest,
      List<int>.of(secret),
    );
    final capabilityHash = crypto.sha256.convert(secret).toString();
    secret.fillRange(0, secret.length, 0);
    final approvalJson = canonicalConnectedSiteJson(approval.toJson());
    final challengeJson = canonicalConnectedSiteJson(challenge.toJson());
    await database.transaction(() async {
      final existingApproval = await database
          .customSelect(
            'SELECT approval_json FROM shop_connected_time_approvals '
            'WHERE approval_digest = ?',
            variables: [Variable<String>(approval.approvalDigest)],
          )
          .getSingleOrNull();
      if (existingApproval == null) {
        await database.customInsert(
          'INSERT INTO shop_connected_time_approvals '
          '(approval_digest, approval_json, retained_at_monotonic_millis) '
          'VALUES (?, ?, ?)',
          variables: [
            Variable<String>(approval.approvalDigest),
            Variable<String>(approvalJson),
            Variable<int>(monotonic),
          ],
        );
      } else if (existingApproval.read<String>('approval_json') !=
          approvalJson) {
        throw StateError('connected_trusted_time_approval_substituted');
      }
      final existingRequest = await database
          .customSelect(
            'SELECT 1 FROM shop_connected_time_requests WHERE request_digest = ?',
            variables: [Variable<String>(challenge.requestDigest)],
          )
          .getSingleOrNull();
      if (existingRequest != null) {
        throw StateError('connected_trusted_time_request_replayed');
      }
      await database.customInsert(
        'INSERT INTO shop_connected_time_requests '
        '(request_digest, approval_digest, challenge_json, capability_hash, '
        'requested_at_monotonic_millis) VALUES (?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(challenge.requestDigest),
          Variable<String>(approval.approvalDigest),
          Variable<String>(challengeJson),
          Variable<String>(capabilityHash),
          Variable<int>(challenge.startedMonotonicMillis),
        ],
      );
    });
    _active[challenge.requestDigest] = capability;
    return capability;
  }

  Future<ConnectedTrustedTimeAccepted> complete({
    required ConnectedTrustedTimeCapability capability,
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  }) async {
    final active = _active.remove(capability.requestDigest);
    if (!identical(active, capability) ||
        capability.requestDigest != observation.challenge.requestDigest) {
      capability._erase();
      throw StateError('connected_trusted_time_capability_invalid');
    }
    try {
      return await _completeOnce(
        capability: capability,
        approval: approval,
        observation: observation,
      );
    } finally {
      capability._erase();
    }
  }

  Future<ConnectedTrustedTimeAccepted> _completeOnce({
    required ConnectedTrustedTimeCapability capability,
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  }) async {
    final boot = await clock.bootSessionId();
    final nowMonotonic = await clock.monotonicMillis();
    if (boot != observation.challenge.bootSessionId ||
        nowMonotonic < observation.challenge.startedMonotonicMillis ||
        nowMonotonic - observation.challenge.startedMonotonicMillis >
            connectedTrustedTimeMaximumValidity.inMilliseconds ||
        !await verifier.verifyObservation(
          approval: approval,
          observation: observation,
        )) {
      throw StateError('connected_trusted_time_observation_invalid');
    }
    final elapsed = nowMonotonic - observation.challenge.startedMonotonicMillis;
    final effective = observation.observedAtMillis + elapsed;
    if (effective > observation.validUntilMillis) {
      throw StateError('connected_trusted_time_observation_expired');
    }
    late String acceptanceDigest;
    await database.transaction(() async {
      await database.verifyConnectedTrustedTimeEvidence();
      final request = await database
          .customSelect(
            'SELECT approval_digest, challenge_json, capability_hash FROM '
            'shop_connected_time_requests WHERE request_digest = ?',
            variables: [Variable<String>(capability.requestDigest)],
          )
          .getSingleOrNull();
      if (request == null ||
          request.read<String>('approval_digest') != approval.approvalDigest ||
          request.read<String>('challenge_json') !=
              canonicalConnectedSiteJson(observation.challenge.toJson()) ||
          request.read<String>('capability_hash') !=
              crypto.sha256.convert(capability._secret).toString()) {
        throw StateError('connected_trusted_time_request_invalid');
      }
      final existing = await database
          .customSelect(
            'SELECT 1 FROM shop_connected_time_observations '
            'WHERE request_digest = ?',
            variables: [Variable<String>(capability.requestDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        throw StateError('connected_trusted_time_request_consumed');
      }
      await _requireNextAuthorityTuple(observation);
      await _requireDeviceProgress(observation, effective);
      final acceptance = <String, Object>{
        'schema': 'supermega.connected-trusted-time-acceptance.v1',
        'workspaceId': observation.challenge.workspaceId,
        'siteId': observation.challenge.siteId,
        'coordinatorDeviceId': observation.challenge.coordinatorDeviceId,
        'clientDeviceId': observation.challenge.clientDeviceId,
        'clientFingerprint': observation.challenge.clientFingerprint,
        'sessionGeneration': observation.challenge.sessionGeneration,
        'coordinatorBindingDigest':
            observation.challenge.coordinatorBindingDigest,
        'coordinatorBindingGeneration':
            observation.challenge.coordinatorBindingGeneration,
        'bootSessionId': observation.challenge.bootSessionId,
        'requestDigest': observation.challenge.requestDigest,
        'observationDigest': observation.observationDigest,
        'authorityKeyGeneration': observation.authorityKeyGeneration,
        'authorityEpoch': observation.authorityEpoch,
        'authoritySequence': observation.authoritySequence,
        'observedAtMillis': observation.observedAtMillis,
        'effectiveAtMillis': effective,
        'validUntilMillis': observation.validUntilMillis,
        'acceptedAtMonotonicMillis': nowMonotonic,
      };
      acceptanceDigest = connectedSiteSha256(acceptance);
      final acceptanceJson = canonicalConnectedSiteJson({
        ...acceptance,
        'acceptanceDigest': acceptanceDigest,
      });
      await database.customInsert(
        'INSERT INTO shop_connected_time_observations '
        '(observation_digest, request_digest, observation_json, '
        'received_at_monotonic_millis) VALUES (?, ?, ?, ?)',
        variables: [
          Variable<String>(observation.observationDigest),
          Variable<String>(observation.challenge.requestDigest),
          Variable<String>(canonicalConnectedSiteJson(observation.toJson())),
          Variable<int>(nowMonotonic),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_time_acceptances '
        '(acceptance_digest, request_digest, observation_digest, '
        'acceptance_json, accepted_at_monotonic_millis, effective_at_millis, '
        'valid_until_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(acceptanceDigest),
          Variable<String>(observation.challenge.requestDigest),
          Variable<String>(observation.observationDigest),
          Variable<String>(acceptanceJson),
          Variable<int>(nowMonotonic),
          Variable<int>(effective),
          Variable<int>(observation.validUntilMillis),
        ],
      );
      await _writeHeads(observation, acceptanceDigest, effective, nowMonotonic);
    });
    _live[_liveKey(observation.challenge)] = _LiveAcceptance(
      acceptanceDigest: acceptanceDigest,
      bootSessionId: boot,
      acceptedAtMonotonicMillis: nowMonotonic,
      effectiveAtMillis: effective,
      validUntilMillis: observation.validUntilMillis,
    );
    return ConnectedTrustedTimeAccepted(
      acceptanceDigest: acceptanceDigest,
      effectiveAtMillis: effective,
      validUntilMillis: observation.validUntilMillis,
    );
  }

  Future<int?> effectiveTimeMillis({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String clientDeviceId,
    required String clientFingerprint,
    required int sessionGeneration,
    required String coordinatorBindingDigest,
    required int coordinatorBindingGeneration,
  }) async {
    final live =
        _live['$workspaceId\u0000$siteId\u0000$coordinatorDeviceId\u0000'
            '$clientDeviceId\u0000$clientFingerprint\u0000'
            '$sessionGeneration\u0000$coordinatorBindingDigest\u0000'
            '$coordinatorBindingGeneration'];
    if (live == null || await clock.bootSessionId() != live.bootSessionId) {
      return null;
    }
    final monotonic = await clock.monotonicMillis();
    if (monotonic < live.acceptedAtMonotonicMillis) return null;
    final value =
        live.effectiveAtMillis + (monotonic - live.acceptedAtMonotonicMillis);
    return value <= live.validUntilMillis ? value : null;
  }

  String _liveKey(ConnectedTrustedTimeChallengeV1 challenge) =>
      '${challenge.workspaceId}\u0000${challenge.siteId}\u0000'
      '${challenge.coordinatorDeviceId}\u0000${challenge.clientDeviceId}\u0000'
      '${challenge.clientFingerprint}\u0000'
      '${challenge.sessionGeneration}\u0000${challenge.coordinatorBindingDigest}\u0000'
      '${challenge.coordinatorBindingGeneration}';

  Future<void> _requireNextAuthorityTuple(
    ConnectedTrustedTimeObservationV1 observation,
  ) async {
    final row = await database
        .customSelect(
          'SELECT workspace_id, site_id, coordinator_device_id, '
          'authority_key_generation, authority_epoch, authority_sequence, '
          'observed_at_millis, acceptance_digest, head_digest '
          'FROM shop_connected_time_authority_heads '
          'WHERE workspace_id = ? AND site_id = ? AND coordinator_device_id = ?',
          variables: [
            Variable<String>(observation.challenge.workspaceId),
            Variable<String>(observation.challenge.siteId),
            Variable<String>(observation.challenge.coordinatorDeviceId),
          ],
        )
        .getSingleOrNull();
    if (row == null) return;
    final expectedHeadDigest = connectedSiteSha256({
      'schema': 'supermega.connected-trusted-time-authority-head.v1',
      'workspaceId': row.read<String>('workspace_id'),
      'siteId': row.read<String>('site_id'),
      'coordinatorDeviceId': row.read<String>('coordinator_device_id'),
      'authorityKeyGeneration': row.read<int>('authority_key_generation'),
      'authorityEpoch': row.read<int>('authority_epoch'),
      'authoritySequence': row.read<int>('authority_sequence'),
      'observedAtMillis': row.read<int>('observed_at_millis'),
      'acceptanceDigest': row.read<String>('acceptance_digest'),
    });
    if (row.read<String>('head_digest') != expectedHeadDigest) {
      throw StateError('connected_trusted_time_authority_head_invalid');
    }
    final keyGeneration = row.read<int>('authority_key_generation');
    final epoch = row.read<int>('authority_epoch');
    final sequence = row.read<int>('authority_sequence');
    final next =
        (observation.authorityKeyGeneration == keyGeneration &&
            observation.authorityEpoch == epoch &&
            observation.authoritySequence == sequence + 1) ||
        (observation.authorityKeyGeneration == keyGeneration &&
            observation.authorityEpoch == epoch + 1 &&
            observation.authoritySequence == 1) ||
        (observation.authorityKeyGeneration == keyGeneration + 1 &&
            observation.authorityEpoch == 1 &&
            observation.authoritySequence == 1);
    if (!next ||
        observation.observedAtMillis < row.read<int>('observed_at_millis')) {
      throw StateError('connected_trusted_time_authority_rollback');
    }
  }

  Future<void> _requireDeviceProgress(
    ConnectedTrustedTimeObservationV1 observation,
    int effective,
  ) async {
    final challenge = observation.challenge;
    final row = await database
        .customSelect(
          'SELECT workspace_id, site_id, client_device_id, client_fingerprint, session_generation, '
          'coordinator_binding_digest, coordinator_binding_generation, '
          'boot_session_id, effective_at_millis, valid_until_millis, '
          'accepted_at_monotonic_millis, acceptance_digest, head_digest '
          'FROM shop_connected_time_device_heads '
          'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ?',
          variables: [
            Variable<String>(challenge.workspaceId),
            Variable<String>(challenge.siteId),
            Variable<String>(challenge.clientDeviceId),
          ],
        )
        .getSingleOrNull();
    if (row == null) return;
    final expectedHeadDigest = connectedSiteSha256({
      'schema': 'supermega.connected-trusted-time-device-head.v1',
      'workspaceId': row.read<String>('workspace_id'),
      'siteId': row.read<String>('site_id'),
      'clientDeviceId': row.read<String>('client_device_id'),
      'clientFingerprint': row.read<String>('client_fingerprint'),
      'sessionGeneration': row.read<int>('session_generation'),
      'coordinatorBindingDigest': row.read<String>(
        'coordinator_binding_digest',
      ),
      'coordinatorBindingGeneration': row.read<int>(
        'coordinator_binding_generation',
      ),
      'bootSessionId': row.read<String>('boot_session_id'),
      'effectiveAtMillis': row.read<int>('effective_at_millis'),
      'validUntilMillis': row.read<int>('valid_until_millis'),
      'acceptedAtMonotonicMillis': row.read<int>(
        'accepted_at_monotonic_millis',
      ),
      'acceptanceDigest': row.read<String>('acceptance_digest'),
    });
    if (row.read<String>('head_digest') != expectedHeadDigest) {
      throw StateError('connected_trusted_time_device_head_invalid');
    }
    if (row.read<String>('client_fingerprint') != challenge.clientFingerprint ||
        challenge.sessionGeneration < row.read<int>('session_generation') ||
        challenge.coordinatorBindingGeneration <
            row.read<int>('coordinator_binding_generation') ||
        (challenge.coordinatorBindingGeneration ==
                row.read<int>('coordinator_binding_generation') &&
            row.read<String>('coordinator_binding_digest') !=
                challenge.coordinatorBindingDigest) ||
        effective < row.read<int>('effective_at_millis')) {
      throw StateError('connected_trusted_time_device_rollback');
    }
  }

  Future<void> _writeHeads(
    ConnectedTrustedTimeObservationV1 observation,
    String acceptanceDigest,
    int effective,
    int monotonic,
  ) async {
    final challenge = observation.challenge;
    final authorityHead = {
      'schema': 'supermega.connected-trusted-time-authority-head.v1',
      'workspaceId': challenge.workspaceId,
      'siteId': challenge.siteId,
      'coordinatorDeviceId': challenge.coordinatorDeviceId,
      'authorityKeyGeneration': observation.authorityKeyGeneration,
      'authorityEpoch': observation.authorityEpoch,
      'authoritySequence': observation.authoritySequence,
      'observedAtMillis': observation.observedAtMillis,
      'acceptanceDigest': acceptanceDigest,
    };
    await database.customInsert(
      'INSERT INTO shop_connected_time_authority_heads '
      '(workspace_id, site_id, coordinator_device_id, authority_key_generation, '
      'authority_epoch, authority_sequence, observed_at_millis, '
      'acceptance_digest, head_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) '
      'ON CONFLICT(workspace_id, site_id, coordinator_device_id) DO UPDATE SET '
      'authority_key_generation=excluded.authority_key_generation, '
      'authority_epoch=excluded.authority_epoch, '
      'authority_sequence=excluded.authority_sequence, '
      'observed_at_millis=excluded.observed_at_millis, '
      'acceptance_digest=excluded.acceptance_digest, head_digest=excluded.head_digest',
      variables: [
        Variable<String>(challenge.workspaceId),
        Variable<String>(challenge.siteId),
        Variable<String>(challenge.coordinatorDeviceId),
        Variable<int>(observation.authorityKeyGeneration),
        Variable<int>(observation.authorityEpoch),
        Variable<int>(observation.authoritySequence),
        Variable<int>(observation.observedAtMillis),
        Variable<String>(acceptanceDigest),
        Variable<String>(connectedSiteSha256(authorityHead)),
      ],
    );
    final deviceHead = {
      'schema': 'supermega.connected-trusted-time-device-head.v1',
      'workspaceId': challenge.workspaceId,
      'siteId': challenge.siteId,
      'clientDeviceId': challenge.clientDeviceId,
      'clientFingerprint': challenge.clientFingerprint,
      'sessionGeneration': challenge.sessionGeneration,
      'coordinatorBindingDigest': challenge.coordinatorBindingDigest,
      'coordinatorBindingGeneration': challenge.coordinatorBindingGeneration,
      'bootSessionId': challenge.bootSessionId,
      'effectiveAtMillis': effective,
      'validUntilMillis': observation.validUntilMillis,
      'acceptedAtMonotonicMillis': monotonic,
      'acceptanceDigest': acceptanceDigest,
    };
    await database.customInsert(
      'INSERT INTO shop_connected_time_device_heads '
      '(workspace_id, site_id, client_device_id, client_fingerprint, '
      'session_generation, coordinator_binding_digest, '
      'coordinator_binding_generation, boot_session_id, effective_at_millis, '
      'valid_until_millis, accepted_at_monotonic_millis, acceptance_digest, '
      'head_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
      'ON CONFLICT(workspace_id, site_id, client_device_id) DO UPDATE SET '
      'client_fingerprint=excluded.client_fingerprint, '
      'session_generation=excluded.session_generation, '
      'coordinator_binding_digest=excluded.coordinator_binding_digest, '
      'coordinator_binding_generation=excluded.coordinator_binding_generation, '
      'boot_session_id=excluded.boot_session_id, '
      'effective_at_millis=excluded.effective_at_millis, '
      'valid_until_millis=excluded.valid_until_millis, '
      'accepted_at_monotonic_millis=excluded.accepted_at_monotonic_millis, '
      'acceptance_digest=excluded.acceptance_digest, head_digest=excluded.head_digest',
      variables: [
        Variable<String>(challenge.workspaceId),
        Variable<String>(challenge.siteId),
        Variable<String>(challenge.clientDeviceId),
        Variable<String>(challenge.clientFingerprint),
        Variable<int>(challenge.sessionGeneration),
        Variable<String>(challenge.coordinatorBindingDigest),
        Variable<int>(challenge.coordinatorBindingGeneration),
        Variable<String>(challenge.bootSessionId),
        Variable<int>(effective),
        Variable<int>(observation.validUntilMillis),
        Variable<int>(monotonic),
        Variable<String>(acceptanceDigest),
        Variable<String>(connectedSiteSha256(deviceHead)),
      ],
    );
  }
}

class _LiveAcceptance {
  const _LiveAcceptance({
    required this.acceptanceDigest,
    required this.bootSessionId,
    required this.acceptedAtMonotonicMillis,
    required this.effectiveAtMillis,
    required this.validUntilMillis,
  });
  final String acceptanceDigest;
  final String bootSessionId;
  final int acceptedAtMonotonicMillis;
  final int effectiveAtMillis;
  final int validUntilMillis;
}
