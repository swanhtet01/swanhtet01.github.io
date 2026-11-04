import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_reservation_session.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_client.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

const _workspace = 'workspace-1';
const _site = 'site-1';
const _now = '2026-11-01T08:00:00.000Z';
const _binding =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

void main() {
  test('service is default-off and requires current authority', () async {
    final fixture = _Fixture();
    await expectLater(
      fixture
          .service(enabled: false)
          .reserve(
            reservation: fixture.reservation(),
            lease: fixture.lease(),
            commandId: 'reserve-1',
            expectedVersion: 0,
          ),
      throwsStateError,
    );
    fixture.guard.allowed = false;
    await expectLater(
      fixture.service().reserve(
        reservation: fixture.reservation(),
        lease: fixture.lease(),
        commandId: 'reserve-1',
        expectedVersion: 0,
      ),
      throwsStateError,
    );
    expect(fixture.attempts.commands, isEmpty);
  });

  test(
    'crash before send and lost reply recover the exact retained command',
    () async {
      final fixture = _Fixture();
      final reservation = fixture.reservation();
      final prepared = await fixture.service().prepareReserve(
        reservation: reservation,
        lease: fixture.lease(),
        commandId: 'reserve-restart',
        expectedVersion: 0,
      );
      expect(prepared.state, ConnectedReservationSessionState.unknown);
      final command = prepared.reserveCommand;
      expect(fixture.attempts.commands, contains(command.commandId));
      expect(fixture.transport.requests, isEmpty);

      fixture.transport.loseNextReply = true;
      final afterRestart = fixture.service();
      expect(
        (await afterRestart.retry(
          reservation: reservation,
          lease: fixture.lease(),
        )).state,
        ConnectedReservationSessionState.unknown,
      );
      final firstBytes = fixture.transport.requests.single;
      final held = await fixture.service().retry(
        reservation: reservation,
        lease: fixture.lease(),
      );
      expect(held.state, ConnectedReservationSessionState.held);
      expect(fixture.transport.requests.last, firstBytes);
      expect(fixture.attempts.commands.single, command.commandId);

      await expectLater(
        fixture.service().reserve(
          reservation: fixture.reservation(quantity: 2),
          lease: fixture.lease(),
          commandId: 'reserve-altered',
          expectedVersion: 0,
        ),
        throwsStateError,
      );
      expect(fixture.attempts.commands, hasLength(1));
    },
  );

  test(
    'retail and cafe reserve, sale handoff and release remain exact',
    () async {
      for (final cafe in [false, true]) {
        final fixture = _Fixture(
          device: cafe ? 'cafe-device' : 'retail-device',
        );
        final reservation = fixture.reservation(cafe: cafe);
        final lease = fixture.lease(cafe: cafe);
        final held = await fixture.service().reserve(
          reservation: reservation,
          lease: lease,
          commandId: cafe ? 'reserve-cafe' : 'reserve-retail',
          expectedVersion: 0,
        );
        expect(held.state, ConnectedReservationSessionState.held);
        expect(
          (await fixture.service().reservationForSale(
            reservation: reservation,
            lease: lease,
          )).reservationDigest,
          reservation.reservationDigest,
        );
        final substituted = fixture.reservation(cafe: cafe, quantity: 2);
        await expectLater(
          fixture.service().reservationForSale(
            reservation: substituted,
            lease: lease,
          ),
          throwsStateError,
        );
        await expectLater(
          fixture.service().release(
            reservation: substituted,
            lease: lease,
            commandId: 'release-substituted',
            reason: 'operator_cancelled',
          ),
          throwsStateError,
        );
        final released = await fixture.service().release(
          reservation: reservation,
          lease: lease,
          commandId: cafe ? 'release-cafe' : 'release-retail',
          reason: 'operator_cancelled',
        );
        expect(released.state, ConnectedReservationSessionState.released);
        await expectLater(
          fixture.service().reservationForSale(
            reservation: reservation,
            lease: lease,
          ),
          throwsStateError,
        );
        final repeated = await fixture.service().release(
          reservation: reservation,
          lease: lease,
          commandId: cafe ? 'release-cafe' : 'release-retail',
          reason: 'operator_cancelled',
        );
        expect(repeated.state, ConnectedReservationSessionState.released);
        expect(fixture.attempts.commands, hasLength(2));
      }
    },
  );

  test('two devices competing for final unit yield one hold', () async {
    final coordinator = _OneUnitCoordinator();
    final first = _Fixture(device: 'device-a', coordinator: coordinator);
    final second = _Fixture(device: 'device-b', coordinator: coordinator);
    final firstResult = await first.service().reserve(
      reservation: first.reservation(subject: 'cart-a'),
      lease: first.lease(),
      commandId: 'reserve-a',
      expectedVersion: 0,
    );
    final secondResult = await second.service().reserve(
      reservation: second.reservation(subject: 'cart-b'),
      lease: second.lease(),
      commandId: 'reserve-b',
      expectedVersion: 0,
    );
    expect(firstResult.state, ConnectedReservationSessionState.held);
    expect(secondResult.state, ConnectedReservationSessionState.conflict);
    expect(coordinator.accepted, 1);
  });

  test('expired lease blocks retry before another transmission', () async {
    final fixture = _Fixture();
    final reservation = fixture.reservation();
    fixture.transport.loseNextReply = true;
    expect(
      (await fixture.service().reserve(
        reservation: reservation,
        lease: fixture.lease(),
        commandId: 'reserve-expiring',
        expectedVersion: 0,
      )).state,
      ConnectedReservationSessionState.unknown,
    );
    final sent = fixture.transport.requests.length;
    await expectLater(
      fixture
          .service(now: DateTime.utc(2026, 11, 9))
          .retry(reservation: reservation, lease: fixture.lease()),
      throwsStateError,
    );
    expect(fixture.transport.requests, hasLength(sent));
  });

  test(
    'replacement lease cannot authorize retry of retained old command',
    () async {
      final fixture = _Fixture();
      final reservation = fixture.reservation();
      fixture.transport.loseNextReply = true;
      expect(
        (await fixture.service().reserve(
          reservation: reservation,
          lease: fixture.lease(),
          commandId: 'reserve-old-lease',
          expectedVersion: 0,
        )).state,
        ConnectedReservationSessionState.unknown,
      );
      final sent = fixture.transport.requests.length;
      await expectLater(
        fixture.service().retry(
          reservation: reservation,
          lease: fixture.lease(sessionGeneration: 2),
        ),
        throwsStateError,
      );
      expect(fixture.transport.requests, hasLength(sent));
    },
  );

  test(
    'real SQLite repository reconstructs exact durable attempt and ACK',
    () async {
      final fixture = _Fixture();
      final reservation = fixture.reservation(subject: 'durable-cart');
      final prepared = await fixture.service().prepareReserve(
        reservation: reservation,
        lease: fixture.lease(),
        commandId: 'reserve-durable',
        expectedVersion: 0,
      );
      final command = prepared.reserveCommand;
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      await database.customSelect('SELECT 1').getSingle();
      await database.customStatement(
        'INSERT INTO shop_site_coordinator_bindings ('
        'binding_digest, action, workspace_id, site_id, coordinator_device_id, '
        'pairing_digest, enrollment_evidence_digest, client_device_id, '
        'client_fingerprint, client_signing_key_id, address, port, '
        'certificate_sha256, protocol_version, approval_generation, '
        'issued_at_millis, expires_at_millis, authority_key_id, evidence_json, '
        'evidence_digest, authority_signature, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          _binding,
          'approve',
          _workspace,
          _site,
          'coordinator-1',
          'p' * 64,
          'e' * 64,
          fixture.device,
          fixture.signer.clientFingerprint,
          fixture.signer.signingKeyId,
          '192.168.10.2',
          9443,
          'c' * 64,
          1,
          1,
          DateTime.parse(_now).millisecondsSinceEpoch,
          DateTime.parse(_now)
              .add(const Duration(days: 1))
              .millisecondsSinceEpoch,
          'issuer-1',
          '{}',
          'd' * 64,
          'S' * 86,
          DateTime.parse(_now).millisecondsSinceEpoch,
        ],
      );
      final commandJson = canonicalConnectedSiteJson(command.toJson());
      await database.customStatement(
        'INSERT INTO shop_site_command_attempts (command_id, binding_digest, '
        'workspace_id, site_id, device_id, signing_key_id, command_digest, '
        'command_json, body_sha256, prepared_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          command.commandId,
          _binding,
          _workspace,
          _site,
          fixture.device,
          fixture.signer.signingKeyId,
          command.commandDigest,
          commandJson,
          connectedSiteSha256(jsonDecode(commandJson)),
          DateTime.parse(_now).millisecondsSinceEpoch,
        ],
      );
      final repository = ShopConnectedReservationSessionRepository(database);
      final unknown = await repository.load(
        workspaceId: _workspace,
        siteId: _site,
        actorId: 'actor-1',
        deviceId: fixture.device,
        workflowType: ConnectedStockWorkflowType.retailCart,
        subjectId: reservation.subjectId,
      );
      expect(unknown?.state, ConnectedReservationSessionState.unknown);

      const requestNonce = 'request_nonce_durable_abcdefghijkl';
      final proofJson = canonicalConnectedSiteJson({'nonce': requestNonce});
      await database.customStatement(
        'INSERT INTO shop_site_command_transmissions (command_id, '
        'transmission_sequence, request_nonce, issued_at_millis, method, '
        'canonical_target, proof_json, proof_digest, request_signature, '
        'body_sha256, started_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          command.commandId,
          1,
          requestNonce,
          DateTime.parse(_now).millisecondsSinceEpoch,
          'POST',
          '/v1/commands',
          proofJson,
          connectedSiteSha256(jsonDecode(proofJson)),
          'R' * 86,
          connectedSiteSha256(jsonDecode(commandJson)),
          DateTime.parse(_now).millisecondsSinceEpoch,
        ],
      );
      final ack = SiteCommandAckV1(
        commandId: command.commandId,
        commandDigest: command.commandDigest,
        state: SiteCommandAckState.accepted,
        canonicalVersion: 1,
        eventDigest: 'a' * 64,
      );
      final ackJson = canonicalConnectedSiteJson(ack.toJson());
      await database.customStatement(
        'INSERT INTO shop_site_command_results (command_id, '
        'transmission_sequence, result_kind, ack_state, ack_json, ack_digest, '
        'completed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          command.commandId,
          1,
          'acknowledged',
          'accepted',
          ackJson,
          connectedSiteSha256(jsonDecode(ackJson)),
          DateTime.parse(_now).millisecondsSinceEpoch,
        ],
      );
      final held = await repository.load(
        workspaceId: _workspace,
        siteId: _site,
        actorId: 'actor-1',
        deviceId: fixture.device,
        workflowType: ConnectedStockWorkflowType.retailCart,
        subjectId: reservation.subjectId,
      );
      expect(held?.state, ConnectedReservationSessionState.held);
      expect(
        held?.reservation.reservationDigest,
        reservation.reservationDigest,
      );
    },
  );
}

class _Fixture {
  _Fixture({this.device = 'device-1', _OneUnitCoordinator? coordinator})
    : attempts = _Attempts(),
      transport = _Transport(
        coordinator ?? _OneUnitCoordinator(unlimited: true),
      ),
      signer = _Signer(device);

  final String device;
  final _Attempts attempts;
  final _Transport transport;
  final _Signer signer;
  final _LeaseGuard guard = _LeaseGuard();

  ShopConnectedReservationSessionService service({
    bool enabled = true,
    DateTime? now,
  }) {
    final client = SiteCoordinatorClient(
      pairing: CoordinatorPairingV1(
        workspaceId: _workspace,
        siteId: _site,
        coordinatorDeviceId: 'coordinator-1',
        certificateSha256: 'c' * 64,
        address: '192.168.10.2',
        port: 9443,
        nonce: 'pairing_nonce_abcdefghijklmnop',
        issuedAt: _now,
        expiresAt: '2026-11-01T08:05:00.000Z',
      ),
      bindingDigest: _binding,
      signer: signer,
      attempts: attempts,
      transport: transport,
      runtimeEnabled: enabled,
      now: () => now ?? DateTime.parse(_now),
      nonce: attempts.nextNonce,
    );
    return ShopConnectedReservationSessionService(
      client: client,
      attempts: attempts,
      repository: _Repository(attempts),
      leaseGuard: guard,
      runtimeEnabled: enabled,
      now: () => now ?? DateTime.parse(_now),
    );
  }

  ConnectedStockReservationV1 reservation({
    bool cafe = false,
    int quantity = 1,
    String subject = 'subject-1',
  }) => ConnectedStockReservationV1.held(
    reservationId: 'reservation-$device-$subject',
    workspaceId: _workspace,
    siteId: _site,
    actorId: 'actor-1',
    deviceId: device,
    workflowType: cafe
        ? ConnectedStockWorkflowType.cafeOrder
        : ConnectedStockWorkflowType.retailCart,
    subjectId: subject,
    capability: cafe
        ? ShopStaffCapability.cafeOrderWrite
        : ShopStaffCapability.counterSale,
    lines: [
      ConnectedStockReservationLineV1(
        productId: 'product-1',
        quantity: quantity,
      ),
    ],
    issuedAt: _now,
    expiresAt: '2026-11-01T08:30:00.000Z',
  );

  OfflineStaffLeaseV1 lease({bool cafe = false, int sessionGeneration = 1}) {
    final capabilities = [
      cafe
          ? ShopStaffCapability.cafeOrderWrite.name
          : ShopStaffCapability.counterSale.name,
    ];
    final unsigned = <String, Object>{
      'protocolVersion': connectedSiteProtocolVersion,
      'leaseId': 'lease-$device-${cafe ? 'cafe' : 'retail'}',
      'workspaceId': _workspace,
      'siteId': _site,
      'actorId': 'actor-1',
      'role': cafe
          ? ShopStaffRole.cafeWaiter.name
          : ShopStaffRole.cashierCounter.name,
      'capabilities': capabilities,
      'deviceId': device,
      'sessionGeneration': sessionGeneration,
      'revocationGeneration': 1,
      'issuedAt': '2026-10-31T08:00:00.000Z',
      'expiresAt': '2026-11-07T08:00:00.000Z',
      'issuerKeyId': 'issuer-1',
    };
    return OfflineStaffLeaseV1(
      leaseId: unsigned['leaseId']! as String,
      workspaceId: _workspace,
      siteId: _site,
      actorId: 'actor-1',
      role: unsigned['role']! as String,
      capabilities: capabilities,
      deviceId: device,
      sessionGeneration: sessionGeneration,
      revocationGeneration: 1,
      issuedAt: unsigned['issuedAt']! as String,
      expiresAt: unsigned['expiresAt']! as String,
      issuerKeyId: 'issuer-1',
      payloadDigest: connectedSiteSha256(unsigned),
      signature: 'L' * 86,
    );
  }
}

class _LeaseGuard implements ConnectedReservationLeaseGuard {
  bool allowed = true;
  @override
  Future<void> requireCurrent(OfflineStaffLeaseV1 lease) async {
    if (!allowed) throw StateError('revoked');
  }
}

class _Signer implements ConnectedSiteDeviceSigner {
  _Signer(this.deviceId);
  static final _publicKey = Uint8List.fromList(
    List<int>.generate(32, (i) => i),
  );
  @override
  final String deviceId;
  @override
  String get signingKeyId => clientFingerprint;
  @override
  String get clientFingerprint => crypto.sha256.convert(_publicKey).toString();
  @override
  String get publicKeyBase64Url =>
      base64Url.encode(_publicKey).replaceAll('=', '');
  @override
  Future<String> sign(List<int> message) async => 'S' * 86;
}

class _Attempts implements ConnectedSiteCommandAttemptStore {
  final Map<String, SiteCommandV1> commandById = {};
  final Map<String, SiteCommandAckV1> ackById = {};
  int nonce = 0;
  int sequence = 0;
  Iterable<String> get commands => commandById.keys;
  String nextNonce() => 'request_nonce_${++nonce}_abcdefghijklmnop';

  @override
  Future<PreparedConnectedCommandV28> prepare({
    required SiteCommandV1 command,
    required String bindingDigest,
    required String clientFingerprint,
  }) async {
    final existing = commandById[command.commandId];
    if (existing != null &&
        canonicalConnectedSiteJson(existing.toJson()) !=
            canonicalConnectedSiteJson(command.toJson())) {
      throw StateError('substituted');
    }
    commandById[command.commandId] = command;
    return _prepared(command);
  }

  PreparedConnectedCommandV28 _prepared(SiteCommandV1 command) {
    final json = canonicalConnectedSiteJson(command.toJson());
    return PreparedConnectedCommandV28(
      commandId: command.commandId,
      commandJson: json,
      bodySha256: connectedSiteSha256(jsonDecode(json)),
      terminalAcknowledgement: ackById[command.commandId],
    );
  }

  @override
  Future<List<PreparedConnectedCommandV28>> recoverUnresolved({
    required String bindingDigest,
  }) async => commandById.values
      .where((command) => !ackById.containsKey(command.commandId))
      .map(_prepared)
      .toList();

  @override
  Future<PreparedConnectedTransmissionV29> beginTransmission({
    required String commandId,
    required CoordinatorRequestProof proof,
    required String requestSignature,
  }) async {
    final command = commandById[commandId]!;
    return PreparedConnectedTransmissionV29(
      commandId: commandId,
      transmissionSequence: ++sequence,
      uri: Uri.parse('https://192.168.10.2:9443/v1/commands'),
      headers: const {'content-type': 'application/json'},
      body: Uint8List.fromList(
        utf8.encode(canonicalConnectedSiteJson(command.toJson())),
      ),
      certificateSha256: 'c' * 64,
    );
  }

  @override
  Future<SiteCommandAckV1> recordTerminal({
    required String commandId,
    required int transmissionSequence,
    required SiteCommandAckV1 acknowledgement,
  }) async {
    ackById[commandId] = acknowledgement;
    return acknowledgement;
  }

  @override
  Future<ConnectedSiteApprovedBinding> resolveActiveBinding({
    required String bindingDigest,
    required String workspaceId,
    required String siteId,
    required String clientDeviceId,
    required String clientFingerprint,
    required String clientSigningKeyId,
  }) async => ConnectedSiteApprovedBinding(
    bindingDigest: bindingDigest,
    workspaceId: workspaceId,
    siteId: siteId,
    coordinatorDeviceId: 'coordinator-1',
    clientDeviceId: clientDeviceId,
    clientFingerprint: clientFingerprint,
    clientSigningKeyId: clientSigningKeyId,
    approvalGeneration: 1,
    sessionGeneration: 1,
    address: '192.168.10.2',
    port: 9443,
    certificateSha256: 'c' * 64,
  );
}

class _Repository implements ConnectedReservationSessionRepository {
  _Repository(this.attempts);
  final _Attempts attempts;

  @override
  Future<ConnectedReservationSessionV1?> load({
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required ConnectedStockWorkflowType workflowType,
    required String subjectId,
  }) async {
    SiteCommandV1? reserve;
    SiteCommandV1? release;
    for (final command in attempts.commandById.values) {
      if (command.workspaceId != workspaceId ||
          command.siteId != siteId ||
          command.actorId != actorId ||
          command.deviceId != deviceId ||
          command.aggregateType != workflowType.name ||
          command.aggregateId != subjectId) {
        continue;
      }
      if (command.commandType.contains('reserve')) {
        reserve = command;
      } else if (command.commandType.contains('release')) {
        release = command;
      }
    }
    if (reserve == null) return null;
    final reservation = ConnectedStockReservationV1.fromJson(
      reserve.payload['reservation'],
    );
    final reserveAck = attempts.ackById[reserve.commandId];
    final releaseAck = release == null
        ? null
        : attempts.ackById[release.commandId];
    bool accepted(SiteCommandAckV1? ack) =>
        ack?.state == SiteCommandAckState.accepted ||
        ack?.state == SiteCommandAckState.replayed;
    final state = release != null
        ? (accepted(releaseAck)
              ? ConnectedReservationSessionState.released
              : releaseAck == null
              ? ConnectedReservationSessionState.unknown
              : ConnectedReservationSessionState.conflict)
        : accepted(reserveAck)
        ? ConnectedReservationSessionState.held
        : reserveAck == null
        ? ConnectedReservationSessionState.unknown
        : ConnectedReservationSessionState.conflict;
    return ConnectedReservationSessionV1(
      reservation: reservation,
      reserveCommand: reserve,
      reserveAcknowledgement: reserveAck,
      releaseCommand: release,
      releaseAcknowledgement: releaseAck,
      state: state,
    );
  }
}

class _OneUnitCoordinator {
  _OneUnitCoordinator({this.unlimited = false});
  final bool unlimited;
  int accepted = 0;
  SiteCommandAckV1 respond(SiteCommandV1 command) {
    final reserve = command.commandType.contains('reserve');
    final canAccept = !reserve || unlimited || accepted == 0;
    if (reserve && canAccept) accepted += 1;
    return SiteCommandAckV1(
      commandId: command.commandId,
      commandDigest: command.commandDigest,
      state: canAccept
          ? SiteCommandAckState.accepted
          : SiteCommandAckState.conflict,
      canonicalVersion: canAccept
          ? command.expectedVersion + 1
          : command.expectedVersion,
      eventDigest: canAccept
          ? connectedSiteSha256({'id': command.commandId})
          : null,
      reason: canAccept ? null : 'insufficient_stock',
    );
  }
}

class _Transport implements ConnectedSiteHttpTransport {
  _Transport(this.coordinator);
  final _OneUnitCoordinator coordinator;
  final List<Uint8List> requests = [];
  bool loseNextReply = false;
  @override
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  }) async {
    requests.add(Uint8List.fromList(body));
    if (loseNextReply) {
      loseNextReply = false;
      throw const ConnectedSiteTransportException('lost', ambiguous: true);
    }
    final command = SiteCommandV1.fromJson(jsonDecode(utf8.decode(body)));
    return ConnectedSiteHttpResponse(
      statusCode: 200,
      contentType: 'application/json',
      body: Uint8List.fromList(
        utf8.encode(
          canonicalConnectedSiteJson(coordinator.respond(command).toJson()),
        ),
      ),
    );
  }
}
