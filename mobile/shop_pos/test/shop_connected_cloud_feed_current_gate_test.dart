import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_current_gate.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_production_trust.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream_acceptance.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';

class _Platform extends UnavailableConnectedPlatformSecurity {
  _Platform(this.identity, this.key);
  final ConnectedPlatformIdentity identity;
  final SimpleKeyPair key;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async => identity;

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async =>
      Uint8List.fromList((await Ed25519().sign(payload, keyPair: key)).bytes);
}

class _Authority extends ShopConnectedSiteAuthorityPayloadStore {
  _Authority(ShopDatabase db)
    : super(database: db, nowMillis: () => 0, runtimeEnabled: true);
  bool revoked = false;
  int checks = 0;

  @override
  Future<void> requireLeaseCurrent(OfflineStaffLeaseV1 lease) async {
    checks++;
    if (revoked) throw StateError('revoked');
  }
}

class _Time implements ShopConnectedCloudFeedLiveTimeSource {
  int now = 1500;
  int monotonic = 1;
  @override
  Future<ConnectedTrustedTimeLiveReading> readLiveTime({
    required String tenantId,
    required String siteId,
  }) async {
    if (tenantId != 'tenant-1' || siteId != 'site-1') throw StateError('scope');
    return ConnectedTrustedTimeLiveReading(
      entryDigest: 'a' * 64,
      ackDigest: 'b' * 64,
      bootSessionId: 'boot-1',
      monotonicMillis: monotonic,
      effectiveTimeMillis: now,
    );
  }
}

void _competingInsertWorker(List<Object> arguments) {
  final path = arguments[0] as String;
  final reply = arguments[1] as SendPort;
  final raw = sqlite3.open(path);
  try {
    raw.execute('PRAGMA busy_timeout = 200');
    reply.send('attempting');
    raw.execute('INSERT INTO gate_probe VALUES (7)');
    reply.send(null);
  } catch (error) {
    reply.send(error.toString());
  } finally {
    raw.close();
  }
}

Future<ConnectedCloudFeedEnrolledDeviceTrust> _enrollment() async {
  final deviceKey = await Ed25519().newKeyPairFromSeed(List.filled(32, 1));
  final public = await deviceKey.extractPublicKey();
  final fingerprint = crypto.sha256.convert(public.bytes).toString();
  final identity = ConnectedPlatformIdentity(
    alias: 'device-1',
    keyId: 'device-key',
    algorithm: 'ed25519',
    publicKeyBase64: base64.encode(public.bytes),
    publicKeyFingerprintSha256: fingerprint,
    tlsCertificateFingerprintSha256: 'c' * 64,
    sealedTlsMaterialId: 'tls-1',
  );
  final ownerKey = await Ed25519().newKeyPairFromSeed(List.filled(32, 2));
  final ownerPublic = await ownerKey.extractPublicKey();
  final payload = <String, Object>{
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': 'approve',
    'tenantId': 'tenant-1',
    'siteId': 'site-1',
    'coordinatorDeviceId': 'coordinator-1',
    'deviceId': 'device-1',
    'clientFingerprint': fingerprint,
    'sessionGeneration': 1,
    'observedAtMillis': 1000,
    'authorityKeyId': 'owner-1',
  };
  final signature = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(payload)),
    keyPair: ownerKey,
  );
  final source = ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys(
    platformSecurity: _Platform(identity, deviceKey),
    issuerKeys: {'feed-1': List.filled(32, 3)},
    ownerIssuerKeys: {'owner-1': ownerPublic.bytes},
  );
  return source.loadEnrolled(
    alias: 'device-1',
    expectedSigningKeyId: 'device-key',
    expectedFingerprintSha256: fingerprint,
    canonicalEnrollmentJson: canonicalConnectedSiteJson({
      ...payload,
      'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
      'evidenceDigest': connectedSiteSha256(payload),
    }),
    enrollmentEvidenceDigest: connectedSiteSha256(payload),
    tenantId: 'tenant-1',
    siteId: 'site-1',
    coordinatorDeviceId: 'coordinator-1',
    deviceId: 'device-1',
    sessionGeneration: 1,
    trustedAtMillis: 1500,
  );
}

Future<void> _seedCurrentEnrollment(
  ShopDatabase db,
  ConnectedCloudFeedEnrolledDeviceTrust enrollment,
) async {
  await db.customStatement(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', 1000)",
    [
      enrollment.deviceId,
      enrollment.tenantId,
      enrollment.siteId,
      enrollment.deviceTrust.publicKeyFingerprintSha256,
    ],
  );
  await db.customStatement(
    'INSERT INTO shop_site_enrollment_evidence '
    '(evidence_digest, action, tenant_id, site_id, coordinator_device_id, '
    'device_id, client_fingerprint, session_generation, observed_at_millis, '
    'authority_key_id, evidence_json) '
    "VALUES (?, 'approve', ?, ?, 'coordinator-1', ?, ?, 1, 1000, 'owner-1', '{}')",
    [
      enrollment.enrollmentEvidenceDigest,
      enrollment.tenantId,
      enrollment.siteId,
      enrollment.deviceId,
      enrollment.deviceTrust.publicKeyFingerprintSha256,
    ],
  );
}

Future<OfflineStaffLeaseV1> _lease(
  SimpleKeyPair key, {
  String site = 'site-1',
  String tenant = 'tenant-1',
  String device = 'device-1',
  int session = 1,
  int issued = 1000,
  int expires = 1800,
}) async {
  String stamp(int millis) => DateTime.fromMillisecondsSinceEpoch(
    millis,
    isUtc: true,
  ).toIso8601String();
  final payload = <String, Object>{
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': 'lease-1',
    'workspaceId': tenant,
    'siteId': site,
    'actorId': 'actor-1',
    'role': 'manager',
    'capabilities': ['managementRead'],
    'deviceId': device,
    'sessionGeneration': session,
    'revocationGeneration': 0,
    'issuedAt': stamp(issued),
    'expiresAt': stamp(expires),
    'issuerKeyId': 'lease-1',
  };
  final sig = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(payload)),
    keyPair: key,
  );
  return OfflineStaffLeaseV1(
    leaseId: 'lease-1',
    workspaceId: tenant,
    siteId: site,
    actorId: 'actor-1',
    role: 'manager',
    capabilities: const ['managementRead'],
    deviceId: device,
    sessionGeneration: session,
    revocationGeneration: 0,
    issuedAt: stamp(issued),
    expiresAt: stamp(expires),
    issuerKeyId: 'lease-1',
    payloadDigest: connectedSiteSha256(payload),
    signature: base64Url.encode(sig.bytes).replaceAll('=', ''),
  );
}

void main() {
  test(
    'current lease is checked before and after mutation; failures roll back',
    () async {
      final db = ShopDatabase(NativeDatabase.memory());
      try {
        await db.customStatement(
          'CREATE TABLE gate_probe (id INTEGER NOT NULL)',
        );
        final enrolled = await _enrollment();
        await _seedCurrentEnrollment(db, enrolled);
        final key = await Ed25519().newKeyPairFromSeed(List.filled(32, 4));
        final public = await key.extractPublicKey();
        final verifier = ShopOfflineStaffLeaseVerifier(
          signatureVerifier:
              PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier(
                publicKeys: {'lease-1': public.bytes},
              ),
        );
        final authority = _Authority(db);
        final time = _Time();
        final gate = ShopConnectedCloudFeedCurrentGate(
          database: db,
          authorityStore: authority,
          leaseVerifier: verifier,
          timeSource: time,
          runtimeEnabled: true,
        );
        final lease = await _lease(key);
        Future<int> count() async =>
            (await db
                    .customSelect('SELECT COUNT(*) AS n FROM gate_probe')
                    .getSingle())
                .read<int>('n');
        await gate.run(
          enrollment: enrolled,
          lease: lease,
          mutation: () async {
            await db.customStatement('INSERT INTO gate_probe VALUES (1)');
          },
        );
        expect(await count(), 1);
        expect(authority.checks, 2);
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: await _lease(key, site: 'site-2'),
            mutation: () async =>
                db.customStatement('INSERT INTO gate_probe VALUES (2)'),
          ),
          throwsStateError,
        );
        expect(await count(), 1);
        for (final wrong in [
          await _lease(key, tenant: 'tenant-2'),
          await _lease(key, device: 'device-2'),
          await _lease(key, session: 2),
        ]) {
          await expectLater(
            gate.run(
              enrollment: enrolled,
              lease: wrong,
              mutation: () async =>
                  db.customStatement('INSERT INTO gate_probe VALUES (20)'),
            ),
            throwsStateError,
          );
        }
        expect(await count(), 1);
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: await _lease(key, issued: 1000000, expires: 1000800),
            mutation: () async =>
                db.customStatement('INSERT INTO gate_probe VALUES (21)'),
          ),
          throwsA(isA<ShopOfflineStaffLeaseException>()),
        );
        expect(await count(), 1);
        authority.revoked = true;
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: lease,
            mutation: () async =>
                db.customStatement('INSERT INTO gate_probe VALUES (3)'),
          ),
          throwsStateError,
        );
        expect(await count(), 1);
        authority.revoked = false;
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: lease,
            mutation: () async {
              await db.customStatement('INSERT INTO gate_probe VALUES (4)');
              authority.revoked = true;
            },
          ),
          throwsStateError,
        );
        expect(await count(), 1);
        authority.revoked = false;
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: lease,
            mutation: () async {
              await db.customStatement('INSERT INTO gate_probe VALUES (5)');
              time.now = 1800;
            },
          ),
          throwsA(isA<ShopOfflineStaffLeaseException>()),
        );
        expect(await count(), 1);
        time.now = 1500;
        authority.revoked = true;
        await expectLater(
          gate.run(
            enrollment: enrolled,
            lease: lease,
            mutation: () async => 42,
          ),
          throwsStateError,
        );
      } finally {
        await db.close();
      }
    },
  );

  test(
    'read-only replay holds writer fence against a second SQLite connection',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-feed-fence-');
      final file = File('${root.path}/shop.sqlite');
      final first = ShopDatabase(NativeDatabase.createInBackground(file));
      try {
        await first.customStatement(
          'CREATE TABLE gate_probe (id INTEGER NOT NULL)',
        );
        final enrolled = await _enrollment();
        await _seedCurrentEnrollment(first, enrolled);
        final key = await Ed25519().newKeyPairFromSeed(List.filled(32, 4));
        final public = await key.extractPublicKey();
        final gate = ShopConnectedCloudFeedCurrentGate(
          database: first,
          authorityStore: _Authority(first),
          leaseVerifier: ShopOfflineStaffLeaseVerifier(
            signatureVerifier:
                PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier(
                  publicKeys: {'lease-1': public.bytes},
                ),
          ),
          timeSource: _Time(),
          runtimeEnabled: true,
        );
        final inside = Completer<void>();
        final release = Completer<void>();
        final replay = gate.run(
          enrollment: enrolled,
          lease: await _lease(key),
          mutation: () async {
            inside.complete();
            await release.future;
            return 42;
          },
        );
        await inside.future;
        var competingFinished = false;
        String? competingError;
        final filePath = file.path;
        final reply = ReceivePort();
        final attempted = Completer<void>();
        final competing = Completer<void>();
        final messages = reply.listen((result) {
          if (result == 'attempting') {
            attempted.complete();
          } else {
            if (result != null) {
              competingError = '$result';
            } else {
              competingFinished = true;
            }
            competing.complete();
          }
        });
        await Isolate.spawn(_competingInsertWorker, <Object>[
          filePath,
          reply.sendPort,
        ]);
        await attempted.future;
        await Future<void>.delayed(const Duration(milliseconds: 150));
        expect(competingFinished, isFalse);
        release.complete();
        expect(await replay, 42);
        await competing.future;
        await messages.cancel();
        reply.close();
        if (!competingFinished) {
          expect(competingError, contains('database is locked'));
        }
        expect(
          (await first
                  .customSelect('SELECT COUNT(*) AS n FROM gate_probe')
                  .getSingle())
              .read<int>('n'),
          competingFinished ? 1 : 0,
        );
      } finally {
        await first.close();
        await root.delete(recursive: true);
      }
    },
  );
}
