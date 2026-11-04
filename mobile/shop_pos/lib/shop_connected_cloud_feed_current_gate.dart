import 'shop_connected_cloud_feed_production_trust.dart';
import 'shop_connected_site_authority_store.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_stream_acceptance.dart';
import 'shop_database.dart';
import 'shop_offline_staff_lease.dart';
import 'shop_staff_authorization.dart';

/// Source-level transaction fence, not a production feed writer. Product
/// composition remains disabled until protected issuer pins, current device
/// custody and nonempty restore have independent approval.
final class ShopConnectedCloudFeedCurrentGate {
  const ShopConnectedCloudFeedCurrentGate({
    required this.database,
    required this.authorityStore,
    required this.leaseVerifier,
    required this.timeSource,
    this.runtimeEnabled = false,
  });

  final ShopDatabase database;
  final ShopConnectedSiteAuthorityPayloadStore authorityStore;
  final ShopOfflineStaffLeaseVerifier leaseVerifier;
  final ShopConnectedCloudFeedLiveTimeSource timeSource;
  final bool runtimeEnabled;

  /// Executes [mutation] and both current-authority checks under the same
  /// SQLite transaction. A replay path must also enter here before returning.
  Future<T> run<T>({
    required ConnectedCloudFeedEnrolledDeviceTrust enrollment,
    required OfflineStaffLeaseV1 lease,
    required Future<T> Function() mutation,
  }) async {
    if (!runtimeEnabled) {
      throw StateError('Cloud-feed current authority gate disabled.');
    }
    if (!identical(authorityStore.database, database) ||
        lease.tenantId != enrollment.tenantId ||
        lease.siteId != enrollment.siteId ||
        lease.deviceId != enrollment.deviceId ||
        lease.sessionGeneration != enrollment.sessionGeneration ||
        !const {'owner', 'manager'}.contains(lease.role)) {
      throw StateError('Cloud-feed enrolled session changed.');
    }
    return database.transaction(() async {
      // SQLite's deferred read transaction is insufficient for a read-only
      // replay: a second connection could commit revocation after our check.
      // Start the writer transaction before any authority read. The false
      // predicate changes no row and fires no feed-head trigger.
      await database.customUpdate(
        'UPDATE shop_connected_cloud_feed_heads '
        'SET restore_paused = restore_paused WHERE 0',
      );
      final first = await _recheck(enrollment, lease);
      final result = await mutation();
      final last = await _recheck(enrollment, lease);
      if (last.bootSessionId != first.bootSessionId ||
          last.monotonicMillis < first.monotonicMillis ||
          last.effectiveTimeMillis < first.effectiveTimeMillis) {
        throw StateError('Cloud-feed trusted time regressed.');
      }
      return result;
    });
  }

  Future<ConnectedTrustedTimeLiveReading> _recheck(
    ConnectedCloudFeedEnrolledDeviceTrust enrollment,
    OfflineStaffLeaseV1 lease,
  ) async {
    final now = await timeSource.readLiveTime(
      tenantId: enrollment.tenantId,
      siteId: enrollment.siteId,
    );
    if (now.effectiveTimeMillis <= 0 ||
        now.monotonicMillis < 0 ||
        now.bootSessionId.isEmpty ||
        now.entryDigest.isEmpty ||
        now.ackDigest.isEmpty) {
      throw StateError('Cloud-feed validated time unavailable.');
    }
    await leaseVerifier.verify(
      lease: lease,
      expected: ShopOfflineStaffLeaseExpectedBinding(
        tenantId: enrollment.tenantId,
        siteId: enrollment.siteId,
        deviceId: enrollment.deviceId,
        sessionGeneration: enrollment.sessionGeneration,
        revocationGeneration: lease.revocationGeneration,
        requiredCapability: ShopStaffCapability.managementRead,
      ),
      nowMillis: now.effectiveTimeMillis,
    );
    await authorityStore.requireLeaseCurrent(lease);
    return now;
  }
}
