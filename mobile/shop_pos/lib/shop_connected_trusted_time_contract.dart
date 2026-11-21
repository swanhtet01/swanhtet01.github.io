import 'dart:convert';

import 'shop_connected_site_contracts.dart';

const connectedTrustedTimeMaximumValidity = Duration(minutes: 2);

class ConnectedTrustedTimeAuthorityApprovalV1 {
  ConnectedTrustedTimeAuthorityApprovalV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.authorityKeyId,
    required this.authorityKeyFingerprint,
    required this.authorityKeyGeneration,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
    required this.ownerAuthorityKeyId,
    required this.ownerAuthoritySignature,
  }) {
    for (final token in [
      workspaceId,
      siteId,
      coordinatorDeviceId,
      authorityKeyId,
      ownerAuthorityKeyId,
    ]) {
      _requireToken(token);
    }
    _requireDigest(coordinatorBindingDigest);
    _requireDigest(authorityKeyFingerprint);
    _decodeSignature(ownerAuthoritySignature);
    if (coordinatorBindingGeneration < 1 ||
        authorityKeyGeneration < 1 ||
        issuedAtMillis < 1 ||
        expiresAtMillis <= issuedAtMillis) {
      throw const FormatException('trusted-time authority approval');
    }
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
  final String authorityKeyId;
  final String authorityKeyFingerprint;
  final int authorityKeyGeneration;
  final int issuedAtMillis;
  final int expiresAtMillis;
  final String ownerAuthorityKeyId;
  final String ownerAuthoritySignature;

  Map<String, Object> get evidence => {
    'schema': 'supermega.connected-trusted-time-authority-approval.v1',
    'protocolVersion': connectedSiteProtocolVersion,
    'usage': 'connected-trusted-time-v1',
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'coordinatorBindingDigest': coordinatorBindingDigest,
    'coordinatorBindingGeneration': coordinatorBindingGeneration,
    'authorityKeyId': authorityKeyId,
    'authorityKeyFingerprint': authorityKeyFingerprint,
    'authorityKeyGeneration': authorityKeyGeneration,
    'issuedAtMillis': issuedAtMillis,
    'expiresAtMillis': expiresAtMillis,
    'ownerAuthorityKeyId': ownerAuthorityKeyId,
  };

  String get approvalDigest => connectedSiteSha256(evidence);
  String get canonicalEvidence => canonicalConnectedSiteJson(evidence);

  Map<String, Object> toJson() => {
    ...evidence,
    'approvalDigest': approvalDigest,
    'ownerAuthoritySignature': ownerAuthoritySignature,
  };

  factory ConnectedTrustedTimeAuthorityApprovalV1.fromJson(Object? value) {
    final map = _exactMap(value, _approvalKeys, 'trusted-time approval');
    if (map['schema'] !=
            'supermega.connected-trusted-time-authority-approval.v1' ||
        map['protocolVersion'] != connectedSiteProtocolVersion ||
        map['usage'] != 'connected-trusted-time-v1') {
      throw const FormatException('trusted-time approval');
    }
    final result = ConnectedTrustedTimeAuthorityApprovalV1(
      workspaceId: _string(map, 'workspaceId'),
      siteId: _string(map, 'siteId'),
      coordinatorDeviceId: _string(map, 'coordinatorDeviceId'),
      coordinatorBindingDigest: _string(map, 'coordinatorBindingDigest'),
      coordinatorBindingGeneration: _integer(
        map,
        'coordinatorBindingGeneration',
      ),
      authorityKeyId: _string(map, 'authorityKeyId'),
      authorityKeyFingerprint: _string(map, 'authorityKeyFingerprint'),
      authorityKeyGeneration: _integer(map, 'authorityKeyGeneration'),
      issuedAtMillis: _integer(map, 'issuedAtMillis'),
      expiresAtMillis: _integer(map, 'expiresAtMillis'),
      ownerAuthorityKeyId: _string(map, 'ownerAuthorityKeyId'),
      ownerAuthoritySignature: _string(map, 'ownerAuthoritySignature'),
    );
    if (map['approvalDigest'] != result.approvalDigest) {
      throw const FormatException('trusted-time approval digest');
    }
    return result;
  }
}

class ConnectedTrustedTimeChallengeV1 {
  ConnectedTrustedTimeChallengeV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.clientDeviceId,
    required this.clientFingerprint,
    required this.sessionGeneration,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.nonce,
    required this.bootSessionId,
    required this.startedMonotonicMillis,
  }) {
    for (final token in [
      workspaceId,
      siteId,
      coordinatorDeviceId,
      clientDeviceId,
    ]) {
      _requireToken(token);
    }
    for (final digest in [
      clientFingerprint,
      coordinatorBindingDigest,
      bootSessionId,
    ]) {
      _requireDigest(digest);
    }
    if (sessionGeneration < 1 ||
        coordinatorBindingGeneration < 1 ||
        startedMonotonicMillis < 0 ||
        !_nonce.hasMatch(nonce)) {
      throw const FormatException('trusted-time challenge');
    }
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String clientDeviceId;
  final String clientFingerprint;
  final int sessionGeneration;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
  final String nonce;
  final String bootSessionId;
  final int startedMonotonicMillis;

  Map<String, Object> get payload => {
    'schema': 'supermega.connected-trusted-time-challenge.v1',
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'clientDeviceId': clientDeviceId,
    'clientFingerprint': clientFingerprint,
    'sessionGeneration': sessionGeneration,
    'coordinatorBindingDigest': coordinatorBindingDigest,
    'coordinatorBindingGeneration': coordinatorBindingGeneration,
    'nonce': nonce,
    'bootSessionId': bootSessionId,
    'startedMonotonicMillis': startedMonotonicMillis,
  };

  String get requestDigest => connectedSiteSha256(payload);

  Map<String, Object> toJson() => {...payload, 'requestDigest': requestDigest};

  factory ConnectedTrustedTimeChallengeV1.fromJson(Object? value) {
    final map = _exactMap(value, _challengeKeys, 'trusted-time challenge');
    if (map['schema'] != 'supermega.connected-trusted-time-challenge.v1' ||
        map['protocolVersion'] != connectedSiteProtocolVersion) {
      throw const FormatException('trusted-time challenge');
    }
    final result = ConnectedTrustedTimeChallengeV1(
      workspaceId: _string(map, 'workspaceId'),
      siteId: _string(map, 'siteId'),
      coordinatorDeviceId: _string(map, 'coordinatorDeviceId'),
      clientDeviceId: _string(map, 'clientDeviceId'),
      clientFingerprint: _string(map, 'clientFingerprint'),
      sessionGeneration: _integer(map, 'sessionGeneration'),
      coordinatorBindingDigest: _string(map, 'coordinatorBindingDigest'),
      coordinatorBindingGeneration: _integer(
        map,
        'coordinatorBindingGeneration',
      ),
      nonce: _string(map, 'nonce'),
      bootSessionId: _string(map, 'bootSessionId'),
      startedMonotonicMillis: _integer(map, 'startedMonotonicMillis'),
    );
    if (map['requestDigest'] != result.requestDigest) {
      throw const FormatException('trusted-time challenge digest');
    }
    return result;
  }
}

class ConnectedTrustedTimeObservationV1 {
  ConnectedTrustedTimeObservationV1({
    required this.challenge,
    required this.authorityKeyId,
    required this.authorityKeyFingerprint,
    required this.authorityKeyGeneration,
    required this.authorityEpoch,
    required this.authoritySequence,
    required this.observedAtMillis,
    required this.validUntilMillis,
    required this.authoritySignature,
  }) {
    _requireToken(authorityKeyId);
    _requireDigest(authorityKeyFingerprint);
    _decodeSignature(authoritySignature);
    if (authorityKeyGeneration < 1 ||
        authorityEpoch < 1 ||
        authoritySequence < 1 ||
        observedAtMillis < 1 ||
        validUntilMillis < observedAtMillis ||
        validUntilMillis - observedAtMillis >
            connectedTrustedTimeMaximumValidity.inMilliseconds) {
      throw const FormatException('trusted-time observation');
    }
  }

  final ConnectedTrustedTimeChallengeV1 challenge;
  final String authorityKeyId;
  final String authorityKeyFingerprint;
  final int authorityKeyGeneration;
  final int authorityEpoch;
  final int authoritySequence;
  final int observedAtMillis;
  final int validUntilMillis;
  final String authoritySignature;

  Map<String, Object> get unsignedPayload => {
    'schema': 'supermega.connected-trusted-time-observation.v1',
    'protocolVersion': connectedSiteProtocolVersion,
    'requestDigest': challenge.requestDigest,
    'challengeNonce': challenge.nonce,
    'workspaceId': challenge.workspaceId,
    'siteId': challenge.siteId,
    'coordinatorDeviceId': challenge.coordinatorDeviceId,
    'clientDeviceId': challenge.clientDeviceId,
    'clientFingerprint': challenge.clientFingerprint,
    'sessionGeneration': challenge.sessionGeneration,
    'coordinatorBindingDigest': challenge.coordinatorBindingDigest,
    'coordinatorBindingGeneration': challenge.coordinatorBindingGeneration,
    'bootSessionId': challenge.bootSessionId,
    'startedMonotonicMillis': challenge.startedMonotonicMillis,
    'authorityKeyId': authorityKeyId,
    'authorityKeyFingerprint': authorityKeyFingerprint,
    'authorityKeyGeneration': authorityKeyGeneration,
    'authorityEpoch': authorityEpoch,
    'authoritySequence': authoritySequence,
    'observedAtMillis': observedAtMillis,
    'validUntilMillis': validUntilMillis,
  };

  String get observationDigest => connectedSiteSha256(unsignedPayload);
  Map<String, Object> get signedPayload => {
    ...unsignedPayload,
    'observationDigest': observationDigest,
  };
  String get canonicalSignedPayload =>
      canonicalConnectedSiteJson(signedPayload);

  Map<String, Object> toJson() => {
    ...signedPayload,
    'authoritySignature': authoritySignature,
  };

  factory ConnectedTrustedTimeObservationV1.fromJson(
    Object? value,
    ConnectedTrustedTimeChallengeV1 challenge,
  ) {
    final map = _exactMap(value, _observationKeys, 'trusted-time observation');
    if (map['schema'] != 'supermega.connected-trusted-time-observation.v1' ||
        map['protocolVersion'] != connectedSiteProtocolVersion) {
      throw const FormatException('trusted-time observation');
    }
    final result = ConnectedTrustedTimeObservationV1(
      challenge: challenge,
      authorityKeyId: _string(map, 'authorityKeyId'),
      authorityKeyFingerprint: _string(map, 'authorityKeyFingerprint'),
      authorityKeyGeneration: _integer(map, 'authorityKeyGeneration'),
      authorityEpoch: _integer(map, 'authorityEpoch'),
      authoritySequence: _integer(map, 'authoritySequence'),
      observedAtMillis: _integer(map, 'observedAtMillis'),
      validUntilMillis: _integer(map, 'validUntilMillis'),
      authoritySignature: _string(map, 'authoritySignature'),
    );
    for (final entry in result.signedPayload.entries) {
      if (map[entry.key] != entry.value) {
        throw const FormatException('trusted-time observation substituted');
      }
    }
    return result;
  }
}

abstract interface class ConnectedTrustedTimePlatformClock {
  Future<String> bootSessionId();
  Future<int> monotonicMillis();
}

class UnavailableConnectedTrustedTimePlatformClock
    implements ConnectedTrustedTimePlatformClock {
  const UnavailableConnectedTrustedTimePlatformClock();
  Never _unavailable() =>
      throw StateError('connected_trusted_time_platform_clock_unavailable');
  @override
  Future<String> bootSessionId() async => _unavailable();
  @override
  Future<int> monotonicMillis() async => _unavailable();
}

abstract interface class ConnectedTrustedTimeAuthorityVerifier {
  Future<bool> verifyApproval(ConnectedTrustedTimeAuthorityApprovalV1 approval);
  Future<bool> verifyObservation({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  });
}

class UnavailableConnectedTrustedTimeAuthorityVerifier
    implements ConnectedTrustedTimeAuthorityVerifier {
  const UnavailableConnectedTrustedTimeAuthorityVerifier();
  @override
  Future<bool> verifyApproval(
    ConnectedTrustedTimeAuthorityApprovalV1 approval,
  ) async => false;
  @override
  Future<bool> verifyObservation({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  }) async => false;
}

const _challengeKeys = <String>{
  'schema',
  'protocolVersion',
  'workspaceId',
  'siteId',
  'coordinatorDeviceId',
  'clientDeviceId',
  'clientFingerprint',
  'sessionGeneration',
  'coordinatorBindingDigest',
  'coordinatorBindingGeneration',
  'nonce',
  'bootSessionId',
  'startedMonotonicMillis',
  'requestDigest',
};
const _approvalKeys = <String>{
  'schema',
  'protocolVersion',
  'usage',
  'workspaceId',
  'siteId',
  'coordinatorDeviceId',
  'coordinatorBindingDigest',
  'coordinatorBindingGeneration',
  'authorityKeyId',
  'authorityKeyFingerprint',
  'authorityKeyGeneration',
  'issuedAtMillis',
  'expiresAtMillis',
  'ownerAuthorityKeyId',
  'approvalDigest',
  'ownerAuthoritySignature',
};
const _observationKeys = <String>{
  'schema',
  'protocolVersion',
  'requestDigest',
  'challengeNonce',
  'workspaceId',
  'siteId',
  'coordinatorDeviceId',
  'clientDeviceId',
  'clientFingerprint',
  'sessionGeneration',
  'coordinatorBindingDigest',
  'coordinatorBindingGeneration',
  'bootSessionId',
  'startedMonotonicMillis',
  'authorityKeyId',
  'authorityKeyFingerprint',
  'authorityKeyGeneration',
  'authorityEpoch',
  'authoritySequence',
  'observedAtMillis',
  'validUntilMillis',
  'observationDigest',
  'authoritySignature',
};
final _token = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _nonce = RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{21,127}$');
final _signature = RegExp(r'^[A-Za-z0-9_-]{86}$');

Map<String, Object?> _exactMap(Object? value, Set<String> keys, String name) {
  if (value is! Map) throw FormatException(name);
  if (value.keys.any((key) => key is! String)) throw FormatException(name);
  final map = value.cast<String, Object?>();
  if (map.keys.toSet().difference(keys).isNotEmpty ||
      keys.difference(map.keys.toSet()).isNotEmpty) {
    throw FormatException(name);
  }
  return map;
}

String _string(Map<String, Object?> map, String key) {
  final value = map[key];
  if (value is! String) throw const FormatException('trusted-time string');
  return value;
}

int _integer(Map<String, Object?> map, String key) {
  final value = map[key];
  if (value is! int) throw const FormatException('trusted-time integer');
  return value;
}

void _requireToken(String value) {
  if (!_token.hasMatch(value)) {
    throw const FormatException('trusted-time token');
  }
}

void _requireDigest(String value) {
  if (!_digest.hasMatch(value)) {
    throw const FormatException('trusted-time digest');
  }
}

void _decodeSignature(String value) {
  if (!_signature.hasMatch(value)) {
    throw const FormatException('trusted-time signature');
  }
  final bytes = base64Url.decode(base64Url.normalize(value));
  if (bytes.length != 64 ||
      base64UrlEncode(bytes).replaceAll('=', '') != value) {
    throw const FormatException('trusted-time signature');
  }
}
