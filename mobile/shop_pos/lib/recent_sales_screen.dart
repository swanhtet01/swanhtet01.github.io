import 'dart:async';

import 'package:flutter/material.dart';

import 'printer_services.dart';
import 'printer_setup_screen.dart';
import 'shop_copy.dart';
import 'shop_correction_authorization_service.dart';
import 'shop_database.dart';
import 'shop_sale_correction_dialog.dart';
import 'shop_runtime_scope.dart';
import 'shop_today_screen.dart';

enum _SaleDetailsAction { correct }

class RecentSalesScreen extends StatefulWidget {
  RecentSalesScreen({
    required this.database,
    required this.myanmar,
    this.reprintService,
    this.correctionAuthorizer,
    ShopRuntimeScope? runtimeScope,
    this.testOnlyAllowMissingRuntimeScope = false,
    this.embeddedTaskShell = false,
    this.refreshToken = 0,
    super.key,
  }) : runtimeScope = requireShopRuntimeScopeOrTestSeam(
         runtimeScope,
         testOnlyAllowMissingRuntimeScope: testOnlyAllowMissingRuntimeScope,
       );

  final ShopDatabase database;
  final bool myanmar;
  final ReceiptReprintService? reprintService;
  final ShopCorrectionAuthorizer? correctionAuthorizer;
  final ShopRuntimeScope? runtimeScope;
  final bool testOnlyAllowMissingRuntimeScope;
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
      widget.reprintService ??
      ReceiptReprintService(runtimeScope: widget.runtimeScope);
  bool _reprinting = false;
  bool _openingCorrection = false;

  Future<ShopManagedWorkspaceBinding?> _correctionBinding() async {
    final authorizer = widget.correctionAuthorizer;
    if (authorizer == null) return null;
    try {
      final binding = await widget.database.readManagedWorkspaceBinding();
      if (binding == null) return null;
      final available = await authorizer.canRequestAuthorization(
        workspaceId: binding.workspaceId,
        requiredActorId: binding.attachedActorId,
        capability: shopFullSaleReversalCapability,
      );
      return available ? binding : null;
    } catch (_) {
      return null;
    }
  }

  Future<List<ShopSaleReceipt>> _readPage() => widget.database.readRecentSales(
    limit: _pageSize + 1,
    offset: _page * _pageSize,
    query: _query,
  );

  void _reload() {
    setState(() {
      _sales = _readPage();
    });
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
                                : const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final sale = sales[index];
                              final firstItem = sale.lines.isEmpty
                                  ? shopCopy(widget.myanmar, 'Sale', 'အရောင်း')
                                  : sale.lines.first.productName;
                              final more = sale.lines.length > 1
                                  ? ' +${shopNumber(sale.lines.length - 1, myanmar: widget.myanmar)}'
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
                                                sale.reversal == null
                                                    ? _whenCompact(
                                                        context,
                                                        sale.createdAtMillis,
                                                      )
                                                    : '${shopCopy(widget.myanmar, 'Reversed', 'ပြန်လှန်ချိန်')} ${_whenCompact(context, sale.reversal!.createdAtMillis)}',
                                                style: sale.reversal == null
                                                    ? Theme.of(context)
                                                          .textTheme
                                                          .bodySmall
                                                    : Theme.of(context)
                                                          .textTheme
                                                          .bodySmall
                                                          ?.copyWith(
                                                            color: Theme.of(
                                                              context,
                                                            ).colorScheme.error,
                                                            fontWeight:
                                                                FontWeight.w700,
                                                          ),
                                              ),
                                              Text(
                                                _paymentName(
                                                  sale.paymentMethod,
                                                ),
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall,
                                              ),
                                              if (sale.reversal != null)
                                                Text(
                                                  shopCopy(
                                                    widget.myanmar,
                                                    'Sold ${_whenCompact(context, sale.createdAtMillis)}',
                                                    'မူလရောင်းချိန် ${_whenCompact(context, sale.createdAtMillis)}',
                                                  ),
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .bodySmall
                                                      ?.copyWith(
                                                        color: Theme.of(context)
                                                            .colorScheme
                                                            .onSurfaceVariant,
                                                      ),
                                                ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              }
                              return Card(
                                clipBehavior: Clip.antiAlias,
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 8,
                                  ),
                                  title: Text(
                                    '$firstItem$more',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                  ),
                                  subtitle: Text(
                                    sale.reversal == null
                                        ? '${_when(context, sale.createdAtMillis)} · ${_paymentName(sale.paymentMethod)}'
                                        : '${shopCopy(widget.myanmar, 'Reversed', 'ပြန်လှန်ချိန်')} ${_when(context, sale.reversal!.createdAtMillis)} · '
                                              '${shopCopy(widget.myanmar, 'sold', 'မူလရောင်းချိန်')} ${_when(context, sale.createdAtMillis)} · '
                                              '${_paymentName(sale.paymentMethod)}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurfaceVariant,
                                        ),
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        shopMmk(
                                          sale.totalMmk,
                                          myanmar: widget.myanmar,
                                        ),
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.w700,
                                              fontFeatures: const [
                                                FontFeature.tabularFigures(),
                                              ],
                                            ),
                                      ),
                                      const SizedBox(width: 12),
                                      const Icon(Icons.chevron_right, size: 20),
                                    ],
                                  ),
                                  onTap: () => _showSale(sale),
                                ),
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
    if (widget.myanmar) return _myanmarDateTime(date);
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatMediumDate(date)} '
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
  }

  String _whenCompact(BuildContext context, int millis) {
    final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
    if (widget.myanmar) return _myanmarDateTime(date);
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatShortDate(date)} '
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
  }

  String _myanmarDateTime(DateTime date) {
    String digits(int value) => value
        .toString()
        .split('')
        .map((digit) => shopNumber(int.parse(digit), myanmar: true))
        .join();
    String two(int value) => digits(value).padLeft(2, '၀');
    return '${two(date.day)}/${two(date.month)}/'
        '${digits(date.year)} '
        '${two(date.hour)}:${two(date.minute)}';
  }

  String _paymentName(String method) => switch (method) {
    'cash' => shopCopy(widget.myanmar, 'Cash', 'ငွေသား'),
    'kbzpay' => 'KBZPay',
    'wavepay' => 'WavePay',
    _ => method,
  };

  Future<void> _showSale(ShopSaleReceipt sale) async {
    final correctionBinding = sale.reversal == null
        ? await _correctionBinding()
        : null;
    if (!mounted) return;
    final soldTimeLabel = shopCopy(
      widget.myanmar,
      sale.reversal == null ? 'Sold' : 'Original sale',
      'မူလရောင်းချိန်',
    );
    final action = await showDialog<_SaleDetailsAction>(
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
                Text(
                  '$soldTimeLabel: ${_when(dialogContext, sale.createdAtMillis)}',
                ),
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
                        Flexible(
                          child: Text(
                            shopMmk(line.lineTotalMmk, myanmar: widget.myanmar),
                            textAlign: TextAlign.end,
                          ),
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
                    Flexible(
                      child: Text(
                        shopMmk(sale.totalMmk, myanmar: widget.myanmar),
                        textAlign: TextAlign.end,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${shopCopy(widget.myanmar, 'Payment', 'ငွေပေးချေမှု')}: '
                  '${_paymentName(sale.paymentMethod)}',
                ),
                if (sale.reversal case final ShopSaleReversal reversal) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(dialogContext).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shopCopy(
                            widget.myanmar,
                            'Reversed — original sale retained',
                            'ပြန်လှန်ပြီး — မူလအရောင်းမှတ်တမ်းကို ထိန်းသိမ်းထားသည်',
                          ),
                          style: Theme.of(dialogContext).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${shopCopy(widget.myanmar, 'Reason', 'အကြောင်းရင်း')}: ${reversal.reason}',
                        ),
                        Text(
                          '${shopCopy(widget.myanmar, 'Reversed', 'ပြန်လှန်ချိန်')}: ${_when(dialogContext, reversal.createdAtMillis)}',
                        ),
                        Text(
                          '${shopCopy(widget.myanmar, 'Recorded actor', 'မှတ်တမ်းတင်သူ')}: ${reversal.authorizedActorLabel}',
                        ),
                        if (reversal.authorizationProofKind ==
                            shopCorrectionAuthorizationProofKindLegacyV1)
                          Text(
                            shopCopy(
                              widget.myanmar,
                              'Correction authorization: Migrated record — server authorization unverified.',
                              'ပြင်ဆင်မှုခွင့်ပြုချက်: မှတ်တမ်းဟောင်းမှ ပြောင်းရွှေ့ထားပြီး ဆာဗာခွင့်ပြုချက်ကို အတည်မပြုထားပါ။',
                            ),
                          ),
                        Text(
                          reversal.restockItems
                              ? shopCopy(
                                  widget.myanmar,
                                  'All original quantities were returned to stock.',
                                  'မူလပစ္စည်းအရေအတွက်အားလုံးကို လက်ကျန်ထဲ ပြန်ထည့်ထားသည်။',
                                )
                              : shopCopy(
                                  widget.myanmar,
                                  'Stock was not changed.',
                                  'လက်ကျန်ပမာဏကို မပြောင်းထားပါ။',
                                ),
                        ),
                        if (reversal.originalPaymentMethod != 'cash')
                          Text(
                            reversal.walletReconciliationPending
                                ? shopCopy(
                                    widget.myanmar,
                                    'Wallet reconciliation pending. No outgoing money return has been verified.',
                                    'Wallet စာရင်းညှိခြင်း ဆိုင်းငံ့ထားသည်။ အပြင်သို့ ငွေပြန်ပို့ပြီးကြောင်း အတည်မပြုရသေးပါ။',
                                  )
                                : reversal.walletReconciliationOutcome ==
                                      'money_returned'
                                ? shopCopy(
                                    widget.myanmar,
                                    'Money returned was separately confirmed with provider evidence.',
                                    'ငွေပြန်ပို့ပြီးကြောင်းကို ဝန်ဆောင်မှုပေးသူ အထောက်အထားဖြင့် သီးခြားအတည်ပြုထားသည်။',
                                  )
                                : shopCopy(
                                    widget.myanmar,
                                    'The original wallet payment was separately confirmed not received; no money return was recorded.',
                                    'မူလ Wallet ငွေပေးချေမှု မရရှိခဲ့ကြောင်း သီးခြားအတည်ပြုထားပြီး ငွေပြန်ပို့မှုကို မှတ်တမ်းမတင်ထားပါ။',
                                  ),
                          ),
                        if (reversal.walletEvidenceReference
                            case final String evidence)
                          Text(
                            '${shopCopy(widget.myanmar, 'Evidence reference', 'အထောက်အထား ရည်ညွှန်းချက်')}: $evidence',
                          ),
                        if (reversal.walletReconciledAtMillis
                            case final int reconciledAt)
                          Text(
                            '${shopCopy(widget.myanmar, 'Reconciled', 'စာရင်းညှိချိန်')}: ${_when(dialogContext, reconciledAt)}'
                            '${reversal.walletReconciledActorLabel == null ? '' : ' · ${reversal.walletReconciledActorLabel}'}',
                          ),
                        if (reversal.walletReconciliationProofKind ==
                            shopCorrectionAuthorizationProofKindLegacyV1)
                          Text(
                            shopCopy(
                              widget.myanmar,
                              'Wallet reconciliation authorization: Migrated record — server authorization unverified.',
                              'Wallet စာရင်းညှိခြင်း ခွင့်ပြုချက်: မှတ်တမ်းဟောင်းမှ ပြောင်းရွှေ့ထားပြီး ဆာဗာခွင့်ပြုချက်ကို အတည်မပြုထားပါ။',
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          if (sale.reversal == null && correctionBinding != null)
            TextButton.icon(
              key: const ValueKey('shop-sale-correct'),
              onPressed: _openingCorrection
                  ? null
                  : () {
                      if (_openingCorrection) return;
                      _openingCorrection = true;
                      Navigator.of(dialogContext)
                          .pop(_SaleDetailsAction.correct);
                    },
              icon: const Icon(Icons.history_outlined),
              label: Text(
                shopCopy(widget.myanmar, 'Correct sale', 'အရောင်းပြင်ဆင်ရန်'),
              ),
            ),
          if (sale.reversal == null)
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
    if (action == _SaleDetailsAction.correct) {
      try {
        await _openSaleCorrection(sale);
      } finally {
        _openingCorrection = false;
      }
    } else {
      _openingCorrection = false;
    }
  }

  Future<void> _openSaleCorrection(ShopSaleReceipt sale) async {
    final binding = await _correctionBinding();
    final authorizer = widget.correctionAuthorizer;
    if (!mounted) return;
    if (binding == null || authorizer == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            shopCopy(
              widget.myanmar,
              'Online workspace-owner authorization is unavailable. Nothing was changed.',
              'အွန်လိုင်း လုပ်ငန်းနေရာပိုင်ရှင်ခွင့်ပြုချက် မရနိုင်ပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
            ),
          ),
        ),
      );
      return;
    }
    final result = await showShopSaleCorrectionDialog(
      context: context,
      database: widget.database,
      sale: sale,
      workspaceBinding: binding,
      authorizer: authorizer,
      myanmar: widget.myanmar,
    );
    if (!mounted || result == null) return;
    _reload();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result == ShopSaleCorrectionResult.corrected
              ? shopCopy(
                  widget.myanmar,
                  'Sale corrected. The original sale remains in the audit record.',
                  'အရောင်းကို ပြင်ဆင်ပြီးပါပြီ။ မူလအရောင်းသည် စာရင်းစစ်မှတ်တမ်းတွင် ဆက်လက်ရှိနေပါသည်။',
                )
              : shopCopy(
                  widget.myanmar,
                  'This sale was already corrected. The sales list was refreshed.',
                  'ဤအရောင်းကို ပြင်ဆင်ပြီးသားဖြစ်သည်။ အရောင်းစာရင်းကို ပြန်ဖတ်ပြီးပါပြီ။',
                ),
        ),
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
            builder: (_) => PrinterSetupScreen(
              myanmar: widget.myanmar,
              runtimeScope: widget.runtimeScope,
              testOnlyAllowMissingRuntimeScope:
                  widget.testOnlyAllowMissingRuntimeScope,
            ),
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
              'Sale is saved. Printing is unconfirmed; the receipt may have printed. Check the paper before trying again.',
              'အရောင်းသိမ်းပြီးပါပြီ။ ပုံနှိပ်မှု မသေချာပါ။ ပြေစာ ပုံနှိပ်ပြီး ဖြစ်နိုင်သည်။ ထပ်မစမ်းမီ စာရွက်ကို စစ်ပါ။',
            ),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _reprinting = false);
    }
  }
}
