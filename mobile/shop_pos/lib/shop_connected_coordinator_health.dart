import 'package:drift/drift.dart';

import 'shop_connected_runtime.dart';
import 'shop_database.dart';
import 'shop_site_coordinator.dart';

/// Scope-bound platform/cloud/backup observations.
///
/// These values are never inferred from wall-clock time or local row presence.
class ShopConnectedCoordinatorHealthSignals {
  const ShopConnectedCoordinatorHealthSignals({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.internetAvailable,
    required this.cloudSyncHealthy,
    required this.backupCurrent,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final bool internetAvailable;
  final bool cloudSyncHealthy;
  final bool backupCurrent;
}

abstract interface class ShopConnectedCoordinatorHealthSignalSource {
  Future<ShopConnectedCoordinatorHealthSignals?> read({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  });
}

/// Fail-closed source used until reviewed observers are supplied.
class ShopConnectedCoordinatorHealthSignalsUnavailable
    implements ShopConnectedCoordinatorHealthSignalSource {
  const ShopConnectedCoordinatorHealthSignalsUnavailable();

  @override
  Future<ShopConnectedCoordinatorHealthSignals?> read({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  }) async => null;
}

/// Conservative local health projection for one exact coordinator scope.
class ShopConnectedCoordinatorHealthProvider
    implements CoordinatorHealthProvider {
  ShopConnectedCoordinatorHealthProvider({
    required this.database,
    required this.sharedWrites,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required this.signals,
  }) : _workspaceId = _requireId(workspaceId, 'workspaceId'),
       _siteId = _requireId(siteId, 'siteId'),
       _coordinatorDeviceId = _requireId(
         coordinatorDeviceId,
         'coordinatorDeviceId',
       );

  final ShopDatabase database;
  final ShopConnectedSharedWriteGate sharedWrites;
  final String _workspaceId;
  final String _siteId;
  final String _coordinatorDeviceId;
  final ShopConnectedCoordinatorHealthSignalSource signals;

  @override
  Future<CoordinatorHealthV1> readHealth() async {
    final conflictRow = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_site_conflicts conflict '
          'JOIN shop_site_commands command ON command.command_id = conflict.command_id '
          "WHERE command.tenant_id = ? AND command.site_id = ? AND conflict.state = 'pending'",
          variables: [Variable(_workspaceId), Variable(_siteId)],
        )
        .getSingle();

    ShopConnectedCoordinatorHealthSignals? observed;
    try {
      observed = await signals.read(
        workspaceId: _workspaceId,
        siteId: _siteId,
        coordinatorDeviceId: _coordinatorDeviceId,
      );
    } on Object {
      observed = null;
    }
    if (observed != null &&
        (observed.workspaceId != _workspaceId ||
            observed.siteId != _siteId ||
            observed.coordinatorDeviceId != _coordinatorDeviceId)) {
      throw StateError('connected_coordinator_health_scope_mismatch');
    }

    return CoordinatorHealthV1(
      sharedWritesAvailable: sharedWrites.sharedWritesAvailable,
      internetAvailable: observed?.internetAvailable ?? false,
      cloudSyncHealthy:
          (observed?.internetAvailable ?? false) &&
          (observed?.cloudSyncHealthy ?? false),
      backupCurrent: observed?.backupCurrent ?? false,
      pendingConflictCount: conflictRow.read<int>('total'),
    );
  }

  static String _requireId(String value, String name) {
    final normalized = value.trim();
    if (normalized.isEmpty || normalized != value || normalized.length > 128) {
      throw ArgumentError.value(value, name, 'invalid connected-site id');
    }
    return normalized;
  }
}
