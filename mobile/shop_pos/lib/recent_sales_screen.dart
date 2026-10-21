import 'dart:async';

import 'package:flutter/material.dart';

import 'printer_services.dart';
import 'printer_setup_screen.dart';
import 'shop_copy.dart';
import 'shop_database.dart';

class RecentSalesScreen extends StatefulWidget {
  const RecentSalesScreen({
    required this.database,
    required this.myanmar,
    this.reprintService,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ReceiptReprintService? reprintService;

  @override
  State<RecentSalesScreen> createState() => _RecentSalesScreenState();
}

class _RecentSalesScreenState extends State<RecentSalesScreen> {
  late Future<List<ShopSaleReceipt>> _sales = widget.database.readRecentSales();
  late final ReceiptReprintService _reprinter =
      widget.reprintService ?? ReceiptReprintService();
  bool _reprinting = false;

  void _reload() {
    setState(() => _sales = widget.database.readRecentSales());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(widget.myanmar, 'Recent sales', 'အရောင်းများ')),
        actions: [
          IconButton(
            tooltip: shopCopy(
              widget.myanmar,
              'Refresh sales',
              'အရောင်းစာရင်း ပြန်ဖတ်ရန်',
            ),
            icon: const Icon(Icons.refresh),
            onPressed: _reload,
          ),
        ],
      ),
      body: FutureBuilder<List<ShopSaleReceipt>>(
        future: _sales,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    shopCopy(
                      widget.myanmar,
                      'Could not load sales.',
                      'အရောင်းစာရင်းကို ဖတ်မရပါ။',
                    ),
                  ),
                  TextButton(
                    onPressed: _reload,
                    child: Text(
                      shopCopy(widget.myanmar, 'Try again', 'ထပ်ကြိုးစားရန်'),
                    ),
                  ),
                ],
              ),
            );
          }
          final sales = snapshot.data ?? const <ShopSaleReceipt>[];
          if (sales.isEmpty) {
            return Center(
              child: Text(
                shopCopy(
                  widget.myanmar,
                  'Completed sales will appear here.',
                  'ပြီးဆုံးသော အရောင်းများကို ဤနေရာတွင် ပြပါမည်။',
                ),
              ),
            );
          }
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: sales.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final sale = sales[index];
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    title: Text(
                      shopMmk(sale.totalMmk, myanmar: widget.myanmar),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    subtitle: Text(
                      '${_when(context, sale.createdAtMillis)}\n'
                      '${_paymentName(sale.paymentMethod)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _showSale(sale),
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }

  String _when(BuildContext context, int millis) {
    final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatMediumDate(date)} '
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
  }

  String _paymentName(String method) => switch (method) {
    'cash' => shopCopy(widget.myanmar, 'Cash', 'ငွေသား'),
    'kbzpay' => 'KBZPay',
    'wavepay' => 'WavePay',
    _ => method,
  };

  Future<void> _showSale(ShopSaleReceipt sale) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          shopCopy(widget.myanmar, 'Sale details', 'အရောင်းအသေးစိတ်'),
        ),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_when(dialogContext, sale.createdAtMillis)),
                const SizedBox(height: 4),
                SelectableText(sale.id),
                const Divider(height: 24),
                for (final line in sale.lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${line.productName} × ${shopNumber(line.quantity, myanmar: widget.myanmar)}',
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          shopMmk(line.lineTotalMmk, myanmar: widget.myanmar),
                        ),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        shopCopy(widget.myanmar, 'Total', 'စုစုပေါင်း'),
                      ),
                    ),
                    Text(
                      shopMmk(sale.totalMmk, myanmar: widget.myanmar),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${shopCopy(widget.myanmar, 'Payment', 'ငွေပေးချေမှု')}: '
                  '${_paymentName(sale.paymentMethod)}',
                ),
              ],
            ),
          ),
        ),
        actions: [
          FilledButton.icon(
            onPressed: _reprinting
                ? null
                : () {
                    Navigator.of(dialogContext).pop();
                    unawaited(_reprintSale(sale));
                  },
            icon: const Icon(Icons.print_outlined),
            label: Text(
              shopCopy(
                widget.myanmar,
                'Reprint receipt',
                'ပြေစာပြန်ပုံနှိပ်ရန်',
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(shopCopy(widget.myanmar, 'Close', 'ပိတ်ရန်')),
          ),
        ],
      ),
    );
  }

  Future<void> _reprintSale(ShopSaleReceipt sale) async {
    if (_reprinting) return;
    setState(() => _reprinting = true);
    try {
      var sent = await _reprinter.printIfTrusted(sale, myanmar: widget.myanmar);
      if (!sent) {
        if (!mounted) return;
        await Navigator.of(context).push<void>(
          MaterialPageRoute<void>(
            builder: (_) => PrinterSetupScreen(myanmar: widget.myanmar),
          ),
        );
        if (!mounted) return;
        sent = await _reprinter.printIfTrusted(sale, myanmar: widget.myanmar);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            sent
                ? shopCopy(
                    widget.myanmar,
                    'Receipt sent to printer.',
                    'ပြေစာကို ပရင်တာသို့ ပို့ပြီးပါပြီ။',
                  )
                : shopCopy(
                    widget.myanmar,
                    'Test and confirm a printer before reprinting this sale.',
                    'ဤအရောင်းပြေစာကို ပြန်ပုံနှိပ်မီ ပရင်တာကို စမ်းသပ်အတည်ပြုပါ။',
                  ),
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            shopCopy(
              widget.myanmar,
              'Sale is saved. Receipt could not print; check the printer and try again.',
              'အရောင်းသိမ်းပြီးပါပြီ။ ပြေစာမပုံနှိပ်နိုင်ပါ။ ပရင်တာကို စစ်ပြီး ထပ်စမ်းပါ။',
            ),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _reprinting = false);
    }
  }
}
