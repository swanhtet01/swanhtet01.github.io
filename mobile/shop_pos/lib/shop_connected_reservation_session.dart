import 'dart:convert';

import 'package:drift/drift.dart';

import 'shop_connected_site_attempt_store.dart';
import 'shop_connected_site_client.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_database_adapter.dart';
import 'shop_connected_stock_reservation.dart';
import 'shop_database.dart';
import 'shop_staff_authorization.dart';

enum ConnectedReservationSessionState {
  unknown,
  held,
  conflict,
  released,
  expired,
  committed,
}

class ConnectedReservationSessionV1 {
  const ConnectedReservationSessionV1({
    required this.reservation,
    required this.reserveCommand,
    required this.state,
    this.reserveAcknowledgement,
    this.releaseCommand,
    this.releaseAcknowledgement,
  });

  final ConnectedStockReservationV1 reservation;
  final SiteCommandV1 reserveCommand;
  final SiteCommandAckV1? reserveAcknowledgement;
  final SiteCommandV1? releaseCommand;
  final SiteCommandAckV1? releaseAcknowledgement;
  final ConnectedReservationSessionState state;
}

abstract interface class ConnectedReservationLeaseGuard {
  Future<void> requireCurrent(OfflineStaffLeaseV1 lease);
}

class ConnectedReservationLeaseGuardUnavailable
    implements ConnectedReservationLeaseGuard {
  const ConnectedReservationLeaseGuardUnavailable();

  @override
  Future<void> requireCurrent(OfflineStaffLeaseV1 lease) =>
      Future.error(StateError('connected_reservation_lease_guard_unavailable'));
}

/// Reconstructs a reservation session from the immutable command-attempt,
/// acknowledgement, and authoritative reservation lifecycle ledgers. No
/// second mutable session record is introduced: the exact signed command is
/// the durable session intent and the terminal ACK is its network outcome.
abstract interface class ConnectedReservationSessionRepository {
  Future<ConnectedReservationSessionV1?> load({
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required ConnectedStockWorkflowType workflowType,
    required String subjectId,
  });
}

class ShopConnectedReservationSessionRepository
    implements ConnectedReservationSessionRepository {
  const ShopConnectedReservationSessionRepository(this.database);

  final ShopDatabase database;

  @override
  Future<ConnectedReservationSessionV1?> load({
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required ConnectedStockWorkflowType workflowType,
    required String subjectId,
  }) async {
    final rows = await database
        .customSelect(
          'SELECT attempt.command_json, attempt.command_digest, '
          'attempt.body_sha256, result.ack_json FROM '
          'shop_site_command_attempts attempt LEFT JOIN '
          'shop_site_command_results result ON result.command_id = '
          'attempt.command_id WHERE attempt.workspace_id = ? AND '
          'attempt.site_id = ? AND attempt.device_id = ? ORDER BY '
          'attempt.prepared_at_millis, attempt.command_id',
          variables: [
            Variable(workspaceId),
            Variable(siteId),
            Variable(deviceId),
          ],
        )
        .get();
    SiteCommandV1? reserve;
    SiteCommandAckV1? reserveAck;
    SiteCommandV1? release;
    SiteCommandAckV1? releaseAck;
    ConnectedStockReservationV1? reservation;
    for (final row in rows) {
      final commandJson = row.read<String>('command_json');
      final decodedCommand = jsonDecode(commandJson);
      final command = SiteCommandV1.fromJson(decodedCommand);
      if (canonicalConnectedSiteJson(command.toJson()) != commandJson ||
          command.commandDigest != row.read<String>('command_digest') ||
          connectedSiteSha256(decodedCommand) !=
              row.read<String>('body_sha256')) {
        throw StateError('connected_reservation_session_corrupt');
      }
      if (command.actorId != actorId ||
          command.aggregateType != workflowType.name ||
          command.aggregateId != subjectId) {
        continue;
      }
      final ackJson = row.readNullable<String>('ack_json');
      final acknowledgement = ackJson == null
          ? null
          : SiteCommandAckV1.fromJson(jsonDecode(ackJson));
      if (acknowledgement != null &&
          (acknowledgement.commandId != command.commandId ||
              acknowledgement.commandDigest != command.commandDigest)) {
        throw StateError('connected_reservation_ack_substituted');
      }
      if (_isReserve(command.commandType, workflowType)) {
        final candidate = ConnectedStockReservationV1.fromJson(
          command.payload['reservation'],
        );
        if (!_reservePayloadMatches(command, candidate) ||
            candidate.actorId != actorId ||
            candidate.deviceId != deviceId) {
          throw StateError('connected_reservation_session_corrupt');
        }
        if (reserve != null &&
            (reserve.commandId != command.commandId ||
                reserve.commandDigest != command.commandDigest)) {
          throw StateError('connected_reservation_session_ambiguous');
        }
        reserve = command;
        reserveAck = acknowledgement;
        reservation = candidate;
      } else if (_isRelease(command.commandType, workflowType)) {
        if (!_releasePayloadShape(command)) {
          throw StateError('connected_reservation_session_corrupt');
        }
        if (release != null &&
            (release.commandId != command.commandId ||
                release.commandDigest != command.commandDigest)) {
          throw StateError('connected_reservation_release_ambiguous');
        }
        release = command;
        releaseAck = acknowledgement;
      }
    }
    if (reserve == null || reservation == null) return null;
    if (release != null &&
        (release.payload['reservationId'] != reservation.reservationId ||
            release.payload['expectedReservationDigest'] !=
                reservation.reservationDigest)) {
      throw StateError('connected_reservation_release_substituted');
    }
    final lifecycle = await database
        .customSelect(
          'SELECT to_state FROM shop_connected_stock_reservation_transitions '
          'WHERE reservation_id = ? ORDER BY occurred_at_millis DESC LIMIT 1',
          variables: [Variable(reservation.reservationId)],
        )
        .getSingleOrNull();
    final state = switch (lifecycle?.readNullable<String>('to_state')) {
      'committed' => ConnectedReservationSessionState.committed,
      'released' => ConnectedReservationSessionState.released,
      'expired' => ConnectedReservationSessionState.expired,
      _ => _networkState(
        reserveAck: reserveAck,
        release: release,
        releaseAck: releaseAck,
      ),
    };
    return ConnectedReservationSessionV1(
      reservation: reservation,
      reserveCommand: reserve,
      reserveAcknowledgement: reserveAck,
      releaseCommand: release,
      releaseAcknowledgement: releaseAck,
      state: state,
    );
  }

  static ConnectedReservationSessionState _networkState({
    required SiteCommandAckV1? reserveAck,
    required SiteCommandV1? release,
    required SiteCommandAckV1? releaseAck,
  }) {
    bool accepted(SiteCommandAckV1? ack) =>
        ack?.state == SiteCommandAckState.accepted ||
        ack?.state == SiteCommandAckState.replayed;
    if (release != null) {
      if (accepted(releaseAck)) {
        return ConnectedReservationSessionState.released;
      }
      if (releaseAck != null) return ConnectedReservationSessionState.conflict;
      return ConnectedReservationSessionState.unknown;
    }
    if (accepted(reserveAck)) return ConnectedReservationSessionState.held;
    if (reserveAck != null) return ConnectedReservationSessionState.conflict;
    return ConnectedReservationSessionState.unknown;
  }
}

/// Default-off application-facing reservation lifecycle. It persists the
/// exact signed command through [attempts.prepare] before network I/O, so a
/// crash before send and an ambiguous reply both resume the same command ID
/// and bytes rather than creating another stock hold.
class ShopConnectedReservationSessionService {
  ShopConnectedReservationSessionService({
    required this.client,
    required this.attempts,
    required this.repository,
    this.leaseGuard = const ConnectedReservationLeaseGuardUnavailable(),
    this.runtimeEnabled = false,
    this.now = DateTime.now,
  });

  final SiteCoordinatorClient client;
  final ConnectedSiteCommandAttemptStore attempts;
  final ConnectedReservationSessionRepository repository;
  final ConnectedReservationLeaseGuard leaseGuard;
  final bool runtimeEnabled;
  final DateTime Function() now;

  Future<ConnectedReservationSessionV1> reserve({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
    required String commandId,
    required int expectedVersion,
  }) async {
    await _authorize(reservation, lease);
    final existing = await _load(reservation);
    if (existing != null) {
      if (existing.reservation.reservationDigest !=
          reservation.reservationDigest) {
        throw StateError('connected_reservation_subject_already_bound');
      }
      return existing.state == ConnectedReservationSessionState.unknown
          ? retry(reservation: reservation, lease: lease)
          : existing;
    }
    final command = await _reserveCommand(
      reservation: reservation,
      lease: lease,
      commandId: commandId,
      expectedVersion: expectedVersion,
    );
    await attempts.prepare(
      command: command,
      bindingDigest: client.bindingDigest,
      clientFingerprint: client.signer.clientFingerprint,
    );
    await client.sendCommand(command);
    return (await _load(reservation))!;
  }

  Future<ConnectedReservationSessionV1> retry({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
  }) async {
    await _authorize(reservation, lease);
    final session = await _load(reservation);
    if (session == null) {
      throw StateError('connected_reservation_session_missing');
    }
    if (session.state != ConnectedReservationSessionState.unknown) {
      return session;
    }
    final command = session.releaseCommand ?? session.reserveCommand;
    await client.retryCommand(command.commandId);
    return (await _load(reservation))!;
  }

  Future<ConnectedReservationSessionV1> release({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
    required String commandId,
    required String reason,
  }) async {
    await _authorize(reservation, lease);
    final session = await _load(reservation);
    if (session?.state == ConnectedReservationSessionState.released) {
      return session!;
    }
    if (session?.state == ConnectedReservationSessionState.unknown &&
        session?.releaseCommand != null) {
      return retry(reservation: reservation, lease: lease);
    }
    if (session == null ||
        session.state != ConnectedReservationSessionState.held ||
        session.reserveAcknowledgement == null ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$').hasMatch(reason)) {
      throw StateError('connected_reservation_release_not_held');
    }
    final command = await _releaseCommand(
      reservation: reservation,
      lease: lease,
      commandId: commandId,
      reason: reason,
      expectedVersion: session.reserveAcknowledgement!.canonicalVersion,
    );
    await attempts.prepare(
      command: command,
      bindingDigest: client.bindingDigest,
      clientFingerprint: client.signer.clientFingerprint,
    );
    await client.sendCommand(command);
    return (await _load(reservation))!;
  }

  Future<ConnectedStockReservationV1> reservationForSale({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
  }) async {
    await _authorize(reservation, lease);
    final session = await _load(reservation);
    if (session == null ||
        session.state != ConnectedReservationSessionState.held ||
        session.reserveAcknowledgement == null ||
        session.reserveAcknowledgement!.commandId !=
            session.reserveCommand.commandId ||
        session.reserveAcknowledgement!.commandDigest !=
            session.reserveCommand.commandDigest) {
      throw StateError('connected_reservation_not_acknowledged');
    }
    return session.reservation;
  }

  Future<ConnectedReservationSessionV1?> _load(
    ConnectedStockReservationV1 reservation,
  ) => repository.load(
    workspaceId: reservation.workspaceId,
    siteId: reservation.siteId,
    actorId: reservation.actorId,
    deviceId: reservation.deviceId,
    workflowType: reservation.workflowType,
    subjectId: reservation.subjectId,
  );

  Future<void> _authorize(
    ConnectedStockReservationV1 reservation,
    OfflineStaffLeaseV1 lease,
  ) async {
    if (!runtimeEnabled) {
      throw StateError('connected_reservation_session_disabled');
    }
    final capability =
        reservation.workflowType == ConnectedStockWorkflowType.retailCart
        ? ShopStaffCapability.counterSale.name
        : ShopStaffCapability.cafeOrderWrite.name;
    if (reservation.workspaceId != lease.workspaceId ||
        reservation.siteId != lease.siteId ||
        reservation.actorId != lease.actorId ||
        reservation.deviceId != lease.deviceId ||
        reservation.deviceId != client.signer.deviceId ||
        !lease.capabilities.contains(capability) ||
        now().toUtc().millisecondsSinceEpoch >= lease.expiresAtMillis ||
        now().toUtc().millisecondsSinceEpoch < lease.issuedAtMillis) {
      throw StateError('connected_reservation_session_unauthorized');
    }
    await leaseGuard.requireCurrent(lease);
  }

  Future<SiteCommandV1> _reserveCommand({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
    required String commandId,
    required int expectedVersion,
  }) {
    final payload = <String, Object?>{
      'contract': 'supermega.shop.connected-stock-reserve.v1',
      'reservation': reservation.toJson(),
    };
    return _signCommand(
      commandId: commandId,
      reservation: reservation,
      expectedVersion: expectedVersion,
      commandType:
          reservation.workflowType == ConnectedStockWorkflowType.retailCart
          ? shopRetailStockReserveCommandType
          : shopCafeStockReserveCommandType,
      payload: payload,
      lease: lease,
    );
  }

  Future<SiteCommandV1> _releaseCommand({
    required ConnectedStockReservationV1 reservation,
    required OfflineStaffLeaseV1 lease,
    required String commandId,
    required String reason,
    required int expectedVersion,
  }) {
    final payload = <String, Object?>{
      'contract': 'supermega.shop.connected-stock-release.v1',
      'reservationId': reservation.reservationId,
      'expectedReservationDigest': reservation.reservationDigest,
      'targetState': 'released',
      'reason': reason,
    };
    return _signCommand(
      commandId: commandId,
      reservation: reservation,
      expectedVersion: expectedVersion,
      commandType:
          reservation.workflowType == ConnectedStockWorkflowType.retailCart
          ? shopRetailStockReleaseCommandType
          : shopCafeStockReleaseCommandType,
      payload: payload,
      lease: lease,
    );
  }

  Future<SiteCommandV1> _signCommand({
    required String commandId,
    required ConnectedStockReservationV1 reservation,
    required int expectedVersion,
    required String commandType,
    required Map<String, Object?> payload,
    required OfflineStaffLeaseV1 lease,
  }) async {
    final unsigned = SiteCommandV1(
      commandId: commandId,
      workspaceId: reservation.workspaceId,
      siteId: reservation.siteId,
      actorId: reservation.actorId,
      deviceId: reservation.deviceId,
      aggregateType: reservation.workflowType.name,
      aggregateId: reservation.subjectId,
      expectedVersion: expectedVersion,
      commandType: commandType,
      payload: payload,
      payloadDigest: connectedSiteSha256(payload),
      leaseDigest: lease.payloadDigest,
      issuedAt: now().toUtc().toIso8601String(),
      signingKeyId: client.signer.signingKeyId,
      signatureAlgorithm: 'ed25519',
      signature: 'A' * 86,
    );
    final signature = await client.signer.sign(
      utf8.encode(canonicalConnectedSiteJson(unsigned.signingPayload)),
    );
    return SiteCommandV1(
      commandId: unsigned.commandId,
      workspaceId: unsigned.workspaceId,
      siteId: unsigned.siteId,
      actorId: unsigned.actorId,
      deviceId: unsigned.deviceId,
      aggregateType: unsigned.aggregateType,
      aggregateId: unsigned.aggregateId,
      expectedVersion: unsigned.expectedVersion,
      commandType: unsigned.commandType,
      payload: unsigned.payload,
      payloadDigest: unsigned.payloadDigest,
      leaseDigest: unsigned.leaseDigest,
      issuedAt: unsigned.issuedAt,
      signingKeyId: unsigned.signingKeyId,
      signatureAlgorithm: unsigned.signatureAlgorithm,
      signature: signature,
    );
  }
}

bool _isReserve(String commandType, ConnectedStockWorkflowType workflow) =>
    commandType ==
    (workflow == ConnectedStockWorkflowType.retailCart
        ? shopRetailStockReserveCommandType
        : shopCafeStockReserveCommandType);

bool _isRelease(String commandType, ConnectedStockWorkflowType workflow) =>
    commandType ==
    (workflow == ConnectedStockWorkflowType.retailCart
        ? shopRetailStockReleaseCommandType
        : shopCafeStockReleaseCommandType);

bool _reservePayloadMatches(
  SiteCommandV1 command,
  ConnectedStockReservationV1 reservation,
) =>
    command.payload.length == 2 &&
    command.payload['contract'] ==
        'supermega.shop.connected-stock-reserve.v1' &&
    reservation.workspaceId == command.workspaceId &&
    reservation.siteId == command.siteId &&
    reservation.actorId == command.actorId &&
    reservation.deviceId == command.deviceId &&
    reservation.workflowType.name == command.aggregateType &&
    reservation.subjectId == command.aggregateId;

bool _releasePayloadShape(SiteCommandV1 command) =>
    command.payload.length == 5 &&
    command.payload['contract'] ==
        'supermega.shop.connected-stock-release.v1' &&
    command.payload['reservationId'] is String &&
    command.payload['expectedReservationDigest'] is String &&
    command.payload['targetState'] == 'released' &&
    command.payload['reason'] is String;
