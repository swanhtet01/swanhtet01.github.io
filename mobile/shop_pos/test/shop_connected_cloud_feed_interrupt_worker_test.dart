import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_database.dart';

const _digestA =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _digestB =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const _digestC =
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

void main() {
  final phase = Platform.environment['SUPERMEGA_CLOUD_FEED_INTERRUPT_PHASE'];
  final path = Platform.environment['SUPERMEGA_CLOUD_FEED_INTERRUPT_DATABASE'];
  final marker = Platform.environment['SUPERMEGA_CLOUD_FEED_INTERRUPT_MARKER'];
  test(
    'synthetic authenticated cloud page process interruption',
    () async {
      if (!const {
            'kill_after_insert',
            'kill_after_commit',
            'verify_rollback',
            'verify_commit',
          }.contains(phase) ||
          path == null ||
          marker == null) {
        fail('Cloud-feed interruption environment is invalid.');
      }
      final file = File(path);
      final keyPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 7));
      final publicKey = await keyPair.extractPublicKey();
      final pins = {'issuer-1': publicKey.bytes};
      const expected = ConnectedSiteRetailFeedExpectation(
        workspaceId: 'workspace-a',
        siteId: 'site-a',
        actorId: 'actor-a',
        deviceId: 'device-a',
        authorityGeneration: 2,
        revocationGeneration: 3,
        authorityPayloadDigest: _digestA,
        leaseDigest: _digestB,
        requestDigest: _digestC,
        afterSequence: 0,
        priorEventDigest: null,
        limit: 64,
      );
      final pagePayload = <String, Object?>{
        'contract': 'supermega.connected-site-retail-feed.v1',
        'protocolVersion': 1,
        'workspaceId': expected.workspaceId,
        'siteId': expected.siteId,
        'actorId': expected.actorId,
        'deviceId': expected.deviceId,
        'authorityGeneration': expected.authorityGeneration,
        'revocationGeneration': expected.revocationGeneration,
        'authorityPayloadDigest': expected.authorityPayloadDigest,
        'leaseDigest': expected.leaseDigest,
        'requestDigest': expected.requestDigest,
        'afterSequence': 0,
        'priorEventDigest': null,
        'headers': [
          {'sequence': 1, 'eventDigest': _digestA, 'previousEventDigest': null},
        ],
        'projections': <Object>[],
        'nextSequence': 1,
        'nextEventDigest': _digestA,
        'hasMore': false,
      };
      final pageDigest = connectedSiteSha256(pagePayload);
      final pageJson = canonicalConnectedSiteJson({
        ...pagePayload,
        'pageDigest': pageDigest,
      });
      final proofPayload = <String, Object?>{
        'contract': 'supermega.connected-cloud-feed-proof.v1',
        'protocolVersion': 1,
        'issuerKeyId': 'issuer-1',
        'issuedAtMillis': 1000,
        'expiresAtMillis': 2000,
        'workspaceId': expected.workspaceId,
        'siteId': expected.siteId,
        'actorId': expected.actorId,
        'actorRole': 'manager',
        'deviceId': expected.deviceId,
        'authorityGeneration': expected.authorityGeneration,
        'revocationGeneration': expected.revocationGeneration,
        'authorityPayloadDigest': expected.authorityPayloadDigest,
        'leaseDigest': expected.leaseDigest,
        'requestDigest': expected.requestDigest,
        'requestNonce': _digestB,
        'afterSequence': 0,
        'priorEventDigest': null,
        'nextSequence': 1,
        'nextEventDigest': _digestA,
        'pageDigest': pageDigest,
      };
      final signature = await Ed25519().sign(
        utf8.encode(canonicalConnectedSiteJson(proofPayload)),
        keyPair: keyPair,
      );
      final proofJson = canonicalConnectedSiteJson({
        ...proofPayload,
        'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
      });
      final database = ShopDatabase.testOnlyWithCloudFeedPins(
        executor: NativeDatabase(file),
        trustedIssuerKeys: pins,
      );
      try {
        await database.verifyReadyForUse();
        Future<void> apply({Future<void> Function()? afterInsert}) =>
            database.testOnlyApplyConnectedCloudFeedPageV40(
              expected: expected,
              actorRole: 'manager',
              requestNonce: _digestB,
              pageJson: pageJson,
              proofJson: proofJson,
              trustedNowMillis: 1500,
              testOnlyAfterPageInsert: afterInsert,
            );
        if (phase == 'kill_after_insert') {
          await apply(
            afterInsert: () async {
              File(marker).writeAsStringSync('page-inserted-not-committed');
              await Completer<void>().future;
            },
          );
          fail('The parent did not interrupt the open transaction.');
        }
        if (phase == 'kill_after_commit') {
          await apply();
          File(marker).writeAsStringSync('page-committed-before-reply');
          await Completer<void>().future;
          fail('The parent did not interrupt the committed worker.');
        }
        ShopBackup.verifySnapshot(
          file,
          expectedSchemaVersion: 40,
          testOnlyCloudFeedPinnedKeys: pins,
        );
        final before = await database
            .customSelect(
              'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
            )
            .getSingle();
        expect(before.read<int>('total'), phase == 'verify_rollback' ? 0 : 1);
        await apply();
        await apply();
        final after = await database
            .customSelect(
              'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
            )
            .getSingle();
        expect(after.read<int>('total'), 1);
        final head = await database
            .customSelect(
              'SELECT next_sequence, next_event_digest FROM shop_connected_cloud_feed_heads',
            )
            .getSingle();
        expect(head.read<int>('next_sequence'), 1);
        expect(head.read<String>('next_event_digest'), _digestA);
      } finally {
        await database.close();
      }
      ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 40,
        testOnlyCloudFeedPinnedKeys: pins,
      );
    },
    skip: phase == null ? 'Run only through the interruption harness.' : false,
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
