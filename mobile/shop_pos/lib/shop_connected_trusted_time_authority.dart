import 'dart:convert';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_contract.dart';

const connectedTrustedTimeObservationRequestSchema =
    'supermega.connected-trusted-time-observation-request.v1';

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
