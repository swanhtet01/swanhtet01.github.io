import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

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
import 'package:supermega_shop/shop_connected_trusted_time_stream_acceptance.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

import 'historical_shop_fixture_support.dart';
import 'v41_cloud_feed_process_fixture.dart';

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
    final preRevocationFile = File('${root.path}/pre-revocation.sqlite');
    await database.exportVerifiedLocalSnapshot(preRevocationFile);
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
    final history = <String, List<Map<String, Object?>>>{
      for (final table in shopCloudFeedV41HistoricalTables)
        table: await rows(table),
    };
    final trust = await v41ProcessFixtureTrust();
    expect(trust.feedIssuerKeys['feed_fixture'], feedPublic);
    expect(trust.clientKeys[fingerprint], clientKey);
    expect(
      () => ShopDatabase.withCorrectionReceiptVerifier(
        correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
        testOnlyCloudFeedPinnedKeys: {'feed_fixture': feedPublic},
        testOnlyCloudFeedV41Trust: trust,
      ),
      throwsArgumentError,
      reason: 'fixture trust and legacy pins cannot be mixed at runtime',
    );
    bool valid(Map<String, List<Map<String, Object?>>> tables) =>
        shopCloudFeedFirstPageHistoricalRowsValidV41(
          trust: trust,
          completeTables: tables,
        );
    expect(valid(history), isTrue);
    final secondNonce = '9' * 64;
    final secondRequestUnsigned = <String, Object?>{
      ...requestUnsigned,
      'afterSequence': 1,
      'priorEventDigest': 'e' * 64,
      'requestNonce': secondNonce,
    };
    final secondRequestJson = canonicalConnectedSiteJson({
      ...secondRequestUnsigned,
      'signature': await signFields(secondRequestUnsigned, clientPair),
    });
    final secondRequestDigest = connectedSiteSha256(
      jsonDecode(secondRequestJson),
    );
    final secondPageUnsigned = <String, Object?>{
      ...pageUnsigned,
      'requestDigest': secondRequestDigest,
      'afterSequence': 1,
      'priorEventDigest': 'e' * 64,
      'headers': [
        {
          'sequence': 2,
          'eventDigest': 'd' * 64,
          'previousEventDigest': 'e' * 64,
        },
      ],
      'nextSequence': 2,
      'nextEventDigest': 'd' * 64,
    };
    final secondPageDigest = connectedSiteSha256(secondPageUnsigned);
    final secondPageJson = canonicalConnectedSiteJson({
      ...secondPageUnsigned,
      'pageDigest': secondPageDigest,
    });
    final secondProofUnsigned = <String, Object?>{
      ...proofUnsigned,
      'requestDigest': secondRequestDigest,
      'requestNonce': secondNonce,
      'afterSequence': 1,
      'priorEventDigest': 'e' * 64,
      'nextSequence': 2,
      'nextEventDigest': 'd' * 64,
      'pageDigest': secondPageDigest,
    };
    final secondProofJson = canonicalConnectedSiteJson({
      ...secondProofUnsigned,
      'signature': await signFields(secondProofUnsigned, feedPair),
    });
    final pythonSignedPage = jsonDecode(
      await File('test/fixtures/v41_python_signed_page.json').readAsString(),
    ) as Map<String, dynamic>;
    expect(pythonSignedPage['requestJson'], secondRequestJson);
    expect(pythonSignedPage['pageJson'], secondPageJson);
    expect(pythonSignedPage['proofJson'], secondProofJson);
    final secondPageRow = <String, Object?>{
      ...history['shop_connected_cloud_feed_pages']!.single,
      'page_digest': secondPageDigest,
      'after_sequence': 1,
      'prior_event_digest': 'e' * 64,
      'next_sequence': 2,
      'next_event_digest': 'd' * 64,
      'page_json': secondPageJson,
      'request_nonce': secondNonce,
      'authenticated_proof_json': secondProofJson,
      'authenticated_proof_digest': connectedSiteSha256(
        jsonDecode(secondProofJson),
      ),
    };
    final secondEvidenceRow = <String, Object?>{
      ...history['shop_connected_cloud_feed_page_evidence']!.single,
      'page_digest': secondPageDigest,
      'request_json': secondRequestJson,
      'request_digest': secondRequestDigest,
      'sample_monotonic_millis': 8001,
      'trusted_now_millis': now + 1,
    };
    final twoPageHistory = <String, List<Map<String, Object?>>>{
      ...history,
      'shop_connected_cloud_feed_pages': [
        ...history['shop_connected_cloud_feed_pages']!,
        secondPageRow,
      ],
      'shop_connected_cloud_feed_page_evidence': [
        ...history['shop_connected_cloud_feed_page_evidence']!,
        secondEvidenceRow,
      ],
      'shop_connected_cloud_feed_heads': [
        {
          ...history['shop_connected_cloud_feed_heads']!.single,
          'next_sequence': 2,
          'next_event_digest': 'd' * 64,
          'last_page_digest': secondPageDigest,
        },
      ],
    };
    expect(valid(twoPageHistory), isTrue);
    expect(
      valid({
        ...twoPageHistory,
        'shop_connected_cloud_feed_page_evidence': [
          {
            ...history['shop_connected_cloud_feed_page_evidence']!.single,
            'sample_monotonic_millis': 8001,
            'trusted_now_millis': now + 1,
          },
          {
            ...secondEvidenceRow,
            'sample_monotonic_millis': 8000,
            'trusted_now_millis': now,
          },
        ],
      }),
      isFalse,
      reason: 'a later page cannot move signed site time backward',
    );
    expect(
      valid({
        ...twoPageHistory,
        'shop_connected_cloud_feed_page_evidence': [
          history['shop_connected_cloud_feed_page_evidence']!.single,
        ],
      }),
      isFalse,
      reason: 'a later page without its own signed request must fail',
    );
    expect(
      valid({
        ...twoPageHistory,
        'shop_connected_cloud_feed_pages': [
          history['shop_connected_cloud_feed_pages']!.single,
          {...secondPageRow, 'prior_event_digest': '0' * 64},
        ],
      }),
      isFalse,
      reason: 'a discontinuous second page must fail',
    );
    final twoPageFile = await preRevocationFile.copy(
      '${root.path}/two-page.sqlite',
    );
    var twoPageDatabase = ShopDatabase(NativeDatabase(twoPageFile));
    final firstEvidenceForTwoPage = ShopCloudFeedV41FirstPageEvidence(
      requestJson: requestJson,
      cloudKeyApprovalJson: cloudApprovalJson,
      enrollmentEvidenceDigest: approval.evidenceDigest,
      timeEntryDigest: signedTime.entryDigest,
      timeAckDigest: signedAck.ackDigest,
      timeHeadDigest: timeHead.headDigest,
      bootSessionId: 'b' * 64,
      sampleMonotonicMillis: 8000,
    );
    await twoPageDatabase.testOnlyApplyConnectedCloudFeedFirstPageV41(
      trust: trust,
      timeAuthority: _V41FixtureTime(workspace, site, [
        now,
      ], firstEvidenceForTwoPage),
      expected: expected,
      actorRole: 'manager',
      requestNonce: requestNonce,
      pageJson: pageJson,
      proofJson: proofJson,
      evidence: firstEvidenceForTwoPage,
    );
    final processFixturePath =
        Platform.environment['SUPERMEGA_CLOUD_FEED_V41_FIXTURE_DATABASE'];
    if (processFixturePath != null) {
      final destination = File(processFixturePath);
      expect(destination.isAbsolute, isTrue);
      expect(await destination.exists(), isFalse);
      await twoPageDatabase.close();
      await twoPageFile.copy(destination.path);
      ShopBackup.verifySnapshot(
        destination,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      );
      return;
    }
    final secondExpected = ConnectedSiteRetailFeedExpectation(
      workspaceId: workspace,
      siteId: site,
      actorId: 'actor_fixture',
      deviceId: device,
      authorityGeneration: 1,
      revocationGeneration: 1,
      authorityPayloadDigest: authorityPayload.payloadDigest,
      leaseDigest: lease.payloadDigest,
      requestDigest: secondRequestDigest,
      afterSequence: 1,
      priorEventDigest: 'e' * 64,
      limit: 64,
    );
    final secondEvidence = ShopCloudFeedV41FirstPageEvidence(
      requestJson: pythonSignedPage['requestJson'] as String,
      cloudKeyApprovalJson: cloudApprovalJson,
      enrollmentEvidenceDigest: approval.evidenceDigest,
      timeEntryDigest: signedTime.entryDigest,
      timeAckDigest: signedAck.ackDigest,
      timeHeadDigest: timeHead.headDigest,
      bootSessionId: 'b' * 64,
      sampleMonotonicMillis: 8001,
    );
    Future<void> applySecondPage(
      ShopDatabase target,
      _V41FixtureTime time, {
      Future<void> Function()? beforeCommit,
    }) => target.testOnlyApplyConnectedCloudFeedSecondPageV41(
      trust: trust,
      timeAuthority: time,
      expected: secondExpected,
      actorRole: 'manager',
      requestNonce: secondNonce,
      pageJson: pythonSignedPage['pageJson'] as String,
      proofJson: pythonSignedPage['proofJson'] as String,
      evidence: secondEvidence,
      testOnlyBeforeCommit: beforeCommit,
    );
    await twoPageDatabase.close();
    final onlineFile = await twoPageFile.copy(
      '${root.path}/online-client.sqlite',
    );
    // Synthetic outage/reconnect of two stores for one fixture device, not
    // enrollment or delivery between two physical devices.
    final offlineFile = await twoPageFile.copy(
      '${root.path}/offline-client.sqlite',
    );
    final onlineClient = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(onlineFile),
      trust: trust,
    );
    await onlineClient.verifyReadyForUse();
    await expectLater(
      onlineClient.testOnlyApplyConnectedCloudFeedSecondPageV41(
        trust: trust,
        timeAuthority: _V41FixtureTime(workspace, site, [
          now + 1,
        ], secondEvidence),
        expected: secondExpected,
        actorRole: 'manager',
        requestNonce: secondNonce,
        pageJson: (pythonSignedPage['pageJson'] as String).replaceFirst(
          'd' * 64,
          'c' * 64,
        ),
        proofJson: pythonSignedPage['proofJson'] as String,
        evidence: secondEvidence,
      ),
      throwsFormatException,
      reason: 'altered Python page bytes cannot be paired with retained proof',
    );
    await applySecondPage(
      onlineClient,
      _V41FixtureTime(workspace, site, [now + 1], secondEvidence),
    );
    final offlineBeforeReconnect = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(offlineFile),
      trust: trust,
    );
    await offlineBeforeReconnect.verifyReadyForUse();
    expect(
      (await offlineBeforeReconnect
              .customSelect(
                'SELECT next_sequence FROM shop_connected_cloud_feed_heads',
              )
              .getSingle())
          .read<int>('next_sequence'),
      1,
      reason: 'a disconnected client cannot inherit another store cursor',
    );
    await offlineBeforeReconnect.close();
    final reconnectedClient = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(offlineFile),
      trust: trust,
    );
    await reconnectedClient.verifyReadyForUse();
    await applySecondPage(
      reconnectedClient,
      _V41FixtureTime(workspace, site, [now + 1], secondEvidence),
    );
    await applySecondPage(
      reconnectedClient,
      _V41FixtureTime(
        workspace,
        site,
        [now + 3],
        secondEvidence,
        initialMonotonicAdvance: 2,
      ),
    );
    for (final client in [onlineClient, reconnectedClient]) {
      expect(
        (await client
                .customSelect(
                  'SELECT next_sequence, next_event_digest FROM shop_connected_cloud_feed_heads',
                )
                .getSingle())
            .read<int>('next_sequence'),
        2,
      );
      expect(
        await client
            .customSelect(
              'SELECT * FROM shop_connected_cloud_feed_pages ORDER BY after_sequence',
            )
            .get(),
        hasLength(2),
      );
    }
    await ShopConnectedSiteEnrollmentStore(
      database: reconnectedClient,
      nowMillis: () => now + 500,
    ).importOwnerEvidence(revocation, verifier: verifier);
    await expectLater(
      applySecondPage(
        reconnectedClient,
        _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
      ),
      throwsStateError,
      reason: 'revocation blocks replay on the affected client store',
    );
    await onlineClient.close();
    await reconnectedClient.close();
    for (final clientFile in [onlineFile, offlineFile]) {
      ShopBackup.verifySnapshot(
        clientFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      );
    }
    final contendedFile = await twoPageFile.copy(
      '${root.path}/two-page-contended.sqlite',
    );
    twoPageDatabase = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(twoPageFile),
      trust: trust,
    );
    final contendedWriter = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(contendedFile),
      trust: trust,
    );
    final contendedRetry = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(
        contendedFile,
        setup: (raw) => raw.execute('PRAGMA busy_timeout = 100'),
      ),
      trust: trust,
    );
    await contendedWriter.verifyReadyForUse();
    await contendedRetry.verifyReadyForUse();
    final writerAtCommit = Completer<void>();
    final releaseWriter = Completer<void>();
    final competingRevocationPort = ReceivePort();
    final competingExitPort = ReceivePort();
    final competingExited = competingExitPort.first;
    final competingRevocationReady = Completer<SendPort>();
    final competingRevocationEntered = Completer<void>();
    final competingRevocationResult = Completer<String>();
    final competingRevocationMessages = competingRevocationPort.listen((value) {
      if (value is SendPort) competingRevocationReady.complete(value);
      if (value == 'started') competingRevocationEntered.complete();
      if (value == 'done') competingRevocationResult.complete('done');
      if (value is String && value.startsWith('error:')) {
        competingRevocationResult.complete(value);
      }
    });
    Isolate? competingRevocationIsolate;
    Future<void>? firstAppend;
    try {
      competingRevocationIsolate = await Isolate.spawn(_runV41RevocationRace, {
        'port': competingRevocationPort.sendPort,
        'path': contendedFile.path,
        'evidence': revocation.toJson(),
        'ownerKey': ownerKey,
        'workspace': workspace,
        'site': site,
        'coordinator': coordinator,
        'device': device,
        'fingerprint': fingerprint,
        'now': now + 500,
        'trust': trust,
      }, onExit: competingExitPort.sendPort);
      final competingReadyOrError = await Future.any<Object>([
        competingRevocationReady.future,
        competingRevocationResult.future,
      ]).timeout(const Duration(seconds: 20));
      if (competingReadyOrError is! SendPort) {
        throw StateError(
          'Revocation contender could not open: $competingReadyOrError',
        );
      }
      final competingStartRevocation = competingReadyOrError;
      firstAppend = applySecondPage(
        contendedWriter,
        _V41FixtureTime(workspace, site, [now + 1, now + 2], secondEvidence),
        beforeCommit: () async {
          writerAtCommit.complete();
          await releaseWriter.future;
        },
      );
      await writerAtCommit.future.timeout(const Duration(seconds: 5));
      try {
        await expectLater(
          applySecondPage(
            contendedRetry,
            _V41FixtureTime(workspace, site, [now + 1], secondEvidence),
          ).timeout(const Duration(seconds: 5)),
          throwsA(
            predicate<Object>(
              (error) => error.toString().contains('database is locked'),
              'a SQLite write-lock rejection',
            ),
          ),
          reason:
              'a concurrent handle cannot commit the same cursor while locked',
        );
        competingStartRevocation.send(true);
        await competingRevocationEntered.future.timeout(
          const Duration(seconds: 5),
          onTimeout: () =>
              throw StateError('revocation contender did not start'),
        );
        expect(
          await competingRevocationResult.future.timeout(
            const Duration(seconds: 10),
            onTimeout: () =>
                throw StateError('revocation contender did not finish'),
          ),
          contains('database is locked'),
          reason: 'signed revocation cannot race past the page-two write lock',
        );
      } finally {
        releaseWriter.complete();
      }
      await firstAppend.timeout(const Duration(seconds: 5));
      await applySecondPage(
        contendedRetry,
        _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
      );
      expect(
        await contendedRetry
            .customSelect('SELECT * FROM shop_connected_cloud_feed_pages')
            .get(),
        hasLength(2),
        reason: 'the lost-response retry must not append a third page',
      );
    } finally {
      if (!releaseWriter.isCompleted) releaseWriter.complete();
      if (firstAppend != null) {
        try {
          await firstAppend.timeout(const Duration(seconds: 5));
        } on Object {
          // Keep the original assertion failure; both handles still close.
        }
      }
      if (competingRevocationIsolate != null) {
        try {
          await competingExited.timeout(const Duration(seconds: 5));
        } on Object {
          competingRevocationIsolate.kill(priority: Isolate.immediate);
        }
      }
      await contendedRetry.close();
      await contendedWriter.close();
      await competingRevocationMessages.cancel();
      competingRevocationPort.close();
      competingExitPort.close();
    }
    final revokingAfterSecondPage = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(contendedFile),
      trust: trust,
    );
    await ShopConnectedSiteEnrollmentStore(
      database: revokingAfterSecondPage,
      nowMillis: () => now + 500,
    ).importOwnerEvidence(revocation, verifier: verifier);
    await expectLater(
      applySecondPage(
        revokingAfterSecondPage,
        _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
      ),
      throwsStateError,
      reason: 'a later signed revocation blocks even exact page-two replay',
    );
    await revokingAfterSecondPage.close();
    expect(
      () => ShopBackup.verifySnapshot(
        contendedFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
    );
    var secondPageRevocationApplied = false;
    await expectLater(
      applySecondPage(
        twoPageDatabase,
        _V41FixtureTime(workspace, site, [now + 1], secondEvidence),
        beforeCommit: () async =>
            throw StateError('injected_page_two_rollback'),
      ),
      throwsStateError,
    );
    expect(
      await twoPageDatabase
          .customSelect('SELECT * FROM shop_connected_cloud_feed_pages')
          .get(),
      hasLength(1),
      reason: 'page, evidence and cursor must roll back together',
    );
    expect(
      await twoPageDatabase
          .customSelect('SELECT * FROM shop_connected_cloud_feed_page_evidence')
          .get(),
      hasLength(1),
    );
    expect(
      (await twoPageDatabase
              .customSelect(
                'SELECT next_sequence FROM shop_connected_cloud_feed_heads',
              )
              .getSingle())
          .read<int>('next_sequence'),
      1,
    );
    await expectLater(
      applySecondPage(
        twoPageDatabase,
        _V41FixtureTime(workspace, site, [now + 1], secondEvidence),
        beforeCommit: () async {
          await ShopConnectedSiteEnrollmentStore(
            database: twoPageDatabase,
            nowMillis: () => now + 500,
          ).importOwnerEvidence(revocation, verifier: verifier);
          secondPageRevocationApplied = true;
        },
      ),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          contains('device is no longer active'),
        ),
      ),
      reason: 'current signed revocation before page-two commit must abort',
    );
    expect(secondPageRevocationApplied, isTrue);
    expect(
      await twoPageDatabase
          .customSelect(
            "SELECT * FROM shop_site_enrollment_evidence WHERE action = 'revoke'",
          )
          .get(),
      isEmpty,
      reason: 'aborted page-two transaction cannot retain half a revocation',
    );
    await applySecondPage(
      twoPageDatabase,
      _V41FixtureTime(workspace, site, [now + 1, now + 2], secondEvidence),
    );
    await twoPageDatabase.close();
    expect(
      () => ShopBackup.verifySnapshot(
        twoPageFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
      reason: 'two signed pages remain reconstructable by backup',
    );
    final twoPageReopened = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(twoPageFile),
      trust: trust,
    );
    await twoPageReopened.verifyReadyForUse();
    await applySecondPage(
      twoPageReopened,
      _V41FixtureTime(
        workspace,
        site,
        [now + 3],
        secondEvidence,
        initialMonotonicAdvance: 2,
      ),
    );
    expect(
      await twoPageReopened
          .customSelect('SELECT * FROM shop_connected_cloud_feed_pages')
          .get(),
      hasLength(2),
      reason: 'same signed second page after restart must not duplicate',
    );
    await expectLater(
      twoPageReopened.testOnlyApplyConnectedCloudFeedSecondPageV41(
        trust: trust,
        timeAuthority: _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
        expected: secondExpected,
        actorRole: 'manager',
        requestNonce: secondNonce,
        pageJson: secondPageJson,
        proofJson: secondProofJson,
        evidence: ShopCloudFeedV41FirstPageEvidence(
          requestJson: requestJson,
          cloudKeyApprovalJson: secondEvidence.cloudKeyApprovalJson,
          enrollmentEvidenceDigest: secondEvidence.enrollmentEvidenceDigest,
          timeEntryDigest: secondEvidence.timeEntryDigest,
          timeAckDigest: secondEvidence.timeAckDigest,
          timeHeadDigest: secondEvidence.timeHeadDigest,
          bootSessionId: secondEvidence.bootSessionId,
          sampleMonotonicMillis: secondEvidence.sampleMonotonicMillis,
        ),
      ),
      throwsStateError,
      reason: 'changed retained request bytes cannot replay page two',
    );
    final alternateNonce = '8' * 64;
    final alternateRequestUnsigned = <String, Object?>{
      ...secondRequestUnsigned,
      'requestNonce': alternateNonce,
    };
    final alternateRequestJson = canonicalConnectedSiteJson({
      ...alternateRequestUnsigned,
      'signature': await signFields(alternateRequestUnsigned, clientPair),
    });
    final alternateRequestDigest = connectedSiteSha256(
      jsonDecode(alternateRequestJson),
    );
    final alternatePageUnsigned = <String, Object?>{
      ...secondPageUnsigned,
      'requestDigest': alternateRequestDigest,
    };
    final alternatePageDigest = connectedSiteSha256(alternatePageUnsigned);
    final alternatePageJson = canonicalConnectedSiteJson({
      ...alternatePageUnsigned,
      'pageDigest': alternatePageDigest,
    });
    final alternateProofUnsigned = <String, Object?>{
      ...secondProofUnsigned,
      'requestNonce': alternateNonce,
      'requestDigest': alternateRequestDigest,
      'pageDigest': alternatePageDigest,
    };
    final alternateProofJson = canonicalConnectedSiteJson({
      ...alternateProofUnsigned,
      'signature': await signFields(alternateProofUnsigned, feedPair),
    });
    await expectLater(
      twoPageReopened.testOnlyApplyConnectedCloudFeedSecondPageV41(
        trust: trust,
        timeAuthority: _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
        expected: ConnectedSiteRetailFeedExpectation(
          workspaceId: workspace,
          siteId: site,
          actorId: 'actor_fixture',
          deviceId: device,
          authorityGeneration: 1,
          revocationGeneration: 1,
          authorityPayloadDigest: authorityPayload.payloadDigest,
          leaseDigest: lease.payloadDigest,
          requestDigest: alternateRequestDigest,
          afterSequence: 1,
          priorEventDigest: 'e' * 64,
          limit: 64,
        ),
        actorRole: 'manager',
        requestNonce: alternateNonce,
        pageJson: alternatePageJson,
        proofJson: alternateProofJson,
        evidence: ShopCloudFeedV41FirstPageEvidence(
          requestJson: alternateRequestJson,
          cloudKeyApprovalJson: secondEvidence.cloudKeyApprovalJson,
          enrollmentEvidenceDigest: secondEvidence.enrollmentEvidenceDigest,
          timeEntryDigest: secondEvidence.timeEntryDigest,
          timeAckDigest: secondEvidence.timeAckDigest,
          timeHeadDigest: secondEvidence.timeHeadDigest,
          bootSessionId: secondEvidence.bootSessionId,
          sampleMonotonicMillis: secondEvidence.sampleMonotonicMillis,
        ),
      ),
      throwsStateError,
      reason: 'an independently signed alternate second page cannot replace it',
    );
    await expectLater(
      applySecondPage(
        twoPageReopened,
        _V41FixtureTime(
          workspace,
          site,
          [now + 30001],
          secondEvidence,
          initialMonotonicAdvance: 30000,
        ),
      ),
      throwsFormatException,
      reason: 'second-page replay cannot renew an expired proof',
    );
    final twoPageArchive = File('${root.path}/two-page.shopbackup');
    const twoPagePassword = 'synthetic-v41-two-page-only';
    await ShopBackup.exportEncrypted(
      database: twoPageReopened,
      archive: twoPageArchive,
      password: twoPagePassword,
      scratchRoot: root,
      testOnlyCloudFeedV41Trust: trust,
    );
    await twoPageReopened.close();
    final unpinnedTarget = File('${root.path}/two-page-unpinned.sqlite');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: twoPageArchive,
        target: unpinnedTarget,
        password: twoPagePassword,
      ),
      throwsFormatException,
      reason: 'nonempty history cannot restore without independent pins',
    );
    expect(await unpinnedTarget.exists(), isFalse);
    expect(await ShopBackup.restoreMarkerFor(unpinnedTarget).exists(), isFalse);
    final twoPageRestoredFile = File('${root.path}/two-page-restored.sqlite');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: twoPageArchive,
      target: twoPageRestoredFile,
      password: twoPagePassword,
      testOnlyCloudFeedV41Trust: trust,
    );
    expect(
      () => ShopBackup.verifySnapshot(
        twoPageRestoredFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
    );
    final twoPageRestored = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(twoPageRestoredFile),
      trust: trust,
    );
    await twoPageRestored.verifyReadyForUse();
    final restoredCloudHead = await twoPageRestored
        .customSelect(
          'SELECT next_sequence, restore_paused FROM shop_connected_cloud_feed_heads',
        )
        .getSingle();
    expect(restoredCloudHead.read<int>('next_sequence'), 2);
    expect(restoredCloudHead.read<int>('restore_paused'), 1);
    expect(
      await twoPageRestored
          .customSelect(
            'SELECT * FROM shop_connected_cloud_feed_restore_barriers',
          )
          .get(),
      hasLength(1),
    );
    await expectLater(
      applySecondPage(
        twoPageRestored,
        _V41FixtureTime(
          workspace,
          site,
          [now + 3],
          secondEvidence,
          initialMonotonicAdvance: 2,
        ),
      ),
      throwsStateError,
      reason: 'restore suspension blocks even byte-identical page replay',
    );
    await twoPageRestored.close();
    final pageEvidence = ShopCloudFeedV41FirstPageEvidence(
      requestJson: requestJson,
      cloudKeyApprovalJson: cloudApprovalJson,
      enrollmentEvidenceDigest: approval.evidenceDigest,
      timeEntryDigest: signedTime.entryDigest,
      timeAckDigest: signedAck.ackDigest,
      timeHeadDigest: timeHead.headDigest,
      bootSessionId: 'b' * 64,
      sampleMonotonicMillis: 8000,
    );
    Future<void> applyFirstPage(
      ShopDatabase target,
      _V41FixtureTime time, {
      Future<void> Function()? beforeCommit,
    }) => target.testOnlyApplyConnectedCloudFeedFirstPageV41(
      trust: trust,
      timeAuthority: time,
      expected: expected,
      actorRole: 'manager',
      requestNonce: requestNonce,
      pageJson: pageJson,
      proofJson: proofJson,
      evidence: pageEvidence,
      testOnlyBeforeCommit: beforeCommit,
    );
    final rollbackFile = await preRevocationFile.copy(
      '${root.path}/rollback.sqlite',
    );
    final rollbackDatabase = ShopDatabase(NativeDatabase(rollbackFile));
    await expectLater(
      applyFirstPage(
        rollbackDatabase,
        _V41FixtureTime(
          workspace,
          site,
          [now],
          ShopCloudFeedV41FirstPageEvidence(
            requestJson: pageEvidence.requestJson,
            cloudKeyApprovalJson: pageEvidence.cloudKeyApprovalJson,
            enrollmentEvidenceDigest: pageEvidence.enrollmentEvidenceDigest,
            timeEntryDigest: '0' * 64,
            timeAckDigest: pageEvidence.timeAckDigest,
            timeHeadDigest: pageEvidence.timeHeadDigest,
            bootSessionId: pageEvidence.bootSessionId,
            sampleMonotonicMillis: pageEvidence.sampleMonotonicMillis,
          ),
        ),
      ),
      throwsStateError,
      reason: 'live time from another signed entry cannot authorize the page',
    );
    await expectLater(
      applyFirstPage(
        rollbackDatabase,
        _V41FixtureTime(workspace, site, [now], pageEvidence),
        beforeCommit: () async => throw StateError('injected_rollback'),
      ),
      throwsStateError,
    );
    await expectLater(
      applyFirstPage(
        rollbackDatabase,
        _V41FixtureTime(workspace, site, [now + 30001], pageEvidence),
      ),
      throwsFormatException,
      reason: 'an already-expired signed page cannot be retained',
    );
    await expectLater(
      applyFirstPage(
        rollbackDatabase,
        _V41FixtureTime(workspace, site, [now, now + 30001], pageEvidence),
      ),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          contains('trusted time changed before commit'),
        ),
      ),
      reason: 'validated trusted-time movement must roll back all rows',
    );
    var revocationAppliedInsideTransaction = false;
    await expectLater(
      applyFirstPage(
        rollbackDatabase,
        _V41FixtureTime(workspace, site, [now], pageEvidence),
        beforeCommit: () async {
          await ShopConnectedSiteEnrollmentStore(
            database: rollbackDatabase,
            nowMillis: () => now + 500,
          ).importOwnerEvidence(revocation, verifier: verifier);
          revocationAppliedInsideTransaction = true;
        },
      ),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          contains('device is no longer active'),
        ),
      ),
      reason: 'a signed revocation before commit must roll back the page',
    );
    expect(revocationAppliedInsideTransaction, isTrue);
    for (final table in const [
      'shop_connected_cloud_feed_streams',
      'shop_connected_cloud_feed_pages',
      'shop_connected_cloud_feed_page_evidence',
      'shop_connected_cloud_feed_heads',
    ]) {
      expect(
        await rollbackDatabase.customSelect('SELECT * FROM $table').get(),
        isEmpty,
      );
    }
    await rollbackDatabase.close();
    expect(
      () => ShopBackup.verifySnapshot(rollbackFile, expectedSchemaVersion: 41),
      returnsNormally,
    );
    final raceFile = await preRevocationFile.copy('${root.path}/race.sqlite');
    final applying = ShopDatabase(NativeDatabase(raceFile));
    final revocationStarted = ReceivePort();
    final revocationReady = Completer<SendPort>();
    final revocationEntered = Completer<void>();
    final revocationResult = Completer<String>();
    final revocationMessages = revocationStarted.listen((message) {
      if (message is SendPort) revocationReady.complete(message);
      if (message == 'started') revocationEntered.complete();
      if (message == 'done') revocationResult.complete('done');
      if (message is String && message.startsWith('error:')) {
        revocationResult.complete(message);
      }
    });
    await Isolate.spawn(_runV41RevocationRace, {
      'port': revocationStarted.sendPort,
      'path': raceFile.path,
      'evidence': revocation.toJson(),
      'ownerKey': ownerKey,
      'workspace': workspace,
      'site': site,
      'coordinator': coordinator,
      'device': device,
      'fingerprint': fingerprint,
      'now': now + 500,
    });
    final readyOrError = await Future.any<Object>([
      revocationReady.future,
      revocationResult.future,
    ]).timeout(const Duration(seconds: 20));
    if (readyOrError is! SendPort) {
      throw StateError('Revocation contender could not open: $readyOrError');
    }
    final startRevocation = readyOrError;
    final atCommit = Completer<void>();
    final releaseCommit = Completer<void>();
    final applyingFuture = applyFirstPage(
      applying,
      _V41FixtureTime(workspace, site, [now], pageEvidence),
      beforeCommit: () async {
        atCommit.complete();
        await releaseCommit.future;
      },
    );
    await atCommit.future.timeout(const Duration(seconds: 5));
    startRevocation.send(true);
    await revocationEntered.future.timeout(const Duration(seconds: 5));
    final contended = await revocationResult.future.timeout(
      const Duration(seconds: 3),
    );
    expect(
      contended,
      contains('database is locked'),
      reason: 'a second connection must fail closed at the write lock',
    );
    releaseCommit.complete();
    await applyingFuture.timeout(const Duration(seconds: 5));
    await revocationMessages.cancel();
    revocationStarted.close();
    expect(
      await applying
          .customSelect(
            "SELECT * FROM shop_site_enrollment_evidence WHERE action = 'revoke'",
          )
          .get(),
      isEmpty,
      reason: 'the contended revocation must not partially persist',
    );
    final revokingAfter = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(raceFile),
      trust: trust,
    );
    await ShopConnectedSiteEnrollmentStore(
      database: revokingAfter,
      nowMillis: () => now + 500,
    ).importOwnerEvidence(revocation, verifier: verifier);
    await revokingAfter.close();
    expect(
      await applying
          .customSelect(
            "SELECT * FROM shop_site_enrollment_evidence WHERE action = 'revoke'",
          )
          .get(),
      hasLength(1),
      reason: 'a fresh transaction may retain the signed later revocation',
    );
    await expectLater(
      applyFirstPage(
        applying,
        _V41FixtureTime(workspace, site, [now], pageEvidence),
      ),
      throwsStateError,
      reason: 'later revocation blocks even exact replay on either connection',
    );
    await applying.close();
    expect(
      () => ShopBackup.verifySnapshot(
        raceFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
      reason: 'historical page remains readable after later revocation',
    );
    final advancingFile = await preRevocationFile.copy(
      '${root.path}/advancing.sqlite',
    );
    final advancing = ShopDatabase(NativeDatabase(advancingFile));
    await applyFirstPage(
      advancing,
      _V41FixtureTime(workspace, site, [now, now + 1], pageEvidence),
    );
    await advancing.close();
    expect(
      () => ShopBackup.verifySnapshot(
        advancingFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
      reason: 'same-boot monotonic advancement inside validity is accepted',
    );
    final delayedFile = await preRevocationFile.copy(
      '${root.path}/delayed-clock.sqlite',
    );
    var delayed = ShopDatabase(NativeDatabase(delayedFile));
    await applyFirstPage(
      delayed,
      _V41FixtureTime(
        workspace,
        site,
        [now + 1, now + 2],
        pageEvidence,
        initialMonotonicAdvance: 1,
      ),
    );
    final retainedDelayedSample = await delayed
        .customSelect(
          'SELECT sample_monotonic_millis, trusted_now_millis '
          'FROM shop_connected_cloud_feed_page_evidence',
        )
        .getSingle();
    expect(retainedDelayedSample.read<int>('sample_monotonic_millis'), 8001);
    expect(retainedDelayedSample.read<int>('trusted_now_millis'), now + 1);
    await delayed.close();
    delayed = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(delayedFile),
      trust: trust,
    );
    await delayed.verifyReadyForUse();
    await applyFirstPage(
      delayed,
      _V41FixtureTime(
        workspace,
        site,
        [now + 3],
        pageEvidence,
        initialMonotonicAdvance: 3,
      ),
    );
    expect(
      await delayed
          .customSelect('SELECT * FROM shop_connected_cloud_feed_pages')
          .get(),
      hasLength(1),
      reason: 'advancing-clock lost-response replay stays exactly once',
    );
    await expectLater(
      applyFirstPage(
        delayed,
        _V41FixtureTime(
          workspace,
          site,
          [now + 30001],
          pageEvidence,
          initialMonotonicAdvance: 30001,
        ),
      ),
      throwsFormatException,
      reason: 'a byte-identical retry cannot renew an expired signed proof',
    );
    await delayed.close();
    expect(
      () => ShopBackup.verifySnapshot(
        delayedFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
    );
    var firstPageDatabase = ShopDatabase(NativeDatabase(preRevocationFile));
    await applyFirstPage(
      firstPageDatabase,
      _V41FixtureTime(workspace, site, [now], pageEvidence),
    );
    await firstPageDatabase.close();
    firstPageDatabase = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(preRevocationFile),
      trust: trust,
    );
    await firstPageDatabase.verifyReadyForUse();
    await applyFirstPage(
      firstPageDatabase,
      _V41FixtureTime(workspace, site, [now], pageEvidence),
    );
    final changedNonce = 'f' * 64;
    final changedRequestUnsigned = {
      ...requestUnsigned,
      'requestNonce': changedNonce,
    };
    final changedRequestJson = canonicalConnectedSiteJson({
      ...changedRequestUnsigned,
      'signature': await signFields(changedRequestUnsigned, clientPair),
    });
    final changedRequestDigest = connectedSiteSha256(
      jsonDecode(changedRequestJson),
    );
    final changedPageUnsigned = {
      ...pageUnsigned,
      'requestDigest': changedRequestDigest,
    };
    final changedPageDigest = connectedSiteSha256(changedPageUnsigned);
    final changedPageJson = canonicalConnectedSiteJson({
      ...changedPageUnsigned,
      'pageDigest': changedPageDigest,
    });
    final changedProofUnsigned = {
      ...proofUnsigned,
      'requestNonce': changedNonce,
      'requestDigest': changedRequestDigest,
      'pageDigest': changedPageDigest,
    };
    final changedProofJson = canonicalConnectedSiteJson({
      ...changedProofUnsigned,
      'signature': await signFields(changedProofUnsigned, feedPair),
    });
    await expectLater(
      firstPageDatabase.testOnlyApplyConnectedCloudFeedFirstPageV41(
        trust: trust,
        timeAuthority: _V41FixtureTime(workspace, site, [now], pageEvidence),
        expected: ConnectedSiteRetailFeedExpectation(
          workspaceId: workspace,
          siteId: site,
          actorId: 'actor_fixture',
          deviceId: device,
          authorityGeneration: 1,
          revocationGeneration: 1,
          authorityPayloadDigest: authorityPayload.payloadDigest,
          leaseDigest: lease.payloadDigest,
          requestDigest: changedRequestDigest,
          afterSequence: 0,
          priorEventDigest: null,
          limit: 64,
        ),
        actorRole: 'manager',
        requestNonce: changedNonce,
        pageJson: changedPageJson,
        proofJson: changedProofJson,
        evidence: ShopCloudFeedV41FirstPageEvidence(
          requestJson: changedRequestJson,
          cloudKeyApprovalJson: cloudApprovalJson,
          enrollmentEvidenceDigest: approval.evidenceDigest,
          timeEntryDigest: signedTime.entryDigest,
          timeAckDigest: signedAck.ackDigest,
          timeHeadDigest: timeHead.headDigest,
          bootSessionId: 'b' * 64,
          sampleMonotonicMillis: 8000,
        ),
      ),
      throwsStateError,
      reason: 'a distinct valid signed request cannot replace cursor zero',
    );
    expect(
      await firstPageDatabase
          .customSelect('SELECT * FROM shop_connected_cloud_feed_pages')
          .get(),
      hasLength(1),
      reason: 'exact replay must not create a second page',
    );
    await firstPageDatabase.close();
    expect(
      () => ShopBackup.verifySnapshot(
        preRevocationFile,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
    );
    expect(
      valid({
        ...history,
        'shop_connected_cloud_feed_pages': [
          ...history['shop_connected_cloud_feed_pages']!,
          history['shop_connected_cloud_feed_pages']!.single,
        ],
      }),
      isFalse,
      reason: 'a second page requires a separately reviewed chain verifier',
    );
    expect(
      valid({...history, 'unreviewed_extra_table': const []}),
      isFalse,
      reason: 'snapshot table inventory must be exact',
    );
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
    database = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(file),
      trust: trust,
    );
    await database.verifyReadyForUse();
    await expectLater(
      applyFirstPage(
        database,
        _V41FixtureTime(workspace, site, [now], pageEvidence),
      ),
      throwsStateError,
      reason: 'current revocation must block an otherwise exact replay',
    );
    expect(
      () => ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      returnsNormally,
    );
    await ShopBackup.exportEncrypted(
      database: database,
      archive: File('${root.path}/signed-history.shopbackup'),
      password: 'synthetic-v41-fixture-password',
      scratchRoot: root,
      testOnlyCloudFeedV41Trust: trust,
    );
    final missingHistory = File('${root.path}/missing-history.sqlite');
    await database.exportVerifiedLocalSnapshot(missingHistory);
    final hostile = sqlite.sqlite3.open(missingHistory.path);
    try {
      const trigger = 'shop_connected_cloud_feed_page_evidence_no_delete';
      final definition =
          hostile.select(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
                [trigger],
              ).single['sql']
              as String;
      hostile.execute('DROP TRIGGER $trigger');
      hostile.execute('DELETE FROM shop_connected_cloud_feed_page_evidence');
      hostile.execute(definition);
    } finally {
      hostile.close();
    }
    expect(
      () => ShopBackup.verifySnapshot(
        missingHistory,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      throwsFormatException,
      reason: 'a complete snapshot with missing request history must fail',
    );
    final missingDatabase = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(missingHistory),
      trust: trust,
    );
    await expectLater(missingDatabase.verifyReadyForUse(), throwsStateError);
    await missingDatabase.close();
    await database.close();
    trust.ownerIssuerKeys['owner_fixture'] = List<int>.filled(32, 0);
    database = ShopDatabase.testOnlyWithCloudFeedV41Trust(
      executor: NativeDatabase(file),
      trust: trust,
    );
    await expectLater(database.verifyReadyForUse(), throwsStateError);
    await database.close();
    expect(
      () => ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 41,
        testOnlyCloudFeedV41Trust: trust,
      ),
      throwsFormatException,
      reason: 'an independently pinned owner key cannot be substituted',
    );
  });
  test(
    'SQLite read transaction keeps one snapshot across a WAL writer',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-v41-wal-read-');
      addTearDown(() => root.delete(recursive: true));
      final file = File('${root.path}/snapshot.sqlite');
      final writer = sqlite.sqlite3.open(file.path);
      addTearDown(writer.close);
      writer.execute('PRAGMA journal_mode = WAL');
      writer.execute(
        'CREATE TABLE historical_fixture (value INTEGER NOT NULL)',
      );
      writer.execute('INSERT INTO historical_fixture VALUES (1)');
      final reader = sqlite.sqlite3.open(
        file.path,
        mode: sqlite.OpenMode.readOnly,
      );
      addTearDown(reader.close);
      reader.execute('BEGIN DEFERRED');
      expect(
        reader.select('SELECT value FROM historical_fixture').single['value'],
        1,
      );
      writer.execute('UPDATE historical_fixture SET value = 2');
      expect(
        reader.select('SELECT value FROM historical_fixture').single['value'],
        1,
      );
      reader.execute('ROLLBACK');
      expect(
        reader.select('SELECT value FROM historical_fixture').single['value'],
        2,
      );
    },
  );
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
        [
          page,
          {...otherPage, 'page_json': page['page_json']},
        ],
        [
          evidence,
          {...evidence, 'page_digest': otherPage['page_digest']},
        ],
      ),
      isFalse,
      reason: 'distinct retained pages must not reuse one signed request',
    );
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

Future<void> _runV41RevocationRace(Map<String, Object> message) async {
  final port = message['port'] as SendPort;
  final fields = message['evidence'] as Map<String, Object>;
  final executor = NativeDatabase(
    File(message['path'] as String),
    setup: (raw) => raw.execute('PRAGMA busy_timeout = 100'),
  );
  final trust = message['trust'] as ShopCloudFeedV41FirstPageTrust?;
  final database = trust == null
      ? ShopDatabase(executor)
      : ShopDatabase.testOnlyWithCloudFeedV41Trust(
          executor: executor,
          trust: trust,
        );
  try {
    await database.verifyReadyForUse();
    final startSignal = ReceivePort();
    port.send(startSignal.sendPort);
    await startSignal.first;
    startSignal.close();
    port.send('started');
    await ShopConnectedSiteEnrollmentStore(
      database: database,
      nowMillis: () => message['now'] as int,
    ).importOwnerEvidence(
      ShopOwnerEnrollmentEvidenceV1(
        action: ShopOwnerEnrollmentAction.revoke,
        tenantId: fields['tenantId'] as String,
        siteId: fields['siteId'] as String,
        coordinatorDeviceId: fields['coordinatorDeviceId'] as String,
        deviceId: fields['deviceId'] as String,
        clientFingerprint: fields['clientFingerprint'] as String,
        sessionGeneration: fields['sessionGeneration'] as int,
        observedAtMillis: fields['observedAtMillis'] as int,
        authorityKeyId: fields['authorityKeyId'] as String,
        signature: fields['signature'] as String,
        evidenceDigest: fields['evidenceDigest'] as String,
      ),
      verifier: _PinnedV41OwnerVerifier(
        ownerKey: message['ownerKey'] as List<int>,
        workspace: message['workspace'] as String,
        site: message['site'] as String,
        coordinator: message['coordinator'] as String,
        device: message['device'] as String,
        fingerprint: message['fingerprint'] as String,
      ),
    );
    port.send('done');
  } on Object catch (error) {
    port.send('error:$error');
  } finally {
    await database.close();
  }
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

final class _V41FixtureTime implements ShopConnectedCloudFeedLiveTimeSource {
  _V41FixtureTime(
    this.workspaceId,
    this.siteId,
    this.values,
    this.evidence, {
    this.initialMonotonicAdvance = 0,
  });

  final String workspaceId;
  final String siteId;
  final List<int> values;
  final ShopCloudFeedV41FirstPageEvidence evidence;
  final int initialMonotonicAdvance;
  var _reads = 0;

  @override
  Future<ConnectedTrustedTimeLiveReading> readLiveTime({
    required String tenantId,
    required String siteId,
  }) async {
    if (tenantId != workspaceId || siteId != this.siteId) {
      throw StateError('fixture_time_scope_mismatch');
    }
    final index = _reads < values.length ? _reads : values.length - 1;
    _reads++;
    return ConnectedTrustedTimeLiveReading(
      entryDigest: evidence.timeEntryDigest,
      ackDigest: evidence.timeAckDigest,
      bootSessionId: evidence.bootSessionId,
      monotonicMillis:
          evidence.sampleMonotonicMillis +
          initialMonotonicAdvance +
          values[index] -
          values.first,
      effectiveTimeMillis: values[index],
    );
  }
}
