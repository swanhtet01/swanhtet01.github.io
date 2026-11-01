import 'dart:convert';

import 'package:drift/drift.dart';

import 'shop_connected_site_attempt_store.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_database.dart';

/// Durable, read-only client replica. It never mutates authoritative sale,
/// tender, product, stock, or café tables.
class ShopConnectedSiteReplicaStore {
  const ShopConnectedSiteReplicaStore({
    required this.database,
    required this.localWorkspaceId,
    required this.localSiteId,
    required this.localClientDeviceId,
    required this.localClientFingerprint,
    required this.localClientSigningKeyId,
    required this.approvedBindingDigest,
    required this.bindingResolver,
    this.runtimeEnabled = false,
  });

  final ShopDatabase database;
  final String localWorkspaceId;
  final String localSiteId;
  final String localClientDeviceId;
  final String localClientFingerprint;
  final String localClientSigningKeyId;
  final String approvedBindingDigest;
  final ConnectedSiteCommandAttemptStore bindingResolver;
  final bool runtimeEnabled;

  Future<void> applySnapshot({
    required SiteSnapshotV1 snapshot,
    required String clientFingerprint,
    required String certificateSha256,
    required int observedAtMillis,
  }) async {
    _requireEnabled(clientFingerprint, certificateSha256, observedAtMillis);
    _requireScope(snapshot.workspaceId, snapshot.siteId);
    final projections = _parseSnapshot(snapshot.projections);
    await database.transaction(() async {
      await _requireApprovedBinding(certificateSha256, observedAtMillis);
      final head = await _head(
        snapshot.workspaceId,
        snapshot.siteId,
        clientFingerprint,
      );
      _requireBinding(head, certificateSha256);
      if (head != null &&
          canonicalConnectedSiteJson(snapshot.projections) !=
              canonicalConnectedSiteJson(
                await _readCurrentProjectionState(
                  snapshot.workspaceId,
                  snapshot.siteId,
                  clientFingerprint,
                ),
              )) {
        throw StateError('connected_replica_snapshot_projection_changed');
      }
      if (head != null &&
          snapshot.continuationCursor < head.read<int>('continuation_cursor')) {
        throw StateError('connected_replica_snapshot_stale');
      }
      if (head != null &&
          snapshot.continuationCursor !=
              head.read<int>('continuation_cursor')) {
        throw StateError('connected_replica_snapshot_cursor_unreconstructable');
      }
      await _upsertHead(
        workspaceId: snapshot.workspaceId,
        siteId: snapshot.siteId,
        clientFingerprint: clientFingerprint,
        certificateSha256: certificateSha256,
        evidenceStartCursor:
            head?.read<int>('evidence_start_cursor') ??
            snapshot.continuationCursor,
        snapshotCursor: snapshot.continuationCursor,
        continuationCursor: snapshot.continuationCursor,
        snapshotVersion: snapshot.version,
        snapshotJson: canonicalConnectedSiteJson(snapshot.unsignedPayload),
        checkpointDigest: snapshot.checkpointDigest,
        observedAtMillis: observedAtMillis,
        writesPaused: false,
      );
      await database.customStatement(
        'DELETE FROM shop_connected_replica_projections WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ?',
        [snapshot.workspaceId, snapshot.siteId, clientFingerprint],
      );
      for (final projection in projections) {
        await _insertProjection(
          snapshot.workspaceId,
          snapshot.siteId,
          clientFingerprint,
          projection,
          snapshot.continuationCursor,
        );
      }
      await database.verifyConnectedReplicaEvidence();
    });
  }

  Future<void> applyDelta({
    required SiteDeltaV1 delta,
    required String clientFingerprint,
    required String certificateSha256,
    required int observedAtMillis,
  }) async {
    _requireEnabled(clientFingerprint, certificateSha256, observedAtMillis);
    _requireScope(delta.workspaceId, delta.siteId);
    await database.transaction(() async {
      await _requireApprovedBinding(certificateSha256, observedAtMillis);
      final head = await _head(
        delta.workspaceId,
        delta.siteId,
        clientFingerprint,
      );
      if (head == null) {
        throw StateError('connected_replica_delta_cursor_mismatch');
      }
      _requireBinding(head, certificateSha256);
      final deltaJson = canonicalConnectedSiteJson(delta.toJson());
      final deltaDigest = connectedSiteSha256(delta.toJson());
      if (head.read<int>('continuation_cursor') == delta.nextCursor) {
        final delivery = await database
            .customSelect(
              'SELECT delta_json, delta_digest FROM shop_connected_replica_deliveries '
              'WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ? '
              'AND after_cursor = ? AND next_cursor = ?',
              variables: [
                Variable(delta.workspaceId),
                Variable(delta.siteId),
                Variable(clientFingerprint),
                Variable(delta.afterCursor),
                Variable(delta.nextCursor),
              ],
            )
            .getSingleOrNull();
        if (delivery == null ||
            delivery.read<String>('delta_json') != deltaJson ||
            delivery.read<String>('delta_digest') != deltaDigest) {
          throw StateError('connected_replica_event_changed_replay');
        }
        await database.verifyConnectedReplicaEvidence();
        return;
      }
      if (head.read<int>('continuation_cursor') != delta.afterCursor) {
        throw StateError('connected_replica_delta_cursor_mismatch');
      }
      await database.customStatement(
        'INSERT INTO shop_connected_replica_deliveries '
        '(workspace_id, site_id, client_fingerprint, after_cursor, next_cursor, delta_json, delta_digest, applied_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          delta.workspaceId,
          delta.siteId,
          clientFingerprint,
          delta.afterCursor,
          delta.nextCursor,
          deltaJson,
          deltaDigest,
          observedAtMillis,
        ],
      );
      for (final entry in delta.events) {
        final cursor = entry['cursor']! as int;
        final event = (entry['event']! as Map).cast<String, Object?>();
        final digest = entry['eventDigest']! as String;
        final canonical = canonicalConnectedSiteJson(event);
        final existing = await database
            .customSelect(
              'SELECT event_json, event_digest FROM shop_connected_replica_events '
              'WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ? AND cursor = ?',
              variables: [
                Variable(delta.workspaceId),
                Variable(delta.siteId),
                Variable(clientFingerprint),
                Variable(cursor),
              ],
            )
            .getSingleOrNull();
        if (existing != null) {
          if (existing.read<String>('event_json') != canonical ||
              existing.read<String>('event_digest') != digest) {
            throw StateError('connected_replica_event_changed_replay');
          }
          continue;
        }
        await database.customStatement(
          'INSERT INTO shop_connected_replica_events (workspace_id, site_id, client_fingerprint, cursor, event_json, event_digest, received_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            delta.workspaceId,
            delta.siteId,
            clientFingerprint,
            cursor,
            canonical,
            digest,
            observedAtMillis,
          ],
        );
        await _applyEventProjections(
          delta.workspaceId,
          delta.siteId,
          clientFingerprint,
          cursor,
          event,
        );
      }
      await _upsertHead(
        workspaceId: delta.workspaceId,
        siteId: delta.siteId,
        clientFingerprint: clientFingerprint,
        certificateSha256: certificateSha256,
        evidenceStartCursor: head.read<int>('evidence_start_cursor'),
        snapshotCursor: head.read<int>('snapshot_cursor'),
        continuationCursor: delta.nextCursor,
        snapshotVersion: head.read<int>('snapshot_version'),
        snapshotJson: head.read<String>('snapshot_json'),
        checkpointDigest: head.read<String>('checkpoint_digest'),
        observedAtMillis: observedAtMillis,
        writesPaused: false,
      );
      await database.verifyConnectedReplicaEvidence();
    });
  }

  Future<void> markCoordinatorUnavailable({
    required String workspaceId,
    required String siteId,
    required String clientFingerprint,
    required String certificateSha256,
    required int observedAtMillis,
  }) async {
    _requireEnabled(clientFingerprint, certificateSha256, observedAtMillis);
    _requireScope(workspaceId, siteId);
    await database.transaction(() async {
      await _requireApprovedBinding(certificateSha256, observedAtMillis);
      final head = await _head(workspaceId, siteId, clientFingerprint);
      if (head == null) throw StateError('connected_replica_missing');
      _requireBinding(head, certificateSha256);
      await database.customStatement(
        'UPDATE shop_connected_replica_heads SET writes_paused = 1, updated_at_millis = ? '
        'WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ?',
        [observedAtMillis, workspaceId, siteId, clientFingerprint],
      );
    });
  }

  Future<List<Map<String, Object?>>> readProjections({
    required String workspaceId,
    required String siteId,
    required String clientFingerprint,
  }) async {
    _requireScope(workspaceId, siteId);
    if (clientFingerprint != localClientFingerprint) {
      throw StateError('connected_replica_client_substituted');
    }
    return (await database
            .customSelect(
              'SELECT projection_kind, aggregate_id, aggregate_version, last_cursor, payload_json, payload_digest '
              'FROM shop_connected_replica_projections WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ? '
              'ORDER BY projection_kind, aggregate_id',
              variables: [
                Variable(workspaceId),
                Variable(siteId),
                Variable(clientFingerprint),
              ],
            )
            .get())
        .map((row) => Map<String, Object?>.from(row.data))
        .toList();
  }

  Future<bool> sharedWritesPaused({
    required String workspaceId,
    required String siteId,
    required String clientFingerprint,
  }) async {
    _requireScope(workspaceId, siteId);
    if (clientFingerprint != localClientFingerprint) {
      throw StateError('connected_replica_client_substituted');
    }
    final head = await _head(workspaceId, siteId, clientFingerprint);
    return head == null || head.read<int>('writes_paused') == 1;
  }

  Future<QueryRow?> _head(
    String workspaceId,
    String siteId,
    String clientFingerprint,
  ) => database
      .customSelect(
        'SELECT * FROM shop_connected_replica_heads WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ?',
        variables: [
          Variable(workspaceId),
          Variable(siteId),
          Variable(clientFingerprint),
        ],
      )
      .getSingleOrNull();

  void _requireBinding(QueryRow? head, String certificateSha256) {
    if (head != null &&
        head.read<String>('certificate_sha256') != certificateSha256) {
      throw StateError('connected_replica_certificate_substituted');
    }
  }

  void _requireEnabled(String fingerprint, String certificate, int at) {
    final digest = RegExp(r'^[0-9a-f]{64}$');
    if (!runtimeEnabled ||
        fingerprint != localClientFingerprint ||
        !digest.hasMatch(fingerprint) ||
        !digest.hasMatch(certificate) ||
        at <= 0) {
      throw StateError('connected_replica_unavailable');
    }
  }

  void _requireScope(String workspaceId, String siteId) {
    if (workspaceId != localWorkspaceId || siteId != localSiteId) {
      throw StateError('connected_replica_scope_substituted');
    }
  }

  Future<void> _requireApprovedBinding(
    String observedCertificateSha256,
    int observedAtMillis,
  ) async {
    final binding = await bindingResolver.resolveActiveBinding(
      bindingDigest: approvedBindingDigest,
      workspaceId: localWorkspaceId,
      siteId: localSiteId,
      clientDeviceId: localClientDeviceId,
      clientFingerprint: localClientFingerprint,
      clientSigningKeyId: localClientSigningKeyId,
    );
    final retained = await database
        .customSelect(
          'SELECT issued_at_millis, expires_at_millis FROM shop_site_coordinator_bindings '
          'WHERE binding_digest = ? AND workspace_id = ? AND site_id = ? '
          'AND client_device_id = ? AND client_fingerprint = ? AND client_signing_key_id = ?',
          variables: [
            Variable(approvedBindingDigest),
            Variable(localWorkspaceId),
            Variable(localSiteId),
            Variable(localClientDeviceId),
            Variable(localClientFingerprint),
            Variable(localClientSigningKeyId),
          ],
        )
        .getSingleOrNull();
    if (binding.bindingDigest != approvedBindingDigest ||
        binding.workspaceId != localWorkspaceId ||
        binding.siteId != localSiteId ||
        binding.clientDeviceId != localClientDeviceId ||
        binding.clientFingerprint != localClientFingerprint ||
        binding.clientSigningKeyId != localClientSigningKeyId ||
        binding.certificateSha256 != observedCertificateSha256 ||
        retained == null ||
        retained.read<int>('issued_at_millis') > observedAtMillis ||
        retained.read<int>('expires_at_millis') <= observedAtMillis) {
      throw StateError('connected_replica_approval_rejected');
    }
  }

  Future<Map<String, Object?>> _readCurrentProjectionState(
    String workspaceId,
    String siteId,
    String clientFingerprint,
  ) async {
    final rows = await database
        .customSelect(
          'SELECT projection_kind, payload_json FROM shop_connected_replica_projections '
          'WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ? '
          'ORDER BY projection_kind, aggregate_id',
          variables: [
            Variable(workspaceId),
            Variable(siteId),
            Variable(clientFingerprint),
          ],
        )
        .get();
    final result = <String, Object?>{
      'schema': 'supermega.shop.connected-site-projections.v2',
      'aggregates': <Object?>[],
      'cafeOrders': <Object?>[],
      'stockReservations': <Object?>[],
      'conflicts': <Object?>[],
    };
    const keys = {
      'aggregate': 'aggregates',
      'cafeOrder': 'cafeOrders',
      'stockReservation': 'stockReservations',
      'conflict': 'conflicts',
    };
    for (final row in rows) {
      final key = keys[row.read<String>('projection_kind')];
      if (key == null) {
        throw StateError('connected_replica_projection_kind_invalid');
      }
      (result[key]! as List<Object?>).add(
        jsonDecode(row.read<String>('payload_json')),
      );
    }
    return result;
  }

  Future<void> _upsertHead({
    required String workspaceId,
    required String siteId,
    required String clientFingerprint,
    required String certificateSha256,
    required int evidenceStartCursor,
    required int snapshotCursor,
    required int continuationCursor,
    required int snapshotVersion,
    required String snapshotJson,
    required String checkpointDigest,
    required int observedAtMillis,
    required bool writesPaused,
  }) => database.customStatement(
    'INSERT INTO shop_connected_replica_heads (workspace_id, site_id, client_fingerprint, certificate_sha256, evidence_start_cursor, snapshot_cursor, continuation_cursor, snapshot_version, snapshot_json, checkpoint_digest, writes_paused, updated_at_millis) '
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id,site_id,client_fingerprint) DO UPDATE SET '
    'snapshot_cursor=excluded.snapshot_cursor, continuation_cursor=excluded.continuation_cursor, snapshot_version=excluded.snapshot_version, snapshot_json=excluded.snapshot_json, checkpoint_digest=excluded.checkpoint_digest, '
    'writes_paused=excluded.writes_paused, updated_at_millis=excluded.updated_at_millis',
    [
      workspaceId,
      siteId,
      clientFingerprint,
      certificateSha256,
      evidenceStartCursor,
      snapshotCursor,
      continuationCursor,
      snapshotVersion,
      snapshotJson,
      checkpointDigest,
      writesPaused ? 1 : 0,
      observedAtMillis,
    ],
  );

  List<Map<String, Object?>> _parseSnapshot(Map<String, Object?> value) {
    const keys = {
      'schema',
      'aggregates',
      'cafeOrders',
      'stockReservations',
      'conflicts',
    };
    if (value['schema'] != 'supermega.shop.connected-site-projections.v2' ||
        value.keys.toSet().difference(keys).isNotEmpty ||
        keys.difference(value.keys.toSet()).isNotEmpty) {
      throw const FormatException('connected replica snapshot shape');
    }
    final result = <Map<String, Object?>>[];
    void add(String kind, Object? raw, String idField, String versionField) {
      if (raw is! List) throw const FormatException('connected replica list');
      for (final item in raw) {
        if (item is! Map) throw const FormatException('connected replica row');
        final row = item.cast<String, Object?>();
        final id = row[idField];
        final version = row[versionField];
        if (id is! String || id.isEmpty || version is! int || version < 0) {
          throw const FormatException('connected replica identity');
        }
        result.add({
          'kind': kind,
          'id': id,
          'version': version,
          'payload': Map<String, Object?>.from(row),
        });
      }
    }

    add('aggregate', value['aggregates'], 'aggregateId', 'version');
    add('cafeOrder', value['cafeOrders'], 'orderId', 'ticketVersion');
    add(
      'stockReservation',
      value['stockReservations'],
      'reservationId',
      'stateVersion',
    );
    add('conflict', value['conflicts'], 'conflictId', 'actualVersion');
    return result;
  }

  Future<void> _insertProjection(
    String workspaceId,
    String siteId,
    String fingerprint,
    Map<String, Object?> projection,
    int cursor,
  ) {
    final payload = projection['payload']! as Map<String, Object?>;
    final canonical = canonicalConnectedSiteJson(payload);
    return database.customStatement(
      'INSERT INTO shop_connected_replica_projections (workspace_id, site_id, client_fingerprint, projection_kind, aggregate_id, aggregate_version, last_cursor, payload_json, payload_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        workspaceId,
        siteId,
        fingerprint,
        projection['kind'],
        projection['id'],
        projection['version'],
        cursor,
        canonical,
        connectedSiteSha256(payload),
      ],
    );
  }

  Future<void> _applyEventProjections(
    String workspaceId,
    String siteId,
    String fingerprint,
    int cursor,
    Map<String, Object?> event,
  ) async {
    final payload = (event['payload'] as Map).cast<String, Object?>();
    if (payload.keys.toSet().difference(const {
          'contract',
          'projections',
        }).isNotEmpty ||
        payload.length != 2 ||
        payload['contract'] !=
            'supermega.shop.connected-site-replica-state.v1' ||
        payload['projections'] is! Map) {
      throw StateError('connected_replica_projection_envelope_invalid');
    }
    final projections = _parseSnapshot(
      (payload['projections']! as Map).cast<String, Object?>(),
    );
    await database.customStatement(
      'DELETE FROM shop_connected_replica_projections WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ?',
      [workspaceId, siteId, fingerprint],
    );
    for (final projection in projections) {
      await _insertProjection(
        workspaceId,
        siteId,
        fingerprint,
        projection,
        cursor,
      );
    }
  }
}
