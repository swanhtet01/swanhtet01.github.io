import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';
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
    final executor = _Executor();

    final composition = ShopConnectedComposition.resolve(
      capabilities: _enabledCapabilities,
      enabledDependencies: () {
        factoryCalls += 1;
        return ShopConnectedEnabledDependencies(
          database: database,
          cloudBaseUri: Uri.parse('https://cloud.invalid'),
          cloudExecutor: executor,
          cloudAuthorityVerifier:
              const UnavailableConnectedSiteCloudAuthorityVerifier(),
          payloadVerifier:
              const ConnectedSiteAuthorityPayloadVerificationUnavailable(),
          platformSecurity: _Security(_identity(keyId: 'wrong-key')),
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
    expect(observedGate != null, isTrue);
    expect(observedGate!.sharedWritesAvailable, isFalse);
    expect(() => (composition as dynamic).cloud, throwsNoSuchMethodError);
    expect(
      () => (composition as dynamic).sharedWrites,
      throwsNoSuchMethodError,
    );
    expect(() => (composition as dynamic).readiness, throwsNoSuchMethodError);
    expect(() => (composition as dynamic).runtime, throwsNoSuchMethodError);
    expect(() => (composition as dynamic).coordinator, throwsNoSuchMethodError);
    expect(
      () => (composition.boundary as dynamic).runtime,
      throwsNoSuchMethodError,
    );
    await composition.boundary.initialize();
    expect(composition.boundary.state, ConnectedApplicationState.ready);
    await expectLater(
      composition.reconciliation!.reconcile(
        scope: ConnectedSiteScope(
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          deviceId: 'coordinator-1',
        ),
        now: DateTime.utc(2026, 11, 2),
      ),
      throwsA(
        isA<ConnectedSiteReconciliationException>().having(
          (error) => error.code,
          'code',
          'connected_site_reconciliation_runtime_unavailable',
        ),
      ),
    );
    expect(executor.calls, 0);
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
          'connected_runtime_identity_mismatch',
        ),
      ),
    );
    expect(composition.boundary.state, ConnectedApplicationState.failed);
    expect(executor.calls, 0);
    expect(await _authorityRowCount(database), 0);
    expect(transport.starts, 0);
    expect(transport.stops, 0);
  });

  test('pending enrollment prevents cloud and authority retention', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final executor = _Executor();
    final transport = _Transport();
    final composition = ShopConnectedComposition.resolve(
      capabilities: _enabledCapabilities,
      enabledDependencies: () => ShopConnectedEnabledDependencies(
        database: database,
        cloudBaseUri: Uri.parse('https://cloud.invalid'),
        cloudExecutor: executor,
        cloudAuthorityVerifier:
            const UnavailableConnectedSiteCloudAuthorityVerifier(),
        payloadVerifier:
            const ConnectedSiteAuthorityPayloadVerificationUnavailable(),
        platformSecurity: _Security(_identity()),
        platformLifecycle:
            const UnavailableConnectedCoordinatorPlatformLifecycle(),
        transportFactory: (gate) {
          transport.gate = gate;
          return transport;
        },
        now: () => DateTime.utc(2026, 11, 2),
      ),
    );
    await composition.boundary.initialize();

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
          'connected_runtime_enrollment_unapproved',
        ),
      ),
    );

    expect(executor.calls, 0);
    expect(await _authorityRowCount(database), 0);
    expect(transport.starts, 0);
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
    await _seedDevice(database);

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
    authority.expiresAt = DateTime.utc(2026, 11, 2, 13);
    authority.sessionGeneration = 2;
    expect(
      await _authorityState(readiness),
      ConnectedRuntimeAuthorityState.unavailable,
    );
    authority.sessionGeneration = 1;
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
  identity: _identity(),
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

ConnectedPlatformIdentity _identity({String keyId = 'key-1'}) {
  final publicKey = Uint8List.fromList(
    List<int>.generate(32, (index) => index),
  );
  return ConnectedPlatformIdentity(
    alias: 'coordinator-1',
    keyId: keyId,
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

class _Security implements ConnectedPlatformSecurity {
  _Security(this.identity);

  final ConnectedPlatformIdentity identity;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async => identity;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('unexpected_platform_security_call');
}

class _Executor implements ConnectedSiteAuthenticatedRequestExecutor {
  int calls = 0;

  @override
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  }) async {
    calls += 1;
    throw StateError('unexpected_cloud_call');
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

class _Authority implements ConnectedSiteSessionBoundAuthorityProvider {
  bool active = true;
  int sessionGeneration = 1;
  DateTime observedAt = DateTime.utc(2026, 11, 2, 11);
  DateTime expiresAt = DateTime.utc(2026, 11, 2, 13);
  Object? failure;
  ConnectedSiteScope? returnedScope;

  @override
  Future<ConnectedSiteAuthorityState> refreshForSession(
    ConnectedSiteScope scope, {
    required int expectedSessionGeneration,
  }) async {
    final error = failure;
    if (error != null) throw error;
    return ConnectedSiteAuthorityState(
      scope: returnedScope ?? scope,
      active: active,
      sessionGeneration: sessionGeneration,
      authorityGeneration: 1,
      authorityPayloadDigest: 'a' * 64,
      revocationGeneration: 0,
      observedAt: observedAt,
      expiresAt: expiresAt,
    );
  }
}

Future<void> _seedDevice(ShopDatabase database) async {
  await database.verifyReadyForUse();
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, ?, 'active', ?)",
    variables: [
      Variable<String>('coordinator-1'),
      Variable<String>('workspace-1'),
      Variable<String>('site-1'),
      Variable<String>(_identity().publicKeyFingerprintSha256),
      const Variable<int>(1),
      Variable<int>(DateTime.utc(2026, 11, 2, 11).millisecondsSinceEpoch),
    ],
  );
}

Future<int> _authorityRowCount(ShopDatabase database) async {
  final payloads = await database
      .customSelect(
        'SELECT count(*) AS count FROM shop_site_authority_payloads',
      )
      .getSingle();
  final checkpoints = await database
      .customSelect(
        'SELECT count(*) AS count FROM shop_site_authority_checkpoints',
      )
      .getSingle();
  return payloads.read<int>('count') + checkpoints.read<int>('count');
}
