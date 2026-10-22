import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'camera_barcode_scanner.dart';
import 'connected_orders_screen.dart';
import 'menu_import_screen.dart';
import 'menu_import_service.dart';
import 'printer_setup_screen.dart';
import 'printer_services.dart';
import 'recent_sales_screen.dart';
import 'shop_backup.dart';
import 'shop_backup_export_screen.dart';
import 'shop_cash_shift_screen.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';
import 'shop_startup.dart';
import 'shop_today_screen.dart';
import 'stock_screen.dart';
import 'wallet_setup_screen.dart';

const _pendingPickerIntentKey = 'shop_pending_picker_intent';
// Enable only after the scoped server route passes hosted two-tenant acceptance.
const _connectedOrdersEnabled = bool.fromEnvironment(
  'SHOP_CONNECTED_ORDERS_ENABLED',
  defaultValue: false,
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  late final Directory documents;
  try {
    documents = await getApplicationDocumentsDirectory();
    await ShopBackup.cleanupInterruptedStaging(
      documents,
      restoreTarget: ShopDatabase.privateDatabaseFile(documents),
    );
  } catch (_) {
    final myanmar = preferences.getBool('shop_locale_myanmar') ?? false;
    runApp(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                shopCopy(
                  myanmar,
                  'Shop could not safely check local storage. Your records were not opened. Restart the app or contact support.',
                  'စက်တွင်းသိမ်းဆည်းမှုကို လုံခြုံစွာ စစ်၍မရပါ။ သင့်မှတ်တမ်းများကို မဖွင့်ရသေးပါ။ အက်ပ်ကို ပြန်ဖွင့်ပါ သို့မဟုတ် အကူအညီတောင်းပါ။',
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
    return;
  }
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
    ShopStartup(
      documents: documents,
      initialMyanmar: preferences.getBool('shop_locale_myanmar') ?? false,
      buildShop: (database, myanmar) => ShopApp(
        database: database,
        authClient: authClient,
        apiBaseUrl: const String.fromEnvironment(
          'SHOP_API_BASE_URL',
          defaultValue: 'https://app.supermega.dev',
        ),
        initialMyanmar: myanmar,
      ),
    ),
  );
}

class ShopApp extends StatefulWidget {
  const ShopApp({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.initialMyanmar,
    this.initialCounter = false,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool initialMyanmar;

  /// Opens Counter directly for a focused cashier journey or widget test.
  final bool initialCounter;

  @override
  State<ShopApp> createState() => _ShopAppState();
}

class _ShopAppState extends State<ShopApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _counterKey = GlobalKey<_ShopHomeState>();
  late bool _myanmar = widget.initialMyanmar;
  int _workspaceTab = 0;
  int _todayRefreshToken = 0;
  int _salesRefreshToken = 0;
  int _addProductRequest = 0;
  bool _counterOpened = false;
  bool _salesOpened = false;
  bool _stockOpened = false;
  bool _hasCounterDraft = false;

  @override
  void initState() {
    super.initState();
    unawaited(_refreshCounterDraft());
  }

  Future<void> _refreshCounterDraft() async {
    try {
      final pending = await widget.database.readPendingWalletCheckout();
      final draft = pending == null
          ? await widget.database.readCounterSaleDraft()
          : null;
      if (mounted) setState(() => _hasCounterDraft = draft != null);
    } catch (_) {
      // Counter itself keeps selling disabled until recovery succeeds.
    }
  }

  Future<void> _setLanguage(bool myanmar) async {
    setState(() => _myanmar = myanmar);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool('shop_locale_myanmar', myanmar);
  }

  Future<void> _openCounter(BuildContext context) async {
    _selectTask(1);
  }

  Future<void> _openFirstProduct(BuildContext context) async {
    setState(() {
      _counterOpened = true;
      _workspaceTab = 1;
      _addProductRequest++;
    });
  }

  Future<void> _addProductFromStock(BuildContext context) async {
    try {
      final productId = await _createShopProduct(
        context: context,
        database: widget.database,
        myanmar: _myanmar,
      );
      if (productId == null || !context.mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              shopCopy(
                _myanmar,
                'Product added to stock.',
                'ကုန်ပစ္စည်းကို လက်ကျန်စာရင်းတွင် ထည့်ပြီးပါပြီ။',
              ),
            ),
          ),
        );
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(_productSaveError(error, _myanmar))),
        );
    }
  }

  void _showToday() {
    _selectTask(0);
  }

  void _restoreScannerFocusAfterFrame() {
    if (defaultTargetPlatform != TargetPlatform.windows) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _workspaceTab == 1) {
        _counterKey.currentState?._focusScannerIfReady();
      }
    });
  }

  void _selectTask(int index) {
    if (index == 4) {
      unawaited(_openSettings(context));
      return;
    }
    if (index != 1) FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _workspaceTab = index;
      if (index == 0) _todayRefreshToken++;
      if (index == 1) _counterOpened = true;
      if (index == 2) {
        _salesOpened = true;
        _salesRefreshToken++;
      }
      if (index == 3) _stockOpened = true;
    });
    if (index == 0) unawaited(_refreshCounterDraft());
    if (index == 1) _restoreScannerFocusAfterFrame();
  }

  Future<void> _openSales(BuildContext context) async => _selectTask(2);

  Future<void> _openStock(BuildContext context) async => _selectTask(3);

  Future<void> _openSettings(BuildContext context) async {
    await (Navigator.maybeOf(context) ?? _navigatorKey.currentState!)
        .push<void>(
          MaterialPageRoute<void>(
            builder: (_) => ShopSettingsScreen(
              database: widget.database,
              authClient: widget.authClient,
              apiBaseUrl: widget.apiBaseUrl,
              myanmar: _myanmar,
              onLanguageChanged: _setLanguage,
            ),
          ),
        );
    _restoreScannerFocusAfterFrame();
  }

  @override
  Widget build(BuildContext context) {
    // Give each locale its own UI metrics. Latin product names still use Inter
    // through fallback on Myanmar screens, while Myanmar labels shape together
    // in one font instead of being split across a Latin-first fallback chain.
    final fontFamily = _myanmar ? 'NotoSansMyanmarUI' : 'Inter';
    final fontFallback = _myanmar
        ? const ['NotoSansMyanmar', 'Inter']
        : const ['NotoSansMyanmarUI', 'NotoSansMyanmar'];
    final tracking = _myanmar ? 0.0 : -0.4;
    const ink = Color(0xff171b2c);
    const border = Color(0xffdce2ed);
    const accent = Color(0xff2563eb);
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'SuperMega Shop',
      debugShowCheckedModeBanner: false,
      locale: Locale(_myanmar ? 'my' : 'en'),
      supportedLocales: const [Locale('en'), Locale('my')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: fontFamily,
        fontFamilyFallback: fontFallback,
        colorScheme:
            ColorScheme.fromSeed(
              seedColor: accent,
              surface: Colors.white,
            ).copyWith(
              primary: accent,
              onPrimary: Colors.white,
              primaryContainer: const Color(0xffeaf0ff),
              onPrimaryContainer: const Color(0xff173b93),
              secondary: accent,
              onSecondary: Colors.white,
              secondaryContainer: const Color(0xffeaf0ff),
              onSecondaryContainer: const Color(0xff173b93),
              onSurface: ink,
              outline: border,
            ),
        scaffoldBackgroundColor: const Color(0xfff5f7fb),
        textTheme:
            TextTheme(
              headlineMedium: TextStyle(
                fontSize: _myanmar ? 24 : 30,
                fontWeight: _myanmar ? FontWeight.w600 : FontWeight.w700,
                height: _myanmar ? 1.4 : 1.15,
                letterSpacing: tracking,
              ),
              headlineSmall: TextStyle(
                fontSize: _myanmar ? 21 : 25,
                fontWeight: _myanmar ? FontWeight.w600 : FontWeight.w700,
                height: _myanmar ? 1.4 : 1.2,
                letterSpacing: tracking,
              ),
              titleLarge: TextStyle(
                fontSize: _myanmar ? 18 : 20,
                fontWeight: _myanmar ? FontWeight.w600 : FontWeight.w700,
                height: _myanmar ? 1.45 : 1.25,
                letterSpacing: tracking,
              ),
              titleMedium: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                height: _myanmar ? 1.5 : 1.35,
                letterSpacing: _myanmar ? 0 : -0.1,
              ),
              titleSmall: TextStyle(
                fontSize: _myanmar ? 15 : 16,
                fontWeight: FontWeight.w600,
                height: _myanmar ? 1.5 : 1.3,
                letterSpacing: _myanmar ? 0 : -0.1,
              ),
              bodyLarge: TextStyle(fontSize: 16, height: _myanmar ? 1.6 : 1.45),
              bodyMedium: TextStyle(
                fontSize: 15,
                height: _myanmar ? 1.6 : 1.45,
              ),
              bodySmall: TextStyle(fontSize: 14, height: _myanmar ? 1.65 : 1.5),
              labelLarge: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                height: _myanmar ? 1.5 : 1.25,
              ),
              labelMedium: TextStyle(
                fontSize: _myanmar ? 14 : 13,
                fontWeight: FontWeight.w600,
                height: _myanmar ? 1.45 : 1.25,
              ),
            ).apply(
              fontFamily: fontFamily,
              fontFamilyFallback: fontFallback,
              bodyColor: ink,
              displayColor: ink,
            ),
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: ink,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          titleTextStyle: TextStyle(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            fontSize: 18,
            fontWeight: _myanmar ? FontWeight.w600 : FontWeight.w700,
            letterSpacing: tracking,
            height: _myanmar ? 1.45 : 1.2,
            color: ink,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          height: _myanmar ? 84 : 78,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return TextStyle(
              fontFamily: fontFamily,
              fontFamilyFallback: fontFallback,
              fontSize: _myanmar ? 13.5 : 13,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              height: _myanmar ? 1.45 : 1.25,
              color: selected ? accent : ink.withValues(alpha: 0.76),
            );
          }),
        ),
        navigationRailTheme: NavigationRailThemeData(
          selectedLabelTextStyle: TextStyle(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            fontSize: 14,
            fontWeight: FontWeight.w700,
            height: _myanmar ? 1.45 : 1.25,
            color: accent,
          ),
          unselectedLabelTextStyle: TextStyle(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            height: _myanmar ? 1.45 : 1.25,
            color: ink.withValues(alpha: 0.76),
          ),
        ),
        cardTheme: const CardThemeData(
          color: Colors.white,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(16)),
            side: BorderSide(color: border),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 48),
            padding: const EdgeInsets.symmetric(horizontal: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(11),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 48),
            padding: const EdgeInsets.symmetric(horizontal: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(11),
            ),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            borderSide: BorderSide(color: border),
          ),
          filled: true,
          fillColor: Colors.white,
        ),
      ),
      home: widget.initialCounter
          ? ShopHome(
              database: widget.database,
              authClient: widget.authClient,
              apiBaseUrl: widget.apiBaseUrl,
              myanmar: _myanmar,
              onLanguageChanged: _setLanguage,
            )
          : PopScope(
              canPop: _workspaceTab == 0,
              onPopInvokedWithResult: (didPop, result) {
                if (!didPop && _workspaceTab != 0) _showToday();
              },
              child: Builder(
                builder: (context) {
                  final width = MediaQuery.sizeOf(context).width;
                  final desktop = width >= 1100;
                  return Scaffold(
                    appBar: AppBar(
                      title: Text(
                        shopCopy(_myanmar, 'SuperMega Shop', 'SuperMega ဆိုင်'),
                      ),
                      actions: [
                        if (!desktop)
                          IconButton(
                            tooltip: shopCopy(
                              _myanmar,
                              'Settings',
                              'ဆက်တင်များ',
                            ),
                            onPressed: () => unawaited(_openSettings(context)),
                            icon: const Icon(Icons.settings_outlined),
                          ),
                        const SizedBox(width: 8),
                      ],
                    ),
                    body: SafeArea(
                      child: Row(
                        children: [
                          if (desktop) ...[
                            ShopTaskRail(
                              myanmar: _myanmar,
                              extended: true,
                              selectedIndex: _workspaceTab,
                              onDestinationSelected: _selectTask,
                            ),
                            const VerticalDivider(width: 1),
                          ],
                          Expanded(
                            child: LayoutBuilder(
                              builder: (context, constraints) => IndexedStack(
                                index: _workspaceTab,
                                children: [
                                  ShopTodayScreen(
                                    database: widget.database,
                                    myanmar: _myanmar,
                                    hasCounterDraft: _hasCounterDraft,
                                    embeddedTaskShell: true,
                                    refreshToken: _todayRefreshToken,
                                    onNewSale: _openCounter,
                                    onAddFirstProduct: _openFirstProduct,
                                    onSales: _openSales,
                                    onStock: _openStock,
                                    onSettings: _openSettings,
                                  ),
                                  if (_counterOpened)
                                    ShopHome(
                                      key: _counterKey,
                                      database: widget.database,
                                      authClient: widget.authClient,
                                      apiBaseUrl: widget.apiBaseUrl,
                                      myanmar: _myanmar,
                                      onLanguageChanged: _setLanguage,
                                      onToday: _showToday,
                                      onSales: () => _selectTask(2),
                                      onStock: () => _selectTask(3),
                                      embeddedTaskShell: true,
                                      workspaceContentWidth:
                                          constraints.maxWidth,
                                      addProductRequest: _addProductRequest,
                                    )
                                  else
                                    const SizedBox.shrink(),
                                  if (_salesOpened)
                                    RecentSalesScreen(
                                      database: widget.database,
                                      myanmar: _myanmar,
                                      embeddedTaskShell: true,
                                      refreshToken: _salesRefreshToken,
                                    )
                                  else
                                    const SizedBox.shrink(),
                                  if (_stockOpened)
                                    StockScreen(
                                      database: widget.database,
                                      myanmar: _myanmar,
                                      active: _workspaceTab == 3,
                                      embeddedTaskShell: true,
                                      onAddProduct: () => unawaited(
                                        _addProductFromStock(context),
                                      ),
                                    )
                                  else
                                    const SizedBox.shrink(),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    bottomNavigationBar: desktop
                        ? null
                        : ShopTaskBottomBar(
                            myanmar: _myanmar,
                            selectedIndex: _workspaceTab,
                            onDestinationSelected: _selectTask,
                          ),
                  );
                },
              ),
            ),
    );
  }
}

TextStyle _shopMoneyStyle(BuildContext context, {bool total = false}) {
  final type = Theme.of(context).textTheme;
  return (total ? type.titleLarge! : type.labelLarge!).copyWith(
    fontWeight: total ? FontWeight.w700 : FontWeight.w600,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
}

Widget _savedWalletLines(
  BuildContext context,
  List<WalletCheckoutLineSnapshot> lines, {
  required bool myanmar,
}) {
  final theme = Theme.of(context);
  return Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final line in lines)
        Padding(
          key: ValueKey('shop-pending-wallet-line:${line.productId}'),
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      line.productName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${shopMmk(line.unitPriceMmk, myanmar: myanmar)} × '
                      '${shopNumber(line.quantity, myanmar: myanmar)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                shopMmk(line.lineTotalMmk, myanmar: myanmar),
                style: _shopMoneyStyle(context),
              ),
            ],
          ),
        ),
    ],
  );
}

class ShopHome extends StatefulWidget {
  const ShopHome({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.myanmar,
    required this.onLanguageChanged,
    this.onToday,
    this.onSales,
    this.onStock,
    this.embeddedTaskShell = false,
    this.workspaceContentWidth,
    this.addProductRequest = 0,
    this.recoverMenuPhoto,
    this.cameraViewBuilder,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool myanmar;
  final ValueChanged<bool> onLanguageChanged;
  final VoidCallback? onToday;
  final VoidCallback? onSales;
  final VoidCallback? onStock;
  final bool embeddedTaskShell;
  final double? workspaceContentWidth;
  final int addProductRequest;
  final Future<XFile?> Function()? recoverMenuPhoto;
  final ShopCameraViewBuilder? cameraViewBuilder;

  @override
  State<ShopHome> createState() => _ShopHomeState();
}

class _ShopHomeState extends State<ShopHome> {
  static const _minSplitContentWidth = 740.0;

  String _mmk(int amount) => shopMmk(amount, myanmar: widget.myanmar);

  void _focusScannerIfReady() {
    if (!mounted ||
        !_checkoutReady ||
        _saving ||
        _cashConfirming ||
        _walletStarting ||
        _pendingWalletCheckout != null ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    if (_searchFocus.canRequestFocus) _searchFocus.requestFocus();
  }

  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _cart = <String, int>{};
  late final Stream<List<ShopProduct>> _productsStream = widget.database
      .watchActiveProducts();
  String? _operationId;
  bool _saving = false;
  bool _cashConfirming = false;
  bool _walletStarting = false;
  bool _checkoutReady = false;
  bool _checkoutLoadFailed = false;
  bool _recoveredDraft = false;
  bool _recoveredDraftNeedsReview = false;
  Future<void> _draftWrites = Future<void>.value();
  PendingWalletCheckout? _pendingWalletCheckout;
  List<HeldSaleTicket> _heldTickets = const [];
  XFile? _recoveredMenuPhoto;
  final _thumbnailFutures = <String, Future<Uint8List?>>{};

  @override
  void initState() {
    super.initState();
    _loadCheckoutState();
    _recoverMenuPhoto();
    if (widget.addProductRequest > 0) _scheduleFirstProductDialog();
  }

  @override
  void didUpdateWidget(covariant ShopHome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.addProductRequest > oldWidget.addProductRequest) {
      _scheduleFirstProductDialog();
    }
  }

  void _scheduleFirstProductDialog() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _showAddProduct();
    });
  }

  Future<void> _recoverMenuPhoto() async {
    if (defaultTargetPlatform != TargetPlatform.android &&
        widget.recoverMenuPhoto == null) {
      return;
    }
    try {
      final preferences = await SharedPreferences.getInstance();
      final pickerIntent = preferences.getString(_pendingPickerIntentKey);
      final XFile? photo;
      final recover = widget.recoverMenuPhoto;
      if (recover != null) {
        photo = await recover();
      } else {
        final lost = await ImagePicker().retrieveLostData();
        final files = lost.files;
        photo = files == null || files.isEmpty ? null : files.first;
      }
      if (pickerIntent != null) {
        await preferences.remove(_pendingPickerIntentKey);
      }
      if (photo == null) return;
      if (pickerIntent != null && pickerIntent.startsWith('product:')) {
        await _saveProductPhoto(
          pickerIntent.substring('product:'.length),
          photo,
        );
        return;
      }
      if (!mounted) {
        await discardCapturedMenuPhoto(photo, createdByCamera: true);
        return;
      }
      setState(() => _recoveredMenuPhoto = photo);
    } catch (_) {
      // A missing camera result must never block the offline counter.
    }
  }

  Future<Uint8List?> _thumbnailFor(String productId) {
    if (_thumbnailFutures.length >= 64 &&
        !_thumbnailFutures.containsKey(productId)) {
      _thumbnailFutures.clear();
    }
    return _thumbnailFutures.putIfAbsent(
      productId,
      () => widget.database.readProductThumbnail(productId),
    );
  }

  Future<void> _chooseProductPhoto(String productId) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (Platform.isAndroid || Platform.isIOS)
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: Text(
                  shopCopy(widget.myanmar, 'Take photo', 'ဓာတ်ပုံရိုက်ရန်'),
                ),
                onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
              ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(
                shopCopy(widget.myanmar, 'Choose photo', 'ဓာတ်ပုံရွေးရန်'),
              ),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_pendingPickerIntentKey, 'product:$productId');
    XFile? photo;
    try {
      photo = await ImagePicker().pickImage(source: source);
      if (photo != null) await _saveProductPhoto(productId, photo);
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not add this photo. Choose another image.',
            'ဤဓာတ်ပုံကို မထည့်နိုင်ပါ။ အခြားပုံရွေးပါ။',
          ),
        );
      }
    } finally {
      await preferences.remove(_pendingPickerIntentKey);
      if (source == ImageSource.camera) {
        await discardCapturedMenuPhoto(photo, createdByCamera: true);
      }
    }
  }

  Future<void> _saveProductPhoto(String productId, XFile photo) async {
    try {
      // Never decode the original full resolution into a UI widget. Decode to
      // a bounded raster and re-encode; the PNG contains no source EXIF.
      if (await photo.length() > 8 * 1024 * 1024) {
        throw const FormatException('Photo exceeds the input limit.');
      }
      final original = await photo.readAsBytes();
      final buffer = await ui.ImmutableBuffer.fromUint8List(original);
      ui.ImageDescriptor? descriptor;
      ui.Codec? codec;
      ui.Image? image;
      try {
        descriptor = await ui.ImageDescriptor.encoded(buffer);
        if (descriptor.width <= 0 ||
            descriptor.height <= 0 ||
            descriptor.width > 8192 ||
            descriptor.height > 8192 ||
            descriptor.width * descriptor.height > 40000000) {
          throw const FormatException(
            'Photo dimensions exceed the input limit.',
          );
        }
        final longestSide = descriptor.width > descriptor.height
            ? descriptor.width
            : descriptor.height;
        final scale = longestSide > 192 ? 192 / longestSide : 1.0;
        codec = await descriptor.instantiateCodec(
          targetWidth: (descriptor.width * scale).round().clamp(1, 192),
          targetHeight: (descriptor.height * scale).round().clamp(1, 192),
        );
        image = (await codec.getNextFrame()).image;
        final png = await image.toByteData(format: ui.ImageByteFormat.png);
        if (png == null) {
          throw const FormatException('Photo could not be encoded.');
        }
        await widget.database.saveProductThumbnail(
          productId,
          png.buffer.asUint8List(png.offsetInBytes, png.lengthInBytes),
        );
      } finally {
        image?.dispose();
        codec?.dispose();
        descriptor?.dispose();
        buffer.dispose();
      }
      _thumbnailFutures.remove(productId);
      if (mounted) {
        setState(() {});
        _message(
          shopCopy(
            widget.myanmar,
            'Product photo saved on this device.',
            'ကုန်ပစ္စည်းဓာတ်ပုံကို ဤစက်တွင် သိမ်းပြီးပါပြီ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not add this photo. Use a smaller image.',
            'ဤဓာတ်ပုံကို မထည့်နိုင်ပါ။ ပိုသေးသောပုံသုံးပါ။',
          ),
        );
      }
    }
  }

  Future<void> _discardRecoveredMenuPhoto() async {
    final photo = _recoveredMenuPhoto;
    setState(() => _recoveredMenuPhoto = null);
    await discardCapturedMenuPhoto(photo, createdByCamera: true);
  }

  Future<void> _loadCheckoutState() async {
    try {
      final pending = await widget.database.readPendingWalletCheckout();
      final heldTickets = await widget.database.readHeldSaleTickets();
      final draft = pending == null
          ? await widget.database.readCounterSaleDraft()
          : null;
      final products = draft == null
          ? const <ShopProduct>[]
          : await widget.database.readActiveProducts();
      if (!mounted) return;
      final byId = {for (final product in products) product.id: product};
      setState(() {
        _pendingWalletCheckout = pending;
        _heldTickets = heldTickets;
        _cart.clear();
        if (draft != null) _cart.addAll(draft.quantities);
        _operationId = draft?.operationId;
        _recoveredDraft = draft != null;
        _recoveredDraftNeedsReview =
            draft != null &&
            draft.quantities.entries.any((line) {
              final product = byId[line.key];
              return product == null ||
                  product.onHand < line.value ||
                  product.priceMmk != draft.unitPricesMmk[line.key] ||
                  product.name != draft.productNames[line.key];
            });
        _checkoutReady = true;
        _checkoutLoadFailed = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _checkoutReady = false;
          _checkoutLoadFailed = true;
        });
        _message(
          shopCopy(
            widget.myanmar,
            'Could not recover the unfinished sale. Retry before selling.',
            'မပြီးသေးသော အရောင်းကို ပြန်ဖတ်မရပါ။ မရောင်းမီ ထပ်စမ်းပါ။',
          ),
        );
      }
    }
  }

  void _queueDraftEdit(Future<void> Function() edit) {
    _draftWrites = _draftWrites.then((_) => edit()).catchError((Object _) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not save this basket change. Check device storage and try again.',
            'အရောင်းစာရင်းပြောင်းလဲမှုကို မသိမ်းနိုင်ပါ။ စက်လက်ကျန်နေရာကို စစ်ပြီး ထပ်စမ်းပါ။',
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    unawaited(
      discardCapturedMenuPhoto(_recoveredMenuPhoto, createdByCamera: true),
    );
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _returnToToday() {
    _searchFocus.unfocus();
    widget.onToday?.call();
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final inWorkspace = widget.onToday != null;
    final showRail = inWorkspace && !widget.embeddedTaskShell && width >= 1100;
    final contentWidth =
        widget.workspaceContentWidth ?? width - (showRail ? 191 : 0);
    // A portrait tablet keeps touch navigation at the bottom while a 300 px
    // basket and a usable compact catalog fit beside each other at 768 px.
    final cartAction = SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: StreamBuilder<List<ShopProduct>>(
        stream: _productsStream,
        builder: (context, snapshot) {
          final products = snapshot.data ?? const <ShopProduct>[];
          final count = _cart.values.fold<int>(0, (a, b) => a + b);
          final hasUnavailableProducts = _cartHasUnavailableProducts(products);
          return FilledButton.icon(
            onPressed: _saving ? null : () => _showCart(products),
            icon: const Icon(Icons.shopping_basket_outlined),
            label: Text(
              shopCopy(
                widget.myanmar,
                hasUnavailableProducts
                    ? 'Review sale · $count · Check items'
                    : 'Review sale · $count · ${_mmk(_cartTotal(products))}',
                hasUnavailableProducts
                    ? 'အရောင်းစစ်ရန် · ${shopNumber(count, myanmar: true)} ခု · ပစ္စည်းစစ်ရန်'
                    : 'အရောင်းစစ်ရန် · ${shopNumber(count, myanmar: true)} ခု · ${_mmk(_cartTotal(products))}',
              ),
            ),
          );
        },
      ),
    );
    return Scaffold(
      appBar: widget.embeddedTaskShell
          ? null
          : AppBar(
              title: Text(
                shopCopy(
                  widget.myanmar,
                  inWorkspace ? 'Sell' : 'Shop',
                  inWorkspace ? 'ရောင်းရန်' : 'ဆိုင်',
                ),
              ),
              actions: [
                if (_checkoutLoadFailed)
                  IconButton(
                    tooltip: shopCopy(
                      widget.myanmar,
                      'Retry sale recovery',
                      'အရောင်းပြန်ဖတ်ရန် ထပ်စမ်းပါ',
                    ),
                    onPressed: _loadCheckoutState,
                    icon: const Icon(Icons.refresh),
                  ),
                if (inWorkspace && width < 1100)
                  IconButton(
                    tooltip: shopCopy(widget.myanmar, 'Settings', 'ဆက်တင်များ'),
                    onPressed: _openSettings,
                    icon: const Icon(Icons.settings_outlined),
                  ),
                if (!inWorkspace && width >= 1080) ...[
                  Tooltip(
                    message: shopCopy(
                      widget.myanmar,
                      'Recent sales',
                      'မကြာသေးမီက အရောင်းများ',
                    ),
                    child: TextButton.icon(
                      onPressed: _openRecentSales,
                      icon: const Icon(Icons.receipt_long_outlined),
                      label: Text(
                        shopCopy(widget.myanmar, 'Sales', 'အရောင်းများ'),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _openStock,
                    icon: const Icon(Icons.inventory_2_outlined),
                    label: Text(shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်')),
                  ),
                  TextButton.icon(
                    onPressed: _openSettings,
                    icon: const Icon(Icons.settings_outlined),
                    label: Text(
                      shopCopy(widget.myanmar, 'Settings', 'ဆက်တင်များ'),
                    ),
                  ),
                ] else if (!inWorkspace)
                  PopupMenuButton<String>(
                    tooltip: shopCopy(widget.myanmar, 'More', 'နောက်ထပ်'),
                    icon: const Icon(Icons.menu_rounded),
                    onSelected: (value) {
                      switch (value) {
                        case 'sales':
                          _openRecentSales();
                          break;
                        case 'stock':
                          _openStock();
                          break;
                        case 'settings':
                          _openSettings();
                          break;
                      }
                    },
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'sales',
                        child: Text(
                          shopCopy(
                            widget.myanmar,
                            'Recent sales',
                            'မကြာသေးမီက အရောင်းများ',
                          ),
                        ),
                      ),
                      PopupMenuItem(
                        value: 'stock',
                        child: Text(
                          shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်'),
                        ),
                      ),
                      PopupMenuItem(
                        value: 'settings',
                        child: Text(
                          shopCopy(widget.myanmar, 'Settings', 'ဆက်တင်များ'),
                        ),
                      ),
                    ],
                  ),
                const SizedBox(width: 8),
              ],
            ),
      body: SafeArea(
        child: Column(
          children: [
            // The catalog has its own Products heading; the selected task
            // destination supplies the Sell label at every screen width.
            if (widget.embeddedTaskShell && _checkoutLoadFailed)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: ShopTaskPageHeader(
                  title: shopCopy(widget.myanmar, 'Sell', 'ရောင်းရန်'),
                  myanmar: widget.myanmar,
                  trailing: _checkoutLoadFailed
                      ? IconButton(
                          tooltip: shopCopy(
                            widget.myanmar,
                            'Retry sale recovery',
                            'အရောင်းပြန်ဖတ်ရန် ထပ်စမ်းပါ',
                          ),
                          onPressed: _loadCheckoutState,
                          icon: const Icon(Icons.refresh),
                        )
                      : null,
                ),
              ),
            Expanded(
              child: Row(
                children: [
                  if (showRail) ...[
                    ShopTaskRail(
                      myanmar: widget.myanmar,
                      extended: width >= 1100,
                      selectedIndex: 1,
                      onDestinationSelected: (index) {
                        if (index == 0) _returnToToday();
                        if (index == 2) _openRecentSales();
                        if (index == 3) _openStock();
                        if (index == 4) _openSettings();
                      },
                    ),
                    const VerticalDivider(width: 1),
                  ],
                  Expanded(
                    child: StreamBuilder<List<ShopProduct>>(
                      stream: _productsStream,
                      builder: (context, snapshot) {
                        final products = snapshot.data ?? const <ShopProduct>[];
                        if (contentWidth >= _minSplitContentWidth) {
                          // Keep the current sale visible beside the catalog
                          // on tablets and desktop, including before the first
                          // item is selected.
                          final tablet = width < 1100;
                          final cartWidth = contentWidth < 820
                              ? 300.0
                              : (contentWidth * 0.36).clamp(340.0, 500.0);
                          return Padding(
                            padding: EdgeInsets.all(tablet ? 12 : 20),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    children: [
                                      if (_recoveredMenuPhoto != null) ...[
                                        const SizedBox(height: 12),
                                        _recoveredMenuPhotoCard(),
                                      ],
                                      if (products.isEmpty &&
                                          _pendingWalletCheckout != null) ...[
                                        const SizedBox(height: 12),
                                        _pendingWalletCheckoutCard(),
                                      ],
                                      const SizedBox(height: 14),
                                      Expanded(
                                        child: LayoutBuilder(
                                          builder: (context, constraints) =>
                                              Align(
                                                alignment: Alignment.topCenter,
                                                child: SizedBox(
                                                  key: const ValueKey(
                                                    'shop-split-catalog',
                                                  ),
                                                  width: double.infinity,
                                                  height: _catalogHeight(
                                                    products,
                                                    constraints.maxHeight,
                                                    catalogWidth:
                                                        constraints.maxWidth,
                                                  ),
                                                  child: _catalog(products),
                                                ),
                                              ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (_cart.isNotEmpty ||
                                    products.isNotEmpty) ...[
                                  SizedBox(width: tablet ? 12 : 18),
                                  SizedBox(
                                    key: const ValueKey('shop-split-basket'),
                                    width: cartWidth,
                                    child:
                                        _cart.isEmpty &&
                                            !_recoveredDraft &&
                                            _pendingWalletCheckout == null
                                        ? _emptyCartPanel()
                                        : cartWidth < 320
                                        ? Align(
                                            alignment: Alignment.topCenter,
                                            child: _cartPanel(
                                              products,
                                              narrowPane: true,
                                            ),
                                          )
                                        : _cartPanel(products),
                                  ),
                                ],
                              ],
                            ),
                          );
                        }
                        return Column(
                          children: [
                            if (_recoveredMenuPhoto != null)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  12,
                                  10,
                                  12,
                                  0,
                                ),
                                child: _recoveredMenuPhotoCard(),
                              ),
                            if (_pendingWalletCheckout != null)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  12,
                                  10,
                                  12,
                                  0,
                                ),
                                child: _pendingWalletCheckoutCard(),
                              ),
                            Padding(
                              padding: width < 380
                                  ? const EdgeInsets.fromLTRB(16, 6, 12, 4)
                                  : const EdgeInsets.fromLTRB(16, 14, 12, 10),
                              child: _catalogHeader(products),
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              child: _searchField(products),
                            ),
                            SizedBox(height: width < 380 ? 4 : 8),
                            if (_heldTickets.isNotEmpty) _heldSalesAction(),
                            Expanded(
                              child: LayoutBuilder(
                                builder: (context, constraints) => _productList(
                                  products,
                                  catalogWidth: constraints.maxWidth,
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: inWorkspace && width < 1100
          ? widget.embeddedTaskShell
                ? (_cart.isNotEmpty && contentWidth < _minSplitContentWidth
                      ? cartAction
                      : null)
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_cart.isNotEmpty &&
                          contentWidth < _minSplitContentWidth)
                        cartAction,
                      ShopTaskBottomBar(
                        myanmar: widget.myanmar,
                        selectedIndex: 1,
                        onDestinationSelected: (index) {
                          if (index == 0) _returnToToday();
                          if (index == 2) _openRecentSales();
                          if (index == 3) _openStock();
                        },
                      ),
                    ],
                  )
          : contentWidth >= _minSplitContentWidth || _cart.isEmpty
          ? null
          : cartAction,
    );
  }

  Widget _pendingWalletCheckoutCard({StateSetter? refresh}) {
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
            _savedWalletLines(
              context,
              checkout.lines.take(2).toList(),
              myanmar: widget.myanmar,
            ),
            if (checkout.lines.length > 2)
              Text(
                shopCopy(
                  widget.myanmar,
                  '+${checkout.lines.length - 2} more items in payment review',
                  'ငွေပေးချေမှုစစ်ဆေးရာတွင် နောက်ထပ် ${shopNumber(checkout.lines.length - 2, myanmar: true)} မျိုးရှိပါသည်',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
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
                  onPressed: _saving
                      ? null
                      : () async {
                          await _cancelPendingWalletCheckout();
                          refresh?.call(() {});
                        },
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

  Widget _recoveredMenuPhotoCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            shopCopy(
              widget.myanmar,
              'Menu photo ready to review',
              'မီနူးဓာတ်ပုံကို စစ်ဆေးနိုင်ပါပြီ',
            ),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            shopCopy(
              widget.myanmar,
              'The camera closed while Shop restarted. Nothing was sent.',
              'Shop ပြန်စတင်နေစဉ် ကင်မရာပိတ်သွားသည်။ ဓာတ်ပုံကို မပို့ရသေးပါ။',
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton.tonal(
                onPressed: _openMenuImport,
                child: Text(
                  shopCopy(widget.myanmar, 'Review photo', 'ဓာတ်ပုံစစ်ရန်'),
                ),
              ),
              TextButton(
                onPressed: _discardRecoveredMenuPhoto,
                child: Text(shopCopy(widget.myanmar, 'Discard', 'ဖျက်ရန်')),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  double _catalogHeight(
    List<ShopProduct> products,
    double maxHeight, {
    required double catalogWidth,
  }) {
    if (products.isEmpty) return maxHeight;
    final matchingCount = _visibleProducts(products).length;
    final textScale = MediaQuery.textScalerOf(context).scale(1.0);
    // A short catalog should end near its final row. Larger catalogs retain
    // the available scroll area, and text scaling may grow the rows freely.
    // Burmese's three-line product rows need the same vertical budget as EN.
    // A shorter estimate clips the last row while empty tablet space remains.
    const rowHeight = 96.0;
    // Compact tablet headers wrap product actions into a second line. Give
    // that header its own height before allocating the scrollable product row.
    final headerHeight = catalogWidth < 500 ? 324.0 : 148.0;
    final desiredHeight = matchingCount == 0
        ? 360.0
        : headerHeight + matchingCount * rowHeight * textScale;
    return desiredHeight.clamp(0.0, maxHeight).toDouble();
  }

  Widget _catalog(List<ShopProduct> products) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _catalogHeader(products),
          const SizedBox(height: 12),
          _searchField(products),
          if (_heldTickets.isNotEmpty) _heldSalesAction(),
          const SizedBox(height: 8),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) =>
                  _productList(products, catalogWidth: constraints.maxWidth),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _heldSalesAction() => Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: TextButton.icon(
        key: const ValueKey('shop-held-sales-open'),
        onPressed: _showHeldSaleTickets,
        icon: const Icon(Icons.bookmark_border),
        label: Text(
          shopCopy(
            widget.myanmar,
            'Held sales (${_heldTickets.length})',
            'ခဏသိမ်းထားသောအရောင်း (${shopNumber(_heldTickets.length, myanmar: true)})',
          ),
        ),
      ),
    ),
  );

  Widget _catalogHeader(List<ShopProduct> products) => LayoutBuilder(
    builder: (context, constraints) {
      final narrowPhone = MediaQuery.sizeOf(context).width < 380;
      final title = Text(
        shopCopy(widget.myanmar, 'Products', 'ကုန်ပစ္စည်းများ'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: narrowPhone
            ? Theme.of(context).textTheme.titleMedium
            : Theme.of(context).textTheme.titleLarge,
      );
      final cameraButton = shopCameraScanningSupported
          ? IconButton.filledTonal(
              key: const ValueKey('shop-camera-scan'),
              tooltip: shopCopy(
                widget.myanmar,
                'Scan with camera',
                'ကင်မရာဖြင့် ဖတ်ရန်',
              ),
              onPressed: _canAcceptScan
                  ? () => unawaited(_openCameraScanner())
                  : null,
              icon: const Icon(Icons.camera_alt_outlined),
            )
          : null;
      if (products.isEmpty) {
        return Row(
          children: [
            Expanded(child: title),
            ?cameraButton,
          ],
        );
      }
      final addButton = OutlinedButton.icon(
        onPressed: _showAddProduct,
        icon: const Icon(Icons.add),
        label: Text(shopCopy(widget.myanmar, 'New product', 'ကုန်ပစ္စည်းအသစ်')),
      );
      // A portrait tablet has a split basket but only a narrow catalog header.
      // Keep product creation visible without adding a second header row.
      final compactTabletHeader =
          MediaQuery.sizeOf(context).width >= _minSplitContentWidth &&
          constraints.maxWidth < 420;
      final compactAddButton = Tooltip(
        message: shopCopy(
          widget.myanmar,
          'New product',
          'ကုန်ပစ္စည်းအသစ်',
        ),
        child: TextButton.icon(
          key: const ValueKey('shop-new-product-compact'),
          onPressed: _showAddProduct,
          style: TextButton.styleFrom(
            minimumSize: const Size(0, 48),
            padding: const EdgeInsets.symmetric(horizontal: 8),
          ),
          icon: const Icon(Icons.add, size: 18),
          label: Text(shopCopy(widget.myanmar, 'New', 'အသစ်')),
        ),
      );
      final productActions = PopupMenuButton<String>(
        key: const ValueKey('shop-product-actions'),
        tooltip: shopCopy(
          widget.myanmar,
          'Product options',
          'ကုန်ပစ္စည်းရွေးချယ်မှုများ',
        ),
        icon: const Icon(Icons.more_horiz),
        onSelected: (action) {
          if (action == 'new') {
            _showAddProduct();
          } else if (action == 'import') {
            _openMenuImport();
          } else if (action == 'photos') {
            unawaited(_showProductPhotoManager(products));
          }
        },
        itemBuilder: (_) => [
          if (constraints.maxWidth < 420 && !compactTabletHeader)
            PopupMenuItem(
              value: 'new',
              child: Text(
                shopCopy(widget.myanmar, 'New product', 'ကုန်ပစ္စည်းအသစ်'),
              ),
            ),
          PopupMenuItem(
            value: 'import',
            child: Text(
              shopCopy(
                widget.myanmar,
                'Import menu photo',
                'မီနူးဓာတ်ပုံထည့်ရန်',
              ),
            ),
          ),
          PopupMenuItem(
            value: 'photos',
            child: Text(
              shopCopy(
                widget.myanmar,
                'Edit product photos',
                'ကုန်ပစ္စည်းဓာတ်ပုံများ ပြင်ရန်',
              ),
            ),
          ),
        ],
      );
      if (constraints.maxWidth < 420) {
        return Row(
          children: [
            Expanded(child: title),
            ?cameraButton,
            if (compactTabletHeader) compactAddButton,
            productActions,
          ],
        );
      }
      return Row(
        children: [
          Expanded(child: title),
          ?cameraButton,
          addButton,
          productActions,
        ],
      );
    },
  );

  Future<void> _showProductPhotoManager(List<ShopProduct> products) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * 0.65,
          child: Column(
            children: [
              ListTile(
                title: Text(
                  shopCopy(
                    widget.myanmar,
                    'Edit product photos',
                    'ကုန်ပစ္စည်းဓာတ်ပုံများ ပြင်ရန်',
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: products.length,
                  itemBuilder: (context, index) {
                    final item = products[index];
                    return ListTile(
                      key: ValueKey('shop-photo-manage:${item.id}'),
                      title: Text(item.name),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.pop(sheetContext, item.id),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected != null && mounted) await _chooseProductPhoto(selected);
  }

  bool get _canAcceptScan =>
      _checkoutReady &&
      !_saving &&
      !_cashConfirming &&
      !_walletStarting &&
      _pendingWalletCheckout == null;

  Future<void> _openCameraScanner() async {
    if (!shopCameraScanningSupported || !_canAcceptScan) return;
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => CameraBarcodeScanner(
          myanmar: widget.myanmar,
          cameraViewBuilder: widget.cameraViewBuilder,
        ),
      ),
    );
    if (!mounted || code == null || !_canAcceptScan) return;
    try {
      final products = await widget.database.readActiveProducts();
      if (mounted) _acceptScannedCode(code, products, fromCamera: true);
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not check the local catalog. Try the scan again.',
            'စက်တွင်းကုန်ပစ္စည်းစာရင်းကို မစစ်နိုင်ပါ။ ထပ်ဖတ်ကြည့်ပါ။',
          ),
        );
      }
    }
  }

  void _acceptScannedCode(
    String value,
    List<ShopProduct> products, {
    bool fromCamera = false,
  }) {
    if (!_canAcceptScan) return;
    final code = value.trim();
    if (code.isEmpty) return;
    final matches = products
        .where((item) => item.barcode == code || item.sku == code)
        .toList();
    if (matches.length == 1) {
      final keepSearchFocus = !fromCamera && _searchFocus.hasFocus;
      _add(matches.single);
      _search.clear();
      setState(() {});
      if (keepSearchFocus) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _searchFocus.canRequestFocus) {
            _searchFocus.requestFocus();
          }
        });
      }
    } else if (matches.length > 1) {
      _message(
        shopCopy(
          widget.myanmar,
          'More than one product uses this barcode or SKU. Fix the product codes before selling.',
          'ဤဘားကုဒ် သို့မဟုတ် ကုန်ပစ္စည်းကုဒ်ကို ကုန်ပစ္စည်းတစ်မျိုးထက်ပို၍ သုံးထားသည်။ မရောင်းမီ ကုန်ပစ္စည်းကုဒ်များကို ပြင်ပါ။',
        ),
      );
    } else if (RegExp(r'^[0-9]{6,64}$').hasMatch(code) ||
        (fromCamera &&
            RegExp(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$').hasMatch(code))) {
      if (fromCamera) {
        _search.text = code;
        setState(() {});
      }
      unawaited(_createProductFromScannedCode(code));
    } else {
      _message(
        shopCopy(
          widget.myanmar,
          'No exact barcode or SKU match. Check the code or add the product.',
          'ဘားကုဒ် သို့မဟုတ် ကုန်ပစ္စည်းကုဒ် အတိအကျ မတွေ့ပါ။ ကုဒ်ကို စစ်ပါ သို့မဟုတ် ကုန်ပစ္စည်းထည့်ပါ။',
        ),
      );
    }
  }

  String _searchHint(List<ShopProduct> products) {
    if (products.isEmpty) {
      return shopCopy(widget.myanmar, 'Scan a barcode', 'ဘားကုဒ် ဖတ်ပါ');
    }
    if (MediaQuery.sizeOf(context).width < 420) {
      return shopCopy(widget.myanmar, 'Search or scan', 'ရှာ / စကင်ဖတ်');
    }
    return shopCopy(
      widget.myanmar,
      'Search name, barcode or SKU',
      'အမည်၊ ဘားကုဒ် သို့မဟုတ် ကုန်ပစ္စည်းကုဒ် ရှာရန်',
    );
  }

  Widget _searchField(List<ShopProduct> products) => TextField(
    controller: _search,
    focusNode: _searchFocus,
    autofocus: defaultTargetPlatform == TargetPlatform.windows,
    onChanged: (_) => setState(() {}),
    // Keyboard scanners submit with Enter. Keep an already active scan field
    // ready for the next item without opening a keyboard on an idle tablet.
    onEditingComplete: () {},
    onSubmitted: (value) => _acceptScannedCode(value, products),
    decoration: InputDecoration(
      isDense: MediaQuery.sizeOf(context).width < 380,
      contentPadding: MediaQuery.sizeOf(context).width < 380
          ? const EdgeInsets.symmetric(horizontal: 12, vertical: 8)
          : null,
      prefixIcon: const Icon(Icons.search),
      hintText: _searchHint(products),
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

  Future<void> _createProductFromScannedCode(String code) async {
    final saved = await _showAddProduct(initialBarcode: code);
    if (!mounted) return;
    if (saved) {
      _search.clear();
      setState(() {});
    } else {
      _search.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _search.text.length,
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _searchFocus.canRequestFocus) {
        _searchFocus.requestFocus();
      }
    });
  }

  Iterable<ShopProduct> _visibleProducts(List<ShopProduct> products) {
    final text = _search.text.trim().toLowerCase();
    return products.where(
      (item) =>
          text.isEmpty ||
          item.name.toLowerCase().contains(text) ||
          (item.barcode?.toLowerCase().contains(text) ?? false) ||
          (item.sku?.toLowerCase().contains(text) ?? false),
    );
  }

  Widget _productList(
    List<ShopProduct> products, {
    required double catalogWidth,
  }) {
    // The product pane, not the full window, determines row density. Keep
    // product details in one column when the basket narrows that pane.
    final compactProductRow = catalogWidth < 520;
    final narrowProductRow = catalogWidth < 380;
    final enlargedNarrowRow =
        narrowProductRow && MediaQuery.textScalerOf(context).scale(1) > 1.2;
    final photoExtent = narrowProductRow ? 48.0 : 58.0;
    final catalogPriceStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: Theme.of(context).colorScheme.onSurface,
      fontWeight: FontWeight.w600,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    final text = _search.text.trim().toLowerCase();
    final visible = _visibleProducts(products).toList();
    if (visible.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Column(
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
              if (text.isNotEmpty) ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  key: const ValueKey('shop-add-search-result'),
                  onPressed: () {
                    final query = _search.text.trim();
                    final isBarcode = RegExp(r'^[0-9]{6,64}$').hasMatch(query);
                    _showAddProduct(
                      initialBarcode: isBarcode ? query : '',
                      initialName: isBarcode ? '' : query,
                    );
                  },
                  icon: const Icon(Icons.add),
                  label: Text(
                    shopCopy(
                      widget.myanmar,
                      'Add product',
                      'ကုန်ပစ္စည်းထည့်ရန်',
                    ),
                  ),
                ),
              ] else ...[
                const SizedBox(height: 6),
                Text(
                  shopCopy(
                    widget.myanmar,
                    'Add a name, price and starting stock to make your first sale.',
                    'ပထမအရောင်းအတွက် အမည်၊ ဈေးနှုန်းနှင့် စတင်လက်ကျန်ကို ထည့်ပါ။',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _showAddProduct,
                  icon: const Icon(Icons.add),
                  label: Text(
                    shopCopy(
                      widget.myanmar,
                      'Add first product',
                      'ပထမကုန်ပစ္စည်းထည့်ရန်',
                    ),
                  ),
                ),
                const SizedBox(height: 8),
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
        ],
      );
    }
    return ListView.separated(
      itemCount: visible.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, indent: 16, endIndent: 16),
      itemBuilder: (context, index) {
        final item = visible[index];
        final stockStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          fontWeight: item.onHand == 0 ? FontWeight.w600 : FontWeight.w500,
          color: item.onHand == 0
              ? Theme.of(context).colorScheme.error
              : Theme.of(context).colorScheme.onSurfaceVariant,
        );
        final stock = item.onHand == 0
            ? shopCopy(widget.myanmar, 'Out of stock', 'လက်ကျန်ကုန်ပါပြီ')
            : shopCopy(
                widget.myanmar,
                '${item.onHand} left',
                '${shopNumber(item.onHand, myanmar: true)} ကျန်',
              );
        final canAdd =
            _checkoutReady &&
            !_saving &&
            !_walletStarting &&
            !_cashConfirming &&
            item.onHand > 0 &&
            _pendingWalletCheckout == null;
        final addAffordance = ExcludeSemantics(
          child: Container(
            key: ValueKey('shop-add-affordance:${item.id}'),
            width: enlargedNarrowRow ? 72 : 52,
            height: 48,
            decoration: BoxDecoration(
              color: canAdd ? const Color(0xffeef3ff) : const Color(0xfff1f2f5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                shopCopy(widget.myanmar, 'Add', 'ထည့်'),
                maxLines: 1,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: canAdd
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).disabledColor,
                ),
              ),
            ),
          ),
        );
        Widget? productPhoto(Uint8List? bytes) => bytes == null
            ? null
            : SizedBox(
                key: ValueKey('shop-product-media:${item.id}'),
                width: photoExtent,
                height: photoExtent,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: const Color(0xfff7f8fb),
                    border: Border.all(color: const Color(0xffe7ebf2)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(9),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      key: ValueKey('shop-product-photo:${item.id}'),
                      child: Image.memory(
                        bytes,
                        width: photoExtent - 6,
                        height: photoExtent - 6,
                        fit: BoxFit.contain,
                        errorBuilder: (_, error, stackTrace) =>
                            const Icon(Icons.image_not_supported_outlined),
                      ),
                    ),
                  ),
                ),
              );
        return FutureBuilder<Uint8List?>(
          future: _thumbnailFor(item.id),
          builder: (context, photoSnapshot) => Tooltip(
            message: item.onHand == 0
                ? shopCopy(widget.myanmar, 'Out of stock', 'လက်ကျန်ကုန်ပါပြီ')
                : _pendingWalletCheckout != null
                ? shopCopy(
                    widget.myanmar,
                    'Finish the pending payment first',
                    'ဆိုင်းငံ့ငွေပေးချေမှုကို အရင်ပြီးစီးပါ',
                  )
                : shopCopy(widget.myanmar, 'Add to sale', 'အရောင်းထဲထည့်ရန်'),
            child: InkWell(
              key: ValueKey('shop-catalog-row:${item.id}'),
              onTap: canAdd ? () => _add(item) : null,
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: narrowProductRow ? 8 : 14,
                  vertical: enlargedNarrowRow
                      ? 8
                      : compactProductRow
                      ? 9
                      : 10,
                ),
                child: Row(
                  children: [
                    if (photoSnapshot.data != null) ...[
                      productPhoto(photoSnapshot.data)!,
                      SizedBox(width: enlargedNarrowRow ? 8 : 10),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            item.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            semanticsLabel: item.name,
                            style:
                                (compactProductRow
                                        ? Theme.of(context).textTheme.bodyMedium
                                        : Theme.of(context)
                                              .textTheme
                                              .titleMedium)
                                    ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                      height: 1.3,
                                    ),
                          ),
                          if (compactProductRow) ...[
                            const SizedBox(height: 2),
                            Text(_mmk(item.priceMmk), style: catalogPriceStyle),
                          ],
                          if (!enlargedNarrowRow) ...[
                            const SizedBox(height: 2),
                            Text(stock, style: stockStyle),
                          ],
                        ],
                      ),
                    ),
                    if (!compactProductRow) ...[
                      const SizedBox(width: 12),
                      Text(_mmk(item.priceMmk), style: catalogPriceStyle),
                    ],
                    SizedBox(width: enlargedNarrowRow ? 8 : 10),
                    if (enlargedNarrowRow)
                      SizedBox(
                        width: 72,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              stock,
                              maxLines: item.onHand == 0 ? 2 : 1,
                              textAlign: TextAlign.center,
                              style: stockStyle,
                            ),
                            const SizedBox(height: 2),
                            addAffordance,
                          ],
                        ),
                      )
                    else
                      addAffordance,
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _emptyCartPanel() => Align(
    alignment: Alignment.topCenter,
    child: SizedBox(
      width: double.infinity,
      height: 192,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                shopCopy(widget.myanmar, 'Current sale', 'လက်ရှိအရောင်း'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const Divider(height: 24),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 260),
                    child: Text(
                      shopCopy(
                        widget.myanmar,
                        'Scan a barcode or select a product to begin.',
                        'စတင်ရန် ဘားကုဒ်ဖတ်ပါ သို့မဟုတ် ပစ္စည်းရွေးပါ။',
                      ),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _cartPanel(
    List<ShopProduct> products, {
    StateSetter? refresh,
    bool narrowPane = false,
  }) {
    final compactCart = narrowPane || MediaQuery.sizeOf(context).width < 520;
    final byId = {for (final item in products) item.id: item};
    final hasUnavailableProducts = _cartHasUnavailableProducts(products);
    final entries = _pendingWalletCheckout != null
        ? const <MapEntry<String, int>>[]
        : _cart.entries.where((entry) => byId.containsKey(entry.key)).toList();
    final emptyMessage = Center(
      child: Text(
        shopCopy(
          widget.myanmar,
          _pendingWalletCheckout != null
              ? 'Review the saved sale above before checking payment.'
              : _cart.isEmpty
              ? 'Add products to start a sale.'
              : 'A saved product is no longer available. Clear this sale and start again.',
          _pendingWalletCheckout != null
              ? 'ငွေပေးချေမှုမစစ်မီ အပေါ်ပါသိမ်းထားသောအရောင်းကို စစ်ပါ။'
              : _cart.isEmpty
              ? 'အရောင်းစရန် ပစ္စည်းထည့်ပါ။'
              : 'သိမ်းထားသော ပစ္စည်းတစ်ခု မရှိတော့ပါ။ ဤအရောင်းကို ဖျက်ပြီး ပြန်စပါ။',
        ),
      ),
    );
    final cartLines = ListView.separated(
      shrinkWrap: compactCart,
      physics: compactCart ? const NeverScrollableScrollPhysics() : null,
      itemCount: entries.length,
      separatorBuilder: (_, _) => const Divider(height: 16),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return _cartLine(byId[entry.key]!, entry.value, refresh: refresh);
      },
    );
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          runSpacing: 4,
          children: [
            Text(
              shopCopy(widget.myanmar, 'Current sale', 'လက်ရှိအရောင်း'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (_cart.isNotEmpty)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!compactCart && _pendingWalletCheckout == null)
                    TextButton.icon(
                      key: const ValueKey('shop-hold-sale'),
                      onPressed:
                          !_checkoutReady ||
                              _walletStarting ||
                              _cashConfirming ||
                              _saving
                          ? null
                          : () => _holdCurrentSale(refresh: refresh),
                      icon: const Icon(Icons.bookmark_add_outlined),
                      label: Text(shopCopy(widget.myanmar, 'Hold', 'ခဏသိမ်း')),
                    ),
                  TextButton(
                    onPressed:
                        !_checkoutReady ||
                            _walletStarting ||
                            _cashConfirming ||
                            _saving ||
                            _pendingWalletCheckout != null
                        ? null
                        : () => _discardCounterDraft(refresh: refresh),
                    child: Text(shopCopy(widget.myanmar, 'Clear', 'ဖျက်ရန်')),
                  ),
                ],
              ),
          ],
        ),
        const Divider(height: 24),
        if (_recoveredDraft &&
            !(hasUnavailableProducts && entries.isNotEmpty)) ...[
          Text(
            shopCopy(
              widget.myanmar,
              _recoveredDraftNeedsReview
                  ? 'Sale restored. Review changed items before checkout.'
                  : 'Unfinished sale restored on this device.',
              _recoveredDraftNeedsReview
                  ? 'အရောင်းကို ပြန်ဖတ်ထားပါသည်။ ငွေမရှင်းမီ ပစ္စည်းပြောင်းလဲမှုကို စစ်ပါ။'
                  : 'မပြီးသေးသော အရောင်းကို ဤစက်တွင် ပြန်ဖတ်ထားပါသည်။',
            ),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
        ],
        if (_pendingWalletCheckout != null) ...[
          _pendingWalletCheckoutCard(refresh: refresh),
          const SizedBox(height: 8),
        ],
        if (hasUnavailableProducts && entries.isNotEmpty) ...[
          Text(
            shopCopy(
              widget.myanmar,
              'Stock changed. Match this sale to available quantities before payment.',
              'လက်ကျန်ပြောင်းသွားပါသည်။ ငွေမရှင်းမီ ရနိုင်သည့်အရေအတွက်နှင့် အရောင်းကို ကိုက်ညီအောင်ပြင်ပါ။',
            ),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed:
                  _checkoutReady &&
                      !_saving &&
                      !_walletStarting &&
                      !_cashConfirming &&
                      _pendingWalletCheckout == null
                  ? () => _matchCartToAvailableStock(products, refresh: refresh)
                  : null,
              child: Text(
                shopCopy(
                  widget.myanmar,
                  'Match available stock',
                  'ရနိုင်သည့်လက်ကျန်နှင့်ကိုက်ညီစေရန်',
                ),
              ),
            ),
          ),
        ],
        if (entries.isEmpty)
          compactCart ? emptyMessage : Expanded(child: emptyMessage)
        else ...[
          compactCart ? cartLines : Expanded(child: cartLines),
          const Divider(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              final label = Text(
                shopCopy(widget.myanmar, 'Total', 'စုစုပေါင်း'),
              );
              final amount = Text(
                hasUnavailableProducts
                    ? shopCopy(widget.myanmar, 'Check items', 'ပစ္စည်းစစ်ရန်')
                    : _mmk(
                        _pendingWalletCheckout?.totalMmk ??
                            _cartTotal(products),
                      ),
                style: _shopMoneyStyle(context, total: true),
                textAlign: TextAlign.right,
              );
              if (constraints.maxWidth < 320) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [label, const SizedBox(height: 4), amount],
                );
              }
              return Row(
                children: [
                  Expanded(child: label),
                  amount,
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          if (_pendingWalletCheckout == null)
            LayoutBuilder(
              builder: (context, constraints) {
                final cash = FilledButton.icon(
                  onPressed:
                      !_checkoutReady ||
                          hasUnavailableProducts ||
                          _walletStarting ||
                          _saving ||
                          _cashConfirming ||
                          _pendingWalletCheckout != null
                      ? null
                      : () => _confirmCashSale(
                          products: products,
                          closeSheet: refresh != null,
                        ),
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: Text(shopCopy(widget.myanmar, 'Cash sale', 'ငွေသား')),
                );
                final wallet = OutlinedButton.icon(
                  onPressed:
                      !_checkoutReady ||
                          hasUnavailableProducts ||
                          _walletStarting ||
                          _saving ||
                          _cashConfirming
                      ? null
                      : () => _startWalletSale(
                          products: products,
                          closeSheet: refresh != null,
                          refresh: refresh,
                        ),
                  icon: const Icon(Icons.qr_code_2),
                  label: Text(
                    shopCopy(
                      widget.myanmar,
                      'Mobile money',
                      'မိုဘိုင်းငွေပေးချေမှု',
                    ),
                  ),
                );
                if (constraints.maxWidth < 520) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      cash,
                      const SizedBox(height: 8),
                      wallet,
                      if (compactCart && _cart.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            key: const ValueKey('shop-hold-sale'),
                            onPressed:
                                !_checkoutReady ||
                                    _walletStarting ||
                                    _cashConfirming ||
                                    _saving
                                ? null
                                : () => _holdCurrentSale(refresh: refresh),
                            icon: const Icon(Icons.bookmark_add_outlined),
                            label: Text(
                              shopCopy(
                                widget.myanmar,
                                'Hold sale',
                                'အရောင်း ခဏသိမ်း',
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: cash),
                    const SizedBox(width: 8),
                    Flexible(child: wallet),
                  ],
                );
              },
            ),
        ],
      ],
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: compactCart ? SingleChildScrollView(child: content) : content,
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
    final unitPriceMmk = snapshot?.unitPriceMmk ?? item.priceMmk;
    final lineTotalMmk = snapshot?.lineTotalMmk ?? unitPriceMmk * quantity;
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          snapshot?.productName ?? item.name,
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        if (quantity > 1)
          Text(
            _mmk(lineTotalMmk),
            key: ValueKey('shop-cart-line-total:${item.id}'),
            style: _shopMoneyStyle(context),
          ),
        Text(
          '${_mmk(unitPriceMmk)} × ${shopNumber(quantity, myanmar: widget.myanmar)}',
          style: quantity > 1
              ? Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                )
              : _shopMoneyStyle(context),
        ),
        if (snapshot == null && quantity > item.onHand)
          Text(
            shopCopy(
              widget.myanmar,
              'Only ${item.onHand} available',
              '${shopNumber(item.onHand, myanmar: true)} ခုသာ ရနိုင်သည်',
            ),
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: Theme.of(context).colorScheme.error),
          ),
      ],
    );
    final controls = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: shopCopy(widget.myanmar, 'Remove one', 'တစ်ခုလျှော့ရန်'),
          onPressed:
              !_checkoutReady ||
                  _saving ||
                  _cashConfirming ||
                  _walletStarting ||
                  _pendingWalletCheckout != null
              ? null
              : () => _adjust(item, -1, refresh: refresh),
          icon: const Icon(Icons.remove_circle_outline),
        ),
        Text(shopNumber(quantity, myanmar: widget.myanmar)),
        IconButton(
          tooltip: shopCopy(widget.myanmar, 'Add one', 'တစ်ခုထပ်ထည့်ရန်'),
          onPressed:
              !_checkoutReady ||
                  _saving ||
                  _cashConfirming ||
                  _walletStarting ||
                  _pendingWalletCheckout != null ||
                  quantity >= item.onHand
              ? null
              : () => _adjust(item, 1, refresh: refresh),
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 320) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              details,
              Align(alignment: Alignment.centerRight, child: controls),
            ],
          );
        }
        return Row(
          children: [
            Expanded(child: details),
            controls,
          ],
        );
      },
    );
  }

  void _applySavedCart(
    Map<String, int> next,
    String? operationId, {
    StateSetter? refresh,
  }) {
    _cart
      ..clear()
      ..addAll(next);
    _operationId = operationId;
    if (next.isEmpty) {
      _recoveredDraft = false;
      _recoveredDraftNeedsReview = false;
    }
    if (mounted) setState(() {});
    refresh?.call(() {});
  }

  Future<void> _holdCurrentSale({StateSetter? refresh}) async {
    if (_cart.isEmpty ||
        _operationId == null ||
        !_checkoutReady ||
        _saving ||
        _walletStarting ||
        _cashConfirming ||
        _pendingWalletCheckout != null) {
      return;
    }
    var ticketName = '';
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, update) => AlertDialog(
          title: Text(
            shopCopy(widget.myanmar, 'Hold sale', 'အရောင်းကို ခဏသိမ်းရန်'),
          ),
          content: TextField(
            key: const ValueKey('shop-held-sale-name'),
            autofocus: true,
            maxLength: 80,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: shopCopy(
                widget.myanmar,
                'Name or reference',
                'အမည် သို့မဟုတ် အမှတ်အသား',
              ),
            ),
            onChanged: (value) => update(() => ticketName = value.trim()),
            onSubmitted: (_) {
              if (ticketName.isNotEmpty) {
                Navigator.pop(dialogContext, ticketName);
              }
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
            ),
            FilledButton(
              key: const ValueKey('shop-held-sale-confirm'),
              onPressed: ticketName.isEmpty
                  ? null
                  : () => Navigator.pop(dialogContext, ticketName),
              child: Text(shopCopy(widget.myanmar, 'Hold sale', 'ခဏသိမ်းရန်')),
            ),
          ],
        ),
      ),
    );
    if (name == null || !mounted) return;
    await _draftWrites;
    final operationId = _operationId;
    if (!mounted || operationId == null || _cart.isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.database.holdCounterSaleDraft(
        id: const Uuid().v4(),
        name: name,
        operationId: operationId,
      );
      await _loadCheckoutState();
      if (!mounted) return;
      if (refresh != null && _checkoutReady) Navigator.of(context).pop();
      _message(
        shopCopy(
          widget.myanmar,
          'Sale held on this device.',
          'အရောင်းကို ဤစက်တွင် ခဏသိမ်းထားပါသည်။',
        ),
      );
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not hold the sale. The current basket remains here.',
            'အရောင်းကို ခဏမသိမ်းနိုင်ပါ။ လက်ရှိစာရင်း မပျောက်ပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
      _focusScannerIfReady();
    }
  }

  Future<void> _showHeldSaleTickets() async {
    if (_heldTickets.isEmpty) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, refresh) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .68,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: Text(
                    shopCopy(
                      widget.myanmar,
                      'Held sales',
                      'ခဏသိမ်းထားသောအရောင်းများ',
                    ),
                    style: Theme.of(sheetContext).textTheme.titleLarge,
                  ),
                ),
                if (_cart.isNotEmpty || _pendingWalletCheckout != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: Text(
                      shopCopy(
                        widget.myanmar,
                        'Hold or finish the current sale before reopening another.',
                        'အခြားအရောင်းကို ပြန်မဖွင့်မီ လက်ရှိအရောင်းကို ခဏသိမ်းပါ သို့မဟုတ် ပြီးဆုံးအောင်လုပ်ပါ။',
                      ),
                    ),
                  ),
                Expanded(
                  child: ListView.separated(
                    itemCount: _heldTickets.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final ticket = _heldTickets[index];
                      final count = ticket.draft.quantities.values.fold<int>(
                        0,
                        (total, quantity) => total + quantity,
                      );
                      final canReopen =
                          _cart.isEmpty &&
                          _pendingWalletCheckout == null &&
                          !_saving &&
                          _checkoutReady;
                      return Semantics(
                        hint: canReopen
                            ? shopCopy(
                                widget.myanmar,
                                'Reopen this sale',
                                'ဤအရောင်းကို ပြန်ဖွင့်ရန်',
                              )
                            : null,
                        child: ListTile(
                          key: ValueKey('shop-held-reopen:${ticket.id}'),
                          contentPadding: const EdgeInsets.only(
                            left: 20,
                            right: 8,
                          ),
                          title: Text(ticket.name),
                          subtitle: Text(
                            shopCopy(
                              widget.myanmar,
                              '$count items · saved on this device',
                              '${shopNumber(count, myanmar: true)} ခု · ဤစက်တွင် သိမ်းထားသည်',
                            ),
                          ),
                          onTap: canReopen
                              ? () => _reopenHeldSale(ticket.id)
                              : null,
                          trailing: PopupMenuButton<String>(
                            tooltip: shopCopy(
                              widget.myanmar,
                              'Ticket options',
                              'အရောင်းရွေးချယ်မှုများ',
                            ),
                            onSelected: (action) {
                              if (action == 'discard') {
                                unawaited(
                                  _discardHeldSale(ticket, refresh: refresh),
                                );
                              }
                            },
                            itemBuilder: (_) => [
                              PopupMenuItem(
                                value: 'discard',
                                child: Text(
                                  shopCopy(
                                    widget.myanmar,
                                    'Discard ticket',
                                    'သိမ်းထားသောအရောင်းကို ဖျက်ရန်',
                                  ),
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
          ),
        ),
      ),
    );
    _focusScannerIfReady();
  }

  Future<void> _reopenHeldSale(String id) async {
    if (_cart.isNotEmpty ||
        _pendingWalletCheckout != null ||
        _saving ||
        !_checkoutReady) {
      return;
    }
    await _draftWrites;
    if (!mounted || _cart.isNotEmpty || _pendingWalletCheckout != null) return;
    setState(() => _saving = true);
    try {
      await widget.database.reopenHeldSaleTicket(id);
      await _loadCheckoutState();
      if (mounted && _checkoutReady) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not reopen this sale. Nothing was replaced.',
            'ဤအရောင်းကို ပြန်မဖွင့်နိုင်ပါ။ လက်ရှိစာရင်း မပြောင်းပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
      _focusScannerIfReady();
    }
  }

  Future<void> _discardHeldSale(
    HeldSaleTicket ticket, {
    StateSetter? refresh,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          shopCopy(
            widget.myanmar,
            'Discard held sale?',
            'သိမ်းထားသောအရောင်းကို ဖျက်မလား။',
          ),
        ),
        content: Text(ticket.name),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(shopCopy(widget.myanmar, 'Discard', 'ဖျက်ရန်')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.database.discardHeldSaleTicket(ticket.id);
      final held = await widget.database.readHeldSaleTickets();
      if (!mounted) return;
      setState(() => _heldTickets = held);
      if (held.isEmpty) {
        Navigator.of(context).pop();
      } else {
        refresh?.call(() {});
      }
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not discard this held sale.',
            'သိမ်းထားသောအရောင်းကို မဖျက်နိုင်ပါ။',
          ),
        );
      }
    }
  }

  void _add(ShopProduct product) {
    if (!_checkoutReady ||
        _saving ||
        _walletStarting ||
        _cashConfirming ||
        _pendingWalletCheckout != null) {
      return;
    }
    _queueDraftEdit(() async {
      if (_pendingWalletCheckout != null) return;
      final quantity = _cart[product.id] ?? 0;
      if (quantity >= product.onHand) {
        if (mounted) {
          _message(
            shopCopy(
              widget.myanmar,
              'Not enough stock available.',
              'လက်ကျန်ပစ္စည်း မလုံလောက်ပါ။',
            ),
          );
        }
        return;
      }
      final next = Map<String, int>.of(_cart);
      next[product.id] = quantity + 1;
      final operationId = _operationId ?? const Uuid().v4();
      await widget.database.saveCounterSaleDraft(
        operationId: operationId,
        quantities: next,
      );
      _applySavedCart(next, operationId);
    });
  }

  void _adjust(ShopProduct product, int delta, {StateSetter? refresh}) {
    if (!_checkoutReady ||
        _saving ||
        _walletStarting ||
        _cashConfirming ||
        _pendingWalletCheckout != null) {
      return;
    }
    _queueDraftEdit(() async {
      if (_pendingWalletCheckout != null) return;
      final quantity = (_cart[product.id] ?? 0) + delta;
      if (quantity > product.onHand) {
        if (mounted) {
          _message(
            shopCopy(
              widget.myanmar,
              'Not enough stock available.',
              'လက်ကျန်ပစ္စည်း မလုံလောက်ပါ။',
            ),
          );
        }
        return;
      }
      final next = Map<String, int>.of(_cart);
      if (quantity <= 0) {
        next.remove(product.id);
      } else {
        next[product.id] = quantity;
      }
      final operationId = next.isEmpty
          ? null
          : (_operationId ?? const Uuid().v4());
      if (operationId == null) {
        if (_operationId != null) {
          await widget.database.clearCounterSaleDraft(_operationId!);
        }
      } else {
        await widget.database.saveCounterSaleDraft(
          operationId: operationId,
          quantities: next,
        );
      }
      _applySavedCart(next, operationId, refresh: refresh);
    });
  }

  void _discardCounterDraft({StateSetter? refresh}) {
    if (!_checkoutReady ||
        _saving ||
        _walletStarting ||
        _cashConfirming ||
        _pendingWalletCheckout != null) {
      return;
    }
    _queueDraftEdit(() async {
      if (_operationId != null) {
        await widget.database.clearCounterSaleDraft(_operationId!);
      }
      _applySavedCart(const {}, null, refresh: refresh);
    });
  }

  bool _cartHasUnavailableProducts(List<ShopProduct> products) {
    final byId = {for (final item in products) item.id: item};
    return _cart.entries.any(
      (line) => byId[line.key] == null || line.value > byId[line.key]!.onHand,
    );
  }

  void _matchCartToAvailableStock(
    List<ShopProduct> products, {
    StateSetter? refresh,
  }) {
    if (!_checkoutReady ||
        _saving ||
        _walletStarting ||
        _cashConfirming ||
        _pendingWalletCheckout != null) {
      return;
    }
    _queueDraftEdit(() async {
      final operationId = _operationId;
      if (operationId == null) return;
      final byId = {for (final item in products) item.id: item};
      final next = <String, int>{};
      for (final line in _cart.entries) {
        final available = byId[line.key]?.onHand ?? 0;
        if (available > 0) {
          next[line.key] = line.value < available ? line.value : available;
        }
      }
      if (next.isEmpty) {
        await widget.database.clearCounterSaleDraft(operationId);
        _applySavedCart(const {}, null, refresh: refresh);
      } else {
        await widget.database.saveCounterSaleDraft(
          operationId: operationId,
          quantities: next,
        );
        _applySavedCart(next, operationId, refresh: refresh);
      }
    });
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
    _recoveredDraft = false;
    _recoveredDraftNeedsReview = false;
  }

  Future<void> _confirmCashSale({
    required List<ShopProduct> products,
    required bool closeSheet,
  }) async {
    if (!_checkoutReady || _saving || _cashConfirming || _walletStarting) {
      return;
    }
    setState(() => _cashConfirming = true);
    try {
      await _draftWrites;
      final operationId = _operationId;
      if (!mounted || _saving || operationId == null || _cart.isEmpty) {
        return;
      }
      final selected = Map<String, int>.of(_cart);
      final currentProducts = await widget.database.readActiveProducts();
      if (!mounted) return;
      if (_cartHasUnavailableProducts(currentProducts)) {
        _message(
          shopCopy(
            widget.myanmar,
            'Stock changed. Review the sale before accepting cash.',
            'လက်ကျန်ပြောင်းသွားပါသည်။ ငွေမယူမီ အရောင်းကို ပြန်စစ်ပါ။',
          ),
        );
        return;
      }
      final totalMmk = _cartTotal(currentProducts);
      final currentById = {
        for (final product in currentProducts) product.id: product,
      };
      final shownById = {for (final product in products) product.id: product};
      final draft = await widget.database.readCounterSaleDraft();
      if (!mounted) return;
      final itemsChanged = _cart.keys.any(
        (id) =>
            currentById[id]?.priceMmk != shownById[id]?.priceMmk ||
            currentById[id]?.name != shownById[id]?.name ||
            (draft?.operationId == operationId &&
                (currentById[id]?.priceMmk != draft?.unitPricesMmk[id] ||
                    currentById[id]?.name != draft?.productNames[id])),
      );
      if (itemsChanged) {
        // Refresh the saved draft only after stopping checkout. The cashier
        // sees the current line details and must choose Cash sale again.
        await widget.database.saveCounterSaleDraft(
          operationId: operationId,
          quantities: selected,
        );
        if (mounted) setState(() => _recoveredDraftNeedsReview = false);
        _message(
          shopCopy(
            widget.myanmar,
            'An item changed. Review each line, then tap Cash sale again.',
            'ပစ္စည်းအချက်အလက် ပြောင်းသွားပါသည်။ တစ်ကြောင်းချင်းစစ်ပြီး ငွေသားအရောင်းကို ထပ်နှိပ်ပါ။',
          ),
        );
        return;
      }
      var cashGiven = '';
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) {
            final entered = cashGiven.trim();
            final asciiDigits = entered.replaceAllMapped(
              RegExp(r'[၀-၉]'),
              (match) => '${'၀၁၂၃၄၅၆၇၈၉'.indexOf(match.group(0)!)}',
            );
            final tenderedMmk = entered.isEmpty
                ? null
                : int.tryParse(asciiDigits);
            final isShort = tenderedMmk != null && tenderedMmk < totalMmk;
            final invalid = entered.isNotEmpty && tenderedMmk == null;
            return AlertDialog(
              scrollable: true,
              insetPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 24,
              ),
              titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              actionsOverflowDirection: VerticalDirection.down,
              title: Text(
                shopCopy(widget.myanmar, 'Cash received?', 'ငွေသားရပြီလား။'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    shopCopy(
                      widget.myanmar,
                      'Amount to receive',
                      'လက်ခံရမည့်ငွေ',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _mmk(totalMmk),
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('shop-cash-given'),
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9၀-၉]')),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => cashGiven = value),
                    decoration: InputDecoration(
                      labelText: shopCopy(
                        widget.myanmar,
                        'Cash given (optional)',
                        'ပေးငွေ',
                      ),
                      helperText: widget.myanmar ? 'မထည့်လည်းရ' : null,
                    ),
                  ),
                  if (tenderedMmk != null && !isShort) ...[
                    const SizedBox(height: 12),
                    Text(shopCopy(widget.myanmar, 'Change', 'ပြန်အမ်းငွေ')),
                    Text(
                      _mmk(tenderedMmk - totalMmk),
                      key: const ValueKey('shop-cash-change'),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                  if (isShort || invalid) ...[
                    const SizedBox(height: 8),
                    Text(
                      shopCopy(
                        widget.myanmar,
                        isShort
                            ? 'Cash given is less than the amount due.'
                            : 'Enter a valid amount.',
                        isShort
                            ? 'ပေးထားသော ငွေသားမှာ ကျသင့်ငွေထက် နည်းပါသည်။'
                            : 'မှန်ကန်သော ငွေပမာဏကို ထည့်ပါ။',
                      ),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: Text(shopCopy(widget.myanmar, 'Back', 'ပြန်သွားရန်')),
                ),
                FilledButton(
                  onPressed: isShort || invalid
                      ? null
                      : () => Navigator.of(dialogContext).pop(true),
                  child: Text(
                    shopCopy(widget.myanmar, 'Complete sale', 'အတည်ပြုရန်'),
                  ),
                ),
              ],
            );
          },
        ),
      );
      await _draftWrites;
      if (confirmed != true ||
          !mounted ||
          _saving ||
          _operationId != operationId ||
          !mapEquals(_cart, selected)) {
        return;
      }
      await _completeSale(
        closeSheet: closeSheet,
        expectedTotalMmk: totalMmk,
        expectedUnitPricesMmk: {
          for (final id in selected.keys) id: currentById[id]!.priceMmk,
        },
        expectedProductNames: {
          for (final id in selected.keys) id: currentById[id]!.name,
        },
      );
    } catch (error) {
      if (mounted) _message(_saleSaveError(error, widget.myanmar));
    } finally {
      if (mounted) setState(() => _cashConfirming = false);
    }
  }

  Future<void> _startWalletSale({
    required List<ShopProduct> products,
    required bool closeSheet,
    StateSetter? refresh,
  }) async {
    if (!_checkoutReady || _walletStarting || _saving) {
      return;
    }
    setState(() => _walletStarting = true);
    try {
      await _draftWrites;
      if (!mounted || _operationId == null || _cart.isEmpty) return;
      if (_pendingWalletCheckout != null) {
        await _resumePendingWalletCheckout(closeSheet: closeSheet);
        return;
      }
      if (_cartHasUnavailableProducts(products)) {
        _message(
          shopCopy(
            widget.myanmar,
            'Match the sale to available stock before checkout.',
            'ငွေမရှင်းမီ ရနိုင်သည့်လက်ကျန်နှင့် အရောင်းကို ကိုက်ညီအောင်ပြင်ပါ။',
          ),
        );
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
      refresh?.call(() {});
      await _showWalletCheckout(intent, selected, closeSheet: closeSheet);
    } catch (error) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not start mobile payment. Check the basket and try again.',
            'မိုဘိုင်းငွေပေးချေမှုကို မစတင်နိုင်ပါ။ အရောင်းစာရင်းကို စစ်ပြီး ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _walletStarting = false);
    }
  }

  Future<void> _resumePendingWalletCheckout({bool closeSheet = false}) async {
    final intent = _pendingWalletCheckout;
    if (intent == null || _saving) return;
    try {
      final provider = intent.paymentMethod == 'kbzpay' ? 'KBZPay' : 'WavePay';
      if (intent.merchantQrPayload.isEmpty) {
        await _reconcileLegacyWalletCheckout(intent, closeSheet: closeSheet);
        return;
      }
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

  Future<void> _reconcileLegacyWalletCheckout(
    PendingWalletCheckout intent, {
    required bool closeSheet,
  }) async {
    final provider = intent.paymentMethod == 'kbzpay' ? 'KBZPay' : 'WavePay';
    final verified = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        var checked = false;
        return StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: Text(
              shopCopy(
                widget.myanmar,
                'Check an earlier wallet payment',
                'ယခင် မိုဘိုင်းငွေပေးချေမှုကို စစ်ဆေးရန်',
              ),
            ),
            content: SizedBox(
              width: 400,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$provider · ${_mmk(intent.totalMmk)}'),
                    const SizedBox(height: 8),
                    for (final line in intent.lines)
                      Text(
                        '${line.productName} × ${shopNumber(line.quantity, myanmar: widget.myanmar)}',
                      ),
                    const SizedBox(height: 12),
                    Text(
                      shopCopy(
                        widget.myanmar,
                        'The older app did not save this sale’s QR. Do not ask the customer to scan again. Check the recipient and matching incoming payment in your wallet app.',
                        'အက်ပ်အဟောင်းတွင် ဤအရောင်း၏ QR ကို မသိမ်းခဲ့ပါ။ ဝယ်သူကို ထပ်မံ ဖတ်ခိုင်းခြင်း မပြုပါနှင့်။ မိုဘိုင်းငွေပေးချေမှုအက်ပ်တွင် လက်ခံသူနှင့် ကိုက်ညီသော ငွေလက်ခံမှုကို စစ်ပါ။',
                      ),
                    ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: checked,
                      onChanged: (value) =>
                          setDialogState(() => checked = value ?? false),
                      title: Text(
                        shopCopy(
                          widget.myanmar,
                          'I verified the matching payment in the wallet app.',
                          'မိုဘိုင်းငွေပေးချေမှုအက်ပ်တွင် ကိုက်ညီသော ငွေလက်ခံမှုကို စစ်ဆေးပြီးပါပြီ။',
                        ),
                      ),
                    ),
                  ],
                ),
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
                onPressed: checked
                    ? () => Navigator.of(dialogContext).pop(true)
                    : null,
                child: Text(
                  shopCopy(
                    widget.myanmar,
                    'Record verified payment',
                    'စစ်ပြီးသော ငွေပေးချေမှုကို မှတ်တမ်းတင်ရန်',
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
    if (verified != true || !mounted) return;
    setState(() {
      _cart
        ..clear()
        ..addEntries(
          intent.lines.map((line) => MapEntry(line.productId, line.quantity)),
        );
      _operationId = intent.operationId;
    });
    await _completeSale(
      closeSheet: closeSheet,
      paymentMethod: intent.paymentMethod,
      walletCheckoutOperationId: intent.operationId,
    );
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
        lines: intent.lines,
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
            'မိုဘိုင်းငွေပေးချေမှုအက်ပ်တွင် ငွေမဝင်ကြောင်း သေချာမှသာ ပယ်ဖျက်ပါ။ အရောင်းကို မှတ်တမ်းတင်မည်မဟုတ်ပါ။',
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
      await _draftWrites;
      final resumedOperationId = const Uuid().v4();
      final cancelled = await widget.database.cancelWalletCheckoutIntent(
        intent.operationId,
        resumeOperationId: resumedOperationId,
      );
      if (!mounted || !cancelled) return;
      setState(() {
        _pendingWalletCheckout = null;
        _cart
          ..clear()
          ..addEntries(
            intent.lines.map((line) => MapEntry(line.productId, line.quantity)),
          );
        _operationId = resumedOperationId;
        _recoveredDraft = true;
        _recoveredDraftNeedsReview = true;
      });
      _message(
        shopCopy(
          widget.myanmar,
          'Unpaid checkout cancelled. The basket is still here.',
          'ငွေမဝင်သော ငွေပေးချေမှုကို ပယ်ဖျက်ပြီးပါပြီ။ အရောင်းစာရင်းကို မဖျက်ထားပါ။',
        ),
      );
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Could not cancel this checkout. It remains pending.',
            'ငွေပေးချေမှုကို ပယ်ဖျက်မရပါ။ ဆိုင်းငံ့ထားဆဲဖြစ်သည်။',
          ),
        );
      }
    }
  }

  Future<void> _completeSale({
    required bool closeSheet,
    String paymentMethod = 'cash',
    String? walletCheckoutOperationId,
    int? expectedTotalMmk,
    Map<String, int>? expectedUnitPricesMmk,
    Map<String, String>? expectedProductNames,
  }) async {
    await _draftWrites;
    final operationId = _operationId;
    if (!_checkoutReady || _saving || operationId == null || _cart.isEmpty) {
      return;
    }
    if (_pendingWalletCheckout != null && walletCheckoutOperationId == null) {
      _message(
        shopCopy(
          widget.myanmar,
          'Resume or cancel the wallet payment before recording another sale.',
          'အခြားအရောင်းမမှတ်မီ ဆိုင်းငံ့နေသော မိုဘိုင်းငွေပေးချေမှုကို ပြန်စစ်ပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
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
        expectedTotalMmk: expectedTotalMmk,
        expectedUnitPricesMmk: expectedUnitPricesMmk,
        expectedProductNames: expectedProductNames,
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
      var printerNeedsTest = false;
      try {
        final printerSettings = ReceiptPrinterSettings();
        final host = await printerSettings.readHost();
        if (host != null) {
          await ShopReceiptPrinter().printSale(
            host,
            receipt,
            myanmar: widget.myanmar,
          );
          printed = true;
        } else {
          printerNeedsTest = await printerSettings.readSavedHost() != null;
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
            : printerNeedsTest
            ? shopCopy(
                widget.myanmar,
                'Sale saved · ${_mmk(receipt.totalMmk)} · test printer to print',
                'အရောင်းသိမ်းပြီး · ${_mmk(receipt.totalMmk)} · ပရင်တာစမ်းသပ်ပြီးမှ ပုံနှိပ်ပါ',
              )
            : shopCopy(
                widget.myanmar,
                'Sale saved · ${_mmk(receipt.totalMmk)} · this device',
                'အရောင်းသိမ်းပြီး · ${_mmk(receipt.totalMmk)} · ဤစက်တွင်',
              ),
        action: (printed || printFailed || printerNeedsTest)
            ? SnackBarAction(
                label: shopCopy(
                  widget.myanmar,
                  printerNeedsTest
                      ? 'Test printer'
                      : printed
                      ? 'Send again'
                      : 'Retry print',
                  printerNeedsTest
                      ? 'ပရင်တာစမ်းရန်'
                      : printed
                      ? 'ထပ်ပို့ရန်'
                      : 'ထပ်စမ်းရန်',
                ),
                onPressed: () {
                  if (printerNeedsTest) {
                    _testPrinterThenPrint(receipt);
                  } else {
                    _printReceipt(receipt);
                  }
                },
              )
            : null,
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      if (paymentMethod == 'cash' || _pendingWalletCheckout == null) {
        _message(_saleSaveError(error, widget.myanmar));
      } else {
        // The operator has already confirmed the incoming wallet payment.
        // A failed local commit must never look like permission to charge
        // the customer again or discard the persisted pending intent.
        // Keep the cashier's action future free to finish while this
        // persistent recovery prompt remains open for acknowledgement.
        unawaited(
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (dialogContext) => AlertDialog(
              scrollable: true,
              title: Text(
                shopCopy(
                  widget.myanmar,
                  'Check payment before retrying',
                  'ထပ်မကြိုးစားမီ ငွေပေးချေမှုကို စစ်ပါ',
                ),
              ),
              content: Text(
                shopCopy(
                  widget.myanmar,
                  'You marked this payment as received, but the sale could not be confirmed. Keep it pending. Check Recent sales and your wallet record before retrying. Do not ask the customer to pay again.',
                  'ငွေလက်ခံပြီးကြောင်း သင်မှတ်သားခဲ့သော်လည်း အရောင်းကို အတည်မပြုနိုင်သေးပါ။ ဆိုင်းငံ့ထားပါ။ ထပ်မကြိုးစားမီ မကြာသေးသောအရောင်းများနှင့် မိုဘိုင်းငွေလက်ခံမှုမှတ်တမ်းကို စစ်ပါ။ ဝယ်သူကို ထပ်မံငွေပေးခိုင်းခြင်း မပြုပါနှင့်။',
                ),
              ),
              actions: [
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(
                    shopCopy(widget.myanmar, 'Keep pending', 'ဆိုင်းငံ့ထားပါ'),
                  ),
                ),
              ],
            ),
          ),
        );
      }
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

  Future<void> _testPrinterThenPrint(ShopSaleReceipt receipt) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => PrinterSetupScreen(myanmar: widget.myanmar),
      ),
    );
    if (!mounted) return;
    try {
      if (await ReceiptPrinterSettings().readHost() != null) {
        await _printReceipt(receipt);
      } else if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Sale is saved. Test the printer before printing this receipt.',
            'အရောင်းသိမ်းပြီးပါပြီ။ ဤပြေစာမပုံနှိပ်မီ ပရင်တာကို စမ်းသပ်ပါ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Sale is saved. Printer setup is unavailable; try again later.',
            'အရောင်းသိမ်းပြီးပါပြီ။ ပရင်တာဆက်တင်မရနိုင်သေးပါ။ နောက်မှထပ်စမ်းပါ။',
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
      builder: (sheetContext) => StreamBuilder<List<ShopProduct>>(
        stream: _productsStream,
        initialData: products,
        builder: (context, snapshot) => StatefulBuilder(
          builder: (context, refresh) {
            final size = MediaQuery.sizeOf(sheetContext);
            final phone = size.width < 520;
            final maxHeight = size.height * (phone ? .92 : .72);
            final textScale = MediaQuery.textScalerOf(sheetContext)
                .scale(1)
                .clamp(1.0, 1.6);
            // Keep a short sale near its content. Long baskets retain the
            // available height and scroll inside the existing list.
            final contentHeight =
                (300 +
                    76 * _cart.length.clamp(0, 4) +
                    (_cartHasUnavailableProducts(
                          snapshot.data ?? const <ShopProduct>[],
                        )
                        ? 80
                        : 0) +
                    (_pendingWalletCheckout == null ? 0 : 160)) *
                textScale;
            final height = phone
                ? contentHeight.clamp(320.0, maxHeight).toDouble()
                : maxHeight;
            return SafeArea(
              child: SizedBox(
                key: const ValueKey('shop-cart-sheet'),
                height: height,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  child: _cartPanel(
                    snapshot.data ?? const <ShopProduct>[],
                    refresh: (callback) {
                      if (sheetContext.mounted) refresh(callback);
                    },
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<bool> _showAddProduct({
    String initialName = '',
    String initialBarcode = '',
  }) async {
    try {
      final productId = await _createShopProduct(
        context: context,
        database: widget.database,
        myanmar: widget.myanmar,
        initialName: initialName,
        initialBarcode: initialBarcode,
      );
      if (productId == null) return false;
      if (mounted) {
        _message(
          shopCopy(
            widget.myanmar,
            'Product saved on this device.',
            'ကုန်ပစ္စည်းကို ဤစက်တွင် သိမ်းပြီးပါပြီ။',
          ),
          action: SnackBarAction(
            label: shopCopy(widget.myanmar, 'Add photo', 'ဓာတ်ပုံထည့်ရန်'),
            onPressed: () => _chooseProductPhoto(productId),
          ),
        );
      }
      return true;
    } catch (error) {
      if (mounted) {
        _message(_productSaveError(error, widget.myanmar));
      }
      return false;
    }
  }

  void _openMenuImport() {
    final recoveredPhoto = _recoveredMenuPhoto;
    if (recoveredPhoto != null) setState(() => _recoveredMenuPhoto = null);
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => MenuImportScreen(
          database: widget.database,
          authClient: widget.authClient,
          apiBaseUrl: widget.apiBaseUrl,
          myanmar: widget.myanmar,
          recoveredCameraPhoto: recoveredPhoto,
        ),
      ),
    );
  }

  void _openStock() {
    if (widget.onStock != null) {
      widget.onStock!();
      return;
    }
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => StockScreen(
          database: widget.database,
          myanmar: widget.myanmar,
          onAddProduct: () => unawaited(_showAddProduct()),
        ),
      ),
    );
  }

  void _openPrinter() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => PrinterSetupScreen(myanmar: widget.myanmar),
    ),
  );

  void _openRecentSales() {
    if (widget.onSales != null) {
      widget.onSales!();
      return;
    }
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => RecentSalesScreen(
          database: widget.database,
          myanmar: widget.myanmar,
        ),
      ),
    );
  }

  void _openSettings() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => ShopSettingsScreen(
        database: widget.database,
        authClient: widget.authClient,
        apiBaseUrl: widget.apiBaseUrl,
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

Future<String?> _createShopProduct({
  required BuildContext context,
  required ShopDatabase database,
  required bool myanmar,
  String initialName = '',
  String initialBarcode = '',
}) async {
  final values = await showDialog<_NewShopProduct>(
    context: context,
    builder: (_) => _NewShopProductDialog(
      myanmar: myanmar,
      initialName: initialName,
      initialBarcode: initialBarcode,
    ),
  );
  if (values == null) return null;
  final productId = const Uuid().v4();
  await database.addProduct(
    id: productId,
    name: values.name,
    barcode: values.barcode,
    priceMmk: values.priceMmk,
    openingStock: values.openingStock,
  );
  return productId;
}

String _productSaveError(Object error, bool myanmar) {
  if (error is StateError) {
    final detail = error.message.toString();
    if (detail.contains('barcode is already assigned')) {
      return shopCopy(
        myanmar,
        'This barcode already belongs to another product.',
        'ဤဘားကုဒ်ကို အခြားကုန်ပစ္စည်းတစ်ခုတွင် သုံးထားပြီးဖြစ်ပါသည်။',
      );
    }
    if (detail.contains('SKU is already assigned')) {
      return shopCopy(
        myanmar,
        'This SKU already belongs to another product.',
        'ဤကုန်ပစ္စည်းကုဒ်ကို အခြားကုန်ပစ္စည်းတစ်ခုတွင် သုံးထားပြီးဖြစ်ပါသည်။',
      );
    }
  }
  return shopCopy(
    myanmar,
    'Could not save the product. Check its details and try again.',
    'ကုန်ပစ္စည်းကို မသိမ်းနိုင်ပါ။ အချက်အလက်များကို စစ်ပြီး ထပ်ကြိုးစားပါ။',
  );
}

String _saleSaveError(Object error, bool myanmar) {
  if (error is StateError) {
    final detail = error.message.toString();
    if (detail.startsWith('Not enough stock for ')) {
      final item = detail.substring('Not enough stock for '.length);
      return shopCopy(
        myanmar,
        'Not enough stock for $item. Review the basket.',
        '$item လက်ကျန်မလုံလောက်ပါ။ အရောင်းစာရင်းကို ပြန်စစ်ပါ။',
      );
    }
    if (detail == 'Sale total changed. Review the amount again.' ||
        detail == 'Sale price changed. Review the amount again.' ||
        detail == 'Sale item changed. Review each line again.') {
      return shopCopy(
        myanmar,
        'An item changed. Review each line before taking cash.',
        'ပစ္စည်းအချက်အလက် ပြောင်းသွားပါသည်။ ငွေမယူမီ တစ်ခုချင်းစီကို ပြန်စစ်ပါ။',
      );
    }
    if (detail.contains('pending wallet')) {
      return shopCopy(
        myanmar,
        'Finish or cancel the pending mobile payment first.',
        'ဆိုင်းငံ့နေသော မိုဘိုင်းငွေပေးချေမှုကို အရင်ပြီးစီးပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
      );
    }
  }
  return shopCopy(
    myanmar,
    'Could not confirm the sale. Check Recent sales before trying again.',
    'အရောင်းအခြေအနေကို အတည်မပြုနိုင်ပါ။ ထပ်မကြိုးစားမီ မကြာသေးသောအရောင်းများကို စစ်ပါ။',
  );
}

class _WalletCheckoutDialog extends StatefulWidget {
  const _WalletCheckoutDialog({
    required this.methods,
    required this.totalMmk,
    required this.lines,
    required this.myanmar,
  });

  final List<MerchantWalletSetup> methods;
  final int totalMmk;
  final List<WalletCheckoutLineSnapshot> lines;
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
                shopMmk(widget.totalMmk, myanmar: myanmar),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              _savedWalletLines(context, widget.lines, myanmar: myanmar),
              const SizedBox(height: 8),
              Center(
                child: Semantics(
                  container: true,
                  excludeSemantics: true,
                  image: true,
                  label: shopCopy(
                    myanmar,
                    '${_selected.provider} merchant QR',
                    '${_selected.provider} ဆိုင်၏ ငွေလက်ခံ QR',
                  ),
                  child: QrImageView(
                    data: payload,
                    size: 220,
                    semanticsLabel: shopCopy(
                      myanmar,
                      '${_selected.provider} merchant QR',
                      '${_selected.provider} ဆိုင်၏ ငွေလက်ခံ QR',
                    ),
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
                  'ဝယ်သူကို ဤဆိုင် QR ကို ဖတ်၍ အပေါ်ပါငွေပမာဏ ထည့်ခိုင်းပါ။ ဤနေရာတွင် အတည်မပြုမီ မိုဘိုင်းငွေပေးချေမှုအက်ပ်တွင် ငွေလက်ခံသူနှင့် ဝင်ငွေကို စစ်ပါ။',
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
                    'မိုဘိုင်းငွေပေးချေမှုအက်ပ်တွင် ဤငွေပေးချေမှုကို စစ်ဆေးပြီးပါပြီ။',
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
  const _NewShopProductDialog({
    required this.myanmar,
    this.initialName = '',
    this.initialBarcode = '',
  });

  final bool myanmar;
  final String initialName;
  final String initialBarcode;

  @override
  State<_NewShopProductDialog> createState() => _NewShopProductDialogState();
}

class _NewShopProductDialogState extends State<_NewShopProductDialog> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initialName);
  late final _barcode = TextEditingController(text: widget.initialBarcode);
  final _price = TextEditingController();
  final _stock = TextEditingController();
  bool _showManualBarcode = false;

  @override
  void dispose() {
    _name.dispose();
    _barcode.dispose();
    _price.dispose();
    _stock.dispose();
    super.dispose();
  }

  Widget _barcodeField() => TextFormField(
    key: const ValueKey('shop-product-barcode'),
    controller: _barcode,
    decoration: InputDecoration(
      labelText: shopCopy(widget.myanmar, 'Barcode', 'ဘားကုဒ်'),
    ),
  );

  void _saveProduct() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(
      _NewShopProduct(
        name: _name.text.trim(),
        barcode: _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
        priceMmk: int.parse(_price.text.trim()),
        openingStock: int.parse(_stock.text.trim()),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 380;
    final compactActionWidth = MediaQuery.sizeOf(context).width - 80;
    return AlertDialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 40,
        vertical: 24,
      ),
      title: Text(
        shopCopy(widget.myanmar, 'Add product', 'ကုန်ပစ္စည်းထည့်ရန်'),
      ),
      titleTextStyle: Theme.of(context).textTheme.headlineSmall,
      content: SizedBox(
        width: 360,
        child: Form(
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
                // A scanned code stays visible near the name so the cashier can
                // verify it. During manual entry, keep the three required fields
                // together before asking for an optional barcode.
                if (widget.initialBarcode.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _barcodeField(),
                ],
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
                    labelText: shopCopy(widget.myanmar, 'In stock', 'လက်ကျန်'),
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
                if (widget.initialBarcode.trim().isEmpty &&
                    !_showManualBarcode) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      key: const ValueKey('shop-product-add-barcode'),
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      onPressed: () =>
                          setState(() => _showManualBarcode = true),
                      child: Text(
                        shopCopy(
                          widget.myanmar,
                          'Add barcode',
                          'ဘားကုဒ်ထည့်ရန်',
                        ),
                      ),
                    ),
                  ),
                ] else if (widget.initialBarcode.trim().isEmpty) ...[
                  const SizedBox(height: 10),
                  _barcodeField(),
                ],
              ],
            ),
          ),
        ),
      ),
      actionsPadding: EdgeInsets.fromLTRB(
        compact ? 16 : 24,
        0,
        compact ? 16 : 24,
        18,
      ),
      actions: compact
          ? [
              SizedBox(
                width: compactActionWidth,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saveProduct,
                        child: Text(
                          shopCopy(widget.myanmar, 'Save product', 'သိမ်းရန်'),
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(
                        shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ'),
                      ),
                    ),
                  ],
                ),
              ),
            ]
          : [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
              ),
              FilledButton(
                onPressed: _saveProduct,
                child: Text(
                  shopCopy(widget.myanmar, 'Save product', 'သိမ်းရန်'),
                ),
              ),
            ],
    );
  }
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact =
        MediaQuery.sizeOf(context).width < 480 ||
        MediaQuery.textScalerOf(context).scale(1) > 1.2;
    return ListTile(
      contentPadding: EdgeInsets.symmetric(
        horizontal: compact ? 12 : 16,
        vertical: compact ? 4 : 8,
      ),
      horizontalTitleGap: compact ? 8 : 16,
      minLeadingWidth: 28,
      leading: compact
          ? null
          : Icon(icon, size: 23, color: theme.colorScheme.primary),
      title: Text(
        title,
        style: compact
            ? theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)
            : theme.textTheme.titleMedium,
      ),
      subtitle: compact
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
      trailing: Icon(Icons.chevron_right, size: compact ? 18 : 20),
      onTap: onTap,
    );
  }
}

class ShopSettingsScreen extends StatefulWidget {
  const ShopSettingsScreen({
    required this.database,
    required this.myanmar,
    required this.onLanguageChanged,
    this.authClient,
    this.apiBaseUrl = 'https://app.supermega.dev',
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
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
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              shopCopy(_myanmar, 'Language', 'ဘာသာစကား'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              showSelectedIcon: false,
              style: const ButtonStyle(
                minimumSize: WidgetStatePropertyAll(Size(0, 48)),
              ),
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
            Card(
              child: Column(
                children: [
                  if (_connectedOrdersEnabled) ...[
                    _SetupTile(
                      icon: Icons.inventory_2_outlined,
                      title: shopCopy(
                        _myanmar,
                        'Connected orders',
                        'ချိတ်ဆက်အော်ဒါများ',
                      ),
                      subtitle: shopCopy(
                        _myanmar,
                        'Read confirmed orders for your account.',
                        'သင့်အကောင့်၏ အတည်ပြုပြီး အော်ဒါများကို ကြည့်ပါ။',
                      ),
                      onTap: () => Navigator.of(context).push<void>(
                        MaterialPageRoute<void>(
                          builder: (_) => ConnectedOrdersScreen(
                            myanmar: _myanmar,
                            authClient: widget.authClient,
                            apiBaseUrl: widget.apiBaseUrl,
                          ),
                        ),
                      ),
                    ),
                    const Divider(height: 1),
                  ],
                  _SetupTile(
                    icon: Icons.print_outlined,
                    title: shopCopy(_myanmar, 'Receipt printer', 'ပြေစာပရင်တာ'),
                    subtitle: shopCopy(
                      _myanmar,
                      'Find and test a printer.',
                      'ပရင်တာကို ရှာပြီး စမ်းသပ်ပါ။',
                    ),
                    onTap: () => Navigator.of(context).push<void>(
                      MaterialPageRoute<void>(
                        builder: (_) => PrinterSetupScreen(myanmar: _myanmar),
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  _SetupTile(
                    icon: Icons.account_balance_wallet_outlined,
                    title: shopCopy(
                      _myanmar,
                      'Mobile money',
                      'မိုဘိုင်းငွေပေးချေမှု',
                    ),
                    subtitle: shopCopy(
                      _myanmar,
                      'Save provider-issued payment QR codes.',
                      'ငွေပေးချေမှု QR ကို သိမ်းပါ။',
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
                  const Divider(height: 1),
                  _SetupTile(
                    icon: Icons.point_of_sale_outlined,
                    title: shopCopy(_myanmar, 'Cash shift', 'ငွေသားတာဝန်ချိန်'),
                    subtitle: shopCopy(
                      _myanmar,
                      'Count drawer cash and record any difference.',
                      'ငွေသားကို ရေတွက်ပြီး ကွာခြားချက် မှတ်ပါ။',
                    ),
                    onTap: () => Navigator.of(context).push<void>(
                      MaterialPageRoute<void>(
                        builder: (_) => ShopCashShiftScreen(
                          database: widget.database,
                          myanmar: _myanmar,
                        ),
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  _SetupTile(
                    icon: Icons.file_download_outlined,
                    title: shopCopy(
                      _myanmar,
                      'Export backup file',
                      'အရန်ကူးဖိုင် ထုတ်ရန်',
                    ),
                    subtitle: shopCopy(
                      _myanmar,
                      'Save an encrypted file.',
                      'စကားဝှက်ဖြင့်ကာကွယ်ထားသောဖိုင်ကို သိမ်းပါ။',
                    ),
                    onTap: () => Navigator.of(context).push<void>(
                      MaterialPageRoute<void>(
                        builder: (_) => ShopBackupExportScreen(
                          database: widget.database,
                          myanmar: _myanmar,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Text(
                shopCopy(
                  _myanmar,
                  'On this device only. No online backup.',
                  'ဤစက်တွင်သာ သိမ်းသည်။ အွန်လိုင်းအရန်ကူး မရှိပါ။',
                ),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
