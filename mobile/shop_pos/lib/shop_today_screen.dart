import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';

import 'shop_copy.dart';
import 'shop_database.dart';

typedef ShopTodayDestination = Future<void> Function(BuildContext context);

/// A local operating view. It never presents a device sale as a synced order.
class ShopTodayScreen extends StatefulWidget {
  const ShopTodayScreen({
    required this.database,
    required this.myanmar,
    required this.onNewSale,
    required this.onSales,
    required this.onStock,
    required this.onSettings,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ShopTodayDestination onNewSale;
  final ShopTodayDestination onSales;
  final ShopTodayDestination onStock;
  final ShopTodayDestination onSettings;

  @override
  State<ShopTodayScreen> createState() => _ShopTodayScreenState();
}

class _TodaySnapshot {
  const _TodaySnapshot({
    required this.salesMmk,
    required this.saleCount,
    required this.products,
    required this.stockToCheck,
    required this.pendingWallet,
  });

  final int salesMmk;
  final int saleCount;
  final int products;
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

  String _copy(String english, String burmese) =>
      shopCopy(widget.myanmar, english, burmese);

  String _number(int value) {
    final digits = value.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
    if (!widget.myanmar) return digits;
    const burmese = '၀၁၂၃၄၅၆၇၈၉';
    return digits.replaceAllMapped(
      RegExp(r'\d'),
      (match) => burmese[int.parse(match.group(0)!)],
    );
  }

  String _money(int value) =>
      widget.myanmar ? '${_number(value)} ကျပ်' : '${_number(value)} MMK';

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
    final pendingWallet = await widget.database.readPendingWalletCheckout();
    return _TodaySnapshot(
      salesMmk: saleTotals.read<int>('sales_mmk'),
      saleCount: saleTotals.read<int>('sale_count'),
      products: products.length,
      // There is no configured reorder point yet. Name the exact rule in UI.
      stockToCheck: products.where((item) => item.onHand <= 5).toList(),
      pendingWallet: pendingWallet,
    );
  }

  Future<void> _refresh() async {
    final next = _readSnapshot();
    setState(() => _snapshot = next);
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
            ColoredBox(
              color: Colors.white,
              child: NavigationRail(
                extended: desktop,
                minWidth: 76,
                minExtendedWidth: 190,
                selectedIndex: 0,
                labelType: desktop
                    ? NavigationRailLabelType.none
                    : NavigationRailLabelType.all,
                onDestinationSelected: (index) {
                  if (index == 1) _open(widget.onNewSale);
                  if (index == 2) _open(widget.onSales);
                  if (index == 3) _open(widget.onStock);
                  if (index == 4) _open(widget.onSettings);
                },
                destinations: [
                  NavigationRailDestination(
                    icon: const Icon(Icons.home_outlined),
                    selectedIcon: const Icon(Icons.home),
                    label: Text(_copy('Today', 'ယနေ့')),
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.point_of_sale_outlined),
                    label: Text(_copy('Sell', 'ရောင်းရန်')),
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: Text(_copy('Sales', 'အရောင်း')),
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.inventory_2_outlined),
                    label: Text(_copy('Stock', 'လက်ကျန်')),
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.settings_outlined),
                    label: Text(_copy('Settings', 'ဆက်တင်များ')),
                  ),
                ],
              ),
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
          ? SafeArea(
              top: false,
              child: NavigationBar(
                selectedIndex: 0,
                onDestinationSelected: (index) {
                  if (index == 1) _open(widget.onNewSale);
                  if (index == 2) _open(widget.onSales);
                  if (index == 3) _open(widget.onStock);
                },
                destinations: [
                  NavigationDestination(
                    icon: const Icon(Icons.home_outlined),
                    selectedIcon: const Icon(Icons.home),
                    label: _copy('Today', 'ယနေ့'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.point_of_sale_outlined),
                    label: _copy('Sell', 'ရောင်းရန်'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: _copy('Sales', 'အရောင်း'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.inventory_2_outlined),
                    label: _copy('Stock', 'လက်ကျန်'),
                  ),
                ],
              ),
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
        : compact && contentWidth >= 340
        ? (contentWidth - 12) / 2
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
                  _heading(showNewSale: true),
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
                ),
                if (snapshot.pendingWallet != null ||
                    snapshot.stockToCheck.isNotEmpty ||
                    snapshot.products == 0) ...[
                  const SizedBox(height: 26),
                  Text(
                    _copy('Needs attention', 'စစ်ဆေးရန်'),
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
                      onTap: () => _open(widget.onNewSale),
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
                        'Start with one product',
                        'ကုန်ပစ္စည်းတစ်မျိုးမှ စတင်ပါ',
                      ),
                      detail: _copy(
                        'Add a name, price and starting stock in Counter.',
                        'အရောင်းကောင်တာတွင် အမည်၊ ဈေးနှုန်းနှင့် စတင်လက်ကျန်ကို ထည့်ပါ။',
                      ),
                      action: _copy('Open Counter', 'အရောင်းကောင်တာ ဖွင့်ရန်'),
                      onTap: () => _open(widget.onNewSale),
                    ),
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
              style: Theme.of(context).textTheme.headlineSmall
                  ?.copyWith(fontSize: 34),
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
          onPressed: () => _open(widget.onNewSale),
          icon: const Icon(Icons.add),
          label: Text(_copy('New sale', 'အရောင်းအသစ်')),
        ),
    ],
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
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
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
