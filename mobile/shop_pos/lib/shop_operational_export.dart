import 'dart:convert';
import 'dart:typed_data';

const shopOperationalExportContract =
    'supermega.shop.operational-csv.reference.v1';
const shopOperationalExportDataScope = 'device_local_closed_shift_event_window';
const _maxMmk = 200000000000000;
const _maxSafeInteger = 9007199254740991;

const shopOperationalExportHeaders = <String>[
  'contract_version',
  'data_scope',
  'row_type',
  'shift_id',
  'shift_opened_at_epoch_ms',
  'shift_opened_at_yangon',
  'shift_closed_at_epoch_ms',
  'shift_closed_at_yangon',
  'event_id',
  'occurred_at_epoch_ms',
  'occurred_at_yangon',
  'sale_id',
  'payment_method',
  'product_id',
  'product_name',
  'quantity',
  'unit_price_mmk',
  'amount_mmk',
  'stock_delta',
  'reason',
  'actor_label',
  'restock_quantity',
  'wallet_state',
  'evidence_reference',
  'opening_float_mmk',
  'cash_sales_count',
  'cash_sales_total_mmk',
  'wallet_sales_count',
  'wallet_sales_total_mmk',
  'cash_reversal_count',
  'cash_reversal_total_mmk',
  'gross_sales_mmk',
  'reversal_total_mmk',
  'net_sales_mmk',
  'cash_drawer_outflow_mmk',
  'cash_movement_count',
  'cash_in_total_mmk',
  'cash_out_total_mmk',
  'expected_cash_mmk',
  'counted_cash_mmk',
  'difference_mmk',
  'pending_wallet_count',
  'pending_wallet_mmk',
];

enum ShopOperationalPaymentMethod { cash, kbzpay, wavepay }

enum ShopOperationalWalletOutcome { moneyReturned, paymentNotReceived }

enum ShopOperationalPreviewLocale { en, my }

final class ShopOperationalShift {
  const ShopOperationalShift({
    required this.id,
    required this.operatorLabel,
    required this.openingFloatMmk,
    required this.openedAtMillis,
    required this.closedAtMillis,
    required this.cashSalesCount,
    required this.cashSalesTotalMmk,
    required this.walletSalesCount,
    required this.walletSalesTotalMmk,
    required this.cashReversalCount,
    required this.cashReversalTotalMmk,
    required this.expectedCashMmk,
    required this.countedCashMmk,
    required this.differenceMmk,
    required this.cashDrawerOutflowMmk,
    this.cashMovementCount = 0,
    this.cashInTotalMmk = 0,
    this.cashOutTotalMmk = 0,
    this.isClosed = true,
  });

  final String id;
  final String operatorLabel;
  final int openingFloatMmk;
  final int openedAtMillis;
  final int closedAtMillis;
  final int cashSalesCount;
  final int cashSalesTotalMmk;
  final int walletSalesCount;
  final int walletSalesTotalMmk;
  final int cashReversalCount;
  final int cashReversalTotalMmk;
  final int expectedCashMmk;
  final int countedCashMmk;
  final int differenceMmk;
  final int cashDrawerOutflowMmk;
  final int cashMovementCount;
  final int cashInTotalMmk;
  final int cashOutTotalMmk;
  final bool isClosed;
}

final class ShopOperationalSaleLine {
  const ShopOperationalSaleLine({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPriceMmk,
    required this.lineTotalMmk,
  });

  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final int unitPriceMmk;
  final int lineTotalMmk;
}

final class ShopOperationalSale {
  const ShopOperationalSale({
    required this.id,
    required this.paymentMethod,
    required this.totalMmk,
    required this.createdAtMillis,
    required this.lines,
  });

  final String id;
  final ShopOperationalPaymentMethod paymentMethod;
  final int totalMmk;
  final int createdAtMillis;
  final List<ShopOperationalSaleLine> lines;
}

final class ShopOperationalReversalLine {
  const ShopOperationalReversalLine({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPriceMmk,
    required this.lineTotalMmk,
    required this.restockQuantity,
  });

  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final int unitPriceMmk;
  final int lineTotalMmk;
  final int restockQuantity;
}

final class ShopOperationalReversal {
  const ShopOperationalReversal({
    required this.id,
    required this.saleId,
    required this.originalPaymentMethod,
    required this.originalTotalMmk,
    required this.cashDrawerDeltaMmk,
    required this.reason,
    required this.authorizedActorLabel,
    required this.createdAtMillis,
    required this.lines,
  });

  final String id;
  final String saleId;
  final ShopOperationalPaymentMethod originalPaymentMethod;
  final int originalTotalMmk;
  final int cashDrawerDeltaMmk;
  final String reason;
  final String authorizedActorLabel;
  final int createdAtMillis;
  final List<ShopOperationalReversalLine> lines;
}

final class ShopOperationalWalletReconciliation {
  const ShopOperationalWalletReconciliation({
    required this.id,
    required this.reversalId,
    required this.outcome,
    required this.evidenceReference,
    required this.actorLabel,
    required this.createdAtMillis,
  });

  final String id;
  final String reversalId;
  final ShopOperationalWalletOutcome outcome;
  final String evidenceReference;
  final String actorLabel;
  final int createdAtMillis;
}

final class ShopOperationalStockMovement {
  const ShopOperationalStockMovement({
    required this.id,
    required this.productId,
    required this.quantityDelta,
    required this.reason,
    required this.createdAtMillis,
    this.saleId,
  });

  final String id;
  final String? saleId;
  final String productId;
  final int quantityDelta;
  final String reason;
  final int createdAtMillis;
}

final class ShopOperationalCashMovement {
  const ShopOperationalCashMovement({
    required this.id,
    required this.kind,
    required this.amountMmk,
    required this.reason,
    required this.actorLabel,
    required this.createdAtMillis,
  });

  final String id;
  final String kind;
  final int amountMmk;
  final String reason;
  final String actorLabel;
  final int createdAtMillis;
}

final class ShopOperationalSnapshot {
  const ShopOperationalSnapshot({
    required this.shift,
    this.sales = const [],
    this.reversals = const [],
    this.walletReconciliations = const [],
    this.stockMovements = const [],
    this.cashMovements = const [],
  });

  final ShopOperationalShift shift;
  final List<ShopOperationalSale> sales;
  final List<ShopOperationalReversal> reversals;
  final List<ShopOperationalWalletReconciliation> walletReconciliations;
  final List<ShopOperationalStockMovement> stockMovements;
  final List<ShopOperationalCashMovement> cashMovements;
}

final class ShopOperationalPreviewLabels {
  const ShopOperationalPreviewLabels({
    required this.title,
    required this.gross,
    required this.reversals,
    required this.net,
    required this.expected,
    required this.counted,
    required this.difference,
    required this.pendingWallet,
    required this.warning,
  });

  final String title;
  final String gross;
  final String reversals;
  final String net;
  final String expected;
  final String counted;
  final String difference;
  final String pendingWallet;
  final String warning;
}

final class ShopOperationalPreviewValues {
  const ShopOperationalPreviewValues({
    required this.grossMmk,
    required this.reversalMmk,
    required this.netMmk,
    required this.cashReversalCount,
    required this.cashReversalMmk,
    required this.expectedCashMmk,
    required this.countedCashMmk,
    required this.differenceMmk,
    required this.pendingWalletCount,
    required this.pendingWalletMmk,
  });

  final int grossMmk;
  final int reversalMmk;
  final int netMmk;
  final int cashReversalCount;
  final int cashReversalMmk;
  final int expectedCashMmk;
  final int countedCashMmk;
  final int differenceMmk;
  final int pendingWalletCount;
  final int pendingWalletMmk;
}

final class ShopOperationalPreview {
  const ShopOperationalPreview({
    required this.locale,
    required this.labels,
    required this.values,
  });

  final ShopOperationalPreviewLocale locale;
  final ShopOperationalPreviewLabels labels;
  final ShopOperationalPreviewValues values;
}

final class ShopOperationalExport {
  ShopOperationalExport({
    required Uint8List bytes,
    required List<Map<String, Object?>> rows,
  }) : bytes = Uint8List.fromList(bytes),
       rows = List.unmodifiable(
         rows.map((row) => Map<String, Object?>.unmodifiable(row)),
       );

  final Uint8List bytes;
  final List<Map<String, Object?>> rows;
}

final class ShopOperationalExporter {
  const ShopOperationalExporter();

  ShopOperationalExport encode(ShopOperationalSnapshot snapshot) {
    final rows = buildRows(snapshot);
    final header = shopOperationalExportHeaders.map(_quoted).join(',');
    final body = rows.map(
      (row) => shopOperationalExportHeaders
          .map((header) => _csvCell(row[header], header))
          .join(','),
    );
    return ShopOperationalExport(
      bytes: Uint8List.fromList(
        utf8.encode('\uFEFF${[header, ...body].join('\r\n')}\r\n'),
      ),
      rows: rows,
    );
  }

  List<Map<String, Object?>> buildRows(ShopOperationalSnapshot snapshot) {
    final shift = snapshot.shift;
    if (!shift.isClosed) _fail('reference_closed_shift_required');
    _text(shift.id, 'shift_id');
    _text(shift.operatorLabel, 'operator_label');
    _integer(shift.openedAtMillis, 'shift_opened_at', minimum: 0);
    _integer(
      shift.closedAtMillis,
      'shift_closed_at',
      minimum: shift.openedAtMillis,
    );
    _money(shift.openingFloatMmk, 'shift_openingFloatMmk');
    _money(shift.cashSalesTotalMmk, 'shift_cashSalesTotalMmk');
    _money(shift.walletSalesTotalMmk, 'shift_walletSalesTotalMmk');
    _money(shift.expectedCashMmk, 'shift_expectedCashMmk');
    _money(shift.countedCashMmk, 'shift_countedCashMmk');
    _money(shift.cashDrawerOutflowMmk, 'shift_cashDrawerOutflowMmk');
    _integer(shift.cashMovementCount, 'shift_cash_movement_count', minimum: 0);
    _money(shift.cashInTotalMmk, 'shift_cash_in_total');
    _money(shift.cashOutTotalMmk, 'shift_cash_out_total');
    _integer(
      shift.differenceMmk,
      'shift_difference',
      minimum: -_maxMmk,
      maximum: _maxMmk,
    );
    _integer(shift.cashSalesCount, 'shift_cash_count', minimum: 0);
    _integer(shift.walletSalesCount, 'shift_wallet_count', minimum: 0);
    _integer(shift.cashReversalCount, 'shift_cash_reversal_count', minimum: 0);
    _money(shift.cashReversalTotalMmk, 'shift_cash_reversal_total');

    final events = <Map<String, Object?>>[];
    var gross = 0;
    for (final sale in snapshot.sales) {
      _text(sale.id, 'sale_id');
      if (!_inWindow(shift, sale.createdAtMillis)) {
        _fail('reference_linked_sale_outside_shift_window');
      }
      _money(sale.totalMmk, 'sale_total');
      var lineTotal = 0;
      for (final line in sale.lines) {
        _validateSaleLine(line);
        lineTotal += line.lineTotalMmk;
      }
      if (lineTotal != sale.totalMmk) _fail('reference_sale_total_invalid');
      gross += sale.totalMmk;
      events.add({
        ..._baseRow(shift, 'sale', sale.id, sale.createdAtMillis),
        'sale_id': sale.id,
        'payment_method': sale.paymentMethod.name,
        'amount_mmk': sale.totalMmk,
      });
      for (final line in sale.lines) {
        events.add({
          ..._baseRow(shift, 'sale_line', line.id, sale.createdAtMillis),
          'sale_id': sale.id,
          'payment_method': sale.paymentMethod.name,
          'product_id': line.productId,
          'product_name': line.productName,
          'quantity': line.quantity,
          'unit_price_mmk': line.unitPriceMmk,
          'amount_mmk': line.lineTotalMmk,
        });
      }
    }

    var reversalTotal = 0;
    var cashDrawerOutflow = 0;
    var pendingWalletCount = 0;
    var pendingWalletMmk = 0;
    final reversalById = <String, ShopOperationalReversal>{};
    final reconciliationIds = <String>{};
    final reconciliationByReversal =
        <String, ShopOperationalWalletReconciliation>{};
    for (final reconciliation in snapshot.walletReconciliations) {
      _text(reconciliation.id, 'wallet_reconciliation_id');
      _text(reconciliation.reversalId, 'wallet_reconciliation_reversal_id');
      _text(reconciliation.evidenceReference, 'wallet_reconciliation_evidence');
      _text(reconciliation.actorLabel, 'wallet_reconciliation_actor');
      _integer(
        reconciliation.createdAtMillis,
        'wallet_reconciliation_created_at',
        minimum: 0,
      );
      if (!reconciliationIds.add(reconciliation.id)) {
        _fail('reference_wallet_reconciliation_id_duplicate');
      }
      if (reconciliationByReversal.putIfAbsent(
            reconciliation.reversalId,
            () => reconciliation,
          ) !=
          reconciliation) {
        _fail('reference_wallet_reversal_duplicate');
      }
    }

    for (final reversal in snapshot.reversals) {
      _validateReversal(reversal);
      if (reversalById.containsKey(reversal.id)) {
        _fail('reference_reversal_id_duplicate');
      }
      reversalById[reversal.id] = reversal;
      if (!_inWindow(shift, reversal.createdAtMillis)) continue;
      reversalTotal += reversal.originalTotalMmk;
      cashDrawerOutflow += -reversal.cashDrawerDeltaMmk;
      events.add({
        ..._baseRow(shift, 'reversal', reversal.id, reversal.createdAtMillis),
        'sale_id': reversal.saleId,
        'payment_method': reversal.originalPaymentMethod.name,
        'amount_mmk': reversal.originalTotalMmk,
        'reason': reversal.reason,
        'actor_label': reversal.authorizedActorLabel,
      });
      for (final line in reversal.lines) {
        events.add({
          ..._baseRow(
            shift,
            'reversal_line',
            line.id,
            reversal.createdAtMillis,
          ),
          'sale_id': reversal.saleId,
          'payment_method': reversal.originalPaymentMethod.name,
          'product_id': line.productId,
          'product_name': line.productName,
          'quantity': line.quantity,
          'unit_price_mmk': line.unitPriceMmk,
          'amount_mmk': line.lineTotalMmk,
          'restock_quantity': line.restockQuantity,
        });
      }
      final reconciliation = reconciliationByReversal[reversal.id];
      if (reconciliation != null &&
          reconciliation.createdAtMillis < reversal.createdAtMillis) {
        _fail('reference_wallet_reconciliation_time_invalid');
      }
      if (reversal.originalPaymentMethod != ShopOperationalPaymentMethod.cash &&
          (reconciliation == null ||
              reconciliation.createdAtMillis > shift.closedAtMillis)) {
        pendingWalletCount++;
        pendingWalletMmk += reversal.originalTotalMmk;
        events.add({
          ..._baseRow(
            shift,
            'wallet_reconciliation',
            '${reversal.id}:wallet-pending',
            reversal.createdAtMillis,
          ),
          'sale_id': reversal.saleId,
          'payment_method': reversal.originalPaymentMethod.name,
          'amount_mmk': reversal.originalTotalMmk,
          'wallet_state': 'external_reconciliation_pending',
        });
      }
    }

    for (final reconciliation in snapshot.walletReconciliations) {
      final reversal = reversalById[reconciliation.reversalId];
      if (reversal == null ||
          reversal.originalPaymentMethod == ShopOperationalPaymentMethod.cash) {
        _fail('reference_wallet_reversal_missing');
      }
      if (reconciliation.createdAtMillis < reversal.createdAtMillis) {
        _fail('reference_wallet_reconciliation_time_invalid');
      }
      if (!_inWindow(shift, reconciliation.createdAtMillis)) continue;
      events.add({
        ..._baseRow(
          shift,
          'wallet_reconciliation',
          reconciliation.id,
          reconciliation.createdAtMillis,
        ),
        'sale_id': reversal.saleId,
        'payment_method': reversal.originalPaymentMethod.name,
        'amount_mmk': reversal.originalTotalMmk,
        'actor_label': reconciliation.actorLabel,
        'wallet_state':
            reconciliation.outcome == ShopOperationalWalletOutcome.moneyReturned
            ? 'merchant_recorded_money_returned'
            : 'merchant_recorded_payment_not_received',
        'evidence_reference': reconciliation.evidenceReference,
      });
    }

    for (final movement in snapshot.stockMovements) {
      _text(movement.id, 'stock_movement_id');
      _text(movement.productId, 'stock_movement_product_id');
      _text(movement.reason, 'stock_movement_reason');
      _integer(movement.quantityDelta, 'stock_delta');
      if (!_inWindow(shift, movement.createdAtMillis)) {
        _fail('reference_stock_movement_outside_shift_window');
      }
      events.add({
        ..._baseRow(
          shift,
          'stock_movement',
          movement.id,
          movement.createdAtMillis,
        ),
        'sale_id': movement.saleId ?? '',
        'product_id': movement.productId,
        'stock_delta': movement.quantityDelta,
        'reason': movement.reason,
      });
    }
    for (final movement in snapshot.cashMovements) {
      _text(movement.id, 'cash_movement_id');
      _text(movement.reason, 'cash_movement_reason');
      _text(movement.actorLabel, 'cash_movement_actor');
      if (!_inWindow(shift, movement.createdAtMillis) ||
          !const {'cash_in', 'cash_out'}.contains(movement.kind)) {
        _fail('reference_cash_movement_invalid');
      }
      _money(movement.amountMmk, 'cash_movement_amount');
      events.add({
        ..._baseRow(
          shift,
          'cash_movement',
          movement.id,
          movement.createdAtMillis,
        ),
        'payment_method': movement.kind,
        'amount_mmk': movement.amountMmk,
        'reason': movement.reason,
        'actor_label': movement.actorLabel,
      });
    }

    final cashSales = snapshot.sales
        .where(
          (sale) => sale.paymentMethod == ShopOperationalPaymentMethod.cash,
        )
        .toList();
    final walletSales = snapshot.sales
        .where(
          (sale) => sale.paymentMethod != ShopOperationalPaymentMethod.cash,
        )
        .toList();
    final cashReversals = snapshot.reversals
        .where(
          (reversal) =>
              _inWindow(shift, reversal.createdAtMillis) &&
              reversal.originalPaymentMethod ==
                  ShopOperationalPaymentMethod.cash,
        )
        .toList();
    final cashTotal = cashSales.fold<int>(
      0,
      (sum, sale) => sum + sale.totalMmk,
    );
    final walletTotal = walletSales.fold<int>(
      0,
      (sum, sale) => sum + sale.totalMmk,
    );
    final cashReversalTotal = cashReversals.fold<int>(
      0,
      (sum, reversal) => sum + reversal.originalTotalMmk,
    );
    final cashInTotal = snapshot.cashMovements
        .where((movement) => movement.kind == 'cash_in')
        .fold<int>(0, (sum, movement) => sum + movement.amountMmk);
    final cashOutTotal = snapshot.cashMovements
        .where((movement) => movement.kind == 'cash_out')
        .fold<int>(0, (sum, movement) => sum + movement.amountMmk);
    final expectedCash =
        shift.openingFloatMmk +
        cashTotal +
        cashInTotal -
        cashDrawerOutflow -
        cashOutTotal;
    if (cashSales.length != shift.cashSalesCount ||
        walletSales.length != shift.walletSalesCount ||
        cashTotal != shift.cashSalesTotalMmk ||
        walletTotal != shift.walletSalesTotalMmk ||
        cashReversals.length != shift.cashReversalCount ||
        cashReversalTotal != shift.cashReversalTotalMmk ||
        cashDrawerOutflow != shift.cashDrawerOutflowMmk ||
        snapshot.cashMovements.length != shift.cashMovementCount ||
        cashInTotal != shift.cashInTotalMmk ||
        cashOutTotal != shift.cashOutTotalMmk ||
        expectedCash != shift.expectedCashMmk ||
        shift.countedCashMmk - shift.expectedCashMmk != shift.differenceMmk) {
      _fail('reference_shift_reconciliation_invalid');
    }

    final summary = <String, Object?>{
      ..._baseRow(shift, 'shift_summary', shift.id, shift.closedAtMillis),
      'actor_label': shift.operatorLabel,
      'opening_float_mmk': shift.openingFloatMmk,
      'cash_sales_count': shift.cashSalesCount,
      'cash_sales_total_mmk': cashTotal,
      'wallet_sales_count': shift.walletSalesCount,
      'wallet_sales_total_mmk': walletTotal,
      'cash_reversal_count': shift.cashReversalCount,
      'cash_reversal_total_mmk': shift.cashReversalTotalMmk,
      'gross_sales_mmk': gross,
      'reversal_total_mmk': reversalTotal,
      'net_sales_mmk': gross - reversalTotal,
      'cash_drawer_outflow_mmk': cashDrawerOutflow,
      'cash_movement_count': shift.cashMovementCount,
      'cash_in_total_mmk': cashInTotal,
      'cash_out_total_mmk': cashOutTotal,
      'expected_cash_mmk': shift.expectedCashMmk,
      'counted_cash_mmk': shift.countedCashMmk,
      'difference_mmk': shift.differenceMmk,
      'pending_wallet_count': pendingWalletCount,
      'pending_wallet_mmk': pendingWalletMmk,
    };

    const ranks = <String, int>{
      'sale': 10,
      'sale_line': 20,
      'reversal': 30,
      'reversal_line': 40,
      'wallet_reconciliation': 50,
      'stock_movement': 60,
      'cash_movement': 70,
    };
    events.sort((left, right) {
      var result = (left['occurred_at_epoch_ms']! as int).compareTo(
        right['occurred_at_epoch_ms']! as int,
      );
      if (result != 0) return result;
      result = ranks[left['row_type']]!.compareTo(ranks[right['row_type']]!);
      if (result != 0) return result;
      return (left['event_id']! as String).compareTo(
        right['event_id']! as String,
      );
    });
    final keys = <String>{};
    for (final event in events) {
      if (!keys.add('${event['row_type']}\u0000${event['event_id']}')) {
        _fail('reference_event_id_duplicate');
      }
    }
    return [summary, ...events];
  }

  ShopOperationalPreview preview(
    ShopOperationalSnapshot snapshot,
    ShopOperationalPreviewLocale locale,
  ) {
    final summary = buildRows(snapshot).first;
    return ShopOperationalPreview(
      locale: locale,
      labels: locale == ShopOperationalPreviewLocale.en
          ? _englishLabels
          : _myanmarLabels,
      values: ShopOperationalPreviewValues(
        grossMmk: summary['gross_sales_mmk']! as int,
        reversalMmk: summary['reversal_total_mmk']! as int,
        netMmk: summary['net_sales_mmk']! as int,
        cashReversalCount: summary['cash_reversal_count']! as int,
        cashReversalMmk: summary['cash_reversal_total_mmk']! as int,
        expectedCashMmk: summary['expected_cash_mmk']! as int,
        countedCashMmk: summary['counted_cash_mmk']! as int,
        differenceMmk: summary['difference_mmk']! as int,
        pendingWalletCount: summary['pending_wallet_count']! as int,
        pendingWalletMmk: summary['pending_wallet_mmk']! as int,
      ),
    );
  }
}

String shopOperationalYangonTimestamp(int epochMillis) {
  _integer(epochMillis, 'timestamp', minimum: 0);
  final shifted = DateTime.fromMillisecondsSinceEpoch(
    epochMillis,
    isUtc: true,
  ).add(const Duration(hours: 6, minutes: 30)).toIso8601String();
  return '${shifted.substring(0, shifted.length - 1)}+06:30';
}

String shopOperationalSpreadsheetSafeText(Object value) {
  final source = value.toString();
  _rejectControls(source, 'reference_text_control_invalid');
  final beginsDangerously =
      source.startsWith('\t') ||
      source.startsWith('\r') ||
      source.startsWith('\n') ||
      RegExp(r'^\s*[=+\-@]', unicode: true).hasMatch(source) ||
      RegExp(r'^0\d+$', unicode: true).hasMatch(source);
  return beginsDangerously ? "'$source" : source;
}

const _englishLabels = ShopOperationalPreviewLabels(
  title: 'Closed shift',
  gross: 'Gross sales',
  reversals: 'Corrections',
  net: 'Net sales',
  expected: 'Expected cash',
  counted: 'Counted cash',
  difference: 'Cash difference',
  pendingWallet: 'Pending wallet follow-up',
  warning: 'Readable local file — not encrypted.',
);

const _myanmarLabels = ShopOperationalPreviewLabels(
  title: 'ပိတ်ပြီး ငွေစာရင်းချိန်',
  gross: 'ရောင်းရငွေ စုစုပေါင်း',
  reversals: 'ပြင်ဆင်မှုများ',
  net: 'အသားတင် ရောင်းရငွေ',
  expected: 'ရှိသင့်သော ငွေသား',
  counted: 'ရေတွက်ထားသော ငွေသား',
  difference: 'ငွေသား ကွာဟချက်',
  pendingWallet: 'ဆက်လက်စစ်ဆေးရန် အီလက်ထရွန်နစ် ငွေပေးချေမှု',
  warning: 'ဖတ်ရှုနိုင်သော စက်တွင်းဖိုင် — စာဝှက်မထားပါ။',
);

Map<String, Object?> _baseRow(
  ShopOperationalShift shift,
  String rowType,
  String eventId,
  int occurredAtMillis,
) => {
  'contract_version': shopOperationalExportContract,
  'data_scope': shopOperationalExportDataScope,
  'row_type': rowType,
  'shift_id': shift.id,
  'shift_opened_at_epoch_ms': shift.openedAtMillis,
  'shift_opened_at_yangon': shopOperationalYangonTimestamp(
    shift.openedAtMillis,
  ),
  'shift_closed_at_epoch_ms': shift.closedAtMillis,
  'shift_closed_at_yangon': shopOperationalYangonTimestamp(
    shift.closedAtMillis,
  ),
  'event_id': eventId,
  'occurred_at_epoch_ms': occurredAtMillis,
  'occurred_at_yangon': shopOperationalYangonTimestamp(occurredAtMillis),
};

void _validateSaleLine(ShopOperationalSaleLine line) {
  _text(line.id, 'sale_line_id');
  _text(line.productId, 'sale_line_product_id');
  _text(line.productName, 'sale_line_product_name');
  _integer(line.quantity, 'sale_line_quantity', minimum: 1, maximum: 1000);
  _money(line.unitPriceMmk, 'sale_line_price');
  _money(line.lineTotalMmk, 'sale_line_total');
  if (line.lineTotalMmk != line.quantity * line.unitPriceMmk) {
    _fail('reference_sale_line_arithmetic_invalid');
  }
}

void _validateReversal(ShopOperationalReversal reversal) {
  _text(reversal.id, 'reversal_id');
  _text(reversal.saleId, 'reversal_sale_id');
  _text(reversal.reason, 'reversal_reason');
  _text(reversal.authorizedActorLabel, 'reversal_actor_label');
  _integer(reversal.createdAtMillis, 'reversal_created_at', minimum: 0);
  _money(reversal.originalTotalMmk, 'reversal_total');
  _integer(
    reversal.cashDrawerDeltaMmk,
    'cash_drawer_delta',
    minimum: -_maxMmk,
    maximum: 0,
  );
  final isCash =
      reversal.originalPaymentMethod == ShopOperationalPaymentMethod.cash;
  if ((isCash && reversal.cashDrawerDeltaMmk != -reversal.originalTotalMmk) ||
      (!isCash && reversal.cashDrawerDeltaMmk != 0)) {
    _fail('reference_reversal_cash_effect_invalid');
  }
  var total = 0;
  for (final line in reversal.lines) {
    _text(line.id, 'reversal_line_id');
    _text(line.productId, 'reversal_line_product_id');
    _text(line.productName, 'reversal_line_product_name');
    _integer(
      line.quantity,
      'reversal_line_quantity',
      minimum: 1,
      maximum: 1000,
    );
    _money(line.unitPriceMmk, 'reversal_line_price');
    _money(line.lineTotalMmk, 'reversal_line_total');
    _integer(
      line.restockQuantity,
      'reversal_line_restock',
      minimum: 0,
      maximum: line.quantity,
    );
    if (line.lineTotalMmk != line.quantity * line.unitPriceMmk) {
      _fail('reference_reversal_line_arithmetic_invalid');
    }
    if (line.restockQuantity != 0 && line.restockQuantity != line.quantity) {
      _fail('reference_reversal_restock_invalid');
    }
    total += line.lineTotalMmk;
  }
  if (total != reversal.originalTotalMmk) {
    _fail('reference_reversal_total_invalid');
  }
}

bool _inWindow(ShopOperationalShift shift, int millis) {
  _integer(millis, 'event_timestamp', minimum: 0);
  return millis >= shift.openedAtMillis && millis <= shift.closedAtMillis;
}

String _csvCell(Object? value, String header) {
  if (value == null || value == '') return '""';
  final source = value is int
      ? _integer(
          value,
          header,
          minimum:
              header.endsWith('_mmk') &&
                  header != 'difference_mmk' &&
                  header != 'net_sales_mmk'
              ? 0
              : -_maxSafeInteger,
          maximum: header.endsWith('_mmk') ? _maxMmk : _maxSafeInteger,
        ).toString()
      : shopOperationalSpreadsheetSafeText(value);
  return _quoted(source);
}

String _quoted(Object value) => '"${value.toString().replaceAll('"', '""')}"';

String _text(String value, String label) {
  if (value.isEmpty) _fail('reference_${label}_invalid');
  _rejectControls(value, 'reference_${label}_invalid');
  return value;
}

void _rejectControls(String value, String error) {
  for (final rune in value.runes) {
    if ((rune >= 0 && rune <= 8) ||
        rune == 11 ||
        rune == 12 ||
        (rune >= 14 && rune <= 31) ||
        rune == 127) {
      _fail(error);
    }
  }
}

int _money(int value, String label, {int minimum = 0}) =>
    _integer(value, label, minimum: minimum, maximum: _maxMmk);

int _integer(
  int value,
  String label, {
  int minimum = -_maxSafeInteger,
  int maximum = _maxSafeInteger,
}) {
  if (value < minimum || value > maximum) {
    _fail('reference_${label}_invalid');
  }
  return value;
}

Never _fail(String code) => throw StateError(code);
