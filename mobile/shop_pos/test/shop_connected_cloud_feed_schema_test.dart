import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_proof.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_read_request.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_v41_verifier.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_enrollment_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_connected_trusted_time_client_store.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  test('v41 signed historical page stays closed after later revocation', () async {
    const now = 1800000001000;
    const workspace = 'workspace_v41_fixture';
    const site = 'site_v41_fixture';
    const coordinator = 'counter_v41_fixture';
    const device = 'device_v41_fixture';
    const nonce = 'pairing_nonce_v41_fixture_0001';
    final root = await Directory.systemTemp.createTemp('shop-v41-signed-v25-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/shop.sqlite');
    final ownerPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 17));
    final clientPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 18));
    final ownerKey = (await ownerPair.extractPublicKey()).bytes;
    final clientKey = (await clientPair.extractPublicKey()).bytes;
    final fingerprint = crypto.sha256.convert(clientKey).toString();
    var clock = now;
    var database = ShopDatabase(NativeDatabase(file));
    var store = ShopConnectedSiteEnrollmentStore(
      database: database,
      nowMillis: () => clock,
    );
    await store.registerPairingNonce(
      tenantId: workspace,
      siteId: site,
      coordinatorDeviceId: coordinator,
      nonce: nonce,
      issuedAtMillis: now - 2000,
      expiresAtMillis: now + 60000,
    );
    expect(
      await store.consumeAndCreatePending(
        PairingNonceClaim(
          workspaceId: workspace,
          siteId: site,
          coordinatorDeviceId: coordinator,
          nonce: nonce,
          clientFingerprint: fingerprint,
          clientPublicKey: base64Url.encode(clientKey).replaceAll('=', ''),
          keyAlgorithm: 'ed25519',
          observedAt: DateTime.fromMillisecondsSinceEpoch(
            now - 1000,
            isUtc: true,
          ),
          expiresAt: DateTime.fromMillisecondsSinceEpoch(
            now + 60000,
            isUtc: true,
          ),
        ),
      ),
      isTrue,
    );
    Future<ShopOwnerEnrollmentEvidenceV1> signedEvidence({
      required ShopOwnerEnrollmentAction action,
      required int generation,
      required int observedAt,
    }) async {
      final placeholder = ShopOwnerEnrollmentEvidenceV1(
        action: action,
        tenantId: workspace,
        siteId: site,
        coordinatorDeviceId: coordinator,
        deviceId: device,
        clientFingerprint: fingerprint,
        sessionGeneration: generation,
        observedAtMillis: observedAt,
        authorityKeyId: 'owner_fixture',
        signature: base64Url
            .encode(List<int>.filled(64, 0))
            .replaceAll('=', ''),
        evidenceDigest: connectedSiteSha256({
          'schema': 'supermega.shop.owner-enrollment-evidence.v1',
          'action': action.name,
          'tenantId': workspace,
          'siteId': site,
          'coordinatorDeviceId': coordinator,
          'deviceId': device,
          'clientFingerprint': fingerprint,
          'sessionGeneration': generation,
          'observedAtMillis': observedAt,
          'authorityKeyId': 'owner_fixture',
        }),
      );
      final signature = await Ed25519().sign(
        utf8.encode(canonicalConnectedSiteJson(placeholder.signingPayload)),
        keyPair: ownerPair,
      );
      return ShopOwnerEnrollmentEvidenceV1(
        action: action,
        tenantId: workspace,
        siteId: site,
        coordinatorDeviceId: coordinator,
        deviceId: device,
        clientFingerprint: fingerprint,
        sessionGeneration: generation,
        observedAtMillis: observedAt,
        authorityKeyId: 'owner_fixture',
        signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
        evidenceDigest: placeholder.evidenceDigest,
      );
    }

    final verifier = _PinnedV41OwnerVerifier(
      ownerKey: ownerKey,
      workspace: workspace,
      site: site,
      coordinator: coordinator,
      device: device,
      fingerprint: fingerprint,
    );
    final approval = await signedEvidence(
      action: ShopOwnerEnrollmentAction.approve,
      generation: 1,
      observedAt: now - 800,
    );
    await store.importOwnerEvidence(approval, verifier: verifier);
    await database.customInsert(
      'INSERT INTO shop_site_revocation_observations '
      '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
      'VALUES (?, ?, 1, ?, ?)',
      variables: [
        const Variable<String>(workspace),
        const Variable<String>(site),
        const Variable<int>(now - 600),
        Variable<String>(connectedSiteSha256({'fixture': 'revocation-origin'})),
      ],
    );
    final authorityPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 19),
    );
    final authorityPublic = (await authorityPair.extractPublicKey()).bytes;
    final authorityUnsigned = <String, Object?>{
      'authorityEventId': 'authority_fixture_1',
      'authoritySequence': 1,
      'configurationSnapshot': {
        'businessProfile': {
          'schemaId': 'supermega-business-profile',
          'templateId': 'retail',
          'templateVersion': 1,
        },
        'catalogReference': {
          'catalogDigest': connectedSiteSha256({'catalog': 'fixture'}),
          'catalogVersion': 1,
        },
        'configurationVersion': 1,
      },
      'issuedAtMillis': now - 500,
      'issuerKeyId': 'authority_fixture',
      'membershipSnapshot': {
        'members': [
          {
            'actorId': 'actor_fixture',
            'capabilities': ['managementRead'],
            'role': 'manager',
            'sessionGeneration': 1,
          },
        ],
        'revocationGeneration': 1,
      },
      'previousAuthorityDigest': null,
      'protocolVersion': 1,
      'schemaId': 'ConnectedSiteAuthorityPayloadV1',
      'siteId': site,
      'workspaceId': workspace,
    };
    final authorityBytes = canonicalConnectedSiteJson({
      ...authorityUnsigned,
      'payloadDigest': connectedSiteSha256(authorityUnsigned),
    });
    Future<String> authoritySign(String bytes) async => base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(bytes),
            keyPair: authorityPair,
          )).bytes,
        )
        .replaceAll('=', '');
    final authoritySignature = await authoritySign(authorityBytes);
    final authorityPayload = ConnectedSiteAuthorityPayloadV1.parse(
      canonicalBytes: authorityBytes,
      signature: authoritySignature,
    );
    final checkpointUnsigned = <String, Object?>{
      'chainDigest': connectedSiteSha256([
        {
          'authoritySequence': 1,
          'payloadDigest': authorityPayload.payloadDigest,
          'signatureDigest': crypto.sha256
              .convert(utf8.encode(authoritySignature))
              .toString(),
        },
      ]),
      'deviceId': device,
      'firstAuthoritySequence': 1,
      'issuedAtMillis': now - 400,
      'issuerKeyId': 'authority_fixture',
      'lastAuthoritySequence': 1,
      'payloads': [
        {
          'canonicalPayloadBytes': authorityBytes,
          'signature': authoritySignature,
        },
      ],
      'protocolVersion': 1,
      'schemaId': ConnectedSiteAuthorityCheckpointV1.schemaId,
      'siteId': site,
      'workspaceId': workspace,
    };
    final checkpointBytes = canonicalConnectedSiteJson({
      ...checkpointUnsigned,
      'checkpointDigest': connectedSiteSha256(checkpointUnsigned),
    });
    await ShopConnectedSiteAuthorityPayloadStore(
      database: database,
      nowMillis: () => clock,
      verifier: PinnedEd25519ConnectedSiteAuthorityPayloadVerifier(
        publicKeys: {'authority_fixture': authorityPublic},
      ),
      runtimeEnabled: true,
    ).applyCheckpoint(
      ConnectedSiteScope(
        workspaceId: workspace,
        siteId: site,
        deviceId: device,
      ),
      canonicalCheckpointBytes: checkpointBytes,
      signature: await authoritySign(checkpointBytes),
    );
    final leasePair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 20),
    );
    final leaseUnsigned = <String, Object>{
      'protocolVersion': 1,
      'leaseId': 'lease_v41_fixture',
      'workspaceId': workspace,
      'siteId': site,
      'actorId': 'actor_fixture',
      'role': 'manager',
      'capabilities': ['managementRead'],
      'deviceId': device,
      'sessionGeneration': 1,
      'revocationGeneration': 1,
      'issuedAt': DateTime.fromMillisecondsSinceEpoch(
        now - 300,
        isUtc: true,
      ).toIso8601String(),
      'expiresAt': DateTime.fromMillisecondsSinceEpoch(
        now + 60000,
        isUtc: true,
      ).toIso8601String(),
      'issuerKeyId': 'lease_fixture',
    };
    final lease = OfflineStaffLeaseV1.fromJson({
      ...leaseUnsigned,
      'payloadDigest': connectedSiteSha256(leaseUnsigned),
      'signature': base64Url
          .encode(
            (await Ed25519().sign(
              utf8.encode(canonicalConnectedSiteJson(leaseUnsigned)),
              keyPair: leasePair,
            )).bytes,
          )
          .replaceAll('=', ''),
    });
    await database.customInsert(
      'INSERT INTO shop_site_offline_leases '
      '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
      'device_id, session_generation, revocation_generation, issued_at_millis, '
      'expires_at_millis, key_id, payload_digest, signature) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(lease.leaseId),
        Variable<String>(workspace),
        Variable<String>(site),
        Variable<String>(lease.actorId),
        Variable<String>(lease.role),
        Variable<String>(canonicalConnectedSiteJson(lease.capabilities)),
        Variable<String>(device),
        const Variable<int>(1),
        const Variable<int>(1),
        Variable<int>(lease.issuedAtMillis),
        Variable<int>(lease.expiresAtMillis),
        Variable<String>(lease.issuerKeyId),
        Variable<String>(lease.payloadDigest),
        Variable<String>(lease.signature),
      ],
    );
    final issuerEvidence = canonicalConnectedSiteJson({
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': 'lease_fixture',
    });
    await database.retainConnectedLeasePayloadV34(
      lease,
      retainedAtMillis: now - 200,
      issuerEvidenceDigest: connectedSiteSha256(jsonDecode(issuerEvidence)),
      issuerEvidenceJson: issuerEvidence,
    );
    final timePair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 21),
    );
    final timeKey = (await timePair.extractPublicKey()).bytes;
    ConnectedTrustedTimeStreamEntryV2 timeEntry(String signature) =>
        ConnectedTrustedTimeStreamEntryV2(
          workspaceId: workspace,
          siteId: site,
          coordinatorDeviceId: coordinator,
          clientDeviceId: device,
          clientFingerprint: fingerprint,
          sessionGeneration: 1,
          coordinatorBindingDigest: 'c' * 64,
          coordinatorBindingGeneration: 1,
          authorityKeyId: 'time_fixture',
          authorityKeyFingerprint: crypto.sha256.convert(timeKey).toString(),
          authorityKeyGeneration: 1,
          authorityEpoch: 1,
          authoritySequence: 1,
          previousEntryDigest: null,
          kind: ConnectedTrustedTimeStreamEntryKind.time,
          observedAtMillis: now - 1000,
          validUntilMillis: now + 60000,
          authoritySignature: signature,
        );
    final zeroSignature = base64Url
        .encode(List<int>.filled(64, 0))
        .replaceAll('=', '');
    final unsignedTime = timeEntry(zeroSignature);
    final signedTime = timeEntry(
      base64Url
          .encode(
            (await Ed25519().sign(
              utf8.encode(unsignedTime.canonicalSigningPayload),
              keyPair: timePair,
            )).bytes,
          )
          .replaceAll('=', ''),
    );
    ConnectedTrustedTimeStreamAckV1 timeAck(String signature) =>
        ConnectedTrustedTimeStreamAckV1(
          workspaceId: workspace,
          siteId: site,
          coordinatorDeviceId: coordinator,
          clientDeviceId: device,
          clientFingerprint: fingerprint,
          clientSigningKeyId: fingerprint,
          sessionGeneration: 1,
          coordinatorBindingDigest: 'c' * 64,
          coordinatorBindingGeneration: 1,
          authorityKeyGeneration: 1,
          authorityEpoch: 1,
          authoritySequence: 1,
          entryDigest: signedTime.entryDigest,
          resultingHeadDigest: signedTime.entryDigest,
          bootSessionId: 'b' * 64,
          acknowledgedAtMonotonicMillis: 7000,
          clientSignature: signature,
        );
    final unsignedAck = timeAck(zeroSignature);
    final signedAck = timeAck(
      base64Url
          .encode(
            (await Ed25519().sign(
              utf8.encode(unsignedAck.canonicalSigningPayload),
              keyPair: clientPair,
            )).bytes,
          )
          .replaceAll('=', ''),
    );
    final timeHead = await ShopConnectedTrustedTimeClientStore(
      database,
      enabled: true,
    ).persist(entry: signedTime, acknowledgement: signedAck);
    expect(
      verifyRetainedTrustedTimeSampleV39Sync(
        entryJson: signedTime.canonicalJson,
        ackJson: signedAck.canonicalJson,
        entryDigest: signedTime.entryDigest,
        ackDigest: signedAck.ackDigest,
        headDigest: timeHead.headDigest,
        workspaceId: workspace,
        siteId: site,
        coordinatorDeviceId: coordinator,
        deviceId: device,
        clientFingerprint: fingerprint,
        clientSigningKeyId: fingerprint,
        sessionGeneration: 1,
        coordinatorBindingDigest: 'c' * 64,
        coordinatorBindingGeneration: 1,
        authorityKeyId: 'time_fixture',
        authorityKeyGeneration: 1,
        authorityEpoch: 1,
        bootSessionId: 'b' * 64,
        sampleMonotonicMillis: 8000,
        trustedNowMillis: now,
        pinnedAuthorityKeys: {'time_fixture': timeKey},
        pinnedClientKeys: {fingerprint: clientKey},
      ),
      isTrue,
    );
    await database.verifyReadyForUse();
    await database.close();
    database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    final enrolledAt = await database
        .customSelect(
          'SELECT enrolled_at_millis FROM shop_site_devices WHERE device_id = ?',
          variables: [Variable<String>(device)],
        )
        .getSingle();
    expect(
      enrolledAt.read<int>('enrolled_at_millis'),
      approval.observedAtMillis,
    );
    expect(
      () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41),
      returnsNormally,
    );
    clock = now + 500;
    store = ShopConnectedSiteEnrollmentStore(
      database: database,
      nowMillis: () => clock,
    );
    final revocation = await signedEvidence(
      action: ShopOwnerEnrollmentAction.revoke,
      generation: 2,
      observedAt: clock,
    );
    await store.importOwnerEvidence(revocation, verifier: verifier);
    await database.verifyReadyForUse();
    await database.close();
    expect(
      () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41),
      returnsNormally,
    );
    database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    final cloudPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 22),
    );
    final feedPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 23),
    );
    Future<String> signFields(
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
    final cloudApprovalUnsigned = <String, Object?>{
      'contract': 'supermega.connected-cloud-device-key-approval.v1',
      'purpose': 'connected-site-event-read.v1',
      'workspaceId': workspace,
      'siteId': site,
      'deviceId': device,
      'signingKeyId': fingerprint,
      'publicKey': base64Url.encode(clientKey).replaceAll('=', ''),
      'clientFingerprint': fingerprint,
      'enrollmentEvidenceDigest': approval.evidenceDigest,
      'sessionGeneration': 1,
      'revocationGeneration': 1,
      'approvalSequence': 1,
      'previousApprovalDigest': null,
      'issuerKeyId': 'cloud_fixture',
      'issuerKeyGeneration': 1,
      'issuedAtMillis': now - 250,
      'expiresAtMillis': now + 30000,
    };
    final cloudApprovalJson = canonicalConnectedSiteJson({
      ...cloudApprovalUnsigned,
      'signature': await signFields(cloudApprovalUnsigned, cloudPair),
    });
    final requestNonce = 'a' * 64;
    final requestUnsigned = <String, Object?>{
      'contract': 'supermega.connected-site-event-read-request.v1',
      'workspaceId': workspace,
      'siteId': site,
      'actorId': 'actor_fixture',
      'deviceId': device,
      'clientFingerprint': fingerprint,
      'enrollmentEvidenceDigest': approval.evidenceDigest,
      'authorityGeneration': 1,
      'authorityPayloadDigest': authorityPayload.payloadDigest,
      'revocationGeneration': 1,
      'afterSequence': 0,
      'priorEventDigest': null,
      'limit': 64,
      'leaseDigest': lease.payloadDigest,
      'issuedAt': DateTime.fromMillisecondsSinceEpoch(
        now - 200,
        isUtc: true,
      ).toIso8601String(),
      'requestNonce': requestNonce,
      'signingKeyId': fingerprint,
      'signatureAlgorithm': 'ed25519',
    };
    final requestJson = canonicalConnectedSiteJson({
      ...requestUnsigned,
      'signature': await signFields(requestUnsigned, clientPair),
    });
    final requestDigest = connectedSiteSha256(jsonDecode(requestJson));
    final streamDigest = connectedSiteSha256({
      'contract': 'supermega.connected-cloud-feed-stream.v1',
      'workspaceId': workspace,
      'siteId': site,
      'actorId': 'actor_fixture',
      'actorRole': 'manager',
      'deviceId': device,
      'authorityGeneration': 1,
      'revocationGeneration': 1,
      'authorityPayloadDigest': authorityPayload.payloadDigest,
      'leaseDigest': lease.payloadDigest,
    });
    final pageUnsigned = <String, Object?>{
      'contract': 'supermega.connected-site-retail-feed.v1',
      'protocolVersion': 1,
      'workspaceId': workspace,
      'siteId': site,
      'actorId': 'actor_fixture',
      'deviceId': device,
      'authorityGeneration': 1,
      'revocationGeneration': 1,
      'authorityPayloadDigest': authorityPayload.payloadDigest,
      'leaseDigest': lease.payloadDigest,
      'requestDigest': requestDigest,
      'afterSequence': 0,
      'priorEventDigest': null,
      'headers': [
        {'sequence': 1, 'eventDigest': 'e' * 64, 'previousEventDigest': null},
      ],
      'projections': <Object>[],
      'nextSequence': 1,
      'nextEventDigest': 'e' * 64,
      'hasMore': false,
    };
    final pageDigest = connectedSiteSha256(pageUnsigned);
    final pageJson = canonicalConnectedSiteJson({
      ...pageUnsigned,
      'pageDigest': pageDigest,
    });
    final proofUnsigned = <String, Object?>{
      'contract': 'supermega.connected-cloud-feed-proof.v1',
      'protocolVersion': 1,
      'issuerKeyId': 'feed_fixture',
      'issuedAtMillis': now - 100,
      'expiresAtMillis': now + 30000,
      'workspaceId': workspace,
      'siteId': site,
      'actorId': 'actor_fixture',
      'actorRole': 'manager',
      'deviceId': device,
      'authorityGeneration': 1,
      'revocationGeneration': 1,
      'authorityPayloadDigest': authorityPayload.payloadDigest,
      'leaseDigest': lease.payloadDigest,
      'requestDigest': requestDigest,
      'requestNonce': requestNonce,
      'afterSequence': 0,
      'priorEventDigest': null,
      'nextSequence': 1,
      'nextEventDigest': 'e' * 64,
      'pageDigest': pageDigest,
    };
    final proofJson = canonicalConnectedSiteJson({
      ...proofUnsigned,
      'signature': await signFields(proofUnsigned, feedPair),
    });
    await database.transaction(() async {
      await database.customInsert(
        'INSERT INTO shop_connected_cloud_feed_streams '
        '(stream_digest, workspace_id, site_id, actor_id, device_id, '
        'actor_role, lease_digest, authority_payload_digest, '
        'authority_generation, revocation_generation) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)',
        variables: [
          Variable<String>(streamDigest),
          const Variable<String>(workspace),
          const Variable<String>(site),
          const Variable<String>('actor_fixture'),
          const Variable<String>(device),
          const Variable<String>('manager'),
          Variable<String>(lease.payloadDigest),
          Variable<String>(authorityPayload.payloadDigest),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_cloud_feed_pages '
        '(page_digest, stream_digest, after_sequence, prior_event_digest, '
        'next_sequence, next_event_digest, page_json, request_nonce, '
        'authenticated_proof_json, authenticated_proof_digest) '
        'VALUES (?, ?, 0, NULL, 1, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(pageDigest),
          Variable<String>(streamDigest),
          Variable<String>('e' * 64),
          Variable<String>(pageJson),
          Variable<String>(requestNonce),
          Variable<String>(proofJson),
          Variable<String>(connectedSiteSha256(jsonDecode(proofJson))),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_cloud_feed_heads '
        '(stream_digest, next_sequence, next_event_digest, last_page_digest, restore_paused) '
        'VALUES (?, 1, ?, ?, 0)',
        variables: [
          Variable<String>(streamDigest),
          Variable<String>('e' * 64),
          Variable<String>(pageDigest),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_cloud_feed_page_evidence '
        '(page_digest, request_json, request_digest, cloud_key_approval_json, '
        'cloud_key_approval_digest, lease_digest, authority_payload_digest, '
        'enrollment_evidence_digest, time_entry_digest, time_ack_digest, '
        'time_head_digest, boot_session_id, sample_monotonic_millis, trusted_now_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 8000, ?)',
        variables: [
          Variable<String>(pageDigest),
          Variable<String>(requestJson),
          Variable<String>(requestDigest),
          Variable<String>(cloudApprovalJson),
          Variable<String>(connectedSiteSha256(jsonDecode(cloudApprovalJson))),
          Variable<String>(lease.payloadDigest),
          Variable<String>(authorityPayload.payloadDigest),
          Variable<String>(approval.evidenceDigest),
          Variable<String>(signedTime.entryDigest),
          Variable<String>(signedAck.ackDigest),
          Variable<String>(timeHead.headDigest),
          Variable<String>('b' * 64),
          const Variable<int>(now),
        ],
      );
    });
    Future<List<Map<String, Object?>>> rows(String table) async =>
        (await database.customSelect('SELECT * FROM $table').get())
            .map((row) => Map<String, Object?>.from(row.data))
            .toList(growable: false);
    final feedPublic = (await feedPair.extractPublicKey()).bytes;
    expect(
      shopConnectedCloudFeedRowsValidV40(
        streams: await rows('shop_connected_cloud_feed_streams'),
        pages: await rows('shop_connected_cloud_feed_pages'),
        heads: await rows('shop_connected_cloud_feed_heads'),
        restoreBarriers: await rows(
          'shop_connected_cloud_feed_restore_barriers',
        ),
        trustedIssuerKeys: {'feed_fixture': feedPublic},
      ),
      isTrue,
    );
    expect(
      shopConnectedCloudFeedEvidenceCoverageV41(
        pages: await rows('shop_connected_cloud_feed_pages'),
        evidence: await rows('shop_connected_cloud_feed_page_evidence'),
      ),
      isTrue,
    );
    final expected = ConnectedSiteRetailFeedExpectation(
      workspaceId: workspace,
      siteId: site,
      actorId: 'actor_fixture',
      deviceId: device,
      authorityGeneration: 1,
      revocationGeneration: 1,
      authorityPayloadDigest: authorityPayload.payloadDigest,
      leaseDigest: lease.payloadDigest,
      requestDigest: requestDigest,
      afterSequence: 0,
      priorEventDigest: null,
      limit: 64,
    );
    verifyRetainedCloudFeedReadWithApprovalSync(
      requestBytes: requestJson,
      approvalBytes: cloudApprovalJson,
      approvalDigest: connectedSiteSha256(jsonDecode(cloudApprovalJson)),
      pinnedCloudIssuerKeys: {
        'cloud_fixture': (await cloudPair.extractPublicKey()).bytes,
      },
      pinnedIssuerKeyGeneration: 1,
      expectedApprovalSequence: 1,
      expectedPreviousApprovalDigest: null,
      expected: expected,
      requestNonce: requestNonce,
      clientFingerprint: fingerprint,
      enrollmentEvidenceDigest: approval.evidenceDigest,
      expectedPendingEnrollmentPublicKey: clientKey,
      signingKeyId: fingerprint,
      sessionGeneration: 1,
      trustedAtIssueMillis: now,
    );
    verifyRetainedOfflineStaffLeaseSync(
      lease: lease,
      expected: ShopOfflineStaffLeaseExpectedBinding(
        tenantId: workspace,
        siteId: site,
        deviceId: device,
        sessionGeneration: 1,
        revocationGeneration: 1,
        requiredCapability: ShopStaffCapability.managementRead,
      ),
      trustedAtMillis: now,
      pinnedIssuerKeys: {
        'lease_fixture': (await leasePair.extractPublicKey()).bytes,
      },
    );
    verifyRetainedAuthorityForLeaseSync(
      canonicalBytes: authorityBytes,
      signature: authoritySignature,
      expectedPayloadDigest: authorityPayload.payloadDigest,
      expectedSequence: 1,
      expectedPreviousDigest: null,
      lease: lease,
      trustedAtMillis: now,
      pinnedIssuerKeys: {'authority_fixture': authorityPublic},
    );
    final parsedPage = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: pageJson,
      expected: expected,
    );
    ConnectedCloudFeedProofV1.parse(
      canonicalBytes: proofJson,
      page: parsedPage,
      expected: expected,
      requestNonce: requestNonce,
      actorRole: 'manager',
      trustedNowMillis: now,
    );
    final retainedTimeEntries = await rows(
      'shop_connected_time_client_entries',
    );
    final retainedTimeAcks = await rows('shop_connected_time_client_acks');
    final retainedTimeHeads = await rows('shop_connected_time_client_heads');
    expect(retainedTimeEntries, hasLength(1));
    expect(retainedTimeAcks, hasLength(1));
    expect(retainedTimeHeads, hasLength(1));
    expect(
      verifyRetainedTrustedTimeSampleV39Sync(
        entryJson: retainedTimeEntries.single['entry_json'] as String,
        ackJson: retainedTimeAcks.single['ack_json'] as String,
        entryDigest: retainedTimeEntries.single['entry_digest'] as String,
        ackDigest: retainedTimeAcks.single['ack_digest'] as String,
        headDigest: retainedTimeHeads.single['head_digest'] as String,
        workspaceId: workspace,
        siteId: site,
        coordinatorDeviceId: coordinator,
        deviceId: device,
        clientFingerprint: fingerprint,
        clientSigningKeyId: fingerprint,
        sessionGeneration: 1,
        coordinatorBindingDigest: 'c' * 64,
        coordinatorBindingGeneration: 1,
        authorityKeyId: 'time_fixture',
        authorityKeyGeneration: 1,
        authorityEpoch: 1,
        bootSessionId: 'b' * 64,
        sampleMonotonicMillis: 8000,
        trustedNowMillis: now,
        pinnedAuthorityKeys: {'time_fixture': timeKey},
        pinnedClientKeys: {fingerprint: clientKey},
      ),
      isTrue,
    );
    expect(revocation.observedAtMillis, greaterThan(now));
    final currentDevice = await database
        .customSelect(
          'SELECT state, revoked_at_millis FROM shop_site_devices WHERE device_id = ?',
          variables: [const Variable<String>(device)],
        )
        .getSingle();
    expect(currentDevice.read<String>('state'), 'revoked');
    expect(currentDevice.read<int>('revoked_at_millis'), greaterThan(now));
    const historyTables = <String>[
      'shop_connected_cloud_feed_streams',
      'shop_connected_cloud_feed_pages',
      'shop_connected_cloud_feed_heads',
      'shop_connected_cloud_feed_restore_barriers',
      'shop_connected_cloud_feed_page_evidence',
      'shop_site_pairing_nonces',
      'shop_site_pending_enrollments',
      'shop_site_enrollment_evidence',
      'shop_site_devices',
      'shop_site_request_nonces',
      'shop_site_authority_payloads',
      'shop_site_authority_members',
      'shop_site_configuration_snapshots',
      'shop_site_authority_deltas',
      'shop_site_authority_checkpoints',
      'shop_site_authority_bootstrap_provenance',
      'shop_site_offline_lease_payloads',
      'shop_site_offline_leases',
      'shop_site_commands',
      'shop_site_cloud_proof_requirements',
      'shop_site_cloud_proofs',
      'shop_connected_time_client_entries',
      'shop_connected_time_client_acks',
      'shop_connected_time_client_heads',
      'shop_connected_time_client_restore_barriers',
      'shop_connected_time_client_restore_clearances',
    ];
    final history = <String, List<Map<String, Object?>>>{
      for (final table in historyTables) table: await rows(table),
    };
    final trust = ShopCloudFeedV41FirstPageTrust(
      workspaceId: workspace,
      siteId: site,
      actorId: 'actor_fixture',
      deviceId: device,
      coordinatorDeviceId: coordinator,
      clientFingerprint: fingerprint,
      clientSigningKeyId: fingerprint,
      sessionGeneration: 1,
      authoritySequence: 1,
      revocationGeneration: 1,
      cloudIssuerGeneration: 1,
      coordinatorBindingDigest: 'c' * 64,
      coordinatorBindingGeneration: 1,
      timeAuthorityKeyId: 'time_fixture',
      timeAuthorityKeyGeneration: 1,
      timeAuthorityEpoch: 1,
      feedIssuerKeys: {'feed_fixture': feedPublic},
      cloudApprovalIssuerKeys: {
        'cloud_fixture': (await cloudPair.extractPublicKey()).bytes,
      },
      leaseIssuerKeys: {
        'lease_fixture': (await leasePair.extractPublicKey()).bytes,
      },
      authorityIssuerKeys: {'authority_fixture': authorityPublic},
      ownerIssuerKeys: {'owner_fixture': ownerKey},
      timeAuthorityKeys: {'time_fixture': timeKey},
      clientKeys: {fingerprint: clientKey},
    );
    bool valid(Map<String, List<Map<String, Object?>>> tables) =>
        shopCloudFeedFirstPageHistoricalRowsValidV41(
          trust: trust,
          completeTables: tables,
        );
    expect(valid(history), isTrue);
    expect(
      valid({
        ...history,
        'shop_site_offline_leases': [
          {
            ...history['shop_site_offline_leases']!.single,
            'actor_role': 'cashier',
          },
        ],
      }),
      isFalse,
      reason: 'retained signed lease must match every base lease binding',
    );
    expect(
      valid({
        ...history,
        'shop_site_enrollment_evidence': [
          history['shop_site_enrollment_evidence']!.first,
        ],
      }),
      isFalse,
      reason: 'hidden later revocation cannot be omitted from full history',
    );
    expect(
      valid({...history, 'shop_site_authority_payloads': const []}),
      isFalse,
      reason: 'authority predecessor cannot be hidden',
    );
    final earlyRevocation = await signedEvidence(
      action: ShopOwnerEnrollmentAction.revoke,
      generation: 2,
      observedAt: now - 1,
    );
    expect(
      valid({
        ...history,
        'shop_site_enrollment_evidence':
            history['shop_site_enrollment_evidence']!
                .map(
                  (row) => row['action'] == 'revoke'
                      ? {
                          ...row,
                          'observed_at_millis':
                              earlyRevocation.observedAtMillis,
                          'evidence_json': canonicalConnectedSiteJson(
                            earlyRevocation.toJson(),
                          ),
                          'evidence_digest': earlyRevocation.evidenceDigest,
                        }
                      : row,
                )
                .toList(growable: false),
        'shop_site_devices': [
          {
            ...history['shop_site_devices']!.single,
            'revoked_at_millis': earlyRevocation.observedAtMillis,
          },
        ],
      }),
      isFalse,
      reason: 'a genuine signed pre-sample revocation blocks the page',
    );
    final expiredProofUnsigned = {
      ...proofUnsigned,
      'issuedAtMillis': now - 60000,
      'expiresAtMillis': now - 30000,
    };
    final expiredProofJson = canonicalConnectedSiteJson({
      ...expiredProofUnsigned,
      'signature': await signFields(expiredProofUnsigned, feedPair),
    });
    expect(
      valid({
        ...history,
        'shop_connected_cloud_feed_pages': [
          {
            ...history['shop_connected_cloud_feed_pages']!.single,
            'authenticated_proof_json': expiredProofJson,
            'authenticated_proof_digest': connectedSiteSha256(
              jsonDecode(expiredProofJson),
            ),
          },
        ],
      }),
      isFalse,
      reason: 'signed feed proof must cover the retained trusted sample',
    );
    await database.close();
    database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase(file),
      correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
      testOnlyCloudFeedPinnedKeys: {'feed_fixture': feedPublic},
    );
    await expectLater(
      database.verifyReadyForUse(),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          contains('Nonempty v40 cloud feed lacks signed request evidence'),
        ),
      ),
    );
    await database.close();
    expect(
      () => ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedPinnedKeys: {'feed_fixture': feedPublic},
      ),
      throwsFormatException,
    );
  });
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

final class _PinnedV41OwnerVerifier
    implements ShopOwnerEnrollmentEvidenceVerifier {
  const _PinnedV41OwnerVerifier({
    required this.ownerKey,
    required this.workspace,
    required this.site,
    required this.coordinator,
    required this.device,
    required this.fingerprint,
  });

  final List<int> ownerKey;
  final String workspace;
  final String site;
  final String coordinator;
  final String device;
  final String fingerprint;

  @override
  Future<bool> verify(ShopOwnerEnrollmentEvidenceV1 evidence) async {
    if (evidence.tenantId != workspace ||
        evidence.siteId != site ||
        evidence.coordinatorDeviceId != coordinator ||
        evidence.deviceId != device ||
        evidence.clientFingerprint != fingerprint ||
        evidence.authorityKeyId != 'owner_fixture') {
      return false;
    }
    return Ed25519().verify(
      utf8.encode(canonicalConnectedSiteJson(evidence.signingPayload)),
      signature: Signature(
        base64Url.decode('${evidence.signature}=='),
        publicKey: SimplePublicKey(ownerKey, type: KeyPairType.ed25519),
      ),
    );
  }
}
