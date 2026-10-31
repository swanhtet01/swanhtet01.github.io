import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_database.dart';

/// Persists authenticated authority observations without pretending that the
/// digest-only delta contains membership roles or configuration payloads.
class ShopConnectedSiteAuthorityDeltaStore
    implements ConnectedSiteAuthorityDeltaApplier {
  const ShopConnectedSiteAuthorityDeltaStore({
    required this.database,
    required this.nowMillis,
    this.runtimeEnabled = false,
  });

  final ShopDatabase database;
  final int Function() nowMillis;
  final bool runtimeEnabled;

  @override
  Future<void> apply(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityDelta delta,
  ) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_delta_disabled',
      );
    }
    if (scope.workspaceId != delta.workspaceId ||
        scope.siteId != delta.siteId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_delta_scope_mismatch',
      );
    }
    await database.verifyConnectedAuthorityEvidence();
    await database.transaction(() async {
      final device = await database
          .customSelect(
            'SELECT 1 FROM shop_site_devices WHERE device_id = ? '
            "AND tenant_id = ? AND site_id = ? AND state = 'active'",
            variables: [
              Variable<String>(scope.deviceId),
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      if (device == null) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_device_unbound',
        );
      }
      final latest = await database
          .customSelect(
            'SELECT * FROM shop_site_authority_deltas '
            'WHERE tenant_id = ? AND site_id = ? '
            'ORDER BY observation_sequence DESC LIMIT 1',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      final json = shopConnectedAuthorityDeltaJsonV27(
        tenantId: delta.workspaceId,
        siteId: delta.siteId,
        revocationGeneration: delta.revocationGeneration,
        membershipDigest: delta.membershipDigest,
        configurationVersion: delta.configurationVersion,
        configurationDigest: delta.configurationDigest,
      );
      final canonicalJson = canonicalConnectedSiteJson(json);
      final digest = connectedSiteSha256(json);
      if (latest != null) {
        final oldRevocation = latest.read<int>('revocation_generation');
        final oldConfiguration = latest.read<int>('configuration_version');
        if (delta.revocationGeneration < oldRevocation ||
            delta.configurationVersion < oldConfiguration ||
            (delta.revocationGeneration == oldRevocation &&
                delta.membershipDigest !=
                    latest.read<String>('membership_digest')) ||
            (delta.configurationVersion == oldConfiguration &&
                delta.configurationDigest !=
                    latest.read<String>('configuration_digest'))) {
          throw const ConnectedSiteReconciliationException(
            'connected_site_authority_delta_regressed',
          );
        }
        if (delta.revocationGeneration == oldRevocation &&
            delta.configurationVersion == oldConfiguration) {
          if (latest.read<String>('delta_json') != canonicalJson ||
              latest.read<String>('delta_digest') != digest) {
            throw const ConnectedSiteReconciliationException(
              'connected_site_authority_delta_changed_replay',
            );
          }
          return;
        }
      }
      final observedAt = nowMillis();
      if (observedAt < 1 ||
          (latest != null &&
              observedAt <= latest.read<int>('observed_at_millis'))) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_time_invalid',
        );
      }
      final currentRevocation = await database
          .customSelect(
            'SELECT generation FROM shop_site_revocation_observations '
            'WHERE tenant_id = ? AND site_id = ?',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      if (currentRevocation != null &&
          currentRevocation.read<int>('generation') >
              delta.revocationGeneration) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_revocation_stale',
        );
      }
      final sequence = latest == null
          ? 1
          : latest.read<int>('observation_sequence') + 1;
      await database.customStatement(
        'INSERT INTO shop_site_authority_deltas ('
        'tenant_id, site_id, observation_sequence, revocation_generation, '
        'membership_digest, configuration_version, configuration_digest, '
        'delta_json, delta_digest, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          scope.workspaceId,
          scope.siteId,
          sequence,
          delta.revocationGeneration,
          delta.membershipDigest,
          delta.configurationVersion,
          delta.configurationDigest,
          canonicalJson,
          digest,
          observedAt,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_revocation_observations ('
        'tenant_id, site_id, generation, observed_at_millis, source_digest) '
        'VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, site_id) DO UPDATE SET '
        'generation = excluded.generation, '
        'observed_at_millis = excluded.observed_at_millis, '
        'source_digest = excluded.source_digest',
        [
          scope.workspaceId,
          scope.siteId,
          delta.revocationGeneration,
          observedAt,
          digest,
        ],
      );
      await database.verifyConnectedAuthorityEvidence();
    });
  }
}
