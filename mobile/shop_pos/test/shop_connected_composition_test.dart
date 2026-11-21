import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_connected_application_boundary.dart';
import 'package:supermega_shop/shop_connected_composition.dart';
import 'package:supermega_shop/shop_connected_coordinator_host.dart';
import 'package:supermega_shop/shop_connected_coordinator_health.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_enrollment_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_connected_trusted_time_authority.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
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
          transportFactory: (context) {
            observedGate = context.sharedWrites;
            transport.gate = context.sharedWrites;
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
        transportFactory: (context) {
          transport.gate = context.sharedWrites;
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

  test(
    'standard coordinator transport binds scope and one state graph',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      await database.verifyReadyForUse();
      final now = DateTime.utc(2026, 11, 2, 12);
      final enrollment = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => now.millisecondsSinceEpoch,
      );
      final writes = ShopConnectedSharedWriteGate();
      final verifiedTime = _VerifiedTime(now);
      final trustedTimeAuthority = _TrustedTimeAuthority();
      final dependencies = ShopConnectedCoordinatorServerDependencies(
        pairingResponse: CoordinatorPairingV1(
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          certificateSha256: 'b' * 64,
          address: '192.168.1.10',
          port: 8443,
          nonce: 'pairing-nonce-1234567890',
          issuedAt: now.subtract(const Duration(seconds: 10)).toIso8601String(),
          expiresAt: now.add(const Duration(minutes: 2)).toIso8601String(),
        ),
        leaseVerifier: const ShopOfflineStaffLeaseVerifier(),
        timeAuthority: verifiedTime,
        trustedTimeAuthority: trustedTimeAuthority,
        healthSignals: const ShopConnectedCoordinatorHealthSignalsUnavailable(),
      );
      final transport = dependencies.build(
        ShopConnectedCoordinatorTransportContext(
          database: database,
          enrollment: enrollment,
          sharedWrites: writes,
        ),
      );
      expect(transport, isA<SiteCoordinatorServerTransport>());
      final standard = transport as SiteCoordinatorServerTransport;
      expect(standard.sharedWrites, same(writes));
      expect(standard.enrollment, same(enrollment));
      expect(standard.server.sharedWriteAvailability, same(writes));
      expect(standard.server.trustedTimeV2Enabled, isTrue);
      expect(standard.server.trustedTimeAuthority, same(trustedTimeAuthority));
      final health =
          standard.server.health as ShopConnectedCoordinatorHealthProvider;
      expect(health.database, same(database));
      expect(health.sharedWrites, same(writes));
      expect((await health.readHealth()).sharedWritesAvailable, isFalse);
      await writes.resume();
      expect((await health.readHealth()).sharedWritesAvailable, isTrue);

      final tls = ConnectedEphemeralTlsIdentity(
        certificatePem: Uint8List.fromList([1]),
        privateKeyPem: Uint8List.fromList([2]),
        certificateFingerprintSha256: 'b' * 64,
      );
      await expectLater(
        standard.prepare(
          bindAddress: '192.168.1.10',
          workspaceId: 'other-workspace',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          identity: _identity(),
          tlsIdentity: tls,
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_transport_runtime_scope_mismatch',
          ),
        ),
      );
      expect(await _pairingNonceCount(database), 0);
      expect(verifiedTime.reads, 0);

      final protectedIdentity = _identity(alias: 'protected-key-slot');
      await standard.prepare(
        bindAddress: '192.168.1.10',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'coordinator-1',
        identity: protectedIdentity,
        tlsIdentity: tls,
      );
      expect(await _pairingNonceCount(database), 1);
      expect(verifiedTime.reads, 1);
      await expectLater(
        standard.start(
          bindAddress: '192.168.1.10',
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          identity: _identity(alias: 'substituted-key-slot'),
          tlsIdentity: tls,
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_transport_not_prepared',
          ),
        ),
      );
      await standard.stop();
      await standard.prepare(
        bindAddress: '192.168.1.10',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'coordinator-1',
        identity: protectedIdentity,
        tlsIdentity: tls,
      );
      expect(await _pairingNonceCount(database), 1);
      expect(verifiedTime.reads, 2);
      await standard.stop();
      tls.dispose();
    },
  );

  test(
    'standard transport fails before nonce when time is unavailable',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      await database.verifyReadyForUse();
      final now = DateTime.utc(2026, 11, 2, 12);
      final enrollment = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => now.millisecondsSinceEpoch,
      );
      final writes = ShopConnectedSharedWriteGate();
      final time = _VerifiedTime(now, unavailable: true);
      final transport =
          ShopConnectedCoordinatorServerDependencies(
            pairingResponse: CoordinatorPairingV1(
              workspaceId: 'workspace-1',
              siteId: 'site-1',
              coordinatorDeviceId: 'coordinator-1',
              certificateSha256: 'b' * 64,
              address: '192.168.1.10',
              port: 8443,
              nonce: 'pairing-nonce-1234567890',
              issuedAt: now
                  .subtract(const Duration(seconds: 10))
                  .toIso8601String(),
              expiresAt: now.add(const Duration(minutes: 2)).toIso8601String(),
            ),
            leaseVerifier: const ShopOfflineStaffLeaseVerifier(),
            timeAuthority: time,
            trustedTimeAuthority:
                const UnavailableConnectedTrustedTimeCoordinatorAuthority(),
            healthSignals:
                const ShopConnectedCoordinatorHealthSignalsUnavailable(),
          ).build(
            ShopConnectedCoordinatorTransportContext(
              database: database,
              enrollment: enrollment,
              sharedWrites: writes,
            ),
          );
      final tls = ConnectedEphemeralTlsIdentity(
        certificatePem: Uint8List.fromList([1]),
        privateKeyPem: Uint8List.fromList([2]),
        certificateFingerprintSha256: 'b' * 64,
      );
      addTearDown(tls.dispose);

      await expectLater(
        transport.prepare(
          bindAddress: '192.168.1.10',
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          identity: _identity(alias: 'protected-key-slot'),
          tlsIdentity: tls,
        ),
        throwsA(_state('connected_trusted_time_unavailable')),
      );
      expect(time.reads, 1);
      expect(await _pairingNonceCount(database), 0);
    },
  );

  test(
    'standard coordinator rejects a cafe store on another database',
    () async {
      final foreignDatabase = ShopDatabase(NativeDatabase.memory());
      final foreignCafeStore = ShopCafeOrderStore(foreignDatabase);
      await foreignDatabase.close();

      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      await database.verifyReadyForUse();
      final now = DateTime.utc(2026, 11, 2, 12);
      final enrollment = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => now.millisecondsSinceEpoch,
      );
      final dependencies = ShopConnectedCoordinatorServerDependencies(
        pairingResponse: CoordinatorPairingV1(
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          certificateSha256: 'b' * 64,
          address: '192.168.1.10',
          port: 8443,
          nonce: 'pairing-nonce-1234567890',
          issuedAt: now.subtract(const Duration(seconds: 10)).toIso8601String(),
          expiresAt: now.add(const Duration(minutes: 2)).toIso8601String(),
        ),
        leaseVerifier: const ShopOfflineStaffLeaseVerifier(),
        timeAuthority: const ShopConnectedSiteTimeUnavailable(),
        trustedTimeAuthority:
            const UnavailableConnectedTrustedTimeCoordinatorAuthority(),
        healthSignals: const ShopConnectedCoordinatorHealthSignalsUnavailable(),
        cafeStore: foreignCafeStore,
      );
      expect(
        () => dependencies.build(
          ShopConnectedCoordinatorTransportContext(
            database: database,
            enrollment: enrollment,
            sharedWrites: ShopConnectedSharedWriteGate(),
          ),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_transport_cafe_database_mismatch',
          ),
        ),
      );
      expect(await _pairingNonceCount(database), 0);
    },
  );
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

ConnectedPlatformIdentity _identity({
  String keyId = 'key-1',
  String alias = 'coordinator-1',
}) {
  final publicKey = Uint8List.fromList(
    List<int>.generate(32, (index) => index),
  );
  return ConnectedPlatformIdentity(
    alias: alias,
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
  Future<void> prepare({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {}

  @override
  Future<void> start({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
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

class _VerifiedTime implements ShopConnectedSiteCoordinatorTimeAuthority {
  _VerifiedTime(this.now, {this.unavailable = false});

  final DateTime now;
  final bool unavailable;
  int reads = 0;

  @override
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  }) async {
    reads += 1;
    if (tenantId != 'workspace-1' || siteId != 'site-1') {
      throw StateError('connected_trusted_time_scope_mismatch');
    }
    if (unavailable) {
      throw StateError('connected_trusted_time_unavailable');
    }
    return now.millisecondsSinceEpoch;
  }
}

class _TrustedTimeAuthority
    implements ConnectedTrustedTimeCoordinatorAuthority {
  @override
  Future<ConnectedTrustedTimeObservationV1> observe(
    ConnectedTrustedTimeObservationRequestV1 request,
  ) async => ConnectedTrustedTimeObservationV1(
    challenge: request.challenge,
    authorityKeyId: 'trusted-time-key-1',
    authorityKeyFingerprint: '8' * 64,
    authorityKeyGeneration: 1,
    authorityEpoch: 1,
    authoritySequence: 1,
    observedAtMillis: 1800000000000,
    validUntilMillis: 1800000060000,
    authoritySignature: 'A' * 86,
  );
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

Future<int> _pairingNonceCount(ShopDatabase database) async =>
    (await database
            .customSelect(
              'SELECT count(*) AS count FROM shop_site_pairing_nonces',
            )
            .getSingle())
        .read<int>('count');

Matcher _state(String message) =>
    isA<StateError>().having((error) => error.message, 'message', message);
