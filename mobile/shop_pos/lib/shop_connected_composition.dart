import 'package:drift/drift.dart';

import 'shop_cafe_order_contract.dart';
import 'shop_cafe_order_store.dart';
import 'shop_connected_application_boundary.dart';
import 'shop_connected_coordinator_host.dart';
import 'shop_connected_coordinator_health.dart';
import 'shop_connected_platform_security.dart';
import 'shop_connected_runtime.dart';
import 'shop_connected_site_authority_store.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_database_adapter.dart';
import 'shop_connected_site_enrollment_store.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_connected_site_reconciliation_store.dart';
import 'shop_connected_trusted_time_authority.dart';
import 'shop_database.dart';
import 'shop_offline_staff_lease.dart';
import 'shop_runtime_profile.dart';
import 'shop_site_coordinator.dart';

typedef ShopConnectedCoordinatorTransportFactory =
    ConnectedCoordinatorTransport Function(
      ShopConnectedCoordinatorTransportContext context,
    );

/// The exact stateful boundaries owned by the composition root.
///
/// A transport factory receives these instances instead of discovering or
/// constructing alternatives. This keeps request authentication, commands,
/// replication and runtime lifecycle on one database, enrollment store and
/// shared-write gate.
class ShopConnectedCoordinatorTransportContext {
  const ShopConnectedCoordinatorTransportContext({
    required this.database,
    required this.enrollment,
    required this.sharedWrites,
  });

  final ShopDatabase database;
  final ShopConnectedSiteEnrollmentStore enrollment;
  final ShopConnectedSharedWriteGate sharedWrites;
}

/// Explicit authorities and projections needed to construct the reviewed LAN
/// coordinator server. None has an ambient or permissive default.
class ShopConnectedCoordinatorServerDependencies {
  const ShopConnectedCoordinatorServerDependencies({
    required this.pairingResponse,
    required this.leaseVerifier,
    required this.timeAuthority,
    required this.trustedTimeAuthority,
    required this.healthSignals,
    this.stationReadPolicy = const CoordinatorStationReadPolicyUnavailable(),
    this.cafeStore,
    this.cafeModifierCatalog = const {},
  });

  final CoordinatorPairingV1 pairingResponse;
  final ShopOfflineStaffLeaseVerifier leaseVerifier;
  final ShopConnectedSiteCoordinatorTimeAuthority timeAuthority;
  final ConnectedTrustedTimeCoordinatorAuthority trustedTimeAuthority;
  final ShopConnectedCoordinatorHealthSignalSource healthSignals;
  final CoordinatorStationReadPolicy stationReadPolicy;
  final ShopCafeOrderStore? cafeStore;
  final Map<String, CafeModifierSnapshot> cafeModifierCatalog;

  ConnectedCoordinatorTransport build(
    ShopConnectedCoordinatorTransportContext context,
  ) {
    if (!identical(context.enrollment.database, context.database)) {
      throw StateError('connected_transport_enrollment_database_mismatch');
    }
    if (cafeStore != null &&
        !identical(cafeStore!.database, context.database)) {
      throw StateError('connected_transport_cafe_database_mismatch');
    }
    Future<int> verifiedNowMillis() => timeAuthority.readValidatedNowMillis(
      tenantId: pairingResponse.workspaceId,
      siteId: pairingResponse.siteId,
    );
    Future<DateTime> verifiedNow() async => DateTime.fromMillisecondsSinceEpoch(
      await verifiedNowMillis(),
      isUtc: true,
    );
    final requestAuthenticator = Ed25519CoordinatorRequestAuthenticator(
      clients: context.enrollment,
      nonces: context.enrollment,
      now: verifiedNow,
    );
    final commandSignatureVerifier = Ed25519SiteCommandSignatureVerifier(
      clients: context.enrollment,
      coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
    );
    final siteAuthorization = OfflineLeaseCoordinatorSiteAuthorizer(
      leases: ShopConnectedSiteLeaseSource(context.enrollment),
      verifier: leaseVerifier,
      stationReadPolicy: stationReadPolicy,
      nowMillis: verifiedNowMillis,
    );
    final commands = ShopConnectedSiteDatabaseCommandHandler(
      database: context.database,
      timeAuthority: timeAuthority,
      cafeStore: cafeStore,
      cafeModifierCatalog: cafeModifierCatalog,
      connectedSiteEnabled: true,
    );
    final replication = ShopConnectedSiteDatabaseReplicationReader(
      database: context.database,
      workspaceId: pairingResponse.workspaceId,
      siteId: pairingResponse.siteId,
    );
    final health = ShopConnectedCoordinatorHealthProvider(
      database: context.database,
      sharedWrites: context.sharedWrites,
      workspaceId: pairingResponse.workspaceId,
      siteId: pairingResponse.siteId,
      coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
      signals: healthSignals,
    );
    final server = SiteCoordinatorServer(
      pairing: context.enrollment,
      requestAuthenticator: requestAuthenticator,
      commands: commands,
      replication: replication,
      health: health,
      pairingResponse: pairingResponse,
      sharedWriteAvailability: context.sharedWrites,
      commandSignatureVerifier: commandSignatureVerifier,
      deviceEnrollment: context.enrollment,
      siteAuthorization: siteAuthorization,
      commandCapabilities: const ShopConnectedSiteDatabaseCapabilityResolver(),
      trustedTimeAuthority: trustedTimeAuthority,
      now: verifiedNow,
      runtimeEnabled: true,
      trustedTimeV2Enabled: true,
    );
    return SiteCoordinatorServerTransport(
      server: server,
      enrollment: context.enrollment,
      sharedWrites: context.sharedWrites,
      now: verifiedNow,
    );
  }
}

/// Explicit dependencies for the still-default-off connected-site runtime.
///
/// Nothing in this object discovers credentials, endpoints, platform keys, or
/// listeners. A future reviewed application mount must supply every authority
/// and platform boundary explicitly.
class ShopConnectedEnabledDependencies {
  const ShopConnectedEnabledDependencies({
    required this.database,
    required this.cloudBaseUri,
    required this.cloudExecutor,
    required this.cloudAuthorityVerifier,
    required this.payloadVerifier,
    required this.platformSecurity,
    required this.platformLifecycle,
    required this.transportFactory,
    required this.now,
  });

  final ShopDatabase database;
  final Uri cloudBaseUri;
  final ConnectedSiteAuthenticatedRequestExecutor cloudExecutor;
  final ConnectedSiteCloudAuthorityVerifier cloudAuthorityVerifier;
  final ConnectedSiteAuthorityPayloadVerifier payloadVerifier;
  final ConnectedPlatformSecurity platformSecurity;
  final ConnectedCoordinatorPlatformLifecycle platformLifecycle;
  final ShopConnectedCoordinatorTransportFactory transportFactory;
  final DateTime Function() now;
}

/// Source-level composition receipt for one connected runtime.
///
/// Shipping profiles remain disabled and return only a network-silent
/// application boundary. Enabled composition is intentionally not mounted in
/// `main.dart`; it exists so the complete dependency graph can be tested before
/// real issuer, key-custody, installed-device, and release evidence is ready.
class ShopConnectedComposition {
  const ShopConnectedComposition._({
    required this.boundary,
    this.reconciliation,
  });

  final ShopConnectedApplicationBoundary boundary;
  final ShopConnectedReconciliationRuntime? reconciliation;

  bool get enabled => reconciliation != null;

  static ShopConnectedComposition resolve({
    required ShopRuntimeCapabilities capabilities,
    ShopConnectedEnabledDependencies Function()? enabledDependencies,
  }) {
    if (!capabilities.connectedSite) {
      return ShopConnectedComposition._(
        boundary: ShopConnectedApplicationBoundary(capabilities: capabilities),
      );
    }
    if (enabledDependencies == null) {
      return ShopConnectedComposition._(
        boundary: ShopConnectedApplicationBoundary(capabilities: capabilities),
      );
    }

    final dependencies = enabledDependencies();
    final now = dependencies.now;
    int nowMillis() => now().toUtc().millisecondsSinceEpoch;
    final sharedWrites = ShopConnectedSharedWriteGate();
    final payloadStore = ShopConnectedSiteAuthorityPayloadStore(
      database: dependencies.database,
      nowMillis: nowMillis,
      verifier: dependencies.payloadVerifier,
      runtimeEnabled: true,
    );
    final receiptStore = ShopConnectedSiteVerifiedAuthorityReceiptStore(
      payloadStore: payloadStore,
    );
    final cloud = ConnectedSiteCloudWireClient(
      baseUri: dependencies.cloudBaseUri,
      executor: dependencies.cloudExecutor,
      authorityVerifier: dependencies.cloudAuthorityVerifier,
      authorityReceiptStore: receiptStore,
      runtimeEnabled: true,
      now: now,
    );
    final enrollment = ShopConnectedSiteEnrollmentStore(
      database: dependencies.database,
      nowMillis: nowMillis,
    );
    final readiness = ShopConnectedRuntimeReadiness(
      database: dependencies.database,
      enrollment: enrollment,
      authority: cloud,
      now: now,
    );
    final sessionRegistry = ShopConnectedRuntimeSessionRegistry();
    final repository = ShopConnectedSiteReconciliationStore(
      database: dependencies.database,
      nowMillis: nowMillis,
    );
    final authorityDeltaStore = ShopConnectedSiteAuthorityDeltaStore(
      database: dependencies.database,
      nowMillis: nowMillis,
      runtimeEnabled: true,
    );
    final boundAuthority = _ShopConnectedSessionBoundAuthority(
      database: dependencies.database,
      cloud: cloud,
      sessions: sessionRegistry,
    );
    final reconciliationEngine = ConnectedSiteReconciliationEngine(
      authority: boundAuthority,
      repository: repository,
      transport: cloud,
      authorityDeltaApplier: authorityDeltaStore,
      runtimeEnabled: true,
    );
    final reconciliation = ShopConnectedReconciliationRuntime._(
      engine: reconciliationEngine,
      sharedWrites: sharedWrites,
      sessions: sessionRegistry,
    );
    final transport = dependencies.transportFactory(
      ShopConnectedCoordinatorTransportContext(
        database: dependencies.database,
        enrollment: enrollment,
        sharedWrites: sharedWrites,
      ),
    );
    final coordinator = ConnectedCoordinatorRuntimeHost(
      platform: dependencies.platformLifecycle,
      transport: transport,
      sharedWrites: sharedWrites,
    );
    final runtime = ShopConnectedRuntime(
      platformSecurity: dependencies.platformSecurity,
      readiness: readiness,
      sharedWrites: sharedWrites,
      coordinator: coordinator,
      sessionRegistry: sessionRegistry,
    );
    return ShopConnectedComposition._(
      boundary: ShopConnectedApplicationBoundary(
        capabilities: capabilities,
        runtime: runtime,
      ),
      reconciliation: reconciliation,
    );
  }
}

/// The only exposed reconciliation entry point from the composition root.
/// It requires an active runtime session and holds the shared-write gate for
/// the complete authority refresh, upload, outcome persistence, and delta
/// application transaction.
class ShopConnectedReconciliationRuntime {
  const ShopConnectedReconciliationRuntime._({
    required this._engine,
    required this._sharedWrites,
    required this._sessions,
  });

  final ConnectedSiteReconciliationEngine _engine;
  final ShopConnectedSharedWriteGate _sharedWrites;
  final ConnectedRuntimeSessionRegistry _sessions;

  Future<ConnectedSiteReconciliationResult> reconcile({
    required ConnectedSiteScope scope,
    required DateTime now,
  }) async {
    final session = _sessions.current;
    if (session == null ||
        session.workspaceId != scope.workspaceId ||
        session.siteId != scope.siteId ||
        session.coordinatorDeviceId != scope.deviceId ||
        !_sharedWrites.tryBeginSharedWrite()) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_reconciliation_runtime_unavailable',
      );
    }
    try {
      return await _engine.reconcile(scope: scope, now: now);
    } finally {
      _sharedWrites.endSharedWrite();
    }
  }
}

class _ShopConnectedSessionBoundAuthority
    implements ConnectedSiteAuthorityProvider {
  const _ShopConnectedSessionBoundAuthority({
    required this.database,
    required this.cloud,
    required this.sessions,
  });

  final ShopDatabase database;
  final ConnectedSiteSessionBoundAuthorityProvider cloud;
  final ConnectedRuntimeSessionRegistry sessions;

  @override
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope) async {
    final session = sessions.current;
    if (session == null ||
        session.workspaceId != scope.workspaceId ||
        session.siteId != scope.siteId ||
        session.coordinatorDeviceId != scope.deviceId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_reconciliation_session_unavailable',
      );
    }

    Future<int?> activeSessionGeneration() async {
      final row = await database
          .customSelect(
            'SELECT session_generation FROM shop_site_devices '
            "WHERE device_id = ? AND tenant_id = ? AND site_id = ? "
            "AND public_key_fingerprint = ? AND state = 'active'",
            variables: [
              Variable<String>(scope.deviceId),
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
              Variable<String>(session.identityFingerprint),
            ],
          )
          .getSingleOrNull();
      return row?.read<int>('session_generation');
    }

    final expectedSessionGeneration = await activeSessionGeneration();
    if (expectedSessionGeneration == null || expectedSessionGeneration < 1) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_reconciliation_session_unavailable',
      );
    }
    final state = await cloud.refreshForSession(
      scope,
      expectedSessionGeneration: expectedSessionGeneration,
    );
    if (state.sessionGeneration != expectedSessionGeneration ||
        await activeSessionGeneration() != expectedSessionGeneration) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_reconciliation_session_changed',
      );
    }
    return state;
  }
}

/// Fail-closed readiness implementation backed by the exact runtime database,
/// retained enrollment evidence, and authenticated cloud authority client.
class ShopConnectedRuntimeReadiness implements ConnectedRuntimeReadiness {
  const ShopConnectedRuntimeReadiness({
    required this.database,
    required this.enrollment,
    required this.authority,
    required this.now,
  });

  final ShopDatabase database;
  final CoordinatorDeviceEnrollmentAuthorizer enrollment;
  final ConnectedSiteSessionBoundAuthorityProvider authority;
  final DateTime Function() now;

  @override
  Future<bool> databaseReady() async {
    try {
      await database.verifyReadyForUse();
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> enrollmentApproved({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
  }) async {
    try {
      return await enrollment.stateFor(
            workspaceId: workspaceId,
            siteId: siteId,
            coordinatorDeviceId: coordinatorDeviceId,
            deviceId: coordinatorDeviceId,
            clientFingerprint: identity.publicKeyFingerprintSha256,
          ) ==
          CoordinatorDeviceEnrollmentState.approved;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<ConnectedRuntimeAuthorityState> authorityState({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
  }) async {
    try {
      Future<int?> activeSessionGeneration() async {
        final device = await database
            .customSelect(
              'SELECT session_generation FROM shop_site_devices '
              "WHERE device_id = ? AND tenant_id = ? AND site_id = ? "
              "AND public_key_fingerprint = ? AND state = 'active'",
              variables: [
                Variable<String>(coordinatorDeviceId),
                Variable<String>(workspaceId),
                Variable<String>(siteId),
                Variable<String>(identity.publicKeyFingerprintSha256),
              ],
            )
            .getSingleOrNull();
        return device?.read<int>('session_generation');
      }

      final expectedSessionGeneration = await activeSessionGeneration();
      if (expectedSessionGeneration == null || expectedSessionGeneration < 1) {
        return ConnectedRuntimeAuthorityState.unavailable;
      }
      final state = await authority.refreshForSession(
        ConnectedSiteScope(
          workspaceId: workspaceId,
          siteId: siteId,
          deviceId: coordinatorDeviceId,
        ),
        expectedSessionGeneration: expectedSessionGeneration,
      );
      if (state.scope.workspaceId != workspaceId ||
          state.scope.siteId != siteId ||
          state.scope.deviceId != coordinatorDeviceId) {
        return ConnectedRuntimeAuthorityState.unavailable;
      }
      final retainedSessionGeneration = await activeSessionGeneration();
      if (retainedSessionGeneration != expectedSessionGeneration ||
          state.sessionGeneration != expectedSessionGeneration) {
        return ConnectedRuntimeAuthorityState.unavailable;
      }
      final instant = now().toUtc();
      if (!state.active) return ConnectedRuntimeAuthorityState.revoked;
      if (instant.isBefore(state.observedAt.toUtc()) ||
          !instant.isBefore(state.expiresAt.toUtc())) {
        return ConnectedRuntimeAuthorityState.expired;
      }
      return ConnectedRuntimeAuthorityState.active;
    } catch (_) {
      return ConnectedRuntimeAuthorityState.unavailable;
    }
  }
}
