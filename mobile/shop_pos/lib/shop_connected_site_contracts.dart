import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

const connectedSiteProtocolVersion = 1;

Never _invalid(String reason) =>
    throw FormatException('connected_site_$reason');

String _text(Object? value, String field, {int max = 160}) {
  if (value is! String ||
      value.isEmpty ||
      value.trim() != value ||
      value.length > max ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(value)) {
    _invalid(field);
  }
  return value;
}

String _identifier(Object? value, String field, {int max = 128}) {
  final result = _text(value, field, max: max);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(result)) {
    _invalid(field);
  }
  return result;
}

String _hexDigest(Object? value, String field) {
  final result = _text(value, field, max: 64);
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(result)) _invalid(field);
  return result;
}

int _integer(Object? value, String field, {int min = 0, int? max}) {
  if (value is! int || value < min || (max != null && value > max)) {
    _invalid(field);
  }
  return value;
}

String _timestamp(Object? value, String field) {
  final text = _text(value, field, max: 32);
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?Z$')
      .hasMatch(text)) {
    _invalid(field);
  }
  final parsed = DateTime.tryParse(text);
  if (parsed == null || !parsed.isUtc) _invalid(field);
  return text;
}

Map<String, Object?> _shape(
  Object? value,
  String field,
  Set<String> required, {
  Set<String> optional = const {},
}) {
  if (value is! Map) _invalid('${field}_shape');
  final result = <String, Object?>{};
  for (final entry in value.entries) {
    if (entry.key is! String) _invalid('${field}_shape');
    result[entry.key as String] = entry.value;
  }
  if (!result.keys.toSet().containsAll(required) ||
      result.keys.toSet().difference({...required, ...optional}).isNotEmpty) {
    _invalid('${field}_shape');
  }
  return result;
}

void _version(Map<String, Object?> value) {
  if (value['protocolVersion'] != connectedSiteProtocolVersion) {
    _invalid('protocol_version');
  }
}

Object? _canonicalValue(Object? value) {
  if (value == null || value is bool || value is String || value is int) {
    return value;
  }
  if (value is List) {
    return List<Object?>.unmodifiable(value.map(_canonicalValue));
  }
  if (value is Map) {
    final entries = <String, Object?>{};
    for (final entry in value.entries) {
      if (entry.key is! String || entries.containsKey(entry.key)) {
        _invalid('canonical_map');
      }
      entries[entry.key as String] = _canonicalValue(entry.value);
    }
    final keys = entries.keys.toList()..sort();
    return Map<String, Object?>.unmodifiable({
      for (final key in keys) key: entries[key],
    });
  }
  _invalid('canonical_value');
}

/// Stable JSON for hashing and signature inputs. Object keys are sorted and
/// floating-point/non-JSON values are rejected rather than normalized.
String canonicalConnectedSiteJson(Object? value) =>
    jsonEncode(_canonicalValue(value));

String connectedSiteSha256(Object? value) => crypto.sha256
    .convert(utf8.encode(canonicalConnectedSiteJson(value)))
    .toString();

Map<String, Object?> _immutableMap(Object? value, String field) {
  if (value is! Map) _invalid(field);
  final normalized = _canonicalValue(value);
  if (normalized is! Map<String, Object?>) _invalid(field);
  return normalized;
}

List<String> _identifiers(Object? value, String field) {
  if (value is! List || value.isEmpty || value.length > 64) _invalid(field);
  final result = value
      .map((item) => _identifier(item, field, max: 80))
      .toList(growable: false);
  if (result.toSet().length != result.length) _invalid(field);
  final sorted = [...result]..sort();
  if (jsonEncode(sorted) != jsonEncode(result)) _invalid('${field}_order');
  return List.unmodifiable(result);
}

bool _isPrivateSiteAddress(String value) {
  if (value.contains('%')) return false;
  final address = InternetAddress.tryParse(value);
  if (address == null) return false;
  final bytes = address.rawAddress;
  if (bytes.length == 4) {
    return bytes[0] == 10 ||
        (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
        (bytes[0] == 192 && bytes[1] == 168);
  }
  return bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
}

class CoordinatorPairingV1 {
  CoordinatorPairingV1({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String certificateSha256,
    required String address,
    required int port,
    required String nonce,
    required String issuedAt,
    required String expiresAt,
  }) : workspaceId = _identifier(workspaceId, 'pairing_workspace'),
       siteId = _identifier(siteId, 'pairing_site'),
       coordinatorDeviceId = _identifier(coordinatorDeviceId, 'pairing_device'),
       certificateSha256 = _hexDigest(certificateSha256, 'pairing_certificate'),
       address = _text(address, 'pairing_address', max: 255),
       port = _integer(port, 'pairing_port', min: 1, max: 65535),
       nonce = _identifier(nonce, 'pairing_nonce', max: 128),
       issuedAt = _timestamp(issuedAt, 'pairing_issued_at'),
       expiresAt = _timestamp(expiresAt, 'pairing_expiry') {
    if (nonce.length < 22 ||
        address.contains('://') ||
        !_isPrivateSiteAddress(address)) {
      _invalid('pairing_endpoint');
    }
    final lifetime = DateTime.parse(expiresAt)
        .difference(DateTime.parse(issuedAt));
    if (lifetime <= Duration.zero || lifetime > const Duration(minutes: 5)) {
      _invalid('pairing_window');
    }
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String certificateSha256;
  final String address;
  final int port;
  final String nonce;
  final String issuedAt;
  final String expiresAt;

  void requireValidAt(DateTime now) {
    final instant = now.toUtc();
    if (instant.isBefore(DateTime.parse(issuedAt)) ||
        !instant.isBefore(DateTime.parse(expiresAt))) {
      _invalid('pairing_not_valid');
    }
  }

  Map<String, Object> toJson() => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'certificateSha256': certificateSha256,
    'address': address,
    'port': port,
    'nonce': nonce,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
  };

  factory CoordinatorPairingV1.fromJson(Object? value) {
    final json = _shape(value, 'pairing', {
      'protocolVersion',
      'workspaceId',
      'siteId',
      'coordinatorDeviceId',
      'certificateSha256',
      'address',
      'port',
      'nonce',
      'issuedAt',
      'expiresAt',
    });
    _version(json);
    return CoordinatorPairingV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      coordinatorDeviceId: json['coordinatorDeviceId'] as dynamic,
      certificateSha256: json['certificateSha256'] as dynamic,
      address: json['address'] as dynamic,
      port: json['port'] as dynamic,
      nonce: json['nonce'] as dynamic,
      issuedAt: json['issuedAt'] as dynamic,
      expiresAt: json['expiresAt'] as dynamic,
    );
  }
}

class OfflineStaffLeaseV1 {
  OfflineStaffLeaseV1({
    required String leaseId,
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String role,
    required List<String> capabilities,
    required String deviceId,
    required int sessionGeneration,
    required int revocationGeneration,
    required String issuedAt,
    required String expiresAt,
    required String issuerKeyId,
    required String payloadDigest,
    required String signature,
  }) : leaseId = _identifier(leaseId, 'lease_id'),
       workspaceId = _identifier(workspaceId, 'lease_workspace'),
       siteId = _identifier(siteId, 'lease_site'),
       actorId = _identifier(actorId, 'lease_actor'),
       role = _identifier(role, 'lease_role', max: 80),
       capabilities = _identifiers(capabilities, 'lease_capabilities'),
       deviceId = _identifier(deviceId, 'lease_device'),
       sessionGeneration = _integer(
         sessionGeneration,
         'lease_session_generation',
         min: 1,
       ),
       revocationGeneration = _integer(
         revocationGeneration,
         'lease_revocation_generation',
       ),
       issuedAt = _timestamp(issuedAt, 'lease_issued_at'),
       expiresAt = _timestamp(expiresAt, 'lease_expires_at'),
       issuerKeyId = _identifier(issuerKeyId, 'lease_issuer_key'),
       payloadDigest = _hexDigest(payloadDigest, 'lease_payload_digest'),
       signature = _text(signature, 'lease_signature', max: 2048) {
    if (DateTime.parse(expiresAt).difference(DateTime.parse(issuedAt)) >
            const Duration(days: 7) ||
        !DateTime.parse(expiresAt).isAfter(DateTime.parse(issuedAt)) ||
        signature.length < 32 ||
        !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(signature)) {
      _invalid('lease_window_or_signature');
    }
    if (connectedSiteSha256(unsignedPayload) != payloadDigest) {
      _invalid('lease_payload_digest_mismatch');
    }
  }

  final String leaseId;
  final String workspaceId;
  final String siteId;
  final String actorId;
  final String role;
  final List<String> capabilities;
  final String deviceId;
  final int sessionGeneration;
  final int revocationGeneration;
  final String issuedAt;
  final String expiresAt;
  final String issuerKeyId;
  final String payloadDigest;
  final String signature;

  String get tenantId => workspaceId;
  String get keyId => issuerKeyId;
  int get issuedAtMillis => DateTime.parse(issuedAt).millisecondsSinceEpoch;
  int get expiresAtMillis => DateTime.parse(expiresAt).millisecondsSinceEpoch;

  Map<String, Object> get unsignedPayload => {
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': leaseId,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'actorId': actorId,
    'role': role,
    'capabilities': capabilities,
    'deviceId': deviceId,
    'sessionGeneration': sessionGeneration,
    'revocationGeneration': revocationGeneration,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
    'issuerKeyId': issuerKeyId,
  };

  Map<String, Object> toJson() => {
    ...unsignedPayload,
    'payloadDigest': payloadDigest,
    'signature': signature,
  };

  factory OfflineStaffLeaseV1.fromJson(Object? value) {
    final json = _shape(value, 'lease', {
      'protocolVersion',
      'leaseId',
      'workspaceId',
      'siteId',
      'actorId',
      'role',
      'capabilities',
      'deviceId',
      'sessionGeneration',
      'revocationGeneration',
      'issuedAt',
      'expiresAt',
      'issuerKeyId',
      'payloadDigest',
      'signature',
    });
    _version(json);
    return OfflineStaffLeaseV1(
      leaseId: json['leaseId'] as dynamic,
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      actorId: json['actorId'] as dynamic,
      role: json['role'] as dynamic,
      capabilities: (json['capabilities'] as List).cast<String>(),
      deviceId: json['deviceId'] as dynamic,
      sessionGeneration: json['sessionGeneration'] as dynamic,
      revocationGeneration: json['revocationGeneration'] as dynamic,
      issuedAt: json['issuedAt'] as dynamic,
      expiresAt: json['expiresAt'] as dynamic,
      issuerKeyId: json['issuerKeyId'] as dynamic,
      payloadDigest: json['payloadDigest'] as dynamic,
      signature: json['signature'] as dynamic,
    );
  }
}

class SiteCommandV1 {
  SiteCommandV1({
    required String commandId,
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required String aggregateType,
    required String aggregateId,
    required int expectedVersion,
    required String commandType,
    required Map<String, Object?> payload,
    required String payloadDigest,
    required String leaseDigest,
    required String issuedAt,
    required String signingKeyId,
    required String signatureAlgorithm,
    required String signature,
  }) : commandId = _identifier(commandId, 'command_id'),
       workspaceId = _identifier(workspaceId, 'command_workspace'),
       siteId = _identifier(siteId, 'command_site'),
       actorId = _identifier(actorId, 'command_actor'),
       deviceId = _identifier(deviceId, 'command_device'),
       aggregateType = _identifier(aggregateType, 'command_aggregate_type'),
       aggregateId = _identifier(aggregateId, 'command_aggregate_id'),
       expectedVersion = _integer(expectedVersion, 'command_expected_version'),
       commandType = _identifier(commandType, 'command_type'),
       payload = _immutableMap(payload, 'command_payload'),
       payloadDigest = _hexDigest(payloadDigest, 'command_payload_digest'),
       leaseDigest = _hexDigest(leaseDigest, 'command_lease_digest'),
       issuedAt = _timestamp(issuedAt, 'command_issued_at'),
       signingKeyId = _identifier(signingKeyId, 'command_signing_key'),
       signatureAlgorithm = _identifier(
         signatureAlgorithm,
         'command_signature_algorithm',
       ),
       signature = _text(signature, 'command_signature', max: 2048) {
    if (connectedSiteSha256(this.payload) != payloadDigest ||
        signatureAlgorithm != 'ed25519' ||
        signature.length < 32 ||
        !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(signature)) {
      _invalid('command_digest_or_signature');
    }
  }

  final String commandId;
  final String workspaceId;
  final String siteId;
  final String actorId;
  final String deviceId;
  final String aggregateType;
  final String aggregateId;
  final int expectedVersion;
  final String commandType;
  final Map<String, Object?> payload;
  final String payloadDigest;
  final String leaseDigest;
  final String issuedAt;
  final String signingKeyId;
  final String signatureAlgorithm;
  final String signature;

  Map<String, Object> get signingPayload => {
    'protocolVersion': connectedSiteProtocolVersion,
    'commandId': commandId,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'actorId': actorId,
    'deviceId': deviceId,
    'aggregateType': aggregateType,
    'aggregateId': aggregateId,
    'expectedVersion': expectedVersion,
    'commandType': commandType,
    'payloadDigest': payloadDigest,
    'leaseDigest': leaseDigest,
    'issuedAt': issuedAt,
    'signingKeyId': signingKeyId,
    'signatureAlgorithm': signatureAlgorithm,
  };

  String get commandDigest => connectedSiteSha256(signingPayload);

  Map<String, Object> toJson() => {
    ...signingPayload,
    'payload': payload,
    'signature': signature,
  };

  factory SiteCommandV1.fromJson(Object? value) {
    final json = _shape(value, 'command', {
      'protocolVersion',
      'commandId',
      'workspaceId',
      'siteId',
      'actorId',
      'deviceId',
      'aggregateType',
      'aggregateId',
      'expectedVersion',
      'commandType',
      'payload',
      'payloadDigest',
      'leaseDigest',
      'issuedAt',
      'signingKeyId',
      'signatureAlgorithm',
      'signature',
    });
    _version(json);
    return SiteCommandV1(
      commandId: json['commandId'] as dynamic,
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      actorId: json['actorId'] as dynamic,
      deviceId: json['deviceId'] as dynamic,
      aggregateType: json['aggregateType'] as dynamic,
      aggregateId: json['aggregateId'] as dynamic,
      expectedVersion: json['expectedVersion'] as dynamic,
      commandType: json['commandType'] as dynamic,
      payload: (json['payload'] as Map).cast<String, Object?>(),
      payloadDigest: json['payloadDigest'] as dynamic,
      leaseDigest: json['leaseDigest'] as dynamic,
      issuedAt: json['issuedAt'] as dynamic,
      signingKeyId: json['signingKeyId'] as dynamic,
      signatureAlgorithm: json['signatureAlgorithm'] as dynamic,
      signature: json['signature'] as dynamic,
    );
  }
}

enum SiteCommandAckState { accepted, replayed, conflict, denied }

class SiteCommandAckV1 {
  SiteCommandAckV1({
    required String commandId,
    required String commandDigest,
    required SiteCommandAckState state,
    required int canonicalVersion,
    String? eventDigest,
    String? reason,
  }) : commandId = _identifier(commandId, 'ack_command_id'),
       commandDigest = _hexDigest(commandDigest, 'ack_command_digest'),
       state = state,
       canonicalVersion = _integer(canonicalVersion, 'ack_version'),
       eventDigest = eventDigest == null
           ? null
           : _hexDigest(eventDigest, 'ack_event_digest'),
       reason = reason == null ? null : _identifier(reason, 'ack_reason') {
    if ((state == SiteCommandAckState.accepted ||
            state == SiteCommandAckState.replayed) &&
        this.eventDigest == null) {
      _invalid('ack_event_required');
    }
    if ((state == SiteCommandAckState.conflict ||
            state == SiteCommandAckState.denied) &&
        this.reason == null) {
      _invalid('ack_reason_required');
    }
  }

  final String commandId;
  final String commandDigest;
  final SiteCommandAckState state;
  final int canonicalVersion;
  final String? eventDigest;
  final String? reason;

  Map<String, Object> toJson() => {
    'protocolVersion': connectedSiteProtocolVersion,
    'commandId': commandId,
    'commandDigest': commandDigest,
    'state': state.name,
    'canonicalVersion': canonicalVersion,
    'eventDigest': ?eventDigest,
    'reason': ?reason,
  };

  factory SiteCommandAckV1.fromJson(Object? value) {
    final json = _shape(
      value,
      'ack',
      {
        'protocolVersion',
        'commandId',
        'commandDigest',
        'state',
        'canonicalVersion',
      },
      optional: {'eventDigest', 'reason'},
    );
    _version(json);
    final stateName = _identifier(json['state'], 'ack_state', max: 16);
    final state = SiteCommandAckState.values
        .where((value) => value.name == stateName)
        .firstOrNull;
    if (state == null) _invalid('ack_state');
    return SiteCommandAckV1(
      commandId: json['commandId'] as dynamic,
      commandDigest: json['commandDigest'] as dynamic,
      state: state,
      canonicalVersion: json['canonicalVersion'] as dynamic,
      eventDigest: json['eventDigest'] as String?,
      reason: json['reason'] as String?,
    );
  }
}

class SiteDeltaV1 {
  SiteDeltaV1({
    required String workspaceId,
    required String siteId,
    required int afterCursor,
    required int nextCursor,
    required List<Map<String, Object?>> events,
  }) : workspaceId = _identifier(workspaceId, 'delta_workspace'),
       siteId = _identifier(siteId, 'delta_site'),
       afterCursor = _integer(afterCursor, 'delta_after_cursor'),
       nextCursor = _integer(nextCursor, 'delta_next_cursor'),
       events = List.unmodifiable(
         events.map((event) => _immutableMap(event, 'delta_event')),
       ) {
    if (nextCursor < afterCursor ||
        nextCursor - afterCursor != this.events.length) {
      _invalid('delta_cursor');
    }
    var cursor = afterCursor;
    for (final entry in this.events) {
      cursor += 1;
      final shapedEntry = _shape(entry, 'delta_event', {
        'cursor',
        'event',
        'eventDigest',
      });
      if (shapedEntry['cursor'] != cursor) {
        _invalid('delta_event_sequence');
      }
      final event = _shape(shapedEntry['event'], 'event_envelope', {
        'eventId',
        'workspaceId',
        'siteId',
        'aggregateType',
        'aggregateId',
        'aggregateVersion',
        'eventType',
        'occurredAt',
        'payload',
      });
      _identifier(event['eventId'], 'event_id');
      if (_identifier(event['workspaceId'], 'event_workspace') !=
              this.workspaceId ||
          _identifier(event['siteId'], 'event_site') != this.siteId) {
        _invalid('event_site_binding');
      }
      _identifier(event['aggregateType'], 'event_aggregate_type');
      _identifier(event['aggregateId'], 'event_aggregate_id');
      _integer(event['aggregateVersion'], 'event_aggregate_version', min: 1);
      _identifier(event['eventType'], 'event_type');
      _timestamp(event['occurredAt'], 'event_occurred_at');
      _immutableMap(event['payload'], 'event_payload');
      if (_hexDigest(shapedEntry['eventDigest'], 'event_digest') !=
          connectedSiteSha256(event)) {
        _invalid('event_digest_mismatch');
      }
    }
  }

  final String workspaceId;
  final String siteId;
  final int afterCursor;
  final int nextCursor;
  final List<Map<String, Object?>> events;

  Map<String, Object> toJson() => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'afterCursor': afterCursor,
    'nextCursor': nextCursor,
    'events': events,
  };

  factory SiteDeltaV1.fromJson(Object? value) {
    final json = _shape(value, 'delta', {
      'protocolVersion',
      'workspaceId',
      'siteId',
      'afterCursor',
      'nextCursor',
      'events',
    });
    _version(json);
    if (json['events'] is! List) _invalid('delta_events');
    return SiteDeltaV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      afterCursor: json['afterCursor'] as dynamic,
      nextCursor: json['nextCursor'] as dynamic,
      events: (json['events'] as List)
          .map((value) => (value as Map).cast<String, Object?>())
          .toList(),
    );
  }
}

class SiteSnapshotV1 {
  SiteSnapshotV1({
    required String workspaceId,
    required String siteId,
    required int version,
    required int continuationCursor,
    required Map<String, Object?> projections,
    required String checkpointDigest,
  }) : workspaceId = _identifier(workspaceId, 'snapshot_workspace'),
       siteId = _identifier(siteId, 'snapshot_site'),
       version = _integer(version, 'snapshot_version'),
       continuationCursor = _integer(continuationCursor, 'snapshot_cursor'),
       projections = _immutableMap(projections, 'snapshot_projections'),
       checkpointDigest = _hexDigest(checkpointDigest, 'snapshot_checkpoint') {
    if (connectedSiteSha256(unsignedPayload) != checkpointDigest) {
      _invalid('snapshot_checkpoint_mismatch');
    }
  }

  final String workspaceId;
  final String siteId;
  final int version;
  final int continuationCursor;
  final Map<String, Object?> projections;
  final String checkpointDigest;

  Map<String, Object> get unsignedPayload => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'version': version,
    'continuationCursor': continuationCursor,
    'projections': projections,
  };

  Map<String, Object> toJson() => {
    ...unsignedPayload,
    'checkpointDigest': checkpointDigest,
  };

  factory SiteSnapshotV1.fromJson(Object? value) {
    final json = _shape(value, 'snapshot', {
      'protocolVersion',
      'workspaceId',
      'siteId',
      'version',
      'continuationCursor',
      'projections',
      'checkpointDigest',
    });
    _version(json);
    return SiteSnapshotV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      version: json['version'] as dynamic,
      continuationCursor: json['continuationCursor'] as dynamic,
      projections: (json['projections'] as Map).cast<String, Object?>(),
      checkpointDigest: json['checkpointDigest'] as dynamic,
    );
  }
}

enum SiteConflictState { pending, resolved, quarantined }

class SiteConflictV1 {
  SiteConflictV1({
    required String workspaceId,
    required String siteId,
    required String conflictId,
    required String commandId,
    required String commandDigest,
    required String aggregateType,
    required String aggregateId,
    required int expectedVersion,
    required int actualVersion,
    required String reason,
    required String createdAt,
    required this.state,
  }) : workspaceId = _identifier(workspaceId, 'conflict_workspace'),
       siteId = _identifier(siteId, 'conflict_site'),
       conflictId = _identifier(conflictId, 'conflict_id'),
       commandId = _identifier(commandId, 'conflict_command_id'),
       commandDigest = _hexDigest(commandDigest, 'conflict_command_digest'),
       aggregateType = _identifier(aggregateType, 'conflict_aggregate_type'),
       aggregateId = _identifier(aggregateId, 'conflict_aggregate_id'),
       expectedVersion = _integer(expectedVersion, 'conflict_expected'),
       actualVersion = _integer(actualVersion, 'conflict_actual'),
       reason = _identifier(reason, 'conflict_reason'),
       createdAt = _timestamp(createdAt, 'conflict_created_at');

  final String workspaceId;
  final String siteId;
  final String conflictId;
  final String commandId;
  final String commandDigest;
  final String aggregateType;
  final String aggregateId;
  final int expectedVersion;
  final int actualVersion;
  final String reason;
  final String createdAt;
  final SiteConflictState state;

  Map<String, Object> toJson() => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'conflictId': conflictId,
    'commandId': commandId,
    'commandDigest': commandDigest,
    'aggregateType': aggregateType,
    'aggregateId': aggregateId,
    'expectedVersion': expectedVersion,
    'actualVersion': actualVersion,
    'reason': reason,
    'createdAt': createdAt,
    'state': state.name,
  };

  factory SiteConflictV1.fromJson(Object? value) {
    final json = _shape(value, 'conflict', {
      'protocolVersion',
      'workspaceId',
      'siteId',
      'conflictId',
      'commandId',
      'commandDigest',
      'aggregateType',
      'aggregateId',
      'expectedVersion',
      'actualVersion',
      'reason',
      'createdAt',
      'state',
    });
    _version(json);
    final stateName = _identifier(json['state'], 'conflict_state', max: 16);
    final state = SiteConflictState.values
        .where((value) => value.name == stateName)
        .firstOrNull;
    if (state == null) _invalid('conflict_state');
    return SiteConflictV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      conflictId: json['conflictId'] as dynamic,
      commandId: json['commandId'] as dynamic,
      commandDigest: json['commandDigest'] as dynamic,
      aggregateType: json['aggregateType'] as dynamic,
      aggregateId: json['aggregateId'] as dynamic,
      expectedVersion: json['expectedVersion'] as dynamic,
      actualVersion: json['actualVersion'] as dynamic,
      reason: json['reason'] as dynamic,
      createdAt: json['createdAt'] as dynamic,
      state: state,
    );
  }
}

class CoordinatorRecoveryV1 {
  CoordinatorRecoveryV1({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String checkpointDigest,
    required int lastEventCursor,
    required int lastCloudCursor,
    required int pendingCommandCount,
    required String capturedAt,
  }) : workspaceId = _identifier(workspaceId, 'recovery_workspace'),
       siteId = _identifier(siteId, 'recovery_site'),
       coordinatorDeviceId = _identifier(
         coordinatorDeviceId,
         'recovery_device',
       ),
       checkpointDigest = _hexDigest(checkpointDigest, 'recovery_checkpoint'),
       lastEventCursor = _integer(lastEventCursor, 'recovery_event_cursor'),
       lastCloudCursor = _integer(lastCloudCursor, 'recovery_cloud_cursor'),
       pendingCommandCount = _integer(
         pendingCommandCount,
         'recovery_pending_count',
       ),
       capturedAt = _timestamp(capturedAt, 'recovery_captured_at');

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String checkpointDigest;
  final int lastEventCursor;
  final int lastCloudCursor;
  final int pendingCommandCount;
  final String capturedAt;

  Map<String, Object> toJson() => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'checkpointDigest': checkpointDigest,
    'lastEventCursor': lastEventCursor,
    'lastCloudCursor': lastCloudCursor,
    'pendingCommandCount': pendingCommandCount,
    'capturedAt': capturedAt,
  };

  factory CoordinatorRecoveryV1.fromJson(Object? value) {
    final json = _shape(value, 'recovery', {
      'protocolVersion',
      'workspaceId',
      'siteId',
      'coordinatorDeviceId',
      'checkpointDigest',
      'lastEventCursor',
      'lastCloudCursor',
      'pendingCommandCount',
      'capturedAt',
    });
    _version(json);
    return CoordinatorRecoveryV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      coordinatorDeviceId: json['coordinatorDeviceId'] as dynamic,
      checkpointDigest: json['checkpointDigest'] as dynamic,
      lastEventCursor: json['lastEventCursor'] as dynamic,
      lastCloudCursor: json['lastCloudCursor'] as dynamic,
      pendingCommandCount: json['pendingCommandCount'] as dynamic,
      capturedAt: json['capturedAt'] as dynamic,
    );
  }
}
