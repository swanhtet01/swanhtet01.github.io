import 'dart:io';

import 'package:file_saver/file_saver.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'shop_backup.dart';
import 'shop_copy.dart';
import 'shop_database.dart';

typedef SaveEncryptedShopArchive =
    Future<String?> Function(File archive, String suggestedName);

enum ShopBackupExportResult { saved, cancelled }

/// Only the encrypted archive is handed to the system save dialog. The
/// plaintext SQLite snapshot is handled and removed by ShopBackup.
abstract final class ShopBackupExporter {
  static bool _active = false;

  static Future<ShopBackupExportResult> export({
    required ShopDatabase database,
    required String password,
    required SaveEncryptedShopArchive saveArchive,
    Directory? scratchRoot,
    Directory? encryptedRoot,
    DateTime? now,
  }) async {
    if (_active) throw StateError('A Shop backup export is already in progress.');
    _active = true;
    File? encryptedArchive;
    try {
      final privateRoot =
          scratchRoot ?? await getApplicationDocumentsDirectory();
      final cacheRoot = encryptedRoot ?? await getTemporaryDirectory();
      await cacheRoot.create(recursive: true);
      encryptedArchive = File(
        '${cacheRoot.path}${Platform.pathSeparator}'
        'supermega-shop-export-${const Uuid().v4()}.smbak',
      );
      await ShopBackup.exportEncrypted(
        database: database,
        archive: encryptedArchive,
        password: password,
        scratchRoot: privateRoot,
      );
      final savedLocation = await saveArchive(
        encryptedArchive,
        _suggestedName(now ?? DateTime.now()),
      );
      return savedLocation == null
          ? ShopBackupExportResult.cancelled
          : ShopBackupExportResult.saved;
    } finally {
      try {
        if (encryptedArchive != null && await encryptedArchive.exists()) {
          await encryptedArchive.delete();
        }
      } finally {
        _active = false;
      }
    }
  }

  static String _suggestedName(DateTime instant) {
    String two(int value) => value.toString().padLeft(2, '0');
    return 'SuperMega-Shop-${instant.year}${two(instant.month)}'
        '${two(instant.day)}-${two(instant.hour)}${two(instant.minute)}'
        '${two(instant.second)}';
  }
}

class ShopBackupExportScreen extends StatefulWidget {
  const ShopBackupExportScreen({
    required this.database,
    required this.myanmar,
    this.saveArchive,
    this.exportAction,
    this.scratchRoot,
    this.encryptedRoot,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;

  /// Injectable only so cancellation and errors can be tested without an OS
  /// document picker. Production uses the native Save As dialog.
  final SaveEncryptedShopArchive? saveArchive;
  final Future<ShopBackupExportResult> Function(String password)? exportAction;
  final Directory? scratchRoot;
  final Directory? encryptedRoot;

  @override
  State<ShopBackupExportScreen> createState() => _ShopBackupExportScreenState();
}

class _ShopBackupExportScreenState extends State<ShopBackupExportScreen> {
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _busy = false;
  String? _message;

  Future<String?> _saveAs(File archive, String suggestedName) {
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isWindows) {
      throw UnsupportedError('Shop backup export is unavailable here.');
    }
    return FileSaver.instance.saveAs(
      name: suggestedName,
      filePath: archive.path,
      fileExtension: 'smbak',
      mimeType: MimeType.custom,
      customMimeType: 'application/octet-stream',
    );
  }

  Future<void> _export() async {
    if (_busy) return;
    final password = _password.text;
    if (password.runes.length < 12) {
      setState(() {
        _message = shopCopy(
          widget.myanmar,
          'Use a password of at least 12 characters.',
          'စကားဝှက်ကို အနည်းဆုံး စာလုံး ၁၂ လုံး သုံးပါ။',
        );
      });
      return;
    }
    if (password != _confirmation.text) {
      setState(() {
        _message = shopCopy(
          widget.myanmar,
          'The passwords do not match.',
          'စကားဝှက်နှစ်ခု မတူပါ။',
        );
      });
      return;
    }

    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final result = await (widget.exportAction != null
          ? widget.exportAction!(password)
          : ShopBackupExporter.export(
              database: widget.database,
              password: password,
              saveArchive: widget.saveArchive ?? _saveAs,
              scratchRoot: widget.scratchRoot,
              encryptedRoot: widget.encryptedRoot,
            ));
      if (!mounted) return;
      _password.clear();
      _confirmation.clear();
      setState(() {
        _message = result == ShopBackupExportResult.saved
            ? shopCopy(
                widget.myanmar,
                'Backup file saved. Keep its password separately and store the file somewhere safe.',
                'အရန်ကူးဖိုင်ကို သိမ်းပြီးပါပြီ။ စကားဝှက်ကို သီးခြားသိမ်းပြီး ဖိုင်ကို လုံခြုံသောနေရာတွင် ထားပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Save cancelled. No new backup file was saved.',
                'သိမ်းဆည်းမှုကို ပယ်ဖျက်လိုက်သည်။ အရန်ကူးဖိုင်အသစ် မသိမ်းခဲ့ပါ။',
              );
      });
    } catch (_) {
      if (!mounted) return;
      _password.clear();
      _confirmation.clear();
      setState(() {
        _message = shopCopy(
          widget.myanmar,
          'Could not finish the export. Your Shop records were not changed. Check your files before trying again.',
          'အရန်ကူးဖိုင် ထုတ်ယူမှု မပြီးဆုံးပါ။ Shop မှတ်တမ်းများ မပြောင်းလဲပါ။ ထပ်မံမကြိုးစားမီ ဖိုင်များကို စစ်ဆေးပါ။',
        );
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(widget.myanmar, 'Export backup', 'အရန်ကူးဖိုင် ထုတ်ယူရန်')),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                shopCopy(
                  widget.myanmar,
                  'Save a private copy of your Shop data.',
                  'သင့် Shop ဒေတာကို ကိုယ်ပိုင်ဖိုင်အဖြစ် သိမ်းပါ။',
                ),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text(
                shopCopy(
                  widget.myanmar,
                  'Includes sales, photos and payment settings. Keep the file and password safe. Online backup and in-app restore are not available yet.',
                  'ရောင်းအား၊ ပစ္စည်းပုံနှင့် ငွေပေးချေမှုဆက်တင်များ ပါဝင်သည်။ ဖိုင်နှင့် စကားဝှက်ကို လုံခြုံစွာ သိမ်းပါ။ အွန်လိုင်းအရန်ကူးနှင့် အက်ပ်အတွင်း ပြန်လည်ရယူခြင်း မရနိုင်သေးပါ။',
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _password,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: shopCopy(widget.myanmar, 'Backup password', 'အရန်ကူးစကားဝှက်'),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmation,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: shopCopy(
                    widget.myanmar,
                    'Confirm password',
                    'စကားဝှက်ကို ထပ်မံရိုက်ထည့်ပါ',
                  ),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _busy ? null : _export,
                icon: const Icon(Icons.save_alt_outlined),
                label: Text(
                  _busy
                      ? shopCopy(widget.myanmar, 'Preparing backup…', 'အရန်ကူးဖိုင် ပြင်ဆင်နေသည်…')
                      : shopCopy(widget.myanmar, 'Choose where to save', 'သိမ်းမည့်နေရာ ရွေးပါ'),
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 16),
                Semantics(liveRegion: true, child: Text(_message!)),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}
