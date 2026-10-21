import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

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

void main() {
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
      database = ShopDatabase(NativeDatabase.memory());
    });

    tearDown(() async {
      await database.close();
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
        expect(printLines, contains('လက်ဖက်ရည် x2'));
        expect(printLines, contains('စုစုပေါင်း: 5,000 MMK'));
        expect(printLines, contains('ငွေပေးချေမှု: CASH'));
      },
    );

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
        expect(find.text('Expected from recorded sales'), findsOneWidget);
        await tester.enterText(find.byType(TextField).last, '10000');
        await tester.tap(find.text('Close shift'));
        await tester.pumpAndSettle();
        await tester.drag(find.byType(ListView), const Offset(0, -400));
        await tester.pumpAndSettle();
        expect(find.text('Last closed shift'), findsOneWidget);
        expect(find.text('Expected from recorded sales'), findsOneWidget);
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
