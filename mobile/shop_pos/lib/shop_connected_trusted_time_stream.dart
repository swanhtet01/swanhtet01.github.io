import 'dart:convert';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_contract.dart';

const connectedTrustedTimeStreamEntrySchema =
    'supermega.connected-trusted-time-stream-entry.v2';
const connectedTrustedTimeStreamAckSchema =
    'supermega.connected-trusted-time-stream-ack.v1';
const connectedTrustedTimeStreamMaximumBytes = 8 * 1024;

enum ConnectedTrustedTimeStreamEntryKind { time, continuity }

/// One immutable authority-signed entry in an exact per-client time stream.
///
/// Unlike the V1 observation, these signing bytes do not contain a transport
/// challenge. The same signed entry can therefore be replayed after a lost
/// response without signing different bytes at one authority tuple.
///
/// This object is not self-authenticating. Callers must verify
/// [authoritySignature] with separately approved protected key custody before
/// treating it as authority. A [ConnectedTrustedTimeStreamEntryKind.continuity]
/// entry advances only the signed chain and must never produce live time.
final class ConnectedTrustedTimeStreamEntryV2 {
  ConnectedTrustedTimeStreamEntryV2({
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
    required this.previousEntryDigest,
    required this.kind,
    required this.observedAtMillis,
    required this.validUntilMillis,
    required this.authoritySignature,
  }) {
    if (!_id.hasMatch(workspaceId) ||
        !_id.hasMatch(siteId) ||
        !_id.hasMatch(coordinatorDeviceId) ||
        !_id.hasMatch(clientDeviceId) ||
        !_id.hasMatch(authorityKeyId) ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(coordinatorBindingDigest) ||
        !_digest.hasMatch(authorityKeyFingerprint) ||
        (previousEntryDigest != null &&
            !_digest.hasMatch(previousEntryDigest!)) ||
        sessionGeneration < 1 ||
        coordinatorBindingGeneration < 1 ||
        authorityKeyGeneration < 1 ||
        authorityEpoch < 1 ||
        authoritySequence < 1 ||
        (authoritySequence == 1) != (previousEntryDigest == null) ||
        observedAtMillis < 1 ||
        !_validTimeWindow(kind, observedAtMillis, validUntilMillis) ||
        !_validCanonicalSignature(authoritySignature)) {
      throw const FormatException('trusted-time stream entry');
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
  final String? previousEntryDigest;
  final ConnectedTrustedTimeStreamEntryKind kind;
  final int observedAtMillis;
  final int validUntilMillis;
  final String authoritySignature;

  Map<String, Object?> get signingPayload => {
    'schema': connectedTrustedTimeStreamEntrySchema,
    'protocolVersion': 2,
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
    'previousEntryDigest': previousEntryDigest,
    'kind': kind.name,
    'observedAtMillis': observedAtMillis,
    'validUntilMillis': validUntilMillis,
  };

  String get canonicalSigningPayload =>
      canonicalConnectedSiteJson(signingPayload);
  String get entryDigest => connectedSiteSha256(signingPayload);

  Map<String, Object?> toJson() => {
    ...signingPayload,
    'entryDigest': entryDigest,
    'authoritySignature': authoritySignature,
  };

  String get canonicalJson => canonicalConnectedSiteJson(toJson());
  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeStreamEntryV2.fromJson(Object? value) {
    final map = _exactMap(value, _entryKeys, 'trusted-time stream entry');
    if (map['schema'] != connectedTrustedTimeStreamEntrySchema ||
        map['protocolVersion'] != 2 ||
        map['kind'] is! String ||
        map['previousEntryDigest'] is! String? ||
        map['entryDigest'] is! String ||
        map['authoritySignature'] is! String) {
      throw const FormatException('trusted-time stream entry');
    }
    final kind = switch (map['kind']) {
      'time' => ConnectedTrustedTimeStreamEntryKind.time,
      'continuity' => ConnectedTrustedTimeStreamEntryKind.continuity,
      _ => throw const FormatException('trusted-time stream entry'),
    };
    try {
      final result = ConnectedTrustedTimeStreamEntryV2(
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
        previousEntryDigest: map['previousEntryDigest'] as String?,
        kind: kind,
        observedAtMillis: map['observedAtMillis'] as int,
        validUntilMillis: map['validUntilMillis'] as int,
        authoritySignature: map['authoritySignature'] as String,
      );
      if (map['entryDigest'] != result.entryDigest) {
        throw const FormatException('trusted-time stream entry digest');
      }
      return result;
    } on TypeError {
      throw const FormatException('trusted-time stream entry');
    }
  }

  factory ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
    List<int> bytes,
  ) {
    final text = _canonicalText(bytes, 'trusted-time stream entry bytes');
    final result = ConnectedTrustedTimeStreamEntryV2.fromJson(jsonDecode(text));
    if (text != result.canonicalJson) {
      throw const FormatException('trusted-time stream entry bytes');
    }
    return result;
  }
}

ConnectedTrustedTimeStreamEntryV2 parseConnectedTrustedTimeUnsignedEntryV2(
  List<int> bytes,
) {
  final text = _canonicalText(
    bytes,
    'trusted-time unsigned stream entry bytes',
  );
  final value = jsonDecode(text);
  if (value is! Map<String, dynamic> || value.length != _entryKeys.length - 2) {
    throw const FormatException('trusted-time unsigned stream entry');
  }
  final result = ConnectedTrustedTimeStreamEntryV2.fromJson({
    ...value,
    'entryDigest': connectedSiteSha256(value),
    'authoritySignature': _unsignedPlaceholderSignature,
  });
  if (text != result.canonicalSigningPayload) {
    throw const FormatException('trusted-time unsigned stream entry bytes');
  }
  return result;
}

/// Device-signed acknowledgement of one processed stream entry.
///
/// The resulting client head for this protocol is the exact processed entry
/// digest. Boot and monotonic values are local receipt evidence only; they are
/// not wall-clock or authority evidence. This object is not authentic until
/// [clientSignature] is verified against the retained client signing key.
final class ConnectedTrustedTimeStreamAckV1 {
  ConnectedTrustedTimeStreamAckV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.clientDeviceId,
    required this.clientFingerprint,
    required this.clientSigningKeyId,
    required this.sessionGeneration,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
    required this.authorityKeyGeneration,
    required this.authorityEpoch,
    required this.authoritySequence,
    required this.entryDigest,
    required this.resultingHeadDigest,
    required this.bootSessionId,
    required this.acknowledgedAtMonotonicMillis,
    required this.clientSignature,
  }) {
    if (!_id.hasMatch(workspaceId) ||
        !_id.hasMatch(siteId) ||
        !_id.hasMatch(coordinatorDeviceId) ||
        !_id.hasMatch(clientDeviceId) ||
        !_id.hasMatch(clientSigningKeyId) ||
        !_digest.hasMatch(clientFingerprint) ||
        !_digest.hasMatch(coordinatorBindingDigest) ||
        !_digest.hasMatch(entryDigest) ||
        !_digest.hasMatch(resultingHeadDigest) ||
        !_digest.hasMatch(bootSessionId) ||
        entryDigest != resultingHeadDigest ||
        sessionGeneration < 1 ||
        coordinatorBindingGeneration < 1 ||
        authorityKeyGeneration < 1 ||
        authorityEpoch < 1 ||
        authoritySequence < 1 ||
        acknowledgedAtMonotonicMillis < 0 ||
        !_validCanonicalSignature(clientSignature)) {
      throw const FormatException('trusted-time stream ack');
    }
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String clientDeviceId;
  final String clientFingerprint;
  final String clientSigningKeyId;
  final int sessionGeneration;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
  final int authorityKeyGeneration;
  final int authorityEpoch;
  final int authoritySequence;
  final String entryDigest;
  final String resultingHeadDigest;
  final String bootSessionId;
  final int acknowledgedAtMonotonicMillis;
  final String clientSignature;

  Map<String, Object> get signingPayload => {
    'schema': connectedTrustedTimeStreamAckSchema,
    'protocolVersion': 2,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'clientDeviceId': clientDeviceId,
    'clientFingerprint': clientFingerprint,
    'clientSigningKeyId': clientSigningKeyId,
    'sessionGeneration': sessionGeneration,
    'coordinatorBindingDigest': coordinatorBindingDigest,
    'coordinatorBindingGeneration': coordinatorBindingGeneration,
    'authorityKeyGeneration': authorityKeyGeneration,
    'authorityEpoch': authorityEpoch,
    'authoritySequence': authoritySequence,
    'entryDigest': entryDigest,
    'resultingHeadDigest': resultingHeadDigest,
    'bootSessionId': bootSessionId,
    'acknowledgedAtMonotonicMillis': acknowledgedAtMonotonicMillis,
  };

  String get canonicalSigningPayload =>
      canonicalConnectedSiteJson(signingPayload);
  String get ackDigest => connectedSiteSha256(signingPayload);

  Map<String, Object> toJson() => {
    ...signingPayload,
    'ackDigest': ackDigest,
    'clientSignature': clientSignature,
  };

  String get canonicalJson => canonicalConnectedSiteJson(toJson());
  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeStreamAckV1.fromJson(Object? value) {
    final map = _exactMap(value, _ackKeys, 'trusted-time stream ack');
    if (map['schema'] != connectedTrustedTimeStreamAckSchema ||
        map['protocolVersion'] != 2 ||
        map['ackDigest'] is! String ||
        map['clientSignature'] is! String) {
      throw const FormatException('trusted-time stream ack');
    }
    try {
      final result = ConnectedTrustedTimeStreamAckV1(
        workspaceId: map['workspaceId'] as String,
        siteId: map['siteId'] as String,
        coordinatorDeviceId: map['coordinatorDeviceId'] as String,
        clientDeviceId: map['clientDeviceId'] as String,
        clientFingerprint: map['clientFingerprint'] as String,
        clientSigningKeyId: map['clientSigningKeyId'] as String,
        sessionGeneration: map['sessionGeneration'] as int,
        coordinatorBindingDigest: map['coordinatorBindingDigest'] as String,
        coordinatorBindingGeneration:
            map['coordinatorBindingGeneration'] as int,
        authorityKeyGeneration: map['authorityKeyGeneration'] as int,
        authorityEpoch: map['authorityEpoch'] as int,
        authoritySequence: map['authoritySequence'] as int,
        entryDigest: map['entryDigest'] as String,
        resultingHeadDigest: map['resultingHeadDigest'] as String,
        bootSessionId: map['bootSessionId'] as String,
        acknowledgedAtMonotonicMillis:
            map['acknowledgedAtMonotonicMillis'] as int,
        clientSignature: map['clientSignature'] as String,
      );
      if (map['ackDigest'] != result.ackDigest) {
        throw const FormatException('trusted-time stream ack digest');
      }
      return result;
    } on TypeError {
      throw const FormatException('trusted-time stream ack');
    }
  }

  factory ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(List<int> bytes) {
    final text = _canonicalText(bytes, 'trusted-time stream ack bytes');
    final result = ConnectedTrustedTimeStreamAckV1.fromJson(jsonDecode(text));
    if (text != result.canonicalJson) {
      throw const FormatException('trusted-time stream ack bytes');
    }
    return result;
  }
}

bool _validTimeWindow(
  ConnectedTrustedTimeStreamEntryKind kind,
  int observedAtMillis,
  int validUntilMillis,
) => switch (kind) {
  ConnectedTrustedTimeStreamEntryKind.time =>
    validUntilMillis > observedAtMillis &&
        validUntilMillis - observedAtMillis <=
            connectedTrustedTimeMaximumValidity.inMilliseconds,
  ConnectedTrustedTimeStreamEntryKind.continuity =>
    validUntilMillis == observedAtMillis,
};

Map<String, Object?> _exactMap(Object? value, Set<String> keys, String label) {
  if (value is! Map) throw FormatException(label);
  final result = <String, Object?>{};
  for (final entry in value.entries) {
    if (entry.key is! String || result.containsKey(entry.key)) {
      throw FormatException(label);
    }
    result[entry.key as String] = entry.value;
  }
  if (result.length != keys.length ||
      result.keys.toSet().difference(keys).isNotEmpty) {
    throw FormatException(label);
  }
  return result;
}

String _canonicalText(List<int> bytes, String label) {
  if (bytes.isEmpty || bytes.length > connectedTrustedTimeStreamMaximumBytes) {
    throw FormatException(label);
  }
  try {
    return utf8.decode(bytes, allowMalformed: false);
  } on FormatException {
    rethrow;
  } on Object {
    throw FormatException(label);
  }
}

bool _validCanonicalSignature(String value) {
  if (!_signature.hasMatch(value)) return false;
  try {
    final padded = value.padRight((value.length + 3) ~/ 4 * 4, '=');
    final bytes = base64Url.decode(padded);
    return bytes.length == 64 &&
        base64UrlEncode(bytes).replaceAll('=', '') == value;
  } on FormatException {
    return false;
  }
}

final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _signature = RegExp(r'^[A-Za-z0-9_-]{86}$');

const _entryKeys = <String>{
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
  'authorityKeyId',
  'authorityKeyFingerprint',
  'authorityKeyGeneration',
  'authorityEpoch',
  'authoritySequence',
  'previousEntryDigest',
  'kind',
  'observedAtMillis',
  'validUntilMillis',
  'entryDigest',
  'authoritySignature',
};

const _ackKeys = <String>{
  'schema',
  'protocolVersion',
  'workspaceId',
  'siteId',
  'coordinatorDeviceId',
  'clientDeviceId',
  'clientFingerprint',
  'clientSigningKeyId',
  'sessionGeneration',
  'coordinatorBindingDigest',
  'coordinatorBindingGeneration',
  'authorityKeyGeneration',
  'authorityEpoch',
  'authoritySequence',
  'entryDigest',
  'resultingHeadDigest',
  'bootSessionId',
  'acknowledgedAtMonotonicMillis',
  'ackDigest',
  'clientSignature',
};

final String _unsignedPlaceholderSignature = base64UrlEncode(
  List<int>.filled(64, 0),
).replaceAll('=', '');
