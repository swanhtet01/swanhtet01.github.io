import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_client.dart';
import 'package:supermega_shop/shop_connected_site_client_composition.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

void main() {
  final clock = DateTime.utc(2026, 11, 2, 12);

  test('disabled composition is dependency and network silent', () {
    var dependenciesLoaded = false;
    final composition = ShopConnectedSiteClientComposition.resolve(
      connectedSiteEnabled: false,
      dependencies: () {
        dependenciesLoaded = true;
        throw StateError('must not load');
      },
    );

    expect(composition.enabled, isFalse);
    expect(composition.runtime, isNull);
    expect(dependenciesLoaded, isFalse);
  });

  test('binds one database and applies authenticated snapshot', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);

    final composition = fixture.compose();
    await composition.runtime!.synchronizeOnce();

    expect(fixture.transport.calls, 1);
    expect(await composition.runtime!.continuationCursor(), 0);
    expect(await composition.runtime!.sharedWritesPaused(), isFalse);
    expect(
      await fixture.database
          .customSelect('SELECT COUNT(*) AS n FROM shop_sales')
          .getSingle()
          .then((row) => row.read<int>('n')),
      0,
    );
  });

  test('binding substitution is rejected before network I/O', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final composition = fixture.compose(
      pairing: fixture.pairing(address: '192.168.1.99'),
    );

    await expectLater(
      composition.runtime!.synchronizeOnce(),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          'connected_client_binding_substituted',
        ),
      ),
    );
    expect(fixture.transport.calls, 0);
  });

  test('rebootstrap refuses the same client key before network I/O', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final runtime = fixture.compose().runtime!;
    await expectLater(runtime.rebootstrapFrom(runtime), throwsStateError);
    expect(fixture.transport.calls, 0);
  });

  test('substituted composition pauses an existing replica', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final approved = fixture.compose().runtime!;
    await approved.synchronizeOnce();
    final substituted = fixture
        .compose(pairing: fixture.pairing(address: '192.168.1.99'))
        .runtime!;

    await expectLater(substituted.synchronizeOnce(), throwsStateError);
    expect(await substituted.sharedWritesPaused(), isTrue);
    expect(fixture.transport.calls, 1);
  });

  test('coordinator failure pauses an existing replica', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final composition = fixture.compose();
    await composition.runtime!.synchronizeOnce();
    fixture.transport.fail = true;

    await expectLater(
      composition.runtime!.synchronizeOnce(),
      throwsA(isA<ConnectedSiteTransportException>()),
    );
    expect(await composition.runtime!.sharedWritesPaused(), isTrue);
  });

  test('revocation before fetch pauses an existing replica', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final runtime = fixture.compose().runtime!;
    await runtime.synchronizeOnce();
    await fixture.revoke();

    await expectLater(runtime.synchronizeOnce(), throwsStateError);
    expect(await runtime.sharedWritesPaused(), isTrue);
    expect(fixture.transport.calls, 1);
  });

  test('revocation between fetch and apply pauses without applying', () async {
    final fixture = await _Fixture.create(clock);
    addTearDown(fixture.database.close);
    final runtime = fixture.compose().runtime!;
    await runtime.synchronizeOnce();
    fixture.transport.beforeResponse = fixture.revoke;

    await expectLater(runtime.synchronizeOnce(), throwsStateError);
    expect(await runtime.sharedWritesPaused(), isTrue);
    expect(await runtime.continuationCursor(), 0);
  });
}

class _Fixture {
  _Fixture({
    required this.database,
    required this.clock,
    required this.identity,
    required this.keyPair,
    required this.fingerprint,
    required this.bindingDigest,
    required this.transport,
  });

  final ShopDatabase database;
  final DateTime clock;
  final ConnectedPlatformIdentity identity;
  final SimpleKeyPair keyPair;
  final String fingerprint;
  final String bindingDigest;
  final _Transport transport;

  static Future<_Fixture> create(DateTime clock) async {
    final database = ShopDatabase(NativeDatabase.memory());
    final keyPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => index + 1),
    );
    final publicKey = (await keyPair.extractPublicKey()).bytes;
    final fingerprint = crypto.sha256.convert(publicKey).toString();
    final identity = ConnectedPlatformIdentity(
      alias: 'platform-alias',
      keyId: 'native-key-id',
      algorithm: 'ed25519',
      publicKeyBase64: base64Encode(publicKey),
      publicKeyFingerprintSha256: fingerprint,
      tlsCertificateFingerprintSha256: 'b' * 64,
      sealedTlsMaterialId: 'sealed-tls-id',
    );
    final evidencePayload = <String, Object>{
      'schema': 'supermega.shop.owner-enrollment-evidence.v1',
      'action': 'approve',
      'tenantId': 'workspace_1',
      'siteId': 'site_1',
      'coordinatorDeviceId': 'coordinator_1',
      'deviceId': 'device_1',
      'clientFingerprint': fingerprint,
      'sessionGeneration': 1,
      'observedAtMillis': clock
          .subtract(const Duration(minutes: 2))
          .millisecondsSinceEpoch,
      'authorityKeyId': 'owner_authority_1',
    };
    final evidenceDigest = connectedSiteSha256(evidencePayload);
    final evidence = {
      ...evidencePayload,
      'signature': 'E' * 86,
      'evidenceDigest': evidenceDigest,
    };
    final observed = clock
        .subtract(const Duration(minutes: 2))
        .millisecondsSinceEpoch;
    await database.transaction(() async {
      await database.customStatement(
        'INSERT INTO shop_site_pairing_nonces (nonce, tenant_id, site_id, coordinator_device_id, issued_at_millis, expires_at_millis, consumed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          'pairing_nonce_abcdefghijklmnop',
          'workspace_1',
          'site_1',
          'coordinator_1',
          observed - 1000,
          observed + 60000,
          observed,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_pending_enrollments (client_fingerprint, nonce, tenant_id, site_id, coordinator_device_id, public_key, key_algorithm, observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          fingerprint,
          'pairing_nonce_abcdefghijklmnop',
          'workspace_1',
          'site_1',
          'coordinator_1',
          publicKey,
          'ed25519',
          observed,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_devices (device_id, tenant_id, site_id, public_key_fingerprint, session_generation, state, enrolled_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          'device_1',
          'workspace_1',
          'site_1',
          fingerprint,
          1,
          'active',
          observed,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_enrollment_evidence (evidence_digest, action, tenant_id, site_id, coordinator_device_id, device_id, client_fingerprint, session_generation, observed_at_millis, authority_key_id, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          evidenceDigest,
          'approve',
          'workspace_1',
          'site_1',
          'coordinator_1',
          'device_1',
          fingerprint,
          1,
          observed,
          'owner_authority_1',
          canonicalConnectedSiteJson(evidence),
        ],
      );
    });
    final approval = ConnectedCoordinatorApprovalV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      pairingDigest: '1' * 64,
      enrollmentEvidenceDigest: evidenceDigest,
      clientDeviceId: 'device_1',
      clientFingerprint: fingerprint,
      clientSigningKeyId: fingerprint,
      address: '192.168.1.2',
      port: 9443,
      certificateSha256: '4' * 64,
      approvalGeneration: 1,
      issuedAtMillis: clock
          .subtract(const Duration(minutes: 1))
          .millisecondsSinceEpoch,
      expiresAtMillis: clock
          .add(const Duration(days: 6))
          .millisecondsSinceEpoch,
      authorityKeyId: 'authority_1',
      authoritySignature: 'A' * 86,
    );
    final store = ShopConnectedSiteAttemptStore(
      database: database,
      approvalVerifier: const _ApprovalVerifier(),
      runtimeEnabled: true,
      now: () => clock,
    );
    final bindingDigest = await store.importApproval(approval);
    return _Fixture(
      database: database,
      clock: clock,
      identity: identity,
      keyPair: keyPair,
      fingerprint: fingerprint,
      bindingDigest: bindingDigest,
      transport: _Transport(_snapshot()),
    );
  }

  CoordinatorPairingV1 pairing({String address = '192.168.1.2'}) =>
      CoordinatorPairingV1(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        coordinatorDeviceId: 'coordinator_1',
        certificateSha256: '4' * 64,
        address: address,
        port: 9443,
        nonce: 'pairing_nonce_abcdefghijklmnop',
        issuedAt: clock.subtract(const Duration(minutes: 1)).toIso8601String(),
        expiresAt: clock.add(const Duration(minutes: 4)).toIso8601String(),
      );

  ShopConnectedSiteClientComposition compose({CoordinatorPairingV1? pairing}) =>
      ShopConnectedSiteClientComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () => ShopConnectedSiteClientDependencies(
          database: database,
          pairing: pairing ?? this.pairing(),
          approvedBindingDigest: bindingDigest,
          deviceId: 'device_1',
          identity: identity,
          platformSecurity: _Security(identity, keyPair),
          approvalVerifier: const _ApprovalVerifier(),
          transport: transport,
          now: () => clock,
          nonce: () => 'request_nonce_abcdefghijklmnop',
        ),
      );

  Future<void> revoke() async {
    transport.beforeResponse = null;
    final store = ShopConnectedSiteAttemptStore(
      database: database,
      approvalVerifier: const _ApprovalVerifier(),
      runtimeEnabled: true,
      now: () => clock,
    );
    await store.revoke(
      ConnectedCoordinatorRevocationV1(
        targetBindingDigest: bindingDigest,
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientDeviceId: 'device_1',
        approvalGeneration: 2,
        issuedAtMillis: clock.millisecondsSinceEpoch,
        authorityKeyId: 'authority_1',
        authoritySignature: 'A' * 86,
      ),
    );
  }
}

class _ApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _ApprovalVerifier();

  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async => authorityKeyId == 'authority_1' && signature == 'A' * 86;
}

class _Security extends UnavailableConnectedPlatformSecurity {
  const _Security(this.identity, this.keyPair);
  final ConnectedPlatformIdentity identity;
  final SimpleKeyPair keyPair;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async {
    if (alias != identity.alias) {
      throw const ConnectedPlatformSecurityException('identity_missing');
    }
    return identity;
  }

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async => Uint8List.fromList(
    (await Ed25519().sign(payload, keyPair: keyPair)).bytes,
  );
}

class _Transport implements ConnectedSiteHttpTransport {
  _Transport(this.snapshot);
  final SiteSnapshotV1 snapshot;
  int calls = 0;
  bool fail = false;
  Future<void> Function()? beforeResponse;

  @override
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  }) async {
    calls += 1;
    if (fail) {
      throw const ConnectedSiteTransportException(
        'transport_failed',
        ambiguous: true,
      );
    }
    await beforeResponse?.call();
    if (method != 'GET' || certificateSha256 != '4' * 64) {
      throw const ConnectedSiteTransportException('unexpected_request');
    }
    final Object payload;
    if (uri.path == connectedSiteSnapshotPath) {
      payload = snapshot.toJson();
    } else if (uri.path == connectedSiteDeltaPath &&
        uri.queryParameters['after'] == '0') {
      payload = SiteDeltaV1(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        afterCursor: 0,
        nextCursor: 0,
        events: const [],
      ).toJson();
    } else {
      throw const ConnectedSiteTransportException('unexpected_request');
    }
    return ConnectedSiteHttpResponse(
      statusCode: 200,
      contentType: 'application/json',
      body: Uint8List.fromList(
        utf8.encode(canonicalConnectedSiteJson(payload)),
      ),
    );
  }
}

SiteSnapshotV1 _snapshot() {
  final projections = <String, Object?>{
    'schema': 'supermega.shop.connected-site-projections.v2',
    'aggregates': <Object?>[],
    'cafeOrders': <Object?>[],
    'stockReservations': <Object?>[],
    'conflicts': <Object?>[],
  };
  final unsigned = <String, Object?>{
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': 'workspace_1',
    'siteId': 'site_1',
    'version': 1,
    'continuationCursor': 0,
    'projections': projections,
  };
  return SiteSnapshotV1(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    version: 1,
    continuationCursor: 0,
    projections: projections,
    checkpointDigest: connectedSiteSha256(unsigned),
  );
}
