import 'dart:convert';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_contract.dart';

const connectedTrustedTimeObservationRequestSchema =
    'supermega.connected-trusted-time-observation-request.v1';
const connectedTrustedTimeWireRequestSchema =
    'supermega.connected-trusted-time-wire-request.v2';
const connectedTrustedTimeWireResponseSchema =
    'supermega.connected-trusted-time-wire-response.v2';
const connectedTrustedTimeWireProtocolVersion = 2;
const connectedTrustedTimeWireMaximumBytes = 16 * 1024;

/// Transport-neutral request for one signed trusted-time observation.
///
/// The request deliberately carries only the digest of the retained
/// owner-approved authority. A transport must not send the approval itself or
/// any bearer credential as part of these canonical bytes.
final class ConnectedTrustedTimeObservationRequestV1 {
  ConnectedTrustedTimeObservationRequestV1({
    required this.approvalDigest,
    required this.challenge,
  }) {
    if (!_digest.hasMatch(approvalDigest)) {
      throw const FormatException('trusted-time observation request');
    }
  }

  final String approvalDigest;
  final ConnectedTrustedTimeChallengeV1 challenge;

  Map<String, Object> get payload => {
    'schema': connectedTrustedTimeObservationRequestSchema,
    'protocolVersion': connectedSiteProtocolVersion,
    'approvalDigest': approvalDigest,
    'challenge': challenge.toJson(),
  };

  String get observationRequestDigest => connectedSiteSha256(payload);

  Map<String, Object> toJson() => {
    ...payload,
    'observationRequestDigest': observationRequestDigest,
  };

  String get canonicalJson => canonicalConnectedSiteJson(toJson());

  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeObservationRequestV1.fromJson(Object? value) {
    if (value is! Map) {
      throw const FormatException('trusted-time observation request');
    }
    final map = <String, Object?>{};
    for (final entry in value.entries) {
      if (entry.key is! String || map.containsKey(entry.key)) {
        throw const FormatException('trusted-time observation request');
      }
      map[entry.key as String] = entry.value;
    }
    if (map.keys.toSet().difference(_requestKeys).isNotEmpty ||
        map.length != _requestKeys.length ||
        map['schema'] != connectedTrustedTimeObservationRequestSchema ||
        map['protocolVersion'] != connectedSiteProtocolVersion ||
        map['approvalDigest'] is! String ||
        map['observationRequestDigest'] is! String) {
      throw const FormatException('trusted-time observation request');
    }
    final result = ConnectedTrustedTimeObservationRequestV1(
      approvalDigest: map['approvalDigest']! as String,
      challenge: ConnectedTrustedTimeChallengeV1.fromJson(map['challenge']),
    );
    if (map['observationRequestDigest'] != result.observationRequestDigest) {
      throw const FormatException('trusted-time observation request digest');
    }
    return result;
  }

  factory ConnectedTrustedTimeObservationRequestV1.fromCanonicalBytes(
    List<int> bytes,
  ) {
    try {
      final text = utf8.decode(bytes, allowMalformed: false);
      final result = ConnectedTrustedTimeObservationRequestV1.fromJson(
        jsonDecode(text),
      );
      if (text != result.canonicalJson) {
        throw const FormatException('trusted-time observation request bytes');
      }
      return result;
    } on FormatException {
      rethrow;
    } on Object {
      throw const FormatException('trusted-time observation request bytes');
    }
  }
}

/// Versioned LAN envelope for an observation request.
///
/// V2 wraps the reviewed V1 authority request without changing its digest or
/// signature domains. It does not add an endpoint or authorize transport.
final class ConnectedTrustedTimeWireRequestV2 {
  ConnectedTrustedTimeWireRequestV2({required this.request});

  final ConnectedTrustedTimeObservationRequestV1 request;

  Map<String, Object> get payload => {
    'schema': connectedTrustedTimeWireRequestSchema,
    'protocolVersion': connectedTrustedTimeWireProtocolVersion,
    'request': request.toJson(),
  };

  String get wireRequestDigest => connectedSiteSha256(payload);

  Map<String, Object> toJson() => {
    ...payload,
    'wireRequestDigest': wireRequestDigest,
  };

  String get canonicalJson => canonicalConnectedSiteJson(toJson());

  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeWireRequestV2.fromJson(Object? value) {
    final map = _exactMap(value, _wireRequestKeys, 'trusted-time wire request');
    if (map['schema'] != connectedTrustedTimeWireRequestSchema ||
        map['protocolVersion'] != connectedTrustedTimeWireProtocolVersion ||
        map['wireRequestDigest'] is! String) {
      throw const FormatException('trusted-time wire request');
    }
    final result = ConnectedTrustedTimeWireRequestV2(
      request: ConnectedTrustedTimeObservationRequestV1.fromJson(
        map['request'],
      ),
    );
    if (map['wireRequestDigest'] != result.wireRequestDigest) {
      throw const FormatException('trusted-time wire request digest');
    }
    return result;
  }

  factory ConnectedTrustedTimeWireRequestV2.fromCanonicalBytes(
    List<int> bytes,
  ) {
    final text = _canonicalWireText(bytes, 'trusted-time wire request bytes');
    final result = ConnectedTrustedTimeWireRequestV2.fromJson(jsonDecode(text));
    if (text != result.canonicalJson) {
      throw const FormatException('trusted-time wire request bytes');
    }
    return result;
  }
}

/// Canonical V2 response echoing the exact wire request digest.
final class ConnectedTrustedTimeWireResponseV2 {
  ConnectedTrustedTimeWireResponseV2({
    required this.request,
    required this.observation,
  }) {
    if (observation.challenge.requestDigest !=
        request.request.challenge.requestDigest) {
      throw const FormatException('trusted-time wire response observation');
    }
  }

  final ConnectedTrustedTimeWireRequestV2 request;
  final ConnectedTrustedTimeObservationV1 observation;

  String get wireRequestDigest => request.wireRequestDigest;

  Map<String, Object> toJson() => {
    'schema': connectedTrustedTimeWireResponseSchema,
    'protocolVersion': connectedTrustedTimeWireProtocolVersion,
    'wireRequestDigest': wireRequestDigest,
    'observation': observation.toJson(),
  };

  String get canonicalJson => canonicalConnectedSiteJson(toJson());

  List<int> get canonicalBytes =>
      List<int>.unmodifiable(utf8.encode(canonicalJson));

  factory ConnectedTrustedTimeWireResponseV2.fromJson(
    Object? value, {
    required ConnectedTrustedTimeWireRequestV2 request,
  }) {
    final map = _exactMap(
      value,
      _wireResponseKeys,
      'trusted-time wire response',
    );
    if (map['schema'] != connectedTrustedTimeWireResponseSchema ||
        map['protocolVersion'] != connectedTrustedTimeWireProtocolVersion ||
        map['wireRequestDigest'] != request.wireRequestDigest) {
      throw const FormatException('trusted-time wire response');
    }
    return ConnectedTrustedTimeWireResponseV2(
      request: request,
      observation: ConnectedTrustedTimeObservationV1.fromJson(
        map['observation'],
        request.request.challenge,
      ),
    );
  }

  factory ConnectedTrustedTimeWireResponseV2.fromCanonicalBytes(
    List<int> bytes, {
    required ConnectedTrustedTimeWireRequestV2 request,
  }) {
    final text = _canonicalWireText(bytes, 'trusted-time wire response bytes');
    final result = ConnectedTrustedTimeWireResponseV2.fromJson(
      jsonDecode(text),
      request: request,
    );
    if (text != result.canonicalJson) {
      throw const FormatException('trusted-time wire response bytes');
    }
    return result;
  }
}

/// Protected coordinator boundary for issuing a trusted-time observation.
///
/// Implementations must resolve [request.approvalDigest] to a retained,
/// independently owner-verified approval; revalidate the complete challenge
/// scope (workspace, site, coordinator, client identity/fingerprint, session,
/// coordinator binding and generation) against current enrollment and
/// revocation state; and sign the exact challenge with protected platform key
/// custody. Implementations must never treat this interface as staff command
/// authority or return an observation for an unknown or stale approval.
abstract interface class ConnectedTrustedTimeCoordinatorAuthority {
  Future<ConnectedTrustedTimeObservationV1> observe(
    ConnectedTrustedTimeObservationRequestV1 request,
  );
}

/// Default fail-closed boundary until protected coordinator authority exists.
final class UnavailableConnectedTrustedTimeCoordinatorAuthority
    implements ConnectedTrustedTimeCoordinatorAuthority {
  const UnavailableConnectedTrustedTimeCoordinatorAuthority();

  @override
  Future<ConnectedTrustedTimeObservationV1> observe(
    ConnectedTrustedTimeObservationRequestV1 request,
  ) async => throw StateError(
    'connected_trusted_time_coordinator_authority_unavailable',
  );
}

final _digest = RegExp(r'^[0-9a-f]{64}$');

const _requestKeys = <String>{
  'schema',
  'protocolVersion',
  'approvalDigest',
  'challenge',
  'observationRequestDigest',
};

const _wireRequestKeys = <String>{
  'schema',
  'protocolVersion',
  'request',
  'wireRequestDigest',
};

const _wireResponseKeys = <String>{
  'schema',
  'protocolVersion',
  'wireRequestDigest',
  'observation',
};

Map<String, Object?> _exactMap(Object? value, Set<String> keys, String label) {
  if (value is! Map) throw FormatException(label);
  final map = <String, Object?>{};
  for (final entry in value.entries) {
    if (entry.key is! String || map.containsKey(entry.key)) {
      throw FormatException(label);
    }
    map[entry.key as String] = entry.value;
  }
  if (map.length != keys.length ||
      map.keys.toSet().difference(keys).isNotEmpty) {
    throw FormatException(label);
  }
  return map;
}

String _canonicalWireText(List<int> bytes, String label) {
  if (bytes.isEmpty || bytes.length > connectedTrustedTimeWireMaximumBytes) {
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
