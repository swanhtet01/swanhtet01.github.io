import 'package:drift/drift.dart';

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
    // A valid lease and unchanged membership snapshot do not keep a device
    // enrolled after a newer signed owner revocation. Read the materialized
    // enrollment state under the same SQLite writer fence as the mutation.
    final device = await database
        .customSelect(
          'SELECT state, session_generation, public_key_fingerprint, '
          'revoked_at_millis FROM shop_site_devices WHERE device_id = ? '
          'AND tenant_id = ? AND site_id = ?',
          variables: [
            Variable(enrollment.deviceId),
            Variable(enrollment.tenantId),
            Variable(enrollment.siteId),
          ],
        )
        .getSingleOrNull();
    final owner = await database
        .customSelect(
          'SELECT action, evidence_digest, session_generation FROM '
          'shop_site_enrollment_evidence WHERE device_id = ? '
          'AND tenant_id = ? AND site_id = ? '
          'ORDER BY observed_at_millis DESC LIMIT 1',
          variables: [
            Variable(enrollment.deviceId),
            Variable(enrollment.tenantId),
            Variable(enrollment.siteId),
          ],
        )
        .getSingleOrNull();
    if (device == null ||
        device.read<String>('state') != 'active' ||
        device.read<int?>('revoked_at_millis') != null ||
        device.read<int>('session_generation') !=
            enrollment.sessionGeneration ||
        device.read<String>('public_key_fingerprint') !=
            enrollment.deviceTrust.publicKeyFingerprintSha256 ||
        owner == null ||
        owner.read<String>('action') != 'approve' ||
        owner.read<String>('evidence_digest') !=
            enrollment.enrollmentEvidenceDigest ||
        owner.read<int>('session_generation') != enrollment.sessionGeneration) {
      throw StateError('Cloud-feed enrolled device is no longer current.');
    }
    await authorityStore.requireLeaseCurrent(lease);
    return now;
  }
}
