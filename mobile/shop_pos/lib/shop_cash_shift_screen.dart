import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_operational_export.dart';
import 'shop_operational_export_saver.dart';
import 'shop_runtime_scope.dart';

@visibleForTesting
bool shopOperationalExportActionAvailable({
  required bool hasRuntimeScope,
  required bool hasTestAction,
  required bool allowTestSeam,
}) => hasRuntimeScope ? !hasTestAction : allowTestSeam && hasTestAction;

@visibleForTesting
bool shopOperationalExportSaveAvailable({
  required bool isSyntheticQa,
  required bool hasTestAction,
}) => hasTestAction || !isSyntheticQa;

class ShopCashShiftScreen extends StatefulWidget {
  const ShopCashShiftScreen({
    required this.database,
    required this.myanmar,
    this.runtimeScope,
    this.exportAction,
    this.testOnlyAllowMissingRuntimeScope = false,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ShopRuntimeScope? runtimeScope;
  final Future<ShopOperationalExportSaveResult> Function(String shiftId)?
  exportAction;
  final bool testOnlyAllowMissingRuntimeScope;

  @override
  State<ShopCashShiftScreen> createState() => _ShopCashShiftScreenState();
}

class _ShopCashShiftScreenState extends State<ShopCashShiftScreen> {
  final _operator = TextEditingController();
  final _openingFloat = TextEditingController(text: '0');
  final _countedCash = TextEditingController();
  final _statusFocus = FocusNode();
  String _openOperationId = const Uuid().v4();
  String? _closeOperationId;
  ShopCashShiftReview? _review;
  ShopCashShift? _latest;
  String? _error;
  String? _notice;
  bool _loading = true;
  bool _loadFailed = false;
  bool _busy = false;

  bool get _exportAvailable => shopOperationalExportActionAvailable(
    hasRuntimeScope: widget.runtimeScope != null,
    hasTestAction: widget.exportAction != null,
    allowTestSeam: widget.testOnlyAllowMissingRuntimeScope,
  );

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _operator.dispose();
    _openingFloat.dispose();
    _countedCash.dispose();
    _statusFocus.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (mounted) setState(() => _loading = true);
    try {
      final openShift = await widget.database.readOpenCashShift();
      final review = openShift == null
          ? null
          : await widget.database.readCashShiftReview(openShift.id);
      final latest = await widget.database.readLatestCashShift();
      if (!mounted) return;
      setState(() {
        _review = review;
        _latest = latest;
        _loading = false;
        _loadFailed = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadFailed = true;
        _error = shopCopy(
          widget.myanmar,
          'Could not load this shift. Try again.',
          'တာဝန်ချိန်ကို မဖွင့်နိုင်ပါ။ ထပ်စမ်းကြည့်ပါ။',
        );
      });
    }
  }

  void _showError(Object error, String english, String burmese) {
    if (!mounted) return;
    final detail = error.toString();
    setState(() {
      _notice = null;
      _error = detail.contains('pending wallet')
          ? shopCopy(
              widget.myanmar,
              'Finish or cancel the pending wallet checkout first.',
              'ဆိုင်းငံ့ထားသော ဖုန်းငွေပေးချေမှုအရောင်းကို အရင်ပြီးစီးစေပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
            )
          : detail.contains('Shift activity changed')
          ? shopCopy(
              widget.myanmar,
              'Recorded cash activity changed. Review the shift again.',
              'မှတ်တမ်းရှိ ငွေသားအဝင်အထွက် ပြောင်းလဲသွားသောကြောင့် တာဝန်ချိန်ကို ပြန်စစ်ပါ။',
            )
          : shopCopy(widget.myanmar, english, burmese);
    });
    _focusStatus();
  }

  void _focusStatus() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted) _statusFocus.requestFocus();
  });

  Future<void> _openShift() async {
    if (_busy) return;
    final label = _operator.text.trim();
    final openingFloat = parseShopMmkInput(_openingFloat.text);
    if (label.isEmpty ||
        label.length > 80 ||
        openingFloat == null ||
        openingFloat < 0 ||
        openingFloat > 200000000000000) {
      _showError(
        ArgumentError(),
        'Enter your name and a valid opening cash amount.',
        'အမည်နှင့် စတင်ငွေသားပမာဏ မှန်ကန်စွာ ဖြည့်ပါ။',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await widget.database.openCashShift(
        operationId: _openOperationId,
        operatorLabel: label,
        openingFloatMmk: openingFloat,
      );
      _openOperationId = const Uuid().v4();
      await _refresh();
    } catch (error) {
      await _refresh();
      if (_review == null && !_loadFailed) {
        _showError(
          error,
          'Could not start the shift. Check its status and try again.',
          'တာဝန်ချိန် မစတင်နိုင်ပါ။ အခြေအနေကို စစ်ပြီး ထပ်စမ်းပါ။',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _closeShift() async {
    if (_busy || _review == null) return;
    final counted = parseShopMmkInput(_countedCash.text);
    if (counted == null || counted < 0 || counted > 200000000000000) {
      _showError(
        ArgumentError(),
        'Enter the cash you counted in the drawer.',
        'ငွေသားလက်ကျန်ကို ရေတွက်ပြီး ဖြည့်ပါ။',
      );
      return;
    }
    final review = _review!;
    final difference = counted - review.expectedCashMmk;
    if (difference != 0) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            shopCopy(widget.myanmar, 'Cash difference', 'ငွေသားကွာခြားချက်'),
          ),
          content: Text(
            '${shopCopy(widget.myanmar, 'Expected after recorded cash activity', 'မှတ်တမ်းရှိ ငွေသားအဝင်အထွက်ပြီးနောက် မျှော်မှန်းငွေ')}: '
            '${shopMmk(review.expectedCashMmk, myanmar: widget.myanmar)}\n'
            '${shopCopy(widget.myanmar, 'Counted', 'ရေတွက်ငွေ')}: '
            '${shopMmk(counted, myanmar: widget.myanmar)}\n'
            '${shopCopy(widget.myanmar, 'Difference', 'ကွာခြားချက်')}: '
            '${shopMmk(difference, myanmar: widget.myanmar)}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(shopCopy(widget.myanmar, 'Keep open', 'ဖွင့်ထားမည်')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(
                shopCopy(
                  widget.myanmar,
                  'Record difference',
                  'ကွာခြားချက် မှတ်တမ်းတင်မည်',
                ),
              ),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await widget.database.closeCashShift(
        shiftId: review.shift.id,
        operationId: _closeOperationId ??= const Uuid().v4(),
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        seenCashReversalCount: review.cashReversalCount,
        seenCashDrawerOutflowMmk: review.cashDrawerOutflowMmk,
        countedCashMmk: counted,
      );
      _closeOperationId = null;
      _countedCash.clear();
      await _refresh();
    } catch (error) {
      await _refresh();
      if (_review != null && !_loadFailed) {
        _showError(
          error,
          'Could not close the shift. Review it and try again.',
          'တာဝန်ချိန် မပိတ်နိုင်ပါ။ ပြန်စစ်ပြီး ထပ်စမ်းပါ။',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _exportClosedShift(ShopCashShift shift) async {
    if (_busy) return;
    final scope = requireShopRuntimeScopeOrTestSeam(
      widget.runtimeScope,
      testOnlyAllowMissingRuntimeScope:
          widget.testOnlyAllowMissingRuntimeScope &&
          widget.exportAction != null,
    );
    if (widget.exportAction != null &&
        (scope != null || !widget.testOnlyAllowMissingRuntimeScope)) {
      throw StateError('shop_operational_export_test_seam_invalid');
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    var saveAttempted = false;
    try {
      final snapshot = await widget.database
          .readClosedCashShiftOperationalExport(shift.id);
      const exporter = ShopOperationalExporter();
      final preview = exporter.preview(
        snapshot,
        widget.myanmar
            ? ShopOperationalPreviewLocale.my
            : ShopOperationalPreviewLocale.en,
      );
      final saveAvailable = shopOperationalExportSaveAvailable(
        isSyntheticQa: scope?.configuration.isSyntheticQa ?? false,
        hasTestAction: widget.exportAction != null,
      );
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(preview.labels.title),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _exportPreviewRow(
                  preview.labels.gross,
                  preview.values.grossMmk,
                ),
                _exportPreviewRow(
                  preview.labels.reversals,
                  -preview.values.reversalMmk,
                ),
                _exportPreviewRow(preview.labels.net, preview.values.netMmk),
                const Divider(),
                _exportPreviewRow(
                  preview.labels.expected,
                  preview.values.expectedCashMmk,
                ),
                _exportPreviewRow(
                  preview.labels.counted,
                  preview.values.countedCashMmk,
                ),
                _exportPreviewRow(
                  preview.labels.difference,
                  preview.values.differenceMmk,
                ),
                if (preview.values.pendingWalletCount > 0)
                  _exportPreviewRow(
                    '${preview.labels.pendingWallet} '
                    '(${shopNumber(preview.values.pendingWalletCount, myanmar: widget.myanmar)})',
                    preview.values.pendingWalletMmk,
                  ),
                const SizedBox(height: 12),
                Text(
                  preview.labels.warning,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 4),
                Text(
                  shopCopy(
                    widget.myanmar,
                    'Use encrypted Backup & restore for recovery.',
                    'ပြန်လည်ရယူရန် စာဝှက်ထားသော အရန်ကူးနှင့် ပြန်လည်ရယူမှုကို သုံးပါ။',
                  ),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (!saveAvailable) ...[
                  const SizedBox(height: 8),
                  Text(
                    shopCopy(
                      widget.myanmar,
                      'Saving is unavailable in the synthetic QA app. Preview only.',
                      'စမ်းသပ် QA အက်ပ်တွင် ဖိုင်သိမ်း၍ မရပါ။ အစမ်းကြည့်ရန်သာ ဖြစ်သည်။',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
            ),
            FilledButton(
              onPressed: saveAvailable
                  ? () => Navigator.of(context).pop(true)
                  : null,
              child: Text(
                shopCopy(widget.myanmar, 'Save CSV', 'CSV ဖိုင် သိမ်းမည်'),
              ),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      saveAttempted = true;
      final result = await (widget.exportAction != null
          ? widget.exportAction!(shift.id)
          : ShopOperationalExportSaver.save(
              runtimeScope: scope!,
              bytes: exporter.encode(snapshot).bytes,
              shiftId: shift.id,
            ));
      if (!mounted) return;
      setState(() {
        _notice = result == ShopOperationalExportSaveResult.saved
            ? shopCopy(
                widget.myanmar,
                'Closed-shift CSV saved. It is readable and not encrypted.',
                'ပိတ်ပြီးတာဝန်ချိန် CSV ဖိုင် သိမ်းပြီးပါပြီ။ ဖတ်ရှုနိုင်ပြီး စာဝှက်မထားပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Save cancelled. Shop records were not changed.',
                'သိမ်းဆည်းမှု ပယ်ဖျက်လိုက်သည်။ Shop မှတ်တမ်းများ မပြောင်းလဲပါ။',
              );
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _notice = null;
        _error = saveAttempted
            ? shopCopy(
                widget.myanmar,
                'Could not confirm whether the CSV was saved. Check your files before retrying. Shop records were not changed.',
                'CSV ဖိုင် သိမ်းပြီးမပြီး အတည်မပြုနိုင်ပါ။ ထပ်မကြိုးစားမီ ဖိုင်များကို စစ်ဆေးပါ။ Shop မှတ်တမ်းများ မပြောင်းလဲပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Could not prepare this closed shift. Shop records were not changed.',
                'ပိတ်ပြီးတာဝန်ချိန် ဖိုင်ကို မပြင်ဆင်နိုင်ပါ။ Shop မှတ်တမ်းများ မပြောင်းလဲပါ။',
              );
      });
      _focusStatus();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _exportPreviewRow(String label, int amount) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Builder(
      builder: (context) {
        final value = Text(
          shopMmk(amount, myanmar: widget.myanmar),
          textAlign: TextAlign.end,
        );
        if (MediaQuery.sizeOf(context).width < 600) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [Text(label), const SizedBox(height: 2), value],
          );
        }
        return Row(
          children: [
            Expanded(child: Text(label)),
            const SizedBox(width: 12),
            Flexible(child: value),
          ],
        );
      },
    ),
  );

  Widget _amountRow(String label, int amount, {bool strong = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final value = Text(
          shopMmk(amount, myanmar: widget.myanmar),
          style: strong ? Theme.of(context).textTheme.titleMedium : null,
        );
        if (constraints.maxWidth < 430) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [Text(label), const SizedBox(height: 4), value],
          );
        }
        return Row(
          children: [
            Expanded(child: Text(label)),
            value,
          ],
        );
      },
    ),
  );

  Widget _moneyField(
    TextEditingController controller,
    String label, {
    required Key fieldKey,
  }) => TextField(
    key: fieldKey,
    controller: controller,
    keyboardType: TextInputType.number,
    decoration: InputDecoration(
      labelText: label,
      suffixText: widget.myanmar ? 'ကျပ်' : 'MMK',
    ),
  );

  @override
  Widget build(BuildContext context) {
    final review = _review;
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(widget.myanmar, 'Cash shift', 'ငွေသားတာဝန်ချိန်')),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      if (_error != null) ...[
                        Semantics(
                          container: true,
                          liveRegion: true,
                          child: Focus(
                            focusNode: _statusFocus,
                            child: Text(
                              _error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: _refresh,
                          child: Text(
                            shopCopy(widget.myanmar, 'Refresh', 'ပြန်ဖွင့်ရန်'),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (_notice != null) ...[
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _notice!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (review == null) ...[
                        Text(
                          shopCopy(
                            widget.myanmar,
                            'Start a shift',
                            'တာဝန်ချိန်စတင်ရန်',
                          ),
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          shopCopy(
                            widget.myanmar,
                            'Optional for cash counting. Sales still work without a shift.',
                            'ငွေသားရေတွက်ရန်သာ ရွေးချယ်အသုံးပြုပါ။ တာဝန်ချိန်မဖွင့်လည်း အရောင်းပြုလုပ်နိုင်သည်။',
                          ),
                        ),
                        const SizedBox(height: 24),
                        TextField(
                          controller: _operator,
                          maxLength: 80,
                          decoration: InputDecoration(
                            labelText: shopCopy(
                              widget.myanmar,
                              'Your name',
                              'သင့်အမည်',
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        _moneyField(
                          _openingFloat,
                          shopCopy(
                            widget.myanmar,
                            'Opening cash in drawer',
                            'အံဆွဲရှိ စတင်ငွေသား',
                          ),
                          fieldKey: const ValueKey('shop-shift-opening-cash'),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _busy || _loadFailed ? null : _openShift,
                          child: Text(
                            shopCopy(
                              widget.myanmar,
                              'Start shift',
                              'တာဝန်ချိန် စတင်မည်',
                            ),
                          ),
                        ),
                        if (_latest case final ShopCashShift last
                            when last.state == 'closed') ...[
                          const SizedBox(height: 32),
                          const Divider(),
                          const SizedBox(height: 16),
                          Text(
                            shopCopy(
                              widget.myanmar,
                              'Last closed shift',
                              'နောက်ဆုံးပိတ်ထားသော တာဝန်ချိန်',
                            ),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(last.operatorLabel),
                          if (last.closedAtMillis case final int closedAt)
                            Text(
                              '${shopCopy(widget.myanmar, 'Closed', 'ပိတ်သိမ်းချိန်')}: '
                              '${MaterialLocalizations.of(context).formatShortDate(DateTime.fromMillisecondsSinceEpoch(closedAt))} '
                              '${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(DateTime.fromMillisecondsSinceEpoch(closedAt)))}',
                            ),
                          if ((last.cashReversalCount ?? 0) > 0)
                            _amountRow(
                              shopCopy(
                                widget.myanmar,
                                'Cash returned (${last.cashReversalCount})',
                                'ငွေသားပြန်ပေးမှု (${shopNumber(last.cashReversalCount ?? 0, myanmar: true)})',
                              ),
                              -(last.cashDrawerOutflowMmk ?? 0),
                            ),
                          _amountRow(
                            shopCopy(
                              widget.myanmar,
                              'Expected after recorded cash activity',
                              'မှတ်တမ်းရှိ ငွေသားအဝင်အထွက်ပြီးနောက် မျှော်မှန်းငွေသား',
                            ),
                            last.expectedCashMmk ?? 0,
                          ),
                          _amountRow(
                            shopCopy(
                              widget.myanmar,
                              'Counted cash',
                              'ရေတွက်ထားသော ငွေသား',
                            ),
                            last.countedCashMmk ?? 0,
                          ),
                          _amountRow(
                            shopCopy(
                              widget.myanmar,
                              'Difference',
                              'ကွာခြားချက်',
                            ),
                            last.differenceMmk ?? 0,
                          ),
                          const SizedBox(height: 12),
                          OutlinedButton.icon(
                            onPressed: _busy || !_exportAvailable
                                ? null
                                : () => _exportClosedShift(last),
                            icon: const Icon(Icons.table_view_outlined),
                            label: Text(
                              shopCopy(
                                widget.myanmar,
                                'Export closed shift (CSV)',
                                'ပိတ်ပြီးတာဝန်ချိန် CSV ထုတ်မည်',
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            shopCopy(
                              widget.myanmar,
                              'Readable local record — not an encrypted recovery backup.',
                              'ဖတ်ရှုနိုင်သော စက်တွင်းမှတ်တမ်း — စာဝှက်ထားသော ပြန်လည်ရယူရေးအရန်ကူး မဟုတ်ပါ။',
                            ),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ] else ...[
                        Text(
                          review.shift.operatorLabel,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          shopCopy(
                            widget.myanmar,
                            '${review.saleCount} sales in this shift',
                            'ဤတာဝန်ချိန်အတွင်း အရောင်း ${shopNumber(review.saleCount, myanmar: true)} ခု',
                          ),
                        ),
                        const SizedBox(height: 24),
                        _amountRow(
                          shopCopy(
                            widget.myanmar,
                            'Opening cash',
                            'စတင်ငွေသား',
                          ),
                          review.shift.openingFloatMmk,
                        ),
                        _amountRow(
                          shopCopy(
                            widget.myanmar,
                            'Cash sales',
                            'ငွေသားအရောင်း',
                          ),
                          review.cashSalesTotalMmk,
                        ),
                        if (review.cashReversalCount > 0)
                          _amountRow(
                            shopCopy(
                              widget.myanmar,
                              'Cash returned (${review.cashReversalCount})',
                              'ငွေသားပြန်ပေးမှု (${shopNumber(review.cashReversalCount, myanmar: true)})',
                            ),
                            -review.cashDrawerOutflowMmk,
                          ),
                        const Divider(),
                        _amountRow(
                          shopCopy(
                            widget.myanmar,
                            'Expected after recorded cash activity',
                            'မှတ်တမ်းရှိ ငွေသားအဝင်အထွက်ပြီးနောက် မျှော်မှန်းငွေသား',
                          ),
                          review.expectedCashMmk,
                          strong: true,
                        ),
                        Text(
                          shopCopy(
                            widget.myanmar,
                            'Other drawer cash movements are not included.',
                            'အံဆွဲငွေသား၏ အခြားအဝင်အထွက်များ မပါဝင်ပါ။',
                          ),
                        ),
                        const SizedBox(height: 16),
                        _amountRow(
                          shopCopy(
                            widget.myanmar,
                            'Recorded wallet sales',
                            'မှတ်တမ်းတင်ထားသော ဖုန်းငွေပေးချေမှုအရောင်း',
                          ),
                          review.walletSalesTotalMmk,
                        ),
                        Text(
                          shopCopy(
                            widget.myanmar,
                            'Wallet sales are recorded, not proof of settlement.',
                            'ဖုန်းငွေပေးချေမှုအရောင်းမှတ်တမ်းသည် ငွေလက်ခံပြီးကြောင်း အထောက်အထားမဟုတ်ပါ။',
                          ),
                        ),
                        const SizedBox(height: 24),
                        _moneyField(
                          _countedCash,
                          shopCopy(
                            widget.myanmar,
                            'Cash you counted',
                            'ရေတွက်ထားသော ငွေသား',
                          ),
                          fieldKey: const ValueKey('shop-shift-counted-cash'),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _busy || _loadFailed ? null : _closeShift,
                          child: Text(
                            shopCopy(
                              widget.myanmar,
                              'Close shift',
                              'တာဝန်ချိန် ပိတ်မည်',
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
