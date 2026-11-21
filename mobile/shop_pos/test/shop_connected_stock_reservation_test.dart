import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

const _commandDigest =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

ConnectedStockReservationV1 _reservation({
  ConnectedStockReservationState state = ConnectedStockReservationState.held,
  List<ConnectedStockReservationLineV1>? lines,
  ConnectedStockWorkflowType workflowType =
      ConnectedStockWorkflowType.retailCart,
  String subjectId = 'cart-1',
  ShopStaffCapability capability = ShopStaffCapability.counterSale,
}) {
  final selectedLines =
      lines ??
      [
        ConnectedStockReservationLineV1(productId: 'coffee', quantity: 2),
        ConnectedStockReservationLineV1(productId: 'tea', quantity: 1),
      ];
  final basket = <String, Object>{
    'schemaVersion': connectedStockReservationSchemaVersion,
    'lines': selectedLines.map((line) => line.toJson()).toList(),
  };
  final unsigned = <String, Object>{
    'schemaVersion': connectedStockReservationSchemaVersion,
    'reservationId': 'reservation-1',
    'workspaceId': 'workspace-1',
    'siteId': 'site-1',
    'actorId': 'actor-1',
    'deviceId': 'device-1',
    'workflowType': workflowType.name,
    'subjectId': subjectId,
    'capability': capability.name,
    'lines': selectedLines.map((line) => line.toJson()).toList(),
    'basketDigest': connectedSiteSha256(basket),
    'issuedAt': '2026-10-31T00:00:00.000Z',
    'expiresAt': '2026-10-31T01:00:00.000Z',
    'state': state.name,
    'stateVersion': 1,
  };
  return ConnectedStockReservationV1.fromJson({
    ...unsigned,
    'reservationDigest': connectedSiteSha256(unsigned),
  });
}

ConnectedStockSaleBindingV1 _binding(
  ConnectedStockReservationV1 reservation, {
  String committedAt = '2026-10-31T00:30:00.000Z',
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
    'saleId': 'sale-1',
    'saleCommandId': 'command-1',
    'saleCommandDigest': _commandDigest,
    'committedAt': committedAt,
  };
  return ConnectedStockSaleBindingV1.fromJson({
    ...unsigned,
    'bindingDigest': connectedSiteSha256(unsigned),
  });
}

void main() {
  test('multi-line held reservation round trips with exact basket bytes', () {
    final reservation = _reservation();
    final restored = ConnectedStockReservationV1.fromJson(
      jsonDecode(jsonEncode(reservation.toJson())),
    );
    expect(restored.lines.map((line) => line.productId), ['coffee', 'tea']);
    expect(restored.capability, ShopStaffCapability.counterSale);
    expect(restored.basketDigest, reservation.basketDigest);
    expect(
      () => restored.lines.add(
        ConnectedStockReservationLineV1(productId: 'water', quantity: 1),
      ),
      throwsUnsupportedError,
    );
  });

  test(
    'canonical timestamp rejects normalized calendars and alternate bytes',
    () {
      ConnectedStockReservationV1 invalid(String issuedAt) =>
          ConnectedStockReservationV1.held(
            reservationId: 'reservation-invalid-time',
            workspaceId: 'workspace-1',
            siteId: 'site-1',
            actorId: 'actor-1',
            deviceId: 'device-1',
            workflowType: ConnectedStockWorkflowType.retailCart,
            subjectId: 'cart-invalid-time',
            capability: ShopStaffCapability.counterSale,
            lines: [
              ConnectedStockReservationLineV1(productId: 'coffee', quantity: 1),
            ],
            issuedAt: issuedAt,
            expiresAt: '2026-11-01T00:00:00.000Z',
          );

      for (final value in const [
        '2026-02-30T00:00:00.000Z',
        '2026-10-31T00:00:00Z',
        '2026-10-31T00:00:00.000000Z',
        '2026-10-31T00:00:00.000+00:00',
        '2026-10-31t00:00:00.000z',
      ]) {
        expect(() => invalid(value), throwsFormatException, reason: value);
      }
    },
  );

  test(
    'canonical basket, reservation and transition digest vectors are stable',
    () {
      final held = _reservation();
      expect(
        held.basketDigest,
        'bea701c4f73e2a7d6f5706732e652db7412243628dbb24275f5d52f2ef9127e1',
      );
      expect(
        held.reservationDigest,
        '056223aa5ae60784d22db3feb541d4bbfd562c0e8df4a542560233e9b67cd516',
      );
      final released = transitionConnectedStockReservation(
        reservation: held,
        expectedReservationDigest: held.reservationDigest,
        targetState: ConnectedStockReservationState.released,
        transitionedAt: '2026-10-31T00:20:00.000Z',
        reason: 'basket_cancelled',
      );
      expect(
        released.after.reservationDigest,
        'e2619d546a126a4de03027790324e9e391ee63a1991fd01a2b190087e95da941',
      );
      expect(
        released.transitionDigest,
        '4f27345474e9fe915dbf1de28c2ff753cd541c06b23135f0cb24517d06d64505',
      );
    },
  );

  test('duplicate, unordered and invalid lines fail closed', () {
    expect(
      () => _reservation(
        lines: [
          ConnectedStockReservationLineV1(productId: 'tea', quantity: 1),
          ConnectedStockReservationLineV1(productId: 'tea', quantity: 2),
        ],
      ),
      throwsFormatException,
    );
    expect(
      () => _reservation(
        lines: [
          ConnectedStockReservationLineV1(productId: 'tea', quantity: 1),
          ConnectedStockReservationLineV1(productId: 'coffee', quantity: 1),
        ],
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedStockReservationLineV1(productId: 'tea', quantity: 0),
      throwsFormatException,
    );
    expect(
      () => ConnectedStockReservationLineV1(productId: 'tea', quantity: 1001),
      throwsFormatException,
    );
    expect(
      () => _reservation(
        lines: [
          for (var index = 0; index < 101; index++)
            ConnectedStockReservationLineV1(
              productId: 'product-${index.toString().padLeft(3, '0')}',
              quantity: 1,
            ),
        ],
      ),
      throwsFormatException,
    );
  });

  test('workflow uses only its existing reservation capability', () {
    expect(_reservation().capability, ShopStaffCapability.counterSale);
    expect(
      _reservation(
        workflowType: ConnectedStockWorkflowType.cafeOrder,
        subjectId: 'order-1',
        capability: ShopStaffCapability.cafeOrderWrite,
      ).capability,
      ShopStaffCapability.cafeOrderWrite,
    );
    expect(
      () => _reservation(capability: ShopStaffCapability.stockChange),
      throwsFormatException,
    );
    expect(
      () => _reservation(capability: ShopStaffCapability.cafeOrderWrite),
      throwsFormatException,
    );
    expect(
      () => _reservation(
        workflowType: ConnectedStockWorkflowType.cafeOrder,
        subjectId: 'order-1',
        capability: ShopStaffCapability.cafeCashComplete,
      ),
      throwsFormatException,
    );
  });

  test('changed reservation or basket bytes fail closed', () {
    final json = _reservation().toJson();
    (json['lines'] as List).first['quantity'] = 3;
    expect(
      () => ConnectedStockReservationV1.fromJson(json),
      throwsFormatException,
    );
    final extra = _reservation().toJson()..['unexpected'] = true;
    expect(
      () => ConnectedStockReservationV1.fromJson(extra),
      throwsFormatException,
    );
  });

  test('held reservation releases once and terminal reversal is rejected', () {
    final held = _reservation();
    final released = transitionConnectedStockReservation(
      reservation: held,
      expectedReservationDigest: held.reservationDigest,
      targetState: ConnectedStockReservationState.released,
      transitionedAt: '2026-10-31T00:20:00.000Z',
      reason: 'basket_cancelled',
    );
    expect(released.after.state, ConnectedStockReservationState.released);
    expect(released.after.stateVersion, 2);
    expect(
      ConnectedStockReservationTransitionV1.fromJson(released.toJson())
          .transitionDigest,
      released.transitionDigest,
    );
    expect(
      () => transitionConnectedStockReservation(
        reservation: released.after,
        expectedReservationDigest: released.after.reservationDigest,
        targetState: ConnectedStockReservationState.held,
        transitionedAt: '2026-10-31T00:21:00.000Z',
        reason: 'reverse',
      ),
      throwsFormatException,
    );
    final transitionJson = released.toJson();
    final alteredAfter = Map<String, Object?>.from(
      transitionJson['after']! as Map,
    )..['siteId'] = 'site-2';
    final alteredAfterUnsigned = Map<String, Object?>.from(alteredAfter)
      ..remove('reservationDigest');
    alteredAfter['reservationDigest'] = connectedSiteSha256(
      alteredAfterUnsigned,
    );
    transitionJson['after'] = alteredAfter;
    final transitionUnsigned = <String, Object?>{
      'schemaVersion': connectedStockReservationSchemaVersion,
      'beforeDigest': released.before.reservationDigest,
      'afterDigest': alteredAfter['reservationDigest'],
      'fromState': released.before.state.name,
      'toState': released.after.state.name,
      'transitionedAt': released.transitionedAt,
      'reason': released.reason,
      'saleBindingDigest': null,
    };
    transitionJson['transitionDigest'] = connectedSiteSha256(
      transitionUnsigned,
    );
    expect(
      () => ConnectedStockReservationTransitionV1.fromJson(transitionJson),
      throwsFormatException,
    );
  });

  test('expiry is allowed only at or after exact expiry', () {
    final held = _reservation();
    expect(
      () => transitionConnectedStockReservation(
        reservation: held,
        expectedReservationDigest: held.reservationDigest,
        targetState: ConnectedStockReservationState.expired,
        transitionedAt: '2026-10-31T00:59:59.999Z',
        reason: 'lease_expired',
      ),
      throwsFormatException,
    );
    final expired = transitionConnectedStockReservation(
      reservation: held,
      expectedReservationDigest: held.reservationDigest,
      targetState: ConnectedStockReservationState.expired,
      transitionedAt: held.expiresAt,
      reason: 'lease_expired',
    );
    expect(expired.after.state, ConnectedStockReservationState.expired);
  });

  test('commit requires exact sale, scope, basket and time binding', () {
    final held = _reservation();
    final binding = _binding(held);
    final committed = transitionConnectedStockReservation(
      reservation: held,
      expectedReservationDigest: held.reservationDigest,
      targetState: ConnectedStockReservationState.committed,
      transitionedAt: binding.committedAt,
      reason: 'sale_committed',
      saleBinding: binding,
    );
    expect(committed.after.state, ConnectedStockReservationState.committed);
    expect(committed.saleBinding?.saleId, 'sale-1');

    final wrongScopeJson = binding.toJson()..['siteId'] = 'site-2';
    final unsigned = Map<String, Object?>.from(wrongScopeJson)
      ..remove('bindingDigest');
    wrongScopeJson['bindingDigest'] = connectedSiteSha256(unsigned);
    final wrongScope = ConnectedStockSaleBindingV1.fromJson(wrongScopeJson);
    expect(
      () => transitionConnectedStockReservation(
        reservation: held,
        expectedReservationDigest: held.reservationDigest,
        targetState: ConnectedStockReservationState.committed,
        transitionedAt: wrongScope.committedAt,
        reason: 'sale_committed',
        saleBinding: wrongScope,
      ),
      throwsFormatException,
    );
  });

  test('cross-domain and cross-subject sale bindings fail closed', () {
    final held = _reservation();
    final binding = _binding(held);
    for (final substitution in <String, Object>{
      'workflowType': ConnectedStockWorkflowType.cafeOrder.name,
      'subjectId': 'cart-2',
    }.entries) {
      final changed = binding.toJson()..[substitution.key] = substitution.value;
      final unsigned = Map<String, Object?>.from(changed)
        ..remove('bindingDigest');
      changed['bindingDigest'] = connectedSiteSha256(unsigned);
      final substituted = ConnectedStockSaleBindingV1.fromJson(changed);
      expect(
        () => transitionConnectedStockReservation(
          reservation: held,
          expectedReservationDigest: held.reservationDigest,
          targetState: ConnectedStockReservationState.committed,
          transitionedAt: substituted.committedAt,
          reason: 'sale_committed',
          saleBinding: substituted,
        ),
        throwsFormatException,
        reason: substitution.key,
      );
    }
  });

  test('digest mismatch blocks replay with changed bytes', () {
    final held = _reservation();
    expect(
      () => transitionConnectedStockReservation(
        reservation: held,
        expectedReservationDigest: _commandDigest,
        targetState: ConnectedStockReservationState.released,
        transitionedAt: '2026-10-31T00:20:00.000Z',
        reason: 'basket_cancelled',
      ),
      throwsFormatException,
    );
  });

  test('default service remains unavailable and performs no transition', () {
    final held = _reservation();
    expect(
      () => const ConnectedStockReservationUnavailable().hold(held),
      throwsA(isA<ConnectedStockReservationUnavailableException>()),
    );
    expect(
      () => const ConnectedStockReservationUnavailable().transition(
        reservation: held,
        expectedReservationDigest: held.reservationDigest,
        targetState: ConnectedStockReservationState.released,
        transitionedAt: '2026-10-31T00:20:00.000Z',
        reason: 'basket_cancelled',
      ),
      throwsA(isA<ConnectedStockReservationUnavailableException>()),
    );
  });
}
