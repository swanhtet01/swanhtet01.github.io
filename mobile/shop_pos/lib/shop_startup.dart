import 'dart:async';
import 'dart:io';
import 'dart:isolate';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'shop_backup.dart';
import 'shop_copy.dart';
import 'shop_database.dart';

typedef PickShopBackup = Future<XFile?> Function();
typedef BuildOpenedShop = Widget Function(ShopDatabase database, bool myanmar);
typedef CloseOpenedShopDatabase = Future<void> Function(
  ShopDatabase database,
);

/// Selects a new local Shop or restores an archive before Drift opens a file.
/// An existing database never enters the restore path.
class ShopStartup extends StatefulWidget {
  const ShopStartup({
    required this.documents,
    required this.initialMyanmar,
    required this.buildShop,
    this.pickBackup,
    this.importScratchRoot,
    this.closeDatabase,
    super.key,
  });

  final Directory documents;
  final bool initialMyanmar;
  final BuildOpenedShop buildShop;
  final PickShopBackup? pickBackup;
  final Directory? importScratchRoot;

  /// Application callers use [ShopDatabase.close]. Tests may inject a wrapper
  /// so platform file-handle release can be awaited deterministically.
  final CloseOpenedShopDatabase? closeDatabase;

  @override
  State<ShopStartup> createState() => _ShopStartupState();
}

class _ShopStartupState extends State<ShopStartup> {
  final _password = TextEditingController();
  late bool _myanmar = widget.initialMyanmar;
  bool _checking = true;
  bool _busy = false;
  bool _blocked = false;
  bool _opening = false;
  Widget? _openedShop;
  ShopDatabase? _openedDatabase;
  File? _selectedArchive;
  String? _selectedName;
  String? _message;

  File get _databaseFile => ShopDatabase.privateDatabaseFile(widget.documents);

  Future<bool> _hasRestoreMarker() async =>
      await FileSystemEntity.type(
        ShopBackup.restoreMarkerFor(_databaseFile).path,
        followLinks: false,
      ) !=
      FileSystemEntityType.notFound;

  @override
  void initState() {
    super.initState();
    unawaited(_inspectExistingStore());
  }

  Future<bool> _hasSidecar() async {
    for (final suffix in const ['-journal', '-wal', '-shm']) {
      if (await FileSystemEntity.type(
            '${_databaseFile.path}$suffix',
            followLinks: false,
          ) !=
          FileSystemEntityType.notFound) {
        return true;
      }
    }
    return false;
  }

  Future<void> _inspectExistingStore() async {
    try {
      final presence = await ShopBackup.inspectStore(_databaseFile);
      if (!mounted) return;
      if (presence == ShopStorePresence.existing) {
        await _openShop();
      } else {
        setState(() {
          _blocked = presence != ShopStorePresence.empty;
          _checking = false;
          if (presence == ShopStorePresence.interrupted) {
            _message = shopCopy(
              _myanmar,
              'A restore was interrupted. Your files were not replaced. Close Shop and contact support before opening these records.',
              'ပြန်ယူမှု ရပ်တန့်ခဲ့ပါသည်။ ဖိုင်များကို အစားမထိုးခဲ့ပါ။ ဤမှတ်တမ်းများ မဖွင့်မီ Shop ကို ပိတ်ပြီး အကူအညီတောင်းပါ။',
            );
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _blocked = true;
          _checking = false;
        });
      }
    }
  }

  Future<void> _closeDatabase(ShopDatabase database) =>
      (widget.closeDatabase ?? (database) => database.close())(database);

  Future<void> _openShop() async {
    if (_opening || _openedDatabase != null) return;
    _opening = true;
    ShopDatabase? pendingDatabase;
    try {
      if (await _databaseFile.length() > 0) {
        final databasePath = _databaseFile.path;
        await Isolate.run(
          () => ShopBackup.verifySnapshot(
            File(databasePath),
            allowRuntimeUnboundCorrectionHistory: true,
          ),
        );
      }
      pendingDatabase = ShopDatabase.inPrivateDocuments(widget.documents);

      // Opening Drift is deliberately eager here. The verified database stays
      // local until migrations, structure, and semantic audit checks pass, so
      // no application widget can observe an unsafe existing or restored file.
      await pendingDatabase.verifyReadyForUse();
      if (!mounted) return;

      final openedShop = widget.buildShop(pendingDatabase, _myanmar);
      if (!mounted) return;

      final acceptedDatabase = pendingDatabase;
      setState(() {
        _openedDatabase = acceptedDatabase;
        _openedShop = openedShop;
        _checking = false;
        _busy = false;
        _message = null;
      });
      pendingDatabase = null;
    } catch (_) {
      if (mounted) {
        setState(() {
          _blocked = true;
          _checking = false;
          _busy = false;
          _message = shopCopy(
            _myanmar,
            'Shop found local data it cannot safely open. Your records were not changed. Close the app and contact support.',
            'Shop တွင် လုံခြုံစွာ မဖွင့်နိုင်သော စက်တွင်းဒေတာ တွေ့ရှိသည်။ မှတ်တမ်းများ မပြောင်းလဲပါ။ အက်ပ်ကို ပိတ်ပြီး အကူအညီတောင်းပါ။',
          );
        });
      }
    } finally {
      _opening = false;
      final rejectedDatabase = pendingDatabase;
      if (rejectedDatabase != null) {
        await _closeDatabase(rejectedDatabase);
      }
    }
  }

  Future<void> _startNew() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ShopBackup.reserveNewStore(_databaseFile);
      if (mounted) await _openShop();
    } catch (_) {
      if (mounted) {
        setState(() {
          _blocked = true;
          _busy = false;
        });
      }
    }
  }

  Future<XFile?> _pickNativeBackup() => openFile(
    acceptedTypeGroups: [
      XTypeGroup(
        label: shopCopy(_myanmar, 'SuperMega backup', 'SuperMega အရန်ကူး'),
        extensions: const ['smbak'],
        mimeTypes: const ['application/octet-stream'],
        uniformTypeIdentifiers: const ['public.data'],
      ),
    ],
  );

  Future<void> _chooseBackup() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    File? staged;
    try {
      final chosen = await (widget.pickBackup ?? _pickNativeBackup)();
      if (chosen == null) return;
      final cache = widget.importScratchRoot ?? await getTemporaryDirectory();
      staged = File(
        '${cache.path}${Platform.pathSeparator}'
        'supermega-shop-import-${const Uuid().v4()}.smbak',
      );
      await staged.create(exclusive: true);
      final writer = await staged.open(mode: FileMode.write);
      try {
        var total = 0;
        await for (final bytes in chosen.openRead()) {
          total += bytes.length;
          if (total > ShopBackup.maxSnapshotBytes + 128) {
            throw const FormatException('The backup is too large.');
          }
          await writer.writeFrom(bytes);
        }
        await writer.flush();
      } finally {
        await writer.close();
      }
      if (!mounted) return;
      final old = _selectedArchive;
      setState(() {
        _selectedArchive = staged;
        _selectedName = chosen.name;
        _password.clear();
      });
      staged = null;
      if (old != null && await old.exists()) await old.delete();
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = shopCopy(
            _myanmar,
            'Could not open that backup file. Choose it again.',
            'အရန်ကူးဖိုင်ကို ဖွင့်မရပါ။ ပြန်ရွေးပါ။',
          );
        });
      }
    } finally {
      try {
        if (staged != null && await staged.exists()) await staged.delete();
      } catch (_) {
        if (mounted) {
          setState(() {
            _blocked = true;
            _message = shopCopy(
              _myanmar,
              'Could not clear the temporary backup copy. Close and reopen Shop.',
              'ယာယီအရန်ကူးဖိုင်ကို ဖယ်ရှားမရပါ။ Shop ကို ပိတ်ပြီး ပြန်ဖွင့်ပါ။',
            );
          });
        }
      }
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelBackup() async {
    if (_busy) return;
    final archive = _selectedArchive;
    setState(() {
      _selectedArchive = null;
      _selectedName = null;
      _message = null;
      _password.clear();
    });
    try {
      if (archive != null && await archive.exists()) await archive.delete();
    } catch (_) {
      if (mounted) {
        setState(() {
          _selectedArchive = archive;
          _message = shopCopy(
            _myanmar,
            'Could not clear the temporary backup copy. Close and reopen Shop.',
            'ယာယီအရန်ကူးဖိုင်ကို ဖယ်ရှားမရပါ။ Shop ကို ပိတ်ပြီး ပြန်ဖွင့်ပါ။',
          );
          _blocked = true;
        });
      }
    }
  }

  Future<void> _restore() async {
    final archive = _selectedArchive;
    if (_busy || archive == null) return;
    if (_password.text.runes.length < 12) {
      setState(() {
        _message = shopCopy(
          _myanmar,
          'Enter the backup password (at least 12 characters).',
          'အရန်ကူးစကားဝှက်ကို ထည့်ပါ (အနည်းဆုံး ၁၂ လုံး)။',
        );
      });
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    var removeArchive = false;
    try {
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: _databaseFile,
        password: _password.text,
      );
      _password.clear();
      removeArchive = true;
      if (mounted) await _openShop();
    } catch (_) {
      _password.clear();
      final targetType = await FileSystemEntity.type(
        _databaseFile.path,
        followLinks: false,
      );
      final sidecar = await _hasSidecar();
      if (!mounted) return;
      removeArchive =
          targetType != FileSystemEntityType.notFound ||
          sidecar ||
          await _hasRestoreMarker();
      setState(() {
        _blocked = removeArchive;
        _message = _blocked
            ? shopCopy(
                _myanmar,
                'Shop data or a recovery marker appeared during restore. Close Shop and contact support; no existing records were replaced.',
                'ပြန်ယူနေစဉ် Shop ဒေတာ သို့မဟုတ် ပြန်လည်စစ်ဆေးရန် အမှတ်အသား ပေါ်လာပါသည်။ Shop ကို ပိတ်ပြီး အကူအညီတောင်းပါ။ ရှိပြီးသောမှတ်တမ်းများကို အစားမထိုးခဲ့ပါ။',
              )
            : shopCopy(
                _myanmar,
                'Could not restore this file. Check the file and password, then try again.',
                'ဤဖိုင်ကို ပြန်ယူမရပါ။ ဖိုင်နှင့် စကားဝှက်ကို စစ်ပြီး ပြန်ကြိုးစားပါ။',
              );
      });
    } finally {
      if (removeArchive) {
        try {
          if (await archive.exists()) await archive.delete();
        } catch (_) {
          // An encrypted temporary copy can be cleared by app cache cleanup.
        }
      }
      if (mounted) {
        setState(() {
          if (removeArchive) {
            _selectedArchive = null;
            _selectedName = null;
          }
          _busy = false;
        });
      }
    }
  }

  Future<void> _setLanguage(bool myanmar) async {
    setState(() => _myanmar = myanmar);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool('shop_locale_myanmar', myanmar);
  }

  @override
  void dispose() {
    _password.dispose();
    final database = _openedDatabase;
    _openedDatabase = null;
    if (database != null) unawaited(_closeDatabase(database));
    final archive = _selectedArchive;
    if (archive != null) {
      unawaited(() async {
        try {
          if (await archive.exists()) await archive.delete();
        } catch (_) {
          // The file is an encrypted temporary copy, not the SQLite snapshot.
        }
      }());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final openedShop = _openedShop;
    if (openedShop != null) return openedShop;
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
        fontFamily: _myanmar ? 'NotoSansMyanmarUI' : 'Inter',
        fontFamilyFallback: _myanmar
            ? const ['NotoSansMyanmar', 'Inter']
            : const ['NotoSansMyanmarUI', 'NotoSansMyanmar'],
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff2563eb),
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xfff5f7fb),
        textTheme: TextTheme(
          headlineMedium: TextStyle(
            fontSize: _myanmar ? 24 : 30,
            fontWeight: _myanmar ? FontWeight.w600 : FontWeight.w700,
            height: _myanmar ? 1.4 : 1.15,
            letterSpacing: _myanmar ? 0 : -0.4,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(11),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(11),
            ),
          ),
        ),
      ),
      home: Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ListView(
                shrinkWrap: true,
                children: [
                  const Icon(Icons.storefront_outlined, size: 40),
                  const SizedBox(height: 24),
                  Builder(
                    builder: (startupContext) => Text(
                      shopCopy(_myanmar, 'Start Shop', 'Shop စတင်ရန်'),
                      style: Theme.of(startupContext).textTheme.headlineMedium,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_checking) ...[
                    const Center(child: CircularProgressIndicator()),
                  ] else if (_blocked) ...[
                    Text(
                      _message ??
                          shopCopy(
                            _myanmar,
                            'Shop found local files it cannot safely open. Your records were not changed. Close the app and contact support.',
                            'Shop တွင် လုံခြုံစွာ မဖွင့်နိုင်သော စက်တွင်းဖိုင်များ တွေ့ရှိသည်။ မှတ်တမ်းများ မပြောင်းလဲပါ။ အက်ပ်ကို ပိတ်ပြီး အကူအညီတောင်းပါ။',
                          ),
                    ),
                  ] else if (_selectedArchive == null) ...[
                    FilledButton(
                      onPressed: _busy ? null : _startNew,
                      child: Text(
                        shopCopy(
                          _myanmar,
                          'Start new Shop',
                          'Shop အသစ် စတင်ရန်',
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _busy ? null : _chooseBackup,
                      child: Text(
                        shopCopy(
                          _myanmar,
                          'Restore backup',
                          'အရန်ကူးဖိုင် ပြန်ယူရန်',
                        ),
                      ),
                    ),
                  ] else ...[
                    Text(
                      _selectedName ?? '',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      enabled: !_busy,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: shopCopy(
                          _myanmar,
                          'Backup password',
                          'အရန်ကူးစကားဝှက်',
                        ),
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _restore,
                      child: Text(
                        shopCopy(
                          _myanmar,
                          'Restore and open Shop',
                          'ပြန်ယူပြီး Shop ဖွင့်ရန်',
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _busy ? null : _cancelBackup,
                      child: Text(shopCopy(_myanmar, 'Cancel', 'ပယ်ဖျက်ရန်')),
                    ),
                  ],
                  if (_busy) ...[
                    const SizedBox(height: 16),
                    const LinearProgressIndicator(),
                  ],
                  if (_message != null && !_blocked) ...[
                    const SizedBox(height: 16),
                    Semantics(liveRegion: true, child: Text(_message!)),
                  ],
                  const SizedBox(height: 24),
                  SegmentedButton<bool>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: false, label: Text('English')),
                      ButtonSegment(value: true, label: Text('မြန်မာ')),
                    ],
                    selected: {_myanmar},
                    onSelectionChanged: _busy
                        ? null
                        : (values) {
                            unawaited(_setLanguage(values.first));
                          },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
