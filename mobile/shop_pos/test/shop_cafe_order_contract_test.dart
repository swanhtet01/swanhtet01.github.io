import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';

void main() {
  const soy = CafeModifierSnapshot(
    id: 'soy',
    version: 1,
    labelEn: 'Soy milk',
    labelMy: 'ပဲနို့',
    priceDeltaMmk: 500,
  );
  CafeOrderLine line(String id, {String remark = ''}) => CafeOrderLine(
    id: id,
    productId: 'coffee',
    productName: 'Coffee',
    quantity: 1,
    baseUnitPriceMmk: 3000,
    remark: remark,
    modifiers: const [soy],
  );
  final catalog = {soy.key: soy};
  test('distinct same-product lines round trip with immutable snapshots', () {
    final command = CafeOrderCommand(
      id: 'cmd-1',
      ticketId: 'ticket-1',
      expectedVersion: 0,
      lines: [
        line('line-1'),
        line('line-2', remark: 'less ice'),
      ],
    );
    final ticket = applyCafeOrderCommand(null, command, catalog);
    final restored = CafeOrderTicket.fromJson(
      jsonDecode(jsonEncode(ticket.toJson())),
    );
    expect(restored.lines.map((e) => e.id), ['line-1', 'line-2']);
    expect(restored.lines.last.remark, 'less ice');
    expect(applyCafeOrderCommand(ticket, command, catalog), same(ticket));
  });
  test('reuse, stale version, unknown modifier and tampering fail closed', () {
    final first = CafeOrderCommand(
      id: 'cmd-1',
      ticketId: 'ticket-1',
      expectedVersion: 0,
      lines: [line('line-1')],
    );
    final ticket = applyCafeOrderCommand(null, first, catalog);
    expect(
      () => applyCafeOrderCommand(
        ticket,
        CafeOrderCommand(
          id: 'cmd-1',
          ticketId: 'ticket-1',
          expectedVersion: 1,
          lines: [line('line-1', remark: 'changed')],
        ),
        catalog,
      ),
      throwsFormatException,
    );
    expect(
      () => applyCafeOrderCommand(
        ticket,
        CafeOrderCommand(
          id: 'cmd-2',
          ticketId: 'ticket-1',
          expectedVersion: 0,
          lines: [line('line-1')],
        ),
        catalog,
      ),
      throwsFormatException,
    );
    expect(
      () => applyCafeOrderCommand(null, first, const {}),
      throwsFormatException,
    );
    final extra = ticket.toJson()..['extra'] = true;
    expect(() => CafeOrderTicket.fromJson(extra), throwsFormatException);
    for (final mutate in <void Function(Map<String, dynamic>)>[
      (json) => ((json['lines'] as List).first as Map)['remark'] = 'tampered',
      (json) => ((json['lines'] as List).first as Map)['quantity'] = 2,
      (json) => ((json['lines'] as List).first as Map)['baseUnitPriceMmk'] = 1,
      (json) =>
          ((json['lines'] as List).first as Map)['productName'] = 'Tampered',
      (json) =>
          ((((json['lines'] as List).first as Map)['modifiers'] as List).first
                  as Map)['labelEn'] =
              'Tampered',
      (json) =>
          ((((json['lines'] as List).first as Map)['modifiers'] as List).first
                  as Map)['version'] =
              2,
      (json) =>
          ((((json['lines'] as List).first as Map)['modifiers'] as List).first
                  as Map)['priceDeltaMmk'] =
              1,
      (json) => json['lastCommandFingerprint'] = '0' * 64,
    ]) {
      final json =
          jsonDecode(jsonEncode(ticket.toJson())) as Map<String, dynamic>;
      mutate(json);
      expect(() => CafeOrderTicket.fromJson(json), throwsFormatException);
    }
  });
  test('caller-owned collections cannot mutate an applied ticket', () {
    final modifiers = <CafeModifierSnapshot>[soy];
    final lines = <CafeOrderLine>[
      CafeOrderLine(
        id: 'line',
        productId: 'coffee',
        productName: 'Coffee',
        quantity: 1,
        baseUnitPriceMmk: 3000,
        remark: '',
        modifiers: modifiers,
      ),
    ];
    final ticket = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: 'cmd',
        ticketId: 'ticket',
        expectedVersion: 0,
        lines: lines,
      ),
      catalog,
    );
    modifiers.clear();
    lines.clear();
    expect(ticket.lines, hasLength(1));
    expect(ticket.lines.single.modifiers, hasLength(1));
    expect(() => ticket.lines.clear(), throwsUnsupportedError);
    expect(() => ticket.lines.single.modifiers.clear(), throwsUnsupportedError);
  });
  test('whole-MMK totals reject overflow and negative modifier prices', () {
    final expensive = CafeOrderLine(
      id: 'line',
      productId: 'p',
      productName: 'Product',
      quantity: 2,
      baseUnitPriceMmk: 2000000000,
      remark: '',
      modifiers: const [],
    );
    expect(
      () => applyCafeOrderCommand(
        null,
        CafeOrderCommand(
          id: 'c',
          ticketId: 't',
          expectedVersion: 0,
          lines: [expensive],
        ),
        const {},
      ),
      throwsFormatException,
    );
    expect(
      () => CafeModifierSnapshot.fromJson({
        'id': 'x',
        'version': 1,
        'labelEn': 'x',
        'labelMy': 'x',
        'priceDeltaMmk': -1,
      }),
      throwsFormatException,
    );
  });
  test('product name snapshots reject malformed values', () {
    Map<String, Object> lineJson(String name) => {
      'id': 'line',
      'productId': 'coffee',
      'productName': name,
      'quantity': 1,
      'baseUnitPriceMmk': 3000,
      'remark': '',
      'modifiers': <Object>[],
    };
    for (final name in ['', ' Coffee', 'Coffee\u0000', 'x' * 161]) {
      expect(
        () => CafeOrderLine.fromJson(lineJson(name)),
        throwsFormatException,
      );
    }
  });
  test('split evidence round trips and rejects a changed partition', () {
    CafeOrderLine localLine(String id) => CafeOrderLine.local(
      id: id,
      productId: 'coffee',
      productName: 'Coffee',
      quantity: 1,
      baseUnitPriceMmk: 3000,
      remark: '',
      modifiers: const [],
    );
    final sourceBefore = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: 'split-create',
        ticketId: 'split-source',
        expectedVersion: 0,
        lines: [localLine('line-1'), localLine('line-2')],
      ),
      const {},
    );
    final sourceResult = applyCafeOrderCommand(
      sourceBefore,
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          'split-operation',
          'source',
          expectedStateRevision: 0,
        ),
        ticketId: 'split-source',
        expectedVersion: 1,
        lines: [localLine('line-1')],
      ),
      const {},
    );
    final destinationResult = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          'split-operation',
          'destination',
          expectedStateRevision: 0,
        ),
        ticketId: 'split-destination',
        expectedVersion: 0,
        lines: [localLine('line-2')],
      ),
      const {},
    );
    final event = CafeOrderSplitEvent(
      operationId: 'split-operation',
      sourceOrderId: 'split-source',
      destinationOrderId: 'split-destination',
      expectedTicketVersion: 1,
      expectedStateRevision: 0,
      sourceBeforeTicket: sourceBefore,
      sourceResultTicket: sourceResult,
      destinationResultTicket: destinationResult,
      movedLineIds: const ['line-2'],
      sourceStateEventFingerprints: const [],
      createdAtMillis: 2000000000000,
    );
    expect(
      CafeOrderSplitEvent.fromJson(jsonDecode(jsonEncode(event.toJson())))
          .movedLineIds,
      const ['line-2'],
    );
    final tampered =
        jsonDecode(jsonEncode(event.toJson())) as Map<String, dynamic>;
    tampered['movedLineIds'] = ['line-1'];
    expect(() => CafeOrderSplitEvent.fromJson(tampered), throwsFormatException);
    final revisionTampered =
        jsonDecode(jsonEncode(event.toJson())) as Map<String, dynamic>;
    revisionTampered['expectedStateRevision'] = 1;
    revisionTampered['sourceStateEventFingerprints'] = ['0' * 64];
    expect(
      () => CafeOrderSplitEvent.fromJson(revisionTampered),
      throwsFormatException,
    );
  });

  test(
    'quantity split evidence conserves whole units and rejects tampering',
    () {
      final line = CafeOrderLine.local(
        id: 'line-quantity',
        productId: 'coffee',
        quantity: 3,
        baseUnitPriceMmk: 3000,
        remark: 'less ice',
        modifiers: const [],
      );
      final sourceBefore = applyCafeOrderCommand(
        null,
        CafeOrderCommand(
          id: 'quantity-create',
          ticketId: 'quantity-source',
          expectedVersion: 0,
          lines: [line],
        ),
        const {},
      );
      final sourceResult = applyCafeOrderCommand(
        sourceBefore,
        CafeOrderCommand(
          id: cafeOrderSplitCommandId(
            'quantity-operation',
            'source',
            expectedStateRevision: 0,
          ),
          ticketId: 'quantity-source',
          expectedVersion: 1,
          lines: [line.copyWithQuantity(2)],
        ),
        const {},
      );
      final destinationResult = applyCafeOrderCommand(
        null,
        CafeOrderCommand(
          id: cafeOrderSplitCommandId(
            'quantity-operation',
            'destination',
            expectedStateRevision: 0,
          ),
          ticketId: 'quantity-destination',
          expectedVersion: 0,
          lines: [line.copyWithQuantity(1)],
        ),
        const {},
      );
      final event = CafeOrderSplitEvent(
        operationId: 'quantity-operation',
        sourceOrderId: 'quantity-source',
        destinationOrderId: 'quantity-destination',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
        sourceBeforeTicket: sourceBefore,
        sourceResultTicket: sourceResult,
        destinationResultTicket: destinationResult,
        movedLineQuantities: const {'line-quantity': 1},
        sourceStateEventFingerprints: const [],
        createdAtMillis: 2000000000000,
      );
      final restored = CafeOrderSplitEvent.fromJson(
        jsonDecode(jsonEncode(event.toJson())),
      );
      expect(restored.eventType, cafeOrderQuantitySplitEventType);
      expect(restored.movedLineQuantities, const {'line-quantity': 1});
      expect(restored.sourceResultTicket.lines.single.quantity, 2);
      expect(restored.destinationResultTicket.lines.single.quantity, 1);
      expect(
        restored.sourceResultTicket.lines.single.totalMmk() +
            restored.destinationResultTicket.lines.single.totalMmk(),
        sourceBefore.lines.single.totalMmk(),
      );

      final tampered =
          jsonDecode(jsonEncode(event.toJson())) as Map<String, dynamic>;
      tampered['movedLineQuantities'] = {'line-quantity': 2};
      expect(
        () => CafeOrderSplitEvent.fromJson(tampered),
        throwsFormatException,
      );
    },
  );

  test('split reversal binds the exact split, restore, and cancellation', () {
    final line = CafeOrderLine.local(
      id: 'undo-line',
      productId: 'coffee',
      quantity: 3,
      baseUnitPriceMmk: 3000,
      remark: 'less ice',
      modifiers: const [],
    );
    final before = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: 'undo-create',
        ticketId: 'undo-source',
        expectedVersion: 0,
        lines: [line],
      ),
      const {},
    );
    final source = applyCafeOrderCommand(
      before,
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          'undo-split',
          'source',
          expectedStateRevision: 0,
        ),
        ticketId: 'undo-source',
        expectedVersion: 1,
        lines: [line.copyWithQuantity(2)],
      ),
      const {},
    );
    final destination = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: cafeOrderSplitCommandId(
          'undo-split',
          'destination',
          expectedStateRevision: 0,
        ),
        ticketId: 'undo-destination',
        expectedVersion: 0,
        lines: [line.copyWithQuantity(1)],
      ),
      const {},
    );
    final split = CafeOrderSplitEvent(
      operationId: 'undo-split',
      sourceOrderId: source.id,
      destinationOrderId: destination.id,
      expectedTicketVersion: 1,
      expectedStateRevision: 0,
      sourceBeforeTicket: before,
      sourceResultTicket: source,
      destinationResultTicket: destination,
      movedLineQuantities: const {'undo-line': 1},
      sourceStateEventFingerprints: const [],
      createdAtMillis: 2000000000000,
    );
    const reversalId = 'undo-reversal';
    final restoreCommand = cafeOrderSplitReversalCommandId(
      reversalId,
      'source',
      expectedSourceStateRevision: 0,
      expectedDestinationStateRevision: 0,
    );
    final cancelCommand = cafeOrderSplitReversalCommandId(
      reversalId,
      'destination-cancel',
      expectedSourceStateRevision: 0,
      expectedDestinationStateRevision: 0,
    );
    final restored = applyCafeOrderCommand(
      source,
      CafeOrderCommand(
        id: restoreCommand,
        ticketId: source.id,
        expectedVersion: source.version,
        lines: before.lines,
      ),
      const {},
    );
    final event = CafeOrderSplitReversalEvent(
      operationId: reversalId,
      splitOperationId: split.operationId,
      sourceOrderId: source.id,
      destinationOrderId: destination.id,
      expectedSourceTicketVersion: source.version,
      expectedSourceStateRevision: 0,
      expectedDestinationTicketVersion: destination.version,
      expectedDestinationStateRevision: 0,
      splitEvent: split,
      restoredSourceTicket: restored,
      destinationCancellationOperationId: cancelCommand,
      destinationCancellationFingerprint: cafeOrderCancellationFingerprint(
        operationId: cancelCommand,
        orderId: destination.id,
        ticketVersion: destination.version,
        ticketFingerprint: destination.lastCommandFingerprint,
        stateRevision: 0,
        fromState: 'open',
      ),
      createdAtMillis: 2000000000001,
    );
    expect(
      CafeOrderSplitReversalEvent.fromJson(
        jsonDecode(jsonEncode(event.toJson())),
      ).restoredSourceTicket.lines.single.quantity,
      3,
    );
    expect(
      cafeOrderSplitReversalHistoryValid([event], [split], [
        source,
        destination,
        restored,
      ]),
      isTrue,
    );
    final tampered =
        jsonDecode(jsonEncode(event.toJson())) as Map<String, dynamic>;
    final ticket = tampered['restoredSourceTicket'] as Map<String, dynamic>;
    final lines = ticket['lines'] as List<dynamic>;
    (lines.single as Map<String, dynamic>)['quantity'] = 2;
    expect(
      () => CafeOrderSplitReversalEvent.fromJson(tampered),
      throwsFormatException,
    );
  });
}
