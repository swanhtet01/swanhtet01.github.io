import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_operational_export.dart';

void main() {
  const exporter = ShopOperationalExporter();

  test('encodes the exact deterministic reference golden', () {
    final first = exporter.encode(_fixture());
    final second = exporter.encode(_fixture());

    expect(first.bytes, second.bytes);
    expect(
      sha256.convert(first.bytes).toString(),
      'ac6b761b6401cbc004293012d8f8452d2e30f055bb19325f240982284f0cd778',
    );
    expect(first.bytes.length, 6129);
    expect(first.rows.length, 13);
    expect(first.rows.map((row) => row['row_type']), [
      'shift_summary',
      'sale',
      'sale_line',
      'stock_movement',
      'sale',
      'sale_line',
      'stock_movement',
      'reversal',
      'reversal_line',
      'stock_movement',
      'reversal',
      'reversal_line',
      'wallet_reconciliation',
    ]);
    expect(first.rows.first, containsPair('gross_sales_mmk', 8000));
    expect(first.rows.first, containsPair('reversal_total_mmk', 8000));
    expect(first.rows.first, containsPair('net_sales_mmk', 0));
    expect(first.rows.first, containsPair('pending_wallet_count', 1));
    expect(first.rows.first, containsPair('pending_wallet_mmk', 3000));
  });

  test('uses UTF-8 BOM, quoted RFC4180 CRLF, Burmese and leading-zero IDs', () {
    final bytes = exporter.encode(_fixture()).bytes;
    final source = utf8.decode(bytes);
    final rows = _parseCsv(source);

    expect(bytes.take(3), [0xef, 0xbb, 0xbf]);
    expect(source.startsWith('"contract_version"'), isTrue);
    expect(source.endsWith('\r\n'), isTrue);
    expect('\r\n'.allMatches(source).length, 14);
    expect(rows.first, shopOperationalExportHeaders);
    expect(rows, hasLength(14));
    final name = shopOperationalExportHeaders.indexOf('product_name');
    final product = shopOperationalExportHeaders.indexOf('product_id');
    expect(rows.any((row) => row[name] == 'လက်ဖက်၊ "အထူး"\nထုပ်'), isTrue);
    expect(
      rows.any((row) => row[name] == '\' =SUM(1,2), "အန္တရာယ်"\nနောက်တန်း'),
      isTrue,
    );
    expect(rows.any((row) => row[product] == "'0099999999999"), isTrue);
  });

  test('defends all spreadsheet prefixes and rejects hidden controls', () {
    for (final value in [
      '=SUM(1,1)',
      '+cmd',
      '-cmd',
      '@cmd',
      '  =cmd',
      '\t=cmd',
      '\r+cmd',
      '\n-cmd',
      '0099999999999',
    ]) {
      expect(shopOperationalSpreadsheetSafeText(value), "'$value");
    }
    expect(shopOperationalSpreadsheetSafeText('လက်ဖက်ရည်'), 'လက်ဖက်ရည်');
    expect(
      () => shopOperationalSpreadsheetSafeText('safe\u0000unsafe'),
      throwsA(_code('reference_text_control_invalid')),
    );
    expect(
      () => shopOperationalSpreadsheetSafeText('safe\u000bunsafe'),
      throwsA(_code('reference_text_control_invalid')),
    );
  });

  test('formats Yangon +06:30 across the UTC date boundary', () {
    expect(
      shopOperationalYangonTimestamp(1792864200000),
      '2026-10-25T00:20:00.000+06:30',
    );
    expect(
      shopOperationalYangonTimestamp(1792866000000),
      '2026-10-25T00:50:00.000+06:30',
    );
  });

  test(
    'wallet outcomes remain merchant-recorded and late outcomes stay pending',
    () {
      final reconciliation = const ShopOperationalWalletReconciliation(
        id: '000400',
        reversalId: '000201',
        outcome: ShopOperationalWalletOutcome.paymentNotReceived,
        evidenceReference: '@merchant-note',
        actorLabel: 'Owner',
        createdAtMillis: 1792865760000,
      );
      final reconciled = exporter.encode(
        _fixture(walletReconciliations: [reconciliation]),
      );
      final wallet = reconciled.rows.singleWhere(
        (row) => row['row_type'] == 'wallet_reconciliation',
      );
      expect(wallet['wallet_state'], 'merchant_recorded_payment_not_received');
      expect(wallet['evidence_reference'], '@merchant-note');
      expect(reconciled.rows.first['pending_wallet_count'], 0);

      final late = exporter.encode(
        _fixture(
          walletReconciliations: [
            const ShopOperationalWalletReconciliation(
              id: '000400',
              reversalId: '000201',
              outcome: ShopOperationalWalletOutcome.moneyReturned,
              evidenceReference: 'merchant note',
              actorLabel: 'Owner',
              createdAtMillis: 1792866000001,
            ),
          ],
        ),
      );
      expect(
        late.rows.singleWhere(
          (row) => row['row_type'] == 'wallet_reconciliation',
        )['wallet_state'],
        'external_reconciliation_pending',
      );
      final csv = utf8.decode(reconciled.bytes).toLowerCase();
      expect(csv, isNot(contains('provider_verified')));
      expect(csv, isNot(contains('settled')));
      expect(csv, isNot(contains('refunded')));
    },
  );

  test(
    'exports an independent reconciliation for an older wallet reversal',
    () {
      final older = _walletReversal(
        id: '000199',
        saleId: '000099',
        createdAtMillis: 1792864199000,
        totalMmk: 1200,
      );
      final result = exporter.encode(
        _fixture(
          reversals: [..._reversals, older],
          walletReconciliations: const [
            ShopOperationalWalletReconciliation(
              id: '000399',
              reversalId: '000199',
              outcome: ShopOperationalWalletOutcome.moneyReturned,
              evidenceReference: 'merchant note',
              actorLabel: 'Owner',
              createdAtMillis: 1792865300000,
            ),
          ],
        ),
      );
      final event = result.rows.singleWhere(
        (row) => row['event_id'] == '000399',
      );
      expect(event['wallet_state'], 'merchant_recorded_money_returned');
      expect(event['amount_mmk'], 1200);
      expect(result.rows.first['reversal_total_mmk'], 8000);
    },
  );

  test(
    'permits signed negative net activity for correction of an older sale',
    () {
      final result = exporter.encode(
        _fixture(
          shift: _shift(
            cashSalesCount: 0,
            cashSalesTotalMmk: 0,
            walletSalesCount: 0,
            walletSalesTotalMmk: 0,
            expectedCashMmk: 5000,
            countedCashMmk: 5000,
            cashDrawerOutflowMmk: 5000,
          ),
          sales: const [],
          reversals: [_reversals.first],
          stockMovements: [_movements.last],
        ),
      );
      expect(result.rows.first['gross_sales_mmk'], 0);
      expect(result.rows.first['reversal_total_mmk'], 5000);
      expect(result.rows.first['net_sales_mmk'], -5000);
      expect(utf8.decode(result.bytes), contains('"-5000"'));
    },
  );

  test('schema and output exclude private and authorization internals', () {
    const forbiddenHeaders = [
      'merchant_phone',
      'official_qr_payload',
      'request_fingerprint',
      'payload_json',
      'authorization_receipt_id',
      'authorization_receipt_digest',
      'authorization_command_digest',
      'authorization_workspace_id',
      'authorized_actor_id',
      'signature',
      'private_key',
      'session_token',
      'contact_email',
    ];
    for (final header in forbiddenHeaders) {
      expect(shopOperationalExportHeaders, isNot(contains(header)));
    }
    final csv = utf8.decode(exporter.encode(_fixture()).bytes);
    expect(csv, isNot(contains('PRIVATE-RECEIPT-MUST-NOT-EXPORT')));
    expect(csv, isNot(contains('PRIVATE-SIGNATURE-MUST-NOT-EXPORT')));
  });

  test('rejects MMK overflow and inconsistent sale arithmetic', () {
    expect(
      () => exporter.encode(
        _fixture(shift: _shift(openingFloatMmk: 200000000000001)),
      ),
      throwsA(_code('reference_shift_openingFloatMmk_invalid')),
    );
    final badLine = ShopOperationalSaleLine(
      id: _sales.first.lines.first.id,
      productId: _sales.first.lines.first.productId,
      productName: _sales.first.lines.first.productName,
      quantity: 2,
      unitPriceMmk: 2500,
      lineTotalMmk: 4999,
    );
    expect(
      () => exporter.encode(
        _fixture(
          sales: [
            ShopOperationalSale(
              id: '000100',
              paymentMethod: ShopOperationalPaymentMethod.cash,
              totalMmk: 5000,
              createdAtMillis: 1792864800000,
              lines: [badLine],
            ),
            _sales.last,
          ],
        ),
      ),
      throwsA(_code('reference_sale_line_arithmetic_invalid')),
    );
    expect(
      () => exporter.encode(_fixture(shift: _shift(expectedCashMmk: 9999))),
      throwsA(_code('reference_shift_reconciliation_invalid')),
    );
  });

  test('requires closed shift and in-window operational events', () {
    expect(
      () => exporter.encode(_fixture(shift: _shift(isClosed: false))),
      throwsA(_code('reference_closed_shift_required')),
    );
    expect(
      () => exporter.encode(
        _fixture(
          stockMovements: [
            const ShopOperationalStockMovement(
              id: '000300',
              saleId: '000100',
              productId: '0099999999999',
              quantityDelta: -2,
              reason: 'sale',
              createdAtMillis: 1792864199999,
            ),
          ],
        ),
      ),
      throwsA(_code('reference_stock_movement_outside_shift_window')),
    );
  });

  test('rejects missing/control text and duplicate event identities', () {
    final missingReason = ShopOperationalReversal(
      id: _reversals.first.id,
      saleId: _reversals.first.saleId,
      originalPaymentMethod: _reversals.first.originalPaymentMethod,
      originalTotalMmk: _reversals.first.originalTotalMmk,
      cashDrawerDeltaMmk: _reversals.first.cashDrawerDeltaMmk,
      reason: '',
      authorizedActorLabel: _reversals.first.authorizedActorLabel,
      createdAtMillis: _reversals.first.createdAtMillis,
      lines: _reversals.first.lines,
    );
    expect(
      () => exporter.encode(
        _fixture(reversals: [missingReason, _reversals.last]),
      ),
      throwsA(_code('reference_reversal_reason_invalid')),
    );
    expect(
      () => exporter.encode(
        _fixture(stockMovements: [..._movements, _movements.first]),
      ),
      throwsA(_code('reference_event_id_duplicate')),
    );
  });

  test('enforces full restock, exact cash effect and wallet uniqueness', () {
    expect(
      () => exporter.encode(
        _fixture(
          reversals: [_cashReversal(restockQuantity: 1), _reversals.last],
        ),
      ),
      throwsA(_code('reference_reversal_restock_invalid')),
    );
    expect(
      () => exporter.encode(
        _fixture(
          reversals: [
            _cashReversal(cashDrawerDeltaMmk: -4999),
            _reversals.last,
          ],
        ),
      ),
      throwsA(_code('reference_reversal_cash_effect_invalid')),
    );
    const one = ShopOperationalWalletReconciliation(
      id: '000400',
      reversalId: '000201',
      outcome: ShopOperationalWalletOutcome.moneyReturned,
      evidenceReference: 'one',
      actorLabel: 'Owner',
      createdAtMillis: 1792865760000,
    );
    const two = ShopOperationalWalletReconciliation(
      id: '000401',
      reversalId: '000201',
      outcome: ShopOperationalWalletOutcome.paymentNotReceived,
      evidenceReference: 'two',
      actorLabel: 'Owner',
      createdAtMillis: 1792865820000,
    );
    expect(
      () => exporter.encode(_fixture(walletReconciliations: [one, two])),
      throwsA(_code('reference_wallet_reversal_duplicate')),
    );
  });

  test('rejects reconciliation before the underlying reversal', () {
    expect(
      () => exporter.encode(
        _fixture(
          walletReconciliations: const [
            ShopOperationalWalletReconciliation(
              id: '000400',
              reversalId: '000201',
              outcome: ShopOperationalWalletOutcome.moneyReturned,
              evidenceReference: 'early',
              actorLabel: 'Owner',
              createdAtMillis: 1792865699999,
            ),
          ],
        ),
      ),
      throwsA(_code('reference_wallet_reconciliation_time_invalid')),
    );
  });

  test(
    'English and Burmese previews share totals and disclose readable CSV',
    () {
      final en = exporter.preview(_fixture(), ShopOperationalPreviewLocale.en);
      final my = exporter.preview(_fixture(), ShopOperationalPreviewLocale.my);
      for (final values in [en.values, my.values]) {
        expect(values.grossMmk, 8000);
        expect(values.reversalMmk, 8000);
        expect(values.netMmk, 0);
        expect(values.cashReversalCount, 1);
        expect(values.cashReversalMmk, 5000);
        expect(values.expectedCashMmk, 10000);
        expect(values.countedCashMmk, 10000);
        expect(values.differenceMmk, 0);
        expect(values.pendingWalletCount, 1);
        expect(values.pendingWalletMmk, 3000);
      }
      expect(en.labels.warning, 'Readable local file — not encrypted.');
      expect(my.labels.warning, 'ဖတ်ရှုနိုင်သော စက်တွင်းဖိုင် — စာဝှက်မထားပါ။');
      expect(my.labels.pendingWallet.toLowerCase(), isNot(contains('wallet')));
      expect(en.labels.title, isNot(my.labels.title));
    },
  );

  test(
    'models and encoder are independent of database, filesystem and network',
    () {
      expect(
        shopOperationalExportContract,
        'supermega.shop.operational-csv.reference.v1',
      );
      expect(
        shopOperationalExportDataScope,
        'device_local_closed_shift_event_window',
      );
      expect(shopOperationalExportHeaders, hasLength(40));
    },
  );
}

Matcher _code(String code) =>
    isA<StateError>().having((error) => error.message, 'message', code);

ShopOperationalSnapshot _fixture({
  ShopOperationalShift? shift,
  List<ShopOperationalSale>? sales,
  List<ShopOperationalReversal>? reversals,
  List<ShopOperationalWalletReconciliation>? walletReconciliations,
  List<ShopOperationalStockMovement>? stockMovements,
}) => ShopOperationalSnapshot(
  shift: shift ?? _shift(),
  sales: sales ?? _sales,
  reversals: reversals ?? _reversals,
  walletReconciliations: walletReconciliations ?? const [],
  stockMovements: stockMovements ?? _movements,
);

ShopOperationalShift _shift({
  int openingFloatMmk = 10000,
  int cashSalesCount = 1,
  int cashSalesTotalMmk = 5000,
  int walletSalesCount = 1,
  int walletSalesTotalMmk = 3000,
  int expectedCashMmk = 10000,
  int countedCashMmk = 10000,
  int cashDrawerOutflowMmk = 5000,
  bool isClosed = true,
}) => ShopOperationalShift(
  id: '000042',
  operatorLabel: '  =HYPERLINK("https://invalid.example")',
  openingFloatMmk: openingFloatMmk,
  openedAtMillis: 1792864200000,
  closedAtMillis: 1792866000000,
  cashSalesCount: cashSalesCount,
  cashSalesTotalMmk: cashSalesTotalMmk,
  walletSalesCount: walletSalesCount,
  walletSalesTotalMmk: walletSalesTotalMmk,
  cashReversalCount: 1,
  cashReversalTotalMmk: 5000,
  expectedCashMmk: expectedCashMmk,
  countedCashMmk: countedCashMmk,
  differenceMmk: countedCashMmk - expectedCashMmk,
  cashDrawerOutflowMmk: cashDrawerOutflowMmk,
  isClosed: isClosed,
);

const _sales = <ShopOperationalSale>[
  ShopOperationalSale(
    id: '000100',
    paymentMethod: ShopOperationalPaymentMethod.cash,
    totalMmk: 5000,
    createdAtMillis: 1792864800000,
    lines: [
      ShopOperationalSaleLine(
        id: '000100-1',
        productId: '0099999999999',
        productName: 'လက်ဖက်၊ "အထူး"\nထုပ်',
        quantity: 2,
        unitPriceMmk: 2500,
        lineTotalMmk: 5000,
      ),
    ],
  ),
  ShopOperationalSale(
    id: '000101',
    paymentMethod: ShopOperationalPaymentMethod.kbzpay,
    totalMmk: 3000,
    createdAtMillis: 1792865100000,
    lines: [
      ShopOperationalSaleLine(
        id: '000101-1',
        productId: '000002',
        productName: ' =SUM(1,2), "အန္တရာယ်"\nနောက်တန်း',
        quantity: 1,
        unitPriceMmk: 3000,
        lineTotalMmk: 3000,
      ),
    ],
  ),
];

final _reversals = <ShopOperationalReversal>[
  _cashReversal(),
  _walletReversal(
    id: '000201',
    saleId: '000101',
    createdAtMillis: 1792865700000,
    totalMmk: 3000,
  ),
];

ShopOperationalReversal _cashReversal({
  int cashDrawerDeltaMmk = -5000,
  int restockQuantity = 2,
}) => ShopOperationalReversal(
  id: '000200',
  saleId: '000100',
  originalPaymentMethod: ShopOperationalPaymentMethod.cash,
  originalTotalMmk: 5000,
  cashDrawerDeltaMmk: cashDrawerDeltaMmk,
  reason: '+မှားယွင်းသော ရောင်းချမှု',
  authorizedActorLabel: 'Owner, "မသီတာ"',
  createdAtMillis: 1792865400000,
  lines: [
    ShopOperationalReversalLine(
      id: '000200-1',
      productId: '0099999999999',
      productName: 'လက်ဖက်၊ "အထူး"\nထုပ်',
      quantity: 2,
      unitPriceMmk: 2500,
      lineTotalMmk: 5000,
      restockQuantity: restockQuantity,
    ),
  ],
);

ShopOperationalReversal _walletReversal({
  required String id,
  required String saleId,
  required int createdAtMillis,
  required int totalMmk,
}) => ShopOperationalReversal(
  id: id,
  saleId: saleId,
  originalPaymentMethod: ShopOperationalPaymentMethod.kbzpay,
  originalTotalMmk: totalMmk,
  cashDrawerDeltaMmk: 0,
  reason: id == '000201' ? '@wallet-review' : 'earlier shift correction',
  authorizedActorLabel: 'Owner',
  createdAtMillis: createdAtMillis,
  lines: [
    ShopOperationalReversalLine(
      id: '$id-1',
      productId: id == '000201' ? '000002' : '000009',
      productName: id == '000201'
          ? ' =SUM(1,2), "အန္တရာယ်"\nနောက်တန်း'
          : 'Earlier item',
      quantity: 1,
      unitPriceMmk: totalMmk,
      lineTotalMmk: totalMmk,
      restockQuantity: 0,
    ),
  ],
);

const _movements = <ShopOperationalStockMovement>[
  ShopOperationalStockMovement(
    id: '000300',
    saleId: '000100',
    productId: '0099999999999',
    quantityDelta: -2,
    reason: 'sale',
    createdAtMillis: 1792864800000,
  ),
  ShopOperationalStockMovement(
    id: '000301',
    saleId: '000101',
    productId: '000002',
    quantityDelta: -1,
    reason: 'sale',
    createdAtMillis: 1792865100000,
  ),
  ShopOperationalStockMovement(
    id: '000302',
    saleId: '000100',
    productId: '0099999999999',
    quantityDelta: 2,
    reason: 'sale_reversal_restock',
    createdAtMillis: 1792865400000,
  ),
];

List<List<String>> _parseCsv(String source) {
  final rows = <List<String>>[];
  var row = <String>[];
  var field = '';
  var quoted = false;
  for (var index = 0; index < source.length; index++) {
    final char = source[index];
    if (quoted) {
      if (char == '"' &&
          index + 1 < source.length &&
          source[index + 1] == '"') {
        field += '"';
        index++;
      } else if (char == '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char == '"') {
      quoted = true;
    } else if (char == ',') {
      row.add(field);
      field = '';
    } else if (char == '\r' &&
        index + 1 < source.length &&
        source[index + 1] == '\n') {
      row.add(field);
      rows.add(row);
      row = <String>[];
      field = '';
      index++;
    } else {
      fail(
        'unexpected CSV character $char at $index near '
        '${source.substring(index > 4 ? index - 4 : 0, index + 5)}',
      );
    }
  }
  expect(quoted, isFalse);
  expect(field, isEmpty);
  expect(row, isEmpty);
  return rows;
}
