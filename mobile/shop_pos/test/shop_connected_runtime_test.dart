import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';

void main() {
  late _Security security;
  late _Readiness readiness;
  late _Writes writes;
  late _Coordinator coordinator;
  late ShopConnectedRuntime runtime;

  setUp(() {
    security = _Security();
    readiness = _Readiness();
    writes = _Writes();
    coordinator = _Coordinator();
    runtime = ShopConnectedRuntime(
      platformSecurity: security,
      readiness: readiness,
      sharedWrites: writes,
      coordinator: coordinator,
    );
  });

  test(
    'feature-off and public bind address fail closed before host start',
    () async {
      await expectLater(
        runtime.start(_request(enabled: false)),
        throwsA(_runtimeCode('connected_runtime_capability_disabled')),
      );
      expect(runtime.state, ConnectedRuntimeState.failed);
      expect(coordinator.starts, 0);
      expect(writes.reasons.last, 'connected_runtime_capability_disabled');

      runtime = ShopConnectedRuntime(
        platformSecurity: security,
        readiness: readiness,
        sharedWrites: writes,
        coordinator: coordinator,
      );
      await expectLater(
        runtime.start(_request(address: '8.8.8.8')),
        throwsA(_runtimeCode('connected_runtime_private_address_required')),
      );
      expect(coordinator.starts, 0);
    },
  );

  test('approved private runtime starts once and resumes writes', () async {
    await runtime.start(_request());
    expect(runtime.state, ConnectedRuntimeState.running);
    expect(coordinator.starts, 1);
    expect(coordinator.address, '192.168.10.4');
    expect(writes.resumes, 1);
    expect(writes.paused, isFalse);

    await expectLater(
      runtime.start(_request()),
      throwsA(_runtimeCode('connected_runtime_already_started')),
    );
  });

  test(
    'substituted identity and TLS certificate fail before writes resume',
    () async {
      security.identity = _identity(keyId: 'other-key');
      await expectLater(
        runtime.start(_request()),
        throwsA(_runtimeCode('connected_runtime_identity_mismatch')),
      );
      expect(coordinator.starts, 0);
      expect(writes.resumes, 0);

      security.identity = _identity();
      security.tlsFingerprint = 'c' * 64;
      runtime = ShopConnectedRuntime(
        platformSecurity: security,
        readiness: readiness,
        sharedWrites: writes,
        coordinator: coordinator,
      );
      await expectLater(
        runtime.start(_request()),
        throwsA(_runtimeCode('connected_runtime_tls_identity_mismatch')),
      );
      expect(security.lastTls!.isDisposed, isTrue);
      expect(coordinator.starts, 0);
    },
  );

  test(
    'lease expiry and revocation pause writes and stop without election',
    () async {
      await runtime.start(_request());
      readiness.authority = ConnectedRuntimeAuthorityState.expired;
      await expectLater(
        runtime.revalidate(),
        throwsA(_runtimeCode('connected_runtime_authority_expired')),
      );
      expect(runtime.state, ConnectedRuntimeState.paused);
      expect(writes.paused, isTrue);
      expect(coordinator.stops, 1);
      expect(security.lastTls!.isDisposed, isTrue);

      final second = ShopConnectedRuntime(
        platformSecurity: security,
        readiness: readiness..authority = ConnectedRuntimeAuthorityState.active,
        sharedWrites: writes,
        coordinator: coordinator,
      );
      await second.start(_request());
      readiness.authority = ConnectedRuntimeAuthorityState.revoked;
      await expectLater(
        second.revalidate(),
        throwsA(_runtimeCode('connected_runtime_authority_revoked')),
      );
      expect(coordinator.starts, 2);
      expect(coordinator.stops, 2);
    },
  );

  test(
    'database, enrollment and unavailable authority all fail closed',
    () async {
      readiness.database = false;
      await expectLater(
        runtime.start(_request()),
        throwsA(_runtimeCode('connected_runtime_database_unready')),
      );
      expect(security.loads, 0);

      readiness.database = true;
      readiness.enrollment = false;
      runtime = _newRuntime(security, readiness, writes, coordinator);
      await expectLater(
        runtime.start(_request()),
        throwsA(_runtimeCode('connected_runtime_enrollment_unapproved')),
      );

      readiness.enrollment = true;
      readiness.authority = ConnectedRuntimeAuthorityState.unavailable;
      runtime = _newRuntime(security, readiness, writes, coordinator);
      await expectLater(
        runtime.start(_request()),
        throwsA(_runtimeCode('connected_runtime_authority_unavailable')),
      );
      expect(coordinator.starts, 0);
    },
  );

  test('stop zeroizes TLS material and remains idempotent', () async {
    await runtime.start(_request());
    final tls = security.lastTls!;
    await runtime.stop();
    await runtime.stop();
    expect(runtime.state, ConnectedRuntimeState.stopped);
    expect(tls.isDisposed, isTrue);
    expect(coordinator.stops, 1);
    expect(writes.reasons.last, 'connected_runtime_stopped');
  });

  test('host startup failure zeroizes TLS and attempts bounded stop', () async {
    coordinator.failStart = true;
    await expectLater(
      runtime.start(_request()),
      throwsA(_runtimeCode('connected_runtime_start_failed')),
    );
    expect(runtime.state, ConnectedRuntimeState.failed);
    expect(writes.paused, isTrue);
    expect(security.lastTls!.isDisposed, isTrue);
    expect(coordinator.stops, 1);
  });

  test(
    'unconfirmed host stop remains failed and never resumes writes',
    () async {
      await runtime.start(_request());
      coordinator.failStop = true;
      await expectLater(
        runtime.stop(),
        throwsA(_runtimeCode('connected_runtime_stop_unconfirmed')),
      );
      expect(runtime.state, ConnectedRuntimeState.failed);
      expect(runtime.pauseReason, 'connected_runtime_stop_unconfirmed');
      expect(writes.paused, isTrue);
      expect(security.lastTls!.isDisposed, isTrue);
    },
  );

  test(
    'stop queued during start cannot be overtaken by late startup',
    () async {
      security.loadBarrier = Completer<void>();
      final starting = runtime.start(_request());
      await security.loadEntered.future;
      final stopping = runtime.stop();
      security.loadBarrier!.complete();
      await starting;
      await stopping;
      expect(runtime.state, ConnectedRuntimeState.stopped);
      expect(writes.paused, isTrue);
      expect(writes.reasons.last, 'connected_runtime_stopped');
      expect(coordinator.starts, 1);
      expect(coordinator.stops, 1);
    },
  );
}

ShopConnectedRuntime _newRuntime(
  _Security security,
  _Readiness readiness,
  _Writes writes,
  _Coordinator coordinator,
) => ShopConnectedRuntime(
  platformSecurity: security,
  readiness: readiness,
  sharedWrites: writes,
  coordinator: coordinator,
);

ConnectedRuntimeStartRequest _request({
  bool enabled = true,
  String address = '192.168.10.4',
}) => ConnectedRuntimeStartRequest(
  capabilities: _capabilities(connectedSite: enabled),
  bindAddress: address,
  workspaceId: 'workspace-1',
  siteId: 'site-1',
  coordinatorDeviceId: 'coordinator-1',
  identityAlias: 'coordinator-1',
  expectedIdentity: _identity(),
);

ShopRuntimeCapabilities _capabilities({required bool connectedSite}) =>
    ShopRuntimeCapabilities(
      managedAuth: false,
      correctionAuthorization: false,
      cashMovementAuthorization: false,
      connectedOrders: false,
      connectedSite: connectedSite,
      networkPrinter: false,
      camera: false,
      gallery: false,
      remoteImport: false,
      externalFileSaving: false,
      syntheticEvidence: true,
      loopbackPrinter: false,
    );

ConnectedPlatformIdentity _identity({String keyId = 'key-1'}) {
  final publicKey = Uint8List.fromList(List<int>.generate(32, (i) => i));
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

class _Security implements ConnectedPlatformSecurity {
  ConnectedPlatformIdentity identity = _identity();
  String tlsFingerprint = 'b' * 64;
  int loads = 0;
  ConnectedEphemeralTlsIdentity? lastTls;
  Completer<void> loadEntered = Completer<void>();
  Completer<void>? loadBarrier;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async {
    loads += 1;
    if (!loadEntered.isCompleted) loadEntered.complete();
    await loadBarrier?.future;
    return identity;
  }

  @override
  Future<ConnectedEphemeralTlsIdentity> openTlsIdentity({
    required String alias,
    required String sealedTlsMaterialId,
  }) async {
    return lastTls = ConnectedEphemeralTlsIdentity(
      certificatePem: Uint8List.fromList([1, 2, 3]),
      privateKeyPem: Uint8List.fromList([4, 5, 6]),
      certificateFingerprintSha256: tlsFingerprint,
    );
  }

  @override
  Future<void> deleteIdentity({required String alias}) async {}

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async => Uint8List(64);
}

class _Readiness implements ConnectedRuntimeReadiness {
  bool database = true;
  bool enrollment = true;
  ConnectedRuntimeAuthorityState authority =
      ConnectedRuntimeAuthorityState.active;

  @override
  Future<ConnectedRuntimeAuthorityState> authorityState({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  }) async => authority;

  @override
  Future<bool> databaseReady() async => database;

  @override
  Future<bool> enrollmentApproved({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
  }) async => enrollment && identity.matches(_identity());
}

class _Writes implements ConnectedSharedWriteGate {
  bool paused = true;
  int resumes = 0;
  final reasons = <String>[];

  @override
  Future<void> pause(String reason) async {
    paused = true;
    reasons.add(reason);
  }

  @override
  Future<void> resume() async {
    paused = false;
    resumes += 1;
  }
}

class _Coordinator implements ConnectedCoordinatorHost {
  int starts = 0;
  int stops = 0;
  String? address;
  bool failStart = false;
  bool failStop = false;

  @override
  Future<void> start({
    required String bindAddress,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    starts += 1;
    address = bindAddress;
    if (failStart) throw StateError('synthetic_start_failure');
  }

  @override
  Future<void> stop() async {
    stops += 1;
    if (failStop) throw StateError('synthetic_stop_failure');
  }
}

Matcher _runtimeCode(String code) => isA<ConnectedRuntimeException>().having(
  (error) => error.code,
  'code',
  code,
);
