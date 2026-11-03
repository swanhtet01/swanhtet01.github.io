import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import 'shop_connected_site_cloud_feed_contract.dart';
import 'shop_connected_cloud_device_key_approval.dart';
import 'shop_connected_retained_signature_verifier.dart';
import 'shop_connected_site_authority_store.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_offline_staff_lease.dart';
import 'shop_staff_authorization.dart';

const connectedCloudFeedReadRequestContract =
    'supermega.connected-site-event-read-request.v1';

/// Historical request proof for one retained v41 page. All expected approval
/// chain and issuer values must be supplied from independently authenticated
/// state, never copied from the retained approval or request JSON.
void verifyRetainedCloudFeedReadWithApprovalSync({
  required String requestBytes,
  required String approvalBytes,
  required String approvalDigest,
  required Map<String, List<int>> pinnedCloudIssuerKeys,
  required int pinnedIssuerKeyGeneration,
  required int expectedApprovalSequence,
  required String? expectedPreviousApprovalDigest,
  required ConnectedSiteRetailFeedExpectation expected,
  required String requestNonce,
  required String clientFingerprint,
  required String enrollmentEvidenceDigest,
  required String signingKeyId,
  required int sessionGeneration,
  required int trustedAtIssueMillis,
}) {
  final approval = ConnectedCloudDeviceKeyApprovalV1.parseAndVerifyAt(
    canonicalBytes: approvalBytes,
    pinnedCloudIssuerKeys: pinnedCloudIssuerKeys,
    workspaceId: expected.workspaceId,
    siteId: expected.siteId,
    deviceId: expected.deviceId,
    clientFingerprint: clientFingerprint,
    enrollmentEvidenceDigest: enrollmentEvidenceDigest,
    signingKeyId: signingKeyId,
    pinnedIssuerKeyGeneration: pinnedIssuerKeyGeneration,
    expectedApprovalSequence: expectedApprovalSequence,
    expectedPreviousApprovalDigest: expectedPreviousApprovalDigest,
    sessionGeneration: sessionGeneration,
    revocationGeneration: expected.revocationGeneration,
    trustedAtMillis: trustedAtIssueMillis,
  );
  if (approval.approvalDigest != approvalDigest) {
    throw const FormatException(
      'connected_cloud_device_approval_digest_mismatch',
    );
  }
  verifyRetainedCloudFeedReadRequestSync(
    canonicalBytes: requestBytes,
    expected: expected,
    requestNonce: requestNonce,
    clientFingerprint: approval.clientFingerprint,
    enrollmentEvidenceDigest: approval.enrollmentEvidenceDigest,
    signingKeyId: approval.signingKeyId,
    approvedCloudSigningPublicKey: approval.publicKey,
    trustedAtIssueMillis: trustedAtIssueMillis,
  );
}

/// Historical signature check for the synchronous backup reader. The caller
/// must supply a separately approved cloud-request public key; a pairing key
/// fetched from this database is not, by itself, a cloud trust root. This
/// verifies neither current membership nor permission to apply a new page.
void verifyRetainedCloudFeedReadRequestSync({
  required String canonicalBytes,
  required ConnectedSiteRetailFeedExpectation expected,
  required String requestNonce,
  required String clientFingerprint,
  required String enrollmentEvidenceDigest,
  required String signingKeyId,
  required List<int> approvedCloudSigningPublicKey,
  required int trustedAtIssueMillis,
}) {
  Never invalid() => throw const FormatException(
    'connected_cloud_feed_retained_request_invalid',
  );
  if (canonicalBytes.length > 8192 ||
      approvedCloudSigningPublicKey.length != 32 ||
      trustedAtIssueMillis < 1 ||
      !_identifier.hasMatch(expected.workspaceId) ||
      !_identifier.hasMatch(expected.siteId) ||
      !_identifier.hasMatch(expected.actorId) ||
      !_identifier.hasMatch(expected.deviceId) ||
      !_digest.hasMatch(expected.authorityPayloadDigest) ||
      !_digest.hasMatch(expected.leaseDigest) ||
      !_digest.hasMatch(expected.requestDigest) ||
      (expected.priorEventDigest != null &&
          !_digest.hasMatch(expected.priorEventDigest!)) ||
      expected.authorityGeneration < 0 ||
      expected.revocationGeneration < 0 ||
      expected.afterSequence < 0 ||
      expected.afterSequence > 9223372036854775807 ||
      expected.limit < 1 ||
      expected.limit > 64 ||
      ((expected.afterSequence == 0) != (expected.priorEventDigest == null))) {
    invalid();
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(canonicalBytes);
  } on FormatException {
    invalid();
  }
  if (decoded is! Map<String, dynamic> ||
      decoded.keys.toSet().difference(_keys).isNotEmpty ||
      decoded.length != _keys.length ||
      canonicalConnectedSiteJson(decoded) != canonicalBytes ||
      decoded['contract'] != connectedCloudFeedReadRequestContract ||
      decoded['signatureAlgorithm'] != 'ed25519' ||
      decoded['authorityGeneration'] is! int ||
      decoded['revocationGeneration'] is! int ||
      decoded['afterSequence'] is! int ||
      decoded['limit'] is! int ||
      (decoded['afterSequence'] as int) < 0 ||
      (decoded['afterSequence'] as int) > 9223372036854775807 ||
      (decoded['limit'] as int) < 1 ||
      (decoded['limit'] as int) > 64 ||
      ((decoded['afterSequence'] as int) == 0
          ? decoded['priorEventDigest'] != null
          : decoded['priorEventDigest'] is! String ||
                !_digest.hasMatch(decoded['priorEventDigest'] as String)) ||
      decoded['workspaceId'] != expected.workspaceId ||
      decoded['siteId'] != expected.siteId ||
      decoded['actorId'] != expected.actorId ||
      decoded['deviceId'] != expected.deviceId ||
      decoded['clientFingerprint'] != clientFingerprint ||
      decoded['enrollmentEvidenceDigest'] != enrollmentEvidenceDigest ||
      decoded['signingKeyId'] != signingKeyId ||
      decoded['authorityGeneration'] != expected.authorityGeneration ||
      decoded['revocationGeneration'] != expected.revocationGeneration ||
      decoded['authorityPayloadDigest'] != expected.authorityPayloadDigest ||
      decoded['leaseDigest'] != expected.leaseDigest ||
      decoded['requestNonce'] != requestNonce ||
      decoded['afterSequence'] != expected.afterSequence ||
      decoded['priorEventDigest'] != expected.priorEventDigest ||
      decoded['limit'] != expected.limit ||
      connectedSiteSha256(decoded) != expected.requestDigest ||
      !_digest.hasMatch(requestNonce) ||
      !_digest.hasMatch(clientFingerprint) ||
      !_digest.hasMatch(enrollmentEvidenceDigest) ||
      !_identifier.hasMatch(signingKeyId)) {
    invalid();
  }
  final issuedText = decoded['issuedAt'];
  if (issuedText is! String || !_timestamp.hasMatch(issuedText)) invalid();
  final DateTime issued;
  try {
    issued = DateTime.parse(issuedText);
    final normalized =
        '${issued.toUtc().toIso8601String().split('.').first}.${issued.millisecond.toString().padLeft(3, '0')}Z';
    if (normalized != issuedText) {
      invalid();
    }
  } on FormatException {
    invalid();
  }
  final issuedMillis = issued.millisecondsSinceEpoch;
  if (issuedMillis > trustedAtIssueMillis ||
      trustedAtIssueMillis - issuedMillis > 30000) {
    invalid();
  }
  final signatureText = decoded['signature'];
  if (signatureText is! String ||
      !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signatureText)) {
    invalid();
  }
  final List<int> signature;
  try {
    signature = base64Url.decode('$signatureText==');
  } on FormatException {
    invalid();
  }
  final unsigned = Map<String, Object?>.from(decoded)..remove('signature');
  if (signature.length != 64 ||
      base64Url.encode(signature).replaceAll('=', '') != signatureText ||
      !verifyPinnedRetainedEd25519Sync(
        canonicalSigningBytes: canonicalConnectedSiteJson(unsigned),
        signature: signatureText,
        keyId: signingKeyId,
        pinnedKeys: {signingKeyId: approvedCloudSigningPublicKey},
      )) {
    invalid();
  }
}

/// Verifies one exact signed event-read request. Its expected binding and
/// device key must come from independently authenticated current state, never
/// from the request itself. This parser is not a mounted sync authorization.
final class ConnectedCloudFeedReadRequestV1 {
  const ConnectedCloudFeedReadRequestV1._({
    required this.canonicalBytes,
    required this.expected,
    required this.actorRole,
    required this.requestNonce,
    required this.issuedAtMillis,
  });

  final String canonicalBytes;
  final ConnectedSiteRetailFeedExpectation expected;
  final String actorRole;
  final String requestNonce;
  final int issuedAtMillis;

  static Future<ConnectedCloudFeedReadRequestV1> parseAndVerify({
    required String canonicalBytes,
    required OfflineStaffLeaseV1 lease,
    required ShopOfflineStaffLeaseVerifier leaseVerifier,
    required ShopOfflineStaffLeaseExpectedBinding leaseBinding,
    required String clientFingerprint,
    required String enrollmentEvidenceDigest,
    required String signingKeyId,
    required List<int> signingPublicKey,
    required int authorityGeneration,
    required String currentAuthorityBytes,
    required String currentAuthoritySignature,
    required ConnectedSiteAuthorityPayloadVerifier authorityVerifier,
    required int trustedNowMillis,
  }) async {
    Never invalid() => throw const FormatException(
      'connected_cloud_feed_read_request_invalid',
    );
    if (canonicalBytes.length > 8192 ||
        signingPublicKey.length != 32 ||
        authorityGeneration < 0 ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(enrollmentEvidenceDigest) ||
        trustedNowMillis < 0) {
      invalid();
    }
    final Object? decoded;
    try {
      decoded = jsonDecode(canonicalBytes);
    } on FormatException {
      invalid();
    }
    if (decoded is! Map<String, dynamic> ||
        decoded.keys.toSet().difference(_keys).isNotEmpty ||
        decoded.length != _keys.length ||
        canonicalConnectedSiteJson(decoded) != canonicalBytes ||
        decoded['contract'] != connectedCloudFeedReadRequestContract ||
        decoded['signatureAlgorithm'] != 'ed25519') {
      invalid();
    }
    for (final field in [
      'workspaceId',
      'siteId',
      'actorId',
      'deviceId',
      'signingKeyId',
    ]) {
      if (decoded[field] is! String ||
          !_identifier.hasMatch(decoded[field] as String)) {
        invalid();
      }
    }
    for (final field in [
      'clientFingerprint',
      'enrollmentEvidenceDigest',
      'authorityPayloadDigest',
      'leaseDigest',
      'requestNonce',
    ]) {
      if (decoded[field] is! String ||
          !_digest.hasMatch(decoded[field] as String)) {
        invalid();
      }
    }
    final issuedText = decoded['issuedAt'];
    if (issuedText is! String || !_timestamp.hasMatch(issuedText)) invalid();
    final DateTime issued;
    try {
      issued = DateTime.parse(issuedText);
      if (issued.toUtc().toIso8601String().replaceFirst('Z', '.000Z') !=
          issuedText) {
        // The canonical wire shape always has exactly three fractional digits.
        final normalized =
            '${issued.toUtc().toIso8601String().split('.').first}.${issued.millisecond.toString().padLeft(3, '0')}Z';
        if (normalized != issuedText) invalid();
      }
    } on FormatException {
      invalid();
    }
    final issuedAtMillis = issued.millisecondsSinceEpoch;
    if (issuedAtMillis > trustedNowMillis ||
        trustedNowMillis - issuedAtMillis > 30000) {
      invalid();
    }
    final after = decoded['afterSequence'];
    final limit = decoded['limit'];
    final prior = decoded['priorEventDigest'];
    if (after is! int ||
        after < 0 ||
        after > 9223372036854775807 ||
        limit is! int ||
        limit < 1 ||
        limit > 64 ||
        (after == 0
            ? prior != null
            : prior is! String || !_digest.hasMatch(prior))) {
      invalid();
    }
    if (decoded['workspaceId'] != leaseBinding.tenantId ||
        decoded['siteId'] != leaseBinding.siteId ||
        decoded['deviceId'] != leaseBinding.deviceId ||
        decoded['actorId'] != lease.actorId ||
        decoded['signingKeyId'] != signingKeyId ||
        decoded['clientFingerprint'] != clientFingerprint ||
        decoded['enrollmentEvidenceDigest'] != enrollmentEvidenceDigest ||
        decoded['authorityGeneration'] != authorityGeneration ||
        decoded['revocationGeneration'] != leaseBinding.revocationGeneration ||
        decoded['leaseDigest'] != lease.payloadDigest ||
        leaseBinding.requiredCapability != ShopStaffCapability.managementRead) {
      invalid();
    }
    final verifiedLease = await leaseVerifier.verify(
      lease: lease,
      expected: leaseBinding,
      nowMillis: trustedNowMillis,
    );
    final authority = ConnectedSiteAuthorityPayloadV1.parse(
      canonicalBytes: currentAuthorityBytes,
      signature: currentAuthoritySignature,
    );
    await authorityVerifier.verify(
      canonicalPayloadBytes: authority.canonicalBytes,
      signature: authority.signature,
      issuerKeyId: authority.issuerKeyId,
    );
    final currentMembers = authority.members.where(
      (member) => member.actorId == verifiedLease.actorId,
    );
    if (authority.workspaceId != leaseBinding.tenantId ||
        authority.siteId != leaseBinding.siteId ||
        authority.revocationGeneration != leaseBinding.revocationGeneration ||
        decoded['authorityPayloadDigest'] != authority.payloadDigest ||
        currentMembers.length != 1 ||
        currentMembers.single.role != verifiedLease.role ||
        currentMembers.single.sessionGeneration !=
            verifiedLease.sessionGeneration ||
        !currentMembers.single.capabilities.contains(
          ShopStaffCapability.managementRead,
        )) {
      invalid();
    }
    if (verifiedLease.actorId != decoded['actorId'] ||
        verifiedLease.payloadDigest != decoded['leaseDigest'] ||
        !const {
          ShopStaffRole.owner,
          ShopStaffRole.manager,
        }.contains(verifiedLease.role)) {
      invalid();
    }
    final signatureText = decoded['signature'];
    if (signatureText is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signatureText)) {
      invalid();
    }
    final List<int> signatureBytes;
    try {
      signatureBytes = base64Url.decode('$signatureText==');
    } on FormatException {
      invalid();
    }
    final unsigned = Map<String, Object?>.from(decoded)..remove('signature');
    final unsignedBytes = utf8.encode(canonicalConnectedSiteJson(unsigned));
    if (signatureBytes.length != 64 ||
        base64Url.encode(signatureBytes).replaceAll('=', '') != signatureText ||
        !await Ed25519().verify(
          unsignedBytes,
          signature: Signature(
            signatureBytes,
            publicKey: SimplePublicKey(
              List<int>.of(signingPublicKey),
              type: KeyPairType.ed25519,
            ),
          ),
        )) {
      invalid();
    }
    return ConnectedCloudFeedReadRequestV1._(
      canonicalBytes: canonicalBytes,
      actorRole: verifiedLease.role.name,
      requestNonce: decoded['requestNonce'] as String,
      issuedAtMillis: issuedAtMillis,
      expected: ConnectedSiteRetailFeedExpectation(
        workspaceId: leaseBinding.tenantId,
        siteId: leaseBinding.siteId,
        actorId: verifiedLease.actorId,
        deviceId: leaseBinding.deviceId,
        authorityGeneration: authorityGeneration,
        revocationGeneration: leaseBinding.revocationGeneration,
        authorityPayloadDigest: authority.payloadDigest,
        leaseDigest: verifiedLease.payloadDigest,
        requestDigest: connectedSiteSha256(decoded),
        afterSequence: after,
        priorEventDigest: prior as String?,
        limit: limit,
      ),
    );
  }
}

final _identifier = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _timestamp = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$');
const _keys = <String>{
  'contract',
  'workspaceId',
  'siteId',
  'actorId',
  'deviceId',
  'clientFingerprint',
  'enrollmentEvidenceDigest',
  'authorityGeneration',
  'authorityPayloadDigest',
  'revocationGeneration',
  'afterSequence',
  'priorEventDigest',
  'limit',
  'leaseDigest',
  'issuedAt',
  'requestNonce',
  'signingKeyId',
  'signatureAlgorithm',
  'signature',
};
