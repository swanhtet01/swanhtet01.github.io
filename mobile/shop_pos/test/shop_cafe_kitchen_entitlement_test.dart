import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('Core basic cafe order remains local and completable', () async {
    final database = await _readyDatabase();
    final store = ShopCafeOrderStore(database);
    try {
      final order = await store.applyCommand(
        _command(line: _localLine(), commandId: 'core-create'),
        const {},
      );
      expect(order.ticket.lines.single.hasPreparationRoute, isFalse);
      expect(order.kitchenDispatchLines, isEmpty);

      final receipt = await store.completeCash(
        orderId: 'order-1',
        operationId: 'core-sale',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
      );
      expect(receipt.totalMmk, 2000);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 3);
    } finally {
      await database.close();
    }
  });

  test(
    'default policy rejects direct routed store command without mutation',
    () async {
      final database = await _readyDatabase();
      final store = ShopCafeOrderStore(database);
      try {
        final before = await _snapshot(database);
        await expectLater(
          store.applyCommand(
            _command(line: _routedLine(), commandId: 'direct-bypass'),
            const {},
          ),
          throwsA(
            isA<ShopCafeKitchenEntitlementException>().having(
              (error) => error.code,
              'code',
              'shop_cafe_kitchen_entitlement_unavailable',
            ),
          ),
        );
        expect(await _snapshot(database), before);
      } finally {
        await database.close();
      }
    },
  );

  test('synthetic Premium authority permits a routed kitchen ticket', () async {
    final database = await _readyDatabase();
    final policy = _SyntheticKitchenEntitlement();
    final store = ShopCafeOrderStore(database, kitchenEntitlement: policy);
    try {
      final order = await store.applyCommand(
        _command(line: _routedLine(), commandId: 'premium-create'),
        const {},
      );
      expect(policy.checkedCommands, ['order-1/premium-create']);
      expect(order.kitchenDispatchLines, hasLength(1));
      expect(order.kitchenDispatchLines.single.preparationStation, 'kitchen');
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 4);
    } finally {
      await database.close();
    }
  });

  for (final code in [
    'shop_cafe_kitchen_entitlement_revoked',
    'shop_cafe_kitchen_entitlement_stale',
    'shop_cafe_kitchen_entitlement_unknown',
  ]) {
    test(
      '$code rejects routed mutation even when UI hint says allowed',
      () async {
        final database = await _readyDatabase();
        final store = ShopCafeOrderStore(
          database,
          kitchenEntitlement: _SyntheticKitchenEntitlement(failureCode: code),
        );
        try {
          final before = await _snapshot(database);
          await expectLater(
            store.applyCommand(
              _command(line: _routedLine(), commandId: code),
              const {},
            ),
            throwsA(
              isA<ShopCafeKitchenEntitlementException>().having(
                (error) => error.code,
                'code',
                code,
              ),
            ),
          );
          expect(await _snapshot(database), before);
        } finally {
          await database.close();
        }
      },
    );
  }

  test(
    'backup retains kitchen evidence but restore grants no entitlement',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-cafe-entitlement-backup-',
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
        final premiumStore = ShopCafeOrderStore(
          database,
          kitchenEntitlement: _SyntheticKitchenEntitlement(),
        );
        final saved = await premiumStore.applyCommand(
          _command(line: _routedLine(), commandId: 'premium-before-backup'),
          const {},
        );
        expect(saved.kitchenDispatchLines, hasLength(1));
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          scratchRoot: Directory('${root.path}/scratch'),
          password: 'kitchen-entitlement-backup',
        );
        await database.close();

        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'kitchen-entitlement-backup',
        );
        database = ShopDatabase(NativeDatabase(restored));
        final restoredCoreStore = ShopCafeOrderStore(database);
        final historical = await restoredCoreStore.read('order-1');
        expect(historical?.kitchenDispatchLines, hasLength(1));
        final before = await _snapshot(database);
        await expectLater(
          restoredCoreStore.applyCommand(
            CafeOrderCommand(
              id: 'route-after-restore',
              ticketId: 'order-1',
              expectedVersion: 1,
              lines: [
                historical!.ticket.lines.single,
                _routedLine(id: 'line-2'),
              ],
            ),
            const {},
          ),
          throwsA(isA<ShopCafeKitchenEntitlementException>()),
        );
        expect(await _snapshot(database), before);
        await database.verifyReadyForUse();
        await database.close();
      } finally {
        await root.delete(recursive: true);
      }
    },
  );
}

class _SyntheticKitchenEntitlement implements ShopCafeKitchenEntitlement {
  _SyntheticKitchenEntitlement({this.failureCode});

  final String? failureCode;
  final List<String> checkedCommands = [];

  @override
  bool get allowsKitchenDispatch => true;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {
    checkedCommands.add('$orderId/$commandId');
    if (failureCode case final code?) {
      throw ShopCafeKitchenEntitlementException(code);
    }
  }
}

Future<ShopDatabase> _readyDatabase() async {
  final database = ShopDatabase(NativeDatabase.memory());
  await database.addProduct(
    id: 'tea',
    name: 'Tea',
    priceMmk: 2000,
    openingStock: 4,
  );
  return database;
}

CafeOrderCommand _command({
  required CafeOrderLine line,
  required String commandId,
}) => CafeOrderCommand(
  id: commandId,
  ticketId: 'order-1',
  expectedVersion: 0,
  lines: [line],
);

CafeOrderLine _localLine() => CafeOrderLine.local(
  id: 'line-1',
  productId: 'tea',
  quantity: 1,
  baseUnitPriceMmk: 2000,
  remark: '',
  modifiers: const [],
);

CafeOrderLine _routedLine({String id = 'line-1'}) => CafeOrderLine(
  id: id,
  productId: 'tea',
  quantity: 1,
  baseUnitPriceMmk: 2000,
  remark: '',
  preparationStation: 'kitchen',
  modifiers: const [],
);

Future<Map<String, int>> _snapshot(ShopDatabase database) async {
  Future<int> count(String table) => database
      .customSelect('SELECT COUNT(*) AS count FROM $table')
      .map((row) => row.read<int>('count'))
      .getSingle();
  return {
    'orders': await count('shop_cafe_orders'),
    'sales': await count('shop_sales'),
    'stock': await count('shop_stock_movements'),
    'outbox': await count('shop_sync_outbox'),
  };
}
