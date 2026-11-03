import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  test(
    'retained signed page requires pinned issuer and exact cursor chain',
    () async {
      const digestA =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const digestB =
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const digestC =
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
      final stream = <String, Object?>{
        'workspace_id': 'workspace-a',
        'site_id': 'site-a',
        'actor_id': 'actor-a',
        'actor_role': 'manager',
        'device_id': 'device-a',
        'authority_generation': 2,
        'revocation_generation': 3,
        'authority_payload_digest': digestA,
        'lease_digest': digestB,
      };
      stream['stream_digest'] = connectedSiteSha256({
        'contract': 'supermega.connected-cloud-feed-stream.v1',
        'workspaceId': 'workspace-a',
        'siteId': 'site-a',
        'actorId': 'actor-a',
        'actorRole': 'manager',
        'deviceId': 'device-a',
        'authorityGeneration': 2,
        'revocationGeneration': 3,
        'authorityPayloadDigest': digestA,
        'leaseDigest': digestB,
      });
      final unsignedPage = <String, Object?>{
        'contract': 'supermega.connected-site-retail-feed.v1',
        'protocolVersion': 1,
        'workspaceId': 'workspace-a',
        'siteId': 'site-a',
        'actorId': 'actor-a',
        'deviceId': 'device-a',
        'authorityGeneration': 2,
        'revocationGeneration': 3,
        'authorityPayloadDigest': digestA,
        'leaseDigest': digestB,
        'requestDigest': digestC,
        'afterSequence': 0,
        'priorEventDigest': null,
        'headers': [
          {'sequence': 1, 'eventDigest': digestC, 'previousEventDigest': null},
        ],
        'projections': <Object>[],
        'nextSequence': 1,
        'nextEventDigest': digestC,
        'hasMore': false,
      };
      final pageDigest = connectedSiteSha256(unsignedPage);
      final pageJson = canonicalConnectedSiteJson({
        ...unsignedPage,
        'pageDigest': pageDigest,
      });
      final unsignedProof = <String, Object?>{
        'contract': 'supermega.connected-cloud-feed-proof.v1',
        'protocolVersion': 1,
        'issuerKeyId': 'issuer-1',
        'issuedAtMillis': 1000,
        'expiresAtMillis': 2000,
        'workspaceId': 'workspace-a',
        'siteId': 'site-a',
        'actorId': 'actor-a',
        'actorRole': 'manager',
        'deviceId': 'device-a',
        'authorityGeneration': 2,
        'revocationGeneration': 3,
        'authorityPayloadDigest': digestA,
        'leaseDigest': digestB,
        'requestDigest': digestC,
        'requestNonce': digestB,
        'afterSequence': 0,
        'priorEventDigest': null,
        'nextSequence': 1,
        'nextEventDigest': digestC,
        'pageDigest': pageDigest,
      };
      final pair = await Ed25519().newKeyPairFromSeed(List.filled(32, 7));
      final publicKey = await pair.extractPublicKey();
      final signed = await Ed25519().sign(
        utf8.encode(canonicalConnectedSiteJson(unsignedProof)),
        keyPair: pair,
      );
      final proofJson = canonicalConnectedSiteJson({
        ...unsignedProof,
        'signature': base64Url.encode(signed.bytes).replaceAll('=', ''),
      });
      final page = <String, Object?>{
        'stream_digest': stream['stream_digest'],
        'page_digest': pageDigest,
        'after_sequence': 0,
        'prior_event_digest': null,
        'next_sequence': 1,
        'next_event_digest': digestC,
        'page_json': pageJson,
        'request_nonce': digestB,
        'authenticated_proof_json': proofJson,
        'authenticated_proof_digest': connectedSiteSha256(
          jsonDecode(proofJson),
        ),
      };
      final head = <String, Object?>{
        'stream_digest': stream['stream_digest'],
        'next_sequence': 1,
        'next_event_digest': digestC,
        'last_page_digest': pageDigest,
        'restore_paused': 1,
      };
      bool valid({
        Map<String, Object?>? candidatePage,
        Map<String, Object?>? candidateHead,
        Map<String, List<int>> keys = const {},
      }) => shopConnectedCloudFeedRowsValidV40(
        streams: [stream],
        pages: [candidatePage ?? page],
        heads: [candidateHead ?? head],
        restoreBarriers: const [],
        trustedIssuerKeys: keys,
      );
      expect(valid(), isFalse);
      expect(valid(keys: {'issuer-1': publicKey.bytes}), isTrue);
      expect(
        valid(
          candidateHead: {...head, 'restore_paused': 0},
          keys: {'issuer-1': publicKey.bytes},
        ),
        isTrue,
      );
      final barrierPayload = {
        'contract': 'supermega.connected-cloud-feed-restore-barrier.v1',
        'streamDigest': stream['stream_digest'],
        'nextSequence': 1,
        'nextEventDigest': digestC,
        'lastPageDigest': pageDigest,
      };
      final barrier = <String, Object?>{
        'stream_digest': stream['stream_digest'],
        'barrier_digest': connectedSiteSha256(barrierPayload),
        'next_sequence': 1,
        'next_event_digest': digestC,
        'last_page_digest': pageDigest,
        'barrier_json': canonicalConnectedSiteJson(barrierPayload),
      };
      expect(
        shopConnectedCloudFeedRowsValidV40(
          streams: [stream],
          pages: [page],
          heads: [head],
          restoreBarriers: [barrier],
          trustedIssuerKeys: {'issuer-1': publicKey.bytes},
        ),
        isTrue,
      );
      expect(
        shopConnectedCloudFeedRowsValidV40(
          streams: [stream],
          pages: [page],
          heads: [
            {...head, 'restore_paused': 0},
          ],
          restoreBarriers: [barrier],
          trustedIssuerKeys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );
      expect(
        valid(
          candidateHead: {...head, 'next_sequence': 2},
          keys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );
      expect(
        valid(
          candidatePage: {...page, 'authenticated_proof_digest': digestA},
          keys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );
      expect(valid(keys: {'issuer-1': List.filled(32, 0)}), isFalse);
      expect(
        valid(
          candidatePage: {...page, 'request_nonce': digestA},
          keys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );
      expect(
        shopConnectedCloudFeedRowsValidV40(
          streams: [
            {...stream, 'workspace_id': 'other'},
          ],
          pages: [page],
          heads: [head],
          restoreBarriers: const [],
          trustedIssuerKeys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );
      expect(
        shopConnectedCloudFeedRowsValidV40(
          streams: [stream],
          pages: [
            page,
            {...page, 'stream_digest': digestA},
          ],
          heads: [head],
          restoreBarriers: const [],
          trustedIssuerKeys: {'issuer-1': publicKey.bytes},
        ),
        isFalse,
      );

      final appliedDirectory = await Directory.systemTemp.createTemp(
        'shop-v40-atomic-page-',
      );
      addTearDown(() => appliedDirectory.delete(recursive: true));
      final appliedFile = File('${appliedDirectory.path}/shop.sqlite');
      final pins = {'issuer-1': publicKey.bytes};
      final expected = ConnectedSiteRetailFeedExpectation(
        workspaceId: 'workspace-a',
        siteId: 'site-a',
        actorId: 'actor-a',
        deviceId: 'device-a',
        authorityGeneration: 2,
        revocationGeneration: 3,
        authorityPayloadDigest: digestA,
        leaseDigest: digestB,
        requestDigest: digestC,
        afterSequence: 0,
        priorEventDigest: null,
        limit: 64,
      );
      var applied = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(appliedFile),
        trustedIssuerKeys: pins,
      );
      Future<void> apply(ShopDatabase database, {String? candidateProof}) =>
          database.testOnlyApplyConnectedCloudFeedPageV40(
            expected: expected,
            actorRole: 'manager',
            requestNonce: digestB,
            pageJson: pageJson,
            proofJson: candidateProof ?? proofJson,
            trustedNowMillis: 1500,
          );
      await apply(applied);
      await apply(applied);
      final retained = await applied
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
          )
          .getSingle();
      expect(retained.read<int>('total'), 1);
      await expectLater(
        apply(
          applied,
          candidateProof: canonicalConnectedSiteJson({
            ...unsignedProof,
            'signature': base64Url
                .encode(List<int>.filled(64, 0))
                .replaceAll('=', ''),
          }),
        ),
        throwsFormatException,
      );
      await applied.close();
      ShopBackup.verifySnapshot(
        appliedFile,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      final staged = File('${appliedDirectory.path}/restored.sqlite');
      await appliedFile.copy(staged.path);
      await ShopDatabase.migrateAndVerifyRestoreFile(
        staged,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      final restored = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(staged),
        trustedIssuerKeys: pins,
      );
      await restored.verifyReadyForUse();
      final paused = await restored
          .customSelect(
            'SELECT restore_paused FROM shop_connected_cloud_feed_heads',
          )
          .getSingle();
      expect(paused.read<int>('restore_paused'), 1);
      final barrierRows = await restored
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_restore_barriers',
          )
          .getSingle();
      expect(barrierRows.read<int>('total'), 1);
      await expectLater(apply(restored), throwsStateError);
      await restored.close();
      ShopBackup.verifySnapshot(
        staged,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      applied = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(appliedFile),
        trustedIssuerKeys: pins,
      );
      await applied.verifyReadyForUse();
      await apply(applied);
      final secondUnsignedPage = <String, Object?>{
        ...unsignedPage,
        'requestDigest': digestA,
        'afterSequence': 1,
        'priorEventDigest': digestC,
        'headers': [
          {
            'sequence': 2,
            'eventDigest': digestA,
            'previousEventDigest': digestC,
          },
        ],
        'nextSequence': 2,
        'nextEventDigest': digestA,
      };
      final secondPageDigest = connectedSiteSha256(secondUnsignedPage);
      final secondPageJson = canonicalConnectedSiteJson({
        ...secondUnsignedPage,
        'pageDigest': secondPageDigest,
      });
      final secondExpected = ConnectedSiteRetailFeedExpectation(
        workspaceId: 'workspace-a',
        siteId: 'site-a',
        actorId: 'actor-a',
        deviceId: 'device-a',
        authorityGeneration: 2,
        revocationGeneration: 3,
        authorityPayloadDigest: digestA,
        leaseDigest: digestB,
        requestDigest: digestA,
        afterSequence: 1,
        priorEventDigest: digestC,
        limit: 64,
      );
      Future<void> applySecond(String nonce) async {
        final secondUnsignedProof = <String, Object?>{
          ...unsignedProof,
          'requestDigest': digestA,
          'requestNonce': nonce,
          'afterSequence': 1,
          'priorEventDigest': digestC,
          'nextSequence': 2,
          'nextEventDigest': digestA,
          'pageDigest': secondPageDigest,
        };
        final signature = await Ed25519().sign(
          utf8.encode(canonicalConnectedSiteJson(secondUnsignedProof)),
          keyPair: pair,
        );
        await applied.testOnlyApplyConnectedCloudFeedPageV40(
          expected: secondExpected,
          actorRole: 'manager',
          requestNonce: nonce,
          pageJson: secondPageJson,
          proofJson: canonicalConnectedSiteJson({
            ...secondUnsignedProof,
            'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
          }),
          trustedNowMillis: 1500,
        );
      }

      await expectLater(applySecond(digestB), throwsA(isA<Exception>()));
      var count = await applied
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
          )
          .getSingle();
      expect(count.read<int>('total'), 1);
      await applySecond(digestC);
      count = await applied
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
          )
          .getSingle();
      expect(count.read<int>('total'), 2);
      await expectLater(apply(applied), completes);
      await applied.close();
      ShopBackup.verifySnapshot(
        appliedFile,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: pins,
      );

      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-signed-reopen-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await database.close();
      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute(
          'INSERT INTO shop_connected_cloud_feed_streams '
          '(stream_digest, workspace_id, site_id, actor_id, device_id, '
          'actor_role, lease_digest, authority_payload_digest, '
          'authority_generation, revocation_generation) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            stream['stream_digest'],
            stream['workspace_id'],
            stream['site_id'],
            stream['actor_id'],
            stream['device_id'],
            stream['actor_role'],
            stream['lease_digest'],
            stream['authority_payload_digest'],
            stream['authority_generation'],
            stream['revocation_generation'],
          ],
        );
        raw.execute(
          'INSERT INTO shop_connected_cloud_feed_pages '
          '(page_digest, stream_digest, after_sequence, prior_event_digest, '
          'next_sequence, next_event_digest, page_json, request_nonce, '
          'authenticated_proof_json, authenticated_proof_digest) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            page['page_digest'],
            page['stream_digest'],
            page['after_sequence'],
            page['prior_event_digest'],
            page['next_sequence'],
            page['next_event_digest'],
            page['page_json'],
            page['request_nonce'],
            page['authenticated_proof_json'],
            page['authenticated_proof_digest'],
          ],
        );
        raw.execute(
          'INSERT INTO shop_connected_cloud_feed_heads '
          '(stream_digest, next_sequence, next_event_digest, '
          'last_page_digest, restore_paused) VALUES (?, ?, ?, ?, ?)',
          [
            head['stream_digest'],
            head['next_sequence'],
            head['next_event_digest'],
            head['last_page_digest'],
            head['restore_paused'],
          ],
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40),
        throwsFormatException,
      );
      ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: {'issuer-1': publicKey.bytes},
      );
      database = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(file),
        trustedIssuerKeys: {'issuer-1': publicKey.bytes},
      );
      await database.verifyReadyForUse();
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
    },
  );

  test(
    'fresh v40 has exact empty cloud-feed schema and backup proof',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-fresh-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 40);
      final pageColumns = await database
          .customSelect('PRAGMA table_info(shop_connected_cloud_feed_pages)')
          .get();
      expect(
        pageColumns.map((row) => row.read<String>('name')),
        containsAll(<String>{
          'page_json',
          'request_nonce',
          'authenticated_proof_json',
          'authenticated_proof_digest',
        }),
      );
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40);
    },
  );

  test(
    'genuine empty v39 upgrades to v40 without inventing feed rows',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-upgrade-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedCloudFeedSchemaDefinitionsV40(),
      );
      await database.customStatement('PRAGMA user_version = 39');
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 39);

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 40);
      final rows = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_streams',
          )
          .getSingle();
      expect(rows.read<int>('total'), 0);
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40);
    },
  );

  test(
    'unapproved cloud rows cannot open or cross backup verification',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-reject-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await database.close();
      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute(
          '''
        INSERT INTO shop_connected_cloud_feed_streams
        (stream_digest, workspace_id, site_id, actor_id, device_id,
         actor_role, lease_digest, authority_payload_digest,
         authority_generation, revocation_generation)
        VALUES (?, 'workspace-a', 'site-a', 'actor-a', 'device-a',
                'manager', ?, ?, 1, 1)
      ''',
          ['a' * 64, 'b' * 64, 'c' * 64],
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40),
        throwsFormatException,
      );
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
    },
  );

  test('relabelling v40 as v39 cannot launder new schema', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v40-branch-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    await database.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute('PRAGMA user_version = 39');
    } finally {
      raw.close();
    }
    database = ShopDatabase(NativeDatabase(file));
    await expectLater(database.verifyReadyForUse(), throwsStateError);
    await database.close();
  });
}
