import 'dart:async';

import 'package:flutter/material.dart';

import 'printer_services.dart';
import 'printer_setup_screen.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_today_screen.dart';

class RecentSalesScreen extends StatefulWidget {
  const RecentSalesScreen({
    required this.database,
    required this.myanmar,
    this.reprintService,
    this.embeddedTaskShell = false,
    this.refreshToken = 0,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ReceiptReprintService? reprintService;
  final bool embeddedTaskShell;
  final int refreshToken;

  @override
  State<RecentSalesScreen> createState() => _RecentSalesScreenState();
}

class _RecentSalesScreenState extends State<RecentSalesScreen> {
  static const _pageSize = 30;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;
  int _page = 0;
  String _query = '';
  late Future<List<ShopSaleReceipt>> _sales = _readPage();
  late final ReceiptReprintService _reprinter =
      widget.reprintService ?? ReceiptReprintService();
  bool _reprinting = false;

  Future<List<ShopSaleReceipt>> _readPage() => widget.database.readRecentSales(
    limit: _pageSize + 1,
    offset: _page * _pageSize,
    query: _query,
  );

  void _reload() {
    setState(() => _sales = _readPage());
  }

  @override
  void didUpdateWidget(RecentSalesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshToken != widget.refreshToken) _sales = _readPage();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 250), () {
      if (!mounted || value.trim() == _query) return;
      setState(() {
        _query = value.trim();
        _page = 0;
        _sales = _readPage();
      });
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.embeddedTaskShell
          ? null
          : AppBar(
              title: Text(
                shopCopy(widget.myanmar, 'Recent sales', 'အရောင်းများ'),
              ),
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
      body: Column(
        children: [
          if (widget.embeddedTaskShell)
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 800),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: ShopTaskPageHeader(
                    title: shopCopy(widget.myanmar, 'Sales', 'အရောင်း'),
                    myanmar: widget.myanmar,
                    trailing: IconButton(
                      tooltip: shopCopy(
                        widget.myanmar,
                        'Refresh sales',
                        'အရောင်းစာရင်း ပြန်ဖတ်ရန်',
                      ),
                      icon: const Icon(Icons.refresh),
                      onPressed: _reload,
                    ),
                  ),
                ),
              ),
            ),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: shopCopy(
                      widget.myanmar,
                      'Find by item or receipt ID',
                      'ပစ္စည်း / ပြေစာ ရှာရန်',
                    ),
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: shopCopy(
                              widget.myanmar,
                              'Clear search',
                              'ရှာဖွေမှု ရှင်းရန်',
                            ),
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              _searchDebounce?.cancel();
                              _searchController.clear();
                              setState(() {
                                _query = '';
                                _page = 0;
                                _sales = _readPage();
                              });
                            },
                          ),
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<ShopSaleReceipt>>(
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
                            shopCopy(
                              widget.myanmar,
                              'Try again',
                              'ထပ်ကြိုးစားရန်',
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                final page = snapshot.data ?? const <ShopSaleReceipt>[];
                final hasNext = page.length > _pageSize;
                final sales = page.take(_pageSize).toList(growable: false);
                if (sales.isEmpty) {
                  return Center(
                    child: Text(
                      shopCopy(
                        widget.myanmar,
                        _query.isEmpty
                            ? 'Completed sales will appear here.'
                            : 'No matching sales.',
                        _query.isEmpty
                            ? 'ပြီးဆုံးသော အရောင်းများကို ဤနေရာတွင် ပြပါမည်။'
                            : 'ကိုက်ညီသော အရောင်းမရှိပါ။',
                      ),
                    ),
                  );
                }
                return Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 800),
                    child: Column(
                      children: [
                        Expanded(
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                            itemCount: sales.length,
                            separatorBuilder: (_, _) =>
                                MediaQuery.sizeOf(context).width < 480
                                ? const SizedBox(height: 10)
                                : const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final sale = sales[index];
                              final firstItem = sale.lines.isEmpty
                                  ? shopCopy(widget.myanmar, 'Sale', 'အရောင်း')
                                  : sale.lines.first.productName;
                              final more = sale.lines.length > 1
                                  ? ' +${sale.lines.length - 1}'
                                  : '';
                              if (MediaQuery.sizeOf(context).width < 480) {
                                return Card(
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () => _showSale(sale),
                                    child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.receipt_long_outlined,
                                                size: 20,
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .primary,
                                              ),
                                              const SizedBox(width: 10),
                                              Expanded(
                                                child: Text(
                                                  '$firstItem$more',
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .bodyMedium
                                                      ?.copyWith(
                                                        fontWeight:
                                                            FontWeight.w600,
                                                      ),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              const Icon(
                                                Icons.chevron_right,
                                                size: 20,
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            shopMmk(
                                              sale.totalMmk,
                                              myanmar: widget.myanmar,
                                            ),
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleMedium
                                                ?.copyWith(
                                                  fontWeight: FontWeight.w700,
                                                  fontFeatures: const [
                                                    FontFeature.tabularFigures(),
                                                  ],
                                                ),
                                          ),
                                          const SizedBox(height: 2),
                                          Wrap(
                                            spacing: 8,
                                            runSpacing: 2,
                                            children: [
                                              Text(
                                                _whenCompact(
                                                  context,
                                                  sale.createdAtMillis,
                                                ),
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall,
                                              ),
                                              Text(
                                                _paymentName(
                                                  sale.paymentMethod,
                                                ),
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall,
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              }
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                title: Text(
                                  '$firstItem$more',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.titleMedium
                                      ?.copyWith(fontWeight: FontWeight.w600),
                                ),
                                subtitle: Text(
                                  '${_when(context, sale.createdAtMillis)} · '
                                  '${_paymentName(sale.paymentMethod)}',
                                  style: Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                      ),
                                ),
                                trailing: Text(
                                  shopMmk(
                                    sale.totalMmk,
                                    myanmar: widget.myanmar,
                                  ),
                                  style: Theme.of(context).textTheme.titleSmall
                                      ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        fontFeatures: const [
                                          FontFeature.tabularFigures(),
                                        ],
                                      ),
                                ),
                                onTap: () => _showSale(sale),
                              );
                            },
                          ),
                        ),
                        if (_page > 0 || hasNext)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                TextButton(
                                  onPressed: _page == 0
                                      ? null
                                      : () {
                                          setState(() {
                                            _page--;
                                            _sales = _readPage();
                                          });
                                        },
                                  child: Text(
                                    shopCopy(
                                      widget.myanmar,
                                      'Newer',
                                      'အသစ်များ',
                                    ),
                                  ),
                                ),
                                TextButton(
                                  onPressed: !hasNext
                                      ? null
                                      : () {
                                          setState(() {
                                            _page++;
                                            _sales = _readPage();
                                          });
                                        },
                                  child: Text(
                                    shopCopy(
                                      widget.myanmar,
                                      'Older',
                                      'အဟောင်းများ',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _when(BuildContext context, int millis) {
    final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatMediumDate(date)} '
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
  }

  String _whenCompact(BuildContext context, int millis) {
    final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatShortDate(date)} '
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
