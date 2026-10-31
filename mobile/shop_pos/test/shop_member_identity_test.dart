import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';

void main() {
  group('native member identity v16', () {
    test('fresh database has one immutable non-PII store identity', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 22);
        final storeRef = await database.readStoreRef();
        expect(storeRef, matches(RegExp(r'^[0-9a-f]{64}$')));
        await expectLater(
          database.customStatement(
            'UPDATE shop_store_identity SET store_ref = ?',
            [List.filled(64, 'a').join()],
          ),
          throwsA(isA<Exception>()),
        );
        await expectLater(
          database.customStatement('DELETE FROM shop_store_identity'),
          throwsA(isA<Exception>()),
        );
      } finally {
        await database.close();
      }
    });

    test('incomplete v15 downgrade remains rejected fail closed', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-incomplete-v15-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        final snapshot = File('${directory.path}/incomplete-v15.sqlite');
        await source.exportVerifiedLocalSnapshot(snapshot);
        final raw = sqlite3.open(snapshot.path);
        try {
          raw.execute('PRAGMA user_version = 15');
        } finally {
          raw.close();
        }
        expect(
          () => ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 15),
          throwsFormatException,
        );
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });

    test(
      'card lookup is PII-free and rejects unknown retired and revoked',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          final active = _token(1);
          final retired = _token(2);
          final revoked = _token(3);
          await _seedMember(
            database,
            memberId: _memberId('1'),
            displayCode: '00001234',
            activeToken: active,
            retiredToken: retired,
          );
          await _seedMember(
            database,
            memberId: _memberId('2'),
            displayCode: '00001235',
            activeToken: revoked,
            status: 'revoked',
          );

          final match = await database.lookupActiveMemberCard(active);
          expect(match?.member.id, _memberId('1'));
          expect(match?.member.displayCode, '00001234');
          expect(match?.cardRevision, 2);
          expect(await database.lookupActiveMemberCard(retired), isNull);
          expect(await database.lookupActiveMemberCard(revoked), isNull);
          expect(await database.lookupActiveMemberCard(_token(9)), isNull);
          expect(
            await database.lookupActiveMemberCard('0099999999999'),
            isNull,
          );
          expect(
            (await database.lookupActiveMemberDisplayCode('00001234'))
                ?.member
                .id,
            _memberId('1'),
          );
          expect(await database.lookupActiveMemberDisplayCode('1234'), isNull);

          final schema = await database
              .customSelect(
                "SELECT sql FROM sqlite_master WHERE name IN "
                "('shop_members', 'shop_member_cards') ORDER BY name",
              )
              .get();
          final stored = jsonEncode(schema.map((row) => row.data).toList());
          expect(stored, isNot(contains('phone')));
          expect(stored, isNot(contains('email')));
          expect(stored, isNot(contains('name TEXT')));
        } finally {
          await database.close();
        }
      },
    );

    test(
      'cash sale links member atomically and retries exactly once',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          final firstToken = _token(4);
          final secondToken = _token(5);
          await _seedMember(
            database,
            memberId: _memberId('3'),
            displayCode: '00000001',
            activeToken: firstToken,
          );
          await _seedMember(
            database,
            memberId: _memberId('4'),
            displayCode: '00000002',
            activeToken: secondToken,
          );
          await database.addProduct(
            id: 'rice',
            name: 'Rice',
            priceMmk: 2500,
            openingStock: 3,
          );
          final stockBefore = await database.countStockMovements();
          final outboxBefore = await database.countOutboxOperations();
          const lines = [ShopSaleLineInput(productId: 'rice', quantity: 1)];
          final first = await database.recordSale(
            operationId: 'member-cash-sale',
            lines: lines,
            paymentMethod: 'cash',
            memberCardToken: firstToken,
          );
          expect(first.member?.displayCode, '00000001');
          expect(await database.countSales(), 1);
          expect(await database.countStockMovements(), stockBefore + 1);
          expect(await database.countOutboxOperations(), outboxBefore + 1);
          final retry = await database.recordSale(
            operationId: 'member-cash-sale',
            lines: lines,
            paymentMethod: 'cash',
            memberCardToken: firstToken,
          );
          expect(retry.member?.memberId, first.member?.memberId);
          expect(await database.countSales(), 1);
          expect(await database.countStockMovements(), stockBefore + 1);
          expect(await database.countOutboxOperations(), outboxBefore + 1);
          await expectLater(
            database.recordSale(
              operationId: 'member-cash-sale',
              lines: lines,
              paymentMethod: 'cash',
              memberCardToken: secondToken,
            ),
            throwsStateError,
          );
          expect((await database.readActiveProducts()).single.onHand, 2);
          final link = await database.readSaleMember('member-cash-sale');
          expect(link?.displayCode, '00000001');
          await expectLater(
            database.customStatement(
              'DELETE FROM shop_sale_member_links WHERE sale_id = ?',
              ['member-cash-sale'],
            ),
            throwsA(isA<Exception>()),
          );
          final outbox = await database
              .customSelect(
                'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
                variables: [const Variable<String>('member-cash-sale')],
              )
              .getSingle();
          expect(outbox.read<String>('payload_json'), contains('memberId'));
          expect(
            outbox.read<String>('payload_json'),
            isNot(contains(firstToken)),
          );
          expect(
            outbox.read<String>('payload_json'),
            isNot(contains('00000001')),
          );
        } finally {
          await database.close();
        }
      },
    );

    test(
      'wallet uncertainty preserves the reviewed member association',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          final token = _token(6);
          await _seedMember(
            database,
            memberId: _memberId('5'),
            displayCode: '00000007',
            activeToken: token,
          );
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 1000,
            openingStock: 2,
          );
          final intent = await database.createWalletCheckoutIntent(
            operationId: 'member-wallet-sale',
            merchant: MerchantWalletSetup(
              provider: 'KBZPay',
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            memberCardToken: token,
          );
          expect(intent.member?.displayCode, '00000007');
          expect(
            (await database.readPendingWalletCheckout())?.member?.displayCode,
            '00000007',
          );
          final sale = await database.recordSale(
            operationId: intent.operationId,
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            paymentMethod: 'kbzpay',
            walletCheckoutOperationId: intent.operationId,
          );
          expect(sale.member?.memberId, _memberId('5'));
          expect(await database.countSales(), 1);
          expect((await database.readActiveProducts()).single.onHand, 1);
        } finally {
          await database.close();
        }
      },
    );

    test('wallet intent completion keeps its immutable member provenance after retirement', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(12);
        final memberId = _memberId('9');
        await _seedMember(
          database,
          memberId: memberId,
          displayCode: '00000012',
          activeToken: token,
        );
        await database.addProduct(
          id: 'wallet-rice',
          name: 'Wallet Rice',
          priceMmk: 1800,
          openingStock: 2,
        );
        const operationId = 'member-wallet-retired-after-intent';
        const lines = [
          ShopSaleLineInput(productId: 'wallet-rice', quantity: 1),
        ];
        await database.createWalletCheckoutIntent(
          operationId: operationId,
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
          memberCardToken: token,
        );
        await _changeMemberCardStatePreservingSchema(
          database,
          memberId: memberId,
          state: 'retired',
        );
        await database.verifyReadyForUse();
        final retriedIntent = await database.createWalletCheckoutIntent(
          operationId: operationId,
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
          memberCardToken: token,
        );
        expect(retriedIntent.member?.memberId, memberId);
        final stockBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        final sale = await database.recordSale(
          operationId: operationId,
          lines: lines,
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: operationId,
        );
        expect(sale.member?.memberId, memberId);
        expect(await database.countSales(), 1);
        expect(await database.countStockMovements(), stockBefore + 1);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        final retry = await database.recordSale(
          operationId: operationId,
          lines: lines,
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: operationId,
        );
        expect(retry.member?.memberId, memberId);
        expect(await database.countSales(), 1);
        expect(await database.countStockMovements(), stockBefore + 1);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        expect((await database.readActiveProducts()).single.onHand, 1);
      } finally {
        await database.close();
      }
    });

    test('catalog boundaries reserve the member-card namespace', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(13);
        await expectLater(
          database.addProduct(
            id: 'reserved-barcode',
            name: 'Reserved barcode',
            priceMmk: 100,
            openingStock: 1,
            barcode: token,
          ),
          throwsArgumentError,
        );
        await expectLater(
          database.addProduct(
            id: 'reserved-sku',
            name: 'Reserved SKU',
            priceMmk: 100,
            openingStock: 1,
            sku: token.toLowerCase(),
          ),
          throwsArgumentError,
        );
        await database.addProduct(
          id: 'normal-product',
          name: 'Normal product',
          priceMmk: 100,
          openingStock: 1,
          barcode: '0012345678905',
        );
        await expectLater(
          database.updateProductDetails(
            operationId: 'reserved-update',
            productId: 'normal-product',
            expectedName: 'Normal product',
            expectedCategory: '',
            expectedPriceMmk: 100,
            expectedBarcode: '0012345678905',
            name: 'Normal product',
            category: '',
            priceMmk: 100,
            barcode: token,
          ),
          throwsArgumentError,
        );
        await expectLater(
          database.stageMenuCandidates(
            batchId: 'reserved-stage',
            drafts: [
              MenuDraftInput(
                id: 'reserved-draft',
                batchId: 'reserved-stage',
                category: 'General',
                name: 'Reserved draft',
                description: '',
                priceMmk: 100,
                sku: null,
                barcode: token,
                openingStock: 1,
              ),
            ],
          ),
          throwsArgumentError,
        );
        await expectLater(
          database.importReviewedMenuBatch(
            batchId: 'reserved-import',
            products: [
              MenuDraftInput(
                id: 'reserved-import-row',
                batchId: 'reserved-import',
                category: 'General',
                name: 'Reserved import',
                description: '',
                priceMmk: 100,
                sku: token,
                barcode: null,
                openingStock: 1,
              ),
            ],
          ),
          throwsArgumentError,
        );
        expect(
          (await database.readActiveProducts()).single.id,
          'normal-product',
        );
      } finally {
        await database.close();
      }
    });

    test('v16 encrypted backup restores member identity exactly', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-backup-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(7);
        final retiredToken = _token(17);
        await _seedMember(
          source,
          memberId: _memberId('6'),
          displayCode: '00000008',
          activeToken: token,
          retiredToken: retiredToken,
        );
        await source.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 1500,
          openingStock: 2,
        );
        await source.recordSale(
          operationId: 'member-backup-sale',
          lines: const [ShopSaleLineInput(productId: 'coffee', quantity: 1)],
          paymentMethod: 'cash',
          memberCardToken: token,
        );
        final storeRef = await source.readStoreRef();
        final archive = File('${directory.path}/member.smbak');
        await ShopBackup.exportEncrypted(
          database: source,
          archive: archive,
          password: 'member backup test password',
          scratchRoot: directory,
        );
        final target = File('${directory.path}/restored.sqlite');
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: 'member backup test password',
        );
        ShopBackup.verifySnapshot(
          target,
          expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
        );
        final restored = ShopDatabase(NativeDatabase(target));
        try {
          expect(await restored.readStoreRef(), storeRef);
          expect(
            (await restored.lookupActiveMemberCard(token))?.member.displayCode,
            '00000008',
          );
          expect(await restored.lookupActiveMemberCard(retiredToken), isNull);
          final cardStates = await restored
              .customSelect(
                'SELECT revision, state FROM shop_member_cards '
                'WHERE member_id = ? ORDER BY revision',
                variables: [Variable<String>(_memberId('6'))],
              )
              .get();
          expect(cardStates.map((row) => row.data).toList(), [
            {'revision': 1, 'state': 'retired'},
            {'revision': 2, 'state': 'active'},
          ]);
          expect(
            (await restored.readSaleMember('member-backup-sale'))?.memberId,
            _memberId('6'),
          );
          expect(await restored.countSales(), 1);
          expect((await restored.readActiveProducts()).single.onHand, 1);
        } finally {
          await restored.close();
        }
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });

    test(
      'authentic v15 upgrades with empty member state and no sale replay',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'shop-member-v15-',
        );
        final source = ShopDatabase(NativeDatabase.memory());
        try {
          await source.addProduct(
            id: 'soap',
            name: 'Soap',
            priceMmk: 900,
            openingStock: 3,
          );
          await source.recordCashSale(
            operationId: 'v15-existing-sale',
            lines: const [ShopSaleLineInput(productId: 'soap', quantity: 1)],
          );
          final snapshot = File('${directory.path}/legacy-v15.sqlite');
          await source.exportVerifiedLocalSnapshot(snapshot);
          final raw = sqlite3.open(snapshot.path);
          try {
            _removeV17CorrectionConsumptionObjects(raw);
            for (final table in const [
              'shop_wallet_checkout_member_links',
              'shop_sale_member_links',
              'shop_member_cards',
              'shop_members',
              'shop_store_identity',
            ]) {
              raw.execute('DROP TABLE $table');
            }
            raw.execute('PRAGMA user_version = 15');
          } finally {
            raw.close();
          }
          ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 15);
          final upgraded = ShopDatabase(NativeDatabase(snapshot));
          try {
            await upgraded.verifyReadyForUse();
            expect(upgraded.schemaVersion, 22);
            expect(await upgraded.countSales(), 1);
            expect(await upgraded.countStockMovements(), 2);
            expect(await upgraded.countOutboxOperations(), 2);
            expect((await upgraded.readActiveProducts()).single.onHand, 2);
            expect(await upgraded.readSaleMember('v15-existing-sale'), isNull);
            final retry = await upgraded.recordCashSale(
              operationId: 'v15-existing-sale',
              lines: const [ShopSaleLineInput(productId: 'soap', quantity: 1)],
            );
            expect(retry.member, isNull);
            expect(await upgraded.countSales(), 1);
            expect(await upgraded.countStockMovements(), 2);
            expect(await upgraded.countOutboxOperations(), 2);
            expect((await upgraded.readActiveProducts()).single.onHand, 2);
            expect(
              await upgraded.readStoreRef(),
              matches(RegExp(r'^[0-9a-f]{64}$')),
            );
          } finally {
            await upgraded.close();
          }
        } finally {
          await source.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'v15 non-token SMC1 catalog code upgrades without rewriting history',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'shop-member-v15-legacy-prefix-',
        );
        final source = ShopDatabase(NativeDatabase.memory());
        try {
          await source.addProduct(
            id: 'legacy-prefix',
            name: 'Legacy prefix',
            priceMmk: 500,
            sku: 'SAFE-LEGACY-SKU',
            openingStock: 2,
          );
          await source.recordCashSale(
            operationId: 'legacy-prefix-sale',
            lines: const [
              ShopSaleLineInput(productId: 'legacy-prefix', quantity: 1),
            ],
          );
          final snapshot = File('${directory.path}/legacy-v15-prefix.sqlite');
          await source.exportVerifiedLocalSnapshot(snapshot);
          final raw = sqlite3.open(snapshot.path);
          try {
            _removeV17CorrectionConsumptionObjects(raw);
            raw.execute(
              "UPDATE shop_products SET sku = 'smc1.legacy-merchant-code' "
              "WHERE id = 'legacy-prefix'",
            );
            for (final table in const [
              'shop_wallet_checkout_member_links',
              'shop_sale_member_links',
              'shop_member_cards',
              'shop_members',
              'shop_store_identity',
            ]) {
              raw.execute('DROP TABLE $table');
            }
            raw.execute('PRAGMA user_version = 15');
          } finally {
            raw.close();
          }
          ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 15);
          final upgraded = ShopDatabase(NativeDatabase(snapshot));
          try {
            await upgraded.verifyReadyForUse();
            expect(upgraded.schemaVersion, 22);
            final product = (await upgraded.readActiveProducts()).single;
            expect(product.sku, 'smc1.legacy-merchant-code');
            expect(product.onHand, 1);
            expect(await upgraded.countSales(), 1);
            expect(await upgraded.countStockMovements(), 2);
            expect(await upgraded.countOutboxOperations(), 2);
            final verified = File('${directory.path}/verified-v20.sqlite');
            await upgraded.exportVerifiedLocalSnapshot(verified);
            ShopBackup.verifySnapshot(
              verified,
              expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
            );
            final archive = File('${directory.path}/legacy-prefix.smbk');
            final scratch = Directory('${directory.path}/scratch');
            await scratch.create();
            await ShopBackup.exportEncrypted(
              database: upgraded,
              archive: archive,
              password: 'legacy-prefix-backup-password',
              scratchRoot: scratch,
            );
            final restored = File('${directory.path}/restored.sqlite');
            await ShopBackup.restoreIntoEmptyDatabase(
              archive: archive,
              target: restored,
              password: 'legacy-prefix-backup-password',
            );
            final reopened = ShopDatabase(NativeDatabase(restored));
            try {
              await reopened.verifyReadyForUse();
              expect(
                (await reopened.readActiveProducts()).single.sku,
                'smc1.legacy-merchant-code',
              );
              expect(await reopened.countSales(), 1);
              expect(await reopened.countStockMovements(), 2);
              expect(await reopened.countOutboxOperations(), 2);
            } finally {
              await reopened.close();
            }
          } finally {
            await upgraded.close();
          }
        } finally {
          await source.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test('v15 token-shaped catalog code upgrades but disables member cards', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-v15-collision-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        await source.addProduct(
          id: 'legacy-collision',
          name: 'Legacy collision',
          priceMmk: 500,
          sku: 'SAFE-LEGACY-SKU',
          openingStock: 2,
        );
        await source.recordCashSale(
          operationId: 'legacy-collision-sale',
          lines: const [
            ShopSaleLineInput(productId: 'legacy-collision', quantity: 1),
          ],
        );
        final snapshot = File('${directory.path}/legacy-v15-collision.sqlite');
        await source.exportVerifiedLocalSnapshot(snapshot);
        final raw = sqlite3.open(snapshot.path);
        try {
          _removeV17CorrectionConsumptionObjects(raw);
          raw.execute(
            "UPDATE shop_products SET sku = ?, archived = 1 "
            "WHERE id = 'legacy-collision'",
            [_token(21)],
          );
          for (final table in const [
            'shop_wallet_checkout_member_links',
            'shop_sale_member_links',
            'shop_member_cards',
            'shop_members',
            'shop_store_identity',
          ]) {
            raw.execute('DROP TABLE $table');
          }
          raw.execute('PRAGMA user_version = 15');
        } finally {
          raw.close();
        }
        ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 15);
        final upgraded = ShopDatabase(NativeDatabase(snapshot));
        try {
          await upgraded.verifyReadyForUse();
          expect(upgraded.schemaVersion, 22);
          expect(await upgraded.memberCardIdentificationAvailable(), isFalse);
          await _seedMember(
            upgraded,
            memberId: _memberId('d'),
            displayCode: '444444',
            activeToken: _token(22),
          );
          expect(await upgraded.lookupActiveMemberCard(_token(22)), isNull);
          expect(await upgraded.countSales(), 1);
          expect(await upgraded.countStockMovements(), 2);
          expect(await upgraded.countOutboxOperations(), 2);
          expect(await upgraded.readActiveProducts(), isEmpty);
          final retry = await upgraded.recordCashSale(
            operationId: 'legacy-collision-sale',
            lines: const [
              ShopSaleLineInput(productId: 'legacy-collision', quantity: 1),
            ],
          );
          expect(retry.member, isNull);
          expect(await upgraded.countSales(), 1);
          expect(await upgraded.countStockMovements(), 2);
          expect(await upgraded.countOutboxOperations(), 2);
        } finally {
          await upgraded.close();
        }
        final unchanged = sqlite3.open(snapshot.path);
        try {
          expect(unchanged.userVersion, ShopBackup.supportedSchemaVersion);
          expect(
            unchanged
                .select(
                  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' "
                  "AND name IN ('shop_store_identity', 'shop_members', "
                  "'shop_member_cards', 'shop_sale_member_links', "
                  "'shop_wallet_checkout_member_links')",
                )
                .single['count'],
            5,
          );
          expect(
            unchanged
                .select(
                  "SELECT sku FROM shop_products WHERE id = 'legacy-collision'",
                )
                .single['sku'],
            _token(21),
          );
          expect(
            unchanged
                .select('SELECT COUNT(*) AS count FROM shop_sales')
                .single['count'],
            1,
          );
          expect(
            unchanged
                .select('SELECT COUNT(*) AS count FROM shop_stock_movements')
                .single['count'],
            2,
          );
          expect(
            unchanged
                .select('SELECT COUNT(*) AS count FROM shop_sync_outbox')
                .single['count'],
            2,
          );
        } finally {
          unchanged.close();
        }
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });

    test(
      'v15 wallet intent resumes after v16 upgrade without replay',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'shop-member-v15-wallet-',
        );
        final source = ShopDatabase(NativeDatabase.memory());
        try {
          await source.addProduct(
            id: 'wallet-tea',
            name: 'Wallet Tea',
            priceMmk: 1200,
            openingStock: 2,
          );
          const operationId = 'v15-wallet-intent';
          const lines = [
            ShopSaleLineInput(productId: 'wallet-tea', quantity: 1),
          ];
          await source.createWalletCheckoutIntent(
            operationId: operationId,
            merchant: MerchantWalletSetup(
              provider: 'WavePay',
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: lines,
          );
          final snapshot = File('${directory.path}/legacy-v15-wallet.sqlite');
          await source.exportVerifiedLocalSnapshot(snapshot);
          final raw = sqlite3.open(snapshot.path);
          try {
            _removeV17CorrectionConsumptionObjects(raw);
            for (final table in const [
              'shop_wallet_checkout_member_links',
              'shop_sale_member_links',
              'shop_member_cards',
              'shop_members',
              'shop_store_identity',
            ]) {
              raw.execute('DROP TABLE $table');
            }
            raw.execute('PRAGMA user_version = 15');
          } finally {
            raw.close();
          }
          ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 15);
          final upgraded = ShopDatabase(NativeDatabase(snapshot));
          try {
            final pending = await upgraded.readPendingWalletCheckout();
            expect(pending?.operationId, operationId);
            expect(pending?.member, isNull);
            final stockBefore = await upgraded.countStockMovements();
            final outboxBefore = await upgraded.countOutboxOperations();
            final sale = await upgraded.recordSale(
              operationId: operationId,
              lines: lines,
              paymentMethod: 'wavepay',
              walletCheckoutOperationId: operationId,
            );
            expect(sale.member, isNull);
            expect(await upgraded.countSales(), 1);
            expect(await upgraded.countStockMovements(), stockBefore + 1);
            expect(await upgraded.countOutboxOperations(), outboxBefore + 1);
            final replay = await upgraded.recordSale(
              operationId: operationId,
              lines: lines,
              paymentMethod: 'wavepay',
              walletCheckoutOperationId: operationId,
            );
            expect(replay.id, sale.id);
            expect(await upgraded.countSales(), 1);
            expect(await upgraded.countStockMovements(), stockBefore + 1);
            expect(await upgraded.countOutboxOperations(), outboxBefore + 1);
            expect((await upgraded.readActiveProducts()).single.onHand, 1);
          } finally {
            await upgraded.close();
          }
        } finally {
          await source.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'card retirement before commit cannot attach the wrong member',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          final token = _token(10);
          await _seedMember(
            database,
            memberId: _memberId('8'),
            displayCode: '00000010',
            activeToken: token,
          );
          await database.addProduct(
            id: 'retirement-rice',
            name: 'Rice',
            priceMmk: 1000,
            openingStock: 2,
          );
          expect(await database.lookupActiveMemberCard(token), isNotNull);
          await _changeMemberCardStatePreservingSchema(
            database,
            memberId: _memberId('8'),
            state: 'retired',
          );
          await database.verifyReadyForUse();
          final stockBefore = await database.countStockMovements();
          final outboxBefore = await database.countOutboxOperations();
          await expectLater(
            database.recordSale(
              operationId: 'retired-before-commit',
              lines: const [
                ShopSaleLineInput(productId: 'retirement-rice', quantity: 1),
              ],
              paymentMethod: 'cash',
              memberCardToken: token,
            ),
            throwsStateError,
          );
          expect(await database.countSales(), 0);
          expect(await database.countStockMovements(), stockBefore);
          expect(await database.countOutboxOperations(), outboxBefore);
          expect((await database.readActiveProducts()).single.onHand, 2);
        } finally {
          await database.close();
        }
      },
    );

    test('exact completed cash retry survives later card retirement only for the same link', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(14);
        final memberId = _memberId('a');
        await _seedMember(
          database,
          memberId: memberId,
          displayCode: '00000014',
          activeToken: token,
        );
        await database.addProduct(
          id: 'retry-rice',
          name: 'Retry Rice',
          priceMmk: 900,
          openingStock: 2,
        );
        const lines = [ShopSaleLineInput(productId: 'retry-rice', quantity: 1)];
        final first = await database.recordSale(
          operationId: 'retired-card-retry',
          lines: lines,
          paymentMethod: 'cash',
          memberCardToken: token,
        );
        await _changeMemberCardStatePreservingSchema(
          database,
          memberId: memberId,
          state: 'retired',
        );
        await database.verifyReadyForUse();
        final stockBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        final retry = await database.recordSale(
          operationId: 'retired-card-retry',
          lines: lines,
          paymentMethod: 'cash',
          memberCardToken: token,
        );
        expect(retry.id, first.id);
        expect(retry.member?.memberId, memberId);
        expect(await database.countSales(), 1);
        expect(await database.countStockMovements(), stockBefore);
        expect(await database.countOutboxOperations(), outboxBefore);
        await expectLater(
          database.recordSale(
            operationId: 'new-sale-with-retired-card',
            lines: lines,
            paymentMethod: 'cash',
            memberCardToken: token,
          ),
          throwsStateError,
        );
        expect((await database.readActiveProducts()).single.onHand, 1);
      } finally {
        await database.close();
      }
    });

    test(
      'revoked member permits only exact prior cash and wallet retries',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          final token = _token(20);
          final memberId = _memberId('f');
          await _seedMember(
            database,
            memberId: memberId,
            displayCode: '00000020',
            activeToken: token,
          );
          await database.addProduct(
            id: 'revoked-member-item',
            name: 'Revoked member item',
            priceMmk: 1000,
            openingStock: 4,
          );
          const lines = [
            ShopSaleLineInput(productId: 'revoked-member-item', quantity: 1),
          ];
          final cash = await database.recordSale(
            operationId: 'revoked-member-cash',
            lines: lines,
            paymentMethod: 'cash',
            memberCardToken: token,
          );
          const walletOperation = 'revoked-member-wallet';
          final merchant = MerchantWalletSetup(
            provider: 'WavePay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          );
          await database.createWalletCheckoutIntent(
            operationId: walletOperation,
            merchant: merchant,
            lines: lines,
            memberCardToken: token,
          );
          await _changeMemberCardStatePreservingSchema(
            database,
            memberId: memberId,
            state: 'revoked',
          );
          await database.verifyReadyForUse();

          final stockBefore = await database.countStockMovements();
          final outboxBefore = await database.countOutboxOperations();
          final cashRetry = await database.recordSale(
            operationId: 'revoked-member-cash',
            lines: lines,
            paymentMethod: 'cash',
            memberCardToken: token,
          );
          expect(cashRetry.id, cash.id);
          final walletRetry = await database.createWalletCheckoutIntent(
            operationId: walletOperation,
            merchant: merchant,
            lines: lines,
            memberCardToken: token,
          );
          expect(walletRetry.member?.memberId, memberId);
          final walletSale = await database.recordSale(
            operationId: walletOperation,
            lines: lines,
            paymentMethod: 'wavepay',
            walletCheckoutOperationId: walletOperation,
          );
          expect(walletSale.member?.memberId, memberId);
          expect(await database.countSales(), 2);
          expect(await database.countStockMovements(), stockBefore + 1);
          expect(await database.countOutboxOperations(), outboxBefore + 1);
          await expectLater(
            database.recordSale(
              operationId: 'revoked-member-new-cash',
              lines: lines,
              paymentMethod: 'cash',
              memberCardToken: token,
            ),
            throwsStateError,
          );
          expect((await database.readActiveProducts()).single.onHand, 2);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'v16 member schema tampering fails backup verification closed',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'shop-member-tamper-',
        );
        final source = ShopDatabase(NativeDatabase.memory());
        try {
          await _seedMember(
            source,
            memberId: _memberId('7'),
            displayCode: '00000009',
            activeToken: _token(8),
          );
          final snapshot = File('${directory.path}/tampered.sqlite');
          await source.exportVerifiedLocalSnapshot(snapshot);
          final raw = sqlite3.open(snapshot.path);
          try {
            raw.execute('DROP TRIGGER shop_members_no_update');
          } finally {
            raw.close();
          }
          expect(
            () => ShopBackup.verifySnapshot(
              snapshot,
              expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
            ),
            throwsFormatException,
          );
        } finally {
          await source.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test('tampered member link provenance fails export verification', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-link-tamper-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        final firstToken = _token(15);
        await _seedMember(
          source,
          memberId: _memberId('b'),
          displayCode: '00000015',
          activeToken: firstToken,
        );
        await _seedMember(
          source,
          memberId: _memberId('c'),
          displayCode: '00000016',
          activeToken: _token(16),
        );
        await source.addProduct(
          id: 'tamper-rice',
          name: 'Tamper Rice',
          priceMmk: 700,
          openingStock: 2,
        );
        await source.recordSale(
          operationId: 'tampered-member-link',
          lines: const [
            ShopSaleLineInput(productId: 'tamper-rice', quantity: 1),
          ],
          paymentMethod: 'cash',
          memberCardToken: firstToken,
        );
        await source.customStatement(
          'DROP TRIGGER shop_sale_member_links_no_update',
        );
        await source.customUpdate(
          'UPDATE shop_sale_member_links SET member_id = ?, display_code = ? '
          'WHERE sale_id = ?',
          variables: [
            Variable<String>(_memberId('c')),
            const Variable<String>('00000016'),
            const Variable<String>('tampered-member-link'),
          ],
        );
        final snapshot = File('${directory.path}/tampered-link.sqlite');
        await expectLater(
          source.exportVerifiedLocalSnapshot(snapshot),
          throwsStateError,
        );
        expect(await snapshot.exists(), isFalse);
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });

    test('deleted sale member link fails export verification', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-link-delete-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(18);
        await _seedMember(
          source,
          memberId: _memberId('d'),
          displayCode: '00000018',
          activeToken: token,
        );
        await source.addProduct(
          id: 'delete-link-rice',
          name: 'Delete Link Rice',
          priceMmk: 800,
          openingStock: 2,
        );
        await source.recordSale(
          operationId: 'deleted-member-link',
          lines: const [
            ShopSaleLineInput(productId: 'delete-link-rice', quantity: 1),
          ],
          paymentMethod: 'cash',
          memberCardToken: token,
        );
        final tamperedSnapshot = File(
          '${directory.path}/deleted-link-backup.sqlite',
        );
        await source.exportVerifiedLocalSnapshot(tamperedSnapshot);
        final raw = sqlite3.open(tamperedSnapshot.path);
        try {
          final snapshotTriggerSql =
              raw
                      .select(
                        "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                        "AND name = 'shop_sale_member_links_no_delete'",
                      )
                      .single['sql']!
                  as String;
          raw.execute('DROP TRIGGER shop_sale_member_links_no_delete');
          raw.execute(
            "DELETE FROM shop_sale_member_links WHERE sale_id = 'deleted-member-link'",
          );
          raw.execute(snapshotTriggerSql);
        } finally {
          raw.close();
        }
        expect(
          () => ShopBackup.verifySnapshot(
            tamperedSnapshot,
            expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
          ),
          throwsFormatException,
        );
        final triggerSql =
            (await source
                    .customSelect(
                      "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                      "AND name = 'shop_sale_member_links_no_delete'",
                    )
                    .getSingle())
                .read<String>('sql');
        await source.customStatement(
          'DROP TRIGGER shop_sale_member_links_no_delete',
        );
        await source.customStatement(
          "DELETE FROM shop_sale_member_links WHERE sale_id = 'deleted-member-link'",
        );
        await source.customStatement(triggerSql);
        await expectLater(source.verifyReadyForUse(), throwsStateError);
        final snapshot = File('${directory.path}/deleted-link.sqlite');
        await expectLater(
          source.exportVerifiedLocalSnapshot(snapshot),
          throwsStateError,
        );
        expect(await snapshot.exists(), isFalse);
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });

    test('deleted wallet member link fails export verification', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-wallet-member-link-delete-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        final token = _token(19);
        await _seedMember(
          source,
          memberId: _memberId('e'),
          displayCode: '00000019',
          activeToken: token,
        );
        await source.addProduct(
          id: 'delete-wallet-link-tea',
          name: 'Delete Wallet Link Tea',
          priceMmk: 600,
          openingStock: 2,
        );
        await source.createWalletCheckoutIntent(
          operationId: 'deleted-wallet-member-link',
          merchant: MerchantWalletSetup(
            provider: 'WavePay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [
            ShopSaleLineInput(productId: 'delete-wallet-link-tea', quantity: 1),
          ],
          memberCardToken: token,
        );
        final tamperedSnapshot = File(
          '${directory.path}/deleted-wallet-link-backup.sqlite',
        );
        await source.exportVerifiedLocalSnapshot(tamperedSnapshot);
        final raw = sqlite3.open(tamperedSnapshot.path);
        try {
          final snapshotTriggerSql =
              raw
                      .select(
                        "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                        "AND name = 'shop_wallet_checkout_member_links_no_delete'",
                      )
                      .single['sql']!
                  as String;
          raw.execute(
            'DROP TRIGGER shop_wallet_checkout_member_links_no_delete',
          );
          raw.execute(
            "DELETE FROM shop_wallet_checkout_member_links "
            "WHERE operation_id = 'deleted-wallet-member-link'",
          );
          raw.execute(snapshotTriggerSql);
        } finally {
          raw.close();
        }
        expect(
          () => ShopBackup.verifySnapshot(
            tamperedSnapshot,
            expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
          ),
          throwsFormatException,
        );
        final triggerSql =
            (await source
                    .customSelect(
                      "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                      "AND name = 'shop_wallet_checkout_member_links_no_delete'",
                    )
                    .getSingle())
                .read<String>('sql');
        await source.customStatement(
          'DROP TRIGGER shop_wallet_checkout_member_links_no_delete',
        );
        await source.customStatement(
          "DELETE FROM shop_wallet_checkout_member_links "
          "WHERE operation_id = 'deleted-wallet-member-link'",
        );
        await source.customStatement(triggerSql);
        await expectLater(source.verifyReadyForUse(), throwsStateError);
        final snapshot = File('${directory.path}/deleted-wallet-link.sqlite');
        await expectLater(
          source.exportVerifiedLocalSnapshot(snapshot),
          throwsStateError,
        );
        expect(await snapshot.exists(), isFalse);
      } finally {
        await source.close();
        await directory.delete(recursive: true);
      }
    });
  });
}

String _token(int seed) {
  final bytes = List<int>.generate(32, (index) => (seed + index) & 0xff);
  return 'SMC1.${base64Url.encode(bytes).replaceAll('=', '')}';
}

String _memberId(String digit) => 'mem_${List.filled(32, digit).join()}';

Future<String> _digest(String token) async {
  final digest = await Sha256().hash(
    utf8.encode('supermega.shop.member-card.lookup.v1\u0000$token'),
  );
  return digest.bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
}

Future<void> _seedMember(
  ShopDatabase database, {
  required String memberId,
  required String displayCode,
  required String activeToken,
  String? retiredToken,
  String status = 'active',
}) async {
  final storeRef = await database.readStoreRef();
  const now = 1_800_000_000_000;
  await database.customInsert(
    'INSERT INTO shop_members '
    '(id, store_ref, display_code, status, created_at_millis, updated_at_millis) '
    'VALUES (?, ?, ?, ?, ?, ?)',
    variables: [
      Variable<String>(memberId),
      Variable<String>(storeRef),
      Variable<String>(displayCode),
      Variable<String>(status),
      const Variable<int>(now),
      const Variable<int>(now),
    ],
  );
  if (retiredToken != null) {
    await database.customInsert(
      'INSERT INTO shop_member_cards '
      '(token_digest, member_id, revision, state, issued_at_millis, '
      'retired_at_millis) VALUES (?, ?, 1, ?, ?, ?)',
      variables: [
        Variable<String>(await _digest(retiredToken)),
        Variable<String>(memberId),
        const Variable<String>('retired'),
        const Variable<int>(now),
        const Variable<int>(now + 1),
      ],
    );
  }
  await database.customInsert(
    'INSERT INTO shop_member_cards '
    '(token_digest, member_id, revision, state, issued_at_millis, '
    'retired_at_millis) VALUES (?, ?, ?, ?, ?, NULL)',
    variables: [
      Variable<String>(await _digest(activeToken)),
      Variable<String>(memberId),
      Variable<int>(retiredToken == null ? 1 : 2),
      const Variable<String>('active'),
      const Variable<int>(now + 2),
    ],
  );
}

Future<void> _changeMemberCardStatePreservingSchema(
  ShopDatabase database, {
  required String memberId,
  required String state,
}) async {
  final triggerSql =
      (await database
              .customSelect(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                "AND name = 'shop_member_cards_no_update'",
              )
              .getSingle())
          .read<String>('sql');
  await database.customStatement('DROP TRIGGER shop_member_cards_no_update');
  await database.customUpdate(
    'UPDATE shop_member_cards SET state = ?, retired_at_millis = ? '
    'WHERE member_id = ?',
    variables: [
      Variable<String>(state),
      const Variable<int>(1_800_000_000_100),
      Variable<String>(memberId),
    ],
  );
  if (state == 'revoked') {
    final memberTriggerSql =
        (await database
                .customSelect(
                  "SELECT sql FROM sqlite_master WHERE type = 'trigger' "
                  "AND name = 'shop_members_no_update'",
                )
                .getSingle())
            .read<String>('sql');
    await database.customStatement('DROP TRIGGER shop_members_no_update');
    await database.customUpdate(
      'UPDATE shop_members SET status = ?, updated_at_millis = ? WHERE id = ?',
      variables: [
        const Variable<String>('revoked'),
        const Variable<int>(1_800_000_000_100),
        Variable<String>(memberId),
      ],
    );
    await database.customStatement(memberTriggerSql);
  }
  await database.customStatement(triggerSql);
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
  return '$body${_crc16(utf8.encode(body))}';
}

void _removeV17CorrectionConsumptionObjects(Database connection) {
  connection.execute('ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk');
  for (final definition
      in shopPendingCashCheckoutSchemaDefinitionsV21().entries
          .toList()
          .reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCafeCancellationSchemaDefinitionsV20().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCafeOrderSchemaDefinitionsV19().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCashMovementSchemaDefinitionsV18().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
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
  for (final trigger in const [
    'shop_sale_reversals_require_consumption',
    'shop_wallet_reconciliations_require_consumption',
    'shop_correction_lineage_state_guard_update',
    'shop_correction_lineage_state_no_delete',
    'shop_correction_consumption_intents_no_update',
    'shop_correction_consumption_intents_no_delete',
    'shop_correction_consumptions_no_update',
    'shop_correction_consumptions_no_delete',
  ]) {
    connection.execute('DROP TRIGGER IF EXISTS $trigger');
  }
  for (final table in const [
    'shop_correction_consumptions',
    'shop_correction_consumption_intents',
    'shop_correction_lineage_state',
  ]) {
    connection.execute('DROP TABLE IF EXISTS $table');
  }
}

String _crc16(List<int> bytes) {
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
