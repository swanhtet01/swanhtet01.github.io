import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_stock_reservation.dart';
import 'shop_database.dart';
import 'shop_site_coordinator.dart';
import 'shop_staff_authorization.dart';

const shopRetailStockReserveCommandType = 'retail.stock.reserve.v1';
const shopRetailStockReleaseCommandType = 'retail.stock.release.v1';
const shopCafeStockReserveCommandType = 'cafe.stock.reserve.v1';
const shopCafeStockReleaseCommandType = 'cafe.stock.release.v1';

/// Strict command vocabulary for the default-off connected stock slice.
class ShopConnectedSiteDatabaseCapabilityResolver
    implements SiteCommandCapabilityResolver {
  const ShopConnectedSiteDatabaseCapabilityResolver();

  @override
  ShopStaffCapability? requiredCapability(SiteCommandV1 command) =>
      switch (command.commandType) {
        shopRetailStockReserveCommandType ||
        shopRetailStockReleaseCommandType => ShopStaffCapability.counterSale,
        shopCafeStockReserveCommandType ||
        shopCafeStockReleaseCommandType => ShopStaffCapability.cafeOrderWrite,
        _ => null,
      };
}

/// Converts an already authenticated wire command into the atomic database
/// seam. This adapter does not verify signatures, issue leases, or enable the
/// connected feature; those checks remain mandatory in the coordinator core.
class ShopConnectedSiteDatabaseCommandHandler implements SiteCommandHandler {
  const ShopConnectedSiteDatabaseCommandHandler({
    required this.database,
    required this.timeAuthority,
    this.connectedSiteEnabled = false,
  });

  final ShopDatabase database;
  final ShopConnectedSiteCoordinatorTimeAuthority timeAuthority;
  final bool connectedSiteEnabled;

  @override
  Future<SiteCommandAckV1> handle(
    String clientFingerprint,
    SiteCommandV1 command,
  ) async {
    if (!connectedSiteEnabled) {
      throw StateError('Connected-site database commands are disabled.');
    }
    final mapping = _mapping(command);
    await _requireActiveClient(clientFingerprint, command);
    final issuedAtMillis = DateTime.parse(command.issuedAt)
        .toUtc()
        .millisecondsSinceEpoch;
    final eventId =
        'event:${connectedSiteSha256({'commandId': command.commandId})}';
    final event = <String, Object?>{
      'eventId': eventId,
      'workspaceId': command.workspaceId,
      'siteId': command.siteId,
      'aggregateType': command.aggregateType,
      'aggregateId': command.aggregateId,
      'aggregateVersion': command.expectedVersion + 1,
      'eventType': mapping.eventType,
      'occurredAt': DateTime.fromMillisecondsSinceEpoch(
        issuedAtMillis,
        isUtc: true,
      ).toIso8601String(),
      'payload': command.payload,
    };
    final result = await database.applyConnectedSiteCommand(
      ShopConnectedSiteCommandInput(
        commandId: command.commandId,
        tenantId: command.workspaceId,
        siteId: command.siteId,
        actorId: command.actorId,
        deviceId: command.deviceId,
        aggregateType: command.aggregateType,
        aggregateId: command.aggregateId,
        capability: mapping.capability.name,
        expectedVersion: command.expectedVersion,
        payloadDigest: command.payloadDigest,
        leaseDigest: command.leaseDigest,
        commandDigest: command.commandDigest,
        eventId: eventId,
        eventType: mapping.eventType,
        eventPayloadJson: canonicalConnectedSiteJson(command.payload),
        eventDigest: connectedSiteSha256(event),
        ackDigest: connectedSiteSha256({
          'contract': 'supermega.shop.connected-site-local-ack.v1',
          'commandDigest': command.commandDigest,
        }),
        auditAction: mapping.auditAction,
        auditMetadataDigest: connectedSiteSha256({
          'contract': 'supermega.shop.connected-site-audit-metadata.v1',
          'commandDigest': command.commandDigest,
          'commandType': command.commandType,
          'aggregateType': command.aggregateType,
          'aggregateId': command.aggregateId,
        }),
        createdAtMillis: issuedAtMillis,
        stockReservation: mapping.reservation,
        stockReservationLifecycle: mapping.lifecycle,
      ),
      connectedSiteEnabled: true,
      timeAuthority: timeAuthority,
    );
    return SiteCommandAckV1(
      commandId: command.commandId,
      commandDigest: command.commandDigest,
      state: switch (result.status) {
        ShopConnectedSiteCommandStatus.accepted => SiteCommandAckState.accepted,
        ShopConnectedSiteCommandStatus.replayed => SiteCommandAckState.replayed,
        ShopConnectedSiteCommandStatus.conflict => SiteCommandAckState.conflict,
      },
      canonicalVersion: result.canonicalVersion,
      eventDigest: result.eventDigest,
      reason: result.conflictCode,
    );
  }

  Future<void> _requireActiveClient(
    String clientFingerprint,
    SiteCommandV1 command,
  ) async {
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(clientFingerprint)) {
      throw StateError('Connected-site client fingerprint is invalid.');
    }
    final row = await database
        .customSelect(
          'SELECT 1 FROM shop_site_devices WHERE device_id = ? '
          'AND tenant_id = ? AND site_id = ? AND public_key_fingerprint = ? '
          "AND state = 'active'",
          variables: [
            Variable<String>(command.deviceId),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(clientFingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('Connected-site client is not enrolled and active.');
    }
  }

  _CommandMapping _mapping(SiteCommandV1 command) {
    final isReserve = switch (command.commandType) {
      shopRetailStockReserveCommandType ||
      shopCafeStockReserveCommandType => true,
      shopRetailStockReleaseCommandType ||
      shopCafeStockReleaseCommandType => false,
      _ => throw StateError('Connected-site command type is unsupported.'),
    };
    final workflow = switch (command.commandType) {
      shopRetailStockReserveCommandType || shopRetailStockReleaseCommandType =>
        ConnectedStockWorkflowType.retailCart,
      shopCafeStockReserveCommandType ||
      shopCafeStockReleaseCommandType => ConnectedStockWorkflowType.cafeOrder,
      _ => throw StateError('Connected-site command type is unsupported.'),
    };
    final capability = workflow == ConnectedStockWorkflowType.retailCart
        ? ShopStaffCapability.counterSale
        : ShopStaffCapability.cafeOrderWrite;
    if (command.aggregateType != workflow.name) {
      throw StateError('Connected-site command workflow is invalid.');
    }
    if (isReserve) {
      final reservation = ConnectedStockReservationV1.fromJson(
        command.payload['reservation'],
      );
      if (command.payload['contract'] !=
              'supermega.shop.connected-stock-reserve.v1' ||
          command.payload.length != 2 ||
          reservation.workspaceId != command.workspaceId ||
          reservation.siteId != command.siteId ||
          reservation.actorId != command.actorId ||
          reservation.deviceId != command.deviceId ||
          reservation.workflowType != workflow ||
          reservation.capability != capability ||
          reservation.subjectId != command.aggregateId) {
        throw StateError('Connected-site reserve payload is invalid.');
      }
      return _CommandMapping(
        capability: capability,
        eventType: shopConnectedStockReservedEventType,
        auditAction: 'shop.connected_stock.reserve',
        reservation: reservation,
      );
    }
    if (command.payload['contract'] !=
            'supermega.shop.connected-stock-release.v1' ||
        command.payload.length != 5 ||
        command.payload['reservationId'] is! String ||
        command.payload['expectedReservationDigest'] is! String ||
        command.payload['targetState'] != 'released' ||
        command.payload['reason'] is! String) {
      throw StateError('Connected-site release payload is invalid.');
    }
    return _CommandMapping(
      capability: capability,
      eventType: shopConnectedStockReleasedEventType,
      auditAction: 'shop.connected_stock.release',
      lifecycle: ShopConnectedStockReservationLifecycleInput.release(
        reservationId: command.payload['reservationId']! as String,
        expectedReservationDigest:
            command.payload['expectedReservationDigest']! as String,
        reason: command.payload['reason']! as String,
      ),
    );
  }
}

class _CommandMapping {
  const _CommandMapping({
    required this.capability,
    required this.eventType,
    required this.auditAction,
    this.reservation,
    this.lifecycle,
  });

  final ShopStaffCapability capability;
  final String eventType;
  final String auditAction;
  final ConnectedStockReservationV1? reservation;
  final ShopConnectedStockReservationLifecycleInput? lifecycle;
}

/// Site-scoped, enrolled-client replication reader over immutable event rows.
class ShopConnectedSiteDatabaseReplicationReader
    implements SiteReplicationReader {
  const ShopConnectedSiteDatabaseReplicationReader({
    required this.database,
    required this.workspaceId,
    required this.siteId,
    this.pageSize = 100,
  });

  final ShopDatabase database;
  final String workspaceId;
  final String siteId;
  final int pageSize;

  @override
  Future<SiteDeltaV1> readDelta(
    String clientFingerprint,
    int afterCursor,
  ) async {
    await _requireActiveClient(clientFingerprint);
    final events = await database.readConnectedSitePendingEvents(
      tenantId: workspaceId,
      siteId: siteId,
      afterSequence: afterCursor,
      limit: pageSize,
    );
    return SiteDeltaV1(
      workspaceId: workspaceId,
      siteId: siteId,
      afterCursor: afterCursor,
      nextCursor: events.isEmpty ? afterCursor : events.last.cursor,
      events: [
        for (final entry in events)
          {
            'cursor': entry.cursor,
            'event': entry.event,
            'eventDigest': entry.eventDigest,
          },
      ],
    );
  }

  @override
  Future<SiteSnapshotV1> readSnapshot(String clientFingerprint) async {
    await _requireActiveClient(clientFingerprint);
    final aggregateRows = await database
        .customSelect(
          'SELECT aggregate_type, aggregate_id, version, last_site_sequence '
          'FROM shop_site_aggregate_versions WHERE tenant_id = ? AND site_id = ? '
          'ORDER BY aggregate_type, aggregate_id',
          variables: [Variable<String>(workspaceId), Variable<String>(siteId)],
        )
        .get();
    final cursorRow = await database
        .customSelect(
          'SELECT COALESCE(MAX(site_sequence), 0) AS cursor '
          'FROM shop_site_events WHERE tenant_id = ? AND site_id = ?',
          variables: [Variable<String>(workspaceId), Variable<String>(siteId)],
        )
        .getSingle();
    final conflictRow = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_site_conflicts conflict '
          'JOIN shop_site_commands command ON command.command_id = conflict.command_id '
          "WHERE command.tenant_id = ? AND command.site_id = ? AND conflict.state = 'pending'",
          variables: [Variable<String>(workspaceId), Variable<String>(siteId)],
        )
        .getSingle();
    final projections = <String, Object?>{
      'schema': 'supermega.shop.connected-site-projections.v1',
      'aggregates': [
        for (final row in aggregateRows)
          {
            'aggregateType': row.read<String>('aggregate_type'),
            'aggregateId': row.read<String>('aggregate_id'),
            'version': row.read<int>('version'),
            'lastSiteSequence': row.read<int>('last_site_sequence'),
          },
      ],
      'pendingConflictCount': conflictRow.read<int>('total'),
    };
    final cursor = cursorRow.read<int>('cursor');
    final unsigned = <String, Object?>{
      'protocolVersion': connectedSiteProtocolVersion,
      'workspaceId': workspaceId,
      'siteId': siteId,
      'version': 1,
      'continuationCursor': cursor,
      'projections': projections,
    };
    return SiteSnapshotV1(
      workspaceId: workspaceId,
      siteId: siteId,
      version: 1,
      continuationCursor: cursor,
      projections: projections,
      checkpointDigest: connectedSiteSha256(unsigned),
    );
  }

  Future<void> _requireActiveClient(String clientFingerprint) async {
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(clientFingerprint)) {
      throw StateError('Connected-site client fingerprint is invalid.');
    }
    final row = await database
        .customSelect(
          'SELECT 1 FROM shop_site_devices WHERE tenant_id = ? AND site_id = ? '
          "AND public_key_fingerprint = ? AND state = 'active'",
          variables: [
            Variable<String>(workspaceId),
            Variable<String>(siteId),
            Variable<String>(clientFingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('Connected-site replication client is not active.');
    }
  }
}
