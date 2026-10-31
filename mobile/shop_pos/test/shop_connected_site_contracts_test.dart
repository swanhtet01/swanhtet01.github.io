import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

const _digest =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const _signature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

Map<String, Object> _leaseJson() {
  final unsigned = <String, Object>{
    'protocolVersion': 1,
    'leaseId': 'lease-1',
    'workspaceId': 'workspace-1',
    'siteId': 'site-1',
    'actorId': 'actor-1',
    'role': 'cashier',
    'capabilities': ['sale.cash', 'sale.read'],
    'deviceId': 'device-1',
    'sessionGeneration': 2,
    'revocationGeneration': 3,
    'issuedAt': '2026-10-31T00:00:00.000Z',
    'expiresAt': '2026-11-07T00:00:00.000Z',
    'issuerKeyId': 'issuer-1',
  };
  return {
    ...unsigned,
    'payloadDigest': connectedSiteSha256(unsigned),
    'signature': _signature,
  };
}

Map<String, Object?> _commandJson() {
  final payload = <String, Object?>{
    'lines': [
      {'productId': 'p-1', 'quantity': 1},
    ],
  };
  return {
    'protocolVersion': 1,
    'commandId': 'command-1',
    'workspaceId': 'workspace-1',
    'siteId': 'site-1',
    'actorId': 'actor-1',
    'deviceId': 'device-1',
    'aggregateType': 'sale',
    'aggregateId': 'sale-1',
    'expectedVersion': 0,
    'commandType': 'sale.create',
    'payload': payload,
    'payloadDigest': connectedSiteSha256(payload),
    'leaseDigest': _digest,
    'issuedAt': '2026-10-31T00:00:01.000Z',
    'signingKeyId': 'device-key-1',
    'signatureAlgorithm': 'ed25519',
    'signature': _signature,
  };
}

void main() {
  test('canonical JSON sorts keys recursively and rejects floating point', () {
    expect(
      canonicalConnectedSiteJson({
        'z': 1,
        'a': {
          'd': true,
          'b': [2, 1],
        },
      }),
      '{"a":{"b":[2,1],"d":true},"z":1}',
    );
    expect(
      () => canonicalConnectedSiteJson({'amount': 1.5}),
      throwsFormatException,
    );
  });

  test('pairing is strict, short lived input and endpoint safe', () {
    final pairing = CoordinatorPairingV1(
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      coordinatorDeviceId: 'device-1',
      certificateSha256: _digest,
      address: '192.168.8.10',
      port: 8443,
      nonce: 'ABCDEFGHIJKLMNOPQRSTUV',
      issuedAt: '2026-10-31T00:00:00.000Z',
      expiresAt: '2026-10-31T00:05:00.000Z',
    );
    pairing.requireValidAt(DateTime.utc(2026, 10, 31, 0, 4, 59));
    expect(
      CoordinatorPairingV1.fromJson(jsonDecode(jsonEncode(pairing.toJson())))
          .toJson(),
      pairing.toJson(),
    );
    expect(
      () => CoordinatorPairingV1.fromJson({...pairing.toJson(), 'extra': 1}),
      throwsFormatException,
    );
    expect(
      () => CoordinatorPairingV1.fromJson({
        ...pairing.toJson(),
        'protocolVersion': 2,
      }),
      throwsFormatException,
    );
    expect(
      () => CoordinatorPairingV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'device-1',
        certificateSha256: _digest,
        address: '0.0.0.0',
        port: 8443,
        nonce: 'ABCDEFGHIJKLMNOPQRSTUV',
        issuedAt: '2026-10-31T00:00:00.000Z',
        expiresAt: '2026-10-31T00:05:00.000Z',
      ),
      throwsFormatException,
    );
    expect(
      CoordinatorPairingV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'device-1',
        certificateSha256: _digest,
        address: 'fd12:3456::1',
        port: 8443,
        nonce: 'ABCDEFGHIJKLMNOPQRSTUV',
        issuedAt: '2026-10-31T00:00:00.000Z',
        expiresAt: '2026-10-31T00:01:00.000Z',
      ).address,
      'fd12:3456::1',
    );
    expect(
      () => CoordinatorPairingV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'device-1',
        certificateSha256: _digest,
        address: '8.8.8.8',
        port: 8443,
        nonce: 'ABCDEFGHIJKLMNOPQRSTUV',
        issuedAt: '2026-10-31T00:00:00.000Z',
        expiresAt: '2026-10-31T00:05:00.000Z',
      ),
      throwsFormatException,
    );
    expect(
      () => CoordinatorPairingV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        coordinatorDeviceId: 'device-1',
        certificateSha256: _digest,
        address: 'fd00::1',
        port: 8443,
        nonce: 'ABCDEFGHIJKLMNOPQRSTUV',
        issuedAt: '2026-10-31T00:00:00.000Z',
        expiresAt: '2026-10-31T00:05:00.001Z',
      ),
      throwsFormatException,
    );
    expect(
      () => pairing.requireValidAt(DateTime.utc(2026, 10, 31, 0, 5)),
      throwsFormatException,
    );
  });

  test('lease binds sorted capabilities, seven-day window and digest', () {
    final lease = OfflineStaffLeaseV1.fromJson(_leaseJson());
    expect(lease.tenantId, 'workspace-1');
    expect(lease.leaseId, 'lease-1');
    expect(lease.keyId, 'issuer-1');
    expect(
      lease.expiresAtMillis - lease.issuedAtMillis,
      const Duration(days: 7).inMilliseconds,
    );
    expect(
      OfflineStaffLeaseV1.fromJson(jsonDecode(jsonEncode(lease.toJson())))
          .toJson(),
      lease.toJson(),
    );
    final tampered = _leaseJson()..['actorId'] = 'actor-2';
    expect(() => OfflineStaffLeaseV1.fromJson(tampered), throwsFormatException);
    final tooLong = _leaseJson()..['expiresAt'] = '2026-11-07T00:00:00.001Z';
    final unsigned = Map<String, Object>.from(tooLong)
      ..remove('payloadDigest')
      ..remove('signature');
    tooLong['payloadDigest'] = connectedSiteSha256(unsigned);
    expect(() => OfflineStaffLeaseV1.fromJson(tooLong), throwsFormatException);
    final unordered = _leaseJson()
      ..['capabilities'] = ['sale.read', 'sale.cash'];
    expect(
      () => OfflineStaffLeaseV1.fromJson(unordered),
      throwsFormatException,
    );
  });

  test(
    'command payload and command digest are deterministic and immutable',
    () {
      final command = SiteCommandV1.fromJson(_commandJson());
      final equivalent = _commandJson();
      equivalent['payload'] = {
        'lines': [
          {'quantity': 1, 'productId': 'p-1'},
        ],
      };
      expect(
        SiteCommandV1.fromJson(equivalent).commandDigest,
        command.commandDigest,
      );
      expect(() => command.payload['changed'] = true, throwsUnsupportedError);
      expect(
        () => ((command.payload['lines'] as List).first as Map)['quantity'] = 2,
        throwsUnsupportedError,
      );
      final tampered = _commandJson()..['payload'] = {'unexpected': true};
      expect(() => SiteCommandV1.fromJson(tampered), throwsFormatException);
      final extra = _commandJson()..['extra'] = true;
      expect(() => SiteCommandV1.fromJson(extra), throwsFormatException);
      final wrongAlgorithm = _commandJson()..['signatureAlgorithm'] = 'rsa-pss';
      expect(
        () => SiteCommandV1.fromJson(wrongAlgorithm),
        throwsFormatException,
      );
    },
  );

  test('ack requires evidence for success and reason for rejection', () {
    final accepted = SiteCommandAckV1(
      commandId: 'command-1',
      commandDigest: _digest,
      state: SiteCommandAckState.accepted,
      canonicalVersion: 1,
      eventDigest: _digest,
    );
    expect(
      SiteCommandAckV1.fromJson(accepted.toJson()).state,
      SiteCommandAckState.accepted,
    );
    expect(
      () => SiteCommandAckV1(
        commandId: 'command-1',
        commandDigest: _digest,
        state: SiteCommandAckState.denied,
        canonicalVersion: 0,
      ),
      throwsFormatException,
    );
  });

  test('delta enforces gap-free cursors and event digests', () {
    Map<String, Object?> entry(int cursor, String type) {
      final event = <String, Object?>{
        'eventId': 'event-$cursor',
        'workspaceId': 'workspace-1',
        'siteId': 'site-1',
        'aggregateType': 'sale',
        'aggregateId': 'sale-1',
        'aggregateVersion': cursor - 4,
        'eventType': type,
        'occurredAt': '2026-10-31T00:00:0${cursor - 4}.000Z',
        'payload': {'cursor': cursor},
      };
      return {
        'cursor': cursor,
        'event': event,
        'eventDigest': connectedSiteSha256(event),
      };
    }

    final delta = SiteDeltaV1(
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      afterCursor: 4,
      nextCursor: 6,
      events: [entry(5, 'sale.created'), entry(6, 'stock.committed')],
    );
    expect(SiteDeltaV1.fromJson(delta.toJson()).nextCursor, 6);
    expect(
      () => SiteDeltaV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        afterCursor: 4,
        nextCursor: 6,
        events: [entry(6, 'stock.committed'), entry(5, 'sale.created')],
      ),
      throwsFormatException,
    );
    final tampered = entry(5, 'sale.created');
    (tampered['event']! as Map<String, Object?>)['eventType'] = 'sale.changed';
    expect(
      () => SiteDeltaV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        afterCursor: 4,
        nextCursor: 5,
        events: [tampered],
      ),
      throwsFormatException,
    );
    final wrongSite = entry(5, 'sale.created');
    (wrongSite['event']! as Map<String, Object?>)['siteId'] = 'site-2';
    wrongSite['eventDigest'] = connectedSiteSha256(wrongSite['event']);
    expect(
      () => SiteDeltaV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        afterCursor: 4,
        nextCursor: 5,
        events: [wrongSite],
      ),
      throwsFormatException,
    );
    final extraEnvelopeField = entry(5, 'sale.created');
    (extraEnvelopeField['event']! as Map<String, Object?>)['unexpected'] = true;
    extraEnvelopeField['eventDigest'] = connectedSiteSha256(
      extraEnvelopeField['event'],
    );
    expect(
      () => SiteDeltaV1(
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        afterCursor: 4,
        nextCursor: 5,
        events: [extraEnvelopeField],
      ),
      throwsFormatException,
    );
  });

  test('snapshot detects projection tampering', () {
    final unsigned = <String, Object>{
      'protocolVersion': 1,
      'workspaceId': 'workspace-1',
      'siteId': 'site-1',
      'version': 3,
      'continuationCursor': 7,
      'projections': {
        'stock': {'p-1': 2},
      },
    };
    final snapshot = SiteSnapshotV1.fromJson({
      ...unsigned,
      'checkpointDigest': connectedSiteSha256(unsigned),
    });
    expect(snapshot.version, 3);
    final tampered = snapshot.toJson();
    tampered['projections'] = {
      'stock': {'p-1': 1},
    };
    expect(() => SiteSnapshotV1.fromJson(tampered), throwsFormatException);
  });

  test('conflict and recovery records round trip strictly', () {
    final conflict = SiteConflictV1(
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      conflictId: 'conflict-1',
      commandId: 'command-1',
      commandDigest: _digest,
      aggregateType: 'stock',
      aggregateId: 'p-1',
      expectedVersion: 2,
      actualVersion: 3,
      reason: 'version_mismatch',
      createdAt: '2026-10-31T01:00:00.000Z',
      state: SiteConflictState.pending,
    );
    expect(
      SiteConflictV1.fromJson(conflict.toJson()).state,
      SiteConflictState.pending,
    );
    final recovery = CoordinatorRecoveryV1(
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      coordinatorDeviceId: 'device-1',
      checkpointDigest: _digest,
      lastEventCursor: 9,
      lastCloudCursor: 7,
      pendingCommandCount: 2,
      capturedAt: '2026-10-31T01:02:00.000Z',
    );
    expect(
      CoordinatorRecoveryV1.fromJson(recovery.toJson()).toJson(),
      recovery.toJson(),
    );
  });

  test('malformed timestamps and shapes fail closed', () {
    final lease = _leaseJson()..['issuedAt'] = '2026-10-31 00:00:00';
    expect(() => OfflineStaffLeaseV1.fromJson(lease), throwsFormatException);
    expect(() => SiteCommandV1.fromJson([]), throwsFormatException);
    expect(
      () => SiteCommandAckV1.fromJson({
        'protocolVersion': 1,
        'commandId': 'command-1',
        'commandDigest': _digest,
        'state': 'invented',
        'canonicalVersion': 0,
      }),
      throwsFormatException,
    );
  });
}
