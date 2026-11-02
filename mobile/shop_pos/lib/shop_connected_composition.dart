import 'shop_connected_application_boundary.dart';
import 'shop_connected_coordinator_host.dart';
import 'shop_connected_platform_security.dart';
import 'shop_connected_runtime.dart';
import 'shop_connected_site_authority_store.dart';
import 'shop_connected_site_enrollment_store.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_connected_site_reconciliation_store.dart';
import 'shop_database.dart';
import 'shop_runtime_profile.dart';
import 'shop_site_coordinator.dart';

typedef ShopConnectedCoordinatorTransportFactory =
    ConnectedCoordinatorTransport Function(
      ShopConnectedSharedWriteGate sharedWrites,
    );

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
    this.runtime,
    this.readiness,
    this.sharedWrites,
    this.cloud,
    this.reconciliation,
    this.coordinator,
  });

  final ShopConnectedApplicationBoundary boundary;
  final ShopConnectedRuntime? runtime;
  final ShopConnectedRuntimeReadiness? readiness;
  final ShopConnectedSharedWriteGate? sharedWrites;
  final ConnectedSiteCloudWireClient? cloud;
  final ConnectedSiteReconciliationEngine? reconciliation;
  final ConnectedCoordinatorRuntimeHost? coordinator;

  bool get enabled => runtime != null;

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
    final repository = ShopConnectedSiteReconciliationStore(
      database: dependencies.database,
      nowMillis: nowMillis,
    );
    final authorityDeltaStore = ShopConnectedSiteAuthorityDeltaStore(
      database: dependencies.database,
      nowMillis: nowMillis,
      runtimeEnabled: true,
    );
    final reconciliation = ConnectedSiteReconciliationEngine(
      authority: cloud,
      repository: repository,
      transport: cloud,
      authorityDeltaApplier: authorityDeltaStore,
      runtimeEnabled: true,
    );
    final transport = dependencies.transportFactory(sharedWrites);
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
    );
    return ShopConnectedComposition._(
      boundary: ShopConnectedApplicationBoundary(
        capabilities: capabilities,
        runtime: runtime,
      ),
      runtime: runtime,
      readiness: readiness,
      sharedWrites: sharedWrites,
      cloud: cloud,
      reconciliation: reconciliation,
      coordinator: coordinator,
    );
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
  final ConnectedSiteAuthorityProvider authority;
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
  }) async {
    try {
      final state = await authority.refresh(
        ConnectedSiteScope(
          workspaceId: workspaceId,
          siteId: siteId,
          deviceId: coordinatorDeviceId,
        ),
      );
      if (state.scope.workspaceId != workspaceId ||
          state.scope.siteId != siteId ||
          state.scope.deviceId != coordinatorDeviceId) {
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
