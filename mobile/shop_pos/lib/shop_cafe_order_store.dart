import 'dart:convert';

import 'package:drift/drift.dart';

import 'shop_cafe_order_contract.dart';
import 'shop_cafe_kitchen_entitlement.dart';
import 'shop_database.dart';
import 'shop_staff_authorization.dart';

class StoredCafeOrder {
  const StoredCafeOrder({
    required this.ticket,
    required this.state,
    required this.stateRevision,
    required this.totalMmk,
    required this.completedSaleId,
    required this.createdAtMillis,
    required this.updatedAtMillis,
    required this.kitchenDispatchLines,
    required this.kitchenStatusByLine,
  });

  final CafeOrderTicket ticket;
  final String state;
  final int stateRevision;
  final int totalMmk;
  final String? completedSaleId;
  final int createdAtMillis;
  final int updatedAtMillis;
  final List<CafeKitchenDispatchLine> kitchenDispatchLines;
  final Map<String, String> kitchenStatusByLine;
}

class CafeOrderSplitReversalCandidate {
  const CafeOrderSplitReversalCandidate({
    required this.splitEvent,
    required this.source,
    required this.destination,
  });

  final CafeOrderSplitEvent splitEvent;
  final StoredCafeOrder source;
  final StoredCafeOrder destination;
}

/// A cashier-recoverable stock conflict found while completing a cafe order.
///
/// The order remains open and the surrounding transaction records no sale,
/// stock movement, payment, or outbox effect.
class ShopCafeInsufficientStockException implements Exception {
  const ShopCafeInsufficientStockException({
    required this.productName,
    required this.available,
    required this.requiredQuantity,
  });

  final String productName;
  final int available;
  final int requiredQuantity;
}

/// A routed kitchen/bar line cannot change after preparation has started.
///
/// Cancelling the unpaid order remains available and preserves its dispatch
/// history, but the started line itself must stay immutable so its preparation
/// status cannot be mistaken for a changed quantity or recipe.
class ShopCafeStartedKitchenLineException implements Exception {
  const ShopCafeStartedKitchenLineException();
}

/// Device-local café persistence and cash completion.
///
/// This is not a reservation, split-tender, printer, or cross-device contract.
/// Basic local orders and table labels remain available without kitchen
/// routing. Routed kitchen/bar snapshots require the injected entitlement at
/// the transactional store boundary. Whole unrouted line instances can be
/// separated into two local bills that are completed as distinct sales.
class ShopCafeOrderStore {
  ShopCafeOrderStore(
    this.database, {
    DateTime Function()? clock,
    this.kitchenEntitlement = const ShopCafeKitchenEntitlementUnavailable(),
    this.staffAuthorizer = const ShopStaffCommandAuthorizationUnavailable(),
    this.staffActorId,
  }) : _clock = clock ?? DateTime.now;

  final ShopDatabase database;
  final DateTime Function() _clock;
  final ShopCafeKitchenEntitlement kitchenEntitlement;
  final ShopStaffCommandAuthorizer staffAuthorizer;
  final String? staffActorId;

  Future<StoredCafeOrder?> read(String orderId) async {
    final clean = _operationId(orderId, 'order');
    final row = await database
        .customSelect(
          'SELECT * FROM shop_cafe_orders WHERE id = ?',
          variables: [Variable<String>(clean)],
        )
        .getSingleOrNull();
    if (row == null) return null;
    final order = await _projectCancellation(_fromRow(row));
    return _attachKitchenDispatch(order);
  }

  Future<List<StoredCafeOrder>> readActive() async {
    final rows = await database
        .customSelect(
          "SELECT * FROM shop_cafe_orders WHERE state IN ('open', 'held') "
          'AND NOT EXISTS (SELECT 1 FROM shop_cafe_order_cancellations '
          'WHERE order_id = shop_cafe_orders.id) '
          'ORDER BY updated_at_millis DESC, id',
        )
        .get();
    final statusEvents = await _readKitchenStatusEvents();
    final statusEventsByOrder = <String, List<CafeKitchenStatusEvent>>{};
    for (final event in statusEvents) {
      statusEventsByOrder.putIfAbsent(event.orderId, () => []).add(event);
    }
    final orders = [for (final row in rows) _fromRow(row)];
    return Future.wait([
      for (final order in orders)
        _attachKitchenDispatch(
          order,
          statusEvents: statusEventsByOrder[order.ticket.id] ?? const [],
        ),
    ]);
  }

  Future<StoredCafeOrder> applyCommand(
    CafeOrderCommand command,
    Map<String, CafeModifierSnapshot> modifierCatalog,
  ) => database.transaction(() async {
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeOrderWrite,
      commandId: command.id,
      expectedVersion: command.expectedVersion,
      claimedActorId: staffActorId,
    );
    if (command.lines.any((line) => line.hasPreparationRoute)) {
      kitchenEntitlement.requireKitchenDispatch(
        orderId: command.ticketId,
        commandId: command.id,
      );
    }
    final priorRow = await database
        .customSelect(
          'SELECT * FROM shop_cafe_orders WHERE id = ?',
          variables: [Variable<String>(command.ticketId)],
        )
        .getSingleOrNull();
    final prior = priorRow == null ? null : _fromRow(priorRow);
    if (prior != null) {
      final cancellation = await database
          .customSelect(
            'SELECT 1 FROM shop_cafe_order_cancellations WHERE order_id = ?',
            variables: [Variable<String>(prior.ticket.id)],
          )
          .getSingleOrNull();
      if (cancellation != null) {
        throw StateError('A cancelled café order is immutable.');
      }
      if (prior.state == 'completed') {
        throw StateError('A completed café order is immutable.');
      }
    }
    final ticket = applyCafeOrderCommand(
      prior?.ticket,
      command,
      modifierCatalog,
    );
    if (identical(ticket, prior?.ticket)) return _attachKitchenDispatch(prior!);
    if (prior != null) {
      await _requireStartedKitchenLinesUnchanged(prior, ticket);
    }
    await _requireCurrentProducts(ticket);
    final now = _now();
    final json = jsonEncode(ticket.toJson());
    final total = _ticketTotal(ticket);
    if (prior != null) {
      await _ensureLegacyDispatchBoundary(prior.ticket, now);
    }
    final dispatch = await _nextKitchenDispatchLines(ticket);
    if (prior == null) {
      await database.customInsert(
        'INSERT INTO shop_cafe_orders '
        '(id, state, state_revision, ticket_version, ticket_json, total_mmk, '
        'last_command_id, last_command_fingerprint, created_at_millis, '
        'updated_at_millis) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(ticket.id),
          const Variable<String>('open'),
          Variable<int>(ticket.version),
          Variable<String>(json),
          Variable<int>(total),
          Variable<String>(ticket.lastCommandId),
          Variable<String>(ticket.lastCommandFingerprint),
          Variable<int>(now),
          Variable<int>(now),
        ],
      );
    } else {
      await database.customUpdate(
        'UPDATE shop_cafe_orders SET ticket_version = ?, ticket_json = ?, '
        'total_mmk = ?, last_command_id = ?, last_command_fingerprint = ?, '
        'updated_at_millis = ? WHERE id = ?',
        variables: [
          Variable<int>(ticket.version),
          Variable<String>(json),
          Variable<int>(total),
          Variable<String>(ticket.lastCommandId),
          Variable<String>(ticket.lastCommandFingerprint),
          Variable<int>(now),
          Variable<String>(ticket.id),
        ],
      );
    }
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      "VALUES (?, 'shop.cafe_kitchen_dispatch.recorded.v1', ?, 'pending', ?)",
      variables: [
        Variable<String>(cafeKitchenDispatchOperationId(ticket)),
        Variable<String>(
          jsonEncode(
            cafeKitchenDispatchPayload(
              ticket,
              dispatch.lines,
              dispatch.historyStartVersion,
            ),
          ),
        ),
        Variable<int>(now),
      ],
    );
    return (await read(ticket.id))!;
  });

  Future<StoredCafeOrder> hold({
    required String orderId,
    required String operationId,
    required int expectedStateRevision,
  }) => _transition(
    orderId: orderId,
    operationId: operationId,
    expectedStateRevision: expectedStateRevision,
    fromState: 'open',
    toState: 'held',
  );

  Future<StoredCafeOrder> resume({
    required String orderId,
    required String operationId,
    required int expectedStateRevision,
  }) => _transition(
    orderId: orderId,
    operationId: operationId,
    expectedStateRevision: expectedStateRevision,
    fromState: 'held',
    toState: 'open',
  );

  Future<StoredCafeOrder> _transition({
    required String orderId,
    required String operationId,
    required int expectedStateRevision,
    required String fromState,
    required String toState,
  }) => database.transaction(() async {
    final cleanOrderId = _operationId(orderId, 'order');
    final cleanOperationId = _operationId(operationId, 'operation');
    if (expectedStateRevision < 0) {
      throw ArgumentError('Café order revision is invalid.');
    }
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeOrderWrite,
      commandId: cleanOperationId,
      expectedVersion: expectedStateRevision,
      claimedActorId: staffActorId,
    );
    final fingerprint = cafeOrderStateFingerprint(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      expectedStateRevision: expectedStateRevision,
      fromState: fromState,
      toState: toState,
    );
    final replay = await database
        .customSelect(
          'SELECT request_fingerprint FROM shop_cafe_order_state_events '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replay != null) {
      if (replay.read<String>('request_fingerprint') != fingerprint) {
        throw StateError('A café operation ID was reused differently.');
      }
      return (await read(cleanOrderId))!;
    }
    final order = await read(cleanOrderId);
    if (order == null ||
        order.state != fromState ||
        order.stateRevision != expectedStateRevision) {
      throw StateError('The café order changed. Refresh and try again.');
    }
    final now = _now();
    await _ensureLegacyDispatchBoundary(
      order.ticket,
      now,
      allowUntrackedLegacyCompletion: true,
    );
    await _insertStateEvent(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      fingerprint: fingerprint,
      fromState: fromState,
      toState: toState,
      expectedRevision: expectedStateRevision,
      saleId: null,
      now: now,
    );
    await database.customUpdate(
      'UPDATE shop_cafe_orders SET state = ?, state_revision = ?, '
      'last_state_operation_id = ?, last_state_fingerprint = ?, '
      'updated_at_millis = ? WHERE id = ?',
      variables: [
        Variable<String>(toState),
        Variable<int>(expectedStateRevision + 1),
        Variable<String>(cleanOperationId),
        Variable<String>(fingerprint),
        Variable<int>(now),
        Variable<String>(cleanOrderId),
      ],
    );
    return (await read(cleanOrderId))!;
  });

  /// Cancels an unpaid device-local order while preserving its ticket and
  /// kitchen dispatch history as immutable audit evidence.
  ///
  /// This does not claim that a separate kitchen device or printer stopped.
  Future<StoredCafeOrder> cancel({
    required String orderId,
    required String operationId,
    required int expectedStateRevision,
  }) => database.transaction(() async {
    final cleanOrderId = _operationId(orderId, 'order');
    final cleanOperationId = _operationId(operationId, 'operation');
    if (expectedStateRevision < 0) {
      throw ArgumentError('Café order revision is invalid.');
    }
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeOrderWrite,
      commandId: cleanOperationId,
      expectedVersion: expectedStateRevision,
      claimedActorId: staffActorId,
    );
    final orderRow = await database
        .customSelect(
          'SELECT * FROM shop_cafe_orders WHERE id = ?',
          variables: [Variable<String>(cleanOrderId)],
        )
        .getSingleOrNull();
    if (orderRow == null) {
      throw StateError('The café order changed. Refresh and try again.');
    }
    final order = _fromRow(orderRow);
    final fingerprint = cafeOrderCancellationFingerprint(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      ticketVersion: order.ticket.version,
      ticketFingerprint: order.ticket.lastCommandFingerprint,
      stateRevision: expectedStateRevision,
      fromState: order.state,
    );
    final replay = await database
        .customSelect(
          'SELECT order_id, request_fingerprint '
          'FROM shop_cafe_order_cancellations WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replay != null) {
      if (replay.read<String>('order_id') != cleanOrderId ||
          replay.read<String>('request_fingerprint') != fingerprint) {
        throw StateError('A café cancellation ID was reused differently.');
      }
      return (await read(cleanOrderId))!;
    }
    final priorCancellation = await database
        .customSelect(
          'SELECT operation_id FROM shop_cafe_order_cancellations '
          'WHERE order_id = ?',
          variables: [Variable<String>(cleanOrderId)],
        )
        .getSingleOrNull();
    if (priorCancellation != null) {
      throw StateError('This café order was already cancelled.');
    }
    if ((order.state != 'open' && order.state != 'held') ||
        order.stateRevision != expectedStateRevision) {
      throw StateError('The café order changed. Refresh and try again.');
    }
    final now = _now();
    await _ensureLegacyDispatchBoundary(
      order.ticket,
      now,
      allowUntrackedLegacyCompletion: true,
    );
    await database.customInsert(
      'INSERT INTO shop_cafe_order_cancellations '
      '(operation_id, order_id, request_fingerprint, from_state, '
      'expected_state_revision, ticket_version, ticket_fingerprint, '
      'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(cleanOrderId),
        Variable<String>(fingerprint),
        Variable<String>(order.state),
        Variable<int>(expectedStateRevision),
        Variable<int>(order.ticket.version),
        Variable<String>(order.ticket.lastCommandFingerprint),
        Variable<int>(now),
      ],
    );
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      "VALUES (?, 'shop.cafe_order.cancelled.v1', ?, 'pending', ?)",
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(
          jsonEncode(
            cafeOrderCancellationPayload(
              operationId: cleanOperationId,
              ticket: order.ticket,
              fromState: order.state,
              stateRevision: expectedStateRevision,
              createdAtMillis: now,
            ),
          ),
        ),
        Variable<int>(now),
      ],
    );
    return (await read(cleanOrderId))!;
  });

  /// Advances one device-local kitchen/bar ticket through its preparation
  /// states. The append-only outbox record is audit/sync intent only; it does
  /// not claim that another device, kitchen display, or printer received it.
  Future<StoredCafeOrder> advanceKitchenStatus({
    required String orderId,
    required String lineId,
    required String operationId,
    required int expectedTicketVersion,
    required String expectedStatus,
  }) => database.transaction(() async {
    final cleanOrderId = _operationId(orderId, 'order');
    final cleanLineId = _operationId(lineId, 'line');
    final cleanOperationId = _operationId(operationId, 'operation');
    final targetStatus = cafeKitchenNextState(expectedStatus);
    if (targetStatus == null) {
      throw StateError('This kitchen ticket is already served.');
    }
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeKitchenStatus,
      commandId: cleanOperationId,
      expectedVersion: expectedTicketVersion,
      claimedActorId: staffActorId,
    );
    final replayRow = await database
        .customSelect(
          'SELECT event_type, payload_json FROM shop_sync_outbox '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replayRow != null) {
      if (replayRow.read<String>('event_type') != cafeKitchenStatusEventType) {
        throw StateError('This kitchen status ID is already in use.');
      }
      final replay = CafeKitchenStatusEvent.fromJson(
        jsonDecode(replayRow.read<String>('payload_json')),
      );
      if (replay.orderId != cleanOrderId ||
          replay.lineId != cleanLineId ||
          replay.ticketVersion != expectedTicketVersion ||
          replay.fromState != expectedStatus ||
          replay.toState != targetStatus) {
        throw StateError('A kitchen status ID was reused differently.');
      }
      return (await read(cleanOrderId))!;
    }
    final order = await read(cleanOrderId);
    if (order == null ||
        (order.state != 'open' && order.state != 'held') ||
        order.ticket.version != expectedTicketVersion) {
      throw StateError('The café order changed. Refresh and try again.');
    }
    final line = order.ticket.lines
        .where((item) => item.id == cleanLineId && item.hasPreparationRoute)
        .singleOrNull;
    if (line == null) {
      throw StateError('This kitchen ticket is no longer available.');
    }
    final dispatch = order.kitchenDispatchLines
        .where((item) => item.lineId == cleanLineId)
        .singleOrNull;
    if (dispatch == null ||
        order.kitchenStatusByLine[cleanLineId] != expectedStatus) {
      throw StateError('The kitchen status changed. Refresh and try again.');
    }
    final sequence = cafeKitchenNextSequence(expectedStatus);
    final now = _now();
    final event = CafeKitchenStatusEvent(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      ticketVersion: order.ticket.version,
      ticketFingerprint: order.ticket.lastCommandFingerprint,
      lineId: cleanLineId,
      kitchenTicketId: dispatch.ticketId,
      preparationStation: dispatch.preparationStation,
      sequence: sequence,
      fromState: expectedStatus,
      toState: targetStatus,
      createdAtMillis: now,
    );
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      'VALUES (?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        const Variable<String>(cafeKitchenStatusEventType),
        Variable<String>(jsonEncode(event.toJson())),
        const Variable<String>('pending'),
        Variable<int>(now),
      ],
    );
    return (await read(cleanOrderId))!;
  });

  /// Splits whole line instances from one unrouted device-local order into a
  /// second order so each can be completed as a separate cash sale.
  ///
  /// Routed kitchen/bar tickets are deliberately rejected because their
  /// immutable identity is bound to the original order. This is not partial
  /// quantity, split tender, mixed payment, or cross-device bill splitting.
  Future<({StoredCafeOrder source, StoredCafeOrder destination})>
  splitLocalBill({
    required String sourceOrderId,
    required String destinationOrderId,
    required String operationId,
    required int expectedTicketVersion,
    required int expectedStateRevision,
    required List<String> movedLineIds,
  }) => _splitLocalBill(
    sourceOrderId: sourceOrderId,
    destinationOrderId: destinationOrderId,
    operationId: operationId,
    expectedTicketVersion: expectedTicketVersion,
    expectedStateRevision: expectedStateRevision,
    movedLineIds: movedLineIds,
  );

  /// Splits explicit whole-unit quantities from unrouted device-local lines.
  ///
  /// The same immutable line snapshot is retained on both bills when only part
  /// of its integer quantity moves. It does not allocate tax, split a tender,
  /// move routed kitchen/bar tickets, or coordinate another device.
  Future<({StoredCafeOrder source, StoredCafeOrder destination})>
  splitLocalBillQuantities({
    required String sourceOrderId,
    required String destinationOrderId,
    required String operationId,
    required int expectedTicketVersion,
    required int expectedStateRevision,
    required Map<String, int> movedLineQuantities,
  }) => _splitLocalBill(
    sourceOrderId: sourceOrderId,
    destinationOrderId: destinationOrderId,
    operationId: operationId,
    expectedTicketVersion: expectedTicketVersion,
    expectedStateRevision: expectedStateRevision,
    movedLineQuantities: movedLineQuantities,
  );

  Future<({StoredCafeOrder source, StoredCafeOrder destination})>
  _splitLocalBill({
    required String sourceOrderId,
    required String destinationOrderId,
    required String operationId,
    required int expectedTicketVersion,
    required int expectedStateRevision,
    List<String>? movedLineIds,
    Map<String, int>? movedLineQuantities,
  }) => database.transaction(() async {
    final quantitySplit = movedLineQuantities != null;
    final cleanSourceId = _operationId(sourceOrderId, 'source order');
    final cleanDestinationId = _operationId(
      destinationOrderId,
      'destination order',
    );
    final cleanOperationId = _operationId(operationId, 'split operation');
    final cleanMovedLineIds = <String>[
      for (final lineId in movedLineIds ?? const <String>[])
        _operationId(lineId, 'line'),
    ];
    final cleanMovedLineQuantities = <String, int>{
      for (final entry
          in (movedLineQuantities ?? const <String, int>{}).entries)
        _operationId(entry.key, 'line'): entry.value,
    };
    if ((movedLineIds?.length ?? 0) != cleanMovedLineIds.length ||
        (movedLineQuantities?.length ?? 0) != cleanMovedLineQuantities.length ||
        (quantitySplit
            ? cleanMovedLineIds.isNotEmpty || cleanMovedLineQuantities.isEmpty
            : cleanMovedLineQuantities.isNotEmpty ||
                  cleanMovedLineIds.isEmpty ||
                  cleanMovedLineIds.toSet().length !=
                      cleanMovedLineIds.length)) {
      throw ArgumentError('Choose whole units for a new café bill.');
    }
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeOrderWrite,
      commandId: cleanOperationId,
      expectedVersion: expectedTicketVersion,
      claimedActorId: staffActorId,
    );
    final replayRow = await database
        .customSelect(
          'SELECT event_type, payload_json FROM shop_sync_outbox '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replayRow != null) {
      if (!{
        cafeOrderSplitEventType,
        cafeOrderQuantitySplitEventType,
      }.contains(replayRow.read<String>('event_type'))) {
        throw StateError('This café split ID is already in use.');
      }
      final replay = CafeOrderSplitEvent.fromJson(
        jsonDecode(replayRow.read<String>('payload_json')),
      );
      if (replayRow.read<String>('event_type') != replay.eventType ||
          replay.movesQuantities != quantitySplit ||
          replay.sourceOrderId != cleanSourceId ||
          replay.destinationOrderId != cleanDestinationId ||
          replay.expectedTicketVersion != expectedTicketVersion ||
          replay.expectedStateRevision != expectedStateRevision ||
          (quantitySplit
              ? !_sameQuantities(
                  replay.movedLineQuantities,
                  cleanMovedLineQuantities,
                )
              : !_sameStrings(replay.movedLineIds, cleanMovedLineIds))) {
        throw StateError('A café split ID was reused differently.');
      }
      final source = await read(cleanSourceId);
      final destination = await read(cleanDestinationId);
      if (source == null || destination == null) {
        throw StateError('The split café orders are missing.');
      }
      return (source: source, destination: destination);
    }
    if (cleanSourceId == cleanDestinationId) {
      throw ArgumentError('Choose distinct café items and a new bill.');
    }
    final source = await read(cleanSourceId);
    if (source == null ||
        source.state != 'open' ||
        source.ticket.version != expectedTicketVersion ||
        source.stateRevision != expectedStateRevision) {
      throw StateError('The café order changed. Refresh and review it.');
    }
    if (source.ticket.lines.any((line) => line.hasPreparationRoute)) {
      throw StateError(
        'Routed kitchen tickets cannot move to a different local bill.',
      );
    }
    final sourceStateRows = await database
        .customSelect(
          'SELECT request_fingerprint, resulting_state_revision '
          'FROM shop_cafe_order_state_events WHERE order_id = ? '
          'ORDER BY resulting_state_revision',
          variables: [Variable<String>(cleanSourceId)],
        )
        .get();
    if (sourceStateRows.length != expectedStateRevision ||
        sourceStateRows.indexed.any(
          (entry) =>
              entry.$2.read<int>('resulting_state_revision') != entry.$1 + 1,
        )) {
      throw StateError('The café order state history is incomplete.');
    }
    final sourceStateEventFingerprints = [
      for (final row in sourceStateRows)
        row.read<String>('request_fingerprint'),
    ];
    if (await read(cleanDestinationId) != null) {
      throw StateError('The destination café bill already exists.');
    }
    final sourceIds = source.ticket.lines.map((line) => line.id).toSet();
    late final List<CafeOrderLine> remainingLines;
    late final List<CafeOrderLine> destinationLines;
    late final Map<String, int> orderedMovedLineQuantities;
    if (quantitySplit) {
      if (!sourceIds.containsAll(cleanMovedLineQuantities.keys)) {
        throw ArgumentError('Choose quantities from this café bill.');
      }
      orderedMovedLineQuantities = {
        for (final line in source.ticket.lines)
          if (cleanMovedLineQuantities.containsKey(line.id))
            line.id: cleanMovedLineQuantities[line.id]!,
      };
      var movedUnits = 0;
      var sourceUnits = 0;
      for (final line in source.ticket.lines) {
        sourceUnits += line.quantity;
        final moved = orderedMovedLineQuantities[line.id] ?? 0;
        if (orderedMovedLineQuantities.containsKey(line.id) &&
            (moved < 1 || moved > line.quantity)) {
          throw ArgumentError('Choose available whole units only.');
        }
        movedUnits += moved;
      }
      if (movedUnits < 1 || movedUnits >= sourceUnits) {
        throw ArgumentError('Keep at least one whole unit on each café bill.');
      }
      remainingLines = [
        for (final line in source.ticket.lines)
          if ((orderedMovedLineQuantities[line.id] ?? 0) < line.quantity)
            line.copyWithQuantity(
              line.quantity - (orderedMovedLineQuantities[line.id] ?? 0),
            ),
      ];
      destinationLines = [
        for (final line in source.ticket.lines)
          if ((orderedMovedLineQuantities[line.id] ?? 0) > 0)
            line.copyWithQuantity(orderedMovedLineQuantities[line.id]!),
      ];
    } else {
      orderedMovedLineQuantities = const {};
      final movedIds = cleanMovedLineIds.toSet();
      if (!sourceIds.containsAll(movedIds) ||
          movedIds.length >= source.ticket.lines.length) {
        throw ArgumentError('Keep at least one item on each café bill.');
      }
      remainingLines = [
        for (final line in source.ticket.lines)
          if (!movedIds.contains(line.id)) line,
      ];
      destinationLines = [
        for (final line in source.ticket.lines)
          if (movedIds.contains(line.id)) line,
      ];
    }
    final modifierCatalog = <String, CafeModifierSnapshot>{};
    for (final line in source.ticket.lines) {
      for (final modifier in line.modifiers) {
        final prior = modifierCatalog[modifier.key];
        if (prior != null &&
            jsonEncode(prior.toJson()) != jsonEncode(modifier.toJson())) {
          throw StateError('The saved café modifier catalog is inconsistent.');
        }
        modifierCatalog[modifier.key] = modifier;
      }
    }
    final sourceResult = await applyCommand(
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          cleanOperationId,
          'source',
          expectedStateRevision: expectedStateRevision,
        ),
        ticketId: cleanSourceId,
        expectedVersion: expectedTicketVersion,
        lines: remainingLines,
        serviceContext: source.ticket.serviceContext,
      ),
      modifierCatalog,
    );
    final destinationResult = await applyCommand(
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          cleanOperationId,
          'destination',
          expectedStateRevision: expectedStateRevision,
        ),
        ticketId: cleanDestinationId,
        expectedVersion: 0,
        lines: destinationLines,
        serviceContext: source.ticket.serviceContext,
      ),
      modifierCatalog,
    );
    final now = _now();
    final event = CafeOrderSplitEvent(
      operationId: cleanOperationId,
      sourceOrderId: cleanSourceId,
      destinationOrderId: cleanDestinationId,
      expectedTicketVersion: expectedTicketVersion,
      expectedStateRevision: expectedStateRevision,
      sourceBeforeTicket: source.ticket,
      sourceResultTicket: sourceResult.ticket,
      destinationResultTicket: destinationResult.ticket,
      movedLineIds: quantitySplit ? const [] : cleanMovedLineIds,
      movedLineQuantities: orderedMovedLineQuantities,
      sourceStateEventFingerprints: sourceStateEventFingerprints,
      createdAtMillis: now,
    );
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      'VALUES (?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(event.eventType),
        Variable<String>(jsonEncode(event.toJson())),
        const Variable<String>('pending'),
        Variable<int>(now),
      ],
    );
    return (source: sourceResult, destination: destinationResult);
  });

  /// Returns exact, unchanged split pairs that can be recombined safely.
  ///
  /// This does not discover arbitrary bills to merge. A pair is eligible only
  /// while both unpaid local results still equal one recorded split event.
  Future<List<CafeOrderSplitReversalCandidate>>
  readSplitReversalCandidates() async {
    final events = await _readSplitEvents();
    final candidates = <CafeOrderSplitReversalCandidate>[];
    for (final event in events.reversed) {
      final source = await read(event.sourceOrderId);
      final destination = await read(event.destinationOrderId);
      if (source != null &&
          destination != null &&
          _splitReversalEligible(event, source, destination)) {
        candidates.add(
          CafeOrderSplitReversalCandidate(
            splitEvent: event,
            source: source,
            destination: destination,
          ),
        );
      }
    }
    return List.unmodifiable(candidates);
  }

  /// Restores the exact original local ticket from one recorded split and
  /// tombstones its unchanged destination as a linked cancellation.
  ///
  /// No sale, payment, stock, shift, receipt, routed kitchen ticket, or remote
  /// device effect is created. Arbitrary bill merging remains unsupported.
  Future<({StoredCafeOrder source, StoredCafeOrder destination})>
  reverseLocalSplit({
    required String splitOperationId,
    required String operationId,
    required int expectedSourceTicketVersion,
    required int expectedSourceStateRevision,
    required int expectedDestinationTicketVersion,
    required int expectedDestinationStateRevision,
  }) => database.transaction(() async {
    final cleanSplitOperationId = _operationId(
      splitOperationId,
      'original split operation',
    );
    final cleanOperationId = _operationId(
      operationId,
      'split reversal operation',
    );
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeOrderWrite,
      commandId: cleanOperationId,
      expectedVersion: expectedSourceTicketVersion,
      claimedActorId: staffActorId,
    );
    final replayRow = await database
        .customSelect(
          'SELECT event_type, payload_json FROM shop_sync_outbox '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replayRow != null) {
      if (replayRow.read<String>('event_type') !=
          cafeOrderSplitReversalEventType) {
        throw StateError('This café undo ID is already in use.');
      }
      final replay = CafeOrderSplitReversalEvent.fromJson(
        jsonDecode(replayRow.read<String>('payload_json')),
      );
      if (replay.splitOperationId != cleanSplitOperationId ||
          replay.expectedSourceTicketVersion != expectedSourceTicketVersion ||
          replay.expectedSourceStateRevision != expectedSourceStateRevision ||
          replay.expectedDestinationTicketVersion !=
              expectedDestinationTicketVersion ||
          replay.expectedDestinationStateRevision !=
              expectedDestinationStateRevision) {
        throw StateError('A café undo ID was reused differently.');
      }
      final source = await read(replay.sourceOrderId);
      final destination = await read(replay.destinationOrderId);
      if (source == null ||
          destination == null ||
          destination.state != 'cancelled') {
        throw StateError('The recombined café bills are incomplete.');
      }
      return (source: source, destination: destination);
    }
    final splitRow = await database
        .customSelect(
          'SELECT event_type, payload_json FROM shop_sync_outbox '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanSplitOperationId)],
        )
        .getSingleOrNull();
    if (splitRow == null ||
        !{
          cafeOrderSplitEventType,
          cafeOrderQuantitySplitEventType,
        }.contains(splitRow.read<String>('event_type'))) {
      throw StateError('The original café split evidence is unavailable.');
    }
    final split = CafeOrderSplitEvent.fromJson(
      jsonDecode(splitRow.read<String>('payload_json')),
    );
    if (split.eventType != splitRow.read<String>('event_type') ||
        split.operationId != cleanSplitOperationId) {
      throw StateError('The original café split evidence is invalid.');
    }
    final source = await read(split.sourceOrderId);
    final destination = await read(split.destinationOrderId);
    if (source == null ||
        destination == null ||
        source.ticket.version != expectedSourceTicketVersion ||
        source.stateRevision != expectedSourceStateRevision ||
        destination.ticket.version != expectedDestinationTicketVersion ||
        destination.stateRevision != expectedDestinationStateRevision ||
        !_splitReversalEligible(split, source, destination)) {
      throw StateError(
        'These split bills changed. Keep them separate and review them.',
      );
    }
    final sourceCommandId = cafeOrderSplitReversalCommandId(
      cleanOperationId,
      'source',
      expectedSourceStateRevision: expectedSourceStateRevision,
      expectedDestinationStateRevision: expectedDestinationStateRevision,
    );
    final destinationCancellationId = cafeOrderSplitReversalCommandId(
      cleanOperationId,
      'destination-cancel',
      expectedSourceStateRevision: expectedSourceStateRevision,
      expectedDestinationStateRevision: expectedDestinationStateRevision,
    );
    final modifierCatalog = <String, CafeModifierSnapshot>{};
    for (final line in split.sourceBeforeTicket.lines) {
      for (final modifier in line.modifiers) {
        final prior = modifierCatalog[modifier.key];
        if (prior != null &&
            jsonEncode(prior.toJson()) != jsonEncode(modifier.toJson())) {
          throw StateError('The saved café modifier catalog is inconsistent.');
        }
        modifierCatalog[modifier.key] = modifier;
      }
    }
    final restoredSource = await applyCommand(
      CafeOrderCommand(
        id: sourceCommandId,
        ticketId: split.sourceOrderId,
        expectedVersion: expectedSourceTicketVersion,
        lines: split.sourceBeforeTicket.lines,
        serviceContext: split.sourceBeforeTicket.serviceContext,
      ),
      modifierCatalog,
    );
    final cancelledDestination = await cancel(
      orderId: split.destinationOrderId,
      operationId: destinationCancellationId,
      expectedStateRevision: expectedDestinationStateRevision,
    );
    final now = _now();
    final cancellationFingerprint = cafeOrderCancellationFingerprint(
      operationId: destinationCancellationId,
      orderId: split.destinationOrderId,
      ticketVersion: expectedDestinationTicketVersion,
      ticketFingerprint: split.destinationResultTicket.lastCommandFingerprint,
      stateRevision: expectedDestinationStateRevision,
      fromState: 'open',
    );
    final event = CafeOrderSplitReversalEvent(
      operationId: cleanOperationId,
      splitOperationId: cleanSplitOperationId,
      sourceOrderId: split.sourceOrderId,
      destinationOrderId: split.destinationOrderId,
      expectedSourceTicketVersion: expectedSourceTicketVersion,
      expectedSourceStateRevision: expectedSourceStateRevision,
      expectedDestinationTicketVersion: expectedDestinationTicketVersion,
      expectedDestinationStateRevision: expectedDestinationStateRevision,
      splitEvent: split,
      restoredSourceTicket: restoredSource.ticket,
      destinationCancellationOperationId: destinationCancellationId,
      destinationCancellationFingerprint: cancellationFingerprint,
      createdAtMillis: now,
    );
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      'VALUES (?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        const Variable<String>(cafeOrderSplitReversalEventType),
        Variable<String>(jsonEncode(event.toJson())),
        const Variable<String>('pending'),
        Variable<int>(now),
      ],
    );
    return (source: restoredSource, destination: cancelledDestination);
  });

  Future<ShopSaleReceipt> completeCash({
    required String orderId,
    required String operationId,
    required int expectedTicketVersion,
    required int expectedStateRevision,
    int? cashTenderedMmk,
    bool requirePendingCashCheckout = false,
  }) => database.transaction(() async {
    final cleanOrderId = _operationId(orderId, 'order');
    final cleanOperationId = _operationId(operationId, 'operation');
    await database.authorizeManagedStaffCommand(
      authorizer: staffAuthorizer,
      capability: ShopStaffCapability.cafeCashComplete,
      commandId: cleanOperationId,
      expectedVersion: expectedStateRevision,
      claimedActorId: staffActorId,
    );
    final order = await read(cleanOrderId);
    final fingerprint = cafeOrderCashSaleFingerprint(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      ticketVersion: expectedTicketVersion,
      stateRevision: expectedStateRevision,
      cashTenderedMmk: cashTenderedMmk,
    );
    final replay = await database
        .customSelect(
          'SELECT request_fingerprint, sale_id FROM shop_cafe_order_state_events '
          'WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (replay != null) {
      if (replay.read<String>('request_fingerprint') != fingerprint ||
          replay.readNullable<String>('sale_id') != cleanOperationId) {
        throw StateError('A café sale operation ID was reused differently.');
      }
      return _receipt(cleanOperationId);
    }
    if (requirePendingCashCheckout) {
      await database.requirePendingCashCheckout(
        operationId: cleanOperationId,
        checkoutKind: 'cafe',
        subjectId: cleanOrderId,
      );
    }
    if (order == null ||
        order.state != 'open' ||
        order.ticket.version != expectedTicketVersion ||
        order.stateRevision != expectedStateRevision) {
      throw StateError('The café order changed. Refresh and review it.');
    }
    if (cashTenderedMmk != null &&
        (cashTenderedMmk < order.totalMmk ||
            cashTenderedMmk > 200000000000000)) {
      throw StateError('Cash received is less than the café total.');
    }
    final pendingWallet = await database
        .customSelect(
          "SELECT 1 FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
        )
        .getSingleOrNull();
    if (pendingWallet != null) {
      throw StateError('Finish or cancel the pending wallet payment first.');
    }
    final priorSale = await database
        .customSelect(
          'SELECT request_fingerprint FROM shop_sales WHERE operation_id = ?',
          variables: [Variable<String>(cleanOperationId)],
        )
        .getSingleOrNull();
    if (priorSale != null) {
      throw StateError('This sale operation ID is already in use.');
    }
    final activeShift = await database.readOpenCashShift();
    if (activeShift != null) {
      final review = await database.readCashShiftReview(activeShift.id);
      final grossBefore =
          activeShift.openingFloatMmk +
          review.cashSalesTotalMmk +
          review.cashInTotalMmk;
      if (order.totalMmk > 200000000000000 - grossBefore) {
        throw StateError('Close this cash shift before another cash sale.');
      }
    }
    final requiredStock = <String, int>{};
    for (final line in order.ticket.lines) {
      requiredStock.update(
        line.productId,
        (quantity) => quantity + line.quantity,
        ifAbsent: () => line.quantity,
      );
    }
    final stockByProduct = <String, ({String name, int available})>{};
    for (final requirement in requiredStock.entries) {
      final product = await database
          .customSelect(
            'SELECT name, on_hand FROM shop_products WHERE id = ?',
            variables: [Variable<String>(requirement.key)],
          )
          .getSingleOrNull();
      if (product == null) {
        throw StateError('A café product is no longer available.');
      }
      final stock = (
        name: product.read<String>('name'),
        available: product.read<int>('on_hand'),
      );
      stockByProduct[requirement.key] = stock;
      if (stock.available < requirement.value) {
        throw ShopCafeInsufficientStockException(
          productName: stock.name,
          available: stock.available,
          requiredQuantity: requirement.value,
        );
      }
    }
    final now = _now();
    await _ensureLegacyDispatchBoundary(
      order.ticket,
      now,
      allowUntrackedLegacyCompletion: true,
    );
    await database.customInsert(
      'INSERT INTO shop_sales '
      '(id, operation_id, request_fingerprint, total_mmk, payment_method, '
      'cash_tendered_mmk, created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(cleanOperationId),
        Variable<String>(fingerprint),
        Variable<int>(order.totalMmk),
        const Variable<String>('cash'),
        Variable<int>(cashTenderedMmk),
        Variable<int>(now),
      ],
    );
    if (activeShift != null) {
      await database.customInsert(
        'INSERT INTO shop_cash_shift_sales (sale_id, shift_id) VALUES (?, ?)',
        variables: [
          Variable<String>(cleanOperationId),
          Variable<String>(activeShift.id),
        ],
      );
    }
    final eventLines = <Map<String, Object>>[];
    for (final line in order.ticket.lines) {
      final product = stockByProduct[line.productId]!;
      final changed = await database.customUpdate(
        'UPDATE shop_products SET on_hand = on_hand - ?, '
        'updated_at_millis = ? WHERE id = ? AND on_hand >= ?',
        variables: [
          Variable<int>(line.quantity),
          Variable<int>(now),
          Variable<String>(line.productId),
          Variable<int>(line.quantity),
        ],
      );
      if (changed != 1) {
        final current = await database
            .customSelect(
              'SELECT on_hand FROM shop_products WHERE id = ?',
              variables: [Variable<String>(line.productId)],
            )
            .getSingleOrNull();
        throw ShopCafeInsufficientStockException(
          productName: product.name,
          available: current?.read<int>('on_hand') ?? 0,
          requiredQuantity: requiredStock[line.productId]!,
        );
      }
      final unit = _lineUnit(line);
      final displayName = _receiptName(line.productName ?? product.name, line);
      final saleLineId = '$cleanOperationId:${line.id}';
      await database.customInsert(
        'INSERT INTO shop_sale_lines '
        '(id, sale_id, product_id, product_name, unit_price_mmk, quantity, '
        'line_total_mmk) VALUES (?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(saleLineId),
          Variable<String>(cleanOperationId),
          Variable<String>(line.productId),
          Variable<String>(displayName),
          Variable<int>(unit),
          Variable<int>(line.quantity),
          Variable<int>(unit * line.quantity),
        ],
      );
      await database.customInsert(
        'INSERT INTO shop_stock_movements '
        '(id, sale_id, product_id, quantity_delta, reason, created_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>('$cleanOperationId:${line.id}:cafe-sale'),
          Variable<String>(cleanOperationId),
          Variable<String>(line.productId),
          Variable<int>(-line.quantity),
          const Variable<String>('cafe_cash_sale'),
          Variable<int>(now),
        ],
      );
      final dispatchLine = line.hasPreparationRoute
          ? order.kitchenDispatchLines.singleWhere(
              (item) => item.lineId == line.id,
            )
          : null;
      eventLines.add({
        'lineId': line.id,
        'productId': line.productId,
        'productName': displayName,
        'quantity': line.quantity,
        'unitPriceMmk': unit,
        'lineTotalMmk': unit * line.quantity,
        'remark': line.remark,
        if (dispatchLine != null) ...{
          'preparationStation': dispatchLine.preparationStation,
          'kitchenTicketId': dispatchLine.ticketId,
          'kitchenTicketSequence': dispatchLine.sequence,
        },
        'modifiers': [for (final item in line.modifiers) item.toJson()],
      });
    }
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      "VALUES (?, 'shop.cafe_cash_sale.completed.v1', ?, 'pending', ?)",
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(
          jsonEncode({
            'saleId': cleanOperationId,
            'cafeOrderId': cleanOrderId,
            'ticketVersion': order.ticket.version,
            'totalMmk': order.totalMmk,
            'paymentMethod': 'cash',
            if (cashTenderedMmk != null) ...{
              'cashTenderedMmk': cashTenderedMmk,
              'cashChangeMmk': cashTenderedMmk - order.totalMmk,
            },
            'createdAtMillis': now,
            if (activeShift != null) 'shiftId': activeShift.id,
            if (order.ticket.serviceContext != null)
              'serviceContext': order.ticket.serviceContext!.toJson(),
            'lines': eventLines,
          }),
        ),
        Variable<int>(now),
      ],
    );
    await _insertStateEvent(
      operationId: cleanOperationId,
      orderId: cleanOrderId,
      fingerprint: fingerprint,
      fromState: 'open',
      toState: 'completed',
      expectedRevision: expectedStateRevision,
      saleId: cleanOperationId,
      now: now,
    );
    if (requirePendingCashCheckout) {
      await database.consumePendingCashCheckout(
        operationId: cleanOperationId,
        checkoutKind: 'cafe',
        subjectId: cleanOrderId,
      );
    }
    await database.customUpdate(
      'UPDATE shop_cafe_orders SET state = ?, state_revision = ?, '
      'last_state_operation_id = ?, last_state_fingerprint = ?, '
      'completed_sale_id = ?, updated_at_millis = ? WHERE id = ?',
      variables: [
        const Variable<String>('completed'),
        Variable<int>(expectedStateRevision + 1),
        Variable<String>(cleanOperationId),
        Variable<String>(fingerprint),
        Variable<String>(cleanOperationId),
        Variable<int>(now),
        Variable<String>(cleanOrderId),
      ],
    );
    return _receipt(cleanOperationId);
  });

  Future<void> _requireCurrentProducts(CafeOrderTicket ticket) async {
    for (final line in ticket.lines) {
      final product = await database
          .customSelect(
            'SELECT price_mmk, archived FROM shop_products WHERE id = ?',
            variables: [Variable<String>(line.productId)],
          )
          .getSingleOrNull();
      if (product == null ||
          product.read<bool>('archived') ||
          product.read<int>('price_mmk') != line.baseUnitPriceMmk) {
        throw StateError('Review the café product and price again.');
      }
    }
  }

  Future<void> _requireStartedKitchenLinesUnchanged(
    StoredCafeOrder prior,
    CafeOrderTicket next,
  ) async {
    final nextById = {for (final line in next.lines) line.id: line};
    final changedRoutedLineIds = <String>[];
    for (final line in prior.ticket.lines) {
      if (!line.hasPreparationRoute) continue;
      final replacement = nextById[line.id];
      if (replacement == null ||
          jsonEncode(replacement.toJson()) != jsonEncode(line.toJson())) {
        changedRoutedLineIds.add(line.id);
      }
    }
    if (changedRoutedLineIds.isEmpty) return;

    final projected = await _attachKitchenDispatch(prior);
    for (final lineId in changedRoutedLineIds) {
      if (projected.kitchenStatusByLine[lineId] != 'pending_local') {
        throw const ShopCafeStartedKitchenLineException();
      }
    }
  }

  Future<void> _insertStateEvent({
    required String operationId,
    required String orderId,
    required String fingerprint,
    required String fromState,
    required String toState,
    required int expectedRevision,
    required String? saleId,
    required int now,
  }) => database.customInsert(
    'INSERT INTO shop_cafe_order_state_events '
    '(operation_id, order_id, request_fingerprint, from_state, to_state, '
    'expected_state_revision, resulting_state_revision, sale_id, '
    'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    variables: [
      Variable<String>(operationId),
      Variable<String>(orderId),
      Variable<String>(fingerprint),
      Variable<String>(fromState),
      Variable<String>(toState),
      Variable<int>(expectedRevision),
      Variable<int>(expectedRevision + 1),
      Variable<String>(saleId),
      Variable<int>(now),
    ],
  );

  Future<ShopSaleReceipt> _receipt(String saleId) async {
    final sale = await database
        .customSelect(
          'SELECT * FROM shop_sales WHERE id = ?',
          variables: [Variable<String>(saleId)],
        )
        .getSingle();
    final lines = await database
        .customSelect(
          'SELECT * FROM shop_sale_lines WHERE sale_id = ? ORDER BY id',
          variables: [Variable<String>(saleId)],
        )
        .get();
    return ShopSaleReceipt(
      id: saleId,
      operationId: sale.read<String>('operation_id'),
      totalMmk: sale.read<int>('total_mmk'),
      createdAtMillis: sale.read<int>('created_at_millis'),
      paymentMethod: sale.read<String>('payment_method'),
      cashTenderedMmk: sale.readNullable<int>('cash_tendered_mmk'),
      lines: [
        for (final line in lines)
          ShopSaleReceiptLine(
            id: line.read<String>('id'),
            productId: line.read<String>('product_id'),
            productName: line.read<String>('product_name'),
            unitPriceMmk: line.read<int>('unit_price_mmk'),
            quantity: line.read<int>('quantity'),
            lineTotalMmk: line.read<int>('line_total_mmk'),
          ),
      ],
    );
  }

  StoredCafeOrder _fromRow(QueryRow row) => StoredCafeOrder(
    ticket: CafeOrderTicket.fromJson(
      jsonDecode(row.read<String>('ticket_json')),
    ),
    state: row.read<String>('state'),
    stateRevision: row.read<int>('state_revision'),
    totalMmk: row.read<int>('total_mmk'),
    completedSaleId: row.readNullable<String>('completed_sale_id'),
    createdAtMillis: row.read<int>('created_at_millis'),
    updatedAtMillis: row.read<int>('updated_at_millis'),
    kitchenDispatchLines: const [],
    kitchenStatusByLine: const {},
  );

  Future<StoredCafeOrder> _projectCancellation(StoredCafeOrder order) async {
    final cancellation = await database
        .customSelect(
          'SELECT created_at_millis FROM shop_cafe_order_cancellations '
          'WHERE order_id = ?',
          variables: [Variable<String>(order.ticket.id)],
        )
        .getSingleOrNull();
    if (cancellation == null) return order;
    return StoredCafeOrder(
      ticket: order.ticket,
      state: 'cancelled',
      stateRevision: order.stateRevision,
      totalMmk: order.totalMmk,
      completedSaleId: order.completedSaleId,
      createdAtMillis: order.createdAtMillis,
      updatedAtMillis: cancellation.read<int>('created_at_millis'),
      kitchenDispatchLines: order.kitchenDispatchLines,
      kitchenStatusByLine: order.kitchenStatusByLine,
    );
  }

  Future<({List<CafeKitchenDispatchLine> lines, int historyStartVersion})>
  _nextKitchenDispatchLines(CafeOrderTicket ticket) async {
    final rows = await database
        .customSelect(
          "SELECT payload_json FROM shop_sync_outbox WHERE event_type = "
          "'shop.cafe_kitchen_dispatch.recorded.v1'",
        )
        .get();
    final prior = <String, CafeKitchenDispatchLine>{};
    var maxSequence = 0;
    int? historyStartVersion;
    for (final row in rows) {
      final dispatch = cafeKitchenDispatchFromPayload(
        jsonDecode(row.read<String>('payload_json')),
      );
      if (dispatch.ticket.id != ticket.id) continue;
      historyStartVersion ??= dispatch.historyStartVersion;
      if (historyStartVersion != dispatch.historyStartVersion) {
        throw StateError('The café kitchen dispatch history is inconsistent.');
      }
      for (final line in dispatch.lines) {
        final existing = prior[line.lineId];
        if (existing != null &&
            (existing.ticketId != line.ticketId ||
                existing.sequence != line.sequence ||
                existing.preparationStation != line.preparationStation)) {
          throw StateError('A café kitchen route changed after dispatch.');
        }
        prior[line.lineId] = line;
        if (line.sequence > maxSequence) maxSequence = line.sequence;
      }
    }
    final result = <CafeKitchenDispatchLine>[];
    for (final line in ticket.lines) {
      if (!line.hasPreparationRoute) continue;
      final existing = prior[line.id];
      if (existing != null &&
          existing.preparationStation != line.preparationStation) {
        throw StateError('A café kitchen route changed after dispatch.');
      }
      result.add(
        existing ??
            CafeKitchenDispatchLine(
              lineId: line.id,
              ticketId: cafeKitchenTicketId(ticket.id, line.id),
              sequence: ++maxSequence,
              preparationStation: line.preparationStation,
            ),
      );
    }
    return (lines: result, historyStartVersion: historyStartVersion ?? 1);
  }

  Future<void> _ensureLegacyDispatchBoundary(
    CafeOrderTicket prior,
    int now, {
    bool allowUntrackedLegacyCompletion = false,
  }) async {
    final existing = await database
        .customSelect(
          'SELECT 1 FROM shop_sync_outbox WHERE operation_id = ?',
          variables: [Variable<String>(cafeKitchenDispatchOperationId(prior))],
        )
        .getSingleOrNull();
    if (existing != null) return;
    if (prior.version != 1) {
      if (allowUntrackedLegacyCompletion &&
          !prior.lines.any((line) => line.hasPreparationRoute)) {
        return;
      }
      throw StateError(
        'This legacy café order cannot be routed. Complete it locally or start a new order.',
      );
    }
    if (prior.lines.any((line) => line.hasPreparationRoute)) {
      throw StateError(
        'This legacy café order cannot be routed. Complete it locally or start a new order.',
      );
    }
    await database.customInsert(
      'INSERT INTO shop_sync_outbox '
      '(operation_id, event_type, payload_json, state, created_at_millis) '
      "VALUES (?, 'shop.cafe_kitchen_dispatch.recorded.v1', ?, 'pending', ?)",
      variables: [
        Variable<String>(cafeKitchenDispatchOperationId(prior)),
        Variable<String>(
          jsonEncode(cafeKitchenDispatchPayload(prior, const [], 1)),
        ),
        Variable<int>(now),
      ],
    );
  }

  Future<StoredCafeOrder> _attachKitchenDispatch(
    StoredCafeOrder order, {
    List<CafeKitchenStatusEvent>? statusEvents,
  }) async {
    if (!order.ticket.lines.any((line) => line.hasPreparationRoute)) {
      return order;
    }
    final row = await database
        .customSelect(
          'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
          variables: [
            Variable<String>(cafeKitchenDispatchOperationId(order.ticket)),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('The café kitchen dispatch is missing.');
    }
    final dispatch = cafeKitchenDispatchFromPayload(
      jsonDecode(row.read<String>('payload_json')),
    );
    final statusByLine = _projectKitchenStatuses(
      order.ticket.id,
      dispatch.lines,
      statusEvents ?? await _readKitchenStatusEvents(),
    );
    return StoredCafeOrder(
      ticket: order.ticket,
      state: order.state,
      stateRevision: order.stateRevision,
      totalMmk: order.totalMmk,
      completedSaleId: order.completedSaleId,
      createdAtMillis: order.createdAtMillis,
      updatedAtMillis: order.updatedAtMillis,
      kitchenDispatchLines: dispatch.lines,
      kitchenStatusByLine: statusByLine,
    );
  }

  Map<String, String> _projectKitchenStatuses(
    String orderId,
    List<CafeKitchenDispatchLine> lines,
    List<CafeKitchenStatusEvent> events,
  ) {
    final byTicket = {for (final line in lines) line.ticketId: line};
    final statusByLine = {
      for (final line in lines) line.lineId: 'pending_local',
    };
    final nextSequence = {for (final line in lines) line.ticketId: 1};
    for (final event in events) {
      final dispatch = byTicket[event.kitchenTicketId];
      if (dispatch == null) continue;
      final current = statusByLine[dispatch.lineId]!;
      if (event.orderId != orderId ||
          event.lineId != dispatch.lineId ||
          event.preparationStation != dispatch.preparationStation ||
          event.sequence != nextSequence[event.kitchenTicketId] ||
          event.fromState != current ||
          event.toState != cafeKitchenNextState(current)) {
        throw StateError('The café kitchen status history is inconsistent.');
      }
      statusByLine[dispatch.lineId] = event.toState;
      nextSequence[event.kitchenTicketId] = event.sequence + 1;
    }
    return Map.unmodifiable(statusByLine);
  }

  Future<List<CafeKitchenStatusEvent>> _readKitchenStatusEvents() async {
    final rows = await database
        .customSelect(
          'SELECT payload_json FROM shop_sync_outbox WHERE event_type = ? '
          "ORDER BY json_extract(payload_json, '\$.kitchenTicketId'), "
          "json_extract(payload_json, '\$.sequence'), operation_id",
          variables: const [Variable<String>(cafeKitchenStatusEventType)],
        )
        .get();
    return List.unmodifiable([
      for (final row in rows)
        CafeKitchenStatusEvent.fromJson(
          jsonDecode(row.read<String>('payload_json')),
        ),
    ]);
  }

  int _lineUnit(CafeOrderLine line) =>
      line.baseUnitPriceMmk +
      line.modifiers.fold<int>(0, (sum, item) => sum + item.priceDeltaMmk);

  int _ticketTotal(CafeOrderTicket ticket) => ticket.lines.fold<int>(
    0,
    (sum, line) => sum + _lineUnit(line) * line.quantity,
  );

  String _receiptName(String productName, CafeOrderLine line) {
    final details = <String>[
      for (final item in line.modifiers) '${item.labelEn}/${item.labelMy}',
      if (line.remark.isNotEmpty) line.remark,
    ];
    final name = details.isEmpty
        ? productName
        : '$productName — ${details.join(', ')}';
    if (name.length > 160) {
      throw StateError('Café receipt detail is too long.');
    }
    return name;
  }

  String _operationId(String value, String label) {
    final clean = value.trim();
    if (clean.isEmpty || clean.length > 120) {
      throw ArgumentError('Café $label ID is invalid.');
    }
    return clean;
  }

  int _now() {
    final value = _clock().millisecondsSinceEpoch;
    if (value <= 0) throw StateError('Café order clock is invalid.');
    return value;
  }

  bool _sameStrings(List<String> left, List<String> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }

  bool _sameQuantities(Map<String, int> left, Map<String, int> right) {
    if (left.length != right.length) return false;
    for (final entry in left.entries) {
      if (right[entry.key] != entry.value) return false;
    }
    return true;
  }

  Future<List<CafeOrderSplitEvent>> _readSplitEvents() async {
    final rows = await database
        .customSelect(
          'SELECT event_type, payload_json FROM shop_sync_outbox '
          'WHERE event_type IN (?, ?) ORDER BY created_at_millis, operation_id',
          variables: const [
            Variable<String>(cafeOrderSplitEventType),
            Variable<String>(cafeOrderQuantitySplitEventType),
          ],
        )
        .get();
    final events = <CafeOrderSplitEvent>[];
    for (final row in rows) {
      final event = CafeOrderSplitEvent.fromJson(
        jsonDecode(row.read<String>('payload_json')),
      );
      if (row.read<String>('event_type') != event.eventType) {
        throw StateError('The saved café split evidence is invalid.');
      }
      events.add(event);
    }
    return List.unmodifiable(events);
  }

  bool _splitReversalEligible(
    CafeOrderSplitEvent split,
    StoredCafeOrder source,
    StoredCafeOrder destination,
  ) =>
      source.state == 'open' &&
      destination.state == 'open' &&
      source.stateRevision == split.expectedStateRevision &&
      destination.stateRevision == 0 &&
      jsonEncode(source.ticket.toJson()) ==
          jsonEncode(split.sourceResultTicket.toJson()) &&
      jsonEncode(destination.ticket.toJson()) ==
          jsonEncode(split.destinationResultTicket.toJson()) &&
      !source.ticket.lines.any((line) => line.hasPreparationRoute) &&
      !destination.ticket.lines.any((line) => line.hasPreparationRoute);
}
