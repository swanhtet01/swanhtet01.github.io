import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_trusted_time_composition.dart';
import 'shop_connected_trusted_time_contract.dart';
import 'shop_connected_trusted_time_stream.dart';
import 'shop_connected_trusted_time_stream_acceptance.dart';
import 'shop_database.dart';

abstract interface class ConnectedTrustedTimeStreamDeviceAckVerifier {
  Future<bool> verify(ConnectedTrustedTimeStreamAckV1 acknowledgement);
}

abstract interface class ConnectedTrustedTimeCurrentBindingResolver {
  Future<ConnectedTrustedTimeScope?> resolve({
    required String workspaceId,
    required String siteId,
    required String clientDeviceId,
  });
}

abstract interface class ConnectedTrustedTimeRestorationPolicy {
  /// Returns an independently retained owner approval digest, or null to deny.
  Future<String?> approve({
    required ConnectedTrustedTimeStreamEntryV2 entry,
    required ConnectedTrustedTimeStreamAckV1 acknowledgement,
    required String barrierDigest,
  });
}

final class ConnectedTrustedTimeClientRestorationDependencies {
  const ConnectedTrustedTimeClientRestorationDependencies({
    required this.authorityVerifier,
    required this.deviceAckVerifier,
    required this.bindingResolver,
    required this.clock,
    required this.policy,
  });

  final ConnectedTrustedTimeStreamAuthorityVerifier authorityVerifier;
  final ConnectedTrustedTimeStreamDeviceAckVerifier deviceAckVerifier;
  final ConnectedTrustedTimeCurrentBindingResolver bindingResolver;
  final ConnectedTrustedTimePlatformClock clock;
  final ConnectedTrustedTimeRestorationPolicy policy;
}

final class ConnectedTrustedTimeDurableClientHead {
  const ConnectedTrustedTimeDurableClientHead({
    required this.streamDigest,
    required this.authoritySequence,
    required this.entryDigest,
    required this.ackDigest,
    required this.headDigest,
    required this.usable,
    required this.timeGranted,
  });

  final String streamDigest;
  final int authoritySequence;
  final String entryDigest;
  final String ackDigest;
  final String headDigest;
  final bool usable;

  /// Restore clearance never grants time. A fresh signed time entry is needed.
  final bool timeGranted;
}

/// Default-off persistence seam for already verified client acceptance bytes.
///
/// This store does not own keys, verify issuer sequencing, mount a listener or
/// resume after restore automatically. Restore clearance is audit evidence
/// only and never reactivates the restored entry as live time.
final class ShopConnectedTrustedTimeClientStore {
  const ShopConnectedTrustedTimeClientStore(
    this.database, {
    this.enabled = false,
  });

  final ShopDatabase database;
  final bool enabled;

  Future<ConnectedTrustedTimeDurableClientHead> persist({
    required ConnectedTrustedTimeStreamEntryV2 entry,
    required ConnectedTrustedTimeStreamAckV1 acknowledgement,
  }) async {
    _requireEnabled();
    final retainedEntry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
      entry.canonicalBytes,
    );
    final retainedAck = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
      acknowledgement.canonicalBytes,
    );
    _requireAckClosure(retainedEntry, retainedAck);
    final streamDigest = connectedTrustedTimeClientStreamDigest(retainedEntry);
    final headDigest = connectedTrustedTimeClientHeadDigest(
      streamDigest: streamDigest,
      authoritySequence: retainedEntry.authoritySequence,
      entryDigest: retainedEntry.entryDigest,
      ackDigest: retainedAck.ackDigest,
    );
    return database.transaction(() async {
      final existing = await _readByEntry(retainedEntry.entryDigest);
      if (existing != null) {
        if (existing.entryJson != retainedEntry.canonicalJson ||
            existing.ackJson != retainedAck.canonicalJson ||
            existing.headDigest != headDigest) {
          throw StateError('Trusted-time client replay was substituted.');
        }
        return existing.head;
      }
      if (!await _streamUsable(streamDigest)) {
        throw StateError(
          'Trusted-time client restore requires independent revalidation.',
        );
      }
      final previous = await database
          .customSelect(
            'SELECT authority_sequence, entry_digest FROM '
            'shop_connected_time_client_heads WHERE stream_digest = ? '
            'ORDER BY authority_sequence DESC LIMIT 1',
            variables: [Variable<String>(streamDigest)],
          )
          .getSingleOrNull();
      final previousSequence = previous?.read<int>('authority_sequence') ?? 0;
      final previousDigest = previous?.read<String>('entry_digest');
      if (retainedEntry.authoritySequence != previousSequence + 1 ||
          retainedEntry.previousEntryDigest != previousDigest) {
        throw StateError('Trusted-time client sequence or predecessor gap.');
      }
      await database.customInsert(
        'INSERT INTO shop_connected_time_client_entries '
        '(entry_digest, stream_digest, authority_sequence, '
        'previous_entry_digest, entry_json, entry_bytes_digest) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(retainedEntry.entryDigest),
          Variable<String>(streamDigest),
          Variable<int>(retainedEntry.authoritySequence),
          Variable<String>(retainedEntry.previousEntryDigest),
          Variable<String>(retainedEntry.canonicalJson),
          Variable<String>(_bytesDigest(retainedEntry.canonicalBytes)),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_time_client_acks '
        '(ack_digest, entry_digest, ack_json, ack_bytes_digest) '
        'VALUES (?, ?, ?, ?)',
        variables: [
          Variable<String>(retainedAck.ackDigest),
          Variable<String>(retainedEntry.entryDigest),
          Variable<String>(retainedAck.canonicalJson),
          Variable<String>(_bytesDigest(retainedAck.canonicalBytes)),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_connected_time_client_heads '
        '(head_digest, stream_digest, authority_sequence, entry_digest, ack_digest) '
        'VALUES (?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(headDigest),
          Variable<String>(streamDigest),
          Variable<int>(retainedEntry.authoritySequence),
          Variable<String>(retainedEntry.entryDigest),
          Variable<String>(retainedAck.ackDigest),
        ],
      );
      return ConnectedTrustedTimeDurableClientHead(
        streamDigest: streamDigest,
        authoritySequence: retainedEntry.authoritySequence,
        entryDigest: retainedEntry.entryDigest,
        ackDigest: retainedAck.ackDigest,
        headDigest: headDigest,
        usable: true,
        timeGranted: false,
      );
    });
  }

  Future<ConnectedTrustedTimeDurableClientHead?> latest(
    String streamDigest,
  ) async {
    _requireEnabled();
    final row = await database
        .customSelect(
          'SELECT * FROM shop_connected_time_client_heads '
          'WHERE stream_digest = ? ORDER BY authority_sequence DESC LIMIT 1',
          variables: [Variable<String>(streamDigest)],
        )
        .getSingleOrNull();
    if (row == null) return null;
    return ConnectedTrustedTimeDurableClientHead(
      streamDigest: streamDigest,
      authoritySequence: row.read<int>('authority_sequence'),
      entryDigest: row.read<String>('entry_digest'),
      ackDigest: row.read<String>('ack_digest'),
      headDigest: row.read<String>('head_digest'),
      usable: await _streamUsable(streamDigest),
      timeGranted: false,
    );
  }

  Future<ConnectedTrustedTimeDurableClientHead> revalidateRestored({
    required String streamDigest,
    required ConnectedTrustedTimeClientRestorationDependencies dependencies,
  }) async {
    _requireEnabled();
    return database.transaction(() async {
      final row = await database
          .customSelect(
            'SELECT head.*, entry.entry_json, ack.ack_json, '
            'barrier.barrier_digest, clearance.clearance_digest '
            'FROM shop_connected_time_client_heads head '
            'JOIN shop_connected_time_client_entries entry '
            'ON entry.entry_digest = head.entry_digest '
            'JOIN shop_connected_time_client_acks ack '
            'ON ack.ack_digest = head.ack_digest '
            'JOIN shop_connected_time_client_restore_barriers barrier '
            'ON barrier.stream_digest = head.stream_digest '
            'LEFT JOIN shop_connected_time_client_restore_clearances clearance '
            'ON clearance.barrier_digest = barrier.barrier_digest '
            'WHERE head.stream_digest = ? '
            'ORDER BY head.authority_sequence DESC, barrier.restore_sequence DESC LIMIT 1',
            variables: [Variable<String>(streamDigest)],
          )
          .getSingleOrNull();
      if (row == null || row.readNullable<String>('clearance_digest') != null) {
        throw StateError('Trusted-time client restore barrier is unavailable.');
      }
      final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        utf8.encode(row.read<String>('entry_json')),
      );
      final ack = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
        utf8.encode(row.read<String>('ack_json')),
      );
      _requireAckClosure(entry, ack);
      if (!await dependencies.authorityVerifier.verify(entry) ||
          !await dependencies.deviceAckVerifier.verify(ack)) {
        throw StateError('Trusted-time client restored signature rejected.');
      }
      final binding = await dependencies.bindingResolver.resolve(
        workspaceId: entry.workspaceId,
        siteId: entry.siteId,
        clientDeviceId: entry.clientDeviceId,
      );
      if (binding == null || !_scopeMatches(entry, binding)) {
        throw StateError('Trusted-time client restored binding rejected.');
      }
      final boot = await dependencies.clock.bootSessionId();
      final monotonic = await dependencies.clock.monotonicMillis();
      if (!_digest.hasMatch(boot) ||
          monotonic < 0 ||
          (boot == ack.bootSessionId &&
              monotonic < ack.acknowledgedAtMonotonicMillis)) {
        throw StateError('Trusted-time client restored clock rejected.');
      }
      final barrierDigest = row.read<String>('barrier_digest');
      final approval = await dependencies.policy.approve(
        entry: entry,
        acknowledgement: ack,
        barrierDigest: barrierDigest,
      );
      if (approval == null || !_digest.hasMatch(approval)) {
        throw StateError('Trusted-time client restoration policy rejected.');
      }
      final clearance = <String, Object>{
        'schema':
            'supermega.connected-trusted-time-client-restore-clearance.v1',
        'barrierDigest': barrierDigest,
        'bootSessionId': boot,
        'monotonicMillis': monotonic,
        'bindingDigest': binding.coordinatorBindingDigest,
        'bindingGeneration': binding.coordinatorBindingGeneration,
        'policyApprovalDigest': approval,
        'timeGrant': false,
      };
      final clearanceDigest = connectedSiteSha256(clearance);
      await database.customInsert(
        'INSERT INTO shop_connected_time_client_restore_clearances '
        '(clearance_digest, barrier_digest, clearance_json) VALUES (?, ?, ?)',
        variables: [
          Variable<String>(clearanceDigest),
          Variable<String>(barrierDigest),
          Variable<String>(canonicalConnectedSiteJson(clearance)),
        ],
      );
      return ConnectedTrustedTimeDurableClientHead(
        streamDigest: streamDigest,
        authoritySequence: row.read<int>('authority_sequence'),
        entryDigest: entry.entryDigest,
        ackDigest: ack.ackDigest,
        headDigest: row.read<String>('head_digest'),
        usable: true,
        timeGranted: false,
      );
    });
  }

  Future<bool> _streamUsable(String streamDigest) async {
    final row = await database
        .customSelect(
          'SELECT barrier.barrier_digest, clearance.clearance_digest '
          'FROM shop_connected_time_client_restore_barriers barrier '
          'LEFT JOIN shop_connected_time_client_restore_clearances clearance '
          'ON clearance.barrier_digest = barrier.barrier_digest '
          'WHERE barrier.stream_digest = ? '
          'ORDER BY barrier.restore_sequence DESC LIMIT 1',
          variables: [Variable<String>(streamDigest)],
        )
        .getSingleOrNull();
    return row == null || row.readNullable<String>('clearance_digest') != null;
  }

  Future<_RetainedAcceptance?> _readByEntry(String entryDigest) async {
    final row = await database
        .customSelect(
          'SELECT entry.entry_json, ack.ack_json, head.* '
          'FROM shop_connected_time_client_entries entry '
          'JOIN shop_connected_time_client_acks ack '
          'ON ack.entry_digest = entry.entry_digest '
          'JOIN shop_connected_time_client_heads head '
          'ON head.entry_digest = entry.entry_digest '
          'WHERE entry.entry_digest = ?',
          variables: [Variable<String>(entryDigest)],
        )
        .getSingleOrNull();
    if (row == null) return null;
    return _RetainedAcceptance(
      entryJson: row.read<String>('entry_json'),
      ackJson: row.read<String>('ack_json'),
      headDigest: row.read<String>('head_digest'),
      head: ConnectedTrustedTimeDurableClientHead(
        streamDigest: row.read<String>('stream_digest'),
        authoritySequence: row.read<int>('authority_sequence'),
        entryDigest: row.read<String>('entry_digest'),
        ackDigest: row.read<String>('ack_digest'),
        headDigest: row.read<String>('head_digest'),
        usable: await _streamUsable(row.read<String>('stream_digest')),
        timeGranted: false,
      ),
    );
  }

  void _requireEnabled() {
    if (!enabled) {
      throw StateError('connected_trusted_time_client_store_disabled');
    }
  }
}

void _requireAckClosure(
  ConnectedTrustedTimeStreamEntryV2 entry,
  ConnectedTrustedTimeStreamAckV1 ack,
) {
  if (ack.workspaceId != entry.workspaceId ||
      ack.siteId != entry.siteId ||
      ack.coordinatorDeviceId != entry.coordinatorDeviceId ||
      ack.clientDeviceId != entry.clientDeviceId ||
      ack.clientFingerprint != entry.clientFingerprint ||
      ack.sessionGeneration != entry.sessionGeneration ||
      ack.coordinatorBindingDigest != entry.coordinatorBindingDigest ||
      ack.coordinatorBindingGeneration != entry.coordinatorBindingGeneration ||
      ack.authorityKeyGeneration != entry.authorityKeyGeneration ||
      ack.authorityEpoch != entry.authorityEpoch ||
      ack.authoritySequence != entry.authoritySequence ||
      ack.entryDigest != entry.entryDigest ||
      ack.resultingHeadDigest != entry.entryDigest) {
    throw StateError('Trusted-time client acknowledgement scope mismatch.');
  }
}

bool _scopeMatches(
  ConnectedTrustedTimeStreamEntryV2 entry,
  ConnectedTrustedTimeScope scope,
) =>
    entry.workspaceId == scope.workspaceId &&
    entry.siteId == scope.siteId &&
    entry.coordinatorDeviceId == scope.coordinatorDeviceId &&
    entry.clientDeviceId == scope.clientDeviceId &&
    entry.clientFingerprint == scope.clientFingerprint &&
    entry.sessionGeneration == scope.sessionGeneration &&
    entry.coordinatorBindingDigest == scope.coordinatorBindingDigest &&
    entry.coordinatorBindingGeneration == scope.coordinatorBindingGeneration;

String _bytesDigest(List<int> bytes) => crypto.sha256.convert(bytes).toString();

final class _RetainedAcceptance {
  const _RetainedAcceptance({
    required this.entryJson,
    required this.ackJson,
    required this.headDigest,
    required this.head,
  });
  final String entryJson;
  final String ackJson;
  final String headDigest;
  final ConnectedTrustedTimeDurableClientHead head;
}

final _digest = RegExp(r'^[0-9a-f]{64}$');
