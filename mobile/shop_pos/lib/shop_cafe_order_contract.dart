import 'dart:convert';

import 'package:crypto/crypto.dart';

const cafeOrderContract = 'supermega.shop.cafe-order-source-contract.v1';
const _maxMmk = 2000000000;

Never _invalid(String reason) => throw FormatException('cafe_order_$reason');
String _text(Object? value, String field, int max) {
  if (value is! String ||
      value.trim() != value ||
      value.isEmpty ||
      value.length > max ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(value)) {
    _invalid(field);
  }
  return value;
}

int _integer(Object? value, String field, int min, int max) {
  if (value is! int || value < min || value > max) _invalid(field);
  return value;
}

class CafeModifierSnapshot {
  const CafeModifierSnapshot({
    required this.id,
    required this.version,
    required this.labelEn,
    required this.labelMy,
    required this.priceDeltaMmk,
  });
  final String id, labelEn, labelMy;
  final int version, priceDeltaMmk;
  String get key => '$id@$version';
  Map<String, Object> toJson() => {
    'id': id,
    'version': version,
    'labelEn': labelEn,
    'labelMy': labelMy,
    'priceDeltaMmk': priceDeltaMmk,
  };
  factory CafeModifierSnapshot.fromJson(Object? value) {
    if (value is! Map ||
        value.keys.toSet().difference({
          'id',
          'version',
          'labelEn',
          'labelMy',
          'priceDeltaMmk',
        }).isNotEmpty ||
        value.length != 5) {
      _invalid('modifier_shape');
    }
    return CafeModifierSnapshot(
      id: _text(value['id'], 'modifier_id', 80),
      version: _integer(value['version'], 'modifier_version', 1, 1000000),
      labelEn: _text(value['labelEn'], 'modifier_label_en', 120),
      labelMy: _text(value['labelMy'], 'modifier_label_my', 120),
      priceDeltaMmk: _integer(
        value['priceDeltaMmk'],
        'modifier_price',
        0,
        _maxMmk,
      ),
    );
  }
}

class CafeServiceContext {
  const CafeServiceContext({required this.areaLabel, required this.tableLabel});

  final String areaLabel, tableLabel;

  Map<String, Object> toJson() => {
    'areaLabel': areaLabel,
    'tableLabel': tableLabel,
  };

  factory CafeServiceContext.fromJson(Object? value) {
    if (value is! Map ||
        value.length != 2 ||
        value.keys.toSet().difference({'areaLabel', 'tableLabel'}).isNotEmpty) {
      _invalid('service_context_shape');
    }
    final area = _optionalText(value['areaLabel'], 'area_label', 80);
    final table = _optionalText(value['tableLabel'], 'table_label', 80);
    if (area.isEmpty && table.isEmpty) _invalid('service_context_empty');
    return CafeServiceContext(areaLabel: area, tableLabel: table);
  }
}

String _optionalText(Object? value, String field, int max) {
  if (value is! String ||
      value.trim() != value ||
      value.length > max ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(value)) {
    _invalid(field);
  }
  return value;
}

class CafeOrderLine {
  CafeOrderLine({
    required this.id,
    required this.productId,
    this.productName,
    required this.quantity,
    required this.baseUnitPriceMmk,
    required this.remark,
    required List<CafeModifierSnapshot> modifiers,
    this.preparationStation = 'kitchen',
  }) : legacyShape = false,
       modifiers = List.unmodifiable(modifiers) {
    if (productName != null) _text(productName, 'product_name', 160);
    if (!{'kitchen', 'bar'}.contains(preparationStation)) {
      _invalid('preparation_station');
    }
  }
  CafeOrderLine.local({
    required this.id,
    required this.productId,
    this.productName,
    required this.quantity,
    required this.baseUnitPriceMmk,
    required this.remark,
    required List<CafeModifierSnapshot> modifiers,
  }) : preparationStation = 'kitchen',
       legacyShape = true,
       modifiers = List.unmodifiable(modifiers) {
    if (productName != null) _text(productName, 'product_name', 160);
  }
  CafeOrderLine._({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.baseUnitPriceMmk,
    required this.remark,
    required List<CafeModifierSnapshot> modifiers,
    required this.preparationStation,
    required this.legacyShape,
  }) : modifiers = List.unmodifiable(modifiers) {
    if (!{'kitchen', 'bar'}.contains(preparationStation)) {
      _invalid('preparation_station');
    }
  }
  final String id, productId, remark;
  final String? productName;
  final String preparationStation;
  final int quantity, baseUnitPriceMmk;
  final List<CafeModifierSnapshot> modifiers;
  final bool legacyShape;
  bool get hasPreparationRoute => !legacyShape;
  CafeOrderLine copyWithQuantity(int value) {
    _integer(value, 'quantity', 1, 1000);
    return CafeOrderLine._(
      id: id,
      productId: productId,
      productName: productName,
      quantity: value,
      baseUnitPriceMmk: baseUnitPriceMmk,
      remark: remark,
      modifiers: modifiers,
      preparationStation: preparationStation,
      legacyShape: legacyShape,
    );
  }

  Map<String, Object> toJson() => {
    'id': id,
    'productId': productId,
    'productName': ?productName,
    'quantity': quantity,
    'baseUnitPriceMmk': baseUnitPriceMmk,
    'remark': remark,
    'modifiers': modifiers.map((e) => e.toJson()).toList(),
    if (!legacyShape) 'preparationStation': preparationStation,
  };
  factory CafeOrderLine.fromJson(Object? value) {
    final legacyShape =
        value is Map && !value.containsKey('preparationStation');
    if (value is! Map ||
        value.keys.toSet().difference({
          'id',
          'productId',
          'productName',
          'quantity',
          'baseUnitPriceMmk',
          'remark',
          'modifiers',
          'preparationStation',
        }).isNotEmpty ||
        (value.length != 6 && value.length != 7 && value.length != 8) ||
        value['modifiers'] is! List) {
      _invalid('line_shape');
    }
    final remark = value['remark'];
    if (remark is! String ||
        remark.trim() != remark ||
        remark.length > 240 ||
        RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]').hasMatch(remark)) {
      _invalid('remark');
    }
    return CafeOrderLine._(
      id: _text(value['id'], 'line_id', 120),
      productId: _text(value['productId'], 'product_id', 120),
      productName: value.containsKey('productName')
          ? _text(value['productName'], 'product_name', 160)
          : null,
      quantity: _integer(value['quantity'], 'quantity', 1, 1000),
      baseUnitPriceMmk: _integer(
        value['baseUnitPriceMmk'],
        'base_price',
        0,
        _maxMmk,
      ),
      remark: remark,
      preparationStation: legacyShape
          ? 'kitchen'
          : _text(value['preparationStation'], 'preparation_station', 20),
      modifiers: (value['modifiers'] as List)
          .map(CafeModifierSnapshot.fromJson)
          .toList(growable: false),
      legacyShape: legacyShape,
    );
  }
  int totalMmk() {
    var unit = baseUnitPriceMmk;
    for (final modifier in modifiers) {
      unit += modifier.priceDeltaMmk;
      if (unit > _maxMmk) _invalid('unit_total_overflow');
    }
    final total = unit * quantity;
    if (total > _maxMmk) _invalid('line_total_overflow');
    return total;
  }
}

class CafeOrderCommand {
  CafeOrderCommand({
    required this.id,
    required this.ticketId,
    required this.expectedVersion,
    required List<CafeOrderLine> lines,
    this.serviceContext,
  }) : lines = List.unmodifiable(lines);
  final String id, ticketId;
  final int expectedVersion;
  final List<CafeOrderLine> lines;
  final CafeServiceContext? serviceContext;
  Map<String, Object> _body() => {
    'contract': cafeOrderContract,
    'id': id,
    'ticketId': ticketId,
    'expectedVersion': expectedVersion,
    'lines': lines.map((e) => e.toJson()).toList(),
    if (serviceContext != null) 'serviceContext': serviceContext!.toJson(),
  };
  String get fingerprint =>
      sha256.convert(utf8.encode(jsonEncode(_body()))).toString();
}

class CafeOrderTicket {
  CafeOrderTicket._({
    required this.id,
    required this.version,
    required List<CafeOrderLine> lines,
    required this.lastCommandId,
    required this.lastCommandFingerprint,
    required this.serviceContext,
  }) : lines = List.unmodifiable(lines);
  final String id, lastCommandId, lastCommandFingerprint;
  final int version;
  final List<CafeOrderLine> lines;
  final CafeServiceContext? serviceContext;
  Map<String, Object> toJson() => {
    'contract': cafeOrderContract,
    'id': id,
    'version': version,
    'lines': lines.map((e) => e.toJson()).toList(),
    'lastCommandId': lastCommandId,
    'lastCommandFingerprint': lastCommandFingerprint,
    if (serviceContext != null) 'serviceContext': serviceContext!.toJson(),
  };
  factory CafeOrderTicket.fromJson(Object? value) {
    if (value is! Map ||
        value['contract'] != cafeOrderContract ||
        value.keys.toSet().difference({
          'contract',
          'id',
          'version',
          'lines',
          'lastCommandId',
          'lastCommandFingerprint',
          'serviceContext',
        }).isNotEmpty ||
        (value.length != 6 && value.length != 7) ||
        value['lines'] is! List) {
      _invalid('ticket_shape');
    }
    final ticket = CafeOrderTicket._(
      id: _text(value['id'], 'ticket_id', 120),
      version: _integer(value['version'], 'ticket_version', 1, 1000000),
      lines: (value['lines'] as List)
          .map(CafeOrderLine.fromJson)
          .toList(growable: false),
      lastCommandId: _text(value['lastCommandId'], 'command_id', 120),
      lastCommandFingerprint: _text(
        value['lastCommandFingerprint'],
        'fingerprint',
        64,
      ),
      serviceContext: value.containsKey('serviceContext')
          ? CafeServiceContext.fromJson(value['serviceContext'])
          : null,
    );
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(ticket.lastCommandFingerprint)) {
      _invalid('fingerprint');
    }
    _validateLines(ticket.lines, const {}, allowUnknown: true);
    final expectedFingerprint = CafeOrderCommand(
      id: ticket.lastCommandId,
      ticketId: ticket.id,
      expectedVersion: ticket.version - 1,
      lines: ticket.lines,
      serviceContext: ticket.serviceContext,
    ).fingerprint;
    if (ticket.lastCommandFingerprint != expectedFingerprint) {
      _invalid('fingerprint_mismatch');
    }
    return ticket;
  }
}

CafeOrderTicket applyCafeOrderCommand(
  CafeOrderTicket? current,
  CafeOrderCommand command,
  Map<String, CafeModifierSnapshot> catalog,
) {
  _text(command.id, 'command_id', 120);
  _text(command.ticketId, 'ticket_id', 120);
  if (command.serviceContext != null) {
    CafeServiceContext.fromJson(command.serviceContext!.toJson());
  }
  if (current != null) {
    _validateLines(current.lines, const {}, allowUnknown: true);
    final recorded = CafeOrderCommand(
      id: current.lastCommandId,
      ticketId: current.id,
      expectedVersion: current.version - 1,
      lines: current.lines,
      serviceContext: current.serviceContext,
    ).fingerprint;
    if (recorded != current.lastCommandFingerprint) {
      _invalid('current_fingerprint_mismatch');
    }
  }
  final fingerprint = command.fingerprint;
  if (current != null && current.lastCommandId == command.id) {
    if (current.lastCommandFingerprint != fingerprint) {
      _invalid('command_reused');
    }
    return current;
  }
  if ((current?.id ?? command.ticketId) != command.ticketId) {
    _invalid('ticket_mismatch');
  }
  if ((current?.version ?? 0) != command.expectedVersion) {
    _invalid('stale_version');
  }
  _validateLines(command.lines, catalog);
  var total = 0;
  for (final line in command.lines) {
    total += line.totalMmk();
    if (total > _maxMmk) _invalid('ticket_total_overflow');
  }
  return CafeOrderTicket._(
    id: command.ticketId,
    version: command.expectedVersion + 1,
    lines: List.unmodifiable(command.lines),
    lastCommandId: command.id,
    lastCommandFingerprint: fingerprint,
    serviceContext: command.serviceContext,
  );
}

class CafeKitchenDispatchLine {
  const CafeKitchenDispatchLine({
    required this.lineId,
    required this.ticketId,
    required this.sequence,
    required this.preparationStation,
  });

  final String lineId, ticketId, preparationStation;
  final int sequence;

  Map<String, Object> toJson() => {
    'lineId': lineId,
    'ticketId': ticketId,
    'sequence': sequence,
    'preparationStation': preparationStation,
    'state': 'pending_local',
  };
}

String cafeKitchenTicketId(String orderId, String lineId) =>
    'cafe-line-${sha256.convert(utf8.encode('$orderId\n$lineId')).toString().substring(0, 40)}';

String cafeKitchenDispatchOperationId(CafeOrderTicket ticket) =>
    'cafe-kitchen-${sha256.convert(utf8.encode('${ticket.id}\n${ticket.lastCommandId}')).toString().substring(0, 40)}';

Map<String, Object> cafeKitchenDispatchPayload(
  CafeOrderTicket ticket,
  List<CafeKitchenDispatchLine> lines,
  int historyStartVersion,
) => {
  'contract': 'supermega.shop.cafe-kitchen-dispatch.v1',
  'orderId': ticket.id,
  'ticketVersion': ticket.version,
  'historyStartVersion': historyStartVersion,
  'commandId': ticket.lastCommandId,
  'commandFingerprint': ticket.lastCommandFingerprint,
  'state': ticket.lines.any((line) => line.hasPreparationRoute)
      ? 'pending_local'
      : 'legacy_unrouted',
  'ticket': ticket.toJson(),
  'lines': [for (final line in lines) line.toJson()],
};

({
  CafeOrderTicket ticket,
  List<CafeKitchenDispatchLine> lines,
  int historyStartVersion,
})
cafeKitchenDispatchFromPayload(Object? value) {
  if (value is! Map || value['ticket'] == null || value['lines'] is! List) {
    _invalid('kitchen_dispatch_shape');
  }
  final ticket = CafeOrderTicket.fromJson(value['ticket']);
  final historyStartVersion = _integer(
    value['historyStartVersion'],
    'kitchen_history_start',
    1,
    ticket.version,
  );
  final ticketLines = {for (final line in ticket.lines) line.id: line};
  final seen = <String>{};
  final lines = <CafeKitchenDispatchLine>[];
  for (final raw in value['lines'] as List) {
    if (raw is! Map ||
        raw.length != 5 ||
        raw['state'] != 'pending_local' ||
        raw['sequence'] is! int ||
        (raw['sequence'] as int) < 1) {
      _invalid('kitchen_dispatch_line');
    }
    final lineId = _text(raw['lineId'], 'kitchen_line_id', 120);
    final source = ticketLines[lineId];
    final route = CafeKitchenDispatchLine(
      lineId: lineId,
      ticketId: _text(raw['ticketId'], 'kitchen_ticket_id', 120),
      sequence: raw['sequence'] as int,
      preparationStation: _text(
        raw['preparationStation'],
        'preparation_station',
        20,
      ),
    );
    if (source == null ||
        !source.hasPreparationRoute ||
        source.preparationStation != route.preparationStation ||
        route.ticketId != cafeKitchenTicketId(ticket.id, lineId) ||
        !seen.add(lineId)) {
      _invalid('kitchen_dispatch_line_mismatch');
    }
    lines.add(route);
  }
  final routed = ticket.lines.any((line) => line.hasPreparationRoute);
  if (value['state'] != (routed ? 'pending_local' : 'legacy_unrouted') ||
      lines.length != (routed ? ticket.lines.length : 0) ||
      lines.map((line) => line.sequence).toSet().length != lines.length ||
      jsonEncode(value) !=
          jsonEncode(
            cafeKitchenDispatchPayload(ticket, lines, historyStartVersion),
          )) {
    _invalid('kitchen_dispatch_mismatch');
  }
  return (
    ticket: ticket,
    lines: List.unmodifiable(lines),
    historyStartVersion: historyStartVersion,
  );
}

bool cafeKitchenDispatchHistoryValid(
  Iterable<
    ({
      CafeOrderTicket ticket,
      List<CafeKitchenDispatchLine> lines,
      int historyStartVersion,
    })
  >
  events,
  Iterable<CafeOrderTicket> currentTickets,
) {
  try {
    final currentById = {
      for (final ticket in currentTickets) ticket.id: ticket,
    };
    final byOrder =
        <
          String,
          List<
            ({
              CafeOrderTicket ticket,
              List<CafeKitchenDispatchLine> lines,
              int historyStartVersion,
            })
          >
        >{};
    for (final event in events) {
      if (!currentById.containsKey(event.ticket.id)) return false;
      byOrder.putIfAbsent(event.ticket.id, () => []).add(event);
    }
    for (final history in byOrder.values) {
      history.sort(
        (left, right) => left.ticket.version.compareTo(right.ticket.version),
      );
      final bindings = <String, CafeKitchenDispatchLine>{};
      var maximumSequence = 0;
      var priorVersion = 0;
      var historyStartVersion = 0;
      for (final event in history) {
        historyStartVersion = historyStartVersion == 0
            ? event.historyStartVersion
            : historyStartVersion;
        if (historyStartVersion != 1 ||
            event.historyStartVersion != historyStartVersion ||
            (priorVersion == 0
                ? event.ticket.version != historyStartVersion
                : event.ticket.version != priorVersion + 1)) {
          return false;
        }
        priorVersion = event.ticket.version;
        for (final line in event.lines) {
          final prior = bindings[line.lineId];
          if (prior == null) {
            if (line.sequence != maximumSequence + 1) return false;
            maximumSequence = line.sequence;
            bindings[line.lineId] = line;
          } else if (prior.ticketId != line.ticketId ||
              prior.sequence != line.sequence ||
              prior.preparationStation != line.preparationStation) {
            return false;
          }
        }
      }
      final current = currentById[history.first.ticket.id]!;
      if (priorVersion != current.version) {
        return false;
      }
    }
    for (final current in currentById.values) {
      if (current.lines.any((line) => line.hasPreparationRoute) &&
          !byOrder.containsKey(current.id)) {
        return false;
      }
    }
    return true;
  } on Object {
    return false;
  }
}

const cafeKitchenStatusContract = 'supermega.shop.cafe-kitchen-status.v1';
const cafeKitchenStatusEventType = 'shop.cafe_kitchen_status.changed.v1';
const cafeKitchenStates = <String>{
  'pending_local',
  'preparing_local',
  'ready_local',
  'served_local',
};

class CafeKitchenStatusEvent {
  const CafeKitchenStatusEvent({
    required this.operationId,
    required this.orderId,
    required this.ticketVersion,
    required this.ticketFingerprint,
    required this.lineId,
    required this.kitchenTicketId,
    required this.preparationStation,
    required this.sequence,
    required this.fromState,
    required this.toState,
    required this.createdAtMillis,
  });

  final String operationId;
  final String orderId;
  final int ticketVersion;
  final String ticketFingerprint;
  final String lineId;
  final String kitchenTicketId;
  final String preparationStation;
  final int sequence;
  final String fromState;
  final String toState;
  final int createdAtMillis;

  Map<String, Object> toJson() => {
    'contract': cafeKitchenStatusContract,
    'operationId': operationId,
    'orderId': orderId,
    'ticketVersion': ticketVersion,
    'ticketFingerprint': ticketFingerprint,
    'lineId': lineId,
    'kitchenTicketId': kitchenTicketId,
    'preparationStation': preparationStation,
    'sequence': sequence,
    'fromState': fromState,
    'toState': toState,
    'createdAtMillis': createdAtMillis,
  };

  factory CafeKitchenStatusEvent.fromJson(Object? value) {
    if (value is! Map ||
        value.length != 12 ||
        value.keys.toSet().difference({
          'contract',
          'operationId',
          'orderId',
          'ticketVersion',
          'ticketFingerprint',
          'lineId',
          'kitchenTicketId',
          'preparationStation',
          'sequence',
          'fromState',
          'toState',
          'createdAtMillis',
        }).isNotEmpty ||
        value['contract'] != cafeKitchenStatusContract) {
      _invalid('kitchen_status_shape');
    }
    final event = CafeKitchenStatusEvent(
      operationId: _text(value['operationId'], 'status_operation_id', 120),
      orderId: _text(value['orderId'], 'status_order_id', 120),
      ticketVersion: _integer(
        value['ticketVersion'],
        'status_ticket_version',
        1,
        1000000,
      ),
      ticketFingerprint: _text(
        value['ticketFingerprint'],
        'status_ticket_fingerprint',
        64,
      ),
      lineId: _text(value['lineId'], 'status_line_id', 120),
      kitchenTicketId: _text(
        value['kitchenTicketId'],
        'status_kitchen_ticket_id',
        120,
      ),
      preparationStation: _text(
        value['preparationStation'],
        'status_preparation_station',
        20,
      ),
      sequence: _integer(value['sequence'], 'status_sequence', 1, 1000000),
      fromState: _text(value['fromState'], 'status_from_state', 30),
      toState: _text(value['toState'], 'status_to_state', 30),
      createdAtMillis: _integer(
        value['createdAtMillis'],
        'status_created_at',
        1,
        9007199254740991,
      ),
    );
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(event.ticketFingerprint) ||
        !{'kitchen', 'bar'}.contains(event.preparationStation) ||
        !cafeKitchenStates.contains(event.fromState) ||
        !cafeKitchenStates.contains(event.toState) ||
        cafeKitchenNextState(event.fromState) != event.toState ||
        event.kitchenTicketId !=
            cafeKitchenTicketId(event.orderId, event.lineId) ||
        jsonEncode(value) != jsonEncode(event.toJson())) {
      _invalid('kitchen_status_mismatch');
    }
    return event;
  }
}

String? cafeKitchenNextState(String state) => switch (state) {
  'pending_local' => 'preparing_local',
  'preparing_local' => 'ready_local',
  'ready_local' => 'served_local',
  'served_local' => null,
  _ => throw FormatException('cafe_order_kitchen_status_state'),
};

int cafeKitchenNextSequence(String state) => switch (state) {
  'pending_local' => 1,
  'preparing_local' => 2,
  'ready_local' => 3,
  _ => throw FormatException('cafe_order_kitchen_status_sequence'),
};

bool cafeKitchenStatusHistoryValid(
  Iterable<CafeKitchenStatusEvent> events,
  Iterable<
    ({
      CafeOrderTicket ticket,
      List<CafeKitchenDispatchLine> lines,
      int historyStartVersion,
    })
  >
  dispatchHistory,
) {
  try {
    final dispatchByTicket = <String, CafeKitchenDispatchLine>{};
    final dispatchByOrderVersion =
        <String, Map<String, CafeKitchenDispatchLine>>{};
    final ticketsByOrder = <String, Map<int, CafeOrderTicket>>{};
    for (final dispatch in dispatchHistory) {
      ticketsByOrder.putIfAbsent(
        dispatch.ticket.id,
        () => {},
      )[dispatch.ticket.version] = dispatch.ticket;
      final versionDispatch = <String, CafeKitchenDispatchLine>{};
      for (final line in dispatch.lines) {
        final prior = dispatchByTicket[line.ticketId];
        if (prior != null &&
            (prior.lineId != line.lineId ||
                prior.preparationStation != line.preparationStation)) {
          return false;
        }
        dispatchByTicket[line.ticketId] = line;
        versionDispatch[line.ticketId] = line;
      }
      dispatchByOrderVersion['${dispatch.ticket.id}@${dispatch.ticket.version}'] =
          versionDispatch;
    }
    final byTicket = <String, List<CafeKitchenStatusEvent>>{};
    final operationIds = <String>{};
    for (final event in events) {
      if (!operationIds.add(event.operationId)) return false;
      final dispatch = dispatchByTicket[event.kitchenTicketId];
      final versionDispatch =
          dispatchByOrderVersion['${event.orderId}@${event.ticketVersion}']?[event
              .kitchenTicketId];
      final ticket = ticketsByOrder[event.orderId]?[event.ticketVersion];
      if (dispatch == null ||
          versionDispatch == null ||
          ticket == null ||
          dispatch.lineId != event.lineId ||
          dispatch.preparationStation != event.preparationStation ||
          ticket.lastCommandFingerprint != event.ticketFingerprint) {
        return false;
      }
      byTicket.putIfAbsent(event.kitchenTicketId, () => []).add(event);
    }
    for (final history in byTicket.values) {
      history.sort((left, right) => left.sequence.compareTo(right.sequence));
      var state = 'pending_local';
      for (var index = 0; index < history.length; index++) {
        final event = history[index];
        if (event.sequence != index + 1 ||
            event.fromState != state ||
            event.toState != cafeKitchenNextState(state)) {
          return false;
        }
        state = event.toState;
      }
    }
    return true;
  } on Object {
    return false;
  }
}

void _validateLines(
  List<CafeOrderLine> lines,
  Map<String, CafeModifierSnapshot> catalog, {
  bool allowUnknown = false,
}) {
  if (lines.isEmpty || lines.length > 100) _invalid('lines');
  final ids = <String>{};
  for (final line in lines) {
    if (!ids.add(line.id)) _invalid('duplicate_line_id');
    line.totalMmk();
    final modifierKeys = <String>{};
    for (final modifier in line.modifiers) {
      if (!modifierKeys.add(modifier.key)) _invalid('duplicate_modifier');
      if (!allowUnknown &&
          jsonEncode(catalog[modifier.key]?.toJson()) !=
              jsonEncode(modifier.toJson())) {
        _invalid('unknown_modifier');
      }
    }
  }
}

String cafeOrderStateFingerprint({
  required String operationId,
  required String orderId,
  required int expectedStateRevision,
  required String fromState,
  required String toState,
}) => sha256
    .convert(
      utf8.encode(
        jsonEncode({
          'contract': 'supermega.shop.cafe-order-state.v1',
          'operationId': operationId,
          'orderId': orderId,
          'expectedStateRevision': expectedStateRevision,
          'fromState': fromState,
          'toState': toState,
        }),
      ),
    )
    .toString();

String cafeOrderCashSaleFingerprint({
  required String operationId,
  required String orderId,
  required int ticketVersion,
  required int stateRevision,
  int? cashTenderedMmk,
}) => sha256
    .convert(
      utf8.encode(
        jsonEncode({
          'contract': 'supermega.shop.cafe-cash-sale.v1',
          'operationId': operationId,
          'orderId': orderId,
          'ticketVersion': ticketVersion,
          'stateRevision': stateRevision,
          'cashTenderedMmk': ?cashTenderedMmk,
        }),
      ),
    )
    .toString();

String cafeOrderCancellationFingerprint({
  required String operationId,
  required String orderId,
  required int ticketVersion,
  required String ticketFingerprint,
  required int stateRevision,
  required String fromState,
}) => sha256
    .convert(
      utf8.encode(
        jsonEncode({
          'contract': 'supermega.shop.cafe-order-cancellation.v1',
          'operationId': operationId,
          'orderId': orderId,
          'ticketVersion': ticketVersion,
          'ticketFingerprint': ticketFingerprint,
          'stateRevision': stateRevision,
          'fromState': fromState,
        }),
      ),
    )
    .toString();

Map<String, Object> cafeOrderCancellationPayload({
  required String operationId,
  required CafeOrderTicket ticket,
  required String fromState,
  required int stateRevision,
  required int createdAtMillis,
}) => {
  'contract': 'supermega.shop.cafe-order-cancelled.v1',
  'operationId': operationId,
  'orderId': ticket.id,
  'ticketVersion': ticket.version,
  'ticketFingerprint': ticket.lastCommandFingerprint,
  'fromState': fromState,
  'stateRevision': stateRevision,
  'createdAtMillis': createdAtMillis,
  'kitchenStopConfirmed': false,
};

const cafeOrderSplitContract = 'supermega.shop.cafe-order-split.v1';
const cafeOrderSplitEventType = 'shop.cafe_order.split.v1';
const cafeOrderQuantitySplitContract =
    'supermega.shop.cafe-order-quantity-split.v2';
const cafeOrderQuantitySplitEventType = 'shop.cafe_order.quantity-split.v2';

String cafeOrderSplitCommandId(
  String operationId,
  String side, {
  required int expectedStateRevision,
}) {
  if (!{'source', 'destination'}.contains(side) || expectedStateRevision < 0) {
    _invalid('split_command_side');
  }
  return 'cafe-split-$side-${sha256.convert(utf8.encode('$operationId\n$side\n$expectedStateRevision')).toString().substring(0, 40)}';
}

class CafeOrderSplitEvent {
  CafeOrderSplitEvent({
    required this.operationId,
    required this.sourceOrderId,
    required this.destinationOrderId,
    required this.expectedTicketVersion,
    required this.expectedStateRevision,
    required this.sourceBeforeTicket,
    required this.sourceResultTicket,
    required this.destinationResultTicket,
    List<String> movedLineIds = const [],
    Map<String, int> movedLineQuantities = const {},
    required List<String> sourceStateEventFingerprints,
    required this.createdAtMillis,
  }) : movedLineIds = List.unmodifiable(movedLineIds),
       movedLineQuantities = Map.unmodifiable(movedLineQuantities),
       sourceStateEventFingerprints = List.unmodifiable(
         sourceStateEventFingerprints,
       ) {
    _validate();
  }

  final String operationId;
  final String sourceOrderId;
  final String destinationOrderId;
  final int expectedTicketVersion;
  final int expectedStateRevision;
  final CafeOrderTicket sourceBeforeTicket;
  final CafeOrderTicket sourceResultTicket;
  final CafeOrderTicket destinationResultTicket;
  final List<String> movedLineIds;
  final Map<String, int> movedLineQuantities;
  final List<String> sourceStateEventFingerprints;
  final int createdAtMillis;

  bool get movesQuantities => movedLineQuantities.isNotEmpty;
  String get eventType => movesQuantities
      ? cafeOrderQuantitySplitEventType
      : cafeOrderSplitEventType;

  Map<String, Object> toJson() => {
    'contract': movesQuantities
        ? cafeOrderQuantitySplitContract
        : cafeOrderSplitContract,
    'operationId': operationId,
    'sourceOrderId': sourceOrderId,
    'destinationOrderId': destinationOrderId,
    'expectedTicketVersion': expectedTicketVersion,
    'expectedStateRevision': expectedStateRevision,
    'sourceBeforeTicket': sourceBeforeTicket.toJson(),
    'sourceResultTicket': sourceResultTicket.toJson(),
    'destinationResultTicket': destinationResultTicket.toJson(),
    if (movesQuantities)
      'movedLineQuantities': movedLineQuantities
    else
      'movedLineIds': movedLineIds,
    'sourceStateEventFingerprints': sourceStateEventFingerprints,
    'createdAtMillis': createdAtMillis,
  };

  factory CafeOrderSplitEvent.fromJson(Object? value) {
    final quantitySplit =
        value is Map && value['contract'] == cafeOrderQuantitySplitContract;
    if (value is! Map ||
        value.length != 12 ||
        value.keys.toSet().difference({
          'contract',
          'operationId',
          'sourceOrderId',
          'destinationOrderId',
          'expectedTicketVersion',
          'expectedStateRevision',
          'sourceBeforeTicket',
          'sourceResultTicket',
          'destinationResultTicket',
          quantitySplit ? 'movedLineQuantities' : 'movedLineIds',
          'sourceStateEventFingerprints',
          'createdAtMillis',
        }).isNotEmpty ||
        (!quantitySplit && value['contract'] != cafeOrderSplitContract) ||
        (quantitySplit
            ? value['movedLineQuantities'] is! Map
            : value['movedLineIds'] is! List) ||
        value['sourceStateEventFingerprints'] is! List) {
      _invalid('split_shape');
    }
    final event = CafeOrderSplitEvent(
      operationId: _text(value['operationId'], 'split_operation_id', 120),
      sourceOrderId: _text(value['sourceOrderId'], 'split_source_id', 120),
      destinationOrderId: _text(
        value['destinationOrderId'],
        'split_destination_id',
        120,
      ),
      expectedTicketVersion: _integer(
        value['expectedTicketVersion'],
        'split_ticket_version',
        1,
        1000000,
      ),
      expectedStateRevision: _integer(
        value['expectedStateRevision'],
        'split_state_revision',
        0,
        1000000,
      ),
      sourceBeforeTicket: CafeOrderTicket.fromJson(value['sourceBeforeTicket']),
      sourceResultTicket: CafeOrderTicket.fromJson(value['sourceResultTicket']),
      destinationResultTicket: CafeOrderTicket.fromJson(
        value['destinationResultTicket'],
      ),
      movedLineIds: quantitySplit
          ? const []
          : [
              for (final id in value['movedLineIds'] as List)
                _text(id, 'split_line_id', 120),
            ],
      movedLineQuantities: quantitySplit
          ? {
              for (final entry in (value['movedLineQuantities'] as Map).entries)
                _text(entry.key, 'split_line_id', 120): _integer(
                  entry.value,
                  'split_line_quantity',
                  1,
                  1000,
                ),
            }
          : const {},
      sourceStateEventFingerprints: [
        for (final fingerprint in value['sourceStateEventFingerprints'] as List)
          _text(fingerprint, 'split_state_fingerprint', 64),
      ],
      createdAtMillis: _integer(
        value['createdAtMillis'],
        'split_created_at',
        1,
        9007199254740991,
      ),
    );
    if (jsonEncode(value) != jsonEncode(event.toJson())) {
      _invalid('split_canonical');
    }
    return event;
  }

  void _validate() {
    _text(operationId, 'split_operation_id', 120);
    _text(sourceOrderId, 'split_source_id', 120);
    _text(destinationOrderId, 'split_destination_id', 120);
    if (sourceOrderId == destinationOrderId ||
        expectedTicketVersion < 1 ||
        expectedStateRevision < 0 ||
        createdAtMillis < 1 ||
        sourceBeforeTicket.id != sourceOrderId ||
        sourceBeforeTicket.version != expectedTicketVersion ||
        sourceResultTicket.id != sourceOrderId ||
        sourceResultTicket.version != expectedTicketVersion + 1 ||
        sourceResultTicket.lastCommandId !=
            cafeOrderSplitCommandId(
              operationId,
              'source',
              expectedStateRevision: expectedStateRevision,
            ) ||
        destinationResultTicket.id != destinationOrderId ||
        destinationResultTicket.version != 1 ||
        destinationResultTicket.lastCommandId !=
            cafeOrderSplitCommandId(
              operationId,
              'destination',
              expectedStateRevision: expectedStateRevision,
            ) ||
        jsonEncode(sourceBeforeTicket.serviceContext?.toJson()) !=
            jsonEncode(sourceResultTicket.serviceContext?.toJson()) ||
        jsonEncode(sourceBeforeTicket.serviceContext?.toJson()) !=
            jsonEncode(destinationResultTicket.serviceContext?.toJson()) ||
        sourceBeforeTicket.lines.any((line) => line.hasPreparationRoute) ||
        sourceResultTicket.lines.any((line) => line.hasPreparationRoute) ||
        destinationResultTicket.lines.any((line) => line.hasPreparationRoute)) {
      _invalid('split_binding');
    }
    if (sourceStateEventFingerprints.length != expectedStateRevision ||
        sourceStateEventFingerprints.any(
          (fingerprint) => !RegExp(r'^[0-9a-f]{64}$').hasMatch(fingerprint),
        )) {
      _invalid('split_state_history');
    }
    final before = {for (final line in sourceBeforeTicket.lines) line.id: line};
    late final List<Map<String, Object>> expectedSource;
    late final List<Map<String, Object>> expectedDestination;
    if (movesQuantities) {
      if (movedLineIds.isNotEmpty ||
          movedLineQuantities.keys.any((id) => !before.containsKey(id)) ||
          movedLineQuantities.keys.toList().join('\n') !=
              sourceBeforeTicket.lines
                  .where((line) => movedLineQuantities.containsKey(line.id))
                  .map((line) => line.id)
                  .join('\n')) {
        _invalid('split_quantities');
      }
      var movedUnits = 0;
      var sourceUnits = 0;
      for (final line in sourceBeforeTicket.lines) {
        sourceUnits += line.quantity;
        final moved = movedLineQuantities[line.id] ?? 0;
        if (movedLineQuantities.containsKey(line.id) &&
            (moved < 1 || moved > line.quantity)) {
          _invalid('split_quantities');
        }
        movedUnits += moved;
      }
      if (movedUnits < 1 || movedUnits >= sourceUnits) {
        _invalid('split_quantities');
      }
      expectedSource = [
        for (final line in sourceBeforeTicket.lines)
          if ((movedLineQuantities[line.id] ?? 0) < line.quantity)
            line
                .copyWithQuantity(
                  line.quantity - (movedLineQuantities[line.id] ?? 0),
                )
                .toJson(),
      ];
      expectedDestination = [
        for (final line in sourceBeforeTicket.lines)
          if ((movedLineQuantities[line.id] ?? 0) > 0)
            line.copyWithQuantity(movedLineQuantities[line.id]!).toJson(),
      ];
    } else {
      final moved = movedLineIds.toSet();
      if (movedLineQuantities.isNotEmpty ||
          moved.isEmpty ||
          moved.length != movedLineIds.length ||
          moved.length >= before.length ||
          !before.keys.toSet().containsAll(moved)) {
        _invalid('split_lines');
      }
      expectedSource = [
        for (final line in sourceBeforeTicket.lines)
          if (!moved.contains(line.id)) line.toJson(),
      ];
      expectedDestination = [
        for (final line in sourceBeforeTicket.lines)
          if (moved.contains(line.id)) line.toJson(),
      ];
    }
    if (jsonEncode(
              sourceResultTicket.lines.map((line) => line.toJson()).toList(),
            ) !=
            jsonEncode(expectedSource) ||
        jsonEncode(
              destinationResultTicket.lines
                  .map((line) => line.toJson())
                  .toList(),
            ) !=
            jsonEncode(expectedDestination)) {
      _invalid('split_partition');
    }
  }
}

bool cafeOrderSplitHistoryValid(
  Iterable<CafeOrderSplitEvent> events,
  Iterable<CafeOrderTicket> dispatchTickets,
) {
  final dispatchKeys = <String>{};
  final derivedSplitKeys = <String>{};
  final derivedCommand = RegExp(
    r'^cafe-split-(?:source|destination)-[0-9a-f]{40}$',
  );
  String key(CafeOrderTicket ticket) =>
      '${ticket.id}@${ticket.version}@${ticket.lastCommandFingerprint}';
  for (final ticket in dispatchTickets) {
    final ticketKey = key(ticket);
    if (!dispatchKeys.add(ticketKey)) return false;
    if (derivedCommand.hasMatch(ticket.lastCommandId)) {
      derivedSplitKeys.add(ticketKey);
    }
  }
  final boundSplitKeys = <String>{};
  final operations = <String>{};
  for (final event in events) {
    if (!operations.add(event.operationId)) return false;
    final beforeKey = key(event.sourceBeforeTicket);
    final sourceKey = key(event.sourceResultTicket);
    final destinationKey = key(event.destinationResultTicket);
    if (!dispatchKeys.contains(beforeKey) ||
        !dispatchKeys.contains(sourceKey) ||
        !dispatchKeys.contains(destinationKey) ||
        !boundSplitKeys.add(sourceKey) ||
        !boundSplitKeys.add(destinationKey)) {
      return false;
    }
  }
  return boundSplitKeys.length == derivedSplitKeys.length &&
      boundSplitKeys.containsAll(derivedSplitKeys);
}

const cafeOrderSplitReversalContract =
    'supermega.shop.cafe-order-split-reversal.v1';
const cafeOrderSplitReversalEventType = 'shop.cafe_order.split-reversed.v1';

String cafeOrderSplitReversalCommandId(
  String operationId,
  String side, {
  required int expectedSourceStateRevision,
  required int expectedDestinationStateRevision,
}) {
  if (!{'source', 'destination-cancel'}.contains(side) ||
      expectedSourceStateRevision < 0 ||
      expectedDestinationStateRevision < 0) {
    _invalid('split_reversal_command_side');
  }
  final digest = sha256
      .convert(
        utf8.encode(
          '$operationId\n$side\n$expectedSourceStateRevision\n'
          '$expectedDestinationStateRevision',
        ),
      )
      .toString()
      .substring(0, 40);
  return 'cafe-unsplit-$side-$digest';
}

class CafeOrderSplitReversalEvent {
  CafeOrderSplitReversalEvent({
    required this.operationId,
    required this.splitOperationId,
    required this.sourceOrderId,
    required this.destinationOrderId,
    required this.expectedSourceTicketVersion,
    required this.expectedSourceStateRevision,
    required this.expectedDestinationTicketVersion,
    required this.expectedDestinationStateRevision,
    required this.splitEvent,
    required this.restoredSourceTicket,
    required this.destinationCancellationOperationId,
    required this.destinationCancellationFingerprint,
    required this.createdAtMillis,
  }) {
    _validate();
  }

  final String operationId;
  final String splitOperationId;
  final String sourceOrderId;
  final String destinationOrderId;
  final int expectedSourceTicketVersion;
  final int expectedSourceStateRevision;
  final int expectedDestinationTicketVersion;
  final int expectedDestinationStateRevision;
  final CafeOrderSplitEvent splitEvent;
  final CafeOrderTicket restoredSourceTicket;
  final String destinationCancellationOperationId;
  final String destinationCancellationFingerprint;
  final int createdAtMillis;

  String get eventType => cafeOrderSplitReversalEventType;

  Map<String, Object> toJson() => {
    'contract': cafeOrderSplitReversalContract,
    'operationId': operationId,
    'splitOperationId': splitOperationId,
    'sourceOrderId': sourceOrderId,
    'destinationOrderId': destinationOrderId,
    'expectedSourceTicketVersion': expectedSourceTicketVersion,
    'expectedSourceStateRevision': expectedSourceStateRevision,
    'expectedDestinationTicketVersion': expectedDestinationTicketVersion,
    'expectedDestinationStateRevision': expectedDestinationStateRevision,
    'splitEvent': splitEvent.toJson(),
    'restoredSourceTicket': restoredSourceTicket.toJson(),
    'destinationCancellationOperationId': destinationCancellationOperationId,
    'destinationCancellationFingerprint': destinationCancellationFingerprint,
    'createdAtMillis': createdAtMillis,
  };

  factory CafeOrderSplitReversalEvent.fromJson(Object? value) {
    if (value is! Map ||
        value.length != 14 ||
        value.keys.toSet().difference({
          'contract',
          'operationId',
          'splitOperationId',
          'sourceOrderId',
          'destinationOrderId',
          'expectedSourceTicketVersion',
          'expectedSourceStateRevision',
          'expectedDestinationTicketVersion',
          'expectedDestinationStateRevision',
          'splitEvent',
          'restoredSourceTicket',
          'destinationCancellationOperationId',
          'destinationCancellationFingerprint',
          'createdAtMillis',
        }).isNotEmpty ||
        value['contract'] != cafeOrderSplitReversalContract) {
      _invalid('split_reversal_shape');
    }
    final event = CafeOrderSplitReversalEvent(
      operationId: _text(
        value['operationId'],
        'split_reversal_operation_id',
        120,
      ),
      splitOperationId: _text(
        value['splitOperationId'],
        'split_reversal_split_id',
        120,
      ),
      sourceOrderId: _text(
        value['sourceOrderId'],
        'split_reversal_source_id',
        120,
      ),
      destinationOrderId: _text(
        value['destinationOrderId'],
        'split_reversal_destination_id',
        120,
      ),
      expectedSourceTicketVersion: _integer(
        value['expectedSourceTicketVersion'],
        'split_reversal_source_version',
        1,
        1000000,
      ),
      expectedSourceStateRevision: _integer(
        value['expectedSourceStateRevision'],
        'split_reversal_source_revision',
        0,
        1000000,
      ),
      expectedDestinationTicketVersion: _integer(
        value['expectedDestinationTicketVersion'],
        'split_reversal_destination_version',
        1,
        1000000,
      ),
      expectedDestinationStateRevision: _integer(
        value['expectedDestinationStateRevision'],
        'split_reversal_destination_revision',
        0,
        1000000,
      ),
      splitEvent: CafeOrderSplitEvent.fromJson(value['splitEvent']),
      restoredSourceTicket: CafeOrderTicket.fromJson(
        value['restoredSourceTicket'],
      ),
      destinationCancellationOperationId: _text(
        value['destinationCancellationOperationId'],
        'split_reversal_cancellation_id',
        120,
      ),
      destinationCancellationFingerprint: _text(
        value['destinationCancellationFingerprint'],
        'split_reversal_cancellation_fingerprint',
        64,
      ),
      createdAtMillis: _integer(
        value['createdAtMillis'],
        'split_reversal_created_at',
        1,
        9007199254740991,
      ),
    );
    if (jsonEncode(value) != jsonEncode(event.toJson())) {
      _invalid('split_reversal_canonical');
    }
    return event;
  }

  void _validate() {
    _text(operationId, 'split_reversal_operation_id', 120);
    _text(splitOperationId, 'split_reversal_split_id', 120);
    _text(sourceOrderId, 'split_reversal_source_id', 120);
    _text(destinationOrderId, 'split_reversal_destination_id', 120);
    final sourceCommandId = cafeOrderSplitReversalCommandId(
      operationId,
      'source',
      expectedSourceStateRevision: expectedSourceStateRevision,
      expectedDestinationStateRevision: expectedDestinationStateRevision,
    );
    final cancellationId = cafeOrderSplitReversalCommandId(
      operationId,
      'destination-cancel',
      expectedSourceStateRevision: expectedSourceStateRevision,
      expectedDestinationStateRevision: expectedDestinationStateRevision,
    );
    final expectedCancellationFingerprint = cafeOrderCancellationFingerprint(
      operationId: cancellationId,
      orderId: destinationOrderId,
      ticketVersion: expectedDestinationTicketVersion,
      ticketFingerprint:
          splitEvent.destinationResultTicket.lastCommandFingerprint,
      stateRevision: expectedDestinationStateRevision,
      fromState: 'open',
    );
    if (splitOperationId != splitEvent.operationId ||
        sourceOrderId != splitEvent.sourceOrderId ||
        destinationOrderId != splitEvent.destinationOrderId ||
        sourceOrderId == destinationOrderId ||
        expectedSourceTicketVersion != splitEvent.sourceResultTicket.version ||
        expectedSourceStateRevision != splitEvent.expectedStateRevision ||
        expectedDestinationTicketVersion !=
            splitEvent.destinationResultTicket.version ||
        expectedDestinationStateRevision != 0 ||
        restoredSourceTicket.id != sourceOrderId ||
        restoredSourceTicket.version != expectedSourceTicketVersion + 1 ||
        restoredSourceTicket.lastCommandId != sourceCommandId ||
        jsonEncode(
              restoredSourceTicket.lines.map((e) => e.toJson()).toList(),
            ) !=
            jsonEncode(
              splitEvent.sourceBeforeTicket.lines
                  .map((e) => e.toJson())
                  .toList(),
            ) ||
        jsonEncode(restoredSourceTicket.serviceContext?.toJson()) !=
            jsonEncode(
              splitEvent.sourceBeforeTicket.serviceContext?.toJson(),
            ) ||
        destinationCancellationOperationId != cancellationId ||
        destinationCancellationFingerprint != expectedCancellationFingerprint ||
        createdAtMillis < 1) {
      _invalid('split_reversal_binding');
    }
  }
}

bool cafeOrderSplitReversalHistoryValid(
  Iterable<CafeOrderSplitReversalEvent> reversals,
  Iterable<CafeOrderSplitEvent> splits,
  Iterable<CafeOrderTicket> dispatchTickets,
) {
  final splitsByOperation = <String, CafeOrderSplitEvent>{};
  for (final split in splits) {
    if (splitsByOperation.containsKey(split.operationId)) return false;
    splitsByOperation[split.operationId] = split;
  }
  String key(CafeOrderTicket ticket) =>
      '${ticket.id}@${ticket.version}@${ticket.lastCommandFingerprint}';
  final dispatchKeys = <String>{};
  final derivedKeys = <String>{};
  final derivedCommand = RegExp(r'^cafe-unsplit-source-[0-9a-f]{40}$');
  for (final ticket in dispatchTickets) {
    final ticketKey = key(ticket);
    if (!dispatchKeys.add(ticketKey)) return false;
    if (derivedCommand.hasMatch(ticket.lastCommandId)) {
      derivedKeys.add(ticketKey);
    }
  }
  final operations = <String>{};
  final reversedSplits = <String>{};
  final boundKeys = <String>{};
  for (final reversal in reversals) {
    final split = splitsByOperation[reversal.splitOperationId];
    if (!operations.add(reversal.operationId) ||
        !reversedSplits.add(reversal.splitOperationId) ||
        split == null ||
        jsonEncode(split.toJson()) !=
            jsonEncode(reversal.splitEvent.toJson()) ||
        !dispatchKeys.contains(key(reversal.restoredSourceTicket)) ||
        !boundKeys.add(key(reversal.restoredSourceTicket))) {
      return false;
    }
  }
  return boundKeys.length == derivedKeys.length &&
      boundKeys.containsAll(derivedKeys);
}
