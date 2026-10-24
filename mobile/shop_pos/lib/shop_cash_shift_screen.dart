import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_database.dart';
import 'stock_screen.dart' show parseStockQuantity;

class ShopCashShiftScreen extends StatefulWidget {
  const ShopCashShiftScreen({
    required this.database,
    required this.myanmar,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;

  @override
  State<ShopCashShiftScreen> createState() => _ShopCashShiftScreenState();
}

class _ShopCashShiftScreenState extends State<ShopCashShiftScreen> {
  final _operator = TextEditingController();
  final _openingFloat = TextEditingController(text: '0');
  final _countedCash = TextEditingController();
  String _openOperationId = const Uuid().v4();
  String? _closeOperationId;
  ShopCashShiftReview? _review;
  ShopCashShift? _latest;
  String? _error;
  bool _loading = true;
  bool _loadFailed = false;
  bool _busy = false;

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
  }

  Future<void> _openShift() async {
    if (_busy) return;
    final label = _operator.text.trim();
    final openingFloat = parseStockQuantity(_openingFloat.text);
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
    final counted = parseStockQuantity(_countedCash.text);
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

  Widget _moneyField(TextEditingController controller, String label) =>
      TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9၀-၉]')),
        ],
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
                        Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
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
