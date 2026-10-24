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
      );
    });

    tearDown(() async {
      await database.close();
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

      final attached = await _attachTestWorkspace(database);
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
      );
      try {
        await _attachTestWorkspace(source);
        await source.addProduct(
          id: 'clone-replay-product',
          name: 'Clone replay item',
          priceMmk: 2500,
          openingStock: 3,
        );
        await source.openCashShift(
          operationId: 'clone-replay-shift',
          operatorLabel: 'May',
          openingFloatMmk: 10000,
        );
        final sale = await source.recordCashSale(
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
        final receipt = await database.recordCashSale(
          operationId: 'receipt-lines-sale',
          lines: saleLines,
        );
        final replay = await database.recordCashSale(
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
      final shift = await database.openCashShift(
        operationId: 'cash-reversal-shift',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final sale = await database.recordCashSale(
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
        database.closeCashShift(
          shiftId: shift.id,
          operationId: 'cash-reversal-stale-close',
          seenSaleCount: reviewedBeforeReversal.saleCount,
          seenCashTotalMmk: reviewedBeforeReversal.cashSalesTotalMmk,
          countedCashMmk: 10000,
        ),
        throwsA(isA<StateError>()),
      );
      final closed = await database.closeCashShift(
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
      final shift = await database.openCashShift(
        operationId: 'receipt-ttl-shift',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final sale = await database.recordCashSale(
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
        await database.openCashShift(
          operationId: 'expired-proof-shift',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordCashSale(
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
        final shift = await database.openCashShift(
          operationId: 'gross-cap-shift',
          operatorLabel: 'May',
          openingFloatMmk: maximumShiftCashMmk - 1000,
        );
        final sale = await database.recordCashSale(
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
          database.recordCashSale(
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
        final closed = await database.closeCashShift(
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
        final firstShift = await database.openCashShift(
          operationId: 'shift-bound-first-open',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordCashSale(
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
        await database.closeCashShift(
          shiftId: firstShift.id,
          operationId: 'shift-bound-first-close',
          seenSaleCount: firstReview.saleCount,
          seenCashTotalMmk: firstReview.cashSalesTotalMmk,
          countedCashMmk: firstReview.expectedCashMmk,
        );
        final secondShift = await database.openCashShift(
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
      final sale = await database.recordSale(
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

      await database.recordCashSale(
        operationId: 'sale-after-pending-wallet-return',
        lines: lines,
      );
      final shift = await database.openCashShift(
        operationId: 'shift-after-pending-wallet-return',
        operatorLabel: 'May',
        openingFloatMmk: 0,
      );
      final review = await database.readCashShiftReview(shift.id);
      expect(review.expectedCashMmk, 0);
      await database.closeCashShift(
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
      expect(pendingSummary.reversalCount, 1);
      expect(pendingSummary.reversalMmk, 1000);
      expect(pendingSummary.netSalesMmk, 1000);
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
        openingStock: 32,
      );
      await database.recordCashSale(
        operationId: 'tea-receipt',
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );
      for (var i = 0; i < 32; i++) {
        await database.recordCashSale(
          operationId: 'rice-receipt-$i',
          lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
        );
      }

      final first = await database.readRecentSales(limit: 31);
      final second = await database.readRecentSales(limit: 31, offset: 30);
      expect(first, hasLength(31));
      expect(second, hasLength(3));
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
          database.recordSale(
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

        final receipt = await database.recordSale(
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
        await persistentDatabase.recordCashSale(
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

        await persistentDatabase.recordCashSale(
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
          persisted.recordSale(
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
        final receipt = await persisted.recordSale(
          operationId: recovered.operationId,
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          paymentMethod: 'cash',
          expectedTotalMmk: 3000,
        );
        await persisted.close(); // Simulate a crash before widget-state clear.
        persisted = ShopDatabase(NativeDatabase(file));
        expect(await persisted.readCounterSaleDraft(), isNull);
        final replay = await persisted.recordSale(
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
            database.recordCashSale(
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
          await database.recordCashSale(
            operationId: 'customer-b',
            lines: const [ShopSaleLineInput(productId: 'water', quantity: 1)],
          );
          expect(await database.readCounterSaleDraft(), isNull);
          final reopened = await database.reopenHeldSaleTicket('ticket-a');
          expect(reopened.operationId, 'customer-a');
          expect(reopened.quantities, {'tea': 2});
          expect(await database.readHeldSaleTickets(), isEmpty);
          await database.recordCashSale(
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
      final receipt = await database.recordSale(
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

      final replay = await database.recordSale(
        operationId: intent.operationId,
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: intent.operationId,
      );
      expect(replay.id, receipt.id);
      expect(await database.countSales(), 1);
      expect(await database.countOutboxOperations(), beforeOutbox + 1);
      await expectLater(
        database.recordCashSale(
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
        database.recordSale(
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
        database.recordSale(
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
        database.recordSale(
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
        final shift = await database.openCashShift(
          operationId: 'open-at-limit',
          operatorLabel: 'May',
          openingFloatMmk: 200000000000000,
        );
        final outboxCount = await database.countOutboxOperations();
        final movementCount = await database.countStockMovements();
        await expectLater(
          database.recordCashSale(
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
          (await database.closeCashShift(
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
          final shift = await database.openCashShift(
            operationId: 'open-shift-1',
            operatorLabel: 'May',
            openingFloatMmk: 10000,
          );
          expect(
            (await database.openCashShift(
              operationId: 'open-shift-1',
              operatorLabel: 'May',
              openingFloatMmk: 10000,
            )).id,
            shift.id,
          );
          await expectLater(
            database.openCashShift(
              operationId: 'open-shift-1',
              operatorLabel: 'May',
              openingFloatMmk: 9000,
            ),
            throwsA(isA<StateError>()),
          );
          await expectLater(
            database.openCashShift(
              operationId: 'another-open-shift',
              operatorLabel: 'May',
              openingFloatMmk: 0,
            ),
            throwsA(isA<StateError>()),
          );
          await expectLater(
            database.recordCashSale(
              operationId: 'failed-shift-sale',
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 11)],
            ),
            throwsA(isA<StateError>()),
          );
          expect((await database.readCashShiftReview(shift.id)).saleCount, 0);
          expect(await database.countSales(), 0);
          const cashLines = [ShopSaleLineInput(productId: 'tea', quantity: 2)];
          await database.recordCashSale(
            operationId: 'cash-shift-1',
            lines: cashLines,
          );
          await database.recordCashSale(
            operationId: 'cash-shift-1',
            lines: cashLines,
          );
          final firstReview = await database.readCashShiftReview(shift.id);
          expect(firstReview.cashSalesCount, 1);
          expect(firstReview.cashSalesTotalMmk, 5000);
          expect(firstReview.expectedCashMmk, 15000);
          expect(firstReview.walletSalesCount, 0);

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
            database.closeCashShift(
              shiftId: shift.id,
              operationId: 'close-pending',
              seenSaleCount: 1,
              seenCashTotalMmk: 5000,
              countedCashMmk: 15000,
            ),
            throwsA(isA<StateError>()),
          );
          await database.recordSale(
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
          expect(review.expectedCashMmk, 15000);
          await expectLater(
            database.closeCashShift(
              shiftId: shift.id,
              operationId: 'close-stale',
              seenSaleCount: firstReview.saleCount,
              seenCashTotalMmk: firstReview.cashSalesTotalMmk,
              countedCashMmk: 15000,
            ),
            throwsA(isA<StateError>()),
          );
          final closed = await database.closeCashShift(
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
            (await database.closeCashShift(
              shiftId: shift.id,
              operationId: 'close-shift-1',
              seenSaleCount: review.saleCount,
              seenCashTotalMmk: review.cashSalesTotalMmk,
              countedCashMmk: 14900,
            )).differenceMmk,
            -100,
          );
          await expectLater(
            database.closeCashShift(
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
          final next = await database.openCashShift(
            operationId: 'open-shift-2',
            operatorLabel: 'May',
            openingFloatMmk: 0,
          );
          await database.recordCashSale(
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
          database.openCashShift(
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
          (await database.openCashShift(
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
        await database.recordCashSale(
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
        await database.customStatement('DROP TABLE shop_cash_shift_sales');
        await database.customStatement('DROP TABLE shop_cash_shifts');
        await database.customStatement('PRAGMA user_version = 5');
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        final shift = await database.openCashShift(
          operationId: 'after-upgrade',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        expect((await database.readCashShiftReview(shift.id)).saleCount, 0);
        await database.recordCashSale(
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
        await database.closeCashShift(
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
          (await database.closeCashShift(
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
        await tester.enterText(find.byType(TextField).last, '10000');
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
          await database.recordCashSale(
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
        await database.recordCashSale(
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
        );
        expect(await settings.readPaperWidth(), ReceiptPaperWidth.mm80);
        expect(ReceiptPaperWidth.mm58.paperSize.widthPixels, 384);
        expect(ReceiptPaperWidth.mm80.paperSize.widthPixels, 576);
        expect(ReceiptPaperWidth.mm58.sendCutCommand, isFalse);
        expect(ReceiptPaperWidth.mm80.sendCutCommand, isTrue);

        final printer = (await PrinterDiscoveryService(
          rangeProvider: () async => range,
          probe: (host, port) async => host == '192.168.20.9',
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
      );
      final sent = <String>[];
      final reprint = ReceiptReprintService(
        settings: settings,
        send: (host, receipt, myanmar) async {
          sent.add('$host:${receipt.id}:$myanmar');
        },
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
      ).scan()).printers.single;
      await settings.saveAfterTest(candidate);
      expect(await reprint.printIfTrusted(receipt, myanmar: true), isTrue);
      expect(sent, ['192.168.20.9:sale-for-reprint:true']);

      final afterRestart = ReceiptReprintService(
        settings: ReceiptPrinterSettings(
          rangeProvider: () async => range,
          session: VerifiedPrinterSession(),
        ),
        send: (host, receipt, myanmar) async {
          sent.add('unexpected');
        },
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
      );
      expect(await settings.readSavedHost(), '192.168.20.9');
      expect(await settings.readHost(), isNull);

      final discovery = PrinterDiscoveryService(
        rangeProvider: () async => range,
        probe: (host, port) async => host == '192.168.20.9',
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
