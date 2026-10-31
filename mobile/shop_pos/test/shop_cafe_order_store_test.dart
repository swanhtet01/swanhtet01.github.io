import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';

const _soy = CafeModifierSnapshot(
  id: 'soy',
  version: 1,
  labelEn: 'Soy milk',
  labelMy: 'ပဲနို့',
  priceDeltaMmk: 500,
);
final _clock = DateTime.fromMillisecondsSinceEpoch(2000000000000);
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

void main() {
  test(
    'splits whole-unit quantity then completes both bills exactly once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(database, clock: () => _clock);
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'quantity-split-create',
            ticketId: 'quantity-split-source',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'quantity-split-line',
                productId: 'coffee',
                quantity: 3,
                baseUnitPriceMmk: 3000,
                remark: 'less ice',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final salesBefore = await database.countSales();
        final outboxBefore = await database.countOutboxOperations();

        for (final invalid in const [0, 3, 4]) {
          await expectLater(
            store.splitLocalBillQuantities(
              sourceOrderId: created.ticket.id,
              destinationOrderId: 'invalid-quantity-$invalid',
              operationId: 'invalid-quantity-operation-$invalid',
              expectedTicketVersion: created.ticket.version,
              expectedStateRevision: created.stateRevision,
              movedLineQuantities: {'quantity-split-line': invalid},
            ),
            throwsArgumentError,
          );
          expect(await store.read('invalid-quantity-$invalid'), isNull);
        }
        expect(await database.countOutboxOperations(), outboxBefore);

        final split = await store.splitLocalBillQuantities(
          sourceOrderId: created.ticket.id,
          destinationOrderId: 'quantity-split-destination',
          operationId: 'quantity-split-operation',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
          movedLineQuantities: const {'quantity-split-line': 1},
        );
        expect(split.source.ticket.lines.single.quantity, 2);
        expect(split.destination.ticket.lines.single.quantity, 1);
        expect(split.source.totalMmk, 6000);
        expect(split.destination.totalMmk, 3000);
        expect(split.source.totalMmk + split.destination.totalMmk, 9000);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(await database.countSales(), salesBefore);
        expect(await database.countOutboxOperations(), outboxBefore + 3);

        final replay = await store.splitLocalBillQuantities(
          sourceOrderId: created.ticket.id,
          destinationOrderId: 'quantity-split-destination',
          operationId: 'quantity-split-operation',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
          movedLineQuantities: const {'quantity-split-line': 1},
        );
        expect(replay.source.ticket.version, split.source.ticket.version);
        expect(await database.countOutboxOperations(), outboxBefore + 3);
        await expectLater(
          store.splitLocalBillQuantities(
            sourceOrderId: created.ticket.id,
            destinationOrderId: 'quantity-split-destination',
            operationId: 'quantity-split-operation',
            expectedTicketVersion: created.ticket.version,
            expectedStateRevision: created.stateRevision,
            movedLineQuantities: const {'quantity-split-line': 2},
          ),
          throwsStateError,
        );

        final sourceReceipt = await store.completeCash(
          orderId: split.source.ticket.id,
          operationId: 'quantity-source-sale',
          expectedTicketVersion: split.source.ticket.version,
          expectedStateRevision: split.source.stateRevision,
        );
        final destinationReceipt = await store.completeCash(
          orderId: split.destination.ticket.id,
          operationId: 'quantity-destination-sale',
          expectedTicketVersion: split.destination.ticket.version,
          expectedStateRevision: split.destination.stateRevision,
        );
        expect(sourceReceipt.totalMmk + destinationReceipt.totalMmk, 9000);
        expect(await database.countSales(), salesBefore + 2);
        expect((await database.readActiveProducts()).single.onHand, 7);
        await database.verifyReadyForUse();
      } finally {
        await database.close();
      }
    },
  );

  test(
    'splits whole unrouted lines then completes both bills exactly once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(database, clock: () => _clock);
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'split-create',
            ticketId: 'split-source',
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: 'Ground floor',
              tableLabel: 'T-02',
            ),
            lines: [
              CafeOrderLine.local(
                id: 'split-cup-1',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
              CafeOrderLine.local(
                id: 'split-cup-2',
                productId: 'coffee',
                quantity: 2,
                baseUnitPriceMmk: 3000,
                remark: 'take away',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final salesBefore = await database.countSales();
        final outboxBefore = await database.countOutboxOperations();

        final split = await store.splitLocalBill(
          sourceOrderId: created.ticket.id,
          destinationOrderId: 'split-destination',
          operationId: 'split-operation',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
          movedLineIds: const ['split-cup-2'],
        );
        expect(split.source.ticket.lines.map((line) => line.id), [
          'split-cup-1',
        ]);
        expect(split.destination.ticket.lines.map((line) => line.id), [
          'split-cup-2',
        ]);
        expect(split.source.totalMmk, 3000);
        expect(split.destination.totalMmk, 6000);
        expect(split.source.ticket.serviceContext?.tableLabel, 'T-02');
        expect(split.destination.ticket.serviceContext?.tableLabel, 'T-02');
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(await database.countSales(), salesBefore);
        expect(await database.countOutboxOperations(), outboxBefore + 3);

        final replay = await store.splitLocalBill(
          sourceOrderId: created.ticket.id,
          destinationOrderId: 'split-destination',
          operationId: 'split-operation',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
          movedLineIds: const ['split-cup-2'],
        );
        expect(replay.source.ticket.version, split.source.ticket.version);
        expect(
          replay.destination.ticket.version,
          split.destination.ticket.version,
        );
        expect(await database.countOutboxOperations(), outboxBefore + 3);
        await expectLater(
          store.splitLocalBill(
            sourceOrderId: created.ticket.id,
            destinationOrderId: 'split-other-destination',
            operationId: 'split-operation',
            expectedTicketVersion: created.ticket.version,
            expectedStateRevision: created.stateRevision,
            movedLineIds: const ['split-cup-2'],
          ),
          throwsStateError,
        );

        final sourceReceipt = await store.completeCash(
          orderId: split.source.ticket.id,
          operationId: 'split-source-sale',
          expectedTicketVersion: split.source.ticket.version,
          expectedStateRevision: split.source.stateRevision,
        );
        final destinationReceipt = await store.completeCash(
          orderId: split.destination.ticket.id,
          operationId: 'split-destination-sale',
          expectedTicketVersion: split.destination.ticket.version,
          expectedStateRevision: split.destination.stateRevision,
        );
        final sourceReplay = await store.completeCash(
          orderId: split.source.ticket.id,
          operationId: 'split-source-sale',
          expectedTicketVersion: split.source.ticket.version,
          expectedStateRevision: split.source.stateRevision,
        );
        final destinationReplay = await store.completeCash(
          orderId: split.destination.ticket.id,
          operationId: 'split-destination-sale',
          expectedTicketVersion: split.destination.ticket.version,
          expectedStateRevision: split.destination.stateRevision,
        );
        expect(sourceReplay.id, sourceReceipt.id);
        expect(destinationReplay.id, destinationReceipt.id);
        expect(await database.countSales(), salesBefore + 2);
        expect((await database.readActiveProducts()).single.onHand, 7);
        await database.verifyReadyForUse();
      } finally {
        await database.close();
      }
    },
  );

  test(
    'split rejects routed stale or whole-order moves without effects',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final routed = await store.applyCommand(
          _command('routed-source', 'routed-create', 0),
          {_soy.key: _soy},
        );
        final local = await store.applyCommand(
          CafeOrderCommand(
            id: 'local-create',
            ticketId: 'local-source',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'local-1',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
              CafeOrderLine.local(
                id: 'local-2',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final ordersBefore = await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_cafe_orders')
            .map((row) => row.read<int>('count'))
            .getSingle();
        final outboxBefore = await database.countOutboxOperations();
        final stockBefore = (await database.readActiveProducts()).single.onHand;

        await expectLater(
          store.splitLocalBill(
            sourceOrderId: routed.ticket.id,
            destinationOrderId: 'routed-destination',
            operationId: 'routed-split',
            expectedTicketVersion: routed.ticket.version,
            expectedStateRevision: routed.stateRevision,
            movedLineIds: const ['cup-1'],
          ),
          throwsStateError,
        );
        await expectLater(
          store.splitLocalBill(
            sourceOrderId: local.ticket.id,
            destinationOrderId: 'stale-destination',
            operationId: 'stale-split',
            expectedTicketVersion: local.ticket.version + 1,
            expectedStateRevision: local.stateRevision,
            movedLineIds: const ['local-1'],
          ),
          throwsStateError,
        );
        await expectLater(
          store.splitLocalBill(
            sourceOrderId: local.ticket.id,
            destinationOrderId: 'whole-destination',
            operationId: 'whole-split',
            expectedTicketVersion: local.ticket.version,
            expectedStateRevision: local.stateRevision,
            movedLineIds: const ['local-1', 'local-2'],
          ),
          throwsArgumentError,
        );
        await database.customStatement('''
          CREATE TRIGGER fail_cafe_split_audit
          BEFORE INSERT ON shop_sync_outbox
          WHEN NEW.event_type IN (
            'shop.cafe_order.split.v1',
            'shop.cafe_order.quantity-split.v2'
          )
          BEGIN
            SELECT RAISE(ABORT, 'synthetic split audit failure');
          END
        ''');
        await expectLater(
          store.splitLocalBillQuantities(
            sourceOrderId: local.ticket.id,
            destinationOrderId: 'rollback-destination',
            operationId: 'rollback-split',
            expectedTicketVersion: local.ticket.version,
            expectedStateRevision: local.stateRevision,
            movedLineQuantities: const {'local-2': 1},
          ),
          throwsA(anything),
        );
        await database.customStatement('DROP TRIGGER fail_cafe_split_audit');

        expect(
          await database
              .customSelect('SELECT COUNT(*) AS count FROM shop_cafe_orders')
              .map((row) => row.read<int>('count'))
              .getSingle(),
          ordersBefore,
        );
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(await database.countSales(), 0);
        expect((await store.read(local.ticket.id))?.ticket.version, 1);
        expect(await store.read('rollback-destination'), isNull);
        await database.verifyReadyForUse();
      } finally {
        await database.close();
      }
    },
  );

  test('readiness and backup require the split audit event', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-split-audit-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      final store = ShopCafeOrderStore(database, clock: () => _clock);
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'required-audit-create',
          ticketId: 'required-audit-source',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'required-audit-1',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
            CafeOrderLine.local(
              id: 'required-audit-2',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await store.splitLocalBill(
        sourceOrderId: created.ticket.id,
        destinationOrderId: 'required-audit-destination',
        operationId: 'required-audit-split',
        expectedTicketVersion: created.ticket.version,
        expectedStateRevision: created.stateRevision,
        movedLineIds: const ['required-audit-2'],
      );
      await database.verifyReadyForUse();
      await database.close();
      ShopBackup.verifyRuntimeStore(file);

      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute(
          "DELETE FROM shop_sync_outbox "
          "WHERE event_type = 'shop.cafe_order.split.v1'",
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifyRuntimeStore(file),
        throwsA(isA<FormatException>()),
      );
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('unchanged unpaid quantity split reverses exactly once without money or stock effects', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-split-reversal-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      var store = ShopCafeOrderStore(database, clock: () => _clock);
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'reversal-create',
          ticketId: 'reversal-source',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'reversal-line',
              productId: 'coffee',
              quantity: 3,
              baseUnitPriceMmk: 3000,
              remark: 'less ice',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final split = await store.splitLocalBillQuantities(
        sourceOrderId: created.ticket.id,
        destinationOrderId: 'reversal-destination',
        operationId: 'reversal-split',
        expectedTicketVersion: created.ticket.version,
        expectedStateRevision: created.stateRevision,
        movedLineQuantities: const {'reversal-line': 1},
      );
      final candidates = await store.readSplitReversalCandidates();
      expect(candidates, hasLength(1));
      expect(candidates.single.source.ticket.lines.single.quantity, 2);
      expect(candidates.single.destination.ticket.lines.single.quantity, 1);
      final outboxBefore = await database.countOutboxOperations();
      final result = await store.reverseLocalSplit(
        splitOperationId: 'reversal-split',
        operationId: 'reversal-undo',
        expectedSourceTicketVersion: split.source.ticket.version,
        expectedSourceStateRevision: split.source.stateRevision,
        expectedDestinationTicketVersion: split.destination.ticket.version,
        expectedDestinationStateRevision: split.destination.stateRevision,
      );
      expect(result.source.ticket.lines.single.quantity, 3);
      expect(result.source.totalMmk, 9000);
      expect(result.destination.state, 'cancelled');
      expect(await store.readActive(), hasLength(1));
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(await database.countOutboxOperations(), outboxBefore + 3);

      final replay = await store.reverseLocalSplit(
        splitOperationId: 'reversal-split',
        operationId: 'reversal-undo',
        expectedSourceTicketVersion: split.source.ticket.version,
        expectedSourceStateRevision: split.source.stateRevision,
        expectedDestinationTicketVersion: split.destination.ticket.version,
        expectedDestinationStateRevision: split.destination.stateRevision,
      );
      expect(replay.source.ticket.toJson(), result.source.ticket.toJson());
      expect(await database.countOutboxOperations(), outboxBefore + 3);
      await database.verifyReadyForUse();
      await database.close();
      ShopBackup.verifyRuntimeStore(file);

      database = ShopDatabase(NativeDatabase(file));
      store = ShopCafeOrderStore(database);
      expect((await store.read('reversal-source'))?.totalMmk, 9000);
      expect((await store.read('reversal-destination'))?.state, 'cancelled');
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      final reversalRow = await database
          .customSelect(
            'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
            variables: const [Variable<String>('reversal-undo')],
          )
          .getSingle();
      final tampered = jsonDecode(
        reversalRow.read<String>('payload_json'),
      ) as Map<String, dynamic>;
      tampered['destinationCancellationFingerprint'] = '0' * 64;
      await database.customUpdate(
        'UPDATE shop_sync_outbox SET payload_json = ? '
        'WHERE operation_id = ?',
        variables: [
          Variable<String>(jsonEncode(tampered)),
          const Variable<String>('reversal-undo'),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      expect(
        () => ShopBackup.verifyRuntimeStore(file),
        throwsA(isA<FormatException>()),
      );
      database = ShopDatabase(NativeDatabase(file));
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'split reversal audit failure rolls back both bills atomically',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final store = ShopCafeOrderStore(database, clock: () => _clock);
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'rollback-undo-create',
            ticketId: 'rollback-undo-source',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'rollback-undo-line',
                productId: 'coffee',
                quantity: 2,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final split = await store.splitLocalBillQuantities(
          sourceOrderId: created.ticket.id,
          destinationOrderId: 'rollback-undo-destination',
          operationId: 'rollback-undo-split',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
          movedLineQuantities: const {'rollback-undo-line': 1},
        );
        final outboxBefore = await database.countOutboxOperations();
        await database.customStatement('''
        CREATE TRIGGER fail_cafe_unsplit_audit
        BEFORE INSERT ON shop_sync_outbox
        WHEN NEW.event_type = 'shop.cafe_order.split-reversed.v1'
        BEGIN
          SELECT RAISE(ABORT, 'injected split reversal audit failure');
        END
      ''');
        await expectLater(
          store.reverseLocalSplit(
            splitOperationId: 'rollback-undo-split',
            operationId: 'rollback-undo-operation',
            expectedSourceTicketVersion: split.source.ticket.version,
            expectedSourceStateRevision: split.source.stateRevision,
            expectedDestinationTicketVersion: split.destination.ticket.version,
            expectedDestinationStateRevision: split.destination.stateRevision,
          ),
          throwsA(anything),
        );
        await database.customStatement('DROP TRIGGER fail_cafe_unsplit_audit');
        final source = await store.read(split.source.ticket.id);
        final destination = await store.read(split.destination.ticket.id);
        expect(source?.ticket.lines.single.quantity, 1);
        expect(destination?.ticket.lines.single.quantity, 1);
        expect(source?.state, 'open');
        expect(destination?.state, 'open');
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          await database
              .customSelect(
                'SELECT COUNT(*) AS count FROM shop_cafe_order_cancellations',
              )
              .map((row) => row.read<int>('count'))
              .getSingle(),
          0,
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 10);
        await database.verifyReadyForUse();
      } finally {
        await database.close();
      }
    },
  );

  test(
    'distinct configured lines hold resume and complete exactly once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final outboxBefore = await database.countOutboxOperations();
        final created = await store.applyCommand(
          _command('order-1', 'command-1', 0),
          {_soy.key: _soy},
        );
        expect(created.ticket.lines.map((line) => line.id), ['cup-1', 'cup-2']);
        expect(created.totalMmk, 7000);
        final held = await store.hold(
          orderId: created.ticket.id,
          operationId: 'hold-1',
          expectedStateRevision: 0,
        );
        expect(held.state, 'held');
        final heldReplay = await store.hold(
          orderId: created.ticket.id,
          operationId: 'hold-1',
          expectedStateRevision: 0,
        );
        expect(heldReplay.stateRevision, 1);
        final resumed = await store.resume(
          orderId: created.ticket.id,
          operationId: 'resume-1',
          expectedStateRevision: 1,
        );
        final receipt = await store.completeCash(
          orderId: created.ticket.id,
          operationId: 'cafe-sale-1',
          expectedTicketVersion: 1,
          expectedStateRevision: resumed.stateRevision,
          cashTenderedMmk: 10000,
        );
        final replay = await store.completeCash(
          orderId: created.ticket.id,
          operationId: 'cafe-sale-1',
          expectedTicketVersion: 1,
          expectedStateRevision: resumed.stateRevision,
          cashTenderedMmk: 10000,
        );
        expect(replay.id, receipt.id);
        expect(receipt.totalMmk, 7000);
        expect(receipt.cashTenderedMmk, 10000);
        expect(receipt.cashChangeMmk, 3000);
        expect(receipt.lines, hasLength(2));
        expect(receipt.lines.map((line) => line.productId).toSet(), {'coffee'});
        expect(receipt.lines.first.productName, contains('Soy milk/ပဲနို့'));
        expect(receipt.lines.last.productName, contains('less ice'));
        expect((await database.readActiveProducts()).single.onHand, 8);
        expect(await database.countSales(), 1);
        expect(await database.countOutboxOperations(), outboxBefore + 2);
        expect((await store.read('order-1'))?.state, 'completed');
        await expectLater(
          store.completeCash(
            orderId: created.ticket.id,
            operationId: 'cafe-sale-1',
            expectedTicketVersion: 1,
            expectedStateRevision: resumed.stateRevision,
            cashTenderedMmk: 11000,
          ),
          throwsStateError,
        );
      } finally {
        await database.close();
      }
    },
  );

  test('failed hold update rolls back its state event and retries after reopen', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-cafe-hold-update-abort-',
    );
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    var store = ShopCafeOrderStore(
      database,
      clock: () => _clock,
      kitchenEntitlement: _premiumKitchen,
    );
    const orderId = 'hold-recovery-order';
    const operationId = 'hold-recovery-operation';
    try {
      await database.addProduct(
        id: 'hold-recovery-coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 5,
      );
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'hold-recovery-create',
          ticketId: orderId,
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'hold-recovery-line',
              productId: 'hold-recovery-coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
              preparationStation: 'bar',
            ),
          ],
        ),
        const {},
      );
      final preparing = await store.advanceKitchenStatus(
        orderId: orderId,
        lineId: 'hold-recovery-line',
        operationId: 'hold-recovery-preparing',
        expectedTicketVersion: created.ticket.version,
        expectedStatus: 'pending_local',
      );
      expect(
        preparing.kitchenStatusByLine['hold-recovery-line'],
        'preparing_local',
      );
      final before = await _cafeTransitionRecoveryState(
        database,
        orderId: orderId,
      );
      await database.customStatement(
        'CREATE TEMP TRIGGER synthetic_cafe_hold_update_abort '
        'BEFORE UPDATE ON shop_cafe_orders '
        "WHEN OLD.id = '$orderId' AND NEW.state = 'held' "
        "AND NEW.last_state_operation_id = '$operationId' "
        "BEGIN SELECT RAISE(ABORT, 'synthetic cafe hold update failure'); END",
      );

      Future<StoredCafeOrder> hold() => store.hold(
        orderId: orderId,
        operationId: operationId,
        expectedStateRevision: created.stateRevision,
      );

      await expectLater(
        hold(),
        throwsA(
          predicate<Object>(
            (error) =>
                error.toString().contains('synthetic cafe hold update failure'),
          ),
        ),
      );
      expect(
        await _cafeTransitionRecoveryState(database, orderId: orderId),
        before,
      );

      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      expect(
        await _cafeTransitionRecoveryState(database, orderId: orderId),
        before,
      );

      final held = await hold();
      expect(held.state, 'held');
      expect(held.stateRevision, 1);
      expect(held.ticket.version, created.ticket.version);
      expect(held.kitchenStatusByLine['hold-recovery-line'], 'preparing_local');
      final completed = await _cafeTransitionRecoveryState(
        database,
        orderId: orderId,
      );
      expect(completed['products'], before['products']);
      expect(completed['movements'], before['movements']);
      expect(completed['sales'], before['sales']);
      expect(completed['outbox'], before['outbox']);
      final orders = completed['orders']!;
      expect(orders, hasLength(1));
      expect(orders.single['state'], 'held');
      expect(orders.single['state_revision'], 1);
      expect(orders.single['ticket_version'], created.ticket.version);
      expect(orders.single['last_state_operation_id'], operationId);
      final events = completed['stateEvents']!;
      expect(events, hasLength(1));
      expect(events.single['operation_id'], operationId);
      expect(events.single['order_id'], orderId);
      expect(events.single['from_state'], 'open');
      expect(events.single['to_state'], 'held');
      expect(events.single['expected_state_revision'], 0);
      expect(events.single['resulting_state_revision'], 1);
      expect(events.single['sale_id'], isNull);

      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      await hold();
      expect(
        await _cafeTransitionRecoveryState(database, orderId: orderId),
        completed,
      );
      await database.verifyReadyForUse();
    } finally {
      await database.close();
      await directory.delete(recursive: true);
    }
  });

  test(
    'failed resume update rolls back its state event and retries after reopen',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-cafe-resume-update-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      var store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      const orderId = 'resume-recovery-order';
      const operationId = 'resume-recovery-operation';
      try {
        await database.addProduct(
          id: 'hold-recovery-coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 5,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'resume-recovery-create',
            ticketId: orderId,
            expectedVersion: 0,
            lines: [
              CafeOrderLine(
                id: 'resume-recovery-line',
                productId: 'hold-recovery-coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
                preparationStation: 'bar',
              ),
            ],
          ),
          const {},
        );
        final preparing = await store.advanceKitchenStatus(
          orderId: orderId,
          lineId: 'resume-recovery-line',
          operationId: 'resume-recovery-preparing',
          expectedTicketVersion: created.ticket.version,
          expectedStatus: 'pending_local',
        );
        expect(
          preparing.kitchenStatusByLine['resume-recovery-line'],
          'preparing_local',
        );
        final held = await store.hold(
          orderId: orderId,
          operationId: 'resume-recovery-hold',
          expectedStateRevision: created.stateRevision,
        );
        expect(held.state, 'held');
        final before = await _cafeTransitionRecoveryState(
          database,
          orderId: orderId,
        );
        expect(before['stateEvents'], hasLength(1));
        await database.customStatement(
          'CREATE TEMP TRIGGER synthetic_cafe_resume_update_abort '
          'BEFORE UPDATE ON shop_cafe_orders '
          "WHEN OLD.id = '$orderId' AND NEW.state = 'open' "
          "AND NEW.last_state_operation_id = '$operationId' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic cafe resume update failure'); END",
        );

        Future<StoredCafeOrder> resume() => store.resume(
          orderId: orderId,
          operationId: operationId,
          expectedStateRevision: held.stateRevision,
        );

        await expectLater(
          resume(),
          throwsA(
            predicate<Object>(
              (error) => error.toString().contains(
                'synthetic cafe resume update failure',
              ),
            ),
          ),
        );
        expect(
          await _cafeTransitionRecoveryState(database, orderId: orderId),
          before,
        );

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(
          database,
          clock: () => _clock,
          kitchenEntitlement: _premiumKitchen,
        );
        expect(
          await _cafeTransitionRecoveryState(database, orderId: orderId),
          before,
        );

        final resumed = await resume();
        expect(resumed.state, 'open');
        expect(resumed.stateRevision, 2);
        expect(resumed.ticket.version, created.ticket.version);
        expect(
          resumed.kitchenStatusByLine['resume-recovery-line'],
          'preparing_local',
        );
        final completed = await _cafeTransitionRecoveryState(
          database,
          orderId: orderId,
        );
        expect(completed['products'], before['products']);
        expect(completed['movements'], before['movements']);
        expect(completed['sales'], before['sales']);
        expect(completed['outbox'], before['outbox']);
        final orders = completed['orders']!;
        expect(orders, hasLength(1));
        expect(orders.single['state'], 'open');
        expect(orders.single['state_revision'], 2);
        expect(orders.single['ticket_version'], created.ticket.version);
        expect(orders.single['last_state_operation_id'], operationId);
        final events = completed['stateEvents']!;
        expect(events, hasLength(2));
        final resumeEvent = events.singleWhere(
          (event) => event['operation_id'] == operationId,
        );
        expect(resumeEvent['order_id'], orderId);
        expect(resumeEvent['from_state'], 'held');
        expect(resumeEvent['to_state'], 'open');
        expect(resumeEvent['expected_state_revision'], 1);
        expect(resumeEvent['resulting_state_revision'], 2);
        expect(resumeEvent['sale_id'], isNull);

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(
          database,
          clock: () => _clock,
          kitchenEntitlement: _premiumKitchen,
        );
        await resume();
        expect(
          await _cafeTransitionRecoveryState(database, orderId: orderId),
          completed,
        );
        await database.verifyReadyForUse();
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    },
  );

  test('concurrent cafe cash retries commit one sale after reopen', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-concurrent-cash-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      await store.applyCommand(
        _command('concurrent-order', 'concurrent-create', 0),
        {_soy.key: _soy},
      );

      final receipts = await Future.wait([
        for (var attempt = 0; attempt < 24; attempt++)
          store.completeCash(
            orderId: 'concurrent-order',
            operationId: 'concurrent-cafe-sale',
            expectedTicketVersion: 1,
            expectedStateRevision: 0,
          ),
      ]);
      expect(receipts.map((receipt) => receipt.id).toSet(), {
        'concurrent-cafe-sale',
      });
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 8);
      final reopened = await ShopCafeOrderStore(database)
          .read('concurrent-order');
      expect(reopened?.state, 'completed');
      expect(reopened?.completedSaleId, 'concurrent-cafe-sale');
      final effects = await database
          .customSelect(
            "SELECT "
            "(SELECT COUNT(*) FROM shop_sale_lines WHERE sale_id = ?) AS lines, "
            "(SELECT COUNT(*) FROM shop_stock_movements WHERE sale_id = ?) AS movements, "
            "(SELECT COUNT(*) FROM shop_sync_outbox WHERE operation_id = ?) AS outbox, "
            "(SELECT COUNT(*) FROM shop_cafe_order_state_events WHERE operation_id = ?) AS state_events",
            variables: const [
              Variable<String>('concurrent-cafe-sale'),
              Variable<String>('concurrent-cafe-sale'),
              Variable<String>('concurrent-cafe-sale'),
              Variable<String>('concurrent-cafe-sale'),
            ],
          )
          .getSingle();
      expect(effects.read<int>('lines'), 2);
      expect(effects.read<int>('movements'), 2);
      expect(effects.read<int>('outbox'), 1);
      expect(effects.read<int>('state_events'), 1);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('readiness and backup reject quantity split audit tampering', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-quantity-split-tamper-',
    );
    final file = File('${root.path}/shop.sqlite');
    try {
      final database = ShopDatabase(NativeDatabase(file));
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      final store = ShopCafeOrderStore(database, clock: () => _clock);
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'tampered-quantity-create',
          ticketId: 'tampered-quantity-source',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'tampered-quantity-line',
              productId: 'coffee',
              quantity: 3,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await store.splitLocalBillQuantities(
        sourceOrderId: created.ticket.id,
        destinationOrderId: 'tampered-quantity-destination',
        operationId: 'tampered-quantity-operation',
        expectedTicketVersion: created.ticket.version,
        expectedStateRevision: created.stateRevision,
        movedLineQuantities: const {'tampered-quantity-line': 1},
      );
      await database.verifyReadyForUse();
      final row = await database
          .customSelect(
            'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
            variables: const [Variable<String>('tampered-quantity-operation')],
          )
          .getSingle();
      final payload =
          jsonDecode(row.read<String>('payload_json')) as Map<String, dynamic>;
      payload['movedLineQuantities'] = {'tampered-quantity-line': 2};
      await database.customUpdate(
        'UPDATE shop_sync_outbox SET payload_json = ? WHERE operation_id = ?',
        variables: [
          Variable<String>(jsonEncode(payload)),
          const Variable<String>('tampered-quantity-operation'),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();

      final beforeVerification = await file.readAsBytes();
      expect(
        () => ShopBackup.verifyRuntimeStore(file),
        throwsA(isA<FormatException>()),
      );
      expect(await file.readAsBytes(), beforeVerification);
    } finally {
      await root.delete(recursive: true);
    }
  });

  test('persisted pending wallet blocks cafe cash without mutation', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-pending-wallet-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      await ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      ).applyCommand(_command('wallet-guard-order', 'wallet-guard-create', 0), {
        _soy.key: _soy,
      });
      await database.createWalletCheckoutIntent(
        operationId: 'pending-wallet-sale',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [ShopSaleLineInput(productId: 'coffee', quantity: 1)],
      );
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      await expectLater(
        store.completeCash(
          orderId: 'wallet-guard-order',
          operationId: 'blocked-cafe-sale',
          expectedTicketVersion: 1,
          expectedStateRevision: 0,
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            contains('Finish or cancel'),
          ),
        ),
      );
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
      expect((await database.readActiveProducts()).single.onHand, 10);
      expect((await store.read('wallet-guard-order'))?.state, 'open');
      expect(
        await database
            .customSelect(
              "SELECT COUNT(*) AS count FROM shop_cafe_order_state_events WHERE order_id = 'wallet-guard-order'",
            )
            .map((row) => row.read<int>('count'))
            .getSingle(),
        0,
      );

      expect(
        await database.cancelWalletCheckoutIntent('pending-wallet-sale'),
        isTrue,
      );
      final receipt = await store.completeCash(
        orderId: 'wallet-guard-order',
        operationId: 'unblocked-cafe-sale',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
      );
      expect(receipt.totalMmk, 7000);
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 8);
      expect(
        (await ShopCafeOrderStore(database).read('wallet-guard-order'))?.state,
        'completed',
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'stale commands and outbox failure leave order stock and sale unchanged',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        await store.applyCommand(_command('order-2', 'command-2', 0), {
          _soy.key: _soy,
        });
        final outboxBefore = await database.countOutboxOperations();
        await expectLater(
          store.applyCommand(_command('order-2', 'command-stale', 0), {
            _soy.key: _soy,
          }),
          throwsFormatException,
        );
        await database.customStatement('''
        CREATE TRIGGER synthetic_cafe_outbox_abort
        BEFORE INSERT ON shop_sync_outbox
        WHEN NEW.event_type = 'shop.cafe_cash_sale.completed.v1'
        BEGIN SELECT RAISE(ABORT, 'synthetic cafe outbox failure'); END
      ''');
        await expectLater(
          store.completeCash(
            orderId: 'order-2',
            operationId: 'cafe-sale-abort',
            expectedTicketVersion: 1,
            expectedStateRevision: 0,
          ),
          throwsA(anything),
        );
        expect(await database.countSales(), 0);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect((await database.readActiveProducts()).single.onHand, 10);
        expect((await store.read('order-2'))?.state, 'open');
      } finally {
        await database.close();
      }
    },
  );

  test('cafe receipt keeps the ordered product name after catalog rename and archive', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-name-snapshot-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 4,
      );
      await ShopCafeOrderStore(database, clock: () => _clock).applyCommand(
        CafeOrderCommand(
          id: 'tea-create',
          ticketId: 'tea-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'tea-line',
              productId: 'tea',
              productName: 'Tea',
              quantity: 1,
              baseUnitPriceMmk: 2500,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await database.updateProductDetails(
        operationId: 'rename-tea',
        productId: 'tea',
        expectedName: 'Tea',
        expectedCategory: '',
        expectedPriceMmk: 2500,
        expectedBarcode: null,
        name: 'Coffee',
        category: '',
        priceMmk: 2500,
        barcode: null,
      );
      await database.customUpdate(
        'UPDATE shop_products SET archived = 1 WHERE id = ?',
        variables: const [Variable<String>('tea')],
      );
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      final reopened = await ShopCafeOrderStore(
        database,
        clock: () => _clock,
      ).read('tea-order');
      expect(reopened?.ticket.lines.single.productId, 'tea');
      expect(reopened?.ticket.lines.single.productName, 'Tea');
      final receipt = await ShopCafeOrderStore(database, clock: () => _clock)
          .completeCash(
            orderId: 'tea-order',
            operationId: 'tea-sale',
            expectedTicketVersion: 1,
            expectedStateRevision: 0,
          );
      expect(receipt.lines.single.productName, 'Tea');
      expect(await database.readActiveProducts(), isEmpty);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'stale cafe stock rolls back sale and order across real reopens',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-cafe-stale-stock-',
      );
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 2,
        );
        await ShopCafeOrderStore(
          database,
          clock: () => _clock,
          kitchenEntitlement: _premiumKitchen,
        ).applyCommand(_command('stale-order', 'stale-create', 0), {
          _soy.key: _soy,
        });
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.recordCashSale(
          operationId: 'intervening-retail-sale',
          lines: const [ShopSaleLineInput(productId: 'coffee', quantity: 1)],
        );
        final outboxBefore = await database.countOutboxOperations();
        final movementsBefore = await database.countStockMovements();
        await expectLater(
          ShopCafeOrderStore(database).completeCash(
            orderId: 'stale-order',
            operationId: 'stale-cafe-sale',
            expectedTicketVersion: 1,
            expectedStateRevision: 0,
          ),
          throwsA(
            isA<ShopCafeInsufficientStockException>()
                .having((error) => error.productName, 'productName', 'Coffee')
                .having((error) => error.available, 'available', 1)
                .having(
                  (error) => error.requiredQuantity,
                  'requiredQuantity',
                  2,
                ),
          ),
        );
        expect(await database.countSales(), 1);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(await database.countStockMovements(), movementsBefore);
        expect((await database.readActiveProducts()).single.onHand, 1);
        expect(
          (await ShopCafeOrderStore(database).read('stale-order'))?.state,
          'open',
        );
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(await database.countSales(), 1);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(await database.countStockMovements(), movementsBefore);
        expect((await database.readActiveProducts()).single.onHand, 1);
        final reopened = await ShopCafeOrderStore(database).read('stale-order');
        expect(reopened?.state, 'open');
        expect(reopened?.completedSaleId, isNull);
        final stateEvents = await database
            .customSelect(
              "SELECT COUNT(*) AS count FROM shop_cafe_order_state_events WHERE order_id = 'stale-order'",
            )
            .map((row) => row.read<int>('count'))
            .getSingle();
        expect(stateEvents, 0);
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'cafe cash sale persists in the open shift and closes once after reopen',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-cafe-cash-shift-',
      );
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        final shift = await database.openCashShift(
          operationId: 'cafe-shift-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        var store = ShopCafeOrderStore(
          database,
          clock: () => _clock,
          kitchenEntitlement: _premiumKitchen,
        );
        await store.applyCommand(
          _command('shift-order', 'shift-order-create', 0),
          {_soy.key: _soy},
        );
        final receipt = await store.completeCash(
          orderId: 'shift-order',
          operationId: 'shift-cafe-sale',
          expectedTicketVersion: 1,
          expectedStateRevision: 0,
        );
        expect(receipt.totalMmk, 7000);
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(database);
        final replay = await store.completeCash(
          orderId: 'shift-order',
          operationId: 'shift-cafe-sale',
          expectedTicketVersion: 1,
          expectedStateRevision: 0,
        );
        expect(replay.id, receipt.id);
        final review = await database.readCashShiftReview(shift.id);
        expect(review.cashSalesCount, 1);
        expect(review.cashSalesTotalMmk, 7000);
        expect(review.expectedCashMmk, 17000);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 8);
        expect((await store.read('shift-order'))?.state, 'completed');

        final closed = await database.closeCashShift(
          shiftId: shift.id,
          operationId: 'cafe-shift-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 17000,
        );
        expect(closed.differenceMmk, 0);
        final outboxCount = await database.countOutboxOperations();
        final closeReplay = await database.closeCashShift(
          shiftId: shift.id,
          operationId: 'cafe-shift-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 17000,
        );
        expect(closeReplay.differenceMmk, 0);
        expect(await database.countOutboxOperations(), outboxCount);
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('cancels a routed single-item order exactly once without money or stock effects', () async {
    final root = await Directory.systemTemp.createTemp('shop-cafe-cancel-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 5,
      );
      var store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'cancel-create',
          ticketId: 'cancel-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'cancel-line',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: 'no ice',
              preparationStation: 'bar',
              modifiers: [],
            ),
          ],
        ),
        const {},
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();

      final cancelled = await store.cancel(
        orderId: created.ticket.id,
        operationId: 'cancel-operation',
        expectedStateRevision: created.stateRevision,
      );
      expect(cancelled.state, 'cancelled');
      expect(cancelled.kitchenDispatchLines.single.sequence, 1);
      expect(await store.readActive(), isEmpty);
      final replay = await store.cancel(
        orderId: created.ticket.id,
        operationId: 'cancel-operation',
        expectedStateRevision: created.stateRevision,
      );
      expect(replay.state, 'cancelled');
      await expectLater(
        store.cancel(
          orderId: created.ticket.id,
          operationId: 'cancel-operation',
          expectedStateRevision: created.stateRevision + 1,
        ),
        throwsStateError,
      );
      await expectLater(
        store.completeCash(
          orderId: created.ticket.id,
          operationId: 'cancelled-sale',
          expectedTicketVersion: created.ticket.version,
          expectedStateRevision: created.stateRevision,
        ),
        throwsStateError,
      );
      await expectLater(
        store.applyCommand(
          CafeOrderCommand(
            id: 'cancelled-edit',
            ticketId: created.ticket.id,
            expectedVersion: created.ticket.version,
            lines: created.ticket.lines,
          ),
          const {},
        ),
        throwsStateError,
      );
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), movementsBefore);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(await database.countOutboxOperations(), outboxBefore + 1);
      final cancellation = await database
          .customSelect(
            'SELECT operation_id, from_state FROM shop_cafe_order_cancellations',
          )
          .getSingle();
      expect(cancellation.read<String>('operation_id'), 'cancel-operation');
      expect(cancellation.read<String>('from_state'), 'open');
      final event = await database
          .customSelect(
            "SELECT payload_json FROM shop_sync_outbox WHERE event_type = "
            "'shop.cafe_order.cancelled.v1'",
          )
          .getSingle();
      final payload = jsonDecode(event.read<String>('payload_json')) as Map;
      expect(payload['kitchenStopConfirmed'], isFalse);
      await database.verifyReadyForUse();
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopCafeOrderStore(database);
      final reopened = await store.read(created.ticket.id);
      expect(reopened?.state, 'cancelled');
      expect(reopened?.kitchenDispatchLines.single.ticketId, isNotEmpty);
      expect(await store.readActive(), isEmpty);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'cancellation rolls back if its audit outbox cannot be written',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 5,
        );
        final store = ShopCafeOrderStore(database, clock: () => _clock);
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'rollback-create',
            ticketId: 'rollback-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'rollback-line',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: [],
              ),
            ],
          ),
          const {},
        );
        final movementsBefore = await database.countStockMovements();
        await database.customStatement('''
        CREATE TRIGGER reject_cafe_cancellation_outbox
        BEFORE INSERT ON shop_sync_outbox
        WHEN NEW.event_type = 'shop.cafe_order.cancelled.v1'
        BEGIN
          SELECT RAISE(ABORT, 'synthetic cancellation outbox failure');
        END
      ''');
        await expectLater(
          store.cancel(
            orderId: created.ticket.id,
            operationId: 'rollback-cancel',
            expectedStateRevision: created.stateRevision,
          ),
          throwsA(isA<Exception>()),
        );
        expect(
          await database
              .customSelect('SELECT 1 FROM shop_cafe_order_cancellations')
              .get(),
          isEmpty,
        );
        expect((await store.read(created.ticket.id))?.state, 'open');
        expect(await store.readActive(), hasLength(1));
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect((await database.readActiveProducts()).single.onHand, 5);
      } finally {
        await database.close();
      }
    },
  );

  test('populated v19 held order migrates then cancels exactly once without effects', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-held-v19-cancel-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 5,
      );
      var store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'held-v19-create',
          ticketId: 'held-v19-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'held-v19-line',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: 'warm',
              preparationStation: 'kitchen',
              modifiers: const [_soy],
            ),
          ],
        ),
        {_soy.key: _soy},
      );
      final held = await store.hold(
        orderId: created.ticket.id,
        operationId: 'held-v19-hold',
        expectedStateRevision: created.stateRevision,
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();
      await database.close();

      _downgradeV19(file, 19);
      ShopBackup.verifyRuntimeStore(file);
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopCafeOrderStore(database, clock: () => _clock);
      final migrated = await store.read(held.ticket.id);
      expect(migrated?.state, 'held');
      expect(migrated?.stateRevision, held.stateRevision);
      expect(
        migrated?.ticket.lastCommandFingerprint,
        held.ticket.lastCommandFingerprint,
      );
      expect(migrated?.kitchenDispatchLines.single.ticketId, isNotEmpty);

      final cancelled = await store.cancel(
        orderId: held.ticket.id,
        operationId: 'held-v20-cancel',
        expectedStateRevision: held.stateRevision,
      );
      final replay = await store.cancel(
        orderId: held.ticket.id,
        operationId: 'held-v20-cancel',
        expectedStateRevision: held.stateRevision,
      );
      expect(cancelled.state, 'cancelled');
      expect(replay.state, 'cancelled');
      expect(
        replay.ticket.lastCommandFingerprint,
        held.ticket.lastCommandFingerprint,
      );
      expect(await store.readActive(), isEmpty);
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), movementsBefore);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(await database.countOutboxOperations(), outboxBefore + 1);
      final cancellation = await database
          .customSelect(
            'SELECT from_state, expected_state_revision '
            'FROM shop_cafe_order_cancellations',
          )
          .getSingle();
      expect(cancellation.read<String>('from_state'), 'held');
      expect(
        cancellation.read<int>('expected_state_revision'),
        held.stateRevision,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'runtime and backup reject a tampered cancellation audit payload',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-cafe-cancel-tamper-',
      );
      final file = File('${root.path}/shop.sqlite');
      try {
        final database = ShopDatabase(NativeDatabase(file));
        final store = ShopCafeOrderStore(database, clock: () => _clock);
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 5,
        );
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'tamper-cancel-create',
            ticketId: 'tamper-cancel-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'tamper-cancel-line',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        await store.cancel(
          orderId: created.ticket.id,
          operationId: 'tamper-cancel-operation',
          expectedStateRevision: created.stateRevision,
        );
        await database.close();

        final raw = sqlite.sqlite3.open(file.path);
        try {
          raw.execute(
            "UPDATE shop_sync_outbox SET payload_json = '{}' "
            "WHERE operation_id = 'tamper-cancel-operation'",
          );
        } finally {
          raw.close();
        }
        final reopened = ShopDatabase(NativeDatabase(file));
        try {
          await expectLater(reopened.verifyReadyForUse(), throwsStateError);
        } finally {
          await reopened.close();
        }
        expect(
          () => ShopBackup.verifyRuntimeStore(file),
          throwsA(isA<FormatException>()),
        );
      } finally {
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'v19 v18 and v17 stores migrate through v20 without changing retail data',
    () async {
      for (final origin in [19, 18, 17]) {
        final root = await Directory.systemTemp.createTemp(
          'shop-cafe-v$origin-',
        );
        final file = File('${root.path}/shop.sqlite');
        try {
          var database = ShopDatabase(NativeDatabase(file));
          await database.verifyReadyForUse();
          if (origin == 18) {
            await database.addProduct(
              id: 'tea',
              name: 'Tea',
              priceMmk: 2000,
              openingStock: 5,
            );
            await database.recordCashSale(
              operationId: 'legacy-sale',
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            );
          }
          await database.close();
          _downgradeV19(file, origin);
          ShopBackup.verifyRuntimeStore(file);
          database = ShopDatabase(NativeDatabase(file));
          try {
            await database.verifyReadyForUse();
          } on Object catch (error, stack) {
            fail('v$origin migration failed: $error\n$stack');
          }
          expect(database.schemaVersion, 22);
          expect(await database.countSales(), origin == 18 ? 1 : 0);
          final products = await database.readActiveProducts();
          expect(products, origin == 18 ? hasLength(1) : isEmpty);
          if (origin == 18) expect(products.single.onHand, 4);
          expect(await database.countOutboxOperations(), origin == 18 ? 2 : 0);
          expect(await ShopCafeOrderStore(database).readActive(), isEmpty);
          await database.close();
        } finally {
          await root.delete(recursive: true);
        }
      }
    },
  );

  test(
    'encrypted backup restores active and completed cafe evidence',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-cafe-backup-');
      final source = File('${root.path}/source.sqlite');
      final restored = File('${root.path}/restored.sqlite');
      final archive = File('${root.path}/shop.smbk');
      final scratch = Directory('${root.path}/scratch');
      try {
        var database = ShopDatabase(NativeDatabase(source));
        var store = ShopCafeOrderStore(
          database,
          clock: () => _clock,
          kitchenEntitlement: _premiumKitchen,
        );
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        await store.applyCommand(
          _command('active-order', 'active-command', 0),
          {_soy.key: _soy},
        );
        await store.applyCommand(
          _command('completed-order', 'completed-command', 0),
          {_soy.key: _soy},
        );
        final splitSource = await store.applyCommand(
          CafeOrderCommand(
            id: 'backup-split-create',
            ticketId: 'backup-split-source',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'backup-split-1',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
              CafeOrderLine.local(
                id: 'backup-split-2',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        await store.splitLocalBill(
          sourceOrderId: splitSource.ticket.id,
          destinationOrderId: 'backup-split-destination',
          operationId: 'backup-split-operation',
          expectedTicketVersion: splitSource.ticket.version,
          expectedStateRevision: splitSource.stateRevision,
          movedLineIds: const ['backup-split-2'],
        );
        final quantitySplitSource = await store.applyCommand(
          CafeOrderCommand(
            id: 'backup-quantity-split-create',
            ticketId: 'backup-quantity-split-source',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'backup-quantity-split-line',
                productId: 'coffee',
                quantity: 3,
                baseUnitPriceMmk: 3000,
                remark: 'less ice',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final quantitySplit = await store.splitLocalBillQuantities(
          sourceOrderId: quantitySplitSource.ticket.id,
          destinationOrderId: 'backup-quantity-split-destination',
          operationId: 'backup-quantity-split-operation',
          expectedTicketVersion: quantitySplitSource.ticket.version,
          expectedStateRevision: quantitySplitSource.stateRevision,
          movedLineQuantities: const {'backup-quantity-split-line': 1},
        );
        final reversedQuantitySplit = await store.reverseLocalSplit(
          splitOperationId: 'backup-quantity-split-operation',
          operationId: 'backup-quantity-unsplit-operation',
          expectedSourceTicketVersion: quantitySplit.source.ticket.version,
          expectedSourceStateRevision: quantitySplit.source.stateRevision,
          expectedDestinationTicketVersion:
              quantitySplit.destination.ticket.version,
          expectedDestinationStateRevision:
              quantitySplit.destination.stateRevision,
        );
        final editedAfterUndo = await store.applyCommand(
          CafeOrderCommand(
            id: 'backup-post-unsplit-edit',
            ticketId: reversedQuantitySplit.source.ticket.id,
            expectedVersion: reversedQuantitySplit.source.ticket.version,
            lines: [
              reversedQuantitySplit.source.ticket.lines.single.copyWithQuantity(
                4,
              ),
            ],
          ),
          const {},
        );
        final resplit = await store.splitLocalBillQuantities(
          sourceOrderId: editedAfterUndo.ticket.id,
          destinationOrderId: 'backup-resplit-destination',
          operationId: 'backup-resplit-operation',
          expectedTicketVersion: editedAfterUndo.ticket.version,
          expectedStateRevision: editedAfterUndo.stateRevision,
          movedLineQuantities: const {'backup-quantity-split-line': 1},
        );
        final outboxAfterResplit = await database.countOutboxOperations();
        final reversalReplay = await store.reverseLocalSplit(
          splitOperationId: 'backup-quantity-split-operation',
          operationId: 'backup-quantity-unsplit-operation',
          expectedSourceTicketVersion: quantitySplit.source.ticket.version,
          expectedSourceStateRevision: quantitySplit.source.stateRevision,
          expectedDestinationTicketVersion:
              quantitySplit.destination.ticket.version,
          expectedDestinationStateRevision:
              quantitySplit.destination.stateRevision,
        );
        expect(
          reversalReplay.source.ticket.toJson(),
          resplit.source.ticket.toJson(),
        );
        expect(await database.countOutboxOperations(), outboxAfterResplit);
        final cancelled = await store.applyCommand(
          _command('cancelled-order', 'cancelled-command', 0),
          {_soy.key: _soy},
        );
        await store.cancel(
          orderId: cancelled.ticket.id,
          operationId: 'cancelled-operation',
          expectedStateRevision: cancelled.stateRevision,
        );
        await store.completeCash(
          orderId: 'completed-order',
          operationId: 'completed-sale',
          expectedTicketVersion: 1,
          expectedStateRevision: 0,
        );
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          scratchRoot: scratch,
          password: 'cafe-backup-password',
        );
        await database.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'cafe-backup-password',
        );
        database = ShopDatabase(NativeDatabase(restored));
        store = ShopCafeOrderStore(database);
        expect((await store.read('active-order'))?.state, 'open');
        expect((await store.read('completed-order'))?.state, 'completed');
        expect((await store.read('cancelled-order'))?.state, 'cancelled');
        expect(
          (await store.read('backup-split-source'))?.ticket.lines.single.id,
          'backup-split-1',
        );
        expect(
          (await store.read('backup-split-destination'))
              ?.ticket
              .lines
              .single
              .id,
          'backup-split-2',
        );
        expect(
          (await store.read('backup-quantity-split-source'))
              ?.ticket
              .lines
              .single
              .quantity,
          3,
        );
        expect(
          (await store.read('backup-quantity-split-destination'))?.state,
          'cancelled',
        );
        expect(
          (await store.read('backup-resplit-destination'))
              ?.ticket
              .lines
              .single
              .quantity,
          1,
        );
        expect(
          (await store.read('cancelled-order'))?.kitchenDispatchLines,
          isNotEmpty,
        );
        expect(await store.readActive(), hasLength(5));
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 8);
        await database.close();
      } finally {
        await root.delete(recursive: true);
      }
    },
  );

  test('readiness and backup reject ticket tampering', () async {
    final root = await Directory.systemTemp.createTemp('shop-cafe-tamper-');
    final file = File('${root.path}/shop.sqlite');
    try {
      final database = ShopDatabase(NativeDatabase(file));
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      await store.applyCommand(
        _command('tampered-order', 'tampered-command', 0),
        {_soy.key: _soy},
      );
      await database.customStatement(
        'DROP TRIGGER shop_cafe_orders_guard_update',
      );
      await database.customUpdate(
        "UPDATE shop_cafe_orders SET total_mmk = total_mmk + 1",
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      final beforeVerification = await file.readAsBytes();
      expect(
        () => ShopBackup.verifyRuntimeStore(file),
        throwsA(isA<FormatException>()),
      );
      expect(await file.readAsBytes(), beforeVerification);
    } finally {
      await root.delete(recursive: true);
    }
  });

  test('readiness and backup reject completed effect tampering', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-cafe-effect-tamper-',
    );
    final file = File('${root.path}/shop.sqlite');
    try {
      final database = ShopDatabase(NativeDatabase(file));
      final store = ShopCafeOrderStore(
        database,
        clock: () => _clock,
        kitchenEntitlement: _premiumKitchen,
      );
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      await store.applyCommand(_command('effect-order', 'effect-command', 0), {
        _soy.key: _soy,
      });
      await store.completeCash(
        orderId: 'effect-order',
        operationId: 'effect-sale',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
      );
      await database.customUpdate(
        "UPDATE shop_sync_outbox SET payload_json = '{}' "
        "WHERE operation_id = 'effect-sale'",
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      final beforeVerification = await file.readAsBytes();
      expect(
        () => ShopBackup.verifyRuntimeStore(file),
        throwsA(isA<FormatException>()),
      );
      expect(await file.readAsBytes(), beforeVerification);
    } finally {
      await root.delete(recursive: true);
    }
  });

  test('readiness rejects a mismatched completed sale fingerprint', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final store = ShopCafeOrderStore(
      database,
      clock: () => _clock,
      kitchenEntitlement: _premiumKitchen,
    );
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 10,
      );
      await store.applyCommand(
        _command('sale-tamper-order', 'sale-tamper-command', 0),
        {_soy.key: _soy},
      );
      await store.completeCash(
        orderId: 'sale-tamper-order',
        operationId: 'sale-tamper-operation',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
      );
      await database.customStatement('DROP TRIGGER shop_sales_no_update');
      await database.customUpdate(
        "UPDATE shop_sales SET request_fingerprint = printf('%064d', 0) "
        "WHERE id = 'sale-tamper-operation'",
      );
      await database.customStatement(
        shopImmutableTriggerV11Sql(
          table: 'shop_sales',
          operation: 'update',
          message: 'Completed Shop sales are immutable',
        ),
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
    } finally {
      await database.close();
    }
  });
}

Future<Map<String, List<Map<String, Object?>>>> _cafeTransitionRecoveryState(
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
      'total_mmk, last_command_id, last_command_fingerprint, '
      'last_state_operation_id, last_state_fingerprint '
      'FROM shop_cafe_orders WHERE id = ? ORDER BY id',
      [Variable<String>(orderId)],
    ),
    'stateEvents': await rows(
      'SELECT operation_id, order_id, request_fingerprint, from_state, '
      'to_state, expected_state_revision, resulting_state_revision, sale_id '
      'FROM shop_cafe_order_state_events WHERE order_id = ? '
      'ORDER BY operation_id',
      [Variable<String>(orderId)],
    ),
    'products': await rows(
      'SELECT id, on_hand FROM shop_products '
      "WHERE id = 'hold-recovery-coffee' ORDER BY id",
      const [],
    ),
    'movements': await rows(
      'SELECT id, product_id, quantity_delta, reason '
      'FROM shop_stock_movements '
      "WHERE product_id = 'hold-recovery-coffee' ORDER BY id",
      const [],
    ),
    'sales': await rows(
      'SELECT id, operation_id, total_mmk, payment_method '
      'FROM shop_sales ORDER BY id',
      const [],
    ),
    'outbox': await rows(
      'SELECT operation_id, event_type, payload_json, state '
      'FROM shop_sync_outbox ORDER BY operation_id',
      const [],
    ),
  };
}

CafeOrderCommand _command(
  String orderId,
  String commandId,
  int expectedVersion,
) => CafeOrderCommand(
  id: commandId,
  ticketId: orderId,
  expectedVersion: expectedVersion,
  lines: [
    CafeOrderLine(
      id: 'cup-1',
      productId: 'coffee',
      quantity: 1,
      baseUnitPriceMmk: 3000,
      remark: '',
      modifiers: const [_soy],
    ),
    CafeOrderLine(
      id: 'cup-2',
      productId: 'coffee',
      quantity: 1,
      baseUnitPriceMmk: 3000,
      remark: 'less ice',
      modifiers: const [_soy],
    ),
  ],
);

void _downgradeV19(File file, int target) {
  final connection = sqlite.sqlite3.open(file.path);
  try {
    connection.execute('ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk');
    for (final definition
        in shopPendingCashCheckoutSchemaDefinitionsV21().entries
            .toList()
            .reversed) {
      _dropDefinition(connection, definition.key, definition.value);
    }
    for (final definition
        in shopCafeCancellationSchemaDefinitionsV20().entries
            .toList()
            .reversed) {
      _dropDefinition(connection, definition.key, definition.value);
    }
    if (target < 19) {
      for (final definition
          in shopCafeOrderSchemaDefinitionsV19().entries.toList().reversed) {
        _dropDefinition(connection, definition.key, definition.value);
      }
    }
    if (target == 17) {
      for (final definition
          in shopCashMovementSchemaDefinitionsV18().entries.toList().reversed) {
        _dropDefinition(connection, definition.key, definition.value);
      }
      for (final column in const [
        'review_cash_out_total_mmk',
        'review_cash_in_total_mmk',
        'review_cash_movement_count',
        'cash_out_total_mmk',
        'cash_in_total_mmk',
        'cash_movement_count',
      ]) {
        connection.execute('ALTER TABLE shop_cash_shifts DROP COLUMN $column');
      }
      final retainedCashObjects = connection
          .select(
            "SELECT name FROM sqlite_master WHERE name LIKE 'shop_cash_movements%'",
          )
          .map((row) => row['name'])
          .toList(growable: false);
      if (retainedCashObjects.isNotEmpty) {
        throw StateError('The synthetic v17 downgrade retained v18 objects.');
      }
    }
    connection.execute('PRAGMA user_version = $target');
  } finally {
    connection.close();
  }
}

void _dropDefinition(
  sqlite.Database connection,
  String name,
  String definition,
) {
  final type = shopSchemaObjectTypeForDefinition(definition);
  connection.execute(
    'DROP ${type == 'table'
        ? 'TABLE'
        : type == 'index'
        ? 'INDEX'
        : 'TRIGGER'} $name',
  );
}

String _syntheticStaticMmqr() {
  String field(String id, String value) =>
      '$id${utf8.encode(value).length.toString().padLeft(2, '0')}$value';

  final merchant = [
    field('00', 'MM.COM.MMQR'),
    field('01', '999999999999999'),
    field('02', '000000'),
  ].join();
  final language = [field('00', 'my'), field('01', 'ဆိုင်')].join();
  final body = [
    field('00', '01'),
    field('01', '11'),
    field('26', merchant),
    field('52', '5411'),
    field('53', '104'),
    field('58', 'MM'),
    field('59', 'TEST STORE'),
    field('60', 'Yangon'),
    field('64', language),
    '6304',
  ].join();
  return '$body${_testCrc16(utf8.encode(body))}';
}

String _testCrc16(List<int> bytes) {
  var crc = 0xffff;
  for (final byte in bytes) {
    crc ^= byte << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}
