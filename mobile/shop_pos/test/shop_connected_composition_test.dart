import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_application_boundary.dart';
import 'package:supermega_shop/shop_connected_composition.dart';
import 'package:supermega_shop/shop_connected_coordinator_host.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

void main() {
  test('disabled composition never invokes dependency factory', () async {
    var factoryCalls = 0;
    final composition = ShopConnectedComposition.resolve(
      capabilities: ShopRuntimeCapabilities.production,
      enabledDependencies: () {
        factoryCalls += 1;
        throw StateError('disabled_dependency_factory_invoked');
      },
    );

    await composition.boundary.initialize();
    await composition.boundary.close();

    expect(factoryCalls, 0);
    expect(composition.enabled, isFalse);
    expect(composition.boundary.state, ConnectedApplicationState.disabled);
  });

  test('enabled composition without dependencies stays blocked', () async {
    final composition = ShopConnectedComposition.resolve(
      capabilities: _enabledCapabilities,
    );

    await composition.boundary.initialize();

    expect(composition.enabled, isFalse);
    expect(composition.boundary.state, ConnectedApplicationState.blocked);
    expect(composition.boundary.reason, 'connected_site_runtime_unavailable');
  });

  test('enabled composition shares cloud database and write gate', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    var factoryCalls = 0;
    ShopConnectedSharedWriteGate? observedGate;
    final transport = _Transport();

    final composition = ShopConnectedComposition.resolve(
      capabilities: _enabledCapabilities,
      enabledDependencies: () {
        factoryCalls += 1;
        return ShopConnectedEnabledDependencies(
          database: database,
          cloudBaseUri: Uri.parse('https://cloud.invalid'),
          cloudExecutor:
              const UnavailableConnectedSiteAuthenticatedRequestExecutor(),
          cloudAuthorityVerifier:
              const UnavailableConnectedSiteCloudAuthorityVerifier(),
          payloadVerifier:
              const ConnectedSiteAuthorityPayloadVerificationUnavailable(),
          platformSecurity: const UnavailableConnectedPlatformSecurity(),
          platformLifecycle:
              const UnavailableConnectedCoordinatorPlatformLifecycle(),
          transportFactory: (gate) {
            observedGate = gate;
            transport.gate = gate;
            return transport;
          },
          now: () => DateTime.utc(2026, 11, 2),
        );
      },
    );

    expect(factoryCalls, 1);
    expect(composition.enabled, isTrue);
    expect(observedGate, same(composition.sharedWrites));
    expect(
      composition.coordinator!.sharedWrites,
      same(composition.sharedWrites),
    );
    expect(composition.runtime!.sharedWrites, same(composition.sharedWrites));
    expect(composition.runtime!.coordinator, same(composition.coordinator));
    expect(composition.runtime!.readiness, same(composition.readiness));
    expect(composition.reconciliation!.authority, same(composition.cloud));
    expect(composition.reconciliation!.transport, same(composition.cloud));
    expect(composition.readiness!.database, same(database));
    await composition.boundary.initialize();
    expect(composition.boundary.state, ConnectedApplicationState.ready);
    await expectLater(
      composition.boundary.start(
        ConnectedRuntimeStartRequest(
          capabilities: _enabledCapabilities,
          bindAddress: '192.168.1.10',
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          identityAlias: 'coordinator-1',
          expectedIdentity: _identity(),
        ),
      ),
      throwsA(
        isA<ConnectedRuntimeException>().having(
          (error) => error.code,
          'code',
          'connected_runtime_authority_unavailable',
        ),
      ),
    );
    expect(composition.boundary.state, ConnectedApplicationState.failed);
    expect(transport.starts, 0);
    expect(transport.stops, 0);
  });

  test('readiness binds coordinator enrollment identity exactly', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final enrollment = _Enrollment();
    final authority = _Authority();
    final readiness = ShopConnectedRuntimeReadiness(
      database: database,
      enrollment: enrollment,
      authority: authority,
      now: () => DateTime.utc(2026, 11, 2, 12),
    );

    expect(await readiness.databaseReady(), isTrue);
    expect(
      await readiness.enrollmentApproved(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'coordinator-1',
        identity: _identity(),
      ),
      isTrue,
    );
    expect(enrollment.deviceId, 'coordinator-1');
    expect(enrollment.coordinatorDeviceId, 'coordinator-1');
    expect(enrollment.fingerprint, _identity().publicKeyFingerprintSha256);
  });

  test('readiness maps authority windows and failures fail closed', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final authority = _Authority();
    final readiness = ShopConnectedRuntimeReadiness(
      database: database,
      enrollment: _Enrollment(),
      authority: authority,
      now: () => DateTime.utc(2026, 11, 2, 12),
    );

    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.active,
    );
    authority.active = false;
    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.revoked,
    );
    authority.active = true;
    authority.expiresAt = DateTime.utc(2026, 11, 2, 12);
    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.expired,
    );
    authority.failure = StateError('synthetic_authority_unavailable');
    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.unavailable,
    );
    authority.failure = null;
    authority.returnedScope = ConnectedSiteScope(
      workspaceId: 'other-workspace',
      siteId: 'site-1',
      deviceId: 'coordinator-1',
    );
    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.unavailable,
    );
  });
}

Future<ConnectedRuntimeAuthorityState> _authorityState(
  ShopConnectedRuntimeReadiness readiness,
) => readiness.authorityState(
  workspaceId: 'workspace-1',
  siteId: 'site-1',
  coordinatorDeviceId: 'coordinator-1',
);

const _enabledCapabilities = ShopRuntimeCapabilities(
  managedAuth: true,
  correctionAuthorization: true,
  cashMovementAuthorization: false,
  connectedOrders: true,
  connectedSite: true,
  networkPrinter: false,
  camera: false,
  gallery: false,
  remoteImport: false,
  externalFileSaving: false,
  syntheticEvidence: true,
  loopbackPrinter: false,
);

ConnectedPlatformIdentity _identity() {
  final publicKey = Uint8List.fromList(
    List<int>.generate(32, (index) => index),
  );
  return ConnectedPlatformIdentity(
    alias: 'coordinator-1',
    keyId: 'key-1',
    algorithm: 'ed25519',
    publicKeyBase64: base64Encode(publicKey),
    publicKeyFingerprintSha256: crypto.sha256.convert(publicKey).toString(),
    tlsCertificateFingerprintSha256: 'b' * 64,
    sealedTlsMaterialId: 'tls-1',
  );
}

class _Transport implements ConnectedCoordinatorTransport {
  ShopConnectedSharedWriteGate? gate;
  int starts = 0;
  int stops = 0;

  @override
  ConnectedSharedWriteGate get sharedWrites => gate!;

  @override
  Future<void> start({
    required String bindAddress,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    starts += 1;
  }

  @override
  Future<void> stop() async {
    stops += 1;
  }
}

class _Enrollment implements CoordinatorDeviceEnrollmentAuthorizer {
  String? coordinatorDeviceId;
  String? deviceId;
  String? fingerprint;

  @override
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  }) async {
    this.coordinatorDeviceId = coordinatorDeviceId;
    this.deviceId = deviceId;
    fingerprint = clientFingerprint;
    return CoordinatorDeviceEnrollmentState.approved;
  }
}

class _Authority implements ConnectedSiteAuthorityProvider {
  bool active = true;
  DateTime observedAt = DateTime.utc(2026, 11, 2, 11);
  DateTime expiresAt = DateTime.utc(2026, 11, 2, 13);
  Object? failure;
  ConnectedSiteScope? returnedScope;

  @override
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope) async {
    final error = failure;
    if (error != null) throw error;
    return ConnectedSiteAuthorityState(
      scope: returnedScope ?? scope,
      active: active,
      sessionGeneration: 1,
      authorityGeneration: 1,
      authorityPayloadDigest: 'a' * 64,
      revocationGeneration: 0,
      observedAt: observedAt,
      expiresAt: expiresAt,
    );
  }
}
