import 'dart:convert';

import 'shop_connected_cloud_feed_proof.dart';
import 'shop_connected_cloud_feed_read_request.dart';
import 'shop_connected_retained_signature_verifier.dart';
import 'shop_connected_site_authority_store.dart';
import 'shop_connected_site_cloud_feed_contract.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_enrollment_store.dart';
import 'shop_database.dart';
import 'shop_offline_staff_lease.dart';
import 'shop_staff_authorization.dart';

/// Unfiltered tables required by the single-page historical fixture. Readers
/// must collect every row from every table under one database snapshot.
const shopCloudFeedV41HistoricalTables = <String>[
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

/// Exact retained bytes supplied to the test-only first-page transaction.
/// The writer derives digests and trusted time; none is a permission flag.
final class ShopCloudFeedV41FirstPageEvidence {
  const ShopCloudFeedV41FirstPageEvidence({
    required this.requestJson,
    required this.cloudKeyApprovalJson,
    required this.enrollmentEvidenceDigest,
    required this.timeEntryDigest,
    required this.timeAckDigest,
    required this.timeHeadDigest,
    required this.bootSessionId,
    required this.sampleMonotonicMillis,
  });

  final String requestJson;
  final String cloudKeyApprovalJson;
  final String enrollmentEvidenceDigest;
  final String timeEntryDigest;
  final String timeAckDigest;
  final String timeHeadDigest;
  final String bootSessionId;
  final int sampleMonotonicMillis;
}

/// Independently reviewed exact fixture identity and issuer pins. Product
/// builds have no such pins. A database row must never populate these fields.
final class ShopCloudFeedV41FirstPageTrust {
  const ShopCloudFeedV41FirstPageTrust({
    required this.workspaceId,
    required this.siteId,
    required this.actorId,
    required this.deviceId,
    required this.coordinatorDeviceId,
    required this.clientFingerprint,
    required this.clientSigningKeyId,
    required this.sessionGeneration,
    required this.authoritySequence,
    required this.revocationGeneration,
    required this.cloudIssuerGeneration,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.timeAuthorityKeyId,
    required this.timeAuthorityKeyGeneration,
    required this.timeAuthorityEpoch,
    required this.feedIssuerKeys,
    required this.cloudApprovalIssuerKeys,
    required this.leaseIssuerKeys,
    required this.authorityIssuerKeys,
    required this.ownerIssuerKeys,
    required this.timeAuthorityKeys,
    required this.clientKeys,
  });

  final String workspaceId;
  final String siteId;
  final String actorId;
  final String deviceId;
  final String coordinatorDeviceId;
  final String clientFingerprint;
  final String clientSigningKeyId;
  final int sessionGeneration;
  final int authoritySequence;
  final int revocationGeneration;
  final int cloudIssuerGeneration;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
  final String timeAuthorityKeyId;
  final int timeAuthorityKeyGeneration;
  final int timeAuthorityEpoch;
  final Map<String, List<int>> feedIssuerKeys;
  final Map<String, List<int>> cloudApprovalIssuerKeys;
  final Map<String, List<int>> leaseIssuerKeys;
  final Map<String, List<int>> authorityIssuerKeys;
  final Map<String, List<int>> ownerIssuerKeys;
  final Map<String, List<int>> timeAuthorityKeys;
  final Map<String, List<int>> clientKeys;

  ShopCloudFeedV41FirstPageTrust immutableCopy() =>
      ShopCloudFeedV41FirstPageTrust(
        workspaceId: workspaceId,
        siteId: siteId,
        actorId: actorId,
        deviceId: deviceId,
        coordinatorDeviceId: coordinatorDeviceId,
        clientFingerprint: clientFingerprint,
        clientSigningKeyId: clientSigningKeyId,
        sessionGeneration: sessionGeneration,
        authoritySequence: authoritySequence,
        revocationGeneration: revocationGeneration,
        cloudIssuerGeneration: cloudIssuerGeneration,
        coordinatorBindingDigest: coordinatorBindingDigest,
        coordinatorBindingGeneration: coordinatorBindingGeneration,
        timeAuthorityKeyId: timeAuthorityKeyId,
        timeAuthorityKeyGeneration: timeAuthorityKeyGeneration,
        timeAuthorityEpoch: timeAuthorityEpoch,
        feedIssuerKeys: _immutableKeys(feedIssuerKeys),
        cloudApprovalIssuerKeys: _immutableKeys(cloudApprovalIssuerKeys),
        leaseIssuerKeys: _immutableKeys(leaseIssuerKeys),
        authorityIssuerKeys: _immutableKeys(authorityIssuerKeys),
        ownerIssuerKeys: _immutableKeys(ownerIssuerKeys),
        timeAuthorityKeys: _immutableKeys(timeAuthorityKeys),
        clientKeys: _immutableKeys(clientKeys),
      );
}

Map<String, List<int>> _immutableKeys(Map<String, List<int>> keys) =>
    Map<String, List<int>>.unmodifiable({
      for (final entry in keys.entries)
        entry.key: List<int>.unmodifiable(entry.value),
    });

/// Snapshot tables must be full, unfiltered reads from one transaction or
/// read-only SQLite snapshot. This first-page historical check never grants
/// present permission, clears a restore barrier, or renews same-boot time.
bool shopCloudFeedFirstPageHistoricalRowsValidV41({
  required ShopCloudFeedV41FirstPageTrust trust,
  required Map<String, List<Map<String, Object?>>> completeTables,
}) {
  try {
    if (completeTables.keys.toSet().length !=
            shopCloudFeedV41HistoricalTables.length ||
        !completeTables.keys.toSet().containsAll(
          shopCloudFeedV41HistoricalTables,
        )) {
      return false;
    }
    List<Map<String, Object?>> rows(String name) =>
        completeTables[name] ??
        (throw const FormatException('v41_history_table_missing'));
    final streams = rows('shop_connected_cloud_feed_streams');
    final pages = rows('shop_connected_cloud_feed_pages');
    final heads = rows('shop_connected_cloud_feed_heads');
    final barriers = rows('shop_connected_cloud_feed_restore_barriers');
    final evidence = rows('shop_connected_cloud_feed_page_evidence');
    if (streams.length != 1 ||
        pages.length != 1 ||
        heads.length != 1 ||
        evidence.length != 1 ||
        !shopConnectedCloudFeedRowsValidV40(
          streams: streams,
          pages: pages,
          heads: heads,
          restoreBarriers: barriers,
          trustedIssuerKeys: trust.feedIssuerKeys,
        ) ||
        !shopConnectedCloudFeedEvidenceCoverageV41(
          pages: pages,
          evidence: evidence,
        ) ||
        !shopConnectedEnrollmentRowsValidV25(
          pairingNonces: rows('shop_site_pairing_nonces'),
          pendingEnrollments: rows('shop_site_pending_enrollments'),
          enrollmentEvidence: rows('shop_site_enrollment_evidence'),
          devices: rows('shop_site_devices'),
          requestNonces: rows('shop_site_request_nonces'),
        ) ||
        !shopConnectedAuthorityPayloadRowsValidV30(
          payloads: rows('shop_site_authority_payloads'),
          members: rows('shop_site_authority_members'),
          configurations: rows('shop_site_configuration_snapshots'),
          deltas: rows('shop_site_authority_deltas'),
        ) ||
        !shopConnectedAuthorityCheckpointRowsValidV36(
          checkpoints: rows('shop_site_authority_checkpoints'),
          bootstrapProvenance: rows('shop_site_authority_bootstrap_provenance'),
          payloads: rows('shop_site_authority_payloads'),
        ) ||
        !shopHistoricalCloudProofRowsValidV34(
          commands: rows('shop_site_commands'),
          requirements: rows('shop_site_cloud_proof_requirements'),
          proofs: rows('shop_site_cloud_proofs'),
          retainedLeases: rows('shop_site_offline_lease_payloads'),
          leases: rows('shop_site_offline_leases'),
        ) ||
        !shopConnectedTrustedTimeClientRowsValidV39(
          entries: rows('shop_connected_time_client_entries'),
          acks: rows('shop_connected_time_client_acks'),
          heads: rows('shop_connected_time_client_heads'),
          barriers: rows('shop_connected_time_client_restore_barriers'),
          clearances: rows('shop_connected_time_client_restore_clearances'),
        )) {
      return false;
    }
    final stream = streams.single;
    final pageRow = pages.single;
    final proofRow = evidence.single;
    final sample = proofRow['trusted_now_millis'];
    if (sample is! int ||
        sample <= 0 ||
        stream['workspace_id'] != trust.workspaceId ||
        stream['site_id'] != trust.siteId ||
        stream['actor_id'] != trust.actorId ||
        stream['device_id'] != trust.deviceId ||
        !const {'owner', 'manager'}.contains(stream['actor_role']) ||
        stream['authority_generation'] != trust.authoritySequence ||
        stream['revocation_generation'] != trust.revocationGeneration ||
        pageRow['after_sequence'] != 0 ||
        pageRow['prior_event_digest'] != null) {
      return false;
    }
    final pageJson = pageRow['page_json'] as String;
    final pageDecoded = jsonDecode(pageJson) as Map<String, dynamic>;
    final expected = ConnectedSiteRetailFeedExpectation(
      workspaceId: trust.workspaceId,
      siteId: trust.siteId,
      actorId: trust.actorId,
      deviceId: trust.deviceId,
      authorityGeneration: trust.authoritySequence,
      revocationGeneration: trust.revocationGeneration,
      authorityPayloadDigest: stream['authority_payload_digest'] as String,
      leaseDigest: stream['lease_digest'] as String,
      requestDigest: pageDecoded['requestDigest'] as String,
      afterSequence: 0,
      priorEventDigest: null,
      limit: 64,
    );
    final page = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: pageJson,
      expected: expected,
    );
    final proofJson = pageRow['authenticated_proof_json'] as String;
    ConnectedCloudFeedPinnedIssuerVerifier(trust.feedIssuerKeys).verifySync(
      ConnectedCloudFeedProofV1.parse(
        canonicalBytes: proofJson,
        page: page,
        expected: expected,
        requestNonce: pageRow['request_nonce'] as String,
        actorRole: stream['actor_role'] as String,
        trustedNowMillis: sample,
      ),
    );

    final pending = rows('shop_site_pending_enrollments')
        .where((row) => row['client_fingerprint'] == trust.clientFingerprint)
        .toList(growable: false);
    final devices = rows('shop_site_devices')
        .where((row) => row['device_id'] == trust.deviceId)
        .toList(growable: false);
    final ownerRows =
        rows('shop_site_enrollment_evidence')
            .where((row) => row['device_id'] == trust.deviceId)
            .toList(growable: false)
          ..sort(
            (a, b) => (a['observed_at_millis'] as int).compareTo(
              b['observed_at_millis'] as int,
            ),
          );
    if (pending.length != 1 || devices.length != 1 || ownerRows.isEmpty) {
      return false;
    }
    final pendingRow = pending.single;
    final deviceRow = devices.single;
    if (pendingRow['tenant_id'] != trust.workspaceId ||
        pendingRow['site_id'] != trust.siteId ||
        pendingRow['coordinator_device_id'] != trust.coordinatorDeviceId ||
        deviceRow['tenant_id'] != trust.workspaceId ||
        deviceRow['site_id'] != trust.siteId ||
        deviceRow['public_key_fingerprint'] != trust.clientFingerprint ||
        deviceRow['session_generation'] is! int ||
        (deviceRow['session_generation'] as int) < trust.sessionGeneration ||
        (deviceRow['enrolled_at_millis'] as int) > sample ||
        (deviceRow['revoked_at_millis'] is int &&
            (deviceRow['revoked_at_millis'] as int) <= sample)) {
      return false;
    }
    for (final row in ownerRows) {
      final bytes = row['evidence_json'] as String;
      final decoded = jsonDecode(bytes) as Map<String, dynamic>;
      if (canonicalConnectedSiteJson(decoded) != bytes ||
          row['evidence_digest'] != decoded['evidenceDigest'] ||
          row['action'] != decoded['action'] ||
          row['tenant_id'] != trust.workspaceId ||
          row['site_id'] != trust.siteId ||
          row['client_fingerprint'] != trust.clientFingerprint ||
          row['coordinator_device_id'] != trust.coordinatorDeviceId) {
        return false;
      }
      final unsigned = Map<String, Object?>.from(decoded)
        ..remove('signature')
        ..remove('evidenceDigest');
      if (connectedSiteSha256(unsigned) != decoded['evidenceDigest'] ||
          !verifyPinnedRetainedEd25519Sync(
            canonicalSigningBytes: canonicalConnectedSiteJson(unsigned),
            signature: decoded['signature'] as String,
            keyId: decoded['authorityKeyId'] as String,
            pinnedKeys: trust.ownerIssuerKeys,
          )) {
        return false;
      }
    }
    final priorOwner = ownerRows
        .where((row) => (row['observed_at_millis'] as int) <= sample)
        .toList(growable: false);
    if (priorOwner.isEmpty ||
        priorOwner.last['action'] != 'approve' ||
        priorOwner.last['evidence_digest'] !=
            proofRow['enrollment_evidence_digest'] ||
        priorOwner.last['session_generation'] != trust.sessionGeneration ||
        priorOwner.last['observed_at_millis'] !=
            deviceRow['enrolled_at_millis']) {
      return false;
    }
    verifyRetainedEnrollmentApprovalSync(
      canonicalEvidenceJson: priorOwner.last['evidence_json'] as String,
      expectedEvidenceDigest: priorOwner.last['evidence_digest'] as String,
      tenantId: trust.workspaceId,
      siteId: trust.siteId,
      coordinatorDeviceId: trust.coordinatorDeviceId,
      deviceId: trust.deviceId,
      clientFingerprint: trust.clientFingerprint,
      sessionGeneration: trust.sessionGeneration,
      trustedAtMillis: sample,
      pinnedOwnerIssuerKeys: trust.ownerIssuerKeys,
    );

    final leaseRows = rows('shop_site_offline_lease_payloads')
        .where((row) => row['payload_digest'] == stream['lease_digest'])
        .toList(growable: false);
    final baseLeases = rows('shop_site_offline_leases')
        .where((row) => row['payload_digest'] == stream['lease_digest'])
        .toList(growable: false);
    if (leaseRows.length != 1 ||
        baseLeases.length != 1 ||
        proofRow['lease_digest'] != stream['lease_digest']) {
      return false;
    }
    final leaseJson = leaseRows.single['lease_json'] as String;
    final lease = OfflineStaffLeaseV1.fromJson(jsonDecode(leaseJson));
    if (canonicalConnectedSiteJson(jsonDecode(leaseJson)) != leaseJson ||
        leaseRows.single['lease_bytes_digest'] !=
            connectedSiteSha256(jsonDecode(leaseJson)) ||
        lease.payloadDigest != stream['lease_digest'] ||
        lease.actorId != trust.actorId ||
        lease.role != stream['actor_role'] ||
        baseLeases.single['actor_id'] != lease.actorId ||
        baseLeases.single['signature'] != lease.signature) {
      return false;
    }
    verifyRetainedOfflineStaffLeaseSync(
      lease: lease,
      expected: ShopOfflineStaffLeaseExpectedBinding(
        tenantId: trust.workspaceId,
        siteId: trust.siteId,
        deviceId: trust.deviceId,
        sessionGeneration: trust.sessionGeneration,
        revocationGeneration: trust.revocationGeneration,
        requiredCapability: ShopStaffCapability.managementRead,
      ),
      trustedAtMillis: sample,
      pinnedIssuerKeys: trust.leaseIssuerKeys,
    );

    final authorityRows =
        rows('shop_site_authority_payloads')
            .where(
              (row) =>
                  row['tenant_id'] == trust.workspaceId &&
                  row['site_id'] == trust.siteId,
            )
            .toList(growable: false)
          ..sort(
            (a, b) => (a['authority_sequence'] as int).compareTo(
              b['authority_sequence'] as int,
            ),
          );
    if (authorityRows.isEmpty) return false;
    String? predecessor;
    Map<String, Object?>? activeAuthority;
    for (var index = 0; index < authorityRows.length; index++) {
      final row = authorityRows[index];
      final payload = ConnectedSiteAuthorityPayloadV1.parse(
        canonicalBytes: row['payload_bytes'] as String,
        signature: row['signature'] as String,
      );
      if (payload.authoritySequence != index + 1 ||
          payload.previousAuthorityDigest != predecessor ||
          payload.payloadDigest != row['payload_digest'] ||
          !verifyPinnedRetainedEd25519Sync(
            canonicalSigningBytes: payload.canonicalBytes,
            signature: payload.signature,
            keyId: payload.issuerKeyId,
            pinnedKeys: trust.authorityIssuerKeys,
          )) {
        return false;
      }
      predecessor = payload.payloadDigest;
      if (payload.issuedAtMillis <= sample) activeAuthority = row;
    }
    if (activeAuthority == null ||
        activeAuthority['authority_sequence'] != trust.authoritySequence ||
        activeAuthority['payload_digest'] !=
            stream['authority_payload_digest'] ||
        proofRow['authority_payload_digest'] !=
            stream['authority_payload_digest']) {
      return false;
    }
    verifyRetainedAuthorityForLeaseSync(
      canonicalBytes: activeAuthority['payload_bytes'] as String,
      signature: activeAuthority['signature'] as String,
      expectedPayloadDigest: activeAuthority['payload_digest'] as String,
      expectedSequence: trust.authoritySequence,
      expectedPreviousDigest:
          activeAuthority['previous_authority_digest'] as String?,
      lease: lease,
      trustedAtMillis: sample,
      pinnedIssuerKeys: trust.authorityIssuerKeys,
    );
    final checkpoints = rows('shop_site_authority_checkpoints')
        .where(
          (row) =>
              row['tenant_id'] == trust.workspaceId &&
              row['site_id'] == trust.siteId &&
              row['device_id'] == trust.deviceId,
        )
        .toList(growable: false);
    if (checkpoints.length != 1) return false;
    final checkpoint = ConnectedSiteAuthorityCheckpointV1.parse(
      canonicalBytes: checkpoints.single['checkpoint_bytes'] as String,
      signature: checkpoints.single['signature'] as String,
    );
    if (checkpoint.checkpointDigest !=
            checkpoints.single['checkpoint_digest'] ||
        checkpoint.issuedAtMillis > sample ||
        checkpoint.payloads.isEmpty ||
        checkpoint.payloads.length > authorityRows.length ||
        !verifyPinnedRetainedEd25519Sync(
          canonicalSigningBytes: checkpoint.canonicalBytes,
          signature: checkpoint.signature,
          keyId: checkpoint.issuerKeyId,
          pinnedKeys: trust.authorityIssuerKeys,
        )) {
      return false;
    }
    for (var index = 0; index < checkpoint.payloads.length; index++) {
      if (checkpoint.payloads[index].canonicalBytes !=
              authorityRows[index]['payload_bytes'] ||
          checkpoint.payloads[index].signature !=
              authorityRows[index]['signature']) {
        return false;
      }
    }

    final timeEntries = rows('shop_connected_time_client_entries');
    final timeAcks = rows('shop_connected_time_client_acks');
    final timeHeads = rows('shop_connected_time_client_heads');
    if (timeEntries.length != 1 ||
        timeAcks.length != 1 ||
        timeHeads.length != 1 ||
        timeEntries.single['entry_digest'] != proofRow['time_entry_digest'] ||
        timeAcks.single['ack_digest'] != proofRow['time_ack_digest'] ||
        timeHeads.single['head_digest'] != proofRow['time_head_digest']) {
      return false;
    }
    if (!verifyRetainedTrustedTimeSampleV39Sync(
      entryJson: timeEntries.single['entry_json'] as String,
      ackJson: timeAcks.single['ack_json'] as String,
      entryDigest: proofRow['time_entry_digest'] as String,
      ackDigest: proofRow['time_ack_digest'] as String,
      headDigest: proofRow['time_head_digest'] as String,
      workspaceId: trust.workspaceId,
      siteId: trust.siteId,
      coordinatorDeviceId: trust.coordinatorDeviceId,
      deviceId: trust.deviceId,
      clientFingerprint: trust.clientFingerprint,
      clientSigningKeyId: trust.clientSigningKeyId,
      sessionGeneration: trust.sessionGeneration,
      coordinatorBindingDigest: trust.coordinatorBindingDigest,
      coordinatorBindingGeneration: trust.coordinatorBindingGeneration,
      authorityKeyId: trust.timeAuthorityKeyId,
      authorityKeyGeneration: trust.timeAuthorityKeyGeneration,
      authorityEpoch: trust.timeAuthorityEpoch,
      bootSessionId: proofRow['boot_session_id'] as String,
      sampleMonotonicMillis: proofRow['sample_monotonic_millis'] as int,
      trustedNowMillis: sample,
      pinnedAuthorityKeys: trust.timeAuthorityKeys,
      pinnedClientKeys: trust.clientKeys,
    )) {
      return false;
    }

    final approvalJson = proofRow['cloud_key_approval_json'] as String;
    final requestJson = proofRow['request_json'] as String;
    verifyRetainedCloudFeedReadWithApprovalSync(
      requestBytes: requestJson,
      approvalBytes: approvalJson,
      approvalDigest: proofRow['cloud_key_approval_digest'] as String,
      pinnedCloudIssuerKeys: trust.cloudApprovalIssuerKeys,
      pinnedIssuerKeyGeneration: trust.cloudIssuerGeneration,
      expectedApprovalSequence: 1,
      expectedPreviousApprovalDigest: null,
      expected: expected,
      requestNonce: pageRow['request_nonce'] as String,
      clientFingerprint: trust.clientFingerprint,
      enrollmentEvidenceDigest: priorOwner.last['evidence_digest'] as String,
      expectedPendingEnrollmentPublicKey: (pendingRow['public_key'] as List)
          .cast<int>(),
      signingKeyId: trust.clientSigningKeyId,
      sessionGeneration: trust.sessionGeneration,
      trustedAtIssueMillis: sample,
    );
    final approvalDecoded = jsonDecode(approvalJson) as Map<String, dynamic>;
    final requestDecoded = jsonDecode(requestJson) as Map<String, dynamic>;
    final approvalIssued = approvalDecoded['issuedAtMillis'] as int;
    final requestIssued = DateTime.parse(requestDecoded['issuedAt'] as String)
        .millisecondsSinceEpoch;
    final proofDecoded = jsonDecode(proofJson) as Map<String, dynamic>;
    return approvalIssued >= (priorOwner.last['observed_at_millis'] as int) &&
        requestIssued >= approvalIssued &&
        requestIssued >= lease.issuedAtMillis &&
        requestIssued >= (activeAuthority['issued_at_millis'] as int) &&
        (proofDecoded['issuedAtMillis'] as int) >= requestIssued &&
        sample < (deviceRow['revoked_at_millis'] as int? ?? sample + 1);
  } on Object {
    return false;
  }
}
