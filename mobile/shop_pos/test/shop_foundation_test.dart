import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/menu_import_service.dart';
import 'package:supermega_shop/printer_services.dart';
import 'package:supermega_shop/shop_cash_shift_screen.dart';
import 'package:supermega_shop/shop_copy.dart';
import 'package:supermega_shop/shop_database.dart';

import 'managed_staff_test_support.dart';

import 'package:supermega_shop/shop_models.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

const _testCorrectionKeyId = 'shop-test-2026';
const _testCorrectionPublicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
final _testCorrectionReceiptVerifier = ShopCorrectionReceiptVerifier({
  _testCorrectionKeyId: _testCorrectionPublicKey,
});

void main() {
  test('correction authorization receipt v3 digest is stable', () {
    expect(
      shopCorrectionAuthorizationReceiptDigest(
        source: 'managed_membership_receipt_v1',
        receiptId: '11111111-1111-4111-8111-111111111111',
        finalizationRequestId: '22222222-2222-4222-8222-222222222222',
        workspaceId: 'workspace-1',
        actorId: 'actor-1',
        actorLabel: 'Workspace owner',
        actorRole: 'owner',
        capability: 'shop.sale.reverse',
        commandDigest: List<String>.filled(64, '0').join(),
        finalizedAtMillis: 1000,
        issuedAtMillis: 1000,
        expiresAtMillis: 301000,
      ),
      '5bd47b28aba9fda0f821113cad67d159c0ad94c38f052ff1a3efb42a6ce54c7a',
    );
  });

  group('menu candidate contract', () {
    test('accepts a nullable price and preserves Burmese text', () {
      final item = MenuCandidate.fromJson({
        'category': 'အစားအသောက်',
        'description': '',
        'name': 'မုန့်',
        'price': null,
      });
      expect(item.category, 'အစားအသောက်');
      expect(item.name, 'မုန့်');
      expect(item.priceMmk, isNull);
    });

    test('rejects unexpected fields and non-integer MMK values', () {
      expect(
        () => MenuCandidate.fromJson({
          'category': 'Food',
          'description': '',
          'name': 'Tea',
          'price': 1500,
          'sku': 'invented',
        }),
        throwsFormatException,
      );
      expect(
        () => MenuCandidate.fromJson({
          'category': 'Food',
          'description': '',
          'name': 'Tea',
          'price': 1500.5,
        }),
        throwsFormatException,
      );
    });
  });

  group('menu photo service', () {
    test('missing runtime scope cannot open the production import client', () {
      expect(
        () => MenuImportService(
          endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
          accessToken: () async => 'session',
        ),
        throwsStateError,
      );
    });

    test('injecting a client does not authorize a missing import scope', () {
      expect(
        () => MenuImportService(
          endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
          accessToken: () async => 'session',
          client: MockClient((_) async => http.Response('{}', 200)),
        ),
        throwsStateError,
      );
    });

    test('deletes the temporary camera file after the flow', () async {
      final directory = await Directory.systemTemp.createTemp('shop-menu-');
      final file = File('${directory.path}${Platform.pathSeparator}menu.png');
      await file.writeAsBytes(_pngBytes());
      expect(await file.exists(), isTrue);

      await discardCapturedMenuPhoto(XFile(file.path), createdByCamera: true);

      expect(await file.exists(), isFalse);
      await directory.delete(recursive: true);
    });

    test('does not delete an existing gallery photo', () async {
      final directory = await Directory.systemTemp.createTemp('shop-gallery-');
      final file = File('${directory.path}${Platform.pathSeparator}menu.png');
      await file.writeAsBytes(_pngBytes());

      await discardCapturedMenuPhoto(XFile(file.path), createdByCamera: false);

      expect(await file.exists(), isTrue);
      await directory.delete(recursive: true);
    });

    test(
      'requires consent before reading a token or making a request',
      () async {
        var tokenRead = false;
        var requestMade = false;
        final client = MockClient((request) async {
          requestMade = true;
          return http.Response('{}', 200);
        });
        final service = MenuImportService(
          endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
          accessToken: () async {
            tokenRead = true;
            return 'test-session';
          },
          client: client,
          testOnlyAllowMissingRuntimeScope: true,
        );

        await expectLater(
          service.parsePhoto(
            XFile.fromData(_pngBytes(), name: 'menu.png'),
            cloudConsent: false,
          ),
          throwsA(isA<MenuImportException>()),
        );
        expect(tokenRead, isFalse);
        expect(requestMade, isFalse);
        service.close();
      },
    );

    test(
      'sends one consented photo to the authenticated endpoint and parses v1',
      () async {
        final payloads = <Map<String, dynamic>>[];
        final client = MockClient((request) async {
          expect(request.url.path, '/api/shop/menu-import');
          expect(request.headers['authorization'], 'Bearer test-session');
          payloads.add(jsonDecode(request.body) as Map<String, dynamic>);
          return http.Response(
            jsonEncode({
              'schemaVersion': 1,
              'reviewRequired': true,
              'items': [
                {
                  'category': 'ကုန်စုံ',
                  'description': '',
                  'name': 'ဆန်',
                  'price': null,
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        });
        final service = MenuImportService(
          endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
          accessToken: () async => 'test-session',
          client: client,
          testOnlyAllowMissingRuntimeScope: true,
        );
        final items = await service.parsePhoto(
          XFile.fromData(_pngBytes(), name: 'menu.png'),
          cloudConsent: true,
        );
        expect(payloads.single['cloudConsent'], isTrue);
        expect(
          (payloads.single['imageDataUrl'] as String).startsWith(
            'data:image/png;base64,',
          ),
          isTrue,
        );
        expect(items.single.name, 'ဆန်');
        expect(items.single.priceMmk, isNull);
        service.close();
      },
    );

    test('AI candidates stay out of the catalog until reviewed, then commit together', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final client = MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer test-session');
        return http.Response(
          jsonEncode({
            'schemaVersion': 1,
            'reviewRequired': true,
            'items': [
              {
                'category': 'ကုန်စုံ',
                'description': 'မြန်မာဆန် ၅ ကီလို',
                'name': 'ဆန်',
                'price': 8500,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final service = MenuImportService(
        endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
        accessToken: () async => 'test-session',
        client: client,
        testOnlyAllowMissingRuntimeScope: true,
      );
      addTearDown(service.close);

      final candidates = await service.parsePhoto(
        XFile.fromData(_pngBytes(), name: 'menu.png'),
        cloudConsent: true,
      );

      expect(candidates, hasLength(1));
      expect(candidates.single.name, 'ဆန်');
      expect(await database.readActiveProducts(), isEmpty);
      expect(await database.countOutboxOperations(), 0);

      const batchId = 'reviewed-photo-batch';
      final inserted = await database.importReviewedMenuBatch(
        batchId: batchId,
        products: [
          MenuDraftInput(
            id: 'reviewed-rice-5kg',
            batchId: batchId,
            category: candidates.single.category,
            name: candidates.single.name,
            description: candidates.single.description,
            priceMmk: candidates.single.priceMmk,
            sku: 'RICE-5KG',
            barcode: '0001234567890',
            openingStock: 4,
          ),
        ],
      );

      final product = (await database.readActiveProducts()).single;
      expect(inserted, 1);
      expect(product.name, 'ဆန်');
      expect(product.priceMmk, 8500);
      expect(product.onHand, 4);
      expect(product.barcode, '0001234567890');
      expect(await database.countStockMovements(), 1);
      expect(await database.countOutboxOperations(), 1);
    });

    test(
      'rejects oversized photos before reading a token or uploading',
      () async {
        var tokenRead = false;
        var requestMade = false;
        final service = MenuImportService(
          endpoint: Uri.https('app.supermega.dev', '/api/shop/menu-import'),
          accessToken: () async {
            tokenRead = true;
            return 'test-session';
          },
          client: MockClient((_) async {
            requestMade = true;
            return http.Response('{}', 200);
          }),
          testOnlyAllowMissingRuntimeScope: true,
        );
        await expectLater(
          service.parsePhoto(
            XFile.fromData(
              Uint8List(maxMenuPhotoBytes + 1),
              name: 'large.png',
              mimeType: 'image/png',
            ),
            cloudConsent: true,
          ),
          throwsA(isA<MenuImportException>()),
        );
        expect(tokenRead, isFalse);
        expect(requestMade, isFalse);
        service.close();
      },
    );

    test('rejects insecure endpoints before upload', () async {
      final service = MenuImportService(
        endpoint: Uri.http('localhost:4177', '/api/shop/menu-import'),
        accessToken: () async => 'test-session',
        client: MockClient((_) async => http.Response('{}', 200)),
        testOnlyAllowMissingRuntimeScope: true,
      );
      await expectLater(
        service.parsePhoto(
          XFile.fromData(_pngBytes(), name: 'menu.png'),
          cloudConsent: true,
        ),
        throwsA(isA<MenuImportException>()),
      );
      service.close();
    });

    test(
      'rejects an off-domain HTTPS endpoint before reading a token',
      () async {
        var tokenRead = false;
        final service = MenuImportService(
          endpoint: Uri.https('untrusted.example', '/api/shop/menu-import'),
          accessToken: () async {
            tokenRead = true;
            return 'test-session';
          },
          client: MockClient((_) async => http.Response('{}', 200)),
          testOnlyAllowMissingRuntimeScope: true,
        );
        await expectLater(
          service.parsePhoto(
            XFile.fromData(_pngBytes(), name: 'menu.png'),
            cloudConsent: true,
          ),
          throwsA(isA<MenuImportException>()),
        );
        expect(tokenRead, isFalse);
        service.close();
      },
    );

    test(
      'rejects an off-domain HTTPS endpoint before reading a token',
      () async {
        var tokenRead = false;
        final service = MenuImportService(
          endpoint: Uri.https('untrusted.example', '/api/shop/menu-import'),
          accessToken: () async {
            tokenRead = true;
            return 'test-session';
          },
          client: MockClient((_) async => http.Response('{}', 200)),
          testOnlyAllowMissingRuntimeScope: true,
        );
        await expectLater(
          service.parsePhoto(
            XFile.fromData(_pngBytes(), name: 'menu.png'),
            cloudConsent: true,
          ),
          throwsA(isA<MenuImportException>()),
        );
        expect(tokenRead, isFalse);
        service.close();
      },
    );
  });

  group('Drift local draft and payment setup', () {
    late ShopDatabase database;

    setUp(() {
      database = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase.memory(),
        correctionReceiptVerifier: _testCorrectionReceiptVerifier,
        testOnlyAllowUnconsumedAuthorization: true,
      );
    });

    tearDown(() async {
      await database.close();
    });

    test('product outbox failure rolls back opening stock and retries once after reopen', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-product-outbox-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var persisted = ShopDatabase(NativeDatabase(file));
      const productId = 'catalog-abort-tea';
      const operationId = 'catalog.product.created:$productId';
      try {
        await persisted.customStatement(
          'CREATE TEMP TRIGGER synthetic_product_outbox_abort '
          'AFTER INSERT ON shop_sync_outbox '
          "WHEN NEW.operation_id = '$operationId' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic product outbox failure'); END",
        );
        await expectLater(
          persisted.addProduct(
            id: productId,
            name: 'Tea',
            category: 'Drinks',
            description: 'Hot tea',
            sku: 'TEA-001',
            barcode: '0123456789012',
            priceMmk: 2500,
            openingStock: 7,
          ),
          throwsA(
            predicate<Object>(
              (error) =>
                  error.toString().contains('synthetic product outbox failure'),
            ),
          ),
        );
        expect(
          await _catalogCreationState(
            persisted,
            productId: productId,
            operationId: operationId,
          ),
          const {
            'products': <Map<String, Object?>>[],
            'movements': <Map<String, Object?>>[],
            'outbox': <Map<String, Object?>>[],
          },
        );

        await persisted.close();
        persisted = ShopDatabase(NativeDatabase(file));
        expect(
          await _catalogCreationState(
            persisted,
            productId: productId,
            operationId: operationId,
          ),
          const {
            'products': <Map<String, Object?>>[],
            'movements': <Map<String, Object?>>[],
            'outbox': <Map<String, Object?>>[],
          },
        );

        Future<void> retry() => persisted.addProduct(
          id: productId,
          name: 'Tea',
          category: 'Drinks',
          description: 'Hot tea',
          sku: 'TEA-001',
          barcode: '0123456789012',
          priceMmk: 2500,
          openingStock: 7,
        );

        await retry();
        final completed = await _catalogCreationState(
          persisted,
          productId: productId,
          operationId: operationId,
        );
        expect(completed['products'], const [
          {
            'id': productId,
            'name': 'Tea',
            'category': 'Drinks',
            'description': 'Hot tea',
            'sku': 'TEA-001',
            'barcode': '0123456789012',
            'price_mmk': 2500,
            'on_hand': 7,
          },
        ]);
        expect(completed['movements'], const [
          {
            'id': '$operationId:opening',
            'product_id': productId,
            'quantity_delta': 7,
            'reason': 'opening_stock',
          },
        ]);
        final outbox = completed['outbox']!;
        expect(outbox, hasLength(1));
        expect(outbox.single, containsPair('operation_id', operationId));
        expect(
          outbox.single,
          containsPair('event_type', 'catalog.product.created.v1'),
        );
        expect(outbox.single, containsPair('state', 'pending'));
        expect(jsonDecode(outbox.single['payload_json']! as String), const {
          'productId': productId,
          'name': 'Tea',
          'category': 'Drinks',
          'description': 'Hot tea',
          'sku': 'TEA-001',
          'barcode': '0123456789012',
          'priceMmk': 2500,
          'openingStock': 7,
        });

        await persisted.close();
        persisted = ShopDatabase(NativeDatabase(file));
        await retry();
        expect(
          await _catalogCreationState(
            persisted,
            productId: productId,
            operationId: operationId,
          ),
          completed,
        );
      } finally {
        await persisted.close();
        await directory.delete(recursive: true);
      }
    });

    test('product edit outbox failure restores reviewed values and retries once after reopen', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-product-edit-outbox-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var persisted = ShopDatabase(NativeDatabase(file));
      const productId = 'catalog-edit-tea';
      const saleId = 'catalog-edit-prior-sale';
      const editOperationId = 'catalog-edit-recovery';
      try {
        await persisted.addProduct(
          id: productId,
          name: 'Tea',
          category: 'Drinks',
          description: 'Original tea',
          sku: 'TEA-EDIT-001',
          barcode: '0123456789012',
          priceMmk: 2500,
          openingStock: 7,
        );
        await persisted.recordManagedTestCashSale(
          operationId: saleId,
          lines: const [ShopSaleLineInput(productId: productId, quantity: 1)],
        );
        final before = await _catalogEditState(
          persisted,
          productId: productId,
          saleId: saleId,
        );
        await persisted.customStatement(
          'CREATE TEMP TRIGGER synthetic_product_edit_outbox_abort '
          'AFTER INSERT ON shop_sync_outbox '
          "WHEN NEW.operation_id = '$editOperationId' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic product edit outbox failure'); END",
        );

        Future<void> edit() => persisted.updateProductDetails(
          operationId: editOperationId,
          productId: productId,
          expectedName: 'Tea',
          expectedCategory: 'Drinks',
          expectedPriceMmk: 2500,
          expectedBarcode: '0123456789012',
          name: 'Premium Tea',
          category: 'Hot Drinks',
          priceMmk: 3000,
          barcode: '0123456789098',
        );

        await expectLater(
          edit(),
          throwsA(
            predicate<Object>(
              (error) => error.toString().contains(
                'synthetic product edit outbox failure',
              ),
            ),
          ),
        );
        expect(
          await _catalogEditState(
            persisted,
            productId: productId,
            saleId: saleId,
          ),
          before,
        );

        await persisted.close();
        persisted = ShopDatabase(NativeDatabase(file));
        expect(
          await _catalogEditState(
            persisted,
            productId: productId,
            saleId: saleId,
          ),
          before,
        );

        await edit();
        final completed = await _catalogEditState(
          persisted,
          productId: productId,
          saleId: saleId,
        );
        expect(completed['products'], const [
          {
            'id': productId,
            'name': 'Premium Tea',
            'category': 'Hot Drinks',
            'description': 'Original tea',
            'sku': 'TEA-EDIT-001',
            'barcode': '0123456789098',
            'price_mmk': 3000,
            'on_hand': 6,
          },
        ]);
        expect(completed['saleLines'], const [
          {
            'sale_id': saleId,
            'product_id': productId,
            'product_name': 'Tea',
            'unit_price_mmk': 2500,
            'quantity': 1,
            'line_total_mmk': 2500,
          },
        ]);
        expect(completed['movements'], before['movements']);
        final outbox = completed['outbox']!;
        expect(outbox, hasLength(before['outbox']!.length + 1));
        final editRows = outbox
            .where((row) => row['operation_id'] == editOperationId)
            .toList(growable: false);
        expect(editRows, hasLength(1));
        expect(
          editRows.single,
          containsPair('event_type', 'catalog.product.updated.v2'),
        );
        expect(editRows.single, containsPair('state', 'pending'));
        expect(jsonDecode(editRows.single['payload_json']! as String), const {
          'productId': productId,
          'name': 'Premium Tea',
          'category': 'Hot Drinks',
          'priceMmk': 3000,
          'barcode': '0123456789098',
          'previousName': 'Tea',
          'previousCategory': 'Drinks',
          'previousPriceMmk': 2500,
          'previousBarcode': '0123456789012',
        });

        await persisted.close();
        persisted = ShopDatabase(NativeDatabase(file));
        await edit();
        expect(
          await _catalogEditState(
            persisted,
            productId: productId,
            saleId: saleId,
          ),
          completed,
        );
      } finally {
        await persisted.close();
        await directory.delete(recursive: true);
      }
    });

    test('managed workspace attachment is explicit and immutable', () async {
      expect(await database.readManagedWorkspaceBinding(), isNull);
      await expectLater(
        database.customStatement(
          "INSERT INTO shop_sale_reversals (authorization_workspace_id) VALUES ('workspace-shop-test')",
        ),
        throwsA(
          predicate(
            (error) => error.toString().contains(
              'Shop correction requires a finalized authorization proof',
            ),
          ),
        ),
      );
      await expectLater(
        database.attachAuthenticatedManagedWorkspace(
          const ShopAuthenticatedWorkspaceSelection(
            workspaceId: 'workspace-shop-test',
            actorId: 'owner-test',
            directoryContract: 'untrusted.workspace_directory.v1',
          ),
        ),
        throwsArgumentError,
      );
      expect(await database.readManagedWorkspaceBinding(), isNull);
      await database.verifyManagedWorkspaceUnavailableWithoutSession();

      final attached = await _attachTestWorkspace(database);
      await expectLater(
        database.verifyManagedWorkspaceUnavailableWithoutSession(),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database.readManagedWorkspaceBinding())?.workspaceId,
        attached.workspaceId,
      );
      await expectLater(
        database.customStatement(
          "INSERT INTO shop_sale_reversals (authorization_workspace_id) VALUES ('workspace-other')",
        ),
        throwsA(
          predicate(
            (error) => error.toString().contains(
              'Shop correction requires a finalized authorization proof',
            ),
          ),
        ),
      );
      await expectLater(
        database.customStatement(
          'INSERT INTO shop_wallet_reversal_reconciliations '
          '(reversal_id, authorization_workspace_id) '
          "VALUES ('missing-reversal', 'workspace-shop-test')",
        ),
        throwsA(
          predicate(
            (error) => error.toString().contains(
              'Shop reconciliation requires a finalized authorization proof',
            ),
          ),
        ),
      );
      final replay = await database.attachAuthenticatedManagedWorkspace(
        const ShopAuthenticatedWorkspaceSelection(
          workspaceId: 'workspace-shop-test',
          actorId: 'owner-test',
        ),
      );
      expect(replay.workspaceId, attached.workspaceId);
      expect(replay.attachedActorId, 'owner-test');
      expect(replay.attachedAtMillis, attached.attachedAtMillis);

      await expectLater(
        database.attachAuthenticatedManagedWorkspace(
          const ShopAuthenticatedWorkspaceSelection(
            workspaceId: 'workspace-shop-test',
            actorId: 'successor-owner',
          ),
        ),
        throwsA(isA<StateError>()),
      );

      await expectLater(
        database.attachAuthenticatedManagedWorkspace(
          const ShopAuthenticatedWorkspaceSelection(
            workspaceId: 'workspace-other',
            actorId: 'owner-other',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      for (final statement in [
        "UPDATE shop_managed_workspace_binding SET workspace_id = 'workspace-other'",
        'DELETE FROM shop_managed_workspace_binding',
        "INSERT OR REPLACE INTO shop_managed_workspace_binding "
            '(singleton, workspace_id, discovery_contract, '
            'attached_actor_id, attached_at_millis) VALUES '
            "(1, 'workspace-other', '$shopManagedWorkspaceDirectoryContract', "
            "'owner-other', 1)",
      ]) {
        await expectLater(
          database.customStatement(statement),
          throwsA(anything),
        );
      }
      expect(
        (await database.readManagedWorkspaceBinding())?.workspaceId,
        'workspace-shop-test',
      );
    });

    test('cloned pre-correction databases expose why global consumption stays closed', () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-correction-clone-',
      );
      final sourceFile = File('${directory.path}/source.sqlite');
      final firstCloneFile = File('${directory.path}/first.sqlite');
      final secondCloneFile = File('${directory.path}/second.sqlite');
      final source = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase(sourceFile),
        correctionReceiptVerifier: _testCorrectionReceiptVerifier,
        testOnlyAllowUnconsumedAuthorization: true,
      );
      try {
        await _attachTestWorkspace(source);
        await source.addProduct(
          id: 'clone-replay-product',
          name: 'Clone replay item',
          priceMmk: 2500,
          openingStock: 3,
        );
        await source.openManagedTestCashShift(
          operationId: 'clone-replay-shift',
          operatorLabel: 'May',
          openingFloatMmk: 10000,
        );
        final sale = await source.recordManagedTestCashSale(
          operationId: 'clone-replay-sale',
          lines: const [
            ShopSaleLineInput(productId: 'clone-replay-product', quantity: 2),
          ],
        );
        final command = await source.previewFullSaleReversal(
          operationId: 'clone-replay-reversal',
          saleId: sale.id,
          restockItems: true,
          reason: 'Document the blocked cross-database replay boundary',
          confirmCashReturned: true,
        );
        final authorization = await _correctionAuthorization(
          command.commandDigest,
          capability: 'shop.sale.reverse',
          receiptId: 'clone-replay-receipt',
        );
        await source.close();
        await sourceFile.copy(firstCloneFile.path);
        await sourceFile.copy(secondCloneFile.path);

        for (final cloneFile in [firstCloneFile, secondCloneFile]) {
          final clone = ShopDatabase.withCorrectionReceiptVerifier(
            executor: NativeDatabase(cloneFile),
            correctionReceiptVerifier: _testCorrectionReceiptVerifier,
            testOnlyAllowUnconsumedAuthorization: true,
          );
          try {
            final reversal = await clone.recordAuthorizedFullSaleReversal(
              command: command,
              authorization: authorization,
            );
            expect(reversal.authorizationReceiptId, authorization.receiptId);
            expect((await clone.readActiveProducts()).single.onHand, 3);
            expect(await clone.countSales(), 1);
          } finally {
            await clone.close();
          }
        }
      } finally {
        try {
          await source.close();
        } on Object {
          // The source is deliberately closed before its file is cloned.
        }
        await directory.delete(recursive: true);
      }
    });

    test(
      'sale receipt keeps immutable item lines for print and reprint',
      () async {
        await database.addProduct(
          id: 'tea',
          name: 'လက်ဖက်ရည်',
          priceMmk: 2500,
          openingStock: 3,
        );
        const saleLines = [ShopSaleLineInput(productId: 'tea', quantity: 2)];
        final receipt = await database.recordManagedTestCashSale(
          operationId: 'receipt-lines-sale',
          lines: saleLines,
        );
        final replay = await database.recordManagedTestCashSale(
          operationId: 'receipt-lines-sale',
          lines: saleLines,
        );

        expect(receipt.paymentMethod, 'cash');
        expect(receipt.lines.single.productName, 'လက်ဖက်ရည်');
        expect(receipt.lines.single.unitPriceMmk, 2500);
        expect(receipt.lines.single.quantity, 2);
        expect(replay.lines.single.productName, 'လက်ဖက်ရည်');
        expect(replay.lines.single.lineTotalMmk, 5000);
        final history = await database.readRecentSales();
        expect(history, hasLength(1));
        expect(history.single.id, receipt.id);
        expect(history.single.totalMmk, 5000);
        expect(history.single.lines.single.productName, 'လက်ဖက်ရည်');
        expect(history.single.lines.single.lineTotalMmk, 5000);

        final printLines = shopReceiptTextLines(receipt, myanmar: true);
        expect(printLines.first, 'SHOP');
        expect(printLines, isNot(contains('SUPERMEGA SHOP')));
        expect(shopPrinterTestTextLines.first, 'Shop');
        expect(shopPrinterTestTextLines, isNot(contains('SuperMega Shop')));
        expect(printLines, contains('လက်ဖက်ရည် x2'));
        expect(printLines, contains('စုစုပေါင်း: 5,000 MMK'));
        expect(printLines, contains('အရောင်းအမှတ် ${receipt.id}'));
        expect(printLines, contains('ငွေပေးချေမှု: ငွေသား'));
        expect(printLines, isNot(contains('Sale ${receipt.id}')));
        expect(printLines.join('\n'), isNot(contains('CASH')));

        final englishPrintLines = shopReceiptTextLines(receipt, myanmar: false);
        expect(englishPrintLines, contains('Sale ${receipt.id}'));
        expect(englishPrintLines, contains('Payment: Cash'));
      },
    );

    test('authorized cash reversal preserves snapshots, restocks once, and closes honestly', () async {
      await database.addProduct(
        id: 'tea-reversal',
        name: 'Original Tea',
        priceMmk: 2500,
        openingStock: 5,
      );
      final shift = await database.openManagedTestCashShift(
        operationId: 'cash-reversal-shift',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final sale = await database.recordManagedTestCashSale(
        operationId: 'cash-reversal-sale',
        lines: const [
          ShopSaleLineInput(productId: 'tea-reversal', quantity: 2),
        ],
      );
      final reviewedBeforeReversal = await database.readCashShiftReview(
        shift.id,
      );
      await database.customStatement(
        'UPDATE shop_products SET name = ?, price_mmk = ?, archived = 1 '
        'WHERE id = ?',
        ['Renamed Tea', 9000, 'tea-reversal'],
      );

      await expectLater(
        database.previewFullSaleReversal(
          operationId: 'cash-reversal-without-return-confirmation',
          saleId: sale.id,
          restockItems: true,
          reason: 'Customer returned the complete sale',
          confirmCashReturned: false,
        ),
        throwsArgumentError,
      );

      final command = await database.previewFullSaleReversal(
        operationId: 'cash-reversal-1',
        saleId: sale.id,
        restockItems: true,
        reason: 'Customer returned the complete sale',
        confirmCashReturned: true,
      );
      final authorization = await _correctionAuthorization(
        command.commandDigest,
        capability: 'shop.sale.reverse',
        receiptId: 'cash-reversal-receipt',
      );
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.readManagedWorkspaceBinding(), isNull);
      expect(await database.readSaleReversalForSale(sale.id), isNull);
      await _attachTestWorkspace(database);
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'foreign-workspace-receipt',
            workspaceId: 'workspace-other',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'foreign-actor-receipt',
            actorId: 'owner-other',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.readSaleReversalForSale(sale.id), isNull);
      for (final tamperedAuthorization in [
        await _correctionAuthorization(
          command.commandDigest,
          capability: 'shop.sale.reverse',
          receiptId: 'historical-v2-new-action',
          historicalV2: true,
        ),
        ShopCorrectionAuthorization(
          contract: authorization.contract,
          receiptId: authorization.receiptId,
          receiptDigest: List<String>.filled(64, '0').join(),
          workspaceId: authorization.workspaceId,
          actorId: authorization.actorId,
          actorLabel: authorization.actorLabel,
          actorRole: authorization.actorRole,
          capability: authorization.capability,
          source: authorization.source,
          commandDigest: authorization.commandDigest,
          finalizationRequestId: authorization.finalizationRequestId,
          finalizedAtMillis: authorization.finalizedAtMillis,
          issuedAtMillis: authorization.issuedAtMillis,
          expiresAtMillis: authorization.expiresAtMillis,
          keyId: authorization.keyId,
          signature: authorization.signature,
        ),
        ShopCorrectionAuthorization(
          contract: authorization.contract,
          receiptId: authorization.receiptId,
          receiptDigest: authorization.receiptDigest,
          workspaceId: authorization.workspaceId,
          actorId: authorization.actorId,
          actorLabel: 'Different owner',
          actorRole: authorization.actorRole,
          capability: authorization.capability,
          source: authorization.source,
          commandDigest: authorization.commandDigest,
          finalizationRequestId: authorization.finalizationRequestId,
          finalizedAtMillis: authorization.finalizedAtMillis,
          issuedAtMillis: authorization.issuedAtMillis,
          expiresAtMillis: authorization.expiresAtMillis,
          keyId: authorization.keyId,
          signature: authorization.signature,
        ),
        ShopCorrectionAuthorization(
          contract: authorization.contract,
          receiptId: authorization.receiptId,
          receiptDigest: authorization.receiptDigest,
          workspaceId: authorization.workspaceId,
          actorId: authorization.actorId,
          actorLabel: authorization.actorLabel,
          actorRole: authorization.actorRole,
          capability: authorization.capability,
          source: authorization.source,
          commandDigest: authorization.commandDigest,
          finalizationRequestId: authorization.finalizationRequestId,
          finalizedAtMillis: authorization.finalizedAtMillis,
          issuedAtMillis: authorization.issuedAtMillis,
          expiresAtMillis: authorization.expiresAtMillis,
          keyId: authorization.keyId,
          signature: base64Url
              .encode(List<int>.filled(64, 0))
              .replaceAll('=', ''),
        ),
      ]) {
        await expectLater(
          database.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: tamperedAuthorization,
          ),
          throwsA(isA<StateError>()),
        );
      }
      expect(await database.readSaleReversalForSale(sale.id), isNull);
      expect(
        (await database
                .customSelect(
                  'SELECT on_hand FROM shop_products WHERE id = ?',
                  variables: [const Variable<String>('tea-reversal')],
                )
                .getSingle())
            .read<int>('on_hand'),
        3,
      );
      final alteredAmount = ShopFullSaleReversalCommand(
        operationId: command.operationId,
        saleId: command.saleId,
        saleSnapshotDigest: command.saleSnapshotDigest,
        requestFingerprint: command.requestFingerprint,
        commandDigest: command.commandDigest,
        originalTotalMmk: command.originalTotalMmk + 1,
        originalPaymentMethod: command.originalPaymentMethod,
        restockItems: command.restockItems,
        reason: command.reason,
        cashReturnConfirmed: command.cashReturnConfirmed,
        expectedCashShiftId: command.expectedCashShiftId,
        paymentResolution: command.paymentResolution,
      );
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: alteredAmount,
          authorization: authorization,
        ),
        throwsA(isA<StateError>()),
      );
      final concurrentResults = await Future.wait([
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
        ),
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
        ),
      ]);
      final reversal = concurrentResults.first;
      final replay = concurrentResults.last;
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: authorization.receiptId,
            workspaceId: 'workspace-other',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'different-replay-receipt',
          ),
        ),
        throwsA(isA<StateError>()),
      );

      expect(reversal.id, replay.id);
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total '
                  'FROM shop_correction_authorization_proofs',
                )
                .getSingle())
            .read<int>('total'),
        1,
      );
      expect(reversal.originalTotalMmk, 5000);
      expect(reversal.originalPaymentMethod, 'cash');
      expect(reversal.cashDrawerDeltaMmk, -5000);
      expect(reversal.lines.single.productName, 'Original Tea');
      expect(reversal.lines.single.unitPriceMmk, 2500);
      expect(reversal.lines.single.restockQuantity, 2);
      final product = await database
          .customSelect(
            'SELECT on_hand, name, price_mmk FROM shop_products WHERE id = ?',
            variables: [const Variable<String>('tea-reversal')],
          )
          .getSingle();
      expect(
        (await database
                .customSelect(
                  'SELECT on_hand FROM shop_products WHERE id = ?',
                  variables: [const Variable<String>('tea-reversal')],
                )
                .getSingle())
            .read<int>('on_hand'),
        5,
      );
      expect(product.read<String>('name'), 'Renamed Tea');
      expect(product.read<int>('price_mmk'), 9000);
      expect(await database.countStockMovements(), 3);
      await expectLater(
        database.customStatement(
          'UPDATE shop_stock_movements SET quantity_delta = 99 WHERE id = ?',
          ['cash-reversal-1:reversal:0'],
        ),
        throwsA(anything),
      );
      await expectLater(
        database.customStatement(
          'DELETE FROM shop_stock_movements WHERE id = ?',
          ['cash-reversal-1:reversal:0'],
        ),
        throwsA(anything),
      );
      final recent = (await database.readRecentSales()).single;
      expect(recent.reversal?.id, reversal.id);
      expect(recent.lines.single.productName, 'Original Tea');
      final reversed = await database.readRecentSales(
        filter: ShopSaleHistoryFilter.reversed,
      );
      expect(reversed.map((sale) => sale.id), [sale.id]);

      final movementCount = await database.countStockMovements();
      final outboxCount = await database.countOutboxOperations();
      final changedCommand = await database.previewFullSaleReversal(
        operationId: command.operationId,
        saleId: sale.id,
        restockItems: false,
        reason: 'Changed retry',
        confirmCashReturned: true,
      );
      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: changedCommand,
          authorization: await _correctionAuthorization(
            changedCommand.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'changed-retry-receipt',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database
                .customSelect(
                  'SELECT on_hand FROM shop_products WHERE id = ?',
                  variables: [const Variable<String>('tea-reversal')],
                )
                .getSingle())
            .read<int>('on_hand'),
        5,
      );
      expect(await database.countStockMovements(), movementCount);
      expect(await database.countOutboxOperations(), outboxCount);

      final review = await database.readCashShiftReview(shift.id);
      expect(review.cashSalesTotalMmk, 5000);
      expect(review.cashReversalCount, 1);
      expect(review.cashReversalTotalMmk, 5000);
      expect(review.cashDrawerOutflowMmk, 5000);
      expect(review.expectedCashMmk, 10000);
      await expectLater(
        database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'cash-reversal-stale-close',
          seenSaleCount: reviewedBeforeReversal.saleCount,
          seenCashTotalMmk: reviewedBeforeReversal.cashSalesTotalMmk,
          countedCashMmk: 10000,
        ),
        throwsA(isA<StateError>()),
      );
      final closed = await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'cash-reversal-close',
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        seenCashReversalCount: review.cashReversalCount,
        seenCashDrawerOutflowMmk: review.cashDrawerOutflowMmk,
        countedCashMmk: 10000,
      );
      expect(closed.cashReversalCount, 1);
      expect(closed.cashDrawerOutflowMmk, 5000);
      expect(closed.differenceMmk, 0);
    });

    test('database rejects a self-consistent non-five-minute authorization without writes', () async {
      await _attachTestWorkspace(database);
      await database.addProduct(
        id: 'receipt-ttl-product',
        name: 'Receipt TTL item',
        priceMmk: 2000,
        openingStock: 3,
      );
      final shift = await database.openManagedTestCashShift(
        operationId: 'receipt-ttl-shift',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final sale = await database.recordManagedTestCashSale(
        operationId: 'receipt-ttl-sale',
        lines: const [
          ShopSaleLineInput(productId: 'receipt-ttl-product', quantity: 1),
        ],
      );
      final command = await database.previewFullSaleReversal(
        operationId: 'receipt-ttl-reversal',
        saleId: sale.id,
        restockItems: true,
        reason: 'Customer returned the complete sale',
        confirmCashReturned: true,
      );
      final issuedAtMillis = DateTime.now().millisecondsSinceEpoch - 1000;
      final expiresAtMillis =
          issuedAtMillis + const Duration(minutes: 6).inMilliseconds;
      const receiptId = 'receipt-with-six-minute-ttl';
      const capability = 'shop.sale.reverse';
      final authorization = await _correctionAuthorization(
        command.commandDigest,
        capability: capability,
        receiptId: receiptId,
        issuedAtMillis: issuedAtMillis,
        expiresAtMillis: expiresAtMillis,
      );
      final movementCount = await database.countStockMovements();
      final outboxCount = await database.countOutboxOperations();
      final reviewBefore = await database.readCashShiftReview(shift.id);

      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
        ),
        throwsA(isA<StateError>()),
      );

      expect(await database.readSaleReversalForSale(sale.id), isNull);
      expect(await database.countStockMovements(), movementCount);
      expect(await database.countOutboxOperations(), outboxCount);
      expect(
        (await database
                .customSelect(
                  'SELECT on_hand FROM shop_products WHERE id = ?',
                  variables: const [Variable<String>('receipt-ttl-product')],
                )
                .getSingle())
            .read<int>('on_hand'),
        2,
      );
      final reviewAfter = await database.readCashShiftReview(shift.id);
      expect(reviewAfter.cashReversalCount, reviewBefore.cashReversalCount);
      expect(
        reviewAfter.cashDrawerOutflowMmk,
        reviewBefore.cashDrawerOutflowMmk,
      );
      expect(reviewAfter.expectedCashMmk, reviewBefore.expectedCashMmk);
    });

    test(
      'expired signed correction authorization cannot mutate records',
      () async {
        await _attachTestWorkspace(database);
        await database.addProduct(
          id: 'expired-proof-product',
          name: 'Expired proof item',
          priceMmk: 1500,
          openingStock: 2,
        );
        await database.openManagedTestCashShift(
          operationId: 'expired-proof-shift',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordManagedTestCashSale(
          operationId: 'expired-proof-sale',
          lines: const [
            ShopSaleLineInput(productId: 'expired-proof-product', quantity: 1),
          ],
        );
        final command = await database.previewFullSaleReversal(
          operationId: 'expired-proof-reversal',
          saleId: sale.id,
          restockItems: true,
          reason: 'Expired authorization must remain read only',
          confirmCashReturned: true,
        );
        final now = DateTime.now().millisecondsSinceEpoch;
        final authorization = await _correctionAuthorization(
          command.commandDigest,
          capability: 'shop.sale.reverse',
          receiptId: 'expired-proof-receipt',
          issuedAtMillis: now - const Duration(minutes: 10).inMilliseconds,
          expiresAtMillis: now - const Duration(minutes: 5).inMilliseconds,
        );
        final movementCount = await database.countStockMovements();
        final outboxCount = await database.countOutboxOperations();

        await expectLater(
          database.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: authorization,
          ),
          throwsA(isA<StateError>()),
        );

        expect(await database.readSaleReversalForSale(sale.id), isNull);
        expect(await database.countStockMovements(), movementCount);
        expect(await database.countOutboxOperations(), outboxCount);
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total '
                    'FROM shop_correction_authorization_proofs',
                  )
                  .getSingle())
              .read<int>('total'),
          0,
        );
        expect((await database.readActiveProducts()).single.onHand, 1);
      },
    );

    test(
      'cash reversal cannot reopen exhausted gross shift capacity',
      () async {
        await _attachTestWorkspace(database);
        const maximumShiftCashMmk = 200000000000000;
        await database.addProduct(
          id: 'gross-cap-product',
          name: 'Gross cap item',
          priceMmk: 1000,
          openingStock: 3,
        );
        final shift = await database.openManagedTestCashShift(
          operationId: 'gross-cap-shift',
          operatorLabel: 'May',
          openingFloatMmk: maximumShiftCashMmk - 1000,
        );
        final sale = await database.recordManagedTestCashSale(
          operationId: 'gross-cap-sale-1',
          lines: const [
            ShopSaleLineInput(productId: 'gross-cap-product', quantity: 1),
          ],
        );
        final command = await database.previewFullSaleReversal(
          operationId: 'gross-cap-reversal',
          saleId: sale.id,
          restockItems: true,
          reason: 'Full sale returned at the gross cash boundary',
          confirmCashReturned: true,
        );
        await database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'gross-cap-reversal-receipt',
          ),
        );

        final reviewed = await database.readCashShiftReview(shift.id);
        expect(reviewed.cashSalesTotalMmk, 1000);
        expect(reviewed.cashDrawerOutflowMmk, 1000);
        expect(reviewed.expectedCashMmk, maximumShiftCashMmk - 1000);
        await expectLater(
          database.recordManagedTestCashSale(
            operationId: 'gross-cap-sale-2',
            lines: const [
              ShopSaleLineInput(productId: 'gross-cap-product', quantity: 1),
            ],
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 3);

        final unchanged = await database.readCashShiftReview(shift.id);
        final closed = await database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'gross-cap-close',
          seenSaleCount: unchanged.saleCount,
          seenCashTotalMmk: unchanged.cashSalesTotalMmk,
          seenCashReversalCount: unchanged.cashReversalCount,
          seenCashDrawerOutflowMmk: unchanged.cashDrawerOutflowMmk,
          countedCashMmk: unchanged.expectedCashMmk,
        );
        expect(closed.differenceMmk, 0);
      },
    );

    test(
      'cash reversal authorization stays bound to the reviewed shift',
      () async {
        await _attachTestWorkspace(database);
        await database.addProduct(
          id: 'shift-bound-return-product',
          name: 'Shift-bound item',
          priceMmk: 1000,
          openingStock: 2,
        );
        final firstShift = await database.openManagedTestCashShift(
          operationId: 'shift-bound-first-open',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordManagedTestCashSale(
          operationId: 'shift-bound-sale',
          lines: const [
            ShopSaleLineInput(
              productId: 'shift-bound-return-product',
              quantity: 1,
            ),
          ],
        );
        final command = await database.previewFullSaleReversal(
          operationId: 'shift-bound-reversal',
          saleId: sale.id,
          restockItems: true,
          reason: 'Cash return was reviewed for the first shift',
          confirmCashReturned: true,
        );
        expect(command.expectedCashShiftId, firstShift.id);
        final firstReview = await database.readCashShiftReview(firstShift.id);
        await database.closeManagedTestCashShift(
          shiftId: firstShift.id,
          operationId: 'shift-bound-first-close',
          seenSaleCount: firstReview.saleCount,
          seenCashTotalMmk: firstReview.cashSalesTotalMmk,
          countedCashMmk: firstReview.expectedCashMmk,
        );
        final secondShift = await database.openManagedTestCashShift(
          operationId: 'shift-bound-second-open',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );

        await expectLater(
          database.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: await _correctionAuthorization(
              command.commandDigest,
              capability: 'shop.sale.reverse',
              receiptId: 'shift-bound-reversal-receipt',
            ),
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.readSaleReversalForSale(sale.id), isNull);
        expect((await database.readActiveProducts()).single.onHand, 1);
        expect(
          (await database.readCashShiftReview(secondShift.id))
              .cashDrawerOutflowMmk,
          0,
        );
      },
    );

    test(
      'multi-line cash reversal survives outbox failure, reopen, and replay',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'supermega-shop-reversal-outbox-recovery-',
        );
        final file = File('${directory.path}/shop.sqlite');
        ShopDatabase? persisted;
        try {
          persisted = ShopDatabase.withCorrectionReceiptVerifier(
            executor: NativeDatabase(file),
            correctionReceiptVerifier: _testCorrectionReceiptVerifier,
            testOnlyAllowUnconsumedAuthorization: true,
          );
          await _attachTestWorkspace(persisted);
          await persisted.addProduct(
            id: 'reversal-recovery-tea',
            name: 'Tea',
            priceMmk: 2000,
            openingStock: 5,
          );
          await persisted.addProduct(
            id: 'reversal-recovery-rice',
            name: 'Rice',
            priceMmk: 3000,
            openingStock: 7,
          );
          final shift = await persisted.openManagedTestCashShift(
            operationId: 'reversal-recovery-shift',
            operatorLabel: 'Synthetic cashier',
            openingFloatMmk: 10000,
          );
          final sale = await persisted.recordManagedTestCashSale(
            operationId: 'reversal-recovery-sale',
            lines: const [
              ShopSaleLineInput(
                productId: 'reversal-recovery-tea',
                quantity: 2,
              ),
              ShopSaleLineInput(
                productId: 'reversal-recovery-rice',
                quantity: 3,
              ),
            ],
          );
          expect(sale.totalMmk, 13000);
          final command = await persisted.previewFullSaleReversal(
            operationId: 'reversal-recovery-refund',
            saleId: sale.id,
            restockItems: true,
            reason: 'Customer returned the complete sale',
            confirmCashReturned: true,
          );
          final authorization = await _correctionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'reversal-recovery-receipt',
          );
          await persisted.customStatement(
            'CREATE TEMP TRIGGER synthetic_reversal_outbox_abort '
            'AFTER INSERT ON shop_sync_outbox '
            "WHEN NEW.operation_id = 'reversal-recovery-refund' "
            "BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END",
          );
          final stateBefore = await _fullSaleReversalState(persisted);

          await expectLater(
            persisted.recordAuthorizedFullSaleReversal(
              command: command,
              authorization: authorization,
            ),
            throwsA(
              predicate(
                (error) =>
                    error.toString().contains('synthetic outbox failure'),
              ),
            ),
          );
          expect(await _fullSaleReversalState(persisted), stateBefore);

          await persisted.close();
          persisted = ShopDatabase.withCorrectionReceiptVerifier(
            executor: NativeDatabase(file),
            correctionReceiptVerifier: _testCorrectionReceiptVerifier,
            testOnlyAllowUnconsumedAuthorization: true,
          );
          await persisted.verifyReadyForUse();
          expect(await _fullSaleReversalState(persisted), stateBefore);

          final reversal = await persisted.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: authorization,
          );
          expect(reversal.originalTotalMmk, 13000);
          expect(reversal.cashDrawerDeltaMmk, -13000);
          expect(
            reversal.lines
                .map(
                  (line) =>
                      (line.productId, line.quantity, line.restockQuantity),
                )
                .toSet(),
            {('reversal-recovery-tea', 2, 2), ('reversal-recovery-rice', 3, 3)},
          );
          final products = await persisted.readActiveProducts();
          expect(
            {for (final product in products) product.id: product.onHand},
            {'reversal-recovery-rice': 7, 'reversal-recovery-tea': 5},
          );
          final review = await persisted.readCashShiftReview(shift.id);
          expect(review.cashSalesTotalMmk, 13000);
          expect(review.cashReversalCount, 1);
          expect(review.cashReversalTotalMmk, 13000);
          expect(review.cashDrawerOutflowMmk, 13000);
          expect(review.expectedCashMmk, 10000);
          final stateAfter = await _fullSaleReversalState(persisted);

          await persisted.close();
          persisted = ShopDatabase.withCorrectionReceiptVerifier(
            executor: NativeDatabase(file),
            correctionReceiptVerifier: _testCorrectionReceiptVerifier,
            testOnlyAllowUnconsumedAuthorization: true,
          );
          await persisted.verifyReadyForUse();
          final replay = await persisted.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: authorization,
          );
          expect(replay.id, reversal.id);
          expect(await _fullSaleReversalState(persisted), stateAfter);
        } finally {
          await persisted?.close();
          if (await directory.exists()) {
            await directory.delete(recursive: true);
          }
        }
      },
    );

    test('wallet reversal stays externally pending until separate reconciliation', () async {
      await _attachTestWorkspace(database);
      await database.addProduct(
        id: 'wallet-reversal-product',
        name: 'Water',
        priceMmk: 1000,
        openingStock: 4,
      );
      const lines = [
        ShopSaleLineInput(productId: 'wallet-reversal-product', quantity: 1),
      ];
      await database.createWalletCheckoutIntent(
        operationId: 'wallet-reversal-sale',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: lines,
      );
      final sale = await database.recordManagedTestSale(
        operationId: 'wallet-reversal-sale',
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: 'wallet-reversal-sale',
      );
      final command = await database.previewFullSaleReversal(
        operationId: 'wallet-local-reversal',
        saleId: sale.id,
        restockItems: false,
        reason: 'Duplicate wallet charge recorded locally',
        confirmCashReturned: false,
      );
      var reversal = await database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: await _correctionAuthorization(
          command.commandDigest,
          capability: 'shop.sale.reverse',
          receiptId: 'wallet-reversal-receipt',
        ),
      );
      expect(reversal.paymentResolution, 'external_pending');
      expect(reversal.walletReconciliationPending, isTrue);
      expect(reversal.cashDrawerDeltaMmk, 0);
      expect((await database.readActiveProducts()).single.onHand, 3);
      final intent = await database
          .customSelect(
            'SELECT state FROM shop_wallet_checkout_intents '
            'WHERE operation_id = ?',
            variables: [const Variable<String>('wallet-reversal-sale')],
          )
          .getSingle();
      expect(intent.read<String>('state'), 'completed');
      final reversalEvent = await database
          .customSelect(
            'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
            variables: [const Variable<String>('wallet-local-reversal')],
          )
          .getSingle();
      expect(
        (jsonDecode(reversalEvent.read<String>('payload_json'))
            as Map<String, dynamic>)['moneyReturned'],
        isFalse,
      );

      await database.recordManagedTestCashSale(
        operationId: 'sale-after-pending-wallet-return',
        lines: lines,
      );
      final shift = await database.openManagedTestCashShift(
        operationId: 'shift-after-pending-wallet-return',
        operatorLabel: 'May',
        openingFloatMmk: 0,
      );
      final review = await database.readCashShiftReview(shift.id);
      expect(review.expectedCashMmk, 0);
      await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'close-after-pending-wallet-return',
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        countedCashMmk: 0,
      );

      final pendingSummary = await database.readSalesSummary(
        startAtMillis: 0,
        endAtMillis: DateTime.now()
            .add(const Duration(days: 1))
            .millisecondsSinceEpoch,
      );
      expect(pendingSummary.grossSaleCount, 2);
      expect(pendingSummary.grossSalesMmk, 2000);
      expect(pendingSummary.grossCashSalesMmk, 1000);
      expect(pendingSummary.grossKbzpaySalesMmk, 1000);
      expect(pendingSummary.grossWavepaySalesMmk, 0);
      expect(pendingSummary.reversalCount, 1);
      expect(pendingSummary.reversalMmk, 1000);
      expect(pendingSummary.cashReversalMmk, 0);
      expect(pendingSummary.kbzpayReversalMmk, 1000);
      expect(pendingSummary.wavepayReversalMmk, 0);
      expect(pendingSummary.netSalesMmk, 1000);
      expect(pendingSummary.netCashSalesMmk, 1000);
      expect(pendingSummary.netKbzpaySalesMmk, 0);
      expect(pendingSummary.netWavepaySalesMmk, 0);
      expect(pendingSummary.pendingWalletReversalCount, 1);

      final reconciliation = await database.previewWalletReconciliation(
        operationId: 'wallet-return-confirmation',
        reversalId: reversal.id,
        outcome: 'money_returned',
        evidenceReference: 'KBZPay merchant history reference 42',
      );
      expect(reconciliation.originalPaymentMethod, 'kbzpay');
      expect(reconciliation.originalTotalMmk, 1000);
      expect(
        reconciliation.requestFingerprint,
        jsonEncode(<String, Object>{
          'operationId': 'wallet-return-confirmation',
          'reversalId': reversal.id,
          'originalPaymentMethod': 'kbzpay',
          'originalTotalMmk': 1000,
          'outcome': 'money_returned',
          'evidenceReference': 'KBZPay merchant history reference 42',
        }),
      );
      final reconciliationAuthorization = await _correctionAuthorization(
        reconciliation.commandDigest,
        capability: 'shop.sale.reconcile_wallet',
        receiptId: 'wallet-confirmation-receipt',
      );
      await expectLater(
        database.recordAuthorizedWalletReconciliation(
          command: reconciliation,
          authorization: await _correctionAuthorization(
            reconciliation.commandDigest,
            capability: 'shop.sale.reconcile_wallet',
            receiptId: 'foreign-wallet-confirmation-receipt',
            workspaceId: 'workspace-other',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database.readSaleReversalForSale(sale.id))
            ?.walletReconciliationPending,
        isTrue,
      );
      await expectLater(
        database.recordAuthorizedWalletReconciliation(
          command: ShopWalletReconciliationCommand(
            operationId: reconciliation.operationId,
            reversalId: reconciliation.reversalId,
            originalPaymentMethod: reconciliation.originalPaymentMethod,
            originalTotalMmk: reconciliation.originalTotalMmk + 1,
            requestFingerprint: reconciliation.requestFingerprint,
            commandDigest: reconciliation.commandDigest,
            outcome: reconciliation.outcome,
            evidenceReference: reconciliation.evidenceReference,
          ),
          authorization: reconciliationAuthorization,
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database.readSaleReversalForSale(sale.id))
            ?.walletReconciliationPending,
        isTrue,
      );
      await expectLater(
        database.recordAuthorizedWalletReconciliation(
          command: reconciliation,
          authorization: await _correctionAuthorization(
            reconciliation.commandDigest,
            capability: 'shop.sale.reconcile_wallet',
            receiptId: 'wallet-reversal-receipt',
          ),
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database.readSaleReversalForSale(sale.id))
            ?.walletReconciliationPending,
        isTrue,
      );
      reversal = await database.recordAuthorizedWalletReconciliation(
        command: reconciliation,
        authorization: reconciliationAuthorization,
      );
      final reconciliationReplay = await database
          .recordAuthorizedWalletReconciliation(
            command: reconciliation,
            authorization: reconciliationAuthorization,
          );
      await expectLater(
        database.recordAuthorizedWalletReconciliation(
          command: ShopWalletReconciliationCommand(
            operationId: reconciliation.operationId,
            reversalId: reconciliation.reversalId,
            originalPaymentMethod: 'wavepay',
            originalTotalMmk: reconciliation.originalTotalMmk,
            requestFingerprint: reconciliation.requestFingerprint,
            commandDigest: reconciliation.commandDigest,
            outcome: reconciliation.outcome,
            evidenceReference: reconciliation.evidenceReference,
          ),
          authorization: reconciliationAuthorization,
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS count '
                  'FROM shop_wallet_reversal_reconciliations',
                )
                .getSingle())
            .read<int>('count'),
        1,
      );
      expect(reversal.walletReconciliationOutcome, 'money_returned');
      expect(
        reconciliationReplay.walletReconciliationOutcome,
        'money_returned',
      );
      expect((await database.readActiveProducts()).single.onHand, 2);
      final confirmedSummary = await database.readSalesSummary(
        startAtMillis: 0,
        endAtMillis: DateTime.now()
            .add(const Duration(days: 1))
            .millisecondsSinceEpoch,
      );
      expect(confirmedSummary.netSalesMmk, 1000);
      expect(confirmedSummary.pendingWalletReversalCount, 0);
      final confirmationEvent = await database
          .customSelect(
            'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
            variables: [const Variable<String>('wallet-return-confirmation')],
          )
          .getSingle();
      expect(
        (jsonDecode(confirmationEvent.read<String>('payload_json'))
            as Map<String, dynamic>)['moneyReturned'],
        isTrue,
      );
    });

    test('sale history searches saved items and pages beyond 30', () async {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 5000,
        openingStock: 34,
      );
      await database.recordManagedTestCashSale(
        operationId: 'tea-receipt',
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );
      for (var i = 0; i < 32; i++) {
        await database.recordManagedTestCashSale(
          operationId: 'rice-receipt-$i',
          lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
        );
      }
      for (final entry in const [
        ('KBZPay', 'kbzpay'),
        ('WavePay', 'wavepay'),
      ]) {
        final operationId = 'rice-${entry.$2}-receipt';
        final lines = const [ShopSaleLineInput(productId: 'rice', quantity: 1)];
        await database.createWalletCheckoutIntent(
          operationId: operationId,
          merchant: MerchantWalletSetup(
            provider: entry.$1,
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
        );
        await database.recordManagedTestSale(
          operationId: operationId,
          lines: lines,
          paymentMethod: entry.$2,
          walletCheckoutOperationId: operationId,
        );
      }

      final first = await database.readRecentSales(limit: 31);
      final second = await database.readRecentSales(limit: 31, offset: 30);
      expect(first, hasLength(31));
      expect(second, hasLength(5));
      expect(
        first
            .map((sale) => sale.id)
            .toSet()
            .intersection(second.map((sale) => sale.id).toSet()),
        hasLength(1),
      );
      final byItem = await database.readRecentSales(query: 'tEA');
      expect(byItem.map((sale) => sale.id), ['tea-receipt']);
      final byReceipt = await database.readRecentSales(
        query: 'rice-receipt-10',
      );
      expect(byReceipt.map((sale) => sale.id), ['rice-receipt-10']);
      final cash = await database.readRecentSales(
        limit: 100,
        filter: ShopSaleHistoryFilter.cash,
      );
      expect(cash, hasLength(33));
      expect(cash.every((sale) => sale.paymentMethod == 'cash'), isTrue);
      final kbzpay = await database.readRecentSales(
        filter: ShopSaleHistoryFilter.kbzpay,
      );
      expect(kbzpay.map((sale) => sale.id), ['rice-kbzpay-receipt']);
      final wavepay = await database.readRecentSales(
        query: 'rice',
        filter: ShopSaleHistoryFilter.wavepay,
      );
      expect(wavepay.map((sale) => sale.id), ['rice-wavepay-receipt']);
      expect(
        await database.readRecentSales(
          query: 'tea',
          filter: ShopSaleHistoryFilter.wavepay,
        ),
        isEmpty,
      );
      await expectLater(
        database.readRecentSales(offset: -1),
        throwsArgumentError,
      );
    });

    test(
      'cash confirmation rejects a stale displayed total atomically',
      () async {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        final initialOutbox = await database.countOutboxOperations();
        await database.customStatement(
          'UPDATE shop_products SET price_mmk = ? WHERE id = ?',
          [3000, 'tea'],
        );
        await expectLater(
          database.recordManagedTestSale(
            operationId: 'confirmed-cash-1',
            paymentMethod: 'cash',
            expectedTotalMmk: 2500,
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 2);
        expect(await database.countOutboxOperations(), initialOutbox);

        final receipt = await database.recordManagedTestSale(
          operationId: 'confirmed-cash-1',
          paymentMethod: 'cash',
          expectedTotalMmk: 3000,
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        expect(receipt.totalMmk, 3000);
        expect(await database.countSales(), 1);
      },
    );

    test('catalog, sale, stock and outbox survive a database reopen', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-persistent-',
      );
      final file = File(
        '${directory.path}${Platform.pathSeparator}shop.sqlite',
      );
      var persistentDatabase = ShopDatabase(NativeDatabase(file));
      try {
        await persistentDatabase.addProduct(
          id: 'offline-tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 4,
          barcode: '0012345678905',
        );
        const lines = [
          ShopSaleLineInput(productId: 'offline-tea', quantity: 2),
        ];
        await persistentDatabase.recordManagedTestCashSale(
          operationId: 'offline-reopen-sale',
          lines: lines,
        );
        expect(await persistentDatabase.countSales(), 1);
        expect(
          await persistentDatabase.countOutboxOperations(),
          greaterThan(0),
        );

        await persistentDatabase.close();
        persistentDatabase = ShopDatabase(NativeDatabase(file));

        final product = (await persistentDatabase.readActiveProducts()).single;
        expect(product.name, 'Tea');
        expect(product.barcode, '0012345678905');
        expect(product.onHand, 2);
        expect(await persistentDatabase.countSales(), 1);
        final recentSale = (await persistentDatabase.readRecentSales()).single;
        expect(recentSale.totalMmk, 5000);
        expect(recentSale.lines.single.productName, 'Tea');
        expect(recentSale.lines.single.quantity, 2);
        expect(
          await persistentDatabase.countOutboxOperations(),
          greaterThan(0),
        );

        await persistentDatabase.recordManagedTestCashSale(
          operationId: 'offline-reopen-sale',
          lines: lines,
        );
        expect(
          (await persistentDatabase.readActiveProducts()).single.onHand,
          2,
        );
        expect(await persistentDatabase.countSales(), 1);
      } finally {
        await persistentDatabase.close();
        await directory.delete(recursive: true);
      }
    });

    test(
      'concurrent cash finalization commits one complete sale after reopen',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'supermega-shop-concurrent-cash-',
        );
        final file = File('${directory.path}/shop.sqlite');
        var persisted = ShopDatabase(NativeDatabase(file));
        try {
          await persisted.addProduct(
            id: 'concurrent-cash-tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          const lines = [
            ShopSaleLineInput(productId: 'concurrent-cash-tea', quantity: 1),
          ];
          final receipts = await Future.wait([
            for (var attempt = 0; attempt < 24; attempt++)
              persisted.recordManagedTestCashSale(
                operationId: 'concurrent-cash-sale',
                lines: lines,
              ),
          ]);
          expect(receipts.map((receipt) => receipt.id).toSet(), {
            'concurrent-cash-sale',
          });

          await persisted.close();
          persisted = ShopDatabase(NativeDatabase(file));
          expect(
            await _saleTransactionState(
              persisted,
              operationId: 'concurrent-cash-sale',
              productId: 'concurrent-cash-tea',
            ),
            {
              'sales': 1,
              'paymentMethod': 'cash',
              'saleTotalMmk': 2500,
              'saleLines': 1,
              'lineProductId': 'concurrent-cash-tea',
              'lineProductName': 'Tea',
              'lineUnitPriceMmk': 2500,
              'lineQuantity': 1,
              'lineTotalMmk': 2500,
              'saleMovements': 1,
              'movementProductId': 'concurrent-cash-tea',
              'movementDelta': -1,
              'movementReason': 'cash_sale',
              'saleOutbox': 1,
              'outboxEventType': 'shop.cash_sale.completed.v1',
              'outboxState': 'pending',
              'outboxSaleId': 'concurrent-cash-sale',
              'outboxTotalMmk': 2500,
              'outboxPaymentMethod': 'cash',
              'outboxLineProductId': 'concurrent-cash-tea',
              'outboxLineProductName': 'Tea',
              'outboxLineUnitPriceMmk': 2500,
              'outboxLineQuantity': 1,
              'outboxLineTotalMmk': 2500,
              'walletState': null,
              'walletPaymentMethod': null,
              'walletTotalMmk': null,
              'walletRequestFingerprint': null,
              'walletMerchantPhone': null,
              'walletMerchantQrPayload': null,
              'walletLineProductId': null,
              'walletLineProductName': null,
              'walletLineUnitPriceMmk': null,
              'walletLineQuantity': null,
              'walletLineTotalMmk': null,
              'correctionAuthorityProofs': 0,
              'onHand': 2,
            },
          );
        } finally {
          await persisted.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'concurrent wallet finalization commits one complete sale after reopen',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'supermega-shop-concurrent-wallet-',
        );
        final file = File('${directory.path}/shop.sqlite');
        var persisted = ShopDatabase(NativeDatabase(file));
        try {
          await persisted.addProduct(
            id: 'concurrent-wallet-tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          const lines = [
            ShopSaleLineInput(productId: 'concurrent-wallet-tea', quantity: 1),
          ];
          final merchant = MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          );
          final intents = await Future.wait([
            persisted.createWalletCheckoutIntent(
              operationId: 'concurrent-wallet-sale',
              merchant: merchant,
              lines: lines,
            ),
            persisted.createWalletCheckoutIntent(
              operationId: 'concurrent-wallet-sale',
              merchant: merchant,
              lines: lines,
            ),
          ]);
          expect(intents.first.operationId, intents.last.operationId);
          expect(
            intents.first.requestFingerprint,
            intents.last.requestFingerprint,
          );
          final receipts = await Future.wait([
            persisted.recordManagedTestSale(
              operationId: 'concurrent-wallet-sale',
              lines: lines,
              paymentMethod: 'kbzpay',
              walletCheckoutOperationId: 'concurrent-wallet-sale',
            ),
            persisted.recordManagedTestSale(
              operationId: 'concurrent-wallet-sale',
              lines: lines,
              paymentMethod: 'kbzpay',
              walletCheckoutOperationId: 'concurrent-wallet-sale',
            ),
          ]);
          expect(receipts.first.id, receipts.last.id);

          await persisted.close();
          persisted = ShopDatabase(NativeDatabase(file));
          expect(
            await _saleTransactionState(
              persisted,
              operationId: 'concurrent-wallet-sale',
              productId: 'concurrent-wallet-tea',
            ),
            {
              'sales': 1,
              'paymentMethod': 'kbzpay',
              'saleTotalMmk': 2500,
              'saleLines': 1,
              'lineProductId': 'concurrent-wallet-tea',
              'lineProductName': 'Tea',
              'lineUnitPriceMmk': 2500,
              'lineQuantity': 1,
              'lineTotalMmk': 2500,
              'saleMovements': 1,
              'movementProductId': 'concurrent-wallet-tea',
              'movementDelta': -1,
              'movementReason': 'kbzpay_sale',
              'saleOutbox': 1,
              'outboxEventType': 'shop.mobile_money_sale.completed.v1',
              'outboxState': 'pending',
              'outboxSaleId': 'concurrent-wallet-sale',
              'outboxTotalMmk': 2500,
              'outboxPaymentMethod': 'kbzpay',
              'outboxLineProductId': 'concurrent-wallet-tea',
              'outboxLineProductName': 'Tea',
              'outboxLineUnitPriceMmk': 2500,
              'outboxLineQuantity': 1,
              'outboxLineTotalMmk': 2500,
              'walletState': 'completed',
              'walletPaymentMethod': 'kbzpay',
              'walletTotalMmk': 2500,
              'walletRequestFingerprint': jsonEncode({
                'paymentMethod': 'kbzpay',
                'lines': [
                  {'productId': 'concurrent-wallet-tea', 'quantity': 1},
                ],
              }),
              'walletMerchantPhone': '',
              'walletMerchantQrPayload': _syntheticStaticMmqr(),
              'walletLineProductId': 'concurrent-wallet-tea',
              'walletLineProductName': 'Tea',
              'walletLineUnitPriceMmk': 2500,
              'walletLineQuantity': 1,
              'walletLineTotalMmk': 2500,
              'correctionAuthorityProofs': 0,
              'onHand': 2,
            },
          );
        } finally {
          await persisted.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'cash outbox abort rolls back every sale effect after reopen',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'supermega-shop-cash-outbox-abort-',
        );
        final file = File('${directory.path}/shop.sqlite');
        var persisted = ShopDatabase(NativeDatabase(file));
        try {
          await persisted.addProduct(
            id: 'cash-abort-tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          await _installSyntheticOutboxAbort(
            persisted,
            operationId: 'cash-outbox-abort-sale',
          );
          await expectLater(
            persisted.recordManagedTestCashSale(
              operationId: 'cash-outbox-abort-sale',
              lines: const [
                ShopSaleLineInput(productId: 'cash-abort-tea', quantity: 1),
              ],
            ),
            throwsA(
              predicate<Object>(
                (error) =>
                    error.toString().contains('synthetic outbox failure'),
              ),
            ),
          );
          await persisted.customStatement(
            'DROP TRIGGER synthetic_sale_outbox_abort',
          );

          await persisted.close();
          persisted = ShopDatabase(NativeDatabase(file));
          expect(
            await _saleTransactionState(
              persisted,
              operationId: 'cash-outbox-abort-sale',
              productId: 'cash-abort-tea',
            ),
            {
              'sales': 0,
              'paymentMethod': null,
              'saleTotalMmk': null,
              'saleLines': 0,
              'lineProductId': null,
              'lineProductName': null,
              'lineUnitPriceMmk': null,
              'lineQuantity': null,
              'lineTotalMmk': null,
              'saleMovements': 0,
              'movementProductId': null,
              'movementDelta': null,
              'movementReason': null,
              'saleOutbox': 0,
              'outboxEventType': null,
              'outboxState': null,
              'outboxSaleId': null,
              'outboxTotalMmk': null,
              'outboxPaymentMethod': null,
              'outboxLineProductId': null,
              'outboxLineProductName': null,
              'outboxLineUnitPriceMmk': null,
              'outboxLineQuantity': null,
              'outboxLineTotalMmk': null,
              'walletState': null,
              'walletPaymentMethod': null,
              'walletTotalMmk': null,
              'walletRequestFingerprint': null,
              'walletMerchantPhone': null,
              'walletMerchantQrPayload': null,
              'walletLineProductId': null,
              'walletLineProductName': null,
              'walletLineUnitPriceMmk': null,
              'walletLineQuantity': null,
              'walletLineTotalMmk': null,
              'correctionAuthorityProofs': 0,
              'onHand': 3,
            },
          );
        } finally {
          await persisted.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'wallet outbox abort keeps payment pending with no sale after reopen',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'supermega-shop-wallet-outbox-abort-',
        );
        final file = File('${directory.path}/shop.sqlite');
        var persisted = ShopDatabase(NativeDatabase(file));
        try {
          await persisted.addProduct(
            id: 'wallet-abort-tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          const lines = [
            ShopSaleLineInput(productId: 'wallet-abort-tea', quantity: 1),
          ];
          await persisted.createWalletCheckoutIntent(
            operationId: 'wallet-outbox-abort-sale',
            merchant: MerchantWalletSetup(
              provider: 'KBZPay',
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: lines,
          );
          await _installSyntheticOutboxAbort(
            persisted,
            operationId: 'wallet-outbox-abort-sale',
          );
          await expectLater(
            persisted.recordManagedTestSale(
              operationId: 'wallet-outbox-abort-sale',
              lines: lines,
              paymentMethod: 'kbzpay',
              walletCheckoutOperationId: 'wallet-outbox-abort-sale',
            ),
            throwsA(
              predicate<Object>(
                (error) =>
                    error.toString().contains('synthetic outbox failure'),
              ),
            ),
          );
          await persisted.customStatement(
            'DROP TRIGGER synthetic_sale_outbox_abort',
          );

          await persisted.close();
          persisted = ShopDatabase(NativeDatabase(file));
          expect(
            await _saleTransactionState(
              persisted,
              operationId: 'wallet-outbox-abort-sale',
              productId: 'wallet-abort-tea',
            ),
            {
              'sales': 0,
              'paymentMethod': null,
              'saleTotalMmk': null,
              'saleLines': 0,
              'lineProductId': null,
              'lineProductName': null,
              'lineUnitPriceMmk': null,
              'lineQuantity': null,
              'lineTotalMmk': null,
              'saleMovements': 0,
              'movementProductId': null,
              'movementDelta': null,
              'movementReason': null,
              'saleOutbox': 0,
              'outboxEventType': null,
              'outboxState': null,
              'outboxSaleId': null,
              'outboxTotalMmk': null,
              'outboxPaymentMethod': null,
              'outboxLineProductId': null,
              'outboxLineProductName': null,
              'outboxLineUnitPriceMmk': null,
              'outboxLineQuantity': null,
              'outboxLineTotalMmk': null,
              'walletState': 'pending',
              'walletPaymentMethod': 'kbzpay',
              'walletTotalMmk': 2500,
              'walletRequestFingerprint': jsonEncode({
                'paymentMethod': 'kbzpay',
                'lines': [
                  {'productId': 'wallet-abort-tea', 'quantity': 1},
                ],
              }),
              'walletMerchantPhone': '',
              'walletMerchantQrPayload': _syntheticStaticMmqr(),
              'walletLineProductId': 'wallet-abort-tea',
              'walletLineProductName': 'Tea',
              'walletLineUnitPriceMmk': 2500,
              'walletLineQuantity': 1,
              'walletLineTotalMmk': 2500,
              'correctionAuthorityProofs': 0,
              'onHand': 3,
            },
          );
        } finally {
          await persisted.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test('counter draft survives restart and sale commit clears it atomically', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-counter-draft-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var persisted = ShopDatabase(NativeDatabase(file));
      try {
        await persisted.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 3,
        );
        await persisted.saveCounterSaleDraft(
          operationId: 'recovered-counter-1',
          quantities: const {'tea': 2},
        );
        expect(await persisted.countSales(), 0);
        expect((await persisted.readActiveProducts()).single.onHand, 3);
        await persisted.close();
        persisted = ShopDatabase(NativeDatabase(file));
        final recovered = await persisted.readCounterSaleDraft();
        expect(recovered?.operationId, 'recovered-counter-1');
        expect(recovered?.quantities, {'tea': 2});
        expect(recovered?.unitPricesMmk, {'tea': 2500});

        await persisted.customStatement(
          'UPDATE shop_products SET on_hand = 1, price_mmk = 3000 WHERE id = ?',
          ['tea'],
        );
        await expectLater(
          persisted.recordManagedTestSale(
            operationId: recovered!.operationId,
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
            paymentMethod: 'cash',
            expectedTotalMmk: 5000,
          ),
          throwsA(isA<StateError>()),
        );
        expect((await persisted.readCounterSaleDraft())?.quantities, {
          'tea': 2,
        });
        expect(await persisted.countSales(), 0);
        await persisted.saveCounterSaleDraft(
          operationId: recovered.operationId,
          quantities: const {'tea': 1},
        );
        final receipt = await persisted.recordManagedTestSale(
          operationId: recovered.operationId,
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          paymentMethod: 'cash',
          expectedTotalMmk: 3000,
        );
        await persisted.close(); // Simulate a crash before widget-state clear.
        persisted = ShopDatabase(NativeDatabase(file));
        expect(await persisted.readCounterSaleDraft(), isNull);
        final replay = await persisted.recordManagedTestSale(
          operationId: recovered.operationId,
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          paymentMethod: 'cash',
          expectedTotalMmk: 3000,
        );
        expect(replay.id, receipt.id);
        expect(await persisted.countSales(), 1);
        expect((await persisted.readActiveProducts()).single.onHand, 0);
        expect(await persisted.countOutboxOperations(), 2);
      } finally {
        await persisted.close();
        await directory.delete(recursive: true);
      }
    });

    test(
      'held baskets let the cashier serve another customer without stock holds',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 4,
          );
          await database.addProduct(
            id: 'water',
            name: 'Water',
            priceMmk: 1200,
            openingStock: 3,
          );
          await database.saveCounterSaleDraft(
            operationId: 'customer-a',
            quantities: const {'tea': 2},
          );
          final outboxBeforeHold = await database.countOutboxOperations();
          await expectLater(
            database.holdCounterSaleDraft(
              id: 'bad',
              name: 'Wrong basket',
              operationId: 'changed',
            ),
            throwsStateError,
          );
          expect(
            (await database.readCounterSaleDraft())?.operationId,
            'customer-a',
          );

          await database.holdCounterSaleDraft(
            id: 'ticket-a',
            name: 'Customer A',
            operationId: 'customer-a',
          );
          expect(await database.readCounterSaleDraft(), isNull);
          expect(
            (await database.readHeldSaleTickets()).single.draft.quantities,
            {'tea': 2},
          );
          expect(await database.countSales(), 0);
          expect(await database.countOutboxOperations(), outboxBeforeHold);
          await expectLater(
            database.recordManagedTestCashSale(
              operationId: 'customer-a',
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
            ),
            throwsStateError,
          );
          await expectLater(
            database.createWalletCheckoutIntent(
              operationId: 'customer-a',
              merchant: MerchantWalletSetup(
                provider: 'KBZPay',
                merchantPhone: null,
                officialQrPayload: _syntheticStaticMmqr(),
                issuerConfirmed: true,
              ),
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
            ),
            throwsStateError,
          );
          expect(await database.countSales(), 0);
          expect(await database.countOutboxOperations(), outboxBeforeHold);
          expect(
            (await database.readActiveProducts())
                .firstWhere((product) => product.id == 'tea')
                .onHand,
            4,
          );
          await expectLater(
            database.saveCounterSaleDraft(
              operationId: 'customer-a',
              quantities: const {'tea': 1},
            ),
            throwsStateError,
          );

          await database.saveCounterSaleDraft(
            operationId: 'customer-b',
            quantities: const {'water': 1},
          );
          await expectLater(
            database.reopenHeldSaleTicket('ticket-a'),
            throwsStateError,
          );
          expect(
            (await database.readCounterSaleDraft())?.operationId,
            'customer-b',
          );
          expect((await database.readHeldSaleTickets()).length, 1);
          await database.recordManagedTestCashSale(
            operationId: 'customer-b',
            lines: const [ShopSaleLineInput(productId: 'water', quantity: 1)],
          );
          expect(await database.readCounterSaleDraft(), isNull);
          final reopened = await database.reopenHeldSaleTicket('ticket-a');
          expect(reopened.operationId, 'customer-a');
          expect(reopened.quantities, {'tea': 2});
          expect(await database.readHeldSaleTickets(), isEmpty);
          await database.recordManagedTestCashSale(
            operationId: 'customer-a',
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
          );
          expect(await database.countSales(), 2);
          expect(
            (await database.readActiveProducts())
                .firstWhere((product) => product.id == 'tea')
                .onHand,
            2,
          );
        } finally {
          await database.close();
        }
      },
    );

    test(
      'holding a basket survives SQLite reopen and discarding touches no stock',
      () async {
        final directory = await Directory.systemTemp.createTemp('shop-held-');
        final file = File(
          '${directory.path}${Platform.pathSeparator}shop.sqlite',
        );
        var database = ShopDatabase(NativeDatabase(file));
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          await database.saveCounterSaleDraft(
            operationId: 'held-op',
            quantities: const {'tea': 1},
          );
          await database.holdCounterSaleDraft(
            id: 'ticket-1',
            name: 'Table 1',
            operationId: 'held-op',
          );
          await database.close();
          database = ShopDatabase(NativeDatabase(file));
          expect((await database.readHeldSaleTickets()).single.name, 'Table 1');
          expect(await database.readCounterSaleDraft(), isNull);
          await database.discardHeldSaleTicket('ticket-1');
          expect(await database.readHeldSaleTickets(), isEmpty);
          expect((await database.readActiveProducts()).single.onHand, 3);
          expect(await database.countSales(), 0);
        } finally {
          await database.close();
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'a pending wallet checkout blocks ticket moves without replacing baskets',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          await database.saveCounterSaleDraft(
            operationId: 'wallet-guard-basket',
            quantities: const {'tea': 1},
          );
          await database.holdCounterSaleDraft(
            id: 'guarded-ticket',
            name: 'May',
            operationId: 'wallet-guard-basket',
          );
          await database.customStatement(
            'INSERT INTO shop_wallet_checkout_intents '
            '(operation_id, payment_method, request_fingerprint, total_mmk, '
            'merchant_phone, merchant_qr_payload, basket_json, state, '
            'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              'other-wallet',
              'kbzpay',
              'synthetic',
              0,
              '',
              '',
              '[]',
              'pending',
              1,
            ],
          );
          await expectLater(
            database.reopenHeldSaleTicket('guarded-ticket'),
            throwsStateError,
          );
          expect(await database.readCounterSaleDraft(), isNull);
          expect((await database.readHeldSaleTickets()).length, 1);
          await database.customStatement(
            "UPDATE shop_wallet_checkout_intents SET state = 'cancelled' "
            "WHERE operation_id = 'other-wallet'",
          );
          expect(
            (await database.reopenHeldSaleTicket('guarded-ticket')).operationId,
            'wallet-guard-basket',
          );
        } finally {
          await database.close();
        }
      },
    );

    test('verified saved wallet sale survives a later product archive', () async {
      await database.addProduct(
        id: 'tea',
        name: 'Original tea',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.addProduct(
        id: 'water',
        name: 'Water',
        priceMmk: 1200,
        openingStock: 2,
      );
      final intent = await database.createWalletCheckoutIntent(
        operationId: 'archived-wallet-sale',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [
          ShopSaleLineInput(productId: 'tea', quantity: 2),
          ShopSaleLineInput(productId: 'water', quantity: 1),
        ],
      );
      expect(intent.totalMmk, 6200);
      await database.customStatement(
        'UPDATE shop_products SET archived = 1, name = ?, price_mmk = ? '
        'WHERE id = ?',
        ['Renamed tea', 3000, 'tea'],
      );
      const lines = [
        ShopSaleLineInput(productId: 'tea', quantity: 2),
        ShopSaleLineInput(productId: 'water', quantity: 1),
      ];
      final beforeOutbox = await database.countOutboxOperations();
      final receipt = await database.recordManagedTestSale(
        operationId: intent.operationId,
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: intent.operationId,
      );
      expect(receipt.totalMmk, 6200);
      expect(receipt.lines.first.productName, 'Original tea');
      expect(receipt.lines.first.unitPriceMmk, 2500);
      expect(receipt.lines.first.lineTotalMmk, 5000);
      final archivedStock = await database
          .customSelect(
            'SELECT on_hand FROM shop_products WHERE id = ?',
            variables: [const Variable<String>('tea')],
          )
          .getSingle();
      expect(archivedStock.read<int>('on_hand'), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(await database.countSales(), 1);
      expect(await database.countOutboxOperations(), beforeOutbox + 1);
      expect(await database.readPendingWalletCheckout(), isNull);
      final event = await database
          .customSelect(
            'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
            variables: [const Variable<String>('archived-wallet-sale')],
          )
          .getSingle();
      final payload = jsonDecode(
        event.read<String>('payload_json'),
      ) as Map<String, dynamic>;
      expect(payload['totalMmk'], 6200);
      expect((payload['lines'] as List).first['productName'], 'Original tea');
      expect((payload['lines'] as List).first['unitPriceMmk'], 2500);

      final replay = await database.recordManagedTestSale(
        operationId: intent.operationId,
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: intent.operationId,
      );
      expect(replay.id, receipt.id);
      expect(await database.countSales(), 1);
      expect(await database.countOutboxOperations(), beforeOutbox + 1);
      await expectLater(
        database.recordManagedTestCashSale(
          operationId: 'new-cash-on-archived',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        ),
        throwsA(isA<StateError>()),
      );
      await expectLater(
        database.createWalletCheckoutIntent(
          operationId: 'new-wallet-on-archived',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('saved wallet amount tampering blocks sale without writes', () async {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.createWalletCheckoutIntent(
        operationId: 'wallet-total-tamper',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
      );
      final beforeOutbox = await database.countOutboxOperations();
      await database.customStatement(
        'UPDATE shop_wallet_checkout_intents SET total_mmk = 4999 '
        'WHERE operation_id = ?',
        ['wallet-total-tamper'],
      );
      await expectLater(
        database.readPendingWalletCheckout(),
        throwsA(isA<FormatException>()),
      );
      await expectLater(
        database.recordManagedTestSale(
          operationId: 'wallet-total-tamper',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'wallet-total-tamper',
        ),
        throwsA(isA<FormatException>()),
      );
      expect(await database.countSales(), 0);
      expect(await database.countOutboxOperations(), beforeOutbox);
      expect((await database.readActiveProducts()).single.onHand, 3);
      final state = await database
          .customSelect(
            'SELECT state FROM shop_wallet_checkout_intents WHERE operation_id = ?',
            variables: [const Variable<String>('wallet-total-tamper')],
          )
          .getSingle();
      expect(state.read<String>('state'), 'pending');
    });

    test('saved wallet basket mismatch cannot record a smaller sale', () async {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.addProduct(
        id: 'water',
        name: 'Water',
        priceMmk: 1200,
        openingStock: 3,
      );
      await database.createWalletCheckoutIntent(
        operationId: 'wallet-basket-tamper',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [
          ShopSaleLineInput(productId: 'tea', quantity: 2),
          ShopSaleLineInput(productId: 'water', quantity: 1),
        ],
      );
      final beforeOutbox = await database.countOutboxOperations();
      await database.customStatement(
        'UPDATE shop_wallet_checkout_intents SET request_fingerprint = ? '
        'WHERE operation_id = ?',
        [
          jsonEncode({
            'paymentMethod': 'kbzpay',
            'lines': [
              {'productId': 'tea', 'quantity': 2},
            ],
          }),
          'wallet-basket-tamper',
        ],
      );
      await expectLater(
        database.recordManagedTestSale(
          operationId: 'wallet-basket-tamper',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'wallet-basket-tamper',
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.countSales(), 0);
      expect(await database.countOutboxOperations(), beforeOutbox);
      expect(
        (await database.readActiveProducts()).every((p) => p.onHand == 3),
        isTrue,
      );
      final state = await database
          .customSelect(
            'SELECT state FROM shop_wallet_checkout_intents WHERE operation_id = ?',
            variables: [const Variable<String>('wallet-basket-tamper')],
          )
          .getSingle();
      expect(state.read<String>('state'), 'pending');
    });

    test('archived wallet sale rolls back when stock is gone', () async {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 1,
      );
      await database.createWalletCheckoutIntent(
        operationId: 'archived-wallet-no-stock',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );
      await database.customStatement(
        'UPDATE shop_products SET archived = 1, on_hand = 0 WHERE id = ?',
        ['tea'],
      );
      final beforeOutbox = await database.countOutboxOperations();
      final beforeMovements = await database.countStockMovements();
      await expectLater(
        database.recordManagedTestSale(
          operationId: 'archived-wallet-no-stock',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'archived-wallet-no-stock',
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.countSales(), 0);
      expect(await database.countOutboxOperations(), beforeOutbox);
      expect(await database.countStockMovements(), beforeMovements);
      expect((await database.readPendingWalletCheckout())?.state, 'pending');
    });

    test(
      'wallet intent owns the basket until cancellation restores a new draft',
      () async {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 3,
        );
        await database.saveCounterSaleDraft(
          operationId: 'counter-wallet-1',
          quantities: const {'tea': 2},
        );
        await database.createWalletCheckoutIntent(
          operationId: 'counter-wallet-1',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
        );
        expect(await database.readCounterSaleDraft(), isNull);
        expect((await database.readActiveProducts()).single.onHand, 3);
        expect(await database.countSales(), 0);
        expect(
          await database.cancelWalletCheckoutIntent(
            'counter-wallet-1',
            resumeOperationId: 'counter-wallet-2',
          ),
          isTrue,
        );
        final draft = await database.readCounterSaleDraft();
        expect(draft?.operationId, 'counter-wallet-2');
        expect(draft?.quantities, {'tea': 2});
        expect(await database.readPendingWalletCheckout(), isNull);
        expect(await database.countSales(), 0);
      },
    );

    test(
      'stores the batch as review drafts, not active product rows',
      () async {
        final count = await database.stageMenuCandidates(
          batchId: 'batch-1',
          drafts: [
            const MenuDraftInput(
              id: 'draft-1',
              batchId: 'batch-1',
              category: 'Drink',
              name: 'Tea',
              description: '',
              priceMmk: null,
              sku: null,
              barcode: null,
              openingStock: null,
            ),
          ],
        );
        final rows = await database.readMenuDrafts();
        expect(count, 1);
        expect(rows.single.reviewState, 'needs_review');
        expect(rows.single.priceMmk, isNull);
        expect(rows.single.sku, isNull);
        expect(await database.countMenuDrafts(), 1);
      },
    );

    test('validates the full batch before inserting any rows', () async {
      final first = const MenuDraftInput(
        id: 'same-id',
        batchId: 'batch-2',
        category: 'Food',
        name: 'Rice',
        description: '',
        priceMmk: 1200,
        sku: null,
        barcode: null,
        openingStock: 4,
      );
      await expectLater(
        database.stageMenuCandidates(
          batchId: 'batch-2',
          drafts: [first, first],
        ),
        throwsArgumentError,
      );
      expect(await database.countMenuDrafts(), 0);
    });

    test('wallet phone numbers never become QR data', () async {
      await database.saveWalletSetup(
        const MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: '09 123 456 789',
          officialQrPayload: null,
          issuerConfirmed: false,
        ),
      );
      expect(
        qrPayloadForDisplay(null, confirmedAsProviderIssued: true),
        isNull,
      );
      expect(
        qrPayloadForDisplay('09 123 456 789', confirmedAsProviderIssued: false),
        isNull,
      );
      expect(
        qrPayloadForDisplay(
          'kbzpay://pay?number=09123456789',
          confirmedAsProviderIssued: true,
        ),
        isNull,
      );
      final officialPayload = _syntheticStaticMmqr();
      expect(
        qrPayloadForDisplay(officialPayload, confirmedAsProviderIssued: true),
        officialPayload,
      );
      expect(
        qrPayloadForDisplay('09 123 456 789', confirmedAsProviderIssued: true),
        isNull,
      );
      expect(
        qrPayloadForDisplay(
          '${officialPayload.substring(0, officialPayload.length - 1)}0',
          confirmedAsProviderIssued: true,
        ),
        isNull,
      );
      await expectLater(
        database.saveWalletSetup(
          const MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: '09 123 456 789',
            issuerConfirmed: true,
          ),
        ),
        throwsArgumentError,
      );
    });

    test(
      'accepts an omitted initiation tag and rejects dynamic mode',
      () async {
        final staticWithoutTag = _syntheticStaticMmqr(initiationMode: null);
        expect(isValidStaticMyanmarMmqr(staticWithoutTag), isTrue);
        await database.saveWalletSetup(
          MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: staticWithoutTag,
            issuerConfirmed: true,
          ),
        );
        expect(
          (await database.readWalletSetups()).single.officialQrPayload,
          staticWithoutTag,
        );
        expect(
          isValidStaticMyanmarMmqr(_syntheticStaticMmqr(initiationMode: '12')),
          isFalse,
        );
      },
    );

    test('accepts supported additional data and fixed merchant fee fields', () {
      final additionalData = [
        '01${'ORDER-7'.length.toString().padLeft(2, '0')}ORDER-7',
      ].join();
      expect(
        isValidStaticMyanmarMmqr(
          _syntheticStaticMmqr(
            extraFields: [
              '62${additionalData.length.toString().padLeft(2, '0')}$additionalData',
              '550202',
              '56041.50',
            ],
          ),
        ),
        isTrue,
      );
    });

    test('rejects reserved additional data and inconsistent fee fields', () {
      final reservedData = '1201X';
      expect(
        isValidStaticMyanmarMmqr(
          _syntheticStaticMmqr(
            extraFields: [
              '62${reservedData.length.toString().padLeft(2, '0')}$reservedData',
            ],
          ),
        ),
        isFalse,
      );
      expect(
        isValidStaticMyanmarMmqr(
          _syntheticStaticMmqr(extraFields: ['56041.50']),
        ),
        isFalse,
      );
      expect(
        isValidStaticMyanmarMmqr(_syntheticStaticMmqr(extraFields: ['550202'])),
        isFalse,
      );
    });
  });

  group('offline cash shift', () {
    test('formats a negative cash difference without a misplaced comma', () {
      expect(shopMmk(-100), '-100 MMK');
      expect(shopMmk(-1200), '-1,200 MMK');
      expect(shopMmk(-1200, myanmar: true), '-၁,၂၀၀ ကျပ်');
      expect(shopMmk(24900, myanmar: true), '၂၄,၉၀၀ ကျပ်');
      expect(shopNumber(1250, myanmar: true), '၁,၂၅၀');
    });

    test('cash sale cannot make an open shift impossible to close', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 1,
          openingStock: 1,
        );
        final shift = await database.openManagedTestCashShift(
          operationId: 'open-at-limit',
          operatorLabel: 'May',
          openingFloatMmk: 200000000000000,
        );
        final outboxCount = await database.countOutboxOperations();
        final movementCount = await database.countStockMovements();
        await expectLater(
          database.recordManagedTestCashSale(
            operationId: 'sale-over-shift-limit',
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementCount);
        expect(await database.countOutboxOperations(), outboxCount);
        expect((await database.readActiveProducts()).single.onHand, 1);
        final review = await database.readCashShiftReview(shift.id);
        expect(review.expectedCashMmk, 200000000000000);
        expect(
          (await database.closeManagedTestCashShift(
            shiftId: shift.id,
            operationId: 'close-at-limit',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: 200000000000000,
          )).state,
          'closed',
        );
      } finally {
        await database.close();
      }
    });

    test(
      'counts only assigned sales, guards stale close and replays safely',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 10,
          );
          final shift = await database.openManagedTestCashShift(
            operationId: 'open-shift-1',
            operatorLabel: 'May',
            openingFloatMmk: 10000,
          );
          expect(
            (await database.openManagedTestCashShift(
              operationId: 'open-shift-1',
              operatorLabel: 'May',
              openingFloatMmk: 10000,
            )).id,
            shift.id,
          );
          await expectLater(
            database.openManagedTestCashShift(
              operationId: 'open-shift-1',
              operatorLabel: 'May',
              openingFloatMmk: 9000,
            ),
            throwsA(isA<StateError>()),
          );
          await expectLater(
            database.openManagedTestCashShift(
              operationId: 'another-open-shift',
              operatorLabel: 'May',
              openingFloatMmk: 0,
            ),
            throwsA(isA<StateError>()),
          );
          await expectLater(
            database.recordManagedTestCashSale(
              operationId: 'failed-shift-sale',
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 11)],
            ),
            throwsA(isA<StateError>()),
          );
          expect((await database.readCashShiftReview(shift.id)).saleCount, 0);
          expect(await database.countSales(), 0);
          const cashLines = [ShopSaleLineInput(productId: 'tea', quantity: 2)];
          await database.recordManagedTestCashSale(
            operationId: 'cash-shift-1',
            lines: cashLines,
          );
          await database.recordManagedTestCashSale(
            operationId: 'cash-shift-1',
            lines: cashLines,
          );
          final firstReview = await database.readCashShiftReview(shift.id);
          expect(firstReview.cashSalesCount, 1);
          expect(firstReview.cashSalesTotalMmk, 5000);
          expect(firstReview.expectedCashMmk, 15000);
          expect(firstReview.walletSalesCount, 0);
          expect(firstReview.kbzpaySalesCount, 0);
          expect(firstReview.wavepaySalesCount, 0);

          const walletLines = [
            ShopSaleLineInput(productId: 'tea', quantity: 1),
          ];
          await database.createWalletCheckoutIntent(
            operationId: 'wallet-shift-1',
            merchant: MerchantWalletSetup(
              provider: 'KBZPay',
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: walletLines,
          );
          await expectLater(
            database.closeManagedTestCashShift(
              shiftId: shift.id,
              operationId: 'close-pending',
              seenSaleCount: 1,
              seenCashTotalMmk: 5000,
              countedCashMmk: 15000,
            ),
            throwsA(isA<StateError>()),
          );
          await database.recordManagedTestSale(
            operationId: 'wallet-shift-1',
            lines: walletLines,
            paymentMethod: 'kbzpay',
            walletCheckoutOperationId: 'wallet-shift-1',
          );
          final review = await database.readCashShiftReview(shift.id);
          expect(review.saleCount, 2);
          expect(review.cashSalesTotalMmk, 5000);
          expect(review.walletSalesCount, 1);
          expect(review.walletSalesTotalMmk, 2500);
          expect(review.kbzpaySalesCount, 1);
          expect(review.kbzpaySalesTotalMmk, 2500);
          expect(review.wavepaySalesCount, 0);
          expect(review.wavepaySalesTotalMmk, 0);
          expect(review.expectedCashMmk, 15000);
          await expectLater(
            database.closeManagedTestCashShift(
              shiftId: shift.id,
              operationId: 'close-stale',
              seenSaleCount: firstReview.saleCount,
              seenCashTotalMmk: firstReview.cashSalesTotalMmk,
              countedCashMmk: 15000,
            ),
            throwsA(isA<StateError>()),
          );
          final closed = await database.closeManagedTestCashShift(
            shiftId: shift.id,
            operationId: 'close-shift-1',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: 14900,
          );
          expect(closed.state, 'closed');
          expect(closed.expectedCashMmk, 15000);
          expect(closed.countedCashMmk, 14900);
          expect(closed.differenceMmk, -100);
          expect(
            (await database.closeManagedTestCashShift(
              shiftId: shift.id,
              operationId: 'close-shift-1',
              seenSaleCount: review.saleCount,
              seenCashTotalMmk: review.cashSalesTotalMmk,
              countedCashMmk: 14900,
            )).differenceMmk,
            -100,
          );
          await expectLater(
            database.closeManagedTestCashShift(
              shiftId: shift.id,
              operationId: 'close-shift-1',
              seenSaleCount: review.saleCount,
              seenCashTotalMmk: review.cashSalesTotalMmk,
              countedCashMmk: 15000,
            ),
            throwsA(isA<StateError>()),
          );
          final saleEvent = await database
              .customSelect(
                'SELECT payload_json FROM shop_sync_outbox WHERE operation_id = ?',
                variables: [const Variable<String>('cash-shift-1')],
              )
              .getSingle();
          expect(
            (jsonDecode(saleEvent.read<String>('payload_json'))
                as Map<String, dynamic>)['shiftId'],
            shift.id,
          );
          final next = await database.openManagedTestCashShift(
            operationId: 'open-shift-2',
            operatorLabel: 'May',
            openingFloatMmk: 0,
          );
          await database.recordManagedTestCashSale(
            operationId: 'cash-shift-1',
            lines: cashLines,
          );
          expect((await database.readCashShiftReview(next.id)).saleCount, 0);
          expect(await database.countSales(), 2);
        } finally {
          await database.close();
        }
      },
    );

    test('pending wallet checkout blocks opening a new shift', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        await database.createWalletCheckoutIntent(
          operationId: 'pre-shift-wallet',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        await expectLater(
          database.openManagedTestCashShift(
            operationId: 'open-with-pending',
            operatorLabel: 'May',
            openingFloatMmk: 0,
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.readOpenCashShift(), isNull);
        expect(
          await database.cancelWalletCheckoutIntent('pre-shift-wallet'),
          isTrue,
        );
        expect(
          (await database.openManagedTestCashShift(
            operationId: 'open-with-pending',
            operatorLabel: 'May',
            openingFloatMmk: 0,
          )).state,
          'open',
        );
      } finally {
        await database.close();
      }
    });

    test('v5 file gains shift tables without assigning old sales', () async {
      final directory = await Directory.systemTemp.createTemp('shop-shift-v5-');
      final file = File(
        '${directory.path}${Platform.pathSeparator}shop.sqlite',
      );
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 4,
        );
        await database.recordManagedTestCashSale(
          operationId: 'old-sale',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        for (final trigger in const [
          'shop_managed_workspace_binding_no_update',
          'shop_managed_workspace_binding_no_delete',
          'shop_managed_workspace_binding_insert_guard',
          'shop_sale_reversals_require_workspace_binding',
          'shop_wallet_reversal_reconciliations_require_workspace_binding',
        ]) {
          await database.customStatement('DROP TRIGGER $trigger');
        }
        await database.customStatement(
          'DROP TABLE shop_managed_workspace_binding',
        );
        await database.customStatement(
          'DROP TABLE shop_v13_migration_provenance',
        );
        await database.customStatement('DROP TABLE shop_business_profile');
        for (final table in const [
          'shop_sale_reversals',
          'shop_sale_reversal_lines',
          'shop_wallet_reversal_reconciliations',
          'shop_sales',
          'shop_sale_lines',
          'shop_stock_movements',
        ]) {
          await database.customStatement(
            'DROP TRIGGER IF EXISTS ${table}_no_update',
          );
          await database.customStatement(
            'DROP TRIGGER IF EXISTS ${table}_no_delete',
          );
        }
        await database.customStatement(
          'DROP TABLE shop_wallet_reversal_reconciliations',
        );
        await database.customStatement('DROP TABLE shop_sale_reversal_lines');
        await database.customStatement('DROP TABLE shop_sale_reversals');
        await database.customStatement(
          'DROP TABLE shop_correction_authorization_proofs',
        );
        await _dropV16MemberSchema(database);
        await database.customStatement('DROP TABLE shop_cash_shift_sales');
        await database.customStatement('DROP TABLE shop_cash_shifts');
        await database.customStatement('PRAGMA user_version = 5');
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        final shift = await database.openManagedTestCashShift(
          operationId: 'after-upgrade',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        expect((await database.readCashShiftReview(shift.id)).saleCount, 0);
        await database.recordManagedTestCashSale(
          operationId: 'new-sale',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        expect((await database.readCashShiftReview(shift.id)).saleCount, 1);
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect((await database.readOpenCashShift())?.id, shift.id);
        expect(
          (await database.readCashShiftReview(shift.id)).expectedCashMmk,
          7500,
        );
        expect(await database.countSales(), 2);
        final review = await database.readCashShiftReview(shift.id);
        await database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'close-after-upgrade',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 7500,
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        final outboxCount = await database.countOutboxOperations();
        expect((await database.readLatestCashShift())?.state, 'closed');
        expect(
          (await database.closeManagedTestCashShift(
            shiftId: shift.id,
            operationId: 'close-after-upgrade',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: 7500,
          )).differenceMmk,
          0,
        );
        expect(await database.countOutboxOperations(), outboxCount);
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    });

    testWidgets('shift opening and closing stays usable in both languages', (
      tester,
    ) async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: ShopCashShiftScreen(database: database, myanmar: false),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).first, 'May');
        await tester.enterText(find.byType(TextField).last, '10000');
        await tester.tap(find.text('Start shift'));
        await tester.pumpAndSettle();
        expect(
          find.text('Expected after recorded cash activity'),
          findsOneWidget,
        );
        expect(find.textContaining('KBZPay sales'), findsOneWidget);
        expect(find.textContaining('WavePay sales'), findsOneWidget);
        await tester.enterText(find.byType(TextField).last, '10000');
        await tester.scrollUntilVisible(
          find.text('Close shift'),
          240,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('Close shift'));
        await tester.pumpAndSettle();
        await tester.drag(find.byType(ListView), const Offset(0, -400));
        await tester.pumpAndSettle();
        expect(find.text('Last closed shift'), findsOneWidget);
        expect(
          find.text('Expected after recorded cash activity'),
          findsOneWidget,
        );
        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(
          MaterialApp(
            home: ShopCashShiftScreen(database: database, myanmar: true),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('တာဝန်ချိန်စတင်ရန်'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await database.close();
      }
    });

    testWidgets('shift review separates KBZPay and WavePay records', (
      tester,
    ) async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea-wallet-shift',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        final shift = await database.openManagedTestCashShift(
          operationId: 'provider-review-shift',
          operatorLabel: 'May',
          openingFloatMmk: 10000,
        );
        for (final wallet in const [
          (provider: 'KBZPay', method: 'kbzpay'),
          (provider: 'WavePay', method: 'wavepay'),
        ]) {
          final operationId = 'provider-review-${wallet.method}';
          const lines = [
            ShopSaleLineInput(productId: 'tea-wallet-shift', quantity: 1),
          ];
          await database.createWalletCheckoutIntent(
            operationId: operationId,
            merchant: MerchantWalletSetup(
              provider: wallet.provider,
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: lines,
          );
          await database.recordManagedTestSale(
            operationId: operationId,
            lines: lines,
            paymentMethod: wallet.method,
            walletCheckoutOperationId: operationId,
          );
        }
        final review = await database.readCashShiftReview(shift.id);
        expect(review.walletSalesCount, 2);
        expect(review.walletSalesTotalMmk, 5000);
        expect(review.kbzpaySalesCount, 1);
        expect(review.kbzpaySalesTotalMmk, 2500);
        expect(review.wavepaySalesCount, 1);
        expect(review.wavepaySalesTotalMmk, 2500);
        expect(review.expectedCashMmk, 10000);

        await tester.pumpWidget(
          MaterialApp(
            home: ShopCashShiftScreen(database: database, myanmar: false),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('KBZPay sales (1)'), findsOneWidget);
        expect(find.text('WavePay sales (1)'), findsOneWidget);
        expect(find.text('2,500 MMK'), findsNWidgets(2));

        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(
          MaterialApp(
            home: ShopCashShiftScreen(database: database, myanmar: true),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('KBZPay အရောင်း (၁)'), findsOneWidget);
        expect(find.text('WavePay အရောင်း (၁)'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await database.close();
      }
    });

    test('shift mutations roll back when their outbox write aborts', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-shift-outbox-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.customStatement(
          'CREATE TRIGGER synthetic_shift_open_outbox_abort '
          'BEFORE INSERT ON shop_sync_outbox '
          "WHEN NEW.event_type = 'shop.cash_shift.opened.v1' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic shift outbox failure'); END",
        );
        await expectLater(
          database.openManagedTestCashShift(
            operationId: 'shift-abort-open',
            operatorLabel: 'Synthetic operator',
            openingFloatMmk: 10000,
          ),
          throwsA(
            predicate(
              (error) =>
                  error.toString().contains('synthetic shift outbox failure'),
            ),
          ),
        );
        await database.customStatement(
          'DROP TRIGGER synthetic_shift_open_outbox_abort',
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect(await database.readLatestCashShift(), isNull);
        expect(await database.countOutboxOperations(), 0);
        final shift = await database.openManagedTestCashShift(
          operationId: 'shift-abort-open',
          operatorLabel: 'Synthetic operator',
          openingFloatMmk: 10000,
        );
        final review = await database.readCashShiftReview(shift.id);
        await database.customStatement(
          'CREATE TRIGGER synthetic_shift_close_outbox_abort '
          'BEFORE INSERT ON shop_sync_outbox '
          "WHEN NEW.event_type = 'shop.cash_shift.closed.v1' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic shift outbox failure'); END",
        );
        await expectLater(
          database.closeManagedTestCashShift(
            shiftId: shift.id,
            operationId: 'shift-abort-close',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: review.expectedCashMmk,
          ),
          throwsA(
            predicate(
              (error) =>
                  error.toString().contains('synthetic shift outbox failure'),
            ),
          ),
        );
        await database.customStatement(
          'DROP TRIGGER synthetic_shift_close_outbox_abort',
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect((await database.readOpenCashShift())?.id, shift.id);
        expect((await database.readLatestCashShift())?.state, 'open');
        expect(await database.countOutboxOperations(), 1);
        final closed = await database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'shift-abort-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: review.expectedCashMmk,
        );
        expect(closed.state, 'closed');
        expect(
          (await database.closeManagedTestCashShift(
            shiftId: shift.id,
            operationId: 'shift-abort-close',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: review.expectedCashMmk,
          )).id,
          shift.id,
        );
        expect(await database.countOutboxOperations(), 2);
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    });
  });

  group('offline stock updates', () {
    test(
      'per-product alert starts at 5 and never changes stock or outbox',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'rice',
            name: 'Rice',
            priceMmk: 12000,
            openingStock: 8,
          );
          final stockMovements = await database.countStockMovements();
          final outboxOperations = await database.countOutboxOperations();
          expect((await database.readActiveProducts()).single.reorderLevel, 5);
          await database.setReorderLevel(
            productId: 'rice',
            expectedReorderLevel: 5,
            reorderLevel: 12,
          );
          expect((await database.readActiveProducts()).single.reorderLevel, 12);
          await expectLater(
            database.setReorderLevel(
              productId: 'rice',
              expectedReorderLevel: 5,
              reorderLevel: 3,
            ),
            throwsA(isA<StateError>()),
          );
          await database.setReorderLevel(
            productId: 'rice',
            expectedReorderLevel: 12,
            reorderLevel: null,
          );
          expect(
            (await database.readActiveProducts()).single.reorderLevel,
            isNull,
          );
          await database.setReorderLevel(
            productId: 'rice',
            expectedReorderLevel: null,
            reorderLevel: 0,
          );
          expect((await database.readActiveProducts()).single.reorderLevel, 0);
          await expectLater(
            database.setReorderLevel(
              productId: 'rice',
              expectedReorderLevel: 0,
              reorderLevel: -1,
            ),
            throwsArgumentError,
          );
          expect((await database.readActiveProducts()).single.onHand, 8);
          expect(await database.countStockMovements(), stockMovements);
          expect(await database.countOutboxOperations(), outboxOperations);
        } finally {
          await database.close();
        }
      },
    );

    test('a count preserves stock promised in a pending wallet sale', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        await database.createWalletCheckoutIntent(
          operationId: 'wallet-before-count',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
        );
        final movementCount = await database.countStockMovements();
        final outboxCount = await database.countOutboxOperations();
        await expectLater(
          database.changeStock(
            operationId: 'count-below-wallet',
            productId: 'tea',
            kind: 'count',
            quantity: 1,
            expectedOnHand: 2,
          ),
          throwsA(isA<StateError>()),
        );
        expect((await database.readActiveProducts()).single.onHand, 2);
        expect(await database.countStockMovements(), movementCount);
        expect(await database.countOutboxOperations(), outboxCount);
        expect(
          await database.changeStock(
            operationId: 'count-wallet-safe',
            productId: 'tea',
            kind: 'count',
            quantity: 2,
            expectedOnHand: 2,
          ),
          2,
        );
        expect(
          await database.cancelWalletCheckoutIntent('wallet-before-count'),
          isTrue,
        );
        expect(
          await database.changeStock(
            operationId: 'count-after-cancel',
            productId: 'tea',
            kind: 'count',
            quantity: 1,
            expectedOnHand: 2,
          ),
          1,
        );
      } finally {
        await database.close();
      }
    });

    test(
      'receive and count are durable, idempotent and reject stale counts',
      () async {
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'rice',
            name: 'Rice',
            priceMmk: 12000,
            openingStock: 5,
          );
          expect(
            await database.changeStock(
              operationId: 'receive-rice-1',
              productId: 'rice',
              kind: 'receive',
              quantity: 3,
              expectedOnHand: 5,
            ),
            8,
          );
          expect(
            await database.changeStock(
              operationId: 'receive-rice-1',
              productId: 'rice',
              kind: 'receive',
              quantity: 3,
              expectedOnHand: 5,
            ),
            8,
          );
          expect(await database.countStockMovements(), 2);
          await database.recordManagedTestCashSale(
            operationId: 'sell-rice-1',
            lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
          );
          await expectLater(
            database.changeStock(
              operationId: 'stale-rice-count',
              productId: 'rice',
              kind: 'count',
              quantity: 4,
              expectedOnHand: 8,
            ),
            throwsA(isA<StateError>()),
          );
          expect(
            await database.changeStock(
              operationId: 'count-rice-1',
              productId: 'rice',
              kind: 'count',
              quantity: 4,
              expectedOnHand: 6,
            ),
            4,
          );
          await expectLater(
            database.changeStock(
              operationId: 'count-rice-1',
              productId: 'rice',
              kind: 'count',
              quantity: 3,
              expectedOnHand: 6,
            ),
            throwsA(isA<StateError>()),
          );
          expect((await database.readActiveProducts()).single.onHand, 4);
          expect(await database.countStockMovements(), 4);
          expect(await database.countOutboxOperations(), 4);
        } finally {
          await database.close();
        }
      },
    );

    test('stock mutation rolls back when its outbox write aborts', () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-stock-outbox-abort-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 12000,
          openingStock: 5,
        );
        await database.customStatement(
          'CREATE TRIGGER synthetic_stock_outbox_abort '
          'BEFORE INSERT ON shop_sync_outbox '
          "WHEN NEW.event_type = 'shop.stock_changed.v1' "
          "BEGIN SELECT RAISE(ABORT, 'synthetic stock outbox failure'); END",
        );
        await expectLater(
          database.changeStock(
            operationId: 'receive-rice-abort',
            productId: 'rice',
            kind: 'receive',
            quantity: 3,
            expectedOnHand: 5,
          ),
          throwsA(
            predicate(
              (error) =>
                  error.toString().contains('synthetic stock outbox failure'),
            ),
          ),
        );
        await database.customStatement(
          'DROP TRIGGER synthetic_stock_outbox_abort',
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect((await database.readActiveProducts()).single.onHand, 5);
        expect(await database.countStockMovements(), 1);
        expect(await database.countOutboxOperations(), 1);
        expect(
          await database.changeStock(
            operationId: 'receive-rice-abort',
            productId: 'rice',
            kind: 'receive',
            quantity: 3,
            expectedOnHand: 5,
          ),
          8,
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect((await database.readActiveProducts()).single.onHand, 8);
        expect(await database.countStockMovements(), 2);
        expect(await database.countOutboxOperations(), 2);
        expect(
          await database.changeStock(
            operationId: 'receive-rice-abort',
            productId: 'rice',
            kind: 'receive',
            quantity: 3,
            expectedOnHand: 5,
          ),
          8,
        );
        expect(await database.countStockMovements(), 2);
        expect(await database.countOutboxOperations(), 2);
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    });
  });

  test(
    'local SQLite snapshot includes sales, stock, outbox and wallet intents',
    () async {
      final directory = await Directory.systemTemp.createTemp('shop-snapshot-');
      final target = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 12000,
          openingStock: 5,
        );
        await database.recordManagedTestCashSale(
          operationId: 'sale-snapshot-1',
          lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
        );
        await database.customStatement(
          'INSERT INTO shop_wallet_checkout_intents '
          '(operation_id, payment_method, request_fingerprint, total_mmk, '
          'merchant_phone, merchant_qr_payload, basket_json, state, '
          'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            'wallet-snapshot-1',
            'kbzpay',
            'synthetic',
            0,
            '',
            '',
            '[]',
            'pending',
            1,
          ],
        );

        await database.exportVerifiedLocalSnapshot(target);
        expect(await target.length(), greaterThan(0));
        final reopened = ShopDatabase(NativeDatabase(target));
        try {
          expect((await reopened.readActiveProducts()).single.onHand, 3);
          expect(await reopened.countSales(), 1);
          expect(await reopened.countStockMovements(), 2);
          expect(await reopened.countOutboxOperations(), 2);
          final intents = await reopened
              .customSelect(
                'SELECT operation_id FROM shop_wallet_checkout_intents',
              )
              .get();
          expect(
            intents.single.read<String>('operation_id'),
            'wallet-snapshot-1',
          );
        } finally {
          await reopened.close();
        }
        final originalBytes = await target.readAsBytes();
        await expectLater(
          database.exportVerifiedLocalSnapshot(target),
          throwsA(isA<StateError>()),
        );
        expect(await target.readAsBytes(), originalBytes);
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    },
  );

  group('bounded printer discovery', () {
    test('missing scope cannot open production printer boundaries', () {
      expect(ReceiptPrinterSettings.new, throwsStateError);
      expect(PrinterDiscoveryService.new, throwsStateError);
      expect(ShopReceiptPrinter.new, throwsStateError);
      expect(ReceiptReprintService.new, throwsStateError);
    });

    test('injected printer callbacks still require an explicit test seam', () {
      expect(
        () => ReceiptPrinterSettings(
          preferences: SharedPreferences.getInstance,
          rangeProvider: () async => (ip: '192.168.1.2', mask: '255.255.255.0'),
        ),
        throwsStateError,
      );
      expect(
        () => PrinterDiscoveryService(
          probe: (_, _) async => true,
          rangeProvider: () async => (ip: '192.168.1.2', mask: '255.255.255.0'),
        ),
        throwsStateError,
      );
    });

    test('receipt raster profiles emit aligned bounded ESC POS rows', () async {
      final receipt = ShopSaleReceipt(
        id: 'profile-sale',
        operationId: 'profile-sale',
        totalMmk: 125000,
        createdAtMillis: DateTime(2026, 10, 23, 9, 30).millisecondsSinceEpoch,
        paymentMethod: 'cash',
        lines: const [
          ShopSaleReceiptLine(
            productId: 'tea',
            productName: 'လက်ဖက်ရည် နို့ဆီ ချိုချို',
            unitPriceMmk: 2500,
            quantity: 50,
            lineTotalMmk: 125000,
          ),
        ],
      );
      final profiles = <(PaperSize, ReceiptPaperWidth)>[
        (PaperSize.mm58, ReceiptPaperWidth.mm58),
        (PaperSize.mm58Wide420, ReceiptPaperWidth.mm58),
        (PaperSize.mm80, ReceiptPaperWidth.mm80),
      ];

      for (final myanmar in [false, true]) {
        for (final (paperSize, paperWidth) in profiles) {
          final ticket = await buildShopReceiptTicket(
            receipt,
            myanmar: myanmar,
            paperWidth: paperWidth,
            rasterPaperSize: paperSize,
          );
          final blocks = _rasterBlocks(ticket.bytes);
          expect(blocks, isNotEmpty, reason: '${paperSize.name}/$myanmar');
          expect(
            blocks.every(
              (block) =>
                  block.widthBytes <= (paperSize.widthPixels + 7) ~/ 8 &&
                  block.data.length == block.widthBytes * block.height &&
                  block.hasInk,
            ),
            isTrue,
            reason: '${paperSize.name}/$myanmar',
          );
          expect(
            ticket.bytes.sublist(ticket.bytes.length - 3),
            paperWidth.sendCutCommand ? [29, 86, 48] : [27, 100, 3],
            reason: '${paperSize.name}/$myanmar',
          );
        }
      }

      final padded = await Ticket.create(PaperSize.mm58Wide420);
      await padded.textRaster(
        '420 dot padding proof',
        textDirection: ui.TextDirection.rtl,
      );
      final paddedBlocks = _rasterBlocks(padded.bytes)
          .where((block) => block.widthBytes == 53);
      expect(paddedBlocks, isNotEmpty);
      expect(
        paddedBlocks.every(
          (block) =>
              block.hasInk &&
              _unusedRasterBitsAreClear(block, logicalWidthDots: 420),
        ),
        isTrue,
      );
    });

    test(
      'actual network connector sends exact receipt bytes to loopback',
      () async {
        final receipt = ShopSaleReceipt(
          id: 'loopback-sale',
          operationId: 'loopback-sale',
          totalMmk: 2500,
          createdAtMillis: 0,
          paymentMethod: 'cash',
        );
        final ticket = await buildShopReceiptTicket(
          receipt,
          myanmar: true,
          paperWidth: ReceiptPaperWidth.mm80,
        );
        final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
        final received = BytesBuilder(copy: false);
        final receivedDone = Completer<void>();
        server.listen((client) {
          client.listen(
            received.add,
            onDone: () {
              if (!receivedDone.isCompleted) receivedDone.complete();
            },
          );
        });
        final manager = PrinterManager();
        try {
          await manager.connect(
            NetworkPrinterDevice(
              name: 'loopback receipt sink',
              host: InternetAddress.loopbackIPv4.address,
              port: server.port,
            ),
          );
          await manager.printTicket(ticket);
          await manager.disconnect();
          await receivedDone.future.timeout(const Duration(seconds: 2));
          final bytes = received.takeBytes();
          expect(bytes.take(2).toList(), [27, 64]);
          expect(bytes.skip(2).toList(), ticket.bytes);
        } finally {
          await manager.dispose();
          await server.close();
        }
      },
    );

    test(
      'network connector reports connection refusal without retrying',
      () async {
        final reservation = await ServerSocket.bind(
          InternetAddress.loopbackIPv4,
          0,
        );
        final refusedPort = reservation.port;
        await reservation.close();
        final manager = PrinterManager();
        try {
          await expectLater(
            manager.connect(
              NetworkPrinterDevice(
                name: 'closed loopback receipt sink',
                host: InternetAddress.loopbackIPv4.address,
                port: refusedPort,
              ),
              timeout: const Duration(milliseconds: 250),
            ),
            throwsA(isA<PrinterConnectionException>()),
          );
        } finally {
          await manager.dispose();
        }
      },
    );

    test(
      'network reset after a partial write requires an explicit retry',
      () async {
        final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
        final clients = <Socket>[];
        final firstPrefix = BytesBuilder(copy: false);
        final firstReset = Completer<void>();
        final retryReceived = BytesBuilder(copy: false);
        final retryDone = Completer<void>();
        var connections = 0;
        final subscription = server.listen((client) {
          clients.add(client);
          connections++;
          if (connections == 1) {
            client.listen(
              (bytes) {
                firstPrefix.add(bytes);
                if (firstPrefix.length > 2 && !firstReset.isCompleted) {
                  client.destroy();
                  firstReset.complete();
                }
              },
              onError: (_) {
                if (!firstReset.isCompleted) firstReset.complete();
              },
              onDone: () {
                if (!firstReset.isCompleted) firstReset.complete();
              },
              cancelOnError: true,
            );
            return;
          }
          client.listen(
            retryReceived.add,
            onDone: () {
              if (!retryDone.isCompleted) retryDone.complete();
            },
          );
        });
        final manager = PrinterManager(
          networkConnector: NetworkConnector(
            writeTimeout: const Duration(seconds: 2),
          ),
        );
        final device = NetworkPrinterDevice(
          name: 'partial loopback receipt sink',
          host: InternetAddress.loopbackIPv4.address,
          port: server.port,
        );
        final firstAttempt = List<int>.filled(
          16 * 1024 * 1024,
          0x55,
          growable: false,
        );
        const retry = [1, 2, 3, 4];
        try {
          await manager.connect(device);
          await expectLater(
            manager.printBytes(firstAttempt),
            throwsA(isA<PrinterWriteException>()),
          );
          await firstReset.future.timeout(const Duration(seconds: 2));
          final prefix = firstPrefix.takeBytes();
          expect(prefix.take(2).toList(), [27, 64]);
          expect(prefix.length, greaterThan(2));
          expect(prefix.length, lessThan(firstAttempt.length + 2));
          expect(manager.state, PrinterConnectionState.disconnected);
          expect(connections, 1);

          await expectLater(
            manager.printBytes(retry),
            throwsA(isA<PrinterStateException>()),
          );
          expect(connections, 1);

          await manager.connect(device);
          await manager.printBytes(retry);
          await manager.disconnect();
          await retryDone.future.timeout(const Duration(seconds: 2));
          expect(connections, 2);
          expect(retryReceived.takeBytes(), [27, 64, ...retry]);
        } finally {
          await manager.dispose();
          for (final client in clients) {
            client.destroy();
          }
          await subscription.cancel();
          await server.close();
        }
      },
    );

    test(
      'network write timeout destroys the socket without an automatic retry',
      () async {
        final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
        final clientClosed = Completer<void>();
        server.listen((client) {
          client.listen(
            (_) {},
            onDone: () {
              if (!clientClosed.isCompleted) clientClosed.complete();
            },
            onError: (_) {
              if (!clientClosed.isCompleted) clientClosed.complete();
            },
            cancelOnError: true,
          );
        });
        var flushCalls = 0;
        final stalledFlush = Completer<void>();
        final connector = NetworkConnector(
          writeTimeout: const Duration(milliseconds: 25),
          flushOperation: () {
            flushCalls++;
            if (flushCalls == 1) return Future<void>.value();
            return stalledFlush.future;
          },
        );
        final manager = PrinterManager(networkConnector: connector);
        try {
          await manager.connect(
            NetworkPrinterDevice(
              name: 'stalled loopback receipt sink',
              host: InternetAddress.loopbackIPv4.address,
              port: server.port,
            ),
          );
          await expectLater(
            manager.printBytes([1, 2, 3]),
            throwsA(
              isA<PrinterWriteException>().having(
                (error) => error.cause,
                'cause',
                isA<TimeoutException>(),
              ),
            ),
          );
          expect(manager.state, PrinterConnectionState.disconnected);
          expect(flushCalls, 2);
          await expectLater(
            manager.printBytes([4, 5, 6]),
            throwsA(isA<PrinterStateException>()),
          );
          expect(flushCalls, 2);
          await clientClosed.future.timeout(const Duration(seconds: 2));
        } finally {
          if (!stalledFlush.isCompleted) stalledFlush.complete();
          await manager.dispose();
          await server.close();
        }
      },
    );

    test(
      'paper width persists and a changed profile requires retesting',
      () async {
        SharedPreferences.setMockInitialValues({});
        const range = (ip: '192.168.20.10', mask: '255.255.255.248');
        final settings = ReceiptPrinterSettings(
          rangeProvider: () async => range,
          session: VerifiedPrinterSession(),
          testOnlyAllowMissingRuntimeScope: true,
        );
        expect(await settings.readPaperWidth(), ReceiptPaperWidth.mm80);
        expect(ReceiptPaperWidth.mm58.paperSize.widthPixels, 384);
        expect(ReceiptPaperWidth.mm80.paperSize.widthPixels, 576);
        expect(ReceiptPaperWidth.mm58.sendCutCommand, isFalse);
        expect(ReceiptPaperWidth.mm80.sendCutCommand, isTrue);

        final printer = (await PrinterDiscoveryService(
          rangeProvider: () async => range,
          probe: (host, port) async => host == '192.168.20.9',
          testOnlyAllowMissingRuntimeScope: true,
        ).scan()).printers.single;
        await settings.saveAfterTest(
          printer,
          paperWidth: ReceiptPaperWidth.mm58,
        );
        expect(
          (await settings.readTrustedPrinter())?.paperWidth,
          ReceiptPaperWidth.mm58,
        );
        expect(
          await ReceiptPrinterSettings(
            rangeProvider: () async => range,
            session: VerifiedPrinterSession(),
            testOnlyAllowMissingRuntimeScope: true,
          ).readPaperWidth(),
          ReceiptPaperWidth.mm58,
        );

        final preferences = await SharedPreferences.getInstance();
        await preferences.setString(shopReceiptPaperWidthKey, 'mm80');
        expect(await settings.readTrustedPrinter(), isNull);

        await settings.saveAfterTest(
          printer,
          paperWidth: ReceiptPaperWidth.mm80,
        );
        expect(
          (await settings.readTrustedPrinter())?.paperWidth,
          ReceiptPaperWidth.mm80,
        );
        settings.requireRetest();
        expect(await settings.readTrustedPrinter(), isNull);
      },
    );

    test('reprint needs a tested printer in this session', () async {
      SharedPreferences.setMockInitialValues({
        shopReceiptPrinterHostKey: '192.168.20.9',
      });
      const range = (ip: '192.168.20.10', mask: '255.255.255.248');
      final session = VerifiedPrinterSession();
      final settings = ReceiptPrinterSettings(
        rangeProvider: () async => range,
        session: session,
        testOnlyAllowMissingRuntimeScope: true,
      );
      final sent = <String>[];
      final reprint = ReceiptReprintService(
        settings: settings,
        send: (host, receipt, myanmar) async {
          sent.add('$host:${receipt.id}:$myanmar');
        },
        testOnlyAllowMissingRuntimeScope: true,
      );
      final receipt = ShopSaleReceipt(
        id: 'sale-for-reprint',
        operationId: 'sale-for-reprint',
        totalMmk: 2500,
        createdAtMillis: 1,
        paymentMethod: 'cash',
      );

      expect(await reprint.printIfTrusted(receipt, myanmar: true), isFalse);
      expect(sent, isEmpty);
      final candidate = (await PrinterDiscoveryService(
        rangeProvider: () async => range,
        probe: (host, port) async => host == '192.168.20.9',
        testOnlyAllowMissingRuntimeScope: true,
      ).scan()).printers.single;
      await settings.saveAfterTest(candidate);
      expect(await reprint.printIfTrusted(receipt, myanmar: true), isTrue);
      expect(sent, ['192.168.20.9:sale-for-reprint:true']);

      final afterRestart = ReceiptReprintService(
        settings: ReceiptPrinterSettings(
          rangeProvider: () async => range,
          session: VerifiedPrinterSession(),
          testOnlyAllowMissingRuntimeScope: true,
        ),
        send: (host, receipt, myanmar) async {
          sent.add('unexpected');
        },
        testOnlyAllowMissingRuntimeScope: true,
      );
      expect(
        await afterRestart.printIfTrusted(receipt, myanmar: true),
        isFalse,
      );
      expect(sent, hasLength(1));
    });

    test('saved IP needs current-session printer trust', () async {
      SharedPreferences.setMockInitialValues({
        shopReceiptPrinterHostKey: '192.168.20.9',
      });
      var range = (ip: '192.168.20.10', mask: '255.255.255.248');
      final session = VerifiedPrinterSession();
      final settings = ReceiptPrinterSettings(
        rangeProvider: () async => range,
        session: session,
        testOnlyAllowMissingRuntimeScope: true,
      );
      expect(await settings.readSavedHost(), '192.168.20.9');
      expect(await settings.readHost(), isNull);

      final discovery = PrinterDiscoveryService(
        rangeProvider: () async => range,
        probe: (host, port) async => host == '192.168.20.9',
        testOnlyAllowMissingRuntimeScope: true,
      );
      final printer = (await discovery.scan()).printers.single;
      await settings.saveAfterTest(printer);
      expect(await settings.readHost(), printer.host);

      range = (ip: '192.168.20.11', mask: '255.255.255.248');
      expect(await settings.readHost(), isNull);
      range = (ip: '192.168.20.10', mask: '255.255.255.248');
      expect(await settings.readHost(), isNull);
      expect(
        await ReceiptPrinterSettings(
          rangeProvider: () async => range,
          session: VerifiedPrinterSession(),
          testOnlyAllowMissingRuntimeScope: true,
        ).readHost(),
        isNull,
      );
    });

    test('scans host addresses only within the current private subnet', () {
      final subnet = Ipv4Subnet.fromAddress('192.168.1.25', '255.255.255.0');
      expect(subnet.prefixLength, 24);
      expect(subnet.hosts, hasLength(253));
      expect(subnet.hosts, contains('192.168.1.1'));
      expect(subnet.hosts, contains('192.168.1.254'));
      expect(subnet.hosts, isNot(contains('192.168.1.25')));
      expect(
        () => Ipv4Subnet.fromAddress('8.8.8.8', '255.255.255.0'),
        throwsFormatException,
      );
      expect(
        () => Ipv4Subnet.fromAddress('192.168.1.25', '255.255.252.0'),
        throwsFormatException,
      );
    });

    test('probes only the selected subnet on port 9100', () async {
      final seen = <String>[];
      final service = PrinterDiscoveryService(
        rangeProvider: () async =>
            (ip: '192.168.10.10', mask: '255.255.255.248'),
        probe: (host, port) async {
          seen.add('$host:$port');
          return host == '192.168.10.11';
        },
        testOnlyAllowMissingRuntimeScope: true,
      );
      final result = await service.scan();
      expect(result.localIp, '192.168.10.10');
      expect(result.subnetMask, '255.255.255.248');
      expect(result.printers.map((item) => item.host), ['192.168.10.11']);
      expect(seen.every((item) => item.startsWith('192.168.10.')), isTrue);
      expect(seen.every((item) => item.endsWith(':9100')), isTrue);
      expect(seen, isNot(contains('192.168.10.10:9100')));
    });

    test('aborts discovery when Wi-Fi changes between probe batches', () async {
      var rangeReads = 0;
      final seen = <String>[];
      final service = PrinterDiscoveryService(
        rangeProvider: () async {
          rangeReads++;
          return rangeReads <= 2
              ? (ip: '192.168.10.10', mask: '255.255.255.248')
              : (ip: '192.168.11.10', mask: '255.255.255.248');
        },
        probe: (host, port) async {
          seen.add('$host:$port');
          return false;
        },
        testOnlyAllowMissingRuntimeScope: true,
      );

      await expectLater(
        service.scan(maxConcurrent: 2),
        throwsA(isA<PrinterNetworkChanged>()),
      );
      expect(seen, hasLength(2));
      expect(seen.every((item) => item.startsWith('192.168.10.')), isTrue);
    });

    test('invalidates candidates from a replaced scan', () async {
      var respond = true;
      final service = PrinterDiscoveryService(
        rangeProvider: () async =>
            (ip: '192.168.20.10', mask: '255.255.255.248'),
        probe: (host, port) async => respond && host == '192.168.20.9',
        testOnlyAllowMissingRuntimeScope: true,
      );
      final firstScan = await service.scan();
      expect(firstScan.printers, hasLength(1));
      final priorCandidate = firstScan.printers.single;
      respond = false;
      await service.scan();
      await expectLater(
        service.sendTestReceipt(priorCandidate),
        throwsFormatException,
      );
    });

    test('rejects a candidate when Wi-Fi changes after discovery', () async {
      var range = (ip: '192.168.20.10', mask: '255.255.255.248');
      final service = PrinterDiscoveryService(
        rangeProvider: () async => range,
        probe: (host, port) async => host == '192.168.20.9',
        testOnlyAllowMissingRuntimeScope: true,
      );
      final result = await service.scan();
      final candidate = result.printers.single;
      range = (ip: '192.168.21.10', mask: '255.255.255.248');
      await expectLater(
        service.sendTestReceipt(candidate),
        throwsA(isA<PrinterNetworkChanged>()),
      );
    });
  });
}

Future<void> _dropV16MemberSchema(ShopDatabase database) async {
  await database.customStatement(
    'ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk',
  );
  for (final definition
      in shopPendingCashCheckoutSchemaDefinitionsV21().entries
          .toList()
          .reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    await database.customStatement(
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
    await database.customStatement(
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
    await database.customStatement(
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
    await database.customStatement(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
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
    await database.customStatement('DROP TRIGGER IF EXISTS $trigger');
  }
  for (final table in const [
    'shop_correction_consumptions',
    'shop_correction_consumption_intents',
    'shop_correction_lineage_state',
  ]) {
    await database.customStatement('DROP TABLE IF EXISTS $table');
  }
  for (final table in const [
    'shop_wallet_checkout_member_links',
    'shop_sale_member_links',
    'shop_member_cards',
    'shop_members',
    'shop_store_identity',
  ]) {
    await database.customStatement('DROP TABLE IF EXISTS $table');
  }
}

List<({int widthBytes, int height, List<int> data, bool hasInk})> _rasterBlocks(
  List<int> bytes,
) {
  final blocks =
      <({int widthBytes, int height, List<int> data, bool hasInk})>[];
  for (var index = 0; index + 8 <= bytes.length;) {
    if (bytes[index] != 29 ||
        bytes[index + 1] != 118 ||
        bytes[index + 2] != 48) {
      index++;
      continue;
    }
    if (bytes[index + 3] != 0) {
      throw StateError('Unexpected GS v 0 density mode.');
    }
    final widthBytes = bytes[index + 4] | (bytes[index + 5] << 8);
    final height = bytes[index + 6] | (bytes[index + 7] << 8);
    final dataLength = widthBytes * height;
    if (index + 8 + dataLength > bytes.length) {
      throw StateError('Truncated GS v 0 raster block.');
    }
    final data = bytes.sublist(index + 8, index + 8 + dataLength);
    blocks.add((
      widthBytes: widthBytes,
      height: height,
      data: data,
      hasInk: data.any((byte) => byte != 0),
    ));
    index += 8 + dataLength;
  }
  return blocks;
}

bool _unusedRasterBitsAreClear(
  ({int widthBytes, int height, List<int> data, bool hasInk}) block, {
  required int logicalWidthDots,
}) {
  final unusedBits = block.widthBytes * 8 - logicalWidthDots;
  if (unusedBits <= 0) return true;
  final unusedMask = (1 << unusedBits) - 1;
  for (var row = 0; row < block.height; row++) {
    if ((block.data[(row + 1) * block.widthBytes - 1] & unusedMask) != 0) {
      return false;
    }
  }
  return true;
}

Future<ShopCorrectionAuthorization> _correctionAuthorization(
  String commandDigest, {
  required String capability,
  required String receiptId,
  String workspaceId = 'workspace-shop-test',
  String actorId = 'owner-test',
  String actorLabel = 'Test owner',
  int? issuedAtMillis,
  int? expiresAtMillis,
  bool historicalV2 = false,
}) async {
  final now = DateTime.now().millisecondsSinceEpoch;
  final issued = issuedAtMillis ?? now - 1000;
  final expires =
      expiresAtMillis ?? issued + const Duration(minutes: 5).inMilliseconds;
  const actorRole = 'owner';
  const source = 'managed_membership_receipt_v1';
  const finalizationRequestId = '22222222-2222-4222-8222-222222222222';
  final receiptDigest = historicalV2
      ? shopHistoricalCorrectionAuthorizationReceiptDigestV2(
          source: source,
          receiptId: receiptId,
          workspaceId: workspaceId,
          actorId: actorId,
          actorLabel: actorLabel,
          actorRole: actorRole,
          capability: capability,
          commandDigest: commandDigest,
          issuedAtMillis: issued,
          expiresAtMillis: expires,
        )
      : shopCorrectionAuthorizationReceiptDigest(
          source: source,
          receiptId: receiptId,
          workspaceId: workspaceId,
          actorId: actorId,
          actorLabel: actorLabel,
          actorRole: actorRole,
          capability: capability,
          commandDigest: commandDigest,
          finalizationRequestId: finalizationRequestId,
          finalizedAtMillis: issued,
          issuedAtMillis: issued,
          expiresAtMillis: expires,
        );
  final keyPair = await Ed25519().newKeyPairFromSeed(
    List<int>.generate(32, (index) => index),
  );
  final signed = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: _testCorrectionKeyId,
        receiptDigest: receiptDigest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: historicalV2
        ? shopHistoricalCorrectionAuthorizationReceiptContractV2
        : shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: receiptDigest,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    source: source,
    commandDigest: commandDigest,
    finalizationRequestId: historicalV2 ? null : finalizationRequestId,
    finalizedAtMillis: historicalV2 ? null : issued,
    issuedAtMillis: issued,
    expiresAtMillis: expires,
    keyId: _testCorrectionKeyId,
    signature: base64Url.encode(signed.bytes).replaceAll('=', ''),
  );
}

Future<ShopManagedWorkspaceBinding> _attachTestWorkspace(
  ShopDatabase database,
) => database.attachAuthenticatedManagedWorkspace(
  const ShopAuthenticatedWorkspaceSelection(
    workspaceId: 'workspace-shop-test',
    actorId: 'owner-test',
  ),
);

Future<Map<String, List<Map<String, Object?>>>> _catalogCreationState(
  ShopDatabase database, {
  required String productId,
  required String operationId,
}) async {
  Future<List<Map<String, Object?>>> rows(
    String statement,
    List<Variable<Object>> variables,
  ) async =>
      (await database.customSelect(statement, variables: variables).get())
          .map((row) => Map<String, Object?>.from(row.data))
          .toList(growable: false);

  return {
    'products': await rows(
      'SELECT id, name, category, description, sku, barcode, price_mmk, '
      'on_hand FROM shop_products WHERE id = ? ORDER BY id',
      [Variable<String>(productId)],
    ),
    'movements': await rows(
      'SELECT id, product_id, quantity_delta, reason '
      'FROM shop_stock_movements WHERE product_id = ? ORDER BY id',
      [Variable<String>(productId)],
    ),
    'outbox': await rows(
      'SELECT operation_id, event_type, payload_json, state '
      'FROM shop_sync_outbox WHERE operation_id = ? ORDER BY operation_id',
      [Variable<String>(operationId)],
    ),
  };
}

Future<Map<String, List<Map<String, Object?>>>> _catalogEditState(
  ShopDatabase database, {
  required String productId,
  required String saleId,
}) async {
  Future<List<Map<String, Object?>>> rows(
    String statement,
    List<Variable<Object>> variables,
  ) async =>
      (await database.customSelect(statement, variables: variables).get())
          .map((row) => Map<String, Object?>.from(row.data))
          .toList(growable: false);

  return {
    'products': await rows(
      'SELECT id, name, category, description, sku, barcode, price_mmk, '
      'on_hand FROM shop_products WHERE id = ? ORDER BY id',
      [Variable<String>(productId)],
    ),
    'saleLines': await rows(
      'SELECT sale_id, product_id, product_name, unit_price_mmk, quantity, '
      'line_total_mmk FROM shop_sale_lines WHERE sale_id = ? ORDER BY id',
      [Variable<String>(saleId)],
    ),
    'movements': await rows(
      'SELECT id, product_id, quantity_delta, reason '
      'FROM shop_stock_movements WHERE product_id = ? ORDER BY id',
      [Variable<String>(productId)],
    ),
    'outbox': await rows(
      'SELECT operation_id, event_type, payload_json, state '
      'FROM shop_sync_outbox ORDER BY operation_id',
      const [],
    ),
  };
}

Future<Map<String, List<Map<String, Object?>>>> _fullSaleReversalState(
  ShopDatabase database,
) async {
  Future<List<Map<String, Object?>>> rows(String statement) async =>
      (await database.customSelect(statement).get())
          .map((row) => Map<String, Object?>.from(row.data))
          .toList(growable: false);

  return {
    'products': await rows(
      'SELECT id, on_hand, updated_at_millis FROM shop_products ORDER BY id',
    ),
    'sales': await rows('SELECT * FROM shop_sales ORDER BY id'),
    'saleLines': await rows('SELECT * FROM shop_sale_lines ORDER BY id'),
    'stockMovements': await rows(
      'SELECT * FROM shop_stock_movements ORDER BY id',
    ),
    'outbox': await rows(
      'SELECT * FROM shop_sync_outbox ORDER BY operation_id',
    ),
    'shifts': await rows('SELECT * FROM shop_cash_shifts ORDER BY id'),
    'shiftSales': await rows(
      'SELECT * FROM shop_cash_shift_sales ORDER BY sale_id',
    ),
    'reversals': await rows('SELECT * FROM shop_sale_reversals ORDER BY id'),
    'reversalLines': await rows(
      'SELECT * FROM shop_sale_reversal_lines ORDER BY id',
    ),
    'authorizationProofs': await rows(
      'SELECT * FROM shop_correction_authorization_proofs ORDER BY receipt_id',
    ),
  };
}

Uint8List _pngBytes() {
  return Uint8List.fromList([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...List<int>.filled(20, 0),
  ]);
}

String _syntheticStaticMmqr({
  List<String> extraFields = const [],
  String? initiationMode = '11',
}) {
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
    if (initiationMode != null) field('01', initiationMode),
    field('26', merchant),
    field('52', '5411'),
    field('53', '104'),
    field('58', 'MM'),
    field('59', 'TEST STORE'),
    field('60', 'Yangon'),
    field('64', language),
    ...extraFields,
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

Future<void> _installSyntheticOutboxAbort(
  ShopDatabase database, {
  required String operationId,
}) async {
  if (!RegExp(r'^[a-z0-9-]+$').hasMatch(operationId)) {
    throw ArgumentError.value(operationId, 'operationId');
  }
  await database.customStatement(
    'CREATE TRIGGER synthetic_sale_outbox_abort '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$operationId' "
    "BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END",
  );
}

Future<Map<String, Object?>> _saleTransactionState(
  ShopDatabase database, {
  required String operationId,
  required String productId,
}) async {
  final sale = await database
      .customSelect(
        'SELECT payment_method, total_mmk FROM shop_sales '
        'WHERE operation_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingleOrNull();
  final saleRows = await database
      .customSelect(
        'SELECT COUNT(*) AS count FROM shop_sales WHERE operation_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingle();
  final saleLines = await database
      .customSelect(
        'SELECT COUNT(*) AS count, MIN(product_id) AS product_id, '
        'MIN(product_name) AS product_name, '
        'MIN(unit_price_mmk) AS unit_price_mmk, MIN(quantity) AS quantity, '
        'MIN(line_total_mmk) AS line_total_mmk '
        'FROM shop_sale_lines WHERE sale_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingle();
  final movements = await database
      .customSelect(
        'SELECT COUNT(*) AS count, SUM(quantity_delta) AS quantity_delta, '
        'MIN(product_id) AS product_id, MIN(reason) AS reason '
        'FROM shop_stock_movements WHERE sale_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingle();
  final outbox = await database
      .customSelect(
        'SELECT COUNT(*) AS count, MIN(event_type) AS event_type, '
        'MIN(payload_json) AS payload_json, MIN(state) AS state '
        'FROM shop_sync_outbox '
        'WHERE operation_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingle();
  final wallet = await database
      .customSelect(
        'SELECT payment_method, request_fingerprint, total_mmk, '
        'merchant_phone, merchant_qr_payload, basket_json, state '
        'FROM shop_wallet_checkout_intents '
        'WHERE operation_id = ?',
        variables: [Variable<String>(operationId)],
      )
      .getSingleOrNull();
  final proofs = await database
      .customSelect(
        'SELECT COUNT(*) AS count '
        'FROM shop_correction_authorization_proofs',
      )
      .getSingle();
  final product = await database
      .customSelect(
        'SELECT on_hand FROM shop_products WHERE id = ?',
        variables: [Variable<String>(productId)],
      )
      .getSingle();
  final outboxPayloadJson = outbox.readNullable<String>('payload_json');
  final outboxPayload = outboxPayloadJson == null
      ? null
      : jsonDecode(outboxPayloadJson) as Map<String, dynamic>;
  final outboxLines = outboxPayload?['lines'] as List<dynamic>?;
  final outboxLine = outboxLines?.single as Map<String, dynamic>?;
  final walletBasketJson = wallet?.read<String>('basket_json');
  final walletBasket = walletBasketJson == null
      ? null
      : jsonDecode(walletBasketJson) as List<dynamic>;
  final walletLine = walletBasket?.single as Map<String, dynamic>?;
  return {
    'sales': saleRows.read<int>('count'),
    'paymentMethod': sale?.read<String>('payment_method'),
    'saleTotalMmk': sale?.read<int>('total_mmk'),
    'saleLines': saleLines.read<int>('count'),
    'lineProductId': saleLines.readNullable<String>('product_id'),
    'lineProductName': saleLines.readNullable<String>('product_name'),
    'lineUnitPriceMmk': saleLines.readNullable<int>('unit_price_mmk'),
    'lineQuantity': saleLines.readNullable<int>('quantity'),
    'lineTotalMmk': saleLines.readNullable<int>('line_total_mmk'),
    'saleMovements': movements.read<int>('count'),
    'movementProductId': movements.readNullable<String>('product_id'),
    'movementDelta': movements.readNullable<int>('quantity_delta'),
    'movementReason': movements.readNullable<String>('reason'),
    'saleOutbox': outbox.read<int>('count'),
    'outboxEventType': outbox.readNullable<String>('event_type'),
    'outboxState': outbox.readNullable<String>('state'),
    'outboxSaleId': outboxPayload?['saleId'],
    'outboxTotalMmk': outboxPayload?['totalMmk'],
    'outboxPaymentMethod': outboxPayload?['paymentMethod'],
    'outboxLineProductId': outboxLine?['productId'],
    'outboxLineProductName': outboxLine?['productName'],
    'outboxLineUnitPriceMmk': outboxLine?['unitPriceMmk'],
    'outboxLineQuantity': outboxLine?['quantity'],
    'outboxLineTotalMmk': outboxLine?['lineTotalMmk'],
    'walletState': wallet?.read<String>('state'),
    'walletPaymentMethod': wallet?.read<String>('payment_method'),
    'walletTotalMmk': wallet?.read<int>('total_mmk'),
    'walletRequestFingerprint': wallet?.read<String>('request_fingerprint'),
    'walletMerchantPhone': wallet?.read<String>('merchant_phone'),
    'walletMerchantQrPayload': wallet?.read<String>('merchant_qr_payload'),
    'walletLineProductId': walletLine?['productId'],
    'walletLineProductName': walletLine?['productName'],
    'walletLineUnitPriceMmk': walletLine?['unitPriceMmk'],
    'walletLineQuantity': walletLine?['quantity'],
    'walletLineTotalMmk': walletLine?['lineTotalMmk'],
    'correctionAuthorityProofs': proofs.read<int>('count'),
    'onHand': product.read<int>('on_hand'),
  };
}
