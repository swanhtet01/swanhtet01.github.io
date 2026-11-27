import 'dart:convert';

import 'shop_connected_site_contracts.dart';

const connectedTrustedTimeClientHeadSchema =
    'supermega.connected-trusted-time-client-head.v1';
const connectedTrustedTimeClientHeadMaximumBytes = 8 * 1024;

/// Canonical identity of the last trusted-time observation accepted by one
/// exact client stream.
///
/// This value is self-consistency evidence only. Its digest is not a signature,
/// does not grant authority, and cannot advance an issuer or client head by
/// itself. A future issuer must independently reconstruct and verify the
/// retained observation, acceptance, owner approval, binding and device state.
/// Absence of a head is represented by absence of this object; there is no
/// synthetic or self-authored genesis head.
final class ConnectedTrustedTimeClientHeadV1 {
  ConnectedTrustedTimeClientHeadV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.clientDeviceId,
    required this.clientFingerprint,
    required this.sessionGeneration,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.authorityKeyId,
    required this.authorityKeyFingerprint,
    required this.authorityKeyGeneration,
    required this.authorityEpoch,
    required this.authoritySequence,
    required this.requestDigest,
    required this.observationDigest,
    required this.acceptanceDigest,
    required this.observedAtMillis,
    required this.bootSessionId,
    required this.acceptedAtMonotonicMillis,
    required this.effectiveAtMillis,
    required this.validUntilMillis,
  }) {
    if (!_id.hasMatch(workspaceId) ||
        !_id.hasMatch(siteId) ||
        !_id.hasMatch(coordinatorDeviceId) ||
        !_id.hasMatch(clientDeviceId) ||
        !_id.hasMatch(authorityKeyId) ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(coordinatorBindingDigest) ||
        !_digest.hasMatch(authorityKeyFingerprint) ||
        !_digest.hasMatch(requestDigest) ||
        !_digest.hasMatch(observationDigest) ||
        !_digest.hasMatch(acceptanceDigest) ||
        !_digest.hasMatch(bootSessionId) ||
        sessionGeneration < 1 ||
        coordinatorBindingGeneration < 1 ||
        authorityKeyGeneration < 1 ||
        authorityEpoch < 1 ||
        authoritySequence < 1 ||
        observedAtMillis < 1 ||
        acceptedAtMonotonicMillis < 0 ||
        effectiveAtMillis < 1 ||
        validUntilMillis < effectiveAtMillis) {
      throw const FormatException('trusted-time client head');
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
  final String authorityKeyId;
  final String authorityKeyFingerprint;
  final int authorityKeyGeneration;
  final int authorityEpoch;
  final int authoritySequence;
  final String requestDigest;
  final String observationDigest;
  final String acceptanceDigest;
  final int observedAtMillis;
  final String bootSessionId;
  final int acceptedAtMonotonicMillis;
  final int effectiveAtMillis;
  final int validUntilMillis;

  Map<String, Object> get payload => {
    'schema': connectedTrustedTimeClientHeadSchema,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'clientDeviceId': clientDeviceId,
    'clientFingerprint': clientFingerprint,
    'sessionGeneration': sessionGeneration,
    'coordinatorBindingDigest': coordinatorBindingDigest,
    'coordinatorBindingGeneration': coordinatorBindingGeneration,
    'authorityKeyId': authorityKeyId,
    'authorityKeyFingerprint': authorityKeyFingerprint,
    'authorityKeyGeneration': authorityKeyGeneration,
    'authorityEpoch': authorityEpoch,
    'authoritySequence': authoritySequence,
    'requestDigest': requestDigest,
    'observationDigest': observationDigest,
    'acceptanceDigest': acceptanceDigest,
    'observedAtMillis': observedAtMillis,
    'bootSessionId': bootSessionId,
    'acceptedAtMonotonicMillis': acceptedAtMonotonicMillis,
    'effectiveAtMillis': effectiveAtMillis,
    'validUntilMillis': validUntilMillis,
  };

  String get headDigest => connectedSiteSha256(payload);

  Map<String, Object> toJson() => {...payload, 'headDigest': headDigest};

  String get canonicalJson => canonicalConnectedSiteJson(toJson());

  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeClientHeadV1.fromJson(Object? value) {
    if (value is! Map) throw const FormatException('trusted-time client head');
    final map = <String, Object?>{};
    for (final entry in value.entries) {
      if (entry.key is! String || map.containsKey(entry.key)) {
        throw const FormatException('trusted-time client head');
      }
      map[entry.key as String] = entry.value;
    }
    if (map.length != _keys.length ||
        map.keys.toSet().difference(_keys).isNotEmpty ||
        map['schema'] != connectedTrustedTimeClientHeadSchema ||
        map['headDigest'] is! String) {
      throw const FormatException('trusted-time client head');
    }
    try {
      final result = ConnectedTrustedTimeClientHeadV1(
        workspaceId: map['workspaceId'] as String,
        siteId: map['siteId'] as String,
        coordinatorDeviceId: map['coordinatorDeviceId'] as String,
        clientDeviceId: map['clientDeviceId'] as String,
        clientFingerprint: map['clientFingerprint'] as String,
        sessionGeneration: map['sessionGeneration'] as int,
        coordinatorBindingDigest: map['coordinatorBindingDigest'] as String,
        coordinatorBindingGeneration:
            map['coordinatorBindingGeneration'] as int,
        authorityKeyId: map['authorityKeyId'] as String,
        authorityKeyFingerprint: map['authorityKeyFingerprint'] as String,
        authorityKeyGeneration: map['authorityKeyGeneration'] as int,
        authorityEpoch: map['authorityEpoch'] as int,
        authoritySequence: map['authoritySequence'] as int,
        requestDigest: map['requestDigest'] as String,
        observationDigest: map['observationDigest'] as String,
        acceptanceDigest: map['acceptanceDigest'] as String,
        observedAtMillis: map['observedAtMillis'] as int,
        bootSessionId: map['bootSessionId'] as String,
        acceptedAtMonotonicMillis: map['acceptedAtMonotonicMillis'] as int,
        effectiveAtMillis: map['effectiveAtMillis'] as int,
        validUntilMillis: map['validUntilMillis'] as int,
      );
      if (map['headDigest'] != result.headDigest) {
        throw const FormatException('trusted-time client head digest');
      }
      return result;
    } on TypeError {
      throw const FormatException('trusted-time client head');
    }
  }

  factory ConnectedTrustedTimeClientHeadV1.fromCanonicalBytes(List<int> bytes) {
    if (bytes.isEmpty ||
        bytes.length > connectedTrustedTimeClientHeadMaximumBytes) {
      throw const FormatException('trusted-time client head bytes');
    }
    try {
      final text = utf8.decode(bytes, allowMalformed: false);
      final result = ConnectedTrustedTimeClientHeadV1.fromJson(
        jsonDecode(text),
      );
      if (text != result.canonicalJson) {
        throw const FormatException('trusted-time client head bytes');
      }
      return result;
    } on FormatException {
      rethrow;
    } on Object {
      throw const FormatException('trusted-time client head bytes');
    }
  }
}

final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');

const _keys = <String>{
  'schema',
  'workspaceId',
  'siteId',
  'coordinatorDeviceId',
  'clientDeviceId',
  'clientFingerprint',
  'sessionGeneration',
  'coordinatorBindingDigest',
  'coordinatorBindingGeneration',
  'authorityKeyId',
  'authorityKeyFingerprint',
  'authorityKeyGeneration',
  'authorityEpoch',
  'authoritySequence',
  'requestDigest',
  'observationDigest',
  'acceptanceDigest',
  'observedAtMillis',
  'bootSessionId',
  'acceptedAtMonotonicMillis',
  'effectiveAtMillis',
  'validUntilMillis',
  'headDigest',
};
