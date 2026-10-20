import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'menu_import_screen.dart';
import 'printer_setup_screen.dart';
import 'printer_services.dart';
import 'recent_sales_screen.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';
import 'wallet_setup_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  final supabaseUrl = const String.fromEnvironment('SUPABASE_URL');
  final publishableKey = const String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
  );
  SupabaseClient? authClient;
  if (supabaseUrl.isNotEmpty && publishableKey.isNotEmpty) {
    await Supabase.initialize(url: supabaseUrl, publishableKey: publishableKey);
    authClient = Supabase.instance.client;
  }
  runApp(
    ShopApp(
      database: ShopDatabase(),
      authClient: authClient,
      apiBaseUrl: const String.fromEnvironment(
        'SHOP_API_BASE_URL',
        defaultValue: 'https://app.supermega.dev',
      ),
      initialMyanmar: preferences.getBool('shop_locale_myanmar') ?? false,
    ),
  );
}

class ShopApp extends StatefulWidget {
  const ShopApp({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.initialMyanmar,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool initialMyanmar;

  @override
  State<ShopApp> createState() => _ShopAppState();
}

class _ShopAppState extends State<ShopApp> {
  late bool _myanmar = widget.initialMyanmar;

  Future<void> _setLanguage(bool myanmar) async {
    setState(() => _myanmar = myanmar);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool('shop_locale_myanmar', myanmar);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SuperMega Shop',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff5146e5)),
        scaffoldBackgroundColor: const Color(0xfff7f8fb),
        cardTheme: const CardThemeData(
          color: Colors.white,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(18)),
            side: BorderSide(color: Color(0xffe4e7ef)),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
          ),
          filled: true,
          fillColor: Colors.white,
        ),
      ),
      home: ShopHome(
        database: widget.database,
        authClient: widget.authClient,
        apiBaseUrl: widget.apiBaseUrl,
        myanmar: _myanmar,
        onLanguageChanged: _setLanguage,
      ),
    );
  }
}

class ShopHome extends StatefulWidget {
  const ShopHome({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.myanmar,
    required this.onLanguageChanged,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool myanmar;
  final ValueChanged<bool> onLanguageChanged;

  @override
  State<ShopHome> createState() => _ShopHomeState();
}

class _ShopHomeState extends State<ShopHome> {
  final _search = TextEditingController();
  final _cart = <String, int>{};
  String? _operationId;
  bool _saving = false;
  PendingWalletCheckout? _pendingWalletCheckout;

  @override
  void initState() {
    super.initState();
    _loadPendingWalletCheckout();
  }

  Future<void> _loadPendingWalletCheckout() async {
    try {
      final pending = await widget.database.readPendingWalletCheckout();
      if (mounted) setState(() => _pendingWalletCheckout = pending);
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not check for an unfinished wallet payment.',
            'မပြီးသေးသော wallet ငွေပေးချေမှုကို စစ်မရပါ။',
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(widget.myanmar, 'Shop', 'ဆိုင်')),
        actions: [
          IconButton(
            tooltip: shopCopy(
              widget.myanmar,
              'Recent sales',
              'မကြာသေးမီက အရောင်းများ',
            ),
            icon: const Icon(Icons.receipt_long_outlined),
            onPressed: _openRecentSales,
          ),
          IconButton(
            tooltip: shopCopy(widget.myanmar, 'Receipt printer', 'ပြေစာပရင်တာ'),
            icon: const Icon(Icons.print_outlined),
            onPressed: _openPrinter,
          ),
          IconButton(
            tooltip: shopCopy(widget.myanmar, 'Settings', 'ဆက်တင်များ'),
            icon: const Icon(Icons.settings_outlined),
            onPressed: _openSettings,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: StreamBuilder<List<ShopProduct>>(
          stream: widget.database.watchActiveProducts(),
          builder: (context, snapshot) {
            final products = snapshot.data ?? const <ShopProduct>[];
            if (MediaQuery.sizeOf(context).width >= 940) {
              return Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        children: [
                          _deviceNotice(),
                          if (_pendingWalletCheckout != null) ...[
                            const SizedBox(height: 12),
                            _pendingWalletCheckoutCard(),
                          ],
                          const SizedBox(height: 14),
                          Expanded(child: _catalog(products)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 18),
                    Expanded(child: _cartPanel(products)),
                  ],
                ),
              );
            }
            return Column(
              children: [
                _deviceNotice(),
                if (_pendingWalletCheckout != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                    child: _pendingWalletCheckoutCard(),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 12, 10),
                  child: _catalogHeader(),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _searchField(products),
                ),
                const SizedBox(height: 8),
                Expanded(child: _productList(products)),
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: _cart.isEmpty
          ? null
          : SafeArea(
              top: false,
              minimum: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: StreamBuilder<List<ShopProduct>>(
                stream: widget.database.watchActiveProducts(),
                builder: (context, snapshot) {
                  final products = snapshot.data ?? const <ShopProduct>[];
                  final count = _cart.values.fold<int>(0, (a, b) => a + b);
                  return FilledButton.icon(
                    onPressed: _saving ? null : () => _showCart(products),
                    icon: const Icon(Icons.shopping_basket_outlined),
                    label: Text(
                      shopCopy(
                        widget.myanmar,
                        'Review sale · $count · ${_mmk(_cartTotal(products))}',
                        'အရောင်းစစ်ရန် · $count ခု · ${_mmk(_cartTotal(products))}',
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }

  Widget _pendingWalletCheckoutCard() {
    final checkout = _pendingWalletCheckout!;
    final provider = checkout.paymentMethod == 'kbzpay' ? 'KBZPay' : 'WavePay';
    return Card(
      color: const Color(0xfffff8e8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              shopCopy(
                widget.myanmar,
                'Payment still needs checking',
                'ငွေပေးချေမှု စစ်ဆေးရန်ကျန်နေပါသည်',
              ),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text('$provider · ${_mmk(checkout.totalMmk)}'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                FilledButton.tonal(
                  onPressed: _saving ? null : _resumePendingWalletCheckout,
                  child: Text(
                    shopCopy(widget.myanmar, 'Resume payment', 'ပြန်စစ်ဆေးရန်'),
                  ),
                ),
                TextButton(
                  onPressed: _saving ? null : _cancelPendingWalletCheckout,
                  child: Text(
                    shopCopy(
                      widget.myanmar,
                      'I checked: no payment arrived',
                      'စစ်ပြီးပါပြီ၊ ငွေမဝင်သေးပါ',
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _deviceNotice() => Material(
    color: Theme.of(context).colorScheme.secondaryContainer,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.offline_bolt_outlined, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              shopCopy(
                widget.myanmar,
                'Ready to sell · saved on this device',
                'အရောင်းအတွက်အသင့် · ဤစက်တွင် သိမ်းထားသည်',
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _catalog(List<ShopProduct> products) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _catalogHeader(),
          const SizedBox(height: 12),
          _searchField(products),
          const SizedBox(height: 8),
          Expanded(child: _productList(products)),
        ],
      ),
    ),
  );

  Widget _catalogHeader() => Row(
    children: [
      Expanded(
        child: Text(
          shopCopy(widget.myanmar, 'Products', 'ကုန်ပစ္စည်းများ'),
          style: Theme.of(context).textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      IconButton(
        tooltip: shopCopy(
          widget.myanmar,
          'Import menu photo',
          'မီနူးဓာတ်ပုံထည့်ရန်',
        ),
        onPressed: _openMenuImport,
        icon: const Icon(Icons.document_scanner_outlined),
      ),
      FilledButton.icon(
        onPressed: _showAddProduct,
        icon: const Icon(Icons.add),
        label: Text(shopCopy(widget.myanmar, 'Add item', 'ပစ္စည်းထည့်ရန်')),
      ),
    ],
  );

  Widget _searchField(List<ShopProduct> products) => TextField(
    controller: _search,
    onChanged: (_) => setState(() {}),
    onSubmitted: (value) {
      final code = value.trim();
      final matches = products.where((item) => item.barcode == code);
      if (code.isNotEmpty && matches.isNotEmpty) {
        _add(matches.first);
        _search.clear();
        setState(() {});
      }
    },
    decoration: InputDecoration(
      prefixIcon: const Icon(Icons.search),
      hintText: shopCopy(
        widget.myanmar,
        'Search or scan barcode',
        'ရှာရန် သို့မဟုတ် ဘားကုဒ်ဖတ်ရန်',
      ),
      suffixIcon: _search.text.isEmpty
          ? null
          : IconButton(
              tooltip: shopCopy(
                widget.myanmar,
                'Clear search',
                'ရှာဖွေမှုဖျက်ရန်',
              ),
              onPressed: () {
                _search.clear();
                setState(() {});
              },
              icon: const Icon(Icons.close),
            ),
    ),
  );

  Widget _productList(List<ShopProduct> products) {
    final text = _search.text.trim().toLowerCase();
    final visible = products
        .where(
          (item) =>
              text.isEmpty ||
              item.name.toLowerCase().contains(text) ||
              (item.barcode?.toLowerCase().contains(text) ?? false),
        )
        .toList();
    if (visible.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                text.isEmpty ? Icons.inventory_2_outlined : Icons.search_off,
                size: 38,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 10),
              Text(
                text.isEmpty
                    ? shopCopy(
                        widget.myanmar,
                        'Your catalog is empty',
                        'ကုန်ပစ္စည်းစာရင်း မရှိသေးပါ',
                      )
                    : shopCopy(
                        widget.myanmar,
                        'No matching products',
                        'ကိုက်ညီသောပစ္စည်း မတွေ့ပါ',
                      ),
              ),
              if (text.isEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  shopCopy(
                    widget.myanmar,
                    'Add an item or review a menu photo to start.',
                    'စတင်ရန် ပစ္စည်းထည့်ပါ သို့မဟုတ် မီနူးဓာတ်ပုံကို စစ်ဆေးပါ။',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _openMenuImport,
                  icon: const Icon(Icons.document_scanner_outlined),
                  label: Text(
                    shopCopy(
                      widget.myanmar,
                      'Import menu photo',
                      'မီနူးဓာတ်ပုံထည့်ရန်',
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: visible.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, indent: 16, endIndent: 16),
      itemBuilder: (context, index) {
        final item = visible[index];
        final details =
            '${_mmk(item.priceMmk)} · ${item.onHand} ${shopCopy(widget.myanmar, 'in stock', 'ခုလက်ကျန်')}'
            '${item.barcode == null ? '' : ' · ${item.barcode}'}';
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 4,
          ),
          title: Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(details, maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: IconButton.filledTonal(
            tooltip: shopCopy(
              widget.myanmar,
              'Add to sale',
              'အရောင်းထဲထည့်ရန်',
            ),
            onPressed: item.onHand == 0 || _pendingWalletCheckout != null
                ? null
                : () => _add(item),
            icon: const Icon(Icons.add),
          ),
          onTap: item.onHand == 0 || _pendingWalletCheckout != null
              ? null
              : () => _add(item),
        );
      },
    );
  }

  Widget _cartPanel(List<ShopProduct> products, {StateSetter? refresh}) {
    final byId = {for (final item in products) item.id: item};
    final entries = _cart.entries
        .where((entry) => byId.containsKey(entry.key))
        .toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    shopCopy(widget.myanmar, 'Current sale', 'လက်ရှိအရောင်း'),
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                if (entries.isNotEmpty)
                  TextButton(
                    onPressed: _saving || _pendingWalletCheckout != null
                        ? null
                        : () {
                            setState(_clearCart);
                            refresh?.call(() {});
                          },
                    child: Text(shopCopy(widget.myanmar, 'Clear', 'ဖျက်ရန်')),
                  ),
              ],
            ),
            const Divider(height: 24),
            if (_pendingWalletCheckout != null) ...[
              _pendingWalletCheckoutCard(),
              const SizedBox(height: 8),
            ],
            if (entries.isEmpty)
              Expanded(
                child: Center(
                  child: Text(
                    shopCopy(
                      widget.myanmar,
                      'Add products to start a sale.',
                      'အရောင်းစရန် ပစ္စည်းထည့်ပါ。',
                    ),
                  ),
                ),
              )
            else ...[
              Expanded(
                child: ListView.separated(
                  itemCount: entries.length,
                  separatorBuilder: (_, _) => const Divider(height: 16),
                  itemBuilder: (context, index) {
                    final entry = entries[index];
                    return _cartLine(
                      byId[entry.key]!,
                      entry.value,
                      refresh: refresh,
                    );
                  },
                ),
              ),
              const Divider(height: 20),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      shopCopy(widget.myanmar, 'Total', 'စုစုပေါင်း'),
                    ),
                  ),
                  Text(
                    _mmk(
                      _pendingWalletCheckout?.totalMmk ?? _cartTotal(products),
                    ),
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _saving || _pendingWalletCheckout != null
                          ? null
                          : () => _completeSale(closeSheet: refresh != null),
                      icon: _saving
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check),
                      label: Text(
                        shopCopy(widget.myanmar, 'Cash sale', 'ငွေသား'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: _saving
                        ? null
                        : () => _startWalletSale(
                            products: products,
                            closeSheet: refresh != null,
                          ),
                    icon: const Icon(Icons.qr_code_2),
                    label: Text(
                      shopCopy(widget.myanmar, 'Wallet QR', 'Wallet QR'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _cartLine(ShopProduct item, int quantity, {StateSetter? refresh}) {
    WalletCheckoutLineSnapshot? snapshot;
    for (final line
        in _pendingWalletCheckout?.lines ??
            const <WalletCheckoutLineSnapshot>[]) {
      if (line.productId == item.id) {
        snapshot = line;
        break;
      }
    }
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                snapshot?.productName ?? item.name,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(
                '${_mmk(snapshot?.unitPriceMmk ?? item.priceMmk)} × $quantity',
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: shopCopy(widget.myanmar, 'Remove one', 'တစ်ခုလျှော့ရန်'),
          onPressed: _saving || _pendingWalletCheckout != null
              ? null
              : () => _adjust(item, -1, refresh: refresh),
          icon: const Icon(Icons.remove_circle_outline),
        ),
        Text(quantity.toString()),
        IconButton(
          tooltip: shopCopy(widget.myanmar, 'Add one', 'တစ်ခုထပ်ထည့်ရန်'),
          onPressed:
              _saving ||
                  _pendingWalletCheckout != null ||
                  quantity >= item.onHand
              ? null
              : () => _adjust(item, 1, refresh: refresh),
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    );
  }

  void _add(ShopProduct product) {
    if (_pendingWalletCheckout != null) return;
    final quantity = _cart[product.id] ?? 0;
    if (quantity >= product.onHand) {
      _message(
        shopCopy(
          widget.myanmar,
          'Not enough stock available.',
          'လက်ကျန်ပစ္စည်း မလုံလောက်ပါ။',
        ),
      );
      return;
    }
    setState(() {
      _cart[product.id] = quantity + 1;
      _operationId ??= const Uuid().v4();
    });
  }

  void _adjust(ShopProduct product, int delta, {StateSetter? refresh}) {
    if (_pendingWalletCheckout != null) return;
    final quantity = (_cart[product.id] ?? 0) + delta;
    if (quantity > product.onHand) {
      _message(
        shopCopy(
          widget.myanmar,
          'Not enough stock available.',
          'လက်ကျန်ပစ္စည်း မလုံလောက်ပါ။',
        ),
      );
      return;
    }
    setState(() {
      if (quantity <= 0) {
        _cart.remove(product.id);
        if (_cart.isEmpty) _operationId = null;
      } else {
        _cart[product.id] = quantity;
      }
    });
    refresh?.call(() {});
  }

  int _cartTotal(List<ShopProduct> products) {
    final byId = {for (final item in products) item.id: item};
    return _cart.entries.fold<int>(
      0,
      (sum, entry) => sum + (byId[entry.key]?.priceMmk ?? 0) * entry.value,
    );
  }

  void _clearCart() {
    _cart.clear();
    _operationId = null;
  }

  Future<void> _startWalletSale({
    required List<ShopProduct> products,
    required bool closeSheet,
  }) async {
    if (_saving || _operationId == null || _cart.isEmpty) return;
    try {
      if (_pendingWalletCheckout != null) {
        await _resumePendingWalletCheckout(closeSheet: closeSheet);
        return;
      }
      final profiles = await widget.database.readWalletSetups();
      final available = [
        for (final profile in profiles)
          if (qrPayloadForDisplay(
                profile.officialQrPayload,
                confirmedAsProviderIssued: profile.issuerConfirmed,
              ) !=
              null)
            MerchantWalletSetup(
              provider: profile.provider,
              merchantPhone: profile.merchantPhone,
              officialQrPayload: profile.officialQrPayload,
              issuerConfirmed: profile.issuerConfirmed,
            ),
      ];
      if (!mounted) return;
      if (available.isEmpty) {
        _message(
          shopCopy(
            widget.myanmar,
            'Add a provider-issued merchant QR in Settings first.',
            'ဆက်တင်များတွင် ဝန်ဆောင်မှုပေးသူထုတ်ပေးသော ဆိုင် QR ကို အရင်ထည့်ပါ။',
          ),
        );
        await _openWalletSetup();
        return;
      }
      final selected = available.length == 1
          ? available.single
          : await showModalBottomSheet<MerchantWalletSetup>(
              context: context,
              builder: (sheetContext) => SafeArea(
                child: ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      shopCopy(
                        widget.myanmar,
                        'Choose payment method',
                        'ငွေပေးချေမှုနည်းလမ်းရွေးပါ',
                      ),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    for (final method in available)
                      ListTile(
                        leading: const Icon(
                          Icons.account_balance_wallet_outlined,
                        ),
                        title: Text(method.provider),
                        subtitle: Text(method.merchantPhone ?? ''),
                        onTap: () => Navigator.of(sheetContext).pop(method),
                      ),
                  ],
                ),
              ),
            );
      if (selected == null || !mounted) return;
      final operationId = _operationId!;
      final intent = await widget.database.createWalletCheckoutIntent(
        operationId: operationId,
        merchant: selected,
        lines: [
          for (final entry in _cart.entries)
            ShopSaleLineInput(productId: entry.key, quantity: entry.value),
        ],
      );
      if (!mounted) return;
      setState(() => _pendingWalletCheckout = intent);
      await _showWalletCheckout(intent, selected, closeSheet: closeSheet);
    } catch (error) {
      if (mounted) {
        _message(
          error is StateError
              ? error.message.toString()
              : shopCopy(
                  widget.myanmar,
                  'Payment setup could not be loaded. The basket is unchanged.',
                  'ငွေပေးချေမှုဆက်တင် မဖွင့်နိုင်ပါ။ Basket ကို မပြောင်းထားပါ။',
                ),
        );
      }
    }
  }

  Future<void> _resumePendingWalletCheckout({bool closeSheet = false}) async {
    final intent = _pendingWalletCheckout;
    if (intent == null || _saving) return;
    try {
      final provider = intent.paymentMethod == 'kbzpay' ? 'KBZPay' : 'WavePay';
      if (qrPayloadForDisplay(
            intent.merchantQrPayload,
            confirmedAsProviderIssued: true,
          ) ==
          null) {
        _message(
          shopCopy(
            widget.myanmar,
            'The saved QR could not be checked. Do not confirm payment here.',
            'သိမ်းထားသော QR ကို စစ်မရပါ။ ဤနေရာတွင် ငွေပေးချေမှုကို အတည်မပြုပါနှင့်။',
          ),
        );
        return;
      }
      final method = MerchantWalletSetup(
        provider: provider,
        merchantPhone: intent.merchantPhone,
        officialQrPayload: intent.merchantQrPayload,
        issuerConfirmed: true,
      );
      setState(() {
        _cart
          ..clear()
          ..addEntries(
            intent.lines.map((line) => MapEntry(line.productId, line.quantity)),
          );
        _operationId = intent.operationId;
      });
      await _showWalletCheckout(intent, method, closeSheet: closeSheet);
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'The saved payment could not be reopened. Your sale is still pending.',
            'သိမ်းထားသော ငွေပေးချေမှုကို ပြန်မဖွင့်နိုင်ပါ။ အရောင်းကို ဆိုင်းငံ့ထားဆဲဖြစ်သည်။',
          ),
        );
      }
    }
  }

  Future<void> _showWalletCheckout(
    PendingWalletCheckout intent,
    MerchantWalletSetup method, {
    required bool closeSheet,
  }) async {
    final selected = await showDialog<MerchantWalletSetup>(
      context: context,
      builder: (_) => _WalletCheckoutDialog(
        methods: [method],
        totalMmk: intent.totalMmk,
        myanmar: widget.myanmar,
      ),
    );
    if (selected == null || !mounted) return;
    await _completeSale(
      closeSheet: closeSheet,
      paymentMethod: intent.paymentMethod,
      walletCheckoutOperationId: intent.operationId,
    );
  }

  Future<void> _cancelPendingWalletCheckout() async {
    final intent = _pendingWalletCheckout;
    if (intent == null || _saving) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          shopCopy(
            widget.myanmar,
            'Cancel this payment check?',
            'ဤငွေပေးချေမှုစစ်ဆေးခြင်းကို ပယ်ဖျက်မလား။',
          ),
        ),
        content: Text(
          shopCopy(
            widget.myanmar,
            'Only cancel after checking the wallet and confirming no payment arrived. The sale will not be recorded.',
            'Wallet ကိုစစ်ပြီး ငွေမဝင်ကြောင်း သေချာမှသာ ပယ်ဖျက်ပါ။ အရောင်းကို မှတ်တမ်းတင်မည်မဟုတ်ပါ။',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(
              shopCopy(widget.myanmar, 'Keep pending', 'ဆိုင်းငံ့ထားပါ'),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              shopCopy(widget.myanmar, 'Cancel checkout', 'ပယ်ဖျက်ရန်'),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final cancelled = await widget.database.cancelWalletCheckoutIntent(
        intent.operationId,
      );
      if (!mounted || !cancelled) return;
      setState(() {
        _pendingWalletCheckout = null;
        _operationId = _cart.isEmpty ? null : const Uuid().v4();
      });
      _message(
        shopCopy(
          widget.myanmar,
          'Unpaid checkout cancelled. The basket is still here.',
          'ငွေမဝင်သော checkout ကို ပယ်ဖျက်ပြီးပါပြီ။ Basket ကို မဖျက်ထားပါ။',
        ),
      );
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not cancel this checkout. It remains pending.',
            'Checkout ကို ပယ်ဖျက်မရပါ။ ဆိုင်းငံ့ထားဆဲဖြစ်သည်။',
          ),
        );
      }
    }
  }

  Future<void> _completeSale({
    required bool closeSheet,
    String paymentMethod = 'cash',
    String? walletCheckoutOperationId,
  }) async {
    final operationId = _operationId;
    if (_saving || operationId == null || _cart.isEmpty) return;
    if (_pendingWalletCheckout != null && walletCheckoutOperationId == null) {
      _message(
        shopCopy(
          widget.myanmar,
          'Resume or cancel the wallet payment before recording another sale.',
          'အခြားအရောင်းမမှတ်မီ wallet ငွေပေးချေမှုကို ပြန်စစ်ပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
        ),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final receipt = await widget.database.recordSale(
        operationId: operationId,
        paymentMethod: paymentMethod,
        walletCheckoutOperationId: walletCheckoutOperationId,
        lines: [
          for (final entry in _cart.entries)
            ShopSaleLineInput(productId: entry.key, quantity: entry.value),
        ],
      );
      if (!mounted) return;
      setState(() {
        _clearCart();
        _pendingWalletCheckout = null;
        _saving = false;
      });
      if (closeSheet) Navigator.of(context).pop();
      var printed = false;
      var printFailed = false;
      try {
        final host = await ReceiptPrinterSettings().readHost();
        if (host != null) {
          await ShopReceiptPrinter().printSale(
            host,
            receipt,
            myanmar: widget.myanmar,
          );
          printed = true;
        }
      } catch (_) {
        // The local sale is committed before printing; printer errors never
        // turn a completed sale into a failed checkout.
        printFailed = true;
      }
      if (!mounted) return;
      _message(
        printed
            ? shopCopy(
                widget.myanmar,
                'Sale saved · ${_mmk(receipt.totalMmk)} · receipt sent',
                'အရောင်းသိမ်းပြီး · ${_mmk(receipt.totalMmk)} · ပြေစာပို့ပြီး',
              )
            : printFailed
            ? shopCopy(
                widget.myanmar,
                'Sale saved · ${_mmk(receipt.totalMmk)} · receipt not printed',
                'အရောင်းသိမ်းပြီး · ${_mmk(receipt.totalMmk)} · ပြေစာမပုံနှိပ်နိုင်ပါ',
              )
            : shopCopy(
                widget.myanmar,
                'Sale saved · ${_mmk(receipt.totalMmk)} · this device',
                'အရောင်းသိမ်းပြီး · ${_mmk(receipt.totalMmk)} · ဤစက်တွင်',
              ),
        action: (printed || printFailed)
            ? SnackBarAction(
                label: shopCopy(
                  widget.myanmar,
                  printed ? 'Send again' : 'Retry print',
                  printed ? 'ထပ်ပို့ရန်' : 'ထပ်စမ်းရန်',
                ),
                onPressed: () => _printReceipt(receipt),
              )
            : null,
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      _message(
        error is StateError
            ? error.message.toString()
            : shopCopy(
                widget.myanmar,
                'Sale could not be saved. Try again.',
                'အရောင်းသိမ်း၍မရပါ။ ထပ်ကြိုးစားပါ။',
              ),
      );
    }
  }

  Future<void> _printReceipt(ShopSaleReceipt receipt) async {
    try {
      final host = await ReceiptPrinterSettings().readHost();
      if (host == null) {
        _openPrinter();
        return;
      }
      await ShopReceiptPrinter().printSale(
        host,
        receipt,
        myanmar: widget.myanmar,
      );
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Receipt sent to printer.',
            'ပြေစာကို ပရင်တာသို့ ပို့ပြီးပါပြီ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Sale is saved. Receipt could not print; check the printer and retry.',
            'အရောင်းသိမ်းပြီးပါပြီ။ ပြေစာမပုံနှိပ်နိုင်ပါ။ ပရင်တာစစ်ပြီး ထပ်ကြိုးစားပါ။',
          ),
          action: SnackBarAction(
            label: shopCopy(widget.myanmar, 'Retry', 'ထပ်စမ်းရန်'),
            onPressed: () => _printReceipt(receipt),
          ),
        );
      }
    }
  }

  Future<void> _showCart(List<ShopProduct> products) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, refresh) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .72,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: _cartPanel(products, refresh: refresh),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showAddProduct() async {
    final values = await showDialog<_NewShopProduct>(
      context: context,
      builder: (_) => _NewShopProductDialog(myanmar: widget.myanmar),
    );
    if (values == null) return;
    try {
      await widget.database.addProduct(
        id: const Uuid().v4(),
        name: values.name,
        barcode: values.barcode,
        priceMmk: values.priceMmk,
        openingStock: values.openingStock,
      );
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Product saved on this device.',
            'ကုန်ပစ္စည်းကို ဤစက်တွင် သိမ်းပြီးပါပြီ။',
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        _message(
          error is StateError
              ? error.message.toString()
              : 'Could not save product.',
        );
      }
    }
  }

  void _openMenuImport() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => MenuImportScreen(
        database: widget.database,
        authClient: widget.authClient,
        apiBaseUrl: widget.apiBaseUrl,
        myanmar: widget.myanmar,
      ),
    ),
  );

  void _openPrinter() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => PrinterSetupScreen(myanmar: widget.myanmar),
    ),
  );

  void _openRecentSales() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) =>
          RecentSalesScreen(database: widget.database, myanmar: widget.myanmar),
    ),
  );

  void _openSettings() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => ShopSettingsScreen(
        database: widget.database,
        myanmar: widget.myanmar,
        onLanguageChanged: widget.onLanguageChanged,
      ),
    ),
  );

  Future<void> _openWalletSetup() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) =>
          WalletSetupScreen(database: widget.database, myanmar: widget.myanmar),
    ),
  );

  void _message(String text, {SnackBarAction? action}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), action: action));
  }
}

String _mmk(int amount) => shopMmk(amount);

class _WalletCheckoutDialog extends StatefulWidget {
  const _WalletCheckoutDialog({
    required this.methods,
    required this.totalMmk,
    required this.myanmar,
  });

  final List<MerchantWalletSetup> methods;
  final int totalMmk;
  final bool myanmar;

  @override
  State<_WalletCheckoutDialog> createState() => _WalletCheckoutDialogState();
}

class _WalletCheckoutDialogState extends State<_WalletCheckoutDialog> {
  late MerchantWalletSetup _selected = widget.methods.first;
  bool _verified = false;

  @override
  Widget build(BuildContext context) {
    final myanmar = widget.myanmar;
    final payload = qrPayloadForDisplay(
      _selected.officialQrPayload,
      confirmedAsProviderIssued: _selected.issuerConfirmed,
    )!;
    return AlertDialog(
      title: Text(shopCopy(myanmar, 'Mobile money', 'မိုဘိုင်းငွေပေးချေမှု')),
      content: SizedBox(
        width: 380,
        height: MediaQuery.sizeOf(context).height * .58,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.methods.length > 1)
                Wrap(
                  spacing: 8,
                  children: [
                    for (final method in widget.methods)
                      ChoiceChip(
                        label: Text(method.provider),
                        selected: method.provider == _selected.provider,
                        onSelected: (selected) {
                          if (!selected) return;
                          setState(() {
                            _selected = method;
                            _verified = false;
                          });
                        },
                      ),
                  ],
                ),
              Text(
                shopCopy(myanmar, 'Amount to receive', 'လက်ခံရမည့်ငွေ'),
                textAlign: TextAlign.center,
              ),
              Text(
                _mmk(widget.totalMmk),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Center(
                child: Semantics(
                  container: true,
                  excludeSemantics: true,
                  image: true,
                  label: '${_selected.provider} merchant QR',
                  child: QrImageView(
                    data: payload,
                    size: 220,
                    semanticsLabel: '${_selected.provider} merchant QR',
                  ),
                ),
              ),
              Text(
                _selected.provider,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (_selected.merchantPhone != null)
                Text(_selected.merchantPhone!, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                shopCopy(
                  myanmar,
                  'Ask the customer to scan this merchant QR and enter the amount above. Check the recipient and incoming payment in your wallet app before confirming here.',
                  'ဝယ်သူကို ဤဆိုင် QR ကို scan လုပ်ပြီး အပေါ်ပါငွေပမာဏ ရိုက်ထည့်ခိုင်းပါ။ ဤနေရာတွင် အတည်မပြုမီ wallet app ထဲရှိ လက်ခံသူနှင့် ဝင်လာသောငွေကို စစ်ပါ။',
                ),
              ),
              const SizedBox(height: 8),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _verified,
                onChanged: (value) =>
                    setState(() => _verified = value ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(
                  shopCopy(
                    myanmar,
                    'I verified this payment in the wallet app.',
                    'Wallet app တွင် ဤငွေပေးချေမှုကို စစ်ဆေးပြီးပါပြီ။',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(shopCopy(myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
        ),
        FilledButton(
          onPressed: _verified
              ? () => Navigator.of(context).pop(_selected)
              : null,
          child: Text(
            shopCopy(
              myanmar,
              'Confirm received',
              'ငွေလက်ခံပြီးကြောင်း အတည်ပြုရန်',
            ),
          ),
        ),
      ],
    );
  }
}

class _NewShopProduct {
  const _NewShopProduct({
    required this.name,
    required this.barcode,
    required this.priceMmk,
    required this.openingStock,
  });

  final String name;
  final String? barcode;
  final int priceMmk;
  final int openingStock;
}

class _NewShopProductDialog extends StatefulWidget {
  const _NewShopProductDialog({required this.myanmar});

  final bool myanmar;

  @override
  State<_NewShopProductDialog> createState() => _NewShopProductDialogState();
}

class _NewShopProductDialogState extends State<_NewShopProductDialog> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _barcode = TextEditingController();
  final _price = TextEditingController();
  final _stock = TextEditingController(text: '0');

  @override
  void dispose() {
    _name.dispose();
    _barcode.dispose();
    _price.dispose();
    _stock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(shopCopy(widget.myanmar, 'Add product', 'ကုန်ပစ္စည်းထည့်ရန်')),
    content: Form(
      key: _formKey,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              key: const ValueKey('shop-product-name'),
              controller: _name,
              autofocus: true,
              decoration: InputDecoration(
                labelText: shopCopy(
                  widget.myanmar,
                  'Product name',
                  'ကုန်ပစ္စည်းအမည်',
                ),
              ),
              validator: (value) => value == null || value.trim().isEmpty
                  ? shopCopy(widget.myanmar, 'Enter a name.', 'အမည်ထည့်ပါ။')
                  : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              key: const ValueKey('shop-product-barcode'),
              controller: _barcode,
              decoration: InputDecoration(
                labelText: shopCopy(
                  widget.myanmar,
                  'Barcode (optional)',
                  'ဘားကုဒ် (မဖြစ်မနေမဟုတ်ပါ)',
                ),
              ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              key: const ValueKey('shop-product-price'),
              controller: _price,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: shopCopy(
                  widget.myanmar,
                  'Price · MMK',
                  'ဈေးနှုန်း · ကျပ်',
                ),
              ),
              validator: (value) {
                final amount = int.tryParse(value?.trim() ?? '');
                return amount == null || amount < 0 || amount > 2000000000
                    ? shopCopy(
                        widget.myanmar,
                        'Enter a whole MMK amount.',
                        'ကျပ်ဈေးနှုန်းကို ဂဏန်းအပြည့်ထည့်ပါ။',
                      )
                    : null;
              },
            ),
            const SizedBox(height: 10),
            TextFormField(
              key: const ValueKey('shop-product-stock'),
              controller: _stock,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: shopCopy(
                  widget.myanmar,
                  'Opening stock',
                  'စတင်လက်ကျန်',
                ),
              ),
              validator: (value) {
                final count = int.tryParse(value?.trim() ?? '');
                return count == null || count < 0 || count > 2000000000
                    ? shopCopy(
                        widget.myanmar,
                        'Enter a whole stock count.',
                        'လက်ကျန်အရေအတွက်ကို ဂဏန်းအပြည့်ထည့်ပါ။',
                      )
                    : null;
              },
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
      ),
      FilledButton(
        onPressed: () {
          if (!(_formKey.currentState?.validate() ?? false)) return;
          Navigator.of(context).pop(
            _NewShopProduct(
              name: _name.text.trim(),
              barcode: _barcode.text.trim().isEmpty
                  ? null
                  : _barcode.text.trim(),
              priceMmk: int.parse(_price.text.trim()),
              openingStock: int.parse(_stock.text.trim()),
            ),
          );
        },
        child: Text(shopCopy(widget.myanmar, 'Save product', 'သိမ်းရန်')),
      ),
    ],
  );
}

class _SetupTile extends StatelessWidget {
  const _SetupTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      leading: CircleAvatar(
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
        child: Icon(icon, color: Theme.of(context).colorScheme.primary),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(subtitle),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

class ShopSettingsScreen extends StatefulWidget {
  const ShopSettingsScreen({
    required this.database,
    required this.myanmar,
    required this.onLanguageChanged,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final ValueChanged<bool> onLanguageChanged;

  @override
  State<ShopSettingsScreen> createState() => _ShopSettingsScreenState();
}

class _ShopSettingsScreenState extends State<ShopSettingsScreen> {
  late bool _myanmar = widget.myanmar;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(shopCopy(_myanmar, 'Settings', 'ဆက်တင်များ'))),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          shopCopy(_myanmar, 'Language', 'ဘာသာစကား'),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('English')),
            ButtonSegment(value: true, label: Text('မြန်မာ')),
          ],
          selected: {_myanmar},
          onSelectionChanged: (values) {
            final selected = values.first;
            setState(() => _myanmar = selected);
            widget.onLanguageChanged(selected);
          },
        ),
        const SizedBox(height: 20),
        _SetupTile(
          icon: Icons.account_balance_wallet_outlined,
          title: shopCopy(_myanmar, 'Mobile money', 'မိုဘိုင်းငွေပေးချေမှု'),
          subtitle: shopCopy(
            _myanmar,
            'Save merchant details and provider-issued QR codes.',
            'ဆိုင်ရှင်အချက်အလက်နှင့် ငွေပေးချေမှုပေးသူထုတ်ပေးသော QR ကို သိမ်းပါ။',
          ),
          onTap: () => Navigator.of(context).push<void>(
            MaterialPageRoute<void>(
              builder: (_) => WalletSetupScreen(
                database: widget.database,
                myanmar: _myanmar,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
