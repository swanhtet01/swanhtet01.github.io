import 'shop_connected_site_contracts.dart';
import 'shop_staff_authorization.dart';

const connectedStockReservationSchemaVersion = 1;

Never _invalid(String reason) =>
    throw FormatException('connected_stock_reservation_$reason');

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

String _id(Object? value, String field) {
  final result = _text(value, field, max: 128);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(result)) {
    _invalid(field);
  }
  return result;
}

String _digest(Object? value, String field) {
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
  final result = _text(value, field, max: 32);
  final parsed = DateTime.tryParse(result);
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')
          .hasMatch(result) ||
      parsed == null ||
      !parsed.isUtc ||
      parsed.toUtc().toIso8601String() != result) {
    _invalid(field);
  }
  return result;
}

Map<String, Object?> _shape(Object? value, String field, Set<String> required) {
  if (value is! Map) _invalid('${field}_shape');
  final result = <String, Object?>{};
  for (final entry in value.entries) {
    if (entry.key is! String) _invalid('${field}_shape');
    result[entry.key as String] = entry.value;
  }
  if (result.length != required.length ||
      !result.keys.toSet().containsAll(required)) {
    _invalid('${field}_shape');
  }
  return result;
}

T _enumByName<T extends Enum>(Object? value, String field, List<T> values) {
  final name = _id(value, field);
  return values.where((item) => item.name == name).firstOrNull ??
      _invalid(field);
}

enum ConnectedStockReservationState { held, released, expired, committed }

enum ConnectedStockWorkflowType { retailCart, cafeOrder }

class ConnectedStockReservationLineV1 {
  ConnectedStockReservationLineV1({
    required String productId,
    required int quantity,
  }) : productId = _id(productId, 'line_product'),
       quantity = _integer(quantity, 'line_quantity', min: 1, max: 1000);

  final String productId;
  final int quantity;

  Map<String, Object> toJson() => {
    'productId': productId,
    'quantity': quantity,
  };

  factory ConnectedStockReservationLineV1.fromJson(Object? value) {
    final json = _shape(value, 'line', {'productId', 'quantity'});
    return ConnectedStockReservationLineV1(
      productId: json['productId'] as dynamic,
      quantity: json['quantity'] as dynamic,
    );
  }
}

ShopStaffCapability _reservationCapability(Object? value) {
  final capability = _enumByName(
    value,
    'capability',
    ShopStaffCapability.values,
  );
  if (!const {
    ShopStaffCapability.counterSale,
    ShopStaffCapability.cafeOrderWrite,
  }.contains(capability)) {
    _invalid('capability');
  }
  return capability;
}

class ConnectedStockReservationV1 {
  factory ConnectedStockReservationV1.held({
    required String reservationId,
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required ConnectedStockWorkflowType workflowType,
    required String subjectId,
    required ShopStaffCapability capability,
    required List<ConnectedStockReservationLineV1> lines,
    required String issuedAt,
    required String expiresAt,
  }) {
    final basket = <String, Object>{
      'schemaVersion': connectedStockReservationSchemaVersion,
      'lines': lines.map((line) => line.toJson()).toList(growable: false),
    };
    final unsigned = <String, Object>{
      'schemaVersion': connectedStockReservationSchemaVersion,
      'reservationId': reservationId,
      'workspaceId': workspaceId,
      'siteId': siteId,
      'actorId': actorId,
      'deviceId': deviceId,
      'workflowType': workflowType.name,
      'subjectId': subjectId,
      'capability': capability.name,
      'lines': lines.map((line) => line.toJson()).toList(growable: false),
      'basketDigest': connectedSiteSha256(basket),
      'issuedAt': issuedAt,
      'expiresAt': expiresAt,
      'state': ConnectedStockReservationState.held.name,
      'stateVersion': 1,
    };
    return ConnectedStockReservationV1.fromJson({
      ...unsigned,
      'reservationDigest': connectedSiteSha256(unsigned),
    });
  }

  ConnectedStockReservationV1({
    required String reservationId,
    required String workspaceId,
    required String siteId,
    required String actorId,
    required String deviceId,
    required this.workflowType,
    required String subjectId,
    required ShopStaffCapability capability,
    required List<ConnectedStockReservationLineV1> lines,
    required String basketDigest,
    required String issuedAt,
    required String expiresAt,
    required this.state,
    required int stateVersion,
    required String reservationDigest,
  }) : reservationId = _id(reservationId, 'reservation_id'),
       workspaceId = _id(workspaceId, 'workspace'),
       siteId = _id(siteId, 'site'),
       actorId = _id(actorId, 'actor'),
       deviceId = _id(deviceId, 'device'),
       subjectId = _id(subjectId, 'subject'),
       capability = _reservationCapability(capability.name),
       lines = List.unmodifiable(lines),
       basketDigest = _digest(basketDigest, 'basket_digest'),
       issuedAt = _timestamp(issuedAt, 'issued_at'),
       expiresAt = _timestamp(expiresAt, 'expires_at'),
       stateVersion = _integer(stateVersion, 'state_version', min: 1),
       reservationDigest = _digest(reservationDigest, 'reservation_digest') {
    if ((workflowType == ConnectedStockWorkflowType.retailCart &&
            this.capability != ShopStaffCapability.counterSale) ||
        (workflowType == ConnectedStockWorkflowType.cafeOrder &&
            this.capability != ShopStaffCapability.cafeOrderWrite)) {
      _invalid('workflow_capability');
    }
    if (this.lines.isEmpty || this.lines.length > 100) _invalid('lines');
    final productIds = this.lines.map((line) => line.productId).toList();
    if (productIds.toSet().length != productIds.length) {
      _invalid('duplicate_product');
    }
    final sortedIds = [...productIds]..sort();
    if (canonicalConnectedSiteJson(sortedIds) !=
        canonicalConnectedSiteJson(productIds)) {
      _invalid('line_order');
    }
    final issued = DateTime.parse(this.issuedAt);
    final expires = DateTime.parse(this.expiresAt);
    if (!expires.isAfter(issued) ||
        expires.difference(issued) > const Duration(hours: 24)) {
      _invalid('time_window');
    }
    if (connectedSiteSha256(basketPayload) != this.basketDigest) {
      _invalid('basket_digest_mismatch');
    }
    if (connectedSiteSha256(unsignedPayload) != this.reservationDigest) {
      _invalid('reservation_digest_mismatch');
    }
  }

  final String reservationId;
  final String workspaceId;
  final String siteId;
  final String actorId;
  final String deviceId;
  final ConnectedStockWorkflowType workflowType;
  final String subjectId;
  final ShopStaffCapability capability;
  final List<ConnectedStockReservationLineV1> lines;
  final String basketDigest;
  final String issuedAt;
  final String expiresAt;
  final ConnectedStockReservationState state;
  final int stateVersion;
  final String reservationDigest;

  Map<String, Object> get basketPayload => {
    'schemaVersion': connectedStockReservationSchemaVersion,
    'lines': lines.map((line) => line.toJson()).toList(growable: false),
  };

  Map<String, Object> get unsignedPayload => {
    'schemaVersion': connectedStockReservationSchemaVersion,
    'reservationId': reservationId,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'actorId': actorId,
    'deviceId': deviceId,
    'workflowType': workflowType.name,
    'subjectId': subjectId,
    'capability': capability.name,
    'lines': lines.map((line) => line.toJson()).toList(growable: false),
    'basketDigest': basketDigest,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
    'state': state.name,
    'stateVersion': stateVersion,
  };

  Map<String, Object> toJson() => {
    ...unsignedPayload,
    'reservationDigest': reservationDigest,
  };

  factory ConnectedStockReservationV1.fromJson(Object? value) {
    final json = _shape(value, 'reservation', {
      'schemaVersion',
      'reservationId',
      'workspaceId',
      'siteId',
      'actorId',
      'deviceId',
      'workflowType',
      'subjectId',
      'capability',
      'lines',
      'basketDigest',
      'issuedAt',
      'expiresAt',
      'state',
      'stateVersion',
      'reservationDigest',
    });
    if (json['schemaVersion'] != connectedStockReservationSchemaVersion ||
        json['lines'] is! List) {
      _invalid('schema_version_or_lines');
    }
    return ConnectedStockReservationV1(
      reservationId: json['reservationId'] as dynamic,
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      actorId: json['actorId'] as dynamic,
      deviceId: json['deviceId'] as dynamic,
      workflowType: _enumByName(
        json['workflowType'],
        'workflow_type',
        ConnectedStockWorkflowType.values,
      ),
      subjectId: json['subjectId'] as dynamic,
      capability: _reservationCapability(json['capability']),
      lines: (json['lines'] as List)
          .map(ConnectedStockReservationLineV1.fromJson)
          .toList(growable: false),
      basketDigest: json['basketDigest'] as dynamic,
      issuedAt: json['issuedAt'] as dynamic,
      expiresAt: json['expiresAt'] as dynamic,
      state: _enumByName(
        json['state'],
        'state',
        ConnectedStockReservationState.values,
      ),
      stateVersion: json['stateVersion'] as dynamic,
      reservationDigest: json['reservationDigest'] as dynamic,
    );
  }
}

class ConnectedStockSaleBindingV1 {
  factory ConnectedStockSaleBindingV1.create({
    required ConnectedStockReservationV1 reservation,
    required String saleId,
    required String saleCommandId,
    required String saleCommandDigest,
    required String committedAt,
  }) {
    final unsigned = <String, Object>{
      'schemaVersion': connectedStockReservationSchemaVersion,
      'workspaceId': reservation.workspaceId,
      'siteId': reservation.siteId,
      'reservationId': reservation.reservationId,
      'reservationDigest': reservation.reservationDigest,
      'basketDigest': reservation.basketDigest,
      'workflowType': reservation.workflowType.name,
      'subjectId': reservation.subjectId,
      'saleId': saleId,
      'saleCommandId': saleCommandId,
      'saleCommandDigest': saleCommandDigest,
      'committedAt': committedAt,
    };
    return ConnectedStockSaleBindingV1.fromJson({
      ...unsigned,
      'bindingDigest': connectedSiteSha256(unsigned),
    });
  }

  ConnectedStockSaleBindingV1({
    required String workspaceId,
    required String siteId,
    required String reservationId,
    required String reservationDigest,
    required String basketDigest,
    required this.workflowType,
    required String subjectId,
    required String saleId,
    required String saleCommandId,
    required String saleCommandDigest,
    required String committedAt,
    required String bindingDigest,
  }) : workspaceId = _id(workspaceId, 'binding_workspace'),
       siteId = _id(siteId, 'binding_site'),
       reservationId = _id(reservationId, 'binding_reservation'),
       reservationDigest = _digest(
         reservationDigest,
         'binding_reservation_digest',
       ),
       basketDigest = _digest(basketDigest, 'binding_basket_digest'),
       subjectId = _id(subjectId, 'binding_subject'),
       saleId = _id(saleId, 'binding_sale'),
       saleCommandId = _id(saleCommandId, 'binding_command'),
       saleCommandDigest = _digest(saleCommandDigest, 'binding_command_digest'),
       committedAt = _timestamp(committedAt, 'binding_committed_at'),
       bindingDigest = _digest(bindingDigest, 'binding_digest') {
    if (connectedSiteSha256(unsignedPayload) != this.bindingDigest) {
      _invalid('binding_digest_mismatch');
    }
  }

  final String workspaceId;
  final String siteId;
  final String reservationId;
  final String reservationDigest;
  final String basketDigest;
  final ConnectedStockWorkflowType workflowType;
  final String subjectId;
  final String saleId;
  final String saleCommandId;
  final String saleCommandDigest;
  final String committedAt;
  final String bindingDigest;

  Map<String, Object> get unsignedPayload => {
    'schemaVersion': connectedStockReservationSchemaVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'reservationId': reservationId,
    'reservationDigest': reservationDigest,
    'basketDigest': basketDigest,
    'workflowType': workflowType.name,
    'subjectId': subjectId,
    'saleId': saleId,
    'saleCommandId': saleCommandId,
    'saleCommandDigest': saleCommandDigest,
    'committedAt': committedAt,
  };

  Map<String, Object> toJson() => {
    ...unsignedPayload,
    'bindingDigest': bindingDigest,
  };

  factory ConnectedStockSaleBindingV1.fromJson(Object? value) {
    final json = _shape(value, 'binding', {
      'schemaVersion',
      'workspaceId',
      'siteId',
      'reservationId',
      'reservationDigest',
      'basketDigest',
      'workflowType',
      'subjectId',
      'saleId',
      'saleCommandId',
      'saleCommandDigest',
      'committedAt',
      'bindingDigest',
    });
    if (json['schemaVersion'] != connectedStockReservationSchemaVersion) {
      _invalid('schema_version');
    }
    return ConnectedStockSaleBindingV1(
      workspaceId: json['workspaceId'] as dynamic,
      siteId: json['siteId'] as dynamic,
      reservationId: json['reservationId'] as dynamic,
      reservationDigest: json['reservationDigest'] as dynamic,
      basketDigest: json['basketDigest'] as dynamic,
      workflowType: _enumByName(
        json['workflowType'],
        'binding_workflow_type',
        ConnectedStockWorkflowType.values,
      ),
      subjectId: json['subjectId'] as dynamic,
      saleId: json['saleId'] as dynamic,
      saleCommandId: json['saleCommandId'] as dynamic,
      saleCommandDigest: json['saleCommandDigest'] as dynamic,
      committedAt: json['committedAt'] as dynamic,
      bindingDigest: json['bindingDigest'] as dynamic,
    );
  }
}

class ConnectedStockReservationTransitionV1 {
  ConnectedStockReservationTransitionV1({
    required this.before,
    required this.after,
    required String transitionedAt,
    required String reason,
    required this.saleBinding,
    required String transitionDigest,
  }) : transitionedAt = _timestamp(transitionedAt, 'transitioned_at'),
       reason = _id(reason, 'transition_reason'),
       transitionDigest = _digest(transitionDigest, 'transition_digest') {
    _validateTransitionSemantics(
      before: before,
      after: after,
      transitionedAt: this.transitionedAt,
      saleBinding: saleBinding,
    );
    if (connectedSiteSha256(unsignedPayload) != this.transitionDigest) {
      _invalid('transition_digest_mismatch');
    }
  }

  final ConnectedStockReservationV1 before;
  final ConnectedStockReservationV1 after;
  final String transitionedAt;
  final String reason;
  final ConnectedStockSaleBindingV1? saleBinding;
  final String transitionDigest;

  Map<String, Object?> get unsignedPayload => {
    'schemaVersion': connectedStockReservationSchemaVersion,
    'beforeDigest': before.reservationDigest,
    'afterDigest': after.reservationDigest,
    'fromState': before.state.name,
    'toState': after.state.name,
    'transitionedAt': transitionedAt,
    'reason': reason,
    'saleBindingDigest': saleBinding?.bindingDigest,
  };

  Map<String, Object?> toJson() => {
    'schemaVersion': connectedStockReservationSchemaVersion,
    'before': before.toJson(),
    'after': after.toJson(),
    'transitionedAt': transitionedAt,
    'reason': reason,
    'saleBinding': saleBinding?.toJson(),
    'transitionDigest': transitionDigest,
  };

  factory ConnectedStockReservationTransitionV1.fromJson(Object? value) {
    final json = _shape(value, 'transition', {
      'schemaVersion',
      'before',
      'after',
      'transitionedAt',
      'reason',
      'saleBinding',
      'transitionDigest',
    });
    if (json['schemaVersion'] != connectedStockReservationSchemaVersion) {
      _invalid('schema_version');
    }
    return ConnectedStockReservationTransitionV1(
      before: ConnectedStockReservationV1.fromJson(json['before']),
      after: ConnectedStockReservationV1.fromJson(json['after']),
      transitionedAt: json['transitionedAt'] as dynamic,
      reason: json['reason'] as dynamic,
      saleBinding: json['saleBinding'] == null
          ? null
          : ConnectedStockSaleBindingV1.fromJson(json['saleBinding']),
      transitionDigest: json['transitionDigest'] as dynamic,
    );
  }
}

void _validateTransitionSemantics({
  required ConnectedStockReservationV1 before,
  required ConnectedStockReservationV1 after,
  required String transitionedAt,
  required ConnectedStockSaleBindingV1? saleBinding,
}) {
  if (before.state != ConnectedStockReservationState.held ||
      after.state == ConnectedStockReservationState.held ||
      after.stateVersion != before.stateVersion + 1 ||
      before.reservationId != after.reservationId ||
      before.workspaceId != after.workspaceId ||
      before.siteId != after.siteId ||
      before.actorId != after.actorId ||
      before.deviceId != after.deviceId ||
      before.workflowType != after.workflowType ||
      before.subjectId != after.subjectId ||
      before.capability != after.capability ||
      before.basketDigest != after.basketDigest ||
      before.issuedAt != after.issuedAt ||
      before.expiresAt != after.expiresAt ||
      canonicalConnectedSiteJson(before.basketPayload) !=
          canonicalConnectedSiteJson(after.basketPayload)) {
    _invalid('transition_continuity');
  }
  final instant = DateTime.parse(transitionedAt);
  final issued = DateTime.parse(before.issuedAt);
  final expires = DateTime.parse(before.expiresAt);
  if (instant.isBefore(issued)) _invalid('transition_before_issue');
  if (after.state == ConnectedStockReservationState.expired &&
      instant.isBefore(expires)) {
    _invalid('expiry_too_early');
  }
  if (after.state == ConnectedStockReservationState.committed) {
    if (saleBinding == null || !instant.isBefore(expires)) {
      _invalid('commit_binding_or_expiry');
    }
    if (saleBinding.workspaceId != before.workspaceId ||
        saleBinding.siteId != before.siteId ||
        saleBinding.reservationId != before.reservationId ||
        saleBinding.reservationDigest != before.reservationDigest ||
        saleBinding.basketDigest != before.basketDigest ||
        saleBinding.workflowType != before.workflowType ||
        saleBinding.subjectId != before.subjectId ||
        saleBinding.committedAt != transitionedAt) {
      _invalid('sale_binding_mismatch');
    }
  } else if (saleBinding != null) {
    _invalid('unexpected_sale_binding');
  }
}

ConnectedStockReservationTransitionV1 transitionConnectedStockReservation({
  required ConnectedStockReservationV1 reservation,
  required String expectedReservationDigest,
  required ConnectedStockReservationState targetState,
  required String transitionedAt,
  required String reason,
  ConnectedStockSaleBindingV1? saleBinding,
}) {
  if (_digest(expectedReservationDigest, 'expected_digest') !=
      reservation.reservationDigest) {
    _invalid('changed_bytes');
  }
  if (reservation.state != ConnectedStockReservationState.held ||
      targetState == ConnectedStockReservationState.held) {
    _invalid('terminal_transition');
  }
  final instant = DateTime.parse(_timestamp(transitionedAt, 'transitioned_at'));
  final issued = DateTime.parse(reservation.issuedAt);
  final expires = DateTime.parse(reservation.expiresAt);
  if (instant.isBefore(issued)) _invalid('transition_before_issue');
  if (targetState == ConnectedStockReservationState.expired &&
      instant.isBefore(expires)) {
    _invalid('expiry_too_early');
  }
  if (targetState == ConnectedStockReservationState.committed) {
    if (saleBinding == null || !instant.isBefore(expires)) {
      _invalid('commit_binding_or_expiry');
    }
    if (saleBinding.workspaceId != reservation.workspaceId ||
        saleBinding.siteId != reservation.siteId ||
        saleBinding.reservationId != reservation.reservationId ||
        saleBinding.reservationDigest != reservation.reservationDigest ||
        saleBinding.basketDigest != reservation.basketDigest ||
        saleBinding.workflowType != reservation.workflowType ||
        saleBinding.subjectId != reservation.subjectId ||
        saleBinding.committedAt != transitionedAt) {
      _invalid('sale_binding_mismatch');
    }
  } else if (saleBinding != null) {
    _invalid('unexpected_sale_binding');
  }

  final afterUnsigned = <String, Object>{
    ...reservation.unsignedPayload,
    'state': targetState.name,
    'stateVersion': reservation.stateVersion + 1,
  };
  final after = ConnectedStockReservationV1.fromJson({
    ...afterUnsigned,
    'reservationDigest': connectedSiteSha256(afterUnsigned),
  });
  final transitionUnsigned = <String, Object?>{
    'schemaVersion': connectedStockReservationSchemaVersion,
    'beforeDigest': reservation.reservationDigest,
    'afterDigest': after.reservationDigest,
    'fromState': reservation.state.name,
    'toState': targetState.name,
    'transitionedAt': transitionedAt,
    'reason': _id(reason, 'transition_reason'),
    'saleBindingDigest': saleBinding?.bindingDigest,
  };
  return ConnectedStockReservationTransitionV1(
    before: reservation,
    after: after,
    transitionedAt: transitionedAt,
    reason: reason,
    saleBinding: saleBinding,
    transitionDigest: connectedSiteSha256(transitionUnsigned),
  );
}

abstract interface class ConnectedStockReservationService {
  ConnectedStockReservationV1 hold(ConnectedStockReservationV1 reservation);

  ConnectedStockReservationTransitionV1 transition({
    required ConnectedStockReservationV1 reservation,
    required String expectedReservationDigest,
    required ConnectedStockReservationState targetState,
    required String transitionedAt,
    required String reason,
    ConnectedStockSaleBindingV1? saleBinding,
  });
}

class ConnectedStockReservationUnavailable
    implements ConnectedStockReservationService {
  const ConnectedStockReservationUnavailable();

  @override
  ConnectedStockReservationV1 hold(ConnectedStockReservationV1 reservation) {
    throw const ConnectedStockReservationUnavailableException();
  }

  @override
  ConnectedStockReservationTransitionV1 transition({
    required ConnectedStockReservationV1 reservation,
    required String expectedReservationDigest,
    required ConnectedStockReservationState targetState,
    required String transitionedAt,
    required String reason,
    ConnectedStockSaleBindingV1? saleBinding,
  }) {
    throw const ConnectedStockReservationUnavailableException();
  }
}

class ConnectedStockReservationUnavailableException implements Exception {
  const ConnectedStockReservationUnavailableException();

  @override
  String toString() => 'connected_stock_reservation_unavailable';
}
