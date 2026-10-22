import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';

import 'shop_copy.dart';
import 'shop_database.dart';

typedef ShopTodayDestination = Future<void> Function(BuildContext context);

/// One heading scale for the four daily tasks, in either app language.
class ShopTaskPageHeader extends StatelessWidget {
  const ShopTaskPageHeader({
    required this.title,
    required this.myanmar,
    this.subtitle,
    this.trailing,
    super.key,
  });

  final String title;
  final bool myanmar;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final headingSize = width >= 1100
        ? (myanmar ? 29.0 : 34.0)
        : width >= 820
        ? (myanmar ? 26.0 : 30.0)
        : (myanmar ? 23.0 : 26.0);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontSize: headingSize,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 12), trailing!],
      ],
    );
  }
}

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
  Widget build(BuildContext context) {
    final compactLargeText =
        MediaQuery.sizeOf(context).width < 360 &&
        MediaQuery.textScalerOf(context).scale(1) > 1.2;
    final navigationTheme = Theme.of(context).navigationBarTheme;
    return NavigationBarTheme(
      data: navigationTheme.copyWith(
        labelTextStyle: compactLargeText
            ? WidgetStateProperty.resolveWith<TextStyle?>(
                (states) => navigationTheme.labelTextStyle
                    ?.resolve(states)
                    ?.copyWith(fontSize: 11.5),
              )
            : null,
      ),
      child: SafeArea(
        top: false,
        child: NavigationBar(
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
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
      ),
    );
  }
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
    this.embeddedTaskShell = false,
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
  final bool embeddedTaskShell;

  @override
  State<ShopTodayScreen> createState() => _ShopTodayScreenState();
}

class _TodaySnapshot {
  const _TodaySnapshot({
    required this.salesMmk,
    required this.saleCount,
    required this.products,
    required this.recentSales,
    required this.stockToCheck,
    required this.pendingWallet,
  });

  final int salesMmk;
  final int saleCount;
  final int products;
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
    final stockToCheck = products.where((item) => item.onHand <= 5).toList()
      ..sort((a, b) {
        final stockOrder = a.onHand.compareTo(b.onHand);
        return stockOrder != 0 ? stockOrder : a.name.compareTo(b.name);
      });
    final recentSales = await widget.database.readRecentSales(limit: 4);
    final pendingWallet = await widget.database.readPendingWalletCheckout();
    return _TodaySnapshot(
      salesMmk: saleTotals.read<int>('sales_mmk'),
      saleCount: saleTotals.read<int>('sale_count'),
      products: products.length,
      recentSales: recentSales,
      // There is no configured reorder point yet. Name the exact rule in UI.
      stockToCheck: stockToCheck,
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
    final compact = width < 1100;
    final desktop = width >= 1100;
    return Scaffold(
      appBar: widget.embeddedTaskShell
          ? null
          : AppBar(
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
          if (!compact && !widget.embeddedTaskShell) ...[
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
      bottomNavigationBar: compact && !widget.embeddedTaskShell
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
    final phoneLayout = compact && contentWidth < 600;
    final threeAcross = contentWidth >= 900;
    final hasStockAlert = snapshot.stockToCheck.isNotEmpty;
    final smallCardWidth = threeAcross && hasStockAlert
        ? (contentWidth - 24) / 3
        : contentWidth >= 600
        ? (contentWidth - 12) / 2
        : contentWidth;
    final salesWidth = phoneLayout ? contentWidth : smallCardWidth;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(inset, phoneLayout ? 12 : 16, inset, 32),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1180),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (phoneLayout) ...[
                  _heading(showNewSale: false),
                  if (snapshot.products > 0) ...[
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _openSale,
                      icon: const Icon(Icons.point_of_sale_outlined),
                      label: Text(_copy('New sale', 'အရောင်းအသစ်')),
                    ),
                  ],
                ] else
                  _heading(showNewSale: snapshot.products > 0),
                if (snapshot.products > 0 ||
                    snapshot.saleCount > 0 ||
                    snapshot.pendingWallet != null) ...[
                  SizedBox(height: phoneLayout ? 16 : 22),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _metric(
                        width: salesWidth,
                        label: _copy('Sales today', 'ယနေ့ရောင်းအား'),
                        value: _money(snapshot.salesMmk),
                        icon: Icons.payments_outlined,
                        emphasized: true,
                      ),
                      if (phoneLayout)
                        _compactStats(snapshot, width: contentWidth)
                      else ...[
                        _metric(
                          width: smallCardWidth,
                          label: _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                          value: _number(snapshot.saleCount),
                          icon: Icons.receipt_long_outlined,
                        ),
                        if (hasStockAlert)
                          _metric(
                            width: smallCardWidth,
                            label: _copy(
                              'Low-stock products',
                              'လက်ကျန်နည်းသော ကုန်ပစ္စည်းများ',
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
                if (snapshot.recentSales.isNotEmpty) ...[
                  SizedBox(height: phoneLayout ? 16 : 24),
                  _salesPreview(snapshot),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _heading({required bool showNewSale}) => ShopTaskPageHeader(
    title: _copy('Today', 'ယနေ့'),
    myanmar: widget.myanmar,
    subtitle: MaterialLocalizations.of(context)
        .formatMediumDate(DateTime.now()),
    trailing: showNewSale
        ? FilledButton.icon(
            onPressed: () => _openSale(),
            icon: const Icon(Icons.add),
            label: Text(_copy('New sale', 'အရောင်းအသစ်')),
          )
        : null,
  );

  Widget _salesPreview(_TodaySnapshot snapshot) => _previewPanel(
    title: _copy('Recent sales', 'မကြာသေးမီက အရောင်းများ'),
    action: _copy('View sales', 'အရောင်းကြည့်ရန်'),
    onOpen: () => _open(widget.onSales),
    rows: [
      for (final sale in snapshot.recentSales)
        _recentSaleRow(sale),
    ],
  );

  Widget _recentSaleRow(ShopSaleReceipt sale) => LayoutBuilder(
    builder: (context, constraints) {
      final title = Text(
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
        style: Theme.of(context).textTheme.bodyLarge
            ?.copyWith(fontWeight: FontWeight.w600),
      );
      final time = Text(
        MaterialLocalizations.of(context).formatTimeOfDay(
          TimeOfDay.fromDateTime(
            DateTime.fromMillisecondsSinceEpoch(sale.createdAtMillis),
          ),
        ),
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      );
      final amount = Text(
        _money(sale.totalMmk),
        style: Theme.of(context).textTheme.labelLarge
            ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      );
      if (constraints.maxWidth >= 340) {
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(vertical: 6),
          title: title,
          subtitle: time,
          trailing: amount,
        );
      }
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            title,
            const SizedBox(height: 4),
            OverflowBar(
              alignment: MainAxisAlignment.spaceBetween,
              overflowAlignment: OverflowBarAlignment.end,
              overflowSpacing: 4,
              children: [time, amount],
            ),
          ],
        ),
      );
    },
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
                style: constraints.maxWidth < 340
                    ? Theme.of(context).textTheme.titleMedium
                    : Theme.of(context).textTheme.titleLarge,
              );
              if (constraints.maxWidth < 340) {
                return Row(
                  children: [
                    Expanded(child: heading),
                    IconButton(
                      tooltip: action,
                      onPressed: onOpen,
                      icon: const Icon(Icons.arrow_forward),
                    ),
                  ],
                );
              }
              final open = TextButton(onPressed: onOpen, child: Text(action));
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
    bool emphasized = false,
  }) => SizedBox(
    width: width,
    child: Card(
      color: emphasized ? Theme.of(context).colorScheme.primaryContainer : null,
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
            child: snapshot.stockToCheck.isEmpty
                ? _compactStatRow(
                    _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                    _number(snapshot.saleCount),
                  )
                : width < 330
                ? Column(
                    children: [
                      _compactStatRow(
                        _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                        _number(snapshot.saleCount),
                      ),
                      const Divider(height: 20),
                      _compactStatRow(
                        _copy(
                          'Low-stock products',
                          'လက်ကျန်နည်းသော ကုန်ပစ္စည်းများ',
                        ),
                        _number(snapshot.stockToCheck.length),
                      ),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _compactStat(
                          _copy('Completed sales', 'ပြီးစီးသောအရောင်း'),
                          _number(snapshot.saleCount),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        width: 1,
                        height: 64,
                        color: const Color(0xffe2e5ed),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _compactStat(
                          _copy(
                            'Low-stock products',
                            'လက်ကျန်နည်းသော ကုန်ပစ္စည်းများ',
                          ),
                          _number(snapshot.stockToCheck.length),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      );

  Widget _compactStatRow(String label, String value) => Row(
    children: [
      Expanded(
        child: Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ),
      const SizedBox(width: 12),
      Text(
        value,
        style: Theme.of(context).textTheme.titleLarge
            ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      ),
    ],
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
