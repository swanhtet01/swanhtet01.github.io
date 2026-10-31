import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('table and routing snapshots are idempotent sale evidence', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: _premiumKitchen,
    );
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2000,
        openingStock: 4,
      );
      final command = CafeOrderCommand(
        id: 'create-table-order',
        ticketId: 'table-order',
        expectedVersion: 0,
        serviceContext: const CafeServiceContext(
          areaLabel: 'Ground floor',
          tableLabel: 'T-04',
        ),
        lines: [
          CafeOrderLine(
            id: 'tea-1',
            productId: 'tea',
            quantity: 1,
            baseUnitPriceMmk: 2000,
            remark: 'warm',
            preparationStation: 'bar',
            modifiers: const [],
          ),
        ],
      );
      final created = await store.applyCommand(command, const {});
      final replay = await store.applyCommand(command, const {});
      expect(replay.ticket.version, created.ticket.version);
      expect(replay.ticket.serviceContext?.tableLabel, 'T-04');
      expect(
        created.kitchenDispatchLines.single.ticketId,
        cafeKitchenTicketId('table-order', 'tea-1'),
      );
      expect(created.kitchenDispatchLines.single.sequence, 1);
      final updated = await store.applyCommand(
        CafeOrderCommand(
          id: 'add-second-table-line',
          ticketId: 'table-order',
          expectedVersion: 1,
          serviceContext: created.ticket.serviceContext,
          lines: [
            ...created.ticket.lines,
            CafeOrderLine(
              id: 'tea-2',
              productId: 'tea',
              quantity: 1,
              baseUnitPriceMmk: 2000,
              remark: 'cold',
              preparationStation: 'kitchen',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      final dispatches = await database
          .customSelect(
            "SELECT operation_id, payload_json FROM shop_sync_outbox WHERE event_type = "
            "'shop.cafe_kitchen_dispatch.recorded.v1' ORDER BY created_at_millis, operation_id",
          )
          .get();
      expect(dispatches, hasLength(2));
      final dispatchVersions = dispatches
          .map(
            (row) =>
                (jsonDecode(row.read<String>('payload_json'))
                    as Map)['ticketVersion'],
          )
          .toSet();
      expect(dispatchVersions, {1, 2});
      expect(
        updated.kitchenDispatchLines.first.ticketId,
        created.kitchenDispatchLines.single.ticketId,
      );
      expect(updated.kitchenDispatchLines.first.sequence, 1);
      expect(updated.kitchenDispatchLines.last.sequence, 2);
      final outboxBeforeRouteChange = await database.countOutboxOperations();
      await expectLater(
        store.applyCommand(
          CafeOrderCommand(
            id: 'change-existing-route',
            ticketId: 'table-order',
            expectedVersion: 2,
            serviceContext: updated.ticket.serviceContext,
            lines: [
              CafeOrderLine(
                id: 'tea-1',
                productId: 'tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: 'warm',
                preparationStation: 'kitchen',
                modifiers: const [],
              ),
              updated.ticket.lines.last,
            ],
          ),
          const {},
        ),
        throwsStateError,
      );
      expect((await store.read('table-order'))?.ticket.version, 2);
      expect(await database.countOutboxOperations(), outboxBeforeRouteChange);

      final receipt = await store.completeCash(
        orderId: 'table-order',
        operationId: 'table-sale',
        expectedTicketVersion: 2,
        expectedStateRevision: 0,
      );
      final saleReplay = await store.completeCash(
        orderId: 'table-order',
        operationId: 'table-sale',
        expectedTicketVersion: 2,
        expectedStateRevision: 0,
      );
      expect(saleReplay.id, receipt.id);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 2);
      final outbox = await database
          .customSelect(
            "SELECT payload_json FROM shop_sync_outbox WHERE operation_id = 'table-sale'",
          )
          .getSingle();
      final payload = jsonDecode(outbox.read<String>('payload_json')) as Map;
      expect(payload['serviceContext'], {
        'areaLabel': 'Ground floor',
        'tableLabel': 'T-04',
      });
      final line = (payload['lines'] as List).first as Map;
      expect(line['preparationStation'], 'bar');
      expect(
        line['kitchenTicketId'],
        created.kitchenDispatchLines.single.ticketId,
      );
      expect(line['kitchenTicketSequence'], 1);
      await database.verifyReadyForUse();
      final historical = dispatches.firstWhere(
        (row) =>
            (jsonDecode(row.read<String>('payload_json'))
                as Map)['ticketVersion'] ==
            1,
      );
      final tampered =
          jsonDecode(historical.read<String>('payload_json')) as Map;
      tampered['state'] = 'sent';
      await database.customUpdate(
        'UPDATE shop_sync_outbox SET payload_json = ? WHERE operation_id = ?',
        variables: [
          Variable<String>(jsonEncode(tampered)),
          Variable<String>(historical.read<String>('operation_id')),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
    } finally {
      await database.close();
    }
  });

  test('kitchen dispatch failure rolls back an order edit and retries after reopen', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-cafe-dispatch-outbox-abort-',
    );
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    var store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: _premiumKitchen,
    );
    const orderId = 'dispatch-recovery-order';
    try {
      await database.addProduct(
        id: 'dispatch-tea',
        name: 'Tea',
        priceMmk: 2000,
        openingStock: 5,
      );
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'dispatch-create',
          ticketId: orderId,
          expectedVersion: 0,
          serviceContext: const CafeServiceContext(
            areaLabel: 'Ground floor',
            tableLabel: 'T-07',
          ),
          lines: [
            CafeOrderLine(
              id: 'dispatch-tea-1',
              productId: 'dispatch-tea',
              quantity: 1,
              baseUnitPriceMmk: 2000,
              remark: 'warm',
              modifiers: const [],
              preparationStation: 'bar',
            ),
          ],
        ),
        const {},
      );
      final preparing = await store.advanceKitchenStatus(
        orderId: orderId,
        lineId: 'dispatch-tea-1',
        operationId: 'dispatch-first-preparing',
        expectedTicketVersion: created.ticket.version,
        expectedStatus: 'pending_local',
      );
      final update = CafeOrderCommand(
        id: 'dispatch-add-line',
        ticketId: orderId,
        expectedVersion: created.ticket.version,
        serviceContext: created.ticket.serviceContext,
        lines: [
          ...created.ticket.lines,
          CafeOrderLine(
            id: 'dispatch-tea-2',
            productId: 'dispatch-tea',
            quantity: 2,
            baseUnitPriceMmk: 2000,
            remark: 'less sugar',
            modifiers: const [],
            preparationStation: 'kitchen',
          ),
        ],
      );
      final expectedTicket = applyCafeOrderCommand(
        created.ticket,
        update,
        const {},
      );
      final failedDispatchOperationId = cafeKitchenDispatchOperationId(
        expectedTicket,
      );
      final before = await _cafeDispatchRecoveryState(
        database,
        orderId: orderId,
      );
      await database.customStatement(
        'CREATE TEMP TRIGGER synthetic_cafe_dispatch_outbox_abort '
        'AFTER INSERT ON shop_sync_outbox '
        "WHEN NEW.operation_id = '$failedDispatchOperationId' "
        "BEGIN SELECT RAISE(ABORT, 'synthetic cafe dispatch outbox failure'); END",
      );

      await expectLater(
        store.applyCommand(update, const {}),
        throwsA(
          predicate<Object>(
            (error) => error.toString().contains(
              'synthetic cafe dispatch outbox failure',
            ),
          ),
        ),
      );
      expect(
        await _cafeDispatchRecoveryState(database, orderId: orderId),
        before,
      );

      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      store = ShopCafeOrderStore(database, kitchenEntitlement: _premiumKitchen);
      expect(
        await _cafeDispatchRecoveryState(database, orderId: orderId),
        before,
      );

      final updated = await store.applyCommand(update, const {});
      expect(updated.ticket.version, 2);
      expect(updated.ticket.lines.map((line) => line.id), [
        'dispatch-tea-1',
        'dispatch-tea-2',
      ]);
      expect(updated.totalMmk, 6000);
      expect(updated.kitchenDispatchLines, hasLength(2));
      expect(updated.kitchenDispatchLines.map((line) => line.sequence), [1, 2]);
      expect(updated.kitchenStatusByLine, {
        'dispatch-tea-1': 'preparing_local',
        'dispatch-tea-2': 'pending_local',
      });
      expect(updated.stateRevision, preparing.stateRevision);
      final completed = await _cafeDispatchRecoveryState(
        database,
        orderId: orderId,
      );
      expect(completed['products'], before['products']);
      expect(completed['movements'], before['movements']);
      expect(completed['sales'], before['sales']);
      final orderRows = completed['orders']!;
      expect(orderRows, hasLength(1));
      expect(orderRows.single['ticket_version'], 2);
      expect(orderRows.single['total_mmk'], 6000);
      expect(orderRows.single['last_command_id'], 'dispatch-add-line');
      final dispatchRows = completed['dispatchOutbox']!;
      expect(dispatchRows, hasLength(before['dispatchOutbox']!.length + 1));
      final retryRows = dispatchRows
          .where((row) => row['operation_id'] == failedDispatchOperationId)
          .toList(growable: false);
      expect(retryRows, hasLength(1));
      expect(retryRows.single['state'], 'pending');
      final retryPayload = jsonDecode(
        retryRows.single['payload_json']! as String,
      ) as Map<String, dynamic>;
      expect(retryPayload['orderId'], orderId);
      expect(retryPayload['ticketVersion'], 2);
      expect(retryPayload['commandId'], 'dispatch-add-line');
      expect(
        (retryPayload['lines'] as List).map((line) => (line as Map)['lineId']),
        ['dispatch-tea-1', 'dispatch-tea-2'],
      );

      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      store = ShopCafeOrderStore(database, kitchenEntitlement: _premiumKitchen);
      await store.applyCommand(update, const {});
      expect(
        await _cafeDispatchRecoveryState(database, orderId: orderId),
        completed,
      );
      await database.verifyReadyForUse();
    } finally {
      await database.close();
      await directory.delete(recursive: true);
    }
  });

  test(
    'kitchen status failure preserves pending state and retries after reopen',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-cafe-kitchen-status-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      var store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: _premiumKitchen,
      );
      const orderId = 'status-recovery-order';
      const lineId = 'status-recovery-line';
      const operationId = 'status-recovery-preparing';
      try {
        await database.addProduct(
          id: 'dispatch-tea',
          name: 'Tea',
          priceMmk: 2000,
          openingStock: 5,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'status-recovery-create',
            ticketId: orderId,
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: 'Ground floor',
              tableLabel: 'T-09',
            ),
            lines: [
              CafeOrderLine(
                id: lineId,
                productId: 'dispatch-tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: 'warm',
                modifiers: const [],
                preparationStation: 'bar',
              ),
            ],
          ),
          const {},
        );
        expect(created.kitchenStatusByLine[lineId], 'pending_local');
        final before = await _cafeDispatchRecoveryState(
          database,
          orderId: orderId,
        );
        await database.customStatement(
          'CREATE TEMP TRIGGER synthetic_cafe_kitchen_status_abort '
          'BEFORE INSERT ON shop_sync_outbox '
          "WHEN NEW.operation_id = '$operationId' "
          "AND NEW.event_type = '$cafeKitchenStatusEventType' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic cafe kitchen status failure'); END",
        );

        Future<StoredCafeOrder> advance() => store.advanceKitchenStatus(
          orderId: orderId,
          lineId: lineId,
          operationId: operationId,
          expectedTicketVersion: created.ticket.version,
          expectedStatus: 'pending_local',
        );

        await expectLater(
          advance(),
          throwsA(
            predicate<Object>(
              (error) => error.toString().contains(
                'synthetic cafe kitchen status failure',
              ),
            ),
          ),
        );
        expect(
          await _cafeDispatchRecoveryState(database, orderId: orderId),
          before,
        );
        expect(
          (await store.read(orderId))?.kitchenStatusByLine[lineId],
          'pending_local',
        );

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        );
        expect(
          await _cafeDispatchRecoveryState(database, orderId: orderId),
          before,
        );
        expect(
          (await store.read(orderId))?.kitchenStatusByLine[lineId],
          'pending_local',
        );

        final preparing = await advance();
        expect(preparing.kitchenStatusByLine[lineId], 'preparing_local');
        final completed = await _cafeDispatchRecoveryState(
          database,
          orderId: orderId,
        );
        expect(completed['orders'], before['orders']);
        expect(completed['dispatchOutbox'], before['dispatchOutbox']);
        expect(completed['products'], before['products']);
        expect(completed['movements'], before['movements']);
        expect(completed['sales'], before['sales']);
        final statusEvents = completed['statusOutbox']!;
        expect(statusEvents, hasLength(1));
        expect(statusEvents.single['operation_id'], operationId);
        expect(statusEvents.single['event_type'], cafeKitchenStatusEventType);
        final payload =
            jsonDecode(statusEvents.single['payload_json']! as String) as Map;
        expect(payload['orderId'], orderId);
        expect(payload['lineId'], lineId);
        expect(payload['fromState'], 'pending_local');
        expect(payload['toState'], 'preparing_local');

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        );
        await advance();
        expect(
          await _cafeDispatchRecoveryState(database, orderId: orderId),
          completed,
        );
        await database.verifyReadyForUse();
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    },
  );

  test(
    'local kitchen status is ordered idempotent and preserves sale stock',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'status-tea',
          name: 'Tea',
          priceMmk: 2000,
          openingStock: 4,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'status-create',
            ticketId: 'status-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine(
                id: 'status-line',
                productId: 'status-tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: 'warm',
                modifiers: const [],
                preparationStation: 'bar',
              ),
            ],
          ),
          const {},
        );
        expect(created.kitchenStatusByLine, {'status-line': 'pending_local'});
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final outboxBefore = await database.countOutboxOperations();

        final preparing = await store.advanceKitchenStatus(
          orderId: 'status-order',
          lineId: 'status-line',
          operationId: 'status-preparing',
          expectedTicketVersion: 1,
          expectedStatus: 'pending_local',
        );
        expect(preparing.kitchenStatusByLine['status-line'], 'preparing_local');
        expect(
          (await store.advanceKitchenStatus(
            orderId: 'status-order',
            lineId: 'status-line',
            operationId: 'status-preparing',
            expectedTicketVersion: 1,
            expectedStatus: 'pending_local',
          )).kitchenStatusByLine['status-line'],
          'preparing_local',
        );
        await expectLater(
          store.advanceKitchenStatus(
            orderId: 'status-order',
            lineId: 'status-line',
            operationId: 'status-preparing',
            expectedTicketVersion: 1,
            expectedStatus: 'preparing_local',
          ),
          throwsStateError,
        );
        final ready = await store.advanceKitchenStatus(
          orderId: 'status-order',
          lineId: 'status-line',
          operationId: 'status-ready',
          expectedTicketVersion: 1,
          expectedStatus: 'preparing_local',
        );
        expect(ready.kitchenStatusByLine['status-line'], 'ready_local');
        final served = await store.advanceKitchenStatus(
          orderId: 'status-order',
          lineId: 'status-line',
          operationId: 'status-served',
          expectedTicketVersion: 1,
          expectedStatus: 'ready_local',
        );
        expect(served.kitchenStatusByLine['status-line'], 'served_local');
        await expectLater(
          store.advanceKitchenStatus(
            orderId: 'status-order',
            lineId: 'status-line',
            operationId: 'status-after-served',
            expectedTicketVersion: 1,
            expectedStatus: 'served_local',
          ),
          throwsStateError,
        );
        expect(await database.countOutboxOperations(), outboxBefore + 3);
        expect(await database.countSales(), 0);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        await database.verifyReadyForUse();

        await database.customUpdate(
          "UPDATE shop_sync_outbox SET payload_json = replace(payload_json, "
          "'\"toState\":\"ready_local\"', "
          "'\"toState\":\"served_local\"') "
          "WHERE operation_id = 'status-ready'",
        );
        await expectLater(database.verifyReadyForUse(), throwsStateError);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'started kitchen line cannot silently change quantity before payment',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'started-tea',
          name: 'Tea',
          priceMmk: 2000,
          openingStock: 4,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'started-create',
            ticketId: 'started-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine(
                id: 'started-line',
                productId: 'started-tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: '',
                modifiers: const [],
                preparationStation: 'bar',
              ),
            ],
          ),
          const {},
        );
        final preparing = await store.advanceKitchenStatus(
          orderId: created.ticket.id,
          lineId: created.ticket.lines.single.id,
          operationId: 'started-preparing',
          expectedTicketVersion: created.ticket.version,
          expectedStatus: 'pending_local',
        );
        final outboxBefore = await database.countOutboxOperations();

        await expectLater(
          store.applyCommand(
            CafeOrderCommand(
              id: 'started-quantity-change',
              ticketId: created.ticket.id,
              expectedVersion: created.ticket.version,
              lines: [created.ticket.lines.single.copyWithQuantity(2)],
            ),
            const {},
          ),
          throwsA(isA<ShopCafeStartedKitchenLineException>()),
        );

        final unchanged = await store.read(created.ticket.id);
        expect(unchanged?.ticket.version, created.ticket.version);
        expect(unchanged?.ticket.lines.single.quantity, 1);
        expect(
          unchanged?.kitchenStatusByLine[created.ticket.lines.single.id],
          'preparing_local',
        );
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 4);

        final receipt = await store.completeCash(
          orderId: created.ticket.id,
          operationId: 'started-sale',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: preparing.stateRevision,
        );
        expect(receipt.totalMmk, 2000);
        expect((await database.readActiveProducts()).single.onHand, 3);
      } finally {
        await database.close();
      }
    },
  );

  test('product name snapshot survives ticket JSON and quantity copies', () {
    final line = CafeOrderLine(
      id: 'tea-line',
      productId: 'tea',
      productName: 'Tea',
      quantity: 1,
      baseUnitPriceMmk: 2000,
      remark: '',
      modifiers: const [],
    );
    final ticket = applyCafeOrderCommand(
      null,
      CafeOrderCommand(
        id: 'tea-command',
        ticketId: 'tea-order',
        expectedVersion: 0,
        lines: [line],
      ),
      const {},
    );
    final restored = CafeOrderTicket.fromJson(
      jsonDecode(jsonEncode(ticket.toJson())),
    );
    expect(restored.lines.single.productName, 'Tea');
    expect(restored.lines.single.copyWithQuantity(2).productName, 'Tea');
    expect(restored.lastCommandFingerprint, ticket.lastCommandFingerprint);
  });

  test(
    'legacy v19 ticket stays readable and completes without routing',
    () async {
      final legacyLine = CafeOrderLine.fromJson({
        'id': 'legacy-line',
        'productId': 'tea',
        'quantity': 1,
        'baseUnitPriceMmk': 2000,
        'remark': '',
        'modifiers': <Object>[],
      });
      final command = CafeOrderCommand(
        id: 'legacy-command',
        ticketId: 'legacy-order',
        expectedVersion: 0,
        lines: [legacyLine],
      );
      final ticket = applyCafeOrderCommand(null, command, const {});
      final encoded = jsonEncode(ticket.toJson());
      expect(encoded, isNot(contains('preparationStation')));
      expect(encoded, isNot(contains('productName')));
      expect(
        CafeOrderTicket.fromJson(jsonDecode(encoded)).lastCommandFingerprint,
        ticket.lastCommandFingerprint,
      );
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2000,
          openingStock: 2,
        );
        final stored = await store.applyCommand(command, const {});
        expect(stored.kitchenDispatchLines, isEmpty);
        await database.customUpdate(
          'DELETE FROM shop_sync_outbox WHERE operation_id = ?',
          variables: [
            Variable<String>(cafeKitchenDispatchOperationId(stored.ticket)),
          ],
        );
        expect(
          (await store.read('legacy-order'))?.kitchenDispatchLines,
          isEmpty,
        );
        await store.hold(
          orderId: 'legacy-order',
          operationId: 'legacy-hold',
          expectedStateRevision: 0,
        );
        expect(
          await database
              .customSelect(
                "SELECT COUNT(*) AS count FROM shop_sync_outbox WHERE event_type = 'shop.cafe_kitchen_dispatch.recorded.v1'",
              )
              .map((row) => row.read<int>('count'))
              .getSingle(),
          1,
        );
        final resumed = await store.resume(
          orderId: 'legacy-order',
          operationId: 'legacy-resume',
          expectedStateRevision: 1,
        );
        expect(resumed.kitchenDispatchLines, isEmpty);
        final receipt = await store.completeCash(
          orderId: 'legacy-order',
          operationId: 'legacy-sale',
          expectedTicketVersion: 1,
          expectedStateRevision: 2,
        );
        expect(receipt.totalMmk, 2000);
        expect((await database.readActiveProducts()).single.onHand, 1);
        final payload = jsonDecode(
          (await database
                  .customSelect(
                    "SELECT payload_json FROM shop_sync_outbox WHERE operation_id = 'legacy-sale'",
                  )
                  .getSingle())
              .read<String>('payload_json'),
        ) as Map;
        final savedLine = (payload['lines'] as List).single as Map;
        expect(savedLine, isNot(contains('kitchenTicketId')));
        final dispatchHistory = [
          for (final row
              in await database
                  .customSelect(
                    "SELECT payload_json FROM shop_sync_outbox WHERE event_type = 'shop.cafe_kitchen_dispatch.recorded.v1'",
                  )
                  .get())
            cafeKitchenDispatchFromPayload(
              jsonDecode(row.read<String>('payload_json')),
            ),
        ];
        expect(
          cafeKitchenDispatchHistoryValid(dispatchHistory, [ticket]),
          isTrue,
        );
        await database.verifyReadyForUse();
      } finally {
        await database.close();
      }
    },
  );

  test(
    'encrypted backup preserves active table and routing snapshots',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'cafe-routing-backup-',
      );
      final source = File('${root.path}/source.sqlite');
      final restored = File('${root.path}/restored.sqlite');
      final archive = File('${root.path}/shop.smbk');
      try {
        var database = ShopDatabase(NativeDatabase(source));
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2000,
          openingStock: 4,
        );
        final sourceStore = ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        );
        await sourceStore.applyCommand(
          CafeOrderCommand(
            id: 'backup-command',
            ticketId: 'backup-order',
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: 'Patio',
              tableLabel: 'P-2',
            ),
            lines: [
              CafeOrderLine(
                id: 'tea-1',
                productId: 'tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: '',
                preparationStation: 'bar',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        await sourceStore.advanceKitchenStatus(
          orderId: 'backup-order',
          lineId: 'tea-1',
          operationId: 'backup-preparing',
          expectedTicketVersion: 1,
          expectedStatus: 'pending_local',
        );
        await ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        ).applyCommand(
          CafeOrderCommand(
            id: 'legacy-backup-command',
            ticketId: 'legacy-backup-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.fromJson({
                'id': 'legacy-tea',
                'productId': 'tea',
                'quantity': 1,
                'baseUnitPriceMmk': 2000,
                'remark': '',
                'modifiers': <Object>[],
              }),
            ],
          ),
          const {},
        );
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          scratchRoot: Directory('${root.path}/scratch'),
          password: 'routing-backup-password',
        );
        await database.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'routing-backup-password',
        );
        database = ShopDatabase(NativeDatabase(restored));
        final order = await ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        ).read('backup-order');
        expect(order?.ticket.serviceContext?.tableLabel, 'P-2');
        expect(order?.ticket.lines.single.preparationStation, 'bar');
        expect(order?.kitchenStatusByLine['tea-1'], 'preparing_local');
        final legacy = await ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        ).read('legacy-backup-order');
        expect(legacy?.kitchenDispatchLines, isEmpty);
        expect(
          jsonEncode(legacy?.ticket.toJson()),
          isNot(contains('preparationStation')),
        );
        await database.verifyReadyForUse();
        await database.close();
      } finally {
        await root.delete(recursive: true);
      }
    },
  );

  test('untracked legacy v2 order remains locally completable', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: _premiumKitchen,
    );
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2000,
        openingStock: 4,
      );
      CafeOrderLine legacyLine(int quantity) => CafeOrderLine.fromJson({
        'id': 'legacy-v2-line',
        'productId': 'tea',
        'quantity': quantity,
        'baseUnitPriceMmk': 2000,
        'remark': '',
        'modifiers': <Object>[],
      });
      await store.applyCommand(
        CafeOrderCommand(
          id: 'legacy-v2-command-1',
          ticketId: 'legacy-v2-order',
          expectedVersion: 0,
          lines: [legacyLine(1)],
        ),
        const {},
      );
      final current = await store.applyCommand(
        CafeOrderCommand(
          id: 'legacy-v2-command-2',
          ticketId: 'legacy-v2-order',
          expectedVersion: 1,
          lines: [legacyLine(2)],
        ),
        const {},
      );
      final ticketBytes = jsonEncode(current.ticket.toJson());
      await database.customUpdate(
        "DELETE FROM shop_sync_outbox WHERE event_type = 'shop.cafe_kitchen_dispatch.recorded.v1'",
      );
      final reopened = await store.read('legacy-v2-order');
      expect(jsonEncode(reopened?.ticket.toJson()), ticketBytes);
      await store.hold(
        orderId: 'legacy-v2-order',
        operationId: 'legacy-v2-hold',
        expectedStateRevision: 0,
      );
      await store.resume(
        orderId: 'legacy-v2-order',
        operationId: 'legacy-v2-resume',
        expectedStateRevision: 1,
      );
      await store.completeCash(
        orderId: 'legacy-v2-order',
        operationId: 'legacy-v2-sale',
        expectedTicketVersion: 2,
        expectedStateRevision: 2,
      );
      expect((await database.readActiveProducts()).single.onHand, 2);
      final completed = await store.read('legacy-v2-order');
      expect(jsonEncode(completed?.ticket.toJson()), ticketBytes);
      expect(
        completed?.ticket.lastCommandFingerprint,
        current.ticket.lastCommandFingerprint,
      );
      await database.verifyReadyForUse();
    } finally {
      await database.close();
    }
  });

  test('invalid station and blank service context fail closed', () async {
    expect(
      () => CafeOrderLine(
        id: 'line',
        productId: 'tea',
        quantity: 1,
        baseUnitPriceMmk: 2000,
        remark: '',
        preparationStation: 'printer',
        modifiers: const [],
      ),
      throwsFormatException,
    );
    expect(
      () => CafeServiceContext.fromJson({'areaLabel': '', 'tableLabel': ''}),
      throwsFormatException,
    );
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await expectLater(
        ShopCafeOrderStore(
          database,
          kitchenEntitlement: _premiumKitchen,
        ).applyCommand(
          CafeOrderCommand(
            id: 'invalid-context-command',
            ticketId: 'invalid-context-order',
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: ' ',
              tableLabel: '',
            ),
            lines: [
              CafeOrderLine(
                id: 'line',
                productId: 'tea',
                quantity: 1,
                baseUnitPriceMmk: 2000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        ),
        throwsFormatException,
      );
      expect(
        await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_cafe_orders')
            .map((row) => row.read<int>('count'))
            .getSingle(),
        0,
      );
    } finally {
      await database.close();
    }
  });

  test('dispatch history rejects orphan and deleted versions', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: _premiumKitchen,
    );
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2000,
        openingStock: 3,
      );
      CafeOrderLine line(String id) => CafeOrderLine(
        id: id,
        productId: 'tea',
        quantity: 1,
        baseUnitPriceMmk: 2000,
        remark: '',
        modifiers: const [],
      );
      final first = await store.applyCommand(
        CafeOrderCommand(
          id: 'history-v1',
          ticketId: 'history-order',
          expectedVersion: 0,
          lines: [line('line-1')],
        ),
        const {},
      );
      await store.applyCommand(
        CafeOrderCommand(
          id: 'history-v2',
          ticketId: 'history-order',
          expectedVersion: 1,
          lines: [line('line-1'), line('line-2')],
        ),
        const {},
      );
      final orphan = applyCafeOrderCommand(
        null,
        CafeOrderCommand(
          id: 'orphan-command',
          ticketId: 'orphan-order',
          expectedVersion: 0,
          lines: [line('orphan-line')],
        ),
        const {},
      );
      final orphanLines = [
        CafeKitchenDispatchLine(
          lineId: 'orphan-line',
          ticketId: cafeKitchenTicketId('orphan-order', 'orphan-line'),
          sequence: 1,
          preparationStation: 'kitchen',
        ),
      ];
      await database.customInsert(
        "INSERT INTO shop_sync_outbox (operation_id, event_type, payload_json, state, created_at_millis) VALUES (?, 'shop.cafe_kitchen_dispatch.recorded.v1', ?, 'pending', 1)",
        variables: [
          Variable<String>(cafeKitchenDispatchOperationId(orphan)),
          Variable<String>(
            jsonEncode(cafeKitchenDispatchPayload(orphan, orphanLines, 1)),
          ),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.customUpdate(
        'DELETE FROM shop_sync_outbox WHERE operation_id = ?',
        variables: [Variable<String>(cafeKitchenDispatchOperationId(orphan))],
      );
      await database.verifyReadyForUse();
      await database.customUpdate(
        'DELETE FROM shop_sync_outbox WHERE operation_id = ?',
        variables: [
          Variable<String>(cafeKitchenDispatchOperationId(first.ticket)),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
    } finally {
      await database.close();
    }
  });
}

Future<Map<String, List<Map<String, Object?>>>> _cafeDispatchRecoveryState(
  ShopDatabase database, {
  required String orderId,
}) async {
  Future<List<Map<String, Object?>>> rows(
    String statement,
    List<Variable<Object>> variables,
  ) async =>
      (await database.customSelect(statement, variables: variables).get())
          .map((row) => Map<String, Object?>.from(row.data))
          .toList(growable: false);

  return {
    'orders': await rows(
      'SELECT id, state, state_revision, ticket_version, ticket_json, '
      'total_mmk, last_command_id, last_command_fingerprint '
      'FROM shop_cafe_orders WHERE id = ? ORDER BY id',
      [Variable<String>(orderId)],
    ),
    'dispatchOutbox': await rows(
      'SELECT operation_id, event_type, payload_json, state '
      'FROM shop_sync_outbox WHERE event_type = '
      "'shop.cafe_kitchen_dispatch.recorded.v1' "
      "AND json_extract(payload_json, '\$.orderId') = ? "
      'ORDER BY operation_id',
      [Variable<String>(orderId)],
    ),
    'statusOutbox': await rows(
      'SELECT operation_id, event_type, payload_json, state '
      'FROM shop_sync_outbox WHERE event_type = ? '
      "AND json_extract(payload_json, '\$.orderId') = ? "
      'ORDER BY operation_id',
      [
        const Variable<String>(cafeKitchenStatusEventType),
        Variable<String>(orderId),
      ],
    ),
    'products': await rows(
      'SELECT id, on_hand FROM shop_products WHERE id = ? ORDER BY id',
      [const Variable<String>('dispatch-tea')],
    ),
    'movements': await rows(
      'SELECT id, product_id, quantity_delta, reason '
      'FROM shop_stock_movements WHERE product_id = ? ORDER BY id',
      [const Variable<String>('dispatch-tea')],
    ),
    'sales': await rows(
      'SELECT id, operation_id, total_mmk, payment_method '
      'FROM shop_sales ORDER BY id',
      const [],
    ),
  };
}

const _premiumKitchen = _AllowKitchenEntitlement();

class _AllowKitchenEntitlement implements ShopCafeKitchenEntitlement {
  const _AllowKitchenEntitlement();

  @override
  bool get allowsKitchenDispatch => true;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {}
}
