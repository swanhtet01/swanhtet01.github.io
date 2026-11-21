import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_stream.dart';
import 'shop_database.dart';

/// Persistence-only seam for an already reviewed trusted-time issuer.
///
/// This class owns no clock, key, signer, endpoint, or authority. Product code
/// must keep [enabled] false until those separate boundaries are approved.
final class ShopConnectedTrustedTimeIssuerStore {
  const ShopConnectedTrustedTimeIssuerStore(
    this.database, {
    this.enabled = false,
  });

  final ShopDatabase database;
  final bool enabled;

  Future<ConnectedTrustedTimeIssuerAllocation> reserve(
    List<int> canonicalUnsignedEntryBytes,
  ) async {
    _requireEnabled();
    final unsigned = _UnsignedEntry.parse(canonicalUnsignedEntryBytes);
    return database.transaction(() async {
      await _requireIssuanceActive();
      await database.customInsert(
        'INSERT OR IGNORE INTO shop_connected_time_issuer_streams '
        '(stream_digest, stream_json) VALUES (?, ?)',
        variables: [
          Variable<String>(unsigned.streamDigest),
          Variable<String>(unsigned.streamJson),
        ],
      );
      final stream = await database
          .customSelect(
            'SELECT * FROM shop_connected_time_issuer_streams WHERE stream_digest = ?',
            variables: [Variable<String>(unsigned.streamDigest)],
          )
          .getSingle();
      if (stream.read<String>('stream_json') != unsigned.streamJson) {
        throw StateError('Trusted-time issuer stream substitution.');
      }
      final pending = stream.readNullable<String>('pending_entry_digest');
      if (pending != null) {
        final allocation = await _readAllocation(pending);
        if (allocation.entryDigest != unsigned.entryDigest ||
            allocation.unsignedEntryJson != unsigned.canonicalJson) {
          throw StateError('Trusted-time issuer already has a pending entry.');
        }
        return allocation;
      }
      final acknowledgedSequence = stream.read<int>('acknowledged_sequence');
      final acknowledgedDigest = stream.readNullable<String>(
        'acknowledged_entry_digest',
      );
      if (unsigned.sequence != acknowledgedSequence + 1 ||
          unsigned.previousEntryDigest != acknowledgedDigest) {
        throw StateError('Trusted-time issuer sequence or predecessor gap.');
      }
      await database.customInsert(
        'INSERT INTO shop_connected_time_issuer_allocations '
        '(entry_digest, stream_digest, authority_sequence, '
        'previous_entry_digest, unsigned_entry_json) VALUES (?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(unsigned.entryDigest),
          Variable<String>(unsigned.streamDigest),
          Variable<int>(unsigned.sequence),
          Variable<String>(unsigned.previousEntryDigest),
          Variable<String>(unsigned.canonicalJson),
        ],
      );
      final changed = await database.customUpdate(
        'UPDATE shop_connected_time_issuer_streams '
        'SET pending_entry_digest = ? '
        'WHERE stream_digest = ? AND pending_entry_digest IS NULL '
        'AND acknowledged_sequence = ?',
        variables: [
          Variable<String>(unsigned.entryDigest),
          Variable<String>(unsigned.streamDigest),
          Variable<int>(acknowledgedSequence),
        ],
      );
      if (changed != 1) {
        throw StateError('Concurrent trusted-time issuer allocation.');
      }
      return ConnectedTrustedTimeIssuerAllocation(
        streamDigest: unsigned.streamDigest,
        entryDigest: unsigned.entryDigest,
        sequence: unsigned.sequence,
        previousEntryDigest: unsigned.previousEntryDigest,
        unsignedEntryJson: unsigned.canonicalJson,
      );
    });
  }

  Future<ConnectedTrustedTimeStreamEntryV2> attachSignature(
    List<int> canonicalSignedEntryBytes,
  ) async {
    _requireEnabled();
    final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
      canonicalSignedEntryBytes,
    );
    final unsigned = _UnsignedEntry.fromSigned(entry);
    return database.transaction(() async {
      await _requireIssuanceActive();
      final allocation = await _readAllocation(entry.entryDigest);
      if (allocation.streamDigest != unsigned.streamDigest ||
          allocation.unsignedEntryJson != unsigned.canonicalJson) {
        throw StateError('Trusted-time issuer signed entry substitution.');
      }
      final existing = await database
          .customSelect(
            'SELECT signed_entry_json FROM shop_connected_time_issuer_signed_entries '
            'WHERE entry_digest = ?',
            variables: [Variable<String>(entry.entryDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('signed_entry_json') != entry.canonicalJson) {
          throw StateError('Trusted-time issuer altered signature replay.');
        }
        return entry;
      }
      await database.customInsert(
        'INSERT INTO shop_connected_time_issuer_signed_entries '
        '(entry_digest, signed_entry_json, signed_entry_digest) VALUES (?, ?, ?)',
        variables: [
          Variable<String>(entry.entryDigest),
          Variable<String>(entry.canonicalJson),
          Variable<String>(_bytesDigest(canonicalSignedEntryBytes)),
        ],
      );
      return entry;
    });
  }

  Future<ConnectedTrustedTimeStreamEntryV2?> replayPending(
    String streamDigest,
  ) async {
    _requireEnabled();
    await _requireIssuanceActive();
    final row = await database
        .customSelect(
          'SELECT signed.signed_entry_json FROM shop_connected_time_issuer_streams stream '
          'LEFT JOIN shop_connected_time_issuer_signed_entries signed '
          'ON signed.entry_digest = stream.pending_entry_digest '
          'WHERE stream.stream_digest = ?',
          variables: [Variable<String>(streamDigest)],
        )
        .getSingleOrNull();
    final json = row?.readNullable<String>('signed_entry_json');
    return json == null
        ? null
        : ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
            utf8.encode(json),
          );
  }

  Future<void> acknowledge(List<int> canonicalAckBytes) async {
    _requireEnabled();
    final ack = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
      canonicalAckBytes,
    );
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT ack_json FROM shop_connected_time_issuer_acks WHERE entry_digest = ?',
            variables: [Variable<String>(ack.entryDigest)],
          )
          .getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('ack_json') != ack.canonicalJson) {
          throw StateError(
            'Trusted-time issuer altered acknowledgement replay.',
          );
        }
        return;
      }
      final allocation = await _readAllocation(ack.entryDigest);
      final signedRow = await database
          .customSelect(
            'SELECT signed_entry_json FROM shop_connected_time_issuer_signed_entries '
            'WHERE entry_digest = ?',
            variables: [Variable<String>(ack.entryDigest)],
          )
          .getSingleOrNull();
      if (signedRow == null) {
        throw StateError(
          'Trusted-time issuer acknowledgement precedes signature.',
        );
      }
      final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        utf8.encode(signedRow.read<String>('signed_entry_json')),
      );
      if (ack.workspaceId != entry.workspaceId ||
          ack.siteId != entry.siteId ||
          ack.coordinatorDeviceId != entry.coordinatorDeviceId ||
          ack.clientDeviceId != entry.clientDeviceId ||
          ack.clientFingerprint != entry.clientFingerprint ||
          ack.sessionGeneration != entry.sessionGeneration ||
          ack.coordinatorBindingDigest != entry.coordinatorBindingDigest ||
          ack.coordinatorBindingGeneration !=
              entry.coordinatorBindingGeneration ||
          ack.authorityKeyGeneration != entry.authorityKeyGeneration ||
          ack.authorityEpoch != entry.authorityEpoch) {
        throw StateError('Trusted-time issuer acknowledgement scope mismatch.');
      }
      final stream = await database
          .customSelect(
            'SELECT * FROM shop_connected_time_issuer_streams WHERE stream_digest = ?',
            variables: [Variable<String>(allocation.streamDigest)],
          )
          .getSingleOrNull();
      await _requireIssuanceActive();
      if (stream == null ||
          stream.readNullable<String>('pending_entry_digest') !=
              ack.entryDigest) {
        throw StateError(
          'Trusted-time issuer acknowledgement stream mismatch.',
        );
      }
      if (ack.authoritySequence != allocation.sequence ||
          ack.authoritySequence !=
              stream.read<int>('acknowledged_sequence') + 1) {
        throw StateError('Trusted-time issuer acknowledgement sequence gap.');
      }
      await database.customInsert(
        'INSERT INTO shop_connected_time_issuer_acks '
        '(ack_digest, entry_digest, ack_json, ack_bytes_digest) VALUES (?, ?, ?, ?)',
        variables: [
          Variable<String>(ack.ackDigest),
          Variable<String>(ack.entryDigest),
          Variable<String>(ack.canonicalJson),
          Variable<String>(_bytesDigest(canonicalAckBytes)),
        ],
      );
      final changed = await database.customUpdate(
        'UPDATE shop_connected_time_issuer_streams SET '
        'acknowledged_sequence = ?, acknowledged_entry_digest = ?, '
        'pending_entry_digest = NULL WHERE stream_digest = ? '
        'AND pending_entry_digest = ?',
        variables: [
          Variable<int>(ack.authoritySequence),
          Variable<String>(ack.entryDigest),
          Variable<String>(allocation.streamDigest),
          Variable<String>(ack.entryDigest),
        ],
      );
      if (changed != 1) {
        throw StateError('Concurrent trusted-time issuer acknowledgement.');
      }
    });
  }

  Future<ConnectedTrustedTimeIssuerAllocation> _readAllocation(
    String entryDigest,
  ) async {
    final row = await database
        .customSelect(
          'SELECT * FROM shop_connected_time_issuer_allocations WHERE entry_digest = ?',
          variables: [Variable<String>(entryDigest)],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('Trusted-time issuer allocation missing.');
    }
    return ConnectedTrustedTimeIssuerAllocation(
      streamDigest: row.read<String>('stream_digest'),
      entryDigest: row.read<String>('entry_digest'),
      sequence: row.read<int>('authority_sequence'),
      previousEntryDigest: row.readNullable<String>('previous_entry_digest'),
      unsignedEntryJson: row.read<String>('unsigned_entry_json'),
    );
  }

  void _requireEnabled() {
    if (!enabled) throw StateError('Trusted-time issuer store is disabled.');
  }

  Future<void> _requireIssuanceActive() async {
    final state = await database
        .customSelect(
          'SELECT issuance_suspended FROM shop_connected_time_issuer_state '
          'WHERE singleton_id = 1',
        )
        .getSingleOrNull();
    if (state == null || state.read<int>('issuance_suspended') != 0) {
      throw StateError('Trusted-time issuer is suspended after restore.');
    }
  }
}

final class ConnectedTrustedTimeIssuerAllocation {
  const ConnectedTrustedTimeIssuerAllocation({
    required this.streamDigest,
    required this.entryDigest,
    required this.sequence,
    required this.previousEntryDigest,
    required this.unsignedEntryJson,
  });
  final String streamDigest;
  final String entryDigest;
  final int sequence;
  final String? previousEntryDigest;
  final String unsignedEntryJson;
}

final class _UnsignedEntry {
  const _UnsignedEntry({
    required this.canonicalJson,
    required this.entryDigest,
    required this.streamJson,
    required this.streamDigest,
    required this.sequence,
    required this.previousEntryDigest,
  });
  final String canonicalJson;
  final String entryDigest;
  final String streamJson;
  final String streamDigest;
  final int sequence;
  final String? previousEntryDigest;

  factory _UnsignedEntry.parse(List<int> bytes) {
    return _UnsignedEntry.fromSigned(
      parseConnectedTrustedTimeUnsignedEntryV2(bytes),
    );
  }

  factory _UnsignedEntry.fromSigned(ConnectedTrustedTimeStreamEntryV2 entry) {
    final stream = <String, Object>{
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
    };
    final streamJson = canonicalConnectedSiteJson(stream);
    return _UnsignedEntry(
      canonicalJson: entry.canonicalSigningPayload,
      entryDigest: entry.entryDigest,
      streamJson: streamJson,
      streamDigest: connectedSiteSha256(stream),
      sequence: entry.authoritySequence,
      previousEntryDigest: entry.previousEntryDigest,
    );
  }
}

String _bytesDigest(List<int> bytes) => crypto.sha256.convert(bytes).toString();
