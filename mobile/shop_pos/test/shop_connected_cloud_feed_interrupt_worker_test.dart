import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_v41_verifier.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream_acceptance.dart';
import 'package:supermega_shop/shop_database.dart';

import 'v41_cloud_feed_process_fixture.dart';

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
            'v41_kill_before_commit',
            'v41_kill_after_commit',
            'v41_verify_rollback',
            'v41_verify_commit',
          }.contains(phase) ||
          path == null ||
          marker == null) {
        fail('Cloud-feed interruption environment is invalid.');
      }
      final file = File(path);
      if (phase!.startsWith('v41_')) {
        await _runSignedV41Phase(phase, file, File(marker));
        return;
      }
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

const _v41Now = 1800000001000;

Future<void> _runSignedV41Phase(String phase, File file, File marker) async {
  final trust = await v41ProcessFixtureTrust();
  if (phase.startsWith('v41_verify_')) {
    ShopBackup.verifySnapshot(
      file,
      expectedSchemaVersion: 41,
      testOnlyCloudFeedV41Trust: trust,
    );
  }
  final database = ShopDatabase.testOnlyWithCloudFeedV41Trust(
    executor: NativeDatabase(file),
    trust: trust,
  );
  try {
    await database.verifyReadyForUse();
    final firstPage = await database
        .customSelect(
          'SELECT * FROM shop_connected_cloud_feed_pages ORDER BY after_sequence',
        )
        .get();
    expect(firstPage, isNotEmpty);
    final firstEvidence = await database
        .customSelect(
          'SELECT * FROM shop_connected_cloud_feed_page_evidence '
          'WHERE page_digest = ?',
          variables: [
            Variable<String>(firstPage.first.read<String>('page_digest')),
          ],
        )
        .get();
    expect(firstEvidence, hasLength(1));
    final request = Map<String, Object?>.from(
      jsonDecode(firstEvidence.first.read<String>('request_json')) as Map,
    );
    final page = Map<String, Object?>.from(
      jsonDecode(firstPage.first.read<String>('page_json')) as Map,
    );
    final proof = Map<String, Object?>.from(
      jsonDecode(firstPage.first.read<String>('authenticated_proof_json'))
          as Map,
    );
    final clientPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 18));
    final feedPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 23));
    Future<String> sign(
      Map<String, Object?> fields,
      SimpleKeyPair pair,
    ) async => base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(canonicalConnectedSiteJson(fields)),
            keyPair: pair,
          )).bytes,
        )
        .replaceAll('=', '');
    request.remove('signature');
    request['afterSequence'] = 1;
    request['priorEventDigest'] = 'e' * 64;
    request['requestNonce'] = '9' * 64;
    final requestJson = canonicalConnectedSiteJson({
      ...request,
      'signature': await sign(request, clientPair),
    });
    final requestDigest = connectedSiteSha256(jsonDecode(requestJson));
    page.remove('pageDigest');
    page['requestDigest'] = requestDigest;
    page['afterSequence'] = 1;
    page['priorEventDigest'] = 'e' * 64;
    page['headers'] = [
      {'sequence': 2, 'eventDigest': 'd' * 64, 'previousEventDigest': 'e' * 64},
    ];
    page['nextSequence'] = 2;
    page['nextEventDigest'] = 'd' * 64;
    final pageDigest = connectedSiteSha256(page);
    final pageJson = canonicalConnectedSiteJson({
      ...page,
      'pageDigest': pageDigest,
    });
    proof.remove('signature');
    proof['requestDigest'] = requestDigest;
    proof['requestNonce'] = '9' * 64;
    proof['afterSequence'] = 1;
    proof['priorEventDigest'] = 'e' * 64;
    proof['nextSequence'] = 2;
    proof['nextEventDigest'] = 'd' * 64;
    proof['pageDigest'] = pageDigest;
    final proofJson = canonicalConnectedSiteJson({
      ...proof,
      'signature': await sign(proof, feedPair),
    });
    final expected = ConnectedSiteRetailFeedExpectation(
      workspaceId: trust.workspaceId,
      siteId: trust.siteId,
      actorId: trust.actorId,
      deviceId: trust.deviceId,
      authorityGeneration: trust.authoritySequence,
      revocationGeneration: trust.revocationGeneration,
      authorityPayloadDigest: request['authorityPayloadDigest'] as String,
      leaseDigest: request['leaseDigest'] as String,
      requestDigest: requestDigest,
      afterSequence: 1,
      priorEventDigest: 'e' * 64,
      limit: 64,
    );
    final evidence = ShopCloudFeedV41FirstPageEvidence(
      requestJson: requestJson,
      cloudKeyApprovalJson: firstEvidence.first.read<String>(
        'cloud_key_approval_json',
      ),
      enrollmentEvidenceDigest: firstEvidence.first.read<String>(
        'enrollment_evidence_digest',
      ),
      timeEntryDigest: firstEvidence.first.read<String>('time_entry_digest'),
      timeAckDigest: firstEvidence.first.read<String>('time_ack_digest'),
      timeHeadDigest: firstEvidence.first.read<String>('time_head_digest'),
      bootSessionId: firstEvidence.first.read<String>('boot_session_id'),
      sampleMonotonicMillis: 8001,
    );
    Future<void> append({Future<void> Function()? beforeCommit}) =>
        database.testOnlyApplyConnectedCloudFeedSecondPageV41(
          trust: trust,
          timeAuthority: _V41ProcessTime(
            evidence,
            phase == 'v41_verify_commit',
          ),
          expected: expected,
          actorRole: 'manager',
          requestNonce: '9' * 64,
          pageJson: pageJson,
          proofJson: proofJson,
          evidence: evidence,
          testOnlyBeforeCommit: beforeCommit,
        );
    if (phase == 'v41_kill_before_commit') {
      await append(
        beforeCommit: () async {
          marker.writeAsStringSync('v41-page-two-uncommitted', flush: true);
          await Completer<void>().future;
        },
      );
      fail('Parent did not interrupt the v41 transaction.');
    }
    if (phase == 'v41_kill_after_commit') {
      await append();
      marker.writeAsStringSync(
        'v41-page-two-committed-before-reply',
        flush: true,
      );
      await Completer<void>().future;
      fail('Parent did not interrupt the committed v41 worker.');
    }
    final before = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
        )
        .getSingle();
    final priorCount = phase == 'v41_verify_rollback' ? 1 : 2;
    expect(before.read<int>('total'), priorCount);
    final priorEvidence = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_page_evidence',
        )
        .getSingle();
    expect(priorEvidence.read<int>('total'), priorCount);
    final priorHead = await database
        .customSelect(
          'SELECT next_sequence FROM shop_connected_cloud_feed_heads',
        )
        .getSingle();
    expect(priorHead.read<int>('next_sequence'), priorCount);
    await append();
    await append();
    final after = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_pages',
        )
        .getSingle();
    expect(after.read<int>('total'), 2);
    final evidenceCount = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_page_evidence',
        )
        .getSingle();
    expect(evidenceCount.read<int>('total'), 2);
    final head = await database
        .customSelect(
          'SELECT next_sequence, next_event_digest FROM shop_connected_cloud_feed_heads',
        )
        .getSingle();
    expect(head.read<int>('next_sequence'), 2);
    expect(head.read<String>('next_event_digest'), 'd' * 64);
  } finally {
    await database.close();
  }
  ShopBackup.verifySnapshot(
    file,
    expectedSchemaVersion: 41,
    testOnlyCloudFeedV41Trust: trust,
  );
}

final class _V41ProcessTime implements ShopConnectedCloudFeedLiveTimeSource {
  _V41ProcessTime(this.evidence, this.replay) : _reads = 0;

  final ShopCloudFeedV41FirstPageEvidence evidence;
  final bool replay;
  int _reads;

  @override
  Future<ConnectedTrustedTimeLiveReading> readLiveTime({
    required String tenantId,
    required String siteId,
  }) async {
    if (tenantId != 'workspace_v41_fixture' || siteId != 'site_v41_fixture') {
      throw StateError('v41 process fixture time scope changed');
    }
    final advance = replay ? 2 : 0;
    final reading = ConnectedTrustedTimeLiveReading(
      entryDigest: evidence.timeEntryDigest,
      ackDigest: evidence.timeAckDigest,
      bootSessionId: evidence.bootSessionId,
      monotonicMillis: 8001 + advance + _reads,
      effectiveTimeMillis: _v41Now + 1 + advance + _reads,
    );
    _reads++;
    return reading;
  }
}
