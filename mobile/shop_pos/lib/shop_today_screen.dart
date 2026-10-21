import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';

import 'shop_copy.dart';
import 'shop_database.dart';

typedef ShopTodayDestination = Future<void> Function(BuildContext context);

/// Keeps the same operator map visible on Today and Counter.
class ShopTaskRail extends StatelessWidget {
  const ShopTaskRail({
    required this.myanmar,
    required this.extended,
    required this.selectedIndex,
    required this.onDestinationSelected,
    super.key,
  });

  final bool myanmar;
  final bool extended;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white,
    child: NavigationRail(
      extended: extended,
      minWidth: 76,
      minExtendedWidth: 190,
      selectedIndex: selectedIndex,
      labelType: extended
          ? NavigationRailLabelType.none
          : NavigationRailLabelType.all,
      onDestinationSelected: onDestinationSelected,
      destinations: [
        NavigationRailDestination(
          icon: const Icon(Icons.home_outlined),
          selectedIcon: const Icon(Icons.home),
          label: Text(shopCopy(myanmar, 'Today', 'ယနေ့')),
        ),
        NavigationRailDestination(
          icon: const Icon(Icons.point_of_sale_outlined),
          label: Text(shopCopy(myanmar, 'Sell', 'ရောင်းရန်')),
        ),
        NavigationRailDestination(
          icon: const Icon(Icons.receipt_long_outlined),
          label: Text(shopCopy(myanmar, 'Sales', 'အရောင်း')),
        ),
        NavigationRailDestination(
          icon: const Icon(Icons.inventory_2_outlined),
          label: Text(shopCopy(myanmar, 'Stock', 'လက်ကျန်')),
        ),
        NavigationRailDestination(
          icon: const Icon(Icons.settings_outlined),
          label: Text(shopCopy(myanmar, 'Settings', 'ဆက်တင်များ')),
        ),
      ],
    ),
  );
}

class ShopTaskBottomBar extends StatelessWidget {
  const ShopTaskBottomBar({
    required this.myanmar,
    required this.selectedIndex,
    required this.onDestinationSelected,
    super.key,
  });

  final bool myanmar;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: onDestinationSelected,
      destinations: [
        NavigationDestination(
          icon: const Icon(Icons.home_outlined),
          selectedIcon: const Icon(Icons.home),
          label: shopCopy(myanmar, 'Today', 'ယနေ့'),
        ),
        NavigationDestination(
          icon: const Icon(Icons.point_of_sale_outlined),
          label: shopCopy(myanmar, 'Sell', 'ရောင်းရန်'),
        ),
        NavigationDestination(
          icon: const Icon(Icons.receipt_long_outlined),
          label: shopCopy(myanmar, 'Sales', 'အရောင်း'),
        ),
        NavigationDestination(
          icon: const Icon(Icons.inventory_2_outlined),
          label: shopCopy(myanmar, 'Stock', 'လက်ကျန်'),
        ),
      ],
    ),
  );
}

/// A local operating view. It never presents a device sale as a synced order.
class ShopTodayScreen extends StatefulWidget {
  const ShopTodayScreen({
    required this.database,
    required this.myanmar,
    required this.onNewSale,
    required this.onAddFirstProduct,
    required this.onSales,
    required this.onStock,
    required this.onSettings,
    this.refreshToken = 0,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ShopTodayDestination onNewSale;
  final ShopTodayDestination onAddFirstProduct;
  final ShopTodayDestination onSales;
  final ShopTodayDestination onStock;
  final ShopTodayDestination onSettings;
  final int refreshToken;

  @override
  State<ShopTodayScreen> createState() => _ShopTodayScreenState();
}

class _TodaySnapshot {
  const _TodaySnapshot({
    required this.salesMmk,
    required this.saleCount,
    required this.products,
    required this.productPreview,
    required this.recentSales,
    required this.stockToCheck,
    required this.pendingWallet,
  });

  final int salesMmk;
  final int saleCount;
  final int products;
  final List<ShopProduct> productPreview;
  final List<ShopSaleReceipt> recentSales;
  final List<ShopProduct> stockToCheck;
  final PendingWalletCheckout? pendingWallet;
}

class _ShopTodayScreenState extends State<ShopTodayScreen> {
  late Future<_TodaySnapshot> _snapshot;

  @override
  void initState() {
    super.initState();
    _snapshot = _readSnapshot();
  }

  @override
  void didUpdateWidget(covariant ShopTodayScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshToken != widget.refreshToken) {
      _snapshot = _readSnapshot();
    }
  }

  String _copy(String english, String burmese) =>
      shopCopy(widget.myanmar, english, burmese);

  String _number(int value) => shopNumber(value, myanmar: widget.myanmar);

  String _money(int value) => shopMmk(value, myanmar: widget.myanmar);

  Future<_TodaySnapshot> _readSnapshot() async {
    final now = DateTime.now();
    final dayStart = DateTime(
      now.year,
      now.month,
      now.day,
    ).millisecondsSinceEpoch;
    final nextDay = DateTime(
      now.year,
      now.month,
      now.day + 1,
    ).millisecondsSinceEpoch;
    final saleTotals = await widget.database
        .customSelect(
          'SELECT COUNT(*) AS sale_count, COALESCE(SUM(total_mmk), 0) AS sales_mmk '
          'FROM shop_sales WHERE created_at_millis >= ? AND created_at_millis < ?',
          variables: [Variable<int>(dayStart), Variable<int>(nextDay)],
        )
        .getSingle();
    final products = await widget.database.readActiveProducts();
    final recentSales = await widget.database.readRecentSales(limit: 4);
    final pendingWallet = await widget.database.readPendingWalletCheckout();
    return _TodaySnapshot(
      salesMmk: saleTotals.read<int>('sales_mmk'),
      saleCount: saleTotals.read<int>('sale_count'),
      products: products.length,
      productPreview: products.take(4).toList(),
      recentSales: recentSales,
      // There is no configured reorder point yet. Name the exact rule in UI.
      stockToCheck: products.where((item) => item.onHand <= 5).toList(),
      pendingWallet: pendingWallet,
    );
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    final next = _readSnapshot();
    setState(() {
      _snapshot = next;
    });
    try {
      await next;
    } catch (_) {
      // FutureBuilder presents a retry state; refresh must not throw into UI.
    }
  }

  Future<void> _open(ShopTodayDestination destination) async {
    await destination(context);
    if (mounted) await _refresh();
  }

  Future<void> _openSale() => widget.onNewSale(context);

  Future<void> _openFirstProduct() => widget.onAddFirstProduct(context);

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 700;
    final desktop = width >= 1100;
    return Scaffold(
      appBar: AppBar(
        title: Text(_copy('SuperMega Shop', 'SuperMega ဆိုင်')),
        actions: compact
            ? [
                IconButton(
                  tooltip: _copy('Settings', 'ဆက်တင်များ'),
                  onPressed: () => _open(widget.onSettings),
                  icon: const Icon(Icons.settings_outlined),
                ),
                const SizedBox(width: 8),
              ]
            : null,
      ),
      body: Row(
        children: [
          if (!compact) ...[
            ShopTaskRail(
              myanmar: widget.myanmar,
              extended: desktop,
              selectedIndex: 0,
              onDestinationSelected: (index) {
                if (index == 1) _openSale();
                if (index == 2) _open(widget.onSales);
                if (index == 3) _open(widget.onStock);
                if (index == 4) _open(widget.onSettings);
              },
            ),
            const VerticalDivider(width: 1),
          ],
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<_TodaySnapshot>(
                future: _snapshot,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(24),
                      children: [
                        Text(
                          _copy(
                            'Could not read today’s records. Try again.',
                            'ယနေ့မှတ်တမ်းများကို ဖတ်၍မရပါ။ ထပ်မံကြိုးစားပါ။',
                          ),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: OutlinedButton(
                            onPressed: _refresh,
                            child: Text(_copy('Retry', 'ထပ်စမ်းရန်')),
                          ),
                        ),
                      ],
                    );
                  }
                  if (!snapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  return LayoutBuilder(
                    builder: (context, constraints) => _content(
                      snapshot.data!,
                      constraints.maxWidth,
                      compact: compact,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: compact
          ? ShopTaskBottomBar(
              myanmar: widget.myanmar,
              selectedIndex: 0,
              onDestinationSelected: (index) {
                if (index == 1) _openSale();
                if (index == 2) _open(widget.onSales);
                if (index == 3) _open(widget.onStock);
              },
            )
          : null,
    );
  }

  Widget _content(
    _TodaySnapshot snapshot,
    double width, {
    required bool compact,
  }) {
    final inset = compact ? 16.0 : 24.0;
    final contentWidth = (width - inset * 2).clamp(0.0, 1180.0).toDouble();
    final threeAcross = contentWidth >= 900;
    final smallCardWidth = threeAcross
        ? (contentWidth - 24) / 3
        : contentWidth >= 600
        ? (contentWidth - 12) / 2
        : contentWidth;
    final salesWidth = compact ? contentWidth : smallCardWidth;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(inset, compact ? 18 : 30, inset, 32),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1180),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (compact) ...[
                  _heading(showNewSale: false),
                ] else
                  _heading(showNewSale: snapshot.products > 0),
                if (snapshot.products > 0 ||
                    snapshot.saleCount > 0 ||
                    snapshot.pendingWallet != null) ...[
                  const SizedBox(height: 22),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _metric(
                        width: salesWidth,
                        label: _copy('Sales today', 'ယနေ့ရောင်းအား'),
                        value: _money(snapshot.salesMmk),
                        icon: Icons.payments_outlined,
                      ),
                      if (compact)
                        _compactStats(snapshot, width: contentWidth)
                      else ...[
                        _metric(
                          width: smallCardWidth,
                          label: _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                          value: _number(snapshot.saleCount),
                          icon: Icons.receipt_long_outlined,
                        ),
                        _metric(
                          width: smallCardWidth,
                          label: _copy(
                            '5 or fewer left',
                            '၅ ခု သို့မဟုတ် အောက် လက်ကျန်',
                          ),
                          value: _number(snapshot.stockToCheck.length),
                          icon: Icons.inventory_2_outlined,
                        ),
                      ],
                    ],
                  ),
                ],
                if (snapshot.pendingWallet != null ||
                    snapshot.stockToCheck.isNotEmpty ||
                    snapshot.products == 0) ...[
                  const SizedBox(height: 26),
                  Text(
                    snapshot.products == 0
                        ? _copy('Get started', 'စတင်ရန်')
                        : _copy('Needs attention', 'စစ်ဆေးရန်'),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  if (snapshot.pendingWallet != null)
                    _actionCard(
                      icon: Icons.qr_code_2_outlined,
                      title: _copy(
                        'Mobile payment to review',
                        'မိုဘိုင်းငွေပေးချေမှု စစ်ဆေးရန်',
                      ),
                      detail: _money(snapshot.pendingWallet!.totalMmk),
                      action: _copy('Review payment', 'ငွေပေးချေမှု စစ်ရန်'),
                      onTap: () => _openSale(),
                    ),
                  if (snapshot.stockToCheck.isNotEmpty)
                    _actionCard(
                      icon: Icons.inventory_2_outlined,
                      title: _copy('Check stock', 'လက်ကျန်စစ်ရန်'),
                      detail: snapshot.stockToCheck
                          .take(3)
                          .map(
                            (item) => '${item.name} · ${_number(item.onHand)}',
                          )
                          .join('   '),
                      action: _copy('Open stock', 'လက်ကျန်ဖွင့်ရန်'),
                      onTap: () => _open(widget.onStock),
                    ),
                  if (snapshot.products == 0)
                    _actionCard(
                      icon: Icons.add_box_outlined,
                      title: _copy(
                        'Add your first product',
                        'ပထမကုန်ပစ္စည်းကို ထည့်ပါ',
                      ),
                      detail: _copy(
                        'Enter its name, price and starting stock.',
                        'အမည်၊ ဈေးနှုန်းနှင့် စတင်လက်ကျန်ကို ထည့်ပါ။',
                      ),
                      action: _copy('Add product', 'ကုန်ပစ္စည်းထည့်ရန်'),
                      onTap: () => _openFirstProduct(),
                    ),
                ],
                if (snapshot.products > 0) ...[
                  const SizedBox(height: 24),
                  if (contentWidth >= 760 && snapshot.recentSales.isNotEmpty)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _productsPreview(snapshot)),
                        const SizedBox(width: 12),
                        Expanded(child: _salesPreview(snapshot)),
                      ],
                    )
                  else ...[
                    _productsPreview(snapshot),
                    if (snapshot.recentSales.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _salesPreview(snapshot),
                    ],
                  ],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _heading({required bool showNewSale}) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _copy('Today', 'ယနေ့'),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 4),
            Text(
              MaterialLocalizations.of(context)
                  .formatMediumDate(DateTime.now()),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
      if (showNewSale)
        FilledButton.icon(
          onPressed: () => _openSale(),
          icon: const Icon(Icons.add),
          label: Text(_copy('New sale', 'အရောင်းအသစ်')),
        ),
    ],
  );

  Widget _productsPreview(_TodaySnapshot snapshot) => _previewPanel(
    title: _copy('Products', 'ကုန်ပစ္စည်းများ'),
    action: _copy('View stock', 'လက်ကျန်ကြည့်ရန်'),
    onOpen: () => _open(widget.onStock),
    rows: [
      for (final product in snapshot.productPreview)
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            _copy(
              '${_number(product.onHand)} in stock',
              'လက်ကျန် ${_number(product.onHand)} ခု',
            ),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: product.onHand <= 5
                  ? Theme.of(context).colorScheme.error
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          trailing: Text(
            _money(product.priceMmk),
            style: Theme.of(context).textTheme.labelLarge
                ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ),
    ],
  );

  Widget _salesPreview(_TodaySnapshot snapshot) => _previewPanel(
    title: _copy('Recent sales', 'မကြာသေးမီက အရောင်းများ'),
    action: _copy('View sales', 'အရောင်းကြည့်ရန်'),
    onOpen: () => _open(widget.onSales),
    rows: [
      for (final sale in snapshot.recentSales)
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            sale.lines.isEmpty
                ? _copy('Sale', 'အရောင်း')
                : sale.lines.length == 1
                ? '${sale.lines.first.productName} × ${_number(sale.lines.first.quantity)}'
                : _copy(
                    '${sale.lines.length} products',
                    'ကုန်ပစ္စည်း ${_number(sale.lines.length)} မျိုး',
                  ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            MaterialLocalizations.of(context).formatTimeOfDay(
              TimeOfDay.fromDateTime(
                DateTime.fromMillisecondsSinceEpoch(sale.createdAtMillis),
              ),
            ),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          trailing: Text(
            _money(sale.totalMmk),
            style: Theme.of(context).textTheme.labelLarge
                ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ),
    ],
  );

  Widget _previewPanel({
    required String title,
    required String action,
    required VoidCallback onOpen,
    required List<Widget> rows,
  }) => Card(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final heading = Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              );
              final open = TextButton(onPressed: onOpen, child: Text(action));
              if (constraints.maxWidth < 340) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [heading, open],
                );
              }
              return Row(
                children: [
                  Expanded(child: heading),
                  open,
                ],
              );
            },
          ),
          const Divider(height: 8),
          for (var index = 0; index < rows.length; index++) ...[
            rows[index],
            if (index < rows.length - 1) const Divider(height: 1),
          ],
        ],
      ),
    ),
  );

  Widget _metric({
    required double width,
    required String label,
    required String value,
    required IconData icon,
  }) => SizedBox(
    width: width,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    maxLines: 2,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                Icon(icon, color: Theme.of(context).colorScheme.primary),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _compactStats(_TodaySnapshot snapshot, {required double width}) =>
      SizedBox(
        width: width,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _compactStat(
                    _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                    _number(snapshot.saleCount),
                  ),
                ),
                const SizedBox(width: 12),
                Container(width: 1, height: 64, color: const Color(0xffe2e5ed)),
                const SizedBox(width: 12),
                Expanded(
                  child: _compactStat(
                    _copy('5 or fewer left', '၅ ခု သို့မဟုတ် အောက် လက်ကျန်'),
                    _number(snapshot.stockToCheck.length),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _compactStat(String label, String value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: Theme.of(context).textTheme.bodyMedium
            ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
      const SizedBox(height: 8),
      Text(
        value,
        style: Theme.of(context).textTheme.titleLarge
            ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      ),
    ],
  );

  Widget _actionCard({
    required IconData icon,
    required String title,
    required String detail,
    required String action,
    required VoidCallback onTap,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Tooltip(
      message: action,
      child: Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 10,
          ),
          leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
          title: Text(title, style: Theme.of(context).textTheme.titleMedium),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      ),
    ),
  );
}
