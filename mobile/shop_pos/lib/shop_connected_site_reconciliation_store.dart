import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_database.dart';

/// Durable SQLite implementation of the connected-site cloud upload ledger.
///
/// The upload cursor is reconstructed from the contiguous immutable event rows
/// that have canonical evidence in `shop_site_cloud_dispositions`. The legacy
/// acknowledgement index must match that evidence exactly. This deliberately
/// avoids conflating the coordinator's cloud position with per-client delta
/// cursors. A conflict is both retained in `shop_site_conflicts` and recorded
/// as the event's cloud disposition, so restart/retry cannot upload it again.
class ShopConnectedSiteReconciliationStore
    implements ConnectedSiteEventRepository {
  const ShopConnectedSiteReconciliationStore({
    required this.database,
    required this.nowMillis,
  });

  final ShopDatabase database;
  final int Function() nowMillis;

  @override
  Future<int> uploadCursor(ConnectedSiteScope scope) async {
    await _requireActiveScope(scope);
    return _uploadCursor(scope);
  }

  @override
  Future<List<ConnectedSitePendingEvent>> pendingEvents(
    ConnectedSiteScope scope, {
    required int afterCursor,
    required int limit,
  }) async {
    await _requireActiveScope(scope);
    if (afterCursor != await _uploadCursor(scope)) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_upload_cursor_stale',
      );
    }
    return database.readConnectedSitePendingEvents(
      tenantId: scope.workspaceId,
      siteId: scope.siteId,
      afterSequence: afterCursor,
      limit: limit,
    );
  }

  @override
  Future<ConnectedSitePersistResult> persistCloudOutcome(
    ConnectedSiteScope scope,
    ConnectedSiteCloudOutcome outcome,
  ) async {
    await _requireActiveScope(scope);
    if (outcome.afterCursor < 0 || outcome.nextCursor < outcome.afterCursor) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_outcome_invalid',
      );
    }
    return database.transaction(() async {
      final current = await _uploadCursor(scope);
      if (current != outcome.afterCursor && current != outcome.nextCursor) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_upload_cursor_stale',
        );
      }
      final rows = await database
          .customSelect(
            'SELECT event.event_row_id, event.site_sequence, '
            'event.aggregate_type, event.aggregate_id, '
            'event.aggregate_version, event.event_digest, '
            'command.command_id, command.command_digest '
            'FROM shop_site_events event JOIN shop_site_commands command '
            'ON command.command_id = event.command_id '
            'WHERE event.tenant_id = ? AND event.site_id = ? '
            'AND event.site_sequence > ? AND event.site_sequence <= ? '
            'ORDER BY event.site_sequence',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
              Variable<int>(outcome.afterCursor),
              Variable<int>(outcome.nextCursor),
            ],
          )
          .get();
      if (rows.length != outcome.nextCursor - outcome.afterCursor) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_outcome_gap',
        );
      }
      final byCommand = {
        for (final row in rows) row.read<String>('command_id'): row,
      };
      if (byCommand.length != rows.length) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_outcome_duplicate',
        );
      }
      final disposed = <String>{};
      var newAcknowledgements = 0;
      var newConflicts = 0;
      for (final acknowledgement in outcome.acknowledgements) {
        final row = byCommand[acknowledgement.commandId];
        if (row == null ||
            acknowledgement.commandDigest !=
                row.read<String>('command_digest') ||
            acknowledgement.eventDigest != row.read<String>('event_digest') ||
            acknowledgement.canonicalVersion !=
                row.read<int>('aggregate_version') ||
            (acknowledgement.state != SiteCommandAckState.accepted &&
                acknowledgement.state != SiteCommandAckState.replayed) ||
            !disposed.add(acknowledgement.commandId)) {
          throw const ConnectedSiteReconciliationException(
            'connected_site_ack_binding_mismatch',
          );
        }
        if (await _persistDisposition(
          eventRowId: row.read<int>('event_row_id'),
          kind: 'ack',
          value: acknowledgement.toJson(),
        )) {
          newAcknowledgements += 1;
        }
      }
      for (final conflict in outcome.conflicts) {
        final row = byCommand[conflict.commandId];
        if (row == null ||
            conflict.workspaceId != scope.workspaceId ||
            conflict.siteId != scope.siteId ||
            conflict.commandDigest != row.read<String>('command_digest') ||
            conflict.aggregateType != row.read<String>('aggregate_type') ||
            conflict.aggregateId != row.read<String>('aggregate_id') ||
            conflict.expectedVersion !=
                row.read<int>('aggregate_version') - 1 ||
            conflict.state != SiteConflictState.quarantined ||
            !disposed.add(conflict.commandId)) {
          throw const ConnectedSiteReconciliationException(
            'connected_site_conflict_binding_mismatch',
          );
        }
        if (await _persistConflict(conflict)) newConflicts += 1;
        await _persistDisposition(
          eventRowId: row.read<int>('event_row_id'),
          kind: 'conflict',
          value: conflict.toJson(),
        );
      }
      if (disposed.length != rows.length ||
          await _uploadCursor(scope) != outcome.nextCursor) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_incomplete_cloud_response',
        );
      }
      return ConnectedSitePersistResult(
        newAcknowledgementCount: newAcknowledgements,
        newConflictCount: newConflicts,
      );
    });
  }

  Future<int> _uploadCursor(ConnectedSiteScope scope) async {
    await database.verifyConnectedCloudDispositionEvidence();
    final row = await database
        .customSelect(
          'SELECT COALESCE('
          '(SELECT MIN(event.site_sequence) - 1 FROM shop_site_events event '
          'LEFT JOIN shop_site_cloud_dispositions cloud '
          'ON cloud.event_row_id = event.event_row_id '
          'WHERE event.tenant_id = ? AND event.site_id = ? '
          'AND cloud.event_row_id IS NULL), '
          '(SELECT COALESCE(MAX(event.site_sequence), 0) '
          'FROM shop_site_events event '
          'WHERE event.tenant_id = ? AND event.site_id = ?)) AS cursor',
          variables: [
            Variable<String>(scope.workspaceId),
            Variable<String>(scope.siteId),
            Variable<String>(scope.workspaceId),
            Variable<String>(scope.siteId),
          ],
        )
        .getSingle();
    return row.read<int>('cursor');
  }

  Future<bool> _persistDisposition({
    required int eventRowId,
    required String kind,
    required Map<String, Object> value,
  }) async {
    final encoded = canonicalConnectedSiteJson(value);
    final digest = connectedSiteSha256(value);
    final cloudEventId = '$kind:$digest';
    final existing = await database
        .customSelect(
          'SELECT disposition.disposition_kind, '
          'disposition.disposition_json, disposition.disposition_digest, '
          'disposition.observed_at_millis, cloud.cloud_event_id, '
          'cloud.acknowledgement_digest, cloud.acknowledged_at_millis '
          'FROM shop_site_cloud_dispositions disposition '
          'LEFT JOIN shop_site_cloud_acks cloud '
          'ON cloud.event_row_id = disposition.event_row_id '
          'WHERE disposition.event_row_id = ?',
          variables: [Variable<int>(eventRowId)],
        )
        .getSingleOrNull();
    if (existing != null) {
      if (existing.read<String>('disposition_kind') != kind ||
          existing.read<String>('disposition_json') != encoded ||
          existing.read<String>('disposition_digest') != digest ||
          existing.readNullable<String>('cloud_event_id') != cloudEventId ||
          existing.readNullable<String>('acknowledgement_digest') != digest ||
          existing.readNullable<int>('acknowledged_at_millis') !=
              existing.read<int>('observed_at_millis')) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_disposition_changed',
        );
      }
      return false;
    }
    final observedAt = nowMillis();
    if (observedAt <= 0) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_time_invalid',
      );
    }
    await database.customInsert(
      'INSERT INTO shop_site_cloud_dispositions '
      '(event_row_id, disposition_kind, disposition_json, '
      'disposition_digest, observed_at_millis) VALUES (?, ?, ?, ?, ?)',
      variables: [
        Variable<int>(eventRowId),
        Variable<String>(kind),
        Variable<String>(encoded),
        Variable<String>(digest),
        Variable<int>(observedAt),
      ],
    );
    await database.customInsert(
      'INSERT INTO shop_site_cloud_acks '
      '(event_row_id, cloud_event_id, acknowledgement_digest, '
      'acknowledged_at_millis) VALUES (?, ?, ?, ?)',
      variables: [
        Variable<int>(eventRowId),
        Variable<String>(cloudEventId),
        Variable<String>(digest),
        Variable<int>(observedAt),
      ],
    );
    return true;
  }

  Future<bool> _persistConflict(SiteConflictV1 conflict) async {
    final digest = connectedSiteSha256(conflict.toJson());
    final createdAt = DateTime.parse(conflict.createdAt)
        .toUtc()
        .millisecondsSinceEpoch;
    final existing = await database
        .customSelect(
          'SELECT conflict_id, reason_code, detail_digest, state, '
          'created_at_millis, resolved_at_millis '
          'FROM shop_site_conflicts WHERE command_id = ?',
          variables: [Variable<String>(conflict.commandId)],
        )
        .getSingleOrNull();
    if (existing != null) {
      if (existing.read<String>('conflict_id') != conflict.conflictId ||
          existing.read<String>('reason_code') != conflict.reason ||
          existing.read<String>('detail_digest') != digest ||
          existing.read<String>('state') != 'quarantined' ||
          existing.read<int>('created_at_millis') != createdAt ||
          existing.readNullable<int>('resolved_at_millis') != createdAt) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_conflict_changed',
        );
      }
      return false;
    }
    await database.customInsert(
      'INSERT INTO shop_site_conflicts '
      '(conflict_id, command_id, reason_code, detail_digest, state, '
      'created_at_millis, resolved_at_millis) '
      "VALUES (?, ?, ?, ?, 'quarantined', ?, ?)",
      variables: [
        Variable<String>(conflict.conflictId),
        Variable<String>(conflict.commandId),
        Variable<String>(conflict.reason),
        Variable<String>(digest),
        Variable<int>(createdAt),
        Variable<int>(createdAt),
      ],
    );
    return true;
  }

  Future<void> _requireActiveScope(ConnectedSiteScope scope) async {
    final active = await database
        .customSelect(
          'SELECT 1 FROM shop_site_devices WHERE device_id = ? '
          'AND tenant_id = ? AND site_id = ? AND state = ?',
          variables: [
            Variable<String>(scope.deviceId),
            Variable<String>(scope.workspaceId),
            Variable<String>(scope.siteId),
            const Variable<String>('active'),
          ],
        )
        .getSingleOrNull();
    if (active == null) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_scope_inactive',
      );
    }
  }
}
