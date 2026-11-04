import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;

import 'shop_connected_site_contracts.dart';
import 'shop_connected_retained_signature_verifier.dart';
import 'shop_connected_trusted_time_stream.dart';

const shopConnectedTrustedTimeClientEntriesV39Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_time_client_entries (
    entry_digest TEXT PRIMARY KEY CHECK (length(entry_digest) = 64),
    stream_digest TEXT NOT NULL CHECK (length(stream_digest) = 64),
    authority_sequence INTEGER NOT NULL CHECK (authority_sequence > 0),
    previous_entry_digest TEXT CHECK (previous_entry_digest IS NULL OR length(previous_entry_digest) = 64),
    entry_json TEXT NOT NULL CHECK (json_valid(entry_json)),
    entry_bytes_digest TEXT NOT NULL CHECK (length(entry_bytes_digest) = 64),
    UNIQUE (stream_digest, authority_sequence),
    CHECK ((authority_sequence = 1) = (previous_entry_digest IS NULL))
  )
''';

const shopConnectedTrustedTimeClientAcksV39Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_time_client_acks (
    ack_digest TEXT PRIMARY KEY CHECK (length(ack_digest) = 64),
    entry_digest TEXT NOT NULL UNIQUE REFERENCES shop_connected_time_client_entries(entry_digest),
    ack_json TEXT NOT NULL CHECK (json_valid(ack_json)),
    ack_bytes_digest TEXT NOT NULL CHECK (length(ack_bytes_digest) = 64)
  )
''';

const shopConnectedTrustedTimeClientHeadsV39Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_time_client_heads (
    head_digest TEXT PRIMARY KEY CHECK (length(head_digest) = 64),
    stream_digest TEXT NOT NULL CHECK (length(stream_digest) = 64),
    authority_sequence INTEGER NOT NULL CHECK (authority_sequence > 0),
    entry_digest TEXT NOT NULL UNIQUE REFERENCES shop_connected_time_client_entries(entry_digest),
    ack_digest TEXT NOT NULL UNIQUE REFERENCES shop_connected_time_client_acks(ack_digest),
    UNIQUE (stream_digest, authority_sequence)
  )
''';

const shopConnectedTrustedTimeClientRestoreBarriersV39Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_time_client_restore_barriers (
    barrier_digest TEXT PRIMARY KEY CHECK (length(barrier_digest) = 64),
    stream_digest TEXT NOT NULL CHECK (length(stream_digest) = 64),
    restore_sequence INTEGER NOT NULL CHECK (restore_sequence > 0),
    head_digest TEXT NOT NULL REFERENCES shop_connected_time_client_heads(head_digest),
    barrier_json TEXT NOT NULL CHECK (json_valid(barrier_json)),
    UNIQUE (stream_digest, restore_sequence)
  )
''';

const shopConnectedTrustedTimeClientRestoreClearancesV39Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_time_client_restore_clearances (
    clearance_digest TEXT PRIMARY KEY CHECK (length(clearance_digest) = 64),
    barrier_digest TEXT NOT NULL UNIQUE REFERENCES shop_connected_time_client_restore_barriers(barrier_digest),
    clearance_json TEXT NOT NULL CHECK (json_valid(clearance_json))
  )
''';

Map<String, String> shopConnectedTrustedTimeClientSchemaDefinitionsV39() => {
  'shop_connected_time_client_entries':
      shopConnectedTrustedTimeClientEntriesV39Sql,
  'shop_connected_time_client_acks': shopConnectedTrustedTimeClientAcksV39Sql,
  'shop_connected_time_client_heads': shopConnectedTrustedTimeClientHeadsV39Sql,
  'shop_connected_time_client_restore_barriers':
      shopConnectedTrustedTimeClientRestoreBarriersV39Sql,
  'shop_connected_time_client_restore_clearances':
      shopConnectedTrustedTimeClientRestoreClearancesV39Sql,
  for (final table in const [
    'shop_connected_time_client_entries',
    'shop_connected_time_client_acks',
    'shop_connected_time_client_heads',
    'shop_connected_time_client_restore_barriers',
    'shop_connected_time_client_restore_clearances',
  ]) ...{
    '${table}_no_update': _immutableTrigger(table: table, operation: 'update'),
    '${table}_no_delete': _immutableTrigger(table: table, operation: 'delete'),
  },
};

String connectedTrustedTimeClientStreamDigest(
  ConnectedTrustedTimeStreamEntryV2 entry,
) => connectedSiteSha256({
  'schema': 'supermega.connected-trusted-time-client-stream.v1',
  'workspaceId': entry.workspaceId,
  'siteId': entry.siteId,
  'coordinatorDeviceId': entry.coordinatorDeviceId,
  'clientDeviceId': entry.clientDeviceId,
  'clientFingerprint': entry.clientFingerprint,
  'sessionGeneration': entry.sessionGeneration,
  'coordinatorBindingDigest': entry.coordinatorBindingDigest,
  'coordinatorBindingGeneration': entry.coordinatorBindingGeneration,
  'authorityKeyId': entry.authorityKeyId,
  'authorityKeyFingerprint': entry.authorityKeyFingerprint,
  'authorityKeyGeneration': entry.authorityKeyGeneration,
  'authorityEpoch': entry.authorityEpoch,
});

String connectedTrustedTimeClientHeadDigest({
  required String streamDigest,
  required int authoritySequence,
  required String entryDigest,
  required String ackDigest,
}) => connectedSiteSha256({
  'schema': 'supermega.connected-trusted-time-durable-client-head.v1',
  'streamDigest': streamDigest,
  'authoritySequence': authoritySequence,
  'entryDigest': entryDigest,
  'ackDigest': ackDigest,
});

/// Historical verification of one retained v41 page's time sample. It never
/// creates same-boot live time after reopen or restore. The expected identity,
/// binding, key generations and pins must be independently authenticated.
bool verifyRetainedTrustedTimeSampleV39Sync({
  required String entryJson,
  required String ackJson,
  required String entryDigest,
  required String ackDigest,
  required String headDigest,
  required String workspaceId,
  required String siteId,
  required String coordinatorDeviceId,
  required String deviceId,
  required String clientFingerprint,
  required String clientSigningKeyId,
  required int sessionGeneration,
  required String coordinatorBindingDigest,
  required int coordinatorBindingGeneration,
  required String authorityKeyId,
  required int authorityKeyGeneration,
  required int authorityEpoch,
  required String bootSessionId,
  required int sampleMonotonicMillis,
  required int trustedNowMillis,
  required Map<String, List<int>> pinnedAuthorityKeys,
  required Map<String, List<int>> pinnedClientKeys,
}) {
  try {
    final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
      utf8.encode(entryJson),
    );
    final ack = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
      utf8.encode(ackJson),
    );
    final authorityKey = pinnedAuthorityKeys[authorityKeyId];
    final clientKey = pinnedClientKeys[clientSigningKeyId];
    if (authorityKey == null ||
        clientKey == null ||
        crypto.sha256.convert(authorityKey).toString() !=
            entry.authorityKeyFingerprint ||
        crypto.sha256.convert(clientKey).toString() != clientFingerprint ||
        entry.kind != ConnectedTrustedTimeStreamEntryKind.time ||
        entry.entryDigest != entryDigest ||
        ack.ackDigest != ackDigest ||
        !_ackMatchesEntry(ack, entry) ||
        entry.workspaceId != workspaceId ||
        entry.siteId != siteId ||
        entry.coordinatorDeviceId != coordinatorDeviceId ||
        entry.clientDeviceId != deviceId ||
        entry.clientFingerprint != clientFingerprint ||
        entry.sessionGeneration != sessionGeneration ||
        entry.coordinatorBindingDigest != coordinatorBindingDigest ||
        entry.coordinatorBindingGeneration != coordinatorBindingGeneration ||
        entry.authorityKeyId != authorityKeyId ||
        entry.authorityKeyGeneration != authorityKeyGeneration ||
        entry.authorityEpoch != authorityEpoch ||
        ack.clientSigningKeyId != clientSigningKeyId ||
        ack.bootSessionId != bootSessionId ||
        sampleMonotonicMillis < ack.acknowledgedAtMonotonicMillis ||
        entry.observedAtMillis +
                (sampleMonotonicMillis - ack.acknowledgedAtMonotonicMillis) !=
            trustedNowMillis ||
        trustedNowMillis > entry.validUntilMillis ||
        connectedTrustedTimeClientHeadDigest(
              streamDigest: connectedTrustedTimeClientStreamDigest(entry),
              authoritySequence: entry.authoritySequence,
              entryDigest: entry.entryDigest,
              ackDigest: ack.ackDigest,
            ) !=
            headDigest ||
        !verifyPinnedRetainedEd25519Sync(
          canonicalSigningBytes: entry.canonicalSigningPayload,
          signature: entry.authoritySignature,
          keyId: authorityKeyId,
          pinnedKeys: pinnedAuthorityKeys,
        ) ||
        !verifyPinnedRetainedEd25519Sync(
          canonicalSigningBytes: ack.canonicalSigningPayload,
          signature: ack.clientSignature,
          keyId: clientSigningKeyId,
          pinnedKeys: pinnedClientKeys,
        )) {
      return false;
    }
    return true;
  } on Object {
    return false;
  }
}

bool shopConnectedTrustedTimeClientRowsValidV39({
  required Iterable<Map<String, Object?>> entries,
  required Iterable<Map<String, Object?>> acks,
  required Iterable<Map<String, Object?>> heads,
  required Iterable<Map<String, Object?>> barriers,
  required Iterable<Map<String, Object?>> clearances,
}) {
  try {
    final entryByDigest = <String, ConnectedTrustedTimeStreamEntryV2>{};
    final streamEntries = <String, List<ConnectedTrustedTimeStreamEntryV2>>{};
    for (final row in entries) {
      final json = row['entry_json'];
      if (json is! String ||
          canonicalConnectedSiteJson(jsonDecode(json)) != json) {
        return false;
      }
      final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        utf8.encode(json),
      );
      final streamDigest = connectedTrustedTimeClientStreamDigest(entry);
      if (entry.entryDigest != row['entry_digest'] ||
          streamDigest != row['stream_digest'] ||
          entry.authoritySequence != row['authority_sequence'] ||
          entry.previousEntryDigest != row['previous_entry_digest'] ||
          _bytesDigest(utf8.encode(json)) != row['entry_bytes_digest'] ||
          entryByDigest.putIfAbsent(entry.entryDigest, () => entry) != entry) {
        return false;
      }
      streamEntries.putIfAbsent(streamDigest, () => []).add(entry);
    }
    for (final chain in streamEntries.values) {
      chain.sort((a, b) => a.authoritySequence.compareTo(b.authoritySequence));
      String? previous;
      for (var index = 0; index < chain.length; index += 1) {
        final entry = chain[index];
        if (entry.authoritySequence != index + 1 ||
            entry.previousEntryDigest != previous) {
          return false;
        }
        previous = entry.entryDigest;
      }
    }

    final ackByDigest = <String, ConnectedTrustedTimeStreamAckV1>{};
    for (final row in acks) {
      final json = row['ack_json'];
      if (json is! String ||
          canonicalConnectedSiteJson(jsonDecode(json)) != json) {
        return false;
      }
      final ack = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
        utf8.encode(json),
      );
      final entry = entryByDigest[ack.entryDigest];
      if (entry == null ||
          !_ackMatchesEntry(ack, entry) ||
          ack.ackDigest != row['ack_digest'] ||
          ack.entryDigest != row['entry_digest'] ||
          _bytesDigest(utf8.encode(json)) != row['ack_bytes_digest'] ||
          ackByDigest.putIfAbsent(ack.ackDigest, () => ack) != ack) {
        return false;
      }
    }

    final headByDigest = <String, Map<String, Object?>>{};
    for (final row in heads) {
      final entry = entryByDigest[row['entry_digest']];
      final ack = ackByDigest[row['ack_digest']];
      if (entry == null || ack == null || !_ackMatchesEntry(ack, entry)) {
        return false;
      }
      final streamDigest = connectedTrustedTimeClientStreamDigest(entry);
      final expected = connectedTrustedTimeClientHeadDigest(
        streamDigest: streamDigest,
        authoritySequence: entry.authoritySequence,
        entryDigest: entry.entryDigest,
        ackDigest: ack.ackDigest,
      );
      if (row['stream_digest'] != streamDigest ||
          row['authority_sequence'] != entry.authoritySequence ||
          row['head_digest'] != expected ||
          headByDigest.putIfAbsent(expected, () => row) != row) {
        return false;
      }
    }
    if (headByDigest.length != entries.length ||
        acks.length != entries.length) {
      return false;
    }

    final barrierByDigest = <String, Map<String, Object?>>{};
    final barrierSequences = <String, List<int>>{};
    for (final row in barriers) {
      final json = row['barrier_json'];
      if (json is! String ||
          canonicalConnectedSiteJson(jsonDecode(json)) != json) {
        return false;
      }
      final value = jsonDecode(json);
      if (value is! Map ||
          value.length != 5 ||
          value['schema'] !=
              'supermega.connected-trusted-time-client-restore-barrier.v1' ||
          value['streamDigest'] != row['stream_digest'] ||
          value['restoreSequence'] != row['restore_sequence'] ||
          value['headDigest'] != row['head_digest'] ||
          value['reason'] != 'fresh_target_restore' ||
          headByDigest[row['head_digest']]?['stream_digest'] !=
              row['stream_digest'] ||
          connectedSiteSha256(value) != row['barrier_digest']) {
        return false;
      }
      barrierByDigest[row['barrier_digest']! as String] = row;
      barrierSequences
          .putIfAbsent(row['stream_digest']! as String, () => [])
          .add(row['restore_sequence']! as int);
    }
    for (final values in barrierSequences.values) {
      values.sort();
      for (var index = 0; index < values.length; index += 1) {
        if (values[index] != index + 1) return false;
      }
    }

    final cleared = <String>{};
    for (final row in clearances) {
      final json = row['clearance_json'];
      if (json is! String ||
          canonicalConnectedSiteJson(jsonDecode(json)) != json) {
        return false;
      }
      final value = jsonDecode(json);
      if (value is! Map ||
          value.length != 8 ||
          value['schema'] !=
              'supermega.connected-trusted-time-client-restore-clearance.v1' ||
          value['barrierDigest'] != row['barrier_digest'] ||
          value['bootSessionId'] is! String ||
          !_digest.hasMatch(value['bootSessionId']! as String) ||
          value['monotonicMillis'] is! int ||
          (value['monotonicMillis']! as int) < 0 ||
          value['bindingDigest'] is! String ||
          !_digest.hasMatch(value['bindingDigest']! as String) ||
          value['bindingGeneration'] is! int ||
          (value['bindingGeneration']! as int) < 1 ||
          value['policyApprovalDigest'] is! String ||
          !_digest.hasMatch(value['policyApprovalDigest']! as String) ||
          value['timeGrant'] != false ||
          !barrierByDigest.containsKey(row['barrier_digest']) ||
          connectedSiteSha256(value) != row['clearance_digest'] ||
          !cleared.add(row['barrier_digest']! as String)) {
        return false;
      }
    }
    return true;
  } on Object {
    return false;
  }
}

bool _ackMatchesEntry(
  ConnectedTrustedTimeStreamAckV1 ack,
  ConnectedTrustedTimeStreamEntryV2 entry,
) =>
    ack.workspaceId == entry.workspaceId &&
    ack.siteId == entry.siteId &&
    ack.coordinatorDeviceId == entry.coordinatorDeviceId &&
    ack.clientDeviceId == entry.clientDeviceId &&
    ack.clientFingerprint == entry.clientFingerprint &&
    ack.sessionGeneration == entry.sessionGeneration &&
    ack.coordinatorBindingDigest == entry.coordinatorBindingDigest &&
    ack.coordinatorBindingGeneration == entry.coordinatorBindingGeneration &&
    ack.authorityKeyGeneration == entry.authorityKeyGeneration &&
    ack.authorityEpoch == entry.authorityEpoch &&
    ack.authoritySequence == entry.authoritySequence &&
    ack.entryDigest == entry.entryDigest &&
    ack.resultingHeadDigest == entry.entryDigest;

String _bytesDigest(List<int> bytes) => crypto.sha256.convert(bytes).toString();

String _immutableTrigger({required String table, required String operation}) =>
    '''
  CREATE TRIGGER IF NOT EXISTS ${table}_no_$operation
  BEFORE ${operation.toUpperCase()} ON $table
  BEGIN
    SELECT RAISE(ABORT, 'Connected trusted-time client evidence is immutable');
  END
''';

final _digest = RegExp(r'^[0-9a-f]{64}$');
