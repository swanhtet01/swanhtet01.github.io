import 'dart:async';
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
  test('v41 open and backup share exact page evidence coverage', () {
    const pageDigest =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    final request = canonicalConnectedSiteJson({'request': 'synthetic'});
    final approval = canonicalConnectedSiteJson({'approval': 'synthetic'});
    final requestDigest = connectedSiteSha256(jsonDecode(request));
    final page = <String, Object?>{
      'page_digest': pageDigest,
      'page_json': canonicalConnectedSiteJson({'requestDigest': requestDigest}),
    };
    final evidence = <String, Object?>{
      'page_digest': pageDigest,
      'request_json': request,
      'request_digest': requestDigest,
      'cloud_key_approval_json': approval,
      'cloud_key_approval_digest': connectedSiteSha256(jsonDecode(approval)),
    };
    bool covers(
      List<Map<String, Object?>> pages,
      List<Map<String, Object?>> rows,
    ) =>
        shopConnectedCloudFeedEvidenceCoverageV41(pages: pages, evidence: rows);
    expect(covers([], []), isTrue);
    expect(covers([page], [evidence]), isTrue);
    expect(covers([page], []), isFalse);
    expect(covers([], [evidence]), isFalse);
    expect(covers([page], [evidence, evidence]), isFalse);
    expect(covers([page, page], [evidence]), isFalse);
    final otherRequest = canonicalConnectedSiteJson({'request': 'other'});
    final otherDigest = connectedSiteSha256(jsonDecode(otherRequest));
    final otherPage = <String, Object?>{
      'page_digest': 'b' * 64,
      'page_json': canonicalConnectedSiteJson({'requestDigest': otherDigest}),
    };
    final otherEvidence = <String, Object?>{
      ...evidence,
      'page_digest': 'b' * 64,
      'request_json': otherRequest,
      'request_digest': otherDigest,
    };
    expect(covers([page, otherPage], [evidence, otherEvidence]), isTrue);
    expect(
      covers(
        [page, otherPage],
        [
          {...evidence, 'page_digest': 'b' * 64},
          {...otherEvidence, 'page_digest': pageDigest},
        ],
      ),
      isFalse,
    );
    expect(
      covers(
        [page],
        [
          {...evidence, 'request_digest': 'b' * 64},
        ],
      ),
      isFalse,
    );
    expect(
      covers(
        [page],
        [
          {
            ...evidence,
            'cloud_key_approval_json': '{ "approval": "synthetic" }',
          },
        ],
      ),
      isFalse,
    );
    expect(
      covers(
        [page],
        [
          {...evidence, 'cloud_key_approval_digest': 'b' * 64},
        ],
      ),
      isFalse,
    );
    expect(
      covers(
        [page],
        [
          {...evidence, 'request_json': '{ "request": "synthetic" }'},
        ],
      ),
      isFalse,
    );
  });

  test('unmounted v41 SQL rejects orphan, duplicate, update and delete', () {
    final definitions = shopConnectedCloudFeedSchemaDefinitionsV41();
    expect(definitions.keys, <String>{
      'shop_connected_cloud_feed_page_evidence',
      'shop_connected_cloud_feed_page_evidence_no_update',
      'shop_connected_cloud_feed_page_evidence_no_delete',
    });
    final connection = sqlite.sqlite3.openInMemory();
    addTearDown(connection.close);
    // Minimal parent keys let this SQL test enforce declared foreign keys.
    // Page-totality and cryptographic reconstruction still require the future
    // v41 open/backup verifier; these parent stubs are not signed evidence.
    for (final (table, key) in [
      ('shop_connected_cloud_feed_pages', 'page_digest'),
      ('shop_site_offline_lease_payloads', 'payload_digest'),
      ('shop_site_enrollment_evidence', 'evidence_digest'),
      ('shop_connected_time_client_entries', 'entry_digest'),
      ('shop_connected_time_client_acks', 'ack_digest'),
      ('shop_connected_time_client_heads', 'head_digest'),
    ]) {
      connection.execute('CREATE TABLE $table ($key TEXT PRIMARY KEY)');
    }
    for (final definition in definitions.values) {
      connection.execute(definition);
    }
    connection.execute('PRAGMA foreign_keys = ON');
    const digest =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const other =
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    for (final (table, key) in [
      ('shop_connected_cloud_feed_pages', 'page_digest'),
      ('shop_site_offline_lease_payloads', 'payload_digest'),
      ('shop_site_enrollment_evidence', 'evidence_digest'),
      ('shop_connected_time_client_entries', 'entry_digest'),
      ('shop_connected_time_client_acks', 'ack_digest'),
      ('shop_connected_time_client_heads', 'head_digest'),
    ]) {
      connection.execute('INSERT INTO $table ($key) VALUES (?)', [digest]);
    }
    expect(connection.select('PRAGMA foreign_keys').single.columnAt(0), 1);
    connection.execute(
      '''
      INSERT INTO shop_connected_cloud_feed_page_evidence
      (page_digest, request_json, request_digest, cloud_key_approval_json,
       cloud_key_approval_digest, lease_digest,
       authority_payload_digest, enrollment_evidence_digest,
       time_entry_digest, time_ack_digest, time_head_digest,
       boot_session_id, sample_monotonic_millis, trusted_now_millis)
      VALUES (?, '{}', ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, 100, 1800000000000)
    ''',
      [
        digest,
        other,
        digest,
        digest,
        digest,
        digest,
        digest,
        digest,
        digest,
        digest,
      ],
    );
    expect(
      () => connection.execute(
        'UPDATE shop_connected_cloud_feed_page_evidence SET trusted_now_millis = 1800000000001',
      ),
      throwsA(isA<sqlite.SqliteException>()),
    );
    expect(
      () => connection.execute(
        '''
        INSERT INTO shop_connected_cloud_feed_page_evidence
        (page_digest, request_json, request_digest, cloud_key_approval_json,
         cloud_key_approval_digest, lease_digest,
         authority_payload_digest, enrollment_evidence_digest,
         time_entry_digest, time_ack_digest, time_head_digest,
         boot_session_id, sample_monotonic_millis, trusted_now_millis)
        VALUES (?, '{}', ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, 100, 1800000000000)
      ''',
        [
          other,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
        ],
      ),
      throwsA(isA<sqlite.SqliteException>()),
    );
    expect(
      () => connection.execute(
        'DELETE FROM shop_connected_cloud_feed_page_evidence',
      ),
      throwsA(isA<sqlite.SqliteException>()),
    );
    expect(
      () => connection.execute(
        '''
        INSERT INTO shop_connected_cloud_feed_page_evidence
        (page_digest, request_json, request_digest, cloud_key_approval_json,
         cloud_key_approval_digest, lease_digest,
         authority_payload_digest, enrollment_evidence_digest,
         time_entry_digest, time_ack_digest, time_head_digest,
         boot_session_id, sample_monotonic_millis, trusted_now_millis)
        VALUES (?, '{}', ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, 100, 1800000000000)
      ''',
        [
          digest,
          other,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
          digest,
        ],
      ),
      throwsA(isA<sqlite.SqliteException>()),
    );
  });

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
      Future<void> apply(
        ShopDatabase database, {
        String? candidatePage,
        String? candidateProof,
        Future<void> Function()? afterPageInsert,
      }) => database.testOnlyApplyConnectedCloudFeedPageV40(
        expected: expected,
        actorRole: 'manager',
        requestNonce: digestB,
        pageJson: candidatePage ?? pageJson,
        proofJson: candidateProof ?? proofJson,
        trustedNowMillis: 1500,
        testOnlyAfterPageInsert: afterPageInsert,
      );
      // Hold one transaction after its page insert but before its head update
      // or commit. A second connection must not commit the same cursor.
      final contender = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(
          appliedFile,
          setup: (raw) => raw.execute('PRAGMA busy_timeout = 0'),
        ),
        trustedIssuerKeys: pins,
      );
      await contender.verifyReadyForUse();
      final changedPagePayload = <String, Object?>{
        ...unsignedPage,
        'headers': [
          {'sequence': 1, 'eventDigest': digestB, 'previousEventDigest': null},
        ],
        'nextEventDigest': digestB,
      };
      final changedPageDigest = connectedSiteSha256(changedPagePayload);
      final changedPageJson = canonicalConnectedSiteJson({
        ...changedPagePayload,
        'pageDigest': changedPageDigest,
      });
      final changedProofPayload = <String, Object?>{
        ...unsignedProof,
        'nextEventDigest': digestB,
        'pageDigest': changedPageDigest,
      };
      final changedSignature = await Ed25519().sign(
        utf8.encode(canonicalConnectedSiteJson(changedProofPayload)),
        keyPair: pair,
      );
      final changedProofJson = canonicalConnectedSiteJson({
        ...changedProofPayload,
        'signature': base64Url
            .encode(changedSignature.bytes)
            .replaceAll('=', ''),
      });
      final inserted = Completer<void>();
      final release = Completer<void>();
      final first = apply(
        applied,
        afterPageInsert: () async {
          inserted.complete();
          await release.future;
        },
      );
      try {
        await inserted.future.timeout(const Duration(seconds: 10));
        Future<bool> competingAttempt() async {
          try {
            await apply(
              contender,
              candidatePage: changedPageJson,
              candidateProof: changedProofJson,
            );
            return true;
          } on sqlite.SqliteException catch (error) {
            if (error.resultCode != 5 && error.resultCode != 6) rethrow;
            return false;
          }
        }

        expect(
          await competingAttempt().timeout(const Duration(seconds: 10)),
          isFalse,
        );
      } finally {
        release.complete();
        await first;
      }
      await expectLater(
        apply(
          contender,
          candidatePage: changedPageJson,
          candidateProof: changedProofJson,
        ),
        throwsStateError,
      );
      // A lost response is now an exact-byte replay, not another page.
      await apply(contender);
      await contender.close();
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
      final encryptedArchive = File(
        '${appliedDirectory.path}/signed-feed.backup',
      );
      const syntheticPassword = 'synthetic-v40-restore-only';
      await ShopBackup.exportEncrypted(
        database: applied,
        archive: encryptedArchive,
        password: syntheticPassword,
        scratchRoot: appliedDirectory,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      await applied.close();
      final unpinnedTarget = File(
        '${appliedDirectory.path}/unpinned-restored.sqlite',
      );
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: encryptedArchive,
          target: unpinnedTarget,
          password: syntheticPassword,
        ),
        throwsFormatException,
      );
      expect(await unpinnedTarget.exists(), isFalse);
      expect(
        await ShopBackup.restoreMarkerFor(unpinnedTarget).exists(),
        isFalse,
      );
      final wrongPinTarget = File(
        '${appliedDirectory.path}/wrong-pin-restored.sqlite',
      );
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: encryptedArchive,
          target: wrongPinTarget,
          password: syntheticPassword,
          testOnlyCloudFeedPinnedKeys: {'issuer-1': List<int>.filled(32, 0)},
        ),
        throwsFormatException,
      );
      expect(await wrongPinTarget.exists(), isFalse);
      expect(
        await ShopBackup.restoreMarkerFor(wrongPinTarget).exists(),
        isFalse,
      );
      final encryptedTarget = File(
        '${appliedDirectory.path}/encrypted-restored.sqlite',
      );
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: encryptedArchive,
        target: encryptedTarget,
        password: syntheticPassword,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      ShopBackup.verifySnapshot(
        encryptedTarget,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: pins,
      );
      final encryptedRestored = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(encryptedTarget),
        trustedIssuerKeys: pins,
      );
      await encryptedRestored.verifyReadyForUse();
      final encryptedHead = await encryptedRestored
          .customSelect(
            'SELECT next_sequence, restore_paused FROM shop_connected_cloud_feed_heads',
          )
          .getSingle();
      expect(encryptedHead.read<int>('next_sequence'), 1);
      expect(encryptedHead.read<int>('restore_paused'), 1);
      await expectLater(apply(encryptedRestored), throwsStateError);
      await encryptedRestored.close();
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

      // These two signed pages form valid retained v40 history. The v41
      // upgrader must reject them at its no-backfill guard, even when the
      // test issuer pin makes the historical v40 verifier succeed.
      final upgraded = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase(appliedFile),
        correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
        testOnlyCloudFeedPinnedKeys: pins,
      );
      await expectLater(
        upgraded.verifyReadyForUse(),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'Nonempty v40 cloud feed lacks signed request evidence.',
          ),
        ),
      );
      await upgraded.close();
      final unchangedV40 = sqlite.sqlite3.open(appliedFile.path);
      try {
        expect(
          unchangedV40.select('PRAGMA user_version').single.columnAt(0),
          40,
        );
        expect(
          unchangedV40.select(
            "SELECT name FROM sqlite_master WHERE name = 'shop_connected_cloud_feed_page_evidence'",
          ),
          isEmpty,
        );
      } finally {
        unchangedV40.close();
      }

      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-signed-reopen-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(file),
        trustedIssuerKeys: {'issuer-1': publicKey.bytes},
      );
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
    'fresh v41 has exact empty request-evidence schema and backup proof',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-fresh-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 41);
      final evidenceColumns = await database
          .customSelect(
            'PRAGMA table_info(shop_connected_cloud_feed_page_evidence)',
          )
          .get();
      expect(evidenceColumns, isNotEmpty);
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
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
    },
  );

  test(
    'genuine empty v39 upgrades to v41 without inventing feed rows',
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
      expect(database.schemaVersion, 41);
      final rows = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_streams',
          )
          .getSingle();
      expect(rows.read<int>('total'), 0);
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
    },
  );

  test('genuine empty v40 upgrades to v41 and restores empty', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-v41-upgrade-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    final legacy = ShopDatabase.testOnlyWithCloudFeedPins(
      executor: NativeDatabase(file),
      trustedIssuerKeys: {'fixture-issuer': List<int>.filled(32, 1)},
    );
    await legacy.verifyReadyForUse();
    expect(legacy.schemaVersion, 40);
    await legacy.close();
    ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40);

    final database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    expect(database.schemaVersion, 41);
    final evidence = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_page_evidence',
        )
        .getSingle();
    expect(evidence.read<int>('total'), 0);
    final archive = File('${directory.path}/empty-v41.backup');
    await ShopBackup.exportEncrypted(
      database: database,
      archive: archive,
      password: 'synthetic-v41-restore-only',
      scratchRoot: directory,
    );
    await database.close();
    ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
    final restored = File('${directory.path}/restored.sqlite');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: restored,
      password: 'synthetic-v41-restore-only',
    );
    ShopBackup.verifySnapshot(restored, expectedSchemaVersion: 41);
    final reopened = ShopDatabase(NativeDatabase(restored));
    await reopened.verifyReadyForUse();
    await reopened.close();
  });

  test('nonempty v40 cannot gain invented v41 request evidence', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v41-reject-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    final legacy = ShopDatabase.testOnlyWithCloudFeedPins(
      executor: NativeDatabase(file),
      trustedIssuerKeys: {'fixture-issuer': List<int>.filled(32, 1)},
    );
    await legacy.verifyReadyForUse();
    await legacy.close();
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
    final upgrade = ShopDatabase(NativeDatabase(file));
    await expectLater(upgrade.verifyReadyForUse(), throwsStateError);
    await upgrade.close();
    final unchanged = sqlite.sqlite3.open(file.path);
    try {
      expect(unchanged.select('PRAGMA user_version').single.columnAt(0), 40);
      expect(
        unchanged.select(
          "SELECT name FROM sqlite_master WHERE name = 'shop_connected_cloud_feed_page_evidence'",
        ),
        isEmpty,
      );
    } finally {
      unchanged.close();
    }
  });

  test('partial v41 object in genuine v40 blocks upgrade before DDL', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v41-hop-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    final legacy = ShopDatabase.testOnlyWithCloudFeedPins(
      executor: NativeDatabase(file),
      trustedIssuerKeys: {'fixture-issuer': List<int>.filled(32, 1)},
    );
    await legacy.verifyReadyForUse();
    await legacy.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute(
        shopConnectedCloudFeedSchemaDefinitionsV41()['shop_connected_cloud_feed_page_evidence']!,
      );
    } finally {
      raw.close();
    }
    final upgrade = ShopDatabase(NativeDatabase(file));
    await expectLater(upgrade.verifyReadyForUse(), throwsStateError);
    await upgrade.close();
    final unchanged = sqlite.sqlite3.open(file.path);
    try {
      expect(unchanged.select('PRAGMA user_version').single.columnAt(0), 40);
      expect(
        unchanged.select(
          "SELECT name FROM sqlite_master WHERE name = 'shop_connected_cloud_feed_page_evidence_no_update'",
        ),
        isEmpty,
      );
    } finally {
      unchanged.close();
    }
  });

  test('forged v41 request evidence fails open and backup checks', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v41-forged-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    await database.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      // A hostile file may be edited with foreign keys disabled. Verification
      // must still reject it rather than trusting declared FKs or JSON shape.
      raw.execute(
        '''
        INSERT INTO shop_connected_cloud_feed_page_evidence
        (page_digest, request_json, request_digest, cloud_key_approval_json,
         cloud_key_approval_digest, lease_digest,
         authority_payload_digest, enrollment_evidence_digest,
         time_entry_digest, time_ack_digest, time_head_digest,
         boot_session_id, sample_monotonic_millis, trusted_now_millis)
        VALUES (?, '{}', ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, 100, 1800000000000)
      ''',
        [
          'a' * 64,
          'b' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
          'a' * 64,
        ],
      );
    } finally {
      raw.close();
    }
    expect(
      () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41),
      throwsFormatException,
    );
    database = ShopDatabase(NativeDatabase(file));
    await expectLater(database.verifyReadyForUse(), throwsStateError);
    await database.close();
  });

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
