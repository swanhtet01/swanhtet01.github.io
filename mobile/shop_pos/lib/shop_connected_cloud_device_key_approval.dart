import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

import 'shop_connected_site_contracts.dart';

const connectedCloudDeviceKeyApprovalContract =
    'supermega.connected-cloud-device-key-approval.v1';
const connectedCloudDeviceKeyApprovalPurpose = 'connected-site-event-read.v1';

/// Historical cloud-purpose approval. A LAN pairing record is not a cloud
/// approval; only a separately pinned cloud issuer may sign these bytes.
final class ConnectedCloudDeviceKeyApprovalV1 {
  ConnectedCloudDeviceKeyApprovalV1._({
    required this.canonicalBytes,
    required this.approvalDigest,
    required this.publicKey,
    required this.signingKeyId,
    required this.clientFingerprint,
    required this.enrollmentEvidenceDigest,
    required this.sessionGeneration,
    required this.revocationGeneration,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
  });

  final String canonicalBytes;
  final String approvalDigest;
  final List<int> publicKey;
  final String signingKeyId;
  final String clientFingerprint;
  final String enrollmentEvidenceDigest;
  final int sessionGeneration;
  final int revocationGeneration;
  final int issuedAtMillis;
  final int expiresAtMillis;

  static ConnectedCloudDeviceKeyApprovalV1 parseAndVerifyAt({
    required String canonicalBytes,
    required Map<String, List<int>> pinnedCloudIssuerKeys,
    required String workspaceId,
    required String siteId,
    required String deviceId,
    required String clientFingerprint,
    required String enrollmentEvidenceDigest,
    required String signingKeyId,
    required int pinnedIssuerKeyGeneration,
    required int expectedApprovalSequence,
    required String? expectedPreviousApprovalDigest,
    required int sessionGeneration,
    required int revocationGeneration,
    required int trustedAtMillis,
  }) {
    Never invalid() => throw const FormatException(
      'connected_cloud_device_key_approval_invalid',
    );
    if (canonicalBytes.length > 4096 ||
        pinnedCloudIssuerKeys.isEmpty ||
        trustedAtMillis < 1 ||
        pinnedIssuerKeyGeneration < 1 ||
        expectedApprovalSequence < 1 ||
        (expectedApprovalSequence == 1 &&
            expectedPreviousApprovalDigest != null) ||
        (expectedApprovalSequence > 1 &&
            (expectedPreviousApprovalDigest == null ||
                !_digest.hasMatch(expectedPreviousApprovalDigest))) ||
        sessionGeneration < 1 ||
        revocationGeneration < 0) {
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
        decoded['contract'] != connectedCloudDeviceKeyApprovalContract ||
        decoded['purpose'] != connectedCloudDeviceKeyApprovalPurpose ||
        decoded['workspaceId'] != workspaceId ||
        decoded['siteId'] != siteId ||
        decoded['deviceId'] != deviceId ||
        decoded['clientFingerprint'] != clientFingerprint ||
        decoded['enrollmentEvidenceDigest'] != enrollmentEvidenceDigest ||
        decoded['signingKeyId'] != signingKeyId ||
        decoded['sessionGeneration'] != sessionGeneration ||
        decoded['revocationGeneration'] != revocationGeneration ||
        decoded['issuedAtMillis'] is! int ||
        decoded['expiresAtMillis'] is! int ||
        decoded['approvalSequence'] is! int ||
        decoded['issuerKeyGeneration'] is! int ||
        decoded['approvalSequence'] != expectedApprovalSequence ||
        decoded['previousApprovalDigest'] != expectedPreviousApprovalDigest ||
        decoded['issuerKeyGeneration'] != pinnedIssuerKeyGeneration ||
        (decoded['approvalSequence'] as int) < 1 ||
        (decoded['issuerKeyGeneration'] as int) < 1 ||
        ((decoded['approvalSequence'] as int) == 1
            ? decoded['previousApprovalDigest'] != null
            : decoded['previousApprovalDigest'] is! String ||
                  !_digest.hasMatch(
                    decoded['previousApprovalDigest'] as String,
                  )) ||
        (decoded['issuedAtMillis'] as int) < 1 ||
        (decoded['expiresAtMillis'] as int) <= trustedAtMillis ||
        (decoded['issuedAtMillis'] as int) > trustedAtMillis ||
        (decoded['expiresAtMillis'] as int) <=
            (decoded['issuedAtMillis'] as int) ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(enrollmentEvidenceDigest) ||
        !_id.hasMatch(signingKeyId)) {
      invalid();
    }
    final issuerKeyId = decoded['issuerKeyId'];
    final keyText = decoded['publicKey'];
    final signatureText = decoded['signature'];
    if (issuerKeyId is! String ||
        !_id.hasMatch(issuerKeyId) ||
        keyText is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(keyText) ||
        signatureText is! String ||
        !_signature.hasMatch(signatureText)) {
      invalid();
    }
    final issuerKey = pinnedCloudIssuerKeys[issuerKeyId];
    if (issuerKey == null || issuerKey.length != 32) invalid();
    final List<int> publicKey;
    final List<int> signature;
    try {
      publicKey = base64Url.decode('$keyText=');
      signature = base64Url.decode('$signatureText==');
    } on FormatException {
      invalid();
    }
    if (publicKey.length != 32 ||
        signature.length != 64 ||
        base64Url.encode(publicKey).replaceAll('=', '') != keyText ||
        base64Url.encode(signature).replaceAll('=', '') != signatureText ||
        crypto.sha256.convert(publicKey).toString() != clientFingerprint) {
      invalid();
    }
    final unsigned = Map<String, Object?>.from(decoded)..remove('signature');
    if (!JWTAlgorithm.EdDSA.verify(
      EdDSAPublicKey(issuerKey),
      Uint8List.fromList(utf8.encode(canonicalConnectedSiteJson(unsigned))),
      Uint8List.fromList(signature),
    )) {
      invalid();
    }
    return ConnectedCloudDeviceKeyApprovalV1._(
      canonicalBytes: canonicalBytes,
      approvalDigest: connectedSiteSha256(decoded),
      publicKey: List<int>.unmodifiable(publicKey),
      signingKeyId: signingKeyId,
      clientFingerprint: clientFingerprint,
      enrollmentEvidenceDigest: enrollmentEvidenceDigest,
      sessionGeneration: sessionGeneration,
      revocationGeneration: revocationGeneration,
      issuedAtMillis: decoded['issuedAtMillis'] as int,
      expiresAtMillis: decoded['expiresAtMillis'] as int,
    );
  }
}

final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _signature = RegExp(r'^[A-Za-z0-9_-]{86}$');
const _keys = <String>{
  'contract',
  'purpose',
  'workspaceId',
  'siteId',
  'deviceId',
  'signingKeyId',
  'publicKey',
  'clientFingerprint',
  'enrollmentEvidenceDigest',
  'sessionGeneration',
  'revocationGeneration',
  'approvalSequence',
  'previousApprovalDigest',
  'issuerKeyId',
  'issuerKeyGeneration',
  'issuedAtMillis',
  'expiresAtMillis',
  'signature',
};
