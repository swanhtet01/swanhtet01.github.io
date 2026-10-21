import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'menu_import_screen.dart';
import 'menu_import_service.dart';
import 'printer_setup_screen.dart';
import 'printer_services.dart';
import 'recent_sales_screen.dart';
import 'shop_backup.dart';
import 'shop_cash_shift_screen.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';
import 'shop_today_screen.dart';
import 'stock_screen.dart';
import 'wallet_setup_screen.dart';

const _pendingPickerIntentKey = 'shop_pending_picker_intent';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  try {
    await ShopBackup.cleanupInterruptedStaging(
      await getApplicationDocumentsDirectory(),
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
  late bool _myanmar = widget.initialMyanmar;
  int _workspaceTab = 0;
  int _todayRefreshToken = 0;
  int _addProductRequest = 0;
  bool _counterOpened = false;

  Future<void> _setLanguage(bool myanmar) async {
    setState(() => _myanmar = myanmar);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool('shop_locale_myanmar', myanmar);
  }

  Future<void> _openCounter(BuildContext context) async {
    setState(() {
      _counterOpened = true;
      _workspaceTab = 1;
    });
  }

  Future<void> _openFirstProduct(BuildContext context) async {
    setState(() {
      _counterOpened = true;
      _workspaceTab = 1;
      _addProductRequest++;
    });
  }

  void _showToday() {
    setState(() {
      _workspaceTab = 0;
      _todayRefreshToken++;
    });
  }

  Future<void> _openSales(BuildContext context) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) =>
              RecentSalesScreen(database: widget.database, myanmar: _myanmar),
        ),
      );

  Future<void> _openStock(BuildContext context) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) =>
              StockScreen(database: widget.database, myanmar: _myanmar),
        ),
      );

  Future<void> _openSettings(BuildContext context) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => ShopSettingsScreen(
            database: widget.database,
            myanmar: _myanmar,
            onLanguageChanged: _setLanguage,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final fontFamily = _myanmar ? 'NotoSansMyanmar' : 'Inter';
    final tracking = _myanmar ? 0.0 : -0.35;
    const ink = Color(0xff171b2c);
    const border = Color(0xffdce2ed);
    const accent = Color(0xff2563eb);
    return MaterialApp(
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
        fontFamilyFallback: const ['NotoSansMyanmar'],
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
                fontSize: _myanmar ? 30 : 34,
                fontWeight: FontWeight.w700,
                height: _myanmar ? 1.4 : 1.15,
                letterSpacing: tracking,
              ),
              headlineSmall: TextStyle(
                fontSize: _myanmar ? 26 : 28,
                fontWeight: FontWeight.w700,
                height: _myanmar ? 1.4 : 1.2,
                letterSpacing: tracking,
              ),
              titleLarge: TextStyle(
                fontSize: _myanmar ? 20 : 21,
                fontWeight: FontWeight.w700,
                height: _myanmar ? 1.45 : 1.25,
                letterSpacing: tracking,
              ),
              titleMedium: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                height: _myanmar ? 1.5 : 1.35,
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
            ).apply(
              fontFamily: fontFamily,
              fontFamilyFallback: const ['NotoSansMyanmar'],
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
            fontSize: _myanmar ? 18 : 20,
            fontWeight: FontWeight.w700,
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
            fontSize: 14,
            fontWeight: FontWeight.w700,
            height: _myanmar ? 1.45 : 1.25,
            color: accent,
          ),
          unselectedLabelTextStyle: TextStyle(
            fontFamily: fontFamily,
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
                if (!didPop && _workspaceTab == 1) _showToday();
              },
              child: IndexedStack(
                index: _workspaceTab,
                children: [
                  ShopTodayScreen(
                    database: widget.database,
                    myanmar: _myanmar,
                    refreshToken: _todayRefreshToken,
                    onNewSale: _openCounter,
                    onAddFirstProduct: _openFirstProduct,
                    onSales: _openSales,
                    onStock: _openStock,
                    onSettings: _openSettings,
                  ),
                  if (_counterOpened)
                    ShopHome(
                      database: widget.database,
                      authClient: widget.authClient,
                      apiBaseUrl: widget.apiBaseUrl,
                      myanmar: _myanmar,
                      onLanguageChanged: _setLanguage,
                      onToday: _showToday,
                      addProductRequest: _addProductRequest,
                    )
                  else
                    const SizedBox.shrink(),
                ],
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

class ShopHome extends StatefulWidget {
  const ShopHome({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.myanmar,
    required this.onLanguageChanged,
    this.onToday,
    this.addProductRequest = 0,
    this.recoverMenuPhoto,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool myanmar;
  final ValueChanged<bool> onLanguageChanged;
  final VoidCallback? onToday;
  final int addProductRequest;
  final Future<XFile?> Function()? recoverMenuPhoto;

  @override
  State<ShopHome> createState() => _ShopHomeState();
}

class _ShopHomeState extends State<ShopHome> {
  String _mmk(int amount) => shopMmk(amount, myanmar: widget.myanmar);

  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _cart = <String, int>{};
  late final Stream<List<ShopProduct>> _productsStream = widget.database
      .watchActiveProducts();
  String? _operationId;
  bool _saving = false;
  bool _cashConfirming = false;
  PendingWalletCheckout? _pendingWalletCheckout;
  XFile? _recoveredMenuPhoto;
  final _thumbnailFutures = <String, Future<Uint8List?>>{};

  @override
  void initState() {
    super.initState();
    _loadPendingWalletCheckout();
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
            'မပြီးသေးသော မိုဘိုင်းငွေပေးချေမှုကို စစ်၍မရပါ။',
          ),
        );
      }
    }
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
    final showRail = inWorkspace && width >= 700;
    final contentWidth = width - (showRail ? (width >= 1100 ? 191 : 77) : 0);
    // A portrait tablet can still fit two usable panes beside the compact rail.
    // Keep narrower layouts on the single-column review-sheet path.
    const minSplitContentWidth = 740.0;
    final cartAction = SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: StreamBuilder<List<ShopProduct>>(
        stream: _productsStream,
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
                'အရောင်းစစ်ရန် · ${shopNumber(count, myanmar: true)} ခု · ${_mmk(_cartTotal(products))}',
              ),
            ),
          );
        },
      ),
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(
          shopCopy(
            widget.myanmar,
            inWorkspace ? 'Sell' : 'Shop',
            inWorkspace ? 'ရောင်းရန်' : 'ဆိုင်',
          ),
        ),
        actions: [
          if (inWorkspace && width < 700)
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
                label: Text(shopCopy(widget.myanmar, 'Sales', 'အရောင်းများ')),
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
              label: Text(shopCopy(widget.myanmar, 'Settings', 'ဆက်တင်များ')),
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
                  child: Text(shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်')),
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
                  if (contentWidth >= minSplitContentWidth) {
                    final tablet = contentWidth < 1080;
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
                                  child: SizedBox(
                                    key: const ValueKey('shop-split-catalog'),
                                    child: _catalog(products),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (products.isNotEmpty) ...[
                            SizedBox(width: tablet ? 12 : 18),
                            SizedBox(
                              key: const ValueKey('shop-split-basket'),
                              width: cartWidth,
                              child: _cartPanel(products),
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
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                          child: _recoveredMenuPhotoCard(),
                        ),
                      if (_pendingWalletCheckout != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                          child: _pendingWalletCheckoutCard(),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 12, 10),
                        child: _catalogHeader(hasProducts: products.isNotEmpty),
                      ),
                      if (products.isNotEmpty) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: _searchField(products),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Expanded(child: _productList(products)),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: inWorkspace && width < 700
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_cart.isNotEmpty) cartAction,
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
          : contentWidth >= minSplitContentWidth || _cart.isEmpty
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

  Widget _catalog(List<ShopProduct> products) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _catalogHeader(hasProducts: products.isNotEmpty),
          if (products.isNotEmpty) ...[
            const SizedBox(height: 12),
            _searchField(products),
          ],
          const SizedBox(height: 8),
          Expanded(child: _productList(products)),
        ],
      ),
    ),
  );

  Widget _catalogHeader({required bool hasProducts}) => LayoutBuilder(
    builder: (context, constraints) {
      final title = Text(
        shopCopy(widget.myanmar, 'Products', 'ကုန်ပစ္စည်းများ'),
        style: Theme.of(context).textTheme.titleLarge,
      );
      if (!hasProducts) return title;
      final importButton = IconButton(
        tooltip: shopCopy(
          widget.myanmar,
          'Import menu photo',
          'မီနူးဓာတ်ပုံထည့်ရန်',
        ),
        onPressed: _openMenuImport,
        icon: const Icon(Icons.document_scanner_outlined),
      );
      final addButton = OutlinedButton.icon(
        onPressed: _showAddProduct,
        icon: const Icon(Icons.add),
        label: Text(shopCopy(widget.myanmar, 'New product', 'ကုန်ပစ္စည်းအသစ်')),
      );
      if (constraints.maxWidth < 420) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            title,
            const SizedBox(height: 8),
            Row(
              children: [
                importButton,
                const SizedBox(width: 8),
                Expanded(child: addButton),
              ],
            ),
          ],
        );
      }
      return Row(
        children: [
          Expanded(child: title),
          importButton,
          addButton,
        ],
      );
    },
  );

  Widget _searchField(List<ShopProduct> products) => TextField(
    controller: _search,
    focusNode: _searchFocus,
    autofocus: defaultTargetPlatform == TargetPlatform.windows,
    onChanged: (_) => setState(() {}),
    // Keyboard scanners submit with Enter. Keep an already active scan field
    // ready for the next item without opening a keyboard on an idle tablet.
    onEditingComplete: () {},
    onSubmitted: (value) {
      final code = value.trim();
      if (code.isEmpty) return;
      final matches = products
          .where((item) => item.barcode == code || item.sku == code)
          .toList();
      if (matches.length == 1) {
        final keepSearchFocus = _searchFocus.hasFocus;
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
            'ဤဘားကုဒ် သို့မဟုတ် SKU ကို ကုန်ပစ္စည်းတစ်မျိုးထက်ပို၍ သုံးထားသည်။ မရောင်းမီ ကုန်ပစ္စည်းကုဒ်များကို ပြင်ပါ။',
          ),
        );
      } else {
        _message(
          shopCopy(
            widget.myanmar,
            'No exact barcode or SKU match. Check the code or add the product.',
            'ဘားကုဒ် သို့မဟုတ် SKU အတိအကျ မတွေ့ပါ။ ကုဒ်ကို စစ်ပါ သို့မဟုတ် ကုန်ပစ္စည်းထည့်ပါ။',
          ),
        );
      }
    },
    decoration: InputDecoration(
      prefixIcon: const Icon(Icons.search),
      hintText: shopCopy(
        widget.myanmar,
        'Search name, barcode or SKU',
        'အမည်၊ ဘားကုဒ် သို့မဟုတ် SKU ရှာရန်',
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
    final viewportWidth = MediaQuery.sizeOf(context).width;
    // Prices move below names on portrait tablets so the narrower catalog
    // pane retains a readable, full-row add target.
    final compactProductRow = viewportWidth < 900;
    final text = _search.text.trim().toLowerCase();
    final visible = products
        .where(
          (item) =>
              text.isEmpty ||
              item.name.toLowerCase().contains(text) ||
              (item.barcode?.toLowerCase().contains(text) ?? false) ||
              (item.sku?.toLowerCase().contains(text) ?? false),
        )
        .toList();
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
        final stock = item.onHand == 0
            ? shopCopy(widget.myanmar, 'Out of stock', 'လက်ကျန်ကုန်ပါပြီ')
            : shopCopy(
                widget.myanmar,
                '${item.onHand} in stock',
                '${shopNumber(item.onHand, myanmar: true)} ခုလက်ကျန်',
              );
        final canAdd = item.onHand > 0 && _pendingWalletCheckout == null;
        final addAffordance = ExcludeSemantics(
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: canAdd ? const Color(0xffeef3ff) : const Color(0xfff1f2f5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.add,
              size: 20,
              color: canAdd
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).disabledColor,
            ),
          ),
        );
        return Tooltip(
          message: item.onHand == 0
              ? shopCopy(widget.myanmar, 'Out of stock', 'လက်ကျန်ကုန်ပါပြီ')
              : _pendingWalletCheckout != null
              ? shopCopy(
                  widget.myanmar,
                  'Finish the pending payment first',
                  'ဆိုင်းငံ့ငွေပေးချေမှုကို အရင်ပြီးစီးပါ',
                )
              : shopCopy(widget.myanmar, 'Add to sale', 'အရောင်းထဲထည့်ရန်'),
          child: ListTile(
            isThreeLine: compactProductRow,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 10,
            ),
            leading: IconButton(
              key: ValueKey('shop-product-photo:${item.id}'),
              tooltip: shopCopy(
                widget.myanmar,
                'Add or change product photo',
                'ကုန်ပစ္စည်းဓာတ်ပုံ ထည့်ရန် သို့မဟုတ် ပြောင်းရန်',
              ),
              onPressed: () => _chooseProductPhoto(item.id),
              icon: FutureBuilder<Uint8List?>(
                future: _thumbnailFor(item.id),
                builder: (context, snapshot) {
                  final bytes = snapshot.data;
                  if (bytes == null) {
                    return const Icon(Icons.add_photo_alternate_outlined);
                  }
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      bytes,
                      width: 44,
                      height: 44,
                      fit: BoxFit.cover,
                      errorBuilder: (_, error, stackTrace) =>
                          const Icon(Icons.add_photo_alternate_outlined),
                    ),
                  );
                },
              ),
            ),
            title: Text(
              item.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            subtitle: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (compactProductRow)
                  Text(_mmk(item.priceMmk), style: _shopMoneyStyle(context)),
                Text(
                  stock,
                  style: TextStyle(
                    color: item.onHand == 0
                        ? Theme.of(context).colorScheme.error
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            trailing: compactProductRow
                ? addAffordance
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _mmk(item.priceMmk),
                        style: _shopMoneyStyle(context),
                      ),
                      const SizedBox(width: 12),
                      addAffordance,
                    ],
                  ),
            onTap: canAdd ? () => _add(item) : null,
          ),
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
                    style: Theme.of(context).textTheme.titleLarge,
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
              _pendingWalletCheckoutCard(refresh: refresh),
              const SizedBox(height: 8),
            ],
            if (entries.isEmpty)
              Expanded(
                child: Center(
                  child: Text(
                    shopCopy(
                      widget.myanmar,
                      'Add products to start a sale.',
                      'အရောင်းစရန် ပစ္စည်းထည့်ပါ။',
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
              LayoutBuilder(
                builder: (context, constraints) {
                  final label = Text(
                    shopCopy(widget.myanmar, 'Total', 'စုစုပေါင်း'),
                  );
                  final amount = Text(
                    _mmk(
                      _pendingWalletCheckout?.totalMmk ?? _cartTotal(products),
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
                      label: Text(
                        shopCopy(widget.myanmar, 'Cash sale', 'ငွေသား'),
                      ),
                    );
                    final wallet = OutlinedButton.icon(
                      onPressed: _saving || _cashConfirming
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
                        children: [cash, const SizedBox(height: 8), wallet],
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
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          snapshot?.productName ?? item.name,
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        Text(
          '${_mmk(snapshot?.unitPriceMmk ?? item.priceMmk)} × ${shopNumber(quantity, myanmar: widget.myanmar)}',
          style: _shopMoneyStyle(context),
        ),
      ],
    );
    final controls = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: shopCopy(widget.myanmar, 'Remove one', 'တစ်ခုလျှော့ရန်'),
          onPressed: _saving || _pendingWalletCheckout != null
              ? null
              : () => _adjust(item, -1, refresh: refresh),
          icon: const Icon(Icons.remove_circle_outline),
        ),
        Text(shopNumber(quantity, myanmar: widget.myanmar)),
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

  Future<void> _confirmCashSale({
    required List<ShopProduct> products,
    required bool closeSheet,
  }) async {
    final operationId = _operationId;
    if (_saving || _cashConfirming || operationId == null || _cart.isEmpty) {
      return;
    }
    final selected = Map<String, int>.of(_cart);
    final knownProducts = {for (final product in products) product.id: product};
    if (selected.keys.any((id) => !knownProducts.containsKey(id))) {
      _message(
        shopCopy(
          widget.myanmar,
          'A product changed. Review the sale again.',
          'ကုန်ပစ္စည်းပြောင်းလဲသွားပါသည်။ အရောင်းကို ပြန်စစ်ပါ။',
        ),
      );
      return;
    }
    final totalMmk = _cartTotal(products);
    setState(() => _cashConfirming = true);
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(
            shopCopy(
              widget.myanmar,
              'Cash received?',
              'ငွေသားလက်ခံပြီးပြီလား။',
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                shopCopy(widget.myanmar, 'Amount to receive', 'လက်ခံရမည့်ငွေ'),
              ),
              const SizedBox(height: 8),
              Text(
                _mmk(totalMmk),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(shopCopy(widget.myanmar, 'Back', 'ပြန်သွားရန်')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(
                shopCopy(widget.myanmar, 'Complete sale', 'အရောင်းပြီးစီးရန်'),
              ),
            ),
          ],
        ),
      );
      if (confirmed != true ||
          !mounted ||
          _saving ||
          _operationId != operationId ||
          !mapEquals(_cart, selected)) {
        return;
      }
      await _completeSale(closeSheet: closeSheet, expectedTotalMmk: totalMmk);
    } finally {
      if (mounted) setState(() => _cashConfirming = false);
    }
  }

  Future<void> _startWalletSale({
    required List<ShopProduct> products,
    required bool closeSheet,
    StateSetter? refresh,
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
          'ငွေမဝင်သော ငွေပေးချေမှုကို ပယ်ဖျက်ပြီးပါပြီ။ အရောင်းစာရင်းကို မဖျက်ထားပါ။',
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
    int? expectedTotalMmk,
  }) async {
    final operationId = _operationId;
    if (_saving || operationId == null || _cart.isEmpty) return;
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
      _message(_saleSaveError(error, widget.myanmar));
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
          builder: (context, refresh) => SafeArea(
            child: SizedBox(
              height:
                  MediaQuery.sizeOf(sheetContext).height *
                  (MediaQuery.sizeOf(sheetContext).width < 520 ? .92 : .72),
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
          ),
        ),
      ),
    );
  }

  Future<void> _showAddProduct({
    String initialName = '',
    String initialBarcode = '',
  }) async {
    final values = await showDialog<_NewShopProduct>(
      context: context,
      builder: (_) => _NewShopProductDialog(
        myanmar: widget.myanmar,
        initialName: initialName,
        initialBarcode: initialBarcode,
      ),
    );
    if (values == null) return;
    try {
      final productId = const Uuid().v4();
      await widget.database.addProduct(
        id: productId,
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
          action: SnackBarAction(
            label: shopCopy(widget.myanmar, 'Add photo', 'ဓာတ်ပုံထည့်ရန်'),
            onPressed: () => _chooseProductPhoto(productId),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        _message(_productSaveError(error, widget.myanmar));
      }
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

  void _openStock() => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) =>
          StockScreen(database: widget.database, myanmar: widget.myanmar),
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
        'ဤ SKU ကို အခြားကုန်ပစ္စည်းတစ်ခုတွင် သုံးထားပြီးဖြစ်ပါသည်။',
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
    if (detail == 'Sale total changed. Review the amount again.') {
      return shopCopy(
        myanmar,
        'Price changed. Review the total before taking cash.',
        'ဈေးနှုန်းပြောင်းလဲသွားပါသည်။ ငွေမယူမီ စုစုပေါင်းငွေကို ပြန်စစ်ပါ။',
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
                shopMmk(widget.totalMmk, myanmar: myanmar),
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact =
        MediaQuery.sizeOf(context).width < 480 ||
        MediaQuery.textScalerOf(context).scale(1) > 1.2;
    final leading = CircleAvatar(
      backgroundColor: theme.colorScheme.primaryContainer,
      child: Icon(icon, color: theme.colorScheme.primary),
    );
    final titleText = Text(title, style: theme.textTheme.titleMedium);
    final subtitleText = Text(
      subtitle,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
    return Card(
      child: compact
          ? InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: titleText),
                        const Icon(Icons.chevron_right),
                      ],
                    ),
                    const SizedBox(height: 8),
                    subtitleText,
                  ],
                ),
              ),
            )
          : ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 10,
              ),
              leading: leading,
              title: titleText,
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: subtitleText,
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: onTap,
            ),
    );
  }
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
            const SizedBox(height: 12),
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
            const SizedBox(height: 12),
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
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.storage_outlined),
                        const SizedBox(width: 12),
                        Text(
                          shopCopy(_myanmar, 'On this device', 'ဤစက်တွင်'),
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      shopCopy(
                        _myanmar,
                        'Saved here. Online backup is not active.',
                        'ဤစက်တွင်သာ သိမ်းထားသည်။ အွန်လိုင်းအရန်ကူး မရှိသေးပါ။',
                      ),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
